document.addEventListener("DOMContentLoaded", async () => {
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
    const bedroomsInput = document.getElementById("bedrooms");
    const bathroomsInput = document.getElementById("bathrooms");
    const livingRoomsInput = document.getElementById("livingRooms");

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

    if (defaultPaymentCycleInput) {
      defaultPaymentCycleInput.value =
        building.paymentDefaults?.paymentCycle || "monthly";
    }

    if (bedroomsInput) {
      bedroomsInput.value = building.apartmentDefaults?.bedrooms ?? "";
    }

    if (bathroomsInput) {
      bathroomsInput.value = building.apartmentDefaults?.bathrooms ?? "";
    }

    if (livingRoomsInput) {
      livingRoomsInput.value = building.apartmentDefaults?.livingRooms ?? "";
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
    paymentDefaults = {},
    apartmentDefaults = {}
  ) {
    const aptNumber = String(apartmentNumber);

    return {
      id: `${buildingCode}-A${aptNumber}`,
      buildingId: buildingCode,
      buildingName: buildingName,
      number: aptNumber,
      floorNumber: Number(floorNumber) || 1,

      leaseStatus: "vacant",
      status: "فارغة",

      rent: "",
      tenantUserId: null,
      tenantNationalId: null,

      tenantInfo: null,
      contract: null,
      tenantHistory: [],

      bedrooms: apartmentDefaults.bedrooms ?? 0,
      bathrooms: apartmentDefaults.bathrooms ?? 0,
      livingRooms: apartmentDefaults.livingRooms ?? 0,

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
  totalFloors,
  apartmentsPerFloor,
  paymentDefaults = {},
  apartmentDefaults = {}
) {
  const generatedApartments = [];
  let currentApartment = 1;

  for (let floor = 1; floor <= totalFloors; floor++) {
    for (let unit = 1; unit <= apartmentsPerFloor; unit++) {
      if (currentApartment > apartmentCount) break;

      generatedApartments.push(
        buildApartmentRecord(
          buildingCode,
          buildingName,
          currentApartment,
          floor,
          paymentDefaults,
          apartmentDefaults
        )
      );

      currentApartment++;
    }

    if (currentApartment > apartmentCount) break;
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

  await WalajnaAuth.hydrateSession();
  requireAuth();
  requireRole('owner');
  ensureRoleSetup();

  const API_BASE = WalajnaAuth.API_BASE;

  async function syncApartmentsToServer(apartmentsToSync, buildingInfo, ownerId) {
    if (!Number.isFinite(Number(ownerId))) return;

    try {
      const listRes = await WalajnaAuth.fetchWithAuth(`${API_BASE}/api/apartments`, {
        method: "GET",
      });

      const existing = listRes.ok ? await listRes.json() : [];
      const existingKeys = new Set();

      existing.forEach((apt) => {
        const description = String(apt.description || "");
        if (!description.startsWith("WALAJNA_META:")) return;

        const metaRaw = description.replace("WALAJNA_META:", "");
        try {
          const meta = JSON.parse(metaRaw);
          existingKeys.add(`${String(meta.buildingId)}:${String(meta.apartmentNumber)}`);
        } catch {
          // Ignore malformed old records.
        }
      });

      for (const apartment of apartmentsToSync) {
        const apartmentNumber = String(apartment.number || apartment.id || "");
        const dedupeKey = `${String(buildingInfo.id)}:${apartmentNumber}`;
        if (existingKeys.has(dedupeKey)) continue;

        const meta = {
          buildingId: String(buildingInfo.id),
          buildingCode: buildingInfo.code || null,
          apartmentNumber,
          floorNumber: Number(apartment.floorNumber || 1),
        };

        const payload = {
          owner_id: Number(ownerId),
          address: `${buildingInfo.name} - شقة ${apartmentNumber}`,
          description: `WALAJNA_META:${JSON.stringify(meta)}`,
          rent: Number(apartment.rent || 0),
        };

        const createRes = await WalajnaAuth.fetchWithAuth(`${API_BASE}/api/apartments`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (createRes.ok) {
          existingKeys.add(dedupeKey);
        }
      }
    } catch (error) {
      console.warn("Could not sync apartments to server", error);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    showError("");

    const buildingName = document.getElementById("buildingName")?.value.trim();
    const buildingCode = document.getElementById("buildingCode")?.value.trim();
    const buildingCity = document.getElementById("building-city")?.value.trim();

    const bedrooms = parseInt(document.getElementById("bedrooms")?.value, 10);
    const bathrooms = parseInt(document.getElementById("bathrooms")?.value, 10);
    const livingRooms = parseInt(document.getElementById("livingRooms")?.value, 10);

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

    if (Number.isNaN(bedrooms) || bedrooms < 0) {
      showError("يرجى إدخال عدد غرف النوم بشكل صحيح");
      return;
    }

    if (Number.isNaN(bathrooms) || bathrooms < 0) {
      showError("يرجى إدخال عدد دورات المياه بشكل صحيح");
      return;
    }

    if (Number.isNaN(livingRooms) || livingRooms < 0) {
      showError("يرجى إدخال عدد غرف المعيشة بشكل صحيح");
      return;
    }

    const expectedApartments = totalFloors * apartmentsPerFloor;

 if (apartmentCount > totalFloors * apartmentsPerFloor) {
  showError("عدد الشقق أكبر من السعة الممكنة");
  return;
}

    if (!defaultPaymentCycle) {
      showError("يرجى اختيار دورة الدفع الافتراضية");
      return;
    }

    const buildings = getLocalArray("walajna_buildings");
    const apartments = getLocalArray("walajna_apartments");

    const normalizeLower = (value) => String(value || "").trim().toLowerCase();

    const buildingExists = buildings.some((b) => {
      const existingCode = normalizeLower(b.code || b.id);
      const currentCode = normalizeLower(buildingCode);

      if (isEditMode) {
        return (
          existingCode === currentCode &&
          b.id !== editBuildingId
        );
      }

      return existingCode === currentCode;
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

    const apartmentDefaults = {
      bedrooms,
      bathrooms,
      livingRooms,
    };

    const buildingPayload = {
      id: buildingCode,
      name: buildingName,
      city: buildingCity,
      apartmentCount,
      totalFloors,
      apartmentsPerFloor,
      paymentDefaults,
      apartmentDefaults,
      ownerId: currentUser?.id || null,
      createdAt: isEditMode
        ? (buildingToEdit?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
    };

    let apiSucceeded = false;
    const payload = {
      name: buildingName,
      city: buildingCity,
      code: buildingCode,
      total_floors: totalFloors,
      apartments_count: apartmentCount,
      apartments_per_floor: apartmentsPerFloor,
      apartment_defaults: apartmentDefaults,
      payment_defaults: paymentDefaults,
    };

    const buildingApiId = isEditMode ? (buildingToEdit?.id || editBuildingId) : null;
    const endpoint = isEditMode
      ? `${API_BASE}/api/buildings/${buildingApiId}`
      : `${API_BASE}/api/buildings`;

    try {
      const apiResponse = await WalajnaAuth.fetchWithAuth(endpoint, {
        method: isEditMode ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      if (apiResponse.ok) {
        const serverRecord = await apiResponse.json();
        apiSucceeded = true;
        if (!isEditMode) {
          buildingPayload.id = serverRecord.id;
        }
        showSuccess(isEditMode ? "تم تحديث العمارة بنجاح" : "تم حفظ العمارة بنجاح");
      } else {
        const err = await apiResponse.json().catch(() => ({}));
        console.warn("Building API response error", err);
        showError("حدث خطأ أثناء الحفظ في الخادم، سيتم حفظ البيانات محليًا.");
      }
    } catch (ex) {
      console.warn("Buildings API error", ex);
      showError("تعذر التواصل مع الخادم، سيتم حفظ البيانات محليًا.");
    }

    // Local fallback for now
    if (isEditMode) {
      const updatedBuildings = buildings.map((building) =>
        building.id === editBuildingId ? buildingPayload : building
      );

      const updatedApartments = apartments.map((apartment) => {
        if (apartment.buildingId !== editBuildingId) return apartment;

        return {
          ...apartment,
          buildingName: buildingName,
          bedrooms,
          bathrooms,
          livingRooms,
          paymentDefaults: {
            ...apartment.paymentDefaults,
            paymentCycle: defaultPaymentCycle,
          },
        };
      });

      saveLocalArray("walajna_buildings", updatedBuildings);
      saveLocalArray("walajna_apartments", updatedApartments);

      if (!apiSucceeded) {
        showSuccess("تم تحديث العمارة في وضع عدم الاتصال (محليًا)");
      }
    } else {
      const apartmentBuildingId = buildingPayload.id;

      const newApartments = generateApartmentsForBuilding(
        apartmentBuildingId,
        buildingName,
        apartmentCount,
        totalFloors,
        apartmentsPerFloor,
        paymentDefaults,
        apartmentDefaults
      );

      buildings.push(buildingPayload);
      apartments.push(...newApartments);

      saveLocalArray("walajna_buildings", buildings);
      saveLocalArray("walajna_apartments", apartments);

      // Backend create-building already seeds apartments.
      // Keep local state for rendering, but do not re-insert apartments via /api/apartments.

      if (!apiSucceeded) {
        showSuccess("تم حفظ العمارة محليًا لأن الخادم غير متاح");
      }

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