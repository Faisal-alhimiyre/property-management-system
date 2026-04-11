document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("apartmentId");
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
  const notes = document.getElementById("notes");

  const openContractBtn = document.getElementById("openContractBtn");
  const viewPaymentsBtn = document.getElementById("viewPaymentsBtn");
  const viewCostsBtn = document.getElementById("viewCostsBtn");
  const viewRequestsBtn = document.getElementById("viewRequestsBtn");
  const contractHint = document.getElementById("contractHint");

  const requestsModal = document.getElementById("requestsModal");
  const requestsModalBody = document.getElementById("requestsModalBody");
  const closeRequestsModalBtn = document.getElementById("closeRequestsModalBtn");

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
          ? "en-GB"
          : "ar-SA";
    return date.toLocaleDateString(loc);
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    if (!number) return T("common.dash");
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA"
          : "ar-SA";
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

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
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

  function disableActions(message) {
    if (openContractBtn) openContractBtn.disabled = true;
    if (viewPaymentsBtn) viewPaymentsBtn.disabled = true;
    if (viewCostsBtn) viewCostsBtn.disabled = true;
    if (viewRequestsBtn) viewRequestsBtn.disabled = true;
    if (contractHint && message) contractHint.textContent = message;
  }

  const apartments = getLocalArray("walajna_apartments");
  const documents = getLocalArray("walajna_documents");
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

  function contractFileNameNeedle() {
    return T("lease.fileName", { n: apartmentNumberValue }).replace(/\.html$/i, "");
  }

  function bindContractOpen() {
    if (!openContractBtn) return;
    openContractBtn.replaceWith(openContractBtn.cloneNode(true));
    const btn = document.getElementById("openContractBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (!matchingContractDoc) return;

      const fileData = matchingContractDoc.fileData || matchingContractDoc.url;
      if (!fileData) {
        alert(T("historyDet.contractNoPreview"));
        return;
      }

      const win = window.open();
      if (!win) return;

      const lang = document.documentElement.getAttribute("lang") || "ar";
      const dir = document.documentElement.getAttribute("dir") || "rtl";

      win.document.write(`
        <html lang="${escapeHtml(lang)}" dir="${escapeHtml(dir)}">
          <head>
            <meta charset="UTF-8" />
            <title>${escapeHtml(matchingContractDoc.fileName || T("historyDet.docTitleFallback"))}</title>
            <style>
              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                min-height: 100%;
                background: #f8fafc;
              }
              iframe {
                border: none;
                width: 100%;
                min-height: 100vh;
                background: #fff;
              }
            </style>
          </head>
          <body>
            <iframe src="${fileData}"></iframe>
          </body>
        </html>
      `);
    });
  }

  function computeContractDoc() {
    matchingContractDoc = documents.find((doc) => {
      if (String(doc.apartmentId) !== String(apartmentId)) return false;

      if (historicalContractId && doc.contractId) {
        return String(doc.contractId) === String(historicalContractId);
      }

      if (doc.docType !== "auto_lease_contract") return false;

      const fileName = doc.fileName || "";
      return fileName.includes(contractFileNameNeedle());
    });
  }

  function updateContractHint() {
    if (!matchingContractDoc) {
      if (contractHint) {
        contractHint.textContent = T("historyDet.noContractFile");
      }
      const ob = document.getElementById("openContractBtn");
      if (ob) ob.disabled = true;
      return;
    }
    if (contractHint) {
      contractHint.textContent = historicalContractId
        ? T("historyDet.contractFoundWithId", { id: historicalContractId })
        : T("historyDet.contractFound");
    }
    const ob = document.getElementById("openContractBtn");
    if (ob) ob.disabled = false;
  }

  function fillPage() {
    if (!apartment || !historyEntry) return;

    const tenantInfo = historyEntry.tenantInfo || {};
    const contract = historyEntry.contract || {};
    historicalContractId = getHistoricalContractId(historyEntry);
    apartmentNumberValue = getApartmentNumber(apartment, historyEntry);

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
    if (rentAmount) rentAmount.textContent = formatMoney(contract.rentAmount || apartment.rent);

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
    if (archivedAt) archivedAt.textContent = formatDate(historyEntry.archivedAt);

    if (startDate) startDate.textContent = formatDate(contract.startDate);
    if (endDate) endDate.textContent = formatDate(contract.endDate);
    if (meterNumber) meterNumber.textContent = contract.meterNumber || T("common.dash");
    if (insurancePaid) insurancePaid.textContent = formatMoney(contract.insurancePaid);
    if (notes) notes.textContent = contract.notes || T("common.dash");

    matchingRequests = (dbRequestsRaw || [])
      .filter((row) => {
        if (String(row.apartment_id) !== String(apartmentId)) return false;

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
    bindContractOpen();
  }

  if (!apartment) {
    if (pageTitle) pageTitle.textContent = T("historyDet.errAptTitle");
    if (pageSubtitle) pageSubtitle.textContent = T("historyDet.errAptSub");
    disableActions(T("historyDet.errAptActions"));
    renderRequestsModal([]);
    return;
  }

  const historyList = Array.isArray(apartment.tenantHistory)
    ? apartment.tenantHistory
    : [];

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

  fillPage();

  document.addEventListener("walajna:i18n-applied", () => {
    fillPage();
    if (window.walajna_language && window.walajna_language.apply) {
      window.walajna_language.apply(document.body);
    }
  });

  if (viewRequestsBtn) {
    viewRequestsBtn.addEventListener("click", () => {
      renderRequestsModal(matchingRequests);
      openModal(requestsModal);
    });
  }

  if (closeRequestsModalBtn) {
    closeRequestsModalBtn.addEventListener("click", () => {
      closeModal(requestsModal);
    });
  }

  if (requestsModal) {
    const backdrop = requestsModal.querySelector(".history-modal__backdrop");
    backdrop?.addEventListener("click", () => closeModal(requestsModal));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal(requestsModal);
    }
  });

  if (viewPaymentsBtn) {
    viewPaymentsBtn.addEventListener("click", () => {
      let url =
        `../main/payments.html?id=${encodeURIComponent(apartmentId)}` +
        `&apartmentId=${encodeURIComponent(apartmentId)}` +
        `&historyId=${encodeURIComponent(historyId)}` +
        `&mode=history`;

      if (historicalContractId) {
        url += `&contractId=${encodeURIComponent(historicalContractId)}`;
      }

      window.location.href = url;
    });
  }

  if (viewCostsBtn) {
    viewCostsBtn.addEventListener("click", () => {
      let url =
        `../main/costs.html?id=${encodeURIComponent(apartmentId)}` +
        `&apartmentId=${encodeURIComponent(apartmentId)}` +
        `&historyId=${encodeURIComponent(historyId)}` +
        `&mode=history`;

      if (historicalContractId) {
        url += `&contractId=${encodeURIComponent(historicalContractId)}`;
      }

      window.location.href = url;
    });
  }
});
