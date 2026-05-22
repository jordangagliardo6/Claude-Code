# HVAC Lead Gen — Apollo.io → Google Sheets

Pulls up to 25 HVAC/Plumbing/Mechanical owner-operated leads per day from
Southwest Michigan via the Apollo.io API and appends them to a Google Sheet.
Runs automatically every morning at **7:00 AM Eastern Time**.

---

## What the Spreadsheet Looks Like

| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |
|---|---|---|---|---|---|---|---|---|
| 05/22/2026 | Smith HVAC | John | Smith | (269) 555-1234 | Kalamazoo | smithhvac.com | | |

---

## One-Time Setup

### Step 1 — Install Node.js dependencies

```bash
cd hvac-lead-gen
npm install
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Then open `.env` and fill in your keys (instructions for each below).

---

### Step 3 — Apollo.io API Key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**  
   (direct URL: `https://app.apollo.io/#/settings/integrations/api`)
3. Copy your API Key
4. Paste it as `APOLLO_API_KEY=` in `.env`

> **Subscription note:** The free plan allows 50 people exports/month.  
> The Basic plan ($49/mo) gives 1,000/month — enough for ~40 days at 25/run.  
> The Professional plan ($99/mo) gives unlimited exports.

---

### Step 4 — Google Sheets via Service Account

#### 4a. Create a Google Cloud Project (skip if you already have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector → **New Project** → give it a name → **Create**

#### 4b. Enable the Google Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

#### 4c. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name it something like `hvac-lead-gen` → **Create and Continue → Done**

#### 4d. Download the JSON key

1. Click the service account you just created
2. Go to the **Keys** tab → **Add Key → Create New Key → JSON → Create**
3. A `.json` file downloads automatically
4. **Rename it `credentials.json`** and move it into the `hvac-lead-gen/` folder

#### 4e. Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet**
2. Name it something memorable (e.g. `SW Michigan HVAC Leads`)
3. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   ```
4. Paste it as `GOOGLE_SHEET_ID=` in `.env`

> **The header row will be created automatically** — do NOT add headers manually.

#### 4f. Share the sheet with your service account

1. Open `credentials.json` and find the `"client_email"` field — it looks like:
   ```
   hvac-lead-gen@your-project.iam.gserviceaccount.com
   ```
2. In your Google Sheet, click **Share**
3. Paste that email address → set to **Editor** → **Send**

---

### Step 5 — (Optional) Email alerts for errors

If you want an email when Apollo returns nothing or the sheet write fails:

1. Enable **2-Step Verification** on your Google account (if not already on)
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create a new App Password → name it `hvac-lead-gen`
4. Copy the 16-character password (spaces don't matter)
5. In `.env` set:
   ```
   GMAIL_USER=your.gmail@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   NOTIFICATION_EMAIL=your.gmail@gmail.com
   ```

Without these, errors are logged to the console only.

---

## First-Run Check

Before the scheduler ever fires, verify both connections:

```bash
node test-connection.js
```

You should see all green checkmarks. If anything fails, the output tells you
exactly what to fix.

---

## Running the Workflow

### Start the 7am daily scheduler

```bash
npm start
```

Leave this running (or deploy it to a server / process manager like PM2).
It logs the next scheduled run time on startup.

### Trigger an immediate run (test or catch-up)

```bash
npm run run-now
```

### Keep it running with PM2 (recommended for servers)

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing

All user-facing configuration lives in **`config.js`** — you never need to
touch the `src/` files for normal changes.

| What to change | Where |
|---|---|
| Add / remove target cities | `TARGET_CITIES` array |
| Widen the SW Michigan match area | `SW_MICHIGAN_CITIES` array |
| Change job titles to search | `TARGET_TITLES` array |
| Add an industry keyword | `TARGET_INDUSTRIES` array |
| Leads per run (max 25 recommended) | `MAX_LEADS_PER_RUN` |
| Change the schedule time | `CRON_SCHEDULE` + `CRON_TIMEZONE` |
| Add or reorder sheet columns | `SHEET_COLUMNS` array + `buildRow()` in `src/sheets.js` |

---

## Troubleshooting

**Apollo returns 0 results**  
- Verify `APOLLO_API_KEY` is correct and your plan hasn't hit its monthly export limit  
- Try running `npm run run-now` mid-day — Apollo rate limits can cause early-AM 0-result responses  
- Temporarily widen `TARGET_INDUSTRIES` or `TARGET_CITIES` in `config.js`

**403 error from Google Sheets**  
- You haven't shared the sheet with the service account email (Step 4f above)

**Credentials file not found**  
- Make sure `credentials.json` is in the `hvac-lead-gen/` folder  
- Or set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/absolute/path/to/your-key.json` in `.env`

**Email alerts not arriving**  
- Check `GMAIL_APP_PASSWORD` — it must be an *App Password*, not your regular Gmail password  
- Gmail must have 2-Step Verification enabled for App Passwords to work

**Duplicate leads still appearing**  
- The duplicate check is case-insensitive on `Business Name`  
- If the same company appears with slightly different names (e.g. "Smith HVAC" vs "Smith HVAC LLC"),  
  it will be inserted again — add the variant to the Notes column manually to track it

---

## File Structure

```
hvac-lead-gen/
├── index.js              ← Scheduler entry point (npm start)
├── test-connection.js    ← Run this first to verify setup
├── config.js             ← All configuration — edit freely
├── package.json
├── .env                  ← Your secrets (never commit this)
├── .env.example          ← Template for .env
├── credentials.json      ← Google service account key (never commit)
└── src/
    ├── apollo.js         ← Apollo.io API client
    ├── sheets.js         ← Google Sheets read/write
    ├── workflow.js       ← Main business logic
    └── notify.js         ← Console + email error alerts
```
