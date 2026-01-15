-- Create quizzes table to store separate quiz content
create table public.quizzes (
  id uuid not null default gen_random_uuid (),
  item_id uuid not null references public.structure_items (id) on delete cascade,
  content text null, -- Stores the plain text quiz format (Q1... A... etc)
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint quizzes_pkey primary key (id),
  constraint quizzes_item_id_key unique (item_id) -- One quiz per structure item (1:1 relationship)
);

-- RLS Policies
alter table public.quizzes enable row level security;

create policy "Enable read access for all users" on public.quizzes
  for select using (true);

create policy "Enable insert for authenticated users" on public.quizzes
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated users" on public.quizzes
  for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated users" on public.quizzes
  for delete using (auth.role() = 'authenticated');

-- Add index for performance
create index quizzes_item_id_idx on public.quizzes (item_id);
