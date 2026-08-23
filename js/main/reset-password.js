const T = (k, p) =>
  window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(k, p)
    : k;

const resetForm = document.getElementById("resetForm");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const resetMessage = document.getElementById("resetMessage");

function showResetMessage(message, isSuccess = false) {
  resetMessage.textContent = message;
  resetMessage.classList.toggle("is-success", Boolean(isSuccess && message));
}

function getResetToken() {
  return localStorage.getItem("walajna_reset_token");
}

function apiBase() {
  return (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002";
}

(function validateResetAccess() {
  const resetToken = getResetToken();
  if (!resetToken) {
    alert(T("reset.expired"));
    window.location.href = "../auth/forgetpass.html";
  }
})();

resetForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const resetToken = getResetToken();
  const submitBtn = resetForm.querySelector('button[type="submit"]');

  showResetMessage("");

  if (!newPassword || !confirmPassword) {
    showResetMessage(T("reset.fillAll"));
    return;
  }

  const pwdCheck =
    (window.WalajnaPasswordPolicy && window.WalajnaPasswordPolicy.validate(newPassword)) || {
      ok: false,
      key: "auth.passwordWeak",
    };
  if (!pwdCheck.ok) {
    showResetMessage(T(pwdCheck.key || "auth.passwordWeak"));
    return;
  }

  if (newPassword !== confirmPassword) {
    showResetMessage(T("reset.mismatch"));
    return;
  }

  if (!resetToken) {
    showResetMessage(T("reset.expired"));
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;
    const res = await fetch(`${apiBase()}/api/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reset_token: resetToken,
        new_password: newPassword,
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

    localStorage.removeItem("walajna_reset_identifier");
    localStorage.removeItem("walajna_reset_method");
    localStorage.removeItem("walajna_reset_token");
    showResetMessage(T("reset.success"), true);
    setTimeout(() => {
      window.location.href = "../auth/login.html";
    }, 1200);
  } catch (err) {
    showResetMessage(String(err?.message || err || T("common.tryAgain")));
    if (submitBtn) submitBtn.disabled = false;
  }
});
