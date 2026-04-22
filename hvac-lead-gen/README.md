# HVAC Lead Generation — Southwest Michigan

Automated workflow that searches Apollo.io for HVAC decision-makers in Southwest Michigan and appends results to a Google Sheet every morning at 7 AM Eastern.

---

## How it works

1. **Apollo search** — queries for Owner/President/Founder contacts at HVAC, plumbing, and mechanical-contracting companies (1–25 employees) in the target cities.
2. **Phone filter** — skips any contact that has no phone number.
3. **Duplicate check** — reads the Business Name column in your sheet and skips anything already there.
4. **Append** — writes up to 25 new leads with today's date into the next available rows.
5. **Page state** — remembers which Apollo page was last fetched so each morning's run pulls fresh contacts instead of repeating page 1.

---

## First-time setup

### 1 — Install Node.js (if not already installed)

You need Node.js 18 or newer.  
Download from https://nodejs.org or via `nvm`:

```bash
nvm install 18
nvm use 18
```

### 2 — Clone and install dependencies

```bash
cd hvac-lead-gen
npm install
```

### 3 — Get your Apollo.io API key

1. Log in to Apollo.io → **Settings → Integrations → API**.
2. Copy your API key.

### 4 — Set up Google Cloud credentials

You need a Google Cloud project with the **Google Sheets API** enabled.

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one).
3. Navigate to **APIs & Services → Library** and enable **Google Sheets API**.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
5. Choose **Desktop app**, give it any name, click **Create**.
6. Click **Download JSON** and save the file as:

```
credentials/credentials.json
```

### 5 — Create your Google Sheet

1. Open https://sheets.google.com and create a new blank spreadsheet.
2. Copy the **Spreadsheet ID** from the URL:

```
https://docs.google.com/spreadsheets/d/  THIS_PART_HERE  /edit
```

### 6 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
```

### 7 — Verify both connections

```bash
npm run verify
```

This will:
- Check that all env vars are set.
- Make a live test call to Apollo and show the total matching record count.
- Authorize Google Sheets (first time only — it prints a URL for you to visit, then asks for the code).
- Write the header row to your sheet if it's empty.

**First run only — Google authorization:**  
When prompted, paste the URL into your browser, sign in with the Google account that owns the spreadsheet, click **Allow**, and paste the code back into the terminal. The token is saved to `credentials/token.json` and reused automatically from then on.

Expected output when everything is working:

```
Step 1: Environment variables
  ✓ APOLLO_API_KEY is set
  ✓ GOOGLE_SPREADSHEET_ID is set

Step 2: Apollo.io API
  ✓ Connected to Apollo.io
  ↳ 847 total matching contacts in Apollo's database

Step 3: Google Sheets
  ✓ Google Sheets connected
  ↳ Headers verified / written

  ALL CHECKS PASSED — Ready to run!
```

### 8 — Run once immediately (optional test)

```bash
npm run run-now
```

This runs the full workflow right now — pulls leads from Apollo and appends them to your sheet. Check the sheet and the console output to confirm it worked.

### 9 — Start the daily scheduler

```bash
npm start
```

The process stays running and fires the workflow every day at **7:00 AM Eastern**. Keep it running with a process manager:

```bash
# Using PM2 (recommended for always-on):
npm install -g pm2
pm2 start src/index.js --name hvac-leads
pm2 save
pm2 startup   # follow the instructions it prints
```

Or just run it in a `screen` or `tmux` session.

---

## Customization

### Change the target cities

Edit the `TARGET_CITIES` array in `src/apollo.js`:

```js
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  // add or remove cities here
];
```

### Change the industries

Edit `INDUSTRY_KEYWORDS` in `src/apollo.js`.

### Change the max leads per run

Edit `MAX_LEADS_PER_RUN` in `src/workflow.js` (default: 25).

### Change the schedule

Edit `CRON_SCHEDULE` in `src/index.js`. Format: `'minute hour * * *'`.  
Example — 8:30 AM instead of 7:00 AM: `'30 8 * * *'`

### Change the spreadsheet tab name

Set `GOOGLE_SHEET_NAME=YourTabName` in `.env` (default: `Sheet1`).

### Enable email alerts

1. `npm install nodemailer`
2. Add a Gmail **App Password** (not your regular password — see https://support.google.com/accounts/answer/185833) to `.env`.
3. Uncomment the `nodemailer` block at the bottom of `src/workflow.js`.

---

## File structure

```
hvac-lead-gen/
├── src/
│   ├── index.js      — Scheduler (7 AM daily)
│   ├── workflow.js   — Orchestrates one full run
│   ├── apollo.js     — Apollo.io API search + transform
│   ├── sheets.js     — Google Sheets read/write
│   ├── state.js      — Persists Apollo page between runs
│   ├── logger.js     — Winston logger (console + file)
│   └── verify.js     — Pre-flight connection check
├── credentials/
│   ├── credentials.json   ← you place this here (gitignored)
│   └── token.json         ← auto-generated on first auth (gitignored)
├── logs/
│   ├── combined.log       ← all log output
│   └── error.log          ← errors only
├── data/
│   └── state.json         ← Apollo page state (gitignored)
├── .env                   ← your secrets (gitignored)
├── .env.example
└── package.json
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `401` from Apollo | Check `APOLLO_API_KEY` in `.env` |
| `invalid_grant` from Google | Delete `credentials/token.json` and re-run `npm run verify` to re-authorize |
| Sheet not found | Confirm the `GOOGLE_SPREADSHEET_ID` and that the Google account has edit access |
| No results from Apollo | Apollo's contact coverage varies by region — try broadening `INDUSTRY_KEYWORDS` or adding nearby cities |
| `Cannot find module` | Run `npm install` |
