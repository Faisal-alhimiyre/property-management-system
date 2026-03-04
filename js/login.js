document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");

  function showError(msg){
    if (!errorBox) return alert(msg);
    errorBox.textContent = msg;
  }

  function normalizeRole(user){
    // Supports either: user.role = "owner"/"tenant"/"both"
    // OR: user.roles = ["owner","tenant"]
    if (Array.isArray(user.roles)) return user.roles;
    if (user.role === "both") return ["owner","tenant"];
    if (user.role) return [user.role];
    return [];
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    showError("");

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password){
      showError("الرجاء تعبئة اسم المستخدم وكلمة المرور.");
      return;
    }

    // Frontend-only users list (from register.js)
    const users = JSON.parse(localStorage.getItem("walajna_users") || "[]");

    const user = users.find(u =>
      (u.username?.toLowerCase() === username.toLowerCase() || u.email?.toLowerCase() === username.toLowerCase()) &&
      u.password === password
    );

    if (!user){
      showError("بيانات الدخول غير صحيحة.");
      return;
    }

    const roles = normalizeRole(user);

    // Save current user (demo only)
    localStorage.setItem("walajna_current_user", JSON.stringify({
      username: user.username,
      email: user.email,
      nationalId: user.nationalId,
      roles
    }));

    // Redirect logic
    if (roles.length > 1){
      // user has both roles -> choose page
      window.location.href = "./role.html";
      return;
    }

    if (roles[0] === "owner"){
      localStorage.setItem("activeRole", "owner");
      window.location.href = "../owner/owner_home.html"; // change if needed
      return;
    }

    if (roles[0] === "tenant"){
      localStorage.setItem("activeRole", "tenant");
      window.location.href = "../tenants/tenant_home.html"; // change if needed
      return;
    }

    showError("لا يوجد دور صالح لهذا المستخدم.");
  });
});