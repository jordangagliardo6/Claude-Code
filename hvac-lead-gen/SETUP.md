# HVAC Lead Gen — First-Time Setup

## What this does

Every morning at 7 AM Eastern, this script:
1. Calls the Apollo.io API to find HVAC/plumbing/mechanical company owners in SW Michigan
2. Filters to contacts with a direct or mobile phone number
3. Appends up to 25 new (non-duplicate) rows to your Google Sheet

---

## Step 1 — Get your Apollo.io API key

1. Log in at [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 2 — Set up Google Sheets API

### 2a. Create a Google Cloud project and enable the Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services → Library**
4. Search for "Google Sheets API" and click **Enable**

### 2b. Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Desktop app**
4. Name it anything (e.g., "HVAC Lead Gen")
5. Click **Create**, then **Download JSON**
6. Save the downloaded file as `credentials.json` in the `hvac-lead-gen/` folder

### 2c. Create (or locate) your Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**<SPREADSHEET_ID>**/edit`

---

## Step 3 — Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```
APOLLO_API_KEY=your_apollo_key_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Sheet1
ALERT_EMAIL=jgagliardo98@gmail.com
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
TZ=America/New_York
```

---

## Step 4 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 5 — Test the connections

```bash
npm run test-connection
```

**First run only:** the script will print a Google OAuth URL. Open it in your browser, log in with the Google account that owns the spreadsheet, and paste the authorization code back into the terminal. The token is saved to `token.json` — you won't need to do this again.

Expected output when everything is working:
```
✓ PASS  Apollo.io
✓ PASS  Google Sheets
All connections verified. You are ready to run the scheduler.
```

---

## Step 6 — Run once to verify

```bash
npm run run-once
```

Check your Google Sheet — you should see the header row and up to 25 leads.

---

## Step 7 — Start the daily scheduler

```bash
npm start
```

This starts the 7 AM Eastern cron. Keep the process running (use `pm2`, `screen`, or a systemd service on a server, or just leave the terminal open).

### Keeping it running with pm2 (recommended for a server)

```bash
npm install -g pm2
pm2 start "TZ=America/New_York node index.js" --name hvac-lead-gen
pm2 save
pm2 startup   # follow the instructions it prints
```

---

## Customizing

| Thing to change | Where |
|---|---|
| City list / zip codes | `src/apollo.js` → `SW_MICHIGAN_ZIPS` / `swMichiganCities` |
| Target job titles | `src/apollo.js` → `TARGET_TITLES` |
| Industries | `src/apollo.js` → `TARGET_INDUSTRIES` |
| Max leads per run | `src/run.js` → `MAX_LEADS_PER_RUN` |
| Schedule (default 7am) | `.env` → `CRON_SCHEDULE=0 7 * * *` |
| Sheet column order | `src/sheets.js` → `COLUMNS` object + `HEADER_ROW` array |

---

## Error alerts

If Apollo returns no results or the Sheet write fails, the error is logged to the console with a timestamp. To also receive email alerts, add these to `.env` and install nodemailer:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
```

```bash
npm install nodemailer
```
