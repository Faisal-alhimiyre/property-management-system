(function () {
  function wlT(key) {
    if (window.walajna_language && typeof window.walajna_language.t === "function") {
      const s = window.walajna_language.t(key);
      if (s != null && String(s).trim() !== "" && s !== key) return s;
    }
    return key === "history.back" ? "Back" : key;
  }

  function injectGlobalBack() {
    if (document.getElementById("walajna-global-back")) return;
    if (document.querySelector(".back-btn")) return;
    if (document.body && document.body.dataset.globalBack === "false") return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "walajna-global-back";
    btn.className = "walajna-global-back";
    btn.setAttribute("data-i18n", "history.back");
    btn.addEventListener("click", () => {
      window.history.back();
    });
    document.body.appendChild(btn);
    /* apply(root) only updates descendants, not root — set label here so "Back" / "رجوع" always shows */
    const label = wlT("history.back");
    btn.textContent = label;
    btn.setAttribute("aria-label", label);
  }

  window.walajnaInitGlobalBack = injectGlobalBack;

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("navbar-container")) {
      injectGlobalBack();
    }
  });
})();

document.addEventListener("walajna:i18n-applied", () => {
  const btn = document.getElementById("walajna-global-back");
  if (btn && window.walajna_language && typeof window.walajna_language.t === "function") {
    const label = window.walajna_language.t("history.back");
    btn.textContent = label;
    btn.setAttribute("aria-label", label);
  }
});
