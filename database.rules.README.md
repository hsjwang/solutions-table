# Database rules

`database.rules.json` is the access control for this project. It is what stops a
student becoming facilitator or editing another team's board — not the interface,
which only hides controls that the database would refuse anyway.

## Deploying

Either paste the file into **Realtime Database → Rules → Publish**, or:

```bash
npm i -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy --only database
```

## What it enforces

| Path | Who may write |
|---|---|
| `sessions/$s/game:config` | the uid holding the facilitator role, or anyone if the role is vacant or stale for two minutes |
| `sessions/$s/game:team:N` | the uid that claimed the seat, plus the facilitator |
| everything else under `sessions/$s` | any signed-in client, values capped at 20 KB |

Reads require sign-in. `heldAt` must equal the server's clock, so a client cannot
backdate the facilitator heartbeat to force a takeover.

## Recovering a stuck session

If nobody can claim the facilitator role and every attempt returns
`PERMISSION_DENIED`, the config node is holding an id that no longer matches any
signed-in user — usually a session created before anonymous auth was enabled.

Delete it: Firebase console → Realtime Database → Data → hover `sessions` → ✕.
Nothing is lost that a session in that state still had. Or leave it and start a
clean session with `?session=<name>` in the URL.

The `!data.child('heldAt').exists()` clause exists to stop this happening again:
a config with no heartbeat is always claimable.

## Tuning

- **`120000`** is the stale-role grace period in milliseconds. Shorten it if
  facilitators change often; lengthen it if a role gets grabbed during long
  debriefs. `STALE_MS` in `src/SolutionsTable.jsx` must match.
- **`20000`** is the per-value size cap.

## Should these be public?

They are here, deliberately. Rules are enforced on Google's servers, so knowing
them grants nothing — and anyone can map them empirically in a few minutes by
attempting writes and observing which are refused. Publishing them lets adopters
see the enforcement model and lets reviewers check it, which for a security
education artifact is part of the contribution.

If you would still rather not publish yours, add `database.rules.json` to
`.gitignore` and keep a redacted copy for reference. Nothing in the application
reads this file at runtime, so removing it does not affect the build.
