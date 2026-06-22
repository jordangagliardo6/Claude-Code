# Apollo Lead Gen -- Southwest Michigan HVAC/Plumbing/Mechanical

Daily automation that searches Apollo.io for owner-operated HVAC, plumbing,
and mechanical contracting businesses in Southwest Michigan and appends new
leads to a Google Sheet, skipping duplicates and capping at 25 new leads
per run.

This is a standalone Node.js workflow (uses the Apollo REST API and Google
Sheets API directly via `node-cron`), separate from the n8n workflow
(`n8n-business-outreach-workflow.json`) elsewhere in this repo.

## What it does

- Searches Apollo across St. Joseph, Benton Harbor, Kalamazoo, Holland,
  Grand Haven, Muskegon, and South Haven, MI for companies tagged
  HVAC / Heating and Air Conditioning / Plumbing / Mechanical Contracting,
  1-25 employees.
- Targets job titles Owner > President > Founder > Co-Founder > General
  Manager, in that priority order.
- Reveals a phone number for each candidate and drops anyone with no
  phone number.
- Skips any business already present in the "Business Name" column of
  your sheet.
- Appends up to 25 new rows per run, runs every morning at 7:00 AM Eastern.
- Logs errors to the console and (if configured) emails you an alert if
  Apollo returns no results or the Sheets write fails.

## 1. Get your Apollo.io API key

1. Log in to [app.apollo.io](https://app.apollo.io).
2. Go to **Settings -> Integrations -> API**, create/copy your API key.
3. Note: revealing phone numbers consumes Apollo "mobile credits" --
   check your plan's credit balance. The search itself does not.

## 2. Create the Google Sheet

1. Create a new Google Sheet (or use an existing one).
2. Rename a tab to `Leads` (or pick any name and set `GOOGLE_SHEET_TAB`).
3. Leave row 1 blank -- the script writes the header row for you on first
   run: `Date Added, Business Name, Owner First Name, Owner Last Name,
   Phone Number, City, Website, Called, Notes`.
4. Copy the spreadsheet ID out of the URL:
   `https://docs.google.com/spreadsheets/d/THIS_PART/edit`

## 3. Set up Google OAuth credentials

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   pick) a project.
2. **APIs & Services -> Library**: enable the **Google Sheets API**.
3. **APIs & Services -> Credentials -> Create Credentials -> OAuth client
   ID**. Application type: **Desktop app**.
4. Download the resulting JSON and save it in this folder as
   `credentials.json` (or point `GOOGLE_OAUTH_CREDENTIALS_PATH` at it).
5. If prompted to configure the OAuth consent screen, add your own Google
   account as a test user (this app doesn't need to be published/verified
   for personal use).

## 4. Install and configure

```bash
cd apollo-leadgen
npm install
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_TAB` (defaults to `Leads`)
- `ALERT_EMAIL_USER` / `ALERT_EMAIL_APP_PASSWORD` / `ALERT_EMAIL_TO`
  (optional, for email alerts -- use a Gmail
  [App Password](https://myaccount.google.com/apppasswords), not your
  normal password)

## 5. Connect your Google account (one-time)

```bash
npm run authorize
```

This prints a URL -- open it, sign in, approve access, and paste the code
back into the terminal. It saves a `token.json` that the workflow reuses
on every future run (no browser prompt needed again).

## 6. Confirm both connections before the first scheduled run

```bash
npm run test-connection
```

You should see:
```
Apollo:   OK -- API key is valid and the search endpoint responded.
Google:   OK -- connected and able to read/write the spreadsheet.
```

If either line says `FAILED`, fix that issue before continuing -- the
error message tells you what's missing (bad API key, missing sheet ID,
`token.json` not generated yet, etc).

## 7. Do one manual run

```bash
npm run run:once
```

Watch the console output and then check your Google Sheet -- you should
see up to 25 new rows. Run it a second time and confirm no duplicate rows
were added for businesses already in the sheet.

## 8. Start the daily scheduler

```bash
npm start
```

This keeps a process running that fires the workflow every day at 7:00 AM
Eastern. Leave it running on a server, always-on machine, or process
manager (e.g. `pm2 start src/index.js --name apollo-leadgen`).

Alternatively, skip `node-cron` entirely and use a system cron job that
calls the one-off run instead of keeping a process alive:

```cron
0 7 * * * cd /path/to/apollo-leadgen && /usr/bin/node src/index.js --once >> run.log 2>&1
```

(Adjust the hour for your server's timezone if it isn't America/New_York.)

## Customizing later

Everything you're likely to change lives in `src/config.js`:
- `apollo.cities` -- add/remove target cities
- `apollo.industryKeywords` -- industries to match
- `apollo.employeeRanges` -- company size filter
- `apollo.titlesByPriority` -- job titles and their priority order
- `googleSheets.columns` -- sheet column names/order (the header row and
  every appended row follow this list automatically)
- `workflow.maxNewLeadsPerRun` -- leads per run (default 25)
- `schedule.cronExpression` / `schedule.timezone` -- when it runs

## Error handling

- **Apollo returns zero results**: logged to console and emailed (if
  configured) with a hint to check filters/credits.
- **Apollo search/enrichment request fails** (bad key, rate limit, etc):
  same alert path, includes the underlying error message.
- **Google Sheets read/write fails**: same alert path; if the write fails
  *after* leads were found, the alert says how many leads were lost so you
  can re-run manually.
- **No new leads after dedup**: this is normal, not an error -- only
  logged to console, no alert sent.

## Project structure

```
src/
  config.js        All tunable settings (cities, filters, columns, schedule)
  apolloClient.js   Apollo search + phone enrichment calls
  sheetsClient.js   Google Sheets read/append/dedup
  googleAuth.js     Loads cached OAuth token
  authorize.js      One-time OAuth setup script (npm run authorize)
  notifier.js       Console logging + optional email alerts
  workflow.js       Orchestrates one end-to-end run
  scheduler.js      node-cron daily trigger
  testConnection.js Connectivity check (npm run test-connection)
  index.js          Entry point: --once for a manual run, else starts scheduler
```
