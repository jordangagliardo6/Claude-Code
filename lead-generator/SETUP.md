# HVAC Lead Generator — Setup Guide

Automated lead generation: Apollo.io → Google Sheets, runs every weekday at 7 AM ET.

---

## Prerequisites

- Node.js 18 or newer (`node -v` to check)
- A **paid** Apollo.io account (the People Search API requires Basic or higher)
- A Google account with the target spreadsheet

---

## Step 1 — Install dependencies

```bash
cd lead-generator
npm install
```

---

## Step 2 — Get your Apollo API key

1. Log into [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Create a Google Service Account

The script authenticates to Google Sheets using a service account (no browser OAuth needed for a server).

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Enable the **Google Sheets API** (APIs & Services → Library → search "Sheets")
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
5. Give it a name (e.g. `hvac-lead-bot`), click **Done**
6. Click the new service account → **Keys** tab → **Add Key → Create new key → JSON**
7. Download the JSON file and save it as `google-credentials.json` in the `lead-generator/` folder

**Important:** Share your Google Sheet with the service account email address:
- Open the sheet in Drive
- Click **Share**
- Paste the service account email (looks like `hvac-lead-bot@your-project.iam.gserviceaccount.com`)
- Give it **Editor** access → **Send**

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
APOLLO_API_KEY=your_actual_api_key
GOOGLE_SERVICE_ACCOUNT_FILE=google-credentials.json
SPREADSHEET_ID=1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo
NOTIFY_EMAIL=jgagliardo98@gmail.com
```

The `SPREADSHEET_ID` is already set to your existing SW Michigan HVAC Leads sheet.

---

## Step 5 — Verify connections before the first run

```bash
npm run verify
```

You should see:

```
── Verifying connections ──────────────────────────────────
✓ Apollo.io   — authenticated OK
✓ Google Sheets — connected to "SW Michigan HVAC Leads"
───────────────────────────────────────────────────────────
```

If either check fails, re-read the error and revisit the relevant step above.

---

## Step 6 — Run a test pull now

```bash
npm run test-run
```

This triggers one immediate run (up to 25 leads) and exits. Check your Google Sheet to confirm rows were appended.

---

## Step 7 — Start the scheduler

```bash
npm start
```

The process will stay running and fire automatically at **7:00 AM ET every weekday**.

To keep it running in the background on a server or Mac:

```bash
# Simple background with nohup
nohup npm start > lead-generator.log 2>&1 &

# Or with pm2 (recommended for production)
npm install -g pm2
pm2 start lead-generator.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing the script

All tuneable values are in the `CONFIG` object near the top of `lead-generator.js`:

| Field | Default | How to change |
|---|---|---|
| `cities` | 7 SW Michigan cities | Add/remove strings |
| `jobTitles` | Owner → GM priority | Reorder or add titles |
| `employeeRange` | `'1,25'` | e.g. `'1,10'` for micro-businesses |
| `maxLeadsPerRun` | 25 | Raise or lower as needed |
| `sheetName` | `'Sheet1'` | Match the tab name in your sheet |

---

## Error alerts by email

Uncomment and configure the `nodemailer` block in `logError()` inside `lead-generator.js`, then install the package:

```bash
npm install nodemailer
```

Add to `.env`:

```
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password   # Gmail App Password, not your account password
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `API_INACCESSIBLE` from Apollo | Your plan doesn't include People Search — upgrade at apollo.io/pricing |
| `GOOGLE_AUTH` error | Service account JSON path wrong or sheet not shared with the service account email |
| 0 results from Apollo | Filters too narrow — try broadening `cities` or `jobTitles` |
| Duplicate leads still added | Business name comparison is case-insensitive but whitespace-trimmed only — check for leading/trailing spaces in old rows |
