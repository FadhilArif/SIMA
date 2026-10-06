-- SIMA MHS module completion / RLS hardening
alter table public.dokumen
  add column if not exists catatan_pengaju text;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read
on public.profiles for select
to authenticated
using(
  id=auth.uid()
  or public.lihat_semua()
  or id in(
    select k.akun_id
    from public.keanggotaan k
    where k.organisasi_id in(select public.org_saya())
  )
);

drop policy if exists rapat_write on public.rapat;
create policy rapat_write
on public.rapat
for all to authenticated
using(
  dokumen_id in(
    select d.id
    from public.dokumen d
    where d.organisasi_id in(select public.pengurus_inti())
  )
)
with check(
  dokumen_id in(
    select d.id
    from public.dokumen d
    where d.organisasi_id in(select public.pengurus_inti())
  )
);

drop policy if exists plafon_write on public.plafon_anggaran;
create policy plafon_write
on public.plafon_anggaran
for all to authenticated
using(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.tipe in('wakil_rektor','staf_keuangan')
      and p.status='aktif'
  )
)
with check(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.tipe in('wakil_rektor','staf_keuangan')
      and p.status='aktif'
  )
);

drop policy if exists pencairan_write on public.pencairan_dana;
create policy pencairan_write
on public.pencairan_dana
for all to authenticated
using(
  exists(
    select 1
    from public.proker pr
    where pr.id=pencairan_dana.proker_id
      and(
        exists(
          select 1 from public.profiles p
          where p.id=auth.uid()
            and p.tipe='wakil_rektor'
            and p.status='aktif'
        )
        or exists(
          select 1 from public.pembimbing_organisasi pb
          where pb.akun_id=auth.uid()
            and pb.organisasi_id=pr.organisasi_id
            and pb.status='aktif'
        )
      )
  )
)
with check(
  exists(
    select 1
    from public.proker pr
    where pr.id=pencairan_dana.proker_id
      and(
        exists(
          select 1 from public.profiles p
          where p.id=auth.uid()
            and p.tipe='wakil_rektor'
            and p.status='aktif'
        )
        or exists(
          select 1 from public.pembimbing_organisasi pb
          where pb.akun_id=auth.uid()
            and pb.organisasi_id=pr.organisasi_id
            and pb.status='aktif'
        )
      )
  )
);

drop policy if exists realisasi_write on public.realisasi;
create policy realisasi_write
on public.realisasi
for all to authenticated
using(
  exists(
    select 1
    from public.proker pr
    where pr.id=realisasi.proker_id
      and(
        exists(
          select 1 from public.profiles p
          where p.id=auth.uid()
            and p.tipe='wakil_rektor'
            and p.status='aktif'
        )
        or exists(
          select 1 from public.pembimbing_organisasi pb
          where pb.akun_id=auth.uid()
            and pb.organisasi_id=pr.organisasi_id
            and pb.status='aktif'
        )
      )
  )
)
with check(
  exists(
    select 1
    from public.proker pr
    where pr.id=realisasi.proker_id
      and(
        exists(
          select 1 from public.profiles p
          where p.id=auth.uid()
            and p.tipe='wakil_rektor'
            and p.status='aktif'
        )
        or exists(
          select 1 from public.pembimbing_organisasi pb
          where pb.akun_id=auth.uid()
            and pb.organisasi_id=pr.organisasi_id
            and pb.status='aktif'
        )
      )
  )
);

drop policy if exists notifikasi_update_self on public.notifikasi;
create policy notifikasi_update_self
on public.notifikasi
for update to authenticated
using(akun_id=auth.uid())
with check(akun_id=auth.uid());
