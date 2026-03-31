document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("errorBox");

  const API_BASE = 'http://127.0.0.1:8002';

  function showError(msg) {
    errorBox.textContent = msg;
  }

  function isValidSaudiId(id) {
    if (!/^\d{10}$/.test(id)) return false;
    const first = id[0];

    if (first !== "1" && first !== "2") return false;

    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const digit = Number(id[i]);
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

    if (!fullName || !email || !password || !confirmPassword || !nationalId || !phoneNumber) {
      showError("الرجاء تعبئة جميع الحقول.");
      return;
    }

    if (!isValidSaudiId(nationalId)) {
      showError("رقم الهوية الوطنية غير صحيح.");
      return;
    }

    if (password !== confirmPassword) {
      showError("كلمتا المرور غير متطابقتين.");
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
          role: 'owner'  // Default to owner, can be changed later
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        showError(error.detail || "خطأ في إنشاء الحساب.");
        return;
      }

      alert("تم إنشاء الحساب بنجاح");
      window.location.href = "login.html";
    } catch (error) {
      showError("خطأ في الشبكة. حاول مرة أخرى.");
    }
  });
});