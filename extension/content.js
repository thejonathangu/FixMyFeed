function scrollToNext(container) {
  var all = document.querySelectorAll('[data-e2e="recommend-list-item-container"]');
  for (var i = 0; i < all.length; i++) {
    if (all[i] === container && i + 1 < all.length) {
      all[i + 1].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
  container.parentElement.scrollBy({ top: container.offsetHeight, behavior: "smooth" });
}

function cleanText(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function firstText(container, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var node = container.querySelector(selectors[i]);
    if (!node) continue;
    var text = cleanText(node.textContent || node.innerText || "");
    if (text) return text;
  }
  return "";
}

function parseCreatorFromLink(container) {
  var link = container.querySelector('a[href^="/@"]');
  if (!link) return "";
  var href = link.getAttribute("href") || "";
  var match = href.match(/\/(@[^/?#]+)/);
  return match ? match[1] : "";
}

function extractHashtags(caption) {
  var found = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  var unique = [];
  var seen = {};
  for (var i = 0; i < found.length; i++) {
    if (seen[found[i]]) continue;
    seen[found[i]] = true;
    unique.push(found[i]);
  }
  return unique;
}

function scrapeVideoData(container) {
  var creator = firstText(container, [
    '[data-e2e="video-author-uniqueid"]',
    '[data-e2e="video-author-nickname"]',
    'a[href^="/@"]'
  ]);
  var caption = firstText(container, [
    '[data-e2e="video-desc"]',
    'h1[data-e2e="browse-video-desc"]'
  ]);

  if (!creator) creator = parseCreatorFromLink(container);
  if (creator && creator.charAt(0) !== "@") creator = "@" + creator.replace(/^@+/, "");

  return {
    creator: creator || "unknown",
    caption: caption || "",
    hashtags: extractHashtags(caption || "")
  };
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;

    const container = entry.target;

    if (container.getAttribute("data-scanned") === "true") return;
    container.setAttribute("data-scanned", "true");

    const textContent = container.innerText || "";
    const videoData = scrapeVideoData(container);

    chrome.runtime.sendMessage({
      action: "log_video",
      data: {
        action_type: "watched",
        caption: videoData.caption,
        hashtags: videoData.hashtags,
        creator: videoData.creator
      }
    });

    chrome.runtime.sendMessage(
      { type: "evaluate", text: textContent },
      (response) => {
        if (!response || !response.success) return;

        const action = response.data.action;
        const score = response.data.score;
        const delayMs = response.data.delay_ms;

        const dashboard = document.createElement("div");
        dashboard.style.position = "fixed";
        dashboard.style.top = "10px";
        dashboard.style.left = "10px";
        dashboard.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
        dashboard.style.color = "#39ff14";
        dashboard.style.fontFamily = "monospace";
        dashboard.style.fontSize = "14px";
        dashboard.style.padding = "12px 18px";
        dashboard.style.zIndex = "2147483647";
        dashboard.style.borderRadius = "6px";
        dashboard.style.border = "1px solid #39ff14";
        dashboard.style.pointerEvents = "none";
        dashboard.textContent = "ACTION: " + action + " | SCORE: " + score;
        document.body.appendChild(dashboard);

        setTimeout(() => {
          if (action === "SKIP") {
            scrollToNext(container);
            dashboard.remove();
          } else if (action === "LIKE_AND_STAY") {
            const likeIcon = container.querySelector('[data-e2e="like-icon"]');
            if (likeIcon) {
              likeIcon.click();
            }
            setTimeout(() => {
              scrollToNext(container);
              dashboard.remove();
            }, delayMs);
          }
        }, delayMs);
      }
    );
  });
}, { threshold: 0.6 });

setInterval(() => {
  const containers = document.querySelectorAll(
    '[data-e2e="recommend-list-item-container"]:not([data-observed])'
  );
  containers.forEach((el) => {
    el.setAttribute("data-observed", "true");
    observer.observe(el);
  });
}, 2000);
