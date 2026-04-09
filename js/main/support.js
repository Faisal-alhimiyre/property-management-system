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

function wlT(key) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key)
    : key;
}

/* ===== Ready-made responses ===== */
function getReply(msg) {
  const t = msg.trim().toLowerCase();
  const forgotAr = "\u0646\u0633\u064a\u062a";
  const wordPassAr = "\u0643\u0644\u0645\u0629";
  const loginAr = "\u062a\u0633\u062c\u064a\u0644";
  const enterAr = "\u062f\u062e\u0648\u0644";
  const idAr1 = "\u0647\u0648\u064a\u0629";
  const linkAr = "\u0631\u0628\u0637";
  const tenantAr = "\u0645\u0633\u062a\u0623\u062c\u0631";
  const buildingAr = "\u0645\u0628\u0646\u0649";
  const aptAr = "\u0634\u0642\u0629";
  const aptsAr = "\u0634\u0642\u0642";

  if (
    t.includes("forgot") ||
    t.includes("password") ||
    (t.includes(forgotAr) && t.includes(wordPassAr))
  ) {
    return wlT("support.reply.forgot");
  }

  if (
    t.includes("login") ||
    t.includes("sign in") ||
    (t.includes(loginAr) && (t.includes(enterAr) || t.includes("\u0627\u0644\u062f\u062e\u0648\u0644")))
  ) {
    return wlT("support.reply.login");
  }

  if (t.includes("national") || t.includes("id") || t.includes(idAr1) || t.includes("\u0627\u0644\u0647\u0648\u064a\u0629")) {
    return wlT("support.reply.nationalId");
  }

  if (t.includes("tenant") || t.includes("link") || t.includes(linkAr) || t.includes(tenantAr)) {
    return wlT("support.reply.tenantLink");
  }

  if (t.includes("apartment") || t.includes("building") || t.includes(buildingAr) || t.includes(aptAr) || t.includes(aptsAr)) {
    return wlT("support.reply.building");
  }

  return wlT("support.reply.default");
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