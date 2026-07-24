# HVAC Lead Gen — Setup Guide

Automated daily lead generation: Apollo.io → Google Sheets, 7am Eastern.

---

## What you need before starting

| Account | Where to get it | Cost |
|---|---|---|
| Apollo.io API key | [developer.apollo.io](https://developer.apollo.io) → API Keys | Free (50 req/mo) or Basic $49/mo |
| Google Cloud project | [console.cloud.google.com](https://console.cloud.google.com) | Free |
| Node.js ≥ 18 | [nodejs.org](https://nodejs.org) | Free |

---

## Step 1 — Create your Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it anything you like (e.g. **HVAC Leads SW Michigan**).
3. The script creates the header row automatically on first run — you don't need to add it.
4. Copy the spreadsheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/**THIS_IS_THE_ID**/edit`

---

## Step 2 — Create a Google Service Account

A service account lets the script write to Sheets without a browser login — essential for automated cron jobs.

1. Open [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → Enable APIs** → search for **Google Sheets API** → Enable it
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
   - Name: `hvac-lead-gen` (or anything)
   - Click **Done** (no roles needed at project level)
5. Click the service account you just created → **Keys** tab → **Add Key → JSON**
6. A `.json` file downloads — keep it safe, you'll need it in Step 4
7. Copy the `client_email` value from the JSON file (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
8. **Share your Google Spreadsheet** with that email address — give it **Editor** access

---

## Step 3 — Get your Apollo.io API key

1. Go to [developer.apollo.io](https://developer.apollo.io)
2. Log in → **API Keys** → copy your key
3. Free tier: 50 enrichments/month  
   Basic ($49/mo): 1,000/month — sufficient for 25 leads/day × 30 days

---

## Step 4 — Configure environment variables

```bash
cd hvac-lead-gen
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_key_here
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY=/full/path/to/service-account-key.json
```

Optional — enable email alerts on failure:

```
NOTIFY_EMAIL=jgagliardo98@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password
GMAIL_FROM=jgagliardo98@gmail.com
```

Generate a Gmail app password at: https://myaccount.google.com/apppasswords  
(Use "Mail" as the app. This is different from your Gmail login password.)

---

## Step 5 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 6 — Verify connections (do this first!)

```bash
node verify.js
```

Expected output:
```
[✓] All required environment variables are present.
[✓] Apollo connected. Found 1,234 matching records in database.
[✓] Google Sheets connected. Spreadsheet: "HVAC Leads SW Michigan"

All checks passed!
```

If any check fails, the verify output explains exactly what to fix.

---

## Step 7 — Run it once manually to confirm

```bash
node index.js --run-now
```

Watch the output — it will show each step:
1. Reading existing sheet (0 businesses on first run)
2. Searching Apollo (shows page-by-page progress)
3. Deduplication count
4. Writing rows to your sheet

Then open your Google Sheet and confirm leads appeared with the correct columns.

---

## Step 8 — Start the daily scheduler

```bash
node index.js
```

The script stays running and fires at 7:00 AM Eastern every morning.  
To keep it running after you close your terminal, use a process manager:

**Using PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

**Using nohup (simple):**
```bash
nohup node index.js > lead-gen.log 2>&1 &
```

---

## Customizing the search

All targeting config is at the top of `src/apollo.js`:

```js
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  // add or remove cities here
];

const TARGET_INDUSTRIES = [
  'hvac',
  'plumbing',
  // add keywords here
];

const TARGET_TITLES = [
  'owner',
  'president',
  // add titles here
];
```

Change `MAX_LEADS_PER_RUN` in `.env` to pull more or fewer leads per morning.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Apollo returns 0 leads | Try broadening `organization_locations` to just `Michigan, United States` in apollo.js |
| Google Sheets 403 error | Share your spreadsheet with the service account's `client_email` (Editor access) |
| Google Sheets 404 error | Re-check `GOOGLE_SHEET_ID` — copy it from the URL again |
| Apollo 401 error | Re-check `APOLLO_API_KEY` |
| Email alerts not sending | Confirm you're using a Gmail **App Password**, not your login password |
| Phone numbers missing | Set `APOLLO_ENRICH_CONTACTS=true` in `.env` (uses Apollo credits) |

Errors are always logged locally to `errors.log` in the `hvac-lead-gen/` folder, even if email is not configured.
