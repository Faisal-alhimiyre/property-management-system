const StorageKeys = {
  USERS: "walajna_users",
  BUILDINGS: "walajna_buildings",
  APARTMENTS: "walajna_apartments",
  REQUESTS: "walajna_requests",
  DOCUMENTS: "walajna_documents",
  PAYMENTS: "walajna_payments",
  CURRENT_USER: "walajna_current_user",
  ACTIVE_ROLE: "activeRole",
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getArray(key) {
  return readJson(key, []);
}

function saveArray(key, value) {
  writeJson(key, value);
}

function replaceById(items, updatedItem) {
  return items.map((item) =>
    item.id === updatedItem.id ? updatedItem : item
  );
}

function removeBy(items, predicate) {
  return items.filter((item) => !predicate(item));
}

/* =========================
   Users
========================= */

function getUsers() {
  return getArray(StorageKeys.USERS);
}

function saveUsers(users) {
  saveArray(StorageKeys.USERS, users);
}

function findUserById(userId) {
  return getUsers().find((user) => user.id === userId) || null;
}

function findUserByNationalId(nationalId) {
  return getUsers().find((user) => user.nationalId === nationalId) || null;
}

function saveUpdatedUser(updatedUser) {
  const users = getUsers();
  const updatedUsers = replaceById(users, updatedUser);
  saveUsers(updatedUsers);
}

/* =========================
   Buildings
========================= */

function getBuildings() {
  return getArray(StorageKeys.BUILDINGS);
}

function saveBuildings(buildings) {
  saveArray(StorageKeys.BUILDINGS, buildings);
}

/* =========================
   Apartments
========================= */

function getApartments() {
  return getArray(StorageKeys.APARTMENTS);
}

function saveApartments(apartments) {
  saveArray(StorageKeys.APARTMENTS, apartments);
}

function findApartmentById(aptId) {
  return getApartments().find((apt) => apt.id === aptId) || null;
}

function saveUpdatedApartment(updatedApartment) {
  const apartments = getApartments();
  const updatedApartments = replaceById(apartments, updatedApartment);
  saveApartments(updatedApartments);
}

function getApartmentCurrentContractId(apartmentOrId) {
  const apartment =
    typeof apartmentOrId === "string"
      ? findApartmentById(apartmentOrId)
      : apartmentOrId;

  if (!apartment) return null;

  return (
    apartment.currentContractId ||
    apartment.contract?.id ||
    apartment.contractId ||
    null
  );
}

function apartmentHasTenantData(apartment) {
  if (!apartment) return false;

  return !!(
    apartment.tenantUserId ||
    apartment.tenantNationalId ||
    apartment.tenantInfo?.fullName ||
    apartment.tenantInfo?.phoneNumber ||
    apartment.tenantInfo?.nationality ||
    apartment.tenantInfo?.tenantType
  );
}

function apartmentHasContractData(apartment) {
  if (!apartment) return false;

  return !!(
    apartment.contract?.id ||
    apartment.contract?.startDate ||
    apartment.contract?.endDate ||
    apartment.contract?.rentAmount ||
    apartment.contract?.paymentCycle ||
    apartment.contract?.meterNumber ||
    apartment.contract?.notes
  );
}

function isApartmentOccupied(apartment) {
  return apartmentHasTenantData(apartment) || apartmentHasContractData(apartment);
}

/* =========================
   Requests
========================= */

function getRequests() {
  return getArray(StorageKeys.REQUESTS);
}

function saveRequests(requests) {
  saveArray(StorageKeys.REQUESTS, requests);
}

function getRequestsByApartmentId(aptId) {
  return getRequests().filter((request) => request.apartmentId === aptId);
}

function getRequestsByContractId(contractId) {
  if (!contractId) return [];
  return getRequests().filter((request) => request.contractId === contractId);
}

function getRequestsForApartmentContext(aptId) {
  const contractId = getApartmentCurrentContractId(aptId);
  const requests = getRequests();

  if (contractId) {
    return requests.filter((request) => {
      if (request.contractId) {
        return request.contractId === contractId;
      }

      return request.apartmentId === aptId;
    });
  }

  return requests.filter((request) => request.apartmentId === aptId);
}

function deleteApartmentRequests(aptId) {
  const requests = getRequests();
  const filteredRequests = removeBy(
    requests,
    (request) => request.apartmentId === aptId
  );
  saveRequests(filteredRequests);
}

/* =========================
   Documents
========================= */

function getDocuments() {
  return getArray(StorageKeys.DOCUMENTS);
}

function saveDocuments(documents) {
  saveArray(StorageKeys.DOCUMENTS, documents);
}

function getDocumentsByApartmentId(aptId) {
  return getDocuments().filter((document) => document.apartmentId === aptId);
}

function getDocumentsByContractId(contractId) {
  if (!contractId) return [];
  return getDocuments().filter((document) => document.contractId === contractId);
}

function getDocumentsForApartmentContext(aptId) {
  const contractId = getApartmentCurrentContractId(aptId);
  const documents = getDocuments();

  if (contractId) {
    return documents.filter((document) => {
      if (document.contractId) {
        return document.contractId === contractId;
      }

      return document.apartmentId === aptId;
    });
  }

  return documents.filter((document) => document.apartmentId === aptId);
}

function deleteApartmentDocuments(aptId) {
  const documents = getDocuments();
  const filteredDocuments = removeBy(
    documents,
    (document) => document.apartmentId === aptId
  );
  saveDocuments(filteredDocuments);
}

/* =========================
   Payments
========================= */

function getPayments() {
  return getArray(StorageKeys.PAYMENTS);
}

function savePayments(payments) {
  saveArray(StorageKeys.PAYMENTS, payments);
}

function getPaymentsByApartmentId(aptId) {
  return getPayments().filter((payment) => payment.apartmentId === aptId);
}

function getPaymentsByContractId(contractId) {
  if (!contractId) return [];
  return getPayments().filter((payment) => payment.contractId === contractId);
}

function getPaymentsForApartmentContext(aptId) {
  const contractId = getApartmentCurrentContractId(aptId);
  const payments = getPayments();

  if (contractId) {
    return payments.filter((payment) => {
      if (payment.contractId) {
        return payment.contractId === contractId;
      }

      return payment.apartmentId === aptId;
    });
  }

  return payments.filter((payment) => payment.apartmentId === aptId);
}

/* =========================
   Current User / Active Role
========================= */

function getCurrentUser() {
  if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.getCurrentUser === "function") {
    const u = WalajnaAuth.getCurrentUser();
    if (u) return u;
  }
  try {
    const raw = sessionStorage.getItem(StorageKeys.CURRENT_USER);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return readJson(StorageKeys.CURRENT_USER, null);
}

function saveCurrentUser(user) {
  writeJson(StorageKeys.CURRENT_USER, user);
}

function getActiveRole() {
  if (typeof WalajnaAuth !== "undefined" && typeof WalajnaAuth.getActiveRole === "function") {
    const r = WalajnaAuth.getActiveRole();
    if (r) return r;
  }
  try {
    const sr = sessionStorage.getItem(StorageKeys.ACTIVE_ROLE);
    if (sr) return sr;
  } catch {
    /* ignore */
  }
  const fromStorage =
    localStorage.getItem(StorageKeys.ACTIVE_ROLE) ||
    localStorage.getItem("activerole") ||
    localStorage.getItem("role");
  if (fromStorage) return fromStorage;
  const u = getCurrentUser();
  if (u && (u.role || (u.roles && u.roles[0]))) {
    return u.role || u.roles[0];
  }
  return "tenant";
}

function saveActiveRole(role) {
  localStorage.setItem(StorageKeys.ACTIVE_ROLE, role);
}

function updateCurrentUserRoleIfNeeded(userId) {
  const currentUser = getCurrentUser();

  if (!currentUser || currentUser.id !== userId) {
    return;
  }

  const freshUser = findUserById(userId);

  if (freshUser) {
    saveCurrentUser(freshUser);
  }
}