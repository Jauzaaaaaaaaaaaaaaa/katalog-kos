/* ============================================================
   PENGAWASAN (admin): siapa yang sedang melihat kos, sisa waktu, riwayat harian
   ============================================================ */
(function () {
  "use strict";
  var K = window.KOS, $ = K.$, $$ = K.$$, esc = K.esc, rp = K.rp, explain = K.explain, JENIS = K.JENIS;

  var S = { logs: [], clients: [], offset: 0, loaded: false, all: false, date: "" };
  var active = false;

  function nowMs() { return Date.now() + S.offset; }
  function ymd(d) { d = new Date(d); return d.getFullYear() + "-" + K.pad2(d.getMonth() + 1) + "-" + K.pad2(d.getDate()); }
  function hm(iso) { var d = new Date(iso); return K.pad2(d.getHours()) + ":" + K.pad2(d.getMinutes()); }
  function dayLabel(key) {
    var p = key.split("-"), d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function exp(l) { return Date.parse(l.expires_at); }
  function kosNames(l) { return (Array.isArray(l.kos) ? l.kos : []).map(function (k) { return k.nama; }); }
  function chips(names) { return '<ul class="chips">' + names.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>"; }

  function setStatus(msg, retry) {
    var el = $("#pStatus");
    el.hidden = !msg;
    el.innerHTML = msg ? esc(msg) + (retry ? ' <button type="button" class="linkbtn" id="pRetry">Coba lagi</button>' : "") : "";
  }
  $("#pStatus").addEventListener("click", function (e) { if (e.target.id === "pRetry") refresh(false); });

  function render() {
    var now = nowMs(), today = ymd(now);
    var live = S.logs.filter(function (l) { return exp(l) > now; }).sort(function (a, b) { return exp(a) - exp(b); });
    var done = S.logs.filter(function (l) { return exp(l) <= now; });
    var wait = S.clients.filter(function (c) { return !c.started_at; });
    var todayLogs = S.logs.filter(function (l) { return ymd(l.started_at) === today; });
    var todayDone = todayLogs.filter(function (l) { return exp(l) <= now; });

    $("#pStats").innerHTML =
      '<div class="stat stat--run"><b>' + live.length + '</b><span>Sedang berjalan</span></div>' +
      '<div class="stat stat--wait"><b>' + wait.length + '</b><span>Menunggu dimulai</span></div>' +
      '<div class="stat"><b>' + todayDone.length + '</b><span>Selesai hari ini</span></div>' +
      '<div class="stat"><b>' + todayLogs.length + '</b><span>Total sesi hari ini</span></div>';

    $("#pLive").innerHTML = live.map(function (l) {
      var total = (exp(l) - Date.parse(l.started_at)) / 1000, left = (exp(l) - now) / 1000;
      return '<article class="prow prow--run" data-exp="' + exp(l) + '" data-total="' + total + '">' +
        '<div class="prow__who"><span class="dot dot--run"></span><div><h3>' + esc(l.nama || "Tanpa nama") + '</h3><p>' + esc(l.username) + ' · mulai ' + esc(hm(l.started_at)) + '</p></div></div>' +
        '<div class="prow__time"><b class="cd">' + K.mmss(left) + '</b><span>sisa waktu</span></div>' +
        '<div class="pbar"><i style="width:' + Math.max(0, Math.min(100, left / total * 100)).toFixed(1) + '%"></i></div>' +
        '<div class="prow__kos"><span class="lbl">SEDANG MELIHAT</span>' + chips(kosNames(l)) + '</div></article>';
    }).join("");
    $("#pLiveEmpty").hidden = live.length > 0;

    $("#pWait").innerHTML = wait.map(function (c) {
      return '<article class="prow prow--wait"><div class="prow__who"><span class="dot dot--wait"></span><div><h3>' + esc(c.nama || "Tanpa nama") + '</h3><p>' + esc(c.username) + '</p></div></div>' +
        '<div class="prow__kos"><span class="lbl">USERNAME BELUM DIPAKAI</span>' + chips((Array.isArray(c.kos) ? c.kos : []).map(function (k) { return k.nama; })) + '</div></article>';
    }).join("");
    $("#pWaitEmpty").hidden = wait.length > 0;

    // riwayat
    var key = S.all ? null : S.date;
    var rows = S.logs.filter(function (l) { return exp(l) <= now && (!key || ymd(l.started_at) === key); });
    var groups = {}, order = [];
    rows.forEach(function (l) { var d = ymd(l.started_at); if (!groups[d]) { groups[d] = []; order.push(d); } groups[d].push(l); });
    order.sort().reverse();
    $("#pHist").innerHTML = order.map(function (d) {
      var g = groups[d], who = {}; g.forEach(function (l) { who[l.username] = 1; });
      return '<section class="hday"><h3>' + esc(dayLabel(d)) + ' <small>' + g.length + ' sesi · ' + Object.keys(who).length + ' client</small></h3>' +
        g.map(function (l) {
          return '<div class="hrow"><span class="hrow__t">' + esc(hm(l.started_at)) + ' - ' + esc(hm(l.expires_at)) + '</span>' +
            '<div class="hrow__who"><b>' + esc(l.nama || "Tanpa nama") + '</b><small>' + esc(l.username) + '</small></div>' +
            '<div class="hrow__kos">' + chips(kosNames(l)) + '</div><span class="pill pill--done">SELESAI</span></div>';
        }).join("") + '</section>';
    }).join("");
    $("#pHistEmpty").hidden = rows.length > 0 || !S.loaded;
    $("#pHistEmpty").textContent = S.all ? "Belum ada riwayat sesi." : "Tidak ada sesi selesai pada tanggal ini.";
    $("#pAll").setAttribute("aria-pressed", String(S.all));
    $("#pCsv").disabled = rows.length === 0;
  }

  function refresh(silent) {
    if (!silent) setStatus("Memuat data pengawasan...", false);
    return Promise.all([K.logs.list(), K.clients.list(), K.serverOffset()]).then(function (r) {
      S.logs = r[0]; S.clients = r[1]; S.offset = r[2]; S.loaded = true; setStatus("", false); render();
    }).catch(function (e) {
      if (/Sesi login habis/.test(e.message || "")) return;
      if (!silent || !S.loaded) { S.loaded = true; setStatus("Gagal memuat data. " + explain(e), true); render(); }
    });
  }

  // hitung mundur tiap detik; saat habis, ambil data terbaru
  setInterval(function () {
    if (!active) return;
    var now = nowMs(), over = false;
    $$("#pLive .prow").forEach(function (el) {
      var left = (Number(el.dataset.exp) - now) / 1000, total = Number(el.dataset.total);
      if (left <= 0) { over = true; return; }
      $(".cd", el).textContent = K.mmss(left);
      $(".pbar i", el).style.width = Math.max(0, Math.min(100, left / total * 100)).toFixed(1) + "%";
      el.classList.toggle("is-low", left <= 60);
    });
    if (over) refresh(true);
  }, 1000);
  setInterval(function () { if (active && document.visibilityState === "visible") refresh(true); }, 10000);

  $("#pRefresh").addEventListener("click", function () { refresh(false); });
  $("#pDate").addEventListener("input", function (e) { if (e.target.value) { S.date = e.target.value; S.all = false; render(); } });
  $("#pAll").addEventListener("click", function () { S.all = !S.all; render(); });

  /* ---------- Unduh CSV (pendataan harian) ---------- */
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $("#pCsv").addEventListener("click", function () {
    var now = nowMs(), key = S.all ? null : S.date;
    var rows = S.logs.filter(function (l) { return exp(l) <= now && (!key || ymd(l.started_at) === key); });
    var head = ["Tanggal", "Jam mulai", "Jam selesai", "Nama client", "Username", "Durasi (menit)", "Kos yang dilihat", "Jenis dicari", "Harga min", "Harga maks", "Lokasi dicari"];
    var lines = [head.map(csvCell).join(",")];
    rows.forEach(function (l) {
      var n = l.need || {};
      lines.push([ymd(l.started_at), hm(l.started_at), hm(l.expires_at), l.nama, l.username,
        Math.round((exp(l) - Date.parse(l.started_at)) / 60000), kosNames(l).join(" | "),
        n.jenis && JENIS[n.jenis] ? JENIS[n.jenis] : "", n.min || "", n.max || "", n.lokasi || ""].map(csvCell).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "riwayat-client-" + (key || "semua") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  S.date = ymd(Date.now()); $("#pDate").value = S.date;
  K.views.pantau = {
    show: function () { active = true; render(); refresh(S.loaded); },
    hide: function () { active = false; }
  };
})();
