# HVAC Lead Gen — Apollo.io → Google Sheets

Automatically pulls HVAC decision-maker contact info from Apollo.io and appends it
to a Google Sheets spreadsheet every morning at 7:00 AM Eastern Time.

**What it pulls:**
- Business name, owner first/last name, direct/mobile phone, city, website URL
- Targets: Owner, President, Founder, Co-Founder, General Manager
- Industries: HVAC, Heating & Air, Plumbing, Mechanical Contracting
- Company size: 1–25 employees only (owner-operated)
- Cities: St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven (all MI)

**Output sheet columns:** Date Added · Business Name · Owner First Name · Owner Last Name · Phone Number · City · Website · Called · Notes

---

## First-Time Setup (do these once)

### Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

### Step 2 — Copy and fill in your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in four values:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | [developer.apollo.io](https://developer.apollo.io) → API Keys |
| `GOOGLE_SPREADSHEET_ID` | Copy the ID from your sheet URL (see below) |
| `NOTIFICATION_EMAIL` | Your email address for error alerts |
| `SMTP_USER` + `SMTP_PASS` | Gmail + [App Password](https://myaccount.google.com/security) |

**Getting the Spreadsheet ID:**
```
https://docs.google.com/spreadsheets/d/ → COPY THIS PART ← /edit
```

### Step 3 — Create your Google Sheet

Create a new spreadsheet. Name the first tab `Sheet1` (or update `SHEET_NAME` in `.env`).

Add these **exact headers** in row 1 (A through I):
```
A: Date Added
B: Business Name
C: Owner First Name
D: Owner Last Name
E: Phone Number
F: City
G: Website
H: Called
I: Notes
```

### Step 4 — Set up Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the JSON file and save it as `hvac-lead-gen/credentials.json`

### Step 5 — Authorize Google (one-time browser step)

```bash
node test-connection.js
```

The first time this runs, it will:
1. Print a Google authorization URL
2. You open the URL in your browser, log in, and grant access
3. Paste the authorization code back into the terminal
4. The token is saved to `token.json` — future runs are silent

After that, all three checks should pass:
```
Testing Apollo.io API...        ✓  Connected as "Your Name" (plan: basic)
Testing Google Sheets Auth...   ✓  Connected to "My Leads" → tab "Sheet1"
Testing Sheet Header Check...   ✓  Headers verified: Date Added | Business Name | ...
```

### Step 6 — Start the scheduler

```bash
node index.js
```

This keeps running in the background. Every morning at 7:00 AM ET it will:
1. Search Apollo for up to 25 HVAC leads across the 7 target cities
2. Skip any business already in your sheet (deduplication by business name)
3. Append new leads with today's date

**To run immediately** (useful for testing):
```bash
node run-now.js
```

---

## Running as a background service (optional)

To keep it running even after you close your terminal, use `pm2`:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save          # auto-restart on reboot
pm2 logs hvac-lead-gen   # view logs
```

---

## Customizing

All settings live in `config.js`:

```js
// Add or remove cities
targetCities: ['Holland, Michigan, United States', ...]

// Change job title priority
targetTitles: ['Owner', 'President', ...]

// Change the daily lead limit (default: 25)
maxLeadsPerRun: 25

// Change the schedule (7am ET = '0 7 * * *' with timezone 'America/New_York')
cronSchedule: '0 7 * * *'
```

---

## Troubleshooting

**Apollo returns 0 results**
- Check your API key is correct in `.env`
- Apollo free tier limits: 50 credits/month. Check [app.apollo.io/credits](https://app.apollo.io/credits)
- Phone numbers require "reveal" credits — if balance is 0, results return without phone numbers
- Try running `node run-now.js` with `per_page: 5` to confirm basic connectivity

**Google Sheets write fails**
- Delete `token.json` and re-run `node test-connection.js` to re-authorize
- Make sure the spreadsheet is not in a shared drive with restricted permissions
- Confirm the Sheets API is enabled in your Google Cloud project

**Email notifications not sending**
- Make sure you're using a Gmail **App Password**, not your regular Gmail password
- Enable 2-Step Verification first, then generate an App Password at:
  [myaccount.google.com/security](https://myaccount.google.com/security)
