document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const buildingId = params.get("buildingId");

  const title = document.getElementById("buildingTitle");
  const grid = document.getElementById("apartmentsGrid");
  const empty = document.getElementById("emptyApts");

  if (!buildingId) {
    title.textContent = "لم يتم تحديد العمارة";
    return;
  }

  const buildings = getLS("walajna_buildings");
  const building = buildings.find(b => b.id === buildingId);
  title.textContent = building ? `شقق: ${building.name}` : `شقق العمارة: ${buildingId}`;

  const apartments = getLS("walajna_apartments").filter(a => a.buildingId === buildingId);

  if (!apartments.length) {
    empty.style.display = "block";
    return;
  }

  grid.innerHTML = apartments.map(a => `
    <div class="card clickable-card"
         data-target="owner-apartment.html"
         data-building-id="${buildingId}"
         data-apartment-id="${a.id}">
      <div class="card-title">شقة ${a.number}</div>
      <div class="card-sub">الإيجار: ${a.rent} ريال</div>
      <div class="card-meta">الحالة: ${a.status}</div>
    </div>
  `).join("");

  document.querySelectorAll(".clickable-card").forEach(card => {
    card.addEventListener("click", () => {
      const target = card.dataset.target;
      const bId = card.dataset.buildingId;
      const aId = card.dataset.apartmentId;
      const qs = new URLSearchParams();
      qs.set("buildingId", bId);
      qs.set("apartmentId", aId);
      window.location.href = `${target}?${qs.toString()}`;
    });
  });

  function getLS(key){
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }
});