# HVAC Lead Gen — Setup Guide

This tool searches Apollo.io for HVAC owner-operators in Southwest Michigan and appends new leads to a Google Sheet every morning at 7 AM Eastern.

---

## Prerequisites

- Node.js 18 or later (`node --version`)
- An Apollo.io account with API access (free tier works)
- A Google account with a blank spreadsheet ready

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Get Your Apollo.io API Key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Create the Google Sheets API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services → Library**
4. Search for **Google Sheets API** and click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **Create Credentials → OAuth client ID**
7. Application type: **Desktop app**
8. Click **Create**, then **Download JSON**
9. Rename the downloaded file to `credentials.json` and place it in the `hvac-lead-gen/` folder

---

## Step 4 — Create Your Google Spreadsheet

1. Open [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet
2. Name it something like "HVAC Leads SW Michigan"
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```

---

## Step 5 — Configure the .env File

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
ALERT_EMAIL=jgagliardo98@gmail.com

# Optional — only needed for email error alerts
GMAIL_USER=your_gmail@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password
```

> **Gmail App Password:** Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an app password for "Mail", and use that 16-character code — NOT your regular Gmail password.

---

## Step 6 — Run the Connection Test (First-Time Auth)

```bash
node src/test-connections.js
```

On the **first run**, this will:
1. Open a browser OAuth URL for Google
2. Ask you to paste an authorization code back into the terminal
3. Save `token.json` for future runs (no more prompts)

If both tests pass, you'll see:
```
All connection tests passed. You are ready to run the scheduler.
```

---

## Step 7 — Run the Workflow Once to Verify

```bash
node src/run-once.js
```

This immediately pulls up to 25 leads and writes them to your spreadsheet. Open the sheet and confirm rows appeared.

---

## Step 8 — Start the Scheduler

```bash
node src/index.js
```

The scheduler starts and fires every day at **7:00 AM Eastern**. Keep the process running (use `pm2`, `screen`, or a server to keep it alive overnight).

### Keep it running with PM2 (recommended)

```bash
npm install -g pm2
pm2 start src/index.js --name hvac-leads
pm2 save
pm2 startup   # Follow the printed command to auto-start on reboot
```

---

## Customization

| What to change | Where |
|---|---|
| Add or remove cities | `src/config.js` → `TARGET_CITIES` |
| Change job titles | `src/config.js` → `TARGET_TITLES` |
| Add/remove industries | `src/config.js` → `TARGET_INDUSTRIES` |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Change run time | `src/config.js` → `scheduler.cronExpression` |
| Add/remove spreadsheet columns | `src/config.js` → `SHEET_COLUMNS` (update `apollo.js` normalizeLead too) |

---

## Error Notifications

- All errors are always logged to the console with timestamps.
- If `ALERT_EMAIL`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD` are set, you'll also receive an email when Apollo fails or the Sheets write fails.
