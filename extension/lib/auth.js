// Google sign-in for an MV3 extension, without a build step.
//
// The flow, in order:
//   1. Ask Supabase for Google's consent URL, telling it to come back to
//      https://<extension-id>.chromiumapp.org/ when done.
//   2. Hand that URL to Chrome, which opens the real Google window. We never
//      see the password — Chrome and Google handle it between themselves.
//   3. Chrome hands back the redirect URL with the session tokens on it.
//   4. Keep those tokens in extension storage and refresh them when they expire.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const SESSION_KEY = "adelaide.session";

export const redirectUrl = () => chrome.identity.getRedirectURL();

export async function signIn() {
  const authorize = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorize.searchParams.set("provider", "google");
  authorize.searchParams.set("redirect_to", redirectUrl());

  const returned = await chrome.identity.launchWebAuthFlow({
    url: authorize.toString(),
    interactive: true,
  });
  if (!returned) throw new Error("Sign-in was closed before it finished.");

  // Supabase returns the session on the URL fragment, not the query string.
  const params = new URLSearchParams(new URL(returned).hash.slice(1));
  const error = params.get("error_description") || params.get("error");
  if (error) throw new Error(error);

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) {
    throw new Error("Signed in, but no session came back. Check the redirect URL allow-list.");
  }

  const session = {
    access_token,
    refresh_token,
    expires_at: Date.now() + Number(params.get("expires_in") || 3600) * 1000,
  };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

export async function signOut() {
  await chrome.storage.local.remove(SESSION_KEY);
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
  await chrome.storage.local.set({ [SESSION_KEY]: fresh });
  return fresh;
}

// The only function the rest of the app should call.
// Returns a valid session, or null if nobody is signed in.
export async function getSession() {
  const stored = (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY];
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
