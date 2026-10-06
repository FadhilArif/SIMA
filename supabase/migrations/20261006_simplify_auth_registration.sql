-- SIMA MHS: simplify public registration
-- Run once on an existing Production database.
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
