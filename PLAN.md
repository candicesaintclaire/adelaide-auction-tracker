# Adelaide — plan for the rest of the build

> **Approved 26 August 2026.** Copied into the repo from the planning session
> so it survives this laptop. The text below is the approved plan unchanged.
>
> Status: **not started.** Begin at **Phase A** (verify Bid13) — it is small,
> and everything after it assumes Bid13 works.
>
> `CLAUDE.md` is the authority on what is done; this file on what comes next.
> Read both. (The pointer from `CLAUDE.md` is in place — that was step 1.)

## Context

M0 (database and sign-in) and the StorageTreasures half of M1 (save a listing)
work and are tagged `m1-verified`. Two things are conspicuously missing: Bid13
has never been exercised in a browser since the extract/parse refactor, and
you can save listings but not look at them.

This plan covers the rest: seeing your watchlist, on a phone as well as a
desktop; re-reading saved listings so the bids stay current; and saving from
the phone's share sheet.

Two things changed during planning and shape everything below:

- **The audience might widen later.** Still three people now, but built so that
  sharing it more broadly stays possible. That raises the stakes on politeness
  toward the two auction sites, and it's why the repo goes public with an
  honest status banner rather than quietly.
- **A web page cannot fetch those auction sites** — the browser blocks it. So
  the phone can hand over a URL, but something server-side must read the page.
  Saving from a phone therefore arrives with the refresh engine, not with the
  web app.

## Decisions already made

| | |
|---|---|
| Order | Web app first, then the refresh engine |
| Hosting | This repo goes public; GitHub Pages serves it |
| Refresh | On demand, plus automatically when the app is opened. Nothing scheduled. |
| Phones | All Android → Web Share Target works natively, no per-person setup |
| Licence | None for now. The status banner does the work. |

---

## Phase A — Verify Bid13 *(small, first)*

Bid13's reader was rewritten in the extract/parse split and has only ever been
run by unit tests. Everything after this assumes it works.

- Open a Bid13 listing, save it, confirm the bid, closing time, unit name and
  photos land correctly.
- Fix what's wrong; add a test for anything found.
- Re-tag once it passes.

**Files:** `extension/lib/extract.js` (Bid13 gatherer), `extension/lib/parse.js`
(`parseBid13`), `extension/test/parse.test.mjs`.

---

## Phase B — Go public, honestly

- **Flip the repo to public.**
- **README banner** using a GitHub alert block, which renders as a real
  coloured callout:

  ```
  > [!WARNING]
  > **Pre-alpha — not suitable for public use.** As of 26 August 2026 this is in
  > active development by one person for three people. No support, no stability,
  > breaking changes without notice, and no guarantee that any number it shows
  > you is correct. Anyone forking it is responsible for their own compliance
  > with the auction sites' terms.
  ```

  The date is part of the text and gets updated whenever the status does.
- **`CLAUDE.md`:** record that the audience may widen later, and what that
  implies — politeness becomes a real obligation rather than a courtesy, all
  outbound traffic funnels through one place, and Google OAuth would need
  verification to go past three test users.

**Files:** `README.md`, `CLAUDE.md`.

---

## Phase C — The watchlist web app

A plain static site: no framework, no build step, matching the extension.

**Reuse rather than rewrite.** `extension/lib/db.js` and `extension/lib/parse.js`
are already free of Chrome APIs. `extension/lib/auth.js` is not, but only in two
spots — it uses `chrome.storage.local` for the session and
`chrome.identity.launchWebAuthFlow` to open the Google window. Split those into
two small adapters (Chrome / web) and the token handling, refresh and expiry
logic are shared. The web adapter uses `localStorage` and an ordinary redirect,
which is the simpler of the two flows.

**Layout.** GitHub Pages serves from the repo root so the web app can import the
extension's modules directly, keeping one copy of every shared file:

```
index.html            the watchlist
app.webmanifest       makes it installable; later declares the share target
sw.js                 service worker — offline shell only, no background sync
web/                  app modules; import ../extension/lib/{auth,db,parse}.js
```

**What it shows.** One row per saved unit: name or nickname, current bid
alongside what it was when saved, how long until it closes, a thumbnail, and
the source. Sorted by closing soonest, with ended ones separated. Tapping a row
opens the listing. This is where **nicknames** get edited — `db.js` already
takes care never to overwrite one.

