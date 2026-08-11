# HVAC Lead Gen — First-Run Setup

Automated lead generation for Southwest Michigan HVAC owner-operators.
Pulls up to 25 new leads per day from Apollo.io and appends them to your Google Sheet.

---

## What You'll Need

| Requirement | Notes |
|-------------|-------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| Apollo Basic plan | Free plan blocks People Search — upgrade at [apollo.io/pricing](https://www.apollo.io/pricing) |
| Google Cloud project | Free tier is sufficient |

---

## Step 1 — Get Your Apollo API Key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

> The People Search + Phone Reveal endpoints require **Apollo Basic** or higher.
> The free plan returns an `API_INACCESSIBLE` error.

---

## Step 2 — Set Up Google Service Account

This lets the script write to your spreadsheet without needing a browser login.

### 2a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project** — name it `hvac-lead-gen` (or anything)
3. Click **Create**

### 2b. Enable the Google Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API**
3. Click it → **Enable**

### 2c. Create a service account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Fill in a name (e.g. `lead-gen-bot`) → **Create and Continue → Done**
4. Click the service account you just created
5. Go to the **Keys** tab → **Add Key → Create new key → JSON → Create**
6. A `credentials.json` file downloads to your computer

### 2d. Place the credentials file

Move `credentials.json` into the `lead-gen/` folder (next to `index.js`).

### 2e. Share your spreadsheet with the service account

1. Open `credentials.json` and copy the value of `"client_email"` — it looks like:
   `lead-gen-bot@your-project.iam.gserviceaccount.com`
2. Open your Google Sheet:
   [HVAC Leads - Southwest Michigan](https://docs.google.com/spreadsheets/d/1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI/edit)
3. Click **Share** → paste the service account email → set role to **Editor** → **Send**

---

## Step 3 — Configure Your Environment

```bash
cd lead-gen
cp .env.example .env
```

Open `.env` and fill in:
- `APOLLO_API_KEY` — from Step 1
- `SPREADSHEET_ID` — already pre-filled with your existing sheet
- `GOOGLE_CREDENTIALS_PATH` — leave as `./credentials.json` if you placed it there

---

## Step 4 — Install Dependencies

```bash
cd lead-gen
npm install
```

---

## Step 5 — Test the Connection (Do This Before Starting)

```bash
node test-connection.js
```

You should see:

```
══════════════════════════════════════
  HVAC Lead Gen — Connection Test
══════════════════════════════════════

① Checking environment variables...
  ✓ All required env vars present

② Testing Apollo.io API key...
  ✓ Apollo API key is valid
  ✓ Logged in as: you@example.com

③ Testing Google Sheets access...
  ✓ Connected to spreadsheet: "HVAC Leads - Southwest Michigan"
  ✓ URL: https://docs.google.com/spreadsheets/d/...

══════════════════════════════════════
  ✓ All checks passed — ready to run!
══════════════════════════════════════
```

If any check fails, fix it before proceeding.

---

## Step 6 — Start the Scheduler

```bash
npm start
```

The scheduler prints confirmation and waits for 7:00 AM Eastern each morning.

**To keep it running after you close your terminal**, use `pm2`:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

Monitor logs: `pm2 logs hvac-lead-gen`

---

## What Happens Each Morning at 7 AM

1. Searches Apollo for HVAC owners/presidents in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, and South Haven (1–25 employee companies)
2. Enriches contacts to reveal phone numbers (costs ~1 Apollo credit per contact)
3. Checks your sheet for duplicates by Business Name
4. Appends up to 25 new rows with: Date Added, Business Name, First Name, Last Name, Phone, City, Website
5. Logs results to the console

---

## Customizing

All settings are in **`config.js`** — no need to touch the other files:

| What to change | Where in config.js |
|----------------|-------------------|
| Cities to target | `cities` array |
| Max leads per run | `apollo.maxLeadsPerRun` |
| Job title priority | `apollo.jobTitles` array |
| Industries | `apollo.keywordTags` + `apollo.sicCodes` |
| Run time | `schedule` (cron format) + `timezone` |
| Column layout | `sheets.columns` array |

---

## Error Handling

Errors are logged to the console with a clear message. To also receive email alerts:

1. Add `npm install nodemailer` to your dependencies
2. Fill in the `SMTP_*` variables in `.env`
3. Uncomment the `nodemailer` block in `notify.js`

---

## Your Target Spreadsheet

[HVAC Leads - Southwest Michigan](https://docs.google.com/spreadsheets/d/1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI/edit)

Column layout: `Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes`
