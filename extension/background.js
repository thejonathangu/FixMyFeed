const API = "http://127.0.0.1:8000";
const SUPABASE_URL = "https://musjoqntygjpxxlmibqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11c2pvcW50eWdqcHh4bG1pYnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjUyMDMsImV4cCI6MjA5MDMwMTIwM30.lLH7EUCoNivsDeDXBYfzWkLWOBlw3ivj8Plrad__GTM";
const USER_ID_KEY = "user_id";

function generateUserId() {
  return "user_" + Math.random().toString(36).slice(2, 12);
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
// Pulls parental_settings from Supabase and merges into chrome.storage.local
// so the evaluate flow automatically uses parent-controlled keywords.

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

    // Always sync keywords from Supabase if a row exists.
    // parental_locked flag controls whether the popup can override them.
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
  if (message.action === "log_video") {
    saveVideoEvent(message.data || {})
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "syncSettings") {
    syncParentalSettings()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === "evaluate") {
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
          sendResponse({ success: true, data: result });
        })
        .catch((err) => {
          console.error("[FixMyFeed] Evaluate API error:", err.message);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true;
  }

  if (message.type === "log_watch") {
    chrome.storage.local.get(["user_id"], (data) => {
      var userId = data.user_id || "anonymous";
      fetch(API + "/log_watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action_type: message.action_type,
          duration_ms: message.duration_ms,
          text_content: message.text_content,
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
});
