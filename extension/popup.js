let currentInterests = [];
let currentToxic = [];

const interestTags = document.getElementById("interest-tags");
const toxicTags = document.getElementById("toxic-tags");
const interestInput = document.getElementById("interest-input");
const toxicInput = document.getElementById("toxic-input");
const interestAdd = document.getElementById("interest-add");
const toxicAdd = document.getElementById("toxic-add");
const statusEl = document.getElementById("status");
const autolikeToggle = document.getElementById("autolike-toggle");

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok ? "ok" : "err");
  setTimeout(function() { statusEl.textContent = ""; statusEl.className = "status"; }, 2000);
}

function renderTags(container, keywords, type) {
  container.innerHTML = "";
  keywords.forEach(function(kw, i) {
    var tag = document.createElement("span");
    tag.className = "tag tag-" + type;
    tag.innerHTML = kw + ' <button data-idx="' + i + '">\u00d7</button>';
    tag.querySelector("button").addEventListener("click", function() {
      keywords.splice(i, 1);
      saveSettings();
    });
    container.appendChild(tag);
  });
}

function saveSettings() {
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
  chrome.storage.local.get(["interests", "toxic", "autolike"], function(data) {
    currentInterests = data.interests || ["software engineering", "cooking", "tennis"];
    currentToxic = data.toxic || ["prank", "gossip", "rage", "brainrot"];
    autolikeToggle.checked = data.autolike !== false;
    renderTags(interestTags, currentInterests, "interest");
    renderTags(toxicTags, currentToxic, "toxic");
  });
}

function addKeyword(type) {
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

loadSettings();
