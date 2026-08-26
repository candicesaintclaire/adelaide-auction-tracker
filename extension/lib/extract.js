// Runs inside the auction page itself, on demand, only when the popup is
// opened. Not a content script: nothing here executes while you browse.
//
// This file gathers; it does not interpret. Everything it returns is raw
// material for lib/parse.js, which can be run and tested without a browser.
// Keeping the two apart matters — the interpreting is where the mistakes are,
// and it shouldn't need a live auction page to check.
//
// Returns null if this isn't a page we know.

(() => {
  const href = location.href;
  const host = location.hostname.replace(/^www\./, "");

  if (host === "storagetreasures.com") {
    // Listing pages only — not search results, not facility pages.
    if (!/\/auctions\//.test(location.pathname)) return null;

    const tag = document.getElementById("__NEXT_DATA__");
    if (!tag) {
      return { source: "storagetreasures", href, problem: "This page didn't include the data block Adelaide reads." };
    }

    // The id of whichever page this tab loaded FIRST. StorageTreasures is a
    // single-page app: navigating between units rewrites the address bar and
    // the visible page, but never this block. So it is reported, not trusted —
    // when it disagrees with the URL, the popup fetches the page properly.
    let payloadId = null;
    try {
      payloadId = JSON.parse(tag.textContent)?.props?.pageProps?.auction_id ?? null;
    } catch {
      /* parse.js will report an unreadable block with a better message */
    }

    return {
      source: "storagetreasures",
      href,
      payloadId: payloadId == null ? null : String(payloadId),
      nextData: tag.textContent,
    };
  }

  if (host === "bid13.com") {
    const bidEl = document.getElementById("high-bid-amount");
    const clock = document.querySelector(".countdown[data-expiry]");
    if (!bidEl && !clock) {
      return /\/storage-auctions\//.test(location.pathname)
        ? { source: "bid13", href, problem: "This looks like a listing, but the bid and clock weren't where Adelaide expects." }
        : null;
    }

    const h1 = document.querySelector("h1");

    // Whether anyone has actually bid is stated beside the amount, never
    // inside it: "STARTING BID $25 NO BIDS YET" against "CURRENT BID $40".
    // A slice of the page's own text, bounded — parse.js reads it.
    const flat = String(document.body.innerText || "").replace(/\s+/g, " ");

    return {
      source: "bid13",
      href,
      // Drupal stamps the node id onto the body. Handed over whole: picking
      // the id out of it is interpretation, and interpretation belongs where
      // it can be tested. Note the class list carries a bare "page-node-"
      // as well as the real one.
      bodyClass: String(document.body.className),
      bidText: bidEl ? bidEl.textContent : null,
      bidArea: flat.match(/(?:starting|current|high|winning)\s+bid.{0,120}/i)?.[0] ?? null,
      expiry: clock ? clock.getAttribute("data-expiry") : null,
      heading: h1 ? h1.textContent : null,
      // The line under the unit name carries the facility's real name —
      // "Self Storage of Tacoma - East 44th" — which the URL slug loses.
      facilityLine: h1?.nextElementSibling?.textContent ?? null,
      // Unit type, size, tag number, deposit. One div or several; parse.js
      // copes with either rather than this file guessing.
      details: [...document.querySelectorAll(".unit-info-detail")].map((el) => el.textContent),
      // Every image on the page, unfiltered. Choosing which are unit photos
      // used to happen here, against /sites/default/files/ — a path bid13.com
      // no longer serves from. Every Bid13 listing saved with no photos and
      // nothing could catch it, because code that only runs inside a live
      // page has no test to fail.
      images: [...document.images].map((img) => img.currentSrc || img.src).filter(Boolean),
    };
  }

  return null;
})();
