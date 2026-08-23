document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  document.body.classList.add("apartment-costs--loading");

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("id");
  const forcedContractId = params.get("contractId");

  function clearApartmentCostsLoading() {
    document.body.classList.remove("apartment-costs--loading");
    const loadingEl = document.getElementById("apartmentCostsLoading");
    if (loadingEl) loadingEl.remove();
    const summary = document.getElementById("costsSummary");
    const table = document.getElementById("costsTableContainer");
    if (summary) summary.setAttribute("aria-busy", "false");
    if (table) table.setAttribute("aria-busy", "false");
  }

  if (!apartmentId) {
    clearApartmentCostsLoading();
    alert(T("aptPage.cannotIdentify"));
    return;
  }

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
    } catch (e) {
      console.warn("[apartment-costs] apartments cache failed", e);
    }
  }

  // Ensure this apartment is in session even if bulk refresh lagged.
  if (
    typeof WalajnaAuth !== "undefined" &&
    WalajnaAuth.fetchWithAuth &&
    WalajnaAuth.getCurrentUser &&
    WalajnaAuth.getCurrentUser()
  ) {
    try {
      let apiApt = null;
      if (WalajnaAuth.fetchJsonWithAuthRetry) {
        const result = await WalajnaAuth.fetchJsonWithAuthRetry(
          `${WalajnaAuth.API_BASE}/api/apartments/${encodeURIComponent(apartmentId)}`,
          { method: "GET" },
          { retries: 4, delayMs: 350 }
        );
        if (result.ok && result.data) apiApt = result.data;
      } else {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/apartments/${encodeURIComponent(apartmentId)}`,
          { method: "GET" }
        );
        if (res.ok) apiApt = await res.json();
      }
      if (
        apiApt &&
        typeof WalajnaApartmentsApi !== "undefined" &&
        WalajnaApartmentsApi.mergeSessionApartments &&
        WalajnaApartmentsApi.mapApiRowToClient
      ) {
        const mapped = WalajnaApartmentsApi.mapApiRowToClient(apiApt);
        if (mapped) WalajnaApartmentsApi.mergeSessionApartments([mapped]);
      } else if (apiApt && typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mergeSessionApartments) {
        WalajnaApartmentsApi.mergeSessionApartments([
          {
            id: String(apiApt.id ?? apartmentId),
            apiId: apiApt.id ?? null,
            buildingId: String(apiApt.building_id ?? ""),
            number: String(apiApt.apartment_number ?? ""),
            buildingName: apiApt.building_name || "",
            currentContractId: apiApt.current_contract_id ?? null,
            contractId: apiApt.current_contract_id ?? null,
            contract: { id: apiApt.current_contract_id },
          },
        ]);
      }
    } catch (e) {
      console.warn("[apartment-costs] apartment fetch failed", e);
    }
  }

  const COSTS_KEY = "walajna_costs";

  function getCostsFromStorage() {
    return JSON.parse(localStorage.getItem(COSTS_KEY) || "[]");
  }

  function useServerCosts() {
    return (
      typeof WalajnaCostsApi !== "undefined" &&
      WalajnaCostsApi.isAvailable &&
      WalajnaCostsApi.isAvailable()
    );
  }

  /** Merged view: API rows + legacy local `COST-*` rows for this apartment. */
  function getCosts() {
    if (useServerCosts()) {
      const remote = WalajnaCostsApi.getForApartment(apartmentId);
      const localOnly = getCostsFromStorage().filter(
        (c) =>
          String(c.apartmentId) === String(apartmentId) && String(c.id).startsWith("COST-")
      );
      return [...remote, ...localOnly];
    }
    return getCostsFromStorage();
  }

  function saveCosts(costs) {
    localStorage.setItem(COSTS_KEY, JSON.stringify(costs));
  }

  async function ensureServerCosts() {
    if (typeof WalajnaCostsApi === "undefined" || !WalajnaCostsApi.refreshForApartment) return;
    if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser && !WalajnaAuth.getCurrentUser()) {
      return;
    }
    const apartment = getApartment();
    const serverAid = apartment && apartment.id != null ? apartment.id : apartmentId;
    try {
      await WalajnaCostsApi.refreshForApartment(apartmentId, serverAid);
    } catch (e) {
      console.warn("[apartment-costs] server refresh failed", e);
    }
  }

  const pageSub = document.getElementById("pageSub");
  const searchInput = document.getElementById("searchInput");
  const costsSummary = document.getElementById("costsSummary");
  const costsTableContainer = document.getElementById("costsTableContainer");
  const costsCount = document.getElementById("costsCount");

  const openCostModalBtn = document.getElementById("openCostModalBtn");
  const recordCostModal = document.getElementById("recordCostModal");
  const closeRecordCostModal = document.getElementById("closeRecordCostModal");
  const cancelRecordCostModal = document.getElementById("cancelRecordCostModal");
  const costBackdrop = document.querySelector("[data-record-cost-close='true']");

  const selectedCostInfo = document.getElementById("selectedCostInfo");
  const costTypeInput = document.getElementById("costTypeInput");
  const costAmountInput = document.getElementById("costAmountInput");
  const costStatusInput = document.getElementById("costStatusInput");
  const costFundingInput = document.getElementById("costFundingInput");
  const costInsuranceSection = document.getElementById("costInsuranceSection");
  const costDepositAvailableValue = document.getElementById("costDepositAvailableValue");
  const costDepositCoverInput = document.getElementById("costDepositCoverInput");
  const costDateInput = document.getElementById("costDateInput");
  const costNotesInput = document.getElementById("costNotesInput");
  const saveCostBtn = document.getElementById("saveCostBtn");

  let depositBalanceRemaining = 0;

  function typeLabel(type) {
    const k = `costs.type.${type}`;
    const v = T(k);
    return v === k ? T("costs.type.other") : v;
  }

  function statusLabel(status) {
    const k = `costs.st.${status}`;
    const v = T(k);
    return v === k ? "—" : v;
  }

  function getApartmentsList() {
    if (typeof getApartments === "function") {
      return getApartments();
    }
    return JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  }

  function getApartment() {
    const apartments = getApartmentsList();
    return apartments.find((apt) => String(apt.id) === String(apartmentId)) || null;
  }

  function getCurrentContractId(apartment) {
    if (forcedContractId) {
      return forcedContractId;
    }

    if (!apartment) return null;

    return (
      apartment.currentContractId ||
      apartment.contract?.id ||
      apartment.contractId ||
      null
    );
  }

  function getApartmentCosts() {
    const apartment = getApartment();
    const currentContractId = getCurrentContractId(apartment);
    const all = getCosts().filter(
      (item) => String(item.apartmentId) === String(apartmentId)
    );

    if (forcedContractId) {
      return all.filter(
        (item) => String(item.contractId ?? "") === String(forcedContractId)
      );
    }

    // Occupied: current contract costs + vacant-recorded (null contract).
    // Vacant: all apartment costs (contract may be null).
    if (currentContractId) {
      return all.filter((item) => {
        const cid = item.contractId;
        if (cid == null || cid === "" || cid === "null") return true;
        return String(cid) === String(currentContractId);
      });
    }
    return all;
  }

  function fundingLabel(source) {
    const k = source === "security_deposit" ? "costs.funding.deposit" : "costs.funding.owner";
    const v = T(k);
    return v === k ? (source === "security_deposit" ? "التأمين" : "المالك") : v;
  }

  async function loadDepositBalance(contractId) {
    depositBalanceRemaining = 0;
    if (!contractId || typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      return 0;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/deposits/balance?contract_id=${encodeURIComponent(contractId)}`,
        { method: "GET" }
      );
      if (!res.ok) return 0;
      const data = await res.json();
      depositBalanceRemaining = Number(data.remaining ?? data.remaining_balance ?? 0) || 0;
      return depositBalanceRemaining;
    } catch (e) {
      console.warn("[apartment-costs] deposit balance failed", e);
      return 0;
    }
  }

  function syncFundingUi() {
    const apartment = getApartment();
    const currentContractId = getCurrentContractId(apartment);
    const canUseDeposit = Boolean(currentContractId);
    const funding = costFundingInput ? costFundingInput.value : "owner";

    if (costFundingInput) {
      const depositOpt = costFundingInput.querySelector('option[value="security_deposit"]');
      if (depositOpt) {
        depositOpt.disabled = !canUseDeposit;
        depositOpt.hidden = !canUseDeposit;
      }
      if (!canUseDeposit && funding === "security_deposit") {
        costFundingInput.value = "owner";
      }
    }

    const showDeposit =
      canUseDeposit && costFundingInput && costFundingInput.value === "security_deposit";

    if (costInsuranceSection) {
      costInsuranceSection.hidden = !showDeposit;
    }

    if (costDepositAvailableValue) {
      costDepositAvailableValue.textContent = showDeposit
        ? formatAmount(depositBalanceRemaining)
        : "—";
    }

    if (!showDeposit && costDepositCoverInput) {
      costDepositCoverInput.value = "";
    }
  }

  function formatAmount(value) {
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA-u-nu-latn"
          : "ar-SA-u-nu-latn";
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

  async function openModal() {
    const apartment = getApartment();
    const currentContractId = getCurrentContractId(apartment);

    recordCostModal.setAttribute("aria-hidden", "false");
    selectedCostInfo.textContent = T("costs.newForApt", {
      n: apartment?.number || apartmentId
    });
    costDateInput.value = new Date().toISOString().slice(0, 10);
    if (costStatusInput) costStatusInput.value = "approved";
    if (costFundingInput) costFundingInput.value = "owner";
    if (costDepositCoverInput) costDepositCoverInput.value = "";

    if (currentContractId) {
      await loadDepositBalance(currentContractId);
    } else {
      depositBalanceRemaining = 0;
    }
    syncFundingUi();
  }

  function closeModal() {
    recordCostModal.setAttribute("aria-hidden", "true");
    costTypeInput.value = "";
    costAmountInput.value = "";
    if (costStatusInput) costStatusInput.value = "approved";
    if (costFundingInput) costFundingInput.value = "owner";
    if (costDepositCoverInput) costDepositCoverInput.value = "";
    costDateInput.value = "";
    costNotesInput.value = "";
    syncFundingUi();
  }

  function renderSummary(costs) {
    const active = costs.filter(
      (item) => String(item.status || "").toLowerCase() !== "cancelled"
    );
    const total = active.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const depositCovered = active.reduce(
      (sum, item) => sum + Number(item.depositCoveredAmount || 0),
      0
    );
    const ownerBorne = Math.max(0, total - depositCovered);

    costsSummary.innerHTML = `
      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumTotal"))}</span>
        <div class="sum-value">${formatAmount(total)}</div>
      </div>

      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumDepositCovered"))}</span>
        <div class="sum-value">${formatAmount(depositCovered)}</div>
      </div>

      <div class="sum-card">
        <span class="sum-label">${escapeHtml(T("costs.sumOwnerBorne"))}</span>
        <div class="sum-value">${formatAmount(ownerBorne)}</div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        c
      ])
    );
  }

  function renderTable(costs) {
    if (!costs.length) {
      costsTableContainer.innerHTML = `<div class="empty-state">${escapeHtml(
        T("costs.empty")
      )}</div>`;
      return;
    }

    costsTableContainer.innerHTML = `
      <table class="costs-table">
        <thead>
          <tr>
            <th>${escapeHtml(T("costs.th.date"))}</th>
            <th>${escapeHtml(T("costs.th.amount"))}</th>
            <th>${escapeHtml(T("costs.th.type"))}</th>
            <th>${escapeHtml(T("costs.th.funding"))}</th>
            <th>${escapeHtml(T("costs.th.recorded"))}</th>
            <th>${escapeHtml(T("costs.th.notes"))}</th>
            <th>${escapeHtml(T("costs.th.action"))}</th>
          </tr>
        </thead>
        <tbody>
          ${costs
            .map(
              (item) => `
            <tr>
              <td>${item.expenseDate || "—"}</td>
              <td>${formatAmount(item.amount)}</td>
              <td>${escapeHtml(resolveRowTypeLabel(item))}</td>
              <td>
                <span class="badge ${item.fundingSource === "security_deposit" ? "approved" : "pending"}">
                  ${escapeHtml(fundingLabel(item.fundingSource))}
                  ${
                    Number(item.depositCoveredAmount || 0) > 0
                      ? ` (${formatAmount(item.depositCoveredAmount)})`
                      : ""
                  }
                </span>
              </td>
              <td>${item.createdAt || "—"}</td>
              <td>${escapeHtml(item.notes || "—")}</td>
              <td>
                <button class="delete-btn" data-id="${escapeHtml(
                  item.id
                )}">${escapeHtml(T("common.delete"))}</button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    costsTableContainer.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmed = await WalajnaDialog.confirm(T("costs.confirmDelete"), {
          danger: true,
        });
        if (!confirmed) return;

        const row = getCosts().find((item) => String(item.id) === String(id));
        if (useServerCosts() && row && row.serverId != null && WalajnaCostsApi.deleteOnServer) {
          try {
            await WalajnaCostsApi.deleteOnServer(row.serverId);
            const apt = getApartment();
            await WalajnaCostsApi.refreshForApartment(apartmentId, apt?.id ?? apartmentId);
          } catch (e) {
            alert(e && e.message ? e.message : String(e));
            return;
          }
        } else {
          const updatedCosts = getCostsFromStorage().filter((item) => item.id !== id);
          saveCosts(updatedCosts);
        }
        renderPage();
      });
    });
  }

  function renderPage() {
    const apartment = getApartment();
    const allCosts = getApartmentCosts();
    const keyword = (searchInput.value || "").trim().toLowerCase();

    if (apartment) {
      pageSub.textContent = T("costs.subtitle", {
        n: apartment.number,
        b: apartment.buildingName || ""
      });
    }

    if (openCostModalBtn) {
      openCostModalBtn.disabled = false;
      openCostModalBtn.title = "";
    }

    let filteredCosts = allCosts;

    if (keyword) {
      filteredCosts = allCosts.filter((item) => {
        return (
          String(item.amount || "").includes(keyword) ||
          String(item.expenseDate || "").toLowerCase().includes(keyword) ||
          String(item.createdAt || "").toLowerCase().includes(keyword) ||
          String(item.notes || "").toLowerCase().includes(keyword) ||
          String(resolveRowTypeLabel(item) || "")
            .toLowerCase()
            .includes(keyword) ||
          String(fundingLabel(item.fundingSource) || "")
            .toLowerCase()
            .includes(keyword)
        );
      });
    }

    costsCount.textContent = T("costs.count", { n: allCosts.length });
    renderSummary(allCosts);
    renderTable(filteredCosts);
  }

  openCostModalBtn?.addEventListener("click", () => {
    openModal();
  });
  closeRecordCostModal?.addEventListener("click", closeModal);
  cancelRecordCostModal?.addEventListener("click", closeModal);
  costBackdrop?.addEventListener("click", closeModal);
  costFundingInput?.addEventListener("change", async () => {
    if (costFundingInput.value === "security_deposit") {
      const apartment = getApartment();
      const currentContractId = getCurrentContractId(apartment);
      if (currentContractId) {
        await loadDepositBalance(currentContractId);
      }
    }
    syncFundingUi();
  });

  searchInput?.addEventListener("input", renderPage);

  saveCostBtn?.addEventListener("click", async () => {
    const apartment = getApartment();
    const currentContractId = getCurrentContractId(apartment);

    const type = costTypeInput.value;
    const amount = Number(costAmountInput.value);
    const status = (costStatusInput && costStatusInput.value) || "approved";
    const fundingSource = (costFundingInput && costFundingInput.value) || "owner";
    const expenseDate = costDateInput.value;
    const notes = costNotesInput.value.trim();

    if (!type || !amount || amount <= 0 || !expenseDate) {
      alert(T("costs.fillRequired"));
      return;
    }

    if (fundingSource === "security_deposit" && !currentContractId) {
      alert(T("costs.depositNeedsContract"));
      return;
    }

    let depositCoveredAmount = 0;
    if (fundingSource === "security_deposit") {
      const rawText = String(costDepositCoverInput?.value ?? "").trim();
      if (rawText === "") {
        alert(T("costs.depositCoverRequired"));
        return;
      }
      const raw = Number(rawText);
      if (!Number.isFinite(raw) || raw < 0) {
        alert(T("costs.depositCoverInvalid"));
        return;
      }
      depositCoveredAmount = raw;
      if (depositCoveredAmount > amount) {
        alert(T("costs.depositCoverExceeds"));
        return;
      }
      if (depositCoveredAmount > depositBalanceRemaining + 0.0001) {
        alert(T("costs.depositInsufficient"));
        return;
      }
    }

    const newCost = {
      id: `COST-${Date.now()}`,
      apartmentId,
      contractId: currentContractId || null,
      type,
      typeLabel: typeLabel(type),
      amount,
      status,
      fundingSource,
      depositCoveredAmount: depositCoveredAmount || 0,
      expenseDate,
      createdAt: new Date().toISOString().slice(0, 10),
      notes
    };

    if (useServerCosts() && WalajnaCostsApi.createOnServer) {
      try {
        await WalajnaCostsApi.createOnServer({
          apartmentId: String(apartmentId),
          contractId: currentContractId || null,
          type,
          amount,
          status,
          fundingSource,
          depositCoveredAmount:
            fundingSource === "security_deposit" ? depositCoveredAmount : 0,
          expenseDate,
          notes
        });
        await WalajnaCostsApi.refreshForApartment(apartmentId, apartment?.id ?? apartmentId);
      } catch (e) {
        alert(e && e.message ? e.message : String(e));
        return;
      }
    } else {
      const costs = getCostsFromStorage();
      costs.unshift(newCost);
      saveCosts(costs);
    }
    closeModal();
    renderPage();
  });

  document.addEventListener("walajna:i18n-applied", () => renderPage());

  await ensureServerCosts();
  clearApartmentCostsLoading();
  renderPage();
});
