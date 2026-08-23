/**
 * Walajna-themed alert / confirm dialogs (replaces browser popups).
 */
(function (global) {
  let queue = Promise.resolve();
  let openCount = 0;

  function t(key) {
    return global.walajna_language && global.walajna_language.t
      ? global.walajna_language.t(key)
      : key;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureModal() {
    let root = document.getElementById("walajnaDialogRoot");
    if (root) return root;

    root = document.createElement("div");
    root.id = "walajnaDialogRoot";
    root.className = "wl-dialog";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="wl-dialog__backdrop" data-wl-dialog-close="cancel"></div>
      <div class="wl-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="walajnaDialogTitle">
        <div class="wl-dialog__header">
          <h3 class="wl-dialog__title" id="walajnaDialogTitle"></h3>
        </div>
        <div class="wl-dialog__body" id="walajnaDialogBody"></div>
        <div class="wl-dialog__footer" id="walajnaDialogFooter"></div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function lockBody() {
    openCount += 1;
    if (openCount === 1) {
      document.body.style.overflow = "hidden";
    }
  }

  function unlockBody() {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) {
      document.body.style.overflow = "";
    }
  }

  function enqueue(fn) {
    const run = queue.then(fn);
    queue = run.catch(function () {});
    return run;
  }

  function showDialog(options) {
    return enqueue(function () {
      return new Promise(function (resolve) {
        const mode = options.mode === "confirm" ? "confirm" : "alert";
        const message = String(options.message ?? "");
        const title =
          options.title ||
          (mode === "confirm" ? t("dialog.confirmTitle") : t("dialog.alertTitle"));
        const confirmLabel = options.confirmLabel || t("dialog.ok");
        const cancelLabel = options.cancelLabel || t("dialog.cancel");
        const danger = !!options.danger;

        const root = ensureModal();
        const titleEl = document.getElementById("walajnaDialogTitle");
        const bodyEl = document.getElementById("walajnaDialogBody");
        const footerEl = document.getElementById("walajnaDialogFooter");

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = message;

        const finish = function (value) {
          root.classList.remove("is-open");
          root.setAttribute("aria-hidden", "true");
          unlockBody();
          document.removeEventListener("keydown", onKey);
          resolve(value);
        };

        const onKey = function (e) {
          if (e.key === "Escape") {
            finish(mode === "confirm" ? false : undefined);
          }
        };

        if (footerEl) {
          const confirmClass = danger
            ? "wl-dialog__btn wl-dialog__btn--danger"
            : "wl-dialog__btn wl-dialog__btn--primary";
          footerEl.innerHTML =
            mode === "confirm"
              ? `
            <button type="button" class="wl-dialog__btn wl-dialog__btn--ghost" data-wl-dialog-close="cancel">${escapeHtml(
              cancelLabel
            )}</button>
            <button type="button" class="${confirmClass}" data-wl-dialog-close="confirm">${escapeHtml(
                confirmLabel
              )}</button>
          `
              : `<button type="button" class="${confirmClass}" data-wl-dialog-close="confirm">${escapeHtml(
                  confirmLabel
                )}</button>`;
        }

        root.querySelectorAll("[data-wl-dialog-close]").forEach(function (el) {
          el.onclick = function () {
            const action = el.getAttribute("data-wl-dialog-close");
            if (action === "confirm") {
              finish(mode === "confirm" ? true : undefined);
            } else {
              finish(mode === "confirm" ? false : undefined);
            }
          };
        });

        lockBody();
        root.classList.add("is-open");
        root.setAttribute("aria-hidden", "false");
        document.addEventListener("keydown", onKey);

        const primary = footerEl && footerEl.querySelector("[data-wl-dialog-close='confirm']");
        if (primary && typeof primary.focus === "function") {
          primary.focus();
        }
      });
    });
  }

  function alert(message, options) {
    return showDialog({
      mode: "alert",
      message: message,
      title: options && options.title,
      confirmLabel: (options && options.confirmLabel) || t("dialog.ok"),
    });
  }

  function confirm(message, options) {
    return showDialog({
      mode: "confirm",
      message: message,
      title: options && options.title,
      confirmLabel: (options && options.confirmLabel) || t("dialog.confirm"),
      cancelLabel: (options && options.cancelLabel) || t("dialog.cancel"),
      danger: !!(options && options.danger),
    });
  }

  global.WalajnaDialog = {
    alert: alert,
    confirm: confirm,
  };

  global.alert = function (message) {
    void alert(message);
  };

  global.confirm = function () {
    console.warn(
      "[WalajnaDialog] window.confirm is async — use: if (!(await WalajnaDialog.confirm(msg))) return;"
    );
    return false;
  };
})(typeof window !== "undefined" ? window : this);
