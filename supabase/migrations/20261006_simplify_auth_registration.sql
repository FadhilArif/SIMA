alter table public.proker_kolaborator add column if not exists komentar text;

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

drop policy if exists notifikasi_admin_write on public.notifikasi;
create policy notifikasi_admin_write
on public.notifikasi
for insert
to authenticated
with check(public.lihat_semua());


create or replace function public.pengurus_inti()
returns setof uuid
language sql
stable
security definer
set search_path=public
as $
  select organisasi_id
  from public.keanggotaan
  where akun_id=auth.uid()
    and status='aktif'
    and jabatan in(
      'Presiden','Wakil Presiden','Ketua','Wakil',
      'Sekretaris','Bendahara','Menteri','Ketua Divisi'
    );
$;

revoke all on function public.pengurus_inti() from public;
grant execute on function public.pengurus_inti() to authenticated;

create or replace function public.organisasi_periode_aktif(p_organisasi uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.organisasi o
    join public.periode p on p.id=o.periode_id
    where o.id=p_organisasi
      and o.aktif=true
      and p.status='aktif'
  );
$$;

drop policy if exists tautan_drive_write on public.tautan_drive;
create policy tautan_drive_write
on public.tautan_drive
for insert
to authenticated
with check(
  proker_id in(
    select id
    from public.proker
    where organisasi_id in(select public.pengurus_inti())
      and public.organisasi_periode_aktif(organisasi_id)
  )
);

drop policy if exists proker_write on public.proker;
create policy proker_write
on public.proker
for all
to authenticated
using(
  organisasi_id in(select public.pengurus_inti())
  and public.organisasi_periode_aktif(organisasi_id)
)
with check(
  organisasi_id in(select public.pengurus_inti())
  and public.organisasi_periode_aktif(organisasi_id)
);

drop policy if exists dokumen_write on public.dokumen;
create policy dokumen_write
on public.dokumen
for all
to authenticated
using(
  organisasi_id in(select public.pengurus_inti())
  and public.organisasi_periode_aktif(organisasi_id)
)
with check(
  organisasi_id in(select public.pengurus_inti())
  and public.organisasi_periode_aktif(organisasi_id)
);

drop policy if exists item_write on public.item_anggaran;
create policy item_write
on public.item_anggaran
for all
to authenticated
using(
  proker_id in(
    select id
    from public.proker
    where organisasi_id in(select public.pengurus_inti())
      and public.organisasi_periode_aktif(organisasi_id)
  )
)
with check(
  proker_id in(
    select id
    from public.proker
    where organisasi_id in(select public.pengurus_inti())
      and public.organisasi_periode_aktif(organisasi_id)
  )
);
