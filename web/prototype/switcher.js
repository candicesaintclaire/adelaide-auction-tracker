// PROTOTYPE — throwaway. Lives on branch prototype/watchlist-ui, never main.
//
// The floating ← B · Countdown → bar. Keeps ?variant= in the address bar so a
// variant survives a reload and can be sent as a link. Only appears on
// localhost, so a stray merge could not show it to anyone.

import { VARIANTS } from "./variants.js";

const params = new URLSearchParams(location.search);
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// False means "not prototyping": the page behaves exactly as on main.
export const prototyping = local && params.has("variant");

export function currentVariant() {
  const key = (new URLSearchParams(location.search).get("variant") || "A").toUpperCase();
  return VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
}

export function mountSwitcher(onChange) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "web/prototype/prototype.css";
  document.head.append(css);

  const bar = document.createElement("div");
  bar.className = "pv-switcher";
  bar.innerHTML =
    `<button class="pv-arrow" data-step="-1" aria-label="Previous variant">←</button>` +
    `<span class="pv-label"><strong></strong><small></small></span>` +
    `<button class="pv-arrow" data-step="1" aria-label="Next variant">→</button>`;
  document.body.append(bar);

  const go = (step) => {
    const i = VARIANTS.indexOf(currentVariant());
    const next = VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next.key);
    history.replaceState(null, "", url);
    onChange();
  };

  bar.addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]")?.dataset.step;
    if (step) go(Number(step));
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, [contenteditable]")) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
}

// What is on screen right now, said in the bar after every switch.
export function describe(variant, summary) {
  const bar = document.querySelector(".pv-switcher");
  if (!bar) return;
  bar.querySelector("strong").textContent = `${variant.key} · ${variant.name}`;
  bar.querySelector("small").textContent = summary;
}
