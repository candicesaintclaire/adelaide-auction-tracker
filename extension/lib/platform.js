// The two things that differ between running as a Chrome extension and running
// as an ordinary web page: where a session is kept, and how the Google window
// gets opened. Everything else about signing in — the token handling, the
// refresh, the expiry — is shared, and lives in auth.js.
//
// Chosen by detection rather than by wiring, so there is no setup step for
// anyone to forget and no way for the wrong one to be installed.

export const chromePlatform = {
  name: "chrome",

  // Chrome gives the extension its own https://<id>.chromiumapp.org/ address.
  redirectUrl: () => chrome.identity.getRedirectURL(),

  // Chrome opens the real Google window and hands back the redirect URL when
  // it is done. We never see the password.
  authorize: (url) => chrome.identity.launchWebAuthFlow({ url, interactive: true }),

  read: async (key) => (await chrome.storage.local.get(key))[key] ?? null,
  write: async (key, value) => chrome.storage.local.set({ [key]: value }),
  remove: async (key) => chrome.storage.local.remove(key),
};

export const webPlatform = {
  name: "web",

  // Whichever page this is, without query or fragment. This exact string has to
  // appear in Supabase's redirect allow-list, so it must not vary: a visitor
  // who typed .../index.html gets the same answer as one who did not.
  redirectUrl: () => location.origin + location.pathname.replace(/index\.html$/, ""),

  // An ordinary redirect — the simpler of the two flows. This never returns:
  // the page is replaced, and comes back later with the session on the
  // fragment for adoptRedirect() to take.
  authorize: async (url) => {
    location.assign(url);
    return new Promise(() => {});
  },

  // A browser set to block site data throws on the accessor itself, so every
  // one of these has to survive that rather than take the page down with it.
  read: async (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  write: async (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* a session we cannot keep means signing in again, not a crash */
    }
  },
  remove: async (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do: it is already not there */
    }
  },
};

export const platform =
  typeof chrome !== "undefined" && chrome?.identity?.launchWebAuthFlow
    ? chromePlatform
    : webPlatform;
