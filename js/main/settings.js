function wlT(key, params) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key, params)
    : key;
}

const sideLinks = document.querySelectorAll(".side-link");
const panels = document.querySelectorAll(".panel");

function applyGuestSettingsLayout() {
  const wrap = document.querySelector(".settings-wrap");
  const sidebar = document.querySelector(".settings-wrap .sidebar");

  if (document.body.getAttribute("data-nav") !== "guest") {
    wrap?.classList.remove("settings-wrap--guest");
    if (sidebar) {
      sidebar.removeAttribute("hidden");
      sidebar.style.display = "";
    }
    sideLinks.forEach((btn) => {
      btn.removeAttribute("hidden");
      btn.style.display = "";
    });
    return;
  }

  /* Guest: only appearance — hide redundant sidebar; main panel already has the title. */
  wrap?.classList.add("settings-wrap--guest");
  if (sidebar) {
    sidebar.setAttribute("hidden", "");
    sidebar.style.display = "none";
  }

  panels.forEach((p) => {
    p.classList.toggle("active", p.id === "appearance");
  });
}

applyGuestSettingsLayout();

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

/**
 * Same source as `auth.js`: cookie-backed sessions store the profile in sessionStorage.
 * Do not read only localStorage — that misses real logins and triggers the wrong fallback.
 */
function getCurrentUser() {
  if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.getCurrentUser === "function") {
    return WalajnaAuth.getCurrentUser();
  }
  try {
    const ss = sessionStorage.getItem("walajna_current_user");
    if (ss) return JSON.parse(ss);
  } catch {
    /* ignore */
  }
  try {
    return JSON.parse(localStorage.getItem("walajna_current_user") || "null");
  } catch {
    return null;
  }
}

function roleLabel(roleOrRoles) {
  if (Array.isArray(roleOrRoles)) {
    if (roleOrRoles.includes("owner") && roleOrRoles.includes("tenant")) return wlT("common.ownerAndTenant");
    if (roleOrRoles[0] === "owner") return wlT("common.owner");
    if (roleOrRoles[0] === "tenant") return wlT("common.tenantRole");
    return wlT("common.dash");
  }

  if (roleOrRoles === "owner") return wlT("common.owner");
  if (roleOrRoles === "tenant") return wlT("common.tenantRole");
  if (roleOrRoles === "both") return wlT("common.ownerAndTenant");
  return wlT("common.dash");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

/** Profile row in `walajna_users` for password/edit flows; null if this account exists only on the server. */
function findWalajnaUsersRow(current) {
  if (!current) return null;
  const users = getUsers();
  if (!users.length) return null;

  if (current.id != null && String(current.id).trim() !== "") {
    const sid = String(current.id);
    const byId = users.find((u) => String(u.id ?? "") === sid);
    if (byId) return byId;
  }

  if (current.nationalId) {
    const u = users.find((x) => String(x.nationalId) === String(current.nationalId));
    if (u) return u;
  }

  if (current.email) {
    const e = String(current.email).toLowerCase();
    const u = users.find((x) => (x.email || "").toLowerCase() === e);
    if (u) return u;
  }

  return null;
}

/** Display profile: local demo row if present, otherwise fields from the active session (server login). */
function profileFromSession(current) {
  const row = findWalajnaUsersRow(current);
  if (row) return row;
  if (!current) return null;
  const email = current.email || "";
  return {
    id: current.id,
    fullName: current.name || current.fullName || "",
    email,
    phone: current.phone || "",
    nationalId: current.nationalId || current.national_id || "",
    role: current.role || (Array.isArray(current.roles) ? current.roles[0] : null),
  };
}

function findLoggedInUser() {
  const current = getCurrentUser();
  if (!current) return null;
  return profileFromSession(current);
}

function loadProfile() {
  const current = getCurrentUser();
  const user = findLoggedInUser();

  if (!user) {
    setText("p_fullName", "—");
    setText("p_email", "—");
    setText("p_phone", wlT("common.notAvailable"));
    setText("p_nationalId", "—");
    setText("p_role", "—");

    const avatar = document.getElementById("avatarLetter");
    if (avatar) avatar.textContent = "W";
    return;
  }

  setText("p_fullName", user.fullName);
  setText("p_email", user.email);
  setText("p_phone", user.phone || wlT("common.notAvailable"));
  setText("p_nationalId", user.nationalId);
  setText("p_role", current?.roles ? roleLabel(current.roles) : roleLabel(user.role));

  const avatar = document.getElementById("avatarLetter");
  if (avatar) {
    const ch = (user.fullName || "W").trim().charAt(0) || "W";
    avatar.textContent = ch;
  }
}

function refreshSettingsProfile() {
  if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.hydrateSession === "function") {
    WalajnaAuth.hydrateSession()
      .then(() => loadProfile())
      .catch(() => loadProfile());
    return;
  }
  loadProfile();
}

