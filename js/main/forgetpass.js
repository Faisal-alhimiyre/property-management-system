const forgotForm = document.getElementById("forgotForm");
const identifierInput = document.getElementById("identifier");
const identifierLabel = document.getElementById("identifierLabel");
const forgotMessage = document.getElementById("forgotMessage");
const recoverTabs = document.querySelectorAll(".recover-tab");

let activeMethod = "email";

function showForgotMessage(message, isSuccess = false) {
  forgotMessage.textContent = message;
  forgotMessage.style.color = isSuccess ? "#d1fae5" : "#ffefef";
}

function normalizeValue(value) {
  return (value || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return (phone || "").replace(/\s+/g, "").trim();
}

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function updateRecoverMethod(method) {
  activeMethod = method;

  recoverTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.method === method);
  });

  identifierInput.value = "";
  showForgotMessage("");

  if (method === "email") {
    identifierLabel.textContent = "البريد الإلكتروني";
    identifierInput.type = "email";
    identifierInput.placeholder = "ادخل البريد الإلكتروني";
    identifierInput.setAttribute("autocomplete", "email");
  } else {
    identifierLabel.textContent = "رقم الجوال";
    identifierInput.type = "tel";
    identifierInput.placeholder = "ادخل رقم الجوال";
    identifierInput.setAttribute("autocomplete", "tel");
  }
}

recoverTabs.forEach((tab) => {
  tab.addEventListener("click", function () {
    updateRecoverMethod(this.dataset.method);
  });
});

forgotForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const rawValue = identifierInput.value;
  const users = JSON.parse(localStorage.getItem("walajna_users")) || [];

  showForgotMessage("");

  if (!rawValue.trim()) {
    showForgotMessage(
      activeMethod === "email"
        ? "يرجى إدخال البريد الإلكتروني"
        : "يرجى إدخال رقم الجوال"
    );
    return;
  }

  let user = null;

  if (activeMethod === "email") {
    const email = normalizeValue(rawValue);

    user = users.find((u) => normalizeValue(u.email) === email);

    if (!user) {
      showForgotMessage("هذا البريد الإلكتروني غير مسجل في النظام");
      return;
    }

    localStorage.setItem("walajna_reset_email", user.email || "");
    localStorage.removeItem("walajna_reset_phone");
  } else {
    const phone = normalizePhone(rawValue);

    user = users.find((u) => normalizePhone(u.phoneNumber) === phone);

    if (!user) {
      showForgotMessage("رقم الجوال غير مسجل في النظام");
      return;
    }

    localStorage.setItem("walajna_reset_phone", user.phoneNumber || "");
    localStorage.removeItem("walajna_reset_email");
  }

  const otpCode = generateOtpCode();

  localStorage.setItem("walajna_reset_user", user.id);
  localStorage.setItem("walajna_reset_code", otpCode);
  localStorage.setItem("walajna_reset_method", activeMethod);

  console.log("Walajna OTP Code:", otpCode);

  showForgotMessage("تم إرسال رمز التحقق، تحقق من Console", true);

  setTimeout(() => {
    window.location.href = "../auth/verify-code.html";
  }, 1000);
});

updateRecoverMethod("email");