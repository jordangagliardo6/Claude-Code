# HVAC Lead Gen — Apollo.io + Google Sheets

Pulls up to 25 HVAC owner-operator leads per day from Apollo.io and appends them to a
Google Sheet. Runs automatically at **7:00 AM Eastern Time** every day.

---

## What It Does Each Run

1. Searches Apollo.io for HVAC / plumbing / mechanical contacts in Michigan
2. Filters for owner-operated businesses (1–25 employees) and decision-maker titles
3. Post-filters to Southwest Michigan cities (St. Joseph, Benton Harbor, Kalamazoo, Holland,
   Grand Haven, Muskegon, South Haven, and surrounding townships)
4. Skips any business already in the sheet (deduplication by Business Name)
5. Appends up to 25 new rows with: Date Added, Business Name, Owner First/Last Name,
   Phone Number, City, Website, Called (blank), Notes (blank)
6. On failure: logs the error and emails you an alert (if SMTP is configured)

---

## First-Time Setup

### Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | [developer.apollo.io](https://developer.apollo.io) → API Keys |
| `GOOGLE_SHEET_ID` | From your sheet URL: `.../d/THIS_PART/edit` |
| `ALERT_EMAIL` | Your email for failure notifications |
| `SMTP_*` | Your Gmail + a 16-char [App Password](https://myaccount.google.com/apppasswords) |

### Step 3 — Create Google Cloud credentials

You need a **Google Service Account** with access to the Sheets API:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API** (APIs & Services → Enable APIs)
4. Go to **IAM & Admin → Service Accounts** → Create Service Account
5. Name it (e.g. `hvac-lead-gen`) → Create and Continue → Done
6. Click the service account → **Keys** tab → Add Key → JSON
7. Download the JSON file and save it as `credentials.json` in this folder

**Important:** Copy the `client_email` value from `credentials.json` (looks like
`hvac-lead-gen@your-project.iam.gserviceaccount.com`), then **share your Google Sheet**
with that email and give it **Editor** access.

### Step 4 — Create the Google Sheet

1. Create a new Google Sheet
2. Rename the default tab to **`Leads`**
3. Leave row 1 blank — the script writes headers automatically on first run
4. Copy the Sheet ID from the URL into your `.env`

### Step 5 — Run the setup check

```bash
npm run setup
```

This confirms both Apollo.io and Google Sheets are reachable before the first scheduled run.
Fix any errors it reports, then re-run until you see:

```
✓ All checks passed. You're ready to go!
```

### Step 6 — Test a single run

```bash
npm run run-now
```

Check your Google Sheet — new leads should appear within a few seconds.

### Step 7 — Start the daily scheduler

```bash
# Foreground (stops when you close the terminal):
npm start

# Background with pm2 (recommended for always-on):
npm install -g pm2
pm2 start scheduler.js --name hvac-lead-gen
pm2 save
pm2 startup    # auto-restart on reboot
```

---

## Customizing Targets

All targeting config is at the top of `index.js` — no logic changes needed.

**Change target cities** — edit the `TARGET_CITIES` Set:
```js
const TARGET_CITIES = new Set([
  'grand rapids', 'lansing', 'ann arbor', ...
]);
```

**Change industries** — edit `INDUSTRY_KEYWORDS`:
```js
const INDUSTRY_KEYWORDS = ['roofing', 'electrical', 'landscaping'];
```

**Change job titles** — edit `TARGET_TITLES`:
```js
const TARGET_TITLES = ['owner', 'president', 'ceo'];
```

**Change max leads per run** — edit `MAX_LEADS_PER_RUN`:
```js
const MAX_LEADS_PER_RUN = 50;
```

---

## Column Layout

| Col | Field | Filled by |
|---|---|---|
| A | Date Added | Script |
| B | Business Name | Script |
| C | Owner First Name | Script |
| D | Owner Last Name | Script |
| E | Phone Number | Script |
| F | City | Script |
| G | Website | Script |
| H | Called | You |
| I | Notes | You |

---

## Apollo Plan Notes

- **Free tier** — 50 enrichments/month; phone reveals may not be available
- **Basic ($49/mo)** — 1,000 enrichments/month; unlocks mobile/direct phone numbers
- **Professional** — Full phone reveal; needed for high-volume use

If personal phone numbers aren't showing up, the script falls back to the business
phone from the company record.

---

## Troubleshooting

**Apollo returns 0 results**
- Verify `APOLLO_API_KEY` is correct (run `npm run setup`)
- Check your Apollo credit balance at [app.apollo.io/#/settings/credits/usage](https://app.apollo.io)

**Google Sheets 403 error**
- Re-share the sheet with the service account email (Editor access)

**Google Sheets 404 error**
- Double-check `GOOGLE_SHEET_ID` in `.env`

**No "Leads" tab**
- Rename the sheet tab to `Leads` — the script reads from `Leads!A:I`

**Email alerts not sending**
- Make sure `SMTP_PASS` is a 16-char App Password, not your Google account password
- Enable 2-factor authentication on your Google account first (required for App Passwords)
