/* ============================================================
   DEMO: menjawab semua permintaan database dengan data acak.
   Aktif bila config.js memuat DEMO: true. Perubahan hanya tersimpan
   di browser pengunjung; tidak ada yang dikirim ke server.
   ============================================================ */
(function () {
  "use strict";
  var CFG = window.KOS_CONFIG || {};
  if (!CFG.DEMO) return;

  var KUNCI = "kos-demo-v1", SESI = "kos-session-v2", TAMU = "demo-tamu";
  var BASE = String(CFG.SUPABASE_URL).replace(/\/+$/, "");
  var NAMA = ["Anggrek", "Bougenville", "Cempaka", "Dahlia", "Edelweis", "Flamboyan", "Gardenia", "Kenanga", "Lavender", "Melati", "Seruni", "Teratai"];
  var FAS = ["AC", "CCTV", "Parkir", "WiFi", "Kamar mandi dalam", "Dapur bersama", "Kasur", "Lemari", "Meja"];
  var WARNA = [["#c0603f", "#e0a15a"], ["#2f7f8f", "#6fb7a8"], ["#6d5a9c", "#b08bc4"], ["#a8743a", "#d8b56a"], ["#4c7a4f", "#94b96f"], ["#3d6a9e", "#7fa8d0"]];

  // Acak berbenih, supaya semua pengunjung melihat katalog awal yang sama
  var benih = 20261103;
  function acak(n) { benih = (benih * 16807) % 2147483647; return benih % n; }
  function menit(n) { return new Date(Date.now() + n * 60000).toISOString(); }
  function gambar(w) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="' + w[0] + '"/><stop offset="1" stop-color="' + w[1] + '"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect x="150" y="150" width="500" height="340" fill="#fff" opacity=".28"/><rect x="290" y="260" width="220" height="230" fill="#fff" opacity=".35"/><text x="400" y="90" font-family="Arial" font-size="34" fill="#fff" text-anchor="middle">Foto contoh</text></svg>';
    return "data:image/svg+xml," + encodeURIComponent(s);
  }
  function awal() {
    var kos = NAMA.map(function (n, i) {
      var w = WARNA[i % WARNA.length], fas = FAS.filter(function () { return acak(100) < 55; });
      return {
        id: "demo-" + (i + 1), created_at: menit(-3000 - i * 60),
        data: {
          nama: "Kos Contoh " + n, alamat: "Jl. Contoh No. " + (acak(90) + 10) + ", Kota Contoh", maps: "",
          jenis: ["putra", "putri", "campur"][i % 3], harga: 500000 + acak(21) * 50000,
          fasilitas: fas.length ? fas : ["WiFi"], kontak: [{ nama: "Pemilik Contoh", hp: "0800000" + (1000 + i) }],
          deskripsi: "Data acak untuk demo. Bukan kos sungguhan.",
          rating: (35 + acak(16)) / 10, kamar: acak(7), foto: [gambar(w), gambar([w[1], w[0]])], media: []
        }
      };
    });
    function pilih(a, b) { return kos.slice(a, b).map(function (r) { return { id: r.id, nama: r.data.nama }; }); }
    function klien(id, u, nama, hp, jenis, a, b, durasi, buat, mulai) {
      return {
        id: id, username: u, nama: nama, hp: hp, kos: pilih(a, b), durasi_detik: durasi, created_at: menit(buat),
        need: { jenis: jenis, min: 500000, max: 1500000, lokasi: "Dekat kampus" },
        started_at: mulai === null ? null : menit(mulai), expires_at: mulai === null ? null : menit(mulai + durasi / 60)
      };
    }
    var clients = [
      klien("k1", TAMU, "Tamu Demo", "08000002001", "campur", 0, 4, 180, -10, null),
      klien("k2", "demo-budi", "Budi (contoh)", "08000002002", "putra", 3, 5, 600, -30, -4),
      klien("k3", "demo-sari", "Sari (contoh)", "08000002003", "putri", 5, 9, 900, -1500, -1400)
    ];
    var log = clients.filter(function (c) { return c.started_at; }).map(function (c) {
      return { id: "l-" + c.id, client_id: c.id, username: c.username, nama: c.nama, kos: c.kos, need: c.need, started_at: c.started_at, expires_at: c.expires_at };
    });
    return { kos: kos, clients: clients, log: log, facilities: [] };
  }

  var S;
  try { S = JSON.parse(localStorage.getItem(KUNCI)); } catch (e) { S = null; }
  if (!S || !S.kos) S = awal();
  function simpan() { try { localStorage.setItem(KUNCI, JSON.stringify(S)); } catch (e) { /* tetap jalan di memori */ } }

  function json(isi, status) {
    return new Response(isi === null ? null : JSON.stringify(isi), { status: status || 200, headers: { "Content-Type": "application/json" } });
  }
  function bukaSesi(b) {
    var u = String(b.p_username || "").toLowerCase();
    var c = S.clients.filter(function (x) { return x.username.toLowerCase() === u; })[0];
    if (!c) return { status: "tidak_ada" };
    if (!c.started_at) {
      if (!b.p_start) return { status: "menunggu", nama: c.nama, durasi: c.durasi_detik, jumlah: c.kos.length };
      c.started_at = new Date().toISOString();
      c.expires_at = new Date(Date.now() + c.durasi_detik * 1000).toISOString();
      S.log.unshift({ id: "l-" + Date.now(), client_id: c.id, username: c.username, nama: c.nama, kos: c.kos, need: c.need, started_at: c.started_at, expires_at: c.expires_at });
      simpan();
    }
    var sisa = Math.ceil((Date.parse(c.expires_at) - Date.now()) / 1000);
    if (sisa <= 0) return { status: "selesai", nama: c.nama };
    var kos = c.kos.map(function (p) {
      var r = S.kos.filter(function (x) { return x.id === p.id; })[0];
      return r ? Object.assign({}, r.data, { id: r.id }) : null;
    }).filter(Boolean);
    return { status: "berjalan", nama: c.nama, durasi: c.durasi_detik, sisa: sisa, kos: kos };
  }
  function jawab(jalur, cari, m, b) {
    var id = (cari.match(/id=eq\.([^&]+)/) || [])[1];
    if (id) id = decodeURIComponent(id);
    if (jalur === "/auth/v1/token") return json({ access_token: "demo", refresh_token: "demo", expires_in: 86400, user: { email: b.email || "admin@demo.test" } });
    if (jalur === "/rest/v1/rpc/server_now") return json(new Date().toISOString());
    if (jalur === "/rest/v1/rpc/client_open") return json(bukaSesi(b));
    if (jalur.indexOf("/storage/v1/") === 0) return json({});
    if (jalur === "/rest/v1/client_log") return json(S.log);
    if (jalur === "/rest/v1/facilities") {
      if (m === "POST") { b.forEach(function (x) { S.facilities.push(x); }); simpan(); return json(null, 201); }
      return json(S.facilities);
    }
    if (jalur === "/rest/v1/kos") {
      if (m === "POST") {
        var ada = S.kos.filter(function (x) { return x.id === b.id; })[0];
        if (ada) ada.data = b.data; else S.kos.unshift({ id: b.id, data: b.data, created_at: new Date().toISOString() });
        simpan(); return json(null, 201);
      }
      if (m === "DELETE") { S.kos = S.kos.filter(function (x) { return x.id !== id; }); simpan(); return json(null, 204); }
      return json(S.kos);
    }
    if (jalur === "/rest/v1/clients") {
      if (m === "POST") {
        if (S.clients.some(function (x) { return x.username.toLowerCase() === String(b.username).toLowerCase(); })) return json({ message: "duplicate key" }, 409);
        S.clients.unshift(Object.assign({ id: "k" + Date.now(), created_at: new Date().toISOString(), started_at: null, expires_at: null }, b));
        simpan(); return json(null, 201);
      }
      if (m === "PATCH") { S.clients.forEach(function (x) { if (x.id === id) Object.assign(x, b); }); simpan(); return json(null, 204); }
      if (m === "DELETE") { S.clients = S.clients.filter(function (x) { return x.id !== id; }); simpan(); return json(null, 204); }
      return json(S.clients);
    }
    return json({ message: "Tidak ada di demo" }, 404);
  }

  var asli = window.fetch.bind(window);
  window.fetch = function (url, opt) {
    var u = String(url);
    if (u.indexOf(BASE) !== 0) return asli(url, opt);
    opt = opt || {};
    var p = new URL(u), b = {};
    try { b = opt.body ? JSON.parse(opt.body) : {}; } catch (e) { b = {}; }
    return Promise.resolve(jawab(p.pathname, p.search, opt.method || "GET", b));
  };

  // Foto yang diunggah disimpan sebagai data URL di browser; video dibatasi supaya penyimpanan tidak penuh
  if (window.KOS && window.KOS.api) {
    window.KOS.api.upload = function (path, blob, onProgress) {
      return new Promise(function (resolve, reject) {
        if (blob.size > 1500000) { reject(new Error("File di mode demo maksimal 1,5 MB.")); return; }
        var r = new FileReader();
        r.onload = function () { if (onProgress) onProgress(1); resolve(r.result); };
        r.onerror = function () { reject(new Error("File tidak bisa dibaca.")); };
        r.readAsDataURL(blob);
      });
    };
  }

  /* ---------- Penanda demo ---------- */
  var bar = document.createElement("div");
  bar.id = "demoBar";
  bar.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:40;display:flex;gap:10px;align-items:center;max-width:calc(100vw - 24px);padding:7px 12px;font:12px/1.4 Arial,sans-serif;color:#fff;background:#172033;border-radius:4px";
  bar.innerHTML = '<span>Mode demo: data acak, tersimpan hanya di browsermu.</span>';
  var ulang = document.createElement("button");
  ulang.type = "button";
  ulang.textContent = "Reset";
  ulang.style.cssText = "flex:none;padding:3px 9px;font:inherit;color:#172033;background:#fff;border:0;border-radius:3px;cursor:pointer";
  ulang.addEventListener("click", function () {
    try { localStorage.removeItem(KUNCI); localStorage.removeItem(SESI); } catch (e) { /* abaikan */ }
    location.reload();
  });
  bar.appendChild(ulang);
  document.body.appendChild(bar);

  function catatan(teks, wadah, sebelum) {
    var p = document.createElement("p");
    p.className = "hint";
    p.textContent = teks;
    wadah.insertBefore(p, sebelum);
  }
  var email = document.getElementById("aEmail"), sandi = document.getElementById("aPass"), form = document.getElementById("aForm");
  if (email && sandi && form) {
    email.value = "admin@demo.test";
    sandi.value = "demo";
    catatan("Mode demo: akun sudah terisi, tinggal klik Masuk.", form, form.firstChild);
  }
  var user = document.getElementById("gUser"), gform = document.getElementById("gForm");
  if (user && gform) {
    user.value = TAMU;
    catatan("Mode demo: username " + TAMU + " sudah terisi.", gform, gform.firstChild);
  }
})();
