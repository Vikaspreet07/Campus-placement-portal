-- ═══════════════════════════════════════════════════════════
-- PlaceMe – Campus Placement Portal
-- Supabase Database Schema
-- Run this in: https://pjnvkrletmiyaqxmvpqt.supabase.co
-- ═══════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- PROFILES TABLE
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text unique,
  first_name        text,
  last_name         text,
  role              text not null default 'student' check (role in ('student','company','admin')),
  roll_number       text,
  branch            text,
  graduation_year   integer,
  cgpa              numeric(4,2),
  skills            text[],
  resume_url        text,
  linkedin_url      text,
  about             text,
  company_name      text,
  designation       text,
  avatar_url        text,
  is_active         boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- COMPANIES TABLE
create table if not exists public.companies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  logo_url      text,
  website       text,
  industry      text,
  description   text,
  headquarters  text,
  total_offers  integer default 0,
  avg_ctc       numeric(5,2) default 0,
  highest_ctc   numeric(5,2) default 0,
  is_verified   boolean default false,
  created_at    timestamptz default now()
);

-- JOBS TABLE
create table if not exists public.jobs (
  id                 uuid primary key default uuid_generate_v4(),
  title              text not null,
  company_id         uuid references public.companies(id) on delete set null,
  posted_by          uuid references public.profiles(id) on delete set null,
  job_type           text not null default 'Full-time' check (job_type in ('Full-time','Internship','PPO')),
  ctc                numeric(6,2),
  location           text,
  description        text,
  skills             text[],
  min_cgpa           numeric(4,2),
  deadline           date,
  eligible_branches  text[],
  interview_process  text,
  status             text default 'open' check (status in ('open','closed','draft')),
  is_featured        boolean default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- APPLICATIONS TABLE
create table if not exists public.applications (
  id             uuid primary key default uuid_generate_v4(),
  job_id         uuid references public.jobs(id) on delete cascade,
  student_id     uuid references public.profiles(id) on delete cascade,
  cover_letter   text,
  resume_link    text,
  status         text default 'pending' check (status in ('pending','shortlisted','interview','selected','rejected')),
  feedback       text,
  applied_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(job_id, student_id)
);

-- NOTICES TABLE
create table if not exists public.notices (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  content     text not null,
  category    text default 'general' check (category in ('general','urgent','drive','result')),
  posted_by   uuid references public.profiles(id) on delete set null,
  expires_at  date,
  is_pinned   boolean default false,
  created_at  timestamptz default now()
);

-- INTERVIEWS TABLE
create table if not exists public.interviews (
  id              uuid primary key default uuid_generate_v4(),
  application_id  uuid references public.applications(id) on delete cascade,
  student_id      uuid references public.profiles(id) on delete cascade,
  job_id          uuid references public.jobs(id) on delete cascade,
  round_number    integer default 1,
  round_type      text,
  scheduled_at    timestamptz,
  location        text,
  duration_mins   integer default 60,
  result          text check (result in ('pass','fail','hold','pending')) default 'pending',
  notes           text,
  created_at      timestamptz default now()
);

-- PLACEMENT RECORDS TABLE
create table if not exists public.placement_records (
  id              uuid primary key default uuid_generate_v4(),
  student_id      uuid references public.profiles(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete set null,
  job_id          uuid references public.jobs(id) on delete set null,
  offer_date      date,
  ctc             numeric(6,2),
  role            text,
  joining_date    date,
  placement_year  integer,
  is_ppo          boolean default false,
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles          enable row level security;
alter table public.companies         enable row level security;
alter table public.jobs              enable row level security;
alter table public.applications      enable row level security;
alter table public.notices           enable row level security;
alter table public.interviews        enable row level security;
alter table public.placement_records enable row level security;

-- PROFILES
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Admins can delete profiles"
  on public.profiles for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- COMPANIES
create policy "Companies are publicly readable"
  on public.companies for select using (true);

create policy "Authenticated users can insert companies"
  on public.companies for insert with check (auth.role() = 'authenticated');

create policy "Admins can update companies"
  on public.companies for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can delete companies"
  on public.companies for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- JOBS
create policy "Jobs are publicly readable"
  on public.jobs for select using (true);

create policy "Company/Admin users can insert jobs"
  on public.jobs for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('company','admin')));

create policy "Job poster or admin can update"
  on public.jobs for update
  using (posted_by = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Job poster or admin can delete"
  on public.jobs for delete
  using (posted_by = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- APPLICATIONS
create policy "Applications select policy"
  on public.applications for select
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.jobs j join public.profiles p on p.id = auth.uid()
      where j.id = applications.job_id and (j.posted_by = auth.uid() or p.role = 'admin')
    )
  );

create policy "Students can apply"
  on public.applications for insert
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'student')
  );

create policy "Recruiters/admin can update applications"
  on public.applications for update
  using (
    exists (
      select 1 from public.jobs j join public.profiles p on p.id = auth.uid()
      where j.id = applications.job_id and (j.posted_by = auth.uid() or p.role = 'admin')
    )
  );

-- NOTICES
create policy "Notices are publicly readable"
  on public.notices for select using (true);

create policy "Admins can insert notices"
  on public.notices for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can delete notices"
  on public.notices for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- INTERVIEWS
