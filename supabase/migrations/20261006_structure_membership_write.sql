-- Allow active organizational core officers to manage their own membership roster.
drop policy if exists keanggotaan_write on public.keanggotaan;
create policy keanggotaan_write
on public.keanggotaan
for all
to authenticated
using(
  organisasi_id in(select public.pengurus_inti())
  or public.lihat_semua()
)
with check(
  organisasi_id in(select public.pengurus_inti())
  or public.lihat_semua()
);
