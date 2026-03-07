document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("buildingForm");
  const message = document.getElementById("formMessage");

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const buildingName = document.getElementById("buildingName").value.trim();
    const buildingCode = document.getElementById("buildingCode").value.trim();
    const buildingCity = document.getElementById("buildingCity").value.trim();
    const apartmentCount = parseInt(document.getElementById("apartmentCount").value, 10);

    if (!buildingName || !buildingCode || !apartmentCount || apartmentCount < 1) {
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

    const newBuilding = {
      id: buildingCode,
      name: buildingName,
      city: buildingCity,
      apartmentCount: apartmentCount
    };

    buildings.push(newBuilding);

    for (let i = 1; i <= apartmentCount; i++) {
      const aptNumber = String(i).padStart(2, "0");

      apartments.push({
        id: `${buildingCode}-A${aptNumber}`,
        buildingId: buildingCode,
        number: aptNumber,
        status: "فارغة",
        rent: "",
        tenantId: null
      });
    }

    localStorage.setItem("walajna_buildings", JSON.stringify(buildings));
    localStorage.setItem("walajna_apartments", JSON.stringify(apartments));

    message.textContent = "تم حفظ العمارة بنجاح";
    message.style.color = "#16a34a";

    form.reset();

    setTimeout(() => {
      window.location.href = "owner_home.html";
    }, 900);
  });

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }
});