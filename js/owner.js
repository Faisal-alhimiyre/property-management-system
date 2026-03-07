document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("buildingsContainer");
  const emptyState = document.getElementById("emptyState");

  if (!container) return;

  const buildings = getLocalArray("walajna_buildings");
  const apartments = getLocalArray("walajna_apartments");
  const requests = getLocalArray("walajna_requests");

  if (!buildings.length) {
    emptyState.style.display = "block";
    return;
  }

  container.innerHTML = buildings.map(building => {
    const buildingApartments = apartments.filter(
      apartment => apartment.buildingId === building.id
    );

    const squaresHtml = buildingApartments.map(apartment => {
      const latestRequest = getLatestRequestForApartment(apartment.id, requests);
      const typeClass = latestRequest ? latestRequest.typeId : "none";

      return `
        <div 
          class="apartment-square ${typeClass}"
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
  }).join("");

  document.querySelectorAll(".building-card").forEach(card => {
    card.addEventListener("click", () => {
      const buildingId = card.dataset.buildingId;
      window.location.href = `owner_apartment.html?buildingId=${encodeURIComponent(buildingId)}`;
    });
  });

  function getLatestRequestForApartment(apartmentId, allRequests) {
    const apartmentRequests = allRequests
      .filter(request => request.apartmentId === apartmentId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return apartmentRequests[0] || null;
  }

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }
});