// login.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const userEl = document.getElementById("username");
  const passEl = document.getElementById("password");

  if (!form || !userEl || !passEl) {
    console.error("تأكد من وجود loginForm و username و password في HTML");
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const username = userEl.value.trim();
    const password = passEl.value;

    if (!username || !password) {
      alert("الرجاء تعبئة اسم المستخدم وكلمة المرور");
      return;
    }

    // ✅ تسجيل دخول تجريبي (بدون Backend)
    // غيّر القيم حسب ما تبغى
    const OWNER_USER = "owner";
    const OWNER_PASS = "1234";

    const TENANT_USER = "tenant";
    const TENANT_PASS = "1234";

    if (username === OWNER_USER && password === OWNER_PASS) {
      // خزّن نوع المستخدم (يفيدنا لاحقًا)
      localStorage.setItem("role", "owner");
      window.location.href = "owner_home.html";
      return;
    }

    if (username === TENANT_USER && password === TENANT_PASS) {
      localStorage.setItem("role", "tenant");
      window.location.href = "tenant_home.html";
      return;
    }

    alert("بيانات الدخول غير صحيحة");
  });
});