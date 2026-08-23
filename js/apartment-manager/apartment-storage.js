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
  const uid = String(updatedItem.id ?? "");
  return items.map((item) => (String(item.id) === uid ? updatedItem : item));
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
  if (typeof WalajnaBuildingsApi !== "undefined" && WalajnaBuildingsApi.getSessionList) {
    const session = WalajnaBuildingsApi.getSessionList();
    if (Array.isArray(session) && session.length) return session;
  }
  try {
    const raw = sessionStorage.getItem("walajna_buildings_session");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  if (isWalajnaAuthed()) return [];
  return getArray(StorageKeys.BUILDINGS);
}

function saveBuildings(buildings) {
  const arr = Array.isArray(buildings) ? buildings : [];
  if (typeof WalajnaBuildingsApi !== "undefined" && WalajnaBuildingsApi.persistSessionList) {
    WalajnaBuildingsApi.persistSessionList(arr);
    return;
  }
  if (!isWalajnaAuthed()) {
    saveArray(StorageKeys.BUILDINGS, arr);
  }
}

/* =========================
   Apartments — session mirror from /api/apartments when logged in; localStorage fallback for demo/offline.
========================= */

function isWalajnaAuthed() {
  try {
    return (
      typeof WalajnaAuth !== "undefined" &&
      typeof WalajnaAuth.getCurrentUser === "function" &&
      !!WalajnaAuth.getCurrentUser()
    );
  } catch {
    return false;
  }
}

function getApartments() {
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.getSessionList) {
    const s = WalajnaApartmentsApi.getSessionList();
    if (Array.isArray(s) && s.length) return s;
  }
  try {
    const raw = sessionStorage.getItem(
      typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.SESSION_KEY
        ? WalajnaApartmentsApi.SESSION_KEY
        : "walajna_apartments_session"
    );
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  if (isWalajnaAuthed()) return [];
  return getArray(StorageKeys.APARTMENTS);
}

function saveApartments(apartments) {
  const arr = Array.isArray(apartments) ? apartments : [];
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.persistSessionList) {
    WalajnaApartmentsApi.persistSessionList(arr);
  } else {
    try {
      sessionStorage.setItem("walajna_apartments_session", JSON.stringify(arr));
    } catch {
      /* ignore */
    }
  }
  if (!isWalajnaAuthed()) {
    saveArray(StorageKeys.APARTMENTS, arr);
  }
}

function findApartmentById(aptId) {
  return getApartments().find((apt) => String(apt.id) === String(aptId)) || null;
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
  return apartmentHasTenantData(apartment);
}

/* =========================
   Requests — persisted in DB (maintenance_requests); local helpers are no-ops.
========================= */

function getRequests() {
  return [];
}

function saveRequests() {
  /* no-op */
}

function getRequestsByApartmentId() {
  return [];
}

function getRequestsByContractId() {
  return [];
}

function getRequestsForApartmentContext() {
  return [];
}

function deleteApartmentRequests() {
  /* no-op */
}

/* =========================
   Documents
========================= */

function isDocumentsServerMode() {
  try {
    return (
      typeof isWalajnaAuthed === "function" &&
      isWalajnaAuthed() &&
      typeof WalajnaDocumentsApi !== "undefined" &&
      typeof WalajnaDocumentsApi.getSessionList === "function"
    );
  } catch {
    return false;
  }
}

function getDocuments() {
  if (isDocumentsServerMode()) {
    return WalajnaDocumentsApi.getSessionList();
  }
  return getArray(StorageKeys.DOCUMENTS);
}

function saveDocuments(documents) {
  const arr = Array.isArray(documents) ? documents : [];
  if (isDocumentsServerMode()) {
    WalajnaDocumentsApi.setSessionList(arr);
    return;
  }
  saveArray(StorageKeys.DOCUMENTS, arr);
}

function getDocumentsByApartmentId(aptId) {
  return getDocuments().filter((document) => document.apartmentId === aptId);
}

function getDocumentsByContractId(contractId) {
  if (!contractId) return [];
  return getDocuments().filter((document) => document.contractId === contractId);
}

function getDocumentsForApartmentContext(aptId) {
  const documents = getDocuments();
  return documents.filter((document) => String(document.apartmentId) === String(aptId));
}

function deleteApartmentDocuments(aptId) {
  if (isDocumentsServerMode() && typeof WalajnaDocumentsApi.deleteByApartment === "function") {
    void WalajnaDocumentsApi.deleteByApartment(aptId).catch((e) =>
      console.warn("[apartment-storage] deleteByApartment failed", e)
    );
    const next = getDocuments().filter((d) => String(d.apartmentId) !== String(aptId));
    saveDocuments(next);
    return;
  }
  const documents = getDocuments();
  const filteredDocuments = removeBy(
    documents,
    (document) => String(document.apartmentId) === String(aptId)
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