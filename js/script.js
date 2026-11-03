// Jam WIB (UTC+7) di bagian atas halaman
(function () {
  var el = document.getElementById("clock");
  function tick() {
    var wib = new Date(Date.now() + new Date().getTimezoneOffset() * 60000 + 7 * 3600000);
    var p = function (n) { return String(n).padStart(2, "0"); };
    el.textContent = p(wib.getHours()) + ":" + p(wib.getMinutes()) + ":" + p(wib.getSeconds());
  }
  tick();
  setInterval(tick, 1000);
})();

// Tandai chip navigasi sesuai bagian yang sedang dilihat
(function () {
  var links = document.querySelectorAll(".flow .chip");
  var map = {};
  links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
  if (!("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        links.forEach(function (a) { a.classList.remove("is-active"); });
        map[e.target.id].classList.add("is-active");
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  Object.keys(map).forEach(function (id) {
    var s = document.getElementById(id);
    if (s) io.observe(s);
  });
})();
