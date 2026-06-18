# Apollo -> Google Sheets HVAC Lead Generation

Pulls owner/decision-maker contacts at small (1-25 employee) HVAC, heating &
air conditioning, plumbing, and mechanical contracting companies across
Southwest Michigan from Apollo.io, and appends new ones to a Google Sheet
every morning. Skips duplicates and contacts with no phone number.

## What it does, every run

1. Searches Apollo for people matching your title list (Owner, President,
   Founder, Co-Founder, General Manager) at companies in your target cities,
   filtered to NAICS 238220 (Plumbing/HVAC/Mechanical Contractors) with 1-25
   employees.
2. Keeps the single best (highest-priority-title) contact per company.
3. Reads the "Business Name" column of your sheet and drops any company
   already listed.
4. Looks up a phone number for each remaining candidate and drops anyone
   with none.
5. Appends up to `MAX_NEW_LEADS_PER_RUN` (default 25) new rows.
6. Logs a clear error to the console -- and emails you, if configured -- if
   Apollo returns zero results or the sheet write fails.

## 1. Install

```bash
cd apollo-hvac-lead-gen
npm install
```

## 2. Get an Apollo.io API key

1. Log in at [app.apollo.io](https://app.apollo.io).
2. Go to **Settings -> Integrations -> API**.
3. Create an API key with access to People Search and People Enrichment.
4. Copy `.env.example` to `.env` and paste the key into `APOLLO_API_KEY`.

> Apollo plan note: People Search is generally free; each phone lookup
> (`people/match`) consumes **1 credit per matched contact**. Capping leads
> at 25/run also caps credit usage at ~25/day (~750/month). Lower
> `MAX_NEW_LEADS_PER_RUN` in `.env` if you're on a smaller plan.

## 3. Create the Google Sheet

1. Create a new Google Sheet (or use an existing one) and a tab named
   `Leads` (or set `GOOGLE_SHEET_TAB_NAME` to whatever you name it).
2. Add this exact header row, in this order:

   ```
   Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
   ```

3. Copy the Sheet ID out of the URL and put it in `.env` as `GOOGLE_SHEET_ID`:

   ```
   https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
   ```

## 4. Set up Google OAuth credentials

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   pick) a project and enable the **Google Sheets API**.
2. Go to **APIs & Services -> Credentials -> Create Credentials -> OAuth
   client ID**, choose **Desktop app**, and download the resulting JSON.
3. Save it as `credentials.json` in this folder (matches the
   `GOOGLE_OAUTH_CREDENTIALS_PATH` default).
4. Run the one-time authorization:

   ```bash
   npm run auth
   ```

   This opens a URL for you to approve in a browser, then saves a reusable
   `token.json` in this folder. You only need to do this once (it
   auto-refreshes after that).

## 5. Confirm both connections before the first scheduled run

```bash
npm run test-connection
```

This must print `All connections OK.` for both Apollo and Google Sheets
before you start the scheduler. If something fails, the error message tells
you exactly what's missing (API key, sheet ID, mismatched header row, etc.).

## 6. Do a manual test run

```bash
npm run run-once
```

Check your sheet -- you should see up to 25 new rows. Run it a second time
immediately after; it should find 0 new leads (everything just added is now
a duplicate), proving the dedupe logic works.

## 7. Start the daily schedule

```bash
npm start
```

Runs every morning at 7:00 AM America/New_York (configurable via
`CRON_SCHEDULE` in `.env`). **Leave this process running** -- node-cron only
fires while the process is alive. For a real "set and forget" setup, run it
under a process manager so it survives reboots/crashes and restarts
automatically, e.g.:

```bash
npm install -g pm2
pm2 start scheduler.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed instructions to enable on-boot start
```

## Error alerts (optional)

To get an email when a run fails (Apollo returns nothing, or the Sheets
write fails), fill in the alert section of `.env`:

```
ALERT_EMAIL_TO=you@example.com
ALERT_EMAIL_FROM=you@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```

For Gmail, `SMTP_PASS` must be an
[App Password](https://myaccount.google.com/apppasswords), not your regular
password. Leave these blank to rely on console logging only.

## Customizing

Everything you're likely to want to change lives in `config.js`:

- **`targetCities`** -- add/remove `"City, MI"` entries to change the search
  area.
- **`jobTitlesByPriority`** -- order matters; the first match per company
  wins when a company has multiple qualifying contacts.
- **`organizationEmployeeRange`** -- `"1,25"` by default.
- **`sheetColumns`** -- change the column order/names here; also update the
  `row` object inside `buildRow()` in `src/runWorkflow.js` if you add a
  brand-new field (not just reorder existing ones).
- **`maxNewLeadsPerRun`** / **`CRON_SCHEDULE`** -- via `.env`.

## Files

```
config.js                  All editable settings (cities, titles, columns, limits)
scheduler.js                node-cron entry point -- npm start
src/apolloClient.js         Apollo People Search + Enrichment API calls
src/googleAuth.js           Loads the Google OAuth2 client from credentials.json/token.json
src/googleSheets.js         Reads existing business names, appends new rows
src/notify.js                Console logging + optional email alerts
src/runWorkflow.js          One full run: search -> dedupe -> enrich -> append
scripts/authorizeGoogle.js  One-time Google OAuth setup -- npm run auth
scripts/testConnection.js   Verifies Apollo + Google Sheets before trusting the schedule
```

## Troubleshooting

**"Apollo returned zero results"** -- broaden `targetCities` or set
`searchStatewideFallback: true` in `config.js` to fall back to a statewide
Michigan search.

**Phone numbers missing for most leads** -- Apollo's live mobile-number
lookup is asynchronous and normally requires a public webhook
(`APOLLO_PHONE_WEBHOOK_URL`) to deliver the result. Without one, this
workflow only uses phone numbers Apollo can return immediately, and skips
the rest (consistent with "exclude contacts with no phone"). If you need
higher phone match rates, host a small public endpoint and set
`APOLLO_PHONE_WEBHOOK_URL`, then extend `apolloClient.enrichPhone` to wait
for the callback.

**Google Sheets errors** -- re-run `npm run test-connection`; it checks that
the header row matches `config.sheetColumns` exactly (case-sensitive).

**Duplicate businesses appearing** -- dedupe matches on the exact
"Business Name" text. If Apollo returns a slightly different name for the
same company on a later run (e.g. "Smith HVAC" vs "Smith HVAC LLC"), it will
be treated as new. Manually merge/rename in the sheet if that happens.
