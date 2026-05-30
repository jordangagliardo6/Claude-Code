# HVAC Lead Generator — Setup & First Run Guide

Pulls up to 25 HVAC owner/decision-maker leads per day from Southwest Michigan,
appends them to a Google Sheet, and runs automatically every morning at 7 AM ET.

---

## What you need before starting

- Node.js 18 or newer — download at https://nodejs.org
- An Apollo.io account with API access (Basic plan or higher)
- A Google account with access to Google Cloud Console
- An existing Google Sheet where leads will be written

---

## Step 1 — Get your Apollo.io API key

1. Log in to Apollo at https://app.apollo.io
2. Go to **Settings → Integrations → API** (or visit https://app.apollo.io/#/settings/integrations/api)
3. Copy the **API Key** shown on that page.

---

## Step 2 — Set up Google Sheets access (service account)

A service account lets the script write to your spreadsheet without any
interactive sign-in prompts — essential for an automated scheduler.

### 2a. Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. Click **Select a project → New Project**.  Name it anything (e.g. "hvac-leads").
3. Click **Create**.

### 2b. Enable the Google Sheets API

1. In the left menu, go to **APIs & Services → Library**.
2. Search for **Google Sheets API**, click it, then click **Enable**.

### 2c. Create a service account

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → Service account**.
3. Give it a name (e.g. "hvac-sheet-writer"), click **Create and continue**.
4. Skip the optional role and user steps — click **Done**.

### 2d. Download the JSON key

1. On the Credentials page, click your new service account.
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**.
3. A file downloads automatically.  Rename it to **`credentials.json`** and place it
   in the `hvac-lead-gen/` folder (same folder as `index.js`).

### 2e. Share your Google Sheet with the service account

1. Open `credentials.json` and find the `"client_email"` field — it looks like:
   `hvac-sheet-writer@your-project.iam.gserviceaccount.com`
2. Open your Google Sheet.
3. Click **Share** (top right), paste that email address, set the role to **Editor**,
   and click **Send** (uncheck "notify people" — it's a robot).

### 2f. Get the spreadsheet ID

Your spreadsheet URL looks like this:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
The long string between `/d/` and `/edit` is your **Spreadsheet ID**.

---

## Step 3 — Configure the project

```bash
# In the hvac-lead-gen/ folder:
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key from Step 1 |
| `GOOGLE_SPREADSHEET_ID` | The spreadsheet ID from Step 2f |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | `./credentials.json` (default — leave as-is) |
| `GOOGLE_SHEET_TAB_NAME` | The tab name in your sheet (default: `Leads`) |
| `NOTIFY_EMAIL` | `true` if you want email alerts on errors |
| `ALERT_EMAIL` | Your Gmail address for alerts |
| `GMAIL_APP_PASSWORD` | Gmail App Password (see below) |

### Setting up Gmail alerts (optional)

If you set `NOTIFY_EMAIL=true`:

1. Go to https://myaccount.google.com/security and ensure **2-Step Verification** is ON.
2. Go to https://myaccount.google.com/apppasswords
3. Create a new app password named "hvac-leads".
4. Copy the 16-character password into `GMAIL_APP_PASSWORD` in your `.env`.

---

## Step 4 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 5 — Test both connections (do this first!)

```bash
node test-connection.js
```

Expected output when everything is working:

```
══════════════════════════════════════════════════════════
  HVAC Lead Gen — Connection Test
══════════════════════════════════════════════════════════

  ✓ Apollo  — API key is valid and connected.
  ✓ Sheets  — Connected to spreadsheet. Found 0 existing business name(s) in the sheet.

  All systems connected. You are ready to run the workflow.
  ▶  node run-once.js          (run immediately)
  ▶  node index.js             (start the 7 AM daily scheduler)
══════════════════════════════════════════════════════════
```

**If Apollo fails:** double-check `APOLLO_API_KEY` in `.env`.

**If Sheets fails:** confirm `credentials.json` exists, the spreadsheet ID is correct,
and you shared the sheet with the service account email.

---

## Step 6 — Run immediately (optional)

To pull your first batch of leads right now without waiting for 7 AM:

```bash
node run-once.js
```

---

## Step 7 — Start the daily scheduler

```bash
node index.js
```

This process must stay running to fire at 7 AM.  To keep it alive after you close
the terminal, use **PM2** (recommended):

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save              # auto-restart on reboot
pm2 startup           # follow the printed command to enable on system boot
```

To check logs with PM2:
```bash
pm2 logs hvac-leads
```

---

## Customising the workflow

All tunable settings live in one file: **`src/config.js`**

| Setting | What it controls |
|---|---|
| `TARGET_CITIES` | Which Southwest Michigan cities to target |
| `INDUSTRY_KEYWORDS` | Apollo keyword tags for industry filtering |
| `JOB_TITLES` | Decision-maker titles to search for |
| `EMPLOYEE_RANGE` | Company size filter (default: `1,25`) |
| `MAX_LEADS_PER_RUN` | Cap on new leads per run (default: 25) |
| `CRON_SCHEDULE` | When to run (default: `0 7 * * *` = 7 AM) |

Edit `src/config.js`, save, then restart the scheduler:
```bash
pm2 restart hvac-leads
```

---

## Google Sheet column layout

The script writes these columns in this exact order:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

**Called** and **Notes** are always left blank — fill them in manually as you work through the list.
