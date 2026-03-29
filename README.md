# FixMyFeed

FixMyFeed is a behavior-aware social media filter built around one simple idea:

Jayden had much lower social-media screen time than the rest of the team, and he credited one habit above all else: **keeping his phone in grayscale**.  
FixMyFeed takes that insight and turns it into a full attention-shaping system:

- AI triages reels in real time (`SKIP`, `WAIT`, `LIKE_AND_STAY`)
- the feed can be auto-scrolled/locked based on that decision
- color is treated as a limited credit budget (grayscale as friction)
- behavior data is logged and analyzed into dashboards and coaching insights

---

## What This Project Includes

- **Chrome extension** (`extension/`)
  - Popup settings UI (interests, blocked keywords, autolike, user id)
  - Content script that evaluates reels, blocks/skips content, and manages overlay UX
  - Background service worker that handles API calls, user identity, credit state, and parental sync

- **Backend API** (`main.py`)
  - FastAPI orchestration service
  - Multi-agent decision + analysis pipeline through Lava-hosted model endpoints
  - Supabase persistence and analytics endpoints

- **Dashboard web app** (`dashboard/`)
  - Neural map / analytics / AI insights / parental controls
  - Visual feedback for rewiring progress and content consumption patterns

---

## High-Level Flow

1. Extension content script captures visible reel text.
2. Background worker sends `/evaluate` request with user interests + avoid keywords.
3. Backend gatekeeper returns one of:
   - `SKIP`
   - `WAIT`
   - `LIKE_AND_STAY`
4. Content script applies behavior:
   - `SKIP` -> keep blocker, auto-scroll
   - `WAIT` -> currently behaves like stay (no auto-like)
   - `LIKE_AND_STAY` -> stay and optionally like
5. Watch events are logged via `/log_watch`.
6. Dashboard pulls `/stats` and `/insights` for user-level reporting.

---

## Feature Inventory (Comprehensive)

## Chrome Extension

- **Platform coverage**
  - TikTok reels feed
  - Instagram reels mode

- **Instagram URL gating**
  - Evaluation/blocker logic activates only on Instagram reels paths, not generic endpoints.

- **Real-time decision execution**
  - Reel-by-reel evaluation and actioning through `IntersectionObserver`.

- **Full-screen blocking overlay**
  - Black blocker while evaluating uncertain/skip flows.
  - Loader centered on the full viewport.

- **Motivational quote panel**
  - Random quote sourced from `extension/assets/quotes.csv`.
  - Displayed in right-third overlay panel.
  - Rotates every 5 seconds while blocker remains active.

- **Skip reliability hardening**
  - Multi-attempt "next" logic with pacing between automated scrolls.
  - Retry behavior to reduce "stuck blocker" edge cases.

- **Runtime messaging resilience**
  - Retry wrapper around extension messaging for MV3 wake-up races.
  - Special handling for "extension context invalidated" scenarios.
  - Graceful fallback path when messaging fails during evaluate flow.

- **Watch tracking + event logging**
  - Sends `log_watch` with:
    - `action_type`
    - watch duration
    - text payload
    - optional categories/deep analysis

- **Action semantics**
  - `WAIT` currently mirrors stay behavior (watch flow), but without auto-like click.

- **Color credit system**
  - Credits computed against recent watch events in Supabase.
  - Page-level grayscale intensity scales with remaining credits.
  - Credits consume for watched/stay-like actions (including `WAIT` and `LIKE_AND_STAY` in current logic).
  - Popup hint when credits are exhausted.

- **Popup settings**
  - Manage interests and blocked keywords.
  - Toggle autolike.
  - See current user id.
  - Edit user id from popup (validated + persisted).

- **Parental lock integration**
  - Popup enters read-only mode when lock state is active.
  - Lock state synced from Supabase on install/startup/alarm.

---

## Backend API (`main.py`)

- **FastAPI service**
  - Endpoints:
    - `POST /evaluate`
    - `POST /log_watch`
    - `GET /insights/{user_id}`
    - `GET /stats/{user_id}`
    - `GET /health`

- **Three-agent orchestration**
  - Agent 1: Gatekeeper (fast action decision)
  - Agent 2: Deep analyzer (background semantic enrichment)
  - Agent 3: Insight generator (dashboard-level coaching synthesis)

- **Gatekeeper policy prompting**
  - Action-only output (`score` removed in current implementation).
  - Action rules tuned by interests and avoid keywords.

- **Async deep-analysis cache + backfill**
  - Deep analysis computed in background thread.
  - Event rows can be inserted immediately and patched later when analysis is ready.

- **Supabase event pipeline**
  - `video_events` storage
  - category/deep-analysis enrichment
  - per-user stats aggregation

- **Health/status introspection**
  - Agent/provider readiness and Supabase availability reporting.

---

## Dashboard App

- **Main tabs**
  - Neural Map
  - Analytics
  - AI Insights
  - Controls (Parental)

- **User-scoped data view**
  - Dashboard can load and persist user id for personalized analytics.

- **Analytics + progress visuals**
  - Skip/like/wait distribution
  - watchtime/quality metrics
  - rewiring progress indicators

- **AI insights page**
  - Narrative summary + recommendations generated from behavior data.

- **Parental control management**
  - Supabase-backed interests/blocked keyword editing
  - PIN lock/unlock flow
  - lock-state governed mutability
  - UI recently normalized to standard palette/text style

---

## Configuration

Create a `.env` in project root (example keys):

```env
LAVA_GATEKEEPER_KEY=...
LAVA_ANALYZER_KEY=...
LAVA_INSIGHT_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
USER_ID=...
```

Notes:
- `USER_ID` is not required for core backend operation (extension manages its own persisted `user_id`).
- Keep secrets out of committed files; rotate exposed keys.

---

## Local Development

## 1) Backend

From project root:

```bash
python main.py
```

API runs on `http://127.0.0.1:8000`.

## 2) Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Dashboard runs on `http://localhost:5173`.

## 3) Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` directory
5. Reload the extension after code changes

---

## Current Product Direction

FixMyFeed is designed to be strict where it matters (clear brainrot/toxic/avoid hits), flexible where it should be (uncertain-but-fine content), and reflective over time (insight dashboards + rewiring metrics).  
Some flows are intentionally still evolving and may be refined as UX and model policy tuning continue.

