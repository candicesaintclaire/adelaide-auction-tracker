-- Adelaide — initial schema
-- Three tables plus one config table. Every row is owned by exactly one person.
-- Run this in the Supabase SQL editor, top to bottom, once.

-- ─────────────────────────────────────────────────────────────
-- profiles: one row per person, created automatically on first sign-in
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Populate it from Google's data the moment an account is created,
-- so no client code ever has to remember to.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- auctions: one row per saved listing
-- ─────────────────────────────────────────────────────────────
create type public.auction_source as enum ('storagetreasures', 'bid13');
create type public.auction_status as enum ('active', 'ended', 'unknown');

create table public.auctions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users on delete cascade,

  source              public.auction_source not null,
  external_id         text not null,              -- site's own id for the listing
  canonical_url       text not null,

  -- naming: auto_name is never overwritten by a person, nickname is never overwritten by us
  auto_name           text,
  nickname            text,

  -- enrichment, filled in by a refresh
  facility_name       text,
  city                text,
  state               text,
  unit_size           text,

  -- money, in cents, always
  bid_cents           integer,
  first_bid_cents     integer,   -- written once, on first successful refresh. never touched again.
  previous_bid_cents  integer,   -- maintained by trigger. recorded but not displayed.
  final_bid_cents     integer,
  total_bids          integer,

  ends_at             timestamptz,
  status              public.auction_status not null default 'unknown',

  enriched_at         timestamptz,   -- null until a refresh has filled this row in.
                                     -- the rename control keys off this being set.
  last_refreshed_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- saving the same listing twice is an update, not a duplicate
  unique (owner_id, source, external_id)
);

create index auctions_owner_active_idx
  on public.auctions (owner_id, ends_at)
  where status = 'active';

-- ─────────────────────────────────────────────────────────────
-- The bid-history rule, enforced in the database so no client can get it wrong.
-- first_bid_cents latches on the first real number and never moves.
-- previous_bid_cents holds the value from before this update.
-- ─────────────────────────────────────────────────────────────
create function public.track_bid_movement()
returns trigger
language plpgsql
as $$
begin
  if new.bid_cents is distinct from old.bid_cents then
    new.previous_bid_cents := old.bid_cents;
  end if;

  if new.first_bid_cents is null and new.bid_cents is not null then
    new.first_bid_cents := new.bid_cents;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger auctions_track_bid_movement
  before update on public.auctions
  for each row execute function public.track_bid_movement();

-- Same latch on insert, for the case where a save already knows the bid.
create function public.track_bid_insert()
returns trigger
language plpgsql
as $$
begin
  if new.first_bid_cents is null and new.bid_cents is not null then
    new.first_bid_cents := new.bid_cents;
  end if;
  return new;
end;
$$;

create trigger auctions_track_bid_insert
  before insert on public.auctions
  for each row execute function public.track_bid_insert();

-- ─────────────────────────────────────────────────────────────
-- auction_photos: every image found on a listing
-- ─────────────────────────────────────────────────────────────
create table public.auction_photos (
  id         uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions on delete cascade,
  url        text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (auction_id, url)
);

create index auction_photos_auction_idx on public.auction_photos (auction_id, position);

-- ─────────────────────────────────────────────────────────────
-- site_config: politeness settings, in data rather than in code,
-- so a robots.txt change is one UPDATE and not a redeploy.
-- ─────────────────────────────────────────────────────────────
create table public.site_config (
  source                  public.auction_source primary key,
  crawl_delay_ms          integer not null,   -- gap between queued requests, from the site's own robots.txt
  min_refresh_interval_ms integer not null,   -- floor on re-reading one auction, however hard the button is mashed
  enabled                 boolean not null default true,
  note                    text
);

insert into public.site_config (source, crawl_delay_ms, min_refresh_interval_ms, note) values
  ('bid13',            5000, 60000, 'robots.txt states Crawl-delay: 5. Do not lower this.'),
  ('storagetreasures', 2000, 60000, 'robots.txt states no delay. 2s is our own courtesy floor.');

-- ─────────────────────────────────────────────────────────────
-- Access rules. One idea, applied four times:
-- you can see and change rows that are yours, and nothing else.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.auctions       enable row level security;
alter table public.auction_photos enable row level security;
alter table public.site_config    enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own auctions" on public.auctions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Photos inherit their owner from the auction they hang off.
create policy "own auction photos" on public.auction_photos
  for all
  using (exists (
    select 1 from public.auctions a
    where a.id = auction_photos.auction_id and a.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.auctions a
    where a.id = auction_photos.auction_id and a.owner_id = auth.uid()
  ));

-- Config is readable by anyone signed in, writable by no one through the API.
create policy "config is readable" on public.site_config
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- Table permissions, stated explicitly rather than granted automatically.
--
-- Supabase can hand out these privileges by itself every time a table is
-- created ("Automatically expose new tables"). We turn that off and write
-- them here instead, so a table we add later is invisible to the API until
-- we say otherwise — a mistake of omission leaves data hidden, not exposed.
--
-- Note what is missing: `anon` gets nothing at all. Not signed in, not served.
-- ─────────────────────────────────────────────────────────────
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles       to authenticated;
grant select, insert, update, delete on public.auctions       to authenticated;
grant select, insert, update, delete on public.auction_photos to authenticated;

-- Config is read-only through the API, at the privilege level as well as the
-- policy level. Changing a crawl delay is a deliberate trip to the SQL editor.
grant select on public.site_config to authenticated;
