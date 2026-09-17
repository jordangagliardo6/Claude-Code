# HVAC Lead Gen Workflow — Setup Guide

Automated daily lead pull from Apollo.io → Google Sheets.  
Runs at **7:00 AM Eastern** every morning. Adds up to 25 new HVAC owner leads per day.

---

## Prerequisites

- Node.js 18 or later (`node --version`)
- An Apollo.io account on **Basic plan or above** (free plan blocks the People Search API)
- A Google Cloud project with the **Google Sheets API** enabled

---

## Step 1 — Install dependencies

```bash
cd lead-gen-workflow
npm install
```

---

## Step 2 — Set up Google Cloud credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"
4. Create a **Service Account**: IAM & Admin → Service Accounts → Create
   - Name it something like `lead-gen-bot`
   - Skip role assignment for now
5. Create a JSON key: click the service account → Keys → Add Key → JSON
   - Save the downloaded file as `google-service-account-key.json` in this folder
6. **Share your spreadsheet** with the service account email (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
   - Open the sheet → Share → paste the email → Editor access

---

## Step 3 — Configure your .env file

```bash
cp .env.example .env
# Then edit .env with your real values
```

Key values to fill in:

| Variable | Where to find it |
|---|---|
| `APOLLO_API_KEY` | [developer.apollo.io/keys](https://developer.apollo.io/keys/) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | Path to the JSON file from Step 2 |
| `GOOGLE_SPREADSHEET_ID` | Already filled in with your sheet |
| `SMTP_USER` / `SMTP_PASS` | Your Gmail + a 16-char App Password |

---

## Step 4 — Run the connection test

```bash
node index.js --test
```

You'll see a checklist like:

```
1. Apollo API key configured... ✅
2. Google credentials configured... ✅
3. Google Sheets read (live)... ✅  (25 existing rows read)
4. Apollo API reachable... ✅  (3 leads returned)

✅ All checks passed. Ready to run.
```

If Apollo shows ⚠️ with a plan error, upgrade at [apollo.io/pricing](https://www.apollo.io/pricing).  
The Google Sheets integration works independently.

---

## Step 5 — Run a lead pull manually

```bash
node index.js --run-now
```

This pulls up to 25 leads immediately and appends them to your sheet.

---

## Step 6 — Start the scheduler

```bash
node index.js
```

Runs in the foreground. It will pull leads at 7:00 AM ET every day and log results.

### Run as a background service (recommended for a server or always-on Mac)

**Using PM2 (easiest):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-restart on reboot
```

**Using a cron job (alternative):**
```
# Add to crontab: crontab -e
0 7 * * * cd /path/to/lead-gen-workflow && node index.js --run-now >> logs/run.log 2>&1
```

---

## Customizing the workflow

All tunable settings are in `config.js`:

| Setting | Default | What it controls |
|---|---|---|
| `TARGET_CITIES` | 7 SW Michigan cities | Where Apollo searches |
| `INDUSTRY_KEYWORDS` | HVAC, Plumbing, etc. | Industry filter |
| `TARGET_TITLES` | Owner, President, etc. | Who to target |
| `MAX_LEADS_PER_RUN` | 25 | Leads added per day |
| `SPREADSHEET_ID` | Your HVAC sheet | Destination sheet |

---

## Error handling

- All errors are logged to the console with a timestamp
- If `SMTP_USER` / `SMTP_PASS` are set, you'll receive an email at `ALERT_EMAIL` when a run fails
- The workflow will not add duplicate businesses — it checks the Business Name column first
