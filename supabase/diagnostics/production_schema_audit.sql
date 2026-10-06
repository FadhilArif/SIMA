-- SIMA MHS Production schema audit
-- Run in Supabase SQL Editor. Read-only diagnostics except for no data changes.

select
  'profiles.created_at' as check_name,
  exists(
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='created_at'
  ) as ok
union all
select
  'profiles.updated_at',
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='updated_at'
  )
union all
select
  'organisasi.aktif',
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='organisasi' and column_name='aktif'
  )
union all
select
  'proker_kolaborator.komentar',
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='proker_kolaborator' and column_name='komentar'
  )
union all
select
  'profiles_insert_self policy',
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='profiles_insert_self'
  )
union all
select
  'tautan_drive_write policy',
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='tautan_drive' and policyname='tautan_drive_write'
  )
union all
select
  'notifikasi_admin_write policy',
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='notifikasi' and policyname='notifikasi_admin_write'
  )
union all
select
  'auth signup trigger removed',
  not exists(
    select 1
    from pg_trigger
    where tgrelid='auth.users'::regclass
      and tgname='t_profil'
      and not tgisinternal
  );

select
  c.table_name,
  c.column_name,
  c.data_type
from information_schema.columns c
where c.table_schema='public'
  and c.table_name in (
    'profiles','periode','organisasi','unit_kerja',
    'keanggotaan','penugasan_koordinator','pembimbing_organisasi',
    'proker','proker_kolaborator','dokumen','tautan_drive',
    'notifikasi','admin_operator','admin_otp'
  )
order by c.table_name,c.ordinal_position;
