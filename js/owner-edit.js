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
    } while (buildings.some(b => b.id === code));
    return code;
  }

  const existingBuildings = getLocalArray("walajna_buildings");

  if (buildingCodeInput) {
    buildingCodeInput.value = generateUniqueBuildingCode(existingBuildings);
    buildingCodeInput.readOnly = true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const buildingName = document.getElementById("buildingName").value.trim();
    const buildingCode = document.getElementById("buildingCode").value.trim();
    const buildingCity = document.getElementById("buildingCity").value.trim();
    const apartmentCount = parseInt(document.getElementById("apartmentCount").value, 10);

    if (!buildingName || !buildingCode || !buildingCity || !apartmentCount || apartmentCount < 1) {
      message.textContent = "يرجى تعبئة البيانات بشكل صحيح";
      message.style.color = "#dc2626";
      return;
    }

    const buildings = getLocalArray("walajna_buildings");
    const apartments = getLocalArray("walajna_apartments");

    const buildingExists = buildings.some(
      b => b.id.toLowerCase() === buildingCode.toLowerCase()
    );

    if (buildingExists) {
      message.textContent = "رمز العمارة مستخدم بالفعل";
      message.style.color = "#dc2626";
      return;
    }

    const currentUser = JSON.parse(localStorage.getItem("walajna_current_user") || "null");

    const newBuilding = {
      id: buildingCode,
      name: buildingName,
      city: buildingCity,
      apartmentCount: apartmentCount,
      ownerId: currentUser?.id || null,
      createdAt: new Date().toISOString()
    };

    buildings.push(newBuilding);

    for (let i = 1; i <= apartmentCount; i++) {
      const aptNumber = String(i).padStart(2, "0");

      apartments.push({
        id: `${buildingCode}-A${aptNumber}`,
        buildingId: buildingCode,
        buildingName: buildingName,
        number: aptNumber,

        leaseStatus: "vacant", // vacant | active | ending_soon | ended
        status: "فارغة",

        rent: "",
        tenantUserId: null,
        tenantNationalId: null,

        tenantInfo: null,

        contract: null,

        tenantHistory: [],

        createdAt: new Date().toISOString()
      });
    }

    saveLocalArray("walajna_buildings", buildings);
    saveLocalArray("walajna_apartments", apartments);

    message.textContent = "تم حفظ العمارة بنجاح";
    message.style.color = "#16a34a";

    form.reset();

    if (buildingCodeInput) {
      buildingCodeInput.value = generateUniqueBuildingCode(buildings);
    }

    setTimeout(() => {
      window.location.href = "owner_home.html";
    }, 900);
  });
});