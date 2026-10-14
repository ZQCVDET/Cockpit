-- ─────────────────────────────────────────────────────────────
--  Complément : agenda "à la carte" (ex. agenda public du Cercle Solvay).
--  À lancer UNE fois dans Supabase → SQL Editor → New query → Run.
--  Sans danger si tu le relances : rien n'est effacé.
-- ─────────────────────────────────────────────────────────────

-- 1. Un événement peut être "optionnel" (à la carte)
alter table public.events add column if not exists optional boolean not null default false;

-- 2. Nouveaux statuts : "going" = « J'y vais », "skip" = « Je n'y vais pas » (séances d'exercices à choix)
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('present', 'rate', 'rattrape', 'going', 'skip'));

-- 3. Prévenir l'API du changement
notify pgrst, 'reload schema';