create policy "Interviews are visible to involved parties"
  on public.interviews for select
  using (
    student_id = auth.uid()
    or exists (select 1 from public.jobs j where j.id = interviews.job_id and j.posted_by = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Company/admin can insert interviews"
  on public.interviews for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('company','admin')));

create policy "Company/admin can update interviews"
  on public.interviews for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('company','admin')));

-- PLACEMENT RECORDS
create policy "Placement records are publicly readable"
  on public.placement_records for select using (true);

create policy "Admins can insert placement records"
  on public.placement_records for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at_column();

create trigger update_jobs_updated_at
  before update on public.jobs
  for each row execute function update_updated_at_column();

create trigger update_applications_updated_at
  before update on public.applications
  for each row execute function update_updated_at_column();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role,
    roll_number, branch, graduation_year, company_name, designation)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'roll_number',
    new.raw_user_meta_data->>'branch',
    (new.raw_user_meta_data->>'graduation_year')::integer,
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'designation'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- SAMPLE DATA
-- ═══════════════════════════════════════════════════════════════

insert into public.companies (name, logo_url, industry, description, total_offers, avg_ctc, highest_ctc, is_verified) values
  ('Google',        'https://logo.clearbit.com/google.com',        'Technology',    'Alphabet subsidiary specializing in internet services and AI.', 45, 28, 45, true),
  ('Microsoft',     'https://logo.clearbit.com/microsoft.com',     'Technology',    'Leading cloud and productivity solutions.', 38, 25, 38, true),
  ('Amazon',        'https://logo.clearbit.com/amazon.com',        'Technology',    'E-commerce and cloud computing giant.', 52, 22, 35, true),
  ('Goldman Sachs', 'https://logo.clearbit.com/goldmansachs.com',  'Finance',       'Global investment banking and securities firm.', 18, 18, 28, true),
  ('Infosys',       'https://logo.clearbit.com/infosys.com',       'Technology',    'Global IT services and consulting company.', 120, 4.5, 8, true),
  ('Adobe',         'https://logo.clearbit.com/adobe.com',         'Technology',    'Creative software and digital experience solutions.', 22, 20, 30, true),
  ('Tata Motors',   'https://logo.clearbit.com/tatamotors.com',    'Manufacturing', 'Leading automotive company with EV focus.', 35, 7, 12, true),
  ('Deloitte',      'https://logo.clearbit.com/deloitte.com',      'Consulting',    'Global professional services and consulting.', 60, 12, 18, true),
  ('Meta',          'https://logo.clearbit.com/meta.com',          'Technology',    'Social media and virtual reality technology.', 28, 35, 52, true),
  ('Oracle',        'https://logo.clearbit.com/oracle.com',        'Technology',    'Enterprise software and cloud infrastructure.', 32, 14, 22, true),
  ('TCS',           'https://logo.clearbit.com/tcs.com',           'Technology',    'Tata Consultancy Services IT services leader.', 200, 4, 7, true),
  ('Wipro',         'https://logo.clearbit.com/wipro.com',         'Technology',    'Global IT consulting and business process services.', 90, 4.5, 8, true)
on conflict do nothing;

insert into public.notices (title, content, category, is_pinned) values
  ('Google PPT Registration Deadline Tomorrow', 'All students from CSE, IT, and ECE branches must register for the Google Pre-Placement Talk by 18th October 2025. Failure to register will result in disqualification.', 'urgent', true),
  ('Microsoft Campus Drive – Date Announced', 'Microsoft will conduct its campus placement drive on 25th November 2025. Eligible: CSE, ECE, IT, EE. Min CGPA: 7.0.', 'drive', false),
  ('Amazon Placement Results Declared', 'Congratulations to 12 students selected by Amazon! Offer letters will be shared by 30th October 2025.', 'result', true),
  ('Resume Submission Deadline Extended', 'Deadline for Deloitte drive submissions extended to 22nd October 2025.', 'general', false),
  ('Pre-Placement Talk: Goldman Sachs', 'Goldman Sachs PPT on 20th October 2025 at Seminar Hall A, 10:00 AM. Business formals required.', 'drive', false),
  ('Mock Interview Sessions – Register Now', 'Mock interview sessions with industry mentors every Saturday 10 AM – 1 PM. Limited slots.', 'general', false)
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════

create index if not exists idx_profiles_role        on public.profiles(role);
create index if not exists idx_profiles_email       on public.profiles(email);
create index if not exists idx_jobs_status          on public.jobs(status);
create index if not exists idx_jobs_company         on public.jobs(company_id);
create index if not exists idx_jobs_posted_by       on public.jobs(posted_by);
create index if not exists idx_jobs_deadline        on public.jobs(deadline);
create index if not exists idx_applications_job     on public.applications(job_id);
create index if not exists idx_applications_student on public.applications(student_id);
create index if not exists idx_applications_status  on public.applications(status);
create index if not exists idx_notices_category     on public.notices(category);
create index if not exists idx_notices_created      on public.notices(created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- NEXT STEPS:
-- 1. Run this script in your Supabase SQL Editor
-- 2. Enable Google OAuth in Supabase Auth settings (optional)
-- 3. After creating an admin account via the portal, promote it:
--    UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
-- ═══════════════════════════════════════════════════════════════
