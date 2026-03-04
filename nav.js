document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("navbar-container");
  if (!el) return;

  fetch("navigation.html")
    .then((res) => {
      if (!res.ok) throw new Error("Navbar file not found: " + res.status);
      return res.text();
    })
    .then((html) => {
      el.innerHTML = html;
    })
    .catch((err) => {
      console.error(err);
      el.innerHTML = "<div style='padding:10px'>لم يتم تحميل شريط التنقل</div>";
    });
});