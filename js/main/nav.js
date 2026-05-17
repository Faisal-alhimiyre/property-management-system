function wlT(key, params) {
  if (window.walajna_language && typeof window.walajna_language.t === "function") {
    return window.walajna_language.t(key, params);
  }
  return key;
}

/** Marketing / public home (`main/homepage.html`). Does not sign the user out. */
function walajnaPublicHomeHref() {
  const p = String(window.location.pathname || "").replace(/\\/g, "/");
  if (p.includes("/main/")) return "homepage.html";
  return "../main/homepage.html";
}

/** Guest nav "How it works" → in-page section on homepage (`#how`). */
function walajnaHowItWorksHref() {
  const p = String(window.location.pathname || "").replace(/\\/g, "/");
  if (/\/homepage\.html$/i.test(p)) return "#how";
  return walajnaPublicHomeHref() + "#how";
}

let walajnaTopbarResizeObserver = null;

/** Keeps sticky bars (e.g. #walajna-breadcrumb) flush under the real measured topbar height (e.g. wrapped nav on small screens). */
function syncWalajnaTopbarHeight() {
  const bar = document.querySelector("#navbar-container .walajna-topbar");
  if (!bar) return;
  const h = Math.max(0, Math.round(bar.getBoundingClientRect().height));
  document.documentElement.style.setProperty("--walajna-topbar-height", h + "px");
}

function observeWalajnaTopbarHeight() {
  const bar = document.querySelector("#navbar-container .walajna-topbar");
  if (!bar || typeof ResizeObserver === "undefined") {
    syncWalajnaTopbarHeight();
    return;
  }
  if (walajnaTopbarResizeObserver) walajnaTopbarResizeObserver.disconnect();
  walajnaTopbarResizeObserver = new ResizeObserver(() => syncWalajnaTopbarHeight());
  walajnaTopbarResizeObserver.observe(bar);
  syncWalajnaTopbarHeight();
}

/** Pages with `data-nav-adaptive` set guest vs user from session (settings, support). */
function syncAdaptiveNavType() {
  if (document.body.getAttribute("data-nav-adaptive") !== "true") return;

  let currentUser = null;
  if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.getCurrentUser === "function") {
    currentUser = WalajnaAuth.getCurrentUser();
  }
  if (!currentUser) {
    try {
      currentUser = JSON.parse(sessionStorage.getItem("walajna_current_user") || "null");
    } catch {
      currentUser = null;
    }
  }
  if (!currentUser) {
    try {
      currentUser = JSON.parse(localStorage.getItem("walajna_current_user") || "null");
    } catch {
      currentUser = null;
    }
  }

  let token = null;
  try {
    token = localStorage.getItem("access_token");
  } catch {
    token = null;
  }

  document.body.dataset.nav = currentUser || token ? "user" : "guest";
}

