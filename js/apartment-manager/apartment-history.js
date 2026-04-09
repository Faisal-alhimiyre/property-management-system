document.addEventListener("DOMContentLoaded", () => {
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

  function formatDate(dateString) {
    if (!dateString) return T("common.dash");
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const loc =
      window.walajna_language && window.walajna_language.get() === "en"
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

  const apartments = getLocalArray("walajna_apartments");
  const costs = getLocalArray("walajna_costs");

  const apartment = apartments.find((a) => String(a.id) === String(apartmentId));

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

    const history = Array.isArray(apartment.tenantHistory)
      ? apartment.tenantHistory
          .slice()
          .sort((a, b) => {
            const aTime = new Date(a.archivedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.archivedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          })
      : [];

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
