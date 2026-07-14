# HVAC Lead Generator — Setup Guide

Automated daily lead generation: Apollo.io pulls HVAC/Plumbing/Mechanical decision-makers
in Southwest Michigan and writes them to your Google Sheet every morning at 7 AM Eastern.

---

## What You Need

| Requirement | Where to get it | Notes |
|---|---|---|
| Apollo.io account | [apollo.io](https://apollo.io) | **Basic plan ($49/mo) required for phone numbers** |
| Apollo API key | Apollo → Settings → API Keys | |
| Google account | [google.com](https://google.com) | |
| Google Cloud project | [console.cloud.google.com](https://console.cloud.google.com) | Free |
| Node.js 18+ | [nodejs.org](https://nodejs.org) | Check: `node -v` |

---

## Step 1 — Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first tab to **Leads** (right-click the tab → Rename).
3. The workflow will auto-create the header row on first run — you don't need to add it.
4. Copy the **spreadsheet ID** from the URL bar:

   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```

---

## Step 2 — Set Up Google API Access

### Option A: Service Account (Recommended for automated/scheduled use)

Best for: Running on a server, VPS, or Mac/PC that stays on overnight.

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project (or select an existing one).
3. Enable the **Google Sheets API**:
   - Search bar → "Sheets API" → Enable
4. Create a service account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Give it any name (e.g. `hvac-lead-gen`)
   - Skip optional role/user fields — click Done
5. Click the service account → **Keys** tab → Add Key → JSON
6. Download the JSON file and save it to `credentials/service-account.json`
7. Share your Google Sheet with the service account email:
   - The email looks like: `hvac-lead-gen@your-project.iam.gserviceaccount.com`
   - Open your sheet → Share → paste that email → Editor access → Send

### Option B: OAuth2 (For running on your personal computer)

Best for: Running manually on your laptop or desktop.

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. APIs & Services → Credentials → Create Credentials → OAuth Client ID
3. Application type: **Desktop app** → Create
4. Download the JSON and save it as `credentials/credentials.json`
5. Enable the Sheets API (same as Step 4 in Option A).
6. Run the one-time auth flow:

   ```bash
   npm run setup-oauth
   ```

   This opens a browser tab. Sign in with the Google account that owns the sheet.
   A token is saved to `credentials/token.json` and auto-refreshes going forward.

---

## Step 3 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
APOLLO_API_KEY=your_key_from_apollo_settings
SPREADSHEET_ID=your_sheet_id_from_the_url
GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json   # or credentials.json for OAuth2
MAX_LEADS_PER_RUN=25
```

**Email alerts (optional)** — fill these in to get emailed when the workflow fails:

```env
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password   # NOT your regular password — see note below
```

> **Gmail app password:** Go to myaccount.google.com/apppasswords → create one for "Mail".
> This is a 16-character code. Paste it in as-is (no spaces).

---

## Step 4 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 5 — Test Your Connections

Before your first scheduled run, verify both APIs are wired up correctly:

```bash
npm run test-connection
```

Expected output when everything is working:

```
  Apollo.io API        ✓  Authenticated (2,847,193 total records in Apollo database)
  Google Sheets        ✓  Connected — spreadsheet has 0 existing lead(s)

  All connections OK — you're ready to go!
```

Fix any ✗ items before continuing.

---

## Step 6 — Run It Once Manually

```bash
npm run run-now
```

Watch the console output. After ~30 seconds (Apollo phone enrichment takes a moment),
you should see something like:

```
[2026-07-14T12:00:00.000Z] ═══ HVAC Lead Generation Run Starting ═══
[2026-07-14T12:00:00.123Z] Config: max 25 leads per run
[2026-07-14T12:00:01.456Z] Loading existing leads from Google Sheets...
[2026-07-14T12:00:02.000Z] 0 existing business(es) in sheet.
[2026-07-14T12:00:02.100Z] Searching Apollo.io (requesting up to 75 candidates)...
[2026-07-14T12:00:04.500Z] Apollo returned 68 candidate(s).
[2026-07-14T12:00:04.600Z] Enriching 68 contacts with phone numbers...
[2026-07-14T12:00:30.000Z] Enrichment returned 55 record(s).
[2026-07-14T12:00:30.100Z] 25 new lead(s) ready.
[2026-07-14T12:00:30.200Z] Filtered out: 22 (no phone), 0 (already in sheet)
[2026-07-14T12:00:30.300Z] Writing 25 lead(s) to Google Sheets...
[2026-07-14T12:00:31.500Z] ═══ Run Complete in 31.5s ═══
[2026-07-14T12:00:31.600Z] Added: 25 | No-phone skips: 22 | Duplicate skips: 0
```

Open your Google Sheet — you should see 25 new leads with the header row.

---

## Step 7 — Start the Daily Scheduler

```bash
npm start
```

The process runs in the foreground. To keep it running after you close the terminal,
use one of these:

**On Mac/Linux with `pm2` (recommended):**

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to survive reboots
```

**On Mac with `launchd` or Linux with `systemd`:** see docs for your OS init system.

**On Windows:** use pm2 or Task Scheduler pointing at `node index.js`.

---

## Customizing

### Change target cities

Edit `src/apollo.js` → `SW_MICHIGAN_LOCATIONS` array.

### Change target industries

Edit `src/apollo.js` → `NAICS_CODES`, `SIC_CODES`, and `INDUSTRY_KEYWORDS`.
NAICS lookup: [naics.com](https://www.naics.com/search/)

### Change max leads per run

Set `MAX_LEADS_PER_RUN=25` in `.env` (or any number you like).

### Change the schedule

Set `CRON_SCHEDULE=0 7 * * *` in `.env`.
Cron format: `minute hour day month weekday`
Examples: `0 8 * * 1-5` (8am weekdays), `0 6 * * 1` (6am Mondays only)

### Add or rearrange spreadsheet columns

Edit `src/sheets.js` → the `COLS` constant and `HEADERS` array.

---

## Troubleshooting

**Apollo returns 0 results**
- Verify `APOLLO_API_KEY` in `.env`
- Check you're on Basic plan or higher (free tier doesn't support all filters)
- Try broadening the location: remove some cities from `SW_MICHIGAN_LOCATIONS`

**Phone enrichment returns nothing**
- Apollo's Basic plan ($49/mo) includes 1,000 mobile phone exports/month
- Free plan does not include phone number reveals
- If you just upgraded, wait 5 minutes for the plan to activate

**Google Sheets "Permission denied"**
- Service account: confirm you shared the sheet with the service account email as Editor
- OAuth2: re-run `npm run setup-oauth` if the token has expired
- Verify `SPREADSHEET_ID` is correct (just the ID, not the full URL)

**"Leads" tab not found**
- Make sure your sheet tab is named exactly `Leads` (capital L)
- Or set `SHEET_TAB_NAME=YourTabName` in `.env`

**Email alerts not sending**
- Gmail: use an App Password, not your regular password
- Check that `Less secure app access` is disabled (App Passwords work without it)
- Try `SMTP_PORT=465` and `SMTP_HOST=smtp.gmail.com` for SSL

**Error log**
Errors are always written to `error.log` in this folder, even if email isn't configured.

---

## Google Sheet Column Layout

| Column | Header | Filled by |
|---|---|---|
| A | Date Added | Workflow (today's date) |
| B | Business Name | Apollo |
| C | Owner First Name | Apollo |
| D | Owner Last Name | Apollo |
| E | Phone Number | Apollo (mobile or direct) |
| F | City | Apollo |
| G | Website | Apollo |
| H | Called | **You** (check it off) |
| I | Notes | **You** (call notes) |