function setupNavbar() {
  syncAdaptiveNavType();
  const navType = document.body.dataset.nav || "user";
  const activeRole =
    typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.getActiveRole === "function"
      ? WalajnaAuth.getActiveRole()
      : sessionStorage.getItem("activeRole");

  let currentUser =
    typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.getCurrentUser === "function"
      ? WalajnaAuth.getCurrentUser()
      : null;
  if (!currentUser) {
    try {
      currentUser = JSON.parse(sessionStorage.getItem("walajna_current_user") || "null");
    } catch {
      currentUser = null;
    }
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
    console.warn(wlT("nav.warnMissing"));
    return;
  }

  clearActiveLinks();

  if (navType === "guest") {
    homeLink.textContent = wlT("nav.home");
    homeLink.href = "../main/homepage.html";

    link2.textContent = wlT("nav.howItWorks");
    link2.href = walajnaHowItWorksHref();

    link3.textContent = wlT("nav.about");
    link3.href = "../main/about.html";

    link4.textContent = wlT("nav.login");
    link4.href = "../auth/login.html";

    logoLink.href = walajnaPublicHomeHref();

    supportLink.href = "../main/support.html";
    supportLink.title = wlT("nav.support");
    supportLink.setAttribute("aria-label", wlT("nav.support"));
    supportLink.textContent = "🎧";

    settingsLink.href = "../main/settings.html";
    settingsLink.title = wlT("nav.settings");
    settingsLink.setAttribute("aria-label", wlT("nav.settings"));
    settingsLink.textContent = "⚙️";
    settingsLink.style.display = "grid";

    setActiveLinkByPage(navType);
    return;
  }

  let homeHref = "../auth/login.html";
  let homeLabelKey = "nav.home";

  if (activeRole === "tenant") {
    homeHref = "../tenants/tenant_home.html";
  } else if (activeRole === "owner") {
    homeHref = "../owners/owner_home.html";
    homeLabelKey = "owner.pageTitle";
  }

  homeLink.textContent = wlT(homeLabelKey);
  homeLink.href = homeHref;

  link2.textContent = wlT("nav.services");
  link2.href = "../main/services.html";

  link3.textContent = wlT("nav.messages");
  link3.href = "../main/messages.html";

  link4.textContent = wlT("nav.logout");
  link4.href = "#";
  link4.addEventListener("click", (e) => {
    e.preventDefault();

    const confirmed = window.confirm(wlT("nav.confirmLogout"));
    if (!confirmed) return;

    if (typeof WalajnaAuth !== "undefined") {
      void WalajnaAuth.logoutOnServer();
      WalajnaAuth.clearSession();
    } else {
      try {
        sessionStorage.removeItem("activeRole");
        sessionStorage.removeItem("walajna_current_user");
        localStorage.removeItem("activeRole");
        localStorage.removeItem("walajna_current_user");
        localStorage.removeItem("access_token");
      } catch {
        /* ignore */
      }
    }
    window.location.href = "../auth/login.html";
  });

  logoLink.href = walajnaPublicHomeHref();

  supportLink.href = "../main/support.html";
  supportLink.title = wlT("nav.support");
  supportLink.setAttribute("aria-label", wlT("nav.support"));
  supportLink.textContent = "🎧";

  settingsLink.href = "../main/settings.html";
  settingsLink.title = wlT("nav.settings");
  settingsLink.setAttribute("aria-label", wlT("nav.settings"));
  settingsLink.textContent = "⚙️";
  settingsLink.style.display = "grid";

  const existingSwitcher = document.getElementById("nav-role-switcher");
  if (existingSwitcher) existingSwitcher.remove();

  if (roles.length > 1) {
    insertRoleSwitcher({
      roles,
      activeRole,
      afterElement: link4
    });
  }

  setActiveLinkByPage(navType);

  void updateMessagesNavDot(link3, activeRole, currentUser);

  setupMobileNav();

  document.dispatchEvent(new Event("walajna:navbar-ready"));
}

const WALAJNA_MOBILE_NAV_MQ = "(max-width: 768px)";

function setupMobileNav() {
  const topbar = document.querySelector("#navbar-container .walajna-topbar");
  const toggle = document.getElementById("walajna-nav-toggle");
  const panel = document.getElementById("walajna-nav-panel");
  const backdrop = document.getElementById("walajna-nav-backdrop");
  if (!topbar || !toggle || !panel) return;

  const closeMenu = () => {
    topbar.classList.remove("is-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute(
      "aria-label",
      wlT("nav.openMenu")
    );
    document.body.classList.remove("walajna-nav-open");
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }
    requestAnimationFrame(() => syncWalajnaTopbarHeight());
  };

  const openMenu = () => {
    if (!window.matchMedia(WALAJNA_MOBILE_NAV_MQ).matches) return;
    topbar.classList.add("is-nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute(
      "aria-label",
      wlT("nav.closeMenu")
    );
    document.body.classList.add("walajna-nav-open");
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute("aria-hidden", "false");
    }
    requestAnimationFrame(() => syncWalajnaTopbarHeight());
  };

  if (!toggle.dataset.walajnaNavBound) {
    toggle.dataset.walajnaNavBound = "1";
    toggle.addEventListener("click", () => {
      if (topbar.classList.contains("is-nav-open")) closeMenu();
      else openMenu();
    });
  }

  if (backdrop && !backdrop.dataset.walajnaNavBound) {
    backdrop.dataset.walajnaNavBound = "1";
    backdrop.addEventListener("click", closeMenu);
  }

  panel.querySelectorAll("a[href]").forEach((link) => {
    if (link.dataset.walajnaNavCloseBound) return;
    link.dataset.walajnaNavCloseBound = "1";
    link.addEventListener("click", () => {
      if (window.matchMedia(WALAJNA_MOBILE_NAV_MQ).matches) closeMenu();
    });
  });

  if (!window.__walajnaNavEscapeBound) {
    window.__walajnaNavEscapeBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  if (!window.__walajnaNavResizeBound) {
    window.__walajnaNavResizeBound = true;
    window.addEventListener("resize", () => {
      if (!window.matchMedia(WALAJNA_MOBILE_NAV_MQ).matches) closeMenu();
    });
  }

  closeMenu();
}

