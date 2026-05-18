function wlT(key, params) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key, params)
    : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await WalajnaAuth.hydrateSession();
  requireAuth();
  requireRole("tenant");
  ensureRoleSetup();

  const container = document.getElementById("tenantApartments");
  const alertsContainer = document.getElementById("tenantPaymentAlerts");
  const searchInput = document.getElementById("tenantApartmentSearch");
  const filterSelect = document.getElementById("tenantApartmentFilter");
  const statsContainer = document.getElementById("tenantUnitsStats");

  if (!container) return;

  async function getApartments() {
    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments?view=as_tenant`,
        { method: "GET" }
      );
      if (response.ok) {
        return await response.json();
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }

  async function getBuildings() {
    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings`,
        { method: "GET" }
      );
      if (response.ok) {
        return await response.json();
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  async function getMaintenanceRequests() {
    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/maintenance`,
        { method: "GET" }
      );
      if (response.ok) {
        const rows = await response.json();
        return Array.isArray(rows) ? rows : [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  async function getCurrentUser() {
    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/users/me`,
        { method: "GET" }
      );
      if (response.ok) {
        return await response.json();
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const currentUser = await getCurrentUser();
  const apartments = await getApartments();
  const buildings = await getBuildings();
  const maintenanceRows = await getMaintenanceRequests();

  const buildingById = new Map(
    (Array.isArray(buildings) ? buildings : []).map((b) => {
      const id = b.id ?? b.building_id;
      return [Number(id), b];
    })
  );

  if (!currentUser) {
    container.innerHTML = `<p>${wlT("tenant.home.userMissing")}</p>`;
    return;
  }

  const overdueApartmentIds = new Set();

  function toStr(value) {
    return String(value ?? "").trim();
  }

  function buildingIdOf(apt) {
    const raw = apt.building_id ?? apt.buildingId;
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function apartmentNumberOf(apt) {
    const raw = apt.apartment_number ?? apt.apartmentNumber ?? apt.number;
    if (raw == null || raw === "") return "-";
    return String(raw);
  }

  function apartmentStableId(apt) {
    return String(apt?.apiId ?? apt?.id ?? "");
  }

  function contractIdOf(apt) {
    return (
      apt.current_contract_id ??
      apt.currentContractId ??
      apt.contract_id ??
      apt.contractId ??
      apt.contract?.id ??
      null
    );
  }

  function buildingNameOf(apt) {
    const bid = buildingIdOf(apt);
    if (bid != null) {
      const b = buildingById.get(bid);
      const name = b && (b.name ?? b.building_name);
      if (name) return String(name);
    }
    return String(apt.building_name ?? apt.buildingName ?? "-");
  }

  function formatAmount(value) {
    const n = Number(value || 0);
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : "ar-SA-u-nu-latn";
    const sar = wlT("common.sar");
    if (!Number.isFinite(n)) return `0 ${sar}`;
    return `${n.toLocaleString(loc)} ${sar}`;
  }

  async function getOverduePayments(apts) {
    if (!WalajnaAuth?.fetchWithAuth || !WalajnaAuth?.API_BASE) return [];
    const today = new Date().toISOString().slice(0, 10);
    const seenInstallments = new Set();
    const alerts = [];
    for (const apt of apts || []) {
      const cid = contractIdOf(apt);
      if (!cid) continue;
      try {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(cid)}/installments`,
          { method: "GET" }
        );
        if (!res.ok) continue;
        const rows = await res.json();
        if (!Array.isArray(rows) || !rows.length) continue;
        for (const row of rows) {
          const status = String(row.status || "").toLowerCase();
          if (status === "paid" || status === "partial_paid" || status === "cancelled") continue;
          const dueDate = String(row.due_date || "").slice(0, 10);
          const isOverdue = status === "overdue" || (dueDate && dueDate < today);
          if (!isOverdue) continue;
          const installmentKey = String(row.id || `${cid}-${dueDate}-${row.installment_index || ""}`);
          if (seenInstallments.has(installmentKey)) continue;
          seenInstallments.add(installmentKey);
          alerts.push({
            apartmentId: apartmentStableId(apt),
            buildingName: buildingNameOf(apt),
            apartmentName: wlT("tenant.home.apartmentNameValue", { num: apartmentNumberOf(apt) }),
            amount: row.amount,
            dueDate
          });
        }
      } catch {
        // Ignore per-contract failures so other units still render.
      }
    }
    return alerts;
  }

  async function renderLatePaymentAlerts(apts) {
    if (!alertsContainer) return;
    const alerts = await getOverduePayments(apts);
    if (!alerts.length) {
      alertsContainer.innerHTML = "";
      return;
    }
    const grouped = new Map();
    for (const item of alerts) {
      if (item.apartmentId) overdueApartmentIds.add(String(item.apartmentId));
      const key = `${item.buildingName || "-"}|${item.apartmentName || "-"}`;
      const current = grouped.get(key) || {
        buildingName: item.buildingName || "-",
        apartmentName: item.apartmentName || "-",
        count: 0,
        totalAmount: 0,
      };
      current.count += 1;
      current.totalAmount += Number(item.amount || 0);
      grouped.set(key, current);
    }
    const list = Array.from(grouped.values());
    const visible = list.slice(0, 1);
    const hidden = list.slice(1);
    const remaining = Math.max(0, list.length - visible.length);
    const summary = wlT("tenant.home.latePaymentSummary", {
      n: String(alerts.length),
      u: String(list.length),
    });

    const renderItem = (item) => `
      <div class="tenant-alert-item">
        <span class="tenant-alert-item-main">${item.buildingName} - ${item.apartmentName}</span>
        <span class="tenant-alert-item-sub">${wlT("tenant.home.latePaymentItem", {
          count: String(item.count),
          amount: formatAmount(item.totalAmount),
        })}</span>
      </div>
    `;

    alertsContainer.innerHTML = `
      <article class="tenant-alert-card">
        <h3 class="tenant-alert-title">${wlT("tenant.home.latePaymentTitle")}</h3>
        <p class="tenant-alert-body">${summary}</p>
        <div class="tenant-alert-list">
          ${visible.map(renderItem).join("")}
          <div id="tenantAlertHiddenList" class="tenant-alert-hidden-list" hidden>
            ${hidden.map(renderItem).join("")}
          </div>
          ${remaining > 0 ? `<button id="tenantAlertToggleBtn" type="button" class="tenant-alert-more">${wlT("tenant.home.latePaymentMore", { n: String(remaining) })}</button>` : ""}
        </div>
      </article>
    `;

    const toggleBtn = document.getElementById("tenantAlertToggleBtn");
    const hiddenList = document.getElementById("tenantAlertHiddenList");
    if (toggleBtn && hiddenList) {
      let expanded = false;
      toggleBtn.addEventListener("click", () => {
        expanded = !expanded;
        hiddenList.hidden = !expanded;
        toggleBtn.textContent = expanded
          ? wlT("tenant.home.latePaymentCollapse")
          : wlT("tenant.home.latePaymentMore", { n: String(remaining) });
      });
    }
  }

  function cardTitle(apt) {
    const bid = buildingIdOf(apt);
    const num = apartmentNumberOf(apt);
    if (bid != null) {
      const b = buildingById.get(bid);
      const name = b && (b.name ?? b.building_name);
      if (name) {
        return wlT("tenant.home.aptLine", { name, num });
      }
    }
    if (apt.address && toStr(apt.address)) {
      return toStr(apt.address);
    }
    return wlT("tenant.home.aptOnly", { num });
  }

  function isApartmentLinkedToCurrentUser(apartment, user) {
    if (!apartment || !user) return false;

    const apartmentTenantUserId = apartment.tenant_user_id ?? apartment.tenantUserId ?? null;
    const apartmentTenantNationalId = apartment.tenant_national_id ?? apartment.tenantNationalId ?? null;

    const userId = user.id;
    const userNationalId = user.national_id ?? user.nationalId ?? null;

    if (apartmentTenantUserId != null && userId != null && Number(apartmentTenantUserId) === Number(userId)) {
      return true;
    }

    if (userNationalId && apartmentTenantNationalId && toStr(apartmentTenantNationalId) === toStr(userNationalId)) {
      return true;
    }

    return false;
  }

  // Backend already scopes this endpoint to tenant-facing rows.
  // Avoid a second frontend filter that can hide valid linked rows.
  const myApartments = Array.isArray(apartments) ? apartments : [];
  await renderLatePaymentAlerts(myApartments);

  function hasUnreadOwnerReply(apartment) {
    const aid = String(apartment?.apiId ?? apartment?.id ?? "");
    if (!aid) return false;
    return maintenanceRows.some((row) => {
      if (String(row?.apartment_id ?? "") !== aid) return false;
      const ownerReply = String(row?.owner_reply ?? "").trim();
      if (!ownerReply) return false;
      return !row?.tenant_reply_seen_at;
    });
  }

  function isApartmentOverdue(apartment) {
    return overdueApartmentIds.has(apartmentStableId(apartment));
  }

  function getActiveFilter() {
    return String(filterSelect?.value || "all");
  }

  function getSearchTerm() {
    return String(searchInput?.value || "").trim().toLowerCase();
  }

  function getSearchScore(apartment, term) {
    if (!term) return 1;
    const buildingName = buildingNameOf(apartment).toLowerCase();
    const aptNum = apartmentNumberOf(apartment).toLowerCase();
    const normalized = String(term || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim();
    if (!normalized) return 1;

    const rawTokens = normalized.split(/\s+/).filter(Boolean);
    const stopWords = new Set([
      "apartment",
      "apart",
      "apt",
      "unit",
      "flat",
      "شقة",
      "شقق",
      "عمارة",
    ]);
    const tokens = rawTokens.filter((t) => !stopWords.has(t));
    if (!tokens.length) return 1;

    let score = 0;
    for (const token of tokens) {
      let tokenMatched = false;
      if (/^\d+$/.test(token)) {
        if (aptNum.startsWith(token)) {
          score += 35;
          tokenMatched = true;
        } else if (aptNum.includes(token)) {
          score += 15;
          tokenMatched = true;
        }
      }
      if (!tokenMatched && buildingName.startsWith(token)) {
        score += 25;
        tokenMatched = true;
      } else if (!tokenMatched && buildingName.includes(token)) {
        score += 12;
        tokenMatched = true;
      }
      if (!tokenMatched && `${buildingName} ${aptNum}`.includes(token)) {
        score += 8;
        tokenMatched = true;
      }
      if (!tokenMatched) return 0;
    }
    return score;
  }

  function apartmentMatchesFilter(apartment, filterValue) {
    if (filterValue === "all") return true;
    if (filterValue === "replied") return hasUnreadOwnerReply(apartment);
    if (filterValue === "overdue") return isApartmentOverdue(apartment);
    return true;
  }

  if (myApartments.length === 0) {
    container.innerHTML = `<p class="no-building">${wlT("tenant.home.noUnits")}</p>`;
    return;
  }

  function renderStats() {
    if (!statsContainer) return;
    const total = myApartments.length;
    const replied = myApartments.filter(hasUnreadOwnerReply).length;
    const overdue = myApartments.filter(isApartmentOverdue).length;
    statsContainer.innerHTML = `
      <span class="tenant-stat-chip">${wlT("tenant.home.statTotal", { n: String(total) })}</span>
      <span class="tenant-stat-chip">${wlT("tenant.home.statReplied", { n: String(replied) })}</span>
      <span class="tenant-stat-chip">${wlT("tenant.home.statOverdue", { n: String(overdue) })}</span>
    `;
  }

  function sortApartments(apartmentList) {
    return [...apartmentList].sort((a, b) => {
      const aReply = hasUnreadOwnerReply(a) ? 1 : 0;
      const bReply = hasUnreadOwnerReply(b) ? 1 : 0;
      if (aReply !== bReply) return bReply - aReply;

      const aOverdue = isApartmentOverdue(a) ? 1 : 0;
      const bOverdue = isApartmentOverdue(b) ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;

      const aNum = Number(apartmentNumberOf(a));
      const bNum = Number(apartmentNumberOf(b));
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
      return String(apartmentNumberOf(a)).localeCompare(String(apartmentNumberOf(b)));
    });
  }

  function renderApartmentCards() {
    container.innerHTML = "";
    const filterValue = getActiveFilter();
    const term = getSearchTerm();
    const filteredApartments = myApartments.filter((apt) =>
      apartmentMatchesFilter(apt, filterValue)
    );
    const scored = filteredApartments
      .map((apt) => ({ apt, score: getSearchScore(apt, term) }))
      .filter((row) => row.score > 0);
    const sortedApartments = sortApartments(scored.map((row) => row.apt)).sort((a, b) => {
      const sa = getSearchScore(a, term);
      const sb = getSearchScore(b, term);
      if (sa !== sb) return sb - sa;
      return 0;
    });
    if (!sortedApartments.length) {
      container.innerHTML = `<p class="no-building">${wlT("tenant.home.noMatch")}</p>`;
      return;
    }
    sortedApartments.forEach((apt) => {
      const hasReplyAlert = hasUnreadOwnerReply(apt);
      const hasOverdue = isApartmentOverdue(apt);
      const card = document.createElement("div");
      card.className = `building-card clickable-card ${hasReplyAlert ? "has-reply-alert" : ""}`;
      card.dataset.target = "../main/apartment_info.html";
      card.dataset.id = apt.id;

      card.innerHTML = `
        ${hasReplyAlert ? `<span class="apt-reply-dot" title="${wlT("messages.newReplyTitle")}"></span>` : ""}
        <div class="building-card__media" aria-hidden="true">
          <img src="../pics/tenant-house-icon.png" alt="">
        </div>
        <div class="building-name-box">${buildingNameOf(apt)}</div>
        <div class="apartment-number-box">${wlT("tenant.home.apartmentNameValue", { num: apartmentNumberOf(apt) })}</div>
        <div class="apartment-badges">
          ${hasReplyAlert ? `<span class="apartment-badge reply">${wlT("tenant.home.badgeReplied")}</span>` : ""}
          ${hasOverdue ? `<span class="apartment-badge overdue">${wlT("tenant.home.badgeOverdue")}</span>` : ""}
        </div>
      `;

      card.addEventListener("click", () => {
        window.location.href = `../main/apartment_info.html?id=${encodeURIComponent(apt.id)}`;
      });

      container.appendChild(card);
    });
  }

  if (searchInput) searchInput.addEventListener("input", renderApartmentCards);
  if (filterSelect) filterSelect.addEventListener("change", renderApartmentCards);

  renderStats();
  renderApartmentCards();
});
