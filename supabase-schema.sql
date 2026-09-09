-- Run this once in the Supabase SQL Editor.
-- The server keeps the existing JSON-shaped API data in one row so the migration
-- does not change the current frontend contract.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- The server uses the service-role key, so browser clients cannot read this row.
revoke all on table public.app_state from anon, authenticated;
