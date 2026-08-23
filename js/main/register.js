document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("errorBox");

  const API_BASE =
    (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) ||
    "http://127.0.0.1:8002";

  const ARABIC_NAME_PART =
    /^[\u0621-\u064A\u0671\u067E\u0686\u0698\u06A9\u06AF\u06BE\u06C1\u06CC\u06D5آأؤإئءةى]{2,}$/;

  function showError(msg) {
    errorBox.textContent = msg;
  }

  function T(k, p) {
    return (window.walajna_language && window.walajna_language.t(k, p)) || k;
  }

  function normalizeNamePart(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "");
  }

  function isValidNamePart(value) {
    return ARABIC_NAME_PART.test(normalizeNamePart(value));
  }

  function isValidSaudiId(id) {
    if (!/^\d{10}$/.test(id)) return false;
    const first = id[0];

    if (first !== "1" && first !== "2") return false;

    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const digit = Number(id[i]);
      if ((i + 1) % 2 === 1) {
        const doubled = digit * 2;
        sum += doubled > 9 ? doubled - 9 : doubled;
      } else {
        sum += digit;
      }
    }
    return sum % 10 === 0;
  }

  ["firstName", "fatherName", "familyName"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("blur", () => {
      const normalized = normalizeNamePart(input.value);
      if (normalized) input.value = normalized;
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const firstName = normalizeNamePart(form.firstName.value);
    const fatherName = normalizeNamePart(form.fatherName.value);
    const familyName = normalizeNamePart(form.familyName.value);
    form.firstName.value = firstName;
    form.fatherName.value = fatherName;
    form.familyName.value = familyName;

    const fullName = [firstName, fatherName, familyName].filter(Boolean).join(" ");
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const nationalId = form.nationalId.value.trim();
    const phoneNumber = form.phoneNumber.value.trim();

    if (
      !firstName ||
      !fatherName ||
      !familyName ||
      !email ||
      !password ||
      !confirmPassword ||
      !nationalId ||
      !phoneNumber
    ) {
      showError(T("register.fillAll"));
      return;
    }

    if (!isValidNamePart(firstName) || !isValidNamePart(fatherName) || !isValidNamePart(familyName)) {
      showError(T("register.fullNameBad"));
      return;
    }

    if (!isValidSaudiId(nationalId)) {
      showError(T("register.nationalIdBad"));
      return;
    }

    const pwdCheck =
      (window.WalajnaPasswordPolicy && window.WalajnaPasswordPolicy.validate(password)) || {
        ok: password.length >= 8,
        key: "auth.passwordWeak",
      };
    if (!pwdCheck.ok) {
      showError(T(pwdCheck.key || "auth.passwordWeak"));
      return;
    }

    if (password !== confirmPassword) {
      showError(T("register.passwordMismatch"));
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: fullName,
          email,
          password,
          national_id: nationalId,
          phone: phoneNumber,
          role: "owner", // Default to owner, can be changed later
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        let detail = error.detail;
        if (Array.isArray(detail) && detail.length) {
          detail = detail[0].msg || detail[0].message || T("register.createError");
          if (typeof detail === "string" && detail.toLowerCase().includes("full name")) {
            detail = T("register.fullNameBad");
          }
        }
        showError(detail || T("register.createError"));
        return;
      }

      alert(T("register.success"));
      window.location.href = "../auth/login.html";
    } catch (error) {
      showError(T("login.network"));
    }
  });
});
