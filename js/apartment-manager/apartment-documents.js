/* ========================================
   Apartment Documents System
   ======================================== */

function openDocumentsModal(documentsModal, documentsList, aptId) {
  if (!documentsModal) return;

  renderDocumentsList(documentsList, aptId);

  documentsModal.classList.add("is-open");
  documentsModal.setAttribute("aria-hidden", "false");
}


function closeDocumentsModalFn(documentsModal) {
  if (!documentsModal) return;

  documentsModal.classList.remove("is-open");
  documentsModal.setAttribute("aria-hidden", "true");
}


/* ========================================
   Render Documents List
   ======================================== */

function renderDocumentsList(documentsList, aptId) {

  if (!documentsList) return;

  const documents = getDocuments();

  const apartmentDocs = documents.filter(
    (doc) => doc.apartmentId === aptId
  );


  if (apartmentDocs.length === 0) {

    documentsList.innerHTML = `
      <div class="wl-item">
        <div>
          <div class="wl-item__title">لا توجد وثائق</div>
          <div class="wl-item__desc">لا توجد ملفات مرتبطة بهذه الشقة حتى الآن</div>
        </div>
      </div>
    `;

    return;
  }


  documentsList.innerHTML = apartmentDocs.map(doc => `
    <div class="wl-item" tabindex="0" data-doc-id="${doc.id}">
      <div class="wl-item__left">

        <span class="wl-dot" style="background:#0ea5a4"></span>

        <div>
          <div class="wl-item__title">
            ${doc.fileName || "ملف"}
          </div>

          <div class="wl-item__desc">
            تم الرفع: ${new Date(doc.uploadedAt).toLocaleString("ar-SA")}
          </div>
        </div>

      </div>

      <span class="wl-badge">فتح</span>

    </div>
  `).join("");
}


/* ========================================
   Save Document
   ======================================== */

function saveDocumentForApartment(file, aptId) {

  const reader = new FileReader();

  reader.onload = function (e) {

    const documents = getDocuments();

    documents.push({
      id: "DOC" + Date.now(),
      apartmentId: aptId,
      fileName: file.name,
      fileData: e.target.result,
      uploadedAt: new Date().toISOString()
    });

    saveDocuments(documents);
  };

  reader.readAsDataURL(file);
}


/* ========================================
   Open Document
   ======================================== */

function openDocumentById(docId) {

  const documents = getDocuments();

  const doc = documents.find(d => d.id === docId);

  if (!doc) return;


  const win = window.open();

  if (!win) return;


  win.document.write(`
    <html>
      <head>
        <title>${doc.fileName || "وثيقة"}</title>
      </head>

      <body style="margin:0">

        <iframe 
          src="${doc.fileData}"
          width="100%"
          height="100%"
          style="border:none;min-height:100vh;">
        </iframe>

      </body>
    </html>
  `);
}


/* ========================================
   Initialize Documents Listeners
   ======================================== */

function initDocumentsSystem(aptId) {

  const documentsBtn = document.getElementById("documentsBtn");
  const documentsModal = document.getElementById("documentsModal");
  const documentsList = document.getElementById("documentsList");
  const closeDocumentsModal = document.getElementById("closeDocumentsModal");
  const cancelDocumentsModal = document.getElementById("cancelDocumentsModal");


  if (documentsBtn) {
    documentsBtn.addEventListener("click", () => {
      openDocumentsModal(documentsModal, documentsList, aptId);
    });
  }


  if (closeDocumentsModal) {
    closeDocumentsModal.addEventListener("click", () => {
      closeDocumentsModalFn(documentsModal);
    });
  }


  if (cancelDocumentsModal) {
    cancelDocumentsModal.addEventListener("click", () => {
      closeDocumentsModalFn(documentsModal);
    });
  }


  if (documentsModal) {
    documentsModal.addEventListener("click", (e) => {

      if (e.target.dataset.docsClose === "true") {
        closeDocumentsModalFn(documentsModal);
      }

    });
  }


  if (documentsList) {

    documentsList.addEventListener("click", (e) => {

      const item = e.target.closest(".wl-item");

      if (!item) return;

      const docId = item.dataset.docId;

      if (!docId) return;

      openDocumentById(docId);
    });


    documentsList.addEventListener("keydown", (e) => {

      if (e.key !== "Enter") return;

      const item = e.target.closest(".wl-item");

      if (!item) return;

      const docId = item.dataset.docId;

      if (!docId) return;

      openDocumentById(docId);

    });

  }

}