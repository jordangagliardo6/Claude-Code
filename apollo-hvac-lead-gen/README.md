# Apollo → Google Sheets HVAC Lead-Gen Workflow

A daily automated workflow that searches Apollo.io for owner-operated HVAC,
plumbing, and mechanical contracting companies in Southwest Michigan, and
appends new leads to a Google Sheet — skipping duplicates and leads with no
phone number.

This is a standalone Node.js project (not n8n). It lives alongside, but is
independent of, the `n8n-business-outreach-workflow.json` workflow in the
repo root.

---

## What it does

1. Every morning at **7:00 AM Eastern Time**, queries the Apollo.io API for
   people with the title Owner, President, Founder, Co-Founder, or General
   Manager at HVAC/heating-and-air/plumbing/mechanical-contracting companies
   in Michigan with 1–25 employees.
2. Filters results down to the target cities (St. Joseph, Benton Harbor,
   Kalamazoo, Holland, Grand Haven, Muskegon, South Haven) and nearby zip
   codes.
3. Reveals a phone number for each candidate and drops anyone with none.
4. Reads the **Business Name** column of your Google Sheet and skips any
   company already listed.
5. Appends up to **25 new leads** per run with columns: `Date Added`,
   `Business Name`, `Owner First Name`, `Owner Last Name`, `Phone Number`,
   `City`, `Website`, `Called` (blank), `Notes` (blank).
6. If Apollo returns zero results, or the Google Sheets write fails, it logs
   the error to the console and emails `ALERT_EMAIL` (if SMTP is configured).

Everything you're likely to want to tweak — cities, zip codes, industries,
employee-size range, job titles, max leads per run, sheet column order —
lives in **`config.js`**.

---

## First-time setup

### 1. Install dependencies

```bash
cd apollo-hvac-lead-gen
npm install
```

### 2. Create your Google Sheet

Create (or reuse) a Google Sheet with a tab named `Leads` and these headers
in row 1, columns A–I:

```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

Copy the Sheet ID out of the URL:
`https://docs.google.com/spreadsheets/d/THIS_PART/edit`

### 3. Create a Google OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a project (or pick an existing one) and enable the **Google
   Sheets API** and **Google Drive API**.
3. Create an **OAuth client ID** of type **Desktop app**.
4. Note the Client ID and Client Secret.

### 4. Get an Apollo.io API key

[developer.apollo.io](https://developer.apollo.io) → Settings → API → create
a key. Your plan needs enough credits for people search + phone reveal.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

- `APOLLO_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEET_ID` (and `GOOGLE_SHEET_TAB` if you didn't name the tab `Leads`)
- `ALERT_EMAIL` (defaults to your email — change if needed)
- `SMTP_USER` / `SMTP_PASS` — optional, only needed for email alerts. Use a
  Gmail address + an [App Password](https://myaccount.google.com/apppasswords)
  (not your normal password). Leave blank to get console-only error logs.

### 6. Authorize Google access (one-time)

```bash
npm run setup-google-auth
```

This prints a URL — open it, sign in with the Google account that owns/can
edit your spreadsheet, and approve access. The script catches the redirect
automatically and saves a `token.json` file (already git-ignored).

### 7. Confirm both connections work

```bash
npm run test-connections
```

You should see:

```
Apollo.io connected successfully.
Google Sheets connected successfully.
```

Don't move on until both lines show success — this is the check the workflow
asked for before the first scheduled run executes.

### 8. Run it once manually

```bash
npm run run-once
```

Check the console output and your Google Sheet — you should see up to 25 new
rows appended (fewer if there aren't that many qualifying leads yet).

### 9. Start the scheduler

```bash
npm start
```

Leave this running (e.g. in a background terminal, `pm2`, `tmux`, or as a
system service) and it will trigger automatically every day at 7:00 AM
Eastern Time. Stop it with `Ctrl+C`.

If you'd rather use a system cron job instead of `node-cron`, you can run
`npm run run-once` directly:

```cron
0 7 * * * cd /path/to/apollo-hvac-lead-gen && /usr/bin/npm run run-once >> run.log 2>&1
```

(Set the system's timezone to America/New_York, or use a `TZ=America/New_York`
prefix, since this crontab line doesn't carry the timezone logic that
`scheduler.js` has built in.)

---

## Customizing

Everything below lives in `config.js`:

| Setting | What it controls |
|---|---|
| `targetCities` | City names a lead's location must start with |
| `targetZipPrefixes` | Zip prefixes for "surrounding area" matches |
| `stateLocation` | Apollo state-level location filter |
| `industryKeywords` | Apollo keyword tags for industry filtering |
| `employeeRange` | Apollo company-size bucket (`"min,max"`) |
| `titlePriority` | Job titles to search for, in priority order |
| `maxNewLeadsPerRun` | Cap on new rows added per run |
| `sheetColumns` | Column order written to the sheet |
| `sheetTabName` | Sheet tab to read/write (env override: `GOOGLE_SHEET_TAB`) |

---

## Known limitations

- **Phone reveal**: Apollo's `/people/match` endpoint can return a
  direct/mobile number synchronously on some plans, but on others phone
  reveal is asynchronous (delivered later via a webhook you'd have to host).
  This workflow tries the synchronous reveal and, if nothing comes back,
  falls back to the company's main phone line so a lead isn't dropped purely
  because the personal cell wasn't available. If your Apollo plan requires
  webhook-based reveal and you want true mobile-only numbers, you'll need to
  add a small HTTP endpoint to receive Apollo's callback — ask and this can
  be added.
- **Apollo location targeting**: Apollo's public API doesn't support
  arbitrary zip-radius search, so the workflow filters Michigan-wide results
  down to your target cities/zips client-side rather than querying a radius
  directly.

---

## Troubleshooting

**`Apollo.io connection failed: APOLLO_API_KEY is not set`**
Check `.env` has `APOLLO_API_KEY` set and you ran commands from the
`apollo-hvac-lead-gen` directory.

**`token.json not found`**
Run `npm run setup-google-auth` first.

**`Apollo returned no results` alert**
Your filters in `config.js` may be too narrow, or your Apollo plan/credits
are exhausted — check your Apollo dashboard.

**Google Sheets write fails**
Confirm the Google account you authorized in step 6 has edit access to the
spreadsheet, and that `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_TAB` in `.env` match
the actual sheet.
