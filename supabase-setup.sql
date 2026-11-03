-- ============================================================
-- Setup database Kos Modern (versi admin + client)
-- Cara pakai: Supabase > SQL Editor > New query > tempel SEMUA isi file ini > Run
-- Aman dijalankan berulang kali, dan aman dijalankan di atas database versi sebelumnya
-- (data kos yang sudah ada tidak diubah atau dihapus).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabel kos
-- ------------------------------------------------------------
create table if not exists public.kos (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.kos enable row level security;

-- PERUBAHAN: daftar kos lengkap sekarang HANYA bisa dilihat pengelola yang login.
-- Client melihat kos pilihannya lewat fungsi client_open (di bawah), bukan langsung ke tabel.
drop policy if exists "kos_select_public" on public.kos;
drop policy if exists "kos_select_auth" on public.kos;
create policy "kos_select_auth" on public.kos
  for select to authenticated using (true);

drop policy if exists "kos_insert_auth" on public.kos;
create policy "kos_insert_auth" on public.kos
  for insert to authenticated with check (true);

drop policy if exists "kos_update_auth" on public.kos;
create policy "kos_update_auth" on public.kos
  for update to authenticated using (true) with check (true);

drop policy if exists "kos_delete_auth" on public.kos;
create policy "kos_delete_auth" on public.kos
  for delete to authenticated using (true);

-- ------------------------------------------------------------
-- 2) Tempat penyimpanan foto & video (bucket publik, maks 50 MB per file)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('kos-media', 'kos-media', true, 52428800)
on conflict (id) do update
  set public = true, file_size_limit = 52428800;

-- Izin baca untuk pengelola (dibutuhkan agar upload/ganti file tidak ditolak 403).
-- File tetap bisa dilihat publik lewat URL karena bucket bersifat publik.
drop policy if exists "media_select_auth" on storage.objects;
create policy "media_select_auth" on storage.objects
  for select to authenticated using (bucket_id = 'kos-media');

drop policy if exists "media_insert_auth" on storage.objects;
create policy "media_insert_auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'kos-media');

drop policy if exists "media_update_auth" on storage.objects;
create policy "media_update_auth" on storage.objects
  for update to authenticated
  using (bucket_id = 'kos-media') with check (bucket_id = 'kos-media');

drop policy if exists "media_delete_auth" on storage.objects;
create policy "media_delete_auth" on storage.objects
  for delete to authenticated using (bucket_id = 'kos-media');

-- ------------------------------------------------------------
-- 3) Tabel client (username + kos pilihan + status sesi)
--    Hanya pengelola yang login yang boleh membaca/mengubah langsung.
--    Client biasa hanya lewat fungsi client_open.
-- ------------------------------------------------------------
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  nama         text not null default '',
  hp           text not null default '',
  need         jsonb not null default '{}'::jsonb,   -- {jenis, min, max, lokasi}
  kos          jsonb not null default '[]'::jsonb,   -- [{id, nama}, ...] jumlah bebas
  durasi_detik integer not null default 600 check (durasi_detik between 60 and 3600),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  expires_at   timestamptz
);

create unique index if not exists clients_username_key on public.clients (lower(username));

alter table public.clients enable row level security;
revoke all on public.clients from anon;
grant select, insert, update, delete on public.clients to authenticated;

drop policy if exists "clients_select_auth" on public.clients;
create policy "clients_select_auth" on public.clients
  for select to authenticated using (true);

drop policy if exists "clients_insert_auth" on public.clients;
create policy "clients_insert_auth" on public.clients
  for insert to authenticated with check (true);

drop policy if exists "clients_update_auth" on public.clients;
create policy "clients_update_auth" on public.clients
  for update to authenticated using (true) with check (true);

drop policy if exists "clients_delete_auth" on public.clients;
create policy "clients_delete_auth" on public.clients
  for delete to authenticated using (true);

-- ------------------------------------------------------------
-- 4) Riwayat sesi (satu baris tiap kali client menekan Mulai)
--    Dicatat otomatis oleh fungsi client_open. Dipakai halaman Pengawasan.
-- ------------------------------------------------------------
create table if not exists public.client_log (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients (id) on delete set null,
  username   text not null,
  nama       text not null default '',
  kos        jsonb not null default '[]'::jsonb,
  need       jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists client_log_started_idx on public.client_log (started_at desc);

alter table public.client_log enable row level security;
revoke all on public.client_log from anon;
grant select, delete on public.client_log to authenticated;

drop policy if exists "client_log_select_auth" on public.client_log;
create policy "client_log_select_auth" on public.client_log
  for select to authenticated using (true);

drop policy if exists "client_log_delete_auth" on public.client_log;
create policy "client_log_delete_auth" on public.client_log
  for delete to authenticated using (true);

-- ------------------------------------------------------------
-- 5) Fungsi: jam server (dipakai halaman Pengawasan agar waktu akurat)
-- ------------------------------------------------------------
create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

