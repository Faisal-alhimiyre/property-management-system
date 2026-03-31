document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("tenantApartments");

  if (!container) return;

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("walajna_current_user") || "null");
    } catch {
      return null;
    }
  }

  const currentUser = getCurrentUser();
  const apartments = getLocalArray("walajna_apartments");
  const buildings = getLocalArray("walajna_buildings");

  if (!currentUser) {
    container.innerHTML = `<p>لم يتم العثور على المستخدم الحالي</p>`;
    return;
  }

  const myApartments = apartments.filter(
    apt =>
      apt.tenantNationalId &&
      apt.tenantNationalId === currentUser.nationalId
  );

  if (myApartments.length === 0) {
    container.innerHTML = `<p class = "no-building">لا توجد وحدات مرتبطة بحسابك حالياً</p>`;
    return;
  }

  myApartments.forEach((apt) => {
    const building = buildings.find(b => b.id === apt.buildingId);
    const buildingName = (building?.name || "Building").trim();
    const apartmentNumber = apt.number ?? "-";
    const cardTitle = `${buildingName} - شقة ${apartmentNumber}`;

    const card = document.createElement("div");
    card.className = "building-card clickable-card";
    card.dataset.target = "../main/apartment_info.html";
    card.dataset.id = apt.id;

    card.innerHTML = `
      <div class="building-card__media" aria-hidden="true">
        <img src="../pics/tenant-house-icon.png" alt="">
      </div>
      <p>
        ${cardTitle}
      </p>
    `;

    card.addEventListener("click", () => {
      window.location.href = `../main/apartment_info.html?id=${encodeURIComponent(apt.id)}`;
    });

    container.appendChild(card);
  });
});