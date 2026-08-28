# Security

## GitHub flagged a secret in this repository

**First, identify what was flagged.** Repository → **Security → Secret scanning**.
The response differs completely depending on the answer.

### If it is a Google API key (`AIzaSy...`)

That is the Firebase **web** API key, and it is not a secret. Firebase compiles it
into the client bundle by design; it identifies the project and does not
authorize anything. Anyone can read it out of the deployed site whether or not it
appears in the repository. Google documents this explicitly.

You can dismiss the alert as a false positive. **But do not stop there** — the
key being public is only safe if the two controls below are in place.

### If it is a service account, an Admin SDK key, or a `BEGIN PRIVATE KEY` block

That is a real credential with full project access. Act today:

1. **Revoke it.** Google Cloud console → IAM & Admin → Service Accounts → find
   the account → Keys → delete the exposed key. Revoking matters more than
   deleting the file, because the file is still in your git history.
2. **Check for use.** Firebase console → Usage, and Cloud Logging, for activity
   you do not recognise.
3. **Then** remove it from history:
   ```bash
   pip install git-filter-repo
   git filter-repo --path path/to/leaked-file --invert-paths --force
   git push --force origin main
   ```
   Anyone who cloned the repository still has the old history, which is why
   revocation comes first.

This project never needs a service account. Everything runs from the browser with
the web config and anonymous auth. If one appeared, it was added by mistake.

---

## What actually protects the project

### 1. Database rules

In [`database.rules.json`](database.rules.json), with notes in
[`database.rules.README.md`](database.rules.README.md). They enforce that only
signed-in clients can write, only the facilitator's uid can change the session
config, and only a seat's owner can change that team's board.

Confirm they are published: Realtime Database → Rules, or
`firebase deploy --only database`.

These are published on purpose. Rules are enforced on Google's servers, so
knowing them grants nothing, and anyone can map them empirically in minutes by
attempting writes and seeing which are refused. Keeping them visible lets
adopters check the enforcement model rather than trust it. If you prefer
otherwise, gitignore the file — nothing reads it at runtime.

### 2. HTTP referrer restrictions on the API key

**This is the control most people miss.** Without it, someone who copies your
key can use it against your project quota from anywhere.

1. [Google Cloud console → Credentials](https://console.cloud.google.com/apis/credentials)
   (select your Firebase project)
2. Click the **Browser key (auto created by Firebase)**
3. Under *Application restrictions*, choose **Websites**
4. Add exactly:
   ```
   https://YOUR-USERNAME.github.io/*
   http://localhost:5173/*
   ```
5. Under *API restrictions*, select **Restrict key** and allow only:
   Identity Toolkit API, Token Service API, Firebase Realtime Database API
6. Save. Changes take up to five minutes.

Then reload your site and confirm it still works. If it breaks, the referrer
pattern is wrong — check for a missing `/*`.

### 3. Budget alerts

Anonymous auth plus open reads means a determined stranger can generate traffic.
The free Spark tier cannot bill you, but if you ever upgrade to Blaze, set a
budget alert first: Google Cloud console → Billing → Budgets & alerts.

### 4. Firebase App Check (optional, stronger)

App Check attests that requests come from your actual site rather than a script.
Firebase console → Build → App Check → register the web app with reCAPTCHA v3,
then enforce it on Realtime Database. It adds a moving part; for a classroom
tool the three controls above are usually enough.

---

## Keeping the config out of the repository

The build now reads the Firebase config from environment variables, falling back
to the literals in `src/backend.js`.

**Local:** copy `.env.example` to `.env` and fill it in. `.env` is gitignored.

**GitHub Pages:** Settings → Secrets and variables → Actions → New repository
secret, once per variable in `.env.example`. The workflow injects them at build
time.

Then blank the fallbacks in `src/backend.js` back to `REPLACE_ME` and commit.

> Be clear about what this buys. The config still ships in the deployed
> JavaScript and is readable by anyone who opens developer tools. Environment
> variables stop the scanner alert and keep the values out of git history. They
> are not a substitute for the rules and the referrer restrictions.

---

## What this project does not protect

- **Team boards are visible to everyone in the session.** That is the point.
- **Anyone with the link can join a team.** Appropriate for a classroom, not for
  anything carrying real data.
- **Never put real client information into a session.** Use fictional
  organizations. This applies to the physical deck too.
- **Session data is not encrypted at rest** beyond what Firebase provides. Do
  not store anything you would not put on a whiteboard.

## Reporting a problem

Open an issue, or contact the maintainers privately if it involves participant
data.
