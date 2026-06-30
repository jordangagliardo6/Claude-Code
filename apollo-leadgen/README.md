# Apollo Lead Gen — Southwest Michigan HVAC/Plumbing/Mechanical

Automated daily lead generation. Every morning at **7:00 AM Eastern Time**, this
script searches Apollo.io for owner-operated HVAC, heating & air, plumbing, and
mechanical contracting companies (1–25 employees) across Southwest Michigan,
and appends up to **25 new leads per run** to a Google Sheet — skipping any
business already in the sheet.

---

## What it does

1. Searches Apollo.io for each city in `config.js` (`cities` array), filtered by:
   - Industry keywords: HVAC, Heating and Air Conditioning, Plumbing, Mechanical Contracting
   - Company size: 1–25 employees
   - Location: Michigan, biased toward the listed Southwest Michigan cities
   - Job titles, in priority order: Owner → President → Founder → Co-Founder → General Manager
2. Drops any contact with no phone number.
3. Reads the **Business Name** column of your Google Sheet and skips duplicates.
4. Ranks remaining leads by title priority and takes the top 25.
5. Appends them as new rows: `Date Added, Business Name, Owner First Name,
   Owner Last Name, Phone Number, City, Website, Called, Notes` (the last two
   left blank for you to fill in manually).
6. If Apollo returns zero results, or the Google Sheets write fails, it logs a
   clear error and (if configured) emails you an alert.

Everything you're likely to want to tweak — city list, industries, job
titles, employee size range, max leads per run, sheet column order — lives in
**`config.js`**.

---

## 1. Prerequisites

- Node.js 18 or newer
- An [Apollo.io](https://www.apollo.io) account with API access
- A Google account and a Google Sheet to write into

## 2. Install

```bash
cd apollo-leadgen
npm install
cp .env.example .env
```

## 3. Create your Google Sheet

Create a new Google Sheet (or use an existing one) with a tab named `Leads`
(or set `GOOGLE_SHEET_TAB_NAME` in `.env` to match your tab name). Row 1 must
have these exact headers, in this order:

```
A: Date Added
B: Business Name
C: Owner First Name
D: Owner Last Name
E: Phone Number
F: City
G: Website
H: Called
I: Notes
```

Copy the spreadsheet ID out of the URL:
`https://docs.google.com/spreadsheets/d/THIS_PART/edit` → put it in
`GOOGLE_SHEET_ID` in `.env`.

## 4. Get an Apollo API key

Apollo dashboard → **Settings → Integrations → API → API Keys**. Put it in
`APOLLO_API_KEY` in `.env`.

> Note: Apollo verifies direct/mobile phone numbers asynchronously. If you
> have a public webhook endpoint, set `APOLLO_PHONE_WEBHOOK_URL` in `.env` to
> receive verified numbers as they come in. Without it, the workflow falls
> back to whatever phone number Apollo returns immediately in search results
> (typically the company's main line) — still useful, just not guaranteed to
> be a personal cell.

## 5. Set up Google OAuth credentials

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project, enable the **Google Sheets API**, then go to
   **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Choose **Desktop app** as the application type.
3. Copy the **Client ID** and **Client Secret** into `.env` as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Generate a refresh token (one-time):

   ```bash
   npm run get-google-token
   ```

   This prints a URL — open it, sign in with the Google account that owns
   the sheet, and approve access. The script captures the result and prints
   a `GOOGLE_REFRESH_TOKEN` value. Paste it into `.env`.

## 6. (Optional) Email alerts on failure

Set `ALERT_EMAIL` and the `SMTP_*` variables in `.env` to get an email when
Apollo returns no results or the Sheets write fails. If you skip this,
errors still print clearly to the console/logs.

## 7. Confirm everything is connected before scheduling anything

```bash
npm run test-connection
```

This runs a minimal Apollo search and a Google Sheets read — no leads are
written. You should see:

```
Testing Apollo.io connection... OK (test query returned 1 result(s))
Testing Google Sheets connection... OK (found spreadsheet "...", tab "Leads")

Both connections succeeded. You are ready to run `npm run run-once` or `npm start`.
```

If either check fails, fix the reported error before continuing — do not
enable the schedule until both pass.

## 8. Do a real single run

```bash
npm run run-once
```

Check your Google Sheet — up to 25 new leads should appear. Re-run it again
immediately and confirm no duplicates were added (the run should report 0
new leads, or fewer, since the previous run's businesses are now in the sheet).

## 9. Turn on the daily schedule

```bash
npm start
```

This keeps a process running and fires the workflow every day at 7:00 AM
America/New_York (handles the EST/EDT switch automatically). For unattended
operation, run it under a process manager (`pm2 start scheduler.js`,
a systemd service, a Docker container, etc.) or use your OS's own cron and
call `npm run run-once` directly at `0 7 * * *` America/New_York instead.

---

## Customizing

- **City list / state**: edit `cities` and `state` in `config.js`.
- **Industries**: edit `industryKeywords` in `config.js`.
- **Job title priority**: edit `titlesByPriority` (order matters — earlier
  titles win when trimming down to `maxLeadsPerRun`).
- **Employee size range**: edit `employeeRanges` (Apollo format: `"min,max"`).
- **Leads per run**: edit `maxLeadsPerRun`.
- **Sheet columns**: edit `sheet.columns` in `config.js` AND the corresponding
  `buildRow()` function in `src/workflow.js` if you add/remove/reorder fields.
- **Schedule time/timezone**: edit `schedule.cronExpression` /
  `schedule.timezone` in `config.js`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `APOLLO_API_KEY is not set` | `.env` missing or not loaded — confirm you copied `.env.example` to `.env` |
| Apollo search returns 0 results every run | Filters too narrow, or API plan/quota issue — check Apollo dashboard usage |
| `Missing Google OAuth env vars` | One of `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` is blank |
| Google Sheets `403` errors | The Google account used for the refresh token doesn't have edit access to the sheet |
| No refresh token printed by `get-google-token` | You previously authorized this app; revoke access at https://myaccount.google.com/permissions and re-run |
| Duplicates appearing | Business names in Apollo don't exactly match what's already in your sheet — dedup matching is case-insensitive but not fuzzy |
