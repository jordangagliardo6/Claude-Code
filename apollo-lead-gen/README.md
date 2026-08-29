# Apollo Lead Gen — Southwest Michigan HVAC

Automatically pulls up to **25 HVAC leads per day** from Apollo.io and appends them to a Google Sheet — every morning at **7:00 AM Eastern**. No duplicates, no manual copy-paste.

---

## What it does

1. Searches Apollo.io for small HVAC / plumbing / mechanical contractors in Southwest Michigan (St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven).
2. Targets **Owner → President → Founder → Co-Founder → General Manager** — in that priority order.
3. Skips any contact with no phone number on record.
4. Compares against your existing sheet to skip duplicates.
5. Writes new leads as rows: **Date Added · Business Name · Owner First · Owner Last · Phone · City · Website · Called (blank) · Notes (blank)**.

---

## One-time setup

### 1 — Install Node.js

Requires Node.js 18 or later. Check with `node -v`. Download from https://nodejs.org if needed.

### 2 — Install dependencies

```bash
cd apollo-lead-gen
npm install
```

### 3 — Get your Apollo.io API key

1. Log in to Apollo.io.
2. Go to **Settings → Integrations → API** (https://app.apollo.io/#/settings/integrations/api).
3. Copy your API key.

### 4 — Set up Google Service Account

A Service Account lets the script write to your sheet automatically without a login prompt.

1. Go to **Google Cloud Console** → https://console.cloud.google.com
2. Create a new project (or pick an existing one).
3. Enable the **Google Sheets API**: APIs & Services → Library → search "Google Sheets API" → Enable.
4. Create credentials: APIs & Services → Credentials → **Create Credentials → Service account**.
   - Give it any name (e.g. "lead-gen-bot"), click Done.
5. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**.
   - A `.json` file downloads to your computer.
6. In this project folder, create a `credentials/` directory and move the JSON file there:
   ```
   apollo-lead-gen/
   └── credentials/
       └── service-account.json   ← rename if you like
   ```

### 5 — Create your Google Sheet and share it

1. Create a new Google Sheet at https://sheets.google.com.
2. Copy the Spreadsheet ID from the URL bar:
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`
3. Open the JSON credentials file and find the `"client_email"` field (looks like `something@project.iam.gserviceaccount.com`).
4. In your Google Sheet: **Share → paste that email → Editor → Done**.

### 6 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_key
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
GOOGLE_SHEET_ID=your_sheet_id_from_the_url
GOOGLE_SHEET_TAB=Sheet1         # optional, defaults to Sheet1
NOTIFY_EMAIL=jgagliardo98@gmail.com
```

### 7 — Verify everything works

```bash
node setup.js
```

You should see:
```
✓  APOLLO_API_KEY is set
✓  GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set
✓  GOOGLE_SHEET_ID is set
✓  Apollo API reachable
✓  Google auth succeeded.
✓  Spreadsheet accessible — header row verified.

✅  All checks passed! You are ready to run:
    node run-now.js    ← one immediate test pull
    node index.js      ← start the 7 AM daily scheduler
```

### 8 — Test pull one batch immediately

```bash
node run-now.js
```

Open your Google Sheet — you should see the header row and new lead rows populated.

### 9 — Start the daily scheduler

```bash
node index.js
```

This process runs continuously. It will fire every morning at 7:00 AM Eastern and print results to the console.

**To run it in the background permanently**, use a process manager like PM2:

```bash
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 save
pm2 startup    # follow the printed command to auto-start on reboot
```

---

## Customizing

All tunable settings live in **`config.js`**:

| Setting | What it changes |
|---|---|
| `TARGET_CITIES` | Cities to search — add/remove any Southwest Michigan city |
| `INDUSTRY_KEYWORDS` | Apollo keyword query — broaden or narrow the trade types |
| `JOB_TITLES` | Decision-maker titles, in priority order |
| `EMPLOYEE_RANGE` | Employee count filter, e.g. `["1,10"]` for micro businesses |
| `MAX_LEADS_PER_RUN` | Cap per day — raise to 50 if you want more volume |
| `CRON_SCHEDULE` | When to run — `"0 8 * * *"` = 8 AM, `"0 7 * * 1-5"` = 7 AM weekdays only |
| `SHEET_COLUMNS` | Column headers — if you rename one, also update `buildRow()` in `sheets.js` |

---

## Error handling

If Apollo returns no results or the sheet write fails, the script:
- Logs a prominent error banner to the console
- Continues running (the scheduler stays alive for the next day's run)

To receive email alerts, see the commented-out `nodemailer` block in **`logger.js`** — fill in your SMTP settings and uncomment.

---

## File overview

```
apollo-lead-gen/
├── index.js        ← scheduler entry point (node index.js)
├── run-now.js      ← one-shot manual trigger
├── setup.js        ← first-run verification
├── run-leads.js    ← core workflow logic
├── apollo.js       ← Apollo.io API integration
├── sheets.js       ← Google Sheets read/write
├── logger.js       ← logging + error notifications
├── config.js       ← all tunable settings
├── .env.example    ← copy to .env and fill in
└── credentials/    ← put your service-account.json here (gitignored)
```
