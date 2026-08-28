# Canucks Ticket Draft — Netlify deployment

A two-party ranked-ballot draft for splitting the 2026–27 Vancouver Canucks
home schedule, with server-side state, access codes, and a print/PDF view.

---

## What changed from the hosted version

The previous build stored its state by republishing itself. That mechanism
does not exist outside claude.ai, so this version uses:

| Concern | Before | Now |
|---|---|---|
| Saved ballots | page republished itself | Netlify Blobs via a serverless function |
| Who is who | self-declared role, honour system | access codes checked on the server |
| Retained games | present in the page source | never sent to TAKT at all |
| Downloads | sandbox capability | ordinary browser download |
| PDF | not available | print stylesheet → Save as PDF |

**The security improvement is the important one.** In the old build,
`protectedIds` sat in the HTML — anyone could read it with View Source. Here
the server strips the retained set and the other side's ballot before the
response is sent, so TAKT's browser never receives them.

---

## Files

```
index.html                       the whole app, self-contained
netlify.toml                     build config + /api/state redirect
package.json                     one dependency: @netlify/blobs
netlify/functions/state.mjs      the endpoint (GET + POST)
netlify/functions/core.mjs       auth, projection and write rules (pure, testable)
```

---

## Deploy

### 1. Put it in a Git repo

```bash
git init
git add .
git commit -m "Canucks ticket draft"
git remote add origin git@github.com:YOURNAME/canucks-draft.git
git push -u origin main
```

A repo is required — drag-and-drop deploys do not install dependencies, and
the function needs `@netlify/blobs`.

### 2. Create the Netlify site

app.netlify.com → **Add new site** → **Import an existing project** → pick the
repo. Leave the build command empty; publish directory `.`. Netlify reads
`netlify.toml` for the rest.

### 3. Set the access codes

**Site configuration → Environment variables**, add two:

| Key | Value |
|---|---|
| `OWNER_CODE` | a long random string — yours |
| `TAKT_CODE` | a different long random string — TAKT's |

Then **Deploys → Trigger deploy → Clear cache and deploy site** so the
function picks them up. Without both variables every request returns 500.

### 4. Check it

Open the site. You should get the role picker. Signing in with a wrong code
must be refused; signing in as TAKT must show 41 games to rank.

---

## Using it

1. Send TAKT the URL and **their** code. Never send them the owner code.
2. Both sides rank and submit. Each page polls every 12 seconds, so you'll
   see the other ballot land without refreshing.
3. When both are in, the owner view switches to review. Adjust caps or move
   individual games, then approve.
4. The schedule posts to both of you. **Print / Save as PDF** produces a
   clean document; reserved markers are suppressed in print, so the PDF is
   safe to share as-is.
5. **Copy result for Claude** (owner only) puts the full approved allocation
   on your clipboard for generating the Google Sheet.

---

## Resetting

The state lives in one blob. To wipe it and start over, add a temporary
function, or delete the `canucks-draft` store from the Netlify UI under
**Blobs**. Reopening ballots from inside the app is the normal way to redo a
draft — that clears both ballots and the posted schedule.

---

## Costs

Netlify's free tier covers this comfortably: two people, a few hundred
requests, one blob of a few kilobytes. Functions are only invoked when the
page loads or someone saves.

---

## Local development

```bash
npm install
npx netlify dev
```

`netlify dev` runs the function with a local Blobs emulator. Set the codes
first:

```bash
export OWNER_CODE=owner-pass
export TAKT_CODE=takt-pass
```
