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
  getDatabase, ref, get, set, onValue,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ============================================================
   PASTE YOUR VALUES HERE
   Replace each REPLACE_ME with the matching value from the
   Firebase console. Keep the quotes and the commas.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_ME",
  authDomain:        "REPLACE_ME.firebaseapp.com",
  // Copy databaseURL exactly. Outside us-central1 it looks like
  // https://<project>-default-rtdb.<region>.firebasedatabase.app
  databaseURL:       "REPLACE_ME",
  projectId:         "REPLACE_ME",
  storageBucket:     "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId:             "REPLACE_ME",
};
/* ===================== STOP EDITING ========================= */

/* Fail loudly and specifically rather than silently not saving. */
const missing = Object.entries(FIREBASE_CONFIG)
  .filter(([, v]) => !v || String(v).includes("REPLACE_ME"))
  .map(([k]) => k);

if (missing.length) {
  const msg =
    `Solutions Table: Firebase config incomplete. Still unset: ${missing.join(", ")}. ` +
    `Open src/backend.js and fill in the PASTE YOUR VALUES HERE block. ` +
    `Teams will not see each other until this is done.`;
  console.error(msg);
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.textContent = msg;
    bar.style.cssText =
      "position:fixed;inset:0 0 auto 0;z-index:9999;background:#C0453B;color:#fff;" +
      "font:13px/1.5 ui-monospace,Menlo,monospace;padding:10px 14px";
    document.body.appendChild(bar);
  });
} else if (!/^https:\/\/.+/.test(FIREBASE_CONFIG.databaseURL)) {
  console.error(
    "Solutions Table: databaseURL does not look like a URL. Copy it from " +
    "Firebase console -> Realtime Database, the line shown above the data tree."
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

/* Firebase paths cannot contain "." "#" "$" "[" "]" or "/",
   and this app's keys look like "game:team:3". Colons are fine. */
const path = (key) => `sessions/${SESSION}/${key.replace(/[.#$[\]]/g, "_")}`;

/* Realtime Database throws on any `undefined` anywhere in the payload.
   A JSON round-trip drops undefined keys and leaves nulls intact. */
const clean = (v) => JSON.parse(JSON.stringify(v ?? null));

/* Explain the common failures instead of letting them surface as a
   generic "could not save". */
function explain(err, key) {
  const code = err?.code || "";
  if (code.includes("PERMISSION_DENIED") || /permission/i.test(err?.message || "")) {
    return `Firebase refused the write to "${key}". Open Realtime Database -> Rules ` +
           `and confirm ".read" and ".write" are true. Test-mode rules also expire ` +
           `after 30 days.`;
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
  async get(key) {
    try {
      const snap = await get(ref(db, path(key)));
      return snap.exists() ? snap.val() : null;
    } catch (err) {
      console.error("Solutions Table:", explain(err, key), err);
      throw err;
    }
  },
  async set(key, val) {
    try {
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
  console.info(`Solutions Table: Firebase backend ready, session "${SESSION}"`);
}

/* ------------------------------------------------------------
   DATABASE RULES — paste into Realtime Database -> Rules.

   Test mode leaves the database open to anyone who finds the URL
   and expires after 30 days. These rules keep writes open but
   bound the damage: session names must look sane, values are
   size-limited, and nothing outside /sessions is reachable.

{
  "rules": {
    "sessions": {
      "$session": {
        ".read": true,
        ".write": true,
        ".validate": "$session.matches(/^[a-zA-Z0-9_-]{1,40}$/)",
        "$key": {
          ".validate": "newData.isString() ? newData.val().length < 20000 : true"
        }
      }
    }
  }
}

   If sessions will ever carry student names, turn on Firebase
   Anonymous Auth and change ".write" to "auth != null".
   ------------------------------------------------------------ */
