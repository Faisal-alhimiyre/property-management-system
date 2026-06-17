/**
 * Walajna numeric fields: block letters, block mouse-wheel changes, integer money (no cents).
 * Use data-wl-numeric="integer" | "money-500" | "money-100" on inputs, or WalajnaNumericInput.enhance().
 */
(function (global) {
  "use strict";

  const ALLOWED_KEYS = new Set([
    "Backspace",
    "Delete",
    "Tab",
    "Escape",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ]);

  function sanitizeDigits(raw) {
    return String(raw ?? "").replace(/\D/g, "");
  }

  function bindOnce(el, key, handler, options) {
    const attr = "wlNumeric" + key;
    if (el[attr]) return;
    el[attr] = true;
    el.addEventListener(key.toLowerCase(), handler, options);
  }

  function enhanceDigitsOnly(el, opts) {
    if (!el || el.dataset.wlDigitsBound === "1") return el;
    el.dataset.wlDigitsBound = "1";
    if (!el.inputMode) el.inputMode = "numeric";

    const maxLen =
      opts && opts.maxLength != null
        ? opts.maxLength
        : el.maxLength > 0
          ? el.maxLength
          : null;

    function apply() {
      let v = sanitizeDigits(el.value);
      if (maxLen != null) v = v.slice(0, maxLen);
      if (el.value !== v) el.value = v;
    }

    bindOnce(el, "keydown", (e) => {
      if (ALLOWED_KEYS.has(e.key)) return;
      if (e.ctrlKey || e.metaKey) return;
      if (/^\d$/.test(e.key)) return;
      e.preventDefault();
    });

    bindOnce(el, "input", apply);

    bindOnce(el, "paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || global.clipboardData).getData("text");
      const cleaned = sanitizeDigits(text);
      if (!cleaned) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      let next = el.value.slice(0, start) + cleaned + el.value.slice(end);
      if (maxLen != null) next = sanitizeDigits(next).slice(0, maxLen);
      el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    return el;
  }

  function enhance(el, options) {
    if (!el || el.dataset.wlNumericBound === "1") return el;

    const mode = options.mode || "integer";
    const step = Number(options.step) > 0 ? Number(options.step) : mode === "integer" ? 1 : 500;
    const min = options.min != null ? Number(options.min) : 0;

    el.dataset.wlNumericBound = "1";
    el.type = "number";
    el.step = String(step);
    el.min = String(min);
    if (options.max != null) el.max = String(options.max);
    el.inputMode = "numeric";

    function apply() {
      let v = sanitizeDigits(el.value);
      if (v === "") {
        if (el.value !== "") el.value = "";
        return;
      }
      let n = Number(v);
      if (!Number.isFinite(n) || n < min) n = min;
      const next = String(Math.floor(n));
      if (el.value !== next) el.value = next;
    }

    bindOnce(el, "keydown", (e) => {
      if (ALLOWED_KEYS.has(e.key)) return;
      if (e.ctrlKey || e.metaKey) return;
      if (/^\d$/.test(e.key)) return;
      e.preventDefault();
    });

    bindOnce(el, "input", apply);

    bindOnce(el, "paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || global.clipboardData).getData("text");
      const cleaned = sanitizeDigits(text);
      if (!cleaned) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + cleaned + el.value.slice(end);
      apply();
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    bindOnce(
      el,
      "wheel",
      (e) => {
        if (global.document.activeElement === el) e.preventDefault();
      },
      { passive: false }
    );

    return el;
  }

  function enhanceByKind(el) {
    const kind = el.dataset.wlNumeric;
    if (!kind) return el;
    if (kind === "integer") {
      return enhance(el, {
        mode: "integer",
        step: Number(el.dataset.wlStep) > 0 ? Number(el.dataset.wlStep) : 1,
        min: el.min !== "" ? Number(el.min) : 0,
        max: el.max !== "" ? Number(el.max) : null,
      });
    }
    if (kind === "money-500") {
      return enhance(el, { mode: "money", step: 500, min: 0 });
    }
    if (kind === "money-100") {
      return enhance(el, { mode: "money", step: 100, min: 0 });
    }
    return el;
  }

  function init(root) {
    const scope = root && root.querySelectorAll ? root : global.document;
    scope.querySelectorAll("[data-wl-numeric]").forEach(enhanceByKind);
    scope.querySelectorAll("[data-wl-digits-only]").forEach((el) => enhanceDigitsOnly(el));
  }

  function initLinkTenantForm(root) {
    const scope = root && root.querySelectorAll ? root : global.document;
    const modal =
      scope.getElementById?.("linkTenantModal") ||
      scope.querySelector?.("#linkTenantModal") ||
      scope;
    init(modal);
  }

  const api = {
    enhance,
    enhanceDigitsOnly,
    enhanceByKind,
    init,
    initLinkTenantForm,
  };

  global.WalajnaNumericInput = api;

  function boot() {
    init(global.document);
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
