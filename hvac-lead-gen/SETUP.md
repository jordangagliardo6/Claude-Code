# HVAC Lead Gen — Setup Guide

Automated Apollo.io → Google Sheets lead generation for Southwest Michigan HVAC companies.
Runs every morning at **7:00 AM Eastern** via node-cron. Adds up to 25 new leads per run.

---

## What You Need Before Starting

| Requirement | Notes |
|---|---|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **Apollo.io paid plan** | Free plan blocks the people-search endpoint. Upgrade at [apollo.io/pricing](https://www.apollo.io/pricing) |
| **Google Cloud project** | To create Sheets API credentials |
| **Google Sheet** | Your existing "HVAC SW Michigan Leads" sheet — ID already set in `.env.example` |

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Create Your `.env` File

```bash
cp .env.example .env
```

Then fill in the values:

### Apollo API Key

1. Log into [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Paste it as `APOLLO_API_KEY=` in `.env`

> **Plan note:** The people-search endpoint this script uses requires a **Basic plan ($49/mo)** or higher.
> On the Free plan the script will connect successfully but return a plan error when it searches.

### Google Sheets Credentials (Service Account — Recommended)

Service accounts are the cleanest approach for automation — no browser flow needed.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or pick an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"
4. Create a Service Account: IAM & Admin → Service Accounts → Create
5. Download the JSON key: click the account → Keys → Add Key → JSON
6. Save it as `google-credentials.json` in the `hvac-lead-gen/` folder
7. Open your Google Sheet and click **Share** → paste the service account email (it's in the JSON under `"client_email"`) → give **Editor** access

Set in `.env`:
```
GOOGLE_SERVICE_ACCOUNT_PATH=./google-credentials.json
GOOGLE_SHEET_ID=1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk
```

Your target sheet is already pre-filled — it's the "HVAC SW Michigan Leads" sheet created on July 13.

### Error Notification Email (Optional but Recommended)

If a run fails, the script logs the error to console. To also get an email:

1. Create a Gmail App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Select "Mail" + your device → Generate
   - Copy the 16-character password
2. Set in `.env`:
   ```
   SMTP_USER=your_gmail@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop
   NOTIFICATION_EMAIL=jgagliardo98@gmail.com
   ```

---

## Step 3 — Verify Connections (Do This First!)

```bash
node verify-connections.js
```

Expected output:
```
  Apollo.io  ... ✓ CONNECTED
    Account : your@email.com
    Plan    : basic
    Credits : 75 remaining

  Google Sheets ... ✓ CONNECTED
    Sheet ID : 1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk
    Headers  : Date Added | Business Name | Owner First Name | ...
```

Fix any errors before proceeding to Step 4.

---

## Step 4 — Test Run (Manual)

Run once immediately to confirm everything works end-to-end:

```bash
node lead-gen.js
```

Check your Google Sheet — new leads should appear within ~30 seconds.

---

## Step 5 — Start the Scheduler

```bash
node scheduler.js
```

This runs in the foreground and fires at **7:00 AM Eastern every day**.

### Keep It Running in the Background (Recommended)

Install PM2 for process management:

```bash
npm install -g pm2
pm2 start scheduler.js --name hvac-leads
pm2 save                   # persist across reboots
pm2 startup                # auto-start on server reboot (follow the printed command)
```

Useful PM2 commands:
```bash
pm2 logs hvac-leads        # view live logs
pm2 status                 # check if running
pm2 restart hvac-leads     # restart after editing .env
pm2 stop hvac-leads        # stop the scheduler
```

---

## Customizing the Search

Open `lead-gen.js` and edit the `CONFIG` block at the top:

```js
const CONFIG = {
  // Add or remove cities freely:
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    // ... add 'Grand Rapids, Michigan' etc.
  ],

  // Change the max leads per run:
  maxLeadsPerRun: 25,

  // Change target titles:
  ownerTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
};
```

No other files need to change.

---

## Spreadsheet Column Reference

The script writes to these columns in order:

| Col | Header | Source |
|---|---|---|
| A | Date Added | Today's date (auto) |
| B | Business Name | Apollo org name |
| C | Owner First Name | Apollo person first name |
| D | Owner Last Name | Apollo person last name |
| E | Phone Number | Mobile > Direct > Any |
| F | City | Apollo org city |
| G | Website | Apollo org website |
| H | Called | Blank — fill in manually |
| I | Notes | Blank — fill in manually |

---

## Troubleshooting

**"not included in your Free plan"**
→ Upgrade Apollo at [apollo.io/pricing](https://www.apollo.io/pricing) — the Basic plan ($49/mo) unlocks the people-search API.

**"GOOGLE_SERVICE_ACCOUNT_PATH" error**
→ Make sure `google-credentials.json` is in the `hvac-lead-gen/` folder and the service account email has Editor access to your sheet.

**Zero results from Apollo**
→ Check your API key is correct. Try running `node verify-connections.js` first.

**Duplicate leads showing up**
→ The script deduplicates by Business Name (column B). Make sure business names in the sheet exactly match what Apollo returns, or clean them manually.

**Scheduler not firing at 7am**
→ Confirm the server's timezone or verify PM2 is running: `pm2 status`.
