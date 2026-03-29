import time
import os
import json
import re
import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from supabase import create_client

load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_KEY", "")
supabase = None
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
    print("Supabase connected!")
else:
    print("Supabase not configured - skipping event logging")

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


@app.post("/evaluate")
def evaluate(payload: EvaluateRequest):
    start = time.perf_counter()

    api_key = os.environ.get("LAVA_API_KEY", "")

    system_prompt = """You are a lenient content filter. Evaluate if video text matches user interests.

USER INTERESTS: """ + ", ".join(payload.interests) + """
AVOID: """ + ", ".join(payload.toxic_keywords) + """

RULES:
- Be GENEROUS with matches. If content is EVEN LOOSELY related to an interest, choose LIKE_AND_STAY.
- Only SKIP if content clearly matches AVOID topics or is completely irrelevant junk.
- Use WAIT for anything neutral or unclear.
- Entertainment, humor, creative content related to interests = LIKE_AND_STAY
- Score 5+ means interesting. Score -5 or below means toxic.
- category_vector: 1-3 short category labels (e.g. ["tech", "humor"] or ["cooking", "tutorial", "vegan"]).
- BRAINROT DETECTION: Content featuring pseudoscience conspiracies (piezoelectric floors, free energy, etc.), rage bait, meaningless viral trends, or low-effort engagement farming should be categorized with "brainrot" in category_vector and marked as SKIP if "brainrot" is in AVOID list.

Respond with ONLY valid JSON:
{"action": "SKIP" or "LIKE_AND_STAY" or "WAIT", "score": -20 to 20, "reason": "brief explanation", "category_vector": ["cat1", "cat2"]}"""

    print("=" * 60)
    print(f"INTERESTS: {payload.interests}")
    print(f"TOXIC: {payload.toxic_keywords}")
    print(f"TEXT CONTENT ({len(payload.text_content)} chars):")
    print(payload.text_content[:1500])
    print("=" * 60)

    try:
        if not api_key:
            raise Exception("no API key")

        response = requests.post(
            "https://api.lava.so/v1/chat/completions",
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Evaluate:\n\n" + payload.text_content[:1500]},
                ],
                "temperature": 0.3,
                "max_tokens": 100,
            },
            timeout=10,
        )

        print(f"API status: {response.status_code}")
        print(f"API raw: {response.text[:500]}")
        data = response.json()

        content = data["choices"][0]["message"]["content"].strip()

        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(content)

        action = result.get("action", "WAIT")
        if action not in ("SKIP", "LIKE_AND_STAY", "WAIT"):
            action = "WAIT"

        score = int(result.get("score", 0))
        score = max(-20, min(20, score))

        reason = str(result.get("reason", ""))[:100]

        raw_vector = result.get("category_vector", [])
        if not isinstance(raw_vector, list):
            raw_vector = []
        category_vector = [str(c)[:30] for c in raw_vector[:3]]

        print(f"DECISION: {action} | score={score} | {reason} | categories={category_vector}")

    except Exception as e:
        import traceback
        print(f"API ERROR: {e}")
        print(traceback.format_exc())
        action = "WAIT"
        score = 0
        reason = "API Error - watching anyway"
        category_vector = []

    if action == "SKIP":
        delay_ms = 1500
    elif action == "LIKE_AND_STAY":
        delay_ms = 25000
    else:
        delay_ms = 2000

    compute_time_ms = (time.perf_counter() - start) * 1000

    if action == "SKIP":
        if supabase:
            try:
                creator, hashtags, caption = parse_tiktok_text(payload.text_content)
                supabase.table("video_events").insert({
                    "user_id": payload.user_id,
                    "action_type": action,
                    "duration_ms": 0,
                    "caption": caption,
                    "hashtags": hashtags,
                    "creator": creator,
                }).execute()
                print(f"Logged to Supabase: {action} | {creator} | 0ms")
            except Exception as e:
                print(f"Supabase error: {e}")

    return {
        "action": action,
        "score": score,
        "reason": reason,
        "delay_ms": delay_ms,
        "compute_time_ms": compute_time_ms,
        "category_vector": category_vector,
    }


class LogWatchRequest(BaseModel):
    user_id: str = "anonymous"
    action_type: str
    duration_ms: int
    text_content: str


@app.post("/log_watch")
def log_watch(payload: LogWatchRequest):
    if supabase:
        try:
            creator, hashtags, caption = parse_tiktok_text(payload.text_content)
            supabase.table("video_events").insert({
                "user_id": payload.user_id,
                "action_type": payload.action_type,
                "duration_ms": payload.duration_ms,
                "caption": caption,
                "hashtags": hashtags,
                "creator": creator,
            }).execute()
            print(f"Logged to Supabase: {payload.action_type} | {creator} | {payload.duration_ms}ms")
            return {"success": True}
        except Exception as e:
            print(f"Supabase error: {e}")
            return {"success": False, "error": str(e)}
    return {"success": False, "error": "Supabase not configured"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
