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
  forgotMessage.style.color = isSuccess ? "#d1fae5" : "#ffefef";
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
    identifierInput.placeholder = T("forget.emailPh");
    identifierInput.setAttribute("autocomplete", "email");
  } else {
    identifierLabel.textContent = T("forget.phoneLabel");
    identifierInput.type = "tel";
    identifierInput.placeholder = T("forget.phonePh");
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
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = String(err?.detail || detail);
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
  } catch (err) {
    showForgotMessage(String(err?.message || err || T("common.tryAgain")));
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  localStorage.setItem("walajna_reset_identifier", normalizedIdentifier);
  localStorage.setItem("walajna_reset_method", activeMethod);
  localStorage.removeItem("walajna_reset_token");

  showForgotMessage(T("forget.codeSent"), true);
  setTimeout(() => {
    window.location.href = "../auth/verify-code.html";
  }, 900);
});

updateRecoverMethod("email");
