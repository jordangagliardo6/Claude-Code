# HVAC Lead Generation – Southwest Michigan

Pulls HVAC owner contacts from **Apollo.io** and appends them to a **Google Sheet**, deduplicating as it goes. Runs automatically every morning at **7:00 AM Eastern Time**.

---

## What it does

- Searches Apollo for HVAC / Plumbing / Mechanical Contracting companies in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, and South Haven, MI
- Targets **Owner, President, Founder, Co-Founder, General Manager** job titles at companies with **1–25 employees**
- Skips contacts with no phone number
- Appends up to **25 new leads per run** to your Google Sheet
- Skips businesses already in the sheet (deduplication on Business Name)
- Sends a console/email alert if Apollo returns nothing or the sheet write fails

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Node.js ≥ 18 | Runtime |
| Apollo.io account | Lead data source |
| Google Cloud project | Sheets API access |

---

## First-time setup

### Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

### Step 2 — Get your Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your **API Key**

---

### Step 3 — Create the Google Sheet

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet (or use an existing one)
2. Rename the first tab to **Leads** (or whatever you set `GOOGLE_SHEET_NAME` to)
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← THIS PART →  /edit
   ```

---

### Step 4 — Set up a Google Service Account

The script needs a service account to write to your sheet without a browser login.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" in the search bar → Enable
4. Create a service account:
   - **IAM & Admin → Service Accounts → Create Service Account**
   - Name it anything (e.g. `lead-gen-bot`)
   - Click **Done** (no role needed at this level)
5. Open the service account → **Keys → Add Key → Create new key → JSON**
6. Download the `.json` file and save it as `lead-gen/google-credentials.json`
7. **Share your Google Sheet with the service account email** (it looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
   - Open your spreadsheet → Share → paste the service account email → set to **Editor**

---

### Step 5 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-credentials.json
```

---

### Step 6 — Verify connections before the first run

```bash
npm run test-connections
```

You should see:

```
=== Testing Connections ===

✅ Apollo.io        — connected
  Spreadsheet: "My Lead Sheet"
  Target sheet: "Leads" — found
  Header row written to sheet.
✅ Google Sheets    — connected

=== All connections verified ===

Ready. Run `npm start` to start the daily scheduler, or `npm run run-now` to trigger once.
```

If either check fails, the error message will tell you exactly what's wrong (missing key, wrong spreadsheet ID, etc.).

---

### Step 7 — Run it once manually to confirm

```bash
npm run run-now
```

Check your Google Sheet — you should see up to 25 new rows with today's date.

---

### Step 8 — Start the daily scheduler

```bash
npm start
```

The process will stay running and fire every day at **7:00 AM Eastern Time**. To run it persistently on a server, use [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup    # makes it restart on reboot
```

---

## Google Sheet column layout

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

Columns **Called** and **Notes** are left blank for you to fill in manually.

---

## Optional: Email alerts on errors

To receive an email when Apollo returns no results or a write fails, add these to `.env`:

```env
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_sender@gmail.com
SMTP_PASS=your_16_char_app_password
```

For Gmail, use an **App Password** (not your regular password):
[https://support.google.com/accounts/answer/185833](https://support.google.com/accounts/answer/185833)

Then install nodemailer:

```bash
npm install nodemailer
```

---

## Customizing the workflow

All easy-to-change settings live in **`src/config.js`**:

```js
// Add or remove Southwest Michigan cities
locations: [
  'St. Joseph, Michigan, United States',
  'Holland, Michigan, United States',
  // …add more here
],

// Change which job titles to target
jobTitles: ['Owner', 'President', 'Founder'],

// Change max leads per run
maxLeadsPerRun: 25,
```

---

## File structure

```
lead-gen/
├── index.js            Main entry point + scheduler
├── src/
│   ├── apollo.js       Apollo.io people search + phone extraction
│   ├── sheets.js       Google Sheets read/write + deduplication
│   └── config.js       Cities, job titles, industries — edit this
├── .env.example        Template for your .env file
├── .env                Your secrets (never commit this)
├── google-credentials.json   Service account key (never commit this)
└── package.json
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm run test-connections` | Verify Apollo + Google Sheets, then exit |
| `npm run run-now` | Test connections, pull leads once, then exit |
| `npm start` | Start the daily 7 AM ET scheduler (runs forever) |
