document.addEventListener("DOMContentLoaded", async () => {
  /** @type {Array<object>|null} */
  let serverTenantHistory = null;
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const content = document.getElementById("content");
  const tenantsBtn = document.getElementById("tenantsBtn");
  const maintenanceBtn = document.getElementById("maintenanceBtn");
  const sectionTitle = document.getElementById("sectionTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("apartmentId");

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
    } catch (e) {
      console.warn("[apartment-history] apartments cache failed", e);
    }
  }

  function listApartmentsForHistory() {
    if (typeof getApartments === "function") return getApartments();
    return getLocalArray("walajna_apartments");
  }

  function formatDate(dateString) {
    if (!dateString) return T("common.dash");
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB"
          : "ar-SA";
    return date.toLocaleDateString(loc);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getApartmentNumber(apartment) {
    return apartment?.number || apartment?.apartmentNumber || T("common.dash");
  }

  function getTenantName(historyItem) {
    return (
      historyItem?.tenantInfo?.fullName ||
      historyItem?.tenantInfo?.name ||
      T("common.dash")
    );
  }

  function getHistoryContractId(historyItem) {
    return (
      historyItem?.contractId ||
      historyItem?.contract?.id ||
      historyItem?.currentContractId ||
      null
    );
  }

  const apartments = listApartmentsForHistory();
  const costs = getLocalArray("walajna_costs");

  const apartment = apartments.find((a) => String(a.id) === String(apartmentId));

  function mapApartmentHistoryApiRow(row) {
    const old = row.old_data || {};
    const c = old.contract || {};
    const cid =
      old.currentContractId != null && old.currentContractId !== ""
        ? old.currentContractId
        : c.id != null
          ? c.id
          : null;
    return {
      historyId: String(row.id),
      apartmentId: String(apartmentId),
      buildingName:
        old.buildingName ||
        old.building_name ||
        apartment?.buildingName ||
        apartment?.building_name ||
        "",
      apartmentNumber:
        old.apartmentNumber ||
        old.apartment_number ||
        apartment?.number ||
        apartment?.apartmentNumber ||
        "",
      tenantInfo: old.tenantInfo || old.tenant_info || {},
      tenantNationalId: old.tenantNationalId ?? old.tenant_national_id ?? null,
      tenantUserId: old.tenantUserId ?? old.tenant_user_id ?? null,
      contract: {
        id: cid,
        startDate: c.startDate || c.start_date,
        endDate: c.endDate || c.end_date,
        rentAmount:
          old.rent != null && old.rent !== ""
            ? Number(old.rent) * 12
            : undefined,
      },
      contractId: cid,
      currentContractId: cid,
      archivedAt: row.changed_at,
      archiveReason: row.change_type || "tenant_vacated",
    };
  }

  function mergeTenantHistories() {
    const local = Array.isArray(apartment?.tenantHistory)
      ? apartment.tenantHistory
      : [];
    const server = Array.isArray(serverTenantHistory) ? serverTenantHistory : [];
    const byId = new Map();
    for (const h of server) {
      if (h?.historyId) byId.set(String(h.historyId), h);
    }
    for (const h of local) {
      if (h?.historyId && !byId.has(String(h.historyId))) {
        byId.set(String(h.historyId), h);
      }
    }
    return [...byId.values()].sort((a, b) => {
      const aTime = new Date(a.archivedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.archivedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  async function loadServerTenantHistory() {
    if (!apartment) return;
    const apiAid =
      apartment.apiId != null ? Number(apartment.apiId) : Number(apartmentId);
    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.getCurrentUser?.() ||
      !WalajnaAuth.fetchWithAuth ||
      !WalajnaAuth.API_BASE ||
      !Number.isFinite(apiAid)
    ) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments/${apiAid}/tenant-history`
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      serverTenantHistory = rows.map(mapApartmentHistoryApiRow);
    } catch (e) {
      console.warn("[apartment-history] tenant-history API", e);
    }
  }

  function renderNotFound() {
    if (sectionTitle) {
      sectionTitle.textContent = T("history.aptNotFoundTitle");
    }
    if (content) {
      content.innerHTML = `
        <div class="card empty-card">
          <div class="card-header">
            <h3>${escapeHtml(T("history.aptMissingH3"))}</h3>
          </div>
          <div class="card-body">
            <div class="info-box">
              <span class="label">${escapeHtml(T("common.note"))}</span>
              <strong>${escapeHtml(T("history.badLink"))}</strong>
            </div>
          </div>
        </div>
      `;
    }
  }

  if (!apartment) {
    renderNotFound();
    return;
  }

  await loadServerTenantHistory();

  const buildingName = apartment.buildingName || T("common.dash");
  const aptNumber = getApartmentNumber(apartment);

  function setSubtitle() {
    if (pageSubtitle) {
      pageSubtitle.textContent = T("history.pageSubApt", { n: aptNumber, b: buildingName });
    }
  }

  setSubtitle();

  function renderTenants() {
    if (tenantsBtn) tenantsBtn.classList.add("active");
    if (maintenanceBtn) maintenanceBtn.classList.remove("active");

    if (sectionTitle) {
      sectionTitle.textContent = T("history.sectionTenants");
    }

    const history = mergeTenantHistories();

    if (!history.length) {
      content.innerHTML = `
        <div class="card empty-card">
          <div class="card-header">
            <h3>${escapeHtml(T("history.noPastTenants"))}</h3>
          </div>
          <div class="card-body">
            <div class="info-box">
              <span class="label">${escapeHtml(T("common.status"))}</span>
              <strong>${escapeHtml(T("history.noHistoryYet"))}</strong>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const dash = T("common.dash");

    content.innerHTML = history
      .map((h) => {
        const tenantName = getTenantName(h);
        const nationalId = h.tenantNationalId || dash;
        const startDate = formatDate(h.contract?.startDate || h.startDate);
        const endDate = formatDate(h.contract?.endDate || h.endDate);
        const contractId = getHistoryContractId(h);

        return `
          <div class="card" data-history-id="${escapeHtml(h.historyId || "")}">
            <div class="card-header">
              <h3>${escapeHtml(tenantName)}</h3>
            </div>

            <div class="card-body">
              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.id"))}</span>
                <strong>${escapeHtml(nationalId)}</strong>
              </div>

              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.start"))}</span>
                <strong>${escapeHtml(startDate)}</strong>
              </div>

              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.end"))}</span>
                <strong>${escapeHtml(endDate)}</strong>
              </div>

              ${
                contractId
                  ? `
                    <div class="info-box">
                      <span class="label">${escapeHtml(T("history.label.contractId"))}</span>
                      <strong>${escapeHtml(contractId)}</strong>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderMaintenance() {
    if (maintenanceBtn) maintenanceBtn.classList.add("active");
    if (tenantsBtn) tenantsBtn.classList.remove("active");

    if (sectionTitle) {
      sectionTitle.textContent = T("history.sectionMaintenance");
    }

    const apartmentCosts = costs
      .filter((c) => String(c.apartmentId) === String(apartmentId))
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.date || a.createdAt || 0).getTime();
        const bTime = new Date(b.date || b.createdAt || 0).getTime();
        return bTime - aTime;
      });

    if (!apartmentCosts.length) {
      content.innerHTML = `
        <div class="card empty-card">
          <div class="card-header">
            <h3>${escapeHtml(T("history.noMaintenance"))}</h3>
          </div>
          <div class="card-body">
            <div class="info-box">
              <span class="label">${escapeHtml(T("common.status"))}</span>
              <strong>${escapeHtml(T("history.noCosts"))}</strong>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const dash = T("common.dash");

    content.innerHTML = apartmentCosts
      .map((cost) => {
        const title =
          cost.title ||
          cost.category ||
          cost.type ||
          T("costs.type.maintenance");
        const description = cost.description || cost.notes || dash;
        const createdAt = formatDate(cost.date || cost.createdAt);
        const tenantName = cost.tenantName || dash;
        const tenantNationalId = cost.tenantNationalId || dash;
        const contractId = cost.contractId || dash;

        return `
          <div class="card maintenance-card">
            <div class="card-header">
              <h3>${escapeHtml(title)}</h3>
            </div>

            <div class="card-body">
              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.desc"))}</span>
                <strong>${escapeHtml(description)}</strong>
              </div>

              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.recorded"))}</span>
                <strong>${escapeHtml(createdAt)}</strong>
              </div>

              ${
                tenantName !== dash
                  ? `
                    <div class="info-box">
                      <span class="label">${escapeHtml(T("history.label.linkedTenant"))}</span>
                      <strong>${escapeHtml(tenantName)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                tenantNationalId !== dash
                  ? `
                    <div class="info-box">
                      <span class="label">${escapeHtml(T("history.label.id"))}</span>
                      <strong>${escapeHtml(tenantNationalId)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                contractId !== dash
                  ? `
                    <div class="info-box">
                      <span class="label">${escapeHtml(T("history.label.contractId"))}</span>
                      <strong>${escapeHtml(contractId)}</strong>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function refreshView() {
    if (maintenanceBtn && maintenanceBtn.classList.contains("active")) {
      renderMaintenance();
    } else {
      renderTenants();
    }
  }

  if (tenantsBtn) {
    tenantsBtn.addEventListener("click", renderTenants);
  }

  if (maintenanceBtn) {
    maintenanceBtn.addEventListener("click", renderMaintenance);
  }

  document.addEventListener("walajna:i18n-applied", () => {
    setSubtitle();
    refreshView();
  });

  if (content) {
    content.addEventListener("click", (e) => {
      const card = e.target.closest("[data-history-id]");
      if (!card) return;

      const historyId = card.dataset.historyId;
      if (!historyId) return;

      window.location.href =
        `apartment_history_details.html?apartmentId=${encodeURIComponent(apartmentId)}` +
        `&historyId=${encodeURIComponent(historyId)}`;
    });
  }

  renderTenants();
});
