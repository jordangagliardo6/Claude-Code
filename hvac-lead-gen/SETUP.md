# HVAC Lead Gen — Setup & First Run Guide

## What it does
Searches Apollo.io every morning at **7:00 AM Eastern** for HVAC / HVAC-adjacent
business owners in Southwest Michigan (St. Joseph, Benton Harbor, Kalamazoo,
Holland, Grand Haven, Muskegon, South Haven) and appends up to **25 new leads**
(de-duplicated by business name) to a Google Sheet with columns:

| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

---

## Prerequisites
- Node.js 18 or newer
- An **Apollo.io account** with API access enabled
- A **Google Cloud project** with the Sheets API enabled and a service account

---

## Step 1 — Get your Apollo API key
1. Log into [Apollo.io](https://app.apollo.io).
2. Go to **Settings → Integrations → API**.
3. Copy your API key.

---

## Step 2 — Set up Google Sheets API access

### 2a. Create a Google Cloud project (if you don't have one)
1. Open <https://console.cloud.google.com>.
2. Click **Select a project → New Project**, name it (e.g. `hvac-lead-gen`).

### 2b. Enable the Google Sheets API
1. In the project, go to **APIs & Services → Enable APIs**.
2. Search for **Google Sheets API** and click **Enable**.

### 2c. Create a Service Account
1. Go to **APIs & Services → Credentials → Create Credentials → Service Account**.
2. Give it a name (e.g. `hvac-sheets-writer`), click **Create and Continue**, skip roles, click **Done**.
3. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**.
4. Download the JSON file — this is your `GOOGLE_SERVICE_ACCOUNT_JSON`.

### 2d. Share your Google Sheet with the service account
1. Open your Google Sheet (create a blank one if needed).
2. Click **Share**.
3. Paste the service account's `client_email` (found inside the JSON) and give it **Editor** access.
4. Copy the spreadsheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

---

## Step 3 — Configure environment variables

```bash
cd hvac-lead-gen
cp .env.example .env
# Edit .env and fill in:
#   APOLLO_API_KEY
#   GOOGLE_SHEET_ID
#   GOOGLE_SERVICE_ACCOUNT_JSON  (paste the entire JSON as one line)
```

> **Tip:** To make the JSON one line, run:  
> `cat your-service-account.json | tr -d '\n'`

---

## Step 4 — Install dependencies

```bash
npm install
```

---

## Step 5 — Test the connection before the first scheduled run

Load your `.env` values and run a one-shot test:

```bash
# Load env vars (Linux/macOS)
export $(grep -v '^#' .env | xargs)

# Run immediately — pulls up to 25 leads right now
npm run test-run
```

You should see output like:
```
[scheduler] HVAC lead-gen scheduled for 07:00 AM Eastern every day.
[run] Starting HVAC lead generation at 2026-08-28T12:00:00.000Z
[setup] Header row written.
[run] 0 existing businesses already in sheet.
[apollo] Raw results returned: 25
[lead] Added: Smith HVAC | +12695551234
[lead] Added: Lake Shore Heating | +12695555678
...
[run] ✓ Appended 18 new lead(s) to the spreadsheet.
```

Open your Google Sheet to confirm the rows appeared.

---

## Step 6 — Run as a background process (keeps the scheduler alive)

### Option A: PM2 (recommended)

```bash
npm install -g pm2

# Start with env file
pm2 start lead-gen.js --name hvac-lead-gen --env-file .env

# Persist across reboots
pm2 save
pm2 startup
```

### Option B: System cron (runs node directly instead of keeping a process alive)

```cron
# Edit your crontab: crontab -e
0 7 * * * cd /path/to/hvac-lead-gen && node lead-gen.js --now >> /var/log/hvac-lead-gen.log 2>&1
```

If using system cron, set the env vars in `/etc/environment` or prefix the command with them.

---

## Customizing the city list

Open `lead-gen.js` and edit the `targetLocations` array near the top:

```js
targetLocations: [
  'St. Joseph, Michigan',
  'Kalamazoo, Michigan',
  // add more cities here
],
```

## Changing max leads per run

Edit `maxLeadsPerRun` in `CONFIG`:

```js
maxLeadsPerRun: 25,  // change to whatever you want
```

## Changing the column structure

1. Edit the `SHEET_COLUMNS` array to reorder or add columns.
2. Update the `personToRow()` function to match — each element maps to the same-position column.

---

## Error handling

- If Apollo returns zero results → an `[ALERT]` error is logged with your email address.
- If the Google Sheets write fails → same structured error log.
- All errors include a timestamp and context so you know exactly what failed.
- Plug in a real email service (SendGrid, Nodemailer, AWS SES) by replacing the
  `notifyError` function body in `lead-gen.js` with an actual send call.
