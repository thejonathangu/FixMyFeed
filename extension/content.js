const isIg = window.location.hostname.includes("instagram.com");
const isTikTok = window.location.hostname.includes("tiktok.com");
const CREDIT_REFRESH_MS = 30000;
var latestCreditStatus = null;


// ---------------------------------------------------------------------------
// Watch tracking - tracks current video being watched for duration logging
// ---------------------------------------------------------------------------
var currentWatch = null;

function logCurrentWatch() {
  if (currentWatch && currentWatch.action !== "SKIP") {
    var duration = Date.now() - currentWatch.startTime;
    chrome.runtime.sendMessage({
      type: "log_watch",
      action_type: currentWatch.action,
      duration_ms: duration,
      text_content: currentWatch.textContent
    }, function() { if (chrome.runtime.lastError) {} });
    if (currentWatch.dashboard && currentWatch.dashboard.parentNode) {
      currentWatch.dashboard.remove();
    }
    currentWatch = null;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyCreditFilter(creditStatus) {
  if (!creditStatus || !creditStatus.max_credits) return;
  const ratio = clamp(creditStatus.remaining_credits / creditStatus.max_credits, 0, 1);
  const grayscalePercent = Math.round((1 - ratio) * 100);
  document.documentElement.style.filter = "grayscale(" + grayscalePercent + "%)";
}

function formatCreditLine(creditStatus) {
  if (!creditStatus) return "🎨 Color credits: --/30 (1h)";
  return "🎨 Color credits: " + creditStatus.remaining_credits + "/" + creditStatus.max_credits + " (1h)";
}

function updateDashboardCredits(dashboard, creditStatus) {
  if (!dashboard || !dashboard.parentNode) return;
  const baseLabel = dashboard.getAttribute("data-base-label") || "";
  dashboard.setAttribute("data-base-label", baseLabel.split("\n🎨 Color credits:")[0] + "\n" + formatCreditLine(creditStatus));
  dashboard.textContent = dashboard.getAttribute("data-base-label");
}

function normalizeCategoryVector(action, arr) {
  var out = [];
  if (Array.isArray(arr)) {
    for (var i = 0; i < arr.length && out.length < 3; i++) {
      var s = String(arr[i] == null ? "" : arr[i]).trim().slice(0, 30);
      if (s) out.push(s);
    }
  }
  if (out.length) return out;
  if (action === "WAIT") return ["uncategorized", "neutral"];
  if (action === "LIKE_AND_STAY") return ["aligned", "interest_match"];
  return [];
}

function getColorCreditStatus() {
  return new Promise(function(resolve) {
    chrome.runtime.sendMessage({ action: "get_color_credit_status" }, function(response) {
      if (chrome.runtime.lastError) {
        console.log("[Shadow-Scroll] Color credits:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      if (!response || !response.success) {
        resolve(null);
        return;
      }
      resolve(response.data);
    });
  });
}

function consumeColorCredit(videoData) {
  return new Promise(function(resolve) {
    chrome.runtime.sendMessage({ action: "consume_color_credit", data: videoData || {} }, function(response) {
      if (chrome.runtime.lastError) {
        console.log("[Shadow-Scroll] consumeColorCredit:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      if (!response || !response.success) {
        resolve(null);
        return;
      }
      resolve(response.data);
    });
  });
}

// ---------------------------------------------------------------------------
// Scroll locking (from upstream — prevents manual skip during LIKE_AND_STAY)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Scroll to next — platform aware (Instagram vs TikTok)
// ---------------------------------------------------------------------------
function scrollToNext(container) {
  if (scrollLocked) return;

  if (isIg) {
    // Try the native "Next" chevron button first (multiple aria-labels)
    const nextSelectors = [
      'svg[aria-label="Next"]',
      'svg[aria-label="Go forward"]', 
      'button[aria-label="Next"]',
      'div[role="button"] svg[aria-label*="Next"]'
    ];
    
    for (const sel of nextSelectors) {
      const nextBtnSvg = document.querySelector(sel);
      if (nextBtnSvg) {
        const nextBtn = nextBtnSvg.closest('button') || nextBtnSvg.closest('[role="button"]') || nextBtnSvg.parentElement;
        if (nextBtn) {
          nextBtn.click();
          return;
        }
      }
    }
    
    // Try keyboard navigation (Instagram supports arrow keys)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    
    // Fallback: scroll to the next video element
    var all = Array.from(document.querySelectorAll('video'));
    var currentIndex = all.indexOf(container);
    if (currentIndex !== -1 && currentIndex + 1 < all.length) {
      all[currentIndex + 1].scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }
  } else if (isTikTok) {
    var all = document.querySelectorAll('[data-e2e="recommend-list-item-container"]');
    for (var i = 0; i < all.length; i++) {
      if (all[i] === container && i + 1 < all.length) {
        all[i + 1].scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    if (container.parentElement) {
      container.parentElement.scrollBy({ top: container.offsetHeight, behavior: "smooth" });
    } else {
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }
  }
}

function findPrimaryVideo(container) {
  if (!container) return null;
  if (container.tagName === "VIDEO") return container;
  var v = container.querySelector("video");
  return v || null;
}

function muteVideoInContainer(container) {
  var v = findPrimaryVideo(container);
  if (v) v.muted = true;
}

function enableSoundInContainer(container) {
  var v = findPrimaryVideo(container);
  if (!v) return;
  v.muted = false;
  v.volume = 1;
  v.play().catch(function() {});
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
// ---------------------------------------------------------------------------
// Loading overlay (from upstream)
// ---------------------------------------------------------------------------
function createLoadingOverlay() {
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2147483646;";

  var spinner = document.createElement("div");
  spinner.style.cssText = "width:60px;height:60px;border:4px solid #222;border-top:4px solid #39ff14;border-radius:50%;animation:shadowspin 0.8s linear infinite;";

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

// ---------------------------------------------------------------------------
// Main IntersectionObserver — evaluates each video as it enters view
// ---------------------------------------------------------------------------
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;

    const container = entry.target;

    if (container.getAttribute("data-scanned") === "true") return;
    container.setAttribute("data-scanned", "true");

    muteVideoInContainer(container);

    // Log previous video's watch time before starting new one
    logCurrentWatch();

    // Scrape text — platform-aware
    let textContent = "";
    if (isIg) {
      // Try multiple strategies to get Instagram reel content
      let wrapper = container;
      
      // Strategy 1: Walk up to find article or large container
      let depth = 0;
      while (wrapper.parentElement && wrapper.tagName !== 'BODY' && depth < 15) {
        wrapper = wrapper.parentElement;
        depth++;
        if (wrapper.tagName === 'ARTICLE' || 
            (wrapper.clientHeight >= window.innerHeight * 0.5 && wrapper.innerText && wrapper.innerText.trim().length > 30)) {
          break;
        }
      }
      
      textContent = wrapper.innerText || "";
      
      // Strategy 2: If still empty, try to find nearby text elements
      if (textContent.trim().length < 20) {
        const possibleCaptions = document.querySelectorAll('span[dir="auto"], h1, h2');
        const texts = [];
        possibleCaptions.forEach(el => {
          const t = el.innerText?.trim();
          if (t && t.length > 5 && t.length < 500) texts.push(t);
        });
        if (texts.length > 0) textContent = texts.join(" ");
      }
      
      // Strategy 3: Get username from visible elements
      const usernameEl = document.querySelector('a[role="link"] span') || document.querySelector('header a span');
      if (usernameEl) textContent = "@" + usernameEl.innerText + " " + textContent;
      
      if (!textContent || textContent.trim().length < 10) {
        textContent = "INSTAGRAM REEL - NO CAPTION DETECTED";
      }
    } else {
      textContent = container.innerText || "";
    }
    const videoData = isIg
      ? {
          creator: "instagram",
          caption: textContent.slice(0, 500),
          hashtags: extractHashtags(textContent),
          platform: "instagram"
        }
      : Object.assign(scrapeVideoData(container), { platform: "tiktok" });

    // Keep candidate logging without consuming color credits.
    if (!isIg) {
      chrome.runtime.sendMessage({
        action: "log_video",
        data: {
          action_type: "candidate",
          caption: videoData.caption,
          hashtags: videoData.hashtags,
          creator: videoData.creator,
          platform: videoData.platform
        }
      }, function() { if (chrome.runtime.lastError) {} });
    }
    var loadingOverlay = createLoadingOverlay();
    
    // Track start time BEFORE API call
    var videoStartTime = Date.now();

    chrome.runtime.sendMessage(
      { type: "evaluate", text: textContent },
      (response) => {
        if (!response || !response.success) {
          if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
          return;
        }

        const action = response.data.action;
        const score = response.data.score;
        const delayMs = response.data.delay_ms;

        if (action === "SKIP") {
          currentWatch = null;
          getColorCreditStatus().then(function(status) {
            if (status) {
              latestCreditStatus = status;
              applyCreditFilter(status);
            }
          });
          scrollToNext(container);
          setTimeout(() => {
            if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
          }, 500);
          return;
        }

        if (action === "WAIT") {
          muteVideoInContainer(container);
          getColorCreditStatus().then(function(status) {
            if (status) {
              latestCreditStatus = status;
              applyCreditFilter(status);
            }
          });
          var categoryVecWait = normalizeCategoryVector(action, response.data.category_vector);
          setTimeout(() => {
            var durationMs = Date.now() - videoStartTime;
            chrome.runtime.sendMessage({
              action: "log_video",
              data: {
                action_type: action,
                caption: videoData.caption,
                hashtags: videoData.hashtags,
                creator: videoData.creator,
                platform: videoData.platform,
                category_vector: categoryVecWait,
                duration_ms: durationMs
              }
            }, function() { if (chrome.runtime.lastError) {} });
            if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
            scrollToNext(container);
          }, delayMs);
          return;
        }

        if (action !== "LIKE_AND_STAY") {
          if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
          return;
        }

        if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();

        enableSoundInContainer(container);

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
        label += "\n" + formatCreditLine(latestCreditStatus);
        dashboard.setAttribute("data-base-label", label);
        dashboard.textContent = label;
        document.body.appendChild(dashboard);

        if (currentWatch) {
          logCurrentWatch();
        }

        currentWatch = {
          action: action,
          startTime: videoStartTime,
          textContent: textContent,
          dashboard: dashboard
        };

        var categoryVecLike = normalizeCategoryVector(action, response.data.category_vector);

        chrome.runtime.sendMessage({
          action: "log_video",
          data: {
            action_type: action,
            caption: videoData.caption,
            hashtags: videoData.hashtags,
            creator: videoData.creator,
            platform: videoData.platform,
            category_vector: categoryVecLike
          }
        }, function() {
          if (chrome.runtime.lastError) {
            console.log("[Shadow-Scroll] log_video:", chrome.runtime.lastError.message);
          }
        });

        consumeColorCredit({
          caption: videoData.caption,
          hashtags: videoData.hashtags,
          creator: videoData.creator,
          platform: videoData.platform
        }).then(function(status) {
          if (status) {
            latestCreditStatus = status;
            applyCreditFilter(status);
            updateDashboardCredits(dashboard, status);
          }

          if (response.data.autolike) {
            if (isIg) {
              let wrapper = container;
              for (let i = 0; i < 6; i++) {
                if (wrapper.parentElement) wrapper = wrapper.parentElement;
              }
              const likeIcon = wrapper.querySelector('svg[aria-label="Like"]') || document.querySelector('svg[aria-label="Like"]');
              if (likeIcon) {
                const clickable = likeIcon.closest('div[role="button"]') || likeIcon.closest('button') || likeIcon.parentElement;
                if (clickable) clickable.click();
              }
            } else {
              const likeIcon = container.querySelector('[data-e2e="like-icon"]');
              if (likeIcon) {
                likeIcon.click();
              }
            }
          }

          lockScroll(5, dashboard);
          setTimeout(() => {
            unlockScroll();
            if (dashboard && dashboard.parentNode) {
              dashboard.textContent = dashboard.getAttribute("data-base-label") + "\n✓ Scroll unlocked - watching...";
            }
          }, 5000);
        });
      }
    );
  });
}, { threshold: isIg ? 0.1 : 0.6 });

// ---------------------------------------------------------------------------
// Poll for new video containers every second — platform aware
// ---------------------------------------------------------------------------
setInterval(() => {
  if (isIg) {
    const videos = document.querySelectorAll('video:not([data-observed])');
    videos.forEach((el) => {
      el.setAttribute("data-observed", "true");
      observer.observe(el);
    });
    
    const reelContainers = document.querySelectorAll('article:not([data-observed]), div[role="dialog"] video:not([data-observed])');
    reelContainers.forEach((el) => {
      if (!el.getAttribute("data-observed")) {
        el.setAttribute("data-observed", "true");
        observer.observe(el);
      }
    });
  } else if (isTikTok) {
    const containers = document.querySelectorAll(
      '[data-e2e="recommend-list-item-container"]:not([data-observed])'
    );
    containers.forEach((el) => {
      el.setAttribute("data-observed", "true");
      observer.observe(el);
    });
  }
}, 1000);

function refreshCreditStatusAndFilter() {
  getColorCreditStatus().then(function(status) {
    if (!status) return;
    latestCreditStatus = status;
    applyCreditFilter(status);
  });
}

refreshCreditStatusAndFilter();
setInterval(refreshCreditStatusAndFilter, CREDIT_REFRESH_MS);

if (isIg) {
  console.log("[Shadow-Scroll] Instagram mode active - watching for reels...");
}