revoke all on function public.server_now() from public;
grant execute on function public.server_now() to anon, authenticated;

-- ------------------------------------------------------------
-- 6) Fungsi: client masuk dengan username
--    p_start = false : hanya cek status (tidak memulai waktu, tidak mengirim data kos)
--    p_start = true  : memulai sesi bila belum pernah dimulai
--    Data kos HANYA dikembalikan selama sesi berjalan. Setelah waktu habis, tidak ada data.
--    Berjalan dengan hak pemilik tabel (security definer) sehingga client tidak perlu
--    akses langsung ke tabel kos / clients.
-- ------------------------------------------------------------
create or replace function public.client_open(p_username text, p_start boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c     public.clients%rowtype;
  v_kos jsonb;
begin
  select * into c
    from public.clients
   where lower(username) = lower(btrim(coalesce(p_username, '')))
     for update;

  if not found then
    return jsonb_build_object('status', 'tidak_ada');
  end if;

  if c.started_at is null then
    if not coalesce(p_start, false) then
      return jsonb_build_object(
        'status', 'menunggu',
        'nama',   c.nama,
        'durasi', c.durasi_detik,
        'jumlah', jsonb_array_length(c.kos)
      );
    end if;

    update public.clients
       set started_at = now(),
           expires_at = now() + make_interval(secs => c.durasi_detik)
     where id = c.id
     returning * into c;

    insert into public.client_log (client_id, username, nama, kos, need, started_at, expires_at)
    values (c.id, c.username, c.nama, c.kos, c.need, c.started_at, c.expires_at);
  end if;

  if now() >= c.expires_at then
    return jsonb_build_object('status', 'selesai', 'nama', c.nama);
  end if;

  select coalesce(jsonb_agg(k.data || jsonb_build_object('id', k.id) order by e.ord), '[]'::jsonb)
    into v_kos
    from jsonb_array_elements(c.kos) with ordinality as e(item, ord)
    join public.kos k on k.id = (e.item ->> 'id');

  return jsonb_build_object(
    'status', 'berjalan',
    'nama',   c.nama,
    'durasi', c.durasi_detik,
    'sisa',   greatest(0, ceil(extract(epoch from (c.expires_at - now())))::int),
    'kos',    v_kos
  );
end;
$$;

revoke all on function public.client_open(text, boolean) from public;
grant execute on function public.client_open(text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 7) Daftar fasilitas (pilihan di form kos dan filter)
--    Fasilitas baru yang diketik di form tambah/edit kos otomatis masuk ke sini.
--    Hanya pengelola yang login yang boleh membaca dan menambah.
-- ------------------------------------------------------------
create table if not exists public.facilities (
  nama       text primary key,
  created_at timestamptz not null default now()
);

create unique index if not exists facilities_nama_lower_key on public.facilities (lower(nama));

alter table public.facilities enable row level security;
revoke all on public.facilities from anon;
grant select, insert, delete on public.facilities to authenticated;

drop policy if exists "facilities_select_auth" on public.facilities;
create policy "facilities_select_auth" on public.facilities
  for select to authenticated using (true);

drop policy if exists "facilities_insert_auth" on public.facilities;
create policy "facilities_insert_auth" on public.facilities
  for insert to authenticated with check (true);

drop policy if exists "facilities_delete_auth" on public.facilities;
create policy "facilities_delete_auth" on public.facilities
  for delete to authenticated using (true);

-- Masukkan fasilitas "lain" yang sudah terlanjur dipakai kos lama (aman diulang)
insert into public.facilities (nama)
select distinct on (lower(f)) f
  from public.kos, jsonb_array_elements_text(coalesce(data -> 'fasilitas', '[]'::jsonb)) as f
 where btrim(f) <> ''
   and lower(f) not in ('ac','cctv','parkir','wifi','kamar mandi dalam','dapur bersama','kasur','lemari','meja')
on conflict do nothing;

-- ============================================================
-- PENGECEKAN (opsional): jalankan satu per satu setelah skrip di atas sukses.
-- 1) Harus mengembalikan  {"status": "tidak_ada"}
--      select public.client_open('username-yang-pasti-tidak-ada', false);
-- 2) Harus mengembalikan waktu sekarang
--      select public.server_now();
-- ============================================================
