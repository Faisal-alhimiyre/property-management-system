document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("errorBox");

  const API_BASE =
    (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) ||
    "http://127.0.0.1:8002";

  function showError(msg) {
    errorBox.textContent = msg;
  }

  function isValidSaudiId(id) {
    const s = String(id).trim();
    if (
      typeof isSaudiNationalOrIqamaFormat === "function"
        ? !isSaudiNationalOrIqamaFormat(s)
        : !/^[12]\d{9}$/.test(s)
    ) {
      return false;
    }

    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const digit = Number(s[i]);
      if ((i + 1) % 2 === 1) {
        const doubled = digit * 2;
        sum += doubled > 9 ? doubled - 9 : doubled;
      } else {
        sum += digit;
      }
    }
    return sum % 10 === 0;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const fullName = form.fullName.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const nationalId = form.nationalId.value.trim();
    const phoneNumber = form.phoneNumber.value.trim();

    const T = (k, p) => (window.walajna_language && window.walajna_language.t(k, p)) || k;

    if (!fullName || !email || !password || !confirmPassword || !nationalId || !phoneNumber) {
      showError(T("register.fillAll"));
      return;
    }

    if (!isValidSaudiId(nationalId)) {
      showError(T("register.nationalIdBad"));
      return;
    }

    if (password !== confirmPassword) {
      showError(T("register.passwordMismatch"));
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fullName,
          email,
          password,
          national_id: nationalId,
          phone: phoneNumber,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        showError(error.detail || T("register.createError"));
        return;
      }

      alert(T("register.success"));
      window.location.href = "../auth/login.html";
    } catch (error) {
      showError(T("login.network"));
    }
  });
});