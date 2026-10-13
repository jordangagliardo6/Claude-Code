# HVAC Lead Scraper

Runs every morning at **7 AM Eastern Time**, searches Apollo.io for HVAC / plumbing / mechanical company owners in Southwest Michigan, deduplicates against the master Google Sheet, and appends up to 25 new leads.

Target spreadsheet: **HVAC Leads — SW Michigan (Master)**
(`1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8`)

---

## Quick Start (First Run)

### 1. Install dependencies

```bash
cd hvac-lead-scraper
npm install
```

### 2. Copy and fill in your credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `APOLLO_API_KEY` — from https://developer.apollo.io → API Keys
- `GOOGLE_SPREADSHEET_ID` — already pre-filled with your master sheet ID
- `GOOGLE_CREDENTIALS_PATH` — path to your service account JSON (see below)

### 3. Set Up Google Credentials (5 minutes)

The scraper needs a **service account** to write to Google Sheets without
a browser login — ideal for scheduled/unattended jobs.

1. Go to https://console.cloud.google.com
2. Create a project (or select an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"
4. Create a Service Account: IAM & Admin → Service Accounts → Create
5. Give it the **Editor** role
6. Create a key: click the service account → Keys tab → Add Key → JSON
7. Download the JSON file, save it as `google-credentials.json` in this folder
8. **Share your Google Sheet** with the service account's email address
   (it looks like `name@project.iam.gserviceaccount.com`) with **Editor** access

### 4. Verify connections

```bash
node index.js --verify
```

This checks that both Apollo and Google Sheets are reachable and prints
the sheet's current header row without writing anything.

### 5. Test run

```bash
node index.js --now
```

Runs the full workflow once immediately. Check your Google Sheet — up to 25
new leads should appear at the bottom.

### 6. Start the daily scheduler

```bash
node index.js
```

The process stays running and fires at 7 AM Eastern every day.
Use a process manager like `pm2` to keep it alive across reboots:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed instructions to start on boot
```

---

## Customizing

All search parameters live in **`config.js`** — no need to touch `index.js`:

| What to change | Where in config.js |
|---|---|
| Add/remove cities | `targetCities` array |
| Change industry keywords | `industryKeywords` array |
| Change job title priority | `targetTitles` array |
| Adjust company size range | `employeeRanges` array |
| Change leads per run | `MAX_LEADS_PER_RUN` in `.env` |

---

## How Deduplication Works

Before writing, the scraper reads **column B** (Business Name) from the sheet
and builds a case-insensitive Set. Any Apollo result whose company name already
exists in that set is silently skipped.

---

## Column Order

| Column | Field | Notes |
|---|---|---|
| A | Date Added | YYYY-MM-DD, auto-set |
| B | Business Name | from Apollo org |
| C | Owner First Name | from Apollo person |
| D | Owner Last Name | may be masked on free plan |
| E | Phone Number | mobile preferred > direct > any |
| F | City | from Apollo person location |
| G | Website | from Apollo org |
| H | Called | **left blank** — fill in manually |
| I | Notes | **left blank** — fill in manually |

---

## Error Handling

Errors are always written to `error.log` next to this script and printed to
stderr. To also receive email alerts, add these to `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_gmail_app_password
NOTIFICATION_EMAIL=your@gmail.com
```

Gmail requires a [16-character App Password](https://myaccount.google.com/apppasswords)
(not your regular password). App Passwords require 2FA to be enabled.

---

## Apollo Plan Notes

- **Free tier:** 50 enrichments/month. The scraper tries to avoid enrichment
  calls when phone numbers are already in search results.
- **Basic ($49/mo):** 1,000 enrichments/month — recommended for daily runs.
- If Apollo blocks the People Search endpoint, upgrade at:
  https://app.apollo.io/#/settings/plans/upgrade
