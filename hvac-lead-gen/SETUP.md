# HVAC Lead Gen — Setup Guide

Automated daily lead generation for Southwest Michigan HVAC companies.
Pulls up to 25 new leads from Apollo.io every morning at 7 AM Eastern and
appends them to a Google Sheet.

---

## Prerequisites

- Node.js 18 or later (`node --version` to check)
- An Apollo.io account (any paid plan with API access)
- A Google account with access to Google Cloud Console

---

## Step 1 — Clone and install dependencies

```bash
git clone <this-repo>
cd hvac-lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Click **Create API Key**, copy it

---

## Step 3 — Set up Google Sheets access

### Option A: Service Account (recommended — works unattended on a server)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Sidebar → APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a Service Account:
   - Sidebar → IAM & Admin → Service Accounts → Create Service Account
   - Give it any name, click Done
5. Generate a JSON key:
   - Click the service account → Keys tab → Add Key → Create new key → JSON
   - Download the `.json` file
6. **Share your Google Sheet** with the service account email
   (it looks like `name@project.iam.gserviceaccount.com`) — give it **Editor** access
7. Copy the entire contents of the downloaded JSON file — you'll paste it in `.env` next

### Option B: OAuth2 (for running on your own machine only)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the Google Sheets API (same as above)
3. Create OAuth2 credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Desktop app**
   - Download the client JSON
4. Run the one-time token exchange to get a refresh token:

```bash
npx --yes oauth2-refresh-token \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --scope https://www.googleapis.com/auth/spreadsheets
```

Copy the `refresh_token` from the output.

---

## Step 4 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name the first tab **Leads** (or whatever you set `GOOGLE_SHEET_NAME` to)
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```

The script will write the header row automatically on the first run.

---

## Step 5 — Configure your .env file

```bash
cp .env.example .env
# Then edit .env with your values
```

**Minimum required fields:**

```env
APOLLO_API_KEY=your_apollo_key

# Service account (Option A)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...entire JSON on one line...}

# OR OAuth2 (Option B)
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# GOOGLE_REFRESH_TOKEN=...

GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEET_NAME=Leads
ALERT_EMAIL=jgagliardo98@gmail.com
```

**Tip for service account JSON:** Convert the file to one line:
```bash
cat your-key-file.json | tr -d '\n'
```
Then paste the output as the value for `GOOGLE_SERVICE_ACCOUNT_JSON`.

---

## Step 6 — Verify connections (do this first!)

```bash
npm run verify
# or: node index.js --verify
```

You should see:
```
  [OK] Apollo.io  — Jordan Gagliardo (jgagliardo98@gmail.com)
  [OK] Google Sheets — "My HVAC Leads"
       Tabs available: Leads

Both connections verified successfully.
```

If either connection fails, the error message will tell you exactly what's wrong.

---

## Step 7 — Run once manually to confirm end-to-end

```bash
npm run run-now
# or: node index.js --run-now
```

This verifies connections, pulls leads immediately, writes them to your sheet,
then starts the 7 AM scheduler. Check your Google Sheet — you should see rows
appear within 30 seconds.

---

## Step 8 — Keep it running (pick one)

### Option A: Keep the terminal open (simplest)
```bash
npm start
```

### Option B: Run as a background process with PM2 (recommended)
```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save          # auto-restart on reboot
pm2 logs hvac-lead-gen   # view live logs
```

### Option C: System cron (alternative)
```bash
crontab -e
# Add this line (adjust paths):
0 7 * * * cd /path/to/hvac-lead-gen && /usr/bin/node index.js --run-now >> logs/cron.log 2>&1
```

---

## Customization

All search parameters live in **`src/config.js`** — no other file needs to change.

| What to change | Where |
|---|---|
| Add/remove cities | `config.cities` array |
| Change job titles | `config.jobTitles` array |
| Adjust company size | `config.employeeRange` (e.g. `"1,50"`) |
| Change lead count per run | `config.maxLeadsPerRun` |
| Change schedule time | `config.cronSchedule` (standard cron syntax) |
| Add sheet columns | `config.sheetColumns` + matching row in `sheets.js` `newRows.push(...)` |

---

## Log files

All runs are logged to `logs/workflow.log` in structured JSON.

```bash
# See all errors
grep '"level":"ERROR"' logs/workflow.log

# Watch live
tail -f logs/workflow.log
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Add key to `.env` |
| `Apollo API error (HTTP 401)` | API key is invalid — regenerate in Apollo settings |
| `Apollo API error (HTTP 422)` | Search filters rejected — check city names in config |
| `GOOGLE_SPREADSHEET_ID is not set` | Add spreadsheet ID to `.env` |
| `No Google credentials found` | Set either `GOOGLE_SERVICE_ACCOUNT_JSON` or the OAuth2 vars |
| `The caller does not have permission` | Share the sheet with your service account email |
| `0 leads returned` | Apollo may have thin data — try broader cities or titles |
