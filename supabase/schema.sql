-- Shiftline schema. Run once in the Supabase SQL Editor or with the Supabase CLI.
-- Every row belongs to its manager. RLS and composite foreign keys prevent cross-account access.

create extension if not exists pgcrypto;

create table if not exists public.bars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  opening_time time not null,
  closing_time time not null,
  time_zone text not null default 'Europe/Amsterdam',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  roles text[] not null default '{}',
  skills text[] not null default '{}',
  availability jsonb not null default '{}'::jsonb,
  max_weekly_hours numeric(5,2) check (max_weekly_hours is null or max_weekly_hours >= 0),
  contract_type text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.employee_bars (
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null,
  bar_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (employee_id, bar_id),
  foreign key (employee_id, user_id) references public.employees(id, user_id) on delete cascade,
  foreign key (bar_id, user_id) references public.bars(id, user_id) on delete cascade
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null check (extract(day from month_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_start),
  unique (id, user_id)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id uuid not null,
  bar_id uuid not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  employee_id uuid,
  role text,
  required_skills text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled', 'tentative')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (schedule_id, user_id) references public.schedules(id, user_id) on delete cascade,
  foreign key (bar_id, user_id) references public.bars(id, user_id) on delete cascade,
  foreign key (employee_id, user_id) references public.employees(id, user_id) on delete set null (employee_id),
  unique (id, user_id)
);

create index if not exists shifts_user_date_idx on public.shifts(user_id, date);
create index if not exists shifts_employee_date_idx on public.shifts(user_id, employee_id, date);

create table if not exists public.staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bar_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO weekday: Monday=1
  start_time time not null,
  end_time time not null,
  minimum_staff integer not null check (minimum_staff > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bar_id, user_id) references public.bars(id, user_id) on delete cascade
);

create table if not exists public.rule_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rules jsonb not null default '{"availability":true,"maximumHours":true,"overlaps":true,"staffing":true,"openingHours":true}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Copy a monthly schedule in one transaction. Existing target shifts are only replaced
-- when the manager confirms the overwrite in the interface.
create or replace function public.copy_schedule_month(p_source_month date, p_target_month date, p_replace_existing boolean default false)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  manager_id uuid := auth.uid();
  source_schedule_id uuid;
  target_schedule_id uuid;
  target_shift_count integer;
  copied_count integer;
  target_last_day date;
begin
  if manager_id is null then raise exception 'Authentication required'; end if;
  if extract(day from p_source_month) <> 1 or extract(day from p_target_month) <> 1 then
    raise exception 'Schedule months must begin on the first day of a month';
  end if;
  if p_source_month = p_target_month then raise exception 'Choose a different source month'; end if;

  select id into source_schedule_id from public.schedules
    where user_id = manager_id and month_start = p_source_month;
  if source_schedule_id is null then raise exception 'The source month does not have a schedule yet'; end if;

  insert into public.schedules(user_id, month_start, status)
    values (manager_id, p_target_month, 'draft')
    on conflict (user_id, month_start) do update set status = 'draft', updated_at = now()
    returning id into target_schedule_id;

  select count(*) into target_shift_count from public.shifts where schedule_id = target_schedule_id;
  if target_shift_count > 0 and not p_replace_existing then
    raise exception 'The target month already has shifts. Confirm before replacing them.';
  end if;

  delete from public.shifts where schedule_id = target_schedule_id;
  target_last_day := (p_target_month + interval '1 month' - interval '1 day')::date;
  insert into public.shifts(user_id, schedule_id, bar_id, date, start_time, end_time, employee_id, role, required_skills, status, notes)
    select manager_id,
      target_schedule_id,
      bar_id,
      p_target_month + least(extract(day from date)::integer - 1, extract(day from target_last_day)::integer - 1),
      start_time, end_time, employee_id, role, required_skills, status, notes
    from public.shifts
    where schedule_id = source_schedule_id;
  get diagnostics copied_count = row_count;
  return copied_count;
end;
$$;

revoke all on function public.copy_schedule_month(date, date, boolean) from public, anon;
grant execute on function public.copy_schedule_month(date, date, boolean) to authenticated;

-- Explicit grants plus row-level policies. Do not add an anon policy.
grant select, insert, update, delete on public.bars, public.employees, public.employee_bars,
  public.schedules, public.shifts, public.staffing_requirements, public.rule_settings to authenticated;
revoke all on public.bars, public.employees, public.employee_bars, public.schedules,
  public.shifts, public.staffing_requirements, public.rule_settings from anon;

do $$
declare table_name text;
begin
  foreach table_name in array array['bars','employees','employee_bars','schedules','shifts','staffing_requirements','rule_settings'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Managers can manage their own %s" on public.%I', table_name, table_name);
    execute format('create policy "Managers can manage their own %s" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name, table_name);
  end loop;
end $$;

-- Enable realtime for cross-device updates (safe to run more than once).
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['bars','employees','employee_bars','schedules','shifts','staffing_requirements','rule_settings'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
