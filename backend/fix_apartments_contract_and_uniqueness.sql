-- Migration: align apartments.current_contract_id type and apartment business uniqueness
-- Run in Supabase SQL editor.

begin;

-- 1) Resolve existing duplicates first, then enforce uniqueness.
--    Keep the lowest apartment id for each (building_id, apartment_number).
create temp table apartment_dedupe_map on commit drop as
with duplicate_groups as (
  select building_id, apartment_number, min(id) as keep_id
  from public.apartments
  where building_id is not null and apartment_number is not null
  group by building_id, apartment_number
  having count(*) > 1
)
select a.id as old_id, g.keep_id
from public.apartments a
join duplicate_groups g
  on a.building_id = g.building_id
 and a.apartment_number = g.apartment_number
where a.id <> g.keep_id;

-- Repoint references before deleting duplicates.
update public.contracts c
set apartment_id = m.keep_id
from apartment_dedupe_map m
where c.apartment_id = m.old_id;

update public.tenants t
set apartment_id = m.keep_id
from apartment_dedupe_map m
where t.apartment_id = m.old_id;

delete from public.apartments a
using apartment_dedupe_map m
where a.id = m.old_id;

-- Now enforce apartment identity uniqueness.
create unique index if not exists apartments_building_id_apartment_number_uniq
on public.apartments (building_id, apartment_number)
where building_id is not null and apartment_number is not null;

-- 2) Convert current_contract_id from varchar/text to integer-compatible column.
--    Keep only numeric values, null out anything non-numeric before cast.
alter table public.apartments
  alter column current_contract_id drop default;

update public.apartments
set current_contract_id = null
where current_contract_id is not null
  and current_contract_id !~ '^[0-9]+$';

alter table public.apartments
  alter column current_contract_id type integer
  using nullif(current_contract_id::text, '')::integer;

-- 3) Add FK from apartments.current_contract_id to contracts.id.
do $$
begin
  begin
    alter table public.apartments
      add constraint apartments_current_contract_id_fkey
      foreign key (current_contract_id)
      references public.contracts(id)
      on delete set null;
  exception when duplicate_object then
    null;
  end;
end $$;

commit;
