(function () {
  try {
    const savedTheme = localStorage.getItem("walajna_theme") || "light";
    if (savedTheme === "dark") {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  } catch {
    // fail silently – never break the page
  }
})();

