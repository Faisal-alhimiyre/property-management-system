const sideLinks = document.querySelectorAll(".side-link");
const panels = document.querySelectorAll(".panel");

sideLinks.forEach((btn) => {
  btn.addEventListener("click", () => {
    sideLinks.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.section);
    if (target) target.classList.add("active");
  });
});

/* Helpers */
function getUsers() {
  return JSON.parse(localStorage.getItem("walajna_users") || "[]");
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("walajna_current_user") || "null");
  } catch {
    return null;
  }
}

function roleLabel(roleOrRoles) {
  if (Array.isArray(roleOrRoles)) {
    if (roleOrRoles.includes("owner") && roleOrRoles.includes("tenant")) return "مالك + مستأجر";
    if (roleOrRoles[0] === "owner") return "مالك";
    if (roleOrRoles[0] === "tenant") return "مستأجر";
    return "—";
  }

  if (roleOrRoles === "owner") return "مالك";
  if (roleOrRoles === "tenant") return "مستأجر";
  if (roleOrRoles === "both") return "مالك + مستأجر";
  return "—";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function findLoggedInUser() {
  const users = getUsers();
  const current = getCurrentUser();

  if (!users.length) return null;

  if (current) {
    let user = null;

    if (current.nationalId) {
      user = users.find(u => u.nationalId === current.nationalId);
      if (user) return user;
    }

    if (current.email) {
      user = users.find(u => (u.email || "").toLowerCase() === current.email.toLowerCase());
      if (user) return user;
    }

    if (current.username) {
      user = users.find(u => (u.username || "").toLowerCase() === current.username.toLowerCase());
      if (user) return user;
    }
  }

  return users[users.length - 1];
}

function loadProfile() {
  const user = findLoggedInUser();
  const current = getCurrentUser();

  if (!user) {
    setText("p_fullName", "—");
    setText("p_username", "—");
    setText("p_email", "—");
    setText("p_phone", "غير متوفر");
    setText("p_nationalId", "—");
    setText("p_role", "—");

    const avatar = document.getElementById("avatarLetter");
    if (avatar) avatar.textContent = "و";
    return;
  }

  setText("p_fullName", user.fullName);
  setText("p_username", user.username);
  setText("p_email", user.email);
  setText("p_phone", user.phone || "غير متوفر");
  setText("p_nationalId", user.nationalId);
  setText("p_role", current?.roles ? roleLabel(current.roles) : roleLabel(user.role));

  const avatar = document.getElementById("avatarLetter");
  if (avatar) {
    avatar.textContent = (user.fullName || "و").trim().charAt(0) || "و";
  }
}

loadProfile();

/* Change password */
const savePasswordBtn = document.getElementById("savePasswordBtn");
const passwordMessage = document.getElementById("passwordMessage");

if (savePasswordBtn) {
  savePasswordBtn.addEventListener("click", () => {
    const currentPassword = document.getElementById("currentPassword").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
    const confirmNewPassword = document.getElementById("confirmNewPassword").value.trim();

    const users = getUsers();
    const current = getCurrentUser();

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      passwordMessage.textContent = "الرجاء تعبئة جميع حقول كلمة المرور.";
      passwordMessage.style.color = "#df2f45";
      return;
    }

    if (newPassword.length < 4) {
      passwordMessage.textContent = "كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل.";
      passwordMessage.style.color = "#df2f45";
      return;
    }

    if (newPassword !== confirmNewPassword) {
      passwordMessage.textContent = "كلمتا المرور الجديدتان غير متطابقتين.";
      passwordMessage.style.color = "#df2f45";
      return;
    }

    let userIndex = -1;

    if (current?.nationalId) {
      userIndex = users.findIndex(u => u.nationalId === current.nationalId);
    } else if (current?.email) {
      userIndex = users.findIndex(u => (u.email || "").toLowerCase() === current.email.toLowerCase());
    } else if (current?.username) {
      userIndex = users.findIndex(u => (u.username || "").toLowerCase() === current.username.toLowerCase());
    }

    if (userIndex === -1 && users.length > 0) {
      userIndex = users.length - 1;
    }

    if (userIndex === -1) {
      passwordMessage.textContent = "لا يوجد مستخدم لتحديث كلمة المرور.";
      passwordMessage.style.color = "#df2f45";
      return;
    }

    if (users[userIndex].password !== currentPassword) {
      passwordMessage.textContent = "كلمة المرور الحالية غير صحيحة.";
      passwordMessage.style.color = "#df2f45";
      return;
    }

    users[userIndex].password = newPassword;
    localStorage.setItem("walajna_users", JSON.stringify(users));

    passwordMessage.textContent = "تم تحديث كلمة المرور بنجاح.";
    passwordMessage.style.color = "#1f9d55";

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmNewPassword").value = "";
  });
}

