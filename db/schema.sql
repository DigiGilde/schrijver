create table if not exists user_prefs (sub text primary key, identity text not null default 'anoniem', github_login text, github_id bigint, onboarded boolean not null default false, updated_at timestamptz not null default now());

-- Profile, saved at every login. The e-mail address is lower-cased and only one the identity provider verified.
alter table user_prefs add column if not exists name text;
alter table user_prefs add column if not exists email text;
alter table user_prefs add column if not exists last_login_at timestamptz;
create index if not exists user_prefs_email on user_prefs (email);

-- The sites in Schrijver, each bound to its repository by GitHub's numeric id: names change.
create table if not exists sites (
	id text primary key,
	repo_id bigint not null unique,
	repo text not null,
	standaardbranch text not null,
	created_at timestamptz not null default now(),
	created_by text
);

create table if not exists site_settings (
	site_id text primary key references sites (id) on delete cascade,
	naam text not null,
	omschrijving text,
	adres text,
	mergen_vanuit_schrijver boolean not null default true,
	vier_ogen boolean not null default true,
	identiteit_toegestaan text[] not null default array['anoniem', 'gekoppeld', 'op-naam'],
	updated_at timestamptz not null default now(),
	updated_by text
);

-- Settings from before the registry belong to no site: they go, with their teams, and the settings
-- follow the site from then on.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conrelid = 'site_settings'::regclass and confrelid = 'sites'::regclass
	) then
		delete from site_settings s where not exists (select 1 from sites where sites.id = s.site_id);
		alter table site_settings
			add constraint site_settings_site_id_fkey foreign key (site_id) references sites (id) on delete cascade;
	end if;
end $$;

create table if not exists site_members (
	site_id text not null references site_settings (site_id) on delete cascade,
	sub text not null references user_prefs (sub),
	role text not null check (role in ('beheerder', 'redactie')),
	added_by text,
	added_at timestamptz not null default now(),
	primary key (site_id, sub)
);
create index if not exists site_members_sub on site_members (sub);

create table if not exists invitations (
	id uuid primary key,
	site_id text not null references site_settings (site_id) on delete cascade,
	email text not null,
	role text not null check (role in ('beheerder', 'redactie')),
	invited_by text,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	unique (site_id, email)
);
create index if not exists invitations_email on invitations (email);

-- Who changed a team, an invitation or a site setting. Never an e-mail address.
create table if not exists audit_log (
	id bigserial primary key,
	at timestamptz not null default now(),
	actor_sub text,
	site_id text,
	action text not null,
	target text,
	role text
);
create index if not exists audit_log_at on audit_log (at);

-- Who wrote in a proposal: each user Schrijver committed to it for, from their first commit on.
create table if not exists proposal_writers (
	site_id text not null references site_settings (site_id) on delete cascade,
	number integer not null,
	sub text not null references user_prefs (sub) on delete cascade,
	first_at timestamptz not null default now(),
	primary key (site_id, number, sub)
);
