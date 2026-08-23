const T = (k, p) =>
  window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(k, p)
    : k;

const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("code");
const codeMessage = document.getElementById("codeMessage");

function showMessage(msg) {
  codeMessage.textContent = msg;
}

function apiBase() {
  return (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002";
}

function normalizeDigits(raw) {
  return String(raw || "")
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 1632))
    .replace(/[^\d]/g, "")
    .slice(0, 6);
}

if (codeInput) {
  codeInput.maxLength = 6;
  codeInput.addEventListener("input", () => {
    const normalized = normalizeDigits(codeInput.value);
    if (codeInput.value !== normalized) {
      codeInput.value = normalized;
    }
  });
  const cached = localStorage.getItem("walajna_reset_dev_code");
  if (cached) {
    codeInput.value = normalizeDigits(cached);
    localStorage.removeItem("walajna_reset_dev_code");
  }
}

codeForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const enteredCode = normalizeDigits(codeInput.value.trim());
  codeInput.value = enteredCode;
  const identifier = localStorage.getItem("walajna_reset_identifier") || "";
  const method = localStorage.getItem("walajna_reset_method") || "email";
  const submitBtn = codeForm.querySelector('button[type="submit"]');

  if (!enteredCode || enteredCode.length !== 6) {
    showMessage(T("verify.enterCode"));
    return;
  }

  if (!identifier) {
    showMessage(T("reset.expired"));
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;
    const res = await fetch(`${apiBase()}/api/verify-reset-code`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method,
        identifier,
        code: enteredCode,
      }),
    });
    if (!res.ok) {
      showMessage(T("verify.wrongCode"));
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    const data = await res.json();
    if (!data?.reset_token) {
      showMessage(T("verify.wrongCode"));
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    localStorage.setItem("walajna_reset_token", String(data.reset_token));
    window.location.href = "../auth/reset-password.html";
  } catch {
    showMessage(T("common.tryAgain"));
    if (submitBtn) submitBtn.disabled = false;
  }
});
