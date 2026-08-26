// Google sign-in, for the extension and for the web app both.
//
// The flow, in order:
//   1. Ask Supabase for Google's consent URL, telling it where to come back to.
//   2. Hand that URL to the platform. In Chrome that opens a window and returns
//      the redirect URL; on the web the page navigates away and comes back.
//      We never see the password — Google and the browser handle it.
//   3. Take the tokens off the fragment, keep them, and refresh when they expire.
//
// Only steps 1 and 2 differ between the two, and only in platform.js.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";
import { platform } from "./platform.js";

const SESSION_KEY = "adelaide.session";

export const redirectUrl = () => platform.redirectUrl();

export function authorizeUrl() {
  const authorize = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorize.searchParams.set("provider", "google");
  authorize.searchParams.set("redirect_to", redirectUrl());
  return authorize.toString();
}

// Supabase returns the session on the URL fragment, not the query string.
// Takes either a whole URL or a bare fragment; returns null when there is no
// session on it, and throws only when the fragment says something went wrong.
export function sessionFromFragment(input, now = Date.now()) {
  const text = String(input ?? "");
  const fragment = text.includes("#") ? text.slice(text.indexOf("#") + 1) : text;
  const params = new URLSearchParams(fragment);

  const failed = params.get("error_description") || params.get("error");
  if (failed) throw new Error(failed);

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;

  return {
    access_token,
    refresh_token,
    expires_at: now + Number(params.get("expires_in") || 3600) * 1000,
  };
}

export async function signIn() {
  const returned = await platform.authorize(authorizeUrl());
  // The web platform never arrives here: the page has already gone.
  if (!returned) throw new Error("Sign-in was closed before it finished.");

  const session = sessionFromFragment(returned);
  if (!session) {
    throw new Error("Signed in, but no session came back. Check the redirect URL allow-list.");
  }
  await platform.write(SESSION_KEY, session);
  return session;
}

// For a page that signs in by redirect: take the session off the address bar
// if one is there, and clear it off either way. Tokens should not sit in the
// URL to be copied, shared or kept in history.
export async function adoptRedirect() {
  if (typeof location === "undefined" || !location.hash) return null;
  let session = null;
  try {
    session = sessionFromFragment(location.hash);
  } finally {
    if (location.hash.includes("access_token") || location.hash.includes("error")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }
  if (session) await platform.write(SESSION_KEY, session);
  return session;
}

export async function signOut() {
  await platform.remove(SESSION_KEY);
}

async function refresh(session) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    await signOut();               // refresh token is dead; make them sign in again
    return null;
  }
  const data = await res.json();
  const fresh = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await platform.write(SESSION_KEY, fresh);
  return fresh;
}

// The only function the rest of the app should call.
// Returns a valid session, or null if nobody is signed in.
export async function getSession() {
  const stored = await platform.read(SESSION_KEY);
  if (!stored) return null;
  // Renew a minute early rather than discovering it expired mid-request.
  if (Date.now() > stored.expires_at - 60_000) return refresh(stored);
  return stored;
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}
