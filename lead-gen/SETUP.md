# HVAC Lead Gen — Setup Guide

Automated lead generation for HVAC companies in Southwest Michigan.
Pulls owner-contact data from Apollo.io and appends to a Google Sheet every morning at 7 AM Eastern.

---

## What you need

| Requirement | Where to get it |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Apollo.io account | https://app.apollo.io (free tier = 50 enrichments/month; Basic = 1,000/month) |
| Google Cloud project | https://console.cloud.google.com (free) |
| A Google Sheet | Create one at https://sheets.google.com |

---

## Step 1 — Create your Google Sheet

1. Go to https://sheets.google.com and create a new blank spreadsheet.
2. Rename the first tab to **Leads** (right-click the tab → Rename).
3. Leave row 1 empty — the script writes the headers automatically on first run.
4. Copy the Sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/  YOUR_SHEET_ID_IS_HERE  /edit
```

---

## Step 2 — Create a Google service account

A service account lets the script write to your sheet without requiring you to be logged in.

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API** for that project:
   - Menu → APIs & Services → Enable APIs & Services → search "Google Sheets API" → Enable
4. Create a service account:
   - Menu → APIs & Services → Credentials → Create Credentials → Service Account
   - Name it anything (e.g. "lead-gen-bot") and click Done
5. Download the JSON key:
   - Click your new service account → Keys tab → Add Key → Create new key → JSON
   - Save the downloaded file as **`credentials.json`** inside the `lead-gen/` folder
6. Share your Google Sheet with the service account:
   - Open the sheet → Share → paste the service account email (looks like `something@your-project.iam.gserviceaccount.com`) → set to Editor → Send

---

## Step 3 — Get your Apollo.io API key

1. Log in to https://app.apollo.io
2. Go to Settings → Integrations → API (or visit https://developer.apollo.io)
3. Copy your API key

> **Note on Apollo plans:**
> The free tier gives you 50 people enrichments/month. At 25 leads/day × 22 business days,
> you'll need a Basic plan ($49/mo) for daily runs. You can reduce `MAX_LEADS_PER_RUN`
> in `config.js` if you want to stay on free.

---

## Step 4 — Configure environment variables

```bash
cd lead-gen
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=        ← your Apollo API key
GOOGLE_SHEET_ID=       ← the ID from Step 1
GOOGLE_CREDENTIALS_PATH=./credentials.json
```

Optional (for email alerts on errors):

```
NOTIFY_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.gmail@gmail.com
SMTP_PASS=your_gmail_app_password
```

To create a Gmail App Password: https://myaccount.google.com/apppasswords

---

## Step 5 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 6 — Test the connection before the first scheduled run

```bash
npm test
```

This runs `node index.js --test`, which:
1. Connects to Google Sheets and prints the sheet title
2. Hits Apollo with a 1-lead sample to verify your key works
3. Runs a full lead gen pass so you can see real output

If both connections succeed you'll see something like:

```
[1/2] Testing Google Sheets connection…
  ✓ Connected to sheet: "HVAC Leads"

[2/2] Testing Apollo.io connection (pulling 1 sample lead)…
  ✓ Apollo returned at least 1 result:
      Business : Kalamazoo Comfort Systems
      Contact  : Mike Johnson
      Phone    : +12695550100
      City     : Kalamazoo

Both connections OK.
Running full lead gen pass now…
  ✓ 12 new (non-duplicate) leads to add
  ✓ 12 leads appended to sheet
```

Open your Google Sheet and confirm the leads appeared.

---

## Step 7 — Start the daily scheduler

```bash
npm start
```

The scheduler runs in the foreground. To keep it running after you close your terminal,
use a process manager like PM2:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save          # persist across reboots
pm2 startup       # configure auto-start on reboot (follow the printed command)
```

Check logs at any time:

```bash
pm2 logs hvac-lead-gen
```

---

## Customizing the search

All search parameters live in **`config.js`**. You can change them without touching any other file:

| Constant | What it controls |
|---|---|
| `CITIES` | Which cities to target |
| `INDUSTRIES` | Apollo keyword tags for industry matching |
| `JOB_TITLE_PRIORITY` | Which titles to search for, in priority order |
| `EMPLOYEE_RANGES` | Company size filter (Apollo "1,10" = 1–10 employees) |
| `MAX_LEADS_PER_RUN` | How many leads to add per daily run (default: 25) |
| `SHEET_TAB` | Name of the tab inside your Google Sheet |

---

## Error handling

- All errors are logged to `error.log` in the `lead-gen/` folder.
- If SMTP credentials are set in `.env`, an email alert is sent to `NOTIFY_EMAIL`.
- If Google Sheets or Apollo fail, the run exits early and logs the error. Nothing partial is written.

---

## Google Sheet column reference

| Column | Field | Filled by |
|---|---|---|
| A | Date Added | Script |
| B | Business Name | Script |
| C | Owner First Name | Script |
| D | Owner Last Name | Script |
| E | Phone Number | Script |
| F | City | Script |
| G | Website | Script |
| H | Called | You |
| I | Notes | You |
