const T = (k, p) =>
  window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(k, p)
    : k;

const forgotForm = document.getElementById("forgotForm");
const identifierInput = document.getElementById("identifier");
const identifierLabel = document.getElementById("identifierLabel");
const forgotMessage = document.getElementById("forgotMessage");
const recoverTabs = document.querySelectorAll(".recover-tab");

let activeMethod = "email";

function showForgotMessage(message, isSuccess = false) {
  forgotMessage.textContent = message;
  forgotMessage.classList.toggle("is-success", Boolean(isSuccess && message));
}

function normalizeValue(value) {
  return (value || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return (phone || "").replace(/\s+/g, "").trim();
}

function apiBase() {
  return (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002";
}

function formatApiDetail(detail, fallback) {
  if (detail == null || detail === "") return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    return String(first.msg || first.message || fallback);
  }
  if (typeof detail === "object" && detail.msg) return String(detail.msg);
  return fallback;
}

function updateRecoverMethod(method) {
  activeMethod = method;

  recoverTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.method === method);
  });

  identifierInput.value = "";
  showForgotMessage("");

  if (method === "email") {
    identifierLabel.textContent = T("forget.emailLabel");
    identifierInput.type = "email";
    identifierInput.placeholder = "";
    identifierInput.setAttribute("autocomplete", "email");
  } else {
    identifierLabel.textContent = T("forget.phoneLabel");
    identifierInput.type = "tel";
    identifierInput.placeholder = "";
    identifierInput.setAttribute("autocomplete", "tel");
  }
}

recoverTabs.forEach((tab) => {
  tab.addEventListener("click", function () {
    updateRecoverMethod(this.dataset.method);
  });
});

document.addEventListener("walajna:i18n-applied", () => {
  updateRecoverMethod(activeMethod);
});

forgotForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const rawValue = identifierInput.value;
  const submitBtn = forgotForm.querySelector('button[type="submit"]');

  showForgotMessage("");

  if (!rawValue.trim()) {
    showForgotMessage(
      activeMethod === "email" ? T("forget.needEmail") : T("forget.needPhone")
    );
    return;
  }

  const normalizedIdentifier =
    activeMethod === "email" ? normalizeValue(rawValue) : normalizePhone(rawValue);

  let payload = {};
  try {
    if (submitBtn) submitBtn.disabled = true;
    const res = await fetch(`${apiBase()}/api/forgot-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: activeMethod,
        identifier: normalizedIdentifier,
      }),
    });

    try {
      payload = await res.json();
    } catch {
      payload = {};
    }

    if (!res.ok) {
      const detail = formatApiDetail(payload.detail, T("forget.sendFailed"));
      throw new Error(detail);
    }
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      showForgotMessage(T("login.backendDown"));
    } else {
      showForgotMessage(msg || T("common.tryAgain"));
    }
    return;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }

  localStorage.setItem("walajna_reset_identifier", normalizedIdentifier);
  localStorage.setItem("walajna_reset_method", activeMethod);
  localStorage.removeItem("walajna_reset_token");

  const fallbackCode = String(payload.fallback_code || "").trim();
  if (fallbackCode) {
    localStorage.setItem("walajna_reset_dev_code", fallbackCode);
    showForgotMessage(T("forget.codeFallback", { code: fallbackCode }), true);
    alert(T("forget.codeFallback", { code: fallbackCode }));
  } else {
    localStorage.removeItem("walajna_reset_dev_code");
    showForgotMessage(T("forget.codeSent"), true);
  }

  window.location.href = "../auth/verify-code.html";
});

updateRecoverMethod("email");
