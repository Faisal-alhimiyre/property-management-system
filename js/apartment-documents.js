window.WalajnaApartment = window.WalajnaApartment || {};

WalajnaApartment.saveDocumentForApartment = function (aptId, file) {

  const reader = new FileReader();

  reader.onload = function (e) {

    const documents = WalajnaApartment.getDocuments();

    documents.push({
      id: "DOC" + Date.now(),
      apartmentId: aptId,
      name: "عقد الإيجار",
      fileName: file.name,
      fileData: e.target.result,
      uploadedAt: new Date().toISOString()
    });

    WalajnaApartment.saveDocuments(documents);
  };

  reader.readAsDataURL(file);
};