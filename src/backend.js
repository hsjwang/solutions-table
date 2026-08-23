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
  console.error(msg);
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.textContent = msg;
    bar.style.cssText =
      "position:fixed;inset:0 0 auto 0;z-index:9999;background:#C0453B;color:#fff;" +
      "font:13px/1.5 ui-monospace,Menlo,monospace;padding:10px 14px";
    document.body.appendChild(bar);
  });
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
  console.info(`Solutions Table: Firebase backend ready, session "${SESSION}"`);
}

/* ------------------------------------------------------------
   DATABASE RULES — paste into Realtime Database -> Rules, Publish.

   Requires Anonymous sign-in:
     Build -> Authentication -> Sign-in method -> Anonymous -> Enable

   What these enforce:
     - only signed-in clients can write anything
     - only the uid holding the facilitator role can write the session
       config, so a student cannot take over by opening the facilitator link
     - the role frees itself about two minutes after the holder's last
       action, so a crashed browser or a switch of device does not strand
       the class
     - heldAt must equal the server's own clock, so a client cannot fake a
       stale role to force a takeover
     - a team key is writable only by the device that claimed the seat,
       plus the facilitator, who must be able to deal cards, adjudicate
       modifiers and reset boards
     - a seat with no owner is free to claim; the facilitator can release
       one from the room view when a laptop dies

{
  "rules": {
    "sessions": {
      "$session": {
        ".read": "auth != null",
        ".validate": "$session.matches(/^[a-zA-Z0-9_-]{1,40}$/)",

        "game:config": {
          ".write": "auth != null && (
              !data.exists()
              || !data.child('facilitatorId').exists()
              || data.child('facilitatorId').val() === auth.uid
              || data.child('heldAt').val() < (now - 120000)
          )",
          ".validate": "(
              newData.child('facilitatorId').val() === auth.uid
              || !newData.child('facilitatorId').exists()
            ) && newData.child('heldAt').val() === now"
        },

        "$key": {
          ".write": "auth != null && (
              !$key.beginsWith('game:team:')
              || !data.exists()
              || !data.child('ownerUid').exists()
              || data.child('ownerUid').val() === auth.uid
              || root.child('sessions').child($session).child('game:config')
                     .child('facilitatorId').val() === auth.uid
          )",
          ".validate": "newData.isString() ? newData.val().length < 20000 : true"
        }
      }
    }
  }
}

   NOTE ON SEATS
     Seat ownership is by browser, not by person. A student who switches
     laptops, opens incognito, or clears storage gets a new uid and loses
     the seat. That is why the facilitator can release one — without it a
     dead battery would cost a team its board.

   LOOSENING
     Shorten 120000 (two minutes) if facilitators change often; lengthen it
     if a stale role is being grabbed during long debriefs.
   ------------------------------------------------------------ */
