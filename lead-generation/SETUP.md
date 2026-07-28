# HVAC Lead Generator — First-Run Setup Guide

## What it does

Runs every morning at **7:00 AM Eastern** and pulls up to **25 HVAC leads** from Apollo.io for Southwest Michigan — St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, and South Haven. Results are appended to your Google Sheet with deduplication so you never see the same business twice.

---

## Step 1 — Install dependencies

```bash
cd lead-generation
npm install
```

---

## Step 2 — Set up your Apollo.io API key

1. Go to **app.apollo.io → Settings → Integrations → API**
2. Copy your API key
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Open `.env` and paste your key:
   ```
   APOLLO_API_KEY=your_actual_key_here
   ```

---

## Step 3 — Set up Google Sheets access (Service Account)

Apollo writes to **this spreadsheet** (already pre-configured in `.env.example`):  
`HVAC SW Michigan Leads` — ID: `1Ox2uM8KR-_Fe-CIFrkGRdXMLQFnASqXXSaVCrzzao2o`

To allow the script to write to it:

**3a. Create a Google Cloud project & service account**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "HVAC Lead Gen")
3. Navigate to **APIs & Services → Library**
4. Search for and enable: **Google Sheets API**
5. Go to **IAM & Admin → Service Accounts → Create Service Account**
6. Name it (e.g. "lead-gen-bot"), click **Done**
7. Click the service account → **Keys → Add Key → Create new key → JSON**
8. Save the downloaded JSON file as `credentials.json` in the `lead-generation/` folder

**3b. Share your spreadsheet with the service account**
1. Open the `credentials.json` file and copy the `client_email` value (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet → **Share** → paste that email → give **Editor** access

**3c. Confirm in .env**
```
GOOGLE_APPLICATION_CREDENTIALS=credentials.json
GOOGLE_SPREADSHEET_ID=1Ox2uM8KR-_Fe-CIFrkGRdXMLQFnASqXXSaVCrzzao2o
```

---

## Step 4 — (Optional) Email alerts on errors

If you want an email when something goes wrong, add to `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_gmail_app_password
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
```

For Gmail, use an **App Password** (not your regular password):  
myaccount.google.com → Security → 2-Step Verification → App Passwords

---

## Step 5 — Confirm both connections before the first run

```bash
npm run check
```

Expected output:
```
Checking Apollo.io connection...
  Apollo OK — API key valid. (Total matching people in DB: 12345)

Checking Google Sheets connection...
  Google Sheets OK — Connected to: "HVAC SW Michigan Leads"

All connections verified. The scheduler is ready to run.
```

If either check fails, the script tells you exactly what's wrong.

---

## Step 6 — Do a test pull right now

```bash
npm run run-now
```

This runs one immediate pull (up to 25 leads) and adds them to the sheet. Watch the console output to see each lead as it's added.

---

## Step 7 — Start the daily scheduler

```bash
npm start
```

The process stays running and fires at **7:00 AM Eastern** every day. To keep it running after you close your terminal, use PM2:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # Follow the printed command to auto-start on reboot
```

---

## Customization

All tweakable settings are in the `CONFIG` block at the top of `index.js`:

| Setting | What it controls |
|---|---|
| `cities` | Which Southwest Michigan cities to target |
| `jobTitles` | Which decision-maker titles to pull |
| `industryKeywords` | Industry filter keywords for Apollo |
| `employeeRange` | Company size filter (default: `'1,25'`) |
| `maxLeadsPerRun` | Max new leads per daily run (default: 25) |

Change them freely — no other code needs updating.

---

## Spreadsheet columns

| Column | Description |
|---|---|
| Date Added | Auto-filled with today's date |
| Business Name | Company name (used for dedup) |
| Owner First Name | Decision-maker first name |
| Owner Last Name | May be masked by Apollo until enriched |
| Phone Number | Mobile preferred, then direct line |
| City | City the business is located in |
| Website | Company website URL if available |
| Called | Leave blank — fill in manually after calling |
| Notes | Leave blank — your personal notes |
