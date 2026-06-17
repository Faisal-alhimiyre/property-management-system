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
      };
    }
    const ids = Array.isArray(raw.buildingIds)
      ? raw.buildingIds.map((id) => String(id)).filter(Boolean)
      : [];
    return {
      editActive: !!raw.editActive,
      buildingIds: new Set(ids),
      portfolioFilterDismissed: !!raw.portfolioFilterDismissed,
    };
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
    if (!hasFilter()) {
      if (existing) existing.remove();
      return null;
    }

    const state = loadState();
    const selected = state.buildingIds;
    const selectedBuildings = buildings.filter((b) => selected.has(String(b.id)));
    const total = buildings.length;
    const selectedCount = selected.size;
    const names = selectedBuildings.map((b) => b.name || "—").join("، ");

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
      dismissPortfolioFilter();
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
    isPortfolioFilterDismissed,
    isEditActive,
    getSelectedIds,
    hasFilter,
    hasOwnerSelection,
    addBuildingId,
    removeBuildingId,
    filterApartments,
    mountFilterBanner,
  };
})();
