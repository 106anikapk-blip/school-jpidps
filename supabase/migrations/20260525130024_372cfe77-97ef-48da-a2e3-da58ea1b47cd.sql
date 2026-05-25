
-- Roles enum + table
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profile + role on signup; first user becomes admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  select count(*) = 0 into is_first from public.user_roles;

  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class_name text not null,
  section text,
  roll_no text,
  parent_name text,
  phone text,
  total_fee numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_students_updated
before update on public.students
for each row execute function public.update_updated_at_column();

-- Receipt number sequence
create sequence public.receipt_no_seq start 1;

create or replace function public.next_receipt_no()
returns text
language sql
as $$
  select 'RCP-' || lpad(nextval('public.receipt_no_seq')::text, 6, '0');
$$;

-- Fee payments
create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text not null default 'cash',
  paid_on date not null default current_date,
  receipt_no text not null unique default public.next_receipt_no(),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_fee_payments_student on public.fee_payments(student_id);
create index idx_fee_payments_paid_on on public.fee_payments(paid_on desc);

-- App settings (key/value)
create table public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.students enable row level security;
alter table public.fee_payments enable row level security;
alter table public.app_settings enable row level security;

-- Profiles
create policy "Profiles: select own" on public.profiles
for select to authenticated using (auth.uid() = user_id);
create policy "Profiles: update own" on public.profiles
for update to authenticated using (auth.uid() = user_id);
create policy "Profiles: insert own" on public.profiles
for insert to authenticated with check (auth.uid() = user_id);

-- User roles: each user can see own
create policy "Roles: select own" on public.user_roles
for select to authenticated using (auth.uid() = user_id);

-- Students (admin-only)
create policy "Students: admin select" on public.students
for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Students: admin insert" on public.students
for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Students: admin update" on public.students
for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Students: admin delete" on public.students
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Fee payments (admin-only)
create policy "Payments: admin select" on public.fee_payments
for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Payments: admin insert" on public.fee_payments
for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Payments: admin update" on public.fee_payments
for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Payments: admin delete" on public.fee_payments
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- App settings (admin-only)
create policy "Settings: admin select" on public.app_settings
for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Settings: admin insert" on public.app_settings
for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Settings: admin update" on public.app_settings
for update to authenticated using (public.has_role(auth.uid(), 'admin'));
