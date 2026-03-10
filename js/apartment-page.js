document.addEventListener("DOMContentLoaded", () => {

  const aptId = WalajnaApartment.getApartmentIdFromUrl();
  if (!aptId) return;

  const apartments = WalajnaApartment.getLocalArray("walajna_apartments");

  const apartment = apartments.find(a => a.id === aptId);

  if (!apartment) return;

  WalajnaApartment.fillApartmentInfo(apartment);

});