/* Theme toggle */
const themeToggle = document.getElementById("themeToggle");

function applyTheme(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
}

if (themeToggle) {
  const savedTheme = localStorage.getItem("walajna_theme") || "light";
  themeToggle.checked = savedTheme === "dark";
  applyTheme(savedTheme);

  themeToggle.addEventListener("change", () => {
    const mode = themeToggle.checked ? "dark" : "light";
    localStorage.setItem("walajna_theme", mode);
    applyTheme(mode);
  });
}

/* Logout */
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("walajna_current_user");
    localStorage.removeItem("activeRole");
    alert("تم تسجيل الخروج.");
    window.location.href = "../auth/login.html";
  });
}

/* Delete account */
const deleteAccountBtn = document.getElementById("deleteAccountBtn");

if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", () => {
    const confirmed = confirm("هل أنت متأكد من حذف الحساب الحالي؟");
    if (!confirmed) return;

    const users = getUsers();
    const current = getCurrentUser();

    if (!users.length) {
      alert("لا توجد حسابات مخزنة.");
      return;
    }

    let filteredUsers = [...users];

    if (current?.nationalId) {
      filteredUsers = users.filter(u => u.nationalId !== current.nationalId);
    } else if (current?.email) {
      filteredUsers = users.filter(u => (u.email || "").toLowerCase() !== current.email.toLowerCase());
    } else if (current?.username) {
      filteredUsers = users.filter(u => (u.username || "").toLowerCase() !== current.username.toLowerCase());
    } else {
      filteredUsers.pop();
    }

    localStorage.setItem("walajna_users", JSON.stringify(filteredUsers));
    localStorage.removeItem("walajna_current_user");
    localStorage.removeItem("activeRole");

    alert("تم حذف الحساب من النسخة التجريبية.");
    window.location.href = "../auth/register.html";
  });
}

/* Modal logic with is-open */
const openEditInfoModalBtn = document.getElementById("openEditInfoModal");
const editInfoModal = document.getElementById("editInfoModal");
const closeEditInfoModalBtn = document.getElementById("closeEditInfoModal");

const editTabs = document.querySelectorAll(".wl-tab");
const editPanels = document.querySelectorAll(".wl-panel");

const emailCodeHint = document.getElementById("emailCodeHint");
const phoneCodeHint = document.getElementById("phoneCodeHint");
const editInfoMessage = document.getElementById("editInfoMessage");

let emailVerificationCode = null;
let phoneVerificationCode = null;

function setEditMessage(text, color = "#df2f45"){
  if (!editInfoMessage) return;
  editInfoMessage.textContent = text;
  editInfoMessage.style.color = color;
}

function generateCode(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidSaudiPhone(phone){
  return /^05\d{8}$/.test(phone);
}

function getEditableUserIndex(){
  const users = getUsers();
  const current = getCurrentUser();

  if (!users.length) return -1;

  let index = -1;

  if (current?.nationalId) {
    index = users.findIndex(u => u.nationalId === current.nationalId);
    if (index !== -1) return index;
  }

  if (current?.email) {
    index = users.findIndex(u => (u.email || "").toLowerCase() === current.email.toLowerCase());
    if (index !== -1) return index;
  }

  if (current?.username) {
    index = users.findIndex(u => (u.username || "").toLowerCase() === current.username.toLowerCase());
    if (index !== -1) return index;
  }

  return users.length - 1;
}

if (editInfoModal && openEditInfoModalBtn) {
  function openEditModal() {
    editInfoModal.classList.add("is-open");
    editInfoModal.setAttribute("aria-hidden", "false");
    setEditMessage("");
  }

  function closeEditModal() {
    editInfoModal.classList.remove("is-open");
    editInfoModal.setAttribute("aria-hidden", "true");
    setEditMessage("");
  }

  openEditInfoModalBtn.addEventListener("click", openEditModal);

  if (closeEditInfoModalBtn) {
    closeEditInfoModalBtn.addEventListener("click", closeEditModal);
  }

  editInfoModal.addEventListener("click", (e) => {
    if (e.target && e.target.dataset && e.target.dataset.close === "true") {
      closeEditModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editInfoModal.classList.contains("is-open")) {
      closeEditModal();
    }
  });

  editTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      editTabs.forEach(t => t.classList.remove("is-active"));
      editPanels.forEach(p => p.classList.remove("is-active"));

      tab.classList.add("is-active");
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add("is-active");

      setEditMessage("");
    });
  });
}