refreshSettingsProfile();

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
      passwordMessage.textContent = wlT("settings.pwd.fillAll");
      passwordMessage.style.color = "#df2f45";
      return;
    }

    if (newPassword.length < 4) {
      passwordMessage.textContent = wlT("settings.pwd.short");
      passwordMessage.style.color = "#df2f45";
      return;
    }

    if (newPassword !== confirmNewPassword) {
      passwordMessage.textContent = wlT("settings.pwd.mismatch");
      passwordMessage.style.color = "#df2f45";
      return;
    }

    const userIndex = getEditableUserIndex();

    if (userIndex === -1) {
      passwordMessage.textContent = wlT("settings.pwd.noUser");
      passwordMessage.style.color = "#df2f45";
      return;
    }

    if (users[userIndex].password !== currentPassword) {
      passwordMessage.textContent = wlT("settings.pwd.badCurrent");
      passwordMessage.style.color = "#df2f45";
      return;
    }

    users[userIndex].password = newPassword;
    localStorage.setItem("walajna_users", JSON.stringify(users));

    passwordMessage.textContent = wlT("settings.pwd.success");
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
  logoutBtn.addEventListener("click", async () => {
    if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.logoutOnServer) {
      await WalajnaAuth.logoutOnServer();
    }
    if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.clearSession) {
      WalajnaAuth.clearSession();
    } else {
      try {
        sessionStorage.removeItem("walajna_current_user");
        sessionStorage.removeItem("activeRole");
      } catch {
        /* ignore */
      }
      localStorage.removeItem("walajna_current_user");
      localStorage.removeItem("activeRole");
    }
    alert(wlT("settings.logoutAlert"));
    window.location.href = "../auth/login.html";
  });
}

/* Delete account */
const deleteAccountBtn = document.getElementById("deleteAccountBtn");

if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", () => {
    const confirmed = confirm(wlT("settings.deleteConfirm"));
    if (!confirmed) return;

    const users = getUsers();
    const current = getCurrentUser();

    if (!users.length) {
      alert(wlT("settings.noAccounts"));
      return;
    }

    let filteredUsers = [...users];

    if (current?.nationalId) {
      filteredUsers = users.filter(u => u.nationalId !== current.nationalId);
    } else if (current?.email) {
      filteredUsers = users.filter(u => (u.email || "").toLowerCase() !== current.email.toLowerCase());
    } else {
      alert(wlT("settings.deleteAccount.noLocalRow"));
      return;
    }

    localStorage.setItem("walajna_users", JSON.stringify(filteredUsers));
    localStorage.removeItem("walajna_current_user");
    localStorage.removeItem("activeRole");

    alert(wlT("settings.deletedDemo"));
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

function getEditableUserIndex() {
  const users = getUsers();
  const current = getCurrentUser();
  if (!users.length || !current) return -1;

  if (current.id != null && String(current.id).trim() !== "") {
    const sid = String(current.id);
    const byId = users.findIndex((u) => String(u.id ?? "") === sid);
    if (byId !== -1) return byId;
  }

  if (current.nationalId) {
    const index = users.findIndex((u) => String(u.nationalId) === String(current.nationalId));
    if (index !== -1) return index;
  }

  if (current.email) {
    const e = String(current.email).toLowerCase();
    const index = users.findIndex((u) => (u.email || "").toLowerCase() === e);
    if (index !== -1) return index;
  }

  return -1;
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
    setEditMessage(wlT("settings.email.newRequired"));
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    setEditMessage(wlT("settings.email.invalid"));
    return;
  }

  const emailExists = users.some(u =>
    (u.email || "").toLowerCase() === newEmail.toLowerCase() &&
    (current?.email || "").toLowerCase() !== newEmail.toLowerCase()
  );

  if (emailExists) {
    setEditMessage(wlT("settings.email.taken"));
    return;
  }

  emailVerificationCode = generateCode();
  if (emailCodeHint) emailCodeHint.textContent = wlT("settings.code.demoEmail", { code: emailVerificationCode });
  setEditMessage(wlT("settings.email.codeCreated"), "#1f9d55");
});

