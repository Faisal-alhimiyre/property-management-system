window.WalajnaApartment = window.WalajnaApartment || {};

WalajnaApartment.getApartmentIdFromUrl = function () {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
};

WalajnaApartment.normalizeApartmentLeaseStatus = function (apartment) {
  if (!apartment.contract) return apartment;

  const today = new Date();
  const end = new Date(apartment.contract.endDate);

  const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

  if (diff < 0) apartment.status = "منتهي";
  else if (diff < 30) apartment.status = "قريب الانتهاء";
  else apartment.status = "نشط";

  return apartment;
};