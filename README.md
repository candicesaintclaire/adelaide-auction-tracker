# Adelaide

A Chrome extension for keeping track of storage-unit auctions on
StorageTreasures and Bid13. You save a listing you're interested in; it
remembers what the bid was when you saved it, so later you can see how far
it has moved.

Built for three people. Not on the Chrome Web Store, and not meant to be.

---

## Restoring this on a new machine

Everything below is recoverable. The code is here; the watchlist itself lives
on Supabase and isn't affected by anything happening to a laptop.

**1. Clone it and check the tests pass.**

```
git clone https://github.com/candicesaintclaire/adelaide-auction-tracker.git
cd adelaide-auction-tracker
npm test          # nothing to install — this is node's own test runner
```

**2. Put the Supabase details back.**

`extension/config.js` is deliberately not in this repo — it holds the project
address and key. Copy the example and fill in the two values, both of which
are visible in the Supabase dashboard at any time:

```
cp extension/config.example.js extension/config.js
```

| Value | Where it is |
|---|---|
| Project URL | Project Settings → Data API. Or build it: the dashboard URL ends in your project ref, and the address is `https://<ref>.supabase.co` |
| Publishable key | Project Settings → API Keys → *Publishable and secret* tab, the one starting `sb_publishable_` |

Never the key starting `sb_secret_`, and never the legacy `service_role` one.
Those bypass every privacy rule in the database and belong on a server.

**3. Load it into Chrome.**

`chrome://extensions` → turn on Developer mode → **Load unpacked** → select the
`extension/` folder.

Then leave that folder where it is. Chrome derives the extension's identity
from its path, and the sign-in redirect URL is built from that identity —
so moving the folder breaks sign-in, with an error that won't mention folders.

**4. If the Supabase project is gone too**, run
`supabase/migrations/0001_init.sql` in a new project's SQL editor. Before
running it, set three switches under Project Settings → Data API: **Enable Data
API** on, **Automatically expose new tables** off, **Enable automatic RLS** on.
The last two only affect tables created after they're set, so they have to come
first. Then re-do the Google sign-in setup: an OAuth client whose redirect URI
is `https://<ref>.supabase.co/auth/v1/callback`, and the extension's
`chromiumapp.org` redirect added to Supabase's URL Configuration.

---

## Layout

```
extension/
  manifest.json     no background worker, no alarms, no content scripts
  popup.*           the whole interface
  options.*         setup helper: shows the redirect URL, checks the connection
  lib/auth.js       Google sign-in, written against Supabase's HTTP API
  lib/db.js         reads and writes auctions
  lib/extract.js    injected into a listing page; gathers, interprets nothing
  lib/parse.js      interprets; touches no DOM, no network, no chrome API
  test/             runs lib/parse.js in node, no browser needed
supabase/migrations/  the schema
legacy/               the original Manus version, kept for reference
```

No build step and no dependencies. The extension is a folder Chrome loads
directly, and `package.json` exists only so `node --test` knows these files are
ES modules.

**`lib/extract.js` and `lib/parse.js` are split on purpose.** Interpreting a
listing page is where the mistakes have been, so it lives in a file that can be
run and checked without a browser or a live auction. If a site redesigns, those
two files are what change.

---

## Things worth not rediscovering

**It only acts when you click it.** No background worker, no alarms, no content
script. Opening the popup is what grants it a one-time look at the tab you're
on. Keeping it that way is a design decision, not an accident.

**StorageTreasures is a single-page app.** Its `__NEXT_DATA__` block describes
whichever page the tab loaded *first* and is never rewritten as you navigate.
The URL is the authority on which unit you're looking at. There is a test that
fails if that ever stops being true.

**Bid13 asks for a five-second crawl delay** in its robots.txt. That figure
lives in the `site_config` table rather than in code, so honouring it is a
setting and not something to remember.

**The bid history is enforced in the database.** A trigger latches
`first_bid_cents` on the first real number and won't let anything change it
afterwards. No client can get it wrong, including a future one.

**Sign-in is limited to three people by Google**, not by this code: the OAuth
consent screen stays in Testing mode with three test users, and Google refuses
anyone else. Don't press "Publish app".
