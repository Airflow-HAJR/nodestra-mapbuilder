-- Create maps table for multi-map support
-- Run this in your Supabase SQL Editor

create table if not exists maps (
  id          uuid primary key default gen_random_uuid(),
  airport_id  text not null references airports(id) on delete cascade,
  parent_id   uuid references maps(id) on delete cascade,
  name        text not null default 'Untitled Map',
  sort_order  integer not null default 0,
  graph_map   jsonb,
  floor_plan_data text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_maps_airport on maps(airport_id);
create index if not exists idx_maps_parent on maps(parent_id);

-- RLS
alter table maps enable row level security;

create policy "Users can view maps for their airport"
  on maps for select
  using (airport_id in (select airport_id from airport_users where id = auth.uid()));

create policy "Users can insert maps for their airport"
  on maps for insert
  with check (airport_id in (select airport_id from airport_users where id = auth.uid()));

create policy "Users can update maps for their airport"
  on maps for update
  using (airport_id in (select airport_id from airport_users where id = auth.uid()));

create policy "Users can delete maps for their airport"
  on maps for delete
  using (airport_id in (select airport_id from airport_users where id = auth.uid()));

-- Migrate existing airport data into a default map
insert into maps (airport_id, name, graph_map, floor_plan_data)
select id, 'Main Terminal', graph_map, floor_plan_data
from airports
where graph_map is not null or floor_plan_data is not null;
