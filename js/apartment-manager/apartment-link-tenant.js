/* ========================================
   Apartment Link Tenant System
   ======================================== */

function initLinkTenantSystem(aptId, currentUser) {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const elements = {
    modal: document.getElementById("linkTenantModal"),
    modalTitle: document.getElementById("linkTenantModalTitle"),
    closeBtn: document.getElementById("closeLinkTenantModal"),
    cancelBtn: document.getElementById("cancelLinkTenantModal"),

    fullName: document.getElementById("linkFullName"),
    nationalId: document.getElementById("linkNationalId"),
    nationality: document.getElementById("linkNationality"),
    tenantType: document.getElementById("linkTenantType"),
    phoneNumber: document.getElementById("linkPhoneNumber"),
    rent: document.getElementById("linkRent"),
    paymentCycle: document.getElementById("linkPaymentCycle"),
    installmentsCount: document.getElementById("linkInstallmentsCount"),

    floorNumber: document.getElementById("linkFloorNumber"),

    // keep old HTML IDs if they already exist in your form
    bedrooms: document.getElementById("linkBedrooms") || document.getElementById("linkRoomsCount"),
    bathrooms: document.getElementById("linkBathrooms") || document.getElementById("linkBathroomsCount"),
    livingRooms: document.getElementById("linkLivingRooms") || document.getElementById("linkLivingRoomsCount"),

    insurancePaid: document.getElementById("linkInsurancePaid"),
    startDate: document.getElementById("linkStartDate"),
    endDate: document.getElementById("linkEndDate"),
    meterNumber: document.getElementById("linkMeterNumber"),
    notes: document.getElementById("linkNotes"),
    contractFile: document.getElementById("contractFile"),

    extractBtn: document.getElementById("extractContractBtn"),
    saveBtn: document.getElementById("saveLinkedTenantBtn"),
    errorBox: document.getElementById("linkTenantError"),

    brokerName: document.getElementById("linkBrokerName"),

    brokerName: document.getElementById("linkBrokerName"),
    brokerCommercialRegister: document.getElementById("linkBrokerCommercialRegister"),
    brokerPhone: document.getElementById("linkBrokerPhone"),

    electricityIncluded: document.getElementById("linkElectricityIncluded"),
    waterIncluded: document.getElementById("linkWaterIncluded"),
    gasType: document.getElementById("linkGasType"),
    acType: document.getElementById("linkAcType"),
  };

  let currentMode = "create";

  function showError(message) {
    if (elements.errorBox) {
      elements.errorBox.textContent = message || "";
    }
  }

  function getFieldValue(field) {
    return (field?.value || "").trim();
  }

  function clearField(field) {
    if (field) field.value = "";
  }

  function setFieldValue(field, value) {
    if (field) field.value = value ?? "";
  }


  function getCheckboxOrSelectValue(field, defaultValue = "") {
    if (!field) return defaultValue;

    if (field.type === "checkbox") {
      return field.checked;
    }

    return (field.value || "").trim() || defaultValue;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatLeaseDate(dateStr) {
    if (!dateStr) return T("common.dash");
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    const loc =
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en-GB"
        : "ar-SA";
    return date.toLocaleDateString(loc);
  }

  function formatCurrency(value) {
    const number = Number(value || 0);
    if (!number) return T("common.sarZero");
    const loc =
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en-SA"
        : "ar-SA";
    return `${number.toLocaleString(loc)} ${T("common.sar")}`;
  }

  function getPaymentCycleLabel(cycle) {
    switch (cycle) {
      case "monthly":
        return T("lease.payment.monthly");
      case "quarterly":
        return T("lease.payment.quarterly");
      case "semi_annual":
        return T("lease.payment.semi");
      case "annual":
        return T("lease.payment.annual");
      default:
        return T("common.dash");
    }
  }

  function getIncludedLabel(value) {
    return value === true || value === "yes" || value === "included"
      ? T("lease.include")
      : T("lease.exclude");
  }

  function getServiceTypeLabel(value) {
    return value === "central" ? T("lease.central") : T("lease.utilNone");
  }

  function addMonths(date, months) {
    const d = new Date(date);
    const originalDay = d.getDate();
    d.setMonth(d.getMonth() + months);

    if (d.getDate() < originalDay) {
      d.setDate(0);
    }

    return d;
  }

  function toInputDate(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function generateContractId() {
    return "CONTRACT_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

 function calculateAutoEndDate(startDateStr) {
  if (!startDateStr) return "";

  const startDate = new Date(startDateStr);
  if (Number.isNaN(startDate.getTime())) return "";

  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  return toInputDate(endDate);
}
function syncEndDateWithStartDate(force = false) {
  if (!elements.startDate || !elements.endDate) return;
  if (!elements.startDate.value) return;

  if (!force && currentMode !== "create") return;

  const nextEndDate = calculateAutoEndDate(elements.startDate.value);
  if (nextEndDate) {
    elements.endDate.value = nextEndDate;
  }
}

  function getCycleMonths(paymentCycle) {
    switch (paymentCycle) {
      case "monthly":
        return 1;
      case "quarterly":
        return 3;
      case "semi_annual":
        return 6;
      case "annual":
        return 12;
      default:
        return 1;
    }
  }

  function buildInstallmentsSchedule(data) {
    const count = Number(data.installmentsCount || 0);
    const startDate = data.startDate ? new Date(data.startDate) : null;
    const cycleMonths = getCycleMonths(data.paymentCycle);
    const totalRent = Number(data.rent || 0);
    const installmentAmount = count > 0 ? totalRent / count : totalRent;

    if (!startDate || Number.isNaN(startDate.getTime()) || count < 1) {
      return [];
    }

    return Array.from({ length: count }).map((_, index) => {
      const dueDate = addMonths(startDate, index * cycleMonths);
      const loc =
        window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA"
          : "ar-SA";
      const amt = Math.round(installmentAmount);
      const amountStr =
        amt === 0
          ? T("common.sarZero")
          : `${amt.toLocaleString(loc)} ${T("common.sar")}`;
      return {
        number: index + 1,
        dueDate: formatLeaseDate(dueDate.toISOString()),
        amount: amountStr,
      };
    });
  }

  function getCurrentOwnerInfo() {
    const dash = T("common.dash");
    return {
      fullName:
        currentUser?.fullName ||
        currentUser?.name ||
        currentUser?.username ||
        dash,
      nationalId:
        currentUser?.nationalId ||
        currentUser?.idNumber ||
        dash,
      phoneNumber:
        currentUser?.phoneNumber ||
        currentUser?.phone ||
        currentUser?.mobile ||
        dash,
    };
  }

  function buildLeaseContractHtml(apartment, data) {
    const leaseLang =
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en"
        : "ar";
    const leaseDir = leaseLang === "en" ? "ltr" : "rtl";
    const dash = T("common.dash");
    const owner = getCurrentOwnerInfo();

    const brokerInfo = {
      name: data.brokerName || dash,
      commercialRegister: data.brokerCommercialRegister || dash,
      phone: data.brokerPhone || dash,
    };

    const services = {
      electricity: getIncludedLabel(data.electricityIncluded),
      water: getIncludedLabel(data.waterIncluded),
      gas: getServiceTypeLabel(data.gasType),
      ac: getServiceTypeLabel(data.acType),
    };

    const scheduleRows = buildInstallmentsSchedule(data)
      .map(
        (item) => `
          <tr>
            <td>${item.number}</td>
            <td>${escapeHtml(item.dueDate)}</td>
            <td>${escapeHtml(item.amount)}</td>
          </tr>
        `
      )
      .join("");

    const buildingName = apartment?.buildingName || dash;
    const apartmentNumber = apartment?.number || dash;

    const servicesSentenceHtml = T("lease.servicesSentence", {
      el: escapeHtml(services.electricity),
      wa: escapeHtml(services.water),
      ga: escapeHtml(services.gas),
      ac: escapeHtml(services.ac),
    });

    const periodSummaryHtml = T("lease.periodText", {
      start: `<strong>${escapeHtml(formatLeaseDate(data.startDate))}</strong>`,
      end: `<strong>${escapeHtml(formatLeaseDate(data.endDate))}</strong>`,
    });

    return `
<!DOCTYPE html>
<html lang="${leaseLang}" dir="${leaseDir}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(
    T("lease.title", {
      building: buildingName,
      apt: apartmentNumber,
    })
  )}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      direction: ${leaseDir};
      background: #eef2f7;
      color: #0f172a;
      line-height: 1.8;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 18px auto;
      background: #fff;
      padding: 18mm 16mm;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.10);
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .header {
      border: 2px solid #0f766e;
      border-radius: 14px;
      padding: 16px 18px;
      margin-bottom: 18px;
      background: linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%);
    }
    .title {
      margin: 0;
      text-align: center;
      font-size: 24px;
      font-weight: 800;
      color: #115e59;
    }
    .subtitle {
      text-align: center;
      margin-top: 6px;
      font-size: 13px;
      color: #475569;
      font-weight: 700;
    }
    .section {
      border: 1px solid #dbe4ee;
      border-radius: 14px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .section-title {
      background: #f8fafc;
      padding: 10px 14px;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
    }
    .section-body { padding: 14px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 14px;
    }
    .field {
      border: 1px dashed #d6dde7;
      border-radius: 10px;
      padding: 8px 10px;
      min-height: 58px;
    }
    .label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 700;
    }
    .value {
      font-size: 14px;
      color: #0f172a;
      font-weight: 800;
      word-break: break-word;
    }
    .full { grid-column: 1 / -1; }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 14px;
      margin-top: 8px;
      font-size: 14px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #dbe4ee;
      padding: 8px 10px;
      text-align: center;
    }
    th { background: #f8fafc; font-weight: 800; }
    .terms {
      padding-inline-start: 20px;
      margin: 0;
    }
    .terms li { margin-bottom: 10px; }
    .signatures {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 22px;
    }
    .sign-box {
      border: 1px solid #dbe4ee;
      border-radius: 12px;
      min-height: 120px;
      padding: 14px;
    }
    .sign-title {
      font-size: 15px;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .footer-note {
      text-align: center;
      color: #64748b;
      font-size: 12px;
      margin-top: 18px;
      font-weight: 700;
    }
    @media print {
      body { background: #fff; }
      .page {
        margin: 0;
        box-shadow: none;
        width: auto;
        min-height: auto;
      }
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="header">
      <h1 class="title">${escapeHtml(T("lease.docTitle"))}</h1>
      <div class="subtitle">${escapeHtml(T("lease.autoGen"))}</div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.parties"))}</div>
      <div class="section-body">
        <div class="grid">
          <div class="field"><div class="label">${escapeHtml(T("lease.ownerName"))}</div><div class="value">${escapeHtml(owner.fullName)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.ownerId"))}</div><div class="value">${escapeHtml(owner.nationalId)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.ownerPhone"))}</div><div class="value">${escapeHtml(owner.phoneNumber)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.tenantName"))}</div><div class="value">${escapeHtml(data.fullName)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.tenantId"))}</div><div class="value">${escapeHtml(data.nationalId)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.tenantPhone"))}</div><div class="value">${escapeHtml(data.phone)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.tenantNationality"))}</div><div class="value">${escapeHtml(data.nationality || dash)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.tenantType"))}</div><div class="value">${escapeHtml(data.tenantType || dash)}</div></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.broker"))}</div>
      <div class="section-body">
        <div class="grid">
          <div class="field"><div class="label">${escapeHtml(T("lease.brokerName"))}</div><div class="value">${escapeHtml(brokerInfo.name)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.brokerCr"))}</div><div class="value">${escapeHtml(brokerInfo.commercialRegister)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.brokerPhone"))}</div><div class="value">${escapeHtml(brokerInfo.phone)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.brokerNotes"))}</div><div class="value">${brokerInfo.name === dash ? escapeHtml(dash) : escapeHtml(T("lease.brokerFilled"))}</div></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.property"))}</div>
      <div class="section-body">
        <div class="grid">
          <div class="field"><div class="label">${escapeHtml(T("lease.buildingName"))}</div><div class="value">${escapeHtml(buildingName)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.aptNumber"))}</div><div class="value">${escapeHtml(apartmentNumber)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.floor"))}</div><div class="value">${escapeHtml(data.floorNumber || apartment?.floorNumber || dash)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.rooms"))}</div><div class="value">${escapeHtml(data.roomsCount || apartment?.roomsCount || dash)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.bathrooms"))}</div><div class="value">${escapeHtml(data.bathroomsCount || apartment?.bathroomsCount || dash)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.living"))}</div><div class="value">${escapeHtml(data.livingRoomsCount || apartment?.livingRoomsCount || dash)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.meter"))}</div><div class="value">${escapeHtml(data.meterNumber || dash)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.period"))}</div><div class="value">${escapeHtml(formatLeaseDate(data.startDate))} ${escapeHtml(T("common.dash"))} ${escapeHtml(formatLeaseDate(data.endDate))}</div></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.financial"))}</div>
      <div class="section-body">
        <div class="grid">
          <div class="field"><div class="label">${escapeHtml(T("lease.rentValue"))}</div><div class="value">${escapeHtml(formatCurrency(data.rent))}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.insurance"))}</div><div class="value">${escapeHtml(formatCurrency(data.insurancePaid))}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.payCycle"))}</div><div class="value">${escapeHtml(getPaymentCycleLabel(data.paymentCycle))}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.installments"))}</div><div class="value">${escapeHtml(data.installmentsCount)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.electricity"))}</div><div class="value">${escapeHtml(services.electricity)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.water"))}</div><div class="value">${escapeHtml(services.water)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.gas"))}</div><div class="value">${escapeHtml(services.gas)}</div></div>
          <div class="field"><div class="label">${escapeHtml(T("lease.ac"))}</div><div class="value">${escapeHtml(services.ac)}</div></div>
          <div class="field full">
            <div class="label">${escapeHtml(T("lease.servicesDesc"))}</div>
            <div class="value">${servicesSentenceHtml}</div>
          </div>
          <div class="field full"><div class="label">${escapeHtml(T("lease.extraNotes"))}</div><div class="value">${escapeHtml(data.notes || dash)}</div></div>
        </div>
      </div>
    </div>
  </section>

  <section class="page">
    <div class="header">
      <h2 class="title" style="font-size:22px;">${escapeHtml(T("lease.page2Title"))}</h2>
      <div class="subtitle">${escapeHtml(T("lease.page2Sub"))}</div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.scheduleTitle"))}</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(T("lease.th.no"))}</th>
              <th>${escapeHtml(T("lease.th.due"))}</th>
              <th>${escapeHtml(T("lease.th.amount"))}</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleRows || `<tr><td colspan="3">${escapeHtml(T("lease.noPayments"))}</td></tr>`}
          </tbody>
        </table>

        <div class="summary-box">
          ${periodSummaryHtml}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.clausesTitle"))}</div>
      <div class="section-body">
        <ol class="terms">
          <li>${escapeHtml(T("lease.clause1"))}</li>
          <li>${escapeHtml(T("lease.clause2"))}</li>
          <li>${escapeHtml(T("lease.clause3"))}</li>
          <li>${escapeHtml(T("lease.clause4"))}</li>
          <li>${escapeHtml(T("lease.clause5"))}</li>
          <li>${escapeHtml(T("lease.clause6"))}</li>
        </ol>
      </div>
    </div>

    <div class="section">
      <div class="section-title">${escapeHtml(T("lease.signSection"))}</div>
      <div class="section-body">
        <div class="signatures">
          <div class="sign-box">
            <div class="sign-title">${escapeHtml(T("lease.signOwner"))}</div>
            <div>${escapeHtml(T("lease.nameLabel", { name: owner.fullName }))}</div>
            <div>${escapeHtml(T("lease.signLine"))}</div>
            <div>${escapeHtml(T("lease.dateLine"))}</div>
          </div>

          <div class="sign-box">
            <div class="sign-title">${escapeHtml(T("lease.signTenant"))}</div>
            <div>${escapeHtml(T("lease.nameLabel", { name: data.fullName }))}</div>
            <div>${escapeHtml(T("lease.signLine"))}</div>
            <div>${escapeHtml(T("lease.dateLine"))}</div>
          </div>
        </div>

        <div class="footer-note">
          ${escapeHtml(T("lease.footerNote"))}
        </div>
      </div>
    </div>
  </section>
</body>
</html>
    `;
  }

  function saveAutoLeaseContractDocument(apartment, data) {
    if (typeof upsertHtmlDocumentForApartment !== "function") return;

    const html = buildLeaseContractHtml(apartment, data);
    const apartmentNo = apartment?.number || T("common.dash");
    const fileName = T("lease.fileName", { n: apartmentNo });

    upsertHtmlDocumentForApartment(
      html,
      apartment.id,
      fileName,
      {
        contractId: apartment.currentContractId || apartment.contract?.id || null,
        docType: "auto_lease_contract",
        generatedAutomatically: true,
      }
    );
  }


  function getCurrentApartment() {
    const apartments = typeof getApartments === "function" ? getApartments() : [];
    return apartments.find((apt) => apt.id === aptId) || null;
  }

  function getDefaultInstallmentsCount(paymentCycle) {
    switch (paymentCycle) {
      case "annual":
        return 1;
      case "semi_annual":
        return 2;
      case "quarterly":
        return 4;
      case "monthly":
      default:
        return 12;
    }
  }

  function getApartmentPaymentDefaults() {
    const apartment = getCurrentApartment();
    const defaults = apartment?.paymentDefaults || {};

    const paymentCycle = defaults.paymentCycle || "quarterly";
    const installmentsCount = Number(
      defaults.installmentsCount || getDefaultInstallmentsCount(paymentCycle)
    );

    return {
      paymentCycle,
      installmentsCount,
    };
  }

  function syncInstallmentsCountWithPaymentCycle() {
    if (!elements.paymentCycle || !elements.installmentsCount) return;

    const cycle = getFieldValue(elements.paymentCycle) || "quarterly";
    const currentValue = Number(elements.installmentsCount.value || 0);

    if (!currentValue || currentValue < 1) {
      elements.installmentsCount.value = String(
        getDefaultInstallmentsCount(cycle)
      );
    }
  }

  function setModalMode(mode) {
    currentMode = mode === "edit" ? "edit" : "create";

    if (elements.modalTitle) {
      elements.modalTitle.textContent =
        currentMode === "edit"
          ? T("linkModal.modeTitleEdit")
          : T("linkModal.modeTitleCreate");
    }

    if (elements.saveBtn) {
      elements.saveBtn.textContent =
        currentMode === "edit"
          ? T("linkModal.saveEdit")
          : T("linkModal.saveCreate");
    }
  }

function resetForm() {
  showError("");

  const paymentDefaults = getApartmentPaymentDefaults();
  const apartment = getCurrentApartment();

  clearField(elements.fullName);
  clearField(elements.nationalId);
  clearField(elements.nationality);
  clearField(elements.tenantType);
  clearField(elements.phoneNumber);
  clearField(elements.rent);

  if (elements.paymentCycle) {
    elements.paymentCycle.value = paymentDefaults.paymentCycle || "quarterly";
  }

  if (elements.installmentsCount) {
    elements.installmentsCount.value = String(
      paymentDefaults.installmentsCount || 4
    );
  }

  // take values from apartment saved in owner-edit
  setFieldValue(elements.floorNumber, apartment?.floorNumber ?? "");
  setFieldValue(elements.bedrooms, apartment?.bedrooms ?? "");
  setFieldValue(elements.bathrooms, apartment?.bathrooms ?? "");
  setFieldValue(elements.livingRooms, apartment?.livingRooms ?? "");

    clearField(elements.insurancePaid);
    clearField(elements.startDate);
    clearField(elements.endDate);
    clearField(elements.meterNumber);
    clearField(elements.notes);
    clearField(elements.contractFile);
    clearField(elements.brokerName);
    clearField(elements.brokerCommercialRegister);
    clearField(elements.brokerPhone);

  if (elements.electricityIncluded) {
    elements.electricityIncluded.value = "no";
  }

  if (elements.waterIncluded) {
    elements.waterIncluded.value = "no";
  }

  if (elements.gasType) {
    elements.gasType.value = "none";
  }

  if (elements.acType) {
    elements.acType.value = "none";
  }
}

  function fillFormFromApartment(apartmentData) {
  if (!apartmentData) return;

  const tenantInfo = apartmentData.tenantInfo || {};
  const contract = apartmentData.contract || {};

  setFieldValue(elements.fullName, tenantInfo.fullName);
  setFieldValue(elements.nationalId, apartmentData.tenantNationalId);
  setFieldValue(elements.nationality, tenantInfo.nationality);
  setFieldValue(elements.tenantType, tenantInfo.tenantType);
  setFieldValue(elements.phoneNumber, tenantInfo.phoneNumber);
  setFieldValue(elements.rent, apartmentData.rent || contract.rentAmount || "");

  setFieldValue(
    elements.paymentCycle,
    contract.paymentCycle || apartmentData.paymentDefaults?.paymentCycle || "quarterly"
  );
  setFieldValue(elements.installmentsCount, contract.installmentsCount || "");

  // take values from apartment saved in owner-edit
  setFieldValue(elements.floorNumber, apartmentData.floorNumber ?? "");
  setFieldValue(elements.bedrooms, apartmentData.bedrooms ?? "");
  setFieldValue(elements.bathrooms, apartmentData.bathrooms ?? "");
  setFieldValue(elements.livingRooms, apartmentData.livingRooms ?? "");

    setFieldValue(elements.insurancePaid, contract.insurancePaid);
    setFieldValue(elements.startDate, contract.startDate);
    setFieldValue(elements.endDate, contract.endDate);
    setFieldValue(elements.meterNumber, contract.meterNumber);
    setFieldValue(elements.notes, contract.notes);
    setFieldValue(elements.brokerName, contract.brokerInfo?.name);
    setFieldValue(
      elements.brokerCommercialRegister,
      contract.brokerInfo?.commercialRegister
    );
    setFieldValue(elements.brokerPhone, contract.brokerInfo?.phone);

  setFieldValue(
    elements.electricityIncluded,
    contract.services?.electricityIncluded ? "yes" : "no"
  );
  setFieldValue(
    elements.waterIncluded,
    contract.services?.waterIncluded ? "yes" : "no"
  );
  setFieldValue(elements.gasType, contract.services?.gasType || "none");
  setFieldValue(elements.acType, contract.services?.acType || "none");
}

  function openModal(apartmentData = null) {
    if (!elements.modal) return;

    resetForm();

    if (apartmentData) {
      setModalMode("edit");
      fillFormFromApartment(apartmentData);
    } else {
      setModalMode("create");
    }

    if (currentMode === "create") {
      syncEndDateWithStartDate(true);
    }

    elements.modal.classList.add("is-open");
    elements.modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!elements.modal) return;

    elements.modal.classList.remove("is-open");
    elements.modal.setAttribute("aria-hidden", "true");
    resetForm();
    setModalMode("create");
  }

  function readFormData() {
    const apartmentDefaults = getApartmentPaymentDefaults();

    const paymentCycle =
      getFieldValue(elements.paymentCycle) ||
      apartmentDefaults.paymentCycle ||
      "quarterly";

    const rawInstallmentsCount = Number(
      getFieldValue(elements.installmentsCount) || 0
    );

    return {
      fullName: getFieldValue(elements.fullName),
      nationalId: getFieldValue(elements.nationalId),
      nationality: getFieldValue(elements.nationality),
      tenantType: getFieldValue(elements.tenantType),
      phone: getFieldValue(elements.phoneNumber),
      rent: getFieldValue(elements.rent),

      brokerName: getFieldValue(elements.brokerName),

      brokerName: getFieldValue(elements.brokerName),
      brokerCommercialRegister: getFieldValue(elements.brokerCommercialRegister),
      brokerPhone: getFieldValue(elements.brokerPhone),

      electricityIncluded:
        getCheckboxOrSelectValue(elements.electricityIncluded, "no") === "yes",
      waterIncluded:
        getCheckboxOrSelectValue(elements.waterIncluded, "no") === "yes",
      gasType: getCheckboxOrSelectValue(elements.gasType, "none"),
      acType: getCheckboxOrSelectValue(elements.acType, "none"),


      paymentCycle,
      installmentsCount:
        rawInstallmentsCount > 0
          ? rawInstallmentsCount
          : Number(
              apartmentDefaults.installmentsCount ||
              getDefaultInstallmentsCount(paymentCycle)
            
            ),

      floorNumber: getFieldValue(elements.floorNumber),
      bedrooms: getFieldValue(elements.bedrooms),
      bathrooms: getFieldValue(elements.bathrooms),
      livingRooms: getFieldValue(elements.livingRooms),

      insurancePaid: getFieldValue(elements.insurancePaid),
      startDate: getFieldValue(elements.startDate),
      endDate: getFieldValue(elements.endDate),
      meterNumber: getFieldValue(elements.meterNumber),
      notes: getFieldValue(elements.notes),
    };
  }

  function validateFormData(data) {
    if (!data.fullName) return T("linkModal.val.fullName");
    if (!data.nationalId) return T("linkModal.val.nationalId");
    if (!data.nationality) return T("linkModal.val.nationality");
    if (!data.tenantType) return T("linkModal.val.tenantType");
    if (!data.phone) return T("linkModal.val.phone");
    if (!data.rent) return T("linkModal.val.rent");
    if (!data.paymentCycle) return T("linkModal.val.paymentCycle");

    if (!data.installmentsCount || Number(data.installmentsCount) < 1) {
      return T("linkModal.val.installments");
    }

    if (!data.startDate || !data.endDate) {
      return T("linkModal.val.dates");
    }

    if (!/^\d{10}$/.test(data.nationalId)) {
      return T("linkModal.val.nationalIdDigits");
    }

    if (!/^05\d{8}$/.test(data.phone)) {
      return T("linkModal.val.phoneFormat");
    }

    if (data.endDate < data.startDate) {
      return T("linkModal.val.endAfterStart");
    }

    return "";
  }

  function updateCurrentUserRoleIfNeeded(userId) {
    if (!currentUser || currentUser.id !== userId) return;

    const users = getUsers();
    const freshUser = users.find((u) => u.id === userId);

    if (freshUser) {
      saveCurrentUser(freshUser);
    }
  }

  function ensureTenantRoleByNationalId(nationalId) {
    const users = getUsers();
    const tenantUser = users.find((u) => u.nationalId === nationalId) || null;

    if (!tenantUser) return null;

    if (!Array.isArray(tenantUser.roles)) {
      tenantUser.roles = tenantUser.role ? [tenantUser.role] : [];
    }

    if (!tenantUser.roles.includes("tenant")) {
      tenantUser.roles.push("tenant");
    }

    saveUpdatedUser(tenantUser);
    updateCurrentUserRoleIfNeeded(tenantUser.id);

    return tenantUser;
  }

  function buildUpdatedApartment(apartment, tenantUserId, data) {
    existingContractId =
  apartment?.currentContractId ||
  apartment?.contract?.id;
  apartment?.contractId ||
  
      null;

    const finalContractId =
      currentMode === "edit"
        ? (existingContractId || generateContractId())
        : generateContractId();

    const updatedApartment = {
  ...apartment,
  ownerId: currentUser?.id || null,
  rent: data.rent ? Number(data.rent) : "",

  floorNumber: data.floorNumber ? Number(data.floorNumber) : null,
  bedrooms: data.bedrooms ? Number(data.bedrooms) : null,
  bathrooms: data.bathrooms ? Number(data.bathrooms) : null,
  livingRooms: data.livingRooms ? Number(data.livingRooms) : null,

  tenantUserId: tenantUserId,
  tenantNationalId: data.nationalId,


  currentContractId: finalContractId,
  contractId: finalContractId, 

  tenantInfo: {
    fullName: data.fullName,
    phoneNumber: data.phone,
    nationality: data.nationality,
    tenantType: data.tenantType,
  },

  contract: {
    id: finalContractId,
        startDate: data.startDate,
        endDate: data.endDate,
        rentAmount: Number(data.rent),
        paymentCycle: data.paymentCycle,
        installmentsCount: Number(data.installmentsCount),
        insurancePaid: data.insurancePaid,
        meterNumber: data.meterNumber,
        notes: data.notes,

        brokerInfo: {
          name: data.brokerName || "",
          commercialRegister: data.brokerCommercialRegister || "",
          phone: data.brokerPhone || "",
        },

        services: {
          electricityIncluded: !!data.electricityIncluded,
          waterIncluded: !!data.waterIncluded,
          gasType: data.gasType || "none",
          acType: data.acType || "none",
        },
      },
    };

    return normalizeApartmentLeaseStatus(updatedApartment);
  }

  
  async function resolveServerApartmentId(savedApartment, apiBase) {
    const directId = parseInt(savedApartment?.apiId, 10);
    if (Number.isFinite(directId) && directId > 0) {
      console.log("[assign-tenant] Resolved apartment id directly:", directId);
      return directId;
    }

    const localBuildingId = savedApartment.buildingId ?? savedApartment.building_id ?? null;
    const localApartmentNumber = savedApartment.number ?? savedApartment.apartmentNumber ?? savedApartment.apartment_number ?? null;

    console.log("[assign-tenant] Resolving server apartment id from API using local identifiers:", {
      localId: savedApartment.id,
      localBuildingId,
      localApartmentNumber,
    });

    const listUrl = `${apiBase}/api/apartments`;
    const listRes =
      typeof WalajnaAuth !== "undefined" && WalajnaAuth.fetchWithAuth
        ? await WalajnaAuth.fetchWithAuth(listUrl, { method: "GET" })
        : await fetch(listUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });

    const listRawText = await listRes.text();
    let apartments = [];
    try {
      apartments = JSON.parse(listRawText || "[]");
    } catch {
      apartments = [];
    }

    console.log("[assign-tenant] Apartment list lookup status:", listRes.status);
    if (!listRes.ok) {
      if (listRes.status === 401) {
        if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.handleUnauthorized === "function") {
          WalajnaAuth.handleUnauthorized("انتهت الجلسة أو التوكن غير صالح. سجل الدخول مرة أخرى ثم أعد المحاولة.");
        }
        throw new Error("انتهت الجلسة أو التوكن غير صالح. سجل الدخول مرة أخرى ثم أعد المحاولة.");
      }
      throw new Error(`Could not fetch apartments list (status=${listRes.status}) raw=${listRawText}`);
    }

    const normalizedBuildingId = String(localBuildingId ?? "").trim();
    const normalizedApartmentNumber = String(localApartmentNumber ?? "").trim();

    const match = apartments.find((apt) => {
      const aptBuildingId = String(apt.building_id ?? "").trim();
      const aptApartmentNumber = String(apt.apartment_number ?? "").trim();

      if (
        normalizedBuildingId &&
        normalizedApartmentNumber &&
        aptBuildingId === normalizedBuildingId &&
        aptApartmentNumber === normalizedApartmentNumber
      ) {
        return true;
      }

      // Backward compatibility: some rows are saved with WALAJNA_META in description.
      const desc = String(apt.description ?? "");
      if (!desc.startsWith("WALAJNA_META:")) return false;

      try {
        const meta = JSON.parse(desc.replace("WALAJNA_META:", ""));
        const metaBuildingId = String(meta?.buildingId ?? "").trim();
        const metaApartmentNumber = String(meta?.apartmentNumber ?? "").trim();
        return (
          normalizedBuildingId &&
          normalizedApartmentNumber &&
          metaBuildingId === normalizedBuildingId &&
          metaApartmentNumber === normalizedApartmentNumber
        );
      } catch {
        return false;
      }
    });

    if (!match || !match.id) {
      if (!normalizedBuildingId || !normalizedApartmentNumber) {
        throw new Error(
          `Could not resolve server apartment id for local apartment id=${savedApartment.id}, missing buildingId/apartmentNumber`
        );
      }

      const createPayload = {
        owner_id: Number(currentUser?.id || 0),
        building_id: Number(localBuildingId),
        apartment_number: normalizedApartmentNumber,
        floor_number: Number(savedApartment?.floorNumber || 1),
        address: T("linkModal.apiAddress", {
          building: savedApartment?.buildingName || `Building ${normalizedBuildingId}`,
          apt: normalizedApartmentNumber,
        }),
        description: `WALAJNA_META:${JSON.stringify({
          buildingId: normalizedBuildingId,
          apartmentNumber: normalizedApartmentNumber,
          floorNumber: Number(savedApartment?.floorNumber || 1),
        })}`,
        rent: Number(savedApartment?.rent || 0),
      };

      console.log("[assign-tenant] No server apartment match found, creating one:", createPayload);
      const createRes =
        typeof WalajnaAuth !== "undefined" && WalajnaAuth.fetchWithAuth
          ? await WalajnaAuth.fetchWithAuth(`${apiBase}/api/apartments`, {
              method: "POST",
              body: JSON.stringify(createPayload),
            })
          : await fetch(`${apiBase}/api/apartments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(createPayload),
            });

      const createRawText = await createRes.text();
      let createdApartment = null;
      try {
        createdApartment = createRawText ? JSON.parse(createRawText) : null;
      } catch {
        createdApartment = null;
      }

      if (!createRes.ok || !createdApartment?.id) {
        throw new Error(
          `Could not create server apartment for local apartment id=${savedApartment.id} (status=${createRes.status}) raw=${createRawText}`
        );
      }

      console.log("[assign-tenant] Created server apartment id:", createdApartment.id);
      return Number(createdApartment.id);
    }

    console.log("[assign-tenant] Resolved apartment id from API:", match.id);
    return Number(match.id);
  }

  async function sendTenantLinkToApi(savedApartment, formData) {
    const apiBase =
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) ||
      window.API_BASE ||
      "http://127.0.0.1:8000";

    console.log("[assign-tenant] Function entered: sendTenantLinkToApi", {
      localApartmentId: savedApartment?.id,
      localApartmentApiId: savedApartment?.apiId,
    });

    const numericId = await resolveServerApartmentId(savedApartment, apiBase);

    // Map camelCase frontend fields -> snake_case API fields.
    // Normalize national ID from all possible sources and enforce a clean string value.
    const tenantNationalIdValue = (
      formData?.nationalId ||
      savedApartment?.tenantNationalId ||
      formData?.tenantNationalId ||
      ""
    ).toString().trim();
    
    const payload = {
      tenant_user_id:     savedApartment?.tenantUserId ?? null,
      tenant_national_id: tenantNationalIdValue || null,
      tenant_info: {
        fullName:    formData.fullName    ?? null,
        phoneNumber: formData.phone       ?? null,
        nationality: formData.nationality ?? null,
        tenantType:  formData.tenantType  ?? null,
        nationalId:  tenantNationalIdValue || null,
      },
      start_date: formData.startDate ?? null,
      end_date:   formData.endDate   ?? null,
      rent:       formData?.rent != null && formData?.rent !== "" ? Number(formData.rent) : (savedApartment.rent != null ? Number(savedApartment.rent) : null),
      notes:      formData.notes     ?? null,
    };

    const url = `${apiBase}/api/apartments/${numericId}/assign-tenant`;
    console.log("[assign-tenant] Request URL:", url);
    console.log("[assign-tenant] Request method:", "PATCH");
    console.log("[assign-tenant] Request body:", JSON.stringify(payload, null, 2));
    console.log("[assign-tenant] Tenant national ID in payload:", tenantNationalIdValue, "(length=" + tenantNationalIdValue.length + ")");

    const response =
      typeof WalajnaAuth !== "undefined" && WalajnaAuth.fetchWithAuth
        ? await WalajnaAuth.fetchWithAuth(url, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });

    const rawText = await response.text();
    let responseJson = null;
    try {
      responseJson = rawText ? JSON.parse(rawText) : null;
    } catch {
      responseJson = null;
    }

    console.log("[assign-tenant] Raw response status:", response.status);
    console.log("[assign-tenant] Raw response text:", rawText);
    console.log("[assign-tenant] Parsed response JSON:", responseJson);

    if (!response.ok) {
      if (response.status === 401) {
        if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.handleUnauthorized === "function") {
          WalajnaAuth.handleUnauthorized();
        }
        throw new Error(T("linkModal.err401"));
      }
      if (
        response.status === 400 &&
        (
          rawText.includes("tenant_user_id is required") ||
          rawText.includes("tenant_national_id is required")
        )
      ) {
        throw new Error(T("linkModal.err400NationalId"));
      }
      throw new Error(`assign-tenant failed (status=${response.status}) raw=${rawText}`);
    }

    return responseJson;
  }

  async function saveTenantLink(data) {
    console.log("[assign-tenant] Function entered: saveTenantLink", data);
    console.log("[assign-tenant] National ID from form data:", data?.nationalId, "(length=", data?.nationalId?.length, ")");
    const tenantUser = ensureTenantRoleByNationalId(data?.nationalId);
    const tenantUserId = tenantUser ? tenantUser.id : null;

    const apartments = getApartments();
    const currentApartment = apartments.find((apt) => apt.id === aptId) || null;

    if (!currentApartment) {
      throw new Error("Could not locate apartment in local storage before sending assign-tenant API request");
    }

    // First call backend. Only persist local changes after a successful API response.
    const apiResponse = await sendTenantLinkToApi(
      {
        ...currentApartment,
        tenantUserId,
        tenantNationalId: data.nationalId,
      },
      data
    );

    if (
      apiResponse &&
      apiResponse.current_contract_id != null &&
      typeof WalajnaAuth !== "undefined" &&
      WalajnaAuth.API_BASE &&
      typeof WalajnaAuth.fetchWithAuth === "function"
    ) {
      try {
        const cid = apiResponse.current_contract_id;
        const cycle = data.paymentCycle || "monthly";
        await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(cid)}/installments/generate`,
          {
            method: "POST",
            body: JSON.stringify({ payment_cycle: cycle }),
          }
        );
      } catch (genErr) {
        console.warn("[assign-tenant] installment generate request failed:", genErr);
      }
    }

    let savedApartment = null;
    const updatedApartments = apartments.map((apt) => {
      if (apt.id !== aptId) return apt;

      savedApartment = buildUpdatedApartment(apt, tenantUserId, data);

      if (apiResponse) {
        const serverContractId = apiResponse.current_contract_id ?? savedApartment.currentContractId;
        savedApartment.apiId = apiResponse.id ?? savedApartment.apiId;
        savedApartment.currentContractId = serverContractId;
        savedApartment.leaseStatus = apiResponse.lease_status ?? savedApartment.leaseStatus;
        savedApartment.contract = {
          ...(savedApartment.contract || {}),
          id: serverContractId,
        };
      }

      return savedApartment;
    });

    saveApartments(updatedApartments);

    if (savedApartment) {
      saveAutoLeaseContractDocument(savedApartment, data);
    }

    if (
      currentMode === "create" &&
      elements.contractFile &&
      elements.contractFile.files.length > 0
    ) {
      const file = elements.contractFile.files[0];
      saveDocumentForApartment(file, aptId, {
        contractId: savedApartment?.currentContractId || savedApartment?.contract?.id || null,
        docType: "uploaded_lease_contract",
      });
    }

    return apiResponse;
  }

  async function handleSaveTenant() {
    console.log("[assign-tenant] Function entered: handleSaveTenant");
    const formData = readFormData();
    const validationMessage = validateFormData(formData);

    showError("");

    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    try {
      await saveTenantLink(formData);

      closeModal();
      alert(
        currentMode === "edit"
          ? T("linkModal.successEdit")
          : T("linkModal.successCreate")
      );
      window.location.reload();
    } catch (error) {
      console.error("[assign-tenant] handleSaveTenant failed:", error);
      showError(error?.message || T("linkModal.failGeneric"));
    }
  }

  function handleExtractContract() {
    if (!elements.contractFile || elements.contractFile.files.length === 0) {
      alert(T("linkModal.pickContractFirst"));
      return;
    }

    const file = elements.contractFile.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
      const text = e.target.result || "";

      const nationalIdMatch = text.match(/\b\d{10}\b/);
      const phoneMatch = text.match(/05\d{8}/);

      if (nationalIdMatch && elements.nationalId) {
        elements.nationalId.value = nationalIdMatch[0];
      }

      if (phoneMatch && elements.phoneNumber) {
        elements.phoneNumber.value = phoneMatch[0];
      }

      alert(T("linkModal.extractPartial"));
    };

    reader.readAsText(file);
  }

  function bindModalEvents() {
    if (elements.closeBtn) {
      elements.closeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    if (elements.cancelBtn) {
      elements.cancelBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    if (elements.modal) {
      const panel = elements.modal.querySelector(".wl-modal__panel");
      const backdrop = elements.modal.querySelector(".wl-modal__backdrop");

      if (panel) {
        panel.addEventListener("click", function (e) {
          e.stopPropagation();
        });
      }

      if (backdrop) {
        backdrop.addEventListener("click", function () {
          closeModal();
        });
      }
    }
  }

  function bindActions() {
    if (elements.saveBtn) {
      elements.saveBtn.addEventListener("click", handleSaveTenant);
    }

    if (elements.extractBtn) {
      elements.extractBtn.addEventListener("click", handleExtractContract);
    }

    if (elements.paymentCycle) {
      elements.paymentCycle.addEventListener("change", function () {
        syncInstallmentsCountWithPaymentCycle();
      });
    }

    if (elements.startDate) {
      elements.startDate.addEventListener("change", function () {
        syncEndDateWithStartDate();
      });
    }
  }

  bindModalEvents();
  bindActions();

  return {
    openLinkTenantModal: openModal,
    openEditTenantModal: function () {
      const apartment = getCurrentApartment();
      openModal(apartment);
    },
    closeLinkTenantModalFn: closeModal,
  };
}



  