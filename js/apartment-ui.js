window.WalajnaApartment = window.WalajnaApartment || {};

WalajnaApartment.fillApartmentInfo = function (apartment) {

  const title = document.getElementById("aptTitle");
  const number = document.getElementById("aptNumber");
  const building = document.getElementById("buildingName");
  const status = document.getElementById("leaseStatus");
  const rent = document.getElementById("rentAmount");

  if (title) title.textContent = `تفاصيل ${apartment.number}`;
  if (number) number.textContent = apartment.number || "—";
  if (building) building.textContent = apartment.buildingId || "—";
  if (status) status.textContent = apartment.status || "—";
  if (rent) rent.textContent = apartment.rent || "—";

};