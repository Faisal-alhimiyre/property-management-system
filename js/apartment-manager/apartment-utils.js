/* ========================================
   Apartment Utilities
   ======================================== */

function getStatusLabel(leaseStatus) {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;
  switch (leaseStatus) {
    case "vacant":
      return T("lease.status.vacant");
    case "occupied":
      return T("aptLease.rented");
    case "overdue":
      return T("aptLease.overdue_state");
    case "active":
      return T("lease.status.active");
    case "ending_soon":
      return T("lease.status.ending");
    case "ended":
      return T("lease.status.ended");
    default:
      return T("common.dash");
  }
}


function getStatusClass(leaseStatus) {
  switch (leaseStatus) {
    case "occupied":
    case "active":
      return "ok";

    case "overdue":
    case "ended":
      return "danger";

    case "ending_soon":
      return "warn";

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
    updated.status = getStatusLabel("vacant");

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