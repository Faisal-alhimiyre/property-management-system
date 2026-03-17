document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("buildingForm");
  const message = document.getElementById("formMessage");
  const buildingCodeInput = document.getElementById("buildingCode");
  const defaultPaymentCycleInput = document.getElementById("defaultPaymentCycle");
  const buildingCitySelect = document.getElementById("building-city");

  const params = new URLSearchParams(window.location.search);
  const editBuildingId = params.get("buildingId");
  const pageMode = params.get("mode");
  const isEditMode = pageMode === "edit" && !!editBuildingId;

  if (!form) return;

  const cities = [
    "الرياض",
    "جدة",
    "مكة",
    "المدينة المنورة",
    "الدمام",
    "الخبر",
    "الظهران",
    "الطائف",
    "تبوك",
    "أبها",
    "خميس مشيط",
    "حائل",
    "بريدة",
    "عنيزة",
    "نجران",
    "جازان",
    "الجبيل",
    "ينبع"
  ];

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function generateBuildingCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "BLD-";

    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }

  function generateUniqueBuildingCode(buildings) {
    let code;
    do {
      code = generateBuildingCode();
    } while (buildings.some((b) => b.id === code));
    return code;
  }

  function showError(text) {
    if (!message) return;
    message.textContent = text;
    message.style.color = "#dc2626";
  }

  function showSuccess(text) {
    if (!message) return;
    message.textContent = text;
    message.style.color = "#16a34a";
  }

  function populateCities() {
    if (!buildingCitySelect) return;

    buildingCitySelect.innerHTML = `<option value="">اختر المدينة</option>`;

    cities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      buildingCitySelect.appendChild(option);
    });
  }

  function fillFormForEdit(building) {
    if (!building) return;

    const buildingNameInput = document.getElementById("buildingName");
    const apartmentCountInput = document.getElementById("apartmentCount");
    const totalFloorsInput = document.getElementById("totalFloors");
    const apartmentsPerFloorInput = document.getElementById("apartmentsPerFloor");
         if (apartmentCountInput) {
      apartmentCountInput.value = building.apartmentCount || "";
      apartmentCountInput.disabled = true;
    }

    if (totalFloorsInput) {
      totalFloorsInput.value = building.totalFloors || "";
      totalFloorsInput.disabled = true;
    }

    if (apartmentsPerFloorInput) {
      apartmentsPerFloorInput.value = building.apartmentsPerFloor || "";
      apartmentsPerFloorInput.disabled = true;
    }
    if (buildingNameInput) {
      buildingNameInput.value = building.name || "";
    }

    if (buildingCodeInput) {
      buildingCodeInput.value = building.id || "";
      buildingCodeInput.readOnly = true;
    }

    if (buildingCitySelect) {
      buildingCitySelect.value = building.city || "";
    }

    if (apartmentCountInput) {
      apartmentCountInput.value = building.apartmentCount || "";
    }

    if (totalFloorsInput) {
      totalFloorsInput.value = building.totalFloors || "";
    }

    if (apartmentsPerFloorInput) {
      apartmentsPerFloorInput.value = building.apartmentsPerFloor || "";
    }

    if (defaultPaymentCycleInput) {
      defaultPaymentCycleInput.value =
        building.paymentDefaults?.paymentCycle || "monthly";
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = "حفظ التعديلات";
    }
  }

  function buildApartmentRecord(
    buildingCode,
    buildingName,
    apartmentNumber,
    floorNumber,
    paymentDefaults = {}
  ) {
    const aptNumber = String(apartmentNumber);

    return {
      id: `${buildingCode}-A${aptNumber}`,
      buildingId: buildingCode,
      buildingName: buildingName,
      number: aptNumber,
      floorNumber,

      leaseStatus: "vacant",
      status: "فارغة",

      rent: "",
      tenantUserId: null,
      tenantNationalId: null,

      tenantInfo: null,
      contract: null,
      tenantHistory: [],

      paymentDefaults: {
        paymentCycle: paymentDefaults.paymentCycle || "monthly",
      },

      createdAt: new Date().toISOString(),
    };
  }

  function generateApartmentsForBuilding(
    buildingCode,
    buildingName,
    apartmentCount,
    apartmentsPerFloor,
    paymentDefaults = {}
  ) {
    const generatedApartments = [];

    for (let i = 1; i <= apartmentCount; i++) {
      const floorNumber = Math.floor((i - 1) / apartmentsPerFloor) + 1;

      generatedApartments.push(
        buildApartmentRecord(
          buildingCode,
          buildingName,
          i,
          floorNumber,
          paymentDefaults
        )
      );
    }

    return generatedApartments;
  }

  populateCities();

  const existingBuildings = getLocalArray("walajna_buildings");
  const buildingToEdit = existingBuildings.find(
    (building) => building.id === editBuildingId
  );

  if (isEditMode) {
    if (!buildingToEdit) {
      showError("لم يتم العثور على بيانات العمارة المطلوب تعديلها");
      return;
    }

    fillFormForEdit(buildingToEdit);
  } else {
    if (buildingCodeInput) {
      const newCode = generateUniqueBuildingCode(existingBuildings);
      buildingCodeInput.value = newCode;
      buildingCodeInput.readOnly = true;
    }

    if (defaultPaymentCycleInput && !defaultPaymentCycleInput.value) {
      defaultPaymentCycleInput.value = "monthly";
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    showError("");

    const buildingName = document.getElementById("buildingName")?.value.trim();
    const buildingCode = document.getElementById("buildingCode")?.value.trim();
    const buildingCity = document.getElementById("building-city")?.value.trim();
        
    if (/[a-zA-Z]/.test(buildingName)) {
  alert("اسم الشقة يجب أن يكون بالعربية فقط");
  return;
}
    const apartmentCount = parseInt(
      document.getElementById("apartmentCount")?.value,
      10
    );

    const totalFloors = parseInt(
      document.getElementById("totalFloors")?.value,
      10
    );

    const apartmentsPerFloor = parseInt(
      document.getElementById("apartmentsPerFloor")?.value,
      10
    );

    const defaultPaymentCycle =
      document.getElementById("defaultPaymentCycle")?.value || "monthly";

    if (!buildingName || !buildingCode || !buildingCity || !apartmentCount || apartmentCount < 1) {
      showError("يرجى تعبئة البيانات الأساسية بشكل صحيح");
      return;
    }

    if (!totalFloors || totalFloors < 1) {
      showError("يرجى إدخال عدد الطوابق بشكل صحيح");
      return;
    }

    if (!apartmentsPerFloor || apartmentsPerFloor < 1) {
      showError("يرجى إدخال عدد الشقق في كل طابق بشكل صحيح");
      return;
    }
const expectedApartments = totalFloors * apartmentsPerFloor;

if (apartmentCount !== expectedApartments) {
    showError(
        `توزيع الشقق غير صحيح. 
عدد الشقق يجب أن يكون ${expectedApartments} بناءً على الأدوار والشقق في كل دور`
    );
    return;
}
    if (!defaultPaymentCycle) {
      showError("يرجى اختيار دورة الدفع الافتراضية");
      return;
    }

    const buildings = getLocalArray("walajna_buildings");
    const apartments = getLocalArray("walajna_apartments");

    const buildingExists = buildings.some((b) => {
      if (isEditMode) {
        return (
          b.id.toLowerCase() === buildingCode.toLowerCase() &&
          b.id !== editBuildingId
        );
      }

      return b.id.toLowerCase() === buildingCode.toLowerCase();
    });

    if (buildingExists) {
      showError("رمز العمارة مستخدم بالفعل");
      return;
    }

    const currentUser = JSON.parse(
      localStorage.getItem("walajna_current_user") || "null"
    );

    const paymentDefaults = {
      paymentCycle: defaultPaymentCycle,
    };

    const buildingPayload = {
      id: buildingCode,
      name: buildingName,
      city: buildingCity,
      apartmentCount,
      totalFloors,
      apartmentsPerFloor,
      paymentDefaults,
      ownerId: currentUser?.id || null,
      createdAt: isEditMode
        ? (buildingToEdit?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
    };

    if (isEditMode) {
      const updatedBuildings = buildings.map((building) =>
        building.id === editBuildingId ? buildingPayload : building
      );

      const updatedApartments = apartments.map((apartment) => {
        if (apartment.buildingId !== editBuildingId) return apartment;

        return {
          ...apartment,
          buildingName: buildingName,
          paymentDefaults: {
            ...apartment.paymentDefaults,
            paymentCycle: defaultPaymentCycle,
          },
        };
      });

      saveLocalArray("walajna_buildings", updatedBuildings);
      saveLocalArray("walajna_apartments", updatedApartments);

      showSuccess("تم تحديث العمارة بنجاح");
    } else {
      const newApartments = generateApartmentsForBuilding(
        buildingCode,
        buildingName,
        apartmentCount,
        apartmentsPerFloor,
        paymentDefaults
      );

      buildings.push(buildingPayload);
      apartments.push(...newApartments);

      saveLocalArray("walajna_buildings", buildings);
      saveLocalArray("walajna_apartments", apartments);

      showSuccess("تم حفظ العمارة بنجاح");

      form.reset();

      if (buildingCodeInput) {
        buildingCodeInput.value = generateUniqueBuildingCode(buildings);
        buildingCodeInput.readOnly = true;
      }

      if (defaultPaymentCycleInput) {
        defaultPaymentCycleInput.value = "monthly";
      }

      if (buildingCitySelect) {
        buildingCitySelect.value = "";
      }
    }

    setTimeout(() => {
      window.location.href = "owner_home.html";
    }, 900);
  });
});