document.addEventListener("DOMContentLoaded", () => {

const title = document.getElementById("buildingTitle");
const grid = document.getElementById("apartmentsGrid");

if(!grid) return;

/* get building id from URL */

const params = new URLSearchParams(window.location.search);
const buildingId = params.get("buildingId");

/* get data */

const buildings = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
const requests = JSON.parse(localStorage.getItem("walajna_requests") || "[]");

/* building name */

const building = buildings.find(b => b.id === buildingId);

if(building && title){

title.textContent = building.name;

}

/* apartments inside building */

const buildingApartments = apartments.filter(a => a.buildingId === buildingId);

/* render */

grid.innerHTML = buildingApartments.map(apartment => {

const latestRequest = getLatestRequest(apartment.id);
const typeClass = latestRequest ? latestRequest.typeId : "none";

return `

<div class="apartment-card ${typeClass}" data-id="${apartment.id}">

<div class="apartment-number">
شقة ${apartment.number}
</div>

<div class="apartment-tenant">
${apartment.tenantName || "بدون مستأجر"}
</div>

</div>

`;

}).join("");

/* click navigation */

document.querySelectorAll(".apartment-card").forEach(card=>{

card.addEventListener("click",()=>{

const aptId = card.dataset.id;

window.location.href =
`../main/apartment_info.html?id=${encodeURIComponent(aptId)}`;

});

});

function getLatestRequest(apartmentId){

const list = requests
.filter(r => r.apartmentId === apartmentId)
.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

return list[0] || null;

}

});