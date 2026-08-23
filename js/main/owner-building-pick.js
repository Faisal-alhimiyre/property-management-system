/**
 * Persistent owner building selection (تحرير) — survives navigation and logout/login.
 * Used on owner_home, portfolio_finance, and portfolio_costs.
 */
(function () {
  const STORAGE_KEY = "walajna_owner_building_pick";

  function t(key, params) {
    return window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(key, params)
      : key;
  }

  function resolveUserId() {
    try {
      if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser) {
        const u = WalajnaAuth.getCurrentUser();
        if (u && u.id != null) return String(u.id);
      }
    } catch (e) {
      /* ignore */
    }
    try {
      const raw =
        localStorage.getItem("walajna_current_user") ||
        sessionStorage.getItem("walajna_current_user");
      if (raw) {
        const u = JSON.parse(raw);
        if (u && u.id != null) return String(u.id);
      }
    } catch (e2) {
      /* ignore */
    }
    return "";
  }

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeRaw(payload) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      /* ignore quota */
    }
  }

  function loadState() {
    const userId = resolveUserId();
    const raw = readRaw();
    if (!raw || String(raw.userId || "") !== userId) {
      return {
        editActive: false,
        buildingIds: new Set(),
        portfolioFilterDismissed: false,
        portfolioCheckedIds: [],
        portfolioCatalogSnapshot: [],
      };
    }
    const ids = Array.isArray(raw.buildingIds)
      ? raw.buildingIds.map((id) => String(id)).filter(Boolean)
      : [];
    const portfolioCheckedIds = Array.isArray(raw.portfolioCheckedIds)
      ? raw.portfolioCheckedIds.map((id) => String(id)).filter(Boolean)
      : [];
    const portfolioCatalogSnapshot = Array.isArray(raw.portfolioCatalogSnapshot)
      ? raw.portfolioCatalogSnapshot.map((id) => String(id)).filter(Boolean)
      : [];
    return {
      editActive: !!raw.editActive,
      buildingIds: new Set(ids),
      portfolioFilterDismissed: !!raw.portfolioFilterDismissed,
      portfolioCheckedIds,
      portfolioCatalogSnapshot,
    };
  }

  function catalogBuildingIds(catalog) {
    return (Array.isArray(catalog) ? catalog : [])
      .map((b) => String(b.id ?? "").trim())
      .filter(Boolean);
  }

  /** Stored checkbox ids (empty = default: all totals, no boxes checked). */
  function getPortfolioCheckedIdsStored(catalog) {
    const all = catalogBuildingIds(catalog);
    const state = loadState();
    const ids = Array.isArray(state.portfolioCheckedIds) ? state.portfolioCheckedIds : [];
    return ids.filter((id) => all.includes(id));
  }

  function isPortfolioTableFilterActive(catalog) {
    return getPortfolioCheckedIdsStored(catalog).length > 0;
  }

  /** Checkbox UI — default shows every box unchecked. */
  function isPortfolioBuildingChecked(buildingId, catalog) {
    if (!isPortfolioTableFilterActive(catalog)) {
      return false;
    }
    return getPortfolioCheckedIdsStored(catalog).includes(String(buildingId || "").trim());
  }

  /** Totals — default includes all buildings; with a filter, checked buildings only. */
  function isPortfolioBuildingInTotals(buildingId, catalog) {
    const id = String(buildingId || "").trim();
    const all = catalogBuildingIds(catalog);
    if (!id || !all.includes(id)) return false;
    if (!isPortfolioTableFilterActive(catalog)) {
      return true;
    }
    return getPortfolioCheckedIdsStored(catalog).includes(id);
  }

  function setPortfolioBuildingChecked(buildingId, checked, catalog) {
    const userId = resolveUserId();
    if (!userId) return;

    const all = catalogBuildingIds(catalog);
    const id = String(buildingId || "").trim();
    if (!id || !all.includes(id)) return;

    const state = loadState();
    let ids = getPortfolioCheckedIdsStored(catalog);

    if (!isPortfolioTableFilterActive(catalog) && checked) {
      ids = [id];
    } else if (checked) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      ids = ids.filter((x) => x !== id);
    }

    writeRaw({
      v: 1,
      userId,
      editActive: state.editActive,
      buildingIds: [...state.buildingIds],
      portfolioFilterDismissed: state.portfolioFilterDismissed,
      portfolioCheckedIds: ids,
      portfolioCatalogSnapshot: all,
    });
  }

  function hasPortfolioTableSelection(catalog) {
    return isPortfolioTableFilterActive(catalog);
  }

  /** @deprecated use isPortfolioBuildingInTotals */
  function getPortfolioCheckedIds(catalog) {
    const all = catalogBuildingIds(catalog);
    if (!isPortfolioTableFilterActive(catalog)) {
      return new Set(all);
    }
    return new Set(getPortfolioCheckedIdsStored(catalog));
  }

  function save(editActive, buildingIds) {
    const userId = resolveUserId();
    if (!userId) return;
    const ids =
      buildingIds instanceof Set
        ? [...buildingIds].map((id) => String(id)).filter(Boolean)
        : (Array.isArray(buildingIds) ? buildingIds : []).map((id) => String(id)).filter(Boolean);
    writeRaw({
      v: 1,
      userId,
      editActive: !!editActive,
      buildingIds: ids,
      portfolioFilterDismissed: false,
      portfolioCheckedIds: readRaw()?.portfolioCheckedIds ?? [],
      portfolioCatalogSnapshot: readRaw()?.portfolioCatalogSnapshot ?? [],
    });
  }

  /** Full reset — owner home «الغاء التحرير» only. */
  function clear() {
    const userId = resolveUserId();
    if (!userId) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
      return;
    }
    writeRaw({
      v: 1,
      userId,
      editActive: false,
      buildingIds: [],
      portfolioFilterDismissed: false,
      portfolioCheckedIds: [],
      portfolioCatalogSnapshot: [],
    });
  }

  /** Finance/costs table checkboxes — clear selection and show all buildings in totals. */
  function clearPortfolioTableFilter() {
    const userId = resolveUserId();
    const state = loadState();
    if (!userId) return;
    writeRaw({
      v: 1,
      userId,
      editActive: state.editActive,
      buildingIds: [...state.buildingIds],
      portfolioFilterDismissed: state.portfolioFilterDismissed,
      portfolioCheckedIds: [],
      portfolioCatalogSnapshot: state.portfolioCatalogSnapshot,
    });
  }

  /** Finance/costs pages only — show all buildings; keep عمائري selection. */
  function dismissPortfolioFilter() {
    const userId = resolveUserId();
    const state = loadState();
    if (!userId) return;
    writeRaw({
      v: 1,
      userId,
      editActive: state.editActive,
      buildingIds: [...state.buildingIds],
      portfolioFilterDismissed: true,
      portfolioCheckedIds: state.portfolioCheckedIds,
      portfolioCatalogSnapshot: state.portfolioCatalogSnapshot,
    });
  }

  function isPortfolioFilterDismissed() {
    return !!loadState().portfolioFilterDismissed;
  }

  function isEditActive() {
    return loadState().editActive;
  }

  function getSelectedIds() {
    return new Set(loadState().buildingIds);
  }

  function hasFilter() {
    const { editActive, buildingIds, portfolioFilterDismissed } = loadState();
    return editActive && buildingIds.size > 0 && !portfolioFilterDismissed;
  }

  /** Owner home legend counts — uses selection even when portfolio filter dismissed. */
  function hasOwnerSelection() {
    const { editActive, buildingIds } = loadState();
    return editActive && buildingIds.size > 0;
  }

  function addBuildingId(id) {
    const state = loadState();
    if (!state.editActive) return;
    const next = new Set(state.buildingIds);
    const bid = String(id || "").trim();
    if (!bid) return;
    next.add(bid);
    save(true, next);
  }

  function removeBuildingId(id) {
    const state = loadState();
    const next = new Set(state.buildingIds);
    next.delete(String(id || "").trim());
    save(state.editActive, next);
  }

  function filterApartments(apartmentList) {
    if (!hasFilter()) return apartmentList;
    const ids = getSelectedIds();
    return (apartmentList || []).filter((apt) =>
      ids.has(String(apt.buildingId ?? apt.building_id ?? ""))
    );
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function portfolioBuildingCheckboxHtml(buildingId, checked) {
    const bid = escapeHtml(String(buildingId ?? ""));
    const aria = escapeHtml(t("owner.buildingsSelectForListAria"));
    const mark = checked ? " checked" : "";
    return `
      <label class="portfolio-building-pick" title="${aria}">
        <input
          type="checkbox"
          class="portfolio-building-pick__input"
          data-building-id="${bid}"
          aria-label="${aria}"
          ${mark}
        />
      </label>
    `;
  }

  /**
   * @param {object} options
   * @param {HTMLElement} options.anchor — insert banner after this node
   * @param {{id:string,name:string}[]} options.buildings — all owner buildings
   * @param {() => void} [options.onChange] — re-filter + re-render page data
   */
  function mountFilterBanner(options) {
    const anchor = options && options.anchor;
    const buildings = Array.isArray(options?.buildings) ? options.buildings : [];
    const onChange = typeof options?.onChange === "function" ? options.onChange : null;

    const existing = document.getElementById("ownerPortfolioPickBanner");
    const homeFilter = hasFilter();
    const tableFilter = isPortfolioTableFilterActive(buildings);

    if (!homeFilter && !tableFilter) {
      if (existing) existing.remove();
      return null;
    }

    const total = buildings.length;
    let selectedCount = 0;
    let names = "";

    if (homeFilter) {
      const state = loadState();
      const selected = state.buildingIds;
      const selectedBuildings = buildings.filter((b) => selected.has(String(b.id)));
      selectedCount = selected.size;
      names = selectedBuildings.map((b) => b.name || "—").join("، ");
    } else {
      const checkedIds = getPortfolioCheckedIdsStored(buildings);
      const selectedBuildings = buildings.filter((b) =>
        checkedIds.includes(String(b.id))
      );
      selectedCount = checkedIds.length;
      names = selectedBuildings.map((b) => b.name || "—").join("، ");
    }

    let banner = existing;
    if (!banner) {
      banner = document.createElement("section");
      banner.id = "ownerPortfolioPickBanner";
      banner.className = "owner-portfolio-pick-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(banner, anchor.nextSibling);
      } else {
        document.body.prepend(banner);
      }
    }

    banner.innerHTML = `
      <div class="owner-portfolio-pick-banner__inner">
        <div class="owner-portfolio-pick-banner__text">
          <strong class="owner-portfolio-pick-banner__title">${escapeHtml(
            t("owner.portfolioPickBannerTitle")
          )}</strong>
          <span class="owner-portfolio-pick-banner__meta">${escapeHtml(
            t("owner.portfolioPickBannerMeta", {
              selected: selectedCount,
              total,
            })
          )} — ${escapeHtml(names)}</span>
        </div>
        <button type="button" class="owner-portfolio-pick-banner__cancel" id="ownerPortfolioPickCancelBtn">${escapeHtml(
          t("owner.portfolioPickClearFilter")
        )}</button>
      </div>
    `;

    const cancelBtn = banner.querySelector("#ownerPortfolioPickCancelBtn");
    cancelBtn?.addEventListener("click", () => {
      if (homeFilter) {
        dismissPortfolioFilter();
      } else {
        clearPortfolioTableFilter();
      }
      if (onChange) onChange();
      else window.location.reload();
    });

    return banner;
  }

  window.WalajnaOwnerBuildingPick = {
    loadState,
    save,
    clear,
    dismissPortfolioFilter,
    clearPortfolioTableFilter,
    isPortfolioFilterDismissed,
    isEditActive,
    getSelectedIds,
    hasFilter,
    hasOwnerSelection,
    addBuildingId,
    removeBuildingId,
    filterApartments,
    getPortfolioCheckedIds,
    getPortfolioCheckedIdsStored,
    isPortfolioTableFilterActive,
    isPortfolioBuildingChecked,
    isPortfolioBuildingInTotals,
    setPortfolioBuildingChecked,
    hasPortfolioTableSelection,
    portfolioBuildingCheckboxHtml,
    mountFilterBanner,
  };
})();
