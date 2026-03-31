document.addEventListener("DOMContentLoaded", () => {
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
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("ar-SA");
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    if (!number) return "—";
    return `${number.toLocaleString("en-US")} ريال`;
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
      "—"
    );
  }

  function getTenantName(historyEntry) {
    return (
      historyEntry?.tenantInfo?.fullName ||
      historyEntry?.tenantInfo?.name ||
      "مستأجر سابق"
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
    if (status === "resolved") return "تم الحل";
    if (status === "closed") return "مغلق";
    if (status === "in_progress") return "قيد المعالجة";
    return "جديد";
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
        <div class="history-request-empty">لا توجد طلبات محفوظة لهذا السجل</div>
      `;
      return;
    }

    requestsModalBody.innerHTML = `
      <div class="history-requests-grid">
        ${requests.map((request) => {
          const title =
            request.title ||
            request.subject ||
            request.category ||
            request.typeLabel ||
            "طلب مستأجر";

          const statusRaw = request.status || "new";
          const statusLabel = getRequestStatusLabel(statusRaw);

          const createdAt = formatDate(request.createdAt || request.date);
          const typeLabel =
            request.typeLabel || request.typeName || request.typeId || "—";

          const description =
            request.description ||
            request.details ||
            request.notes ||
            "—";

          const ownerReply =
            request.ownerReply ||
            request.reply ||
            request.response ||
            request.resolutionNote ||
            "لا يوجد رد من المالك";

          const contractId = request.contractId || "—";

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
                  <span>تاريخ الطلب</span>
                  <strong>${escapeHtml(createdAt)}</strong>
                </div>

                <div class="history-request-box">
                  <span>نوع الطلب</span>
                  <strong>${escapeHtml(typeLabel)}</strong>
                </div>

                <div class="history-request-box">
                  <span>رقم العقد</span>
                  <strong>${escapeHtml(contractId)}</strong>
                </div>
              </div>

              <div class="history-request-note">
                <span>وصف الطلب</span>
                <strong>${escapeHtml(description)}</strong>
              </div>

              <div class="history-request-note">
                <span>رد المالك</span>
                <strong>${escapeHtml(ownerReply)}</strong>
              </div>
            </div>
          `;
        }).join("")}
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
  const requests = getLocalArray("walajna_requests");

  const apartment = apartments.find(
    (apt) => String(apt.id) === String(apartmentId)
  );

  if (!apartment) {
    if (pageTitle) pageTitle.textContent = "تعذر العثور على الشقة";
    if (pageSubtitle) pageSubtitle.textContent = "الرابط غير صحيح أو تم حذف الشقة";
    disableActions("تعذر العثور على بيانات الشقة");
    renderRequestsModal([]);
    return;
  }

  const historyList = Array.isArray(apartment.tenantHistory)
    ? apartment.tenantHistory
    : [];

  const historyEntry = historyList.find(
    (item) => String(item.historyId) === String(historyId)
  );

  if (!historyEntry) {
    if (pageTitle) pageTitle.textContent = "تعذر العثور على السجل";
    if (pageSubtitle) pageSubtitle.textContent = "هذا السجل غير موجود داخل تاريخ الشقة";
    disableActions("هذا السجل غير موجود");
    renderRequestsModal([]);
    return;
  }

  const tenantInfo = historyEntry.tenantInfo || {};
  const contract = historyEntry.contract || {};
  const historicalContractId = getHistoricalContractId(historyEntry);
  const apartmentNumberValue = getApartmentNumber(apartment, historyEntry);

  if (pageTitle) pageTitle.textContent = getTenantName(historyEntry);

  if (pageSubtitle) {
    pageSubtitle.textContent =
      `شقة ${apartmentNumberValue} - ${historyEntry.buildingName || apartment.buildingName || "—"}`;
  }

  if (heroStartDate) heroStartDate.textContent = formatDate(contract.startDate);
  if (heroEndDate) heroEndDate.textContent = formatDate(contract.endDate);

  if (aptNumber) aptNumber.textContent = apartmentNumberValue;
  if (buildingName) buildingName.textContent = historyEntry.buildingName || apartment.buildingName || "—";
  if (floorNumber) floorNumber.textContent = apartment.floorNumber ?? contract.floorNumber ?? "—";
  if (rentAmount) rentAmount.textContent = formatMoney(contract.rentAmount || apartment.rent);

  if (tenantFullName) tenantFullName.textContent = tenantInfo.fullName || tenantInfo.name || "—";
  if (tenantNationality) tenantNationality.textContent = tenantInfo.nationality || "—";
  if (phoneNumber) phoneNumber.textContent = tenantInfo.phoneNumber || tenantInfo.phone || "—";
  if (identityNumber) identityNumber.textContent = historyEntry.tenantNationalId || "—";
  if (tenantType) tenantType.textContent = tenantInfo.tenantType || "—";
  if (archivedAt) archivedAt.textContent = formatDate(historyEntry.archivedAt);

  if (startDate) startDate.textContent = formatDate(contract.startDate);
  if (endDate) endDate.textContent = formatDate(contract.endDate);
  if (meterNumber) meterNumber.textContent = contract.meterNumber || "—";
  if (insurancePaid) insurancePaid.textContent = formatMoney(contract.insurancePaid);
  if (notes) notes.textContent = contract.notes || "—";

  const matchingRequests = requests
    .filter((request) => {
      if (String(request.apartmentId) !== String(apartmentId)) return false;

      if (
        historicalContractId &&
        request.contractId &&
        String(request.contractId) === String(historicalContractId)
      ) {
        return true;
      }

      if (
        historyEntry.tenantNationalId &&
        request.tenantNationalId &&
        String(request.tenantNationalId) === String(historyEntry.tenantNationalId)
      ) {
        return true;
      }

      return false;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt || a.date || 0).getTime();
      const bTime = new Date(b.createdAt || b.date || 0).getTime();
      return bTime - aTime;
    });

  renderRequestsModal(matchingRequests);

  const matchingContractDoc = documents.find((doc) => {
    if (String(doc.apartmentId) !== String(apartmentId)) return false;

    if (historicalContractId && doc.contractId) {
      return String(doc.contractId) === String(historicalContractId);
    }

    if (doc.docType !== "auto_lease_contract") return false;

    const fileName = doc.fileName || "";
    return fileName.includes(`شقة ${apartmentNumberValue}`);
  });

  if (!matchingContractDoc) {
    if (contractHint) {
      contractHint.textContent = "لم يتم العثور على عقد محفوظ لهذا السجل.";
    }
    if (openContractBtn) openContractBtn.disabled = true;
  } else if (contractHint) {
    contractHint.textContent = historicalContractId
      ? `تم العثور على وثيقة العقد ${historicalContractId}`
      : "تم العثور على عقد محفوظ لهذا السجل.";
  }

  if (openContractBtn) {
    openContractBtn.addEventListener("click", () => {
      if (!matchingContractDoc) return;

      const fileData = matchingContractDoc.fileData || matchingContractDoc.url;
      if (!fileData) {
        alert("ملف العقد موجود لكن لا يحتوي على رابط أو بيانات عرض");
        return;
      }

      const win = window.open();
      if (!win) return;

      win.document.write(`
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8" />
            <title>${escapeHtml(matchingContractDoc.fileName || "عقد")}</title>
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