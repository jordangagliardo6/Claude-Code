# Setup Guide — Apollo HVAC Lead Gen

## What This Does

Every morning at 7:00 AM Eastern, this script:
1. Searches Apollo.io for HVAC company owners in Southwest Michigan (1–25 employee businesses)
2. Enriches each result to get a direct or mobile phone number
3. Skips anyone already in your Google Sheet (by business name)
4. Appends up to 25 new leads with: Date Added, Business Name, Owner First Name, Owner Last Name, Phone Number, City, Website, Called (blank), Notes (blank)
5. Sends you an email alert if Apollo returns nothing or the sheet write fails

---

## Step 1 — Apollo API Key

1. Go to [developer.apollo.io](https://developer.apollo.io) → **API Keys**
2. Create a new key and copy it
3. You need at least the **Basic plan** ($49/mo) for the People Search + Enrichment endpoints
   - Free plan only allows limited enrichment — the people search (`/v1/mixed_people/search`) requires a paid tier

---

## Step 2 — Google Service Account (5 min)

This lets the script write to your sheet automatically without any browser login.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. **Enable APIs**: search for and enable:
   - **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `lead-gen-bot` (anything works)
   - Role: not required at the project level
5. Click the service account → **Keys → Add Key → JSON**
   - A `.json` file downloads to your computer
6. Copy that file into this project folder and rename it `google-service-account.json`
7. **Share your Google Sheet** with the service account email (it looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`) — give it **Editor** access

---

## Step 3 — Configure .env

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `APOLLO_API_KEY` — from Step 1
- `GOOGLE_SERVICE_ACCOUNT_KEY` — `./google-service-account.json` (or wherever you put the file)
- `GOOGLE_SHEET_ID` — already set to your SW Michigan sheet, change if needed
- `NOTIFY_EMAIL` — where error alerts go
- `SMTP_*` — optional, for email alerts. Use a [Gmail App Password](https://myaccount.google.com/apppasswords)

---

## Step 4 — Install Dependencies

```bash
npm install
```

---

## Step 5 — Test the Connection

Run this before the first scheduled run to confirm both APIs are working:

```bash
npm run test-run
```

This will:
- Build the Google Sheets client (confirms your key works)
- Read existing leads from the sheet (confirms sheet access)
- Search Apollo (confirms your API key works)
- Print leads it WOULD add — but writes nothing

Look for output like:
```
Existing leads in sheet: 0
Searching Apollo.io for SW Michigan HVAC owners...
Apollo returned 23 candidates
New candidates (not already in sheet): 23
  Enriching: Mike Smith @ Smith's Heating & Cooling
    ✓ Added: Smith's Heating & Cooling | 2695551234 | St. Joseph

[TEST RUN] Would have appended 18 rows:
  [ '8/7/2026', "Smith's Heating & Cooling", 'Mike', 'Smith', '2695551234', 'St. Joseph', ... ]
```

---

## Step 6 — Run for Real

```bash
npm start
```

On startup it immediately runs one cycle, then waits for 7 AM Eastern each day.

**Keep it running.** To run it as a persistent background service:

### Option A — pm2 (recommended)
```bash
npm install -g pm2
pm2 start apollo-lead-gen.js --name lead-gen
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```

### Option B — systemd (Linux servers)
Create `/etc/systemd/system/lead-gen.service`:
```ini
[Unit]
Description=Apollo HVAC Lead Gen
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/this/folder
ExecStart=/usr/bin/node apollo-lead-gen.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
Then: `sudo systemctl enable lead-gen && sudo systemctl start lead-gen`

---

## Customizing

**Change the target cities:**
Edit the `CITIES` array in `apollo-lead-gen.js` around line 22.

**Change max leads per run:**
Edit `MAX_LEADS` (default: 25).

**Change the schedule:**
Edit the cron string in the `cron.schedule()` call at the bottom of `apollo-lead-gen.js`.
The format is: `minute hour day-of-month month day-of-week`
- `0 7 * * *` = every day at 7:00 AM
- `0 9 * * 1-5` = weekdays only at 9:00 AM

**Change the target Google Sheet:**
Update `GOOGLE_SHEET_ID` in `.env`.

---

## Troubleshooting

| Problem | Likely Cause |
|---|---|
| `API_INACCESSIBLE` from Apollo | You're on the free plan — upgrade to Basic or higher |
| `Google service account key not found` | Wrong path in `GOOGLE_SERVICE_ACCOUNT_KEY` |
| `The caller does not have permission` (Sheets) | Share the sheet with the service account email |
| `Apollo returned zero results` | Try removing `organization_sic_codes` filter — Apollo coverage varies |
| No phone numbers found | Enrichment credits may be depleted — check Apollo dashboard |
