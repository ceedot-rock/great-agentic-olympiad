-- WSOAP schema
--
-- Compliance-critical invariant: `donations` has NO foreign key to
-- `tournaments`, `tournament_entries`, or `agents`, anywhere, ever —
-- including for "internal analytics." Donors and entrants must never be
-- joinable at the data layer. See /home/ceedotrock/.claude/plans/dazzling-petting-cat.md
-- for the full legal/compliance rationale.
--
-- Write pattern: all writes happen through the service-role client from
-- server routes / workflow steps. No client-side writes, so no INSERT/UPDATE
-- RLS policies exist for anon/authenticated roles below — only SELECT.

create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create view profiles_public as
  select id, display_name from profiles;

-- ============================================================================
-- agents
-- ============================================================================

-- decision_mode = 'preset': lib/poker/strategy.ts evaluates strategy_params
-- locally, in-process, per decision — zero HTTP calls, so it scales to a
-- 100-agent field without any per-decision call volume at all. This is the
-- default and expected mode for most agents.
--
-- decision_mode = 'webhook': the original BYO-agent design — owner hosts an
-- HTTP endpoint we call per decision (see lib/webhook/*). Still supported
-- for owners who want real custom logic, but expected to be a minority of
-- any large field, which is what keeps total external call volume bounded
-- even at 100 agents.
--
-- rider_agent_id/rider_operator_id/reputation_score are populated once, at
-- registration, from a verified Agent-Rider rider JWT (see lib/rider/) —
-- an identity check, not a per-decision authorization, so it does not scale
-- with hand count either.
create table agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null unique,
  avatar_url text,
  decision_mode text not null default 'preset' check (decision_mode in ('preset', 'webhook')),
  strategy_params jsonb,
  webhook_url text,
  webhook_secret text,
  rider_agent_id text,
  rider_operator_id text,
  reputation_score numeric,
  status text not null default 'active' check (status in ('active', 'unresponsive', 'disabled')),
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_decision_mode_fields_ck check (
    (decision_mode = 'preset' and strategy_params is not null)
    or
    (decision_mode = 'webhook' and webhook_url is not null and webhook_secret is not null)
  )
);

create index agents_owner_id_idx on agents (owner_id);

-- Public view intentionally omits webhook_url, webhook_secret, and
-- strategy_params (revealing exact strategy parameters would let opponents
-- exploit a preset agent's tendencies with certainty rather than having to
-- infer them from play, same spirit as withholding hole cards pre-showdown).
create view agents_public as
  select id, owner_id, name, avatar_url, decision_mode, rider_agent_id, reputation_score, status, created_at
  from agents;

-- ============================================================================
-- tournaments
-- ============================================================================

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  scheduled_for timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'registration_open', 'in_progress', 'completed', 'canceled')),
  format text not null default 'freezeout_nlhe',
  starting_stack integer not null default 10000,
  blind_levels jsonb not null default '[
    {"level": 1,  "small_blind": 25,    "big_blind": 50,    "ante": 0,   "duration_hands": 12},
    {"level": 2,  "small_blind": 50,    "big_blind": 100,   "ante": 0,   "duration_hands": 12},
    {"level": 3,  "small_blind": 100,   "big_blind": 200,   "ante": 25,  "duration_hands": 12},
    {"level": 4,  "small_blind": 150,   "big_blind": 300,   "ante": 25,  "duration_hands": 12},
    {"level": 5,  "small_blind": 200,   "big_blind": 400,   "ante": 50,  "duration_hands": 12},
    {"level": 6,  "small_blind": 300,   "big_blind": 600,   "ante": 75,  "duration_hands": 12},
    {"level": 7,  "small_blind": 400,   "big_blind": 800,   "ante": 100, "duration_hands": 12},
    {"level": 8,  "small_blind": 600,   "big_blind": 1200,  "ante": 150, "duration_hands": 12},
    {"level": 9,  "small_blind": 800,   "big_blind": 1600,  "ante": 200, "duration_hands": 12},
    {"level": 10, "small_blind": 1200,  "big_blind": 2400,  "ante": 300, "duration_hands": 999}
  ]'::jsonb,
  max_entrants integer not null default 100,
  pot_snapshot_cents bigint,
  winner_agent_id uuid references agents(id),
  workflow_run_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- tournament_tables (designed for Phase 2 multi-table; MVP creates one row)
-- ============================================================================

create table tournament_tables (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  table_number integer not null,
  is_active boolean not null default true,
  unique (tournament_id, table_number)
);

-- ============================================================================
-- tournament_entries
-- ============================================================================

create table tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  agent_id uuid not null references agents(id),
  table_id uuid references tournament_tables(id),
  seat_number integer,
  status text not null default 'registered'
    check (status in ('registered', 'active', 'eliminated', 'withdrawn')),
  eliminated_at timestamptz,
  finishing_place integer,
  final_stack integer,
  created_at timestamptz not null default now(),
  unique (tournament_id, agent_id)
);

create index tournament_entries_tournament_id_idx on tournament_entries (tournament_id);

-- ============================================================================
-- hands / hand_players / hand_actions — the audit/replay ledger
-- ============================================================================

create table hands (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  table_id uuid references tournament_tables(id),
  hand_number integer not null,
  button_seat integer not null,
  blind_level integer not null,
  small_blind integer not null,
  big_blind integer not null,
  ante integer not null default 0,
  rng_seed text not null,
  board_cards text[] not null default '{}',
  pot_total integer,
  result jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tournament_id, hand_number)
);

create index hands_tournament_id_idx on hands (tournament_id);

-- rng_seed and hole_cards are withheld from the public view until the hand
-- completes, otherwise the full deck order (and therefore every player's
-- hole cards and every future community card) could be derived mid-hand by
-- anyone watching the spectator feed or any agent's own webhook traffic.
create view hands_public as
  select
    id, tournament_id, table_id, hand_number, button_seat, blind_level,
    small_blind, big_blind, ante, board_cards, pot_total, result,
    started_at, completed_at,
    case when completed_at is not null then rng_seed else null end as rng_seed
  from hands;

create table hand_players (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references hands(id) on delete cascade,
  agent_id uuid not null references agents(id),
  seat integer not null,
  starting_stack integer not null,
  hole_cards text[] not null,
  is_button boolean not null default false,
  is_sb boolean not null default false,
  is_bb boolean not null default false,
  -- Lets writes upsert idempotently if a Workflow DevKit step retries after a
  -- partial failure (see lib/tournament/persist.ts).
  unique (hand_id, agent_id)
);

create index hand_players_hand_id_idx on hand_players (hand_id);

-- Same information-hiding rule as hands_public: hole cards only visible once
-- the parent hand has completed.
create view hand_players_public as
  select
    hp.id, hp.hand_id, hp.agent_id, hp.seat, hp.starting_stack,
    hp.is_button, hp.is_sb, hp.is_bb,
    case when h.completed_at is not null then hp.hole_cards else '{}'::text[] end as hole_cards
  from hand_players hp
  join hands h on h.id = hp.hand_id;

create table hand_actions (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references hands(id) on delete cascade,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  agent_id uuid not null references agents(id),
  betting_round text not null
    check (betting_round in ('preflop', 'flop', 'turn', 'river', 'showdown')),
  sequence_number integer not null,
  action_type text not null check (action_type in (
    'post_sb', 'post_bb', 'post_ante', 'fold', 'check', 'call', 'bet', 'raise',
    'all_in', 'timeout_fold', 'timeout_check'
  )),
  amount integer,
  pot_after integer not null,
  stack_after integer not null,
  decision_latency_ms integer,
  raw_webhook_request jsonb,
  raw_webhook_response jsonb,
  created_at timestamptz not null default now(),
  unique (hand_id, sequence_number)
);

create index hand_actions_tournament_id_idx on hand_actions (tournament_id);
create index hand_actions_hand_id_idx on hand_actions (hand_id);

-- raw_webhook_request/response can carry the agent owner's own infra details
-- (headers, internal error bodies); keep those admin-only, expose the rest.
create view hand_actions_public as
  select
    id, hand_id, tournament_id, agent_id, betting_round, sequence_number,
    action_type, amount, pot_after, stack_after, decision_latency_ms, created_at
  from hand_actions;

-- ============================================================================
-- donations — deliberately isolated (see header note)
-- ============================================================================

create table donations (
  id uuid primary key default gen_random_uuid(),
  donor_email text,
  donor_display_name text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  stripe_payment_intent_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  contributed_to_week date not null,
  created_at timestamptz not null default now()
);

create index donations_status_idx on donations (status);

create view donations_public as
  select id, donor_display_name, amount_cents, currency, status, contributed_to_week, created_at
  from donations
  where status = 'succeeded';

-- ============================================================================
-- charities — admin-curated whitelist, the ONLY valid payout targets
-- ============================================================================

create table charities (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  ein text,
  country text not null default 'US',
  payout_method text not null check (payout_method in ('ach', 'check', 'wire', 'stripe_connect')),
  payout_details jsonb,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only approved + verified charities are ever offered as a payout choice.
-- payout_details/ein withheld from public view.
create view charities_public as
  select id, legal_name, country, status
  from charities
  where status = 'approved' and verified_at is not null;

-- ============================================================================
-- payouts
-- ============================================================================

create table payouts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references tournaments(id),
  charity_id uuid not null references charities(id),
  selected_by uuid not null references auth.users(id),
  amount_cents bigint not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  payout_reference text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create view payouts_public as
  select id, tournament_id, charity_id, amount_cents, status, created_at, sent_at
  from payouts;

-- Defense in depth: even if application code has a bug, the database itself
-- refuses to record a payout to a charity that isn't approved+verified. This
-- is the last line of defense against a winner designating a self-controlled
-- entity (self-dealing / private inurement).
-- `set search_path = public` pins this function against search-path
-- hijacking (an attacker-controlled object earlier in an unpinned search
-- path shadowing `charities`) — caught by Supabase's security advisor after
-- the first deploy; worth being precise about since this guards the
-- anti-self-dealing payout check specifically.
create function enforce_verified_charity_payout() returns trigger as $$
begin
  if not exists (
    select 1 from charities
    where id = new.charity_id
      and status = 'approved'
      and verified_at is not null
  ) then
    raise exception 'Payouts can only be sent to approved, verified charities (charity_id=%)', new.charity_id;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger payouts_require_verified_charity
  before insert or update on payouts
  for each row execute function enforce_verified_charity_payout();

-- ============================================================================
-- agent_badges — the entire "WSOAP Platinum Tag" is this row. No chain,
-- no wallet, no minted asset — a metadata badge only.
-- ============================================================================

create table agent_badges (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  badge_type text not null default 'platinum_tag' check (badge_type in ('platinum_tag')),
  season text not null,
  tournament_id uuid not null references tournaments(id),
  awarded_at timestamptz not null default now(),
  unique (agent_id, tournament_id, badge_type)
);

create view agent_badges_public as
  select id, agent_id, badge_type, season, tournament_id, awarded_at from agent_badges;

-- ============================================================================
-- agent_leaderboard — tournament finishes + Platinum Tag counts per agent
-- ============================================================================

create view agent_leaderboard as
  select
    a.id as agent_id,
    a.name,
    a.avatar_url,
    a.status,
    count(*) filter (where te.finishing_place = 1) as wins,
    count(te.id) as tournaments_played,
    min(te.finishing_place) as best_finish,
    (select count(*) from agent_badges b where b.agent_id = a.id and b.badge_type = 'platinum_tag') as platinum_tags
  from agents a
  left join tournament_entries te on te.agent_id = a.id and te.finishing_place is not null
  group by a.id, a.name, a.avatar_url, a.status;

grant select on agent_leaderboard to anon, authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table agents enable row level security;
alter table tournaments enable row level security;
alter table tournament_tables enable row level security;
alter table tournament_entries enable row level security;
alter table hands enable row level security;
alter table hand_players enable row level security;
alter table hand_actions enable row level security;
alter table donations enable row level security;
alter table charities enable row level security;
alter table payouts enable row level security;
alter table agent_badges enable row level security;

-- Base tables: owners/admins can read their own sensitive rows directly;
-- everyone else (including anon) should query the `*_public` views instead,
-- which is what the app's browser/session client is pointed at.
--
-- Note on the `*_public` views below: Postgres views run with definer
-- semantics by default (security_invoker = false), meaning they see past
-- the querying user's RLS and instead inherit the view-creator role's
-- access. That's deliberate here, not an oversight — the base tables for
-- hands/hand_actions/donations/charities/payouts are admin-only by RLS, and
-- the `*_public` views are the intentionally curated, already-filtered
-- subset meant for anon/authenticated reads (hiding hole cards pre-showdown,
-- webhook secrets, donor emails, unapproved charities, etc). Do not "fix"
-- this later by adding `security_invoker = true` to these views without
-- also adding matching public SELECT policies on the base tables — that
-- would break every public-facing read in the app.

create policy "profiles: self read" on profiles
  for select using (auth.uid() = id);

create policy "agents: owner full read" on agents
  for select using (auth.uid() = owner_id);

create policy "tournaments: public read" on tournaments
  for select using (true);

create policy "tournament_tables: public read" on tournament_tables
  for select using (true);

create policy "tournament_entries: public read" on tournament_entries
  for select using (true);

create policy "hands: admin read" on hands
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "hand_players: admin read" on hand_players
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "hand_actions: admin read" on hand_actions
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "donations: admin read" on donations
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "charities: admin read" on charities
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "payouts: admin read" on payouts
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "agent_badges: public read" on agent_badges
  for select using (true);

-- A view needs its own SELECT grant as a separate, object-level permission
-- from whatever access its owner has on the underlying tables (which is the
-- access actually used when the view's query runs, per the note above) — so
-- anon/authenticated still need an explicit grant here to query the views
-- at all, even though the views' own definitions already bypass the
-- restrictive base-table policies for hands/hand_actions/donations/
-- charities/payouts.
grant select on
  profiles_public, agents_public, hands_public, hand_players_public,
  hand_actions_public, donations_public, charities_public, payouts_public,
  agent_badges_public
to anon, authenticated;
