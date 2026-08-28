/* ============================================================
   backend.js — storage adapter for hosting outside Claude.

   The artifact version of this app uses window.storage, an API
   that exists only inside Claude artifacts. On GitHub Pages there
   is no server, so shared state needs a hosted database. This
   adapter provides that using Firebase Realtime Database.

   >>> YOU ONLY EDIT ONE THING IN THIS FILE. <<<
   Scroll to "PASTE YOUR VALUES HERE" and fill in the seven
   values from the Firebase console.

   Do NOT paste the whole snippet Firebase shows you. It comes
   with its own `import` lines and its own `initializeApp(...)`
   call, and this file already has both. Copy only the values
   inside the braces.

   SETUP
     1. console.firebase.google.com -> create a project
     2. Build -> Realtime Database -> Create -> start in test mode
        (do this BEFORE registering the web app, or the config
        Firebase generates will be missing databaseURL)
     3. Project settings -> Your apps -> Web -> register
     4. Copy the values into the block below
     5. Before your first real class, replace test-mode rules with
        the rules block at the bottom of this file

   The Firebase web API key is not a secret. It identifies the
   project; it does not grant access. Access is governed by the
   database rules. Committing it is normal and safe.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, get, set, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ============================================================
   CONFIGURATION — the only thing you edit in this file.

   Paste the seven values from the Firebase console below. Copy only
   the values, not the whole snippet Firebase shows you: that snippet
   brings its own `import` lines and its own initializeApp() call,
   and this file already has both.

   THESE ARE NOT SECRETS. The Firebase web config is compiled into
   the JavaScript bundle and is readable by anyone who opens the
   deployed site. Keeping it out of the repository hides nothing.
   What protects the project is:
     1. the database rules (database.rules.json)
     2. HTTP referrer restrictions on the API key, set in the
        Google Cloud console — see SECURITY.md
     3. Firebase App Check, if you want to go further

   An earlier version of this file read these from build-time
   environment variables. That was removed: an empty repository
   secret silently overrode the values here and produced a site that
   loaded and then refused every write. Literals are harder to get
   wrong, and they cost nothing that mattered.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBg1ARm_pqEPd3XT1GKwDjBFvjujHS1K8o",
  authDomain:        "cybercardgame.firebaseapp.com",
  // Outside us-central1 this looks like
  // https://<project>-default-rtdb.<region>.firebasedatabase.app
  databaseURL:       "https://cybercardgame-default-rtdb.firebaseio.com",
  projectId:         "cybercardgame",
  storageBucket:     "cybercardgame.firebasestorage.app",
  messagingSenderId: "506801869669",
  appId:             "1:506801869669:web:9f25b09524aad1b876878c",
};
/* ===================== STOP EDITING ========================= */

/* Fail loudly and specifically rather than silently not saving. */
const missing = Object.entries(FIREBASE_CONFIG)
  .filter(([, v]) => !v || String(v).includes("REPLACE_ME"))
  .map(([k]) => k);

function banner(msg) {
  console.error(msg);
  const show = () => {
    const bar = document.createElement("div");
    bar.textContent = msg;
    bar.style.cssText =
      "position:fixed;inset:0 0 auto 0;z-index:9999;background:#C0453B;color:#fff;" +
      "font:13px/1.5 ui-monospace,Menlo,monospace;padding:10px 14px";
    document.body.appendChild(bar);
  };
  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
}

if (missing.length) {
  banner(
    `Solutions Table: Firebase config incomplete — ${missing.join(", ")} still unset. ` +
    `Open src/backend.js and fill in FIREBASE_CONFIG. If you are looking at a ` +
    `deployed site, the change has not reached it: check the build version in the ` +
    `app header against your latest commit. Nothing will save until this is fixed.`
  );
} else if (!/^https:\/\/[^\s]+$/.test(FIREBASE_CONFIG.databaseURL)) {
  banner(
    `Solutions Table: databaseURL is not a URL (${FIREBASE_CONFIG.databaseURL}). ` +
    `Copy it from Firebase console -> Realtime Database, the line shown above the ` +
    `data tree.`
  );
}

/* Sessions are namespaced so two classes can run at once.
   Add ?session=fall2026-tue to the URL to pick one. */
const params = new URLSearchParams(window.location.search);
const SESSION =
  (params.get("session") || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) ||
  "default";

const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);
const auth = getAuth(app);

