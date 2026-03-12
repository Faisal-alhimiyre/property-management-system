document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("navbar-container");
  if (!container) return;

  fetch("../main/navigation.html")
    .then((res) => {
      if (!res.ok) throw new Error("Navbar file not found: " + res.status);
      return res.text();
    })
    .then((html) => {
      container.innerHTML = html;
      setupNavbar();
    })
    .catch((err) => {
      console.error(err);
      container.innerHTML = "<div style='padding:10px'>لم يتم تحميل شريط التنقل</div>";
    });
});

function setupNavbar() {
  const navType = document.body.dataset.nav || "user";
  const activeRole = localStorage.getItem("activeRole");

  let currentUser = null;
  try {
    currentUser = JSON.parse(localStorage.getItem("walajna_current_user") || "null");
  } catch {
    currentUser = null;
  }

  const roles = Array.isArray(currentUser?.roles) ? currentUser.roles : [];

  const homeLink = document.getElementById("nav-home");
  const link2 = document.getElementById("nav-link-2");
  const link3 = document.getElementById("nav-link-3");
  const link4 = document.getElementById("nav-link-4");
  const logoLink = document.getElementById("nav-logo-link");
  const supportLink = document.getElementById("nav-support");
  const settingsLink = document.getElementById("nav-settings");

  if (!homeLink || !link2 || !link3 || !link4 || !logoLink || !supportLink || !settingsLink) {
    console.warn("بعض عناصر الناف غير موجودة");
    return;
  }

  clearActiveLinks();

  // =========================
  // 1) GUEST NAV
  // =========================
  if (navType === "guest") {
    homeLink.textContent = "الرئيسية";
    homeLink.href = "../main/homepage.html";

    link2.textContent = "كيف يعمل؟";
    link2.href = "../main/how-it-works.html";

    link3.textContent = "من نحن";
    link3.href = "../main/about.html";

    link4.textContent = "تسجيل الدخول";
    link4.href = "../auth/login.html";

    logoLink.href = "../index.html";

    supportLink.href = "../main/contact.html";
    supportLink.title = "تواصل معنا";
    supportLink.setAttribute("aria-label", "تواصل معنا");
    supportLink.textContent = "✉️";

    settingsLink.style.display = "none";

    setActiveLinkByPage(navType);
    return;
  }

  // =========================
  // 2) USER NAV
  // =========================
  let homeHref = "../auth/login.html";

  if (activeRole === "tenant") {
    homeHref = "../tenants/tenant_home.html";
  } else if (activeRole === "owner") {
    homeHref = "../owners/owner_home.html";
  }

  homeLink.textContent = "الرئيسية";
  homeLink.href = homeHref;

  // الخدمات تبقى كما هي
  link2.textContent = "الخدمات";
  link2.href = "../main/services.html";

  link3.textContent = "الرسائل";
  link3.href = "../main/messages.html";

  link4.textContent = "تسجيل الخروج";
  link4.href = "#";
  link4.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("activeRole");
    localStorage.removeItem("walajna_current_user");
    window.location.href = "../auth/login.html";
  });

  logoLink.href = homeHref;

  supportLink.href = "../main/support.html";
  supportLink.title = "الدعم الفني";
  supportLink.setAttribute("aria-label", "الدعم الفني");
  supportLink.textContent = "🎧";

  settingsLink.href = "../main/settings.html";
  settingsLink.title = "الإعدادات";
  settingsLink.setAttribute("aria-label", "الإعدادات");
  settingsLink.textContent = "⚙️";
  settingsLink.style.display = "grid";

  // إضافة قائمة تبديل الدور فقط إذا عنده أكثر من رول
  if (roles.length > 1) {
  insertRoleSwitcher({
    roles,
    activeRole,
    afterElement: link4
  });
}

  setActiveLinkByPage(navType);
}

function insertRoleSwitcher({ roles, activeRole, afterElement }) {

  if (!afterElement) return;

  if (document.getElementById("nav-role-switcher")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "nav-role-switcher";
  wrapper.id = "nav-role-switcher";

  const select = document.createElement("select");
  select.className = "nav-role-switcher__select";

  const roleLabels = {
    owner: "مالك",
    tenant: "مستأجر"
  };

  roles.forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = roleLabels[role] || role;

    if (role === activeRole) option.selected = true;

    select.appendChild(option);
  });

  select.addEventListener("change", () => {

    const newRole = select.value;

    localStorage.setItem("activeRole", newRole);

    if (newRole === "owner") {
      window.location.href = "../owners/owner_home.html";
    } else {
      window.location.href = "../tenants/tenant_home.html";
    }

  });

  wrapper.appendChild(select);

  afterElement.insertAdjacentElement("afterend", wrapper);
}
function clearActiveLinks() {
  document.querySelectorAll(".walajna-topbar__nav a").forEach((link) => {
    link.classList.remove("is-active");
  });
}

function setActiveLinkByPage(navType) {
  const currentPath = window.location.pathname;

  const homeLink = document.getElementById("nav-home");
  const link2 = document.getElementById("nav-link-2");
  const link3 = document.getElementById("nav-link-3");
  const link4 = document.getElementById("nav-link-4");

  if (navType === "guest") {
    if (currentPath.includes("index")) {
      homeLink.classList.add("is-active");
    } else if (currentPath.includes("how-it-works")) {
      link2.classList.add("is-active");
    } else if (currentPath.includes("about")) {
      link3.classList.add("is-active");
    } else if (currentPath.includes("login")) {
      link4.classList.add("is-active");
    }
    return;
  }

  if (
    currentPath.includes("owner_home") ||
    currentPath.includes("tenant_home")
  ) {
    homeLink.classList.add("is-active");
  } else if (currentPath.includes("services")) {
    link2.classList.add("is-active");
  } else if (currentPath.includes("messages")) {
    link3.classList.add("is-active");
  }
}