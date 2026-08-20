# HVAC Lead Gen — Setup Guide

Automated lead generation: searches Apollo.io for HVAC company owners in Southwest Michigan, appends new contacts to your Google Sheet, runs daily at 7 AM ET.

---

## Quick Overview

```
node index.js          ← keeps running, fires at 7 AM ET daily
node workflow.js       ← runs one batch right now (test / manual trigger)
node verify.js         ← checks both API connections before first run
```

---

## Step 1: Install Dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2: Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | app.apollo.io → Settings → Integrations → API Keys |
| `GOOGLE_SHEET_ID` | Already set to your "SW Michigan HVAC Leads" sheet |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | See Step 3 below |
| `NOTIFICATION_EMAIL` | Already set to jgagliardo98@gmail.com |
| `SMTP_*` | Your Gmail + App Password (optional, for error emails) |

**Apollo plan note:** The people search API requires a paid Apollo plan (Basic at $49/mo or higher). The verify script will tell you if your current plan works.

---

## Step 3: Set Up Google Sheets Access (Service Account)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"
4. Create credentials: APIs & Services → Credentials → Create Credentials → **Service Account**
5. Give it any name, click Done
6. Click the service account → Keys tab → Add Key → Create new key → **JSON** → Download
7. Save the downloaded file as `google-credentials.json` in the `lead-gen/` folder
8. Copy the `client_email` value from that JSON file
9. Open your Google Sheet and **Share** it with that email (Editor access)
10. Set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-credentials.json` in `.env`

---

## Step 4: Verify Connections

```bash
npm run verify
```

You should see:
```
✅ Apollo connected. Account: your@email.com
✅ Apollo people search API: accessible (paid plan confirmed)
✅ Google Sheets connected. Sheet: "SW Michigan HVAC Leads"
```

Fix any ❌ errors before continuing.

---

## Step 5: First Run (Manual Test)

```bash
npm run run-now
```

This runs one batch immediately (up to 25 leads). Check your Google Sheet to confirm rows were added.

---

## Step 6: Start the Daily Scheduler

```bash
npm start
```

Keep this process running (use `pm2`, `screen`, or a cloud service to keep it alive):

```bash
# Install pm2 once
npm install -g pm2

# Start and save
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

The scheduler fires at **7:00 AM Eastern Time** every day and pulls a maximum of 25 new leads per run.

---

## Customization

**Change cities:** Edit `SW_MICHIGAN_CITIES` in `apollo.js`

**Change job titles:** Edit `TARGET_TITLES` in `apollo.js`

**Change lead limit per run:** Edit `MAX_LEADS_PER_RUN` in `workflow.js`

**Change schedule:** Edit `SCHEDULE` in `index.js` (standard cron syntax)

**Change which sheet:** Update `GOOGLE_SHEET_ID` in `.env`

---

## Your Target Spreadsheet

**SW Michigan HVAC Leads**
ID: `1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus`

Columns written by the workflow:
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |
|---|---|---|---|---|---|---|---|---|
| auto | from Apollo | from Apollo | from Apollo | from Apollo | from Apollo | from Apollo | blank | blank |

The "Called" and "Notes" columns are left blank for you to fill in manually as you work the list.

---

## Error Handling

If Apollo or Google Sheets fails, the workflow:
1. Logs the full error to console with timestamp
2. Sends an email to `NOTIFICATION_EMAIL` if SMTP is configured
3. Exits with code 1 (pm2 will restart it; the scheduler catches the next 7 AM trigger)
