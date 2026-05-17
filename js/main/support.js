const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = form.querySelector(".send");

const STORAGE_KEY = "walajna_support_chat";

let sending = false;

function wlT(key) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key)
    : key;
}

function timeNow() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]),
  );
}

function addMessage(text, who = "user") {
  const row = document.createElement("div");
  row.className = `msg ${who}`;
  row.innerHTML = `
    <div class="bubble">${escapeHtml(text)}</div>
    <div class="meta">${timeNow()}</div>
  `;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  saveChat();
}

function addTyping() {
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

function setComposerBusy(busy) {
  sending = busy;
  input.disabled = busy;
  sendBtn.disabled = busy;
  form.classList.toggle("is-busy", busy);
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.disabled = busy;
  });
}

function resolveBotError(err) {
  if (err && err.message === "SUPABASE_NOT_CONFIGURED") {
    return wlT("support.error.config");
  }
  return wlT("support.error.network");
}

async function fetchAiReply(message) {
  if (
    typeof WalajnaSupabase === "undefined" ||
    typeof WalajnaSupabase.invokeWalajnaChatbot !== "function"
  ) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  return WalajnaSupabase.invokeWalajnaChatbot(message);
}

function saveChat() {
  const msgs = [...chat.querySelectorAll(".msg:not(.typing)")].map((m) => ({
    who: m.classList.contains("user") ? "user" : "bot",
    text: m.querySelector(".bubble")?.textContent || "",
    time: m.querySelector(".meta")?.textContent || "",
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
}

function loadChat() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const msgs = JSON.parse(raw);
    msgs.slice(1).forEach((m) => {
      const el = document.createElement("div");
      el.className = `msg ${m.who}`;
      el.innerHTML = `
        <div class="bubble">${escapeHtml(m.text)}</div>
        <div class="meta">${escapeHtml(m.time || timeNow())}</div>
      `;
      chat.appendChild(el);
    });
    chat.scrollTop = chat.scrollHeight;
  } catch {
    /* ignore corrupt history */
  }
}

loadChat();

async function send(text) {
  const msg = text.trim();
  if (!msg || sending) return;

  addMessage(msg, "user");
  input.value = "";

  setComposerBusy(true);
  const typing = addTyping();

  try {
    const reply = await fetchAiReply(msg);
    typing.remove();
    addMessage(reply, "bot");
  } catch (err) {
    typing.remove();
    addMessage(resolveBotError(err), "bot");
  } finally {
    setComposerBusy(false);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  send(input.value);
});

document.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip || sending) return;
  const label = (chip.textContent || "").trim();
  send(label || chip.dataset.q || "");
});
