-- LegisCore schema v1
-- Shared Supabase project with PXDynasty. All tables prefixed `lc_`.

-- ============================================================
-- Organizations
-- ============================================================
create table if not exists lc_organizations (
  id text primary key,
  name text not null,
  country text,
  industry text default 'Legal Services',
  created_at timestamptz default now()
);

-- ============================================================
-- Users (profiles linked to auth.users)
-- ============================================================
create table if not exists lc_users (
  id uuid primary key,                -- matches auth.users.id
  organization_id text references lc_organizations(id),
  email text unique not null,
  name text not null,
  role text not null default 'viewer', -- partner | associate | secretary | administrator | viewer
  phone text,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists lc_users_org_idx on lc_users(organization_id);

-- ============================================================
-- Clients
-- ============================================================
create table if not exists lc_clients (
  id text primary key,
  organization_id text references lc_organizations(id),
  name text not null,
  client_type text default 'individual', -- individual | company | government
  phone text,
  email text,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists lc_clients_org_idx on lc_clients(organization_id);

-- ============================================================
-- Matters
-- ============================================================
create table if not exists lc_matters (
  id text primary key,
  organization_id text references lc_organizations(id),
  matter_number text,
  title text not null,
  type text,                            -- Litigation | Corporate | Real Estate | Probate | Trusts
  status text default 'active',         -- active | closed | archived
  client_id text references lc_clients(id),
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists lc_matters_org_idx on lc_matters(organization_id);
create index if not exists lc_matters_client_idx on lc_matters(client_id);

-- ============================================================
-- Documents (metadata; the file itself lives in storage)
-- ============================================================
create table if not exists lc_documents (
  id text primary key,
  organization_id text references lc_organizations(id),
  matter_id text references lc_matters(id),
  client_id text references lc_clients(id),
  name text not null,
  document_type text,
  source text,                          -- scanned | uploaded | physical
  storage_key text,
  mime_type text,
  file_size bigint,
  page_count int,
  status text default 'verified',       -- verified | needs_review | expiring | archived
  tags jsonb default '[]'::jsonb,
  created_by uuid references lc_users(id),
  updated_by uuid references lc_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists lc_documents_org_idx on lc_documents(organization_id);
create index if not exists lc_documents_matter_idx on lc_documents(matter_id);
create index if not exists lc_documents_client_idx on lc_documents(client_id);

-- ============================================================
-- Physical files
-- ============================================================
create table if not exists lc_physical_files (
  id text primary key,
  organization_id text references lc_organizations(id),
  file_number text,
  client_id text references lc_clients(id),
  matter_id text references lc_matters(id),
  category text,
  cabinet text,
  shelf text,
  position text,
  assigned_staff uuid references lc_users(id),
  status text default 'In Office',      -- In Office | Checked Out | Awaiting Scan | Archived | Missing
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists lc_pf_org_idx on lc_physical_files(organization_id);

create table if not exists lc_physical_file_movements (
  id text primary key,
  physical_file_id text references lc_physical_files(id),
  from_location text,
  to_location text,
  released_to text,
  released_by uuid references lc_users(id),
  checked_out_at timestamptz,
  returned_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
create index if not exists lc_pfm_file_idx on lc_physical_file_movements(physical_file_id);

-- ============================================================
-- Activities (user-facing feed)
-- ============================================================
create table if not exists lc_activities (
  id text primary key,
  organization_id text references lc_organizations(id),
  user_id uuid references lc_users(id),
  icon text,
  text text not null,
  who text,
  ref_type text,                        -- document | client | matter | physical_file | deadline
  ref_id text,
  created_at timestamptz default now()
);
create index if not exists lc_activities_org_idx on lc_activities(organization_id, created_at desc);

-- ============================================================
-- Notifications
-- ============================================================
create table if not exists lc_notifications (
  id text primary key,
  organization_id text references lc_organizations(id),
  user_id uuid references lc_users(id),
  title text not null,
  body text,
  icon text default 'bell',
  read boolean default false,
  link_type text,
  link_id text,
  created_at timestamptz default now()
);
create index if not exists lc_notif_user_idx on lc_notifications(user_id, read);

-- ============================================================
-- Audit logs (immutable-ish; ordinary users won't have delete access)
-- ============================================================
create table if not exists lc_audit_logs (
  id text primary key,
  organization_id text references lc_organizations(id),
  user_id uuid references lc_users(id),
  action text not null,                 -- document.viewed | document.printed | ...
  resource_type text,
  resource_id text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists lc_audit_org_idx on lc_audit_logs(organization_id, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================
-- Disabled for prototype. Enable + add policies before onboarding
-- real client data.
alter table lc_organizations           disable row level security;
alter table lc_users                   disable row level security;
alter table lc_clients                 disable row level security;
alter table lc_matters                 disable row level security;
alter table lc_documents               disable row level security;
alter table lc_physical_files          disable row level security;
alter table lc_physical_file_movements disable row level security;
alter table lc_activities              disable row level security;
alter table lc_notifications           disable row level security;
alter table lc_audit_logs              disable row level security;
