/**
 * Show/hide toggle (eye) for password inputs.
 * Auto-enhances input[type=password] unless data-no-password-toggle is set.
 */
(function (global) {
  const EYE_OPEN =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 5c-5 0-9.27 3.11-11 7.5C2.73 16.89 7 20 12 20s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5A5 5 0 1 1 12 7.5a5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>' +
    "</svg>";

  const EYE_OFF =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M2.1 3.51 3.51 2.1l18.38 18.39-1.41 1.41-3.1-3.1A11.7 11.7 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a12.7 12.7 0 0 1 4.36-5.22L2.1 3.51zM12 7.5c.5 0 1 .08 1.47.22l-1.6 1.6A2.5 2.5 0 0 0 9.62 12l-1.6 1.6A5 5 0 0 1 12 7.5zm0-2.5c5 0 9.27 3.11 11 7.5a12.6 12.6 0 0 1-3.33 4.55l-1.45-1.45A10.3 10.3 0 0 0 20.9 12.5 10.4 10.4 0 0 0 12 7c-.7 0-1.37.08-2.02.23L8.4 5.65C9.53 5.23 10.73 5 12 5z"/>' +
    "</svg>";

  function t(key, fallback) {
    if (global.walajna_language && typeof global.walajna_language.t === "function") {
      const value = global.walajna_language.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function syncButton(btn, visible) {
    btn.setAttribute(
      "aria-label",
      visible ? t("auth.hidePassword", "Hide password") : t("auth.showPassword", "Show password")
    );
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
    btn.innerHTML = visible ? EYE_OFF : EYE_OPEN;
    btn.classList.toggle("is-visible", visible);
  }

  function enhancePasswordInput(input) {
    if (!input || input.dataset.pwToggle === "1") return;
    if (input.getAttribute("data-no-password-toggle") != null) return;
    if (input.type !== "password" && input.type !== "text") return;

    input.dataset.pwToggle = "1";

    const wrap = document.createElement("div");
    wrap.className = "password-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "password-field__toggle";
    btn.tabIndex = 0;
    syncButton(btn, false);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      syncButton(btn, show);
    });

    wrap.appendChild(btn);
  }

  function enhanceAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input[type="password"]').forEach(enhancePasswordInput);
  }

  function boot() {
    enhanceAll(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.addEventListener("walajna:i18n-applied", () => {
    document.querySelectorAll(".password-field__toggle").forEach((btn) => {
      const wrap = btn.closest(".password-field");
      const input = wrap && wrap.querySelector("input");
      if (!input) return;
      syncButton(btn, input.type === "text");
    });
  });

  global.WalajnaPasswordToggle = { enhance: enhancePasswordInput, enhanceAll };
})(typeof window !== "undefined" ? window : globalThis);
