/* ========================================
   Apartment Documents System
   ======================================== */

function docT(key, params) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key, params)
    : key;
}

function docLocaleForDates() {
  return window.walajna_language && typeof window.walajna_language.localeForDates === "function"
    ? window.walajna_language.localeForDates()
    : window.walajna_language && window.walajna_language.get() === "en"
      ? "en-GB"
      : "ar-SA";
}

function formatDocDateTime(iso) {
  if (!iso) return docT("common.dash");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(docLocaleForDates());
}

function escapeHtmlDoc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
   Helpers
   ======================================== */

function buildHtmlDataUrl(html) {
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function getApartmentByIdForDocuments(aptId) {
  try {
    const apartments =
      typeof getApartments === "function"
        ? getApartments()
        : JSON.parse(localStorage.getItem("walajna_apartments") || "[]");

    return apartments.find((apt) => apt.id === aptId) || null;
  } catch {
    return null;
  }
}

function getCurrentContractIdForApartment(aptId) {
  const apartment = getApartmentByIdForDocuments(aptId);

  return (
    apartment?.currentContractId ||
    apartment?.contract?.id ||
    apartment?.contractId ||
    null
  );
}

function getDocumentsForApartmentContext(aptId) {
  const documents = getDocuments();
  const currentContractId = getCurrentContractIdForApartment(aptId);

  // 🔥 مهم: لا fallback على apartmentId إذا يوجد عقد حالي
  if (currentContractId) {
    return documents.filter((doc) => doc.contractId === currentContractId);
  }

  // إذا ما فيه عقد حالي، لا نعرض وثائق قديمة
  return [];
}

/* ========================================
   Render Documents List
   ======================================== */

function renderDocumentsList(documentsList, aptId) {
  if (!documentsList) return;

  const apartmentDocs = getDocumentsForApartmentContext(aptId);

  if (apartmentDocs.length === 0) {
    documentsList.innerHTML = `
      <div class="wl-item">
        <div>
          <div class="wl-item__title">${escapeHtmlDoc(docT("aptDoc.emptyTitle"))}</div>
          <div class="wl-item__desc">${escapeHtmlDoc(docT("aptDoc.emptyDesc"))}</div>
        </div>
      </div>
    `;
    return;
  }

  documentsList.innerHTML = apartmentDocs
    .slice()
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
    .map(
      (doc) => `
        <div class="wl-item" tabindex="0" data-doc-id="${doc.id}">
          <div class="wl-item__left">
            <span class="wl-dot" style="background:${doc.docType === "auto_lease_contract" ? "#0f766e" : "#0ea5a4"}"></span>

            <div>
              <div class="wl-item__title">
                ${escapeHtmlDoc(doc.fileName || docT("aptDoc.fileFallback"))}
              </div>

              <div class="wl-item__desc">
                ${escapeHtmlDoc(docT("aptDoc.uploadedPrefix"))}: ${escapeHtmlDoc(formatDocDateTime(doc.uploadedAt))}
              </div>

              ${
                doc.contractId
                  ? `<div class="wl-item__desc">${escapeHtmlDoc(docT("aptDoc.contractLabel"))}: ${escapeHtmlDoc(doc.contractId)}</div>`
                  : ""
              }
            </div>
          </div>

          <span class="wl-badge">${escapeHtmlDoc(docT("aptDoc.open"))}</span>
        </div>
      `
    )
    .join("");
}

/* ========================================
   Save Document
   ======================================== */

function saveDocumentForApartment(file, aptId, extraData = {}) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const documents = getDocuments();

    documents.push({
      id: "DOC" + Date.now(),
      apartmentId: aptId,
      fileName: file.name,
      fileData: e.target.result,
      mimeType: file.type || "",
      uploadedAt: new Date().toISOString(),
      ...extraData,
    });

    saveDocuments(documents);
  };

  reader.readAsDataURL(file);
}

function saveHtmlDocumentForApartment(htmlContent, aptId, fileName, extraData = {}) {
  const documents = getDocuments();

  documents.push({
    id: "DOC" + Date.now(),
    apartmentId: aptId,
    fileName: fileName || docT("aptDoc.htmlDocName"),
    fileData: buildHtmlDataUrl(htmlContent),
    mimeType: "text/html",
    uploadedAt: new Date().toISOString(),
    ...extraData,
  });

  saveDocuments(documents);
}

function upsertHtmlDocumentForApartment(htmlContent, aptId, fileName, matcher = {}) {
  const documents = getDocuments();

  const index = documents.findIndex((doc) => {
    if (doc.apartmentId !== aptId) return false;
    if (matcher.contractId && doc.contractId !== matcher.contractId) return false;
    if (matcher.docType && doc.docType !== matcher.docType) return false;
    return true;
  });

  const newDoc = {
    id: index >= 0 ? documents[index].id : "DOC" + Date.now(),
    apartmentId: aptId,
    fileName: fileName || docT("aptDoc.htmlDocName"),
    fileData: buildHtmlDataUrl(htmlContent),
    mimeType: "text/html",
    uploadedAt: new Date().toISOString(),
    ...matcher,
  };

  if (index >= 0) {
    documents[index] = newDoc;
  } else {
    documents.push(newDoc);
  }

  saveDocuments(documents);
}

/* ========================================
   Open Document
   ======================================== */

function openDocumentById(docId) {
  const documents = getDocuments();
  const doc = documents.find((d) => d.id === docId);

  if (!doc) return;

  const win = window.open();
  if (!win) return;

  const lang = window.walajna_language && window.walajna_language.get ? window.walajna_language.get() : "ar";
  const htmlLang = lang === "en" ? "en" : lang === "ur" ? "ur" : "ar";
  const dir = lang === "en" ? "ltr" : "rtl";

  win.document.write(`
    <html lang="${htmlLang}" dir="${dir}">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtmlDoc(doc.fileName || docT("aptDoc.viewerDoc"))}</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100%;
            background: #f8fafc;
            font-family: Arial, sans-serif;
          }
          iframe {
            border: none;
            width: 100%;
            min-height: 100vh;
            background: #fff;
          }
        </style>
      </head>
      <body>
        <iframe src="${doc.fileData}"></iframe>
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