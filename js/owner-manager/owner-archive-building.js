document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  await WalajnaAuth.hydrateSession();
  requireAuth();
  requireRole("owner");

  const params = new URLSearchParams(window.location.search);
  const archiveId = params.get("archiveId");
  const ARCHIVE_KEY = "walajna_buildings_archive";

  const titleEl = document.getElementById("archiveBuildingTitle");
  const subEl = document.getElementById("archiveBuildingSub");
  const restoreArchivedBuildingBtn = document.getElementById("restoreArchivedBuildingBtn");
  const archiveIncomeHistoryBtn = document.getElementById("archiveIncomeHistoryBtn");
  const grid = document.getElementById("archiveAptGrid");
  const modal = document.getElementById("historyModal");
  const modalTitle = document.getElementById("historyModalTitle");
  const modalBody = document.getElementById("historyModalBody");
  const closeBtn = document.getElementById("closeHistoryModalBtn");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readArchive() {
    try {
      const rows = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function writeArchive(rows) {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
  }

  function inferTotalFloors(b, apartmentList) {
    const fromBuilding = Number(b?.totalFloors ?? b?.total_floors ?? 0);
    if (Number.isFinite(fromBuilding) && fromBuilding > 0) return fromBuilding;
    const maxFloor = (apartmentList || []).reduce((max, apt) => {
      const floor = Number(apt.floorNumber ?? apt.floor_number ?? 0);
      if (!Number.isFinite(floor) || floor < 1) return max;
      return Math.max(max, floor);
    }, 0);
    return maxFloor > 0 ? maxFloor : 1;
  }

  function inferApartmentsPerFloor(apartmentList, totalFloors, apartmentCount) {
    const perFloorMap = new Map();
    (apartmentList || []).forEach((apt) => {
      const floor = Number(apt.floorNumber ?? apt.floor_number ?? 0);
      const normalizedFloor = Number.isFinite(floor) && floor > 0 ? floor : 1;
      perFloorMap.set(normalizedFloor, (perFloorMap.get(normalizedFloor) || 0) + 1);
    });
    const maxOnAnyFloor = Math.max(0, ...Array.from(perFloorMap.values()));
    if (maxOnAnyFloor > 0) return maxOnAnyFloor;
    const floors = Number(totalFloors) > 0 ? Number(totalFloors) : 1;
    return Math.max(1, Math.ceil(Number(apartmentCount || 0) / floors));
  }

  async function restoreArchivedBuildingFromSnapshot() {
    if (!archiveId || !archiveRow) return;
    const ok = confirm(T("owner.confirmRestoreArchiveBuilding"));
    if (!ok) return;

    const b = archiveRow.building || {};
    const apts = Array.isArray(archiveRow.apartments) ? archiveRow.apartments : [];
    const apartmentCount = Number(b.apartmentCount || apts.length || 0);
    const totalFloors = inferTotalFloors(b, apts);
    const apartmentsPerFloor = inferApartmentsPerFloor(apts, totalFloors, apartmentCount);

    const payload = {
      name: String(b.name || "").trim() || T("building.notFound"),
      city: String(b.city || "").trim() || "الرياض",
      code: String(b.code || "").trim() || `ARCH-${Date.now()}`,
      total_floors: Math.max(1, totalFloors),
      apartments_count: Math.max(1, apartmentCount || apts.length || 1),
      apartments_per_floor: Math.max(1, apartmentsPerFloor),
      apartment_defaults: {},
      payment_defaults: { paymentCycle: "monthly" },
    };

    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth ||
      !WalajnaAuth.API_BASE
    ) {
      alert(T("owner.archiveRestoreNetworkError"));
      return;
    }

    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        alert(`${T("owner.archiveRestoreErrorPrefix")}${errorText || response.status}`);
        return;
      }
      const remaining = readArchive().filter((row) => String(row.archiveId) !== String(archiveId));
      writeArchive(remaining);
      alert(T("owner.archiveRestored"));
      window.location.href = "owner_home.html";
    } catch (e) {
      console.warn("restore archived building failed", e);
      alert(T("owner.archiveRestoreNetworkError"));
    }
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : "ar-SA-u-nu-latn";
    return `${number.toLocaleString(loc)} ${T("common.sar")}`;
  }

  function normalizeDigits(value) {
    return String(value ?? "")
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .trim();
  }

  function normalizeApartmentNumber(value) {
    const raw = normalizeDigits(value);
    if (raw === "") return "";
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) return String(asNum);
    return raw;
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  const archiveRow = readArchive().find((x) => String(x.archiveId) === String(archiveId));
  if (!archiveRow) {
    if (titleEl) titleEl.textContent = T("owner.archiveBuildingNotFound");
    if (subEl) subEl.textContent = T("owner.archiveBuildingNotFoundSub");
    if (grid) grid.innerHTML = "";
    return;
  }

  const building = archiveRow.building || {};
  const apartments = Array.isArray(archiveRow.apartments) ? archiveRow.apartments : [];
  const maintenance = Array.isArray(archiveRow.maintenanceHistory) ? archiveRow.maintenanceHistory : [];
  let mergedMaintenance = [...maintenance];

  function readLocalArray(key) {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  async function loadFallbackMaintenance() {
    const buildingId = building.id != null ? String(building.id) : "";
    const aptIds = new Set(
      apartments
        .map((a) => a.apiId ?? a.id)
        .filter((x) => x != null && x !== "")
        .map((x) => String(x))
    );
    if (!aptIds.size) return;

    // 1) API maintenance requests fallback
    if (
      typeof WalajnaAuth !== "undefined" &&
      WalajnaAuth.fetchWithAuth &&
      WalajnaAuth.API_BASE
    ) {
      try {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/maintenance`,
          { method: "GET" }
        );
        if (res.ok) {
          const rows = await res.json();
          (Array.isArray(rows) ? rows : []).forEach((r) => {
            const aid = r.apartment_id != null ? String(r.apartment_id) : "";
            const rid = r.building_id != null ? String(r.building_id) : "";
            const inThisBuilding = (buildingId && rid && rid === buildingId) || (aid && aptIds.has(aid));
            if (!inThisBuilding) return;
            mergedMaintenance.push({
              id: r.id ?? null,
              apartmentId: r.apartment_id ?? null,
              apartmentNumber: r.apartment_number ?? null,
              title: r.title || T("owner.archiveMaintenanceTitle"),
              description: r.description || "",
              amount: r.amount ?? r.cost ?? null,
              requestType: r.request_type || "maintenance",
              priority: r.priority || "",
              ownerReply: r.owner_reply || "",
              status: r.status || "",
              createdAt: r.created_at || null,
              source: "maintenance_api",
            });
          });
        }
      } catch {
        // silent fallback
      }
    }

    // 2) Costs fallback (many users store maintenance history as costs)
    const localCosts = readLocalArray("walajna_costs");
    localCosts.forEach((c) => {
      const aid = c.apartmentId != null ? String(c.apartmentId) : "";
      const cbid = c.buildingId != null ? String(c.buildingId) : "";
      const inThisBuilding = (buildingId && cbid && cbid === buildingId) || (aid && aptIds.has(aid));
      if (!inThisBuilding) return;
      mergedMaintenance.push({
        id: c.id ?? null,
        apartmentId: c.apartmentId ?? null,
        apartmentNumber: c.apartmentNumber ?? null,
        title: c.title || c.category || c.type || T("costs.type.maintenance"),
        description: c.description || c.notes || "",
        amount: c.amount ?? null,
        requestType: c.category || c.type || "maintenance",
        priority: "",
        ownerReply: "",
        status: "recorded",
        createdAt: c.date || c.createdAt || null,
        source: "costs_local",
      });
    });

    // de-duplicate carefully:
    // - if row has real id => dedupe by (source,id)
    // - if no id => include more fields so separate events are not collapsed
    const byKey = new Map();
    mergedMaintenance.forEach((row, index) => {
      const hasStableId = row.id != null && String(row.id).trim() !== "";
      const key = hasStableId
        ? [row.source || "archive", "id", String(row.id)].join("::")
        : [
            row.source || "archive",
            "noid",
            row.apartmentId ?? "",
            row.title ?? "",
            row.description ?? "",
            row.amount ?? "",
            row.requestType ?? "",
            row.priority ?? "",
            row.createdAt ?? "",
            index, // keep distinct no-id duplicates from being merged accidentally
          ].join("::");
      if (!byKey.has(key)) byKey.set(key, row);
    });
    mergedMaintenance = Array.from(byKey.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  if (titleEl) titleEl.textContent = building.name || T("building.notFound");
  if (subEl) {
    subEl.textContent = T("owner.archiveBuildingSub", {
      n: Number(building.apartmentCount || apartments.length || 0),
      city: building.city || T("common.dash"),
    });
  }

  if (restoreArchivedBuildingBtn) {
    restoreArchivedBuildingBtn.addEventListener("click", async () => {
      restoreArchivedBuildingBtn.disabled = true;
      await restoreArchivedBuildingFromSnapshot();
      restoreArchivedBuildingBtn.disabled = false;
    });
  }

  if (archiveIncomeHistoryBtn) {
    archiveIncomeHistoryBtn.addEventListener("click", () => {
      if (!archiveId) return;
      window.location.href = `archive_income_history.html?archiveId=${encodeURIComponent(archiveId)}`;
    });
  }

  function maintenanceForApartment(apartment) {
    const aptNum = normalizeApartmentNumber(apartment.number || apartment.apartment_number || "");
    const aptIds = new Set(
      [apartment.apiId, apartment.id]
        .filter((x) => x != null && x !== "")
        .map((x) => String(x))
    );
    return mergedMaintenance.filter((m) => {
      const mAptId = m.apartmentId != null ? String(m.apartmentId) : "";
      if (mAptId && aptIds.has(mAptId)) return true;
      const mNum = normalizeApartmentNumber(m.apartmentNumber || "");
      if (mNum && aptNum && mNum === aptNum) return true;
      const mDesc = normalizeDigits(m.description || "");
      if (aptNum && mDesc && (mDesc.includes(`شقة ${aptNum}`) || mDesc.includes(`apt ${aptNum}`))) {
        return true;
      }
      return false;
    });
  }

  function renderMaintenanceHistory(apartment) {
    const rows = maintenanceForApartment(apartment);
    if (!rows.length) {
      return `<div class="history-empty">${escapeHtml(T("owner.archiveNoMaintenance"))}</div>`;
    }
    const formatDate = (v) => {
      if (!v) return T("common.dash");
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      const loc =
        window.walajna_language && typeof window.walajna_language.localeForDates === "function"
          ? window.walajna_language.localeForDates()
          : "ar-SA-u-nu-latn";
      return d.toLocaleDateString(loc);
    };
    const detailItems = rows
      .map((r) => {
        const amountLabel =
          r.amount != null && r.amount !== "" && Number.isFinite(Number(r.amount))
            ? formatMoney(Number(r.amount))
            : T("common.notAvailable");
        const reason =
          r.description && String(r.description).trim()
            ? r.description
            : T("owner.archiveNoDescription");
        return `
          <article class="history-detail-card">
            <div class="history-detail-card__head">
              <h4>${escapeHtml(r.title || T("owner.archiveMaintenanceTitle"))}</h4>
              <span>${escapeHtml(r.status || T("common.dash"))}</span>
            </div>
            <div class="history-detail-grid">
              <div><strong>${escapeHtml(T("owner.archiveMaintenanceAmount"))}:</strong> ${escapeHtml(amountLabel)}</div>
              <div><strong>${escapeHtml(T("owner.archiveMaintenanceDate"))}:</strong> ${escapeHtml(formatDate(r.createdAt))}</div>
              <div><strong>${escapeHtml(T("owner.archiveMaintenanceType"))}:</strong> ${escapeHtml(r.requestType || T("common.dash"))}</div>
              <div><strong>${escapeHtml(T("owner.archiveMaintenancePriority"))}:</strong> ${escapeHtml(r.priority || T("common.dash"))}</div>
              <div class="full"><strong>${escapeHtml(T("owner.archiveMaintenanceReason"))}:</strong> ${escapeHtml(reason)}</div>
              ${
                r.ownerReply
                  ? `<div class="full"><strong>${escapeHtml(T("owner.archiveMaintenanceReply"))}:</strong> ${escapeHtml(r.ownerReply)}</div>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");
    return `<div class="history-detail-list">${detailItems}</div>`;
  }

  await loadFallbackMaintenance();

  grid.innerHTML = apartments
    .sort((a, b) => {
      const fa = Number(a.floorNumber || a.floor_number || 0);
      const fb = Number(b.floorNumber || b.floor_number || 0);
      if (fa !== fb) return fa - fb;
      return Number(a.number || a.apartment_number || 0) - Number(b.number || b.apartment_number || 0);
    })
    .map((apartment) => {
      const aptNumber = apartment.number || apartment.apartment_number || T("common.dash");
      const floorNumber = apartment.floorNumber || apartment.floor_number || T("common.dash");
      const aptApiId = apartment.apiId ?? apartment.id ?? "";
      return `
        <article class="apt-card" data-apt-number="${escapeHtml(aptNumber)}" data-apt-id="${escapeHtml(aptApiId)}">
          <div class="apt-card__head">
            <h3>${escapeHtml(T("building.aptLabel", { n: aptNumber }))}</h3>
            <span>${escapeHtml(T("building.floorTitle", { n: floorNumber }))}</span>
          </div>
          <div class="apt-card__actions">
            <button type="button" class="archive-action-btn" data-action="maintenance" data-apt-number="${escapeHtml(aptNumber)}">
              ${escapeHtml(T("owner.archiveMaintenanceHistoryBtn"))}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll('button[data-action="maintenance"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const aptNumber = btn.getAttribute("data-apt-number") || "";
      const aptCard = btn.closest(".apt-card");
      const aptId = aptCard?.getAttribute("data-apt-id") || "";
      const apartment = apartments.find((a) => String(a.apiId ?? a.id ?? "") === String(aptId))
        || apartments.find((a) => normalizeApartmentNumber(a.number || a.apartment_number || "") === normalizeApartmentNumber(aptNumber));
      if (!modalBody || !modalTitle) return;
      if (!apartment) return;

      modalTitle.textContent = T("owner.archiveMaintenanceTitleForApt", { n: aptNumber });
      modalBody.innerHTML = renderMaintenanceHistory(apartment);
      openModal();
    });
  });

  closeBtn?.addEventListener("click", closeModal);
  modal?.querySelector("[data-close-modal='true']")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
});
