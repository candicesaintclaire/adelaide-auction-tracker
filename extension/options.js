import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isConfigured } from "./config.js";
import { redirectUrl } from "./lib/auth.js";

document.getElementById("redirect").textContent = redirectUrl();
document.getElementById("extid").textContent = chrome.runtime.id;

document.getElementById("copy").addEventListener("click", async (e) => {
  await navigator.clipboard.writeText(redirectUrl());
  e.target.textContent = "Copied";
  setTimeout(() => (e.target.textContent = "Copy"), 1400);
});

const line = (state, text) => {
  const row = document.createElement("div");
  row.className = "status";
  row.innerHTML = `<span class="dot ${state}"></span><span></span>`;
  row.lastChild.textContent = text;
  return row;
};

async function check() {
  const out = document.getElementById("checks");
  out.textContent = "";

  if (!isConfigured()) {
    out.append(line("no", "config.js still has its placeholders. Paste your project URL and anon key in there, then reload the extension."));
    return;
  }
  out.append(line("ok", `Project URL set: ${SUPABASE_URL}`));

  try {
    // A public endpoint: it proves the URL and key are right, and reports
    // which sign-in providers are actually switched on.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    });
    if (!res.ok) {
      out.append(line("no", `Supabase answered ${res.status}. The URL or the anon key is wrong.`));
      return;
    }
    const settings = await res.json();
    out.append(line("ok", "Reached the project, and the anon key is accepted."));

    const google = settings.external?.google;
    out.append(google
      ? line("ok", "Google sign-in is switched on.")
      : line("no", "Google sign-in is off. Authentication → Providers → Google."));
  } catch (err) {
    out.append(line("no", `Couldn't reach the project: ${err.message}`));
  }
}

document.getElementById("recheck").addEventListener("click", check);
check();
