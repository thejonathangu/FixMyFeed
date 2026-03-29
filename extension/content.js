const isIg = window.location.hostname.includes("instagram.com");
const isTikTok = window.location.hostname.includes("tiktok.com");
const CREDIT_REFRESH_MS = 30000;

/** Instagram: only the /reels tab — not feed, explore, profiles, DMs, etc. */
function isInstagramReelsUrl() {
  if (!isIg) return false;
  var p = window.location.pathname || "";
  return p === "/reels" || p.startsWith("/reels/");
}
var latestCreditStatus = null;
var FIXMYFEED_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function ensureFixMyFeedUiFont() {
  // No-op: host page CSP (e.g. Instagram) can block remote stylesheets.
  // Keep UI resilient by relying on local/system font stacks only.
  return;
}

// ---------------------------------------------------------------------------
// Watch tracking - tracks current video being watched for duration logging
// ---------------------------------------------------------------------------
var currentWatch = null;

function logCurrentWatch() {
  if (currentWatch && currentWatch.action !== "SKIP") {
    var duration = Date.now() - currentWatch.startTime;
    console.log("[Shadow-Scroll] Logging watch:", currentWatch.action, duration + "ms");
    chrome.runtime.sendMessage({
      type: "log_watch",
      action_type: currentWatch.action,
      duration_ms: duration,
      text_content: currentWatch.textContent,
      category_vector: currentWatch.categoryVector || null,
      deep_analysis: currentWatch.deepAnalysis || null
    }, function(response) { 
      if (chrome.runtime.lastError) {
        console.log("[Shadow-Scroll] log_watch error:", chrome.runtime.lastError.message);
      } else {
        console.log("[Shadow-Scroll] log_watch response:", response);
      }
    });
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
  if (!creditStatus) return "Color credits: -- / 30 (1h)";
  return (
    "Color credits: " +
    creditStatus.remaining_credits +
    " / " +
    creditStatus.max_credits +
    " (1h)"
  );
}

function updateDashboardCredits(dashboard, creditStatus) {
  if (!dashboard || !dashboard.parentNode) return;
  const baseLabel = dashboard.getAttribute("data-base-label") || "";
  var noLegacy = baseLabel.replace(/\n🎨 Color credits:[^\n]*/g, "");
  var prefix = noLegacy.split("\nColor credits:")[0].trim();
  dashboard.setAttribute("data-base-label", prefix + "\n" + formatCreditLine(creditStatus));
  dashboard.textContent = dashboard.getAttribute("data-base-label");
}

function isExtensionContextInvalidatedError(message) {
  if (!message) return false;
  return String(message).toLowerCase().indexOf("extension context invalidated") !== -1;
}

/**
 * Runtime messaging can fail on first page load while MV3 service worker wakes.
 * Retry briefly so direct landings on /reels are resilient.
 */
function sendRuntimeMessageWithRetry(message, options) {
  options = options || {};
  var attemptsLeft = typeof options.attempts === "number" ? options.attempts : 4;
  var retryDelayMs = typeof options.retryDelayMs === "number" ? options.retryDelayMs : 220;
  var label = options.label || "runtime message";

  return new Promise(function(resolve) {
    function attempt() {
      chrome.runtime.sendMessage(message, function(response) {
        if (!chrome.runtime.lastError && response && response.success) {
          resolve(response.data);
          return;
        }
        if (chrome.runtime.lastError && isExtensionContextInvalidatedError(chrome.runtime.lastError.message)) {
          if (typeof options.onInvalidated === "function") options.onInvalidated();
          resolve(null);
          return;
        }
        attemptsLeft--;
        if (attemptsLeft > 0) {
          setTimeout(attempt, retryDelayMs);
          return;
        }
        if (chrome.runtime.lastError) {
          console.log("[Shadow-Scroll] " + label + ":", chrome.runtime.lastError.message);
        }
        resolve(null);
      });
    }
    attempt();
  });
}

function getColorCreditStatus() {
  return sendRuntimeMessageWithRetry(
    { action: "get_color_credit_status" },
    { label: "Color credits", attempts: 5, retryDelayMs: 260 }
  );
}

function consumeColorCredit(videoData) {
  return sendRuntimeMessageWithRetry(
    { action: "consume_color_credit", data: videoData || {} },
    { label: "consumeColorCredit", attempts: 5, retryDelayMs: 260 }
  );
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
      dashboard.textContent =
        dashboard.getAttribute("data-base-label") + "\nScroll locked: " + remaining + "s";
      remaining--;
      lockTimeout = setTimeout(updateCountdown, 1000);
    } else {
      if (dashboard && dashboard.parentNode) {
        dashboard.textContent = dashboard.getAttribute("data-base-label") + "\nScroll unlocked";
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
/** Minimum time between automated scrolls so the feed / DOM can catch up */
var lastAutoScrollAt = 0;
var MIN_AUTO_SCROLL_GAP_MS = 920;

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
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', keyCode: 34, bubbles: true }));
    
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

/** SKIP bursts often need the Next control to paint; retries + minimum gap reduce stuck overlay */
function scrollToNextReliable(container) {
  if (scrollLocked) return;
  var wait = Math.max(0, MIN_AUTO_SCROLL_GAP_MS - (Date.now() - lastAutoScrollAt));
  function burst() {
    lastAutoScrollAt = Date.now();
    scrollToNext(container);
    setTimeout(function () {
      scrollToNext(container);
    }, 520);
    setTimeout(function () {
      scrollToNext(container);
    }, 1180);
  }
  if (wait > 0) setTimeout(burst, wait);
  else burst();
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
// Loading overlay — full-screen until LIKE_AND_STAY; right column shows quotes
// ---------------------------------------------------------------------------
var evalBlockingOverlay = null;
var quotesListPromise = null;
var blockerQuoteRotateId = null;
var BLOCKER_QUOTE_ROTATE_MS = 5000;

function parseQuotesCsv(text) {
  var out = [];
  var lines = text.split(/\r?\n/);
  for (var li = 1; li < lines.length; li++) {
    var line = lines[li];
    if (!line || !line.trim()) continue;
    var comma = line.indexOf(",");
    if (comma < 0) continue;
    var rest = line.slice(comma + 1);
    if (rest.charAt(0) !== '"') continue;
    var q = "";
    var i = 1;
    while (i < rest.length) {
      if (rest.charAt(i) === '"' && rest.charAt(i + 1) === '"') {
        q += '"';
        i += 2;
        continue;
      }
      if (rest.charAt(i) === '"') {
        i++;
        break;
      }
      q += rest.charAt(i);
      i++;
    }
    if (i >= rest.length || rest.charAt(i) !== ",") continue;
    i++;
    if (rest.charAt(i) !== '"') continue;
    i++;
    var author = "";
    while (i < rest.length) {
      if (rest.charAt(i) === '"' && rest.charAt(i + 1) === '"') {
        author += '"';
        i += 2;
        continue;
      }
      if (rest.charAt(i) === '"') break;
      author += rest.charAt(i);
      i++;
    }
    out.push({ quote: q.trim(), author: author.trim() });
  }
  return out;
}

function getQuotesList() {
  if (!quotesListPromise) {
    quotesListPromise = fetch(chrome.runtime.getURL("assets/quotes.csv"))
      .then(function (res) {
        return res.text();
      })
      .then(parseQuotesCsv)
      .catch(function () {
        return [];
      });
  }
  return quotesListPromise;
}

function ensureHandwrittenQuoteFont() {
  // No-op for the same CSP reason as above.
  return;
}

function clearBlockerQuoteTimer() {
  if (blockerQuoteRotateId !== null) {
    clearInterval(blockerQuoteRotateId);
    blockerQuoteRotateId = null;
  }
}

function updateRandomBlockerQuote(overlay) {
  var quoteBody = overlay.querySelector("[data-fmf-quote-body]");
  var quoteAuthor = overlay.querySelector("[data-fmf-quote-author]");
  if (!quoteBody || !quoteAuthor) return;
  getQuotesList().then(function (list) {
    if (!evalBlockingOverlay || evalBlockingOverlay !== overlay) return;
    var pick =
      list.length > 0
        ? list[Math.floor(Math.random() * list.length)]
        : { quote: "Fall in love with your world.", author: "" };
    quoteBody.textContent = pick.quote;
    quoteAuthor.textContent = pick.author ? "— " + pick.author : "";
  });
}

function armBlockerQuoteDisplay(overlay) {
  ensureHandwrittenQuoteFont();
  var quoteCol = overlay.querySelector("[data-fmf-quote-col]");
  var quoteBody = overlay.querySelector("[data-fmf-quote-body]");
  var quoteAuthor = overlay.querySelector("[data-fmf-quote-author]");
  if (!quoteCol || !quoteBody || !quoteAuthor) return;

  quoteCol.style.transition = "opacity 0.35s ease";
  quoteCol.style.opacity = "1";
  quoteCol.style.visibility = "visible";
  quoteBody.textContent = "…";
  quoteAuthor.textContent = "";
  updateRandomBlockerQuote(overlay);

  clearBlockerQuoteTimer();
  blockerQuoteRotateId = setInterval(function () {
    if (!evalBlockingOverlay || !evalBlockingOverlay.parentNode) {
      clearBlockerQuoteTimer();
      return;
    }
    updateRandomBlockerQuote(overlay);
  }, BLOCKER_QUOTE_ROTATE_MS);
}

function removeEvalBlockingOverlay() {
  clearBlockerQuoteTimer();
  if (evalBlockingOverlay && evalBlockingOverlay.parentNode) {
    evalBlockingOverlay.remove();
  }
  evalBlockingOverlay = null;
}

function ensureEvalBlockingOverlay() {
  if (evalBlockingOverlay && evalBlockingOverlay.parentNode) {
    return evalBlockingOverlay;
  }
  ensureFixMyFeedUiFont();
  var overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:2147483646;";

  var centerLoader = document.createElement("div");
  centerLoader.style.cssText =
    "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;z-index:2;";

  var spinner = document.createElement("div");
  spinner.style.cssText =
    "width:64px;height:64px;border:4px solid #333;border-top-color:#fff;border-radius:50%;animation:shadowspin 0.8s linear infinite;";

  var text = document.createElement("div");
  text.style.cssText =
    "color:#f5f5f5;font-family:" +
    FIXMYFEED_FONT +
    ";font-size:20px;font-weight:500;margin-top:28px;letter-spacing:0.02em;text-align:center;";
  text.textContent = "Evaluating content...";

  var rightCol = document.createElement("div");
  rightCol.setAttribute("data-fmf-quote-col", "1");
  rightCol.style.cssText =
    'position:absolute;top:0;right:0;width:33.333vw;max-width:520px;min-width:260px;height:100%;display:flex;flex-direction:column;justify-content:center;min-width:0;padding:28px 24px 28px 16px;border-left:1px solid rgba(255,255,255,0.12);font-family:"Chalkboard SE","Chalkboard","Marker Felt","Bradley Hand","Noteworthy","Segoe Print","Comic Sans MS",cursive;font-weight:600;color:#f5f5f5;z-index:1;';

  var quoteBody = document.createElement("div");
  quoteBody.setAttribute("data-fmf-quote-body", "1");
  quoteBody.style.cssText =
    'font-family:"Chalkboard SE","Chalkboard","Marker Felt","Bradley Hand","Noteworthy","Segoe Print","Comic Sans MS",cursive;font-style:normal;font-size:clamp(26px,3.8vw,42px);line-height:1.22;letter-spacing:0.01em;text-shadow:0 1px 1px rgba(0,0,0,0.35), 0 0 2px rgba(255,255,255,0.05);';

  var quoteAuthor = document.createElement("div");
  quoteAuthor.setAttribute("data-fmf-quote-author", "1");
  quoteAuthor.style.cssText =
    'font-family:"Chalkboard SE","Chalkboard","Marker Felt","Bradley Hand","Noteworthy","Segoe Print","Comic Sans MS",cursive;margin-top:20px;font-size:clamp(20px,2.8vw,30px);font-weight:400;opacity:0.9;';

  rightCol.appendChild(quoteBody);
  rightCol.appendChild(quoteAuthor);

  var style = document.createElement("style");
  style.textContent =
    "@keyframes shadowspin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}";

  centerLoader.appendChild(spinner);
  centerLoader.appendChild(text);

  overlay.appendChild(style);
  overlay.appendChild(centerLoader);
  overlay.appendChild(rightCol);
  document.body.appendChild(overlay);
  evalBlockingOverlay = overlay;
  armBlockerQuoteDisplay(overlay);
  return overlay;
}

// ---------------------------------------------------------------------------
// Main IntersectionObserver — evaluates each video as it enters view
// ---------------------------------------------------------------------------
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;

    if (isIg && !isInstagramReelsUrl()) return;

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

    ensureEvalBlockingOverlay();
    
    // Track start time BEFORE API call
    var videoStartTime = Date.now();

    chrome.runtime.sendMessage(
      { type: "evaluate", text: textContent },
      (response) => {
        if (chrome.runtime.lastError) {
          if (isExtensionContextInvalidatedError(chrome.runtime.lastError.message)) {
            removeEvalBlockingOverlay();
            scrollToNextReliable(container);
            return;
          }
          removeEvalBlockingOverlay();
          return;
        }
        if (!response || !response.success) {
          removeEvalBlockingOverlay();
          return;
        }

        const action = response.data.action;
        const delayMs =
          typeof response.data.delay_ms === "number" ? response.data.delay_ms : 1100;

        if (action === "SKIP") {
          currentWatch = null;
          getColorCreditStatus().then(function(status) {
            if (status) {
              latestCreditStatus = status;
              applyCreditFilter(status);
            }
          });
          setTimeout(function () {
            scrollToNextReliable(container);
          }, delayMs);
          return;
        }

        if (action !== "LIKE_AND_STAY" && action !== "WAIT") {
          removeEvalBlockingOverlay();
          return;
        }

        removeEvalBlockingOverlay();

        ensureFixMyFeedUiFont();
        enableSoundInContainer(container);

        const dashboard = document.createElement("div");
        dashboard.style.position = "fixed";
        dashboard.style.top = "12px";
        dashboard.style.left = "12px";
        dashboard.style.backgroundColor = "#0a0a0a";
        dashboard.style.color = "#f5f5f5";
        dashboard.style.fontFamily = FIXMYFEED_FONT;
        dashboard.style.fontSize = "16px";
        dashboard.style.fontWeight = "400";
        dashboard.style.lineHeight = "1.5";
        dashboard.style.padding = "18px 22px";
        dashboard.style.zIndex = "2147483647";
        dashboard.style.borderRadius = "10px";
        dashboard.style.border = "1px solid #2a2a2a";
        dashboard.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.45)";
        dashboard.style.pointerEvents = "none";
        dashboard.style.whiteSpace = "pre-line";
        dashboard.style.maxWidth = "min(94vw, 420px)";
        dashboard.style.letterSpacing = "0.01em";

        var label = "ACTION: " + action;
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
          dashboard: dashboard,
          categoryVector: response.data.category_vector || null,
          deepAnalysis: response.data.deep_analysis || null
        };

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

          if (action === "LIKE_AND_STAY" && response.data.autolike) {
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
              dashboard.textContent =
                dashboard.getAttribute("data-base-label") +
                "\nScroll unlocked. Watching this clip.";
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
    if (!isInstagramReelsUrl()) {
      removeEvalBlockingOverlay();
      return;
    }
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
}, 1450);

function refreshCreditStatusAndFilter() {
  getColorCreditStatus().then(function(status) {
    if (!status) return;
    latestCreditStatus = status;
    applyCreditFilter(status);
  });
}

refreshCreditStatusAndFilter();
setInterval(refreshCreditStatusAndFilter, CREDIT_REFRESH_MS);

if (isIg && isInstagramReelsUrl()) {
  console.log("[Shadow-Scroll] Instagram Reels tab — evaluation active");
}

window.addEventListener("popstate", function () {
  if (isIg && !isInstagramReelsUrl()) removeEvalBlockingOverlay();
});


