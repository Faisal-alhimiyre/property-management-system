document.addEventListener("DOMContentLoaded", async () => {
  /** @type {Array<object>|null} */
  let serverTenantHistory = null;
  /** @type {Array<object>|null} */
  let serverMaintenanceItems = null;
  /** @type {Array<object>} Raw tenant-history API rows (for archived costs). */
  let tenantHistoryRawRows = [];
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
          ? "en-GB-u-nu-latn"
          : "ar-SA-u-nu-latn";
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

  const apartment = apartments.find((a) => String(a.id) === String(apartmentId));

  function getApiApartmentId() {
    if (!apartment) {
      const n = Number(apartmentId);
      return Number.isFinite(n) ? n : null;
    }
    const n =
      apartment.apiId != null
        ? Number(apartment.apiId)
        : Number(apartment.id);
    return Number.isFinite(n) ? n : null;
  }

  function apartmentIdAliases() {
    const apiAid = getApiApartmentId();
    const set = new Set([String(apartmentId)]);
    if (apiAid != null) set.add(String(apiAid));
    if (apartment?.id != null) set.add(String(apartment.id));
    return set;
  }

  function requestTypeLabel(typeId) {
    const id = String(typeId || "maintenance").toLowerCase();
    const map = {
      maintenance: T("requests.type.maintenance"),
      complaint: T("requests.type.complaint"),
      suggestion: T("requests.type.suggestion"),
      request: T("requests.type.request"),
      cost: T("costs.type.maintenance"),
    };
    return map[id] || map.maintenance;
  }

  function costTypeLabel(typeId) {
    const id = String(typeId || "maintenance").toLowerCase().trim();
    const k = `costs.type.${id}`;
    const v = T(k);
    return v === k ? T("costs.type.other") : v;
  }

  function maintenanceStatusLabel(status) {
    const s = String(status || "").toLowerCase().trim();
    if (!s) return T("common.dash");
    const costKey = `costs.st.${s}`;
    const costVal = T(costKey);
    if (costVal !== costKey) return costVal;
    if (s === "resolved") return T("histDetail.status.resolved");
    if (s === "closed") return T("histDetail.status.closed");
    if (s === "in_progress") return T("histDetail.status.progress");
    if (s === "pending" || s === "open" || s === "new") return T("histDetail.status.new");
    return s.replace(/_/g, " ");
  }

  function maintenanceCardTitle(rawTitle, typeId, isCostRow) {
    const tid = String(typeId || "maintenance").toLowerCase().trim();
    if (isCostRow) return costTypeLabel(tid);
    const raw = String(rawTitle || "").trim();
    if (!raw || raw.toLowerCase() === tid) return requestTypeLabel(tid);
    const asCost = costTypeLabel(raw.toLowerCase());
    if (asCost !== T("costs.type.other")) return asCost;
    return raw;
  }

  function itemTypeLabel(item) {
    if (item.source === "maintenance_api") {
      return requestTypeLabel(item.requestType);
    }
    return costTypeLabel(item.requestType || item.costType || "maintenance");
  }

  function mapMaintenanceApiRow(row) {
    const rt = String(row.request_type || "maintenance").toLowerCase();
    return {
      source: "maintenance_api",
      id: row.id ?? null,
      title: maintenanceCardTitle(row.title, rt, false),
      description: row.description || "",
      ownerReply: row.owner_reply || "",
      date: row.created_at || row.updated_at || null,
      status: row.status || "",
      requestType: rt,
      priority: row.priority || "",
      contractId: row.contract_id != null ? String(row.contract_id) : null,
      tenantNationalId:
        row.tenant_national_id != null ? String(row.tenant_national_id) : null,
      tenantName: "",
    };
  }

  function mapCostApiRow(row) {
    const expenseRaw = row.expense_date;
    const expenseDate =
      typeof expenseRaw === "string"
        ? expenseRaw.slice(0, 10)
        : expenseRaw && typeof expenseRaw === "object" && expenseRaw.toISOString
          ? expenseRaw.toISOString().slice(0, 10)
          : String(expenseRaw || "").slice(0, 10);
    let createdAt = "";
    if (row.created_at) {
      const c = row.created_at;
      createdAt =
        typeof c === "string" ? c.slice(0, 10) : new Date(c).toISOString().slice(0, 10);
    }
    const costType = String(row.cost_type || "maintenance").toLowerCase();
    return {
      source: "costs_api",
      id: row.id ?? null,
      title: maintenanceCardTitle(row.title, costType, true),
      description:
        row.description ||
        row.notes ||
        (row.title && String(row.title).toLowerCase() !== costType ? row.title : "") ||
        "",
      ownerReply: "",
      date: expenseDate || createdAt || null,
      status: "recorded",
      requestType: costType,
      costType,
      priority: "",
      contractId: row.contract_id != null ? String(row.contract_id) : null,
      tenantNationalId: null,
      tenantName: "",
      amount: row.amount ?? null,
    };
  }

  function mapArchivedCostSnapshot(c, contractIdFromHistory) {
    const costType = String(c.costType || c.cost_type || "maintenance").toLowerCase();
    const expenseDate = c.expenseDate || c.expense_date || null;
    let createdAt = c.createdAt || c.created_at || "";
    if (createdAt && typeof createdAt === "string" && createdAt.length > 10) {
      createdAt = createdAt.slice(0, 10);
    }
    return {
      source: "costs_archived",
      id: c.id ?? `arch-${contractIdFromHistory}-${costType}-${expenseDate}`,
      title: maintenanceCardTitle(null, costType, true),
      description: c.notes || "",
      ownerReply: "",
      date: expenseDate || createdAt || null,
      status: c.status || "recorded",
      requestType: costType,
      costType,
      priority: "",
      contractId:
        c.contractId != null
          ? String(c.contractId)
          : c.contract_id != null
            ? String(c.contract_id)
            : contractIdFromHistory != null
              ? String(contractIdFromHistory)
              : null,
      tenantNationalId: null,
      tenantName: "",
      amount: c.amount ?? null,
    };
  }

  function collectArchivedCostsFromTenantHistory() {
    const items = [];
    for (const row of tenantHistoryRawRows) {
      const od = row.old_data || {};
      const costs = od.costs;
      if (!Array.isArray(costs) || !costs.length) continue;
      const cid =
        od.currentContractId != null && od.currentContractId !== ""
          ? od.currentContractId
          : od.contract?.id ?? null;
      costs.forEach((c) => {
        items.push(mapArchivedCostSnapshot(c, cid));
      });
    }
    return dedupeMaintenanceItems(items);
  }

  function mapLocalCostRow(cost) {
    const costType = String(cost.category || cost.type || "maintenance").toLowerCase();
    return {
      source: "costs_local",
      id: cost.id ?? null,
      title: maintenanceCardTitle(cost.title, costType, true),
      description: cost.description || cost.notes || "",
      ownerReply: "",
      date: cost.date || cost.createdAt || null,
      status: cost.status || "recorded",
      requestType: costType,
      costType,
      priority: "",
      contractId: cost.contractId != null ? String(cost.contractId) : null,
      tenantNationalId:
        cost.tenantNationalId != null ? String(cost.tenantNationalId) : null,
      tenantName: cost.tenantName || "",
      amount: cost.amount ?? null,
    };
  }

  function dedupeMaintenanceItems(items) {
    const byKey = new Map();
    (items || []).forEach((row, index) => {
      const hasStableId = row.id != null && String(row.id).trim() !== "";
      const key = hasStableId
        ? [row.source || "row", String(row.id)].join("::")
        : [
            row.source || "row",
            "noid",
            row.title ?? "",
            row.description ?? "",
            row.date ?? "",
            index,
          ].join("::");
      if (!byKey.has(key)) byKey.set(key, row);
    });
    return [...byKey.values()].sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime();
      const bTime = new Date(b.date || 0).getTime();
      return bTime - aTime;
    });
  }

  function getMaintenanceItemsForView() {
    const merged = [];
    if (Array.isArray(serverMaintenanceItems)) {
      merged.push(...serverMaintenanceItems);
    } else {
      apartmentIdAliases().forEach((aid) => {
        getLocalArray("walajna_costs")
          .filter((c) => String(c.apartmentId ?? "") === aid)
          .forEach((c) => merged.push(mapLocalCostRow(c)));
      });
    }
    return dedupeMaintenanceItems(merged);
  }

  async function loadServerMaintenanceHistory() {
    if (!apartment) return;
    const apiAid = getApiApartmentId();
    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.getCurrentUser?.() ||
      !WalajnaAuth.fetchWithAuth ||
      !WalajnaAuth.API_BASE ||
      apiAid == null
    ) {
      return;
    }

    const items = [];

    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/maintenance?apartment_id=${encodeURIComponent(apiAid)}`
      );
      if (res.ok) {
        const rows = await res.json();
        (Array.isArray(rows) ? rows : []).forEach((r) => {
          items.push(mapMaintenanceApiRow(r));
        });
      }
    } catch (e) {
      console.warn("[apartment-history] maintenance API", e);
    }

    collectArchivedCostsFromTenantHistory().forEach((c) => items.push(c));

    apartmentIdAliases().forEach((aid) => {
      getLocalArray("walajna_costs")
        .filter((c) => String(c.apartmentId ?? "") === aid)
        .forEach((c) => items.push(mapLocalCostRow(c)));
    });

    serverMaintenanceItems = dedupeMaintenanceItems(items);
  }

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
      tenantHistoryRawRows = rows;
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
  await loadServerMaintenanceHistory();

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

            <div class="card-body card-body--tenant">
              <div class="card-row card-row--${contractId ? "4" : "3"}">
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

    const apartmentCosts = getMaintenanceItemsForView();

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
        const title = cost.title || costTypeLabel(cost.costType || cost.requestType);
        const description = cost.description || dash;
        const createdAt = formatDate(cost.date);
        const tenantName = cost.tenantName || dash;
        const tenantNationalId = cost.tenantNationalId || dash;
        const contractId = cost.contractId || dash;
        const statusLabel = maintenanceStatusLabel(cost.status);
        const typeLabel = itemTypeLabel(cost);
        const ownerReply = cost.ownerReply || "";

        return `
          <div class="card maintenance-card">
            <div class="card-header">
              <h3>${escapeHtml(title)}</h3>
            </div>

            <div class="card-body card-body--maintenance">
              <div class="info-box">
                <span class="label">${escapeHtml(T("owner.archiveMaintenanceType"))}</span>
                <strong>${escapeHtml(typeLabel)}</strong>
              </div>
              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.desc"))}</span>
                <strong>${escapeHtml(description)}</strong>
              </div>
              <div class="info-box">
                <span class="label">${escapeHtml(T("history.label.recorded"))}</span>
                <strong>${escapeHtml(createdAt)}</strong>
              </div>
              <div class="info-box">
                <span class="label">${escapeHtml(T("common.status"))}</span>
                <strong>${escapeHtml(statusLabel)}</strong>
              </div>
              ${
                ownerReply
                  ? `
              <div class="info-box">
                <span class="label">${escapeHtml(T("owner.archiveMaintenanceReply"))}</span>
                <strong>${escapeHtml(ownerReply)}</strong>
              </div>
              `
                  : ""
              }
              ${
                cost.amount != null && cost.amount !== ""
                  ? `
              <div class="info-box">
                <span class="label">${escapeHtml(T("owner.archiveMaintenanceAmount"))}</span>
                <strong>${escapeHtml(String(cost.amount))}</strong>
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
