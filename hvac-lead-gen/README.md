# HVAC Lead Gen — SW Michigan

Automatically pulls HVAC company owners from Apollo.io and appends them to a Google Sheet every morning at 7 AM Eastern.

**What runs each day:**
1. Searches Apollo for HVAC/Plumbing/Mechanical companies in SW Michigan with 1–25 employees
2. Targets: Owner → President → Founder → Co-Founder → General Manager (in that priority)
3. Skips contacts with no phone number
4. Skips businesses already in the sheet (deduplicated on Business Name)
5. Appends up to 25 new leads to your Google Sheet
6. Emails you if anything fails

---

## Quick Start (first-time setup)

### Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

### Step 2 — Get your Apollo.io API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API Keys**
3. Click **Create new key** → copy it

> **Phone number note:** Apollo's search API returns phone numbers for contacts already in your database or where your plan includes them. If you see contacts without phones, the workflow automatically skips them. To unlock phones for all results, upgrade to an Apollo plan with phone credits and optionally enable enrichment (see `src/apollo.js`).

---

### Step 3 — Set up Google Sheets API (service account)

This is a one-time setup that takes about 5 minutes.

**3a. Create a Google Cloud project**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown → **New Project** → name it anything (e.g. `lead-gen`)
3. Click **Create**

**3b. Enable the Google Sheets API**
1. In your project, go to **APIs & Services → Library**
2. Search for `Google Sheets API` → click it → click **Enable**

**3c. Create a service account**
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it (e.g. `lead-gen-bot`) → click **Create and Continue** → **Done**

**3d. Download the credentials JSON**
1. Click your new service account in the list
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**
3. Save the downloaded file as `credentials.json` inside the `hvac-lead-gen/` folder

**3e. Share your spreadsheet with the service account**
1. Open the `credentials.json` file — copy the `client_email` value
   (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet → click **Share** → paste that email → set role to **Editor** → click **Send**

**3f. Get the spreadsheet ID**
Your sheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
The ID is the long string between `/d/` and `/edit` — copy it.

---

### Step 4 — Configure your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_CREDENTIALS_PATH=./credentials.json

# For email error alerts (optional but recommended)
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
```

> **Gmail App Password:** In your Google Account → Security → 2-Step Verification → App Passwords. Generate one for "Mail". This is different from your login password.

---

### Step 5 — Verify both connections

```bash
npm run test-setup
```

You should see:
```
✅ Apollo.io:     Connected  (~312 matching contacts in Apollo DB)
✅ Google Sheets: Connected  (0 rows currently)

✅ All systems go!
```

If anything fails, the test prints a specific error message pointing you to the fix.

---

### Step 6 — Run it once to confirm

```bash
npm run run-now
```

Check your Google Sheet — you should see up to 25 new rows with today's date. The header row is auto-created if the sheet was empty.

---

### Step 7 — Start the daily scheduler

```bash
npm start
```

The process stays running and fires at 7:00 AM Eastern every morning. Keep it running with a tool like `pm2` (recommended) or `nohup`:

**Using pm2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name "hvac-lead-gen"
pm2 save
pm2 startup   # makes it restart on reboot
```

**Using nohup (quick option):**
```bash
nohup npm start > lead-gen.log 2>&1 &
```

---

## Spreadsheet columns

| Column | Description |
|--------|-------------|
| A — Date Added | Date the lead was added (MM/DD/YYYY ET) |
| B — Business Name | Company name from Apollo |
| C — Owner First Name | Decision-maker first name |
| D — Owner Last Name | Last name (may be partially masked on some Apollo plans) |
| E — Phone Number | Direct or mobile phone, whichever Apollo has |
| F — City | City from the person's or company's record |
| G — Website | Company website if Apollo has it |
| H — Called | **Leave blank — fill in manually after calling** |
| I — Notes | **Leave blank — fill in manually** |

---

## Customizing the workflow

All major settings are at the top of each source file and labeled with comments.

| What to change | Where |
|----------------|-------|
| Cities to target | `src/apollo.js` → `SW_MICHIGAN_CITIES` array |
| Industry keywords | `src/apollo.js` → `INDUSTRY_TAGS` array |
| Job titles | `src/apollo.js` → `TARGET_TITLES` array |
| Company size filter | `src/apollo.js` → `organization_num_employees_ranges` |
| Max leads per run | `.env` → `MAX_LEADS_PER_RUN=25` |
| Run time | `.env` → `CRON_SCHEDULE=0 7 * * *` (standard cron syntax) |
| Sheet tab name | `.env` → `GOOGLE_SHEET_NAME=Sheet1` |
| Column order | `src/sheets.js` → `HEADERS` array + row mapping in `appendLeads()` |

---

## Error handling

| Situation | What happens |
|-----------|-------------|
| Apollo returns 0 results | Console log + email alert sent |
| Apollo API error / bad key | Console log + email alert + run aborts |
| Google Sheets write fails | Console log + email alert + unsaved leads listed in the email |
| Missing `.env` variable | Process exits with a clear message before any API call |

---

## File structure

```
hvac-lead-gen/
├── src/
│   ├── apollo.js      ← Apollo.io REST API client + filters
│   ├── sheets.js      ← Google Sheets read/write logic
│   ├── notify.js      ← Console logging + email alerts
│   └── leadgen.js     ← Main workflow orchestration
├── index.js           ← Scheduler entry point (cron + --run-now)
├── setup-test.js      ← First-run connectivity test
├── package.json
├── .env.example       ← Template — copy to .env and fill in
└── credentials.json   ← (you create this) Google service account key
```
