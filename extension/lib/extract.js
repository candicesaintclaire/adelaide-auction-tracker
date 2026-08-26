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

    // Drupal stamps the node id onto the body: page-node-311086
    const node = String(document.body.className).match(/page-node-(\d+)/);

    // Drupal serves uploads from /sites/default/files/; everything else on the
    // page is furniture. These arrive by script after load, which is why saving
    // from a page you're looking at gets photos and a plain fetch can't.
    const photos = [...document.images]
      .map((img) => img.currentSrc || img.src)
      .filter((u) => u && u.includes("/sites/default/files/"))
      .filter((u, i, all) => all.indexOf(u) === i);

    return {
      source: "bid13",
      href,
      nodeId: node ? node[1] : null,
      bidText: bidEl ? bidEl.textContent : null,
      expiry: clock ? clock.getAttribute("data-expiry") : null,
      heading: document.querySelector("h1")?.textContent ?? null,
      photos,
    };
  }

  return null;
})();
