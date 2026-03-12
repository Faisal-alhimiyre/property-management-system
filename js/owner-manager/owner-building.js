document.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("buildingTitle");
  const grid = document.getElementById("apartmentsGrid");

  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const buildingId = params.get("buildingId");

  const buildings = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const requests = JSON.parse(localStorage.getItem("walajna_requests") || "[]");
  const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");

  const building = buildings.find((b) => b.id === buildingId);

  if (building && title) {
    title.textContent = building.name;
  }

  const buildingApartments = apartments.filter((a) => a.buildingId === buildingId);

  const floors = {};

  buildingApartments.forEach((apartment) => {
    const floor = apartment.floorNumber || 1;

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
      const floorApartments = floors[floorNumber];

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
                        ${req.typeTitle}
                        <span class="badge-dot"></span>
                      </span>
                    `
                  )
                  .join("")}
              </div>
            `;
          }

       return `
  <div class="apartment-card ${typeClass}" data-id="${apartment.id}">
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
          <div class="floor-title">
            الدور ${floorNumber}
          </div>

          <div class="floor-apartments">
            ${apartmentsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".apartment-card").forEach((card) => {
    card.addEventListener("click", () => {
      const aptId = card.dataset.id;

      window.location.href =
        `../main/apartment_info.html?id=${encodeURIComponent(aptId)}`;
    });
  });

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
    return requests.filter(
      (request) =>
        request.apartmentId === apartmentId &&
        request.status !== "resolved"
    );
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
      dueDate.setHours(0, 0, 0, 0);

      return dueDate < today;
    });
  }
});