/* Every browser signs in anonymously and gets a stable uid. The database
   rules use it to enforce who may write the session config, which is what
   stops a student becoming facilitator by clicking the wrong link.
   The uid survives a reload; it does not survive a different browser,
   incognito, or cleared storage. That is what the stale-role grace period
   in the rules is for. */
let resolveReady;
const ready = new Promise((r) => { resolveReady = r; });

signInAnonymously(auth).catch((err) => {
  const msg = err?.code === "auth/operation-not-allowed"
    ? "Solutions Table: Anonymous sign-in is not enabled. Firebase console -> " +
      "Build -> Authentication -> Sign-in method -> Anonymous -> Enable. " +
      "Nothing will save until this is on."
    : `Solutions Table: sign-in failed (${err?.code || err}).`;
  banner(msg);
});

onAuthStateChanged(auth, (user) => { if (user) resolveReady(user.uid); });

/* Firebase paths cannot contain "." "#" "$" "[" "]" or "/",
   and this app's keys look like "game:team:3". Colons are fine. */
const path = (key) => `sessions/${SESSION}/${key.replace(/[.#$[\]]/g, "_")}`;

/* Realtime Database throws on any `undefined` anywhere in the payload.
   A JSON round-trip drops undefined keys and leaves nulls intact. */
const SENTINEL = serverTimestamp();
const clean = (v) => {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(clean);
  if (typeof v === "object") {
    // serverTimestamp() is an object the SDK must receive intact
    if (v[".sv"]) return v;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) out[k] = clean(val);
    }
    return out;
  }
  return v;
};

/* Explain the common failures instead of letting them surface as a
   generic "could not save". */
function explain(err, key) {
  const code = err?.code || "";
  if (code.includes("PERMISSION_DENIED") || /permission/i.test(err?.message || "")) {
    if (key === "game:config") {
      return `Firebase refused the config write. Someone else currently holds the ` +
             `facilitator role for this session. The rules release it about two ` +
             `minutes after their last action — wait, then claim again, or start a ` +
             `separate session with ?session=<name> in the URL.`;
    }
    return `Firebase refused the write to "${key}". Check Realtime Database -> Rules, ` +
           `and confirm Anonymous sign-in is enabled under Authentication.`;
  }
  if (/undefined/i.test(err?.message || "")) {
    return `Payload for "${key}" contained undefined. This is a bug in the app, ` +
           `not your setup — please report it.`;
  }
  if (/URL|network|offline|host/i.test(err?.message || "")) {
    return `Could not reach the database writing "${key}". Check that databaseURL ` +
           `in src/backend.js exactly matches the URL shown above the data tree ` +
           `in the Firebase console.`;
  }
  return `Write to "${key}" failed: ${err?.message || err}`;
}

window.SOLUTIONS_BACKEND = {
  ready,
  get uid() { return auth.currentUser ? auth.currentUser.uid : null; },
  /* Written into heldAt so the rules can compare against their own clock
     rather than trusting a classroom laptop's system time. */
  serverTime: () => serverTimestamp(),
  async get(key) {
    try {
      await ready;
      const snap = await get(ref(db, path(key)));
      return snap.exists() ? snap.val() : null;
    } catch (err) {
      console.error("Solutions Table:", explain(err, key), err);
      throw err;
    }
  },
  async set(key, val) {
    try {
      await ready;
      await set(ref(db, path(key)), clean(val));
      return true;
    } catch (err) {
      console.error("Solutions Table:", explain(err, key), err);
      throw err;
    }
  },
  /* Optional push updates. The app polls every 4s by default; call this
     from a useEffect and drop the interval if you want instant sync. */
  subscribe(key, cb) {
    return onValue(ref(db, path(key)), (snap) =>
      cb(snap.exists() ? snap.val() : null)
    );
  },
  sessionName: SESSION,
};

if (!missing.length) {
  console.info(
    `Solutions Table: Firebase backend ready — project "${FIREBASE_CONFIG.projectId}", ` +
    `session "${SESSION}", db ${FIREBASE_CONFIG.databaseURL}`
  );
}

/* ------------------------------------------------------------
   DATABASE RULES

   The rules are in database.rules.json at the repository root, not
   here. Paste that file into Realtime Database -> Rules -> Publish,
   or deploy it with the Firebase CLI:

       npm i -g firebase-tools
       firebase login
       firebase deploy --only database

   The rules are what actually enforce the facilitator role and team
   seat ownership. This file only talks to the database; it cannot
   grant itself anything the rules refuse.
   ------------------------------------------------------------ */
