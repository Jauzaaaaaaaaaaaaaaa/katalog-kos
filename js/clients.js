/* ============================================================
   USERNAME (admin): buat username client + pilih kos untuknya (jumlah bebas)
   ============================================================ */
(function () {
  "use strict";
  var K = window.KOS, $ = K.$, $$ = K.$$, esc = K.esc, rp = K.rp, explain = K.explain, JENIS = K.JENIS;

  var state = { list: [], offset: 0, loaded: false, q: "", status: "semua" };
  var active = false;
  var listEl = $("#cList"), emptyEl = $("#cEmpty"), statusEl = $("#cStatus");
  var dlg = $("#cDlg"), form = $("#cForm"), delDlg = $("#cDelDlg");
  var editing = null, pick = [], pinned = [];   // pinned = pilihan awal saat form dibuka (tampil paling atas)

  function nowMs() { return Date.now() + state.offset; }
  function statOf(c) {
    if (!c.started_at) return { k: "menunggu" };
    var exp = Date.parse(c.expires_at);
    if (nowMs() < exp) return { k: "berjalan", exp: exp };
    return { k: "selesai" };
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }
  function fmtTime(iso) { var d = new Date(iso); return K.pad2(d.getHours()) + ":" + K.pad2(d.getMinutes()); }
  function initials(n) {
    var p = String(n || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p[1] ? p[1][0] : (p[0] || "")[1] || "")).toUpperCase();
  }
  function needText(n) {
    n = n || {}; var t = [];
    if (n.jenis && n.jenis !== "semua" && JENIS[n.jenis]) t.push(JENIS[n.jenis]);
    if (n.min || n.max) t.push((n.min ? rp(n.min) : "Rp 0") + " - " + (n.max ? rp(n.max) : "tanpa batas"));
    if (n.lokasi) t.push("dekat " + n.lokasi);
    return t.length ? t.join(" · ") : "Kebutuhan belum diisi";
  }
  function clientLink(u) {
    var base = location.href.replace(/[#?].*$/, "").replace(/[^\/]*$/, "");
    return base + "client.html?u=" + encodeURIComponent(u);
  }
  function messageFor(c) {
    var mnt = Math.round((c.durasi_detik || 600) / 60);
    return "Halo " + (c.nama || "") + ", ini username kamu untuk melihat rekomendasi kos pilihan kami:\n\n*" + c.username + "*\n\n" +
      "Cara pakai:\n1. Buka " + clientLink(c.username) + "\n   (atau buka website lalu pilih \"Login as Client\" dan masukkan username di atas)\n" +
      "2. Tekan tombol Mulai. Kamu punya " + mnt + " menit untuk melihat, membaca, dan mengunduh PDF kos pilihan.\n\n" +
      "Siapkan waktu dulu sebelum menekan Mulai ya.";
  }

  /* ---------- Daftar ---------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return state.list.filter(function (c) {
      if (state.status !== "semua" && statOf(c).k !== state.status) return false;
      if (q && (c.nama + " " + c.username + " " + c.hp).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function pillHTML(s) {
    if (s.k === "berjalan") return '<span class="pill pill--run"><i></i>BERJALAN <b class="cd" data-exp="' + s.exp + '">' + K.mmss((s.exp - nowMs()) / 1000) + '</b></span>';
    if (s.k === "selesai") return '<span class="pill pill--done">SELESAI</span>';
    return '<span class="pill pill--wait">MENUNGGU</span>';
  }
  function cardHTML(c) {
    var s = statOf(c), kos = Array.isArray(c.kos) ? c.kos : [];
    return '<article class="ccard ccard--' + s.k + '" data-id="' + esc(c.id) + '">' +
      '<div class="ccard__bar"><span>// USERNAME: <b>' + esc(c.username) + '</b></span>' + pillHTML(s) + '</div>' +
      '<div class="ccard__body">' +
        '<div class="ccard__who"><span class="avatar">' + esc(initials(c.nama)) + '</span>' +
          '<div class="ccard__name"><h3>' + esc(c.nama || "Tanpa nama") + '</h3><p>' + (c.hp ? esc(c.hp) : "Nomor WA belum diisi") + '</p></div>' +
          '<span class="ccard__date">Dibuat ' + esc(fmtDate(c.created_at)) + '</span></div>' +
        '<p class="need">' + esc(needText(c.need)) + '</p>' +
        '<div class="assigned"><span class="lbl">KOS PILIHAN (' + kos.length + ')</span><ul class="chips">' +
          kos.map(function (k) { return '<li>' + esc(k.nama) + '</li>'; }).join("") + '</ul></div>' +
        (s.k === "selesai" ? '<p class="runinfo runinfo--done">Sesi sudah selesai (' + esc(fmtTime(c.started_at)) + ' - ' + esc(fmtTime(c.expires_at)) + '). Tekan "Aktifkan ulang" untuk memberi waktu lagi.</p>' : "") +
        '<div class="cacts">' +
          '<button type="button" class="btn btn--yellow btn--sm" data-act="edit">Edit</button>' +
          '<button type="button" class="btn btn--cyan btn--sm" data-act="wa">' + K.ICON.wa + (c.hp ? "Kirim ke client" : "Salin pesan") + '</button>' +
          '<button type="button" class="btn btn--outline btn--sm" data-act="copy">Salin</button>' +
          (s.k === "selesai" ? '<button type="button" class="btn btn--green btn--sm" data-act="renew">Aktifkan ulang</button>' : "") +
          '<button type="button" class="btn btn--danger btn--sm" data-act="del">Hapus</button>' +
        '</div>' +
      '</div></article>';
  }
  function render() {
    $$("#cChips .chipbtn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === state.status)); });
    var rows = filtered();
    listEl.innerHTML = rows.map(cardHTML).join("");
    listEl.hidden = rows.length === 0;
    if (!state.loaded) { emptyEl.hidden = true; return; }
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) {
      $("#cEmptyTitle").textContent = state.list.length ? "Tidak ada username yang cocok" : "Belum ada username";
      $("#cEmptyText").textContent = state.list.length ? "Coba ubah kata pencarian atau filter status." : "Buat username pertama, isi dengan kos yang cocok untuk client, lalu kirim ke client.";
    }
  }
  function setStatus(msg, retry) {
    statusEl.hidden = !msg;
    statusEl.innerHTML = msg ? esc(msg) + (retry ? ' <button type="button" class="linkbtn" id="cRetry">Coba lagi</button>' : "") : "";
  }
  statusEl.addEventListener("click", function (e) { if (e.target.id === "cRetry") refresh(false); });
  function refresh(silent) {
    if (!silent) setStatus("Memuat daftar username...", false);
    var kosP = K.store.loaded ? Promise.resolve() : K.loadKos();
    return Promise.all([K.clients.list(), K.serverOffset(), kosP]).then(function (r) {
      state.list = r[0]; state.offset = r[1]; state.loaded = true; setStatus("", false); render();
    }).catch(function (e) {
      if (/Sesi login habis/.test(e.message || "")) return;
      if (!silent || !state.loaded) { state.loaded = true; setStatus("Gagal memuat data. " + explain(e), true); render(); }
    });
  }
  // hitung mundur di kartu (tanpa membangun ulang seluruh daftar)
  setInterval(function () {
    if (!active) return;
    var expired = false;
    $$("#cList .cd").forEach(function (el) {
      var left = (Number(el.dataset.exp) - nowMs()) / 1000;
      if (left <= 0) expired = true; else el.textContent = K.mmss(left);
    });
    if (expired) render();
  }, 1000);
  setInterval(function () { if (active && !dlg.open && !delDlg.open && document.visibilityState === "visible") refresh(true); }, 15000);

  $("#cSearch").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("#cChips").addEventListener("click", function (e) { var b = e.target.closest(".chipbtn"); if (!b) return; state.status = b.dataset.s; render(); });
  $("#cEmptyBtn").addEventListener("click", function () { openDlg(null); });

  listEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var c = state.list.filter(function (x) { return x.id === b.closest(".ccard").dataset.id; })[0]; if (!c) return;
    var act = b.dataset.act;
    if (act === "edit") openDlg(c);
    if (act === "copy") K.copyText(c.username).then(function () { K.toast("Username disalin"); }, function () { K.toast("Gagal menyalin"); });
    if (act === "wa") {
      var msg = messageFor(c), n = K.waNumber(c.hp);
      if (n) window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
      else K.copyText(msg).then(function () { K.toast("Pesan disalin, tempel ke WhatsApp"); }, function () { K.toast("Gagal menyalin"); });
    }
    if (act === "renew") {
      b.disabled = true;
      K.clients.update(c.id, { started_at: null, expires_at: null }).then(function () { K.toast("Sesi diaktifkan ulang"); return refresh(true); })
        .catch(function (er) { K.toast(explain(er)); b.disabled = false; });
    }
    if (act === "del") askDelete(c);
  });

  /* ---------- Hapus ---------- */
  var delTarget = null;
  function askDelete(c) {
    delTarget = c; $('[data-err="cdel"]').textContent = "";
    $("#cDelText").textContent = "Username \"" + c.username + "\" (" + (c.nama || "tanpa nama") + ") akan dihapus dan tidak bisa dipakai login lagi. Riwayat sesi yang sudah tercatat tetap tersimpan di halaman Pengawasan.";
    delDlg.showModal();
  }
  $("#cDelOk").addEventListener("click", function () {
    if (!delTarget) return;
    var btn = this, c = delTarget; btn.disabled = true;
    K.clients.remove(c.id).then(function () {
      state.list = state.list.filter(function (x) { return x.id !== c.id; });
      delTarget = null; delDlg.close(); render(); K.toast("Username dihapus");
    }).catch(function (e) { $('[data-err="cdel"]').textContent = explain(e); }).then(function () { btn.disabled = false; });
  });
  $$("[data-close]", delDlg).forEach(function (b) { b.addEventListener("click", function () { delDlg.close(); }); });

  /* ---------- Form buat / edit ---------- */
  function setErr(id, msg) { $('[data-err="' + id + '"]').textContent = msg; }
  function clearErrors() { $$(".err", form).forEach(function (p) { p.textContent = ""; }); }
  function needNow() {
    var mn = $("#cMin").value.trim(), mx = $("#cMax").value.trim();
    return { jenis: $("#cJenis").value, min: mn === "" ? null : Math.max(0, Math.round(Number(mn)) || 0), max: mx === "" ? null : Math.max(0, Math.round(Number(mx)) || 0), lokasi: $("#cLok").value.trim() };
  }
  function matchTags(k, n) {
    var t = [];
    if (n.jenis && n.jenis !== "semua" && k.jenis === n.jenis) t.push("Jenis");
    if (n.min || n.max) { if ((!n.min || k.harga >= n.min) && (!n.max || k.harga <= n.max)) t.push("Harga"); }
    if (n.lokasi && (k.alamat + " " + k.nama).toLowerCase().indexOf(n.lokasi.toLowerCase()) >= 0) t.push("Lokasi");
    return t;
  }
  function renderPick() {
    var n = needNow(), q = $("#cPickQ").value.trim().toLowerCase();
    var rows = K.store.list.map(function (k) { return { k: k, tags: matchTags(k, n) }; }).filter(function (r) {
      return !q || (r.k.nama + " " + r.k.alamat).toLowerCase().indexOf(q) >= 0 || pick.indexOf(r.k.id) >= 0;
    });
    function fullRank(r) { return K.availState(r.k) === "full" ? 1 : 0; }
    rows.sort(function (a, b) {
      var pa = pinned.indexOf(a.k.id) >= 0 ? 1 : 0, pb = pinned.indexOf(b.k.id) >= 0 ? 1 : 0;
      return (pb - pa) || (fullRank(a) - fullRank(b)) || (b.tags.length - a.tags.length) || a.k.nama.localeCompare(b.k.nama, "id");
    });
    var box = $("#cPick"), keepTop = box.scrollTop;
    box.innerHTML = rows.length ? rows.map(function (r) {
      var k = r.k, on = pick.indexOf(k.id) >= 0, full = false;
      var av = K.availState(k);
      var avTag = av === "ok" ? '<em class="pick__rec">Disarankan &middot; ' + k.kamar + ' kamar</em>' : (av === "full" ? '<em class="pick__no">Tidak disarankan &middot; penuh</em>' : "");
      return '<label class="pick pick--' + av + (on ? " is-on" : "") + (full ? " is-off" : "") + '"><input type="checkbox" value="' + esc(k.id) + '"' + (on ? " checked" : "") + (full ? " disabled" : "") + '>' +
        '<span class="pick__main"><b>' + esc(k.nama) + '</b><small>' + JENIS[k.jenis] + ' · ' + rp(k.harga) + (k.alamat ? ' · ' + esc(k.alamat) : "") + '</small></span>' +
        '<span class="pick__tags">' + avTag + r.tags.map(function (t) { return '<em>' + t + '</em>'; }).join("") + '</span></label>';
    }).join("") : '<p class="muted pick__empty">' + (K.store.list.length ? "Tidak ada kos yang cocok dengan pencarian." : "Belum ada kos di katalog. Tambahkan kos dulu di halaman Katalog.") + '</p>';
    box.scrollTop = keepTop;
    $("#cPickN").textContent = pick.length + " dipilih";
  }
  function genUsername() {
    var nm = ($("#cNama").value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ")[0] || "client";
    nm = nm.slice(0, 14);
    var al = "abcdefghjkmnpqrstuvwxyz23456789", s = "", arr = new Uint32Array(4);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr); else for (var j = 0; j < 4; j++) arr[j] = Math.floor(Math.random() * 4294967295);
    for (var i = 0; i < 4; i++) s += al[arr[i] % al.length];
    return nm + "-" + s;
  }
  function openDlg(c) {
    editing = c; clearErrors(); delete form.dataset.warned;
    var n = (c && c.need) || {};
    $("#cTitle").textContent = c ? "Edit username" : "Buat username";
    $("#cNama").value = c ? c.nama : ""; $("#cHp").value = c ? c.hp : "";
    $("#cUser").value = c ? c.username : genUsername(); $("#cUser").readOnly = !!c; $("#cGen").hidden = !!c;
    $("#cDurasi").value = c ? Math.round((c.durasi_detik || 600) / 60) : 10;
    $("#cJenis").value = n.jenis || "semua"; $("#cMin").value = n.min || ""; $("#cMax").value = n.max || ""; $("#cLok").value = n.lokasi || "";
    $("#cPickQ").value = "";
    pick = ((c && c.kos) || []).map(function (x) { return x.id; }).filter(function (id) { return !!K.byId(id); });
    var ready = K.store.loaded ? Promise.resolve() : K.loadKos();
    pinned = pick.slice();
    ready.then(function () { pick = pick.filter(function (id) { return !!K.byId(id); }); pinned = pick.slice(); renderPick(); }).catch(function (e) { setErr("cKos", explain(e)); });
    renderPick();
    dlg.showModal();
    $("#cNama").focus();
  }
  K.hpField($("#cHp"));
  $("#cAdd").addEventListener("click", function () { openDlg(null); });
  $("#cGen").addEventListener("click", function () { $("#cUser").value = genUsername(); setErr("cUser", ""); });
  ["#cJenis", "#cMin", "#cMax", "#cLok"].forEach(function (s) { $(s).addEventListener("input", renderPick); });
  $("#cPickQ").addEventListener("input", renderPick);
  $("#cPick").addEventListener("change", function (e) {
    var id = e.target.value; if (!id) return;
    if (e.target.checked) { if (pick.indexOf(id) < 0) pick.push(id); }
    else pick = pick.filter(function (x) { return x !== id; });
    setErr("cKos", ""); delete form.dataset.warned; renderPick();
  });
  $$("[data-close]", dlg).forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  form.addEventListener("input", function (e) {
    var wrap = e.target.closest(".f"), err = wrap && wrap.querySelector(".err"); if (err) err.textContent = "";
    setErr("cSave", "");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault(); clearErrors();
    var ok = true; function bad(id, m) { setErr(id, m); ok = false; }
    var nama = $("#cNama").value.trim(), hp = $("#cHp").value.trim(), hpN = K.normHp(hp), user = $("#cUser").value.trim().toLowerCase();
    var mnt = Number($("#cDurasi").value), need = needNow();
    if (!nama) bad("cNama", "Nama client wajib diisi.");
    if (hp && !hpN) bad("cHp", "Nomor WA tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890.");
    if (!/^[a-z0-9][a-z0-9._-]{5,29}$/.test(user)) bad("cUser", "Username 6-30 karakter: huruf kecil, angka, titik, strip, atau garis bawah.");
    if (!(mnt >= 1 && mnt <= 60)) bad("cDurasi", "Durasi 1 sampai 60 menit.");
    if (need.min !== null && need.max !== null && need.min > need.max) bad("cMin", "Harga minimal tidak boleh lebih besar dari maksimal.");
    if (!pick.length) bad("cKos", "Pilih minimal 1 kos.");
    else {
      var fullNames = pick.map(K.byId).filter(function (k) { return k && K.availState(k) === "full"; }).map(function (k) { return k.nama; });
      if (fullNames.length && !form.dataset.warned) { setErr("cKos", "Tidak disarankan: " + fullNames.join(", ") + " kamarnya penuh. Ganti kos lain, atau klik Simpan lagi untuk tetap memakainya."); form.dataset.warned = "1"; ok = false; }
    }
    if (!ok) { var f = $(".err:not(:empty)", form); if (f) { var i = f.parentNode.querySelector("input,select"); if (i) i.focus(); } return; }

    var kos = pick.map(function (id) { var k = K.byId(id); return { id: id, nama: k ? k.nama : id }; });
    var rec = { nama: nama, hp: hpN || "", need: need, kos: kos, durasi_detik: Math.round(mnt) * 60 };
    var btn = $("button[type=submit]", form); btn.disabled = true;
    var p = editing ? K.clients.update(editing.id, rec) : K.clients.create(Object.assign({ username: user }, rec));
    p.then(function () {
      dlg.close(); K.toast(editing ? "Username diperbarui" : "Username dibuat. Kirim ke client lewat tombol Kirim.");
      return refresh(true);
    }).catch(function (err) {
      if (err.status === 409) setErr("cUser", "Username sudah dipakai. Klik Acak atau ganti.");
      else setErr("cSave", "Gagal menyimpan. " + explain(err));
    }).then(function () { btn.disabled = false; });
  });

  K.views.username = {
    show: function () { active = true; render(); refresh(state.loaded); },
    hide: function () { active = false; }
  };
  K.getClientsState = function () { return state; };
})();
