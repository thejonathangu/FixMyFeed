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

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;

    const container = entry.target;

    if (container.getAttribute("data-scanned") === "true") return;
    container.setAttribute("data-scanned", "true");

    const textContent = container.innerText || "";

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
        var label = "ACTION: " + action + " | SCORE: " + score;
        if (response.data.reason)
          label += "\n" + response.data.reason;
        dashboard.style.whiteSpace = "pre-line";
        dashboard.textContent = label;
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
          } else if (action === "WAIT") {
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
