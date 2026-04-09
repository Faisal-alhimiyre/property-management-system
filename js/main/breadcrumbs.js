(function (global) {
  function t(k, params) {
    if (!global.walajna_language || typeof global.walajna_language.t !== "function") return k;
    return global.walajna_language.t(k, params);
  }

  function readLocalJson(key, fallback) {
    try {
      return JSON.parse(global.localStorage.getItem(key) || fallback);
    } catch {
      return JSON.parse(fallback);
    }
  }

  function pathFlags() {
    const path = String(global.location.pathname || "").replace(/\\/g, "/");
    return {
      path,
      inOwners: /\/owners\//.test(path),
      inMain: /\/main\//.test(path),
      inTenants: /\/tenants\//.test(path),
    };
  }

  function resolveHref(kind, opts) {
    opts = opts || {};
    const { inOwners, inMain, inTenants } = pathFlags();

    function ownersFile(file) {
      if (inOwners) return file;
      return "../owners/" + file;
    }
    function mainFile(file) {
      if (inMain) return file;
      return "../main/" + file;
    }
    function tenantsFile(file) {
      if (inTenants) return file;
      return "../tenants/" + file;
    }

    switch (kind) {
      case "owner_home":
        return ownersFile("owner_home.html");
      case "tenant_home":
        return tenantsFile("tenant_home.html");
      case "messages":
        return mainFile("messages.html");
      case "settings":
        return mainFile("settings.html");
      case "owner_building": {
        const id = opts.buildingId || "";
        const q = id ? "?buildingId=" + encodeURIComponent(id) : "";
        return ownersFile("owner_building.html" + q);
      }
      default:
        return "#";
    }
  }

  function hrefMainPage(file, query) {
    const q = query || "";
    const { inMain } = pathFlags();
    return inMain ? file + q : "../main/" + file + q;
  }

  function hrefOwnersPage(file, query) {
    const q = query || "";
    const { inOwners } = pathFlags();
    return inOwners ? file + q : "../owners/" + file + q;
  }

  function hrefApartmentInfo(aptId) {
    return hrefMainPage("apartment_info.html", "?id=" + encodeURIComponent(aptId));
  }

  function hrefCosts(aptId) {
    return hrefMainPage("costs.html", "?id=" + encodeURIComponent(aptId));
  }

  function hrefPayments(aptId) {
    return hrefMainPage("payments.html", "?id=" + encodeURIComponent(aptId));
  }

  function hrefPaymentOptions(aptId, paymentId) {
    let q = "?id=" + encodeURIComponent(aptId);
    if (paymentId) q += "&paymentId=" + encodeURIComponent(paymentId);
    return hrefMainPage("payment-options.html", q);
  }

  function hrefApartmentHistory(apartmentId) {
    return hrefOwnersPage("apartment_history.html", "?apartmentId=" + encodeURIComponent(apartmentId));
  }

  function homeKind() {
    return global.localStorage.getItem("activeRole") === "tenant" ? "tenant_home" : "owner_home";
  }

  function aptTitleFromRecord(apt) {
    if (!apt) return "—";
    const buildings = readLocalJson("walajna_buildings", "[]");
    const bData = buildings.find((b) => String(b.id) === String(apt.buildingId));
    const bName = (bData && bData.name) || apt.buildingName || "—";
    const aptN = apt.number || apt.apartmentNumber || "—";
    return t("aptPage.titleDynamic", { n: aptN, b: bName });
  }

  /** Owner: Home → Buildings → Building → Apartment (link to details). */
  function ownerApartmentPrefix(apt) {
    if (!apt) return null;
    const buildings = readLocalJson("walajna_buildings", "[]");
    const bData = buildings.find((b) => String(b.id) === String(apt.buildingId));
    const bName = (bData && bData.name) || apt.buildingName || "—";
    const bid = apt.buildingId;
    return [
      { href: resolveHref("owner_home"), labelKey: "nav.home" },
      { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
      { href: resolveHref("owner_building", { buildingId: bid }), label: bName },
      { href: hrefApartmentInfo(apt.id), label: aptTitleFromRecord(apt) },
    ];
  }

  /** Tenant: Home → Apartment (link). */
  function tenantApartmentPrefix(apt) {
    if (!apt) return null;
    return [
      { href: resolveHref("tenant_home"), labelKey: "nav.home" },
      { href: hrefApartmentInfo(apt.id), label: aptTitleFromRecord(apt) },
    ];
  }

  /** English → ">", Arabic → "<" (follows <html lang> / dir, then localStorage). */
  function barBackChevronChar() {
    const html = document.documentElement;
    const lang = (html.getAttribute("lang") || "").toLowerCase().split("-")[0];
    const dir = (html.getAttribute("dir") || "").toLowerCase();
    if (lang === "ar") return "<";
    if (lang === "en") return ">";
    if (dir === "rtl") return "<";
    if (dir === "ltr") return ">";
    const stored =
      global.walajna_language && typeof global.walajna_language.get === "function"
        ? global.walajna_language.get()
        : "ar";
    return stored === "en" ? ">" : "<";
  }

  function segmentText(seg) {
    if (seg.label != null && String(seg.label).trim() !== "") return String(seg.label);
    if (seg.labelKey) return t(seg.labelKey);
    return "";
  }

  function render() {
    const segs = global.__walajnaBreadcrumbSegments;
    if (!segs || !segs.length) return;

    const host = document.getElementById("navbar-container");
    if (!host) return;

    let nav = document.getElementById("walajna-breadcrumb");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "walajna-breadcrumb";
      nav.className = "walajna-breadcrumb";
      host.insertAdjacentElement("afterend", nav);
    }
    nav.setAttribute("aria-label", t("bc.ariaLabel"));

    const ol = document.createElement("ol");
    ol.className = "walajna-breadcrumb__list";

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const li = document.createElement("li");
      li.className = "walajna-breadcrumb__item";
      const isLast = i === segs.length - 1;

      if (isLast || seg.current) {
        const span = document.createElement("span");
        span.className = "walajna-breadcrumb__current";
        span.setAttribute("aria-current", "page");
        span.textContent = segmentText(seg);
        li.appendChild(span);
      } else {
        const a = document.createElement("a");
        a.className = "walajna-breadcrumb__link";
        a.href = seg.href || "#";
        a.textContent = segmentText(seg);
        li.appendChild(a);
      }
      ol.appendChild(li);
    }

    const useBarBack =
      document.body &&
      document.body.getAttribute("data-nav") === "user" &&
      document.body.dataset.bcBarBack !== "false";
    if (useBarBack) {
      const bar = document.createElement("div");
      bar.className = "walajna-breadcrumb__bar";
      bar.appendChild(ol);
      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "walajna-breadcrumb__bar-back";
      backBtn.setAttribute("aria-label", t("history.back"));
      backBtn.textContent = barBackChevronChar();
      backBtn.addEventListener("click", () => {
        global.history.back();
      });
      bar.appendChild(backBtn);
      nav.replaceChildren(bar);
    } else {
      nav.replaceChildren(ol);
    }
  }

  function set(segments) {
    global.__walajnaBreadcrumbSegments = segments;
    render();
  }

  function initFromBody() {
    if (document.body && document.body.dataset.wlNoBreadcrumb === "true") return;
    const bc = document.body && document.body.getAttribute("data-wl-bc");
    if (!bc) return;

    const role = global.localStorage.getItem("activeRole");
    const params = new URLSearchParams(global.location.search);
    let segments = [];

    if (bc === "owner-buildings") {
      segments = [{ labelKey: "owner.pageTitle", current: true }];
    } else if (bc === "tenant-units") {
      segments = [{ labelKey: "tenant.unitsTitle", current: true }];
    } else if (bc === "owner-building") {
      const buildingId = params.get("buildingId");
      const buildings = readLocalJson("walajna_buildings", "[]");
      const building = buildings.find((b) => String(b.id) === String(buildingId));
      const bname = (building && building.name) || t("building.notFound");
      segments = [
        { href: resolveHref("owner_home"), labelKey: "nav.home" },
        { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
        { label: bname, current: true },
      ];
    } else if (bc === "apartment-details") {
      const aptId = params.get("id");
      const apartments = readLocalJson("walajna_apartments", "[]");
      const apt = apartments.find((a) => String(a.id) === String(aptId));

      if (!apt) {
        const hk = homeKind();
        segments = [
          { href: resolveHref(hk), labelKey: "nav.home" },
          { labelKey: "meta.apartmentDetails", current: true },
        ];
      } else if (role === "tenant") {
        segments = [
          { href: resolveHref("tenant_home"), labelKey: "nav.home" },
          { label: aptTitleFromRecord(apt), current: true },
        ];
      } else {
        const bid = apt.buildingId;
        const buildings = readLocalJson("walajna_buildings", "[]");
        const bData = buildings.find((b) => String(b.id) === String(bid));
        const bName = (bData && bData.name) || apt.buildingName || "—";
        segments = [
          { href: resolveHref("owner_home"), labelKey: "nav.home" },
          { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
          { href: resolveHref("owner_building", { buildingId: bid }), label: bName },
          { label: aptTitleFromRecord(apt), current: true },
        ];
      }
    } else if (bc === "messages") {
      segments = [
        { href: resolveHref(homeKind()), labelKey: "nav.home" },
        { labelKey: "bc.messages", current: true },
      ];
    } else if (bc === "settings") {
      segments = [
        { href: resolveHref(homeKind()), labelKey: "nav.home" },
        { labelKey: "bc.settings", current: true },
      ];
    } else if (bc === "support") {
      segments = [
        { href: resolveHref(homeKind()), labelKey: "nav.home" },
        { labelKey: "bc.support", current: true },
      ];
    } else if (bc === "costs") {
      const aptId = params.get("id");
      const apartments = readLocalJson("walajna_apartments", "[]");
      const apt = apartments.find((a) => String(a.id) === String(aptId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: "nav.home" },
          { labelKey: "bc.costs", current: true },
        ];
      } else if (role === "tenant") {
        const pfx = tenantApartmentPrefix(apt);
        segments = pfx ? [...pfx, { labelKey: "bc.costs", current: true }] : [{ labelKey: "bc.costs", current: true }];
      } else {
        const pfx = ownerApartmentPrefix(apt);
        segments = pfx ? [...pfx, { labelKey: "bc.costs", current: true }] : [{ labelKey: "bc.costs", current: true }];
      }
    } else if (bc === "payments") {
      const aptId = params.get("id") || params.get("apartmentId");
      const apartments = readLocalJson("walajna_apartments", "[]");
      const apt = apartments.find((a) => String(a.id) === String(aptId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: "nav.home" },
          { labelKey: "bc.payments", current: true },
        ];
      } else if (role === "tenant") {
        const pfx = tenantApartmentPrefix(apt);
        segments = pfx ? [...pfx, { labelKey: "bc.payments", current: true }] : [{ labelKey: "bc.payments", current: true }];
      } else {
        const pfx = ownerApartmentPrefix(apt);
        segments = pfx ? [...pfx, { labelKey: "bc.payments", current: true }] : [{ labelKey: "bc.payments", current: true }];
      }
    } else if (bc === "payment-options") {
      const aptId = params.get("id");
      const paymentId = params.get("paymentId");
      const apartments = readLocalJson("walajna_apartments", "[]");
      const apt = apartments.find((a) => String(a.id) === String(aptId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: "nav.home" },
          { labelKey: "bc.paymentOptions", current: true },
        ];
      } else if (role === "tenant") {
        const pfx = tenantApartmentPrefix(apt);
        segments = pfx
          ? [...pfx, { href: hrefPayments(apt.id), labelKey: "bc.payments" }, { labelKey: "bc.paymentOptions", current: true }]
          : [{ labelKey: "bc.paymentOptions", current: true }];
      } else {
        const pfx = ownerApartmentPrefix(apt);
        segments = pfx
          ? [...pfx, { href: hrefPayments(apt.id), labelKey: "bc.payments" }, { labelKey: "bc.paymentOptions", current: true }]
          : [{ labelKey: "bc.paymentOptions", current: true }];
      }
    } else if (bc === "owner-edit") {
      const editBuildingId = params.get("buildingId");
      const isEdit = params.get("mode") === "edit" && editBuildingId;
      if (isEdit) {
        const buildings = readLocalJson("walajna_buildings", "[]");
        const b = buildings.find((x) => String(x.id) === String(editBuildingId));
        const bname = (b && b.name) || t("building.notFound");
        segments = [
          { href: resolveHref("owner_home"), labelKey: "nav.home" },
          { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
          { href: resolveHref("owner_building", { buildingId: editBuildingId }), label: bname },
          { labelKey: "owner.formTitleEdit", current: true },
        ];
      } else {
        segments = [
          { href: resolveHref("owner_home"), labelKey: "nav.home" },
          { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
          { labelKey: "owner.formTitleAdd", current: true },
        ];
      }
    } else if (bc === "apartment-history") {
      const apartmentId = params.get("apartmentId");
      const apartments = readLocalJson("walajna_apartments", "[]");
      const apt = apartments.find((a) => String(a.id) === String(apartmentId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: "nav.home" },
          { labelKey: "history.pageTitle", current: true },
        ];
      } else if (role === "tenant") {
        const pfx = tenantApartmentPrefix(apt);
        segments = pfx ? [...pfx, { labelKey: "history.pageTitle", current: true }] : [{ labelKey: "history.pageTitle", current: true }];
      } else {
        const pfx = ownerApartmentPrefix(apt);
        segments = pfx ? [...pfx, { labelKey: "history.pageTitle", current: true }] : [{ labelKey: "history.pageTitle", current: true }];
      }
    } else if (bc === "apartment-history-details") {
      const apartmentId = params.get("apartmentId");
      const apartments = readLocalJson("walajna_apartments", "[]");
      const apt = apartments.find((a) => String(a.id) === String(apartmentId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: "nav.home" },
          { labelKey: "historyDet.badge", current: true },
        ];
      } else if (role === "tenant") {
        const pfx = tenantApartmentPrefix(apt);
        segments = pfx
          ? [
              ...pfx,
              { href: hrefApartmentHistory(apartmentId), labelKey: "history.pageTitle" },
              { labelKey: "historyDet.badge", current: true },
            ]
          : [{ labelKey: "historyDet.badge", current: true }];
      } else {
        const pfx = ownerApartmentPrefix(apt);
        segments = pfx
          ? [
              ...pfx,
              { href: hrefApartmentHistory(apartmentId), labelKey: "history.pageTitle" },
              { labelKey: "historyDet.badge", current: true },
            ]
          : [{ labelKey: "historyDet.badge", current: true }];
      }
    } else if (bc === "finance-summary") {
      const buildingId = params.get("buildingId");
      const buildings = readLocalJson("walajna_buildings", "[]");
      const building = buildings.find((b) => String(b.id) === String(buildingId));
      const bname = (building && building.name) || t("building.notFound");
      segments = [
        { href: resolveHref("owner_home"), labelKey: "nav.home" },
        { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
        { href: resolveHref("owner_building", { buildingId: buildingId }), label: bname },
        { labelKey: "bc.financeSummary", current: true },
      ];
    }

    if (segments.length) set(segments);
  }

  global.walajnaSetBreadcrumb = set;
  global.walajnaRefreshBreadcrumb = render;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFromBody);
  } else {
    initFromBody();
  }

  global.addEventListener("walajna:i18n-applied", () => {
    if (global.__walajnaBreadcrumbSegments) render();
  });
})(typeof window !== "undefined" ? window : this);
