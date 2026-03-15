/* ========================================
   Apartment Link Tenant System
   ======================================== */

function initLinkTenantSystem(aptId, currentUser) {
  const elements = {
    modal: document.getElementById("linkTenantModal"),
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
    roomsCount: document.getElementById("linkRoomsCount"),
    bathroomsCount: document.getElementById("linkBathroomsCount"),
    livingRoomsCount: document.getElementById("linkLivingRoomsCount"),

    insurancePaid: document.getElementById("linkInsurancePaid"),
    startDate: document.getElementById("linkStartDate"),
    endDate: document.getElementById("linkEndDate"),
    meterNumber: document.getElementById("linkMeterNumber"),
    notes: document.getElementById("linkNotes"),
    contractFile: document.getElementById("contractFile"),

    extractBtn: document.getElementById("extractContractBtn"),
    saveBtn: document.getElementById("saveLinkedTenantBtn"),
    errorBox: document.getElementById("linkTenantError"),
  };

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

  function resetForm() {
    showError("");

    const paymentDefaults = getApartmentPaymentDefaults();

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

    clearField(elements.floorNumber);
    clearField(elements.roomsCount);
    clearField(elements.bathroomsCount);
    clearField(elements.livingRoomsCount);

    clearField(elements.insurancePaid);
    clearField(elements.startDate);
    clearField(elements.endDate);
    clearField(elements.meterNumber);
    clearField(elements.notes);
    clearField(elements.contractFile);
  }

  function openModal() {
    if (!elements.modal) return;

    resetForm();
    elements.modal.classList.add("is-open");
    elements.modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!elements.modal) return;

    elements.modal.classList.remove("is-open");
    elements.modal.setAttribute("aria-hidden", "true");
    resetForm();
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

      paymentCycle,
      installmentsCount:
        rawInstallmentsCount > 0
          ? rawInstallmentsCount
          : Number(
              apartmentDefaults.installmentsCount ||
                getDefaultInstallmentsCount(paymentCycle)
            ),

      floorNumber: getFieldValue(elements.floorNumber),
      roomsCount: getFieldValue(elements.roomsCount),
      bathroomsCount: getFieldValue(elements.bathroomsCount),
      livingRoomsCount: getFieldValue(elements.livingRoomsCount),

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
      rent: data.rent,

      floorNumber: data.floorNumber ? Number(data.floorNumber) : null,
      roomsCount: data.roomsCount ? Number(data.roomsCount) : null,
      bathroomsCount: data.bathroomsCount ? Number(data.bathroomsCount) : null,
      livingRoomsCount: data.livingRoomsCount ? Number(data.livingRoomsCount) : null,

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
      },
    };

    return normalizeApartmentLeaseStatus(updatedApartment);
  }

  function saveTenantLink(data) {
    const tenantUser = ensureTenantRoleByNationalId(data.nationalId);
    const tenantUserId = tenantUser ? tenantUser.id : null;

    const apartments = getApartments();

    const updatedApartments = apartments.map((apt) => {
      if (apt.id !== aptId) return apt;
      return buildUpdatedApartment(apt, tenantUserId, data);
    });

    saveApartments(updatedApartments);

    if (elements.contractFile && elements.contractFile.files.length > 0) {
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
    alert("تم ربط المستأجر بالشقة بنجاح ✅");
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
    closeLinkTenantModalFn: closeModal,
  };
}