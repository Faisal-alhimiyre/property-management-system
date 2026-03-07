document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const aptId = params.get("id");

  const pageTitle = document.getElementById("pageTitle");
  const pageSub = document.getElementById("pageSub");
  const searchInput = document.getElementById("searchInput");

  const totalPaidEl = document.getElementById("totalPaid");
  const totalCountEl = document.getElementById("totalCount");
  const statusHintEl = document.getElementById("statusHint");

  const listEl = document.getElementById("paymentsList");
  const emptyEl = document.getElementById("emptyState");

  if (!aptId) {
    pageTitle.textContent = "لا يمكن عرض المدفوعات";
    pageSub.textContent = "لا يوجد رقم شقة في الرابط";
    return;
  }

  // Demo seed (only if empty) – remove later
  seedDemoPaymentsIfEmpty();

  const all = getPayments();
  const aptPayments = all.filter(p => p.apartmentId === aptId);

  pageTitle.textContent = `سجل المدفوعات`;
  pageSub.textContent = `الشقة: ${aptId}`;

  function render(query = "") {
    const q = query.trim().toLowerCase();

    const filtered = aptPayments.filter(p => {
      const hay = [
        p.amount,
        p.date,
        p.method,
        p.status,
        p.note
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });

    // Summary
    const paidSum = filtered
      .filter(p => p.status === "paid")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    totalPaidEl.textContent = `${paidSum.toLocaleString()} ريال`;
    totalCountEl.textContent = `${filtered.length}`;
    statusHintEl.textContent = hintStatus(filtered);

    // List
    if (!filtered.length) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";
    listEl.innerHTML = filtered
      .sort((a,b) => (b.date || "").localeCompare(a.date || "")) // newest first
      .map(p => cardHtml(p))
      .join("");
  }

  render("");

  if (searchInput) {
    searchInput.addEventListener("input", () => render(searchInput.value));
  }

  /* ---------- helpers ---------- */

  function getPayments(){
    try{
      return JSON.parse(localStorage.getItem("walajna_payments") || "[]");
    }catch{
      return [];
    }
  }

  function savePayments(arr){
    localStorage.setItem("walajna_payments", JSON.stringify(arr));
  }

  function statusMeta(status){
    if (status === "paid") return { label:"مدفوع", dot:"#16a34a" };
    if (status === "pending") return { label:"بانتظار", dot:"#f59e0b" };
    if (status === "late") return { label:"متأخر", dot:"#ef4444" };
    return { label:"غير معروف", dot:"#94a3b8" };
  }

  function cardHtml(p){
    const st = statusMeta(p.status);
    return `
      <article class="pay-card">
        <div class="row">
          <span class="k">المبلغ</span>
          <span class="v">${Number(p.amount || 0).toLocaleString()} ريال</span>
        </div>

        <div class="row">
          <span class="k">التاريخ</span>
          <span class="v">${formatDate(p.date)}</span>
        </div>

        <div class="row">
          <span class="k">الطريقة</span>
          <span class="v">${p.method || "—"}</span>
        </div>

        <div class="row">
          <span class="k">ملاحظة</span>
          <span class="v">${escapeHtml(p.note || "—")}</span>
        </div>

        <div class="row" style="margin-bottom:0;">
          <span class="badge">
            <span class="dot" style="background:${st.dot}"></span>
            ${st.label}
          </span>
          <span class="k">#${p.id || "—"}</span>
        </div>
      </article>
    `;
  }

  function hintStatus(arr){
    if (!arr.length) return "—";
    const hasLate = arr.some(p => p.status === "late");
    const hasPending = arr.some(p => p.status === "pending");
    if (hasLate) return "يوجد مدفوعات متأخرة";
    if (hasPending) return "يوجد مدفوعات بانتظار التأكيد";
    return "كل شيء تمام";
  }

  function formatDate(iso){
    if (!iso) return "—";
    // Keep it simple: YYYY-MM-DD
    return String(iso).slice(0,10);
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function seedDemoPaymentsIfEmpty(){
    const existing = getPayments();
    if (existing.length) return;

    const demo = [
      { id:"P1001", apartmentId:"A101", amount:1500, date:"2026-01-01", method:"تحويل", status:"paid", note:"إيجار يناير" },
      { id:"P1002", apartmentId:"A101", amount:1500, date:"2026-02-01", method:"مدى", status:"paid", note:"إيجار فبراير" },
      { id:"P1003", apartmentId:"A101", amount:1500, date:"2026-03-01", method:"تحويل", status:"pending", note:"بانتظار التأكيد" },

      { id:"P2001", apartmentId:"A102", amount:1600, date:"2026-02-01", method:"تحويل", status:"paid", note:"إيجار فبراير" },
      { id:"P2002", apartmentId:"A102", amount:1600, date:"2026-03-01", method:"تحويل", status:"late", note:"لم يتم السداد" }
    ];

    savePayments(demo);
  }
});