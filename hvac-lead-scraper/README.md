# HVAC Lead Scraper

Automated daily lead generation for HVAC companies in Southwest Michigan.
Searches Apollo.io for owner/decision-maker contacts, deduplicates against your
existing Google Sheet, and appends up to 25 new leads every morning at 7 AM ET.

---

## What It Does

1. **Searches Apollo.io** for HVAC, plumbing, and mechanical contracting
   companies with 1–25 employees in Southwest Michigan (St. Joseph, Benton Harbor,
   Kalamazoo, Holland, Grand Haven, Muskegon, South Haven).
2. **Targets decision-makers** by job title: Owner → President → Founder →
   Co-Founder → General Manager.
3. **Extracts**: Business Name, Owner First & Last Name, Phone (mobile preferred),
   City, Website URL.
4. **Deduplicates** by Business Name before writing — never adds the same company twice.
5. **Appends up to 25 leads** to your Google Sheet, columns:
   `Date Added | Business Name | Owner First Name | Owner Last Name |
   Phone Number | City | Website | Called | Notes`
6. **Runs daily at 7 AM ET** via `node-cron`.
7. **Alerts you** via console log (+ optional email) if Apollo fails or the
   Sheet write fails.

---

## Prerequisites

| Requirement | Where to Get |
|---|---|
| **Node.js 18+** | https://nodejs.org |
| **Apollo.io API key** | developer.apollo.io → API Keys (Basic plan $49/mo recommended) |
| **Google Cloud project** with Sheets API enabled | console.cloud.google.com |
| **Google OAuth2 credentials** (Desktop app type) | Cloud Console → APIs & Services → Credentials |
| **A Google Sheet** with the column headers (see below) | sheets.google.com |

### Apollo.io Plan Note
- Free tier: 50 enrichments/month — not enough for daily runs
- Basic ($49/mo): 1,000/month — supports ~33 runs of 25 leads
- Professional ($99/mo): 5,000/month — recommended for sustained use

---

## Setup (10 minutes)

### Step 1 — Clone and Install

```bash
cd hvac-lead-scraper
npm install
```

### Step 2 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name the first tab `Sheet1` (or update `GOOGLE_SHEET_TAB` in `.env`).
3. Add these headers in row 1, columns A–I:
   ```
   Date Added | Business Name | Owner First Name | Owner Last Name |
   Phone Number | City | Website | Called | Notes
   ```
4. Copy the **Sheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_IS_THE_ID**/edit`

### Step 3 — Get Google OAuth2 Credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API**.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs**.
5. Application type: **Desktop app**.
6. Download the credentials — you'll need `client_id` and `client_secret`.

### Step 4 — Configure .env

```bash
cp .env.example .env
```

Edit `.env` and fill in:
```
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SHEET_TAB=Sheet1
```

### Step 5 — Authorize Google Sheets (one time only)

```bash
npm run setup
```

The setup script will:
- Print a Google authorization URL → open it in your browser
- Ask you to paste the authorization code → auto-saves it to `.env`
- Test the Apollo.io connection (shows a sample lead)
- Test the Google Sheets connection (shows existing row count)
- Confirm everything is ready

### Step 6 — Start the Scraper

```bash
node index.js
```

The process stays running and fires automatically at 7 AM ET daily.
To run it as a background service, use `pm2`:

```bash
npm install -g pm2
pm2 start index.js --name hvac-scraper
pm2 save
pm2 startup   # auto-start on reboot
```

---

## Running Once Immediately (Testing)

Open `index.js` and uncomment the last line:

```js
// runScraper();   ← remove the //
```

Then run `node index.js`. Comment it back out after testing.

---

## Customizing

All configuration is in **`config.js`**. Common changes:

| What to change | Where |
|---|---|
| Add/remove target cities | `config.targetCities` |
| Change max leads per run | `config.maxLeadsPerRun` |
| Add Apollo industry tag IDs | `config.industryTagIds` |
| Change run time | `config.cronSchedule` |
| Reorder spreadsheet columns | `config.columns` |

### How to Find Apollo Industry Tag IDs

1. Log into Apollo.io → People Search
2. Add an Industry filter (e.g. "HVAC")
3. Open Chrome DevTools → Network tab
4. Run the search and find the `/mixed_people/search` request
5. In the request payload, look for `organization_industry_tag_ids`
6. Copy those IDs into `config.industryTagIds`

---

## Error Notifications

Errors always log to `console.error`. For email alerts:

```env
ALERT_EMAIL_TO=you@example.com
ALERT_EMAIL_FROM=yourgmail@gmail.com
ALERT_EMAIL_PASSWORD=your_16_char_app_password
```

Gmail requires an [App Password](https://myaccount.google.com/apppasswords)
(not your regular Gmail password). Enable 2FA first.

---

## File Structure

```
hvac-lead-scraper/
  index.js         ← Main entry point + cron scheduler
  config.js        ← All configurable settings (edit this)
  apollo.js        ← Apollo.io API search logic
  sheets.js        ← Google Sheets read/append logic
  auth.js          ← Google OAuth2 client setup
  notify.js        ← Console + email error alerts
  setup-check.js   ← First-run setup wizard (npm run setup)
  package.json
  .env.example     ← Copy to .env and fill in
  README.md
```
