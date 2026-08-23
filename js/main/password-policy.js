/**
 * Shared password strength rules (register / reset / settings).
 * Min 8 chars + upper + lower + digit + special.
 */
(function (global) {
  const MIN_LENGTH = 8;
  const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?/\\~`]/;

  const RULES = [
    {
      id: "length",
      key: "auth.pwdReq.length",
      test: (value) => value.length >= MIN_LENGTH,
    },
    {
      id: "upper",
      key: "auth.pwdReq.upper",
      test: (value) => /[A-Z]/.test(value),
    },
    {
      id: "lower",
      key: "auth.pwdReq.lower",
      test: (value) => /[a-z]/.test(value),
    },
    {
      id: "digit",
      key: "auth.pwdReq.digit",
      test: (value) => /\d/.test(value),
    },
    {
      id: "special",
      key: "auth.pwdReq.special",
      test: (value) => SPECIAL_RE.test(value),
    },
  ];

  function t(key) {
    if (global.walajna_language && typeof global.walajna_language.t === "function") {
      return global.walajna_language.t(key);
    }
    return key;
  }

  function validatePasswordStrength(password) {
    const value = String(password || "");
    const allMet = RULES.every((rule) => rule.test(value));
    return { ok: allMet, key: allMet ? null : "auth.passwordWeak" };
  }

  function getRuleStates(password) {
    const value = String(password || "");
    return RULES.map((rule) => ({
      id: rule.id,
      key: rule.key,
      met: rule.test(value),
    }));
  }

  function ensureListItems(listEl) {
    if (listEl.dataset.built === "1") {
      listEl.querySelectorAll("[data-rule]").forEach((li) => {
        const label = li.querySelector(".password-reqs__label");
        if (label && li.dataset.i18nKey) {
          label.textContent = t(li.dataset.i18nKey);
        }
      });
      return;
    }

    listEl.innerHTML = "";
    listEl.classList.add("password-reqs");
    listEl.setAttribute("role", "list");

    RULES.forEach((rule) => {
      const li = document.createElement("li");
      li.className = "password-reqs__item is-unmet";
      li.dataset.rule = rule.id;
      li.dataset.i18nKey = rule.key;
      li.setAttribute("role", "listitem");

      const icon = document.createElement("span");
      icon.className = "password-reqs__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✕";

      const label = document.createElement("span");
      label.className = "password-reqs__label";
      label.textContent = t(rule.key);

      li.appendChild(icon);
      li.appendChild(label);
      listEl.appendChild(li);
    });

    listEl.dataset.built = "1";
  }

  function renderList(listEl, password) {
    ensureListItems(listEl);
    const value = String(password || "");
    const typing = value.length > 0;

    listEl.hidden = !typing;
    listEl.classList.toggle("is-visible", typing);
    if (!typing) return;

    getRuleStates(value).forEach((state) => {
      const li = listEl.querySelector(`[data-rule="${state.id}"]`);
      if (!li) return;
      li.classList.toggle("is-met", state.met);
      li.classList.toggle("is-unmet", !state.met);
      const icon = li.querySelector(".password-reqs__icon");
      if (icon) icon.textContent = state.met ? "✓" : "✕";
    });
  }

  /**
   * Show checklist only after the user starts typing.
   * @param {HTMLInputElement|null} input
   * @param {HTMLElement|null} listEl
   */
  function bindChecklist(input, listEl) {
    if (!input || !listEl) return;

    const update = () => renderList(listEl, input.value);
    input.addEventListener("input", update);
    input.addEventListener("change", update);
    global.addEventListener("walajna:i18n-applied", update);
    update();
  }

  function autoBind() {
    document.querySelectorAll("[data-password-reqs]").forEach((listEl) => {
      const inputId = listEl.getAttribute("data-password-reqs");
      const input = inputId ? document.getElementById(inputId) : null;
      bindChecklist(input, listEl);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoBind);
  } else {
    autoBind();
  }

  global.WalajnaPasswordPolicy = {
    MIN_LENGTH,
    RULES,
    validate: validatePasswordStrength,
    getRuleStates,
    bindChecklist,
  };
})(typeof window !== "undefined" ? window : globalThis);
