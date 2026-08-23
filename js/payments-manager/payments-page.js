document.addEventListener("DOMContentLoaded", async function () {
  document.body.classList.add("payments-page--loading");

  const params = new URLSearchParams(window.location.search);

  const apartmentId =
    params.get("id") ||
    params.get("apartmentId");

  const historyId = params.get("historyId");
  const mode = params.get("mode");
  const historyContractId = params.get("contractId");

  const tableContainer = document.getElementById("paymentsTableContainer");

  function clearPaymentsLoading() {
    document.body.classList.remove("payments-page--loading");
    const loadingEl = document.getElementById("paymentsPageLoading");
    if (loadingEl) loadingEl.remove();
    if (tableContainer) tableContainer.setAttribute("aria-busy", "false");
  }

  if (!apartmentId) {
    const msg =
      window.walajna_language && window.walajna_language.t
        ? window.walajna_language.t("console.aptIdMissing")
        : "apartmentId missing";
    console.warn(msg);
    clearPaymentsLoading();
    return;
  }

  const activeRole =
    (typeof WalajnaAuth !== "undefined" &&
      typeof WalajnaAuth.getActiveRole === "function" &&
      WalajnaAuth.getActiveRole()) ||
    "owner";

  function showLoadError(message) {
    clearPaymentsLoading();
    if (tableContainer) {
      tableContainer.innerHTML =
        `<div class="payments-empty">${message}</div>`;
    }
  }

  if (mode === "history" && historyId) {
    const apartments =
      typeof getApartments === "function"
        ? getApartments()
        : JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
    const apartment = apartments.find(
      (apt) => String(apt.id) === String(apartmentId)
    );

    if (!apartment) {
      const msg =
        window.walajna_language && window.walajna_language.t
          ? window.walajna_language.t("console.aptNotFoundPage")
          : "Apartment not found";
      console.warn(msg);
      showLoadError(
        window.walajna_language && window.walajna_language.t
          ? window.walajna_language.t("payments.historyAptMissing")
          : "تعذر العثور على بيانات الشقة."
      );
      return;
    }

    // History mode: load installments for the archived contract from the API.
    const serverPaymentsRef = { current: [] };
    let installmentsApiError = null;
    const cid =
      historyContractId ||
      apartment.currentContractId ||
      apartment.contract?.id ||
      null;

    if (
      cid &&
      typeof WalajnaAuth !== "undefined" &&
      WalajnaAuth.fetchWithAuth
    ) {
      try {
        if (WalajnaAuth.hydrateSession) await WalajnaAuth.hydrateSession();
        const apiBase = WalajnaAuth.API_BASE;
        const listRes = await WalajnaAuth.fetchWithAuth(
          `${apiBase}/api/contracts/${encodeURIComponent(String(cid))}/installments`,
          { method: "GET" }
        );
        if (listRes.ok) {
          const rows = await listRes.json();
          const list = Array.isArray(rows) ? rows : [];
          serverPaymentsRef.current = list.map((r) => {
            const due = (r.due_date || "").toString().slice(0, 10);
            const amt = Number(r.amount ?? 0);
            const orig =
              r.original_amount != null ? Number(r.original_amount) : amt;
            const paidRaw = r.paid_at;
            const paidAt =
              paidRaw != null && paidRaw !== ""
                ? String(paidRaw).slice(0, 10)
                : "";
            return {
              id: String(r.id),
              contractId: String(r.contract_id ?? cid),
              apartmentId: String(apartment.id),
              dueDate: due,
              amount: amt,
              originalAmount: orig,
              status: r.status || "pending",
              paymentMethod: r.payment_method || "",
              paidAt,
              notes: r.notes || "",
            };
          });
        } else {
          installmentsApiError = `تعذر جلب دفعات العقد المؤرشف (${listRes.status}).`;
        }
      } catch (e) {
        console.warn("history payments installments fetch failed", e);
        installmentsApiError = "تعذر جلب دفعات العقد المؤرشف من الخادم.";
      }
    }

    if (typeof window.initApartmentPaymentsSystem === "function") {
      clearPaymentsLoading();
      window.initApartmentPaymentsSystem({
        apartment,
        activeRole,
        mode,
        historyId,
        historyContractId: cid,
        paymentsFromApi: true,
        serverMode: Boolean(cid),
        contractIdForServer: cid,
        serverPaymentsRef,
        installmentsApiError,
      });
    }
    return;
  }

  if (!window.WalajnaAuth || typeof window.WalajnaAuth.fetchWithAuth !== "function") {
    showLoadError("يرجى تسجيل الدخول لعرض المدفوعات.");
    return;
  }

  await WalajnaAuth.hydrateSession();

  const apiBase = window.WalajnaAuth.API_BASE;

  async function fetchApartmentFromApi() {
    let apartmentResponse;
    if (WalajnaAuth.fetchJsonWithAuthRetry) {
      const result = await WalajnaAuth.fetchJsonWithAuthRetry(
        `${apiBase}/api/apartments/${encodeURIComponent(apartmentId)}`,
        { method: "GET" },
        { retries: 4, delayMs: 400 }
      );
      if (result.status === 401) {
        if (typeof WalajnaAuth.handleUnauthorized === "function") {
          WalajnaAuth.handleUnauthorized(
            "انتهت الجلسة أو التوكن غير صالح. سجل الدخول مرة أخرى ثم أعد المحاولة."
          );
        }
        throw new Error("unauthorized");
      }
      if (!result.ok || !result.data) {
        throw new Error("apartment fetch failed");
      }
      apartmentResponse = { ok: true, json: async () => result.data, status: result.status };
    } else {
      apartmentResponse = await WalajnaAuth.fetchWithAuth(
        `${apiBase}/api/apartments/${encodeURIComponent(apartmentId)}`,
        { method: "GET" }
      );
      if (apartmentResponse.status === 401) {
        if (typeof WalajnaAuth.handleUnauthorized === "function") {
          WalajnaAuth.handleUnauthorized(
            "انتهت الجلسة أو التوكن غير صالح. سجل الدخول مرة أخرى ثم أعد المحاولة."
          );
        }
        throw new Error("unauthorized");
      }
      if (!apartmentResponse.ok) {
        throw new Error("apartment fetch failed");
      }
    }
    const apiApartment = await apartmentResponse.json();
    const aptIdStr = String(apiApartment.id);

    let contractsList = [];
    if (WalajnaAuth.fetchJsonWithAuthRetry) {
      const cResult = await WalajnaAuth.fetchJsonWithAuthRetry(
        `${apiBase}/api/contracts`,
        { method: "GET" },
        { retries: 3, delayMs: 350 }
      );
      if (cResult.ok && Array.isArray(cResult.data)) {
        contractsList = cResult.data;
      }
    } else {
      const contractsResponse = await WalajnaAuth.fetchWithAuth(
        `${apiBase}/api/contracts`,
        { method: "GET" }
      );
      if (contractsResponse.ok) {
        const raw = await contractsResponse.json();
        contractsList = Array.isArray(raw) ? raw : [];
      }
    }

    const contractsForApartment = contractsList.filter(
      (c) => c && String(c.apartment_id) === aptIdStr
    );

    let pinnedId = apiApartment.current_contract_id ?? null;
    if (
      pinnedId != null &&
      !contractsForApartment.some((c) => String(c.id) === String(pinnedId))
    ) {
      pinnedId = null;
    }

    let primaryContractId = pinnedId;
    if (!primaryContractId && contractsForApartment.length) {
      const sorted = [...contractsForApartment].sort(
        (a, b) => Number(b.id) - Number(a.id)
      );
      primaryContractId = sorted[0].id;
    }

    const contract =
      primaryContractId != null
        ? contractsForApartment.find(
            (item) => String(item.id) === String(primaryContractId)
          ) || null
        : null;

    return {
      apiApartment,
      contract,
      currentContractId: primaryContractId,
      contractsForApartment,
    };
  }

  function mapInstallmentRows(rows, apiApartment, contractIdStr) {
    const aid = String(
      apiApartment.id ?? apiApartment.apiId ?? apartmentId
    );
    return (rows || []).map((r) => {
      const due = (r.due_date || "").toString().slice(0, 10);
      const amt = Number(r.amount ?? 0);
      const orig =
        r.original_amount != null ? Number(r.original_amount) : amt;
      const paidRaw = r.paid_at;
      const paidAt =
        paidRaw != null && paidRaw !== ""
          ? String(paidRaw).slice(0, 10)
          : "";
      return {
        id: String(r.id),
        contractId: String(r.contract_id ?? contractIdStr ?? ""),
        apartmentId: String(r.apartment_id ?? aid),
        dueDate: due,
        amount: amt,
        originalAmount: orig,
        overriddenAmount: amt !== orig ? amt : undefined,
        status: r.status || "pending",
        paymentMethod: r.payment_method || "",
        paidAt,
        notes: r.notes || "",
      };
    });
  }

  let apartment;
  /** Contracts for this apartment from GET /api/contracts (resolves stale current_contract_id). */
  let contractsForThisApartment = [];
  try {
    const {
      apiApartment,
      contract,
      currentContractId,
      contractsForApartment,
    } = await fetchApartmentFromApi();

    contractsForThisApartment = contractsForApartment || [];

    apartment = {
      id: String(apiApartment.id),
      apiId: apiApartment.id,
      rent: apiApartment.rent,
      tenantUserId: apiApartment.tenant_user_id ?? null,
      tenantNationalId: apiApartment.tenant_national_id ?? null,
      tenantInfo: apiApartment.tenant_info || {},
      currentContractId,
      contract: contract
        ? {
            id: contract.id,
            startDate: contract.start_date || "",
            endDate: contract.end_date || "",
            rentAmount: Number(apiApartment.rent ?? 0),
            yearlyRent: Number(contract.yearly_rent ?? contract.yearlyRent ?? 0),
            paymentCycle:
              contract.payment_cycle ||
              contract.paymentCycle ||
              "monthly",
          }
        : {},
    };
  } catch (error) {
    console.warn("Could not load apartment for payments:", error);
    showLoadError("تعذر تحميل بيانات الشقة من الخادم.");
    return;
  }

  const contractIdForServer =
    apartment.currentContractId ?? apartment.contract?.id ?? null;

  const serverPaymentsRef = { current: [] };
  let installmentsApiError = null;

  async function reloadServerPayments() {
    const contractIds = (contractsForThisApartment || [])
      .map((c) => c.id)
      .filter((id) => id != null)
      .sort((a, b) => Number(a) - Number(b));

    if (!contractIds.length) {
      serverPaymentsRef.current = [];
      return;
    }

    const primaryCid =
      contractIdForServer != null
        ? String(contractIdForServer)
        : String(contractIds[contractIds.length - 1]);

    try {
      const byRowId = new Map();
      for (const cid of contractIds) {
        const listRes = await WalajnaAuth.fetchWithAuth(
          `${apiBase}/api/contracts/${encodeURIComponent(String(cid))}/installments`,
          { method: "GET" }
        );
        if (listRes.status === 401) {
          if (typeof WalajnaAuth.handleUnauthorized === "function") {
            WalajnaAuth.handleUnauthorized();
          }
          serverPaymentsRef.current = [];
          return;
        }
        if (!listRes.ok) {
          continue;
        }
        const chunk = await listRes.json();
        for (const row of Array.isArray(chunk) ? chunk : []) {
          if (row && row.id != null) {
            byRowId.set(String(row.id), row);
          }
        }
      }

      let merged = Array.from(byRowId.values());
      merged.sort((a, b) => {
        const da = String(a.due_date || "");
        const db = String(b.due_date || "");
        if (da !== db) return da.localeCompare(db);
        return (
          Number(a.installment_index || 0) - Number(b.installment_index || 0)
        );
      });

      if (
        (!merged || merged.length === 0) &&
        activeRole === "owner" &&
        apartment.contract?.startDate &&
        apartment.contract?.endDate &&
        primaryCid
      ) {
        const cycle = apartment.contract?.paymentCycle || "monthly";
        const yearlyRent = Number(apartment.contract?.yearlyRent || 0);
        const genBody = { payment_cycle: cycle };
        if (Number.isFinite(yearlyRent) && yearlyRent > 0) {
          genBody.yearly_rent = yearlyRent;
        }
        const genRes = await WalajnaAuth.fetchWithAuth(
          `${apiBase}/api/contracts/${encodeURIComponent(primaryCid)}/installments/generate`,
          {
            method: "POST",
            body: JSON.stringify(genBody),
          }
        );
        if (genRes.ok) {
          const listRes2 = await WalajnaAuth.fetchWithAuth(
            `${apiBase}/api/contracts/${encodeURIComponent(primaryCid)}/installments`,
            { method: "GET" }
          );
          if (listRes2.ok) {
            const rows = await listRes2.json();
            merged = Array.isArray(rows) ? rows : [];
          }
        }
      }

      serverPaymentsRef.current = mapInstallmentRows(
        merged,
        apartment,
        primaryCid
      );
    } catch (e) {
      console.warn("installments fetch failed (network/CORS/server):", e);
      installmentsApiError =
        "تعذر جلب جدول الدفعات من الخادم. تأكد أن الـ API يعمل على المنفذ 8002 ثم أعد تحميل الصفحة.";
      serverPaymentsRef.current = [];
    }
  }

  if (contractIdForServer || (contractsForThisApartment || []).length) {
    await reloadServerPayments();
  }

  if (typeof window.initApartmentPaymentsSystem === "function") {
    clearPaymentsLoading();
    window.initApartmentPaymentsSystem({
      apartment,
      activeRole,
      mode,
      historyId,
      historyContractId,
      paymentsFromApi: true,
      serverMode: Boolean(
        contractIdForServer || (contractsForThisApartment || []).length
      ),
      contractIdForServer,
      serverPaymentsRef,
      reloadServerPayments,
      installmentsApiError,
    });
  } else {
    clearPaymentsLoading();
  }
});
