document.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("buildingTitle");
  const grid = document.getElementById("apartmentsGrid");
  const financeBtn = document.getElementById("financeSummaryBtn");

  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const buildingId = params.get("buildingId");

  if (!buildingId) {
    if (title) title.textContent = "لم يتم العثور على العمارة";
    return;
  }

  const buildings = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const requests = JSON.parse(localStorage.getItem("walajna_requests") || "[]");
  const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");
  const costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");

  const building = buildings.find((b) => b.id === buildingId);

  if (building && title) {
    title.textContent = building.name;
  } else if (title) {
    title.textContent = "لم يتم العثور على العمارة";
  }

  function openFinanceSummary() {
    if (!buildingId) return;
    window.location.href = `finance_summary.html?buildingId=${encodeURIComponent(buildingId)}`;
  }

  if (financeBtn) {
    financeBtn.addEventListener("click", openFinanceSummary);
  }

  const buildingApartments = apartments.filter((a) => a.buildingId === buildingId);

  let selectedApartmentId = null;

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("en-US")} ريال`;
  }

  function getRequestPriority(typeId) {
    const priorities = {
      maintenance: 2,
      complaint: 3,
      suggestion: 4,
      request: 5,
    };

    return priorities[typeId] || 99;
  }

  function getOpenRequests(apartmentId) {
    return requests.filter((request) => {
      return request.apartmentId === apartmentId && request.status !== "resolved";
    });
  }

  function getHighestPriorityRequest(apartmentId) {
    const openRequests = getOpenRequests(apartmentId);

    if (!openRequests.length) return null;

    return [...openRequests].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function isApartmentRentOverdue(apartmentId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return payments.some((payment) => {
      if (payment.apartmentId !== apartmentId) return false;
      if (payment.status === "paid") return false;
      if (!payment.dueDate) return false;

      const dueDate = new Date(payment.dueDate);
      if (Number.isNaN(dueDate.getTime())) return false;

      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });
  }

  function closeAllApartmentMenus() {
    document.querySelectorAll(".apartment-card-menu").forEach((menu) => {
      menu.classList.remove("is-open");
    });

    document.querySelectorAll(".apartment-card").forEach((card) => {
      card.classList.remove("menu-open");
    });
  }

  function showError(message) {
    const errorBox = document.getElementById("linkTenantError");
    if (errorBox) {
      errorBox.textContent = message || "";
    }
  }

  function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (field) {
      field.value = value ?? "";
    }
  }

  function openEditModal(apartmentId) {
    const allApartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
    const apartment = allApartments.find((item) => item.id === apartmentId);

    if (!apartment) return;

    selectedApartmentId = apartmentId;

    const tenantInfo = apartment.tenantInfo || {};
    const contract = apartment.contract || {};

    const titleEl = document.getElementById("editApartmentModalTitle");
    const modal = document.getElementById("editApartmentModal");

    if (titleEl) {
      titleEl.textContent = `تعديل شقة ${apartment.number}`;
    }

    setFieldValue("linkFullName", tenantInfo.fullName);
    setFieldValue("linkNationalId", apartment.tenantNationalId);
    setFieldValue("linkNationality", tenantInfo.nationality);
    setFieldValue("linkTenantType", tenantInfo.tenantType);
    setFieldValue("linkPhoneNumber", tenantInfo.phoneNumber);
    setFieldValue("linkRent", apartment.rent || contract.rentAmount || "");

    setFieldValue("linkFloorNumber", apartment.floorNumber);
    setFieldValue("linkRoomsCount", apartment.roomsCount);
    setFieldValue("linkBathroomsCount", apartment.bathroomsCount);
    setFieldValue("linkLivingRoomsCount", apartment.livingRoomsCount);

    setFieldValue("linkPaymentCycle", contract.paymentCycle || apartment.paymentDefaults?.paymentCycle || "monthly");
    setFieldValue("linkInstallmentsCount", contract.installmentsCount || "");
    setFieldValue("linkInsurancePaid", contract.insurancePaid);
    setFieldValue("linkStartDate", contract.startDate);
    setFieldValue("linkEndDate", contract.endDate);
    setFieldValue("linkMeterNumber", contract.meterNumber);
    setFieldValue("linkNotes", contract.notes);

    showError("");

    if (modal) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeEditModal() {
    selectedApartmentId = null;

    const modal = document.getElementById("editApartmentModal");
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    showError("");
  }

  function readEditFormData() {
    const getValue = (id) => {
      return (document.getElementById(id)?.value || "").trim();
    };

    return {
      fullName: getValue("linkFullName"),
      nationalId: getValue("linkNationalId"),
      nationality: getValue("linkNationality"),
      tenantType: getValue("linkTenantType"),
      phone: getValue("linkPhoneNumber"),
      rent: getValue("linkRent"),

      floorNumber: getValue("linkFloorNumber"),
      roomsCount: getValue("linkRoomsCount"),
      bathroomsCount: getValue("linkBathroomsCount"),
      livingRoomsCount: getValue("linkLivingRoomsCount"),

      paymentCycle: getValue("linkPaymentCycle"),
      installmentsCount: getValue("linkInstallmentsCount"),
      insurancePaid: getValue("linkInsurancePaid"),
      startDate: getValue("linkStartDate"),
      endDate: getValue("linkEndDate"),
      meterNumber: getValue("linkMeterNumber"),
      notes: getValue("linkNotes"),
    };
  }

  function validateEditFormData(data) {
    if (data.nationalId && !/^\d{10}$/.test(data.nationalId)) {
      return "رقم الهوية / الإقامة يجب أن يكون 10 أرقام";
    }

    if (data.phone && !/^05\d{8}$/.test(data.phone)) {
      return "رقم الجوال غير صحيح";
    }

    if (data.endDate && data.startDate && data.endDate < data.startDate) {
      return "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية";
    }

    if (data.installmentsCount && Number(data.installmentsCount) < 1) {
      return "عدد الدفعات غير صحيح";
    }

    return "";
  }

  function saveApartmentEdit() {
    if (!selectedApartmentId) return;

    const formData = readEditFormData();
    const validationMessage = validateEditFormData(formData);

    showError("");

    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    const allApartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");

    const updatedApartments = allApartments.map((apt) => {
      if (apt.id !== selectedApartmentId) return apt;

      const oldContract = apt.contract || {};
      const oldTenantInfo = apt.tenantInfo || {};

      const hasTenantData =
        formData.fullName ||
        formData.nationalId ||
        formData.nationality ||
        formData.tenantType ||
        formData.phone;

      return {
        ...apt,
        rent: formData.rent ? Number(formData.rent) : "",
        floorNumber: formData.floorNumber ? Number(formData.floorNumber) : null,
        roomsCount: formData.roomsCount ? Number(formData.roomsCount) : null,
        bathroomsCount: formData.bathroomsCount ? Number(formData.bathroomsCount) : null,
        livingRoomsCount: formData.livingRoomsCount ? Number(formData.livingRoomsCount) : null,

        tenantNationalId: formData.nationalId || null,

        tenantInfo: hasTenantData
          ? {
              fullName: formData.fullName || "",
              phoneNumber: formData.phone || "",
              nationality: formData.nationality || "",
              tenantType: formData.tenantType || "",
            }
          : oldTenantInfo,

        contract: {
          ...oldContract,
          startDate: formData.startDate || "",
          endDate: formData.endDate || "",
          rentAmount: formData.rent ? Number(formData.rent) : Number(oldContract.rentAmount || 0),
          paymentCycle: formData.paymentCycle || apt.paymentDefaults?.paymentCycle || "monthly",
          installmentsCount: formData.installmentsCount ? Number(formData.installmentsCount) : Number(oldContract.installmentsCount || 0),
          insurancePaid: formData.insurancePaid || "",
          meterNumber: formData.meterNumber || "",
          notes: formData.notes || "",
        },
      };
    });

    localStorage.setItem("walajna_apartments", JSON.stringify(updatedApartments));
    closeEditModal();
    window.location.reload();
  }

  function evictApartment(apartmentId) {
    const confirmed = confirm("هل أنت متأكد من إخلاء المستأجر من هذه الشقة؟");
    if (!confirmed) return;

    const updatedApartments = apartments.map((apartment) => {
      if (apartment.id !== apartmentId) return apartment;

      return {
        ...apartment,
        rent: "",
        tenantUserId: null,
        tenantNationalId: null,
        tenantInfo: {},
        contract: {},
        leaseStatus: "vacant",
        status: "فارغة",
      };
    });

    localStorage.setItem("walajna_apartments", JSON.stringify(updatedApartments));
    window.location.reload();
  }

  function getCycleMonths(paymentCycle) {
    switch (paymentCycle) {
      case "quarterly":
        return 3;
      case "semi_annual":
      case "semi":
        return 6;
      case "annual":
        return 12;
      case "monthly":
      default:
        return 1;
    }
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  function addMonths(date, monthsToAdd) {
    const d = new Date(date);
    const originalDay = d.getDate();

    d.setDate(1);
    d.setMonth(d.getMonth() + monthsToAdd);

    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDay, lastDay));

    return d;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return startA <= endB && endA >= startB;
  }

  function getPaymentCoverageStart(payment) {
    const rawDate = payment.dueDate;
    const date = rawDate ? new Date(rawDate) : null;

    if (!date || Number.isNaN(date.getTime())) return null;

    return date;
  }

  function getApartmentRealizedIncomeForRange(apartmentId, rangeStart, rangeEnd) {
    const apartmentPayments = payments.filter((payment) => {
      return payment.apartmentId === apartmentId && payment.status === "paid";
    });

    let income = 0;

    apartmentPayments.forEach((payment) => {
      const coverageStartDate = getPaymentCoverageStart(payment);
      if (!coverageStartDate) return;

      const cycleMonths = getCycleMonths(payment.paymentCycle);
      const monthlyAmount =
        Number(payment.monthlyRentAmount || 0) ||
        (cycleMonths > 0 ? Number(payment.amount || 0) / cycleMonths : 0);

      if (!monthlyAmount) return;

      for (let i = 0; i < cycleMonths; i += 1) {
        const coveredMonthDate = addMonths(coverageStartDate, i);
        const coveredStart = startOfMonth(coveredMonthDate);
        const coveredEnd = endOfMonth(coveredMonthDate);

        if (rangesOverlap(coveredStart, coveredEnd, rangeStart, rangeEnd)) {
          income += monthlyAmount;
        }
      }
    });

    return income;
  }

  function getBuildingFinancialSummary() {
    const apartmentIds = buildingApartments.map((a) => a.id);

    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);

    const monthlyIncome = buildingApartments.reduce((sum, apartment) => {
      return sum + getApartmentRealizedIncomeForRange(
        apartment.id,
        currentMonthStart,
        currentMonthEnd
      );
    }, 0);

    const expenses = costs
      .filter((cost) => {
        if (!apartmentIds.includes(cost.apartmentId)) return false;
        if (!cost.date) return false;

        const costDate = new Date(cost.date);
        if (Number.isNaN(costDate.getTime())) return false;

        return costDate >= currentMonthStart && costDate <= currentMonthEnd;
      })
      .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);

    const profit = monthlyIncome - expenses;

    const occupiedUnits = buildingApartments.filter((apartment) => {
      return (
        apartment.leaseStatus !== "vacant" ||
        !!apartment.tenantUserId ||
        !!apartment.tenantNationalId ||
        !!apartment.tenantInfo?.fullName
      );
    }).length;

    const lateUnits = buildingApartments.filter((apartment) => {
      return isApartmentRentOverdue(apartment.id);
    }).length;

    return {
      monthlyIncome,
      expenses,
      profit,
      occupiedUnits,
      totalUnits: buildingApartments.length,
      lateUnits,
    };
  }

  function renderBuildingFinancialSummary() {
    const incomeEl = document.getElementById("buildingIncome");
    const costsEl = document.getElementById("buildingCosts");
    const profitEl = document.getElementById("buildingProfit");
    const occupiedEl = document.getElementById("buildingOccupiedUnits");
    const lateEl = document.getElementById("buildingLateUnits");

    const summary = getBuildingFinancialSummary();

    if (incomeEl) {
      incomeEl.textContent = formatMoney(summary.monthlyIncome);
    }

    if (costsEl) {
      costsEl.textContent = formatMoney(summary.expenses);
    }

    if (profitEl) {
      profitEl.textContent = formatMoney(summary.profit);
      profitEl.classList.remove("profit-positive", "profit-negative");

      if (summary.profit > 0) {
        profitEl.classList.add("profit-positive");
      } else if (summary.profit < 0) {
        profitEl.classList.add("profit-negative");
      }
    }

    if (occupiedEl) {
      occupiedEl.textContent = `${summary.occupiedUnits} / ${summary.totalUnits}`;
    }

    if (lateEl) {
      lateEl.textContent = String(summary.lateUnits);
    }
  }

  renderBuildingFinancialSummary();

  function deleteApartment(apartmentId) {
    const confirmed = confirm("هل أنت متأكد من حذف الشقة؟ سيتم حذف كل البيانات المرتبطة بها.");
    if (!confirmed) return;

    const updatedApartments = apartments.filter((apartment) => apartment.id !== apartmentId);
    const updatedRequests = requests.filter((request) => request.apartmentId !== apartmentId);
    const updatedPayments = payments.filter((payment) => payment.apartmentId !== apartmentId);
    const updatedCosts = costs.filter((cost) => cost.apartmentId !== apartmentId);

    const documents = JSON.parse(localStorage.getItem("walajna_documents") || "[]");
    const updatedDocuments = documents.filter((document) => document.apartmentId !== apartmentId);

    localStorage.setItem("walajna_apartments", JSON.stringify(updatedApartments));
    localStorage.setItem("walajna_requests", JSON.stringify(updatedRequests));
    localStorage.setItem("walajna_payments", JSON.stringify(updatedPayments));
    localStorage.setItem("walajna_costs", JSON.stringify(updatedCosts));
    localStorage.setItem("walajna_documents", JSON.stringify(updatedDocuments));

    alert("تم حذف الشقة بنجاح");
    window.location.reload();
  }

  const floors = {};

  buildingApartments.forEach((apartment) => {
    const floor = Number(apartment.floorNumber || 1);

    if (!floors[floor]) {
      floors[floor] = [];
    }

    floors[floor].push(apartment);
  });

  const sortedFloors = Object.keys(floors)
    .map(Number)
    .sort((a, b) => a - b);

  grid.innerHTML = sortedFloors
    .map((floorNumber) => {
      const floorApartments = floors[floorNumber].sort((a, b) => {
        const aNum = Number(a.number || 0);
        const bNum = Number(b.number || 0);
        return aNum - bNum;
      });

      const apartmentsHtml = floorApartments
        .map((apartment) => {
          const openRequests = getOpenRequests(apartment.id);
          const highestPriorityRequest = getHighestPriorityRequest(apartment.id);
          const isOverdue = isApartmentRentOverdue(apartment.id);

          let typeClass = "none";

          const isRented =
            apartment.leaseStatus !== "vacant" ||
            !!apartment.tenantUserId ||
            !!apartment.tenantNationalId ||
            !!apartment.tenantInfo?.fullName;

          const rentedBadge = isRented
            ? `<span class="apartment-badge rented-badge">مؤجرة</span>`
            : "";

          if (isOverdue) {
            typeClass = "rent-overdue";
          } else if (highestPriorityRequest) {
            typeClass = highestPriorityRequest.typeId;
          }

          let badgesHtml = "";

          if (openRequests.length) {
            badgesHtml = `
              <div class="apartment-badges">
                ${openRequests
                  .map(
                    (req) => `
                      <span class="apartment-badge badge-${req.typeId}">
                        <span class="badge-dot"></span>
                        ${req.typeTitle}
                      </span>
                    `
                  )
                  .join("")}
              </div>
            `;
          }

          return `
            <div class="apartment-card ${typeClass}" data-id="${apartment.id}">
              <div class="apartment-card-menu-wrap">
                <button
                  type="button"
                  class="apartment-more-btn"
                  data-menu-btn="true"
                  data-id="${apartment.id}"
                  aria-label="خيارات الشقة"
                >
                  ⋮
                </button>

                <div class="apartment-card-menu" data-menu="${apartment.id}">
                  <button
                    type="button"
                    data-action="edit-apartment"
                    data-id="${apartment.id}"
                  >
                    تعديل
                  </button>

                  <button
                    type="button"
                    class="danger"
                    data-action="evict-apartment"
                    data-id="${apartment.id}"
                  >
                    إخلاء
                  </button>
                </div>
              </div>

              <div class="apartment-number-row">
                <div class="apartment-number">
                  شقة ${apartment.number}
                </div>
                ${rentedBadge}
              </div>

              <div class="apartment-tenant">
                ${apartment.tenantInfo?.fullName || "بدون مستأجر"}
              </div>

              ${badgesHtml}
            </div>
          `;
        })
        .join("");

      return `
        <div class="floor-section">
          <div class="floor-title">الدور ${floorNumber}</div>
          <div class="floor-apartments">
            ${apartmentsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".apartment-more-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const apartmentId = button.dataset.id;
      const card = button.closest(".apartment-card");
      const targetMenu = document.querySelector(`[data-menu="${apartmentId}"]`);
      const isOpen = targetMenu?.classList.contains("is-open");

      closeAllApartmentMenus();

      if (targetMenu && !isOpen) {
        targetMenu.classList.add("is-open");
        if (card) {
          card.classList.add("menu-open");
        }
      }
    });
  });

  document.querySelectorAll('[data-action="edit-apartment"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const apartmentId = button.dataset.id;
      closeAllApartmentMenus();
      openEditModal(apartmentId);
    });
  });

  document.querySelectorAll('[data-action="evict-apartment"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const apartmentId = button.dataset.id;
      closeAllApartmentMenus();
      evictApartment(apartmentId);
    });
  });

  document.querySelectorAll(".apartment-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".apartment-card-menu-wrap")) return;

      const aptId = card.dataset.id;
      window.location.href = `../main/apartment_info.html?id=${encodeURIComponent(aptId)}`;
    });
  });

  const closeBtn = document.getElementById("closeEditApartmentModal");
  const cancelBtn = document.getElementById("cancelEditApartmentModal");
  const backdrop = document.querySelector('[data-close-edit-modal="true"]');
  const saveBtn = document.getElementById("saveLinkedTenantBtn");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeEditModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeEditModal);
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeEditModal);
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", saveApartmentEdit);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".apartment-card-menu-wrap")) {
      closeAllApartmentMenus();
    }
  });
});