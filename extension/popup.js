let currentInterests = [];
let currentToxic = [];

const interestTags = document.getElementById("interest-tags");
const toxicTags = document.getElementById("toxic-tags");
const interestInput = document.getElementById("interest-input");
const toxicInput = document.getElementById("toxic-input");
const interestAdd = document.getElementById("interest-add");
const toxicAdd = document.getElementById("toxic-add");
const statusEl = document.getElementById("status");

function api(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const msg = { type: "api", endpoint: endpoint, method: method };
    if (body) msg.body = body;
    chrome.runtime.sendMessage(msg, (response) => {
      if (response && response.success) resolve(response.data);
      else reject(response ? response.error : "no response");
    });
  });
}

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok ? "ok" : "err");
  setTimeout(() => { statusEl.textContent = ""; statusEl.className = "status"; }, 2000);
}

function renderTags(container, keywords, type) {
  container.innerHTML = "";
  keywords.forEach((kw, i) => {
    const tag = document.createElement("span");
    tag.className = "tag tag-" + type;
    tag.innerHTML = kw + ' <button data-idx="' + i + '">\u00d7</button>';
    tag.querySelector("button").addEventListener("click", () => {
      keywords.splice(i, 1);
      saveKeywords(type, keywords);
    });
    container.appendChild(tag);
  });
}

function saveKeywords(type, keywords) {
  const endpoint = type === "interest" ? "/interests" : "/toxic";
  api(endpoint, "POST", { keywords: keywords })
    .then((data) => {
      if (type === "interest") {
        currentInterests = data.keywords;
        renderTags(interestTags, currentInterests, "interest");
      } else {
        currentToxic = data.keywords;
        renderTags(toxicTags, currentToxic, "toxic");
      }
      showStatus("saved", true);
    })
    .catch(() => showStatus("backend offline", false));
}

function addKeyword(type) {
  const input = type === "interest" ? interestInput : toxicInput;
  const val = input.value.trim().toLowerCase();
  if (!val) return;
  const arr = type === "interest" ? currentInterests : currentToxic;
  if (arr.indexOf(val) !== -1) {
    showStatus("already exists", false);
    return;
  }
  arr.push(val);
  input.value = "";
  saveKeywords(type, arr);
}

interestAdd.addEventListener("click", () => addKeyword("interest"));
toxicAdd.addEventListener("click", () => addKeyword("toxic"));
interestInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addKeyword("interest"); });
toxicInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addKeyword("toxic"); });

Promise.all([api("/interests", "GET"), api("/toxic", "GET")])
  .then(([i, t]) => {
    currentInterests = i.keywords;
    currentToxic = t.keywords;
    renderTags(interestTags, currentInterests, "interest");
    renderTags(toxicTags, currentToxic, "toxic");
  })
  .catch(() => showStatus("backend offline \u2014 start the server", false));
