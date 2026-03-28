const API = "http://127.0.0.1:8000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "evaluate") {
    chrome.storage.local.get(["interests", "toxic"], (data) => {
      var interests = data.interests || ["software engineering", "cooking", "tennis"];
      var toxic = data.toxic || ["prank", "gossip", "rage", "brainrot"];

      fetch(API + "/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_content: message.text,
          interests: interests,
          toxic_keywords: toxic,
        }),
      })
        .then((res) => res.json())
        .then((result) => sendResponse({ success: true, data: result }))
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
