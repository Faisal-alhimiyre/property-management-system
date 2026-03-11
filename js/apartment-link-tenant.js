/* ========================================
   Apartment Link Tenant System
   ======================================== */

function initLinkTenantSystem(aptId, currentUser) {

  const linkTenantModal = document.getElementById("linkTenantModal");
  const closeLinkTenantModal = document.getElementById("closeLinkTenantModal");
  const cancelLinkTenantModal = document.getElementById("cancelLinkTenantModal");

  const linkFullName = document.getElementById("linkFullName");
  const linkNationalId = document.getElementById("linkNationalId");
  const linkNationality = document.getElementById("linkNationality");
  const linkTenantType = document.getElementById("linkTenantType");
  const linkPhoneNumber = document.getElementById("linkPhoneNumber");
  const linkRent = document.getElementById("linkRent");
  const linkInsurancePaid = document.getElementById("linkInsurancePaid");
  const linkStartDate = document.getElementById("linkStartDate");
  const linkEndDate = document.getElementById("linkEndDate");
  const linkMeterNumber = document.getElementById("linkMeterNumber");
  const linkNotes = document.getElementById("linkNotes");
  const contractFile = document.getElementById("contractFile");
  const extractContractBtn = document.getElementById("extractContractBtn");
  const saveLinkedTenantBtn = document.getElementById("saveLinkedTenantBtn");
  const linkTenantError = document.getElementById("linkTenantError");


  function showLinkTenantError(msg) {
    if (linkTenantError) {
      linkTenantError.textContent = msg;
    }
  }


  function resetLinkTenantForm() {
    showLinkTenantError("");

    if (linkFullName) linkFullName.value = "";
    if (linkNationalId) linkNationalId.value = "";
    if (linkNationality) linkNationality.value = "";
    if (linkTenantType) linkTenantType.value = "";
    if (linkPhoneNumber) linkPhoneNumber.value = "";
    if (linkRent) linkRent.value = "";
    if (linkInsurancePaid) linkInsurancePaid.value = "";
    if (linkStartDate) linkStartDate.value = "";
    if (linkEndDate) linkEndDate.value = "";
    if (linkMeterNumber) linkMeterNumber.value = "";
    if (linkNotes) linkNotes.value = "";
    if (contractFile) contractFile.value = "";
  }


  function openLinkTenantModal() {
    if (!linkTenantModal) return;

    resetLinkTenantForm();

    linkTenantModal.classList.add("is-open");
    linkTenantModal.setAttribute("aria-hidden", "false");
  }


  function closeLinkTenantModalFn() {
    if (!linkTenantModal) return;

    linkTenantModal.classList.remove("is-open");
    linkTenantModal.setAttribute("aria-hidden", "true");

    resetLinkTenantForm();
  }


  function updateCurrentUserRoleIfNeeded(userId) {
    if (!currentUser || currentUser.id !== userId) return;

    const users = getUsers();
    const freshUser = users.find((u) => u.id === userId);

    if (freshUser) {
      saveCurrentUser(freshUser);
    }
  }


  function linkTenantToApartment() {

    const fullName = (linkFullName?.value || "").trim();
    const nationalId = (linkNationalId?.value || "").trim();
    const nationality = (linkNationality?.value || "").trim();
    const tenantTypeValue = (linkTenantType?.value || "").trim();
    const phone = (linkPhoneNumber?.value || "").trim();
    const rentValue = (linkRent?.value || "").trim();
    const insuranceValue = (linkInsurancePaid?.value || "").trim();
    const startValue = (linkStartDate?.value || "").trim();
    const endValue = (linkEndDate?.value || "").trim();
    const meterValue = (linkMeterNumber?.value || "").trim();
    const notesValue = (linkNotes?.value || "").trim();

    showLinkTenantError("");

    if (!fullName) {
      showLinkTenantError("أدخل الاسم الكامل");
      return;
    }

    if (!nationalId) {
      showLinkTenantError("أدخل رقم الهوية / الإقامة");
      return;
    }

    if (!nationality) {
      showLinkTenantError("أدخل الجنسية");
      return;
    }

    if (!tenantTypeValue) {
      showLinkTenantError("اختر أفراد أو عوائل");
      return;
    }

    if (!phone) {
      showLinkTenantError("أدخل رقم الجوال");
      return;
    }

    if (!rentValue) {
      showLinkTenantError("أدخل الإيجار الشهري");
      return;
    }

    if (!startValue || !endValue) {
      showLinkTenantError("أدخل تاريخ بداية ونهاية العقد");
      return;
    }

    if (!/^\d{10}$/.test(nationalId)) {
      showLinkTenantError("رقم الهوية / الإقامة يجب أن يكون 10 أرقام");
      return;
    }

    if (!/^05\d{8}$/.test(phone)) {
      showLinkTenantError("رقم الجوال غير صحيح");
      return;
    }

    if (endValue < startValue) {
      showLinkTenantError("تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية");
      return;
    }

    const users = getUsers();
    const tenantUser = users.find((u) => u.nationalId === nationalId) || null;
    let tenantUserId = null;

    if (tenantUser) {
      tenantUserId = tenantUser.id;

      if (!Array.isArray(tenantUser.roles)) {
        tenantUser.roles = tenantUser.role ? [tenantUser.role] : [];
      }

      if (!tenantUser.roles.includes("tenant")) {
        tenantUser.roles.push("tenant");
      }

      saveUpdatedUser(tenantUser);
      updateCurrentUserRoleIfNeeded(tenantUser.id);
    }

    const apartments = getApartments();

    const updatedApartments = apartments.map((apt) => {
      if (apt.id !== aptId) return apt;

      const updatedApartment = {
        ...apt,

        ownerId: currentUser?.id || null,

        rent: rentValue,

        tenantUserId: tenantUserId,
        tenantNationalId: nationalId,

        tenantInfo: {
          fullName: fullName,
          phoneNumber: phone,
          nationality: nationality,
          tenantType: tenantTypeValue
        },

        contract: {
          startDate: startValue,
          endDate: endValue,

          rentAmount: Number(rentValue),
          paymentCycle: "monthly",

          insurancePaid: insuranceValue,
          meterNumber: meterValue,
          notes: notesValue
        }
      };

      return normalizeApartmentLeaseStatus(updatedApartment);
    });

    saveApartments(updatedApartments);

    if (contractFile && contractFile.files.length > 0) {
      const file = contractFile.files[0];
      saveDocumentForApartment(file, aptId);
    }

    closeLinkTenantModalFn();

    alert("تم ربط المستأجر بالشقة بنجاح ✅");

    window.location.reload();
  }


  if (closeLinkTenantModal) {
    closeLinkTenantModal.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLinkTenantModalFn();
    });
  }


  if (cancelLinkTenantModal) {
    cancelLinkTenantModal.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLinkTenantModalFn();
    });
  }


  if (linkTenantModal) {
    const panel = linkTenantModal.querySelector(".wl-modal__panel");
    const backdrop = linkTenantModal.querySelector(".wl-modal__backdrop");

    if (panel) {
      panel.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    if (backdrop) {
      backdrop.addEventListener("click", () => {
        closeLinkTenantModalFn();
      });
    }
  }


  if (saveLinkedTenantBtn) {
    saveLinkedTenantBtn.addEventListener("click", linkTenantToApartment);
  }


  if (extractContractBtn) {
    extractContractBtn.addEventListener("click", () => {

      if (!contractFile || contractFile.files.length === 0) {
        alert("اختر ملف العقد أولاً");
        return;
      }

      const file = contractFile.files[0];
      const reader = new FileReader();

      reader.onload = function (e) {
        const text = e.target.result;

        const nationalId = text.match(/\b\d{10}\b/);
        const phone = text.match(/05\d{8}/);

        if (nationalId && linkNationalId) {
          linkNationalId.value = nationalId[0];
        }

        if (phone && linkPhoneNumber) {
          linkPhoneNumber.value = phone[0];
        }

        alert("تم استخراج بعض البيانات من العقد");
      };

      reader.readAsText(file);
    });
  }


  return {
    openLinkTenantModal,
    closeLinkTenantModalFn
  };
}