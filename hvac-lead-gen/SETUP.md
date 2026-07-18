# HVAC Lead Gen — Setup Guide

Automated daily lead pull for HVAC companies in Southwest Michigan.
Pulls up to 25 contacts from Apollo.io and appends them to a Google Sheet at 7:00 AM Eastern every day.

---

## What you need before starting

| Requirement | Where to get it |
|---|---|
| Node.js ≥ 18 | https://nodejs.org |
| Apollo.io API key | https://developer.apollo.io → API Keys |
| Google Cloud project with Sheets API enabled | https://console.cloud.google.com |
| Google Sheet with the right columns | See step 3 below |

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=your_google_sheet_id_here
NOTIFICATION_EMAIL=your@email.com
```

**Getting your Apollo API key:**
1. Log in at https://app.apollo.io
2. Go to Settings → Integrations → API
3. Copy your key (or create one if you haven't)
4. Note: Free tier = 50 people lookups/month. Basic ($49/mo) = 1,000/month. For 25 leads/day you'll want at least Basic.

**Getting your Google Sheet ID:**
Open your sheet. The URL looks like:
`https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_IS_HERE/edit`
Copy the long string between `/d/` and `/edit`.

---

## Step 3 — Create the Google Sheet

Create a new Google Sheet (or use an existing one).

The script will auto-create the header row on first run, but if you prefer to set it up manually, add these headers in row 1:

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

Leave columns H and I blank — the script fills A–G and leaves H/I empty for your manual tracking.

---

## Step 4 — Set up Google OAuth credentials

The script talks to Google Sheets using OAuth2 (not a service account), so it can write to your personal Google Sheet.

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one)
3. Enable **Google Sheets API** and **Google Drive API** (search in "Library")
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth 2.0 Client ID**
6. Application type: **Desktop app**
7. Name it anything (e.g. "HVAC Lead Gen")
8. Click **Download JSON**
9. Save the downloaded file as `hvac-lead-gen/credentials.json`

Also set up the OAuth consent screen:
- Go to **APIs & Services → OAuth consent screen**
- Choose **External** (unless you have a Google Workspace org)
- Fill in app name, support email, and developer email
- Add your email as a **Test user**
- Scopes: add `https://www.googleapis.com/auth/spreadsheets`

---

## Step 5 — Verify both connections

Run the verify command — this checks Apollo and Google without writing any data:

```bash
node index.js --verify
```

**First time only:** Google will print a URL to the terminal. Open it in your browser, approve the permissions, and paste the authorization code back. This creates `token.json` — future runs happen automatically.

You should see:
```
1. Checking Apollo.io...
   ✓ Apollo connected. Test search returned 1 result(s).
2. Checking Google Drive / Sheets...
   ✓ Google Sheets connected. Sheet has 0 existing businesses.

Both connections are healthy. Run `node index.js` to start the scheduler.
```

If you see errors, fix them before starting the scheduler (the error message tells you exactly what's wrong).

---

## Step 6 — Do a test run

Run once immediately and exit — no scheduler, just one real pull:

```bash
node index.js --test
```

Check your Google Sheet. You should see up to 25 new rows added.

---

## Step 7 — Start the scheduler

```bash
node index.js
```

This starts the cron job that fires every day at 7:00 AM Eastern.
It also runs once at startup so you can confirm it's working without waiting.

To run it persistently in the background (so it keeps going after you close your terminal), use PM2:

```bash
npm install -g pm2
pm2 start index.js --name "hvac-leads"
pm2 save
pm2 startup   # Follow the printed command to auto-start on system reboot
```

---

## Modifying the city list

Open `apollo.js` and find `SW_MICHIGAN_CITIES`. Add or remove city names:

```js
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  // Add more cities here
];
```

---

## Modifying which industries are targeted

Still in `apollo.js`, find the `payload` object inside `searchHvacLeads()`.
The `q_keywords` field controls what company keywords are matched:

```js
q_keywords: 'HVAC OR "heating and air" OR plumbing OR "mechanical contracting"',
```

Add more terms with `OR "your term here"`.

---

## Modifying the spreadsheet columns

Open `sheets.js`. The `COLUMNS` object at the top maps column names to letters.
The row array inside `appendLeads()` must stay in the same order as your sheet headers.

---

## Error log

If anything fails, the error is written to `hvac-lead-gen/error.log` with a timestamp.
Successful runs are logged to `hvac-lead-gen/run.log`.

---

## Email alerts (optional)

To receive an email when a run fails:
1. `npm install nodemailer`
2. Open `notify.js` and implement the `sendEmail()` call in `notifyError()`
3. Use Gmail OAuth or an SMTP relay (SendGrid, Mailgun, etc.)

The hook is already wired — just uncomment and fill in the implementation.