async function updateMessagesNavDot(messagesLink, activeRole, currentUser) {
  if (!messagesLink || !WalajnaAuth?.fetchWithAuth || !WalajnaAuth?.API_BASE) return;
  const role = String(activeRole || "").toLowerCase();
  if (!role) return;

  let unreadCount = 0;
  try {
    const [maintenanceRes, notificationsRes] = await Promise.all([
      WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/maintenance`, { method: "GET" }),
      WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/notifications`, { method: "GET" }),
    ]);

    if (maintenanceRes.ok) {
      const rows = await maintenanceRes.json();
      if (Array.isArray(rows)) {
        if (role === "owner") {
          unreadCount += rows.filter((r) => !r?.owner_seen).length;
        } else {
          unreadCount += rows.filter((r) => {
            const hasReply = String(r?.owner_reply || "").trim().length > 0;
            const unseen = !r?.tenant_reply_seen_at;
            return hasReply && unseen;
          }).length;
        }
      }
    }

    if (notificationsRes.ok) {
      const rows = await notificationsRes.json();
      if (Array.isArray(rows)) {
        const allowedPaymentTitle =
          role === "owner" ? "PAYMENT_OWNER_RECEIVED" : "PAYMENT_TENANT_PAID";
        unreadCount += rows.filter((r) => {
          if (r?.is_read) return false;
          // Keep nav badge aligned with messages page, which currently surfaces
          // payment notifications only from notifications table.
          return String(r?.title || "") === allowedPaymentTitle;
        }).length;
      }
    }
  } catch {
    return;
  }

  let dot = messagesLink.querySelector(".nav-unread-dot");
  if (unreadCount > 0) {
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "nav-unread-dot";
      messagesLink.appendChild(dot);
    }
  } else if (dot) {
    dot.remove();
  }
}

function insertRoleSwitcher({ roles, activeRole, afterElement }) {
  if (!afterElement) return;

  const wrapper = document.createElement("div");
  wrapper.className = "nav-role-switcher";
  wrapper.id = "nav-role-switcher";

  const select = document.createElement("select");
  select.className = "nav-role-switcher__select";

  const roleLabels = {
    owner: wlT("common.owner"),
    tenant: wlT("common.tenantRole")
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
    try {
      sessionStorage.setItem("activeRole", newRole);
      localStorage.setItem("activeRole", newRole);
    } catch {
      /* ignore */
    }
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

  if (!homeLink || !link2 || !link3 || !link4) return;

  if (navType === "guest") {
    if (currentPath.includes("homepage") || currentPath.includes("index")) {
      if (String(window.location.hash || "").toLowerCase() === "#how") {
        link2.classList.add("is-active");
      } else {
        homeLink.classList.add("is-active");
      }
    } else if (currentPath.includes("about")) {
      link3.classList.add("is-active");
    } else if (currentPath.includes("login")) {
      link4.classList.add("is-active");
    }
    return;
  }

  if (currentPath.includes("owner_home") || currentPath.includes("tenant_home")) {
    homeLink.classList.add("is-active");
  } else if (currentPath.includes("services")) {
    link2.classList.add("is-active");
  } else if (currentPath.includes("messages")) {
    link3.classList.add("is-active");
  }
}

function initNavbar() {
  const container = document.getElementById("navbar-container");
  if (!container) return;

  fetch("../main/navigation.html")
    .then((res) => {
      if (!res.ok) throw new Error("Navbar file not found: " + res.status);
      return res.text();
    })
    .then((html) => {
      container.innerHTML = html;
      if (window.walajna_language && typeof window.walajna_language.apply === "function") {
        window.walajna_language.apply(container);
      }
      const afterHydrate = () => {
        setupNavbar();
        if (typeof window.walajnaInitGlobalBack === "function") {
          window.walajnaInitGlobalBack();
        }
      };
      if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.hydrateSession === "function") {
        return WalajnaAuth.hydrateSession().then(() => {
          afterHydrate();
          requestAnimationFrame(() => observeWalajnaTopbarHeight());
        });
      }
      afterHydrate();
      requestAnimationFrame(() => observeWalajnaTopbarHeight());
      return undefined;
    })
    .catch((err) => {
      console.error(err);
      container.innerHTML =
        "<div style='padding:10px'>" + wlT("nav.loadError") + "</div>";
    });
}

document.addEventListener("DOMContentLoaded", initNavbar);

window.addEventListener("hashchange", () => {
  const navType = document.body.dataset.nav || "user";
  if (navType !== "guest") return;
  const p = String(window.location.pathname || "").replace(/\\/g, "/");
  if (!p.includes("homepage") && !p.includes("index")) return;
  clearActiveLinks();
  setActiveLinkByPage("guest");
});

document.addEventListener("walajna:i18n-applied", () => {
  if (document.getElementById("nav-home")) {
    setupNavbar();
    requestAnimationFrame(() => syncWalajnaTopbarHeight());
  }
});
