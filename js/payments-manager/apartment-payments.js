(function () {
  function initApartmentPaymentsSystem(config) {
    const apartment = config?.apartment;
    const activeRole =
      config?.activeRole || localStorage.getItem("activeRole") || "owner";

    const mode = config?.mode || "current";
    const historyId = config?.historyId || null;
    const historyContractId = config?.historyContractId || null;

    if (!apartment || !apartment.id) {
      console.warn("تعذر تهيئة نظام المدفوعات: بيانات الشقة غير موجودة");
      return;
    }

    const storage = window.WalajnaPaymentsStorage;
    const utils = window.WalajnaPaymentsUtils;
    const ui = window.WalajnaPaymentsUI;

    if (!storage || !utils || !ui) {
      console.error("ملفات المدفوعات غير محملة بشكل كامل");
      return;
    }

    ui.ensurePaymentsStyles();

    const elements = {
      summaryContainer: document.getElementById("paymentsSummary"),
      tableContainer: document.getElementById("paymentsTableContainer"),
      reminderContainer: document.getElementById("paymentsReminder"),

      savePaymentBtn: document.getElementById("savePaymentRecordBtn"),
      closePaymentBtn: document.getElementById("closeRecordPaymentModal"),
      cancelPaymentBtn: document.getElementById("cancelRecordPaymentModal"),
      modalBackdrop: document.querySelector('[data-record-payment-close="true"]'),

      paymentAmountInput: document.getElementById("paymentAmountInput"),
      paymentMethodInput: document.getElementById("paymentMethodInput"),
      paymentPaidAtInput: document.getElementById("paymentPaidAtInput"),
      paymentNotesInput: document.getElementById("paymentNotesInput"),
    };

    let selectedPaymentId = null;

    function getHistoryEntry() {
      if (mode !== "history" || !historyId) return null;

      const historyList = Array.isArray(apartment.tenantHistory)
        ? apartment.tenantHistory
        : [];

      return (
        historyList.find((item) => String(item.historyId) === String(historyId)) || null
      );
    }

    function getHistoricalContractIdFromEntry(historyEntry) {
      if (!historyEntry) return null;

      return (
        historyEntry.contractId ||
        historyEntry.contract?.id ||
        historyEntry.currentContractId ||
        null
      );
    }

    function getEffectiveContractId() {
      if (mode === "history") {
        return (
          historyContractId ||
          getHistoricalContractIdFromEntry(getHistoryEntry()) ||
          null
        );
      }

      return utils.generateContractId(apartment);
    }

    function getSortedApartmentPayments() {
      const contractId = getEffectiveContractId();

      if (!contractId) {
        return [];
      }

      const originalPayments = storage.getPaymentsByContractId(contractId);
      const normalizedPayments = utils.normalizePaymentStatuses(originalPayments);

      const hasChanges =
        JSON.stringify(originalPayments) !== JSON.stringify(normalizedPayments);

      if (hasChanges) {
        persistNormalizedPayments(normalizedPayments);
      }

      return normalizedPayments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }

    function persistNormalizedPayments(normalizedPayments) {
      const allPayments = storage.getPayments();
      const normalizedMap = new Map(
        normalizedPayments.map((payment) => [payment.id, payment])
      );

      const mergedPayments = allPayments.map((payment) =>
        normalizedMap.has(payment.id) ? normalizedMap.get(payment.id) : payment
      );

      storage.savePayments(mergedPayments);
    }

    function ensureScheduleForCurrentContract() {
      if (mode === "history") {
        return;
      }

      const contract = apartment.contract || {};

      if (!contract.startDate || !contract.endDate) {
        return;
      }

      const contractId = getEffectiveContractId();

      if (!contractId) return;

      if (storage.hasPaymentsForContract(contractId)) {
        return;
      }

      const generatedPayments = utils.generateScheduleFromContract(apartment);

      if (!generatedPayments.length) {
        return;
      }

      storage.addManyPayments(generatedPayments);
    }

    function getNextPendingPayment(payments) {
      return utils.getNextPendingPayment(payments);
    }

    function goToTenantPaymentOptions(paymentId) {
      window.location.href =
        `../main/payment-options.html?id=${encodeURIComponent(apartment.id)}` +
        `&paymentId=${encodeURIComponent(paymentId)}`;
    }

    function openOwnerRecordModal(payment) {
      if (!payment) return;
      if (mode === "history") return;

      selectedPaymentId = payment.id;
      ui.fillPaymentRecordForm(payment, utils);
      ui.openModal("recordPaymentModal");
    }

    function closeOwnerRecordModal() {
      ui.closeModal("recordPaymentModal");
      selectedPaymentId = null;
    }

    function renderReminder(payments) {
      if (!elements.reminderContainer) return;

      if (mode === "history") {
        elements.reminderContainer.innerHTML = "";
        return;
      }

      const reminder = utils.buildPaymentReminder(payments, 3);

      ui.renderReminder(elements.reminderContainer, reminder, activeRole);

      const quickOwnerBtn = document.getElementById("quickPayReminderBtn");
      if (quickOwnerBtn) {
        quickOwnerBtn.addEventListener("click", function () {
          const nextPayment = getNextPendingPayment(payments);
          if (!nextPayment) return;
          openOwnerRecordModal(nextPayment);
        });
      }

      const quickTenantBtn = document.getElementById("tenantPayReminderBtn");
      if (quickTenantBtn) {
        quickTenantBtn.addEventListener("click", function () {
          const nextPayment = getNextPendingPayment(payments);
          if (!nextPayment) return;
          goToTenantPaymentOptions(nextPayment.id);
        });
      }
    }

    function getContractInfo() {
      const historyEntry = getHistoryEntry();
      const historyContract = historyEntry?.contract || {};

      const contract =
        mode === "history"
          ? historyContract
          : apartment.contract || {};

      const tenantInfo =
        mode === "history"
          ? historyEntry?.tenantInfo || {}
          : apartment.tenantInfo || {};

      const tenant = apartment.tenant || {};

      const monthlyRent =
        mode === "history"
          ? Number(historyContract.rentAmount || apartment.rent || 0)
          : utils.getMonthlyRentAmount(apartment);

      const effectiveSettings =
        mode === "history"
          ? {
              paymentCycle:
                historyContract.paymentCycle ||
                apartment?.paymentDefaults?.paymentCycle ||
                "monthly",
            }
          : utils.getEffectivePaymentSettings(apartment);

      const paymentCycle = effectiveSettings.paymentCycle || "monthly";
      const installmentAmount =
        monthlyRent * utils.getCycleMonths(paymentCycle);

      const tenantName =
        tenantInfo.fullName ||
        tenant.fullName ||
        tenant.name ||
        apartment.tenantName ||
        apartment.tenantFullName ||
        "—";

      return {
        tenantName,
        monthlyRent,
        paymentCycle,
        paymentCycleLabel: utils.getPaymentCycleLabel(paymentCycle),
        installmentAmount,
        contractStartDate: contract.startDate || "",
        contractEndDate: contract.endDate || "",
      };
    }

    function renderSummary(payments) {
      if (!elements.summaryContainer) return;

      const summary = utils.calculatePaymentsSummary(payments);
      const contractInfo = getContractInfo();

      ui.renderSummary(
        elements.summaryContainer,
        summary,
        utils,
        contractInfo
      );
    }

    function renderTable(payments) {
      if (!elements.tableContainer) return;

      ui.renderPaymentsTable(elements.tableContainer, payments, {
        utils,
        activeRole: mode === "history" ? "history" : activeRole,
      });
    }

    function renderPaymentsPage() {
      const payments = getSortedApartmentPayments();

      renderReminder(payments);
      renderSummary(payments);
      renderTable(payments);
      bindTableActions(payments);
    }

    function bindTableActions(payments) {
      if (mode === "history") {
        return;
      }

      const ownerButtons = document.querySelectorAll('[data-pay-action="record"]');
      ownerButtons.forEach((button) => {
        button.addEventListener("click", function () {
          const paymentId = this.getAttribute("data-pay-id");
          const payment = payments.find((item) => item.id === paymentId);

          if (!payment) return;
          openOwnerRecordModal(payment);
        });
      });

      const tenantButtons = document.querySelectorAll('[data-pay-action="tenant-pay"]');
      tenantButtons.forEach((button) => {
        button.addEventListener("click", function () {
          const paymentId = this.getAttribute("data-pay-id");
          goToTenantPaymentOptions(paymentId);
        });
      });

      const topTenantBtn = document.getElementById("topTenantPayBtn");
      if (topTenantBtn) {
        topTenantBtn.addEventListener("click", function () {
          const nextPayment = getNextPendingPayment(payments);

          if (!nextPayment) {
            alert("لا توجد دفعات مستحقة حاليًا");
            return;
          }

          goToTenantPaymentOptions(nextPayment.id);
        });
      }
    }

    function readPaymentFormData() {
      return {
        amount: Number(elements.paymentAmountInput?.value || 0),
        paymentMethod: elements.paymentMethodInput?.value || "",
        paidAt: elements.paymentPaidAtInput?.value || "",
        notes: elements.paymentNotesInput?.value?.trim() || "",
      };
    }

    function validatePaymentFormData(data) {
      if (!data.amount || data.amount <= 0) {
        return "أدخل مبلغًا صحيحًا";
      }

      if (!data.paymentMethod) {
        return "اختر طريقة الدفع";
      }

      if (!data.paidAt) {
        return "اختر تاريخ الدفع";
      }

      return "";
    }

    function saveRecordedPayment() {
      if (mode === "history") return;
      if (!selectedPaymentId) return;

      const payments = getSortedApartmentPayments();
      const selectedPayment = payments.find((item) => item.id === selectedPaymentId);

      if (!selectedPayment) {
        alert("تعذر العثور على الدفعة المحددة");
        return;
      }

      const formData = readPaymentFormData();
      const validationMessage = validatePaymentFormData(formData);

      if (validationMessage) {
        alert(validationMessage);
        return;
      }

      const originalAmount =
        Number(selectedPayment.originalAmount || selectedPayment.amount || 0);

      const hasOwnerOverride = Number(formData.amount) !== originalAmount;

      storage.updatePayment(selectedPaymentId, {
        amount: formData.amount,
        originalAmount,
        overriddenAmount: formData.amount,
        overriddenByOwner: hasOwnerOverride,
        overrideType: hasOwnerOverride ? "owner_manual_adjustment" : null,
        overrideAt: hasOwnerOverride ? new Date().toISOString() : null,

        paymentMethod: formData.paymentMethod,
        paidAt: formData.paidAt,
        notes: formData.notes,
        status: "paid",
      });

      closeOwnerRecordModal();
      renderPaymentsPage();
    }

    function bindPaymentForm() {
      if (mode === "history") return;

      if (elements.closePaymentBtn) {
        elements.closePaymentBtn.addEventListener("click", closeOwnerRecordModal);
      }

      if (elements.cancelPaymentBtn) {
        elements.cancelPaymentBtn.addEventListener("click", closeOwnerRecordModal);
      }

      if (elements.modalBackdrop) {
        elements.modalBackdrop.addEventListener("click", closeOwnerRecordModal);
      }

      if (elements.savePaymentBtn) {
        elements.savePaymentBtn.addEventListener("click", saveRecordedPayment);
      }
    }

    ensureScheduleForCurrentContract();
    renderPaymentsPage();
    bindPaymentForm();

    return {
      renderPaymentsPage,
    };
  }

  window.initApartmentPaymentsSystem = initApartmentPaymentsSystem;
})();