var scrollLocked = false;
var lockTimeout = null;
var scrollBlocker = null;
var lockStyleEl = null;

function lockScroll(seconds, dashboard) {
  scrollLocked = true;
  var remaining = seconds;
  
  lockStyleEl = document.createElement("style");
  lockStyleEl.textContent = "html,body{overflow:hidden!important;touch-action:none!important;overscroll-behavior:none!important;}";
  document.head.appendChild(lockStyleEl);
  
  scrollBlocker = document.createElement("div");
  scrollBlocker.id = "shadow-scroll-blocker";
  scrollBlocker.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483640;background:transparent;touch-action:none;";
  document.body.appendChild(scrollBlocker);
  
  scrollBlocker.addEventListener("wheel", function(e){e.preventDefault();e.stopPropagation();}, {passive:false,capture:true});
  scrollBlocker.addEventListener("touchstart", function(e){e.preventDefault();e.stopPropagation();}, {passive:false,capture:true});
  scrollBlocker.addEventListener("touchmove", function(e){e.preventDefault();e.stopPropagation();}, {passive:false,capture:true});
  scrollBlocker.addEventListener("scroll", function(e){e.preventDefault();e.stopPropagation();}, {passive:false,capture:true});
  
  function updateCountdown() {
    if (remaining > 0 && dashboard && dashboard.parentNode) {
      dashboard.textContent = dashboard.getAttribute("data-base-label") + "\n🔒 SCROLL LOCKED: " + remaining + "s";
      remaining--;
      lockTimeout = setTimeout(updateCountdown, 1000);
    } else {
      if (dashboard && dashboard.parentNode) {
        dashboard.textContent = dashboard.getAttribute("data-base-label") + "\n✓ Scroll unlocked";
      }
    }
  }
  
  updateCountdown();
}

function unlockScroll() {
  scrollLocked = false;
  if (lockTimeout) {
    clearTimeout(lockTimeout);
    lockTimeout = null;
  }
  if (scrollBlocker && scrollBlocker.parentNode) {
    scrollBlocker.remove();
    scrollBlocker = null;
  }
  if (lockStyleEl && lockStyleEl.parentNode) {
    lockStyleEl.remove();
    lockStyleEl = null;
  }
}

function preventKeyScroll(e) {
  if (scrollLocked && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "PageDown" || e.key === "PageUp" || e.key === "j" || e.key === "k")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
}

document.addEventListener("keydown", preventKeyScroll, { capture: true });
window.addEventListener("keydown", preventKeyScroll, { capture: true });

function scrollToNext(container) {
  if (scrollLocked) return;
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

function createLoadingOverlay() {
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2147483646;";
  
  var spinner = document.createElement("div");
  spinner.style.cssText = "width:60px;height:60px;border:4px solid #333;border-top:4px solid #39ff14;border-radius:50%;animation:shadowspin 0.8s linear infinite;";
  
  var text = document.createElement("div");
  text.style.cssText = "color:#39ff14;font-family:monospace;font-size:16px;margin-top:20px;";
  text.textContent = "AI evaluating content...";
  
  var style = document.createElement("style");
  style.textContent = "@keyframes shadowspin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}";
  
  overlay.appendChild(style);
  overlay.appendChild(spinner);
  overlay.appendChild(text);
  document.body.appendChild(overlay);
  
  return overlay;
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
    
    var loadingOverlay = createLoadingOverlay();

    chrome.runtime.sendMessage(
      { type: "evaluate", text: textContent },
      (response) => {
        if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
        
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
        dashboard.style.whiteSpace = "pre-line";
        
        var label = "ACTION: " + action + " | SCORE: " + score;
        if (response.data.reason) label += "\n" + response.data.reason;
        dashboard.setAttribute("data-base-label", label);
        dashboard.textContent = label;
        document.body.appendChild(dashboard);

        if (action === "SKIP") {
          setTimeout(() => {
            scrollToNext(container);
            dashboard.remove();
          }, 1500);
        } else if (action === "LIKE_AND_STAY") {
          const likeIcon = container.querySelector('[data-e2e="like-icon"]');
          if (likeIcon) {
            likeIcon.click();
          }
          lockScroll(5, dashboard);
          setTimeout(() => {
            unlockScroll();
            scrollToNext(container);
            dashboard.remove();
          }, 15000);
        } else if (action === "WAIT") {
          setTimeout(() => {
            scrollToNext(container);
            dashboard.remove();
          }, delayMs);
        }
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
