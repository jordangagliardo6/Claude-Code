# SW Michigan HVAC Lead Gen — First-Run Setup Guide

## What This Does

Every morning at 7 AM Eastern Time this script:
1. Searches Apollo.io for HVAC / plumbing / mechanical company owners in Southwest Michigan
2. Enriches contacts to reveal direct or mobile phone numbers
3. Deduplicates against your Google Sheet
4. Appends up to 25 new leads with: Date Added, Business Name, Owner First Name, Owner Last Name, Phone Number, City, Website

Your Google Sheet is already created and waiting:
**https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit**

---

## Step 1 — Apollo.io API Key

1. Go to https://developer.apollo.io → API Keys
2. Create a new API key
3. **You need a paid plan** — Basic ($49/mo) or higher unlocks People Search + Enrichment.
   The free plan only supports Enrichment with a known domain/email.
4. Copy the key into your `.env` file as `APOLLO_API_KEY`

---

## Step 2 — Google Service Account (for Google Sheets write access)

The script uses a **Google Service Account** for automated, unattended access to your sheet.
This is more reliable than OAuth for a scheduled cron job.

### 2a. Create the service account

1. Go to https://console.cloud.google.com/
2. Create a new project (or use an existing one), name it e.g. "lead-gen"
3. Navigate to **APIs & Services → Enable APIs**
   - Enable **Google Sheets API**
   - Enable **Google Drive API**
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
   - Name it `lead-gen-bot`
   - Skip optional roles for now → Done
5. Click the service account → **Keys tab → Add Key → JSON**
6. A `credentials.json` file downloads to your computer
7. Place that file in the `lead-gen/` folder (same folder as `index.js`)

### 2b. Share the spreadsheet with the service account

1. Open the downloaded `credentials.json`
2. Find the `client_email` field — it looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`
3. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit
4. Click **Share** → paste the service account email → grant **Editor** access → Send

---

## Step 3 — Install Dependencies

```bash
cd lead-gen
npm install
```

---

## Step 4 — Configure .env

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY` — your Apollo key from Step 1
- `GOOGLE_SPREADSHEET_ID` — already pre-filled as `1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus`
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` — `./credentials.json` (default, or the path you placed the file)
- `NOTIFY_EMAIL` + `GMAIL_APP_PASSWORD` — optional, for error alert emails

---

## Step 5 — Test Both Connections

```bash
node index.js --test
```

Expected output:
```
[Test] Checking environment variables...
  ✓ APOLLO_API_KEY is set
  ✓ GOOGLE_SPREADSHEET_ID is set
  ✓ GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set

[Test] Checking Google Sheets connection...
  ✓ Google Sheets connected — 0 existing row(s)

[Test] Checking Apollo.io API key...
  ✓ Apollo.io connected — API key is valid

[Test] All connections OK. You can now run: node index.js --run-now
```

Fix any errors before proceeding.

---

## Step 6 — First Live Run

```bash
node index.js --run-now
```

This runs the workflow immediately (bypasses the scheduler).
Check your Google Sheet after it completes — new leads should appear.

---

## Step 7 — Start the Scheduler

```bash
node index.js
```

The process stays running and fires every morning at 7 AM Eastern Time.
To run it in the background on a server:

```bash
# Using nohup (simplest)
nohup node index.js > lead-gen.log 2>&1 &

# Using PM2 (recommended for production)
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 save
pm2 startup  # makes it auto-start on reboot
```

---

## Customizing

### Change the cities searched
Edit `src/apollo.js` → `SW_MICHIGAN_CITIES` array.

### Change the industries searched
Edit `src/apollo.js` → `INDUSTRY_TAGS` and `HVAC_NAICS` arrays.
NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors.

### Change max leads per run
Edit `.env` → `MAX_LEADS_PER_RUN=25`

### Change the schedule
Edit `.env` → `CRON_SCHEDULE`
The scheduler uses Eastern Time natively. `0 7 * * *` = 7:00 AM ET every day.

### Add or remove spreadsheet columns
Edit `src/sheets.js` → `COLUMNS` array and the `appendLeads()` row mapping.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to Basic plan or higher |
| `Google Sheets failed: key file not found` | Check that `credentials.json` is in the `lead-gen/` folder |
| `permission_denied` from Google Sheets | Share the spreadsheet with the service account email |
| 0 results from Apollo | Try broadening the search — remove some city filters in `src/apollo.js` |
| Notification email not sending | Check `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env`; App Password ≠ account password |

---

## Error Notifications

If `NOTIFY_EMAIL` is set in `.env`, you get an email whenever:
- Apollo returns 0 results
- The Google Sheets write fails
- Any unhandled error occurs

To use Gmail: go to myaccount.google.com/apppasswords → generate a 16-char App Password.
Use **that** as `GMAIL_APP_PASSWORD`, not your Google account password.
