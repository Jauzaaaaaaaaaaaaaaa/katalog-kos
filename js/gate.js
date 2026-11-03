/* Halaman awal: pilih Admin atau Client */
(function () {
  "use strict";
  var cfg = window.KOS_CONFIG || {};
  var ok = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  document.getElementById("banner").hidden = ok;

  var form = document.getElementById("gForm"), inp = document.getElementById("gUser");
  var err = form.querySelector('[data-err="g"]');
  inp.addEventListener("input", function () { err.textContent = ""; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var u = inp.value.trim().toLowerCase();
    if (!u) { err.textContent = "Isi username dari admin."; inp.focus(); return; }
    if (!/^[a-z0-9][a-z0-9._-]{3,39}$/.test(u)) { err.textContent = "Format username tidak valid. Periksa lagi penulisannya."; inp.focus(); return; }
    try { sessionStorage.setItem("kos-client-u", u); } catch (x) { /* abaikan */ }
    location.href = "client.html";
  });
})();
