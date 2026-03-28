
create table public.carousel_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  message text not null default '',
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carousel_templates enable row level security;

create policy "Users can manage own carousel templates"
  on public.carousel_templates
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
