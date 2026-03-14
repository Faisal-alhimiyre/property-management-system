document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("buildingsContainer");
  const emptyState = document.getElementById("emptyState");

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

  function getRequestPriority(typeId) {
    const priorities = {
      maintenance: 2,
      complaint: 3,
      suggestion: 4,
      request: 5
    };

    return priorities[typeId] || 99;
  }

  function getOpenRequests(apartmentId, allRequests) {
    return allRequests.filter(
      (request) =>
        request.apartmentId === apartmentId &&
        request.status !== "resolved"
    );
  }

  function getHighestPriorityRequest(apartmentId, allRequests) {
    const openRequests = getOpenRequests(apartmentId, allRequests);

    if (!openRequests.length) return null;

    return [...openRequests].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function isApartmentRentOverdue(apartmentId, allPayments) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allPayments.some((payment) => {
      if (payment.apartmentId !== apartmentId) return false;
      if (payment.status === "paid") return false;
      if (!payment.dueDate) return false;

      const dueDate = new Date(payment.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      return dueDate < today;
    });
  }

  function getApartmentStatusClass(apartment, allRequests, allPayments) {
    if (isApartmentRentOverdue(apartment.id, allPayments)) {
      return "rent-overdue";
    }

    const highestPriorityRequest = getHighestPriorityRequest(apartment.id, allRequests);

    if (!highestPriorityRequest) {
      return "none";
    }

    return highestPriorityRequest.typeId;
  }

  function isApartmentRented(apartment) {
    return (
      apartment.leaseStatus !== "vacant" ||
      !!apartment.tenantUserId ||
      !!apartment.tenantNationalId ||
      !!apartment.tenantInfo?.fullName
    );
  }

  const currentUser = getCurrentUser();
  const allBuildings = getLocalArray("walajna_buildings");
  const apartments = getLocalArray("walajna_apartments");
  const requests = getLocalArray("walajna_requests");
  const payments = getLocalArray("walajna_payments");

  if (!currentUser) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = "لم يتم العثور على المستخدم الحالي";
    }
    return;
  }

  const buildings = allBuildings.filter(
    (building) => building.ownerId === currentUser.id
  );

  if (!buildings.length) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = "لا توجد عمائر مرتبطة بهذا المالك";
    }
    return;
  }

  container.innerHTML = buildings
    .map((building) => {
      const buildingApartments = apartments.filter(
        (apartment) => apartment.buildingId === building.id
      );

      const squaresHtml = buildingApartments.map((apartment) => {
        const typeClass = getApartmentStatusClass(apartment, requests, payments);

        const rentedClass =
          isApartmentRented(apartment) && typeClass === "none"
            ? "rented"
            : "";

        return `
          <div 
            class="apartment-square ${typeClass} ${rentedClass}"
            title="شقة ${apartment.number}">
          </div>
        `;
      }).join("");

      return `
        <article class="building-card" data-building-id="${building.id}">
          <div class="building-card__head">
            <h3 class="building-title">${building.name}</h3>
            <span class="building-count">${buildingApartments.length} شقة</span>
          </div>

          <div class="apartments-grid">
            ${squaresHtml}
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".building-card").forEach((card) => {
    card.addEventListener("click", () => {
      const buildingId = card.dataset.buildingId;
      window.location.href = `owner_building.html?buildingId=${encodeURIComponent(buildingId)}`;
    });
  });
});