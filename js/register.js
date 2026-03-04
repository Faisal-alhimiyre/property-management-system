document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("errorBox");

  function showError(msg){
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
        sum += (doubled > 9) ? (doubled - 9) : doubled;
      } else {
        sum += digit;
      }
    }
    return sum % 10 === 0;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    showError("");

    const fullName = form.fullName.value.trim();
    const username = form.username.value.trim();
    const email = form.email.value.trim();
    const nationalId = form.nationalId.value.trim();
    const role = form.role.value;
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;

    if (!fullName || !username || !email || !nationalId || !role || !password || !confirmPassword) {
      showError("الرجاء تعبئة جميع الحقول.");
      return;
    }

    if (!isValidSaudiId(nationalId)) {
      showError("رقم الهوية الوطنية غير صحيح.  ");
      return;
    }

    if (password !== confirmPassword) {
      showError("كلمتا المرور غير متطابقتين.");
      return;
    }

    // Temporary storage (for frontend testing only)
    const users = JSON.parse(localStorage.getItem("walajna_users") || "[]");

    const exists = users.some(u =>
      u.username?.toLowerCase() === username.toLowerCase() ||
      u.email?.toLowerCase() === email.toLowerCase() ||
      u.nationalId === nationalId
    );

    if (exists) {
      showError("اسم المستخدم أو البريد أو رقم الهوية مستخدم بالفعل.");
      return;
    }

    users.push({ fullName, username, email, nationalId, role, password });
    localStorage.setItem("walajna_users", JSON.stringify(users));

    alert("تم إنشاء الحساب بنجاح");
    window.location.href = "login.html";
  });
});