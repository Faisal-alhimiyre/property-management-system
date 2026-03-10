window.WalajnaApartment = window.WalajnaApartment || {};

WalajnaApartment.getLocalArray = function (key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};

WalajnaApartment.saveLocalArray = function (key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
};

WalajnaApartment.getUsers = function () {
  return WalajnaApartment.getLocalArray("walajna_users");
};

WalajnaApartment.saveUsers = function (users) {
  WalajnaApartment.saveLocalArray("walajna_users", users);
};

WalajnaApartment.getRequests = function () {
  return WalajnaApartment.getLocalArray("walajna_requests");
};

WalajnaApartment.saveRequests = function (arr) {
  WalajnaApartment.saveLocalArray("walajna_requests", arr);
};

WalajnaApartment.getDocuments = function () {
  return WalajnaApartment.getLocalArray("walajna_documents");
};

WalajnaApartment.saveDocuments = function (arr) {
  WalajnaApartment.saveLocalArray("walajna_documents", arr);
};