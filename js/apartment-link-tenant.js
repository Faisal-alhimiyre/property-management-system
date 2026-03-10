window.WalajnaApartment = window.WalajnaApartment || {};

WalajnaApartment.linkTenantToApartment = function (aptId, data) {

  const apartments = WalajnaApartment.getLocalArray("walajna_apartments");

  const updated = apartments.map(apartment => {

    if (apartment.id !== aptId) return apartment;

    apartment.tenantNationalId = data.nationalId;
    apartment.tenantInfo = data.tenantInfo;
    apartment.contract = data.contract;

    return WalajnaApartment.normalizeApartmentLeaseStatus(apartment);

  });

  WalajnaApartment.saveLocalArray("walajna_apartments", updated);
};