# HVAC Lead Gen — Setup & First Run Guide

Automated lead generation: searches Apollo.io for HVAC business owners in Southwest Michigan and appends them to a Google Sheet. Runs every day at 7 AM Eastern. Pulls up to 25 new leads per run and skips any business already in the sheet.

---

## What you need before starting

| Requirement | Where to get it |
|---|---|
| **Apollo.io API key** | [developer.apollo.io](https://developer.apollo.io) → API Keys |
| **Google Cloud project** with Sheets API enabled | [console.cloud.google.com](https://console.cloud.google.com) |
| **Service account JSON key** | Google Cloud → IAM & Admin → Service Accounts |
| **Google Spreadsheet** (blank is fine) | [sheets.new](https://sheets.new) |
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |

---

## Step 1 — Create your Google Spreadsheet

1. Go to [sheets.new](https://sheets.new) to create a blank spreadsheet.
2. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_IS_THE_ID**/edit`
3. You don't need to add headers — the script creates them automatically on the first run.

---

## Step 2 — Set up Google Cloud credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create (or select) a project.
2. Enable the **Google Sheets API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Google Sheets API" and click **Enable**
3. Create a **Service Account**:
   - Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Give it any name (e.g., `hvac-lead-gen`)
   - Click **Create and Continue** → skip optional roles → **Done**
4. Create a JSON key:
   - Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
   - Download the file
5. Place the downloaded JSON file in:
   ```
   hvac-lead-gen/credentials/service-account.json
   ```
6. **Share your spreadsheet** with the service account email (found inside the JSON file as `client_email`, e.g. `hvac-lead-gen@your-project.iam.gserviceaccount.com`):
   - Open the spreadsheet → **Share** → paste the email → **Editor** → **Send**

---

## Step 3 — Configure environment variables

```bash
cd hvac-lead-gen
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_key_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_TAB=Sheet1
```

Optional — enable email alerts on errors:
```env
ALERT_EMAIL_TO=you@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
```
> For Gmail: use an [App Password](https://myaccount.google.com/apppasswords), not your regular password. Requires 2FA enabled.

---

## Step 4 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 5 — Test connections (do this first!)

```bash
node run.js --test
```

Expected output:
```
=== HVAC Lead Gen — Connection Test ===

1. Testing Apollo.io…
   OK — Apollo responded. Sample result count: 1
   Sample lead: Smith HVAC Services | John Smith | +12695551234 | Kalamazoo

2. Testing Google Sheets…
   Google Sheets connected. Header row: (empty — will be created on first run)
   OK — Google Sheets connected (spreadsheetId: 1Abc..., tab: Sheet1)

=== All connections OK — ready to run! ===
```

If either test fails, the error message explains what to fix.

---

## Step 6 — Run manually

```bash
node run.js
```

Check your spreadsheet — you should see up to 25 leads appended with today's date.

---

## Step 7 — Start the scheduler (daily 7 AM runs)

**Simple — keep the terminal open:**
```bash
node scheduler.js
```

**Recommended — use pm2 so it survives reboots:**
```bash
npm install -g pm2
pm2 start scheduler.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to enable auto-start
```

**Check status:**
```bash
pm2 status
pm2 logs hvac-leads
```

The scheduler fires at `0 7 * * *` America/New_York (7:00 AM Eastern, adjusts for DST automatically).

---

## Customising

### Change which cities are targeted
Edit `src/apollo.js` → `SW_MICHIGAN_CITIES` array.

### Change industry keywords
Edit `src/apollo.js` → `INDUSTRY_KEYWORDS` array.

### Change how many leads per run
Set `MAX_LEADS_PER_RUN=50` in `.env` (default is 25).

### Change the spreadsheet columns
Edit `src/sheets.js` → `COL` object. Reorder or add columns there and in `ensureHeaderRow`.

### Change the schedule time
Edit `scheduler.js` → `CRON_EXPRESSION`. Use [crontab.guru](https://crontab.guru) to build expressions.

---

## Spreadsheet columns

| Column | Header | Notes |
|---|---|---|
| A | Date Added | Set automatically |
| B | Business Name | Used for dedup check |
| C | Owner First Name | |
| D | Owner Last Name | |
| E | Phone Number | Mobile preferred; direct if no mobile |
| F | City | |
| G | Website | |
| H | Called | Leave blank — fill in manually |
| I | Notes | Leave blank — fill in manually |

---

## Troubleshooting

**"Apollo returned 0 results"**
- Verify `APOLLO_API_KEY` is correct
- Check your Apollo plan has People Search credits
- Try `node run.js --test` to see a raw API response

**"Service account key not found"**
- Check the path in `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`
- The path is relative to the project root (`./credentials/service-account.json`)

**Google Sheets 403 / permission denied**
- Make sure you shared the spreadsheet with the service account email
- Verify the Sheets API is enabled in your Google Cloud project

**Duplicate leads still appearing**
- The dedup check compares `Business Name` (case-insensitive)
- If the same company appears under two slightly different names, it will be inserted twice — manually delete the duplicate from the sheet

---

## Apollo API limits (free vs paid)

| Plan | People searches/month | Phone number reveals/month |
|---|---|---|
| Free | Limited | Very limited (~50) |
| Basic ($49/mo) | Unlimited searches | 1,000 reveals |
| Professional ($99/mo) | Unlimited | 2,000 reveals |

For daily runs of 25 leads, **Basic** ($49/mo) is typically sufficient. Phone numbers consume your monthly credit allowance.
