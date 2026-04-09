document.addEventListener("DOMContentLoaded", async function () {
  const params = new URLSearchParams(window.location.search);

  const apartmentId =
    params.get("id") ||
    params.get("apartmentId");

  const historyId = params.get("historyId");
  const mode = params.get("mode");
  const historyContractId = params.get("contractId");

  const tableContainer = document.getElementById("paymentsTableContainer");

  if (!apartmentId) {
    const msg =
      window.walajna_language && window.walajna_language.t
        ? window.walajna_language.t("console.aptIdMissing")
        : "apartmentId missing";
    console.warn(msg);
    return;
  }

  const activeRole =
    (typeof WalajnaAuth !== "undefined" &&
      typeof WalajnaAuth.getActiveRole === "function" &&
      WalajnaAuth.getActiveRole()) ||
    "owner";

  function showLoadError(message) {
    if (tableContainer) {
      tableContainer.innerHTML =
        `<div class="payments-empty">${message}</div>`;
    }
  }

  if (mode === "history" && historyId) {
    const apartments = JSON.parse(
      localStorage.getItem("walajna_apartments") || "[]"
    );
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

    if (typeof window.initApartmentPaymentsSystem === "function") {
      window.initApartmentPaymentsSystem({
        apartment,
        activeRole,
        mode,
        historyId,
        historyContractId,
        paymentsFromApi: false,
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
    const apartmentResponse = await WalajnaAuth.fetchWithAuth(
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
    const apiApartment = await apartmentResponse.json();
    const currentContractId =
      apiApartment.current_contract_id ?? null;

    let contract = null;
    if (currentContractId) {
      const contractsResponse = await WalajnaAuth.fetchWithAuth(
        `${apiBase}/api/contracts`,
        { method: "GET" }
      );
      if (contractsResponse.ok) {
        const contracts = await contractsResponse.json();
        contract = Array.isArray(contracts)
          ? contracts.find(
              (item) => String(item.id) === String(currentContractId)
            )
          : null;
      }
    }

    return { apiApartment, contract, currentContractId };
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
  try {
    const { apiApartment, contract, currentContractId } =
      await fetchApartmentFromApi();

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
            paymentCycle: "monthly",
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
    if (!contractIdForServer) {
      serverPaymentsRef.current = [];
      return;
    }
    try {
      const listRes = await WalajnaAuth.fetchWithAuth(
        `${apiBase}/api/contracts/${encodeURIComponent(contractIdForServer)}/installments`,
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
        serverPaymentsRef.current = [];
        return;
      }
      let rows = await listRes.json();
      if (
        (!rows || rows.length === 0) &&
        activeRole === "owner" &&
        apartment.contract?.startDate &&
        apartment.contract?.endDate
      ) {
        const cycle = apartment.contract?.paymentCycle || "monthly";
        const genRes = await WalajnaAuth.fetchWithAuth(
          `${apiBase}/api/contracts/${encodeURIComponent(contractIdForServer)}/installments/generate`,
          {
            method: "POST",
            body: JSON.stringify({ payment_cycle: cycle }),
          }
        );
        if (genRes.ok) {
          const listRes2 = await WalajnaAuth.fetchWithAuth(
            `${apiBase}/api/contracts/${encodeURIComponent(contractIdForServer)}/installments`,
            { method: "GET" }
          );
          if (listRes2.ok) {
            rows = await listRes2.json();
          }
        }
      }
      serverPaymentsRef.current = mapInstallmentRows(
        rows,
        apartment,
        String(contractIdForServer)
      );
    } catch (e) {
      console.warn("installments fetch failed (network/CORS/server):", e);
      installmentsApiError =
        "تعذر جلب جدول الدفعات من الخادم. تأكد أن الـ API يعمل على المنفذ 8002 ثم أعد تحميل الصفحة.";
      serverPaymentsRef.current = [];
    }
  }

  if (contractIdForServer) {
    await reloadServerPayments();
  }

  if (typeof window.initApartmentPaymentsSystem === "function") {
    window.initApartmentPaymentsSystem({
      apartment,
      activeRole,
      mode,
      historyId,
      historyContractId,
      paymentsFromApi: true,
      serverMode: Boolean(contractIdForServer),
      contractIdForServer,
      serverPaymentsRef,
      reloadServerPayments,
      installmentsApiError,
    });
  }
});
