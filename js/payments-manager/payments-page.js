document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);

  const apartmentId =
    params.get("id") ||
    params.get("apartmentId");

  const historyId = params.get("historyId");
  const mode = params.get("mode");
  const historyContractId = params.get("contractId");

  if (!apartmentId) {
    console.warn("لم يتم تمرير apartmentId إلى صفحة المدفوعات");
    return;
  }

  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const apartment = apartments.find((apt) => String(apt.id) === String(apartmentId));

  if (!apartment) {
    console.warn("تعذر العثور على الشقة المطلوبة");
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