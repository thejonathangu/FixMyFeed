import time
import os
import json
import re
import requests
import threading
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI
from supabase import create_client

# Cache for deep analysis results - keyed by content hash
deep_analysis_cache = {}
cache_lock = threading.Lock()

load_dotenv()


def schedule_deep_analysis_backfill(row_id: str, content_hash: str) -> None:
    """When Agent 2 finishes after the row is inserted, patch deep_analysis (SKIP + log_watch)."""
    if not supabase or not row_id or not content_hash:
        return

    def run():
        for _ in range(40):  # up to 20s (aligns with slow Lava / analyzer calls)
            time.sleep(0.5)
            with cache_lock:
                if content_hash in deep_analysis_cache:
                    cached = deep_analysis_cache.pop(content_hash)
                    analysis = cached["analysis"]
                    try:
                        supabase.table("video_events").update({
                            "deep_analysis": analysis,
                            "category_vector": analysis.get("themes", [])[:3],
                        }).eq("id", row_id).execute()
                        print(f"[SUPABASE] Backfilled deep_analysis for row {row_id}")
                    except Exception as e:
                        print(f"[SUPABASE] Backfill update error: {e}")
                    return
        print(f"[SUPABASE] deep_analysis backfill timed out for row {row_id}")

    threading.Thread(target=run, daemon=True).start()

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# Supabase setup
supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_KEY", "")
supabase = None
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
    print("Supabase connected!")
else:
    print("Supabase not configured - skipping event logging")

# Lava API keys for multi-provider orchestration
GATEKEEPER_KEY = os.environ.get("LAVA_GATEKEEPER_KEY", "")
ANALYZER_KEY = os.environ.get("LAVA_ANALYZER_KEY", "")
INSIGHT_KEY = os.environ.get("LAVA_INSIGHT_KEY", "")

