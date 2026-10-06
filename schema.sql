-- SIMA MHS v2.0
-- 27 tabel rancangan + tabel teknis admin_otp, helper RLS, dan bucket thumbnail. Jalankan di Supabase TEST terlebih dahulu.
create extension if not exists pgcrypto;

create table if not exists periode (
 id uuid primary key default gen_random_uuid(), nama text not null unique,
 status text not null default 'aktif' check(status in ('aktif','ditutup')),
 batas_lpj date, created_at timestamptz not null default now()
);
create table if not exists profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 nim text unique, nama text not null, email text not null unique,
 tipe text not null default 'mahasiswa' check(tipe in ('mahasiswa','dosen','wakil_rektor','staf_keuangan','admin')),
 status text not null default 'aktif' check(status in ('aktif','nonaktif')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foto_path text
);
-- Kompatibilitas database lama: pastikan schema lama memiliki kolom tipe sebelum helper RLS dibuat.
alter table profiles add column if not exists tipe text;
update profiles set tipe='mahasiswa' where tipe is null;
alter table profiles alter column tipe set default 'mahasiswa';
alter table profiles alter column tipe set not null;
alter table profiles drop constraint if exists profiles_tipe_check;
alter table profiles add constraint profiles_tipe_check check(tipe in ('mahasiswa','dosen','wakil_rektor','staf_keuangan','admin'));

create table if not exists organisasi (
 id uuid primary key default gen_random_uuid(), periode_id uuid not null references periode(id),
 nama text not null, tipe text not null check(tipe in ('BEM','HMJ','UKM','Club')),
 kementerian_id uuid, aktif boolean not null default true, unique(periode_id,nama)
);
create table if not exists unit_kerja (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 jenis text not null check(jenis in ('kementerian','divisi')), nama text not null,
 aktif boolean not null default true, unique(organisasi_id,nama)
);
alter table organisasi drop constraint if exists organisasi_kementerian_id_fkey;
alter table organisasi add constraint organisasi_kementerian_id_fkey foreign key(kementerian_id) references unit_kerja(id) deferrable initially deferred;

