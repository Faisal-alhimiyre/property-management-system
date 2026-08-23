document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
    } catch (e) {
      console.warn("[history-details] apartments cache failed", e);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("apartmentId");

  if (
    apartmentId &&
    typeof WalajnaDocumentsApi !== "undefined" &&
    WalajnaDocumentsApi.refreshForApartment &&
    WalajnaAuth?.getCurrentUser?.()
  ) {
    try {
      let serverAid = apartmentId;
      if (typeof getApartments === "function") {
        const apt = getApartments().find((a) => String(a.id) === String(apartmentId));
        if (apt) serverAid = apt.apiId != null ? apt.apiId : apt.id;
      }
      await WalajnaDocumentsApi.refreshForApartment(apartmentId, serverAid);
    } catch (e) {
      console.warn("[history-details] documents refresh failed", e);
    }
  }
  const historyId = params.get("historyId");

  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const heroStartDate = document.getElementById("heroStartDate");
  const heroEndDate = document.getElementById("heroEndDate");

  const aptNumber = document.getElementById("aptNumber");
  const buildingName = document.getElementById("buildingName");
  const floorNumber = document.getElementById("floorNumber");
  const rentAmount = document.getElementById("rentAmount");

  const tenantFullName = document.getElementById("tenantFullName");
  const tenantNationality = document.getElementById("tenantNationality");
  const phoneNumber = document.getElementById("phoneNumber");
  const identityNumber = document.getElementById("identityNumber");
  const tenantType = document.getElementById("tenantType");
  const archivedAt = document.getElementById("archivedAt");

  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const meterNumber = document.getElementById("meterNumber");
  const insurancePaid = document.getElementById("insurancePaid");
  const insuranceDeducted = document.getElementById("insuranceDeducted");
  const insuranceReturned = document.getElementById("insuranceReturned");
  const insuranceUnsettled = document.getElementById("insuranceUnsettled");
  const settleInsuranceBtn = document.getElementById("settleInsuranceBtn");
  const insuranceSettledStatus = document.getElementById("insuranceSettledStatus");
  const notes = document.getElementById("notes");

  const openContractBtn = document.getElementById("openContractBtn");
  const viewPaymentsBtn = document.getElementById("viewPaymentsBtn");
  const viewCostsBtn = document.getElementById("viewCostsBtn");
  const viewRequestsBtn = document.getElementById("viewRequestsBtn");
  const requestsModal = document.getElementById("requestsModal");
  const requestsModalBody = document.getElementById("requestsModalBody");
  const closeRequestsModalBtn = document.getElementById("closeRequestsModalBtn");

  const contractModal = document.getElementById("contractModal");
  const contractModalBody = document.getElementById("contractModalBody");
  const closeContractModalBtn = document.getElementById("closeContractModalBtn");

  const paymentsModal = document.getElementById("paymentsModal");
  const paymentsModalBody = document.getElementById("paymentsModalBody");
  const closePaymentsModalBtn = document.getElementById("closePaymentsModalBtn");

  const costsModal = document.getElementById("costsModal");
  const costsModalBody = document.getElementById("costsModalBody");
  const closeCostsModalBtn = document.getElementById("closeCostsModalBtn");

  const moduleButtons = [
    viewRequestsBtn,
    openContractBtn,
    viewPaymentsBtn,
    viewCostsBtn,
  ].filter(Boolean);

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
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB-u-nu-latn"
          : "ar-SA-u-nu-latn";
    return date.toLocaleDateString(loc);
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return T("common.dash");
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA-u-nu-latn"
          : "ar-SA-u-nu-latn";
    return `${number.toLocaleString(loc)} ${T("common.sar")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getApartmentNumber(apartment, historyEntry) {
    return (
      historyEntry?.apartmentNumber ||
      apartment?.number ||
      apartment?.apartmentNumber ||
      T("common.dash")
    );
  }

  function getTenantName(historyEntry) {
    return (
      historyEntry?.tenantInfo?.fullName ||
      historyEntry?.tenantInfo?.name ||
      T("historyDet.prevTenant")
    );
  }

  function getHistoricalContractId(historyEntry) {
    return (
      historyEntry?.contractId ||
      historyEntry?.contract?.id ||
      historyEntry?.currentContractId ||
      null
    );
  }

  function getRequestStatusLabel(status) {
    if (status === "resolved") return T("historyDet.req.resolved");
    if (status === "closed") return T("historyDet.req.closed");
    if (status === "in_progress") return T("historyDet.req.in_progress");
    return T("historyDet.req.new");
  }

  function getPaymentStatusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "paid") return T("payments.paid");
    if (s === "pending") return T("payments.due");
    if (s === "overdue") return T("payments.overdue");
    if (s === "cancelled") return T("payments.cancelled");
    return status || T("common.dash");
  }

  function setActiveModule(moduleName) {
    moduleButtons.forEach((btn) => {
      const isActive = moduleName && btn.dataset.historyModule === moduleName;
      btn.classList.toggle("is-active", !!isActive);
    });
  }

  function openModal(modal, moduleName) {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (moduleName) setActiveModule(moduleName);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setActiveModule(null);
  }

  function closeAllModals() {
    closeModal(requestsModal);
    closeModal(contractModal);
    closeModal(paymentsModal);
    closeModal(costsModal);
  }

  function renderRequestsModal(requests) {
    if (!requestsModalBody) return;

    if (!Array.isArray(requests) || !requests.length) {
      requestsModalBody.innerHTML = `
        <div class="history-request-empty">${escapeHtml(T("historyDet.requestsEmpty"))}</div>
      `;
      return;
    }

    requestsModalBody.innerHTML = `
      <div class="history-requests-grid">
        ${requests
          .map((request) => {
            const title =
              request.title ||
              request.subject ||
              request.category ||
              request.typeLabel ||
              T("historyDet.reqDefaultTitle");

            const statusRaw = request.status || "new";
            const statusLabel = getRequestStatusLabel(statusRaw);

            const createdAt = formatDate(request.createdAt || request.date);
            const typeLabel =
              request.typeLabel ||
              request.typeName ||
              request.typeId ||
              T("common.dash");

            const description =
              request.description ||
              request.details ||
              request.notes ||
              T("common.dash");

            const ownerReply =
              request.ownerReply ||
              request.reply ||
              request.response ||
              request.resolutionNote ||
              T("historyDet.noOwnerReply");

            const contractId = request.contractId || T("common.dash");

            return `
            <div class="history-request-card">
              <div class="history-request-card__head">
                <h3 class="history-request-card__title">${escapeHtml(title)}</h3>
                <span class="history-request-status ${escapeHtml(statusRaw)}">
                  ${escapeHtml(statusLabel)}
                </span>
              </div>

              <div class="history-request-grid">
                <div class="history-request-box">
                  <span>${escapeHtml(T("historyDet.reqDate"))}</span>
                  <strong>${escapeHtml(createdAt)}</strong>
                </div>

                <div class="history-request-box">
                  <span>${escapeHtml(T("historyDet.reqType"))}</span>
                  <strong>${escapeHtml(typeLabel)}</strong>
                </div>

                <div class="history-request-box">
                  <span>${escapeHtml(T("historyDet.reqContract"))}</span>
                  <strong>${escapeHtml(contractId)}</strong>
                </div>
              </div>

              <div class="history-request-note">
                <span>${escapeHtml(T("historyDet.reqDesc"))}</span>
                <strong>${escapeHtml(description)}</strong>
              </div>

              <div class="history-request-note">
                <span>${escapeHtml(T("historyDet.reqOwnerReply"))}</span>
                <strong>${escapeHtml(ownerReply)}</strong>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  function renderPaymentsRows(rows) {
    if (!paymentsModalBody) return;
    if (!Array.isArray(rows) || !rows.length) {
      paymentsModalBody.innerHTML = `
        <div class="history-request-empty">${escapeHtml(T("historyDet.paymentsEmpty"))}</div>
      `;
      return;
    }

    paymentsModalBody.innerHTML = `
      <div class="history-module-table-wrap">
        <table class="history-module-table">
          <thead>
            <tr>
              <th>${escapeHtml(T("historyDet.th.due"))}</th>
              <th>${escapeHtml(T("historyDet.th.amount"))}</th>
              <th>${escapeHtml(T("historyDet.th.status"))}</th>
              <th>${escapeHtml(T("historyDet.th.paidAt"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const due = formatDate(row.due_date || row.dueDate);
                const amount = formatMoney(row.amount);
                const status = getPaymentStatusLabel(row.status);
                const paidAt = row.paid_at || row.paidAt
                  ? formatDate(row.paid_at || row.paidAt)
                  : T("common.dash");
                return `
                  <tr>
                    <td>${escapeHtml(due)}</td>
                    <td>${escapeHtml(amount)}</td>
                    <td>${escapeHtml(status)}</td>
                    <td>${escapeHtml(paidAt)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCostsRows(rows) {
    if (!costsModalBody) return;
    if (!Array.isArray(rows) || !rows.length) {
      costsModalBody.innerHTML = `
        <div class="history-request-empty">${escapeHtml(T("historyDet.costsEmpty"))}</div>
      `;
      return;
    }

    costsModalBody.innerHTML = `
      <div class="history-module-table-wrap">
        <table class="history-module-table">
          <thead>
            <tr>
              <th>${escapeHtml(T("historyDet.th.date"))}</th>
              <th>${escapeHtml(T("historyDet.th.amount"))}</th>
              <th>${escapeHtml(T("historyDet.th.type"))}</th>
              <th>${escapeHtml(T("historyDet.th.funding"))}</th>
              <th>${escapeHtml(T("historyDet.th.notes"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const date = formatDate(
                  row.expenseDate || row.expense_date || row.date
                );
                const amount = formatMoney(row.amount);
                const type =
                  row.typeLabel ||
                  row.type ||
                  row.cost_type ||
                  T("common.dash");
                const fundingRaw = String(
                  row.fundingSource || row.funding_source || "owner"
                );
                const funding =
                  fundingRaw === "security_deposit"
                    ? T("costs.funding.deposit")
                    : T("costs.funding.owner");
                const note = row.notes || T("common.dash");
                return `
                  <tr>
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(amount)}</td>
                    <td>${escapeHtml(type)}</td>
                    <td>${escapeHtml(funding)}</td>
                    <td>${escapeHtml(note)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function disableActions(message) {
    moduleButtons.forEach((btn) => {
      btn.disabled = true;
    });
  }

  const apartments =
    typeof getApartments === "function"
      ? getApartments()
      : getLocalArray("walajna_apartments");
  const documents =
    typeof getDocuments === "function" ? getDocuments() : getLocalArray("walajna_documents");
  let dbRequestsRaw = [];

  const apartment = apartments.find(
    (apt) => String(apt.id) === String(apartmentId)
  );

  if (apartment && typeof WalajnaTenantRequests !== "undefined" && WalajnaAuth?.fetchWithAuth) {
    const aid = Number(apartment.apiId ?? apartment.id);
    if (Number.isFinite(aid) && aid >= 1) {
      try {
        dbRequestsRaw = await WalajnaTenantRequests.list(aid);
      } catch (e) {
        console.warn("[history-details] requests", e);
      }
    }
  }

  let historyEntry = null;
  let historicalContractId = null;
  let apartmentNumberValue = "";
  let matchingRequests = [];
  let matchingContractDoc = null;
  let historyCosts = [];

  function contractFileNameNeedle() {
    return T("lease.fileName", { n: apartmentNumberValue }).replace(/\.html$/i, "");
  }

  function computeContractDoc() {
    const aptIds = new Set(
      [apartmentId, apartment?.id, apartment?.apiId]
        .filter((v) => v != null && String(v).trim() !== "")
        .map((v) => String(v))
    );

    const candidates = (documents || []).filter((doc) =>
      aptIds.has(String(doc.apartmentId ?? ""))
    );

    // Prefer exact contract id match when available.
    if (historicalContractId) {
      const byContract = candidates.find(
        (doc) =>
          doc.contractId != null &&
          String(doc.contractId) === String(historicalContractId)
      );
      if (byContract) {
        matchingContractDoc = byContract;
        return;
      }
    }

    // Lease contract documents (legacy schemas store type in `type` / docType).
    const leaseDocs = candidates.filter((doc) => {
      const t = String(doc.docType || doc.type || "").toLowerCase();
      const name = String(doc.fileName || doc.name || "").toLowerCase();
      return (
        t === "auto_lease_contract" ||
        t.includes("lease") ||
        t.includes("contract") ||
        name.includes("عقد") ||
        name.includes("contract") ||
        name.includes("lease")
      );
    });

    if (leaseDocs.length === 1) {
      matchingContractDoc = leaseDocs[0];
      return;
    }

    if (leaseDocs.length > 1) {
      const needle = contractFileNameNeedle().toLowerCase();
      matchingContractDoc =
        leaseDocs.find((doc) =>
          String(doc.fileName || "").toLowerCase().includes(needle)
        ) || leaseDocs[0];
      return;
    }

    matchingContractDoc = null;
  }

  function updateContractHint() {
    if (openContractBtn) openContractBtn.disabled = false;
  }

  async function enrichContractFromApi(contractId, contractObj) {
    const base = contractObj && typeof contractObj === "object" ? { ...contractObj } : {};
    if (
      !contractId ||
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth
    ) {
      return base;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(String(contractId))}`,
        { method: "GET" }
      );
      if (!res.ok) return base;
      const row = await res.json();
      if (!row || typeof row !== "object") return base;
      return {
        ...base,
        id: row.id ?? base.id ?? contractId,
        startDate: base.startDate || row.start_date || row.startDate,
        endDate: base.endDate || row.end_date || row.endDate,
        yearlyRent: base.yearlyRent ?? row.yearly_rent ?? row.yearlyRent,
        paymentCycle: base.paymentCycle || row.payment_cycle || row.paymentCycle,
        insurancePaid:
          base.insurancePaid ??
          base.insurance_paid ??
          row.insurance_paid ??
          row.insurancePaid,
        meterNumber:
          base.meterNumber ||
          base.meter_number ||
          row.meter_number ||
          row.meterNumber ||
          "",
        notes: base.notes || row.lease_notes || row.notes || "",
      };
    } catch (e) {
      console.warn("[history-details] contract enrich failed", e);
      return base;
    }
  }

  function openContractModule() {
    if (!matchingContractDoc) {
      if (contractModalBody) {
        contractModalBody.innerHTML = `
          <div class="history-request-empty">${escapeHtml(T("historyDet.noContractFile"))}</div>
        `;
      }
      openModal(contractModal, "contract");
      return;
    }

    const fileData = matchingContractDoc.fileData || matchingContractDoc.url;
    if (!fileData) {
      if (contractModalBody) {
        contractModalBody.innerHTML = `
          <div class="history-request-empty">${escapeHtml(T("historyDet.contractNoPreview"))}</div>
        `;
      }
      openModal(contractModal, "contract");
      return;
    }

    if (contractModalBody) {
      contractModalBody.innerHTML = `<iframe title="${escapeHtml(
        matchingContractDoc.fileName || T("historyDet.docTitleFallback")
      )}" src="${fileData}"></iframe>`;
    }
    openModal(contractModal, "contract");
  }

  async function loadDepositLedgerFields(contractId) {
    if (insuranceDeducted) insuranceDeducted.textContent = T("common.dash");
    if (insuranceReturned) insuranceReturned.textContent = T("common.dash");
    if (insuranceUnsettled) insuranceUnsettled.textContent = T("common.dash");
    const unsettledRowReset = document.getElementById("historyInsuranceUnsettledRow");
    if (unsettledRowReset) unsettledRowReset.classList.remove("is-unsettled");
    if (settleInsuranceBtn) settleInsuranceBtn.hidden = true;
    if (insuranceSettledStatus) insuranceSettledStatus.hidden = true;
    if (
      !contractId ||
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth
    ) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/deposits/balance?contract_id=${encodeURIComponent(
          String(contractId)
        )}`,
        { method: "GET" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (insuranceDeducted) {
        insuranceDeducted.textContent = formatMoney(data.used);
      }
      if (insuranceReturned) {
        insuranceReturned.textContent = formatMoney(data.refunded);
      }
      const remaining = Number(data.remaining || 0);
      if (insuranceUnsettled) {
        insuranceUnsettled.textContent = formatMoney(remaining);
      }
      const unsettledRow = document.getElementById("historyInsuranceUnsettledRow");
      if (unsettledRow) {
        unsettledRow.classList.toggle("is-unsettled", remaining > 0.009);
      }
      const settled = remaining <= 0.009;
      if (settleInsuranceBtn) settleInsuranceBtn.hidden = settled;
      if (insuranceSettledStatus) insuranceSettledStatus.hidden = !settled;
    } catch (e) {
      console.warn("[history-details] deposit balance failed", e);
    }
  }

  if (settleInsuranceBtn) {
    settleInsuranceBtn.addEventListener("click", async () => {
      if (
        !historicalContractId ||
        !window.WalajnaInsuranceSettle ||
        typeof WalajnaInsuranceSettle.settleEndedContract !== "function"
      ) {
        return;
      }
      const aptId = apartment?.apiId ?? apartment?.id ?? apartmentId;
      try {
        settleInsuranceBtn.disabled = true;
        const updated = await WalajnaInsuranceSettle.settleEndedContract({
          contractId: historicalContractId,
          apartmentId: aptId,
        });
        if (updated) {
          await loadDepositLedgerFields(historicalContractId);
        }
      } catch (e) {
        alert(e?.message || T("insSettle.settleFailed"));
      } finally {
        settleInsuranceBtn.disabled = false;
      }
    });
  }

  async function openPaymentsModule() {
    if (paymentsModalBody) {
      paymentsModalBody.innerHTML = `
        <div class="history-request-empty">${escapeHtml(T("historyDet.paymentsLoading"))}</div>
      `;
    }
    openModal(paymentsModal, "payments");

    if (!historicalContractId) {
      if (paymentsModalBody) {
        paymentsModalBody.innerHTML = `
          <div class="history-request-empty">${escapeHtml(T("historyDet.paymentsNoContract"))}</div>
        `;
      }
      return;
    }

    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth
    ) {
      renderPaymentsRows([]);
      return;
    }

    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(
          String(historicalContractId)
        )}/installments`,
        { method: "GET" }
      );
      if (!res.ok) {
        renderPaymentsRows([]);
        return;
      }
      const rows = await res.json();
      const list = Array.isArray(rows) ? rows : [];
      list.sort((a, b) => {
        const da = String(a.due_date || "");
        const db = String(b.due_date || "");
        if (da !== db) return da.localeCompare(db);
        return Number(a.installment_index || 0) - Number(b.installment_index || 0);
      });
      renderPaymentsRows(list);
    } catch (e) {
      console.warn("[history-details] installments fetch failed", e);
      renderPaymentsRows([]);
    }
  }

  async function openCostsModule() {
    if (costsModalBody) {
      costsModalBody.innerHTML = `
        <div class="history-request-empty">${escapeHtml(T("historyDet.costsLoading"))}</div>
      `;
    }
    openModal(costsModal, "costs");

    if (Array.isArray(historyCosts) && historyCosts.length) {
      renderCostsRows(historyCosts);
      return;
    }

    // Fallback: live costs still linked to this historical contract (if any remain).
    if (
      historicalContractId &&
      typeof WalajnaAuth !== "undefined" &&
      WalajnaAuth.fetchWithAuth &&
      apartment
    ) {
      try {
        const aid = apartment.apiId ?? apartment.id;
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/apartments/${encodeURIComponent(
            String(aid)
          )}/costs`,
          { method: "GET" }
        );
        if (res.ok) {
          const rows = await res.json();
          const filtered = (Array.isArray(rows) ? rows : []).filter(
            (row) =>
              row &&
              String(row.contract_id ?? "") === String(historicalContractId)
          );
          renderCostsRows(
            filtered.map((row) => ({
              expenseDate: row.expense_date,
              amount: row.amount,
              type: row.cost_type,
              fundingSource: row.funding_source,
              notes: row.notes,
            }))
          );
          return;
        }
      } catch (e) {
        console.warn("[history-details] costs fetch failed", e);
      }
    }

    renderCostsRows([]);
  }

  async function fillPage() {
    if (!apartment || !historyEntry) return;

    const tenantInfo = historyEntry.tenantInfo || {};
    historicalContractId = getHistoricalContractId(historyEntry);
    let contract = historyEntry.contract || {};
    contract = await enrichContractFromApi(historicalContractId, contract);
    historyEntry.contract = contract;
    apartmentNumberValue = getApartmentNumber(apartment, historyEntry);
    historyCosts = Array.isArray(historyEntry.costs) ? historyEntry.costs : [];

    if (pageTitle) pageTitle.textContent = getTenantName(historyEntry);

    if (pageSubtitle) {
      pageSubtitle.textContent = T("history.pageSubApt", {
        n: apartmentNumberValue,
        b: historyEntry.buildingName || apartment.buildingName || T("common.dash"),
      });
    }

    if (heroStartDate) heroStartDate.textContent = formatDate(contract.startDate);
    if (heroEndDate) heroEndDate.textContent = formatDate(contract.endDate);

    if (aptNumber) aptNumber.textContent = apartmentNumberValue;
    if (buildingName) {
      buildingName.textContent =
        historyEntry.buildingName || apartment.buildingName || T("common.dash");
    }
    if (floorNumber) {
      floorNumber.textContent =
        apartment.floorNumber ?? contract.floorNumber ?? T("common.dash");
    }
    if (rentAmount) {
      const y = Number(contract.yearlyRent ?? contract.yearly_rent);
      const m = Number.isFinite(y) && y > 0 ? y / 12 : Number(contract.rentAmount || 0);
      rentAmount.textContent = formatMoney(m);
    }

    if (tenantFullName) {
      tenantFullName.textContent = tenantInfo.fullName || tenantInfo.name || T("common.dash");
    }
    if (tenantNationality) tenantNationality.textContent = tenantInfo.nationality || T("common.dash");
    if (phoneNumber) {
      phoneNumber.textContent = tenantInfo.phoneNumber || tenantInfo.phone || T("common.dash");
    }
    if (identityNumber) {
      identityNumber.textContent = historyEntry.tenantNationalId || T("common.dash");
    }
    if (tenantType) tenantType.textContent = tenantInfo.tenantType || T("common.dash");
    if (archivedAt) {
      archivedAt.textContent = formatDate(
        historyEntry.archivedAt || historyEntry.vacatedAt || historyEntry.changed_at
      );
    }

    if (startDate) startDate.textContent = formatDate(contract.startDate);
    if (endDate) endDate.textContent = formatDate(contract.endDate);
    if (meterNumber) {
      meterNumber.textContent =
        contract.meterNumber || contract.meter_number || T("common.dash");
    }
    if (insurancePaid) {
      const paid = contract.insurancePaid ?? contract.insurance_paid;
      insurancePaid.textContent =
        paid != null && String(paid).trim() !== ""
          ? formatMoney(paid)
          : T("common.dash");
    }
    if (notes) notes.textContent = contract.notes || T("common.dash");

    matchingRequests = (dbRequestsRaw || [])
      .filter((row) => {
        if (String(row.apartment_id) !== String(apartment.apiId ?? apartmentId)) {
          // Also accept client apartmentId string matches for local/dev shapes.
          if (String(row.apartment_id) !== String(apartmentId)) return false;
        }

        if (
          historicalContractId &&
          row.contract_id != null &&
          String(row.contract_id) === String(historicalContractId)
        ) {
          return true;
        }

        if (
          historyEntry.tenantNationalId &&
          row.tenant_national_id &&
          String(row.tenant_national_id) === String(historyEntry.tenantNationalId)
        ) {
          return true;
        }

        return false;
      })
      .sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .map((row) => ({
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        typeLabel: row.request_type,
        description: row.description,
        ownerReply: row.owner_reply,
        contractId: row.contract_id,
      }));

    renderRequestsModal(matchingRequests);
    computeContractDoc();
    updateContractHint();
    await loadDepositLedgerFields(historicalContractId);
  }

  if (!apartment) {
    if (pageTitle) pageTitle.textContent = T("historyDet.errAptTitle");
    if (pageSubtitle) pageSubtitle.textContent = T("historyDet.errAptSub");
    disableActions(T("historyDet.errAptActions"));
    renderRequestsModal([]);
    return;
  }

  function mapApartmentHistoryApiRow(row, apt, aidStr) {
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
      apartmentId: aidStr,
      buildingName:
        old.buildingName ||
        old.building_name ||
        apt.buildingName ||
        apt.building_name ||
        "",
      apartmentNumber:
        old.apartmentNumber ||
        old.apartment_number ||
        apt.number ||
        apt.apartmentNumber ||
        "",
      tenantInfo: old.tenantInfo || old.tenant_info || {},
      tenantNationalId: old.tenantNationalId ?? old.tenant_national_id ?? null,
      tenantUserId: old.tenantUserId ?? old.tenant_user_id ?? null,
      contract: {
        id: cid,
        startDate: c.startDate || c.start_date,
        endDate: c.endDate || c.end_date,
        yearlyRent: c.yearlyRent ?? c.yearly_rent,
        paymentCycle: c.paymentCycle || c.payment_cycle,
        insurancePaid: c.insurancePaid ?? c.insurance_paid,
        meterNumber: c.meterNumber || c.meter_number,
        notes: c.notes || c.lease_notes || "",
        rentAmount:
          old.rent != null && old.rent !== ""
            ? Number(old.rent) * 12
            : undefined,
      },
      costs: Array.isArray(old.costs) ? old.costs : [],
      contractId: cid,
      currentContractId: cid,
      vacatedAt: old.vacatedAt || old.vacated_at || null,
      archivedAt: row.changed_at || old.vacatedAt || old.vacated_at || null,
      archiveReason: row.change_type || "tenant_vacated",
    };
  }

  let historyList = Array.isArray(apartment.tenantHistory)
    ? [...apartment.tenantHistory]
    : [];

  {
    const apiAid = Number(apartment.apiId ?? apartment.id);
    if (
      typeof WalajnaAuth !== "undefined" &&
      WalajnaAuth.getCurrentUser?.() &&
      WalajnaAuth.fetchWithAuth &&
      WalajnaAuth.API_BASE &&
      Number.isFinite(apiAid)
    ) {
      try {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/apartments/${apiAid}/tenant-history`
        );
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length) {
            historyList = rows.map((r) =>
              mapApartmentHistoryApiRow(r, apartment, apartmentId)
            );
          }
        }
      } catch (e) {
        console.warn("[history-details] tenant-history API", e);
      }
    }
  }

  historyEntry = historyList.find(
    (item) => String(item.historyId) === String(historyId)
  );

  if (!historyEntry) {
    if (pageTitle) pageTitle.textContent = T("historyDet.errEntryTitle");
    if (pageSubtitle) pageSubtitle.textContent = T("historyDet.errEntrySub");
    disableActions(T("historyDet.errEntryActions"));
    renderRequestsModal([]);
    return;
  }

  await fillPage();

  document.addEventListener("walajna:i18n-applied", () => {
    void fillPage().then(() => {
      if (window.walajna_language && window.walajna_language.apply) {
        window.walajna_language.apply(document.body);
      }
    });
  });

  viewRequestsBtn?.addEventListener("click", () => {
    renderRequestsModal(matchingRequests);
    openModal(requestsModal, "requests");
  });

  openContractBtn?.addEventListener("click", () => {
    openContractModule();
  });

  viewPaymentsBtn?.addEventListener("click", () => {
    void openPaymentsModule();
  });

  viewCostsBtn?.addEventListener("click", () => {
    void openCostsModule();
  });

  closeRequestsModalBtn?.addEventListener("click", () => closeModal(requestsModal));
  closeContractModalBtn?.addEventListener("click", () => closeModal(contractModal));
  closePaymentsModalBtn?.addEventListener("click", () => closeModal(paymentsModal));
  closeCostsModalBtn?.addEventListener("click", () => closeModal(costsModal));

  document.querySelectorAll("[data-history-close]").forEach((el) => {
    el.addEventListener("click", () => {
      const which = el.getAttribute("data-history-close");
      if (which === "requests") closeModal(requestsModal);
      if (which === "contract") closeModal(contractModal);
      if (which === "payments") closeModal(paymentsModal);
      if (which === "costs") closeModal(costsModal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
});
