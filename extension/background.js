const API = "http://127.0.0.1:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