document.getElementById("verifyEmailBtn")?.addEventListener("click", () => {
  const enteredCode = document.getElementById("emailCode").value.trim();
  const newEmail = document.getElementById("newEmail").value.trim();
  const users = getUsers();
  const index = getEditableUserIndex();

  if (!emailVerificationCode) {
    setEditMessage(wlT("settings.code.sendFirst"));
    return;
  }

  if (!enteredCode) {
    setEditMessage(wlT("settings.code.enter"));
    return;
  }

  if (enteredCode !== emailVerificationCode) {
    setEditMessage(wlT("settings.code.wrong"));
    return;
  }

  if (index === -1) {
    setEditMessage(wlT("settings.update.noUser"));
    return;
  }

  users[index].email = newEmail;
  localStorage.setItem("walajna_users", JSON.stringify(users));

  const current = getCurrentUser();
  if (current) {
    current.email = newEmail;
    try {
      sessionStorage.setItem("walajna_current_user", JSON.stringify(current));
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("walajna_current_user", JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }

  emailVerificationCode = null;
  if (emailCodeHint) emailCodeHint.textContent = "";
  document.getElementById("newEmail").value = "";
  document.getElementById("emailCode").value = "";

  loadProfile();
  setEditMessage(wlT("settings.email.updated"), "#1f9d55");
});

/* Phone update */
document.getElementById("sendPhoneCodeBtn")?.addEventListener("click", () => {
  const newPhone = document.getElementById("newPhone").value.trim();
  const users = getUsers();
  const current = getCurrentUser();

  if (!newPhone) {
    setEditMessage(wlT("settings.phone.newRequired"));
    return;
  }

  if (!isValidSaudiPhone(newPhone)) {
    setEditMessage(wlT("settings.phone.invalid"));
    return;
  }

  const phoneExists = users.some(u =>
    (u.phone || "") === newPhone &&
    (current?.phone || "") !== newPhone
  );

  if (phoneExists) {
    setEditMessage(wlT("settings.phone.taken"));
    return;
  }

  phoneVerificationCode = generateCode();
  if (phoneCodeHint) phoneCodeHint.textContent = wlT("settings.code.demoEmail", { code: phoneVerificationCode });
  setEditMessage(wlT("settings.phone.codeCreated"), "#1f9d55");
});

document.getElementById("verifyPhoneBtn")?.addEventListener("click", () => {
  const enteredCode = document.getElementById("phoneCode").value.trim();
  const newPhone = document.getElementById("newPhone").value.trim();
  const users = getUsers();
  const index = getEditableUserIndex();

  if (!phoneVerificationCode) {
    setEditMessage(wlT("settings.code.sendFirst"));
    return;
  }

  if (!enteredCode) {
    setEditMessage(wlT("settings.code.enter"));
    return;
  }

  if (enteredCode !== phoneVerificationCode) {
    setEditMessage(wlT("settings.code.wrong"));
    return;
  }

  if (index === -1) {
    setEditMessage(wlT("settings.update.noUser"));
    return;
  }

  users[index].phone = newPhone;
  localStorage.setItem("walajna_users", JSON.stringify(users));

  const current = getCurrentUser();
  if (current) {
    current.phone = newPhone;
    try {
      sessionStorage.setItem("walajna_current_user", JSON.stringify(current));
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("walajna_current_user", JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }

  phoneVerificationCode = null;
  if (phoneCodeHint) phoneCodeHint.textContent = "";
  document.getElementById("newPhone").value = "";
  document.getElementById("phoneCode").value = "";

  loadProfile();
  setEditMessage(wlT("settings.phone.updated"), "#1f9d55");
});

(function initLangSelect() {
  const sel = document.getElementById("walajnaLangSelect");
  if (!sel || !window.walajna_language) return;
  sel.value = walajna_language.get();
  sel.setAttribute("aria-label", wlT("settings.lang.title"));
  sel.addEventListener("change", () => {
    walajna_language.set(sel.value);
    if (typeof window.walajnaUpdateNavbarLabels === "function") {
      window.walajnaUpdateNavbarLabels();
    }
    loadProfile();
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  applyGuestSettingsLayout();
});

document.addEventListener("walajna:navbar-ready", () => {
  applyGuestSettingsLayout();
});

document.addEventListener("walajna:i18n-applied", () => {
  applyGuestSettingsLayout();
  refreshSettingsProfile();
  const sel = document.getElementById("walajnaLangSelect");
  if (sel && window.walajna_language) sel.value = walajna_language.get();
});