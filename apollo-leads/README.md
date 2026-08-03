# HVAC Lead Gen — Southwest Michigan

Pulls up to 25 owner-operated HVAC/plumbing leads per day from Apollo.io and appends them to your Google Sheet. Runs automatically every morning at 7 AM Eastern.

---

## Quick Start

```
1. npm install
2. cp .env.example .env          # fill in your keys
3. node setup.js                 # verify both connections
4. npm start                     # start the daily scheduler
```

To run a batch right now without waiting for 7 AM:
```
npm run run-now
```

---

## File Structure

```
apollo-leads/
├── index.js              ← Scheduler (7am daily cron)
├── setup.js              ← First-run connection tester
├── src/
│   ├── config.js         ← Edit cities, titles, industry filters here
│   ├── apollo.js         ← Apollo API: search + enrich
│   ├── sheets.js         ← Google Sheets: read/write
│   ├── notify.js         ← Email alerts on error
│   └── workflow.js       ← Main orchestration logic
├── credentials/          ← Put your Google service account JSON here
│   └── google-service-account.json   (NOT committed to git)
├── logs/                 ← Auto-created; lead-gen.log + errors.log
├── .env                  ← Your secrets (NOT committed to git)
└── .env.example          ← Template
```

---

## Step 1 — Apollo API Key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API** (or visit [developer.apollo.io](https://developer.apollo.io))
3. Create a new API key
4. Paste it into `.env` as `APOLLO_API_KEY`

> **Plan note:** Phone number reveal (`reveal_phone_number: true`) requires at minimum Apollo's **Basic plan ($49/mo)**. The free plan only returns masked names and no phones. The workflow will run without error on a free plan but will produce 0 results because every lead will be filtered out for lacking a phone number.

---

## Step 2 — Google Sheets (Service Account)

A service account is the cleanest auth method for an automated cron job — no browser, no token refresh.

### 2a. Create a Google Cloud project and service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Google Sheets API"
4. Go to **IAM & Admin → Service Accounts** → Create Service Account
   - Name: `hvac-lead-gen` (or anything you like)
   - Role: not required at this level — click Continue
5. On the service account page, go to **Keys → Add Key → Create new key → JSON**
6. Download the JSON file and save it as:
   ```
   apollo-leads/credentials/google-service-account.json
   ```
   (This file is in `.gitignore` and will NOT be committed.)

### 2b. Share the spreadsheet with the service account

1. Open the JSON file and copy the `client_email` field (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet: [HVAC Leads - Southwest Michigan](https://docs.google.com/spreadsheets/d/1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI/edit)
3. Click **Share** and paste the service account email — give it **Editor** access

### 2c. Set the path in .env

```
GOOGLE_CREDENTIALS_PATH=./credentials/google-service-account.json
GOOGLE_SHEET_ID=1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI
```

---

## Step 3 — Optional Email Alerts

If Apollo fails or writes fail, the workflow logs the error. To also get an email:

```
ALERT_EMAIL_TO=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password   # Gmail App Password (not your login password)
```

To create a Gmail App Password:  
**Google Account → Security → 2-Step Verification → App Passwords**

Leave these blank to skip email and log-only.

---

## Step 4 — Verify Everything

```bash
node setup.js
```

Expected output:
```
  [1/3] Apollo API key... ✅  Apollo API key is valid and authenticated
  [2/3] Google Sheets connection... ✅  Connected to spreadsheet: "HVAC Leads - Southwest Michigan"
  [3/3] Ensuring spreadsheet headers... ✅  Headers look good

  ✅  All checks passed! You're ready to run:
      npm start          — starts the daily 7am scheduler
      npm run run-now    — run a batch immediately
```

---

## Running It

### Option A — Foreground (terminal stays open)

```bash
npm start
```

The process blocks the terminal and prints a log line when each 7am run fires. Press Ctrl+C to stop.

### Option B — Background with PM2 (recommended for servers)

```bash
npm install -g pm2
pm2 start index.js --name "hvac-leads"
pm2 save                         # survive reboots
pm2 logs hvac-leads              # watch the log
pm2 stop hvac-leads              # pause
pm2 restart hvac-leads           # restart
```

### Option C — System cron (Linux/macOS)

```
# crontab -e
0 7 * * * cd /path/to/apollo-leads && /usr/bin/node src/workflow.js >> logs/cron.log 2>&1
```

---

## Customizing

### Change target cities

Edit `src/config.js` → `apollo.targetLocations`:

```js
targetLocations: [
  'St. Joseph, Michigan',
  'Kalamazoo, Michigan',
  // add or remove any city
],
```

### Change industries

Edit `src/config.js` → `apollo.industryKeywords` and/or `naicsCodes`.

| NAICS | Industry |
|-------|----------|
| 2382  | Plumbing, Heating, Air-Conditioning Contractors |
| 2381  | Foundation, Structure, Building Exterior |
| 2389  | Other Specialty Trade Contractors |

### Change job titles

Edit `src/config.js` → `apollo.targetTitles`.

### Change leads-per-run

Set `MAX_LEADS_PER_RUN=25` in `.env` (or any number up to 100).

### Add a new spreadsheet column

1. Add the column header to `config.sheet.headers`
2. Add the mapping to `config.sheet.columns`
3. Update the row array in `src/sheets.js → appendLeads()`

---

## Sheet Layout

| Column | Header | Notes |
|--------|--------|-------|
| A | Date Added | Auto-filled by script |
| B | Business Name | Used for dedup check |
| C | Owner First Name | May be masked on free Apollo plan |
| D | Owner Last Name | May be masked on free Apollo plan |
| E | Phone Number | Mobile preferred over direct |
| F | City | From Apollo person location |
| G | Website | Company domain or URL |
| H | Called | Leave blank — fill in manually |
| I | Notes | Leave blank — fill in manually |

---

## Troubleshooting

**Apollo returns 0 leads with phones**
- Upgrade Apollo plan — free tier does not support `reveal_phone_number`
- Broaden location list or industry keywords in `config.js`
- Check API quota at apollo.io → Settings → API

**Google Sheets: 403 Forbidden**
- The service account email was not added as Editor to the spreadsheet
- Re-share the sheet with the `client_email` from your service account JSON

**Google Sheets: 404 Not Found**
- `GOOGLE_SHEET_ID` is wrong — copy the ID from the spreadsheet URL

**Cron not firing at 7am ET**
- Make sure `TZ=America/New_York` is set in `.env`
- Or verify your server's timezone: `date` and `timedatectl`

**Email alerts not arriving**
- Use a Gmail App Password (not your login password)
- Check spam folder
- Verify SMTP settings with a standalone test: `node -e "require('./src/notify').sendAlert({subject:'test',body:'hello'})"`
