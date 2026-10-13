-- ─────────────────────────────────────────────────────────────
--  Complément : table des tâches + statut "Assisté" pour les cours.
--  À lancer UNE fois dans Supabase → SQL Editor → New query → Run.
--  Sans danger si tu le relances : rien n'est effacé.
-- ─────────────────────────────────────────────────────────────

-- 1. Les séances de cours peuvent être "assistées" (present), "ratées" ou "rattrapées"
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('present', 'rate', 'rattrape'));

-- 2. La to-do list
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  title            text not null,
  category         text,
  priority         text not null default 'normale' check (priority in ('urgent', 'haute', 'normale', 'basse')),
  due_date         date,
  estimate_minutes integer,
  progress_minutes integer not null default 0,
  status           text not null default 'todo' check (status in ('todo', 'done')),
  notes            text,
  source           text not null default 'manual',
  external_id      text,
  external_url     text,
  external_done    boolean not null default false,
  done_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, external_id)
);

alter table public.tasks enable row level security;
drop policy if exists "mes lignes" on public.tasks;
create policy "mes lignes" on public.tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.tasks to authenticated;

-- 3. Prévenir l'API qu'une nouvelle table existe
notify pgrst, 'reload schema';
