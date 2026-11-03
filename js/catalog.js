/* ============================================================
   KATALOG (admin): daftar kos, cari, filter, tambah / edit / hapus
   ============================================================ */
(function () {
  "use strict";
  var K = window.KOS, $ = K.$, $$ = K.$$, esc = K.esc, rp = K.rp, norm = K.norm, api = K.api, store = K.store;
  var FAC = K.FAC, JENIS = K.JENIS, explain = K.explain;
  var MAX_PHOTOS = 5, MAX_MEDIA = 12, MAX_VIDEO_MB = 50;
  var ICON_PLAY = K.ICON.play;
  var VID_EXT = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mkv: "video/x-matroska" };
  var IMG_EXT = /^(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/;
  function extOf(f) { return ((f.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function isVideo(f) { return (f.type || "").indexOf("video/") === 0 || !!VID_EXT[extOf(f)]; }
  function isImage(f) { return (f.type || "").indexOf("image/") === 0 || IMG_EXT.test(extOf(f)); }

  var PMAX = 3000000, STEP = 50000;
  var st = { q: "", jenis: "semua", min: 0, max: PMAX, fac: {}, sort: "baru" };
  var active = false;

  var VIEWS = ["besar", "sedang", "kecil", "detail"];
  var viewMode = "besar";
  try { var sv = localStorage.getItem("kos_admin_view"); if (VIEWS.indexOf(sv) >= 0) viewMode = sv; } catch (e) {}
  var coverBusy = {}, coverTarget = null;

  var listEl = $("#list"), emptyEl = $("#empty"), countEl = $("#count"), statusEl = $("#status");
  var panel = $("#filterPanel"), pmin = $("#pmin"), pmax = $("#pmax");
  var dlg = $("#editDlg"), form = $("#editForm"), delDlg = $("#delDlg");

  var viewer = K.initViewer({
    canEdit: function () { return K.canEdit(); },
    onEdit: function (id) { openEdit(id); }
  });

  function setBounds() {
    var top = store.list.reduce(function (m, k) { return Math.max(m, Number(k.harga) || 0); }, 0);
    var oldP = PMAX, wasOpen = st.max >= oldP;
    PMAX = Math.max(3000000, Math.ceil(top / 500000) * 500000);
    pmin.max = pmax.max = PMAX; pmin.step = pmax.step = STEP;
    if (wasOpen || st.max > PMAX) st.max = PMAX;
    if (st.min > st.max) st.min = st.max;
  }

  // Daftar fasilitas (filter + form) dibangun dari K.facAll(): bawaan + database + yang sudah dipakai kos.
  // Dibangun ulang hanya bila daftarnya berubah, supaya kotak filter tidak kehilangan fokus saat render.
  var facSig = "";
  function buildFacLists() {
    var all = K.facAll(), sig = all.join("\u0001");
    if (sig === facSig) return;
    facSig = sig;
    $("#facFilters").innerHTML = all.map(function (f) {
      return '<label class="row"><input type="checkbox" value="' + esc(f) + '"> ' + esc(f) + '</label>';
    }).join("");
    $("#fFac").innerHTML = all.map(function (f) {
      return '<label class="facchk"><input type="checkbox" value="' + esc(f) + '"><span>' + esc(f) + '</span></label>';
    }).join("");
    if (typeof applyFacSearch === "function") applyFacSearch();
  }
  // Pencarian fasilitas: "a" -> AC, Air panas, ... (awal nama atau awal salah satu kata)
  function applyFacSearch() {
    [["#facFilters", "#facFilterQ", "#facFilterNone"], ["#fFac", "#fFacQ", "#fFacNone"]].forEach(function (g) {
      var q = $(g[1]).value, n = 0;
      $$("label", $(g[0])).forEach(function (l) {
        var show = K.facMatch(l.querySelector("input").value, q);
        l.hidden = !show; if (show) n++;
      });
      $(g[2]).hidden = n > 0;
    });
  }
  $("#facFilterQ").addEventListener("input", applyFacSearch);
  $("#fFacQ").addEventListener("input", applyFacSearch);
  $("#facFilterQ").addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
  $("#fFacQ").addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
  buildFacLists();

  function activeCount() {
    var n = 0;
    if (st.jenis !== "semua") n++;
    if (st.min > 0) n++;
    if (st.max < PMAX) n++;
    return n + Object.keys(st.fac).length;
  }

  function filtered() {
    var q = st.q.trim().toLowerCase();
    var need = Object.keys(st.fac);
    var out = store.list.filter(function (k) {
      if (st.jenis !== "semua" && k.jenis !== st.jenis) return false;
      if (k.harga < st.min) return false;
      if (st.max < PMAX && k.harga > st.max) return false;
      for (var i = 0; i < need.length; i++) if (!K.hasFac(k, need[i])) return false;
      if (q && (k.nama + " " + k.alamat + " " + JENIS[k.jenis] + " " + k.fasilitas.join(" ")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (st.sort === "murah") out.sort(function (a, b) { return a.harga - b.harga; });
    if (st.sort === "mahal") out.sort(function (a, b) { return b.harga - a.harga; });
    if (st.sort === "nama") out.sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); });
    if (st.sort === "rating") out.sort(function (a, b) { return (b.rating === null ? -1 : b.rating) - (a.rating === null ? -1 : a.rating); });
    return out;
  }

  function syncControls() {
    $$("#chips .chipbtn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.jenis === st.jenis)); });
    $$("#filterForm [name=jenis]").forEach(function (r) { r.checked = r.value === st.jenis; });
    pmin.value = st.min; pmax.value = st.max;
    $("#pminOut").textContent = rp(st.min);
    $("#pmaxOut").textContent = st.max >= PMAX ? "Tanpa batas" : rp(st.max);
    $$("#facFilters input").forEach(function (c) { c.checked = !!st.fac[c.value]; });
    var n = activeCount(), fc = $("#fcount");
    fc.textContent = n; fc.hidden = n === 0;
  }

  function render() {
    setBounds();
    buildFacLists();
    // buang pilihan filter untuk fasilitas yang sudah tidak ada
    var known = K.facAll().map(function (f) { return f.toLowerCase(); });
    Object.keys(st.fac).forEach(function (f) { if (known.indexOf(f.toLowerCase()) < 0) delete st.fac[f]; });
    syncControls();
    var rows = filtered();
    listEl.className = "list list--" + viewMode;
    $$("#viewSw button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === viewMode)); });
    listEl.innerHTML = rows.map(function (k) { return viewMode === "detail" ? rowHTML(k) : K.cardHTML(k, { admin: true }); }).join("");
    listEl.hidden = rows.length === 0;
    if (!store.loaded) { countEl.textContent = ""; emptyEl.hidden = true; return; }
    countEl.textContent = rows.length + " dari " + store.list.length + " kos";
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) {
      if (!store.list.length) {
        $("#emptyTitle").textContent = "Belum ada kos";
        $("#emptyText").textContent = "Tambahkan kos pertama kamu untuk mulai.";
        $("#emptyBtn").textContent = "+ Tambah kos"; $("#emptyBtn").dataset.mode = "add";
      } else {
        $("#emptyTitle").textContent = "Tidak ada kos yang cocok";
        $("#emptyText").textContent = "Coba longgarkan filter atau hapus kata pencarian.";
        $("#emptyBtn").textContent = "Reset filter"; $("#emptyBtn").dataset.mode = "reset";
      }
    }
  }

  /* ----- tampilan Detail (daftar) + tombol Foto sampul ----- */
  function rowHTML(k) {
    var n = k.foto.length, busy = !!coverBusy[k.id], full = n >= MAX_PHOTOS;
    var av = K.availState(k);
    return '<article class="krow' + (av === "unknown" ? "" : " krow--" + av) + (n ? "" : " krow--nofoto") + '" data-id="' + esc(k.id) + '">' +
      '<button type="button" class="krow__img" data-act="photo" ' + (n ? "" : "disabled ") + 'aria-label="' + (n ? "Perbesar foto " : "Belum ada foto ") + esc(k.nama) + '">' + K.photo(k, 0) + '</button>' +
      '<div class="krow__main">' +
        '<h2>' + esc(k.nama) + '</h2>' +
        '<p class="krow__addr">' + esc(k.alamat || "Alamat belum diisi") + '</p>' +
        '<p class="krow__meta"><span class="jenis jenis--' + k.jenis + '">' + JENIS[k.jenis] + '</span>' +
          '<b class="krow__price">' + rp(k.harga) + '<small>/bln</small></b>' +
          '<span class="krow__fcount' + (n ? "" : " is-empty") + '">' + (n ? n + " / " + MAX_PHOTOS + " foto sampul" : "Belum ada foto sampul") + '</span></p>' +
      '</div>' +
      '<div class="krow__acts">' +
        '<button type="button" class="btn btn--pink btn--sm krow__cover" data-act="cover"' + (busy || full ? " disabled" : "") + ' title="' + (full ? "Sudah " + MAX_PHOTOS + " foto. Hapus lewat Edit dulu." : "Pilih foto, langsung tersimpan") + '">' +
          (busy ? "Mengunggah..." : (full ? "Foto penuh" : (n ? "+ Foto sampul" : "Foto sampul"))) + '</button>' +
        '<button type="button" class="btn btn--yellow btn--sm" data-act="edit">Edit</button>' +
        '<button type="button" class="btn btn--cyan btn--sm" data-act="info">Info</button>' +
        '<button type="button" class="btn btn--danger btn--sm" data-act="del">Hapus</button>' +
      '</div></article>';
  }

  function addCovers(k, files) {
    if (!K.canEdit() || !k || coverBusy[k.id]) return;
    files = files.filter(isImage);
    if (!files.length) { K.toast("Pilih file foto (JPG, PNG, WEBP)."); return; }
    var room = MAX_PHOTOS - k.foto.length;
    if (room <= 0) { K.toast("Sudah " + MAX_PHOTOS + " foto sampul. Hapus dulu lewat Edit."); return; }
    var skipped = files.length > room; files = files.slice(0, room);
    coverBusy[k.id] = true; render();
    var uploaded = [], failed = 0;
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        return K.resizeToBlob(f, 1400, 0.82).then(function (b) {
          var path = k.id + "/c-" + Math.random().toString(36).slice(2, 9) + ".jpg";
          return api.upload(path, b, null, "image/jpeg").then(function (url) { uploaded.push({ path: path, url: url }); });
        }).catch(function (e) { failed++; if (e && e.storage) throw e; });
      });
    });
    chain.then(function () {
      if (!uploaded.length) throw new Error("Foto tidak bisa dibaca.");
      var cur = K.byId(k.id) || k;
      var rec = Object.assign({}, cur);
      rec.foto = cur.foto.concat(uploaded.map(function (u) { return u.url; })).slice(0, MAX_PHOTOS);
      return api.save(rec).then(function () {
        cur.foto = rec.foto;
        K.toast(uploaded.length + " foto sampul disimpan" + (skipped ? " (sisanya melebihi batas " + MAX_PHOTOS + ")" : "") + (failed ? ", " + failed + " gagal dibaca" : ""));
      });
    }).catch(function (e) {
      api.removeFiles(uploaded.map(function (u) { return u.path; }));
      K.toast("Gagal mengunggah. " + explain(e));
    }).then(function () { delete coverBusy[k.id]; render(); });
  }
  $("#coverFile").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = "";
    var k = coverTarget; coverTarget = null;
    if (k && files.length) addCovers(k, files);
  });
  // seret foto langsung ke baris kos (tampilan Detail)
  listEl.addEventListener("dragover", function (e) {
    var r = e.target.closest(".krow"); if (!r || !K.canEdit()) return;
    e.preventDefault(); r.classList.add("is-drop");
  });
  listEl.addEventListener("dragleave", function (e) { var r = e.target.closest(".krow"); if (r && !r.contains(e.relatedTarget)) r.classList.remove("is-drop"); });
  listEl.addEventListener("drop", function (e) {
    var r = e.target.closest(".krow"); if (!r) return;
    e.preventDefault(); r.classList.remove("is-drop");
    addCovers(K.byId(r.dataset.id), Array.prototype.slice.call(e.dataTransfer.files || []));
  });

  $("#viewSw").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    viewMode = b.dataset.v;
    try { localStorage.setItem("kos_admin_view", viewMode); } catch (x) {}
    render();
  });

  /* ----- ambil data dari database ----- */
  function setStatus(msg, retry) {
    statusEl.hidden = !msg;
    statusEl.innerHTML = msg ? esc(msg) + (retry ? ' <button type="button" class="linkbtn" id="retryBtn">Coba lagi</button>' : "") : "";
  }
  function anyDialogOpen() { return dlg.open || delDlg.open || $("#infoDlg").open || $("#lightbox").open || ($("#cDlg") && $("#cDlg").open) || ($("#importDlg") && $("#importDlg").open); }
  function refresh(silent) {
    if (!silent) setStatus("Memuat daftar kos...", false);
    return K.loadKos().then(function () { setStatus("", false); render(); }).catch(function (e) {
      if (/Sesi login habis/.test(e.message || "")) return;
      if (!silent || !store.loaded) { store.loaded = true; setStatus("Gagal memuat data. " + explain(e), true); render(); }
    });
  }
  statusEl.addEventListener("click", function (e) { if (e.target.id === "retryBtn") refresh(false); });
  document.addEventListener("visibilitychange", function () {
    if (active && document.visibilityState === "visible" && K.canEdit() && !anyDialogOpen()) refresh(true);
  });
  setInterval(function () { if (active && document.visibilityState === "visible" && K.canEdit() && !anyDialogOpen()) refresh(true); }, 60000);

  /* ----- filter (balon di bawah tombol) ----- */
  function openPanel(open) {
    panel.hidden = !open;
    $("#filterBtn").setAttribute("aria-expanded", String(open));
    if (open) { var f = $("input", panel); if (f) f.focus({ preventScroll: true }); }
  }
  $("#filterBtn").addEventListener("click", function () { openPanel(panel.hidden); });
  $("#filterClose").addEventListener("click", function () { openPanel(false); $("#filterBtn").focus(); });
  $("#filterDone").addEventListener("click", function () { openPanel(false); $("#filterBtn").focus(); });
  document.addEventListener("click", function (e) { if (!panel.hidden && !e.target.closest(".fwrap")) openPanel(false); });
  function resetFilters() { st.jenis = "semua"; st.min = 0; st.max = PMAX; st.fac = {}; render(); }
  $("#resetFilters").addEventListener("click", resetFilters);
  $("#emptyBtn").addEventListener("click", function () {
    if (this.dataset.mode === "add") openEdit(null); else { st.q = ""; $("#q").value = ""; resetFilters(); }
  });
  $("#q").addEventListener("input", function (e) { st.q = e.target.value; render(); });
  $("#sort").addEventListener("change", function (e) { st.sort = e.target.value; render(); });
  $("#chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chipbtn"); if (!b) return;
    st.jenis = b.dataset.jenis; render();
  });
  $$("#filterForm [name=jenis]").forEach(function (r) { r.addEventListener("change", function () { st.jenis = r.value; render(); }); });
  pmin.addEventListener("input", function () { st.min = Number(pmin.value); if (st.min > st.max) st.max = st.min; render(); });
  pmax.addEventListener("input", function () { st.max = Number(pmax.value); if (st.max < st.min) st.min = st.max; render(); });
  $("#facFilters").addEventListener("change", function (e) {
    if (e.target.checked) st.fac[e.target.value] = true; else delete st.fac[e.target.value];
    render();
  });
  $("#filterForm").addEventListener("submit", function (e) { e.preventDefault(); });

  /* ----- aksi pada kartu ----- */
  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]"); if (!btn) return;
    var k = K.byId(btn.closest("[data-id]").dataset.id); if (!k) return;
    var act = btn.dataset.act;
    if (act === "cover") { coverTarget = k; $("#coverFile").click(); return; }
    if (act === "photo") viewer.openLightbox(k, 0);
    if (act === "edit") openEdit(k.id);
    if (act === "info") viewer.openInfo(k);
    if (act === "pdf") K.printKos(k);
    if (act === "del") askDelete(k);
  });

  /* ----- hapus ----- */
  var delTarget = null;
  function askDelete(k) {
    if (!K.canEdit()) return;
    delTarget = k; $('[data-err="del"]').textContent = "";
    $("#delText").textContent = "Kos \"" + k.nama + "\" beserta semua foto dan videonya akan dihapus. Tindakan ini tidak bisa dibatalkan. Kos ini juga hilang dari daftar client yang memilihnya.";
    delDlg.showModal();
  }
  $("#delOk").addEventListener("click", function () {
    if (!delTarget) return;
    var btn = this, k = delTarget; btn.disabled = true;
    api.remove(k.id).then(function () {
      api.removeFiles(K.fileUrls(k).map(K.pathFromUrl));
      store.list = store.list.filter(function (x) { return x.id !== k.id; });
      delTarget = null; delDlg.close(); render(); K.toast("Kos dihapus");
    }).catch(function (e) { $('[data-err="del"]').textContent = explain(e); })
      .then(function () { btn.disabled = false; });
  });

  /* ----- tambah / edit ----- */
  var editing = null, editId = "", formPhotos = [], formMedia = [], formUrls = [];

  function renderPhotos() {
    $("#fPhotos").innerHTML = formPhotos.map(function (p, i) {
      return '<div class="ph"><img src="' + esc(p.url) + '" alt="Foto ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="Hapus foto ' + (i + 1) + '">&times;</button></div>';
    }).join("");
  }
  function renderMedia() {
    $("#fMedia").innerHTML = formMedia.map(function (m) {
      return '<div class="mrow" data-mid="' + m.id + '">' +
        '<div class="mrow__thumb">' + (m.type === "video" ? '<video src="' + esc(m.url) + '#t=0.1" muted preload="metadata"></video><span class="th__play">' + ICON_PLAY + '</span>' : '<img src="' + esc(m.url) + '" alt="">') + '</div>' +
        '<div class="mrow__f"><input class="input" list="labelOpts" maxlength="40" placeholder="Label, mis. Kamar mandi" aria-label="Label media" value="' + esc(m.label) + '" data-ml="' + m.id + '">' +
        '<span class="mrow__t">' + (m.type === "video" ? "Video" : "Foto") + '</span></div>' +
        '<button type="button" class="mrow__rm" data-mrm="' + m.id + '" aria-label="Hapus media">&times;</button></div>';
    }).join("");
  }
  function addFacRow(val) {
    var row = document.createElement("div");
    row.className = "fx__row";
    row.innerHTML = '<input class="input" maxlength="40" placeholder="mis. Water heater" aria-label="Fasilitas lain" value="' + esc(val || "") + '"><button type="button" class="iconbtn" data-fxrm aria-label="Hapus fasilitas">&times;</button>';
    $("#fFacX").appendChild(row);
    return $("input", row);
  }
  function clearErrors() { $$(".err", form).forEach(function (p) { p.textContent = ""; }); }
  function setErr(id, msg) { $('[data-err="' + id + '"]').textContent = msg; }

  function openEdit(id) {
    if (!K.canEdit()) return;
    editing = id ? K.byId(id) : null;
    editId = editing ? editing.id : K.newId("k");
    clearErrors();
    $("#editTitle").textContent = editing ? "Edit kos" : "Tambah kos";
    var k = editing || norm({ jenis: "campur", nama: "" });
    $("#fNama").value = editing ? k.nama : ""; $("#fAlamat").value = k.alamat; $("#fMaps").value = k.maps; $("#fJenis").value = k.jenis;
    $("#fHarga").value = editing ? k.harga : ""; $("#fDesk").value = k.deskripsi;
    $("#fKon").innerHTML = "";
    (k.kontak.length ? k.kontak : [{ nama: "", hp: "" }]).forEach(addKonRow);
    $("#fFacQ").value = "";
    $("#fRating").value = k.rating === null ? "" : k.rating; $("#fKamar").value = k.kamar === null ? "" : k.kamar;
    buildFacLists();
    $$("#fFac input").forEach(function (c) { c.checked = K.hasFac(k, c.value); });
    $("#fFacX").innerHTML = "";
    k.fasilitas.filter(function (f) { return !K.facCanon(f); }).forEach(addFacRow);
    formPhotos = k.foto.map(function (u) { return { url: u, isNew: false }; }); renderPhotos();
    formUrls.forEach(URL.revokeObjectURL); formUrls = [];
    formMedia = k.media.map(function (m) { return { id: m.id, type: m.type, label: m.label, url: m.url, isNew: false }; }); renderMedia();
    dlg.showModal();
    $("#fNama").focus();
  }
  // Pemilik & nomor: jumlah bebas, tombol "+" menambah baris
  function addKonRow(c) {
    c = c || {};
    var row = document.createElement("div");
    row.className = "kon__row";
    row.innerHTML = '<input class="input" data-kn maxlength="60" placeholder="Nama pemilik, mis. Pak Budi" aria-label="Nama pemilik" value="' + esc(c.nama || "") + '">' +
      '<input class="input" data-kh type="tel" inputmode="tel" autocomplete="off" maxlength="30" placeholder="Nomor HP / WA, mis. 08123456789" aria-label="Nomor HP atau WhatsApp" value="' + esc(c.hp || "") + '">' +
      '<button type="button" class="iconbtn" data-konrm aria-label="Hapus pemilik ini">&times;</button>' +
      '<p class="err" data-konerr></p>';
    $("#fKon").appendChild(row);
    K.hpField($("[data-kh]", row));
    return $("[data-kn]", row);
  }
  $("#fKonAdd").addEventListener("click", function () { addKonRow({}).focus(); });
  $("#fKon").addEventListener("click", function (e) {
    var b = e.target.closest("[data-konrm]"); if (!b) return;
    var row = b.closest(".kon__row");
    if ($$(".kon__row", $("#fKon")).length > 1) row.remove();
    else { $("[data-kn]", row).value = ""; $("[data-kh]", row).value = ""; $("[data-konerr]", row).textContent = ""; }
  });
  $("#fKon").addEventListener("input", function (e) { var r = e.target.closest(".kon__row"); if (r) $("[data-konerr]", r).textContent = ""; });
  $("#addBtn").addEventListener("click", function () { openEdit(null); });
  $("#fFacAdd").addEventListener("click", function () { addFacRow("").focus(); });
  $("#fFacX").addEventListener("click", function (e) { var b = e.target.closest("[data-fxrm]"); if (b) b.closest(".fx__row").remove(); });
  $("#fFacX").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addFacRow("").focus(); } });

  $("#fPhotos").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    formPhotos.splice(Number(b.dataset.rm), 1); renderPhotos();
  });
  $("#fFile").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = "";
    setErr("fFile", "");
    if (!files.length) return;
    var room = Math.max(MAX_PHOTOS - formPhotos.length, 0), msgs = [];
    if (files.length > room) msgs.push("Maksimal " + MAX_PHOTOS + " foto sampul. Hanya " + room + " foto pertama yang dipakai.");
    Promise.all(files.slice(0, room).map(function (f) {
      if (!isImage(f)) { msgs.push("\"" + f.name + "\" bukan foto."); return null; }
      return K.resizeToBlob(f, 1400, 0.82).then(function (b) {
        var u = URL.createObjectURL(b); formUrls.push(u);
        return { url: u, blob: b, isNew: true };
      }).catch(function () {
        msgs.push("\"" + f.name + "\" tidak bisa dibaca" + (/heic|heif/.test(extOf(f)) ? " (format HEIC: ubah kamera iPhone ke 'Paling Kompatibel' atau simpan sebagai JPG)." : "."));
        return null;
      });
    })).then(function (arr) {
      arr.filter(Boolean).forEach(function (p) { formPhotos.push(p); });
      renderPhotos();
      if (msgs.length) setErr("fFile", msgs.join(" "));
    });
  });
  $("#fMediaFile").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = "";
    setErr("fMedia", "");
    if (!files.length) return;
    var msgs = [], room = Math.max(MAX_MEDIA - formMedia.length, 0);
    if (files.length > room) msgs.push("Maksimal " + MAX_MEDIA + " foto/video detail. Sisanya diabaikan.");
    Promise.all(files.slice(0, room).map(function (f) {
      if (isVideo(f)) {
        if (f.size > MAX_VIDEO_MB * 1048576) { msgs.push("\"" + f.name + "\" lebih dari " + MAX_VIDEO_MB + " MB, dilewati. Kecilkan/kompres videonya dulu."); return null; }
        var vu = URL.createObjectURL(f); formUrls.push(vu);
        var ext = extOf(f); if (!VID_EXT[ext]) ext = "mp4";
        if (ext === "mov") msgs.push("\"" + f.name + "\" berformat MOV: bisa tidak terputar di Chrome/Android. MP4 paling aman.");
        return { id: K.newId("m"), type: "video", label: "", blob: f, ext: ext, ctype: f.type || VID_EXT[ext], url: vu, isNew: true };
      }
      if (isImage(f)) {
        return K.resizeToBlob(f, 1600, 0.84).then(function (b) {
          var iu = URL.createObjectURL(b); formUrls.push(iu);
          return { id: K.newId("m"), type: "image", label: "", blob: b, ext: "jpg", ctype: "image/jpeg", url: iu, isNew: true };
        }).catch(function () { msgs.push("\"" + f.name + "\" bukan gambar yang valid."); return null; });
      }
      msgs.push("\"" + f.name + "\" bukan foto atau video."); return null;
    })).then(function (arr) {
      formMedia = formMedia.concat(arr.filter(Boolean)); renderMedia();
      if (msgs.length) setErr("fMedia", msgs.join(" "));
    });
  });
  $("#fMedia").addEventListener("input", function (e) {
    var id = e.target.dataset.ml; if (!id) return;
    formMedia.forEach(function (m) { if (m.id === id) m.label = e.target.value; });
  });
  $("#fMedia").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mrm]"); if (!b) return;
    formMedia = formMedia.filter(function (m) { return m.id !== b.dataset.mrm; }); renderMedia();
  });

  $$("[data-close]", dlg).forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  $$("[data-close]", delDlg).forEach(function (b) { b.addEventListener("click", function () { delDlg.close(); }); });
  dlg.addEventListener("close", function () { formUrls.forEach(URL.revokeObjectURL); formUrls = []; });

  form.addEventListener("input", function (e) {
    var wrap = e.target.closest(".f"), err = wrap && wrap.querySelector(".err");
    if (err && !e.target.dataset.ml) err.textContent = "";
    setErr("fSave", ""); $('[data-err="fSave"]').classList.remove("err--busy");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault(); clearErrors();
    var ok = true;
    function bad(id, msg) { setErr(id, msg); ok = false; }
    var nama = $("#fNama").value.trim(), hargaRaw = $("#fHarga").value.trim();
    var kon = [];
    $$(".kon__row", $("#fKon")).forEach(function (row) {
      var kn = $("[data-kn]", row).value.trim(), kh = $("[data-kh]", row).value.trim(), khN = K.normHp(kh);
      if (kh && !khN) { $("[data-konerr]", row).textContent = "Nomor HP tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890."; ok = false; }
      if (kn || kh) kon.push({ nama: kn, hp: khN || "" });
    });
    var maps = $("#fMaps").value.trim(), ratingRaw = $("#fRating").value.trim(), kamarRaw = $("#fKamar").value.trim();
    if (!nama) bad("fNama", "Nama kos wajib diisi.");
    if (hargaRaw === "" || isNaN(Number(hargaRaw)) || Number(hargaRaw) < 0) bad("fHarga", "Isi harga per bulan dengan angka.");
    if (maps && !K.safeUrl(maps)) bad("fMaps", "Link harus diawali https://");
    if (kamarRaw !== "" && (isNaN(Number(kamarRaw)) || Number(kamarRaw) < 0)) bad("fKamar", "Isi angka 0 atau lebih.");
    if (ratingRaw !== "" && (isNaN(Number(ratingRaw)) || Number(ratingRaw) < 0 || Number(ratingRaw) > 5)) bad("fRating", "Rating harus antara 0 dan 5.");
    if (!ok) { var first = $(".err:not(:empty)", form); if (first) { var inp = first.parentNode.querySelector("input"); if (inp) inp.focus(); } return; }

    var fac = $$("#fFac input:checked").map(function (c) { return c.value; });
    var newFacs = [];   // fasilitas yang belum pernah ada: akan didaftarkan ke database setelah kos tersimpan
    $$("#fFacX input").forEach(function (i) {
      var f = i.value.trim().slice(0, 40);
      if (!f) return;
      var known = K.facCanon(f); if (known) f = known;     // "kulkas" -> "Kulkas" bila sudah ada
      if (fac.map(function (x) { return x.toLowerCase(); }).indexOf(f.toLowerCase()) >= 0) return;
      fac.push(f);
      if (!known) newFacs.push(f);
    });

    var saveBtn = $("button[type=submit]", form); saveBtn.disabled = true;
    setErr("fSave", "Menyimpan... (foto & video sedang diunggah)"); $('[data-err="fSave"]').classList.add("err--busy");
    var uploaded = [];
    var jobs = [];
    formPhotos.filter(function (p) { return p.isNew; }).forEach(function (p) {
      jobs.push({ path: editId + "/c-" + Math.random().toString(36).slice(2, 9) + ".jpg", blob: p.blob, ctype: "image/jpeg", item: p, name: "foto sampul" });
    });
    formMedia.filter(function (m) { return m.isNew; }).forEach(function (m) {
      jobs.push({ path: editId + "/" + m.id + "." + m.ext, blob: m.blob, ctype: m.ctype, item: m, name: m.type === "video" ? "video" : "foto detail" });
    });
    var chain = Promise.resolve();
    jobs.forEach(function (j, idx) {
      chain = chain.then(function () {
        function show(frac) {
          setErr("fSave", "Mengunggah " + (idx + 1) + " dari " + jobs.length + " (" + j.name + ")" + (frac !== undefined ? " " + Math.round(frac * 100) + "%" : "") + "... jangan tutup jendela ini.");
        }
        show(0);
        return api.upload(j.path, j.blob, show, j.ctype).then(function (url) { uploaded.push(j.path); j.item.final = url; });
      });
    });

    chain.then(function () {
      var rec = {
        id: editId, nama: nama, alamat: $("#fAlamat").value.trim(), maps: maps, jenis: $("#fJenis").value, harga: Number(hargaRaw),
        fasilitas: fac,
        kontak: kon, hp: kon[0] ? kon[0].hp : "", pemilik: kon[0] ? kon[0].nama : "", hp2: kon[1] ? kon[1].hp : "", pemilik2: kon[1] ? kon[1].nama : "",
        deskripsi: $("#fDesk").value.trim(),
        rating: ratingRaw === "" ? null : Number(ratingRaw), kamar: kamarRaw === "" ? null : Math.max(0, Math.round(Number(kamarRaw)) || 0),
        foto: formPhotos.map(function (p) { return p.isNew ? p.final : p.url; }),
        media: formMedia.map(function (m) { return { id: m.id, type: m.type, label: m.label.trim() || (m.type === "video" ? "Video" : "Foto"), url: m.isNew ? m.final : m.url }; })
      };
      return api.save(rec).then(function () { return rec; });
    }).then(function (rec) {
      // fasilitas baru -> database (otomatis jadi pilihan di form & filter)
      return K.registerFacs(newFacs).then(function (saved) { rec._facWarn = !saved; return rec; });
    }).then(function (rec) {
      var facWarn = rec._facWarn; delete rec._facWarn;
      var removed = editing ? K.fileUrls(editing).filter(function (u) { return K.fileUrls(rec).indexOf(u) < 0; }) : [];
      api.removeFiles(removed.map(K.pathFromUrl));
      var item = norm(Object.assign({ created: editing ? editing.created : new Date().toISOString() }, rec));
      if (editing) store.list = store.list.map(function (x) { return x.id === item.id ? item : x; }); else store.list.unshift(item);
      K.toast(facWarn ? "Kos disimpan, tapi fasilitas baru belum masuk daftar database. Jalankan supabase-setup.sql terbaru." : (editing ? "Perubahan disimpan" : "Kos ditambahkan"));
      dlg.close(); render();
    }).catch(function (err) {
      api.removeFiles(uploaded);
      $('[data-err="fSave"]').classList.remove("err--busy");
      setErr("fSave", "Gagal menyimpan. " + explain(err));
    }).then(function () { saveBtn.disabled = false; });
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden && !anyDialogOpen()) openPanel(false);
  });

  K.views.katalog = {
    show: function () { active = true; render(); refresh(store.loaded); },
    hide: function () { active = false; openPanel(false); },
    reload: function () { return refresh(false); }
  };
  render();
})();
