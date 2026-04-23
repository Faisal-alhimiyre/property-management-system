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

  function readApartmentsForBreadcrumb() {
    try {
      const ses = global.sessionStorage.getItem("walajna_apartments_session");
      if (ses) {
        const parsed = JSON.parse(ses);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* ignore */
    }
    return readLocalJson("walajna_apartments", "[]");
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

  /** Label for crumb linking to owner home (matches nav first item). */
  function homeBreadcrumbLabelKey() {
    return global.localStorage.getItem("activeRole") === "owner" ? "owner.pageTitle" : "nav.home";
  }

  function aptTitleFromRecord(apt) {
    if (!apt) return "—";
    const buildings = readLocalJson("walajna_buildings", "[]");
    const bData = buildings.find((b) => String(b.id) === String(apt.buildingId));
    const bName = (bData && bData.name) || apt.buildingName || "—";
    const aptN = apt.number || apt.apartmentNumber || "—";
    return t("aptPage.titleDynamic", { n: aptN, b: bName });
  }

  /** Owner: Home → Building → Apartment (link to details). */
  function ownerApartmentPrefix(apt) {
    if (!apt) return null;
    const buildings = readLocalJson("walajna_buildings", "[]");
    const bData = buildings.find((b) => String(b.id) === String(apt.buildingId));
    const bName = (bData && bData.name) || apt.buildingName || "—";
    const bid = apt.buildingId;
    return [
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

    nav.replaceChildren(ol);
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
    } else if (bc === "owner-archive") {
      segments = [
        { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
        { labelKey: "owner.archiveTitle", current: true },
      ];
    } else if (bc === "owner-archive-building") {
      segments = [
        { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
        { href: hrefOwnersPage("owner_archive.html"), labelKey: "owner.archiveTitle" },
        { labelKey: "owner.archiveBuildingTitle", current: true },
      ];
    } else if (bc === "archive-income-history") {
      const archiveId = params.get("archiveId");
      segments = [
        { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
        { href: hrefOwnersPage("owner_archive.html"), labelKey: "owner.archiveTitle" },
        {
          href: hrefOwnersPage(
            "owner_archive_building.html",
            "?archiveId=" + encodeURIComponent(archiveId || "")
          ),
          labelKey: "owner.archiveBuildingTitle",
        },
        { labelKey: "bc.archiveIncomeHistory", current: true },
      ];
    } else if (bc === "tenant-units") {
      segments = [{ labelKey: "tenant.unitsTitle", current: true }];
    } else if (bc === "owner-building") {
      const buildingId = params.get("buildingId");
      const buildings = readLocalJson("walajna_buildings", "[]");
      const building = buildings.find((b) => String(b.id) === String(buildingId));
      const bname = (building && building.name) || t("building.notFound");
      segments = [
        { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
        { label: bname, current: true },
      ];
    } else if (bc === "apartment-details") {
      const aptId = params.get("id");
      const apartments = readApartmentsForBreadcrumb();
      const apt = apartments.find((a) => String(a.id) === String(aptId));

      if (!apt) {
        const hk = homeKind();
        segments = [
          { href: resolveHref(hk), labelKey: homeBreadcrumbLabelKey() },
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
          { href: resolveHref("owner_home"), labelKey: "owner.pageTitle" },
          { href: resolveHref("owner_building", { buildingId: bid }), label: bName },
          { label: aptTitleFromRecord(apt), current: true },
        ];
      }
    } else if (bc === "messages") {
      segments = [
        { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
        { labelKey: "bc.messages", current: true },
      ];
    } else if (bc === "settings") {
      segments = [
        { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
        { labelKey: "bc.settings", current: true },
      ];
    } else if (bc === "support") {
      segments = [
        { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
        { labelKey: "bc.support", current: true },
      ];
    } else if (bc === "costs") {
      const aptId = params.get("id");
      const apartments = readApartmentsForBreadcrumb();
      const apt = apartments.find((a) => String(a.id) === String(aptId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
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
      const apartments = readApartmentsForBreadcrumb();
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
      const apartments = readApartmentsForBreadcrumb();
      const apt = apartments.find((a) => String(a.id) === String(aptId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
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
          { href: resolveHref("owner_building", { buildingId: editBuildingId }), label: bname },
          { labelKey: "owner.formTitleEdit", current: true },
        ];
      } else {
        segments = [
          { href: resolveHref("owner_home"), labelKey: "nav.home" },
          { labelKey: "owner.formTitleAdd", current: true },
        ];
      }
    } else if (bc === "apartment-history") {
      const apartmentId = params.get("apartmentId");
      const apartments = readApartmentsForBreadcrumb();
      const apt = apartments.find((a) => String(a.id) === String(apartmentId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
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
      const apartments = readApartmentsForBreadcrumb();
      const apt = apartments.find((a) => String(a.id) === String(apartmentId));
      if (!apt) {
        segments = [
          { href: resolveHref(homeKind()), labelKey: homeBreadcrumbLabelKey() },
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
        { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
        { href: resolveHref("owner_building", { buildingId: buildingId }), label: bname },
        { labelKey: "bc.financeSummary", current: true },
      ];
    } else if (bc === "portfolio-finance") {
      const refBuildingId = params.get("refBuildingId");
      if (refBuildingId) {
        const buildings = readLocalJson("walajna_buildings", "[]");
        const building = buildings.find((b) => String(b.id) === String(refBuildingId));
        const bname = (building && building.name) || t("building.notFound");
        segments = [
          { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
          { href: resolveHref("owner_building", { buildingId: refBuildingId }), label: bname },
          { labelKey: "bc.portfolioFinance", current: true },
        ];
      } else {
        segments = [
          { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
          { labelKey: "bc.portfolioFinance", current: true },
        ];
      }
    } else if (bc === "portfolio-costs") {
      const refBuildingId = params.get("refBuildingId");
      if (refBuildingId) {
        const buildings = readLocalJson("walajna_buildings", "[]");
        const building = buildings.find((b) => String(b.id) === String(refBuildingId));
        const bname = (building && building.name) || t("building.notFound");
        segments = [
          { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
          { href: resolveHref("owner_building", { buildingId: refBuildingId }), label: bname },
          { labelKey: "bc.portfolioCosts", current: true },
        ];
      } else {
        segments = [
          { href: resolveHref("owner_home"), labelKey: homeBreadcrumbLabelKey() },
          { labelKey: "bc.portfolioCosts", current: true },
        ];
      }
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
