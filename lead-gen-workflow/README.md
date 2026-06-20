# HVAC Lead Gen Workflow

Pulls owner/decision-maker contacts at small HVAC, plumbing, and mechanical
contracting companies (1-25 employees) across Southwest Michigan from
Apollo.io, and appends new ones to a Google Sheet every morning at 7am
Eastern. Skips duplicates and any contact with no phone number, and caps
each run at 25 new leads.

## How it works

```
scheduler.js (cron, 7am ET daily)
        │
        ▼
src/runWorkflow.js
        │
        ├─► src/apolloClient.js   search each city → pick best contact per
        │                         company by job-title priority → enrich
        │                         phone number (async poll)
        │
        ├─► src/googleSheets.js  read existing Business Name column to
        │                        dedupe → append new rows
        │
        └─► src/notify.js        console log + optional email alert on
                                  any failure or empty result
```

Everything you'd want to tweak lives in **`config.js`**: city list,
industries, employee size, job-title priority, max leads/run, and the
sheet's column order/names. The logic files don't need to change for any
of that.

## 1. Install dependencies

```bash
cd lead-gen-workflow
npm install
```

## 2. Create the Google Sheet

Create a new Google Sheet (or use an existing one) with a tab named
**`Leads`** (or change `sheetTabName` in `config.js` to match). Row 1 must
have these exact headers, in this order:

```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

Copy the spreadsheet ID out of its URL:
`https://docs.google.com/spreadsheets/d/THIS_PART/edit`

## 3. Get an Apollo.io API key

1. Log into Apollo.io → **Settings → API**
2. Generate a key, copy it.

Note: this workflow targets the People Search + People Match endpoints,
which require an Apollo plan with API access and enough credits for
phone-number reveals (each enriched lead costs 1 credit).

## 4. Google OAuth setup

You need a Client ID, Client Secret, and a long-lived Refresh Token scoped
to Sheets (Drive's file-management API can't read/write cell data, which
is why this uses the Sheets API specifically).

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   or select a project.
2. **APIs & Services → Library** → enable the **Google Sheets API**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Desktop app**. Save the Client ID and Client
   Secret.
4. **APIs & Services → OAuth consent screen** → add your own Google account
   as a test user (if the app is in "Testing" status).
5. Generate a refresh token once, using the
   [OAuth Playground](https://developers.google.com/oauthplayground/):
   - Click the gear icon (top right) → check "Use your own OAuth
     credentials" → paste your Client ID/Secret.
   - In Step 1, scope: `https://www.googleapis.com/auth/spreadsheets` →
     Authorize → sign in with the Google account that owns the sheet.
   - In Step 2, click **Exchange authorization code for tokens** → copy
     the **Refresh token** value.

## 5. Fill in your `.env`

```bash
cp .env.example .env
```

Fill in `APOLLO_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REFRESH_TOKEN`, and `GOOGLE_SHEET_ID`. The `SMTP_*` / `ALERT_EMAIL`
fields are optional — if left blank, errors still print to the console,
they just won't also email you.

## 6. Confirm both connections before trusting the schedule

```bash
npm run test-connections
```

This does two read-only checks and prints `CONNECTED` or `FAILED` for
each:
- A 1-result Apollo search using your real filters (confirms the API key
  and filters work).
- A read of your sheet's header row (confirms the OAuth credentials and
  `GOOGLE_SHEET_ID` are correct, and warns if your headers don't match
  `config.js`).

Fix anything that says `FAILED` before moving on.

## 7. Do one real test run

```bash
npm run run-once
```

This executes the full workflow exactly once — search, dedupe, enrich,
append — so you can check the sheet and see real rows land before trusting
the unattended schedule. Phone enrichment polls Apollo every 8 seconds
(up to 4 tries) per lead, so a run with several new leads can take a few
minutes; that's expected.

## 8. Start the scheduler

```bash
npm start
```

This arms the daily 7:00am Eastern job and keeps running. For it to fire
every morning unattended, the process needs to stay alive — run it under
something like `pm2`, a `systemd` service, or a Docker container that
restarts on reboot, e.g.:

```bash
npm install -g pm2
pm2 start scheduler.js --name hvac-lead-gen
pm2 save
```

Alternatively, skip `node-cron` and call `npm run run-once` directly from
a system cron entry at `0 7 * * *` with `TZ=America/New_York` — the code
doesn't care which one triggers it.

## Customizing later

- **Cities**: edit `targetCities` in `config.js`.
- **Industries**: edit `industryKeywords`.
- **Job titles / priority order**: edit `jobTitlePriority`.
- **Sheet columns**: edit `sheetColumns` (keep the sheet's row 1 in sync)
  — dedupe and row-building both read this array, so nothing else needs to
  change.
- **Leads per run**: edit `maxLeadsPerRun`.

## Troubleshooting

**Apollo search returns 0 people for every city**
Your Apollo plan/credits may not include the People Search endpoint, or
the filters are too narrow. Try removing `q_organization_keyword_tags`
temporarily in `test-connections.js` to confirm the location/size filters
alone return results.

**Leads keep getting skipped for "no phone number"**
Apollo's phone reveal is asynchronous and depends on data availability —
not every contact has a revealable direct/mobile number. This is expected
behavior, not a bug; the workflow is intentionally configured to exclude
phone-less contacts per the requirements.

**Google Sheets write fails with a 403/404**
Usually means `GOOGLE_SHEET_ID` is wrong, the sheet tab isn't named
`Leads` (or whatever `sheetTabName` is set to), or the Google account
behind the refresh token doesn't have edit access to that sheet.

**No email alerts arriving**
Check `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`ALERT_EMAIL` are all
set. Console logs always work regardless — check those first to confirm
the workflow itself is running.
