document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");

  const API_BASE = 'http://127.0.0.1:8002';

  function showError(msg) {
    if (!errorBox) {
      alert(msg);
      return;
    }
    errorBox.textContent = msg;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showError("الرجاء تعبئة اسم المستخدم وكلمة المرور.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        showError(error.detail || "بيانات الدخول غير صحيحة.");
        return;
      }

      const data = await response.json();
      const user = data.user || null;
      const token = data.access_token;

      if (!token || !user) {
        showError("خطأ في الاستجابة من الخادم، حاول مرة أخرى.");
        return;
      }

      localStorage.setItem('access_token', token);
      localStorage.setItem('walajna_current_user', JSON.stringify({
        ...user,
        roles: user.roles || [user.role]
      }));
      localStorage.setItem('activeRole', user.role || (user.roles ? user.roles[0] : 'tenant'));

      // Next: role selection or direct redirect
      window.location.href = "./role.html";
    } catch (error) {
      showError("خطأ في الشبكة. حاول مرة أخرى.");
    }
  });
});