/* ========================================
   Apartment UI Helpers
   ======================================== */

function hideElement(el) {
  if (!el) return;
  el.style.display = "none";
}

function showElement(el, display = "inline-block") {
  if (!el) return;
  el.style.display = display;
}


/* ========================================
   Status Badge UI
   ======================================== */

function applyLeaseStatusStyle(statusElement, leaseStatus) {

  if (!statusElement) return;

  statusElement.classList.remove("ok", "warn", "danger");

  const cls = getStatusClass(leaseStatus);

  if (cls) {
    statusElement.classList.add(cls);
  }
}


/* ========================================
   Fill Apartment Info UI
   ======================================== */

function fillApartmentInfoUI(data, buildingData) {

  const title = document.getElementById("aptTitle");
  const roleLabel = document.getElementById("pageRoleLabel");

  const number = document.getElementById("aptNumber");
  const building = document.getElementById("buildingName");
  const status = document.getElementById("leaseStatus");
  const rent = document.getElementById("rentAmount");

  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const meterNumber = document.getElementById("meterNumber");
  const notes = document.getElementById("notes");

  const tenantNationality = document.getElementById("tenantNationality");
  const tenantType = document.getElementById("tenantType");
  const insurancePaid = document.getElementById("insurancePaid");
  const phoneNumber = document.getElementById("phoneNumber");
  const identityNumber = document.getElementById("identityNumber");


  const tenantInfo = data.tenantInfo || {};
  const contract = data.contract || {};


  if (title) {
    title.textContent = `تفاصيل الشقة ${data.number || ""}`.trim();
  }

  if (roleLabel) {

    const activeRole = getActiveRole();

    roleLabel.textContent =
      activeRole === "owner"
        ? "عرض المالك"
        : "عرض المستأجر";
  }


  if (number) number.textContent = data.number ?? "—";

  if (building)
    building.textContent =
      data.buildingName ||
      buildingData?.name ||
      "—";


  if (status)
    status.textContent =
      data.status ||
      getStatusLabel(data.leaseStatus);


  if (rent)
    rent.textContent =
      data.rent
        ? `${data.rent} ريال`
        : "—";


  if (startDate)
    startDate.textContent =
      contract.startDate ?? "—";

  if (endDate)
    endDate.textContent =
      contract.endDate ?? "—";

  if (meterNumber)
    meterNumber.textContent =
      contract.meterNumber ?? "—";

  if (notes)
    notes.textContent =
      contract.notes ?? "—";


  if (tenantNationality)
    tenantNationality.textContent =
      tenantInfo.nationality ?? "—";

  if (tenantType)
    tenantType.textContent =
      tenantInfo.tenantType ?? "—";

  if (insurancePaid)
    insurancePaid.textContent =
      contract.insurancePaid
        ? `${contract.insurancePaid} ريال`
        : "—";

  if (phoneNumber)
    phoneNumber.textContent =
      tenantInfo.phoneNumber ?? "—";

  if (identityNumber)
    identityNumber.textContent =
      data.tenantNationalId ?? "—";


  applyLeaseStatusStyle(status, data.leaseStatus);
}