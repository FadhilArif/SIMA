create or replace function public.admin_list_organisasi()
returns table(
  id uuid,
  periode_id uuid,
  nama text,
  tipe text,
  aktif boolean,
  periode_nama text,
  periode_status text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.tipe='admin'
      and p.status='aktif'
  ) then
    raise exception 'Akses Admin diperlukan';
  end if;

  return query
  select
    o.id,
    o.periode_id,
    o.nama,
    o.tipe,
    o.aktif,
    p.nama,
    p.status
  from public.organisasi o
  join public.periode p on p.id=o.periode_id
  order by p.nama desc, o.nama asc;
end;
$$;

revoke all on function public.admin_list_organisasi() from public;
grant execute on function public.admin_list_organisasi() to authenticated;
