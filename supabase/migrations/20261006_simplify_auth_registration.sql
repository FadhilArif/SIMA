-- SIMA MHS Production compatibility and registration hardening
alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check(status in ('menunggu','aktif','nonaktif','ditolak'));

drop trigger if exists t_profil on auth.users;
drop function if exists public.buat_profil();

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check(
  id = auth.uid()
  and tipe = 'mahasiswa'
  and status = 'menunggu'
);

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
on public.profiles
for update
to authenticated
using(public.lihat_semua())
with check(public.lihat_semua());

drop policy if exists keanggotaan_admin_write on public.keanggotaan;
create policy keanggotaan_admin_write
on public.keanggotaan
for all
to authenticated
using(public.lihat_semua())
with check(public.lihat_semua());

drop policy if exists pembimbing_admin_write on public.pembimbing_organisasi;
create policy pembimbing_admin_write
on public.pembimbing_organisasi
for all
to authenticated
using(public.lihat_semua())
with check(public.lihat_semua());

drop policy if exists tautan_drive_write on public.tautan_drive;
create policy tautan_drive_write
on public.tautan_drive
for insert
to authenticated
with check(
  proker_id in (
    select id
    from public.proker
    where organisasi_id in(select public.pengurus_inti())
  )
);


drop policy if exists notifikasi_admin_write on public.notifikasi;
create policy notifikasi_admin_write
on public.notifikasi
for insert
to authenticated
with check(public.lihat_semua());
