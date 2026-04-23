function wlArchiveT(key, params) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key, params)
    : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await WalajnaAuth.hydrateSession();
  requireAuth();
  requireRole("owner");

  const grid = document.getElementById("archiveGrid");
  const empty = document.getElementById("archiveEmpty");
  if (!grid || !empty) return;

  const ARCHIVE_KEY = "walajna_buildings_archive";

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

  /** Drop unusable rows (no id or empty snapshot) and persist so ghost cards never reappear. */
  function pruneInvalidArchiveEntries(rows) {
    const raw = Array.isArray(rows) ? rows : [];
    const pruned = raw.filter((item) => {
      const aid = String(item?.archiveId ?? "").trim();
      if (!aid) return false;
      const building = item.building || {};
      const apts = Array.isArray(item.apartments) ? item.apartments : [];
      const name = String(building.name ?? "").trim();
      const count = Number(building.apartmentCount ?? apts.length ?? 0);
      const hasUnits =
        (Number.isFinite(count) && count > 0) || apts.length > 0;
      if (!name && !hasUnits) return false;
      return true;
    });
    if (pruned.length !== raw.length) {
      writeArchive(pruned);
    }
    return pruned;
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

  async function restoreArchivedBuildingItem(item) {
    if (!item) return;
    const aid = String(item.archiveId || "");
    if (!aid) return;
    const ok = confirm(wlArchiveT("owner.confirmRestoreArchiveBuilding"));
    if (!ok) return;

    const b = item.building || {};
    const apts = Array.isArray(item.apartments) ? item.apartments : [];
    const apartmentCount = Number(b.apartmentCount || apts.length || 0);
    const totalFloors = inferTotalFloors(b, apts);
    const apartmentsPerFloor = inferApartmentsPerFloor(apts, totalFloors, apartmentCount);

    const payload = {
      name: String(b.name || "").trim() || wlArchiveT("building.notFound"),
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
      alert(wlArchiveT("owner.archiveRestoreNetworkError"));
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
        alert(`${wlArchiveT("owner.archiveRestoreErrorPrefix")}${errorText || response.status}`);
        return;
      }
      const remaining = readArchive().filter((row) => String(row.archiveId) !== aid);
      writeArchive(remaining);
      alert(wlArchiveT("owner.archiveRestored"));
      window.location.href = "owner_home.html";
    } catch (e) {
      console.warn("archive restore failed", e);
      alert(wlArchiveT("owner.archiveRestoreNetworkError"));
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getBuildingSizeClass(apartmentCount) {
    if (apartmentCount > 16) return "size-large";
    if (apartmentCount > 8) return "size-medium";
    return "size-small";
  }

  function closeArchiveMenus() {
    grid.querySelectorAll(".archive-card-menu").forEach((menu) => {
      menu.classList.remove("is-open");
    });
  }

  function buildSquares(apartments) {
    const floors = new Map();
    (apartments || []).forEach((apartment) => {
      const floorNumber = Number(apartment.floorNumber || apartment.floor_number || 0);
      if (!floors.has(floorNumber)) floors.set(floorNumber, []);
      floors.get(floorNumber).push(apartment);
    });
    const sortedFloorNumbers = [...floors.keys()].sort((a, b) => b - a);
    return sortedFloorNumbers
      .map((floorNumber) => {
        const floorApartments = (floors.get(floorNumber) || []).sort((a, b) => {
          const aNum = Number(a.number || a.apartment_number || 0);
          const bNum = Number(b.number || b.apartment_number || 0);
          return aNum - bNum;
        });
        const isWide = floorApartments.length >= 6;
        const floorSquares = floorApartments
          .map(() => `<div class="apartment-square none" title="${escapeHtml(wlArchiveT("owner.archiveAptSquare"))}"></div>`)
          .join("");
        return `<div class="apartment-floor ${isWide ? "wide-floor" : ""}" data-floor="${floorNumber}">${floorSquares}</div>`;
      })
      .join("");
  }

  function renderArchive() {
    const rows = pruneInvalidArchiveEntries(readArchive());
    if (!rows.length) {
      empty.style.display = "block";
      grid.innerHTML = "";
      return;
    }
    empty.style.display = "none";

    grid.innerHTML = rows
      .map((item) => {
        const building = item.building || {};
        const apartments = Array.isArray(item.apartments) ? item.apartments : [];
        const count = Number(building.apartmentCount || apartments.length || 0);
        const sizeClass = getBuildingSizeClass(count);
        return `
          <article class="building-card ${sizeClass}" data-archive-id="${escapeHtml(item.archiveId || "")}">
            <div class="building-menu-wrap">
              <button
                type="button"
                class="archive-more-btn"
                data-archive-menu-btn="${escapeHtml(item.archiveId || "")}"
                aria-label="${escapeHtml(wlArchiveT("owner.buildingMenu"))}"
              >
                ⋮
              </button>
              <div class="archive-card-menu" data-archive-menu="${escapeHtml(item.archiveId || "")}">
                <button
                  type="button"
                  class="archive-menu-action restore"
                  data-archive-restore="${escapeHtml(item.archiveId || "")}"
                >
                  ${escapeHtml(wlArchiveT("owner.archiveRestoreBtn"))}
                </button>
                <button
                  type="button"
                  class="archive-menu-action delete"
                  data-archive-delete="${escapeHtml(item.archiveId || "")}"
                >
                  ${escapeHtml(wlArchiveT("owner.archiveDeleteBtn"))}
                </button>
              </div>
            </div>
            <div class="building-card__head">
              <h3 class="building-title">${escapeHtml(building.name || wlArchiveT("building.notFound"))}</h3>
              <span class="building-count">${escapeHtml(wlArchiveT("owner.aptCountLabel", { n: count }))}</span>
            </div>
            <div class="apartments-grid">${buildSquares(apartments)}</div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-archive-menu-btn]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const menuId = btn.getAttribute("data-archive-menu-btn");
        const menu = Array.from(grid.querySelectorAll("[data-archive-menu]")).find(
          (el) => el.getAttribute("data-archive-menu") === menuId
        );
        const isOpen = menu?.classList.contains("is-open");
        closeArchiveMenus();
        if (menu && !isOpen) menu.classList.add("is-open");
      });
    });

    grid.querySelectorAll("[data-archive-restore]").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeArchiveMenus();
        const rid = btn.getAttribute("data-archive-restore");
        if (!rid) return;
        const row = readArchive().find((r) => String(r.archiveId) === String(rid));
        if (!row) return;
        btn.disabled = true;
        await restoreArchivedBuildingItem(row);
        btn.disabled = false;
      });
    });

    grid.querySelectorAll("[data-archive-delete]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeArchiveMenus();
        const archiveId = btn.getAttribute("data-archive-delete");
        if (!archiveId) return;
        const ok = confirm(wlArchiveT("owner.confirmDeleteArchiveBuilding"));
        if (!ok) return;
        const afterDelete = readArchive().filter((row) => String(row.archiveId) !== String(archiveId));
        writeArchive(afterDelete);
        renderArchive();
      });
    });

    document.querySelectorAll(".building-card[data-archive-id]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest(".building-menu-wrap")) return;
        const archiveId = card.getAttribute("data-archive-id");
        if (!archiveId) return;
        window.location.href = `owner_archive_building.html?archiveId=${encodeURIComponent(archiveId)}`;
      });
    });
  }

  renderArchive();
  document.addEventListener("walajna:i18n-applied", renderArchive);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".building-menu-wrap")) {
      closeArchiveMenus();
    }
  });
});
