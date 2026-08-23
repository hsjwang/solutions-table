# Solutions Table

A shared board for the **Solutions dimension**, an extension to the University of
Washington Security Cards that adds defensive control cards mapped to the CIS
Critical Security Controls v8.1.

Everyone opens the same link. One person takes the facilitator role, everyone
else joins a team, and a projector view shows the whole room on one grid.

---

## What you need to know before you host this

The version of this app that runs inside a Claude artifact uses `window.storage`,
an API that **exists only in that environment**. Copying the component to GitHub
Pages without a replacement will load the interface fine and then fail silently
at every save — teams will not see each other.

`src/backend.js` is that replacement. It defines `window.SOLUTIONS_BACKEND` with
the same two methods (`get`, `set`) backed by Firebase Realtime Database. The
component checks for it and falls back to `window.storage` only when it is
absent, so **the same source file runs in both places**.

You do not have to use Firebase. Anything exposing `get(key)` and
`set(key, value)` will work — Supabase, a small Express server, a Cloudflare
Worker with KV. Firebase is the default because it needs no server of your own
and the free tier comfortably covers a classroom.

---

## Setup

```bash
git clone https://github.com/<you>/solutions-table.git
cd solutions-table
npm install
```

**Configure the database.** At [console.firebase.google.com](https://console.firebase.google.com):
create a project, enable **Realtime Database** in test mode, then copy the web
app config into `FIREBASE_CONFIG` at the top of `src/backend.js`.

The Firebase web API key is not a secret. It identifies the project; it does not
grant access. Access is controlled by database rules. Committing it is normal.

**Before your first real class**, replace test-mode rules with the rules block at
the bottom of `src/backend.js`. Test mode leaves the database writable by anyone
who finds the URL, which is fine for an afternoon and not fine for a term.

```bash
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

## Deploying to GitHub Pages

1. Push to `main`.
2. **Settings → Pages → Source → GitHub Actions.**
3. The included workflow builds and deploys on every push. It derives the Pages
   base path from your repository name, so no config edit is needed.

Your site lands at `https://<you>.github.io/<repo>/`.

If you use a user site (`<you>.github.io`) rather than a project site, set
`base: "/"` in `vite.config.js`.

---

## Running a session

| Who | Opens | Does |
|---|---|---|
| Facilitator | `…/#facilitator` | Sets the organization, scenario, and budget; advances phases; deals cards; adjudicates justifications; exports the session |
| Players | the plain URL | Join a team, roll for threat cards, place on the matrix, buy controls, write justifications |
| Projector | `…/#projector` | Read-only shared screen with a countdown and every team on one grid |

Add `?session=fall2026-tue` to run more than one class at a time. Sessions are
fully separate; the facilitator code is per session.

**The facilitator code** is chosen at claim time and shared only with
co-facilitators. It exists so the role can be reclaimed if a browser closes
mid-class — without it, a crashed tab would strand the session.

### A normal 40 minutes

1. Facilitator sets the organization and reads the scenario aloud. Budget
   defaults to **6**, which is the IG1 tier.
2. **Phase 1.** Teams roll for four threat cards and place the threat on the
   matrix. Severity must be justified by naming who the Human Impact card harms.
3. **Phase 2.** Facilitator deals 8 control cards and 3 modifiers. Teams spend
   tokens. Modifier justifications queue up for adjudication.
4. **Phase 3.** Teams re-place the same threat with controls in place and write
   what still gets through.
5. Compare teams on the projector. This is the part not to skip.
6. **Export CSV.**

### The dice do not decide outcomes

Rolling randomizes which cards you *draw*. What happens when an attack succeeds
follows from what a team bought, never from chance. This is deliberate, and the
interface says so where the roll button lives.

---

## Export

The facilitator's **Export CSV** produces one row per team: threat cards,
pre- and post-control matrix coordinates, tokens spent, controls purchased,
accepted modifiers, and residual-risk text.

Those columns line up with measures M1, M2, and M4 in the study design — the app
collects them automatically instead of from paper record sheets.

---

## Card content and copyright

The 21 control cards and 7 modifiers are ours and are included in full.

The **four original dimensions ship with placeholders**. The University of
Washington Security Cards are copyright their authors and are not reproduced
here. A facilitator can type the official card titles into the dimension lists
before a session, or edit `DEFAULT_DIMS` in `src/SolutionsTable.jsx`.

The original deck: <https://securitycards.cs.washington.edu/>

---

## Known limits

- **Polling, not push.** The board refreshes every 4 seconds by default.
  `backend.js` exports a `subscribe()` helper if you want real-time push; wire it
  into a `useEffect` and drop the interval.
- **Last write wins within a team.** Two players on one team clicking at the same
  instant can overwrite each other. Teams of 2–3 with one person driving avoids
  this. Different teams never collide — each writes only its own key.
- **No authentication.** Anyone with the link can join a team. Appropriate for a
  classroom, not for anything carrying real client data.
- **Do not put real client information in a session.** Use fictional
  organizations. This applies to the physical deck too.

---

## License

Code: MIT. Card content and documentation: CC BY 4.0.
The original Security Cards remain © University of Washington.