print(f"Agent 1 (Gatekeeper): llama-3.1-8b-instant via Groq - {'configured' if GATEKEEPER_KEY else 'missing'}")
print(f"Agent 2 (Deep Analyzer): gpt-4o-mini via OpenAI - {'configured' if ANALYZER_KEY else 'missing'}")
print(f"Agent 3 (Insight Generator): claude-opus-4-5 via Anthropic - {'configured' if INSIGHT_KEY else 'missing'}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvaluateRequest(BaseModel):
    text_content: str
    interests: List[str]
    toxic_keywords: List[str]
    user_id: str = "anonymous"


class LogWatchRequest(BaseModel):
    user_id: str = "anonymous"
    action_type: str
    duration_ms: int
    text_content: str
    category_vector: Optional[List[str]] = None
    deep_analysis: Optional[dict] = None


def parse_tiktok_text(text):
    lines = text.strip().split("\n")
    creator = lines[0].strip() if lines else ""
    hashtags = re.findall(r"#\w+", text)
    caption_lines = []
    for line in lines[1:]:
        line = line.strip()
        if line and not line.startswith("#") and not re.match(r"^\d+\.?\d*[KMB]?$", line) and line != "more" and "00:00" not in line:
            caption_lines.append(line)
    caption = " ".join(caption_lines)[:500]
    return creator, hashtags, caption


def call_lava_api(api_key: str, model: str, system_prompt: str, user_content: str, max_tokens: int = 300, temperature: float = 0.3):
    """Unified Lava API caller for all agents"""
    response = requests.post(
        "https://api.lava.so/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=30,
    )
    return response


# =============================================================================
# AGENT 1: GATEKEEPER (gpt-5-nano via OpenAI)
# Fast decision-making for content filtering
# =============================================================================
def agent_gatekeeper(text_content: str, interests: List[str], toxic_keywords: List[str]) -> dict:
    """Ultra-fast content gatekeeper using Groq's Llama 3.1 8B"""
    
    system_prompt = f"""You are a lightning-fast content gatekeeper. Make instant decisions.

USER INTERESTS: {", ".join(interests)}
AVOID: {", ".join(toxic_keywords)}

RULES:
- LIKE_AND_STAY: Reserve for content that is highly likely to align with USER INTERESTS (clear, direct, high-confidence match).
- WAIT: Use for loose/partial matches and for content that seems positive, educational, creative, or generally fine but not strongly aligned. Prefer WAIT over LIKE_AND_STAY unless alignment is obvious.
- SKIP: Use when content clearly matches AVOID keywords, is obvious spam/copypasta/brainrot/malicious, or is strongly misaligned with interests.

Respond with ONLY valid JSON:
{{"action": "SKIP"|"LIKE_AND_STAY"|"WAIT", "reason": "5 words max", "categories": ["cat1", "cat2"]}}"""

    try:
        response = call_lava_api(
            GATEKEEPER_KEY,
            "llama-3.1-8b-instant",
            system_prompt,
            f"Evaluate:\n{text_content[:1000]}",
            max_tokens=150,
            temperature=0.2
        )
        
        print(f"[GATEKEEPER] Status: {response.status_code}")
        if response.status_code != 200:
            print(f"[GATEKEEPER] Error response: {response.text[:500]}")
            raise Exception(f"API returned {response.status_code}")
        
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
        
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        
        result = json.loads(content)
        action = result.get("action", "WAIT")
        if action not in ("SKIP", "LIKE_AND_STAY", "WAIT"):
            action = "WAIT"
            
        return {
            "action": action,
            "reason": str(result.get("reason", ""))[:50],
            "categories": result.get("categories", [])[:3]
        }
        
    except Exception as e:
        print(f"[GATEKEEPER] Error: {e}")
        return {"action": "WAIT", "reason": "gatekeeper error", "categories": []}


# =============================================================================
# AGENT 2: DEEP ANALYZER (gpt-4o-mini via OpenAI)
# Rich semantic analysis for content the user engages with
# =============================================================================
def agent_deep_analyzer(text_content: str, interests: List[str]) -> dict:
    """Deep semantic analysis using GPT-4o-mini"""
    
    system_prompt = """You are a cognitive behavioral analyst specializing in digital content consumption patterns.

Analyze this social media content and extract rich metadata for understanding dopamine pathway rewiring.

Return ONLY valid JSON with this exact structure:
{
  "themes": ["theme1", "theme2", "theme3"],
  "sentiment_score": 0.0 to 1.0,
  "educational_value": 0.0 to 1.0,
  "entertainment_value": 0.0 to 1.0,
  "dopamine_trigger": "curiosity" | "mastery" | "social_validation" | "fear" | "outrage" | "humor" | "awe",
  "cognitive_load": "low" | "medium" | "high",
  "content_archetype": "tutorial" | "entertainment" | "news" | "opinion" | "lifestyle" | "creative" | "educational" | "motivational",
  "value_alignment_score": 0.0 to 1.0,
  "toxicity_markers": ["marker1"] or [],
  "growth_potential": "positive" | "neutral" | "negative",
  "brief_insight": "One sentence about why this content matters for the user's neural pathways"
}"""

    user_content = f"""USER'S STATED INTERESTS: {", ".join(interests)}

CONTENT TO ANALYZE:
{text_content[:2000]}

Provide deep semantic analysis."""

    try:
        response = call_lava_api(
            ANALYZER_KEY,
            "gpt-4o-mini",
            system_prompt,
            user_content,
            max_tokens=500,
            temperature=0.4
        )
        
        print(f"[DEEP ANALYZER] Status: {response.status_code}")
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
        
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        
        result = json.loads(content)
        print(f"[DEEP ANALYZER] Themes: {result.get('themes', [])} | Dopamine: {result.get('dopamine_trigger', 'unknown')}")
        return result
        
    except Exception as e:
        print(f"[DEEP ANALYZER] Error: {e}")
        return {
            "themes": ["uncategorized"],
            "sentiment_score": 0.5,
            "educational_value": 0.5,
            "entertainment_value": 0.5,
            "dopamine_trigger": "unknown",
            "cognitive_load": "medium",
            "content_archetype": "entertainment",
            "value_alignment_score": 0.5,
            "toxicity_markers": [],
            "growth_potential": "neutral",
            "brief_insight": "Analysis unavailable"
        }


# =============================================================================
# AGENT 3: INSIGHT GENERATOR (claude-sonnet-4-5 via Anthropic)
# Synthesizes user behavior patterns into actionable insights
# =============================================================================
def agent_insight_generator(user_data: list, user_interests: List[str]) -> dict:
    """Generate behavioral insights using Claude Sonnet 4.5"""
    
    system_prompt = """You are a digital wellness coach and behavioral neuroscientist. 

Analyze this user's content consumption data and generate insights about their dopamine pathway rewiring progress.

Focus on:
1. Patterns in what they're consuming vs avoiding
2. Progress toward healthier content habits
3. Specific recommendations for improvement
4. Celebrate wins and acknowledge challenges

Be warm, encouraging, but honest. Use neuroscience concepts accessibly.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview of their progress",
  "neural_rewiring_score": 0 to 100,
  "top_value_themes": ["theme1", "theme2", "theme3"],
  "top_avoided_themes": ["theme1", "theme2"],
  "dopamine_pattern": "healthy" | "improving" | "mixed" | "concerning",
  "streak_days": number,
  "insights": [
    {"type": "win", "message": "insight about positive pattern"},
    {"type": "challenge", "message": "area for improvement"},
    {"type": "recommendation", "message": "specific actionable advice"}
  ],
  "motivational_message": "Personalized encouragement"
}"""

    # Summarize user data for the prompt
    data_summary = json.dumps(user_data[:50], indent=2)[:3000]
    
    user_content = f"""USER'S STATED INTERESTS: {", ".join(user_interests)}

RECENT CONTENT CONSUMPTION DATA (last 50 interactions):
{data_summary}

Generate personalized insights about their neural rewiring journey."""

    try:
        response = call_lava_api(
            INSIGHT_KEY,
            "claude-opus-4-5",
            system_prompt,
            user_content,
            max_tokens=800,
            temperature=0.6
        )
        
        print(f"[INSIGHT GENERATOR] Status: {response.status_code}")
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
        
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        
        return json.loads(content)
        
    except Exception as e:
        print(f"[INSIGHT GENERATOR] Error: {e}")
        return {
            "summary": "Unable to generate insights at this time.",
            "neural_rewiring_score": 50,
            "top_value_themes": [],
            "top_avoided_themes": [],
            "dopamine_pattern": "mixed",
            "streak_days": 0,
            "insights": [],
            "motivational_message": "Keep going! Every scroll is a choice."
        }


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.post("/evaluate")
def evaluate(payload: EvaluateRequest):
    """Main evaluation endpoint - orchestrates Agent 1 and optionally Agent 2"""
    start = time.perf_counter()
    
    print("=" * 60)
    print(f"[ORCHESTRATOR] Processing content for user: {payload.user_id}")
    print(f"[ORCHESTRATOR] Interests: {payload.interests}")
    print(f"[ORCHESTRATOR] Toxic: {payload.toxic_keywords}")
    print(f"[ORCHESTRATOR] Content length: {len(payload.text_content)} chars")
    print("=" * 60)
    
    # AGENT 1: Fast gatekeeper decision
    gatekeeper_result = agent_gatekeeper(
        payload.text_content,
        payload.interests,
        payload.toxic_keywords
    )
    
    action = gatekeeper_result["action"]
    reason = gatekeeper_result["reason"]
    category_vector = gatekeeper_result["categories"]

    # AGENT 2: Deep analysis runs in BACKGROUND for ALL content
    # Results are cached and included when /log_watch is called
    content_hash = hashlib.md5(payload.text_content[:500].encode()).hexdigest()
    
    def background_deep_analysis(content_hash, text_content, interests, action_type):
        try:
            print(f"[DEEP ANALYZER] Background analysis started for {action_type}...")
            analysis = agent_deep_analyzer(text_content, interests)
            
            if analysis:
                with cache_lock:
                    deep_analysis_cache[content_hash] = {
                        "analysis": analysis,
                        "timestamp": time.time()
                    }
                print(f"[DEEP ANALYZER] Cached: {analysis.get('themes', [])[:3]} | {analysis.get('dopamine_trigger', 'unknown')}")
        except Exception as e:
            print(f"[DEEP ANALYZER] Background error: {e}")
    
    # Start background thread for ALL videos - doesn't block response
    thread = threading.Thread(
        target=background_deep_analysis, 
        args=(content_hash, payload.text_content, payload.interests, action),
        daemon=True
    )
    thread.start()
    print(f"[ORCHESTRATOR] Deep analysis queued in background for {action}")
    
    # Set delays based on action
    if action == "SKIP":
        delay_ms = 1100
    elif action == "LIKE_AND_STAY":
        delay_ms = 25000
    else:
        delay_ms = 2000
    
    compute_time_ms = (time.perf_counter() - start) * 1000
    
    # Log SKIP actions immediately, then update with deep analysis when ready
    if action == "SKIP" and supabase:
        try:
            creator, hashtags, caption = parse_tiktok_text(payload.text_content)
            result = supabase.table("video_events").insert({
                "user_id": payload.user_id,
                "action_type": action,
                "duration_ms": 0,
                "caption": caption,
                "hashtags": hashtags,
                "creator": creator,
                "category_vector": category_vector,
            }).execute()
            
            # Get the inserted row ID and update it when deep analysis is ready
            if result.data and len(result.data) > 0:
                row_id = result.data[0].get("id")
                if row_id:
                    schedule_deep_analysis_backfill(row_id, content_hash)
            
            print(f"[SUPABASE] Logged SKIP event")
        except Exception as e:
            print(f"[SUPABASE] Error: {e}")
    
    print(f"[ORCHESTRATOR] Decision: {action} | Time: {compute_time_ms:.0f}ms")
    
    return {
        "action": action,
        "reason": reason,
        "delay_ms": delay_ms,
        "compute_time_ms": compute_time_ms,
        "category_vector": category_vector,
    }


@app.post("/log_watch")
def log_watch(payload: LogWatchRequest):
    """Log watched content with deep analysis from cache"""
    if supabase:
        try:
            creator, hashtags, caption = parse_tiktok_text(payload.text_content)
            
            # Same hash as /evaluate — Agent 2 runs async; wait as long as SKIP backfill (10s)
            content_hash = hashlib.md5(payload.text_content[:500].encode()).hexdigest()
            cached_analysis = None

            for attempt in range(20):
                with cache_lock:
                    if content_hash in deep_analysis_cache:
                        cached_analysis = deep_analysis_cache.pop(content_hash)
                        break
                if attempt < 19:
                    time.sleep(0.5)

            insert_data = {
                "user_id": payload.user_id,
                "action_type": payload.action_type,
                "duration_ms": payload.duration_ms,
                "caption": caption,
                "hashtags": hashtags,
                "creator": creator,
            }

            if cached_analysis:
                analysis = cached_analysis["analysis"]
                insert_data["deep_analysis"] = analysis
                insert_data["category_vector"] = analysis.get("themes", [])[:3]
                print(f"[SUPABASE] Including cached deep analysis: {analysis.get('themes', [])[:3]}")
            elif payload.deep_analysis:
                insert_data["deep_analysis"] = payload.deep_analysis
                if payload.category_vector:
                    insert_data["category_vector"] = payload.category_vector
                print(f"[SUPABASE] Using client-provided deep_analysis")
            else:
                print(f"[SUPABASE] No deep analysis in cache yet — inserting row and backfilling")
                if payload.category_vector:
                    insert_data["category_vector"] = payload.category_vector

            result = supabase.table("video_events").insert(insert_data).execute()
            if result.data and len(result.data) > 0:
                row_id = result.data[0].get("id")
                if row_id and insert_data.get("deep_analysis") is None:
                    schedule_deep_analysis_backfill(row_id, content_hash)

            print(f"[SUPABASE] Logged {payload.action_type} | {creator} | {payload.duration_ms}ms")
            return {"success": True}
        except Exception as e:
            print(f"[SUPABASE] Error: {e}")
            return {"success": False, "error": str(e)}
    return {"success": False, "error": "Supabase not configured"}


@app.get("/insights/{user_id}")
def get_insights(user_id: str, interests: str = ""):
    """
    AGENT 3: Generate behavioral insights for dashboard
    Called by the frontend to get personalized AI-generated insights
    """
    print(f"[INSIGHT GENERATOR] Generating insights for user: {user_id}")
    
    if not supabase:
        return {"error": "Supabase not configured"}
    
    try:
        # Fetch user's recent events
        response = supabase.table("video_events")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(100)\
            .execute()
        
        user_data = response.data if response.data else []
        
        if not user_data:
            return {
                "summary": "No data yet! Start scrolling with the extension to see your neural rewiring progress.",
                "neural_rewiring_score": 0,
                "top_value_themes": [],
                "top_avoided_themes": [],
                "dopamine_pattern": "unknown",
                "streak_days": 0,
                "insights": [],
                "motivational_message": "Your journey to intentional scrolling starts now!"
            }
        
        # Parse interests from query param
        user_interests = [i.strip() for i in interests.split(",") if i.strip()] if interests else ["general wellness"]
        
        # Generate insights with Agent 3
        insights = agent_insight_generator(user_data, user_interests)
        
        return insights
        
    except Exception as e:
        print(f"[INSIGHT GENERATOR] Error: {e}")
        return {"error": str(e)}


@app.get("/stats/{user_id}")
def get_stats(user_id: str):
    """Get raw stats for dashboard charts"""
    if not supabase:
        return {"error": "Supabase not configured"}
    
    try:
        response = supabase.table("video_events")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(500)\
            .execute()
        
        events = response.data if response.data else []
        
        # Aggregate stats
        total = len(events)
        skipped = sum(1 for e in events if e.get("action_type") == "SKIP")
        liked = sum(1 for e in events if e.get("action_type") == "LIKE_AND_STAY")
        waited = sum(1 for e in events if e.get("action_type") == "WAIT")
        
        total_watch_time = sum(e.get("duration_ms", 0) for e in events)
        positive_watch_time = sum(
            e.get("duration_ms", 0) for e in events 
            if e.get("action_type") == "LIKE_AND_STAY"
        )
        
        # Extract category frequencies
        category_counts = {}
        for e in events:
            for cat in (e.get("category_vector") or []):
                category_counts[cat] = category_counts.get(cat, 0) + 1
        
        return {
            "total_events": total,
            "skipped": skipped,
            "liked": liked,
            "waited": waited,
            "skip_rate": round(skipped / total * 100, 1) if total > 0 else 0,
            "engagement_rate": round(liked / total * 100, 1) if total > 0 else 0,
            "total_watch_time_min": round(total_watch_time / 60000, 1),
            "positive_watch_time_min": round(positive_watch_time / 60000, 1),
            "quality_ratio": round(positive_watch_time / total_watch_time * 100, 1) if total_watch_time > 0 else 0,
            "top_categories": sorted(category_counts.items(), key=lambda x: -x[1])[:10],
            "events": events[:50],  # Return recent events for charts
        }
        
    except Exception as e:
        print(f"[STATS] Error: {e}")
        return {"error": str(e)}


@app.get("/health")
def health():
    """Health check showing agent status"""
    return {
        "status": "ok",
        "agents": {
            "gatekeeper": {
                "model": "llama-3.1-8b-instant",
                "provider": "Groq",
                "status": "ready" if GATEKEEPER_KEY else "missing key"
            },
            "deep_analyzer": {
                "model": "gpt-4o-mini", 
                "provider": "OpenAI",
                "status": "ready" if ANALYZER_KEY else "missing key"
            },
            "insight_generator": {
                "model": "claude-opus-4-5",
                "provider": "Anthropic", 
                "status": "ready" if INSIGHT_KEY else "missing key"
            }
        },
        "supabase": "connected" if supabase else "not configured"
    }


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("🧠 NEURO-SHIELD: 3-Agent Content Filter")
    print("=" * 60)
    print("Agent 1 (Gatekeeper):        llama-3.1-8b-instant via Groq")
    print("Agent 2 (Deep Analyzer):     gpt-4o-mini via OpenAI")
    print("Agent 3 (Insight Generator): claude-opus-4-5 via Anthropic")
    print("=" * 60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
