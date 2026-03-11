/* ========================================
   Apartment Utilities
   ======================================== */

function getStatusLabel(leaseStatus) {
  switch (leaseStatus) {
    case "vacant":
      return "فارغة";

    case "active":
      return "نشط";

    case "ending_soon":
      return "قريب الانتهاء";

    case "ended":
      return "منتهي";

    default:
      return "—";
  }
}


function getStatusClass(leaseStatus) {
  switch (leaseStatus) {
    case "active":
      return "ok";

    case "ending_soon":
      return "warn";

    case "ended":
      return "danger";

    default:
      return "";
  }
}


function daysBetween(todayStr, endStr) {

  const today = new Date(todayStr);
  const end = new Date(endStr);

  const ms = end - today;

  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}


/* ========================================
   Lease Status Normalization
   ======================================== */

function normalizeApartmentLeaseStatus(apartment) {

  if (!apartment) return apartment;

  const updated = { ...apartment };


  /* No tenant or no contract */
  if (!updated.tenantNationalId || !updated.contract?.endDate) {

    updated.leaseStatus = "vacant";
    updated.status = "فارغة";

    return updated;
  }


  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const endDate = updated.contract.endDate;

  const remainingDays = daysBetween(todayStr, endDate);


  if (remainingDays < 0) {

    updated.leaseStatus = "ended";

  }
  else if (remainingDays <= 30) {

    updated.leaseStatus = "ending_soon";

  }
  else {

    updated.leaseStatus = "active";

  }


  updated.status = getStatusLabel(updated.leaseStatus);

  return updated;
}