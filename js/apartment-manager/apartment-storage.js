const StorageKeys = {
  USERS: "walajna_users",
  BUILDINGS: "walajna_buildings",
  APARTMENTS: "walajna_apartments",
  REQUESTS: "walajna_requests",
  DOCUMENTS: "walajna_documents",
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

/* =========================
   Requests
========================= */

function getRequests() {
  return getArray(StorageKeys.REQUESTS);
}

function saveRequests(requests) {
  saveArray(StorageKeys.REQUESTS, requests);
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

function deleteApartmentDocuments(aptId) {
  const documents = getDocuments();
  const filteredDocuments = removeBy(
    documents,
    (document) => document.apartmentId === aptId
  );
  saveDocuments(filteredDocuments);
}

/* =========================
   Current User / Active Role
========================= */

function getCurrentUser() {
  return readJson(StorageKeys.CURRENT_USER, null);
}

function saveCurrentUser(user) {
  writeJson(StorageKeys.CURRENT_USER, user);
}

function getActiveRole() {
  return (
    localStorage.getItem(StorageKeys.ACTIVE_ROLE) ||
    localStorage.getItem("activerole") ||
    localStorage.getItem("role") ||
    "tenant"
  );
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