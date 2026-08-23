/**
 * Owner portfolio: expenses (walajna_costs) grouped by building with accordion detail,
 * same interaction pattern as portfolio_finance.html.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  function setPortfolioCostsLoading(isLoading) {
    document.body.classList.toggle("portfolio-costs--loading", !!isLoading);
    const loadingEl = document.getElementById("portfolioCostsLoading");
    const container = document.getElementById("costsTableContainer");
    const summary = document.getElementById("costsSummary");
    if (loadingEl) {
      loadingEl.hidden = !isLoading;
      if (!isLoading) loadingEl.remove();
    }
    if (container) container.setAttribute("aria-busy", isLoading ? "true" : "false");
    if (summary) summary.setAttribute("aria-busy", isLoading ? "true" : "false");
    if (isLoading) {
      document.querySelectorAll("#costsSummary .sum-value, #costsCount").forEach((el) => {
        el.classList.add("is-pending");
        el.textContent = "—";
      });
    }
  }

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof requireAuth === "function" && !requireAuth()) {
    setPortfolioCostsLoading(false);
    return;
  }
  if (typeof requireRole === "function" && !requireRole("owner")) {
    setPortfolioCostsLoading(false);
    return;
  }

  const COSTS_KEY = "walajna_costs";
  const MAIN_COLS = 6;
  const normalizeId = (value) => String(value || "").trim();

  let allBuildingApartments = [];
  let allBuildingApartmentsFull = [];
  let ownerBuildingsCatalog = [];
  /** Costs from GET /api/owner/costs (canonical); filtered client-side by building pick. */
  let portfolioCostsCacheFull = [];
  let portfolioCostsCache = [];
  let costsFromApi = false;
  let portfolioCostsLoadOk = true;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJsonList(url) {
    if (typeof WalajnaAuth === "undefined") return { ok: false, data: [] };
    if (WalajnaAuth.fetchJsonWithAuthRetry) {
      const result = await WalajnaAuth.fetchJsonWithAuthRetry(
        url,
        { method: "GET" },
        { retries: 4, delayMs: 400 }
      );
      if (!result.ok || !Array.isArray(result.data)) {
        return { ok: false, data: [] };
      }
      return { ok: true, data: result.data };
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(url, { method: "GET" });
      if (!res.ok) return { ok: false, data: [] };
      const data = await res.json();
      return { ok: true, data: Array.isArray(data) ? data : [] };
    } catch {
      return { ok: false, data: [] };
    }
  }

  function mergeOwnerApartmentsForCosts(ownerBuildings, apartmentRows) {
    const rows = Array.isArray(apartmentRows) ? apartmentRows : [];
    const buildings = Array.isArray(ownerBuildings) ? ownerBuildings : [];
    const nameById = new Map(buildings.map((b) => [String(b.id), b.name || "—"]));
    const buildingIdSet = new Set(buildings.map((b) => String(b.id)));
    const merged = [];

    const pushForBuilding = (bid, filteredRows, displayName) => {
      const mapped = filteredRows
        .map(mapApiApartmentToRow)
        .filter(Boolean)
        .map((apt) => ({
          ...apt,
          buildingId: String(bid),
          buildingName: displayName || nameById.get(String(bid)) || "—",
        }));
      merged.push(...dedupeFinanceApartments(mapped, bid));
    };

    if (buildingIdSet.size) {
      for (const bid of buildingIdSet) {
        const code = buildings.find((x) => String(x.id) === bid)?.code;
        const codeStr = code != null ? String(code).trim() : "";
        const filtered = rows.filter((a) => {
          const ab = String(a.building_id ?? "");
          return ab === bid || (!!codeStr && ab === codeStr);
        });
        pushForBuilding(bid, filtered, nameById.get(bid));
      }
    } else if (rows.length) {
      const byBid = new Map();
      for (const a of rows) {
        const ab = String(a.building_id ?? "").trim();
        if (!ab) continue;
        if (!byBid.has(ab)) byBid.set(ab, []);
        byBid.get(ab).push(a);
      }
      for (const [bid, list] of byBid) {
        pushForBuilding(bid, list, nameById.get(bid) || "—");
      }
    }

    return merged;
  }

  function mapApiApartmentToRow(api) {
    if (!api) return null;
    return {
      id: String(api.id ?? ""),
      apiId: api.id ?? null,
      buildingId: String(api.building_id ?? ""),
      number: String(api.apartment_number ?? ""),
      apartmentNumber: String(api.apartment_number ?? ""),
      floorNumber: api.floor_number != null ? Number(api.floor_number) : 0,
      floor_number: api.floor_number,
      tenantUserId: api.tenant_user_id ?? null,
      tenantNationalId: api.tenant_national_id ?? null,
      buildingName: "—",
      currentContractId: api.current_contract_id ?? null,
      contractId: api.current_contract_id ?? null,
      contract: { id: api.current_contract_id },
    };
  }

  function dedupeFinanceApartments(apartmentList, canonicalBuildingId) {
    const canonical = canonicalBuildingId != null ? String(canonicalBuildingId) : "";
    const byKey = new Map();
    const score = (apt) => {
      let s = 0;
      const idStr = String(apt.id ?? "");
      if (apt.apiId != null || /^\d+$/.test(idStr)) s += 5;
      if (canonical && String(apt.buildingId ?? "") === canonical) s += 3;
      if (apt.tenantUserId || apt.tenantNationalId) s += 2;
      if (apt.currentContractId || apt.contract?.id) s += 1;
      return s;
    };
    for (const apt of apartmentList) {
      const num = String(apt.number ?? apt.apartment_number ?? "").trim();
      const floor = String(apt.floorNumber ?? apt.floor_number ?? "").trim() || "0";
      const key = num ? `${floor}::${num}` : `id:${String(apt.id ?? apt.apiId ?? "")}`;
      if (!num && !apt.id && apt.apiId == null) continue;
      const prev = byKey.get(key);
      if (!prev || score(apt) > score(prev)) byKey.set(key, apt);
    }
    return Array.from(byKey.values());
  }

  function buildApartmentIndexByApiId() {
    const map = new Map();
    for (const apt of allBuildingApartmentsFull) {
      const apiId = apt.apiId != null ? String(apt.apiId) : String(apt.id || "");
      if (apiId) map.set(apiId, apt);
      const uiId = String(apt.id || "");
      if (uiId && uiId !== apiId) map.set(uiId, apt);
    }
    return map;
  }

  function mapApiCostRow(row, aptById) {
    const rawAptId = String(row.apartment_id ?? "");
    const apt = aptById.get(rawAptId) || null;
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
      createdAt = typeof c === "string" ? c.slice(0, 10) : new Date(c).toISOString().slice(0, 10);
    }
    const uiAptId = apt ? String(apt.id || apt.apiId || rawAptId) : rawAptId;
    return {
      id: String(row.id),
      serverId: row.id,
      apartmentId: uiAptId,
      contractId: row.contract_id != null ? String(row.contract_id) : null,
      type: row.cost_type,
      amount: Number(row.amount),
      status: row.status,
      expenseDate: expenseDate || "—",
      createdAt: createdAt || "—",
      notes: row.notes || "",
      _buildingId: normalizeId(apt?.buildingId) || "",
      _buildingName: apt?.buildingName || "—",
      _aptNum: String(apt?.number ?? apt?.apartmentNumber ?? "—"),
      _aptId: uiAptId,
    };
  }

  function applyCostsScopeFilter() {
    const aptById = buildApartmentIndexByApiId();
    const allowedAptIds = new Set(
      allBuildingApartments
        .map((a) => (a.apiId != null ? String(a.apiId) : String(a.id || "")))
        .filter(Boolean)
    );
    portfolioCostsCache = (portfolioCostsCacheFull || [])
      .filter((row) => allowedAptIds.has(String(row.apartment_id ?? "")))
      .map((row) => mapApiCostRow(row, aptById));
  }

  async function loadCostsBulk() {
    portfolioCostsCacheFull = [];
    portfolioCostsCache = [];
    costsFromApi = false;
    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth ||
      !allBuildingApartmentsFull.length
    ) {
      return;
    }
    const url = `${WalajnaAuth.API_BASE}/api/owner/costs`;
    if (WalajnaAuth.fetchJsonWithAuthRetry) {
      const result = await WalajnaAuth.fetchJsonWithAuthRetry(
        url,
        { method: "GET" },
        { retries: 4, delayMs: 350 }
      );
      if (!result.ok || !Array.isArray(result.data)) {
        console.warn("portfolio-costs: owner costs fetch failed", result.status);
        return;
      }
      portfolioCostsCacheFull = result.data;
      costsFromApi = true;
      applyCostsScopeFilter();
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(url, { method: "GET" });
      if (!res.ok) {
        console.warn("portfolio-costs: owner costs fetch failed", res.status);
        return;
      }
      const data = await res.json();
      portfolioCostsCacheFull = Array.isArray(data) ? data : [];
      costsFromApi = true;
      applyCostsScopeFilter();
    } catch (e) {
      console.warn("portfolio-costs: owner costs fetch failed", e);
    }
  }

  async function loadOwnerApartmentsFromApi() {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) return false;
    try {
      const buildingsUrl = `${WalajnaAuth.API_BASE}/api/buildings`;
      const apartmentsUrl = `${WalajnaAuth.API_BASE}/api/apartments`;

      let [buildingsResult, apartmentsResult] = await Promise.all([
        fetchJsonList(buildingsUrl),
        fetchJsonList(apartmentsUrl),
      ]);

      const needsRetry =
        !buildingsResult.ok ||
        !apartmentsResult.ok ||
        (buildingsResult.ok && !buildingsResult.data.length) ||
        (apartmentsResult.ok &&
          buildingsResult.data.length > 0 &&
          !apartmentsResult.data.length);
      if (needsRetry) {
        await delay(buildingsResult.ok && apartmentsResult.ok ? 450 : 700);
        [buildingsResult, apartmentsResult] = await Promise.all([
          fetchJsonList(buildingsUrl),
          fetchJsonList(apartmentsUrl),
        ]);
      }

      portfolioCostsLoadOk = buildingsResult.ok || apartmentsResult.ok;

      let ownerBuildings = buildingsResult.ok ? buildingsResult.data : [];
      if (
        Array.isArray(ownerBuildings) &&
        ownerBuildings.length &&
        typeof WalajnaBuildingsApi !== "undefined" &&
        WalajnaBuildingsApi.persistSessionList
      ) {
        WalajnaBuildingsApi.persistSessionList(
          ownerBuildings.map((b) =>
            typeof WalajnaBuildingsApi.mapApiRowToClient === "function"
              ? WalajnaBuildingsApi.mapApiRowToClient(b)
              : b
          )
        );
      }

      if (!apartmentsResult.ok && !buildingsResult.ok) {
        portfolioCostsLoadOk = false;
        return false;
      }

      const apartmentRows = apartmentsResult.ok ? apartmentsResult.data : [];
      const merged = mergeOwnerApartmentsForCosts(ownerBuildings, apartmentRows);

      ownerBuildingsCatalog = (ownerBuildings || []).map((b) => ({
        id: String(b.id),
        name: b.name || "—",
      }));
      if (!ownerBuildingsCatalog.length && merged.length) {
        const seen = new Map();
        for (const apt of merged) {
          const id = String(apt.buildingId || "").trim();
          if (!id || seen.has(id)) continue;
          seen.set(id, { id, name: apt.buildingName || "—" });
        }
        ownerBuildingsCatalog = Array.from(seen.values());
      }

      allBuildingApartmentsFull = merged;
      allBuildingApartments =
        typeof WalajnaOwnerBuildingPick !== "undefined"
          ? WalajnaOwnerBuildingPick.filterApartments(merged)
          : merged;
      if (
        !allBuildingApartments.length &&
        allBuildingApartmentsFull.length &&
        typeof WalajnaOwnerBuildingPick !== "undefined"
      ) {
        allBuildingApartments = allBuildingApartmentsFull;
      }
      return true;
    } catch (e) {
      portfolioCostsLoadOk = false;
      console.warn("portfolio-costs: API load failed", e);
      return false;
    }
  }

  const apartmentsLoaded = await loadOwnerApartmentsFromApi();

  if (apartmentsLoaded && ownerBuildingsCatalog.length) {
    await loadCostsBulk();
  } else if (
    typeof WalajnaCostsApi !== "undefined" &&
    WalajnaCostsApi.isAvailable &&
    WalajnaCostsApi.isAvailable() &&
    allBuildingApartmentsFull.length
  ) {
    const refreshJobs = allBuildingApartmentsFull.map((apt) => {
      const uiId = String(apt.id || apt.apiId || "");
      const serverId = apt.apiId != null ? apt.apiId : apt.id;
      if (!uiId) return Promise.resolve();
      return WalajnaCostsApi.refreshForApartment(uiId, serverId).catch(() => {});
    });
    await Promise.all(refreshJobs);
  }

  let ownerApartmentIdSet = new Set();
  let ownerContractIdSet = new Set();

  function rebuildOwnerScopeSets() {
    ownerApartmentIdSet = new Set(
      allBuildingApartments.map((a) => String(a.id || a.apiId || "")).filter(Boolean)
    );
    ownerContractIdSet = new Set();
    for (const apt of allBuildingApartments) {
      const c =
        apt.currentContractId ||
        apt.contractId ||
        apt.contract?.id ||
        (apt.contract && apt.contract.id);
      if (c) ownerContractIdSet.add(String(c));
    }
  }

  rebuildOwnerScopeSets();

  function getCosts() {
    if (
      typeof WalajnaCostsApi !== "undefined" &&
      WalajnaCostsApi.isAvailable &&
      WalajnaCostsApi.isAvailable() &&
      typeof WalajnaCostsApi.getAllFlat === "function"
    ) {
      return WalajnaCostsApi.getAllFlat();
    }
    return JSON.parse(localStorage.getItem(COSTS_KEY) || "[]");
  }

  function saveCosts(costs) {
    localStorage.setItem(COSTS_KEY, JSON.stringify(costs));
  }

  function findApartmentForCost(cost) {
    const costAptId = String(cost.apartmentId || "");
    let apt = allBuildingApartments.find(
      (a) =>
        String(a.id) === costAptId ||
        String(a.apiId ?? "") === costAptId
    );
    if (!apt && cost.contractId) {
      apt = allBuildingApartments.find(
        (a) =>
          String(a.currentContractId || a.contractId || a.contract?.id || "") ===
          String(cost.contractId)
      );
    }
    return apt || null;
  }

  function costBelongsToOwner(cost) {
    return !!findApartmentForCost(cost);
  }

  function enrichCost(cost) {
    const apt = findApartmentForCost(cost);
    const aptId = apt ? String(apt.id || apt.apiId || "") : String(cost.apartmentId || "");
    const bId = normalizeId(apt?.buildingId) || "";
    return {
      ...cost,
      _buildingId: bId,
      _buildingName: apt?.buildingName || "—",
      _aptNum: String(apt?.number ?? apt?.apartmentNumber ?? "—"),
      _aptId: aptId,
    };
  }

  function getPortfolioCosts() {
    if (costsFromApi) {
      const allowedAptIds = new Set(
        allBuildingApartments.map((a) => String(a.id || a.apiId || "")).filter(Boolean)
      );
      const allowedApiIds = new Set(
        allBuildingApartments
          .map((a) => (a.apiId != null ? String(a.apiId) : ""))
          .filter(Boolean)
      );
      return portfolioCostsCache.filter((c) => {
        const aptKey = String(c._aptId || c.apartmentId || "");
        return (
          allowedAptIds.has(aptKey) ||
          allowedApiIds.has(aptKey) ||
          allowedAptIds.has(String(c.apartmentId || ""))
        );
      });
    }
    return getCosts()
      .filter(costBelongsToOwner)
      .map(enrichCost)
      .filter((c) => c._aptId && c._buildingId && c._buildingId !== "__orphan__");
  }

  function groupApartmentsByBuilding(apartmentsList) {
    const map = new Map();
    for (const apt of apartmentsList) {
      const bid = normalizeId(apt.buildingId) || "__none__";
      if (!map.has(bid)) {
        map.set(bid, {
          buildingId: bid,
          buildingName: apt.buildingName || T("common.dash"),
          units: [],
        });
      }
      map.get(bid).units.push(apt);
    }
    return [...map.values()].sort((a, b) =>
      String(a.buildingName).localeCompare(String(b.buildingName), undefined, {
        sensitivity: "base",
      })
    );
  }

  function aggregateCosts(costsList) {
    let total = 0;
    let approved = 0;
    let pending = 0;
    let cancelled = 0;
    for (const item of costsList) {
      const n = Number(item.amount || 0);
      total += n;
      if (item.status === "approved") approved += n;
      else if (item.status === "pending") pending += n;
      else if (item.status === "cancelled") cancelled += n;
    }
    return { total, approved, pending, cancelled, count: costsList.length };
  }

  function distributeCostsToGroups(groups, costPool) {
    const byBid = new Map(groups.map((g) => [normalizeId(g.buildingId), { ...g, costItems: [] }]));
    const orphans = [];
    for (const c of costPool) {
      const bid = normalizeId(c._buildingId);
      if (byBid.has(bid)) {
        byBid.get(bid).costItems.push(c);
      } else {
        orphans.push(c);
      }
    }
    const list = [...byBid.values()];
    if (orphans.length) {
      list.push({
        buildingId: "__orphan__",
        buildingName: T("costs.portfolioUnknownBuilding"),
        units: [],
        costItems: orphans,
      });
    }
    return list.map((g) => {
      const sorted = sortCostsDesc(g.costItems);
      const agg = aggregateCosts(sorted);
      return { ...g, costItems: sorted, ...agg };
    });
  }

  const pageSub = document.getElementById("pageSub");
  const searchInput = document.getElementById("searchInput");
  const costsSummary = document.getElementById("costsSummary");
  const costsTableContainer = document.getElementById("costsTableContainer");
  const costsCount = document.getElementById("costsCount");

  function formatAmount(value) {
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA"
          : "ar-SA";
    return `${Number(value || 0).toLocaleString(loc)} ${T("common.sar")}`;
  }

  function resolveRowTypeLabel(item) {
    if (item.type) {
      const k = `costs.type.${item.type}`;
      const v = T(k);
      if (v !== k) return v;
    }
    return item.typeLabel || T("costs.type.other");
  }

  function statusLabel(status) {
    const k = `costs.st.${status}`;
    const v = T(k);
    return v === k ? "—" : v;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        c
      ])
    );
  }

  function renderSummary(costs) {
    const total = costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const approved = costs
      .filter((item) => item.status === "approved")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = costs
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const cancelled = costs
      .filter((item) => item.status === "cancelled")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    costsSummary.innerHTML = `
      <article class="sum-card finance-kpi finance-kpi--costs">
        <span class="sum-label">${escapeHtml(T("costs.sumTotal"))}</span>
        <div class="sum-value">${formatAmount(total)}</div>
      </article>
      <article class="sum-card finance-kpi finance-kpi--income">
        <span class="sum-label">${escapeHtml(T("costs.sumApproved"))}</span>
        <div class="sum-value">${formatAmount(approved)}</div>
      </article>
      <article class="sum-card finance-kpi finance-kpi--late">
        <span class="sum-label">${escapeHtml(T("costs.sumPending"))}</span>
        <div class="sum-value">${formatAmount(pending)}</div>
      </article>
      <article class="sum-card finance-kpi finance-kpi--profit">
        <span class="sum-label">${escapeHtml(T("costs.sumCancelled"))}</span>
        <div class="sum-value">${formatAmount(cancelled)}</div>
      </article>
    `;
  }

  function sortCostsDesc(list) {
    return [...list].sort((a, b) => {
      const da = String(a.expenseDate || "");
      const db = String(b.expenseDate || "");
      if (da !== db) return db.localeCompare(da);
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function costMatchesKeyword(item, kw) {
    if (!kw) return true;
    return (
      String(item.amount || "").includes(kw) ||
      String(item.expenseDate || "").toLowerCase().includes(kw) ||
      String(item.createdAt || "").toLowerCase().includes(kw) ||
      String(item.notes || "").toLowerCase().includes(kw) ||
      String(resolveRowTypeLabel(item) || "")
        .toLowerCase()
        .includes(kw) ||
      String(statusLabel(item.status) || "")
        .toLowerCase()
        .includes(kw) ||
      String(item._buildingName || "")
        .toLowerCase()
        .includes(kw) ||
      String(item._aptNum || "").toLowerCase().includes(kw)
    );
  }

  function renderNestedExpensesTable(costItems) {
    if (!costItems.length) {
      return `<div class="portfolio-costs-nest-empty">${escapeHtml(
        T("costs.portfolioBuildingNestEmpty")
      )}</div>`;
    }

    const rows = costItems
      .map((item) => {
        const aptHref =
          item._aptId && item._aptId !== ""
            ? `../main/costs.html?id=${encodeURIComponent(item._aptId)}`
            : "#";
        const st =
          item.status === "approved" || item.status === "pending" || item.status === "cancelled"
            ? item.status
            : "";
        return `
          <tr>
            <td>${escapeHtml(item.expenseDate || "—")}</td>
            <td>${escapeHtml(formatAmount(item.amount))}</td>
            <td>${escapeHtml(resolveRowTypeLabel(item))}</td>
            <td><span class="badge ${st}">${escapeHtml(statusLabel(item.status))}</span></td>
            <td>${escapeHtml(item._aptNum)}</td>
            <td>${escapeHtml(item.notes || "—")}</td>
            <td>${
              item._aptId
                ? `<a class="portfolio-costs-apt-link" href="${escapeHtml(aptHref)}">${escapeHtml(
                    T("costs.portfolioOpenApartmentCosts")
                  )}</a>`
                : "—"
            }</td>
            <td>
              <button class="delete-btn" type="button" data-id="${escapeHtml(
                item.id
              )}">${escapeHtml(T("costs.deleteExpenseBtn"))}</button>
            </td>
          </tr>`;
      })
      .join("");

    return `
      <table class="finance-table finance-table--nested costs-portfolio-nested" role="grid">
        <thead>
          <tr>
            <th>${escapeHtml(T("costs.th.date"))}</th>
            <th>${escapeHtml(T("costs.th.amount"))}</th>
            <th>${escapeHtml(T("costs.th.type"))}</th>
            <th>${escapeHtml(T("costs.th.status"))}</th>
            <th>${escapeHtml(T("costs.th.aptCol"))}</th>
            <th>${escapeHtml(T("costs.th.notes"))}</th>
            <th>${escapeHtml(T("costs.th.aptCostsLink"))}</th>
            <th>${escapeHtml(T("costs.th.action"))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function isPortfolioTableFilterActive() {
    if (typeof WalajnaOwnerBuildingPick === "undefined") return false;
    return WalajnaOwnerBuildingPick.isPortfolioTableFilterActive(ownerBuildingsCatalog);
  }

  function isPortfolioGroupInTotals(group) {
    if (typeof WalajnaOwnerBuildingPick === "undefined") return true;
    return WalajnaOwnerBuildingPick.isPortfolioBuildingInTotals(
      group.buildingId,
      ownerBuildingsCatalog
    );
  }

  function portfolioCheckboxHtml(buildingId) {
    if (typeof WalajnaOwnerBuildingPick === "undefined") return "";
    const checked = WalajnaOwnerBuildingPick.isPortfolioBuildingChecked(
      buildingId,
      ownerBuildingsCatalog
    );
    return WalajnaOwnerBuildingPick.portfolioBuildingCheckboxHtml(buildingId, checked);
  }

  function renderBuildingAccordion(groupsWithCosts) {
    const checkedGroups = groupsWithCosts.filter((g) => isPortfolioGroupInTotals(g));
    const foot = aggregateCosts(checkedGroups.flatMap((g) => g.costItems));

    const bodyRows = groupsWithCosts
      .map((g, idx) => {
        const nestId = `portfolio-costs-nest-${idx}`;
        const nestedHtml = renderNestedExpensesTable(g.costItems);
        const rowMutedCls =
          isPortfolioTableFilterActive() && !isPortfolioGroupInTotals(g)
            ? " portfolio-building-row--unchecked"
            : "";
        return `
          <tr class="portfolio-building-row${rowMutedCls}" data-portfolio-costs-idx="${idx}">
            <td class="portfolio-building-name-cell">
              <div class="portfolio-building-name-row">
                ${portfolioCheckboxHtml(g.buildingId)}
                <button type="button" class="portfolio-building-toggle" aria-expanded="false" aria-controls="${nestId}">
                  <span class="portfolio-building-chevron" aria-hidden="true">▾</span>
                  <span class="portfolio-building-name">${escapeHtml(g.buildingName)}</span>
                </button>
              </div>
            </td>
            <td class="portfolio-building-meta">${escapeHtml(String(g.count))}</td>
            <td>${escapeHtml(formatAmount(g.total))}</td>
            <td>${escapeHtml(formatAmount(g.approved))}</td>
            <td>${escapeHtml(formatAmount(g.pending))}</td>
            <td>${escapeHtml(formatAmount(g.cancelled))}</td>
          </tr>
          <tr class="portfolio-building-nest" id="${nestId}" aria-hidden="true">
            <td colspan="${MAIN_COLS}" class="portfolio-nest-td">
              <div class="portfolio-nest-anim">
                <div class="portfolio-nest-inner">${nestedHtml}</div>
              </div>
            </td>
          </tr>`;
      })
      .join("");

    return `
      <table class="finance-table finance-table--portfolio costs-portfolio-main-table">
        <thead>
          <tr>
            <th>${escapeHtml(T("finance.th.building"))}</th>
            <th>${escapeHtml(T("costs.th.expenseCount"))}</th>
            <th>${escapeHtml(T("costs.sumTotal"))}</th>
            <th>${escapeHtml(T("costs.sumApproved"))}</th>
            <th>${escapeHtml(T("costs.sumPending"))}</th>
            <th>${escapeHtml(T("costs.sumCancelled"))}</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td class="finance-total-label">${escapeHtml(T("finance.totalRow"))}</td>
            <td class="finance-total-count">${escapeHtml(String(foot.count))}</td>
            <td>${escapeHtml(formatAmount(foot.total))}</td>
            <td>${escapeHtml(formatAmount(foot.approved))}</td>
            <td>${escapeHtml(formatAmount(foot.pending))}</td>
            <td>${escapeHtml(formatAmount(foot.cancelled))}</td>
          </tr>
        </tfoot>
      </table>`;
  }

  function renderPage() {
    if (pageSub) pageSub.textContent = T("costs.portfolioSubtitle");

    if (!allBuildingApartments.length) {
      if (costsCount) {
        costsCount.classList.remove("is-pending");
        costsCount.textContent = "";
      }
      renderSummary([]);
      const emptyMsg = portfolioCostsLoadOk
        ? T("finance.noAptsPortfolio")
        : T("finance.loadPortfolioFailed");
      costsTableContainer.innerHTML = `
        <div class="empty-state">${escapeHtml(emptyMsg)}</div>
        ${
          portfolioCostsLoadOk
            ? ""
            : `<div style="margin-top:10px;text-align:center;">
                <button id="portfolioCostsRetryBtn" class="finance-summary-btn finance-summary-btn--primary" type="button">${escapeHtml(
                  T("common.retry")
                )}</button>
              </div>`
        }
      `;
      if (!portfolioCostsLoadOk) {
        document.getElementById("portfolioCostsRetryBtn")?.addEventListener("click", () => {
          window.location.reload();
        });
      }
      return;
    }

    const allCosts = sortCostsDesc(getPortfolioCosts());
    const keyword = (searchInput.value || "").trim().toLowerCase();
    const filteredCosts = keyword ? allCosts.filter((item) => costMatchesKeyword(item, keyword)) : allCosts;

    const baseGroups = groupApartmentsByBuilding(allBuildingApartments);
    const groupsWithCosts = distributeCostsToGroups(baseGroups, filteredCosts);
    const costsForSummary = isPortfolioTableFilterActive()
      ? filteredCosts.filter((item) =>
          isPortfolioGroupInTotals({ buildingId: normalizeId(item._buildingId) })
        )
      : filteredCosts;

    if (costsCount) {
      costsCount.classList.remove("is-pending");
      const buildingsShown = baseGroups.filter((g) => g.buildingId !== "__orphan__").length;
      const buildingsSelected = isPortfolioTableFilterActive()
        ? baseGroups.filter(
            (g) => g.buildingId !== "__orphan__" && isPortfolioGroupInTotals(g)
          ).length
        : buildingsShown;
      costsCount.textContent = T("costs.portfolioTableMeta", {
        buildings:
          buildingsSelected < buildingsShown
            ? `${buildingsSelected}/${buildingsShown}`
            : buildingsShown,
        expenses: costsForSummary.length,
      });
    }

    renderSummary(costsForSummary);
    costsTableContainer.innerHTML = renderBuildingAccordion(groupsWithCosts);
  }

  costsTableContainer.addEventListener("click", (e) => {
    const toggle = e.target.closest(".portfolio-building-toggle");
    if (toggle && costsTableContainer.contains(toggle)) {
      const row = toggle.closest("tr.portfolio-building-row");
      if (!row || !costsTableContainer.contains(row)) return;
      const nest = row.nextElementSibling;
      if (!nest || !nest.classList.contains("portfolio-building-nest")) return;
      const open = !nest.classList.contains("is-open");
      nest.classList.toggle("is-open", open);
      row.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nest.setAttribute("aria-hidden", open ? "false" : "true");
      return;
    }

    const del = e.target.closest(".delete-btn");
    if (del && costsTableContainer.contains(del) && del.closest(".portfolio-building-nest")) {
      const id = del.dataset.id;
      if (!id) return;
      void (async () => {
      const confirmed = await WalajnaDialog.confirm(T("costs.confirmDelete"), {
        danger: true,
      });
      if (!confirmed) return;
        try {
          if (
            costsFromApi &&
            typeof WalajnaCostsApi !== "undefined" &&
            WalajnaCostsApi.deleteOnServer
          ) {
            await WalajnaCostsApi.deleteOnServer(id);
            await loadCostsBulk();
          } else {
            const updatedCosts = getCosts().filter((item) => item.id !== id);
            saveCosts(updatedCosts);
          }
        } catch (err) {
          alert(err?.message || T("common.error"));
          return;
        }
        renderPage();
      })();
    }
  });

  costsTableContainer.addEventListener("change", (e) => {
    const cb = e.target.closest(".portfolio-building-pick__input");
    if (!cb || !costsTableContainer.contains(cb)) return;
    e.stopPropagation();
    if (typeof WalajnaOwnerBuildingPick === "undefined") return;
    WalajnaOwnerBuildingPick.setPortfolioBuildingChecked(
      cb.dataset.buildingId,
      cb.checked,
      ownerBuildingsCatalog
    );
    void refreshPortfolioPickUi().then(renderPage);
  });

  async function refreshPortfolioPickUi() {
    if (!allBuildingApartmentsFull.length) return;
    if (typeof WalajnaOwnerBuildingPick === "undefined") return;

    allBuildingApartments = WalajnaOwnerBuildingPick.filterApartments(
      allBuildingApartmentsFull
    );
    rebuildOwnerScopeSets();

    applyCostsScopeFilter();

    const anchor = document.getElementById("costsSummary");
    WalajnaOwnerBuildingPick.mountFilterBanner({
      anchor,
      buildings: ownerBuildingsCatalog,
      onChange: () => {
        void refreshPortfolioPickUi().then(renderPage);
      },
    });
  }

  searchInput?.addEventListener("input", renderPage);
  document.addEventListener("walajna:i18n-applied", () => renderPage());

  void refreshPortfolioPickUi().then(() => {
    setPortfolioCostsLoading(false);
    renderPage();
  });

  if (typeof window.walajnaRefreshBreadcrumb === "function") {
    window.walajnaRefreshBreadcrumb();
  }
});
