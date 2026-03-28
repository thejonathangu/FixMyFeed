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
    throw new Error(`Supabase save failed (${response.status}): ${errorText}`);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  getOrCreateUserId();
});

chrome.runtime.onStartup.addListener(() => {
  getOrCreateUserId();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "log_video") {
    saveVideoEvent(message.data || {})
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "evaluate") {
    fetch(API + "/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_content: message.text })
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data: data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "api") {
    const opts = { headers: { "Content-Type": "application/json" } };
    if (message.method === "POST") {
      opts.method = "POST";
      opts.body = JSON.stringify(message.body);
    }
    fetch(API + message.endpoint, opts)
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data: data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
