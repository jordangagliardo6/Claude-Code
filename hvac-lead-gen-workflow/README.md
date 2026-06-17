# HVAC Lead Gen Workflow (Apollo.io -> Google Sheets)

Every morning at 7am Eastern, this script searches Apollo.io for small (1-25 employee)
HVAC, heating/air conditioning, plumbing, and mechanical contracting companies around
Southwest Michigan, finds the owner/decision-maker's phone number, and appends up to
25 new leads to a Google Sheet - skipping any business already in the sheet.

## How it works

1. **Search Apollo** for people with titles Owner/President/Founder/Co-Founder/General
   Manager at companies tagged HVAC/Heating and Air Conditioning/Plumbing/Mechanical
   Contracting, sized 1-25 employees, located in/around St. Joseph, Benton Harbor,
   Kalamazoo, Holland, Grand Haven, Muskegon, and South Haven, MI.
2. **Enrich each candidate** to reveal a direct/mobile phone number. Apollo's search
   endpoint doesn't return phone numbers by itself, and the phone lookup is async, so
   this involves a second API call per candidate plus a short wait. Anyone with no
   phone number gets dropped.
3. **Dedupe against the sheet** by checking the existing "Business Name" column.
4. **Append** up to 25 new rows: Date Added, Business Name, Owner First Name, Owner
   Last Name, Phone Number, City, Website, Called (blank), Notes (blank).
5. **On error** (Apollo returns nothing, or the Sheets write fails), it logs the error
   to the console and emails you if email alerting is configured.

Everything you're likely to want to change - the city list, industries, job title
priority, sheet columns, lead cap, and run time - lives in `config.js`.

## What you need before starting

| Service | What for |
|---|---|
| [Apollo.io API key](https://developer.apollo.io) | Searching + enriching contacts. Phone enrichment consumes Apollo credits per contact, so check your plan's credit allowance. |
| Google Cloud OAuth client | Lets the script write to your Google Sheet on your behalf. |
| An existing Google Sheet | Where leads get appended (the script will write the header row for you if the sheet is empty). |
| Gmail address + [App Password](https://myaccount.google.com/apppasswords) (optional) | Only needed if you want email alerts on failure. |

## First-time setup

### 1. Install dependencies

```bash
cd hvac-lead-gen-workflow
npm install
```

### 2. Get an Apollo API key

[developer.apollo.io](https://developer.apollo.io) -> Settings -> API -> create a key.

### 3. Create a Google OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project.
2. Enable the **Google Sheets API**.
3. Go to **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**.
   - Application type: **Desktop app**
   - If prompted to configure a consent screen first, choose **External** and add
     your own Google account as a test user.
4. Copy the generated **Client ID** and **Client Secret**.

### 4. Create (or pick) your Google Sheet

Create a new Google Sheet (any name). You do not need to add headers yourself - the
script writes them automatically the first time it runs against an empty sheet.
Copy the spreadsheet ID out of the URL:

```
https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
```

### 5. Configure your environment

```bash
cp .env.example .env
```

Fill in `.env`:
- `APOLLO_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (from step 3)
- `SPREADSHEET_ID` (from step 4)
- Optionally `ALERT_EMAIL`, `EMAIL_USER`, `EMAIL_PASS` for email alerts on failure

### 6. Authorize Google access (one-time)

```bash
npm run authorize
```

This prints a Google consent URL - open it, sign in, and approve access. The script
catches the redirect automatically and saves a refresh token to `token.json` (already
gitignored, never commit it).

### 7. Confirm both connections work

```bash
npm run test-connections
```

You should see:
```
Apollo API key is valid and reachable.
Connected to Google Sheet: "<your sheet name>"

--- Summary ---
Apollo:        OK
Google Sheets: OK
```

If either fails, fix the reported issue (bad API key, wrong spreadsheet ID, OAuth not
completed, etc.) and re-run before moving on.

### 8. Run it once manually

```bash
npm run run-once
```

Check your Google Sheet - you should see new rows appear. Run it a second time to
confirm duplicate businesses get skipped instead of re-added.

### 9. Start the daily scheduler

```bash
npm start
```

This keeps a process running that fires the workflow every day at 7am Eastern. Leave
it running (e.g. in a `screen`/`tmux` session, or under [pm2](https://pm2.keymetrics.io/)
or a systemd service) so the 7am job actually executes:

```bash
# example with pm2
npm install -g pm2
pm2 start src/scheduler.js --name hvac-lead-gen
pm2 save
```

**Alternative:** skip `npm start` entirely and instead point a system cron job at
`node src/run.js` directly, e.g. in your crontab:

```cron
CRON_TZ=America/New_York
0 7 * * * cd /path/to/hvac-lead-gen-workflow && /usr/bin/node src/run.js >> run.log 2>&1
```

## Customizing later

Everything below lives in `config.js` with comments:

- **Cities** - edit the `cities` array to add/remove locations.
- **Industries** - edit `industries` (matched as Apollo organization keyword tags).
- **Job titles / priority order** - edit `titlesByPriority`.
- **Company size filter** - edit `employeeRange` (Apollo's `"min,max"` format).
- **Leads per run** - edit `maxNewLeadsPerRun`.
- **Sheet columns** - edit `columns`. Only takes effect on an empty sheet (the script
  won't overwrite an existing header row), so if you change columns on a sheet that
  already has data, update the header row by hand to match.
- **Run time** - edit `schedule.cronExpression` / `schedule.timezone`.

## Troubleshooting

- **"No Google refresh token found"** - run `npm run authorize` again.
- **Apollo returns 0 results repeatedly** - your filters may be too narrow for your
  Apollo plan's data coverage in this region; try broadening `cities` or removing the
  employee range temporarily to confirm the rest of the pipeline works.
- **Phone numbers missing for everyone** - phone enrichment requires a paid Apollo
  plan / available credits. Check your Apollo account's remaining credits.
- **Email alerts not arriving** - confirm `EMAIL_USER` is a full Gmail address and
  `EMAIL_PASS` is an [App Password](https://myaccount.google.com/apppasswords), not
  your regular Gmail password (Gmail blocks plain-password SMTP login).
