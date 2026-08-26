# Adelaide — working notes

The README says what this is and how to restore it. This file says where the
work stands, and it is rewritten at every stopping point. If it disagrees with
the code, the code is right and this needs updating.

**[PLAN.md](PLAN.md) says what comes next** — the approved plan for the rest of
the build, phases A to F. The two files divide the work between them: this one
is the authority on what is *done*, `PLAN.md` on what is *not yet started*. The
next thing to do is Phase A, verifying Bid13.

Design document (milestones, reasoning, open questions):
https://claude.ai/code/artifact/b70f24b6-7db1-4df4-a706-4f0ece72d831
Setup walkthrough (Supabase, Google, Chrome):
https://claude.ai/code/artifact/69e5c724-b7a0-46bd-8152-23ce126fa072

---

## Where this stands — 26 August 2026

**Working, and confirmed by hand in Chrome:**

- **M0** — Supabase project, Google sign-in, the profile row created by the
  database itself. Tagged `m1-verified`.
- **M1, StorageTreasures half** — save a listing in one click, auto-named.
  Lien and non-lien units both read correctly, and navigating between units
  without reloading now saves the right one.

**Not done, roughly in the order it matters:**

1. **Bid13, half done.** Saving, dedup and navigation were confirmed by hand
   on 26 August. Its reading was then checked against two live listings and
   found wrong in four places, all now fixed and tested — but the fixed code
   has not itself been run in Chrome. Re-save both units and check the row.
2. **You can save listings but not look at them.** There is no list view
   anywhere — not in the popup, not on a phone. Saving into a void is the most
   obvious gap in the thing as it stands.
3. **M2, the refresh.** A Supabase Edge Function re-reading saved listings on
   demand. Unblocked: the spike proved both sites give up the bid and the
   closing time in the raw HTML, and `lib/parse.js` already does the reading.
   One useful discovery — a single StorageTreasures request returns every
   auction at that facility, so several saved units at one place can cost one
   request rather than one each. Bid13 may allow the same trick for a different
   reason: two units at one facility carried an identical `data-expiry`, so a
   facility seems to close as a batch. Observed twice, not established.
4. **Nicknames.** The schema holds one and `db.js` is careful never to
   overwrite it. Nothing offers to set one.
5. **The phone side.** Unstarted. Not on Manus servers; GitHub Pages was the
   idea.

**Known and deliberate, not bugs:**

- One photo per StorageTreasures unit — their payload carries a single `image`,
  not a gallery.
- Facility names arrive truncated (`SecureSpace Self Stora…`). That is genuinely
  all that exists, in their data and on their own page.
- Bid13 publishes no bid count. It does say `NO BIDS YET` when there are none,
  and `HIGH BIDDER D*****D` — masked, and useless to us — when there are. So
  zero bids is knowable and any other number is not: `total_bids` is `0` or
  `null`, never a guess.
- Bid13's `#high-bid-amount` holds a *starting price* until someone bids, with
  the label beside it flipping `STARTING BID` → `CURRENT BID`. Both go into
  `bid_cents`; `total_bids` is what distinguishes them.
- Bid13 photos are loaded by script, so they are captured when saving from a
  desktop browser and missed by any server-side fetch. They arrive as 440x250
  thumbnails from `uccdn.bid13.com/thumbs/`; the full-size versions live behind
  "View all photos of this unit" and are not read.

**Decided but not designed:**

- A "Coming Soon" listing saves with status `unknown`. Honest, not useful.
- StorageTreasures auctions have `soft_close` — a late bid can extend the
  closing time. Nothing accounts for that yet, and it matters for the refresh.

---

## How we work

- **Commit and push together.** GitHub is the backup; the laptop is
  second-hand and unreliable. Never force-push without asking.
- **Tag states she has personally seen work**, so there is always something to
  return to. `m1-verified` is the current one.
- **`npm test` before committing anything that touches `lib/parse.js`.**
  Nothing to install; it is node's own runner.
- **At a stopping point:** update the section above, commit, push, and leave a
  short handoff in the conversation. Next session starts by reading this file
  and PLAN.md.
- She is new to structured development and is learning this as we go. Explain
  the reasoning, not just the change — especially when something turns out to
  be wrong.

---

## Rules that do not change

- **Three people.** Her, her boyfriend, her friend. Not the Chrome Web Store,
  not public. Enforced by Google: the OAuth consent screen stays in **Testing**
  with three test users. Never press "Publish app".
- **`extension/config.js` stays out of git.** It holds the project URL and the
  publishable key. It has never been committed; keep it that way.
- **Never ask for or accept** a password, a database password, an
  `sb_secret_` key or a `service_role` key.
- **Bid13's robots.txt asks for `Crawl-delay: 5` and disallows ClaudeBot.**
  Adelaide does not fetch bid13.com from a server on Claude's initiative. Reads
  happen in her browser, on pages she opened. The delay lives in the
  `site_config` table so honouring it is a setting, not a memory.
- **Nothing runs on its own.** No background worker, no alarms, no content
  scripts. Opening the popup is what grants a one-time look at the current tab.
  This is a design commitment, not an implementation detail.

## Things that were expensive to learn

- **StorageTreasures is a single-page app.** `__NEXT_DATA__` describes whichever
  page the tab loaded *first* and is never rewritten on navigation. The URL is
  the authority. A test fails if that stops being true.
- **Its payload lies about types.** Ids and bid counts arrive as strings,
  `image` is an object, and the routing block carries an `auction_id` without
  being an auction.
- **`type_name` reads "Non-Lien Unit / Manager Special"** — testing whether
  "lien" appears in it marks every non-lien unit as a lien unit.
- **Verify through the path the code actually takes.** Three of the bugs here
  survived a check that used `fetch(location.href)` while the extension reads
  the DOM.
- **Interpretation inside `extract.js` cannot be tested, so it hides bugs.**
  Photo selection lived there, filtering on `/sites/default/files/` — a path
  bid13.com stopped serving from. Every Bid13 listing saved with no photos at
  all, silently, and the test suite was green throughout. Selection and id
  extraction now live in `parse.js`. `extract.js` gathers; nothing else.
- **Believing a comment over the page.** `unit_size: null, // Bid13 doesn't
  publish one` — it publishes it, in `div.unit-info-detail`, along with the
  unit type. So does the facility's real name, on the line under the `<h1>`,
  which beats the one the URL slug implies.
- **`HIGH BIDDER` begins with `BID`.** A bid-count regex needs its `\b`, for
  the same reason `"Non-Lien"` needs an anchor.
