/**
 * Owner portfolio: expenses (walajna_costs) grouped by building with accordion detail,
 * same interaction pattern as portfolio_finance.html.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof requireAuth === "function" && !requireAuth()) return;
  if (typeof requireRole === "function" && !requireRole("owner")) return;

  const COSTS_KEY = "walajna_costs";
  const MAIN_COLS = 6;
  const normalizeId = (value) => String(value || "").trim();

  let apartments = [];
  let allBuildingApartments = [];

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

  async function loadOwnerApartmentsFromApi() {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) return false;
    try {
      const [bRes, aRes] = await Promise.all([
        WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/buildings`, { method: "GET" }),
        WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/apartments`, { method: "GET" }),
      ]);

      let ownerBuildings = [];
      if (bRes.ok) {
        ownerBuildings = await bRes.json();
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
      }

      const nameById = new Map((ownerBuildings || []).map((b) => [String(b.id), b.name || "—"]));
      const buildingIdSet = new Set((ownerBuildings || []).map((b) => String(b.id)));
      if (!aRes.ok) return false;

      const all = await aRes.json();
      const rows = Array.isArray(all) ? all : [];
      const merged = [];

      for (const bid of buildingIdSet) {
        const code = (ownerBuildings || []).find((x) => String(x.id) === bid)?.code;
        const codeStr = code != null ? String(code) : null;
        const filtered = rows.filter((a) => {
          const ab = String(a.building_id ?? "");
          return ab === bid || (codeStr && ab === codeStr);
        });
        const mapped = filtered
          .map(mapApiApartmentToRow)
          .filter(Boolean)
          .map((apt) => ({
            ...apt,
            buildingName: nameById.get(bid) || "—",
          }));
        merged.push(...dedupeFinanceApartments(mapped, bid));
      }
      allBuildingApartments = merged;
      return true;
    } catch (e) {
      console.warn("portfolio-costs: API load failed", e);
      return false;
    }
  }

  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
      apartments = WalajnaApartmentsApi.getSessionList();
    } catch (e) {
      apartments = [];
    }
  } else {
    apartments = [];
  }

  await loadOwnerApartmentsFromApi();

  const ownerApartmentIdSet = new Set(
    allBuildingApartments.map((a) => String(a.id || a.apiId || "")).filter(Boolean)
  );
  const ownerContractIdSet = new Set();
  for (const apt of allBuildingApartments) {
    const c =
      apt.currentContractId ||
      apt.contractId ||
      apt.contract?.id ||
      (apt.contract && apt.contract.id);
    if (c) ownerContractIdSet.add(String(c));
  }

  function getCosts() {
    return JSON.parse(localStorage.getItem(COSTS_KEY) || "[]");
  }

  function saveCosts(costs) {
    localStorage.setItem(COSTS_KEY, JSON.stringify(costs));
  }

  function costBelongsToOwner(cost) {
    const aid = String(cost.apartmentId || "");
    if (aid && ownerApartmentIdSet.has(aid)) return true;
    const cid = String(cost.contractId || "");
    if (cid && ownerContractIdSet.has(cid)) return true;
    return false;
  }

  function findApartmentForCost(cost) {
    let apt = allBuildingApartments.find((a) => String(a.id) === String(cost.apartmentId));
    if (!apt && cost.contractId) {
      apt = allBuildingApartments.find(
        (a) =>
          String(a.currentContractId || a.contractId || a.contract?.id || "") ===
          String(cost.contractId)
      );
    }
    return apt || null;
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
    return getCosts().filter(costBelongsToOwner).map(enrichCost);
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
      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumTotal"))}</span>
        <div class="sum-value">${formatAmount(total)}</div>
      </div>
      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumApproved"))}</span>
        <div class="sum-value">${formatAmount(approved)}</div>
      </div>
      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumPending"))}</span>
        <div class="sum-value">${formatAmount(pending)}</div>
      </div>
      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumCancelled"))}</span>
        <div class="sum-value">${formatAmount(cancelled)}</div>
      </div>
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

  function renderBuildingAccordion(groupsWithCosts) {
    const foot = aggregateCosts(groupsWithCosts.flatMap((g) => g.costItems));

    const bodyRows = groupsWithCosts
      .map((g, idx) => {
        const nestId = `portfolio-costs-nest-${idx}`;
        const nestedHtml = renderNestedExpensesTable(g.costItems);
        return `
          <tr class="portfolio-building-row" data-portfolio-costs-idx="${idx}">
            <td class="portfolio-building-name-cell">
              <button type="button" class="portfolio-building-toggle" aria-expanded="false" aria-controls="${nestId}">
                <span class="portfolio-building-chevron" aria-hidden="true">▾</span>
                <span class="portfolio-building-name">${escapeHtml(g.buildingName)}</span>
              </button>
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
      if (costsCount) costsCount.textContent = "";
      renderSummary([]);
      costsTableContainer.innerHTML = `<div class="empty-state">${escapeHtml(
        T("finance.noAptsPortfolio")
      )}</div>`;
      return;
    }

    const allCosts = sortCostsDesc(getPortfolioCosts());
    const keyword = (searchInput.value || "").trim().toLowerCase();
    const filteredCosts = keyword ? allCosts.filter((item) => costMatchesKeyword(item, keyword)) : allCosts;

    const baseGroups = groupApartmentsByBuilding(allBuildingApartments);
    const groupsWithCosts = distributeCostsToGroups(baseGroups, filteredCosts);

    if (costsCount) {
      costsCount.textContent = T("costs.portfolioBuildingMeta", {
        buildings: baseGroups.length,
        expenses: filteredCosts.length,
      });
    }

    renderSummary(filteredCosts);
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
      const confirmed = confirm(T("costs.confirmDelete"));
      if (!confirmed) return;
      const updatedCosts = getCosts().filter((item) => item.id !== id);
      saveCosts(updatedCosts);
      renderPage();
    }
  });

  searchInput?.addEventListener("input", renderPage);
  document.addEventListener("walajna:i18n-applied", () => renderPage());

  renderPage();

  if (typeof window.walajnaRefreshBreadcrumb === "function") {
    window.walajnaRefreshBreadcrumb();
  }
});
