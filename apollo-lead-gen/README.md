# Apollo Lead Gen — Southwest Michigan HVAC/Plumbing/Mechanical

Automated daily lead generation: searches Apollo.io for small (1–25 employee)
HVAC, heating & air, plumbing, and mechanical contracting companies around
St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, and
South Haven, MI, then appends new owner/decision-maker contacts to a Google
Sheet — skipping duplicates and capping each run at 25 new leads.

Runs every morning at **7:00 AM Eastern** via `node-cron`.

## How it works

```
node-cron (7am ET)
     │
     ▼
Apollo: mixed_people/search   ◄── industries, company size, MI cities, titles
     │
     ▼
Apollo: people/match (phone reveal)  ◄── async, via webhook (or skipped if not configured)
     │
     ▼
Drop any contact with no phone number
     │
     ▼
Sort by title priority (Owner > President > Founder > Co-Founder > General Manager)
     │
     ▼
Read existing "Business Name" column from Google Sheet
     │
     ▼
Skip duplicates, cap at 25 new leads
     │
     ▼
Append new rows to Google Sheet
     │
     ▼
Log summary  ──  on failure or zero results: console alert + email (if SMTP configured)
```

### A note on phone numbers

Apollo does not return mobile/direct-dial numbers directly in search
results — for compliance reasons it delivers them asynchronously to a
webhook you control, a few seconds after you request a reveal. This app
includes that webhook receiver (`src/phoneWebhookServer.js`).

- **With `PHONE_REVEAL_WEBHOOK_URL` set**: full reveal flow runs, you get
  mobile/direct numbers where Apollo has them.
- **Without it set**: the workflow only keeps numbers Apollo already exposes
  directly on the record. Fewer matches, but zero extra infrastructure —
  fine for an initial test run.

For production, the webhook URL needs to be reachable from the public
internet. Easiest options: an [ngrok](https://ngrok.com) tunnel to
`localhost:3300` (good enough for a single-machine cron setup), or deploying
this app to a small always-on host (a $5 VPS, Render, Railway, etc.).

## File layout

```
apollo-lead-gen/
  config.js                 ← cities, industries, titles, columns, schedule — edit here
  .env.example               ← copy to .env and fill in
  scheduler.js                ← npm start — production entry point
  run-now.js                  ← npm run run-now — one-off manual run
  scripts/
    testConnections.js        ← npm run test-connections — verify Apollo + Sheets before going live
    googleOAuthSetup.js        ← npm run google-auth — one-time OAuth token generation
  src/
    apolloClient.js            ← Apollo search + phone enrichment
    googleSheetsClient.js       ← read/append/dedupe against the sheet
    phoneWebhookServer.js        ← receives Apollo's async phone reveal callbacks
    phoneRevealStore.js           ← in-memory hookup between webhook and workflow
    workflow.js                    ← orchestrates a full run
    notifier.js                     ← console + email alerting
```

## First-time setup

### 1. Install dependencies

```bash
cd apollo-lead-gen
npm install
```

### 2. Create the Google Sheet

Create a new Google Sheet (or use an existing one) with a tab named `Leads`
(or set `GOOGLE_SHEET_TAB` to whatever you name it). Row 1 must have these
exact headers, in this order:

```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

Copy the spreadsheet ID out of its URL:
`https://docs.google.com/spreadsheets/d/THIS_PART/edit`

### 3. Google Cloud OAuth client

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   or select a project.
2. Enable the **Google Sheets API** (APIs & Services → Library).
3. APIs & Services → Credentials → **Create Credentials → OAuth client ID**.
   - Application type: **Desktop app**
   - Name it anything (e.g. "Apollo Lead Gen")
4. Copy the generated **Client ID** and **Client Secret**.
5. If prompted to configure the OAuth consent screen, choose **External**,
   fill in the required fields, and add your own Google account as a test
   user (this keeps it in "Testing" mode, which is fine for personal use).

### 4. Apollo API key

Apollo dashboard → Settings → Integrations → **API** → copy your API key.
You need a plan with people search and contact/phone enrichment access.

### 5. Fill in `.env`

```bash
cp .env.example .env
```

Fill in:
- `APOLLO_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`
- `ALERT_EMAIL_TO` (defaults to your email — change if needed)
- Optionally `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` for email
  alerts (e.g. a Gmail account with an
  [App Password](https://myaccount.google.com/apppasswords))
- Optionally `PHONE_REVEAL_WEBHOOK_URL` (see "A note on phone numbers" above)

### 6. Generate the Google refresh token

```bash
npm run google-auth
```

This opens an auth URL for you to visit, then captures the redirect on
`localhost:4567` automatically. It prints a `GOOGLE_REFRESH_TOKEN` value —
paste it into `.env`.

### 7. Confirm both connections work

```bash
npm run test-connections
```

You should see:

```
[Apollo] Apollo API key is valid. (Sanity-check search returned N total entries.)
[Google Sheets] Connected to spreadsheet "Your Sheet Name". Tabs found: Leads

All connections OK. Safe to enable the schedule (npm start).
```

If either check fails, fix the reported issue before continuing — do not
enable the schedule with a broken connection, since failures will only
surface in the alert email (or console, if you haven't set up SMTP yet).

### 8. Do one manual run

```bash
npm run run-now
```

Watch the console output, then check the Google Sheet — you should see up
to 25 new rows appended, none of which duplicate an existing Business Name.
This is the best way to sanity-check your filters in `config.js` actually
return the kind of leads you want before trusting the schedule.

### 9. Start the schedule

```bash
npm start
```

Leave this process running continuously (recommended: run it under `pm2`,
a `systemd` service, or a Docker container with a restart policy) — the
7am Eastern cron job only fires while the process is alive.

## Customizing later

- **Cities**: edit `targetCities` in `config.js`.
- **Industries**: edit `industries` in `config.js`.
- **Job titles / priority order**: edit `targetTitles` in `config.js`.
- **Company size range**: edit `companySizeRange` (Apollo format: `"min,max"`).
- **Columns**: edit `columns` in `config.js` *and* update `toRow()` in
  `src/workflow.js` to match if you add/remove a column (the order in
  `columns` is documentation; `toRow()` is what actually controls what gets
  written).
- **Leads per run**: edit `maxLeadsPerRun`.
- **Schedule time**: edit `cronExpression` (standard 5-field cron) and/or
  `timezone` in `config.js`.

## Troubleshooting

**Apollo returns zero results** — filters are likely too narrow. Try
widening `companySizeRange`, double-checking the `industries` keyword tags
against Apollo's own UI filter, or confirming you have search credits left.

**Google Sheets write fails with a 403/404** — usually means the OAuth
token doesn't have access to that spreadsheet, or `GOOGLE_SHEET_ID` /
`GOOGLE_SHEET_TAB` is wrong. Re-run `npm run test-connections`.

**No phone numbers showing up** — confirm `PHONE_REVEAL_WEBHOOK_URL` is set
and reachable from the public internet (test with `curl` against your ngrok
URL's `/healthz` path). Without it, only leads that already had a directly
exposed number will pass the filter.

**Duplicate businesses appearing** — the dedupe check matches on the exact
text in the Business Name column (case-insensitive, trimmed). If Apollo
returns slightly different name formatting for the same business across
runs, you may see near-duplicates; this is a manual cleanup case, not a bug.
