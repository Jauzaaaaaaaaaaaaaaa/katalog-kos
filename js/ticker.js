/* Ticker harga kos berjalan (gaya running text berita TV) */
(function () {
  "use strict";
  var K = window.KOS; if (!K || !K.store) return;
  var bar = document.getElementById("ticker"), track = document.getElementById("tkTrack");
  if (!bar || !track) return;

  var SPEED = 70; // px per detik
  var JENIS = [["putra", "PUTRA"], ["putri", "PUTRI"], ["campur", "CAMPUR"]];
  var lastSig = null, rt;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // 1150000 -> "Rp 1,15 jt"; 850000 -> "Rp 850 rb"
  function rp(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1000000) return "Rp " + (Math.round(n / 10000) / 100).toString().replace(".", ",") + " jt";
    if (n >= 1000) return "Rp " + Math.round(n / 1000) + " rb";
    return "Rp " + n;
  }

  function items(list) {
    var out = [];
    JENIS.forEach(function (j) {
      var rows = list.filter(function (k) { return k.jenis === j[0] && k.harga > 0; });
      if (!rows.length) return;
      var hs = rows.map(function (k) { return k.harga; });
      var min = Math.min.apply(null, hs), max = Math.max.apply(null, hs);
      var avg = hs.reduce(function (a, b) { return a + b; }, 0) / hs.length;
      out.push('<span class="tk__item"><b class="tk__tag tk__tag--' + j[0] + '">KOS ' + j[1] + '</b>' +
        '<span>' + rows.length + ' kos</span>' +
        '<span>harga <b>' + (min === max ? rp(min) : rp(min) + " – " + rp(max)) + '</b>/bln</span>' +
        '<span>rata-rata <b>' + rp(avg) + '</b></span></span>');
    });
    var priced = list.filter(function (k) { return k.harga > 0; });
    if (priced.length) {
      var cheap = priced.reduce(function (a, b) { return b.harga < a.harga ? b : a; });
      out.push('<span class="tk__item"><b class="tk__tag tk__tag--info">TERMURAH</b><span>' + esc(cheap.nama) + '</span><span><b>' + rp(cheap.harga) + '</b>/bln</span></span>');
      out.push('<span class="tk__item"><b class="tk__tag tk__tag--info">TOTAL</b><span><b>' + list.length + '</b> kos terdata</span></span>');
    }
    return out;
  }

  function build(list) {
    var it = items(list);
    if (!it.length) { bar.hidden = true; return; }
    var set = it.join('<i class="tk__sep" aria-hidden="true">◆</i>') + '<i class="tk__sep" aria-hidden="true">◆</i>';
    bar.hidden = false;
    track.style.animation = "none";
    track.innerHTML = '<div class="tk__grp">' + set + '</div>';
    var w = track.firstChild.getBoundingClientRect().width || 1;
    var rep = Math.max(1, Math.ceil((bar.clientWidth + 40) / w));
    var grp = new Array(rep + 1).join(set);
    track.innerHTML = '<div class="tk__grp">' + grp + '</div><div class="tk__grp" aria-hidden="true">' + grp + '</div>';
    var full = track.firstChild.getBoundingClientRect().width;
    track.style.setProperty("--tk-dur", Math.max(12, full / SPEED) + "s");
    void track.offsetWidth;
    track.style.animation = "";
  }

  function sig(list) { return list.map(function (k) { return k.id + ":" + k.jenis + ":" + k.harga + ":" + k.nama; }).join("|"); }

  function tick() {
    if (!K.store.loaded) return;
    var s = sig(K.store.list);
    if (s !== lastSig) { lastSig = s; build(K.store.list); }
  }

  setInterval(tick, 1500);
  tick();
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { lastSig = null; tick(); }, 250); });
})();
