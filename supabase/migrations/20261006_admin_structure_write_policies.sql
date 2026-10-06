drop policy if exists periode_write on public.periode;
create policy periode_write on public.periode
for all to authenticated
using(public.lihat_semua())
with check(public.lihat_semua());

drop policy if exists organisasi_write on public.organisasi;
create policy organisasi_write on public.organisasi
for all to authenticated
using(public.lihat_semua())
with check(public.lihat_semua());

drop policy if exists unit_write on public.unit_kerja;
create policy unit_write on public.unit_kerja
for all to authenticated
using(public.lihat_semua())
with check(public.lihat_semua());