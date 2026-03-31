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
    alert("انتهت صلاحية العملية، يرجى إعادة طلب استعادة كلمة المرور");
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
    showResetMessage("يرجى تعبئة جميع الحقول");
    return;
  }

  if (newPassword.length < 6) {
    showResetMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    return;
  }

  if (newPassword !== confirmPassword) {
    showResetMessage("كلمتا المرور غير متطابقتين");
    return;
  }

  const userIndex = users.findIndex((user) => user.id === resetUserId);

  console.log("userIndex:", userIndex);

  if (userIndex === -1) {
    showResetMessage("تعذر العثور على المستخدم");
    return;
  }

  users[userIndex].password = newPassword;

  console.log("updated user:", users[userIndex]);

  localStorage.setItem("walajna_users", JSON.stringify(users));

  const savedUsers = JSON.parse(localStorage.getItem("walajna_users")) || [];
  console.log("saved users:", savedUsers);

  localStorage.removeItem("walajna_reset_user");

  showResetMessage("تم تغيير كلمة المرور بنجاح", true);

  setTimeout(() => {
    window.location.href = "../auth/login.html";
  }, 1200);
});