/* Email update */
document.getElementById("sendEmailCodeBtn")?.addEventListener("click", () => {
  const newEmail = document.getElementById("newEmail").value.trim();
  const users = getUsers();
  const current = getCurrentUser();

  if (!newEmail) {
    setEditMessage("الرجاء إدخال البريد الإلكتروني الجديد.");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    setEditMessage("صيغة البريد الإلكتروني غير صحيحة.");
    return;
  }

  const emailExists = users.some(u =>
    (u.email || "").toLowerCase() === newEmail.toLowerCase() &&
    (current?.email || "").toLowerCase() !== newEmail.toLowerCase()
  );

  if (emailExists) {
    setEditMessage("هذا البريد مستخدم بالفعل.");
    return;
  }

  emailVerificationCode = generateCode();
  if (emailCodeHint) emailCodeHint.textContent = `رمز التحقق التجريبي: ${emailVerificationCode}`;
  setEditMessage("تم إنشاء رمز تحقق للبريد الإلكتروني.", "#1f9d55");
});

document.getElementById("verifyEmailBtn")?.addEventListener("click", () => {
  const enteredCode = document.getElementById("emailCode").value.trim();
  const newEmail = document.getElementById("newEmail").value.trim();
  const users = getUsers();
  const index = getEditableUserIndex();

  if (!emailVerificationCode) {
    setEditMessage("الرجاء إرسال رمز التحقق أولًا.");
    return;
  }

  if (!enteredCode) {
    setEditMessage("الرجاء إدخال رمز التحقق.");
    return;
  }

  if (enteredCode !== emailVerificationCode) {
    setEditMessage("رمز التحقق غير صحيح.");
    return;
  }

  if (index === -1) {
    setEditMessage("لا يوجد مستخدم لتحديث البيانات.");
    return;
  }

  users[index].email = newEmail;
  localStorage.setItem("walajna_users", JSON.stringify(users));

  const current = getCurrentUser();
  if (current) {
    current.email = newEmail;
    localStorage.setItem("walajna_current_user", JSON.stringify(current));
  }

  emailVerificationCode = null;
  if (emailCodeHint) emailCodeHint.textContent = "";
  document.getElementById("newEmail").value = "";
  document.getElementById("emailCode").value = "";

  loadProfile();
  setEditMessage("تم تحديث البريد الإلكتروني بنجاح.", "#1f9d55");
});

/* Phone update */
document.getElementById("sendPhoneCodeBtn")?.addEventListener("click", () => {
  const newPhone = document.getElementById("newPhone").value.trim();
  const users = getUsers();
  const current = getCurrentUser();

  if (!newPhone) {
    setEditMessage("الرجاء إدخال رقم الجوال الجديد.");
    return;
  }

  if (!isValidSaudiPhone(newPhone)) {
    setEditMessage("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.");
    return;
  }

  const phoneExists = users.some(u =>
    (u.phone || "") === newPhone &&
    (current?.phone || "") !== newPhone
  );

  if (phoneExists) {
    setEditMessage("رقم الجوال مستخدم بالفعل.");
    return;
  }

  phoneVerificationCode = generateCode();
  if (phoneCodeHint) phoneCodeHint.textContent = `رمز التحقق التجريبي: ${phoneVerificationCode}`;
  setEditMessage("تم إنشاء رمز تحقق لرقم الجوال.", "#1f9d55");
});

document.getElementById("verifyPhoneBtn")?.addEventListener("click", () => {
  const enteredCode = document.getElementById("phoneCode").value.trim();
  const newPhone = document.getElementById("newPhone").value.trim();
  const users = getUsers();
  const index = getEditableUserIndex();

  if (!phoneVerificationCode) {
    setEditMessage("الرجاء إرسال رمز التحقق أولًا.");
    return;
  }

  if (!enteredCode) {
    setEditMessage("الرجاء إدخال رمز التحقق.");
    return;
  }

  if (enteredCode !== phoneVerificationCode) {
    setEditMessage("رمز التحقق غير صحيح.");
    return;
  }

  if (index === -1) {
    setEditMessage("لا يوجد مستخدم لتحديث البيانات.");
    return;
  }

  users[index].phone = newPhone;
  localStorage.setItem("walajna_users", JSON.stringify(users));

  const current = getCurrentUser();
  if (current) {
    current.phone = newPhone;
    localStorage.setItem("walajna_current_user", JSON.stringify(current));
  }

  phoneVerificationCode = null;
  if (phoneCodeHint) phoneCodeHint.textContent = "";
  document.getElementById("newPhone").value = "";
  document.getElementById("phoneCode").value = "";

  loadProfile();
  setEditMessage("تم تحديث رقم الجوال بنجاح.", "#1f9d55");
});