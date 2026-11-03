/* ============================================================
   ADMIN: pintu login + pindah halaman (Katalog / Username / Pengawasan)
   ============================================================ */
(function () {
  "use strict";
  var K = window.KOS, $ = K.$, $$ = K.$$;
  var VIEWS = ["katalog", "username", "pantau"];
  var current = "";

  function showGate(msg) {
    VIEWS.forEach(function (v) { if (K.views[v] && K.views[v].hide) K.views[v].hide(); });
    current = "";
    $("#adminApp").hidden = true; $("#gate").hidden = false;
    $("#navTabs").hidden = true; $("#whoami").hidden = true; $("#logoutBtn").hidden = true;
    $("#gateNote").hidden = K.CONFIGURED;
    $("#aForm").hidden = !K.CONFIGURED;
    $('[data-err="alogin"]').textContent = msg || "";
    $$(".dlg[open]").forEach(function (d) { d.close(); });
  }
  function showApp() {
    $("#gate").hidden = true; $("#adminApp").hidden = false;
    $("#navTabs").hidden = false; $("#whoami").hidden = false; $("#logoutBtn").hidden = false;
    $("#whoami").textContent = K.email() || "pengelola";
    route();
  }
  function show(name) {
    if (name === current) return;
    if (current && K.views[current] && K.views[current].hide) K.views[current].hide();
    current = name;
    VIEWS.forEach(function (v) { $("#view-" + v).hidden = v !== name; });
    $$("#navTabs a").forEach(function (a) {
      if (a.dataset.view === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (K.views[name] && K.views[name].show) K.views[name].show();
    window.scrollTo(0, 0);
  }
  function route() {
    var h = (location.hash || "#katalog").slice(1);
    if (VIEWS.indexOf(h) < 0) h = "katalog";
    show(h);
  }
  window.addEventListener("hashchange", function () { if (K.canEdit()) route(); });

  K.hooks.auth = function () { if (!K.canEdit()) showGate("Sesi login habis. Silakan masuk lagi."); };

  $("#aForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $('[data-err="alogin"]'), btn = $("button[type=submit]", this);
    err.textContent = "";
    var email = $("#aEmail").value.trim(), pw = $("#aPass").value;
    if (!email || !pw) { err.textContent = "Isi email dan kata sandi."; return; }
    btn.disabled = true;
    K.login(email, pw).then(function () { $("#aPass").value = ""; showApp(); })
      .catch(function (ex) { err.textContent = /Failed to fetch|NetworkError|Load failed/i.test(ex.message) ? K.explain(ex) : ex.message; })
      .then(function () { btn.disabled = false; });
  });
  $("#logoutBtn").addEventListener("click", function () { K.logout(); K.toast("Kamu sudah keluar"); });

  if (K.canEdit()) showApp(); else showGate("");
})();
