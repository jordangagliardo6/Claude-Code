# HVAC Lead Scraper — First-Time Setup Guide

Automated daily lead generation: Apollo.io → Google Sheets  
Target: HVAC owner-operated businesses in Southwest Michigan

---

## What you'll need

| Thing | Where to get it | Free tier? |
|---|---|---|
| Apollo.io API key | [developer.apollo.io](https://developer.apollo.io) → API Keys | 50 enrichments/mo |
| Google Cloud project | [console.cloud.google.com](https://console.cloud.google.com) | Free |
| Google Sheet | [sheets.google.com](https://sheets.google.com) | Free |
| Node.js 18+ | [nodejs.org](https://nodejs.org) | Free |

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-scraper
npm install
```

---

## Step 2 — Set up Google Sheets API

### 2a. Create a Google Cloud project (if you don't have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project** → name it anything (e.g. `hvac-scraper`)

### 2b. Enable the Google Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

### 2c. Create a service account

1. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
2. Name it `hvac-scraper` → **Create and Continue** → **Done**
3. Click the new service account → **Keys** tab → **Add Key → Create new key → JSON**
4. Download the JSON file — save it in this folder as `google-service-account-key.json`

> **Important:** the JSON key file contains a private key. Do not commit it to git.  
> It's already in `.gitignore` for you.

### 2d. Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet**
2. Name it anything (e.g. `HVAC Leads Southwest Michigan`)
3. The scraper will automatically create the header row on first run.
   Your columns will be: **Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes**
4. Copy the Sheet ID from the URL bar:  
   `https://docs.google.com/spreadsheets/d/`**`THIS_LONG_ID`**`/edit`

### 2e. Share the sheet with your service account

1. Open your new Google Sheet
2. Click **Share** (top right)
3. Paste the service account email address — it looks like:  
   `hvac-scraper@your-project-id.iam.gserviceaccount.com`  
   (find it inside the JSON key file under `"client_email"`)
4. Set permission to **Editor** → **Send**

---

## Step 3 — Get your Apollo.io API key

1. Go to [developer.apollo.io](https://developer.apollo.io)
2. Sign in → **API Keys** → **Create API Key**
3. Copy the key

**Apollo free tier** gives you 50 contact enrichments per month.  
Each lead pulled from the search API counts toward that limit.  
For 25 leads/day you'll want the **Basic plan ($49/mo)**.

---

## Step 4 — Configure your environment

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in:

```
APOLLO_API_KEY=paste_your_apollo_key_here
GOOGLE_SHEET_ID=paste_your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account-key.json
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
```

**For Gmail App Password** (used for error alert emails):
1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Select **Mail** → **Other (Custom name)** → name it `hvac-scraper` → **Generate**
3. Copy the 16-character password into `SMTP_PASS`

> Error emails are optional. If you skip `SMTP_USER`/`SMTP_PASS`, errors are only logged to the console.

---

## Step 5 — Verify both connections

Run this before your first scheduled run to confirm everything is wired up:

```bash
node index.js --verify
```

Expected output:
```
── HVAC Lead Scraper — Connection Verification ──

1. Apollo.io API key … ✓  Connected (2,847,301 total records accessible)
2. Google Sheet access … ✓  Connected — sheet: "HVAC Leads Southwest Michigan"

✓ All checks passed. You're ready to run the scraper.

  → Run now:       node index.js --run-now
  → Start cron:    node index.js
```

If either check fails, re-read the relevant step above.

---

## Step 6 — Do a test run

```bash
node index.js --run-now
```

This runs the full workflow once immediately (no waiting for 7 AM).  
Check your Google Sheet — new leads should appear within a few seconds.

---

## Step 7 — Start the daily scheduler

```bash
node index.js
```

The process stays running and fires at **7:00 AM Eastern Time every day**.  
To keep it running after you close your terminal, use a process manager:

### Option A — pm2 (recommended)
```bash
npm install -g pm2
pm2 start index.js --name hvac-scraper
pm2 save          # persist across reboots
pm2 startup       # generate startup command (follow the instructions it prints)
```

### Option B — nohup (simple, no install needed)
```bash
nohup node index.js > scraper.log 2>&1 &
echo "PID: $!"
```

### Option C — system crontab (skip node-cron entirely)
```bash
crontab -e
# Add this line (adjust the path):
0 7 * * * cd /path/to/hvac-lead-scraper && /usr/bin/node index.js --run-now >> /var/log/hvac-scraper.log 2>&1
```

---

## Customizing later

### Change target cities
Edit `TARGET_CITIES` in `index.js`:
```js
const TARGET_CITIES = [
  'St. Joseph', 'Kalamazoo', 'Holland', // keep what you want
  'Battle Creek',                         // add new ones
];
```

### Change industries searched
Edit `TARGET_INDUSTRIES` in `apollo.js`.

### Change max leads per run
Edit `MAX_LEADS_PER_RUN` in `index.js` (currently 25).

### Add/remove sheet columns
Edit `COLUMNS` in `sheets.js` — make sure your actual Google Sheet headers match exactly.

---

## Troubleshooting

**Apollo returns 0 leads**  
- Your free tier may be out of credits for the month  
- Try broadening `TARGET_INDUSTRIES` in `apollo.js`  
- Run `--verify` to confirm the API key still works  

**Google Sheets write fails with 403**  
- The service account email isn't shared on the sheet (re-do step 2e)  
- Or the API key JSON path in `.env` is wrong  

**"GOOGLE_SHEET_ID not set" error**  
- Your `.env` file isn't in the `hvac-lead-scraper/` folder  
- Or you forgot to fill it in (it still says `your_google_sheet_id_here`)  

**Email alerts not arriving**  
- Make sure you used an App Password, not your regular Gmail password  
- Check spam folder  
- Test with: `SMTP_PASS=xxx node -e "require('./notifier').notify('test')"` from this folder  
