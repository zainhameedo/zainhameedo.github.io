// Light/dark toggle. The stored choice wins; otherwise follow the OS.
// Same convention as js/maze.js: data-theme on <html>, "theme" in localStorage.
(function () {
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem("theme"); } catch (e) { return null; }
  }
  function store(v) {
    try { localStorage.setItem("theme", v); } catch (e) { /* private mode */ }
  }
  function isDark() {
    var t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function label(btn) { btn.textContent = isDark() ? "Light" : "Dark"; }

  var t = stored();
  if (t === "dark" || t === "light") root.setAttribute("data-theme", t);

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".mode");
    if (!btn) return;
    label(btn);
    btn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store(next);
      label(btn);
    });
  });
})();
