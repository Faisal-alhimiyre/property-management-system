/* ========================================
   Apartment Link Tenant System
   ======================================== */

function initLinkTenantSystem(aptId, currentUser) {
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

  function formatDateAr(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("ar-SA");
  }

  function formatCurrency(value) {
    const number = Number(value || 0);
    if (!number) return "0 ريال";
    return `${number.toLocaleString("en-US")} ريال`;
  }

  function getArabicPaymentCycleLabel(cycle) {
    switch (cycle) {
      case "monthly":
        return "شهري";
      case "quarterly":
        return "ربع سنوي";
      case "semi_annual":
        return "نصف سنوي";
      case "annual":
        return "سنوي";
      default:
        return "—";
    }
  }

  function getIncludedLabel(value) {
    return value === true || value === "yes" || value === "included"
      ? "يشمل"
      : "لا يشمل";
  }

  function getServiceTypeLabel(value) {
    return value === "central" ? "مركزي" : "غير متوفر";
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
      return {
        number: index + 1,
        dueDate: formatDateAr(dueDate.toISOString()),
        amount: `${Math.round(installmentAmount).toLocaleString("en-US")} ريال`,
      };
    });
  }

  function getCurrentOwnerInfo() {
    return {
      fullName:
        currentUser?.fullName ||
        currentUser?.name ||
        currentUser?.username ||
        "—",
      nationalId:
        currentUser?.nationalId ||
        currentUser?.idNumber ||
        "—",
      phoneNumber:
        currentUser?.phoneNumber ||
        currentUser?.phone ||
        currentUser?.mobile ||
        "—",
    };
  }

  function buildLeaseContractHtml(apartment, data) {
    const owner = getCurrentOwnerInfo();

    const brokerInfo = {
      name: data.brokerName || "—",
      commercialRegister: data.brokerCommercialRegister || "—",
      phone: data.brokerPhone || "—",
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

    const buildingName = apartment?.buildingName || "—";
    const apartmentNumber = apartment?.number || "—";

    const apartmentBedrooms =
      data.bedrooms ??
      apartment?.bedrooms ??
      apartment?.roomsCount ??
      "—";

    const apartmentBathrooms =
      data.bathrooms ??
      apartment?.bathrooms ??
      apartment?.bathroomsCount ??
      "—";

    const apartmentLivingRooms =
      data.livingRooms ??
      apartment?.livingRooms ??
      apartment?.livingRoomsCount ??
      "—";

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>عقد إيجار - ${escapeHtml(buildingName)} - شقة ${escapeHtml(apartmentNumber)}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      direction: rtl;
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

    .page:last-child {
      page-break-after: auto;
    }

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

    .section-body {
      padding: 14px;
    }

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

    .full {
      grid-column: 1 / -1;
    }

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

    th {
      background: #f8fafc;
      font-weight: 800;
    }

    .terms {
      padding-right: 20px;
      margin: 0;
    }

    .terms li {
      margin-bottom: 10px;
    }

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
      body {
        background: #fff;
      }

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
      <h1 class="title">عقد إيجار وحدة سكنية</h1>
      <div class="subtitle">تم إنشاء هذه النسخة تلقائيًا عبر نظام ولجنا</div>
    </div>

    <div class="section">
      <div class="section-title">أطراف العقد</div>
      <div class="section-body">
        <div class="grid">
          <div class="field">
            <div class="label">اسم المؤجر</div>
            <div class="value">${escapeHtml(owner.fullName)}</div>
          </div>

          <div class="field">
            <div class="label">هوية المؤجر</div>
            <div class="value">${escapeHtml(owner.nationalId)}</div>
          </div>

          <div class="field">
            <div class="label">جوال المؤجر</div>
            <div class="value">${escapeHtml(owner.phoneNumber)}</div>
          </div>

          <div class="field">
            <div class="label">اسم المستأجر</div>
            <div class="value">${escapeHtml(data.fullName)}</div>
          </div>

          <div class="field">
            <div class="label">هوية / إقامة المستأجر</div>
            <div class="value">${escapeHtml(data.nationalId)}</div>
          </div>

          <div class="field">
            <div class="label">جوال المستأجر</div>
            <div class="value">${escapeHtml(data.phone)}</div>
          </div>

          <div class="field">
            <div class="label">جنسية المستأجر</div>
            <div class="value">${escapeHtml(data.nationality || "—")}</div>
          </div>

          <div class="field">
            <div class="label">نوع السكن</div>
            <div class="value">${escapeHtml(data.tenantType || "—")}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">بيانات الوسيط</div>
      <div class="section-body">
        <div class="grid">
          <div class="field">
            <div class="label">اسم الوسيط</div>
            <div class="value">${escapeHtml(brokerInfo.name)}</div>
          </div>

          <div class="field">
            <div class="label">السجل التجاري</div>
            <div class="value">${escapeHtml(brokerInfo.commercialRegister)}</div>
          </div>

          <div class="field">
            <div class="label">جوال الوسيط</div>
            <div class="value">${escapeHtml(brokerInfo.phone)}</div>
          </div>

          <div class="field">
            <div class="label">ملاحظات الوسيط</div>
            <div class="value">${brokerInfo.name === "—" ? "—" : "تم إدراج بيانات الوسيط في هذا العقد"}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">بيانات العقار والوحدة</div>
      <div class="section-body">
        <div class="grid">
          <div class="field">
            <div class="label">اسم العمارة</div>
            <div class="value">${escapeHtml(buildingName)}</div>
          </div>

          <div class="field">
            <div class="label">رقم الشقة</div>
            <div class="value">${escapeHtml(apartmentNumber)}</div>
          </div>

          <div class="field">
            <div class="label">الدور</div>
            <div class="value">${escapeHtml(data.floorNumber || apartment?.floorNumber || "—")}</div>
          </div>

          <div class="field">
            <div class="label">عدد غرف النوم</div>
            <div class="value">${escapeHtml(apartmentBedrooms)}</div>
          </div>

          <div class="field">
            <div class="label">عدد الحمامات</div>
            <div class="value">${escapeHtml(apartmentBathrooms)}</div>
          </div>

          <div class="field">
            <div class="label">عدد غرف المعيشة</div>
            <div class="value">${escapeHtml(apartmentLivingRooms)}</div>
          </div>

          <div class="field">
            <div class="label">رقم العداد</div>
            <div class="value">${escapeHtml(data.meterNumber || "—")}</div>
          </div>

          <div class="field">
            <div class="label">فترة العقد</div>
            <div class="value">${formatDateAr(data.startDate)} — ${formatDateAr(data.endDate)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">البيانات المالية والخدمات</div>
      <div class="section-body">
        <div class="grid">
          <div class="field">
            <div class="label">قيمة الإيجار</div>
            <div class="value">${formatCurrency(data.rent)}</div>
          </div>

          <div class="field">
            <div class="label">مبلغ التأمين</div>
            <div class="value">${formatCurrency(data.insurancePaid)}</div>
          </div>

          <div class="field">
            <div class="label">دورة السداد</div>
            <div class="value">${escapeHtml(getArabicPaymentCycleLabel(data.paymentCycle))}</div>
          </div>

          <div class="field">
            <div class="label">عدد الدفعات</div>
            <div class="value">${escapeHtml(data.installmentsCount)}</div>
          </div>

          <div class="field">
            <div class="label">الكهرباء</div>
            <div class="value">${escapeHtml(services.electricity)}</div>
          </div>

          <div class="field">
            <div class="label">الماء</div>
            <div class="value">${escapeHtml(services.water)}</div>
          </div>

          <div class="field">
            <div class="label">الغاز</div>
            <div class="value">${escapeHtml(services.gas)}</div>
          </div>

          <div class="field">
            <div class="label">التكييف</div>
            <div class="value">${escapeHtml(services.ac)}</div>
          </div>

          <div class="field full">
            <div class="label">وصف الخدمات</div>
            <div class="value">
              الإيجار ${escapeHtml(services.electricity)} الكهرباء، و${escapeHtml(services.water)} الماء،
              والغاز ${escapeHtml(services.gas)}، والتكييف ${escapeHtml(services.ac)}.
            </div>
          </div>

          <div class="field full">
            <div class="label">ملاحظات إضافية</div>
            <div class="value">${escapeHtml(data.notes || "—")}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="page">
    <div class="header">
      <h2 class="title" style="font-size:22px;">جدول الدفعات وأهم البنود</h2>
      <div class="subtitle">نسخة أولية من العقد - صفحة ثانية</div>
    </div>

    <div class="section">
      <div class="section-title">جدول سداد الدفعات</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>م</th>
              <th>تاريخ الاستحقاق</th>
              <th>قيمة الدفعة</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleRows || `<tr><td colspan="3">لا توجد دفعات متاحة</td></tr>`}
          </tbody>
        </table>

        <div class="summary-box">
          تبدأ مدة العقد من <strong>${formatDateAr(data.startDate)}</strong>
          وتنتهي في <strong>${formatDateAr(data.endDate)}</strong>،
          ويقر الطرفان بصحة البيانات المدخلة أعلاه.
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">أهم البنود الأساسية</div>
      <div class="section-body">
        <ol class="terms">
          <li>أقر الطرفان بأن البيانات المثبتة في هذا العقد صحيحة وتمت بإرادتهما.</li>
          <li>يلتزم المستأجر بسداد الدفعات في مواعيدها المحددة وفق جدول السداد المبين في هذا العقد.</li>
          <li>يلتزم المستأجر بالمحافظة على الوحدة وعدم استخدامها بما يخالف الأنظمة أو يسبب ضررًا للعقار.</li>
          <li>يلتزم المؤجر بتمكين المستأجر من الانتفاع بالوحدة خلال مدة العقد وفق البنود المتفق عليها.</li>
          <li>يتم التعامل مع الخدمات المذكورة أعلاه وفق الحالة الموضحة أمام كل خدمة في هذا العقد.</li>
          <li>أي ملاحق أو اتفاقات لاحقة بين الطرفين تعد جزءًا مكملًا لهذا العقد إذا تم اعتمادها من الطرفين.</li>
        </ol>
      </div>
    </div>

    <div class="section">
      <div class="section-title">الإقرار والتوقيع</div>
      <div class="section-body">
        <div class="signatures">
          <div class="sign-box">
            <div class="sign-title">توقيع المؤجر</div>
            <div>الاسم: ${escapeHtml(owner.fullName)}</div>
            <div>التوقيع: ____________________</div>
            <div>التاريخ: ____________________</div>
          </div>

          <div class="sign-box">
            <div class="sign-title">توقيع المستأجر</div>
            <div>الاسم: ${escapeHtml(data.fullName)}</div>
            <div>التوقيع: ____________________</div>
            <div>التاريخ: ____________________</div>
          </div>
        </div>

        <div class="footer-note">
          هذه الوثيقة تم توليدها تلقائيًا من نظام ولجنا، ويمكن تطويرها لاحقًا إلى نسخة عقد كاملة متعددة الصفحات.
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
    const apartmentNo = apartment?.number || "—";
    const fileName = `عقد إيجار - شقة ${apartmentNo}.html`;

    upsertHtmlDocumentForApartment(
      html,
      apartment.id,
      fileName,
      {
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
          ? "تعديل بيانات الشقة"
          : "ربط مستأجر بالشقة";
    }

    if (elements.saveBtn) {
      elements.saveBtn.textContent =
        currentMode === "edit"
          ? "حفظ التعديلات"
          : "حفظ وربط المستأجر";
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
    if (!data.fullName) return "أدخل الاسم الكامل";
    if (!data.nationalId) return "أدخل رقم الهوية / الإقامة";
    if (!data.nationality) return "أدخل الجنسية";
    if (!data.tenantType) return "اختر أفراد أو عوائل";
    if (!data.phone) return "أدخل رقم الجوال";
    if (!data.rent) return "أدخل الإيجار الشهري";
    if (!data.paymentCycle) return "اختر دورة الدفع";

    if (!data.installmentsCount || Number(data.installmentsCount) < 1) {
      return "أدخل عدد دفعات صحيح";
    }

    if (!data.startDate || !data.endDate) {
      return "أدخل تاريخ بداية ونهاية العقد";
    }

    if (!/^\d{10}$/.test(data.nationalId)) {
      return "رقم الهوية / الإقامة يجب أن يكون 10 أرقام";
    }

    if (!/^05\d{8}$/.test(data.phone)) {
      return "رقم الجوال غير صحيح";
    }

    if (data.endDate < data.startDate) {
      return "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية";
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

      tenantInfo: {
        fullName: data.fullName,
        phoneNumber: data.phone,
        nationality: data.nationality,
        tenantType: data.tenantType,
      },

      contract: {
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

  function saveTenantLink(data) {
    const tenantUser = ensureTenantRoleByNationalId(data.nationalId);
    const tenantUserId = tenantUser ? tenantUser.id : null;

    const apartments = getApartments();
    let savedApartment = null;

    const updatedApartments = apartments.map((apt) => {
      if (apt.id !== aptId) return apt;

      savedApartment = buildUpdatedApartment(apt, tenantUserId, data);
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
      saveDocumentForApartment(file, aptId);
    }
  }

  function handleSaveTenant() {
    const formData = readFormData();
    const validationMessage = validateFormData(formData);

    showError("");

    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    saveTenantLink(formData);

    closeModal();
    alert(
      currentMode === "edit"
        ? "تم حفظ التعديلات بنجاح ✅"
        : "تم ربط المستأجر بالشقة بنجاح ✅"
    );
    window.location.reload();
  }

  function handleExtractContract() {
    if (!elements.contractFile || elements.contractFile.files.length === 0) {
      alert("اختر ملف العقد أولاً");
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

      alert("تم استخراج بعض البيانات من العقد");
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