/**
 * Server-backed documents: GET/POST/DELETE /api/documents.
 * In-memory list merged per apartment (like apartments session mirror).
 */
(function () {
  let flatList = [];

  function apiBase() {
    return (
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002"
    );
  }

  function mapRow(row) {
    return {
      id: String(row.id),
      serverId: row.id,
      apartmentId: String(row.apartment_id ?? ""),
      contractId: row.contract_id != null ? String(row.contract_id) : null,
      fileName: row.name,
      fileData: row.url,
      mimeType: row.mime_type || "",
      docType: row.doc_type || row.type || "",
      uploadedAt: row.uploaded_at ? String(row.uploaded_at) : new Date().toISOString(),
      generatedAutomatically: !!row.generated_automatically,
    };
  }

  function mergeApartmentSlice(apartmentId, docs) {
    const id = String(apartmentId);
    flatList = flatList.filter((d) => String(d.apartmentId) !== id);
    (Array.isArray(docs) ? docs : []).forEach((d) => flatList.push(d));
  }

  function getSessionList() {
    return flatList.slice();
  }

  function setSessionList(list) {
    flatList = Array.isArray(list) ? list.slice() : [];
  }

  /**
   * @param {string|number} apartmentId - Local / UI apartment id (URL, sessionStorage key).
   * @param {string|number} [serverApartmentId] - Supabase `apartments.id` when it differs from local id.
   */
  async function refreshForApartment(apartmentId, serverApartmentId) {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      return [];
    }
    if (!WalajnaAuth.getCurrentUser || !WalajnaAuth.getCurrentUser()) {
      return [];
    }
    const qid =
      serverApartmentId != null && String(serverApartmentId).trim() !== ""
        ? serverApartmentId
        : apartmentId;
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/documents?apartment_id=${encodeURIComponent(String(qid))}`,
      { method: "GET" }
    );
    if (!res.ok) {
      console.warn("[documents-api] list failed", res.status);
      return [];
    }
    let rows = [];
    try {
      rows = await res.json();
    } catch {
      return [];
    }
    const mapped = (Array.isArray(rows) ? rows : []).map((row) => {
      const m = mapRow(row);
      m.apartmentId = String(apartmentId);
      return m;
    });
    mergeApartmentSlice(apartmentId, mapped);
    return mapped;
  }

  async function createOnServer(doc) {
    const cidRaw = doc.contractId;
    let contractId = null;
    if (cidRaw != null && cidRaw !== "") {
      const n = Number(cidRaw);
      if (Number.isFinite(n)) contractId = n;
    }
    const body = {
      apartment_id: Number(doc.apartmentId),
      name: doc.fileName || "document",
      url: doc.fileData,
      mime_type: doc.mimeType || null,
      doc_type: doc.docType || null,
      contract_id: contractId,
      generated_automatically: !!doc.generatedAutomatically,
    };
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const row = await res.json();
    return mapRow(row);
  }

  async function uploadGeneratedFileOnServer(doc, blob) {
    if (!blob) throw new Error("Missing file blob");
    const cidRaw = doc.contractId;
    let contractId = null;
    if (cidRaw != null && cidRaw !== "") {
      const n = Number(cidRaw);
      if (Number.isFinite(n)) contractId = n;
    }
    const fd = new FormData();
    fd.append("apartment_id", String(Number(doc.apartmentId)));
    fd.append("name", doc.fileName || "document.pdf");
    if (contractId != null) fd.append("contract_id", String(contractId));
    if (doc.docType) fd.append("doc_type", String(doc.docType));
    fd.append("generated_automatically", doc.generatedAutomatically ? "true" : "false");
    fd.append("file", blob, doc.fileName || "document.pdf");

    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/documents/upload-generated`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const row = await res.json();
    return mapRow(row);
  }

  async function renderContractPdfOnServer(doc, html) {
    const cidRaw = doc.contractId;
    let contractId = null;
    if (cidRaw != null && cidRaw !== "") {
      const n = Number(cidRaw);
      if (Number.isFinite(n)) contractId = n;
    }
    const body = {
      apartment_id: Number(doc.apartmentId),
      name: doc.fileName || "contract.pdf",
      html: String(html || ""),
      contract_id: contractId,
      doc_type: doc.docType || "auto_lease_contract",
      generated_automatically: !!doc.generatedAutomatically,
    };
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/documents/render-upload-contract-pdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const row = await res.json();
    return mapRow(row);
  }

  async function deleteOnServer(serverId) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/documents/${encodeURIComponent(String(serverId))}`,
      { method: "DELETE" }
    );
    if (!res.ok) return false;
    flatList = flatList.filter((d) => String(d.serverId ?? d.id) !== String(serverId));
    return true;
  }

  async function deleteByApartment(apartmentId) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/documents/by-apartment/${encodeURIComponent(String(apartmentId))}`,
      { method: "DELETE" }
    );
    if (!res.ok) return false;
    mergeApartmentSlice(apartmentId, []);
    return true;
  }

  window.WalajnaDocumentsApi = {
    mapRow,
    getSessionList,
    setSessionList,
    refreshForApartment,
    createOnServer,
    uploadGeneratedFileOnServer,
    renderContractPdfOnServer,
    deleteOnServer,
    deleteByApartment,
  };
})();
