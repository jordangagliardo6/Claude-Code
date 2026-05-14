# HVAC Lead Generation — Southwest Michigan

Pulls HVAC decision-makers from Apollo.io and appends them to a Google Sheet.
Runs automatically every morning at **7am Eastern Time**.

---

## What it does each run

1. Queries Apollo.io for Owners / Presidents / Founders at HVAC, plumbing, and
   mechanical contracting companies (1–25 employees) in Southwest Michigan.
2. Skips any contact that has no phone number.
3. Appends new leads to your Google Sheet with today's date.
4. Skips duplicates (checks the Business Name column before inserting).
5. Sends an email alert (or logs to console) if Apollo or Sheets fails.

---

## First-time setup

### 1. Install Node.js (≥ 18)
```bash
node --version   # should print v18 or higher
```
Download from https://nodejs.org if needed.

### 2. Install dependencies
```bash
cd hvac-lead-gen
npm install
```

### 3. Get your Apollo.io API key
1. Log in to Apollo → **Settings → Integrations → API**.
2. Copy your API key.

### 4. Create a Google Service Account
Google requires a **Service Account** for automated (non-interactive) access.

1. Go to https://console.cloud.google.com/
2. Create a new project (or use an existing one).
3. In the left menu → **APIs & Services → Library** → search for
   **"Google Sheets API"** → Enable it.
4. Go to **APIs & Services → Credentials** → **Create Credentials →
   Service Account**.
   - Give it any name (e.g. `hvac-lead-gen`).
   - Skip the optional steps and click **Done**.
5. Click the service account you just created → **Keys** tab →
   **Add Key → Create new key → JSON**.
   - A `.json` file will download — save it somewhere safe (e.g.
     `~/hvac-service-account.json`).
6. Note the service account's **email address** (looks like
   `hvac-lead-gen@your-project.iam.gserviceaccount.com`).

### 5. Create your Google Sheet and share it
1. Create a new Google Spreadsheet (or use an existing one).
2. Copy its **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```
3. Click **Share** → paste the service account email → give it **Editor** access.

### 6. Configure environment variables
```bash
cp .env.example .env
```
Open `.env` and fill in every value:
```
APOLLO_API_KEY=...
GOOGLE_SPREADSHEET_ID=...
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/full/path/to/hvac-service-account.json
NOTIFICATION_EMAIL=you@example.com
SMTP_USER=you@gmail.com
SMTP_PASS=your_gmail_app_password
```

> **Gmail app password**: Google → Account → Security → 2-Step Verification →
> App passwords. Generate one for "Mail".

### 7. Test both connections
```bash
npm run test-connection
```
You should see:
```
1. Apollo.io API key  ... ✓  Connected (account: Your Name)
2. Google Sheets       ... ✓  Connected (spreadsheet: "Your Sheet Title")
```

Fix any ✗ failures before proceeding.

### 8. Run it once manually
```bash
npm run run-once
```
This pulls up to 25 leads immediately and writes them to your sheet.
Check your Google Sheet to confirm rows appeared.

### 9. Start the daily scheduler
```bash
npm start
```
The process runs forever, firing every day at 7am Eastern.
Keep it running in a terminal, or use a process manager:

**Keep alive with PM2 (recommended for always-on):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```

**Check logs:**
```bash
pm2 logs hvac-lead-gen
# or
cat logs/$(date +%Y-%m-%d).log
```

---

## Customizing

| What to change | Where |
|---|---|
| Add/remove cities | `src/apolloClient.js` → `TARGET_LOCATIONS` array |
| Change job titles | `src/apolloClient.js` → `TARGET_TITLES` array |
| Change industries | `src/apolloClient.js` → `TARGET_INDUSTRIES` array |
| Max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Cron schedule | `.env` → `CRON_SCHEDULE` (standard cron syntax, UTC) |
| Sheet column order | `src/sheetsClient.js` → `COLUMNS` array + row mapping in `appendLeads` |

---

## Error handling

| Failure | What happens |
|---|---|
| Apollo returns 0 results | Logged as warning + email alert |
| Apollo API error | Logged as error + email alert + run aborts |
| Google Sheets write fails | Logged as error + email alert with raw lead data |
| Email SMTP not configured | Errors logged to `logs/YYYY-MM-DD.log` only |
