const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("code");
const codeMessage = document.getElementById("codeMessage");

function showMessage(msg){
  codeMessage.textContent = msg;
}

codeForm.addEventListener("submit", function(e){

  e.preventDefault();

  const enteredCode = codeInput.value.trim();

  const savedCode = localStorage.getItem("walajna_reset_code");

  if(!enteredCode){
    showMessage("ادخل الكود");
    return;
  }

  if(enteredCode !== savedCode){
    showMessage("الكود غير صحيح");
    return;
  }

  localStorage.removeItem("walajna_reset_code");

  window.location.href="../auth/reset-password.html";

});