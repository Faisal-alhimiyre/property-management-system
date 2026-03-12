document.addEventListener("DOMContentLoaded", function () {
  const activeRole = localStorage.getItem("activeRole") || "owner";
  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("id");

  if (!apartmentId) {
    console.error("لم يتم العثور على id في الرابط");
    return;
  }

  const apartments = typeof getApartments === "function" ? getApartments() : [];
  const apartment = apartments.find((item) => String(item.id) === String(apartmentId));

  if (!apartment) {
    console.error("لم يتم العثور على بيانات الشقة");
    return;
  }

  if (typeof initApartmentPaymentsSystem === "function") {
    initApartmentPaymentsSystem({
      apartment,
      activeRole
    });
  } else {
    console.error("initApartmentPaymentsSystem غير موجود");
  }
});