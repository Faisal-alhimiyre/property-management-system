document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("buildingForm");
  const message = document.getElementById("formMessage");
  const buildingCodeInput = document.getElementById("buildingCode");

  if (!form) return;

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
    message.textContent = text;
    message.style.color = "#dc2626";
  }

  function showSuccess(text) {
    message.textContent = text;
    message.style.color = "#16a34a";
  }

  function buildApartmentRecord(buildingCode, buildingName, apartmentNumber, floorNumber) {
    const aptNumber = String(apartmentNumber);

    return {
      id: `${buildingCode}-A${aptNumber}`,
      buildingId: buildingCode,
      buildingName: buildingName,
      number: aptNumber,
      floorNumber: floorNumber,

      leaseStatus: "vacant",
      status: "فارغة",

      rent: "",
      tenantUserId: null,
      tenantNationalId: null,

      tenantInfo: null,
      contract: null,
      tenantHistory: [],

      createdAt: new Date().toISOString(),
    };
  }

  function generateApartmentsForBuilding(buildingCode, buildingName, apartmentCount, apartmentsPerFloor) {
    const generatedApartments = [];

    for (let i = 1; i <= apartmentCount; i++) {
      const floorNumber = Math.ceil(i / apartmentsPerFloor);

      generatedApartments.push(
        buildApartmentRecord(buildingCode, buildingName, i, floorNumber)
      );
    }

    return generatedApartments;
  }

  const existingBuildings = getLocalArray("walajna_buildings");

  if (buildingCodeInput) {
    const newCode = generateUniqueBuildingCode(existingBuildings);
    buildingCodeInput.value = newCode;
    buildingCodeInput.readOnly = true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const buildingName = document.getElementById("buildingName")?.value.trim();
    const buildingCode = document.getElementById("buildingCode")?.value.trim();
    const buildingCity = document.getElementById("buildingCity")?.value.trim();
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

    if (totalFloors * apartmentsPerFloor < apartmentCount) {
      showError("عدد الطوابق × عدد الشقق في كل طابق أقل من إجمالي عدد الشقق");
      return;
    }

    const buildings = getLocalArray("walajna_buildings");
    const apartments = getLocalArray("walajna_apartments");

    const buildingExists = buildings.some(
      (b) => b.id.toLowerCase() === buildingCode.toLowerCase()
    );

    if (buildingExists) {
      showError("رمز العمارة مستخدم بالفعل");
      return;
    }

    const currentUser = JSON.parse(
      localStorage.getItem("walajna_current_user") || "null"
    );

    const newBuilding = {
      id: buildingCode,
      name: buildingName,
      city: buildingCity,
      apartmentCount: apartmentCount,
      totalFloors: totalFloors,
      apartmentsPerFloor: apartmentsPerFloor,
      ownerId: currentUser?.id || null,
      createdAt: new Date().toISOString(),
    };

    const newApartments = generateApartmentsForBuilding(
      buildingCode,
      buildingName,
      apartmentCount,
      apartmentsPerFloor
    );

    buildings.push(newBuilding);
    apartments.push(...newApartments);

    saveLocalArray("walajna_buildings", buildings);
    saveLocalArray("walajna_apartments", apartments);

    showSuccess("تم حفظ العمارة بنجاح");

    form.reset();

    if (buildingCodeInput) {
      buildingCodeInput.value = generateUniqueBuildingCode(buildings);
      buildingCodeInput.readOnly = true;
    }

    setTimeout(() => {
      window.location.href = "owner_home.html";
    }, 900);
  });
});