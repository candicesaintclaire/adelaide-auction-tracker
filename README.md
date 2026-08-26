# Adelaide

A Chrome extension for keeping track of storage-unit auctions on
StorageTreasures and Bid13. You save a listing you're interested in; it
remembers what the bid was when you saved it, so later you can see how far
it has moved.

Built for three people. Not on the Chrome Web Store, and not meant to be.

> [!WARNING]
> **Pre-alpha — not suitable for public use.** As of 26 August 2026 this is in
> active development by one person for three people. No support, no stability,
> breaking changes without notice, and no guarantee that any number it shows
> you is correct. Anyone forking it is responsible for their own compliance
> with the auction sites' terms.

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

**2. There is no step 2.**

`extension/config.js` is in the repo now. It holds the project address and the
publishable key, and both are designed to be public: the key grants nothing on
its own, because every table's access rule requires a signed-in owner, and
sign-in is limited to three Google test users. What is exposed is junk traffic,
not data.

That is a deliberate trade, made because the watchlist page is a static site
and has to ship those two values in its files anyway — so keeping a second,
hidden copy bought nothing and cost a setup step.

Never the key starting `sb_secret_`, and never the legacy `service_role` one.
Those bypass every privacy rule in the database, belong on a server, and belong
in no repository at all.

*Pointing this at a different Supabase project?* `extension/config.example.js`
shows the shape. Both values are in the dashboard: Project Settings → Data API
for the URL, and Project Settings → API Keys → *Publishable and secret* for the
key beginning `sb_publishable_`.

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
index.html          the watchlist, as a web page
app.webmanifest     makes it installable on a phone
sw.js               service worker — offline shell only, nothing in background
web/app.js          the watchlist's own code; imports the extension's modules
web/app.css
extension/
  manifest.json     no background worker, no alarms, no content scripts
  popup.*           the extension's interface
  options.*         setup helper: shows the redirect URL, checks the connection
  config.js         project URL and publishable key — shared by both, committed
  lib/auth.js       Google sign-in, written against Supabase's HTTP API
  lib/platform.js   the only two things that differ between Chrome and the web
  lib/db.js         reads and writes auctions
  lib/format.js     how a figure or a time is written, in one place
  lib/extract.js    injected into a listing page; gathers, interprets nothing
  lib/parse.js      interprets; touches no DOM, no network, no chrome API
  test/             runs the lib/ modules in node, no browser needed
supabase/migrations/  the schema
legacy/               the original Manus version, kept for reference
```

The watchlist page is not a second copy of anything. It imports
`extension/lib/` directly — same sign-in, same database code, same formatting —
which is why GitHub Pages serves from the repository root rather than from a
build directory.

No build step and no dependencies. The extension is a folder Chrome loads
directly, and `package.json` exists only so `node --test` knows these files are
ES modules.

**`lib/extract.js` and `lib/parse.js` are split on purpose.** Interpreting a
listing page is where the mistakes have been, so it lives in a file that can be
run and checked without a browser or a live auction. If a site redesigns, those
two files are what change.

---

## The watchlist page

`index.html` is the same watchlist, on a phone or in any browser. A plain
static site — no framework, no build step — served by GitHub Pages from the
repository root.

**It cannot read an auction site.** A web page is forbidden from fetching
storagetreasures.com or bid13.com; the browser blocks it, and no amount of code
gets around that. So the page shows each bid as it was when that listing was
last saved, and says so on screen rather than implying it is live. Re-reading
needs something server-side, which is the next milestone.

**Signing in needs its address allow-listed.** Supabase must have the Pages URL
under Authentication → URL Configuration, exactly:
`https://<user>.github.io/adelaide-auction-tracker/`. The extension's
`chromiumapp.org` address stays alongside it — both flows work at once, and
they share the session logic in `lib/auth.js`. Only *where the session is kept*
and *how the Google window opens* differ, and those two things are all that
`lib/platform.js` contains.

**Nicknames are edited here.** The database has always held one and `db.js` has
always refused to overwrite it on a save. This is the first thing that offers
to set it.

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
