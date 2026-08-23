/* ============================================================
   backend.js — storage adapter for hosting outside Claude.

   The artifact version of this app uses window.storage, an API
   that exists only inside Claude artifacts. On GitHub Pages there
   is no server, so shared state needs a hosted database.

   This adapter uses Firebase Realtime Database, chosen because:
     - the free tier is ample for classroom use
     - it works entirely from the browser, so GitHub Pages is enough
     - it pushes changes, so the 4s poll can be dropped
     - no card content or personal data is stored, only game state

   SETUP
     1. console.firebase.google.com -> create a project
     2. Build -> Realtime Database -> Create -> start in test mode
     3. Project settings -> Your apps -> Web -> copy the config
     4. Paste it into FIREBASE_CONFIG below
     5. Before your first real class, replace the test-mode rules
        with the rules block at the bottom of this file

   The Firebase web API key is not a secret; it identifies the
   project, it does not grant access. Access is governed by the
   database rules. Committing it is normal and safe.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, get, set, onValue,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  // Copy databaseURL exactly from the Firebase console. Outside us-central1
  // it looks like https://<project>-default-rtdb.<region>.firebasedatabase.app
  databaseURL: "https://REPLACE_ME-default-rtdb.firebaseio.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

/* Sessions are namespaced so two classes can run at once.
   Add ?session=fall2026-tue to the URL to pick one. */
const params = new URLSearchParams(window.location.search);
const SESSION = (params.get("session") || "default")
  .replace(/[^a-zA-Z0-9_-]/g, "")
  .slice(0, 40) || "default";

const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);

/* Firebase paths cannot contain "." "#" "$" "[" "]" or "/",
   and the app's keys look like "game:team:3". Colons are fine. */
const path = (key) => `sessions/${SESSION}/${key.replace(/[.#$[\]]/g, "_")}`;

window.SOLUTIONS_BACKEND = {
  async get(key) {
    const snap = await get(ref(db, path(key)));
    return snap.exists() ? snap.val() : null;
  },
  async set(key, val) {
    await set(ref(db, path(key)), val);
    return true;
  },
  /* Optional: the app polls by default, but if you want push updates
     call this from a useEffect and drop the interval. */
  subscribe(key, cb) {
    return onValue(ref(db, path(key)), (snap) =>
      cb(snap.exists() ? snap.val() : null)
    );
  },
  sessionName: SESSION,
};

console.info(`Solutions Table: Firebase backend ready, session "${SESSION}"`);

/* ------------------------------------------------------------
   DATABASE RULES — paste into Realtime Database -> Rules.

   Test mode leaves the database open to anyone who finds the URL,
   which is fine for a demo and not fine for a term. These rules
   keep it open to writes but bound the damage: session names must
   look sane, and stored values are size-limited.

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

   If you need real access control — for example if sessions carry
   student names — turn on Firebase Anonymous Auth and change
   ".write" to "auth != null". The app does not require it.
   ------------------------------------------------------------ */
