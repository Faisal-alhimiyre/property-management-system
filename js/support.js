const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");

const STORAGE_KEY = "walajna_support_chat";

/* ===== Helpers ===== */
function timeNow(){
  const d = new Date();
  const h = String(d.getHours()).padStart(2,"0");
  const m = String(d.getMinutes()).padStart(2,"0");
  return `${h}:${m}`;
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function addMessage(text, who="user"){
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.innerHTML = `
    <div class="bubble">${escapeHtml(text)}</div>
    <div class="meta">${timeNow()}</div>
  `;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  saveChat();
}

function addTyping(){
  const el = document.createElement("div");
  el.className = "msg bot typing";
  el.innerHTML = `
    <div class="bubble">
      <div class="dots"><span></span><span></span><span></span></div>
    </div>
    <div class="meta">${timeNow()}</div>
  `;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

/* ===== Ready-made responses ===== */
function getReply(msg){
  const t = msg.trim().toLowerCase();

  // Password reset
  if (t.includes("نسيت") && t.includes("كلمة")) {
    return `لحل مشكلة نسيان كلمة المرور:
1) افتح صفحة تسجيل الدخول
2) اضغط "نسيت كلمة المرور" (سيتم إضافتها لاحقًا)
حاليًا (نسخة تجريبية) يمكنك إعادة إنشاء حساب جديد للتجربة.`;
  }

  // Login issues
  if (t.includes("تسجيل") && (t.includes("الدخول") || t.includes("دخول"))) {
    return `جرّب هذه الخطوات:
1) تأكد من اسم المستخدم/البريد وكلمة المرور
2) تأكد أنك تستخدم نفس الحساب المسجل
3) إذا كنت تختبر بـ localStorage: جرّب مسح البيانات ثم إعادة التسجيل
هل تظهر لك رسالة خطأ؟ اكتبها هنا.`;
  }

  // National ID validation
  if (t.includes("هوية") || t.includes("الهوية") || t.includes("national")) {
    return `الهوية الوطنية لازم تكون:
- 10 أرقام
- وتنجح في التحقق (Checksum)
تأكد من عدم وجود مسافات، واكتبها بالأرقام فقط.`;
  }

  // Tenant linking
  if (t.includes("ربط") || t.includes("مستأجر") || t.includes("tenant")) {
    return `ربط المستأجر بالشقة:
1) المالك يدخل رقم هوية المستأجر
2) إذا كان المستأجر مسجل → يتم إنشاء عقد مباشرة
3) إذا غير مسجل → يتم إنشاء دعوة معلّقة
وعند تسجيل المستأجر بنفس الهوية يتم الربط تلقائيًا.`;
  }

  // Add building/apartment
  if (t.includes("مبنى") || t.includes("شقة") || t.includes("شقق") || t.includes("apartment")) {
    return `لإضافة مبنى وشقق:
1) ادخل لوحة المالك
2) اختر "إضافة مبنى"
3) بعد حفظ المبنى، أضف الشقق (رقم الوحدة)
ثم اربط المستأجر لكل شقة عند الحاجة.`;
  }

  // Default reply
  return `تم 👌
اكتب نوع المشكلة بالضبط (تسجيل دخول / تسجيل جديد / ربط مستأجر / إضافة مبنى) وسأعطيك الحل المناسب.`;
}

/* ===== Save / Load chat ===== */
function saveChat(){
  // Save only user/bot messages (ignore typing)
  const msgs = [...chat.querySelectorAll(".msg:not(.typing)")].map(m => ({
    who: m.classList.contains("user") ? "user" : "bot",
    text: m.querySelector(".bubble")?.textContent || "",
    time: m.querySelector(".meta")?.textContent || ""
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
}

function loadChat(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;

  try{
    const msgs = JSON.parse(raw);
    // Keep the first welcome message already in HTML, append rest
    msgs.slice(1).forEach(m => {
      const el = document.createElement("div");
      el.className = `msg ${m.who}`;
      el.innerHTML = `
        <div class="bubble">${escapeHtml(m.text)}</div>
        <div class="meta">${escapeHtml(m.time || timeNow())}</div>
      `;
      chat.appendChild(el);
    });
    chat.scrollTop = chat.scrollHeight;
  }catch(e){}
}

loadChat();

/* ===== Send message ===== */
function send(text){
  const msg = text.trim();
  if(!msg) return;

  addMessage(msg, "user");
  input.value = "";

  const typing = addTyping();
  setTimeout(() => {
    typing.remove();
    addMessage(getReply(msg), "bot");
  }, 650);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  send(input.value);
});

/* Chips */
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if(!chip) return;
  send(chip.dataset.q);
});