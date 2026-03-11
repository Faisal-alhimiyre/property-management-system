(function () {
  function initApartmentPaymentsSystem(config) {
    const apartment = config?.apartment;
    const activeRole = config?.activeRole || localStorage.getItem("activeRole") || "owner";

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

    const paymentsSummaryContainer = document.getElementById("paymentsSummary");
    const paymentsTableContainer = document.getElementById("paymentsTableContainer");
    const paymentsReminderContainer = document.getElementById("paymentsReminder");

    let selectedPaymentId = null;

    function getCurrentApartmentPayments() {
      const payments = storage.getPaymentsByApartmentId(apartment.id);
      const normalized = utils.normalizePaymentStatuses(payments);

      const original = storage.getPaymentsByApartmentId(apartment.id);
      const hasChanges = JSON.stringify(original) !== JSON.stringify(normalized);

      if (hasChanges) {
        const allPayments = storage.getPayments();
        const normalizedMap = new Map(normalized.map((payment) => [payment.id, payment]));
        const merged = allPayments.map((payment) =>
          normalizedMap.has(payment.id) ? normalizedMap.get(payment.id) : payment
        );
        storage.savePayments(merged);
      }

      return normalized.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }

    function ensureScheduleForCurrentContract() {
      const contract = apartment.contract || {};
      if (!contract.startDate || !contract.endDate) return;

      const contractId = utils.generateContractId(apartment);
      if (storage.hasPaymentsForContract(contractId)) return;

      const generated = utils.generateScheduleFromContract(apartment);
      if (!generated.length) return;

      storage.addManyPayments(generated);
    }

    function goToTenantPaymentOptions(paymentId) {
      window.location.href = `../main/payment-options.html?id=${encodeURIComponent(apartment.id)}&paymentId=${encodeURIComponent(paymentId)}`;
    }

    function openOwnerRecordModal(payment) {
      selectedPaymentId = payment.id;
      ui.fillPaymentRecordForm(payment, utils);
      ui.openModal("recordPaymentModal");
    }

    function renderPaymentsPage() {
      const payments = getCurrentApartmentPayments();
      const summary = utils.calculatePaymentsSummary(payments);
      const reminder = utils.buildPaymentReminder(payments, 3);

      if (paymentsReminderContainer) {
        ui.renderReminder(paymentsReminderContainer, reminder, activeRole);

        const quickOwnerBtn = document.getElementById("quickPayReminderBtn");
        if (quickOwnerBtn) {
          quickOwnerBtn.addEventListener("click", function () {
            const nextPayment = utils.getNextPendingPayment(payments);
            if (!nextPayment) return;
            openOwnerRecordModal(nextPayment);
          });
        }

        const quickTenantBtn = document.getElementById("tenantPayReminderBtn");
        if (quickTenantBtn) {
          quickTenantBtn.addEventListener("click", function () {
            const nextPayment = utils.getNextPendingPayment(payments);
            if (!nextPayment) return;
            goToTenantPaymentOptions(nextPayment.id);
          });
        }
      }

      if (paymentsSummaryContainer) {
        ui.renderSummary(paymentsSummaryContainer, summary, utils);
      }

      if (paymentsTableContainer) {
        ui.renderPaymentsTable(paymentsTableContainer, payments, {
          utils,
          activeRole,
        });
      }

      bindTableActions(payments);
    }

    function bindTableActions(payments) {
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
          const nextPayment = utils.getNextPendingPayment(payments);
          if (!nextPayment) {
            alert("لا توجد دفعات مستحقة حاليًا");
            return;
          }
          goToTenantPaymentOptions(nextPayment.id);
        });
      }
    }

    function closeRecordPaymentModal() {
      ui.closeModal("recordPaymentModal");
      selectedPaymentId = null;
    }

    function bindPaymentForm() {
      const saveBtn = document.getElementById("savePaymentRecordBtn");
      const closeBtn = document.getElementById("closeRecordPaymentModal");
      const cancelBtn = document.getElementById("cancelRecordPaymentModal");
      const backdrop = document.querySelector('[data-record-payment-close="true"]');

      if (closeBtn) {
        closeBtn.addEventListener("click", closeRecordPaymentModal);
      }

      if (cancelBtn) {
        cancelBtn.addEventListener("click", closeRecordPaymentModal);
      }

      if (backdrop) {
        backdrop.addEventListener("click", closeRecordPaymentModal);
      }

      if (!saveBtn) return;

      saveBtn.addEventListener("click", function () {
        if (!selectedPaymentId) return;

        const amount = Number(document.getElementById("paymentAmountInput")?.value || 0);
        const paymentMethod = document.getElementById("paymentMethodInput")?.value || "";
        const paidAt = document.getElementById("paymentPaidAtInput")?.value || "";
        const notes = document.getElementById("paymentNotesInput")?.value?.trim() || "";

        if (!amount || amount <= 0) {
          alert("أدخل مبلغًا صحيحًا");
          return;
        }

        if (!paymentMethod) {
          alert("اختر طريقة الدفع");
          return;
        }

        if (!paidAt) {
          alert("اختر تاريخ الدفع");
          return;
        }

        storage.updatePayment(selectedPaymentId, {
          amount,
          paymentMethod,
          paidAt,
          notes,
          status: "paid",
        });

        closeRecordPaymentModal();
        renderPaymentsPage();
      });
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