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
  let linkTenantSaveInFlight = false;

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
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB"
          : "ar-SA";
    return date.toLocaleDateString(loc);
  }

  function formatCurrency(value) {
    const number = Number(value || 0);
    if (!number) return T("common.sarZero");
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
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

  /** Form field is yearly rent; `data.rent` is monthly equivalent (yearly/12) for API/storage. */
  function getYearlyRentFromFormData(data) {
    if (!data) return 0;
    if (data.yearlyRent != null && data.yearlyRent !== "") {
      const y = Number(data.yearlyRent);
      return Number.isFinite(y) ? y : 0;
    }
    const m = Number(data.rent);
    return Number.isFinite(m) && m > 0 ? m * 12 : 0;
  }

  function reconcilePaymentScheduleData(raw) {
    const out = { ...(raw || {}) };
    let cycle = out.paymentCycle || out.payment_cycle || "quarterly";
    let count = Number(out.installmentsCount ?? out.installments_count);
    const def = getDefaultInstallmentsCount(cycle);
    if (!Number.isFinite(count) || count < 1) count = def;
    /* Stale merge: cycle is semi-annual but count still defaulted to quarterly (4). */
    if (cycle === "semi_annual" && count === 4) count = 2;
    out.paymentCycle = cycle;
    out.installmentsCount = count;
    return out;
  }

  function buildInstallmentsSchedule(data) {
    const count = Number(data.installmentsCount || 0);
    const startDate = data.startDate ? new Date(data.startDate) : null;
    const cycleMonths = getCycleMonths(data.paymentCycle);
    const yearly = getYearlyRentFromFormData(data);
    // Annual rent split across the number of installments (sums to yearly). Due dates still step by payment cycle.
    // Old formula (monthly rent × cycle months) matched one cycle’s share (e.g. yearly/4 for quarterly) and was wrong when count was 1 but cycle was quarterly (showed 5k instead of 20k).
    const perPayment = count > 0 && yearly > 0 ? yearly / count : 0;

    if (!startDate || Number.isNaN(startDate.getTime()) || count < 1) {
      return [];
    }

    return Array.from({ length: count }).map((_, index) => {
      const dueDate = addMonths(startDate, index * cycleMonths);
      const loc =
        window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
          ? window.walajna_language.localeForNumbers()
          : window.walajna_language && window.walajna_language.get() === "en"
            ? "en-SA"
            : "ar-SA";
      const amt = Math.round(perPayment);
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

  function sameBuildingId(a, b) {
    return String(a ?? "") === String(b ?? "");
  }

  /** API often sends building_id only; name lives on buildings / building_name. */
  function resolveBuildingDisplayName(apartment) {
    if (!apartment) return "";
    const direct =
      apartment.buildingName ||
      apartment.building_name ||
      "";
    const trimmed = String(direct).trim();
    if (trimmed) return trimmed;
    const bid = apartment.buildingId ?? apartment.building_id;
    if (bid == null || bid === "") return "";
    if (typeof getBuildings === "function") {
      const b = getBuildings().find((x) => sameBuildingId(x.id, bid));
      const n = b && (b.name || "").trim();
      if (n) return n;
    }
    return "";
  }

  function resolveBuildingFloorsDisplay(apartment) {
    const fromApt =
      apartment?.buildingFloors ??
      apartment?.building_floors ??
      null;
    if (fromApt != null && String(fromApt).trim() !== "") return String(fromApt);
    const bid = apartment?.buildingId ?? apartment?.building_id;
    if (bid == null || typeof getBuildings !== "function") return "";
    const b = getBuildings().find((x) => sameBuildingId(x.id, bid));
    if (!b) return "";
    const n = b.totalFloors ?? b.total_floors;
    return n != null && n !== "" ? String(n) : "";
  }

  function resolveBuildingUnitsDisplay(apartment) {
    const fromApt =
      apartment?.buildingUnits ??
      apartment?.building_units ??
      null;
    if (fromApt != null && String(fromApt).trim() !== "") return String(fromApt);
    const bid = apartment?.buildingId ?? apartment?.building_id;
    if (bid == null || typeof getBuildings !== "function") return "";
    const b = getBuildings().find((x) => sameBuildingId(x.id, bid));
    if (!b) return "";
    const n = b.apartmentCount ?? b.apartments_count;
    return n != null && n !== "" ? String(n) : "";
  }

  function buildLeaseContractHtml(apartment, data) {
    const g = window.walajna_language && window.walajna_language.get
      ? window.walajna_language.get()
      : "ar";
    const leaseLang = g === "en" ? "en" : g === "ur" ? "ur" : "ar";
    const leaseDir = g === "en" ? "ltr" : "rtl";
    const dash = T("common.dash");
    const owner = getCurrentOwnerInfo();
    const brokerInfo = {
      name: data.brokerName || dash,
      commercialRegister: data.brokerCommercialRegister || dash,
      phone: data.brokerPhone || dash,
      address: data.brokerAddress || dash,
      email: data.brokerEmail || dash,
    };

    const services = {
      electricity: getIncludedLabel(data.electricityIncluded),
      water: getIncludedLabel(data.waterIncluded),
      gas: getServiceTypeLabel(data.gasType),
      ac: getServiceTypeLabel(data.acType),
    };

    const schedData = reconcilePaymentScheduleData(data);
    const schedule = buildInstallmentsSchedule(schedData);
    const buildingName = resolveBuildingDisplayName(apartment) || dash;
    const apartmentNumber = apartment?.number || dash;
    const floorNumber = data.floorNumber || apartment?.floorNumber || dash;
    const yearlyRent = getYearlyRentFromFormData(data);
    const rentCycleLabel = getPaymentCycleLabel(schedData.paymentCycle);
    const contractId =
      apartment?.currentContractId ||
      apartment?.contract?.id ||
      apartment?.contractId ||
      generateContractId();

    const ownerNationality = currentUser?.nationality || "المملكة العربية السعودية";
    const tenantNationality = data.nationality || ownerNationality || dash;

    const val = (value) => escapeHtml(value || dash);
    const td = (value) => `<td>${escapeHtml(value || dash)}</td>`;

    const sectionRow = (enLabel, arLabel, value) => `
      <tr>
        <td class="label-cell">${escapeHtml(enLabel)}<span>${escapeHtml(arLabel)}</span></td>
        ${td(value)}
      </tr>
    `;

    const scheduleRows = schedule.length
      ? schedule
          .map(
            (item) => `
              <tr>
                ${td(String(item.number))}
                ${td(item.dueDate)}
                ${td(item.amount)}
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="3">${escapeHtml(T("lease.noPayments"))}</td></tr>`;

    let contractLogoUrl = "";
    try {
      if (typeof document !== "undefined" && document.baseURI) {
        contractLogoUrl = new URL("../pics/logo.png", document.baseURI).href;
      } else if (typeof window !== "undefined" && window.location?.href) {
        contractLogoUrl = new URL("../pics/logo.png", window.location.href).href;
      }
    } catch {
      contractLogoUrl = "";
    }

    const legalArticles = [
      "البند الأول: التعريفات. يقصد بالمصطلحات التالية أينما وردت في هذا العقد المعاني المبينة أمام كل منها ما لم يقتضِ السياق خلاف ذلك: المؤجر: مالك العقار أو من ينوب عنه نظامًا. المستأجر: الطرف المنتفع بالعقار بموجب هذا العقد. العين المؤجرة: الوحدة العقارية محل العقد. الأجرة: المقابل المالي المتفق عليه للانتفاع بالعقار.",
      "البند الثاني: محل العقد. اتفق الطرفان على أن يقوم المؤجر بتأجير العين المؤجرة إلى المستأجر بغرض الانتفاع بها للغرض المحدد في هذا العقد، ويُقر المستأجر بأنه عاين العين المؤجرة معاينة تامة نافية للجهالة وقبلها بحالتها الراهنة الصالحة للانتفاع.",
      "البند الثالث: مدة العقد. تكون مدة هذا العقد محددة ومتفق عليها بين الطرفين، وتبدأ من تاريخ سريان العقد وتنتهي بانتهاء مدته، ولا يتجدد العقد إلا بموافقة الطرفين أو وفق ما يتم الاتفاق عليه صراحة.",
      "البند الرابع: الأجرة وطريقة السداد. يلتزم المستأجر بدفع الأجرة المتفق عليها في المواعيد المحددة، ويجوز سدادها دفعة واحدة أو على أقساط وفق الاتفاق، ويُعد السداد عبر الوسائل الإلكترونية المعتمدة هو الإثبات الرسمي للسداد.",
      "البند الخامس: التأخر في السداد. في حال تأخر المستأجر عن سداد الأجرة في موعدها، يحق للمؤجر منحه مهلة مناسبة للسداد، وفي حال استمرار التأخير يحق للمؤجر اتخاذ الإجراءات النظامية بما في ذلك المطالبة بالفسخ والتعويض.",
      "البند السادس: تسليم العين المؤجرة. يلتزم المؤجر بتسليم العين المؤجرة بحالة صالحة للانتفاع وفق الغرض المتفق عليه، ويُعد تسلم المستأجر للعقار إقرارًا بصلاحيته وخلوه من العيوب الظاهرة.",
      "البند السابع: التزامات المؤجر. يلتزم المؤجر بضمان تمكين المستأجر من الانتفاع بالعين المؤجرة دون تعرض، وبإجراء الصيانة الأساسية اللازمة التي تضمن استمرار المنفعة، كما يلتزم بإصلاح أي عيب خفي يؤثر على الانتفاع.",
      "البند الثامن: التزامات المستأجر. يلتزم المستأجر بما يلي: سداد الأجرة في مواعيدها، استخدام العين المؤجرة وفق الغرض المحدد، المحافظة على العقار وعدم إحداث أي ضرر به، عدم إجراء أي تعديل إلا بموافقة المؤجر، عدم التأجير من الباطن إلا بإذن، إعادة العين المؤجرة عند انتهاء العقد بالحالة التي تسلمها بها.",
      "البند التاسع: استعمال العين المؤجرة. يلتزم المستأجر باستعمال العين المؤجرة استعمالًا معتادًا ومشروعًا، وبما لا يخالف الأنظمة أو يسبب ضررًا للغير أو إزعاجًا للجيران، ولا يجوز تغيير نشاط الاستخدام دون موافقة المؤجر.",
      "البند العاشر: الصيانة. تكون الصيانة الأساسية على عاتق المؤجر، فيما تكون الصيانة التشغيلية الناتجة عن الاستخدام على عاتق المستأجر، ويلتزم كل طرف بإصلاح ما يخصه.",
      "البند الحادي عشر: المرافق والخدمات. يلتزم المستأجر بسداد تكاليف استهلاك الخدمات المرتبطة بالعين المؤجرة، ما لم يتم الاتفاق على خلاف ذلك، كما يلتزم بنقل الخدمات باسمه إذا لزم الأمر.",
      "البند الثاني عشر: مبلغ الضمان. إذا تم الاتفاق على مبلغ ضمان، فيلتزم المستأجر بدفعه، ويحق للمؤجر خصم أي مستحقات أو أضرار من هذا المبلغ عند انتهاء العقد، ويتم إعادة المتبقي خلال مدة معقولة.",
      "البند الثالث عشر: الفسخ. يجوز لأي من الطرفين طلب فسخ العقد في حال إخلال الطرف الآخر بأي من التزاماته، وذلك بعد إشعاره ومنحه مهلة مناسبة لإزالة المخالفة، وفي حال عدم المعالجة يحق الفسخ مع المطالبة بالتعويض.",
      "البند الرابع عشر: الفسخ بسبب عدم السداد. يحق للمؤجر فسخ العقد في حال تأخر المستأجر عن سداد الأجرة لمدة تتجاوز المهلة المحددة، مع احتفاظه بحقه في المطالبة بالمستحقات.",
      "البند الخامس عشر: القوة القاهرة. في حال وقوع ظروف خارجة عن إرادة الطرفين تمنع الانتفاع بالعين المؤجرة، كالكوارث أو القرارات الحكومية، يجوز إنهاء العقد دون تحمل أي من الطرفين مسؤولية.",
      "البند السادس عشر: انتهاء العقد. ينتهي العقد بانتهاء مدته أو باتفاق الطرفين أو بفسخه وفقًا لأحكام هذا العقد أو بموجب حكم قضائي.",
      "البند السابع عشر: آثار انتهاء العقد. يلتزم المستأجر عند انتهاء العقد بإخلاء العين المؤجرة وتسليمها، وسداد جميع المستحقات، وفي حال التأخير يلتزم بتعويض المؤجر عن مدة الإشغال.",
      "البند الثامن عشر: انتقال الملكية. في حال انتقال ملكية العقار إلى طرف آخر، فإن هذا العقد يظل نافذًا بكامل شروطه وينتقل إلى المالك الجديد.",
      "البند التاسع عشر: الإشعارات. تكون جميع الإشعارات والمراسلات بين الطرفين مكتوبة أو إلكترونية، وتُعد ملزمة متى تم إرسالها عبر الوسائل المتفق عليها.",
      "البند العشرون: تسوية النزاعات. يتم حل النزاعات وديًا، وفي حال تعذر ذلك تُحال إلى الجهة القضائية المختصة وفق الأنظمة المعمول بها في المملكة العربية السعودية.",
      "البند الحادي والعشرون: أحكام عامة. هذا العقد ملزم للطرفين، ولا يجوز التعديل عليه إلا باتفاق الطرفين، وتسري عليه أنظمة المملكة العربية السعودية.",
    ];

    const appendixTerms = [
      ["شبكة إيجار", "منصة إلكترونية لتوثيق عقود الإيجار وتنظيم العلاقة بين الأطراف."],
      ["المؤجر", "مالك العقار أو من له صفة نظامية للتأجير."],
      ["المستأجر", "الشخص الطبيعي أو الاعتباري المنتفع من الوحدة المؤجرة."],
      ["نوع العقار", "الطبيعة العامة للأصل المؤجر (عمارة/فيلا/شقة...)."],
      ["نوع الوحدة", "الوحدة محل العقد كما هي مثبتة في بيانات العقد."],
      ["دورة السداد", "الفترة الزمنية المعتمدة لتكرار استحقاق الدفعات."],
      ["عدد الدفعات", "عدد الدفعات المستحقة خلال كامل مدة العقد."],
      ["إجمالي قيمة العقد", "مجموع الالتزامات المالية المتفق عليها طوال مدة العقد."],
      ["التسليم والاستلام", "الإجراءات الموثقة لتسليم الوحدة واستلامها عند البداية والنهاية."],
      ["مبلغ الضمان", "مبلغ تحفظي يودع وفق ما يتفق عليه الطرفان ويعاد بعد التسوية."],
      ["الوسيط العقاري", "المنشأة أو الشخص المرخص لإدارة التوسط في العملية الإيجارية."],
      ["المرفقات", "أي وثائق إضافية مرتبطة بالعقد وتعد جزءًا منه."],
    ];

    /* Clause text already includes "البند الأول" … "البند الحادي والعشرون" — no extra list numbers. */
    const articleListPartOne = legalArticles
      .slice(0, 11)
      .map((text) => `<div class="article-para">${escapeHtml(text)}</div>`)
      .join("");

    const articleListPartTwo = legalArticles
      .slice(11)
      .map((text) => `<div class="article-para">${escapeHtml(text)}</div>`)
      .join("");

    const appendixRows = appendixTerms.map(
      (row, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(row[0])}</td>
          <td>${escapeHtml(row[1])}</td>
        </tr>
      `
    );
    const appendixRowsAll = appendixRows.join("");

    return `
<!DOCTYPE html>
<html lang="${leaseLang}" dir="${leaseDir}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(T("lease.title", { building: buildingName, apt: apartmentNumber }))}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      direction: ${leaseDir};
      background: linear-gradient(160deg, #e0f2fe 0%, #ccfbf1 45%, #ecfeff 100%);
      color: #0f172a;
      line-height: 1.5;
      font-size: 12px;
    }
    .page {
      width: 210mm;
      max-width: 100%;
      min-height: auto;
      margin: 8px auto;
      background: #fff;
      border: 1px solid rgba(14, 165, 233, 0.35);
      border-radius: 10px;
      padding: 9mm 9mm 14mm;
      box-shadow: 0 8px 24px rgba(3, 105, 161, 0.12);
      position: relative;
      page-break-after: auto;
    }
    .page:last-child { page-break-after: auto; }
    .contract-head {
      border: 1px solid rgba(13, 148, 136, 0.35);
      border-radius: 10px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #0369a1 0%, #0d9488 55%, #14b8a6 100%);
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      color: #fff;
    }
    .contract-head__brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .contract-logo {
      width: 56px;
      height: 56px;
      object-fit: contain;
      flex-shrink: 0;
      background: rgba(255,255,255,0.95);
      border-radius: 10px;
      padding: 4px;
      border: 1px solid rgba(255,255,255,0.6);
    }
    .contract-head h1 {
      margin: 0;
      font-size: 20px;
      color: #fff;
      font-weight: 900;
      text-shadow: 0 1px 2px rgba(0,0,0,0.12);
    }
    .sub {
      margin-top: 4px;
      color: rgba(255,255,255,0.92);
      font-size: 11px;
      font-weight: 700;
    }
    .meta {
      text-align:${leaseDir === "rtl" ? "left" : "right"};
      font-size:11px;
      color:#e0f2fe;
      font-weight:700;
      min-width: 215px;
    }
    .meta div { margin-bottom: 3px; }
    .sec {
      border:1px solid rgba(14, 165, 233, 0.28);
      border-radius:10px;
      margin-bottom:9px;
      overflow:hidden;
      background:#fff;
    }
    .sec-title {
      background: linear-gradient(90deg, #0284c7 0%, #0d9488 100%);
      border-bottom:1px solid rgba(255,255,255,0.2);
      padding:8px 11px;
      font-size:13px;
      font-weight:900;
      color:#fff;
    }
    .sec-body { padding:7px 9px; }
    table { width:100%; border-collapse: collapse; }
    th, td { border:1px solid #d9e2ec; padding:5px 6px; vertical-align:top; }
    th { background: linear-gradient(180deg, #e0f2fe 0%, #ccfbf1 100%); font-weight:900; text-align:center; color:#0c4a6e; }
    .label-cell { width:46%; color:#0c4a6e; font-weight:800; }
    .label-cell span { display:block; margin-top:2px; font-size:10px; color:#0d9488; }
    .split { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
    .articles { margin:0; }
    .article-para {
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(13, 148, 136, 0.18);
      color: #134e4a;
      font-weight: 650;
      line-height: 1.55;
    }
    .article-para:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .note-box {
      margin-top:7px;
      border:1px dashed rgba(13, 148, 136, 0.45);
      border-radius:8px;
      padding:8px;
      background: linear-gradient(180deg, #f0fdfa 0%, #ecfeff 100%);
      color:#134e4a;
      font-weight:700;
    }
    .sign-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
    .sign-box { border:1px solid rgba(14, 165, 233, 0.35); border-radius:8px; padding:8px; min-height:92px; background:#fafefe; }
    .sign-title { font-size:12px; font-weight:900; color:#0369a1; margin-bottom:7px; }
    .line { margin-top:6px; border-top:1px dashed #94a3b8; padding-top:4px; color:#334155; font-size:11px; font-weight:700; }
    /* Keep rent schedule compact so it doesn't spill one orphan row to a new PDF page. */
    .sec--payments .sec-body { padding: 5px 7px; }
    .sec--payments table { font-size: 10.5px; line-height: 1.25; }
    .sec--payments th,
    .sec--payments td { padding: 3px 4px; }
    .sec--payments tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .page-no {
      position:absolute;
      bottom:7px;
      left:0;
      right:0;
      text-align:center;
      color:#0d9488;
      font-size:11px;
      font-weight:700;
    }
    .page-no .page-ltr {
      direction:ltr;
      unicode-bidi:isolate;
      display:inline-block;
      margin-inline-start:3px;
    }
    @media print {
      body { background:#fff; }
      .page {
        margin:0;
        border:none;
        border-radius:0;
        box-shadow:none;
        page-break-after: always;
      }
      .page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="contract-head">
      <div class="contract-head__brand">
        ${
          contractLogoUrl
            ? `<img class="contract-logo" src="${escapeHtml(contractLogoUrl)}" alt="ولجنا" />`
            : ""
        }
        <div>
          <h1>عقد إيجار سكني موحد</h1>
          <div class="sub">Unified Residential Lease Contract</div>
        </div>
      </div>
      <div class="meta">
        <div>Contract No: ${val(contractId)}</div>
        <div>Start Date: ${val(formatLeaseDate(data.startDate))}</div>
        <div>End Date: ${val(formatLeaseDate(data.endDate))}</div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">1) بيانات العقد / Contract Data</div>
      <div class="sec-body">
        <table>
          ${sectionRow("Contract Type", "نوع العقد", "جديد")}
          ${sectionRow("Contract Number", "رقم العقد", contractId)}
          ${sectionRow("Building", "اسم العقار", buildingName)}
          ${sectionRow("Unit Number", "رقم الوحدة", apartmentNumber)}
          ${sectionRow("Tenancy Period", "مدة الإيجار", `${formatLeaseDate(data.startDate)} - ${formatLeaseDate(data.endDate)}`)}
        </table>
      </div>
    </div>
    <div class="split">
      <div class="sec">
        <div class="sec-title">2) بيانات المؤجر / Lessor Data</div>
        <div class="sec-body">
          <table>
            ${sectionRow("Name", "الاسم", owner.fullName)}
            ${sectionRow("ID Number", "رقم الهوية", owner.nationalId)}
            ${sectionRow("Mobile Number", "رقم الجوال", owner.phoneNumber)}
            ${sectionRow("Nationality", "الجنسية", ownerNationality)}
          </table>
        </div>
      </div>
      <div class="sec">
        <div class="sec-title">3) بيانات المستأجر / Tenant Data</div>
        <div class="sec-body">
          <table>
            ${sectionRow("Name", "الاسم", data.fullName)}
            ${sectionRow("ID Number", "رقم الهوية", data.nationalId)}
            ${sectionRow("Mobile Number", "رقم الجوال", data.phone)}
            ${sectionRow("Nationality", "الجنسية", tenantNationality)}
          </table>
        </div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">4) بيانات الوسيط / Brokerage Entity and Broker Data</div>
      <div class="sec-body">
        <table>
          ${sectionRow("Broker Name", "اسم الوسيط", brokerInfo.name)}
          ${sectionRow("Commercial Register", "السجل التجاري", brokerInfo.commercialRegister)}
          ${sectionRow("Mobile Number", "رقم الجوال", brokerInfo.phone)}
          ${sectionRow("Email", "البريد الإلكتروني", brokerInfo.email)}
          ${sectionRow("Address", "العنوان", brokerInfo.address)}
        </table>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">1 / 7</span></div>
  </section>

  <section class="page">
    <div class="sec">
      <div class="sec-title">5) بيانات مستند الملكية / Ownership document Data</div>
      <div class="sec-body">
        <table>
          ${sectionRow("Title Deed Number", "رقم الصك", apartment?.titleDeedNo || dash)}
          ${sectionRow("Issue Date", "تاريخ الإصدار", apartment?.titleDeedDate || dash)}
          ${sectionRow("Issuing Authority", "جهة الإصدار", apartment?.titleDeedIssuer || dash)}
          ${sectionRow("Type", "نوع الصك", apartment?.titleDeedType || dash)}
        </table>
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">6) بيانات العقار / Property Data</div>
      <div class="sec-body">
        <table>
          ${sectionRow("Property Name", "اسم العقار", buildingName)}
          ${sectionRow("Property Usage", "غرض الاستخدام", data.tenantType || "سكني")}
          ${sectionRow("Number of Floors", "عدد الأدوار", resolveBuildingFloorsDisplay(apartment) || dash)}
          ${sectionRow("Number of Units", "عدد الوحدات", resolveBuildingUnitsDisplay(apartment) || dash)}
        </table>
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">7) بيانات الوحدة الإيجارية / Rental Unit Data</div>
      <div class="sec-body">
        <table>
          ${sectionRow("Unit Number", "رقم الوحدة", apartmentNumber)}
          ${sectionRow("Floor Number", "رقم الدور", floorNumber)}
          ${sectionRow("Bedrooms", "عدد غرف النوم", data.roomsCount || apartment?.roomsCount || dash)}
          ${sectionRow("Bathrooms", "عدد الحمامات", data.bathroomsCount || apartment?.bathroomsCount || dash)}
          ${sectionRow("Living Rooms", "عدد الصالات", data.livingRoomsCount || apartment?.livingRoomsCount || dash)}
          ${sectionRow("Electricity Meter", "رقم عداد الكهرباء", data.meterNumber || dash)}
          ${sectionRow("Furnishing Status", "حالة التأثيث", "غير مفروشة")}
        </table>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">2 / 7</span></div>
  </section>

  <section class="page">
    <div class="sec">
      <div class="sec-title">8) صلاحيات المستأجر / Tenant Authority</div>
      <div class="sec-body">
        <div class="note-box">يلتزم المستأجر باستخدام الوحدة وفق ما هو منصوص عليه في هذا العقد والأنظمة ذات العلاقة.</div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-title">9) البيانات المالية / Financial Data</div>
      <div class="sec-body">
        <table>
          ${sectionRow("Annual Rent", "الإيجار السنوي", formatCurrency(yearlyRent))}
          ${sectionRow("Payment Cycle", "دورة السداد", rentCycleLabel)}
          ${sectionRow("Installments Count", "عدد الدفعات", schedData.installmentsCount)}
          ${sectionRow("Insurance Deposit", "مبلغ الضمان", formatCurrency(data.insurancePaid))}
          ${sectionRow("Electricity Services", "خدمة الكهرباء", services.electricity)}
          ${sectionRow("Water Services", "خدمة المياه", services.water)}
          ${sectionRow("Gas Services", "خدمة الغاز", services.gas)}
          ${sectionRow("AC Services", "خدمة التكييف", services.ac)}
        </table>
      </div>
    </div>
    <div class="sec sec--payments">
      <div class="sec-title">10) جدول سداد الدفعات / Rent Payments Schedule</div>
      <div class="sec-body">
        <table class="payments-table">
          <thead>
            <tr>
              <th>${escapeHtml(T("lease.th.no"))}</th>
              <th>${escapeHtml(T("lease.th.due"))}</th>
              <th>${escapeHtml(T("lease.th.amount"))}</th>
            </tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">3 / 7</span></div>
  </section>

  <section class="page">
    <div class="sec">
      <div class="sec-title">11) التزامات الأطراف — الجزء الأول / Obligations by Parties (Part 1)</div>
      <div class="sec-body">
        <div class="articles">${articleListPartOne}</div>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">4 / 7</span></div>
  </section>

  <section class="page">
    <div class="sec">
      <div class="sec-title">12) استكمال الأحكام — الجزء الثاني / Legal Clauses (Part 2)</div>
      <div class="sec-body">
        <div class="articles">${articleListPartTwo}</div>
        <div class="note-box">${escapeHtml(data.notes || dash)}</div>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">5 / 7</span></div>
  </section>

  <section class="page">
    <div class="sec">
      <div class="sec-title">13) ملحق المصطلحات / Appendix — Definitions Glossary</div>
      <div class="sec-body">
        <table>
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th style="width:180px;">المصطلح</th>
              <th>التوضيح</th>
            </tr>
          </thead>
          <tbody>
            ${appendixRowsAll}
          </tbody>
        </table>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">6 / 7</span></div>
  </section>

  <section class="page">
    <div class="sec">
      <div class="sec-title">14) التوقيعات / Signatures</div>
      <div class="sec-body">
        <div class="sign-grid">
          <div class="sign-box">
            <div class="sign-title">المؤجر / Lessor</div>
            <div class="line">الاسم / Name: ${val(owner.fullName)}</div>
            <div class="line">التوقيع / Signature:</div>
            <div class="line">التاريخ / Date:</div>
          </div>
          <div class="sign-box">
            <div class="sign-title">المستأجر / Tenant</div>
            <div class="line">الاسم / Name: ${val(data.fullName)}</div>
            <div class="line">التوقيع / Signature:</div>
            <div class="line">التاريخ / Date:</div>
          </div>
          <div class="sign-box">
            <div class="sign-title">الوسيط / Broker</div>
            <div class="line">الاسم / Name: ${val(brokerInfo.name)}</div>
            <div class="line">التوقيع / Signature:</div>
            <div class="line">التاريخ / Date:</div>
          </div>
        </div>
        <div class="note-box">وثيقة مولدة تلقائياً من نظام ولجنا وتخضع للتحقق النظامي قبل الاعتماد النهائي.</div>
      </div>
    </div>
    <div class="page-no">الصفحة <span class="page-ltr">7 / 7</span></div>
  </section>
</body>
</html>
    `;
  }

  let html2pdfLoaderPromise = null;
  function ensureHtml2PdfLoaded() {
    if (typeof window !== "undefined" && typeof window.html2pdf === "function") {
      return Promise.resolve();
    }
    if (html2pdfLoaderPromise) return html2pdfLoaderPromise;
    html2pdfLoaderPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load PDF generator"));
      document.head.appendChild(s);
    });
    return html2pdfLoaderPromise;
  }

  async function buildLeaseContractPdfBlob(contractHtml) {
    await ensureHtml2PdfLoaded();
    let parsedBodyHtml = contractHtml;
    let parsedStyles = "";
    try {
      const parsed = new DOMParser().parseFromString(contractHtml, "text/html");
      parsedBodyHtml = parsed?.body?.innerHTML || contractHtml;
      parsedStyles = Array.from(parsed.querySelectorAll("style"))
        .map((s) => s.textContent || "")
        .join("\n");
    } catch {
      /* fallback to raw html */
    }
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "210mm";
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = "-1";
    host.style.background = "#ffffff";
    host.innerHTML = `${parsedStyles ? `<style>${parsedStyles}</style>` : ""}${parsedBodyHtml}`;
    document.body.appendChild(host);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const worker = window.html2pdf().set({
        margin: [0, 0, 0, 0],
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          scrollX: 0,
          scrollY: 0,
          backgroundColor: "#ffffff",
          windowWidth: host.scrollWidth || 794,
          windowHeight: host.scrollHeight || 1123,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      });
      return await worker.from(host).outputPdf("blob");
    } finally {
      host.remove();
    }
  }

  function sanitizeFileNamePart(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildOfficialLeaseFileName(apartment, data, contractId, ext = "pdf") {
    const building = sanitizeFileNamePart(resolveBuildingDisplayName(apartment) || "Building");
    const unit = sanitizeFileNamePart(apartment?.number || "Unit");
    const cid = sanitizeFileNamePart(contractId || "NA");
    const start = String(data?.startDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const safeExt = String(ext || "pdf").replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
    return `عقد إيجار سكني موحد - رقم ${cid} - ${building} - وحدة ${unit} - ${start}.${safeExt}`;
  }

  async function saveAutoLeaseContractDocument(apartment, data) {
    if (typeof upsertHtmlDocumentForApartment !== "function") {
      return;
    }

    const html = buildLeaseContractHtml(apartment, data);
    const contractKey =
      apartment.currentContractId != null
        ? String(apartment.currentContractId)
        : apartment.contract?.id != null
          ? String(apartment.contract.id)
          : null;
    const pdfFileName = buildOfficialLeaseFileName(apartment, data, contractKey, "pdf");
    const htmlFileName = buildOfficialLeaseFileName(apartment, data, contractKey, "html");
    const matcher = {
      contractId: contractKey,
      docType: "auto_lease_contract",
      generatedAutomatically: true,
    };

    if (
      typeof useServerDocuments === "function" &&
      useServerDocuments() &&
      typeof WalajnaDocumentsApi !== "undefined" &&
      typeof WalajnaDocumentsApi.renderContractPdfOnServer === "function"
    ) {
      try {
        const existingAuto = getDocuments().filter((d) => {
          if (String(d.apartmentId) !== String(apartment.id)) return false;
          const isAuto =
            d.docType === "auto_lease_contract" ||
            (!!d.generatedAutomatically && !d.docType);
          if (!isAuto) return false;
          const dc = String(d.contractId || "");
          const sameContract = dc === String(contractKey || "");
          if (sameContract) return true;
          // Legacy rows may not have contract_id in documents schema — still treat as replaceable.
          return !dc;
        });
        for (const d of existingAuto) {
          if (d.serverId != null && typeof WalajnaDocumentsApi.deleteOnServer === "function") {
            try {
              await WalajnaDocumentsApi.deleteOnServer(d.serverId);
            } catch (e) {
              console.warn("[link-tenant] remove old contract doc failed", e);
            }
          }
        }
        const uploaded = await WalajnaDocumentsApi.renderContractPdfOnServer(
          {
            apartmentId: apartment.id,
            contractId: contractKey,
            fileName: pdfFileName,
            docType: matcher.docType,
            generatedAutomatically: true,
          },
          html
        );
        const docs = getDocuments().slice().filter((d) => {
          if (String(d.apartmentId) !== String(apartment.id)) return true;
          if (String(d.contractId || "") !== String(contractKey || "")) return true;
          if (d.docType === "auto_lease_contract") return false;
          if (!!d.generatedAutomatically && !d.docType) return false;
          return true;
        });
        docs.push(uploaded);
        saveDocuments(docs);
        return;
      } catch (e) {
        console.warn("[link-tenant] storage PDF upload failed", e);
        throw new Error(
          `${T("linkModal.errPdfUpload")} ${e?.message || ""}`.trim()
        );
      }
    }

    if (typeof useServerDocuments === "function" && useServerDocuments()) {
      throw new Error(T("linkModal.errPdfUpload"));
    }

    await upsertHtmlDocumentForApartment(html, apartment.id, htmlFileName, matcher);
  }

  function parseMergedContractTerms(contract) {
    if (!contract?.terms || typeof contract.terms !== "string") return null;
    const t = contract.terms.trim();
    if (!t.startsWith("{")) return null;
    try {
      return JSON.parse(contract.terms);
    } catch {
      return null;
    }
  }

  function buildContractDocDataFromApartment(apartment) {
    const contract = apartment?.contract || {};
    const tenantInfo = apartment?.tenantInfo || {};
    const termsJson = parseMergedContractTerms(contract);
    let paymentCycle =
      contract.paymentCycle ||
      contract.payment_cycle ||
      termsJson?.paymentCycle ||
      termsJson?.payment_cycle ||
      apartment?.paymentDefaults?.paymentCycle ||
      "quarterly";
    let installmentsCount = Number(
      contract.installmentsCount ??
        contract.installments_count ??
        termsJson?.installmentsCount ??
        termsJson?.installments_count ??
        apartment?.paymentDefaults?.installmentsCount ??
        getDefaultInstallmentsCount(paymentCycle)
    );
    if (!Number.isFinite(installmentsCount) || installmentsCount < 1) {
      installmentsCount = getDefaultInstallmentsCount(paymentCycle);
    }
    if (paymentCycle === "semi_annual" && installmentsCount === 4) {
      installmentsCount = 2;
    }
    const monthlyRent = Number(
      contract.rentAmount ??
        contract.rent_amount ??
        termsJson?.rentAmount ??
        apartment?.rent ??
        0
    );
    const yearlyRent = monthlyRent > 0 ? monthlyRent * 12 : 0;

    return {
      fullName: tenantInfo.fullName || "",
      nationalId: apartment?.tenantNationalId || "",
      nationality: tenantInfo.nationality || "",
      tenantType: tenantInfo.tenantType || "",
      phone: tenantInfo.phoneNumber || "",
      yearlyRent,
      rent: monthlyRent || "",
      paymentCycle,
      installmentsCount: installmentsCount > 0 ? installmentsCount : getDefaultInstallmentsCount(paymentCycle),
      floorNumber: apartment?.floorNumber ?? "",
      bedrooms: apartment?.bedrooms ?? "",
      bathrooms: apartment?.bathrooms ?? "",
      livingRooms: apartment?.livingRooms ?? "",
      insurancePaid: contract.insurancePaid || "",
      startDate: contract.startDate || "",
      endDate: contract.endDate || "",
      meterNumber: contract.meterNumber || "",
      notes: contract.notes || "",
      brokerName: contract.brokerInfo?.name || "",
      brokerCommercialRegister: contract.brokerInfo?.commercialRegister || "",
      brokerPhone: contract.brokerInfo?.phone || "",
      brokerAddress: contract.brokerInfo?.address || "",
      brokerEmail: contract.brokerInfo?.email || "",
      electricityIncluded: !!contract.services?.electricityIncluded,
      waterIncluded: !!contract.services?.waterIncluded,
      gasType: contract.services?.gasType || "none",
      acType: contract.services?.acType || "none",
    };
  }

  function ensureAutoContractDocumentForLinkedApartment() {
    if (
      typeof getDocuments !== "function" ||
      typeof saveAutoLeaseContractDocument !== "function"
    ) {
      return;
    }

    const apartment = getCurrentApartment();
    if (!apartment) return;

    const currentContractId =
      apartment.currentContractId || apartment.contract?.id || apartment.contractId || null;
    const hasTenant =
      apartment.tenantUserId ||
      apartment.tenantNationalId ||
      apartment.tenantInfo?.fullName;

    if (!currentContractId || !hasTenant) return;

    const contractKey = String(currentContractId);
    const hasAutoForCurrentContract =
      typeof getDocuments === "function" &&
      getDocuments().some((d) => {
        if (String(d.apartmentId) !== String(apartment.id)) return false;
        const isAuto =
          d.docType === "auto_lease_contract" ||
          (!!d.generatedAutomatically && !d.docType);
        if (!isAuto) return false;
        const dc = String(d.contractId || "");
        return dc === contractKey || !dc;
      });
    if (hasAutoForCurrentContract) return;

    const normalizedApartment = {
      ...apartment,
      currentContractId: contractKey,
      contract: {
        ...(apartment.contract || {}),
        id: contractKey,
      },
    };
    const fallbackData = buildContractDocDataFromApartment(normalizedApartment);
    void saveAutoLeaseContractDocument(normalizedApartment, fallbackData).catch((e) =>
      console.warn("[link-tenant] ensure auto contract doc failed", e)
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
    const apartmentDefaults = apartment?.paymentDefaults || {};
    let buildingDefaults = {};
    if (typeof getBuildings === "function") {
      const bid = apartment?.buildingId ?? apartment?.building_id;
      if (bid != null && bid !== "") {
        const building = getBuildings().find((b) => String(b.id ?? "") === String(bid));
        buildingDefaults = building?.paymentDefaults || {};
      }
    }
    const defaults = { ...buildingDefaults, ...apartmentDefaults };

    const paymentCycle = defaults.paymentCycle || "semi_annual";
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
  {
    const monthly = Number(apartmentData.rent || contract.rentAmount || 0);
    const yearlyField = monthly > 0 ? String(monthly * 12) : "";
    setFieldValue(elements.rent, yearlyField);
  }

  const apartmentDefaults = getApartmentPaymentDefaults();
  const preferredCycle =
    apartmentDefaults.paymentCycle ||
    contract.paymentCycle ||
    contract.payment_cycle ||
    "semi_annual";
  const preferredInstallments =
    apartmentDefaults.installmentsCount ||
    Number(contract.installmentsCount || contract.installments_count || 0) ||
    getDefaultInstallmentsCount(preferredCycle);

  setFieldValue(elements.paymentCycle, preferredCycle);
  setFieldValue(elements.installmentsCount, String(preferredInstallments));

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

    const rawYearly = getFieldValue(elements.rent);
    const yearlyNum =
      rawYearly !== "" && rawYearly != null ? Number(rawYearly) : NaN;
    const monthlyStored =
      Number.isFinite(yearlyNum) && yearlyNum > 0 ? yearlyNum / 12 : "";

    return {
      fullName: getFieldValue(elements.fullName),
      nationalId: getFieldValue(elements.nationalId),
      nationality: getFieldValue(elements.nationality),
      tenantType: getFieldValue(elements.tenantType),
      phone: getFieldValue(elements.phoneNumber),
      yearlyRent: yearlyNum,
      rent: monthlyStored === "" ? "" : monthlyStored,

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
    if (!Number.isFinite(data.yearlyRent) || data.yearlyRent <= 0) {
      return T("linkModal.val.rent");
    }
    if (!data.paymentCycle) return T("linkModal.val.paymentCycle");

    if (!data.installmentsCount || Number(data.installmentsCount) < 1) {
      return T("linkModal.val.installments");
    }

    if (!data.startDate || !data.endDate) {
      return T("linkModal.val.dates");
    }

    const nidOk =
      typeof isSaudiNationalOrIqamaFormat === "function"
        ? isSaudiNationalOrIqamaFormat(data.nationalId)
        : /^[12]\d{9}$/.test(String(data.nationalId || "").trim());
    if (!nidOk) {
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
        bedrooms:
          savedApartment?.bedrooms != null && savedApartment?.bedrooms !== ""
            ? Number(savedApartment.bedrooms)
            : null,
        bathrooms:
          savedApartment?.bathrooms != null && savedApartment?.bathrooms !== ""
            ? Number(savedApartment.bathrooms)
            : null,
        living_rooms:
          savedApartment?.livingRooms != null && savedApartment?.livingRooms !== ""
            ? Number(savedApartment.livingRooms)
            : null,
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
      "http://127.0.0.1:8002";

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
      bedrooms:
        formData?.bedrooms != null && formData?.bedrooms !== ""
          ? Number(formData.bedrooms)
          : null,
      bathrooms:
        formData?.bathrooms != null && formData?.bathrooms !== ""
          ? Number(formData.bathrooms)
          : null,
      living_rooms:
        formData?.livingRooms != null && formData?.livingRooms !== ""
          ? Number(formData.livingRooms)
          : null,
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
      if (response.status === 409) {
        const d = responseJson?.detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? d.map((x) => x?.msg || x).join(" ")
              : T("linkModal.err409Duplicate");
        throw new Error(msg || T("linkModal.err409Duplicate"));
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
        const yearlyRentValue = Number(data?.yearlyRent);
        const genBody = { payment_cycle: cycle };
        if (Number.isFinite(yearlyRentValue) && yearlyRentValue > 0) {
          genBody.yearly_rent = yearlyRentValue;
        }
        const genRes = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(cid)}/installments/generate?force=1`,
          {
            method: "POST",
            body: JSON.stringify(genBody),
          }
        );
        if (!genRes.ok) {
          let msg = `installments generate failed (${genRes.status})`;
          try {
            const err = await genRes.json();
            msg = err?.detail || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
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
        savedApartment.maintenanceId =
          apiResponse.maintenance_id ?? savedApartment.maintenanceId ?? null;
        savedApartment.contract = {
          ...(savedApartment.contract || {}),
          id: serverContractId,
        };
      }

      return savedApartment;
    });

    saveApartments(updatedApartments);

    if (savedApartment) {
      try {
        await saveAutoLeaseContractDocument(savedApartment, data);
      } catch (docErr) {
        console.warn("[assign-tenant] auto contract document save failed; keeping tenant link", docErr);
      }
    }

    if (
      currentMode === "create" &&
      elements.contractFile &&
      elements.contractFile.files.length > 0
    ) {
      const file = elements.contractFile.files[0];
      await saveDocumentForApartment(file, aptId, {
        contractId: savedApartment?.currentContractId || savedApartment?.contract?.id || null,
        docType: "uploaded_lease_contract",
      });
    }

    return apiResponse;
  }

  async function handleSaveTenant() {
    if (linkTenantSaveInFlight) {
      return;
    }
    console.log("[assign-tenant] Function entered: handleSaveTenant");
    const formData = readFormData();
    const validationMessage = validateFormData(formData);

    showError("");

    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    linkTenantSaveInFlight = true;
    if (elements.saveBtn) {
      elements.saveBtn.disabled = true;
      elements.saveBtn.setAttribute("aria-busy", "true");
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
    } finally {
      linkTenantSaveInFlight = false;
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.removeAttribute("aria-busy");
      }
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

      const nationalIdMatch = text.match(/\b[12]\d{9}\b/);
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
  ensureAutoContractDocumentForLinkedApartment();

  return {
    openLinkTenantModal: openModal,
    openEditTenantModal: function () {
      const apartment = getCurrentApartment();
      openModal(apartment);
    },
    closeLinkTenantModalFn: closeModal,
  };
}



  