-- Replace Corey's tracking workbook (9/24): program templates assigned to many athletes,
-- coach-side logging of weight used, and the roster fields the sheet tracks.

-- roster fields from the workbook's Roster tab
alter table public.athletes add column if not exists season text check (season in ('in_season','off_season'));
alter table public.athletes add column if not exists frequency text;      -- '1x/week' | '2x/week' | '3x/week'
alter table public.athletes add column if not exists class_days text;     -- e.g. 'Mon / Wed (PM1)'
alter table public.athletes add column if not exists nutrition_plan boolean not null default false;

-- a program Corey writes once: days → exercises with a target for each week
-- days: [{ key, label, weekday (1=Mon..7=Sun), warmup, cue, finish,
--          exercises: [{ name, group, prescription, block, weeks:[1..], targets: {"1": "3 x 55%", ...} }] }]
create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text check (season in ('in_season','off_season')),
  weeks int not null check (weeks between 1 and 52),
  description text,
  days jsonb not null default '[]'::jsonb,
  source text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger program_templates_touch before update on public.program_templates for each row execute procedure public.touch_updated_at();

-- one athlete on one program from a start date
create table if not exists public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.program_templates(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  start_date date not null,
  day_weekdays jsonb not null default '{}'::jsonb,   -- { dayKey: weekday } overrides, e.g. Day 2 on Tue or Wed
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists program_assignments_athlete_idx on public.program_assignments(athlete_id);

alter table public.workouts add column if not exists template_id uuid references public.program_templates(id) on delete set null;
alter table public.workouts add column if not exists assignment_id uuid references public.program_assignments(id) on delete cascade;
alter table public.workouts add column if not exists day_key text;
create index if not exists workouts_assignment_idx on public.workouts(assignment_id);

alter table public.program_templates enable row level security;
alter table public.program_assignments enable row level security;
create policy program_templates_admin_all on public.program_templates for all using (public.is_admin()) with check (public.is_admin());
create policy program_assignments_admin_all on public.program_assignments for all using (public.is_admin()) with check (public.is_admin());
create policy program_assignments_family_read on public.program_assignments for select using (public.is_my_athlete(athlete_id));
grant all on public.program_templates, public.program_assignments to authenticated;

-- staff read every log (already via workout_logs_admin_all); one coach log per athlete per workout
create unique index if not exists workout_logs_coach_one_per_workout
  on public.workout_logs(workout_id, owner_id) where workout_id is not null;