**No refresh in this phase.** Bids read as of when each listing was saved, and
the page says so plainly rather than implying they're live.

**Config.** A public site has to ship the project URL and publishable key in its
files, and those are designed to be public. So one committed `config.js` becomes
the single source for both the extension and the web app, replacing the
gitignored copy and removing a manual setup step. *Trade-off:* the project
address becomes public. Row-level security means unauthenticated requests return
nothing, and sign-in stays limited to three Google test users, so the exposure is
junk traffic rather than data. Say so if you'd rather not.

---

## Phase D — The refresh engine, and saving from a phone

A Supabase Edge Function, **deployable from the Supabase dashboard** — no CLI
and no Docker, so the project keeps its no-build-step property. It runs with the
signed-in person's token, so the database's own rules still decide what it may
touch.

**One parser, three callers.** `parse.js` already takes text rather than a live
page. The extension gathers from the DOM; the function gathers from fetched
HTML. `nextDataFromHtml()` covers StorageTreasures already; Bid13 needs a small
`gatherBid13FromHtml()` producing the same shape `parseBid13` consumes. Deno
can't import across the repo, so the function keeps a copy of `parse.js` with a
test that byte-compares the two and fails on drift.

**Two functions:**

- `refresh` — takes auction ids, re-reads each, updates. The database trigger
  keeps `first_bid_cents` unmoved, so no caller can corrupt the comparison.
- `save` — takes a URL, reads it, inserts. This is what the phone calls.

**Politeness lives here**, in one place, which is the main argument for a server
function over per-client fetching:

- honours `crawl_delay_ms` from `site_config` between requests to a host
- honours `min_refresh_interval_ms` so a mashed button can't become traffic
- sends a descriptive User-Agent naming the project and its repo
- **Bid13 is your decision, not mine.** Their robots.txt asks for a five-second
  delay and disallows ClaudeBot by name. Your server, identifying itself, at one
  request per deliberate action, is a different thing from a crawler — but it's
  your call. I'll implement whichever way you decide, and I won't fetch
  bid13.com myself either way.

**Share to save.** `app.webmanifest` declares a `share_target`; the installed
PWA then appears in Android's share sheet. Sharing a listing hands the URL to
the app, which calls `save`. Bid13 photos won't come through this route — they
load by script, so only a real browser sees them — which is already recorded as
a known limit.

**Wiring the refresh in:** on opening the app, anything stale beyond
`min_refresh_interval_ms` is re-read; plus a manual refresh control. Nothing runs
when nobody is looking.

---

## Phase E — Ended auctions and final prices

When a refresh sees a listing has closed, record `final_bid_cents` and move it
into an ended section — what it actually went for is the useful part afterwards.

**Honest limit of the choice you made:** with no scheduled sweep, a unit that
closes overnight is only recorded when someone next opens the app. If its page
is gone by then, the final price is lost. Revisit only if that turns out to
matter in practice.

---

## Phase F — Contacting StorageTreasures and Bid13

You asked to discuss this, and the possibility of a wider audience makes it more
than a courtesy. I'll draft both emails for you to send: what Adelaide is, that
it reads only listings a person deliberately saved, the delays it honours, how
it identifies itself, and who to contact. Nothing blocks on a reply.

---

## Verification

- `npm test` after any change to `parse.js` — the shared parser is the piece
  every other part now depends on, including the server.
- **Phase A:** save a Bid13 listing from the browser; check the row in Supabase.
- **Phase C:** sign in on the Pages URL; confirm the list matches what's in the
  table; install it to an Android home screen; edit a nickname and confirm it
  survives a later re-save from the extension.
- **Phase D:** refresh a unit whose bid you can see has changed, and confirm
  `bid_cents` moves while `first_bid_cents` does not. Share a listing from
  Chrome on Android and confirm it appears. Watch the function logs to confirm
  the crawl delay is actually being waited out.
- Tag each phase you've personally seen work, as with `m1-verified`.

## Risks

- **Bid13 may need real work** — its reader is the least exercised code here.
- **Sharing to an installed PWA is Android-only.** Everyone's on Android now; an
  iPhone joining later means a one-time Shortcut for that person.
- **The web app and extension must not drift.** Shared modules and the copied-file
  test are the guard; if that proves annoying, the answer is fewer copies, not
  fewer tests.
