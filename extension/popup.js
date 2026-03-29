let currentInterests = [];
let currentToxic = [];
let isParentalLocked = false;

const interestTags = document.getElementById("interest-tags");
const toxicTags = document.getElementById("toxic-tags");
const interestInput = document.getElementById("interest-input");
const toxicInput = document.getElementById("toxic-input");
const interestAdd = document.getElementById("interest-add");
const toxicAdd = document.getElementById("toxic-add");
const statusEl = document.getElementById("status");
const autolikeToggle = document.getElementById("autolike-toggle");
const lockBanner = document.getElementById("lock-banner");

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok ? "ok" : "err");
  setTimeout(function() { statusEl.textContent = ""; statusEl.className = "status"; }, 2000);
}

function applyLockState(locked) {
  isParentalLocked = locked;

  // Show/hide the lock banner
  if (lockBanner) lockBanner.style.display = locked ? "block" : "none";

  // Disable/enable inputs and buttons
  var opacity = locked ? "0.35" : "1";
  var events = locked ? "none" : "auto";

  interestInput.disabled = locked;
  toxicInput.disabled = locked;
  interestAdd.disabled = locked;
  toxicAdd.disabled = locked;
  autolikeToggle.disabled = locked;

  interestInput.style.opacity = opacity;
  toxicInput.style.opacity = opacity;
  interestAdd.style.opacity = opacity;
  toxicAdd.style.opacity = opacity;

  // Remove buttons inside tags
  document.querySelectorAll(".tag button").forEach(function(btn) {
    btn.style.display = locked ? "none" : "";
  });
}

function renderTags(container, keywords, type) {
  container.innerHTML = "";
  keywords.forEach(function(kw, i) {
    var tag = document.createElement("span");
    tag.className = "tag tag-" + type;
    tag.innerHTML = kw + ' <button data-idx="' + i + '" style="' + (isParentalLocked ? "display:none" : "") + '">\u00d7</button>';
    tag.querySelector("button").addEventListener("click", function() {
      if (isParentalLocked) return;
      keywords.splice(i, 1);
      saveSettings();
    });
    container.appendChild(tag);
  });
}

function saveSettings() {
  if (isParentalLocked) {
    showStatus("locked by parent", false);
    return;
  }
  chrome.storage.local.set({
    interests: currentInterests,
    toxic: currentToxic,
    autolike: autolikeToggle.checked
  }, function() {
    renderTags(interestTags, currentInterests, "interest");
    renderTags(toxicTags, currentToxic, "toxic");
    showStatus("saved", true);
  });
}

function loadSettings() {
  chrome.storage.local.get(["interests", "toxic", "autolike", "parental_locked"], function(data) {
    currentInterests = data.interests || ["software engineering", "cooking", "tennis"];
    currentToxic = data.toxic || ["prank", "gossip", "rage", "brainrot"];
    autolikeToggle.checked = data.autolike !== false;
    applyLockState(data.parental_locked === true);
    renderTags(interestTags, currentInterests, "interest");
    renderTags(toxicTags, currentToxic, "toxic");
  });
}

function addKeyword(type) {
  if (isParentalLocked) return;
  var input = type === "interest" ? interestInput : toxicInput;
  var val = input.value.trim().toLowerCase();
  if (!val) return;
  var arr = type === "interest" ? currentInterests : currentToxic;
  if (arr.indexOf(val) !== -1) {
    showStatus("already exists", false);
    return;
  }
  arr.push(val);
  input.value = "";
  saveSettings();
}

interestAdd.addEventListener("click", function() { addKeyword("interest"); });
toxicAdd.addEventListener("click", function() { addKeyword("toxic"); });
interestInput.addEventListener("keydown", function(e) { if (e.key === "Enter") addKeyword("interest"); });
toxicInput.addEventListener("keydown", function(e) { if (e.key === "Enter") addKeyword("toxic"); });
autolikeToggle.addEventListener("change", function() { saveSettings(); });

// Sync from Supabase first, then render with correct lock state
chrome.runtime.sendMessage({ type: "syncSettings" }, function() {
  loadSettings();
});

// Show user_id at the bottom so parents can find it for the dashboard
chrome.storage.local.get(["user_id"], function(data) {
  if (data.user_id) {
    var el = document.getElementById("user-id-display");
    if (el) el.textContent = data.user_id;
  }
});

(function refreshColorCreditsHint() {
  var hint = document.getElementById("color-credits-hint");
  if (!hint) return;
  chrome.runtime.sendMessage({ action: "get_color_credit_status" }, function(response) {
    if (chrome.runtime.lastError) {
      hint.style.display = "none";
      return;
    }
    var out =
      response &&
      response.success &&
      response.data &&
      typeof response.data.remaining_credits === "number";
    if (out && response.data.remaining_credits === 0) {
      hint.style.display = "block";
    } else {
      hint.style.display = "none";
    }
  });
})();
