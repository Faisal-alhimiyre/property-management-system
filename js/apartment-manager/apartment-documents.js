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
      ? "en-GB-u-nu-latn"
      : "ar-SA-u-nu-latn";
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

    return apartments.find((apt) => String(apt.id) === String(aptId)) || null;
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

function normalizeContractKey(value) {
  return value == null ? "" : String(value).trim();
}

function dedupeApartmentDocuments(docs) {
  const list = Array.isArray(docs) ? docs.slice() : [];
  const seen = new Set();
  const out = [];
  // Newest first so we keep the latest copy of a duplicate pair.
  list
    .slice()
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
    .forEach((doc) => {
      const cid = normalizeContractKey(doc.contractId);
      const name = String(doc.fileName || "").trim().toLowerCase();
      const key = cid
        ? `c:${cid}`
        : name
          ? `n:${name}`
          : `id:${doc.serverId || doc.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(doc);
    });
  return out;
}

function getDocumentsForApartmentContext(aptId) {
  const documents = getDocuments();
  const aptKey = String(aptId);

  const apartmentDocs = documents.filter((doc) => String(doc.apartmentId) === aptKey);
  return dedupeApartmentDocuments(apartmentDocs);
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

function useServerDocuments() {
  return (
    typeof WalajnaAuth !== "undefined" &&
    typeof WalajnaAuth.getCurrentUser === "function" &&
    !!WalajnaAuth.getCurrentUser() &&
    typeof WalajnaDocumentsApi !== "undefined" &&
    typeof WalajnaDocumentsApi.createOnServer === "function"
  );
}

function saveDocumentForApartment(file, aptId, extraData = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));

    reader.onload = function (e) {
      const base = {
        id: "DOC" + Date.now(),
        apartmentId: aptId,
        fileName: file.name,
        fileData: e.target.result,
        mimeType: file.type || "",
        uploadedAt: new Date().toISOString(),
        ...extraData,
      };

      void (async () => {
        try {
          if (useServerDocuments()) {
            try {
              const created = await WalajnaDocumentsApi.createOnServer(base);
              const documents = getDocuments().slice();
              documents.push(created);
              saveDocuments(documents);
            } catch (err) {
              console.warn("[apartment-documents] server upload failed", err);
              const documents = getDocuments().slice();
              documents.push(base);
              saveDocuments(documents);
            }
            resolve();
            return;
          }
          const documents = getDocuments().slice();
          documents.push(base);
          saveDocuments(documents);
          resolve();
        } catch (err) {
          reject(err);
        }
      })();
    };

    reader.readAsDataURL(file);
  });
}

async function saveHtmlDocumentForApartment(htmlContent, aptId, fileName, extraData = {}) {
  const base = {
    id: "DOC" + Date.now(),
    apartmentId: aptId,
    fileName: fileName || docT("aptDoc.htmlDocName"),
    fileData: buildHtmlDataUrl(htmlContent),
    mimeType: "text/html",
    uploadedAt: new Date().toISOString(),
    ...extraData,
  };
  if (useServerDocuments()) {
    try {
      const created = await WalajnaDocumentsApi.createOnServer(base);
      const documents = getDocuments().slice();
      documents.push(created);
      saveDocuments(documents);
    } catch (err) {
      console.warn("[apartment-documents] server html save failed", err);
      const documents = getDocuments().slice();
      documents.push(base);
      saveDocuments(documents);
    }
    return;
  }
  const documents = getDocuments().slice();
  documents.push(base);
  saveDocuments(documents);
}

async function upsertDocumentForApartment(fileData, mimeType, aptId, fileName, matcher = {}) {
  const matcherContractKey = normalizeContractKey(matcher.contractId);

  /* One auto-generated lease PDF per apartment+contract: remove prior rows (fixes dupes + legacy rows without doc_type). */
  if (
    useServerDocuments() &&
    matcher.docType === "auto_lease_contract" &&
    matcher.generatedAutomatically &&
    matcherContractKey
  ) {
    const victims = getDocuments().filter((doc) => {
      if (String(doc.apartmentId) !== String(aptId)) return false;
      const isAuto =
        doc.docType === "auto_lease_contract" ||
        (!doc.docType && doc.generatedAutomatically);
      if (!isAuto) return false;
      const dc = normalizeContractKey(doc.contractId);
      if (matcherContractKey && dc && dc !== matcherContractKey) return false;
      return true;
    });
    for (const doc of victims) {
      if (doc.serverId == null) continue;
      try {
        await WalajnaDocumentsApi.deleteOnServer(doc.serverId);
      } catch (e) {
        console.warn("[apartment-documents] could not remove prior auto lease row", e);
      }
    }
  }

  const documents = getDocuments().slice();
  const index = documents.findIndex((doc) => {
    if (String(doc.apartmentId) !== String(aptId)) return false;
    if (
      matcherContractKey &&
      normalizeContractKey(doc.contractId) !== matcherContractKey
    )
      return false;
    if (matcher.docType) {
      const got = doc.docType || "";
      if (got && got !== matcher.docType) return false;
      if (
        !got &&
        matcher.docType === "auto_lease_contract" &&
        matcher.generatedAutomatically &&
        !doc.generatedAutomatically
      ) {
        return false;
      }
    }
    return true;
  });

  const newDoc = {
    id: index >= 0 ? documents[index].id : "DOC" + Date.now(),
    apartmentId: aptId,
    fileName: fileName || docT("aptDoc.htmlDocName"),
    fileData,
    mimeType: mimeType || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
    ...matcher,
  };

  if (useServerDocuments()) {
    const prev = index >= 0 ? documents[index] : null;
    try {
      const created = await WalajnaDocumentsApi.createOnServer({
        apartmentId: aptId,
        fileName: newDoc.fileName,
        fileData: newDoc.fileData,
        mimeType: newDoc.mimeType,
        docType: newDoc.docType || null,
        contractId: newDoc.contractId,
        generatedAutomatically: !!newDoc.generatedAutomatically,
      });
      if (prev && prev.serverId && prev.serverId !== created.serverId) {
        await WalajnaDocumentsApi.deleteOnServer(prev.serverId);
      }
      if (index >= 0) documents[index] = created;
      else documents.push(created);
      saveDocuments(documents);
    } catch (err) {
      console.warn("[apartment-documents] server upsert failed", err);
      if (index >= 0) documents[index] = newDoc;
      else documents.push(newDoc);
      saveDocuments(documents);
    }
    return;
  }

  if (index >= 0) documents[index] = newDoc;
  else documents.push(newDoc);
  saveDocuments(documents);
}

async function upsertHtmlDocumentForApartment(htmlContent, aptId, fileName, matcher = {}) {
  return upsertDocumentForApartment(
    buildHtmlDataUrl(htmlContent),
    "text/html",
    aptId,
    fileName,
    matcher
  );
}

/* ========================================
   Open Document
   ======================================== */

function dataUrlToBlob(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  if (comma < 0) throw new Error("invalid data url");
  const header = raw.slice(0, comma);
  const payload = raw.slice(comma + 1);
  const mimeMatch = header.match(/^data:([^;,]+)/i);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const isBase64 = /;base64/i.test(header);
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

function openDocumentById(docId) {
  const documents = getDocuments();
  const doc = documents.find((d) => String(d.id) === String(docId));

  if (!doc) return;

  const data = String(doc.fileData || "").trim();
  if (!data) {
    window.alert(docT("aptDoc.missingData"));
    return;
  }

  const mime = String(doc.mimeType || "").toLowerCase();
  const isHtml =
    mime.includes("text/html") ||
    mime.includes("html") ||
    data.startsWith("data:text/html") ||
    data.startsWith("data:text%2Fhtml");
  const isPdf =
    mime.includes("application/pdf") ||
    data.startsWith("data:application/pdf") ||
    data.startsWith("data:application%2Fpdf");

  const win = window.open();
  if (!win) {
    window.alert(docT("aptDoc.popupBlocked"));
    return;
  }

  if (/^https?:\/\//i.test(data)) {
    win.location.href = data;
    return;
  }

  // Large PDF data URLs go blank via location.href — open via blob URL instead.
  if (isPdf && !isHtml && data.startsWith("data:")) {
    try {
      const blob = dataUrlToBlob(data);
      if (!blob || blob.size < 64) {
        window.alert(docT("aptDoc.missingData"));
        win.close();
        return;
      }
      win.location.href = URL.createObjectURL(blob);
      return;
    } catch (e) {
      console.warn("[apartment-documents] pdf data url open failed", e);
      window.alert(docT("aptDoc.openFailed"));
      win.close();
      return;
    }
  }

  if (isPdf && !isHtml) {
    win.location.href = data;
    return;
  }

  // HTML data URL: write content directly (iframe src with huge data URLs often blanks).
  if (isHtml && data.startsWith("data:")) {
    try {
      const blob = dataUrlToBlob(data);
      const reader = new FileReader();
      reader.onload = () => {
        win.document.open();
        win.document.write(String(reader.result || ""));
        win.document.close();
      };
      reader.onerror = () => {
        win.location.href = URL.createObjectURL(blob);
      };
      reader.readAsText(blob);
      return;
    } catch (e) {
      console.warn("[apartment-documents] html data url open failed", e);
    }
  }

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
        <iframe src="${String(doc.fileData || "").replace(/"/g, "&quot;")}"></iframe>
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