window.WalajnaApartment = window.WalajnaApartment || {};

WalajnaApartment.getLatestRequestForApartment = function (apartmentId) {

  const requests = WalajnaApartment.getRequests();

  const sorted = requests
    .filter(r => r.apartmentId === apartmentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return sorted[0] || null;
};