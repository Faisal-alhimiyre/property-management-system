function getLocalArray(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function saveLocalArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUsers() {
  return getLocalArray("walajna_users");
}

function saveUsers(users) {
  saveLocalArray("walajna_users", users);
}

function getBuildings() {
  return getLocalArray("walajna_buildings");
}

function saveBuildings(buildings) {
  saveLocalArray("walajna_buildings", buildings);
}

function getApartments() {
  return getLocalArray("walajna_apartments");
}

function saveApartments(apartments) {
  saveLocalArray("walajna_apartments", apartments);
}

function getRequests() {
  return getLocalArray("walajna_requests");
}

function saveRequests(requests) {
  saveLocalArray("walajna_requests", requests);
}

function getDocuments() {
  return getLocalArray("walajna_documents");
}

function saveDocuments(documents) {
  saveLocalArray("walajna_documents", documents);
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("walajna_current_user") || "null");
  } catch {
    return null;
  }
}

function saveCurrentUser(user) {
  localStorage.setItem("walajna_current_user", JSON.stringify(user));
}

function getActiveRole() {
  return (
    localStorage.getItem("activeRole") ||
    localStorage.getItem("activerole") ||
    localStorage.getItem("role") ||
    "tenant"
  );
}

function saveActiveRole(role) {
  localStorage.setItem("activeRole", role);
}

function findApartmentById(aptId) {
  return getApartments().find((apt) => apt.id === aptId) || null;
}

function saveUpdatedApartment(updatedApartment) {
  const apartments = getApartments();
  const updatedApartments = apartments.map((apt) =>
    apt.id === updatedApartment.id ? updatedApartment : apt
  );
  saveApartments(updatedApartments);
}

function saveUpdatedUser(updatedUser) {
  const users = getUsers();
  const updatedUsers = users.map((user) =>
    user.id === updatedUser.id ? updatedUser : user
  );
  saveUsers(updatedUsers);
}

function updateCurrentUserRoleIfNeeded(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.id !== userId) return;

  const users = getUsers();
  const freshUser = users.find((u) => u.id === userId);
  if (freshUser) {
    saveCurrentUser(freshUser);
  }
}

function deleteApartmentDocuments(aptId) {
  const documents = getDocuments();
  const filteredDocuments = documents.filter((doc) => doc.apartmentId !== aptId);
  saveDocuments(filteredDocuments);
}

function deleteApartmentRequests(aptId) {
  const requests = getRequests();
  const filteredRequests = requests.filter((req) => req.apartmentId !== aptId);
  saveRequests(filteredRequests);
}