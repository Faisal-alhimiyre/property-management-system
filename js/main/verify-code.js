const T = (k, p) =>
  window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(k, p)
    : k;

const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("code");
const codeMessage = document.getElementById("codeMessage");

function showMessage(msg) {
  codeMessage.textContent = msg;
}

codeForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const enteredCode = codeInput.value.trim();

  const savedCode = localStorage.getItem("walajna_reset_code");

  if (!enteredCode) {
    showMessage(T("verify.enterCode"));
    return;
  }

  if (enteredCode !== savedCode) {
    showMessage(T("verify.wrongCode"));
    return;
  }

  localStorage.removeItem("walajna_reset_code");

  window.location.href = "../auth/reset-password.html";
});
