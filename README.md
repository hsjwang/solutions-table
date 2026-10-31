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

> **On the Firebase API key.** It is not a secret — Firebase compiles it into the
> client bundle by design, and GitHub's secret scanner flags it anyway. See
> [SECURITY.md](SECURITY.md) for what to do about the alert and, more
> importantly, for the HTTP referrer restriction that actually protects the key.

**Configure the database.** At [console.firebase.google.com](https://console.firebase.google.com):
create a project, enable **Realtime Database** in test mode, *then* register a web
app under Project settings.

Open `src/backend.js` and find the block marked **PASTE YOUR VALUES HERE**. Fill
in the seven values from the Firebase console.

> **Copy only the values, not the whole snippet.** Firebase shows you a block that
> includes its own `import { initializeApp } from "firebase/app"` and its own
> `const app = initializeApp(firebaseConfig)`. This file already has both. Pasting
> the whole thing produces `The symbol "initializeApp" has already been declared`.

Create the Realtime Database *before* registering the web app, or the config
Firebase generates will have no `databaseURL` — the app needs it.

The Firebase web API key is not a secret. It identifies the project; it does not
grant access. Access is controlled by database rules. Committing it is normal.

**Enable Anonymous sign-in:** Build → Authentication → Sign-in method →
Anonymous → Enable. Nothing saves without it.

**Publish the rules** in [`database.rules.json`](database.rules.json) — paste
them into Realtime Database → Rules, or run `firebase deploy --only database`.
They are what enforce the facilitator role and team seat ownership. Test mode
leaves the database writable by anyone who finds the URL, and expires after 30
days.

Optionally keep the config out of git: copy `.env.example` to `.env` and fill it
in instead of editing `src/backend.js`. For Pages, add the same names under
Settings → Secrets and variables → Actions.

```bash
npm run dev      # http://localhost:5173/solutions-table/
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

## Documentation

Everything a facilitator needs is in `docs/`. LaTeX sources are in `docs/src/`;
rebuild any of them with `pdflatex <file>` run twice.

| File | Pages | For |
|---|---|---|
| [`facilitator_quickref.pdf`](docs/facilitator_quickref.pdf) | 4 | **Start here.** Print double-sided on one folded sheet and hand it to a TA. Running the activity, when to intervene, web and condition operations, and the scenario index |
| [`facilitator_manual.pdf`](docs/facilitator_manual.pdf) | 27 | Full reference. Gameplay variants, modifier adjudication with worked examples, campaign play, assessment rubric, running the browser version, the controlled-study protocol, and ten scenarios with expert keys (Appendix C) |
| [`survey_instrument.pdf`](docs/survey_instrument.pdf) | 8 | Participant and facilitator survey forms with scoring notes |
| `docs/src/qualtrics_*.txt` | — | Import straight into Qualtrics: *Create project → Survey → From a file* |

### If you read only two things

Page 2 of the quick reference (**when to intervene**) and Appendix C of the
manual (**the ten scenarios**). Facilitators who improvise a scenario, or who
intervene too early, account for most sessions that fall flat.

### Standing risks (optional)

Toggle on from the facilitator panel. Each scenario carries **two problems the
client already had**, pre-placed on the matrix and lettered A and B. Teams do not
build them — they inherit them, which keeps Phase 1 short.

The budget does not increase. Six points now cover today's incident *and* two
chronic problems, which is the triage a clinic engagement actually involves: the
client calls about the fire, but the fire is a symptom.

This is what makes breadth pay. A control that touches several problems now
scores better than one that only touches today's — which is why asset inventory
and account hygiene are foundational, and something the single-threat loop could
not teach.

In campaign play, an addressed standing risk eases by one cell and an ignored one
worsens, on the same logic as the main threat. The export gains a
`standing_ignored` column, which over several engagements shows whether a team
ever stopped firefighting.

Recommended from mid-course. Adding two more objects to track cuts against the
"bound the working set" requirement, so do not turn it on in week one.


### Campaign play across a term

The same client organization returns in a later week. Use **Next engagement**,
not *New round* — it carries the board forward instead of clearing it.

**Controls stay installed.** An organization does not forget its backups. Cards
bought in an earlier engagement remain in place, are excluded from the new deal,
and show as *Already in place* above the hand. Spending compounds; that
accumulation is the visible reward for defending well.

**Budgets refresh every engagement.** A team that spent everything in round one
is not stranded — they get a fresh allocation. Unspent points are lost unless
banked with Deferred Investment.

| | Points next engagement |
|---|---|
| Normal | the session budget, usually 6 |
| Played Deferred Investment | +4, so 10 — the \textsc{ig2} tier |
| Suffered an incident with no Incident Response Planning | −1, floor of 3 |

**Threats move on coverage, and that is the feedback.** At each advance the app
scores the portfolio against the scenario's expert key — strong cards count 2,
partial 1:

| Score | Verdict | Likelihood |
|---|---|---|
| 2 or more | **held** | falls one cell |
| 1 | **partial** | unchanged |
| 0 | **unaddressed** | rises one cell |

Deferred Investment adds one cell on top, so a team that covers well *and* defers
holds level rather than improving. That is the price of the extra points.

**Severity never moves.** It is a property of who gets harmed, and that does not
change because an organization delayed. If severity drifted too, every threat
would march to the top-right corner and the matrix would stop distinguishing a
stolen laptop at a shelter from a defaced page at a utility.

**Realization** fires when a threat would move past *Very Likely*. The attack
happens, and the outcome resolves against every card the team has ever
bought — detection, response, recovery, financial, disclosure — never by chance.
Afterwards the threat resets to *Likely*: the incident forces attention, and a
team can climb back out rather than being pinned.

Players see a verdict banner at the start of each engagement saying whether last
year's portfolio held, helped a little, or did not address the threat. That is
the feedback Cycle 1 participants asked for, delivered after they commit rather
than as an answer sheet during play.

The export gains `engagement`, `drift`, `realized`, `verdict` and
`ever_purchased` columns.

### The facilitator role

Enforced by the database, not just the interface. Every browser signs in
anonymously and gets a stable `uid`; the rules permit writes to the session
config only from the uid that holds the role.

- **A student cannot take the role by clicking the facilitator link.** The write
  is refused by Firebase, not hidden by the UI.
- **Only the holder can release it** — a *Release the role* button in their
  panel. Teams and the board are untouched.
- **The role frees itself about two minutes after the holder's last action.** A
  crashed browser, a closed laptop, or a switch of device does not strand the
  class. The facilitator view sends a keepalive every 45 seconds so reading the
  room does not count as absence.
- **While the role is live, a takeover also needs the code** (stored hashed).
  Once it is stale, no code is needed, because by then nobody is there to ask.
- **The displaced holder is locked out**, not left running. Two people changing
  the phase at once is worse than one being locked out.
- **Change the code** mid-session to cut off anyone who has learned it.

`heldAt` is written with Firebase's server timestamp and the rules require it to
equal their own clock, so a client cannot backdate it to force a takeover.

**Required setup:** Build → Authentication → Sign-in method → **Anonymous** →
Enable. Without it nothing saves, and the app says so in a red bar.

**Tuning:** shorten the two-minute grace period if facilitators change often;
lengthen it if a stale role gets grabbed during long debriefs. The value appears
in the rules and as `STALE_MS` in the component; change both.

### Team seats

A team key is writable only by the browser that claimed the seat, plus the
facilitator — who has to be able to deal cards, adjudicate modifiers and reset
boards. A student cannot alter another team's board even by editing the
database directly.

- **Claiming** happens on join. The first device to open a team takes the seat.
- **Later devices watch.** Their controls are disabled and a banner says where
  the changes are being made, so nobody clicks into a refusal.
- **Release seat** — a per-team button in the facilitator's room view. The
  board is untouched; the next device to open that team takes over.

Seats belong to browsers, not people. A student who switches laptops, opens
incognito or clears storage gets a new uid and loses the seat. That is what
*Release seat* is for — without it a flat battery would cost a team its board.

### Scenarios in the app

The ten scenarios from Appendix C, plus four practitioner scenarios (below), are built into the interface. Claiming the
facilitator role on a fresh session loads Scenario 1 automatically; the dropdown
switches between the rest. Loading one sets the organization, the read-aloud
text, the budget, and moves play to Phase 1.

Each scenario carries an **expert key** — strong, partial, and weak-here
controls — shown to the facilitator only. It is a scoring reference and a way to
follow the discussion. It is not an answer to steer teams toward, and it is never
shown to players.

Scenarios marked $\bullet$ may land on a participant's personal experience.
Offer the redraw described on page 2 of the quick reference **before** reading
them, addressed to the team rather than to any individual.

### Practitioner options (added after BSides PNW, October 2026)

Practitioners who played the demo at a BSides Pacific Northwest gathering found the
board too coarse, the scenarios too thin to argue a purchase from, and the hand too
small. Each change below is a facilitator setting, so classroom and study sessions
can still run the way they always have.

| Setting | Default | What it does |
|---|---|---|
| **Audience** | — | One click: *Students* is 8 cards and story-only scenarios; *Practitioners* is 12 cards and the technical brief. |
| **Scenario detail** | Standard | *Technical* shows each scenario's environment brief (systems, configuration, contracts, regulatory clocks) to every team and on the projector. Phase 1's timer default rises from 7 to 10 minutes. |
| **Cards dealt** | 8 | 8, 10, 12 or 14. Above 8, every hand holds at least **two strong and two partial** cards for the scenario instead of one of each. |
| **Risk matrix** | 5×5 for new sessions | *Rare → Very Likely* by *Minimal → Very Severe*. 3×3 remains for data that must compare with earlier sessions. Locked once teams have placed a threat. |
| **Learn-more links** | On | Each card links to its CIS Control page in a new tab (Physical Security and Cyber Insurance, which have no CIS Control, link to CISA and NIST). |
| **Delayed threats** | On | Each **Next engagement** lands a new threat on top of the existing ones, up to three. |

**Four practitioner scenarios** (11–14, marked *practitioner* in the dropdown) are
set in mid-sized organizations with an IT function: a help-desk MFA reset that
reaches the hypervisors, a leaked CI key in a cloud account, an exploited VPN
appliance on a county domain that also runs 911 dispatch, and an OAuth consent grant
at a credit union. The ten original scenarios each gained a technical brief written
against their existing expert keys, so the keys did not change.

**Delayed threats.** Each scenario has its own follow-on threat (shown to the
facilitator under the expert key), followed by a generic pool. Teams place the new
threat on the same matrix as a numbered square, beside the original circle. The
budget does not grow, so one portfolio must cover every threat on the board or the
team must say which one it is leaving. A delayed threat is scored against
everything the organization has installed, not just this round's purchases. It
moves and realizes on the same rules as the main threat, and every deal includes
at least one strong card for each delayed threat in play.

**On 5×5**, a portfolio that scores 4 or more against the key (two strong cards)
moves a threat down two rows instead of one. Realization still fires past
*Very Likely*, and resets to the middle row (*Possible*).

**Justification fields.** Phase 1 asks *why this cell?* and Phase 3 asks which
purchase moved the marker and by how much. Both are exported.

**Export changes.** New columns are appended at the end of each row so
position-indexed scripts keep working: `grid_size`, `deal_size`, `detail`, `hand`,
`pre_why`, `post_why`, `new_threats`, `new_threat_positions`, `realized_threats`,
`expansion`.
The header previously listed `threat_method, threat_impact` before
`verdict, standing_ignored` while the rows wrote them after; the header now matches
the rows. **CSVs exported before this change have those four columns mislabeled.**

### Expansion deck (optional)

A three-way **Deck** setting in the facilitator's *Scenario* section: **Base**,
**Expansion**, or **Expansion + safeguards**. **Base is the default**, and it leaves
the deck, keys, modifiers and delayed threats identical to earlier sessions — use
it whenever the data must compare with the study.

When on, it adds:

| | |
|---|---|
| **8 controls** | Application & Pipeline Security (CIS 16) · Data Inventory & Loss Prevention (CIS 3) · Privileged Access Management (CIS 5, 6) · Vulnerability Scanning (CIS 7.5–7.7) · Incident Response Exercises (CIS 17.7–17.8) · Application Allowlisting (CIS 2.5–2.7) · Zero Trust Remote Access (CIS 12.7, 13.5) · Mobile & Endpoint Device Management (CIS 3.6, 4.3, 4.10–4.12) |
| **2 modifiers** | Separation of Duties · Shared Responsibility |
| **3 scenarios** | 15 *The Poisoned Dependency* (a compromised build dependency steals a signing key) · 16 *The Research Export* (an authorized researcher publishes re-identifiable data; marked *care*) · 17 *Remote Access to the Line* (a vendor remote-access tool on an ammonia-refrigeration plant's controls) |
| **2 delayed threats** | *The Browser Extension* and *The Leaked Repository*, after the base four |

Every base scenario and delayed threat has an expansion key (`EXPANSION_KEYS` in
the source) that scores the new cards. It only adds: no base strong card is
demoted, so the right answers you already know still hold. Expansion scenarios
appear in the dropdown only while the toggle is on, and loading one keeps the
expansion active for the session even if the toggle is later switched off, because
their keys depend on it. An expansion key can also add a new card to a scenario's
standing risks (device management now also covers *Staff use personal phones* in
scenario 3, for example). The deck becomes 14 Foundational, 11 Extended and
4 Advanced cards, and the tier mix of each deal shifts to match. The export gains an
`expansion` column.

**Coverage.** With the expansion on, every one of the 18 CIS Controls has at least
one card. The remaining gaps are at the safeguard level, which is what the
safeguard pool is for.

### Safeguard pool (Expansion + safeguards)

Single CIS safeguards that **no control card lists**, so a team can never buy the
same defense twice under two names. Each team gets a separate row of
**4 safeguard cards** beside its control hand, at least one relevant to the
scenario or a delayed threat in play (preferring one whose parent the team can
actually get). Safeguards cost **1 point** from the same budget, and turning the
pool on adds **+2 to the budget** (turning it off takes them back).

**Each safeguard refines a parent control** and can only be bought while the team
owns that control or is buying it this round. Returning the parent returns its
safeguards. An organization does not review logs it does not collect.

| Safeguard | CIS | Parent |
|---|---|---|
| Audit Log Retention | 8.10 | Audit Logging & SIEM |
| Audit Log Review | 8.11 | Audit Logging & SIEM or Managed Detection & Response |
| Network Flow Logging | 13.6 | Audit Logging & SIEM or Network Segmentation |
| Port-Level Access Control | 13.9 | Network Segmentation |
| Network Infrastructure Updates | 12.1 | Software Updates |
| Secure Network Device Management | 12.3 | Secure Configuration |
| Dedicated Admin Workstations | 12.8 | Privileged Access Management or Identity & Access Management |
| Remove Unnecessary Services | 4.8 | Secure Configuration |
| Data Retention | 3.4 | Data Inventory & Loss Prevention or Encryption |
| Service Provider Assessment | 15.5 | Third-Party & Contractual |
| Service Provider Offboarding | 15.7 | Third-Party & Contractual |
| Incident Communication Plan | 17.6 | Incident Response Planning |
| Incident Severity Thresholds | 17.9 | Incident Response Planning |
| Third-Party Component Updates | 16.5 | Application & Pipeline Security |

**Scoring is capped.** Safeguard keys (`SAFEGUARD_KEYS` in the source) score a
safeguard as partial, and as strong only where the scenario turns on that exact
safeguard — for example 8.10 in *The Trusted Paralegal*, where thirty days of
history cannot answer a question about a filing drafted six weeks ago. Nine such
cases exist. A row of cheap safeguards therefore cannot outscore a real control.

Still not covered by any card or safeguard, deferred until a playtest says they
are missed: 12.6, 13.3, 15.2, 15.3, 15.6 and 3.5. The export gains `safeguards`,
`safeguard_hand` and `safeguards_purchased` columns.

**Safeguard numbers on base cards** were corrected in the same release, without
changing any key: Social Engineering Awareness now lists 14.1–14.6, Backup &
Recovery 11.1–11.5 (testing a restore), and Email & Browser Protections
9.1, 9.2, 9.4–9.6 (extensions and DMARC). These change only the label on the card.

The PDFs in `docs/` still describe the 3×3 matrix and ten scenarios and have not
been rebuilt.

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
