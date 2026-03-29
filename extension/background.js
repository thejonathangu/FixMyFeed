const API = "http://127.0.0.1:8000";
const SUPABASE_URL = "https://musjoqntygjpxxlmibqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11c2pvcW50eWdqcHh4bG1pYnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjUyMDMsImV4cCI6MjA5MDMwMTIwM30.lLH7EUCoNivsDeDXBYfzWkLWOBlw3ivj8Plrad__GTM";
const USER_ID_KEY = "user_id";
const COLOR_CREDIT_LIMIT_PER_HOUR = 30;

function generateUserId() {
  return "user_" + Math.random().toString(36).slice(2, 12);
}

function normalizeUserId(raw) {
  const v = String(raw == null ? "" : raw).trim();
  if (!v) return "";
  if (v.length < 3 || v.length > 64) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return "";
  return v;
}

function getOrCreateUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get([USER_ID_KEY], (result) => {
      if (result && result[USER_ID_KEY]) {
        resolve(result[USER_ID_KEY]);
        return;
      }

      const userId = generateUserId();
      chrome.storage.local.set({ [USER_ID_KEY]: userId }, () => resolve(userId));
    });
  });
}

async function saveVideoEvent(videoData) {
  const userId = await getOrCreateUserId();
  const payload = {
    ...videoData,
    user_id: userId
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/video_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[FixMyFeed] Supabase save failed", response.status, errorText, payload);
    throw new Error(`Supabase save failed (${response.status}): ${errorText}`);
  }
}

// ── Parental settings sync ────────────────────────────────────────────────────

async function syncParentalSettings() {
  try {
    const userId = await getOrCreateUserId();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/parental_settings?user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (!rows || rows.length === 0) return;
    const row = rows[0];

    await chrome.storage.local.set({
      interests: row.interests || [],
      toxic: row.toxic_keywords || [],
      parental_locked: row.locked === true,
    });
    console.log(`[FixMyFeed] Parental settings synced (locked=${row.locked}):`, row.interests);
  } catch (e) {
    console.warn("[FixMyFeed] Parental sync failed:", e);
  }
}

// ── Color credit system ───────────────────────────────────────────────────────

function parseSupabaseCount(response) {
  const rangeHeader = response.headers.get("content-range") || "";
  const parts = rangeHeader.split("/");
  if (parts.length < 2) return 0;
  const total = parseInt(parts[1], 10);
  return Number.isFinite(total) ? total : 0;
}

async function getWatchedCountLastHour(userId) {
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("user_id", `eq.${userId}`);
  // log_watch sends gatekeeper actions; consume credits for both stay-like actions.
  params.set("action_type", "in.(watched,LIKE_AND_STAY,WAIT)");
  params.set("created_at", `gte.${oneHourAgoIso}`);
  params.set("limit", "1");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/video_events?${params.toString()}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "count=exact"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase credit count failed (${response.status}): ${errorText}`);
  }

  return parseSupabaseCount(response);
}

async function getColorCreditStatus() {
  const userId = await getOrCreateUserId();
  const watchedLastHour = await getWatchedCountLastHour(userId);
  const remaining = Math.max(0, COLOR_CREDIT_LIMIT_PER_HOUR - watchedLastHour);
  return {
    user_id: userId,
    watched_last_hour: watchedLastHour,
    max_credits: COLOR_CREDIT_LIMIT_PER_HOUR,
    remaining_credits: remaining
  };
}

async function consumeColorCredit(videoData) {
  // Don't save to Supabase here - log_watch handles that with correct action_type
  return getColorCreditStatus();
}

chrome.runtime.onInstalled.addListener(() => {
  getOrCreateUserId().then(syncParentalSettings);
  // Create a persistent alarm — survives service worker sleep
  chrome.alarms.create("syncParental", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  getOrCreateUserId().then(syncParentalSettings);
  chrome.alarms.create("syncParental", { periodInMinutes: 1 });
});

// This fires reliably even when the service worker is asleep
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncParental") {
    syncParentalSettings();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "get_color_credit_status") {
    getColorCreditStatus()
      .then((status) => sendResponse({ success: true, data: status }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "consume_color_credit") {
    consumeColorCredit(message.data || {})
      .then((status) => sendResponse({ success: true, data: status }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // log_video handler removed - using /log_watch endpoint instead

  if (message.type === "syncSettings") {
    syncParentalSettings()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === "evaluate") {
    getOrCreateUserId().then((userId) => {
      chrome.storage.local.get(["interests", "toxic", "autolike"], (data) => {
        var interests = data.interests || ["software engineering", "cooking", "tennis"];
        var toxic = data.toxic || ["prank", "gossip", "rage", "brainrot"];
        var autolike = data.autolike !== false;

        fetch(API + "/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text_content: message.text,
            interests: interests,
            toxic_keywords: toxic,
            user_id: userId,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errorText = await res.text();
              throw new Error(`Evaluate API failed (${res.status}): ${errorText}`);
            }
            return res.json();
          })
          .then((result) => {
            result.autolike = autolike;
            result.user_id = userId;
            sendResponse({ success: true, data: result });
          })
          .catch((err) => {
            console.error("[FixMyFeed] Evaluate API error:", err.message);
            sendResponse({ success: false, error: err.message });
          });
      });
    });
    return true;
  }

  if (message.type === "log_watch") {
    getOrCreateUserId().then((userId) => {
      fetch(API + "/log_watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action_type: message.action_type,
          duration_ms: message.duration_ms,
          text_content: message.text_content,
          category_vector: message.category_vector || null,
          deep_analysis: message.deep_analysis || null,
        }),
      })
        .then((res) => res.json())
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message.type === "getSettings") {
    chrome.storage.local.get(["interests", "toxic"], (data) => {
      sendResponse({
        interests: data.interests || ["software engineering", "cooking", "tennis"],
        toxic: data.toxic || ["prank", "gossip", "rage", "brainrot"],
      });
    });
    return true;
  }

  if (message.type === "saveSettings") {
    chrome.storage.local.set({
      interests: message.interests,
      toxic: message.toxic,
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "setUserId") {
    const next = normalizeUserId(message.user_id);
    if (!next) {
      sendResponse({
        success: false,
        error: "User ID must be 3-64 chars (letters, numbers, _ or -)."
      });
      return false;
    }
    chrome.storage.local.set({ [USER_ID_KEY]: next }, () => {
      syncParentalSettings()
        .then(() => sendResponse({ success: true, data: { user_id: next } }))
        .catch(() => sendResponse({ success: true, data: { user_id: next } }));
    });
    return true;
  }
});
