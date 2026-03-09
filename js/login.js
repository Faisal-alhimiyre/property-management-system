document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");

  function showError(msg) {
    if (!errorBox) {
      alert(msg);
      return;
    }
    errorBox.textContent = msg;
  }

  function normalizeRole(user) {
    // يدعم النظام القديم والجديد
    // القديم: user.role = "owner" / "tenant" / "both"
    // الجديد: user.roles = ["owner"] / ["tenant"] / ["owner", "tenant"]
    if (Array.isArray(user.roles)) return user.roles;
    if (user.role === "both") return ["owner", "tenant"];
    if (user.role) return [user.role];
    return [];
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    showError("");

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      showError("الرجاء تعبئة اسم المستخدم وكلمة المرور.");
      return;
    }

    const users = JSON.parse(localStorage.getItem("walajna_users") || "[]");

    const user = users.find(
      (u) =>
        (u.username?.toLowerCase() === username.toLowerCase() ||
          u.email?.toLowerCase() === username.toLowerCase()) &&
        u.password === password
    );

    if (!user) {
      showError("بيانات الدخول غير صحيحة.");
      return;
    }

    const roles = normalizeRole(user);

    localStorage.setItem(
      "walajna_current_user",
      JSON.stringify({
        ...user,
        roles
      })
    );

    // كل مرة بعد تسجيل الدخول يروح لصفحة اختيار الرول
    localStorage.removeItem("activeRole");
    window.location.href = "./role.html";
  });
});