/* ============================================================
   CORE: kode bersama untuk halaman admin dan client
   (koneksi Supabase, login, utilitas, kartu kos, pop up info, PDF)
   ============================================================ */
(function () {
  "use strict";

  var K = window.KOS = { hooks: { auth: function () {} }, views: {} };
  var CFG = window.KOS_CONFIG || {};
  var CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var BASE = String(CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  var KEY = CFG.SUPABASE_ANON_KEY;
  var BUCKET = "kos-media";
  var PUB = BASE + "/storage/v1/object/public/" + BUCKET + "/";
  var SESSION_KEY = "kos-session-v2";

  K.CFG = CFG; K.CONFIGURED = CONFIGURED;
  K.FAC = ["AC", "CCTV", "Parkir", "WiFi", "Kamar mandi dalam", "Dapur bersama", "Kasur", "Lemari", "Meja"];
  K.JENIS = { putra: "Putra", putri: "Putri", campur: "Campur" };

  /* ---------- Utilitas ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rp(n) { return "Rp " + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function safeUrl(u) { u = String(u || "").trim(); return /^https?:\/\/\S+$/i.test(u) ? u : ""; }
  function fmtRating(r) { return Number(r).toFixed(1).replace(".", ","); }
  function waNumber(hp) {
    var d = String(hp || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("0") === 0) return "62" + d.slice(1);
    if (d.indexOf("8") === 0) return "62" + d;
    return d;
  }
  // Nomor HP Indonesia: terima 0812-3456-789, +62 812 3456 789, 62812..., 812..., (0812) 345.678, dll.
  // Karakter tak terlihat/spasi/strip/titik/kurung dibuang. Hasil: "08xxxxxxxxxx" (null bila tidak valid).
  function normHp(raw) {
    var s = String(raw == null ? "" : raw).replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; });
    s = s.replace(/[^0-9+]/g, "");
    if (!s) return "";
    s = s.replace(/^\+?(0062|62)/, "0").replace(/^\+/, "");
    if (/^8/.test(s)) s = "0" + s;
    s = s.replace(/\D/g, "");
    if (/^08\d{8,12}$/.test(s)) return s;          // seluler: 0812..., 0857..., dst (10-14 digit)
    if (/^0[2-7]\d{7,10}$/.test(s)) return s;      // telepon rumah dengan kode area
    return null;
  }
  K.normHp = normHp;
  // rapikan ketikan/tempelan langsung di kolom: hanya angka, +, spasi, strip
  K.hpField = function (el) {
    if (!el) return;
    el.setAttribute("maxlength", "30");
    el.addEventListener("input", function () {
      var v = el.value.replace(/[^0-9+\s\-().]/g, "");
      if (v !== el.value) el.value = v;
    });
  };
  function waHref(k, msg) {
    var n = waNumber(k.hp);
    return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(msg || ("Halo, saya tertarik dengan " + k.nama + ". Apakah masih ada kamar?")) : "";
  }
  function mapsHref(k) {
    var m = safeUrl(k.maps);
    if (m) return m;
    if (k.alamat && k.alamat.trim()) return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(k.nama + " " + k.alamat);
    return "";
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60); }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) {
      var a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select();
      try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); }
      a.remove();
    });
  }
  var ICON = {
    wa: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    dl: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
    play: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>'
  };
  K.$ = $; K.$$ = $$; K.esc = esc; K.rp = rp; K.newId = newId; K.safeUrl = safeUrl; K.fmtRating = fmtRating;
  K.waNumber = waNumber; K.waHref = waHref; K.mapsHref = mapsHref; K.pad2 = pad2; K.mmss = mmss; K.copyText = copyText; K.ICON = ICON;

  var toastTimer;
  K.toast = function (msg) {
    var t = $("#toast"); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  };

  /* ---------- Login pengelola (Supabase Auth) ---------- */
  var auth = { s: null };
  function loadSession() {
    try { var s = JSON.parse(localStorage.getItem(SESSION_KEY)); if (s && s.access_token && s.refresh_token) auth.s = s; } catch (e) { /* abaikan */ }
  }
  function saveSession(s) {
    auth.s = s;
    try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
  }
  function toSession(j, prevEmail) {
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600), email: (j.user && j.user.email) || prevEmail || "" };
  }
  function authPost(path, body) {
    return fetch(BASE + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  K.login = function (email, pw) {
    return authPost("/auth/v1/token?grant_type=password", { email: email, password: pw }).then(function (r) {
      if (!r.ok || !r.j.access_token) throw new Error("Email atau kata sandi salah.");
      saveSession(toSession(r.j));
    });
  };
  K.logout = function () { saveSession(null); K.hooks.auth(); };
  K.canEdit = function () { return CONFIGURED && !!auth.s; };
  K.email = function () { return auth.s ? auth.s.email : ""; };
  // Token pengelola (null bila tidak login). Pengunjung/client hanya memakai header apikey.
  function getToken() {
    var s = auth.s;
    if (!s) return Promise.resolve(null);
    if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
    return authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token }).then(function (r) {
      if (!r.ok || !r.j.access_token) { saveSession(null); K.hooks.auth(); throw new Error("Sesi login habis. Silakan masuk lagi."); }
      saveSession(toSession(r.j, s.email));
      return auth.s.access_token;
    });
  }

  /* ---------- Request ke Supabase ---------- */
  function req(method, path, opts) {
    opts = opts || {};
    return getToken().then(function (tok) {
      var h = { apikey: KEY }, body = opts.body;
      if (tok) h.Authorization = "Bearer " + tok;
      Object.keys(opts.headers || {}).forEach(function (k) { h[k] = opts.headers[k]; });
      if (opts.json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
      return fetch(BASE + path, { method: method, headers: h, body: body });
    }).then(function (r) {
      if (r.ok) return r;
      return r.text().then(function (t) { var e = new Error("HTTP " + r.status); e.status = r.status; e.body = t; throw e; });
    });
  }
  K.req = req;
  K.explain = function (e) {
    if (!e) return "Terjadi kesalahan.";
    if (e.storage) {
      var sd = ""; try { var sj = JSON.parse(e.body); sd = sj.message || sj.error || ""; } catch (x) { sd = String(e.body || ""); }
      if (/row-level security|unauthorized|not authorized/i.test(sd) || e.status === 401 || e.status === 403)
        return "Upload ditolak Supabase. Pastikan kamu sudah masuk sebagai admin, lalu jalankan supabase-setup.sql terbaru di SQL Editor (bagian izin storage). Detail: " + (sd || e.status);
      if (/bucket not found/i.test(sd) || e.status === 404) return "Tempat penyimpanan 'kos-media' belum ada. Jalankan supabase-setup.sql terbaru di SQL Editor.";
      if (e.status === 413 || /exceed|too large|maximum/i.test(sd)) return "File terlalu besar (maksimal 50 MB per file).";
      if (/mime/i.test(sd)) return "Jenis file tidak diizinkan oleh Supabase. Detail: " + sd;
      return "Upload gagal (" + e.status + "). " + sd;
    }
    if (e.status === 401 || e.status === 403) return "Kamu tidak punya izin. Silakan masuk lagi sebagai pengelola.";
    if (e.status === 409) return "Data sudah ada (duplikat).";
    if (e.status === 413) return "File terlalu besar (maksimal 50 MB per file).";
    if (e.status === 404) return "Database belum siap. Jalankan supabase-setup.sql terbaru (lihat README).";
    if (e.status >= 500) return "Database sedang bermasalah. Kalau proyek Supabase gratis sempat diam seminggu, buka dashboard Supabase lalu klik Restore/Unpause.";
    if (e.status) {
      var det = "";
      try { var j = JSON.parse(e.body); det = j.message || j.error_description || j.error || j.msg || ""; } catch (x) { det = String(e.body || "").slice(0, 160); }
      return (e.message || "Terjadi kesalahan.") + (det ? " (" + det + ")" : "");
    }
    if (/failed to fetch|networkerror|load failed/i.test(e.message || "")) return "Tidak bisa terhubung ke database. Periksa koneksi internet (atau proyek Supabase sedang tidur).";
    return e.message || "Terjadi kesalahan.";
  };
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  K.pathFromUrl = function (u) { return u && u.indexOf(PUB) === 0 ? decodeURIComponent(u.slice(PUB.length)) : null; };
  K.fileUrls = function (k) { return (k.foto || []).concat((k.media || []).map(function (m) { return m.url; })); };

  K.rpc = function (name, body) { return req("POST", "/rest/v1/rpc/" + name, { json: body || {} }).then(function (r) { return r.json(); }); };
  // selisih jam server dan jam perangkat (ms), supaya hitungan waktu mengikuti server
  K.serverOffset = function () {
    var t0 = Date.now();
    return K.rpc("server_now").then(function (iso) { var t1 = Date.now(); return Date.parse(iso) - (t0 + t1) / 2; }).catch(function () { return 0; });
  };

  /* ---------- Data kos ---------- */
  K.norm = function (d) {
    var r = Number(d.rating);
    // kontak pemilik: jumlah bebas. Data lama (hp/pemilik/hp2/pemilik2) otomatis dibaca sebagai daftar.
    var kon = Array.isArray(d.kontak) ? d.kontak : [{ nama: d.pemilik, hp: d.hp }, { nama: d.pemilik2, hp: d.hp2 }];
    kon = kon.map(function (c) { return { nama: String((c && c.nama) || "").trim(), hp: String((c && c.hp) || "").trim() }; })
      .filter(function (c) { return c.nama || c.hp; });
    return {
      id: d.id, created: d.created || "",
      nama: String(d.nama || "Tanpa nama"), alamat: String(d.alamat || ""), maps: String(d.maps || ""),
      jenis: K.JENIS[d.jenis] ? d.jenis : "campur", harga: Number(d.harga) || 0,
      fasilitas: Array.isArray(d.fasilitas) ? d.fasilitas.map(String) : [],
      kontak: kon,
      hp: kon[0] ? kon[0].hp : "", pemilik: kon[0] ? kon[0].nama : "", hp2: kon[1] ? kon[1].hp : "", pemilik2: kon[1] ? kon[1].nama : "",
      deskripsi: String(d.deskripsi || ""),
      rating: d.rating === null || d.rating === undefined || d.rating === "" || isNaN(r) ? null : Math.min(5, Math.max(0, r)),
      kamar: d.kamar === null || d.kamar === undefined || d.kamar === "" || isNaN(Number(d.kamar)) ? null : Math.max(0, Math.round(Number(d.kamar))),
      foto: Array.isArray(d.foto) ? d.foto.filter(Boolean) : [],
      media: Array.isArray(d.media) ? d.media.filter(function (m) { return m && m.url; }) : []
    };
  };
  K.store = { list: [], loaded: false };
  K.api = {
    list: function () {
      return req("GET", "/rest/v1/kos?select=id,data,created_at&order=created_at.desc").then(function (r) { return r.json(); }).then(function (rows) {
        return rows.map(function (r) { var d = r.data || {}; d.id = r.id; d.created = r.created_at; return K.norm(d); });
      });
    },
    save: function (k) {
      var d = Object.assign({}, k); delete d.id; delete d.created;
      return req("POST", "/rest/v1/kos", { headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, json: { id: k.id, data: d } });
    },
    remove: function (id) { return req("DELETE", "/rest/v1/kos?id=eq." + encodeURIComponent(id)); },
    // Unggah satu file ke bucket. Nama file selalu unik, jadi TIDAK memakai upsert
    // (upsert butuh izin SELECT + UPDATE di storage dan sering membuat upload gagal 403).
    upload: function (path, blob, onProgress, contentType) {
      return getToken().then(function (tok) {
        return new Promise(function (resolve, reject) {
          var x = new XMLHttpRequest();
          x.open("POST", BASE + "/storage/v1/object/" + BUCKET + "/" + encPath(path));
          x.setRequestHeader("apikey", KEY);
          if (tok) x.setRequestHeader("Authorization", "Bearer " + tok);
          x.setRequestHeader("x-upsert", "false");
          x.setRequestHeader("cache-control", "max-age=31536000");
          x.setRequestHeader("Content-Type", contentType || blob.type || "application/octet-stream");
          if (x.upload && onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
          x.onload = function () {
            if (x.status >= 200 && x.status < 300) return resolve(PUB + encPath(path));
            if (/duplicate|already exists/i.test(x.responseText || "")) return resolve(PUB + encPath(path));
            var e = new Error("HTTP " + x.status); e.status = x.status; e.body = x.responseText; e.storage = true; reject(e);
          };
          x.onerror = function () { reject(new Error("Failed to fetch")); };
          x.ontimeout = function () { reject(new Error("Failed to fetch")); };
          x.send(blob);
        });
      });
    },
    removeFiles: function (paths) {
      paths = paths.filter(Boolean);
      if (!paths.length) return Promise.resolve();
      return req("DELETE", "/storage/v1/object/" + BUCKET, { json: { prefixes: paths } }).catch(function () { /* abaikan */ });
    }
  };
  K.loadKos = function () {
    // daftar fasilitas dari tabel `facilities`; kalau tabel belum dibuat, tidak apa-apa
    // (daftar tetap dibentuk dari fasilitas yang sudah dipakai kos)
    var facP = K.facilities.list().catch(function () { return null; });
    return Promise.all([K.api.list(), facP]).then(function (r) {
      K.store.list = r[0]; K.store.loaded = true;
      if (r[1]) K.facDb = r[1];
      return r[0];
    });
  };
  K.byId = function (id) { return K.store.list.filter(function (k) { return k.id === id; })[0]; };

  /* ---------- Daftar fasilitas dinamis ----------
     Sumber: K.FAC (bawaan) + tabel `facilities` di database + fasilitas yang sudah dipakai kos.
     Fasilitas baru yang diketik di form kos otomatis masuk database dan menjadi
     pilihan di form dan di filter. */
  K.facDb = [];
  K.facilities = {
    list: function () {
      return req("GET", "/rest/v1/facilities?select=nama&order=created_at.asc").then(function (r) { return r.json(); })
        .then(function (rows) { return rows.map(function (x) { return String(x.nama || "").trim(); }).filter(Boolean); });
    },
    add: function (names) {
      return req("POST", "/rest/v1/facilities?on_conflict=nama", {
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        json: names.map(function (n) { return { nama: n }; })
      });
    }
  };
  // Semua fasilitas yang dikenal, tanpa dobel (huruf besar/kecil dianggap sama), diurutkan abjad.
  K.facAll = function () {
    var seen = {}, out = [];
    function put(n) {
      n = String(n || "").trim(); var k = n.toLowerCase();
      if (n && !seen[k]) { seen[k] = true; out.push(n); }
    }
    K.FAC.forEach(put);
    K.facDb.forEach(put);
    K.store.list.forEach(function (k) { k.fasilitas.forEach(put); });
    return out.sort(function (a, b) { return a.localeCompare(b, "id", { sensitivity: "base" }); });
  };
  // Cocokkan ketikan pencarian dengan awal nama fasilitas atau awal salah satu katanya ("m" -> "Meja", "Kamar mandi dalam")
  K.facMatch = function (name, q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return true;
    return String(name).toLowerCase().split(/[\s\-\/]+/).concat(String(name).toLowerCase()).some(function (w) { return w.indexOf(q) === 0; });
  };
  // Nama baku sebuah fasilitas ("kulkas" -> "Kulkas" bila sudah ada); null bila belum dikenal
  K.facCanon = function (name) {
    var k = String(name || "").trim().toLowerCase(), all = K.facAll();
    for (var i = 0; i < all.length; i++) if (all[i].toLowerCase() === k) return all[i];
    return null;
  };
  K.hasFac = function (k, f) {
    var x = String(f).toLowerCase();
    return k.fasilitas.some(function (y) { return y.toLowerCase() === x; });
  };
  // Daftarkan fasilitas baru ke database (dipanggil setelah kos berhasil disimpan). Tidak melempar error.
  K.registerFacs = function (names) {
    var fresh = [];
    (names || []).forEach(function (n) {
      n = String(n || "").trim().slice(0, 40);
      if (!n) return;
      var low = n.toLowerCase();
      if (K.FAC.concat(K.facDb, fresh).some(function (x) { return x.toLowerCase() === low; })) return;
      fresh.push(n);
    });
    if (!fresh.length) return Promise.resolve(true);
    K.facDb = K.facDb.concat(fresh);
    return K.facilities.add(fresh).then(function () { return true; }, function () { return false; });
  };

  /* ---------- Data client & riwayat (khusus pengelola) ---------- */
  K.clients = {
    list: function () { return req("GET", "/rest/v1/clients?select=*&order=created_at.desc").then(function (r) { return r.json(); }); },
    create: function (o) { return req("POST", "/rest/v1/clients", { headers: { Prefer: "return=minimal" }, json: o }); },
    update: function (id, o) { return req("PATCH", "/rest/v1/clients?id=eq." + encodeURIComponent(id), { headers: { Prefer: "return=minimal" }, json: o }); },
    remove: function (id) { return req("DELETE", "/rest/v1/clients?id=eq." + encodeURIComponent(id)); }
  };
  K.logs = {
    list: function () { return req("GET", "/rest/v1/client_log?select=*&order=started_at.desc&limit=1000").then(function (r) { return r.json(); }); }
  };

  /* ---------- Gambar ---------- */
  var BG = { putra: "#7fe3ec", putri: "#ffb3ec", campur: "#ffe566" };
  K.placeholder = function (k) {
    var bg = BG[k.jenis] || "#eee", w = "";
    for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) w += '<rect x="' + (128 + c * 52) + '" y="' + (92 + r * 56) + '" width="30" height="34" fill="#fff" stroke="#000" stroke-width="4"/>';
    return '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Belum ada foto ' + esc(k.nama) + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="400" height="300" fill="' + bg + '"/><rect y="236" width="400" height="64" fill="#d8d4c8" stroke="#000" stroke-width="4"/>' +
      '<rect x="110" y="56" width="180" height="180" fill="#fff" stroke="#000" stroke-width="4"/>' + w +
      '<rect x="186" y="186" width="28" height="50" fill="#000"/><circle cx="342" cy="56" r="20" fill="#ffd60a" stroke="#000" stroke-width="4"/></svg>';
  };
  K.photo = function (k, i) {
    return k.foto && k.foto[i] ? '<img src="' + esc(k.foto[i]) + '" alt="Foto ' + esc(k.nama) + '" loading="lazy" draggable="false">' : K.placeholder(k);
  };
  K.resizeToBlob = function (file, max, q) {
    function draw(src, w, h) {
      return new Promise(function (res, rej) {
        var s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(src, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? res(b) : rej(new Error("gagal")); }, "image/jpeg", q);
      });
    }
    function viaImg() {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("bukan gambar")); };
        img.onload = function () { draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height).then(function (b) { URL.revokeObjectURL(url); res(b); }, function (e) { URL.revokeObjectURL(url); rej(e); }); };
        img.src = url;
      });
    }
    // createImageBitmap menghormati orientasi foto HP (tidak miring/terbalik)
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" })
        .then(function (bm) { return draw(bm, bm.width, bm.height).then(function (b) { if (bm.close) bm.close(); return b; }); })
        .catch(viaImg);
    }
    return viaImg();
  };

  /* ---------- Potongan kartu: rating, alamat, telepon ---------- */
  K.ratingHTML = function (k, cls) {
    if (k.rating === null) return "";
    var inner = '<span class="stars" style="--p:' + (k.rating / 5 * 100).toFixed(0) + '%" aria-hidden="true"></span><b>' + fmtRating(k.rating) + '</b>' + '';
    var label = 'Rating Google Maps ' + fmtRating(k.rating) + ' dari 5';
    var href = mapsHref(k);
    return href
      ? '<a class="rate ' + (cls || "") + '" href="' + esc(href) + '" target="_blank" rel="noopener" aria-label="' + esc(label + '. Buka di Google Maps') + '">' + inner + '</a>'
      : '<span class="rate ' + (cls || "") + '" aria-label="' + esc(label) + '">' + inner + '</span>';
  };
  // Ketersediaan kamar: null = belum diisi, 0 = penuh (merah), >= 1 = tersedia (hijau)
  K.availState = function (k) { return k.kamar === null ? "unknown" : (k.kamar > 0 ? "ok" : "full"); };
  K.availText = function (k) {
    var s = K.availState(k);
    return s === "ok" ? "Kamar tersedia: " + k.kamar : (s === "full" ? "Kamar penuh (0)" : "Ketersediaan belum diisi");
  };
  K.availHTML = function (k, cls) {
    var s = K.availState(k); if (s === "unknown") return "";
    return '<span class="avail avail--' + s + ' ' + (cls || "") + '" role="status">' + (s === "ok" ? "&#10003; " : "&#10005; ") + esc(K.availText(k)) + '</span>';
  };
  K.addrHTML = function (k) {
    var text = esc(k.alamat || "Alamat belum diisi"), href = mapsHref(k);
    return href && k.alamat
      ? '<a class="kcard__addr addr--link" href="' + esc(href) + '" target="_blank" rel="noopener">' + ICON.pin + '<span>' + text + '</span></a>'
      : '<p class="kcard__addr">' + text + '</p>';
  };
  // Kontak pemilik: jumlah bebas (nama + nomor). Pasangan kosong dibuang.
  K.contacts = function (k) {
    return k.kontak || [];
  };
  K.phoneHTML = function (k) {
    var list = K.contacts(k).filter(function (c) { return c.hp; });
    if (!list.length) return '<p class="phone phone--none">' + ICON.wa + 'Nomor HP belum diisi</p>';
    var one = function (c) {
      return '<a class="phone" href="' + esc(waHref({ hp: c.hp, nama: k.nama })) + '" target="_blank" rel="noopener">' + ICON.wa +
        (c.nama ? '<span class="phone__name">' + esc(c.nama) + '</span><span class="phone__sep">&middot;</span>' : "") +
        '<span class="phone__num">' + esc(c.hp) + '</span></a>';
    };
    return list.length === 1 ? one(list[0]) : '<div class="phones">' + list.map(one).join("") + '</div>';
  };
  // Kartu kos. opts.admin = tampilkan tombol Edit/Hapus
  K.cardHTML = function (k, opts) {
    opts = opts || {};
    var n = k.foto.length, nm = k.media.length, adm = !!opts.admin;
    var facs = k.fasilitas.slice(0, 6).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("");
    if (k.fasilitas.length > 6) facs += '<li class="more">+' + (k.fasilitas.length - 6) + "</li>";
    var av = K.availState(k);
    return '<article class="kcard' + (av === "unknown" ? "" : " kcard--" + av) + '" data-id="' + esc(k.id) + '">' +
      '<div class="kcard__media">' +
        '<button type="button" class="kcard__img" data-act="photo" ' + (n ? "" : "disabled ") + 'aria-label="' + (n ? "Perbesar foto " : "Belum ada foto ") + esc(k.nama) + '">' +
          K.photo(k, 0) +
          '<span class="kcard__hint">' + (n ? "Klik untuk pop up" + (n > 1 ? " (" + n + " foto)" : "") : "Belum ada foto") + '</span>' +
        '</button>' + K.ratingHTML(k) + K.availHTML(k, "avail--card") +
      '</div>' +
      '<div class="kcard__body">' +
        '<h2>' + esc(k.nama) + '</h2>' +
        K.addrHTML(k) +
        '<span class="jenis jenis--' + k.jenis + '">' + K.JENIS[k.jenis] + '</span>' +
        '<p class="kcard__price">' + rp(k.harga) + '<small>/bulan</small></p>' +
        (facs ? '<ul class="facs">' + facs + '</ul>' : "") +
        K.phoneHTML(k) +
        '<div class="acts' + (adm ? "" : " acts--pub") + '">' +
          (adm ? '<button type="button" class="btn btn--yellow" data-act="edit">Edit</button>' : "") +
          '<button type="button" class="btn btn--cyan" data-act="info">Info' + (nm ? ' <span class="cnt">' + nm + '</span>' : "") + '</button>' +
          '<button type="button" class="btn btn--outline" data-act="pdf">' + ICON.dl + 'Unduh PDF</button>' +
          (adm ? '<button type="button" class="btn btn--danger" data-act="del">Hapus</button>' : "") +
        '</div>' +
      '</div></article>';
  };

  /* ---------- Unduh PDF (dialog cetak browser, pilih "Simpan sebagai PDF") ---------- */
  function waitImages(root) {
    var pend = $$("img", root).filter(function (i) { return !i.complete; });
    return Promise.race([
      Promise.all(pend.map(function (i) { return new Promise(function (r) { i.onload = i.onerror = r; }); })),
      new Promise(function (r) { setTimeout(r, 4000); })
    ]);
  }
  K.printBlocked = false;
  K.printKos = function (k) {
    if (K.printBlocked) return;
    var imgs = (k.foto || []).map(function (u) { return { url: u, label: "" }; })
      .concat(k.media.filter(function (m) { return m.type === "image"; }).map(function (m) { return { url: m.url, label: m.label }; })).slice(0, 10);
    var vids = k.media.filter(function (m) { return m.type === "video"; }).map(function (m) { return esc(m.label); });
    var maps = mapsHref(k);
    var sheet = $("#printSheet");
    sheet.innerHTML =
      '<div class="ps__wm" aria-hidden="true">Kos Modern</div>' +
      '<h1>' + esc(k.nama) + '</h1>' +
      '<p class="ps__addr">' + esc(k.alamat || "Alamat belum diisi") + '</p>' +
      '<p><span class="ps__tag">' + K.JENIS[k.jenis] + '</span>' +
        (k.rating !== null ? ' <span class="ps__rate">Rating Google Maps: ' + fmtRating(k.rating) + ' / 5</span>' : "") +
        (K.availState(k) !== "unknown" ? ' <span class="ps__rate">' + esc(K.availText(k)) + '</span>' : "") + '</p>' +
      '<p class="ps__price">' + rp(k.harga) + ' <small>/ bulan</small></p>' +
      (imgs.length ? '<div class="ps__imgs">' + imgs.map(function (x) {
        return '<figure><img src="' + esc(x.url) + '" alt="">' + (x.label ? '<figcaption>' + esc(x.label) + '</figcaption>' : "") + '</figure>';
      }).join("") + '</div>' : "") +
      '<h2>Fasilitas</h2><ul>' + (k.fasilitas.length ? k.fasilitas.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") : "<li>-</li>") + '</ul>' +
      (k.deskripsi ? '<h2>Deskripsi</h2><p>' + esc(k.deskripsi) + '</p>' : "") +
      (vids.length ? '<p class="ps__vid">Video tersedia di website: ' + vids.join(", ") + '.</p>' : "") +
      '<h2>Kontak pemilik</h2>' + (K.contacts(k).length ? K.contacts(k).map(function (c) {
        return '<p>' + (c.nama ? esc(c.nama) + ' &middot; ' : "") + esc(c.hp || "-") + '</p>';
      }).join("") : '<p>-</p>') +
      (maps ? '<p class="ps__maps">Lokasi di Google Maps: ' + esc(maps) + '</p>' : "");
    var old = document.title;
    document.title = "Info " + k.nama;
    function back() { document.title = old; sheet.innerHTML = ""; window.removeEventListener("afterprint", back); }
    window.addEventListener("afterprint", back);
    waitImages(sheet).then(function () {
      if (K.printBlocked) { back(); return; }
      $$(".ps__imgs figure", sheet).forEach(function (f) {
        var im = $("img", f), w = im.naturalWidth || 4, h = im.naturalHeight || 3;
        f.className = w / h > 1.15 ? "is-land" : (w / h < 0.87 ? "is-port" : "is-sq");
      });
      window.print();
    });
  };

  /* ---------- Pop up Info (galeri foto & video) + pop up foto sampul ---------- */
  // opts: canEdit() -> bool, onEdit(id), canPdf() -> bool
  K.initViewer = function (opts) {
    opts = opts || {};
    var infoDlg = $("#infoDlg"), lb = $("#lightbox"), infoK = null, gal = null, lbState = { k: null, i: 0 };

    function showLb() {
      var k = lbState.k, n = k.foto.length;
      $("#lbImg").src = k.foto[lbState.i];
      $("#lbImg").alt = "Foto " + k.nama;
      $("#lbCap").textContent = k.nama + " (" + (lbState.i + 1) + " / " + n + ")";
      $("#lbPrev").hidden = $("#lbNext").hidden = n < 2;
    }
    function openLightbox(k, i) { if (!k.foto.length) return; lbState = { k: k, i: i || 0 }; showLb(); lb.showModal(); }
    function stepLb(d) { var n = lbState.k.foto.length; lbState.i = (lbState.i + d + n) % n; showLb(); }
    $("#lbPrev").addEventListener("click", function () { stepLb(-1); });
    $("#lbNext").addEventListener("click", function () { stepLb(1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener("keydown", function (e) {
      if (!lbState.k) return;
      if (e.key === "ArrowLeft" && lbState.k.foto.length > 1) stepLb(-1);
      if (e.key === "ArrowRight" && lbState.k.foto.length > 1) stepLb(1);
    });
    $$("[data-close]", lb).forEach(function (b) { b.addEventListener("click", function () { lb.close(); }); });

    function infoHTML(k) {
      var adm = opts.canEdit && opts.canEdit();
      var waBtns = K.contacts(k).filter(function (c) { return c.hp; }).map(function (c, i, all) {
        return '<a class="btn btn--pink" href="' + esc(waHref({ hp: c.hp, nama: k.nama })) + '" target="_blank" rel="noopener">' + ICON.wa +
          (all.length > 1 && c.nama ? 'Hubungi ' + esc(c.nama) : 'Hubungi pemilik') + '</a>';
      }).join("");
      return '<div class="ibox">' +
        '<div class="ibox__media" id="iGallery"></div>' +
        '<div class="ibox__side">' +
          '<div class="ibox__top"><span class="jenis jenis--' + k.jenis + '">' + K.JENIS[k.jenis] + '</span>' + K.ratingHTML(k, "rate--inline") + K.availHTML(k) + '</div>' +
          K.addrHTML(k) +
          '<p class="kcard__price kcard__price--lg">' + rp(k.harga) + '<small>/bulan</small></p>' +
          '<h3 class="mini-h">Fasilitas</h3>' +
          (k.fasilitas.length ? '<ul class="facs">' + k.fasilitas.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + '</ul>' : '<p class="muted">Belum ada fasilitas yang dicatat.</p>') +
          (k.deskripsi ? '<h3 class="mini-h">Deskripsi</h3><p class="idesc">' + esc(k.deskripsi) + '</p>' : "") +
          K.phoneHTML(k) +
          '<div class="acts acts--info">' +
            waBtns +
            '<button type="button" class="btn btn--outline" data-act="info-pdf">' + ICON.dl + 'Unduh PDF</button>' +
            (adm ? '<button type="button" class="btn btn--yellow" data-act="info-edit">Edit</button>' : "") +
          '</div>' +
        '</div></div>';
    }
    function renderGallery(k) {
      var box = $("#iGallery"); if (!box) return;
      var items = k.foto.map(function (f) { return { type: "image", label: "Foto kos", src: f }; })
        .concat(k.media.map(function (m) { return { type: m.type, label: m.label, src: m.url }; }));
      if (!items.length) {
        gal = null;
        box.innerHTML = '<div class="stage stage--empty">' + K.placeholder(k) + '</div>' +
          '<p class="igal__empty">Belum ada foto atau video detail kamar (kamar tidur, toilet, AC, TV, dll).' +
          (opts.canEdit && opts.canEdit() ? ' <button type="button" class="linkbtn" data-act="info-edit">Tambahkan lewat Edit</button>' : "") + '</p>';
        return;
      }
      box.innerHTML =
        '<div class="stagewrap"><div class="stage" id="iStage"></div>' +
        (items.length > 1 ? '<button type="button" class="stage__nav stage__prev" data-g="-1" aria-label="Sebelumnya">&#8249;</button><button type="button" class="stage__nav stage__next" data-g="1" aria-label="Berikutnya">&#8250;</button>' : "") + '</div>' +
        '<p class="stage__cap" id="iCap"></p>' +
        '<div class="tstrip" id="iStrip">' + items.map(function (it, i) {
          return '<button type="button" class="th" data-i="' + i + '" aria-label="' + esc(it.label) + '">' +
            '<span class="th__m">' + (it.type === "video" ? '<video src="' + esc(it.src) + '#t=0.1" muted preload="metadata" tabindex="-1"></video><span class="th__play">' + ICON.play + '</span>' : '<img src="' + esc(it.src) + '" alt="" loading="lazy" draggable="false">') + '</span>' +
            '<span class="th__l">' + esc(it.label) + '</span></button>';
        }).join("") + '</div>';
      gal = { items: items, cur: 0 };
      showGal(0);
    }
    function showGal(i) {
      if (!gal) return;
      var n = gal.items.length; i = (i + n) % n; gal.cur = i;
      var it = gal.items[i];
      $("#iStage").innerHTML = it.type === "video"
        ? '<video src="' + esc(it.src) + '" controls controlsList="nodownload noremoteplayback" disablepictureinpicture playsinline preload="metadata"></video>'
        : '<img src="' + esc(it.src) + '" alt="' + esc(it.label) + '" draggable="false">';
      $("#iCap").innerHTML = '<b>' + esc(it.label) + '</b> <span>(' + (i + 1) + ' / ' + n + ')' + (it.type === "video" ? " · video" : "") + '</span>';
      $$("#iStrip .th").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.i) === i)); });
      var cur = $('#iStrip .th[aria-pressed="true"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    function openInfo(k) {
      infoK = k;
      infoDlg.classList.remove("dlg--ok", "dlg--full");
      if (K.availState(k) !== "unknown") infoDlg.classList.add("dlg--" + K.availState(k));
      $("#infoTitle").textContent = k.nama;
      $("#infoBody").innerHTML = infoHTML(k);
      renderGallery(k);
      infoDlg.showModal();
    }
    infoDlg.addEventListener("close", function () {
      $$("video", infoDlg).forEach(function (v) { v.pause(); });
      $("#infoBody").innerHTML = ""; $("#infoTitle").textContent = "Info kos"; gal = null; infoDlg.classList.remove("dlg--ok", "dlg--full");
    });
    lb.addEventListener("close", function () {
      var im = $("#lbImg"); im.removeAttribute("src"); im.alt = ""; $("#lbCap").textContent = ""; lbState = { k: null, i: 0 };
    });
    infoDlg.addEventListener("click", function (e) {
      if (e.target === infoDlg) { infoDlg.close(); return; }
      var g = e.target.closest("[data-g]"); if (g && gal) { showGal(gal.cur + Number(g.dataset.g)); return; }
      var th = e.target.closest(".th"); if (th && gal) { showGal(Number(th.dataset.i)); return; }
      var a = e.target.closest("[data-act]"); if (!a) return;
      if (a.dataset.act === "info-pdf" && (!opts.canPdf || opts.canPdf())) K.printKos(infoK);
      if (a.dataset.act === "info-edit" && opts.canEdit && opts.canEdit()) { var id = infoK.id; infoDlg.close(); if (opts.onEdit) opts.onEdit(id); }
    });
    infoDlg.addEventListener("keydown", function (e) {
      if (!gal || gal.items.length < 2 || e.target.closest("video")) return;
      if (e.key === "ArrowLeft") showGal(gal.cur - 1);
      if (e.key === "ArrowRight") showGal(gal.cur + 1);
    });
    $$("[data-close]", infoDlg).forEach(function (b) { b.addEventListener("click", function () { infoDlg.close(); }); });

    return {
      openInfo: openInfo, openLightbox: openLightbox,
      closeAll: function () { if (infoDlg.open) infoDlg.close(); if (lb.open) lb.close(); }
    };
  };

  loadSession();
})();
