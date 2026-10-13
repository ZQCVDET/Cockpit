-- ─────────────────────────────────────────────────────────────
--  Cockpit : structure de la base de données
--  À coller UNE FOIS dans Supabase → SQL Editor → "Run".
--
--  5 tables (= 5 "feuilles Excel") :
--    events       → l'agenda (cours importés + événements ajoutés à la main)
--    work_logs    → le journal de travail
--    newsletters  → les newsletters importées depuis Gmail
--    tasks        → ta to-do list (ajouts manuels + tâches importées de Notion)
--    settings     → tes réglages (1 ligne)
--
--  Sécurité (RLS = Row Level Security) : chaque ligne appartient à un
--  utilisateur, et un utilisateur ne peut lire/modifier QUE ses lignes.
--  C'est ce qui permet de mettre la clé "anon" dans le code public.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  uid         text,                              -- identifiant venant du calendrier (vide pour les ajouts manuels)
  source      text not null default 'manual',    -- 'ics' (calendrier) ou 'manual'
  kind        text not null default 'perso',     -- cours | reunion | club | job | examen | perso
  title       text not null,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text check (status in ('present', 'rate', 'rattrape')),  -- vide = pas encore pointée
  notes       text,
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, uid)
);
create index if not exists events_user_start on public.events (user_id, starts_at);

create table if not exists public.work_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  category    text not null,
  subject     text,
  minutes     integer not null check (minutes > 0),
  day         date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists work_logs_user_day on public.work_logs (user_id, day);

create table if not exists public.newsletters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  message_id  text not null,
  thread_id   text,
  sender      text,
  subject     text,
  snippet     text,
  body_html   text,
  received_at timestamptz,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, message_id)
);
create index if not exists newsletters_user_received on public.newsletters (user_id, received_at desc);

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  title            text not null,
  category         text,
  priority         text not null default 'normale' check (priority in ('urgent', 'haute', 'normale', 'basse')),
  due_date         date,                              -- deadline (vide = pas de deadline)
  estimate_minutes integer,                           -- temps estimé (vide = "à estimer", pas planifiée)
  progress_minutes integer not null default 0,        -- temps déjà passé dessus
  status           text not null default 'todo' check (status in ('todo', 'done')),
  notes            text,
  source           text not null default 'manual',    -- 'manual' ou 'notion'
  external_id      text,                              -- identifiant de la page Notion
  external_url     text,
  external_done    boolean not null default false,    -- cochée comme terminée dans Notion
  done_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, external_id)
);

create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Sécurité ────────────────────────────────────────────────
alter table public.events      enable row level security;
alter table public.work_logs   enable row level security;
alter table public.newsletters enable row level security;
alter table public.settings    enable row level security;
alter table public.tasks       enable row level security;

drop policy if exists "mes lignes" on public.events;
drop policy if exists "mes lignes" on public.work_logs;
drop policy if exists "mes lignes" on public.newsletters;
drop policy if exists "mes lignes" on public.settings;
drop policy if exists "mes lignes" on public.tasks;

create policy "mes lignes" on public.events      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mes lignes" on public.work_logs   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mes lignes" on public.newsletters for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mes lignes" on public.settings    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mes lignes" on public.tasks       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.events, public.work_logs, public.newsletters, public.settings, public.tasks to authenticated;
