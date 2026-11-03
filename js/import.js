/* ============================================================
   IMPORT CSV (admin): unduh template + masukkan banyak kos sekaligus
   Kolom template mengikuti form tambah kos dan filter (jenis, harga, fasilitas).
   ============================================================ */
(function () {
  "use strict";
  var K = window.KOS, $ = K.$, esc = K.esc, rp = K.rp, FAC = K.FAC, explain = K.explain;
  var DELIM = ";";            // titik koma: terbuka rapi di Excel Indonesia
  var TEMPLATE_ROWS = 100;    // jumlah baris bernomor di template
  var MAX_ROWS = 500;         // batas baris per upload
  var CONC = 3;               // jumlah kos yang disimpan bersamaan
  var MAX_COVER = 5;          // maksimal foto sampul per kos (sama dengan form tambah kos)
  var IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;

  var dlg = $("#importDlg"), state = null, busy = false;

  /* ---------- Kolom template ---------- */
  var H = {
    no: "No", nama: "Nama Kos", alamat: "Alamat", maps: "Link Google Maps",
    jenis: "Jenis (putra/putri/campur)", harga: "Harga per Bulan (Rp)",
    lain: "Fasilitas Lain (pisahkan dengan koma)", pemilik: "Nama Pemilik", hp: "Nomor HP",
    pemilik2: "Nama Pemilik 2", hp2: "Nomor HP 2",
    rating: "Rating Google Maps (0-5)", kamar: "Jumlah Kamar Kosong", desk: "Deskripsi",
    foto: "Foto Sampul (nama file, pisahkan dengan koma, maks 5)"
  };
  function headers() {
    // kolom fasilitas ikut daftar terbaru (termasuk fasilitas yang ditambah lewat form kos)
    return [H.no, H.nama, H.alamat, H.maps, H.jenis, H.harga].concat(K.facAll(), [H.lain, H.pemilik, H.hp, H.pemilik2, H.hp2, H.rating, H.kamar, H.desk, H.foto]);
  }

  /* ---------- CSV: tulis ---------- */
  function cell(v) {
    v = String(v == null ? "" : v);
    return /[";\n\r,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCsv(rows) { return rows.map(function (r) { return r.map(cell).join(DELIM); }).join("\r\n"); }
  function download(name, text) {
    var blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function downloadTemplate() {
    var hd = headers(), rows = [hd];
    // baris 1: contoh (otomatis dilewati karena namanya diawali "CONTOH")
    var ex = hd.map(function () { return ""; });
    function set(name, v) { ex[hd.indexOf(name)] = v; }
    set(H.no, 1); set(H.nama, "CONTOH Kos Melati (hapus atau timpa baris ini)"); set(H.alamat, "Jl. Contoh No. 12, Semarang");
    set(H.maps, "https://maps.app.goo.gl/xxxx"); set(H.jenis, "putri"); set(H.harga, 1200000);
    ["AC", "WiFi", "Kamar mandi dalam", "Kasur"].forEach(function (f) { if (hd.indexOf(f) >= 0) set(f, "ya"); });
    set(H.lain, "Water heater, Dapur luas"); set(H.pemilik, "Bu Sari"); set(H.hp, "081234567890");
    set(H.foto, "melati-depan.jpg, melati-kamar.jpg");
    set(H.rating, "4,6"); set(H.kamar, 3); set(H.desk, "Dekat kampus, lingkungan tenang.");
    rows.push(ex);
    for (var i = 2; i <= TEMPLATE_ROWS; i++) { var r = hd.map(function () { return ""; }); r[0] = i; rows.push(r); }
    download("template-kos.csv", "sep=" + DELIM + "\r\n" + toCsv(rows));
    K.toast("Template CSV diunduh");
  }

  /* ---------- CSV: baca ---------- */
  function parseCsv(text) {
    text = String(text || "").replace(/^\ufeff/, "");
    // buang baris "sep=;" bila ada
    var first = text.split(/\r?\n/, 1)[0] || "";
    if (/^sep=.$/i.test(first.trim())) text = text.slice(first.length).replace(/^\r?\n/, "");
    // tebak pemisah dari baris pertama yang berisi
    var line = (text.split(/\r?\n/).filter(function (l) { return l.trim(); })[0]) || "";
    var best = ",", bn = -1;
    [";", ",", "\t"].forEach(function (d) { var n = line.split(d).length; if (n > bn) { bn = n; best = d; } });
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === best) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = ""; rows.push(row); row = [];
      } else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
  }

  function key(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  // petakan judul kolom -> {t: tipe, f: nama fasilitas}
  function mapHeader(h) {
    var k = key(h), all = K.facAll(), fi = all.map(key).indexOf(k);
    if (fi >= 0) return { t: "fac", f: all[fi] };
    if (k === "no" || k === "nomor" || k === "nomer") return { t: "no" };
    if (k.indexOf("foto") === 0 || k.indexOf("sampul") >= 0 || k.indexOf("gambar") === 0) return { t: "foto" };
    if (k.indexOf("fasilitaslain") === 0 || k === "lainnya") return { t: "lain" };
    if (k.indexOf("pemilik") >= 0) return { t: "pemilik" + ((k.match(/(\d+)$/) || [])[1] || "") };
    if (k.indexOf("hp") >= 0 || k.indexOf("whatsapp") >= 0 || k.indexOf("telepon") >= 0 || k === "wa") return { t: "hp" + ((k.match(/(\d+)$/) || [])[1] || "") };
    if (k.indexOf("rating") >= 0) return { t: "rating" };
    if (k.indexOf("maps") >= 0 || k.indexOf("link") >= 0) return { t: "maps" };
    if (k.indexOf("kamar") >= 0 || k.indexOf("ketersediaan") >= 0) return { t: "kamar" };
    if (k.indexOf("harga") >= 0) return { t: "harga" };
    if (k.indexOf("jenis") >= 0) return { t: "jenis" };
    if (k.indexOf("deskripsi") >= 0) return { t: "desk" };
    if (k.indexOf("alamat") >= 0) return { t: "alamat" };
    if (k.indexOf("nama") >= 0) return { t: "nama" };
    return null;
  }

  var JENIS_ALIAS = { putra: "putra", pria: "putra", cowok: "putra", lakilaki: "putra", putri: "putri", wanita: "putri", cewek: "putri", perempuan: "putri", campur: "campur", mix: "campur", campuran: "campur" };
  var YES = ["ya", "y", "x", "v", "1", "true", "ada", "yes", "ok", "\u2713", "\u2714"];

  function parseRows(grid) {
    // cari baris judul: baris pertama yang punya kolom Nama & Harga
    var hi = -1, cols = [];
    for (var i = 0; i < Math.min(grid.length, 10); i++) {
      var m = grid[i].map(mapHeader);
      var types = m.filter(Boolean).map(function (x) { return x.t; });
      if (types.indexOf("nama") >= 0 && types.indexOf("harga") >= 0) { hi = i; cols = m; break; }
    }
    if (hi < 0) return { error: "Judul kolom tidak dikenali. Pakai file dari tombol \"Template CSV\" dan jangan ubah judul kolomnya." };

    var out = [], seen = {}, existing = {};
    K.store.list.forEach(function (k) { existing[dupKey(k.nama, k.alamat)] = true; });

    for (var r = hi + 1; r < grid.length; r++) {
      var row = grid[r], v = {}, facs = [], no = "";
      cols.forEach(function (c, ci) {
        if (!c) return;
        var val = String(row[ci] == null ? "" : row[ci]).trim();
        if (c.t === "fac") { if (YES.indexOf(val.toLowerCase()) >= 0) facs.push(c.f); }
        else if (c.t === "no") no = val;
        else v[c.t] = val;
      });
      // baris kosong (hanya nomor) dilewati
      var filled = Object.keys(v).some(function (t) { return v[t] !== ""; }) || facs.length;
      if (!filled) continue;
      if (/^contoh/i.test(v.nama || "")) continue;   // baris contoh template

      var errs = [], rec = {};
      rec.nama = (v.nama || "").slice(0, 80);
      if (!rec.nama) errs.push("Nama kos kosong");
      rec.alamat = (v.alamat || "").slice(0, 160);
      rec.maps = v.maps || "";
      if (rec.maps && !K.safeUrl(rec.maps)) errs.push("Link Maps harus diawali https://");
      var ja = JENIS_ALIAS[key(v.jenis)];
      if (!ja) errs.push("Jenis harus putra / putri / campur");
      rec.jenis = ja || "campur";
      var hd = String(v.harga || "").replace(/[^0-9]/g, "");
      if (!hd) errs.push("Harga kosong / bukan angka");
      rec.harga = hd ? Number(hd) : 0;
      // fasilitas: kolom centang + fasilitas lain
      (v.lain || "").split(/[,|\n]/).forEach(function (f) {
        f = f.trim().slice(0, 40);
        if (f && facs.map(function (x) { return x.toLowerCase(); }).indexOf(f.toLowerCase()) < 0) facs.push(f);
      });
      rec.fasilitas = facs;
      // kontak pemilik: pasangan "Nama Pemilik" + "Nomor HP", lalu "... 2", "... 3", dst (jumlah bebas)
      rec.kontak = [];
      var idxs = {}; Object.keys(v).forEach(function (t) { var m = /^(?:pemilik|hp)(\d*)$/.exec(t); if (m) idxs[m[1] === "" ? 1 : Number(m[1])] = true; });
      Object.keys(idxs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
        var sfx = i === 1 ? "" : String(i), kn = (v["pemilik" + sfx] || "").slice(0, 60), kh = (v["hp" + sfx] || "").replace(/^'/, ""), khN = "";
        if (kh) { khN = K.normHp(kh); if (!khN) errs.push("Nomor HP" + (i > 1 ? " " + i : "") + " tidak valid"); }
        if (kn || khN) rec.kontak.push({ nama: kn, hp: khN || "" });
      });
      rec.pemilik = rec.kontak[0] ? rec.kontak[0].nama : ""; rec.hp = rec.kontak[0] ? rec.kontak[0].hp : "";
      rec.pemilik2 = rec.kontak[1] ? rec.kontak[1].nama : ""; rec.hp2 = rec.kontak[1] ? rec.kontak[1].hp : "";
      var rt = String(v.rating || "").replace(",", ".");
      if (rt === "") rec.rating = null;
      else if (isNaN(Number(rt)) || Number(rt) < 0 || Number(rt) > 5) { errs.push("Rating harus 0 sampai 5"); rec.rating = null; }
      else rec.rating = Number(rt);
      var km = String(v.kamar || "");
      if (km === "") rec.kamar = null;
      else if (isNaN(Number(km)) || Number(km) < 0) { errs.push("Jumlah kamar kosong harus angka 0 atau lebih"); rec.kamar = null; }
      else rec.kamar = Math.round(Number(km));
      rec.deskripsi = (v.desk || "").slice(0, 500);
      rec.foto = []; rec.media = [];
      var refs = splitRefs(v.foto), refNote = "";
      if (refs.length > MAX_COVER) { refNote = "Foto lebih dari " + MAX_COVER + ", hanya " + MAX_COVER + " pertama dipakai"; refs = refs.slice(0, MAX_COVER); }

      var dk = dupKey(rec.nama, rec.alamat), dup = "";
      if (!errs.length) {
        if (existing[dk]) dup = "Sudah ada di website";
        else if (seen[dk]) dup = "Dobel di file ini (baris " + seen[dk] + ")";
        if (!seen[dk]) seen[dk] = no || (r + 1);
      }
      out.push({ line: r + 1, no: no || String(out.length + 1), rec: rec, errs: errs, dup: dup, refs: refs, refNote: refNote });
      if (out.length > MAX_ROWS) return { error: "Maksimal " + MAX_ROWS + " kos per upload. Pecah file menjadi beberapa bagian." };
    }
    return { rows: out };
  }
  /* ---------- Foto sampul: nama file / link ---------- */
  function splitRefs(raw) {
    return String(raw || "").split(/[,|\n\r]+/).map(function (t) { return t.trim().replace(/^["']+|["']+$/g, ""); }).filter(Boolean).map(function (t) {
      if (/^https?:\/\//i.test(t)) return { url: t, label: t };
      var name = t.split(/[\\/]/).pop();
      return { name: name, label: name };
    });
  }
  function baseName(n) { return String(n || "").toLowerCase().replace(/\.[a-z0-9]+$/, ""); }
  function findFile(name) {
    if (!state || !state.files) return null;
    var f = state.files[String(name).toLowerCase()];
    if (f) return f;
    // cocokkan tanpa ekstensi (mis. CSV tertulis "melati" tetapi filenya melati.jpg)
    var b = baseName(name), hit = null;
    Object.keys(state.files).some(function (k) { if (baseName(k) === b) { hit = state.files[k]; return true; } return false; });
    return hit;
  }
  // status foto satu baris: berapa yang siap, mana yang belum dipilih
  function photoStatus(x) {
    var st = { total: x.refs.length, ready: 0, missing: [] };
    x.refs.forEach(function (rf) { if (rf.url || findFile(rf.name)) st.ready++; else st.missing.push(rf.label); });
    return st;
  }
  function addFiles(list) {
    if (!state) return;
    state.files = state.files || {};
    Array.prototype.forEach.call(list || [], function (f) {
      if (!f || !(IMG_RE.test(f.name || "") || (f.type || "").indexOf("image/") === 0)) return;
      var k = f.name.toLowerCase();
      if (!state.files[k]) state.files[k] = f;
    });
    renderPreview();
  }
  function dupKey(n, a) { return key(n) + "|" + key(a); }

  /* ---------- Pratinjau ---------- */
  function counts() {
    var inc = $("#impDup").checked, c = { total: state.rows.length, ok: 0, dup: 0, err: 0 };
    state.rows.forEach(function (x) { if (x.errs.length) c.err++; else if (x.dup) { c.dup++; if (inc) c.ok++; } else c.ok++; });
    return c;
  }
  function importable() {
    var inc = $("#impDup").checked;
    return state.rows.filter(function (x) { return !x.errs.length && (!x.dup || inc); });
  }
  function renderPreview() {
    var c = counts(), now = K.store.list.length, anyRefs = false, noPhoto = 0;
    state.rows.forEach(function (x) { if (x.refs.length) anyRefs = true; });
    importable().forEach(function (x) { if (x.refs.length && photoStatus(x).missing.length) noPhoto++; });
    $("#impSum").innerHTML =
      '<span class="imp__chip">Terisi <b>' + c.total + '</b></span>' +
      '<span class="imp__chip imp__chip--ok">Siap masuk <b>' + c.ok + '</b></span>' +
      (c.dup ? '<span class="imp__chip imp__chip--dup">Duplikat <b>' + c.dup + '</b></span>' : "") +
      (c.err ? '<span class="imp__chip imp__chip--err">Error <b>' + c.err + '</b></span>' : "") +
      (noPhoto ? '<span class="imp__chip imp__chip--dup">Foto belum dipilih <b>' + noPhoto + '</b></span>' : "");
    $("#impPhotoBox").hidden = !anyRefs;
    $("#impPhotoSum").textContent = Object.keys((state && state.files) || {}).length + " file foto terpilih";
    $("#impNote").innerHTML = "Kos di website sekarang: <b>" + now + "</b>. Setelah import: <b>" + (now + c.ok) + "</b>.";
    $("#impDupWrap").hidden = !c.dup;
    $("#impTable").innerHTML =
      "<thead><tr><th>No</th><th>Nama kos</th><th>Jenis</th><th>Harga</th><th>Fasilitas</th><th>Foto</th><th>Status</th></tr></thead><tbody>" +
      state.rows.map(function (x) {
        var cls = x.errs.length ? "is-err" : (x.dup && !$("#impDup").checked ? "is-dup" : "is-ok");
        var st = x.errs.length ? x.errs.join("; ") : (x.dup ? x.dup + ($("#impDup").checked ? " (tetap dimasukkan)" : " (dilewati)") : "Siap");
        return '<tr class="' + cls + '"><td>' + esc(x.no) + '</td><td>' + esc(x.rec.nama || "-") + '</td><td>' + esc(K.JENIS[x.rec.jenis] || "-") +
          '</td><td>' + (x.rec.harga ? rp(x.rec.harga) : "-") + '</td><td>' + x.rec.fasilitas.length + '</td><td>' + photoCell(x) + '</td><td>' + esc(st) + '</td></tr>';
      }).join("") + "</tbody>";
    var n = c.ok;
    $("#impGo").textContent = n ? "Masukkan " + n + " kos" : "Tidak ada yang bisa dimasukkan";
    $("#impGo").disabled = busy || !n;
  }

  function photoCell(x) {
    if (!x.refs.length) return "-";
    var ps = photoStatus(x);
    if (!ps.missing.length) return esc(ps.ready + " siap") + (x.refNote ? ' <span title="' + esc(x.refNote) + '">*</span>' : "");
    return '<span title="Belum dipilih: ' + esc(ps.missing.join(", ")) + '">' + ps.ready + " dari " + ps.total + '<br><small>kurang: ' + esc(ps.missing.slice(0, 2).join(", ")) + (ps.missing.length > 2 ? " ..." : "") + '</small></span>';
  }
  function setErr(m) { $('[data-err="impErr"]').textContent = m || ""; }

  function openPreview(file, grid) {
    var res = parseRows(grid);
    state = { rows: [], files: {} };
    $("#impFile").textContent = "File: " + file.name;
    $("#impDup").checked = false; $("#impProg").hidden = true; setErr("");
    if (res.error) {
      $("#impSum").innerHTML = ""; $("#impNote").textContent = ""; $("#impTable").innerHTML = ""; $("#impDupWrap").hidden = true;
      setErr(res.error); $("#impGo").textContent = "Masukkan"; $("#impGo").disabled = true;
    } else if (!res.rows.length) {
      $("#impSum").innerHTML = ""; $("#impNote").textContent = ""; $("#impTable").innerHTML = ""; $("#impDupWrap").hidden = true;
      setErr("Tidak ada baris kos yang terisi. Isi minimal Nama Kos, Jenis, dan Harga, lalu simpan sebagai CSV.");
      $("#impGo").textContent = "Masukkan"; $("#impGo").disabled = true;
    } else { state.rows = res.rows; renderPreview(); }
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- Simpan ke database ---------- */
  // Ambil gambar satu rujukan foto (file yang dipilih atau link), kecilkan, kembalikan Blob. null = dilewati.
  function coverBlob(rf, x, warns) {
    var tag = "No " + x.no + ": ";
    if (rf.url) {
      return fetch(rf.url).then(function (r) { if (!r.ok) throw new Error("http"); return r.blob(); })
        .then(function (b) { return K.resizeToBlob(b, 1400, 0.82); })
        .catch(function () { warns.push(tag + "link foto tidak bisa diambil browser (" + rf.label.slice(0, 40) + "). Unduh fotonya lalu tulis nama filenya di CSV."); return null; });
    }
    var f = findFile(rf.name);
    if (!f) { warns.push(tag + "file \"" + rf.label + "\" tidak dipilih."); return Promise.resolve(null); }
    return K.resizeToBlob(f, 1400, 0.82).catch(function () { warns.push(tag + "\"" + rf.label + "\" tidak bisa dibaca sebagai gambar."); return null; });
  }
  // Unggah semua foto sampul satu kos secara berurutan. Gagal unggah = kos ini gagal (bisa dicoba lagi).
  function uploadCovers(x, id, uploaded, warns) {
    var urls = [], chain = Promise.resolve();
    x.refs.forEach(function (rf) {
      chain = chain.then(function () {
        return coverBlob(rf, x, warns).then(function (blob) {
          if (!blob) return;
          var path = id + "/c-" + Math.random().toString(36).slice(2, 9) + ".jpg";
          return K.api.upload(path, blob, null, "image/jpeg").then(function (u) { uploaded.push(path); urls.push(u); });
        });
      });
    });
    return chain.then(function () { return urls; });
  }

  function runImport() {
    var list = importable(); if (!list.length || busy) return;
    busy = true; setErr("");
    $("#impGo").disabled = true; $("#impCancel").disabled = true; $("#impDup").disabled = true;
    $("#impPhotoFile").disabled = true; $("#impPhotoDir").disabled = true;
    $("#impProg").hidden = false;
    var done = 0, ok = 0, fails = [], warns = [], idx = 0, total = list.length, okLines = {};
    function upd() {
      $("#impBar").style.width = Math.round(done / total * 100) + "%";
      $("#impProgTxt").textContent = "Menyimpan " + done + " / " + total + " kos (foto ikut diunggah)... jangan tutup jendela ini.";
    }
    upd();
    function worker() {
      if (idx >= list.length) return Promise.resolve();
      var i = idx++, x = list[i], id = K.newId("k") + i.toString(36), rec = Object.assign({}, x.rec, { id: id }), uploaded = [];
      return uploadCovers(x, id, uploaded, warns)
        .then(function (urls) { rec.foto = urls; return K.api.save(rec); })
        .then(function () { ok++; okLines[x.line] = true; return K.registerFacs(rec.fasilitas); })
        .catch(function (e) { K.api.removeFiles(uploaded); fails.push("No " + x.no + " (" + x.rec.nama + "): " + explain(e)); })
        .then(function () { done++; upd(); return worker(); });
    }
    var ws = []; for (var w = 0; w < Math.min(CONC, total); w++) ws.push(worker());
    Promise.all(ws).then(function () {
      busy = false; $("#impCancel").disabled = false; $("#impDup").disabled = false;
      $("#impPhotoFile").disabled = false; $("#impPhotoDir").disabled = false;
      var reload = K.views.katalog && K.views.katalog.reload ? K.views.katalog.reload() : Promise.resolve();
      return Promise.resolve(reload).then(function () {
        if (!fails.length && !warns.length) { dlg.close(); K.toast(ok + " kos berhasil ditambahkan"); return; }
        // sebagian gagal / ada catatan foto: buang yang sudah berhasil, sisakan yang gagal agar bisa dicoba lagi
        state.rows = state.rows.filter(function (x) { return !okLines[x.line]; });
        renderPreview();
        $("#impProg").hidden = true;
        var msg = ok + " kos berhasil masuk" + (fails.length ? ", " + fails.length + " gagal. " + fails.slice(0, 5).join(" | ") + (fails.length > 5 ? " ..." : "") + " Tombol di bawah mencoba memasukkan yang gagal lagi." : ".");
        if (warns.length) msg += " Catatan foto (kos tetap masuk, foto bisa ditambah lewat Edit): " + warns.slice(0, 5).join(" | ") + (warns.length > 5 ? " ..." : "");
        setErr(msg);
      });
    });
  }

  /* ---------- Tombol ---------- */
  $("#tplBtn").addEventListener("click", downloadTemplate);
  $("#csvBtn").addEventListener("click", function () {
    if (!K.canEdit()) return;
    $("#csvFile").click();
  });
  $("#csvFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (!/\.csv$|\.txt$/i.test(f.name) && f.type.indexOf("text") !== 0) { K.toast("File harus berformat .csv"); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var grid = parseCsv(rd.result);
      // pastikan daftar kos terbaru dimuat agar deteksi duplikat akurat
      (K.store.loaded ? Promise.resolve() : K.loadKos()).catch(function () { /* lanjut tanpa deteksi duplikat server */ })
        .then(function () { openPreview(f, grid); });
    };
    rd.onerror = function () { K.toast("File tidak bisa dibaca"); };
    rd.readAsText(f, "utf-8");
  });
  $("#impPhotoFile").addEventListener("change", function (e) { var l = Array.prototype.slice.call(e.target.files); e.target.value = ""; addFiles(l); });
  $("#impPhotoDir").addEventListener("change", function (e) { var l = Array.prototype.slice.call(e.target.files); e.target.value = ""; addFiles(l); });
  $("#impDup").addEventListener("change", function () { if (state) renderPreview(); });
  $("#impGo").addEventListener("click", runImport);
  Array.prototype.forEach.call(dlg.querySelectorAll("[data-close]"), function (b) { b.addEventListener("click", function () { if (!busy) dlg.close(); }); });
  dlg.addEventListener("cancel", function (e) { if (busy) e.preventDefault(); });
})();