create table if not exists keanggotaan (
 id uuid primary key default gen_random_uuid(), akun_id uuid not null references profiles(id),
 organisasi_id uuid not null references organisasi(id), unit_id uuid references unit_kerja(id),
 jabatan text not null, status text not null default 'aktif' check(status in ('aktif','nonaktif')),
 ditetapkan_oleh uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists penugasan_koordinator (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 akun_id uuid not null references profiles(id), status text not null default 'aktif',
 ditetapkan_oleh uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists pembimbing_organisasi (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 akun_id uuid not null references profiles(id), status text not null default 'aktif',
 ditetapkan_oleh uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists anggota_club (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 nama text not null, nim text, aktif boolean not null default true
);
create table if not exists impor_csv (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 diunggah_oleh uuid not null references profiles(id), nama_file text not null,
 status text not null default 'pratinjau', created_at timestamptz not null default now()
);
create table if not exists impor_csv_baris (
 id uuid primary key default gen_random_uuid(), impor_id uuid not null references impor_csv(id) on delete cascade,
 akun_id uuid references profiles(id), nomor_baris integer not null, nama text, nim text, email text,
 jabatan text, unit_nama text, status text not null default 'validasi', hasil text, pesan text
);
create table if not exists proker (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 nama text not null, jenis text not null default 'sekali', pengajuan text not null default 'mandiri',
 digabung_ke uuid references proker(id), jadwal_rencana text, tanggal_mulai date not null,
 tanggal_selesai date not null, batas_lpj date generated always as (tanggal_selesai + 7) stored,
 tempat text not null, deskripsi text, ketua_pelaksana uuid references profiles(id),
 status text not null default 'draft', alasan_tidak_terlaksana text,
 punya_sertifikat boolean not null default false, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(tanggal_selesai>=tanggal_mulai), check(jenis in ('sekali','berulang')),
 check(pengajuan in ('mandiri','kolaboratif'))
);
create table if not exists proker_kolaborator (
 proker_id uuid not null references proker(id) on delete cascade,
 organisasi_id uuid not null references organisasi(id), status text not null default 'diundang',
 porsi_plafon bigint not null default 0 check(porsi_plafon>=0),
 dikonfirmasi_oleh uuid references profiles(id), primary key(proker_id,organisasi_id)
);
create table if not exists dokumen (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 proker_id uuid references proker(id), jenis text not null check(jenis in ('proposal','lpj','laporan_akhir')),
 status text not null default 'draft', tahap_saat_ini text not null default 'menteri',
 created_at timestamptz not null default now()
);
create table if not exists dokumen_versi (
 id uuid primary key default gen_random_uuid(), dokumen_id uuid not null references dokumen(id) on delete cascade,
 nomor_versi integer not null, drive_file_id text, nama_file text,
 ukuran_bytes bigint check(ukuran_bytes is null or ukuran_bytes<=30408704),
 checksum text, keterangan text, diunggah_oleh uuid references profiles(id),
 created_at timestamptz not null default now(), unique(dokumen_id,nomor_versi)
);
create table if not exists persetujuan (
 id uuid primary key default gen_random_uuid(), dokumen_id uuid not null references dokumen(id) on delete cascade,
 tahap text not null, keputusan text not null check(keputusan in ('teruskan','revisi','setuju')),
 komentar text, oleh uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists rapat (
 id uuid primary key default gen_random_uuid(), dokumen_id uuid not null references dokumen(id) on delete cascade,
 nomor_rapat integer not null, tanggal date, peserta text, notulen text,
 hasil text check(hasil is null or hasil in ('lanjut','revisi')),
 ditulis_oleh uuid references profiles(id), created_at timestamptz not null default now(),
 unique(dokumen_id,nomor_rapat)
);
create table if not exists foto_kegiatan (
 id uuid primary key default gen_random_uuid(), proker_id uuid not null references proker(id) on delete cascade,
 dokumen_id uuid references dokumen(id), drive_file_id text, thumb_path text, nama_file text,
 ukuran_bytes bigint check(ukuran_bytes is null or ukuran_bytes<=10485760), checksum text,
 urutan integer not null default 1, diunggah_oleh uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists tautan_drive (
 id uuid primary key default gen_random_uuid(), proker_id uuid not null references proker(id) on delete cascade,
 jenis text not null, url text not null check(url like 'https://drive.google.com/%' or url like 'https://docs.google.com/%'),
 jumlah_perkiraan integer, keterangan text
);
create table if not exists sumber_dana (
 id uuid primary key default gen_random_uuid(), kode text not null unique, nama text not null,
 wajib_rincian boolean not null default false, perlu_pencairan boolean not null default false,
 hitung_plafon boolean not null default false, keterangan text
);
create table if not exists plafon_anggaran (
 id uuid primary key default gen_random_uuid(), organisasi_id uuid not null references organisasi(id),
 jumlah bigint not null default 0 check(jumlah>=0), diinput_oleh uuid references profiles(id),
 created_at timestamptz not null default now(), unique(organisasi_id)
);
create table if not exists item_anggaran (
 id uuid primary key default gen_random_uuid(), proker_id uuid not null references proker(id) on delete cascade,
 sumber_dana_id uuid not null references sumber_dana(id), kategori text, nama text not null,
 jumlah numeric(14,2) not null default 1 check(jumlah>0), harga_satuan bigint not null default 0 check(harga_satuan>=0),
 subtotal bigint generated always as (round(jumlah*harga_satuan)::bigint) stored
);
create table if not exists pencairan_dana (
 id uuid primary key default gen_random_uuid(), proker_id uuid not null references proker(id) on delete cascade,
 sumber_dana_id uuid not null references sumber_dana(id), jumlah bigint not null check(jumlah>0),
 tanggal date not null default current_date, tahap integer not null default 1,
 dicatat_oleh uuid references profiles(id)
);
create table if not exists realisasi (
 id uuid primary key default gen_random_uuid(), proker_id uuid not null references proker(id) on delete cascade,
 dokumen_id uuid references dokumen(id), item_id uuid references item_anggaran(id),
 sumber_dana_id uuid not null references sumber_dana(id), jumlah bigint not null check(jumlah>0),
 diverifikasi_oleh uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists admin_operator (
 id uuid primary key default gen_random_uuid(), akun_id uuid not null references profiles(id),
 aktif boolean not null default true, dicabut_pada timestamptz
);
create table if not exists kode_pemulihan (
 id uuid primary key default gen_random_uuid(), pemegang_akun_id uuid not null references profiles(id),
 hash_kode text not null, hangus_pada timestamptz, created_at timestamptz not null default now()
);
create table if not exists jejak_audit (
 id uuid primary key default gen_random_uuid(), akun_id uuid references profiles(id), sebagai text,
 aksi text not null, objek text, objek_id uuid, nilai_lama jsonb, nilai_baru jsonb,
 waktu timestamptz not null default now()
);
create table if not exists notifikasi (
 id uuid primary key default gen_random_uuid(), akun_id uuid not null references profiles(id),
 organisasi_id uuid references organisasi(id), pesan text not null, dibaca boolean not null default false,
 created_at timestamptz not null default now()
);

insert into sumber_dana(kode,nama,wajib_rincian,perlu_pencairan,hitung_plafon) values
('KAMPUS','Dana kampus',true,true,true),('PRODI','Dana prodi',true,true,false),
('AKREDITASI_KAMPUS','Dana akreditasi (kampus)',true,true,false),('AKREDITASI_PRODI','Dana akreditasi (prodi)',true,true,false),
('KAS','Kas organisasi',false,false,false),('PRIBADI','Dana pribadi',false,false,false),('LAINNYA','Lainnya',false,false,false)
on conflict(kode) do nothing;

create or replace function org_saya() returns setof uuid language sql stable security definer set search_path=public
as $$ select organisasi_id from keanggotaan where akun_id=auth.uid() and status='aktif' $$;
create or replace function org_binaan() returns setof uuid language sql stable security definer set search_path=public
as $$ select organisasi_id from penugasan_koordinator where akun_id=auth.uid() and status='aktif'
union select o.id from organisasi o join unit_kerja u on u.id=o.kementerian_id
join keanggotaan k on k.unit_id=u.id where k.akun_id=auth.uid() and k.jabatan='Menteri' and k.status='aktif' $$;
create or replace function lihat_semua() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and tipe in('admin','wakil_rektor')) $$;
create or replace function pengurus_inti() returns setof uuid language sql stable security definer set search_path=public
as $$ select organisasi_id from keanggotaan where akun_id=auth.uid() and status='aktif'
and jabatan in('Presiden','Wakil Presiden','Ketua','Wakil','Sekretaris','Bendahara','Menteri','Ketua Divisi') $$;
create or replace function proses_persetujuan(p_dokumen uuid,p_keputusan text,p_komentar text)
returns void language plpgsql security definer set search_path=public as $$
declare d dokumen%rowtype; next_tahap text;
begin
 select * into d from dokumen where id=p_dokumen for update;
 if not found then raise exception 'Dokumen tidak ditemukan'; end if;
 if p_keputusan not in('teruskan','revisi','setuju') then raise exception 'Keputusan tidak valid'; end if;
 if p_keputusan='revisi' and length(trim(coalesce(p_komentar,'')))=0 then raise exception 'Komentar wajib saat meminta revisi'; end if;
 if d.organisasi_id in(select org_saya()) then raise exception 'Tidak boleh memutuskan dokumen organisasi sendiri'; end if;
 if not(d.organisasi_id in(select org_binaan()) or lihat_semua()) then raise exception 'Anda tidak berwenang pada dokumen ini'; end if;
 insert into persetujuan(dokumen_id,tahap,keputusan,komentar,oleh) values(p_dokumen,d.tahap_saat_ini,p_keputusan,p_komentar,auth.uid());
 if p_keputusan='revisi' then update dokumen set status='revisi' where id=p_dokumen;
 elsif p_keputusan='setuju' then
   if d.tahap_saat_ini<>'pembimbing' then raise exception 'Persetujuan akhir hanya pada tahap pembimbing'; end if;
   update dokumen set status='disetujui' where id=p_dokumen;
 else
   next_tahap=case d.tahap_saat_ini when 'menteri' then 'koordinator' when 'koordinator' then 'bph' when 'bph' then 'pembimbing' else 'pembimbing' end;
   update dokumen set tahap_saat_ini=next_tahap,status=case when next_tahap='pembimbing' then 'diajukan_pembimbing' else 'diajukan' end where id=p_dokumen;
 end if;
end $$;
revoke all on function proses_persetujuan(uuid,text,text) from public;
grant execute on function proses_persetujuan(uuid,text,text) to authenticated;

do $$ declare t text; begin
 foreach t in array array['periode','profiles','organisasi','unit_kerja','keanggotaan','penugasan_koordinator','pembimbing_organisasi','anggota_club','impor_csv','impor_csv_baris','proker','proker_kolaborator','dokumen','dokumen_versi','persetujuan','rapat','foto_kegiatan','tautan_drive','sumber_dana','plafon_anggaran','item_anggaran','pencairan_dana','realisasi','admin_operator','kode_pemulihan','jejak_audit','notifikasi'] loop
   execute format('alter table %I enable row level security',t);
 end loop; end $$;

drop policy if exists profiles_read on profiles; create policy profiles_read on profiles for select using(id=auth.uid() or lihat_semua());
drop policy if exists periode_read on periode; create policy periode_read on periode for select using(auth.uid() is not null);
drop policy if exists organisasi_read on organisasi; create policy organisasi_read on organisasi for select using(id in(select org_saya()) or id in(select org_binaan()) or lihat_semua());
drop policy if exists unit_read on unit_kerja; create policy unit_read on unit_kerja for select using(auth.uid() is not null);
drop policy if exists keanggotaan_read on keanggotaan; create policy keanggotaan_read on keanggotaan for select using(akun_id=auth.uid() or organisasi_id in(select org_saya()) or lihat_semua());
drop policy if exists koordinator_read on penugasan_koordinator; create policy koordinator_read on penugasan_koordinator for select using(akun_id=auth.uid() or organisasi_id in(select org_saya()) or lihat_semua());
drop policy if exists pembimbing_read on pembimbing_organisasi; create policy pembimbing_read on pembimbing_organisasi for select using(akun_id=auth.uid() or organisasi_id in(select org_saya()) or lihat_semua());
drop policy if exists club_read on anggota_club; create policy club_read on anggota_club for select using(organisasi_id in(select org_saya()) or lihat_semua());
drop policy if exists proker_read on proker; create policy proker_read on proker for select using(organisasi_id in(select org_saya()) or organisasi_id in(select org_binaan()) or lihat_semua());
drop policy if exists proker_write on proker; create policy proker_write on proker for all using(organisasi_id in(select pengurus_inti())) with check(organisasi_id in(select pengurus_inti()));
drop policy if exists kolab_read on proker_kolaborator; create policy kolab_read on proker_kolaborator for select using(organisasi_id in(select org_saya()) or proker_id in(select id from proker where organisasi_id in(select org_saya())) or lihat_semua());
drop policy if exists dokumen_read on dokumen; create policy dokumen_read on dokumen for select using(organisasi_id in(select org_saya()) or organisasi_id in(select org_binaan()) or lihat_semua());
drop policy if exists dokumen_write on dokumen; create policy dokumen_write on dokumen for all using(organisasi_id in(select pengurus_inti())) with check(organisasi_id in(select pengurus_inti()));
drop policy if exists sumber_read on sumber_dana; create policy sumber_read on sumber_dana for select using(auth.uid() is not null);
drop policy if exists plafon_read on plafon_anggaran; create policy plafon_read on plafon_anggaran for select using(organisasi_id in(select org_saya()) or lihat_semua());
drop policy if exists item_read on item_anggaran; create policy item_read on item_anggaran for select using(proker_id in(select id from proker));
drop policy if exists item_write on item_anggaran; create policy item_write on item_anggaran for all using(proker_id in(select id from proker where organisasi_id in(select pengurus_inti()))) with check(proker_id in(select id from proker where organisasi_id in(select pengurus_inti())));
drop policy if exists cair_read on pencairan_dana; create policy cair_read on pencairan_dana for select using(proker_id in(select id from proker));
drop policy if exists realisasi_read on realisasi; create policy realisasi_read on realisasi for select using(proker_id in(select id from proker));
drop policy if exists versi_read on dokumen_versi; create policy versi_read on dokumen_versi for select using(dokumen_id in(select id from dokumen));
drop policy if exists persetujuan_read on persetujuan; create policy persetujuan_read on persetujuan for select using(dokumen_id in(select id from dokumen));
drop policy if exists rapat_read on rapat; create policy rapat_read on rapat for select using(dokumen_id in(select id from dokumen));
drop policy if exists foto_read on foto_kegiatan; create policy foto_read on foto_kegiatan for select using(proker_id in(select id from proker));
drop policy if exists drive_read on tautan_drive; create policy drive_read on tautan_drive for select using(proker_id in(select id from proker));
drop policy if exists notif_read on notifikasi; create policy notif_read on notifikasi for select using(akun_id=auth.uid());
drop policy if exists audit_read on jejak_audit; create policy audit_read on jejak_audit for select using((select tipe from profiles where id=auth.uid()) in('admin','wakil_rektor'));


-- Integrasi teknis Edge Functions
alter table admin_operator add column if not exists email text;
create table if not exists admin_otp (
  id uuid primary key default gen_random_uuid(),
  admin_akun_id uuid not null references profiles(id) on delete cascade,
  operator_id uuid not null references admin_operator(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table admin_otp enable row level security;
drop policy if exists admin_otp_read on admin_otp;
create policy admin_otp_read on admin_otp for select using(admin_akun_id=auth.uid());

-- Penyimpanan file utama menggunakan Google Drive API. Kolom foto_kegiatan.thumb_path dipertahankan nullable hanya untuk kompatibilitas data lama; aplikasi baru tidak mengunggah file ke Supabase Storage.
-- Profil pengguna dan notifikasi pribadi
alter table profiles add column if not exists foto_path text;

create or replace function update_profile_me(
  p_nama text,
  p_nim text default null,
  p_foto_path text default null,
  p_email text default null
) returns profiles
language plpgsql
security definer
set search_path=public
as $
declare r profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Anda belum login'; end if;
  if length(trim(coalesce(p_nama,'')))=0 then raise exception 'Nama wajib diisi'; end if;

  update profiles
  set nama=trim(p_nama),
      nim=nullif(trim(coalesce(p_nim,'')),''),
      email=coalesce(nullif(trim(coalesce(p_email,'')),''),email),
      foto_path=coalesce(nullif(trim(coalesce(p_foto_path,'')),''),foto_path),
      updated_at=now()
  where id=auth.uid()
  returning * into r;

  if not found then raise exception 'Profil belum tersedia'; end if;
  return r;
end $;

revoke all on function update_profile_me(text,text,text,text) from public;
grant execute on function update_profile_me(text,text,text,text) to authenticated;

create or replace function tandai_notifikasi_dibaca(p_id uuid default null)
returns void
language sql
security definer
set search_path=public
as $
  update notifikasi
  set dibaca=true
  where akun_id=auth.uid()
    and (p_id is null or id=p_id);
$;

revoke all on function tandai_notifikasi_dibaca(uuid) from public;
grant execute on function tandai_notifikasi_dibaca(uuid) to authenticated;

create index if not exists notifikasi_akun_unread_idx
on notifikasi(akun_id,dibaca,created_at desc);

-- Foto profil: bucket privat, tiap akun hanya dapat mengakses folder miliknya.
insert into storage.buckets(id,name,public)
values('profile-avatars','profile-avatars',false)
on conflict(id) do update set public=false;

drop policy if exists profile_avatar_select on storage.objects;
create policy profile_avatar_select
on storage.objects for select
to authenticated
using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists profile_avatar_insert on storage.objects;
create policy profile_avatar_insert
on storage.objects for insert
to authenticated
with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists profile_avatar_update on storage.objects;
create policy profile_avatar_update
on storage.objects for update
to authenticated
using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists profile_avatar_delete on storage.objects;
create policy profile_avatar_delete
on storage.objects for delete
to authenticated
using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

