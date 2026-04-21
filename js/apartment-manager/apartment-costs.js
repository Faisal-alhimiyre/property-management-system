document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("id");
  const forcedContractId = params.get("contractId");

  if (!apartmentId) {
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
  const costDateInput = document.getElementById("costDateInput");
  const costNotesInput = document.getElementById("costNotesInput");
  const saveCostBtn = document.getElementById("saveCostBtn");

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

    if (!currentContractId) {
      return [];
    }

    return getCosts().filter(
      (item) => String(item.contractId ?? "") === String(currentContractId ?? "")
    );
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

  function openModal() {
    const apartment = getApartment();
    const currentContractId = getCurrentContractId(apartment);

    if (!currentContractId) {
      alert(T("costs.needContract"));
      return;
    }

    recordCostModal.setAttribute("aria-hidden", "false");
    selectedCostInfo.textContent = T("costs.newForApt", {
      n: apartment?.number || apartmentId
    });
    costDateInput.value = new Date().toISOString().slice(0, 10);
  }

  function closeModal() {
    recordCostModal.setAttribute("aria-hidden", "true");
    costTypeInput.value = "";
    costAmountInput.value = "";
    costStatusInput.value = "approved";
    costDateInput.value = "";
    costNotesInput.value = "";
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
            <th>${escapeHtml(T("costs.th.status"))}</th>
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
                <span class="badge ${item.status}">
                  ${escapeHtml(statusLabel(item.status))}
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
        const confirmed = confirm(T("costs.confirmDelete"));
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
    const currentContractId = getCurrentContractId(apartment);
    const allCosts = getApartmentCosts();
    const keyword = (searchInput.value || "").trim().toLowerCase();

    if (apartment) {
      pageSub.textContent = T("costs.subtitle", {
        n: apartment.number,
        b: apartment.buildingName || ""
      });
    }

    if (openCostModalBtn) {
      openCostModalBtn.disabled = !currentContractId;
      openCostModalBtn.title = currentContractId
        ? ""
        : T("costs.needContract");
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
          String(statusLabel(item.status) || "")
            .toLowerCase()
            .includes(keyword)
        );
      });
    }

    costsCount.textContent = T("costs.count", { n: allCosts.length });
    renderSummary(allCosts);
    renderTable(filteredCosts);
  }

  openCostModalBtn?.addEventListener("click", openModal);
  closeRecordCostModal?.addEventListener("click", closeModal);
  cancelRecordCostModal?.addEventListener("click", closeModal);
  costBackdrop?.addEventListener("click", closeModal);

  searchInput?.addEventListener("input", renderPage);

  saveCostBtn?.addEventListener("click", async () => {
    const apartment = getApartment();
    const currentContractId = getCurrentContractId(apartment);

    if (!currentContractId) {
      alert(T("costs.needContract"));
      return;
    }

    const type = costTypeInput.value;
    const amount = Number(costAmountInput.value);
    const status = costStatusInput.value;
    const expenseDate = costDateInput.value;
    const notes = costNotesInput.value.trim();

    if (!type || !amount || amount <= 0 || !expenseDate) {
      alert(T("costs.fillRequired"));
      return;
    }

    const newCost = {
      id: `COST-${Date.now()}`,
      apartmentId,
      contractId: currentContractId,
      type,
      typeLabel: typeLabel(type),
      amount,
      status,
      expenseDate,
      createdAt: new Date().toISOString().slice(0, 10),
      notes
    };

    if (useServerCosts() && WalajnaCostsApi.createOnServer) {
      try {
        await WalajnaCostsApi.createOnServer({
          apartmentId: String(apartmentId),
          contractId: currentContractId,
          type,
          amount,
          status,
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
  renderPage();
});
