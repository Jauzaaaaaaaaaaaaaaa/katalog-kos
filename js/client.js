/* ============================================================
   CLIENT: masuk dengan username, tekan Mulai, lihat kos pilihan admin
   selama waktu yang diberikan, lalu sesi berakhir.
   Waktu dan data kos dijaga oleh database (fungsi client_open), bukan hanya tampilan.
   ============================================================ */
(function () {
  "use strict";
  var K = window.KOS, $ = K.$, $$ = K.$$, esc = K.esc;
  var SKEY = "kos-client-u";

  var username = "", kosList = [], endAt = 0, total = 600, tick = null, syncT = null, ended = false, started = false;
  var startDlg = $("#startDlg"), endDlg = $("#endDlg");
  var listEl = $("#cList"), mainEl = $("#cMain");

  /* ---------- username dari link atau dari halaman awal ---------- */
  (function () {
    var q = new URLSearchParams(location.search).get("u");
    var u = (q || "").trim().toLowerCase();
    try { if (u) sessionStorage.setItem(SKEY, u); else u = sessionStorage.getItem(SKEY) || ""; } catch (e) { /* abaikan */ }
    username = u;
    if (q) history.replaceState(null, "", location.pathname);   // username tidak tertinggal di alamat
  })();

  var viewer = K.initViewer({
    canEdit: function () { return false; },
    canPdf: function () { return !ended; }
  });

  /* ============================================================
     PERLINDUNGAN LAYAR (upaya terbaik, bukan jaminan mutlak)
     Browser tidak punya cara memblokir screenshot di tingkat sistem.
     Yang dilakukan: layar dihitamkan saat tombol screenshot/jendela
     kehilangan fokus, plus watermark username, plus larangan salin/cetak.
     ============================================================ */
  var root = document.documentElement, metaDown = false, shieldTimer = null;
  function cover() { root.classList.add("shielded"); }
  function uncover() {
    if (metaDown) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    root.classList.remove("shielded");
  }
  function clearClipboard() {
    try { navigator.clipboard.writeText(" ").catch(function () {}); } catch (e) { /* abaikan */ }
  }
  function protect() {
    window.addEventListener("blur", cover);
    window.addEventListener("focus", function () { metaDown = false; setTimeout(uncover, 200); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) cover(); else setTimeout(uncover, 200); });
    document.addEventListener("keydown", function (e) {
      // Win/Cmd ditahan (Win+Shift+S, Cmd+Shift+3/4/5): hitamkan SEBELUM tombol terakhir ditekan
      if (e.key === "Meta" || e.metaKey) { metaDown = true; cover(); }
      if (e.key === "PrintScreen" || e.keyCode === 44) { cover(); clearClipboard(); }
      if ((e.ctrlKey || e.metaKey) && /^[ps]$/i.test(e.key)) { e.preventDefault(); cover(); clearTimeout(shieldTimer); shieldTimer = setTimeout(uncover, 1200); }
    }, true);
    document.addEventListener("keyup", function (e) {
      if (e.key === "PrintScreen" || e.keyCode === 44) { clearClipboard(); cover(); clearTimeout(shieldTimer); shieldTimer = setTimeout(uncover, 1500); return; }
      if (e.key === "Meta" || !e.metaKey) { metaDown = false; clearTimeout(shieldTimer); shieldTimer = setTimeout(uncover, 700); }
    }, true);
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("dragstart", function (e) { e.preventDefault(); });
    document.addEventListener("copy", function (e) { e.preventDefault(); });
    document.addEventListener("cut", function (e) { e.preventDefault(); });
  }
  // Satu watermark saja (username + tanggal) di tengah layar, tipis supaya tidak mengganggu bacaan.
  function watermark(text) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="120" viewBox="0 0 560 120"><text x="280" y="68" text-anchor="middle" transform="rotate(-12 280 60)" font-family="monospace" font-size="20" font-weight="700" fill="rgba(0,0,0,0.12)">' + esc(text) + '</text></svg>';
    var img = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
    $("#wm").style.backgroundImage = img;
    root.style.setProperty("--wm", img);          // watermark yang sama juga tampil di dalam pop up
  }
  protect();

  /* ---------- tampilan ---------- */
  function skeleton() {
    var one = '<article class="kcard kcard--skel" aria-hidden="true"><div class="kcard__media"><div class="kcard__img"></div></div><div class="kcard__body"><div class="sk sk--t"></div><div class="sk"></div><div class="sk sk--s"></div><div class="sk sk--p"></div><div class="sk sk--b"></div></div></article>';
    listEl.innerHTML = one + one + one;
  }
  function showMsg(title, text, withBack) {
    $("#cHello").hidden = true;
    var m = $("#cMsg");
    m.hidden = false;
    m.innerHTML = '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' + (withBack ? '<a class="btn btn--yellow" href="index.html">Kembali ke beranda</a>' : "");
  }
  function render() {
    listEl.innerHTML = kosList.map(function (k) { return K.cardHTML(k, { admin: false }); }).join("");
  }
  function updateTimer() {
    var left = Math.max(0, (endAt - performance.now()) / 1000);
    $("#tVal").textContent = K.mmss(left);
    $("#tBar").style.width = Math.max(0, Math.min(100, left / total * 100)).toFixed(1) + "%";
    $("#timer").classList.toggle("is-low", left <= 60);
    if (left <= 0) expire();
  }

  /* ---------- sesi berjalan ---------- */
  function begin(r) {
    started = true;
    kosList = (r.kos || []).map(K.norm);
    total = Number(r.durasi) || 600;
    endAt = performance.now() + (Number(r.sisa) || 0) * 1000;
    if (startDlg.open) startDlg.close();
    mainEl.classList.remove("is-blurred");
    $("#cMsg").hidden = true;
    $("#cName").textContent = r.nama || "kamu";
    $("#cCount").textContent = kosList.length;
    $("#cHello").hidden = false;
    $("#timer").hidden = false;
    watermark(username + "  ·  " + new Date().toLocaleDateString("id-ID"));
    $("#wm").hidden = false;
    document.body.classList.add("is-session");
    render();
    updateTimer();
    clearInterval(tick); tick = setInterval(updateTimer, 250);
    clearInterval(syncT); syncT = setInterval(sync, 20000);
  }
  // sinkronkan dengan server (jam server yang berlaku)
  function sync() {
    if (ended) return;
    K.rpc("client_open", { p_username: username, p_start: false }).then(function (r) {
      if (ended) return;
      if (r.status === "selesai" || r.status === "tidak_ada") { expire(); return; }
      if (r.status === "berjalan") {
        var srv = performance.now() + Number(r.sisa) * 1000;
        if (Math.abs(srv - endAt) > 2000) endAt = srv;
        if (JSON.stringify((r.kos || []).map(function (k) { return k.id; })) !== JSON.stringify(kosList.map(function (k) { return k.id; }))) { kosList = r.kos.map(K.norm); render(); }
      }
    }).catch(function () { /* jaringan putus: tetap lanjut hitung mundur lokal */ });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && started && !ended) sync(); });

  function expire() {
    if (ended) return;
    ended = true; K.printBlocked = true;
    clearInterval(tick); clearInterval(syncT);
    viewer.closeAll();
    $$("video").forEach(function (v) { v.pause(); v.removeAttribute("src"); });
    kosList = [];
    $("#printSheet").innerHTML = "";
    $("#tVal").textContent = "00:00"; $("#tBar").style.width = "0%";
    $("#timer").classList.add("is-low");
    skeleton();                                  // isi kos dihapus dari halaman, bukan hanya diburamkan
    mainEl.classList.add("is-blurred");
    $("#cHello").hidden = true;
    if (startDlg.open) startDlg.close();
    if (!endDlg.open) endDlg.showModal();
  }
  endDlg.addEventListener("cancel", function (e) { e.preventDefault(); });
  startDlg.addEventListener("cancel", function (e) { e.preventDefault(); });

  function route(r) {
    if (r.status === "tidak_ada") {
      skeleton(); mainEl.classList.add("is-blurred");
      showMsg("Username tidak ditemukan", "Periksa lagi penulisan username, atau hubungi admin untuk username yang benar.", true);
      mainEl.classList.remove("is-blurred");
      return;
    }
    if (r.status === "selesai") { skeleton(); mainEl.classList.add("is-blurred"); ended = true; K.printBlocked = true; $("#endText").textContent = "Sesi untuk username ini sudah selesai. Hubungi admin kalau kamu masih ingin melihat kos pilihan, nanti admin bisa mengaktifkan sesi baru."; endDlg.showModal(); return; }
    if (r.status === "berjalan") { begin(r); return; }
    // menunggu: tampilkan popup, isi kos BELUM diambil
    skeleton(); mainEl.classList.add("is-blurred");
    $("#sName").textContent = r.nama || "kamu";
    $("#sMin").textContent = Math.round((Number(r.durasi) || 600) / 60);
    $$(".sMin2").forEach(function (el) { el.textContent = Math.round((Number(r.durasi) || 600) / 60); });
    $("#sJumlah").textContent = r.jumlah || 0;
    startDlg.showModal();
  }

  $("#sStart").addEventListener("click", function () {
    var b = this; b.disabled = true; $('[data-err="start"]').textContent = "";
    K.rpc("client_open", { p_username: username, p_start: true }).then(function (r) {
      if (r.status === "berjalan") begin(r); else route(r);
    }).catch(function (e) { $('[data-err="start"]').textContent = K.explain(e); }).then(function () { b.disabled = false; });
  });
  $("#sBack").addEventListener("click", function () { location.href = "index.html"; });
  $("#eBack").addEventListener("click", function () { try { sessionStorage.removeItem(SKEY); } catch (e) { /* abaikan */ } location.href = "index.html"; });

  listEl.addEventListener("click", function (e) {
    if (ended || !started) return;
    var btn = e.target.closest("[data-act]"); if (!btn) return;
    var k = kosList.filter(function (x) { return x.id === btn.closest(".kcard").dataset.id; })[0]; if (!k) return;
    if (btn.dataset.act === "photo") viewer.openLightbox(k, 0);
    if (btn.dataset.act === "info") viewer.openInfo(k);
    if (btn.dataset.act === "pdf") K.printKos(k);
  });

  /* ---------- mulai ---------- */
  if (!K.CONFIGURED) {
    skeleton(); showMsg("Database belum terhubung", "Admin perlu mengisi config.js terlebih dahulu.", true);
  } else if (!username) {
    location.replace("index.html");
  } else {
    skeleton(); mainEl.classList.add("is-blurred");
    K.rpc("client_open", { p_username: username, p_start: false }).then(route).catch(function (e) {
      mainEl.classList.remove("is-blurred");
      showMsg("Tidak bisa memuat", K.explain(e), true);
    });
  }
})();
