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
  resetMessage.style.color = isSuccess ? "#d1fae5" : "#ffefef";
}

function getUsers() {
  return JSON.parse(localStorage.getItem("walajna_users")) || [];
}

function getResetUserId() {
  return localStorage.getItem("walajna_reset_user");
}

console.log("reset-password.js loaded");

(function validateResetAccess() {
  const resetUserId = getResetUserId();
  const users = getUsers();

  console.log("resetUserId:", resetUserId);
  console.log("users:", users);

  const userExists = users.some((user) => user.id === resetUserId);

  if (!resetUserId || !userExists) {
    alert(T("reset.expired"));
    window.location.href = "../auth/forgetpass.html";
  }
})();

resetForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const newPassword = newPasswordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();
  const resetUserId = getResetUserId();
  const users = getUsers();

  console.log("submit fired");
  console.log("newPassword:", newPassword);
  console.log("confirmPassword:", confirmPassword);
  console.log("resetUserId:", resetUserId);

  showResetMessage("");

  if (!newPassword || !confirmPassword) {
    showResetMessage(T("reset.fillAll"));
    return;
  }

  if (newPassword.length < 6) {
    showResetMessage(T("reset.min6"));
    return;
  }

  if (newPassword !== confirmPassword) {
    showResetMessage(T("reset.mismatch"));
    return;
  }

  const userIndex = users.findIndex((user) => user.id === resetUserId);

  console.log("userIndex:", userIndex);

  if (userIndex === -1) {
    showResetMessage(T("reset.userMissing"));
    return;
  }

  users[userIndex].password = newPassword;
  const localUser = users[userIndex] || {};

  console.log("updated user:", localUser);
  localStorage.setItem("walajna_users", JSON.stringify(users));

  const API_BASE =
    (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) ||
    "http://127.0.0.1:8002";

  const payload = {
    user_id: resetUserId,
    national_id: localUser.nationalId || localUser.national_id || "",
    email: localStorage.getItem("walajna_reset_email") || localUser.email || "",
    phone: localStorage.getItem("walajna_reset_phone") || localUser.phoneNumber || localUser.phone || "",
    new_password: newPassword,
  };

  fetch(`${API_BASE}/api/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          detail = err?.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      localStorage.removeItem("walajna_reset_user");
      localStorage.removeItem("walajna_reset_email");
      localStorage.removeItem("walajna_reset_phone");
      localStorage.removeItem("walajna_reset_code");
      localStorage.removeItem("walajna_reset_method");
      showResetMessage(T("reset.success"), true);
      setTimeout(() => {
        window.location.href = "../auth/login.html";
      }, 1200);
    })
    .catch((err) => {
      console.error("reset-password backend sync failed", err);
      showResetMessage("تم تغيير كلمة المرور محلياً فقط. أعد المحاولة أو تواصل مع الدعم.");
    });
});

document.addEventListener("walajna:i18n-applied", () => {
  if (newPasswordInput && !newPasswordInput.value) {
    newPasswordInput.placeholder = T("reset.newPwdPh");
  }
  if (confirmPasswordInput && !confirmPasswordInput.value) {
    confirmPasswordInput.placeholder = T("reset.confirmPh");
  }
});
