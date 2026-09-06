# Apollo Lead Generation — Setup Guide

Automated daily search of Apollo.io for SW Michigan HVAC company owners,
appended to your existing Google Sheet every morning at 7 AM Eastern.

---

## What You Need Before Starting

| Requirement | Details |
|---|---|
| **Apollo.io account** | Basic plan ($49/mo) or higher — Free plan blocks the people search API |
| **Apollo API key** | From [developer.apollo.io](https://developer.apollo.io) → API Keys |
| **Google Cloud project** | Free — needed to create OAuth credentials |
| **Node.js 18+** | Check with `node --version` |

**Apollo credit cost:** Each daily run enriches up to 25 leads = 25 credits/day (~750/month).
Basic plan includes 1,000 credits/month, so you'll be within limits.

---

## Step 1 — Install Dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Set Up Google OAuth Credentials

You only do this once. After setup, the scheduler runs automatically without any browser interaction.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Click "APIs & Services" → "Library"
   - Search "Google Sheets API" → Enable
4. Create OAuth 2.0 credentials:
   - Click "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: **Desktop app**
   - Name: `Apollo Lead Gen`
   - Click Create
5. Download the credentials:
   - Click the download icon (⬇) next to your new client ID
   - Save the file as `credentials.json`
   - Move it into the `credentials/` folder in this project
6. First-time authorization (opens your browser):
   ```bash
   npm run auth
   ```
   - Click "Allow" in the browser
   - Copy the authorization code from the browser
   - Paste it into the terminal when prompted
   - `credentials/token.json` is saved — this is what the scheduler uses

> **Note:** The `credentials/` folder is in `.gitignore` and will NOT be committed to git.

---

## Step 3 — Configure Your .env File

```bash
cp .env.example .env
```

Then open `.env` and fill in:

```env
APOLLO_API_KEY=your_key_here         # From developer.apollo.io → API Keys
GOOGLE_SHEET_ID=1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo  # Already set to your sheet
GOOGLE_SHEET_TAB=Sheet1              # The tab name in your spreadsheet
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
```

**Optional — email alerts on errors:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx       # Gmail App Password (not your login password)
```

To create a Gmail App Password:
1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Select "Mail" and "Mac" (or "Windows Computer")
3. Copy the 16-character password into SMTP_PASS

---

## Step 4 — Verify Both Connections

Run this before your first scheduled run:

```bash
npm run verify
```

Expected output:
```
[Apollo.io] ✓ Connected
  Plan: basic

[Google Sheets] ✓ Connected
  Existing entries: 25

✓ All systems connected. Safe to start the scheduler.
```

If Apollo shows ✗, check that your API key is correct and your plan supports API access.
If Google Sheets shows ✗, re-run `npm run auth`.

---

## Step 5 — Test Run (Writes to Your Sheet)

```bash
npm run test
```

This runs the full workflow immediately — it will add up to 25 new leads to your sheet.
Check your sheet afterward: [SW Michigan HVAC Leads](https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo/edit)

---

## Step 6 — Start the Scheduler

```bash
npm start
```

The process runs indefinitely and fires at **7:00 AM Eastern Time every day**.
Keep it running with a process manager so it survives restarts:

### Option A: PM2 (recommended, free)
```bash
npm install -g pm2
pm2 start index.js --name apollo-leads
pm2 save               # auto-restart on reboot
pm2 logs apollo-leads  # watch live output
```

### Option B: Simple background job
```bash
nohup npm start > lead-gen.log 2>&1 &
tail -f lead-gen.log   # watch output
```

### Option C: System cron (alternative to node-cron)
Run the script directly from cron instead of keeping a process alive:
```bash
crontab -e
# Add this line (adjust path to your project):
0 7 * * * cd /path/to/apollo-lead-gen && /usr/bin/node index.js --test >> /var/log/apollo-leads.log 2>&1
```
If using system cron, remove the `cron.schedule` call from `index.js` — it won't be needed.

---

## Customizing the Search

### Change cities (lib/apollo.js, line ~10)
```js
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  // Add or remove cities here
];
```

### Change industries (lib/apollo.js, line ~25)
```js
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Plumbing',
  // Add industry keywords here
];
```

### Change daily lead limit (.env)
```env
MAX_LEADS_PER_RUN=25   # Increase to 50 for more leads per day
```

### Change the spreadsheet
Update `GOOGLE_SHEET_ID` in `.env`. Run `npm run verify` after changing it.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to Apollo Basic plan at apollo.io/pricing |
| `credentials.json not found` | Download OAuth credentials from Google Cloud (Step 2) |
| `invalid_grant` on Sheets | Run `npm run auth` again — token expired |
| `0 results` from Apollo | Filters may be too narrow; check your API key and plan |
| `GOOGLE_SHEET_ID not set` | Make sure `.env` file exists (copy from `.env.example`) |
| Cron doesn't fire | Check system timezone; use `TZ=America/New_York node index.js` |
| No phone numbers | Apollo enrichment uses credits — verify plan credit balance |

---

## Your Existing Sheet

**SW Michigan HVAC Leads** already contains 25 leads (as of 2026-08-23).
The workflow will check this list before each run and skip any business already present.

Sheet URL: `https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo/edit`

Expected column layout:
| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |
