# HVAC Lead Gen — Setup Guide

Automated daily pull of HVAC leads in Southwest Michigan from Apollo.io → Google Sheets.

---

## Prerequisites

- **Node.js 18+** installed (`node -v` to check)
- An **Apollo.io account** (free tier works but has rate limits; paid plans give more results)
- A **Google account** with a Google Sheets spreadsheet ready

---

## Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets API

You need a **Service Account** — a bot that can read/write your spreadsheet.

### 3a. Create a Google Cloud project (one-time)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project** (name it anything, e.g. `lead-gen`)
3. Make sure the new project is selected

### 3b. Enable the Sheets API

1. In the left menu, go to **APIs & Services → Library**
2. Search for **Google Sheets API** and click **Enable**

### 3c. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Give it any name (e.g. `lead-gen-bot`) and click **Done**
4. Click the service account email that was just created
5. Go to the **Keys** tab → **Add Key → Create new key → JSON**
6. A `.json` file will download — this is your credentials file

### 3d. Place the credentials file

```bash
mkdir -p lead-gen/credentials
# Move the downloaded JSON into:
mv ~/Downloads/your-project-xxxx.json lead-gen/credentials/google-service-account.json
```

### 3e. Share your spreadsheet with the service account

1. Open your Google spreadsheet
2. Click **Share**
3. Paste the service account email (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Uncheck "Notify people" and click **Share**

---

## Step 4 — Get your Spreadsheet ID

Your spreadsheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
The long string between `/d/` and `/edit` is the **Spreadsheet ID**.

---

## Step 5 — Create your .env file

```bash
cp lead-gen/.env.example lead-gen/.env
```

Open `lead-gen/.env` and fill in:

```env
APOLLO_API_KEY=your_key_here
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/google-service-account.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Leads          # or whatever your tab is named

# Optional: email alerts
ALERT_EMAIL_FROM=you@gmail.com
ALERT_EMAIL_TO=jgagliardo98@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password (not your login password)
```

### Generating a Gmail App Password (for email alerts)

Only needed if you want email notifications on errors:

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already on
3. Search for **App passwords**
4. Create one named "Lead Gen" — copy the 16-character code into `.env`

---

## Step 6 — Verify connections before first run

```bash
cd lead-gen
npm run test-connection
```

Expected output:
```
Testing Apollo.io connection… OK — logged in as you@email.com
Testing Google Sheets connection… OK — spreadsheet title: "My Leads Sheet"

All connections verified. You are ready to run: npm start
```

If either check fails, the error message will tell you exactly what to fix.

---

## Step 7 — Run immediately (optional dry run)

To pull leads right now without waiting for 7am:

```bash
npm run run-once
```

This runs the full workflow once and exits. Check your spreadsheet — you should see new rows.

---

## Step 8 — Start the scheduler

```bash
npm start
```

This starts the process and keeps it running. The cron fires every morning at **7:00 AM Eastern**:
- During EDT (summer): that's `0 11 * * *` UTC
- During EST (winter): that's `0 12 * * *` UTC

The default in `.env.example` is `0 11 * * *` (EDT). Update `CRON_SCHEDULE` in November when clocks fall back.

### Running 24/7 with PM2 (recommended for a server or always-on machine)

```bash
npm install -g pm2
pm2 start src/index.js --name lead-gen
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```

Check logs: `pm2 logs lead-gen`

---

## Customizing the workflow

| What to change | Where |
|---|---|
| Add/remove cities | `src/config.js` → `TARGET_LOCATIONS` |
| Change industries | `src/config.js` → `TARGET_INDUSTRIES` |
| Change target job titles | `src/config.js` → `TARGET_TITLES` |
| Change column order/names | `src/config.js` → `SHEET_COLUMNS` (also update `sheets.js` row builder) |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN=25` |
| Change schedule | `.env` → `CRON_SCHEDULE=0 11 * * *` |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Add the key to `.env` |
| `Google service account key not found` | Check the file path in `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` |
| `The caller does not have permission` | Make sure you shared the spreadsheet with the service account email |
| `Apollo returned 0 results` | Try broadening the search — check `TARGET_INDUSTRIES` or remove some filters in `apollo.js` |
| `Request failed with status code 401` (Apollo) | API key is wrong or expired |

---

## File structure

```
lead-gen/
├── .env                        ← your secrets (never commit this)
├── .env.example                ← template
├── .gitignore
├── package.json
├── SETUP.md                    ← this file
├── credentials/
│   └── google-service-account.json   ← Google credentials (never commit)
└── src/
    ├── index.js                ← scheduler entry point
    ├── run-once.js             ← single manual run
    ├── test-connection.js      ← verify API connections
    ├── workflow.js             ← orchestrates Apollo → Sheets
    ├── apollo.js               ← Apollo search logic
    ├── sheets.js               ← Google Sheets read/write
    ├── notify.js               ← error alerts
    └── config.js               ← all configurable constants
```
