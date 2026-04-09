document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);

  const apartmentId =
    params.get("id") ||
    params.get("apartmentId");

  const historyId = params.get("historyId");
  const mode = params.get("mode");
  const historyContractId = params.get("contractId");

  if (!apartmentId) {
    const msg =
      window.walajna_language && window.walajna_language.t
        ? window.walajna_language.t("console.aptIdMissing")
        : "apartmentId missing";
    console.warn(msg);
    return;
  }

  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const apartment = apartments.find((apt) => String(apt.id) === String(apartmentId));

  if (!apartment) {
    const msg =
      window.walajna_language && window.walajna_language.t
        ? window.walajna_language.t("console.aptNotFoundPage")
        : "Apartment not found";
    console.warn(msg);
    return;
  }

  const activeRole = localStorage.getItem("activeRole") || "owner";

  if (typeof window.initApartmentPaymentsSystem === "function") {
    window.initApartmentPaymentsSystem({
      apartment,
      activeRole,
      mode,
      historyId,
      historyContractId,
    });
  }
});