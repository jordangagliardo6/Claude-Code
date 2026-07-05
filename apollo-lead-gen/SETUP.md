# Apollo HVAC Lead Gen — Setup & First-Run Guide

Automated daily lead generation: finds HVAC/plumbing business owners in
Southwest Michigan via Apollo.io, de-duplicates, and appends to Google Sheets.

---

## What You Need

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| Apollo.io account | Basic plan ($49/mo) recommended for phone access |
| Google account | For Google Sheets |
| Google Cloud project | Free — to create OAuth credentials |

---

## Step 1 — Install Dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the default tab to **Leads** (right-click the tab → Rename).
3. The workflow auto-creates headers on first run, so leave it blank.
4. Copy the Sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
                                        ^^^^^^^^^^^^^^^^^^^^^^
```

---

## Step 3 — Get Your Apollo.io API Key

1. Sign in at [app.apollo.io](https://app.apollo.io)
2. Click your name → **Settings** → **Integrations** → **API**
3. Copy your API key

> **Phone number access:** Apollo's free tier gives very limited phone reveals (~5/month).
> The Basic plan ($49/mo) gives 1,000 mobile exports/month — recommended for this workflow.

---

## Step 4 — Set Up Google OAuth Credentials

### 4a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project** → name it (e.g. `lead-gen`) → **Create**

### 4b. Enable Google Sheets API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Sheets API" → click it → **Enable**

### 4c. Create OAuth credentials

1. Go to **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**
2. If prompted, configure the OAuth consent screen first:
   - User type: **External** → fill in App name and your email → Save
3. Application type: **Desktop app** → name it → **Create**
4. Click **Download JSON** on the credentials that appear
5. Save the downloaded file as:

```
apollo-lead-gen/credentials/credentials.json
```

### 4d. Authorize the app

```bash
npm run setup-auth
```

This prints a URL. Open it in your browser, sign in, and paste the code back.
A `credentials/token.json` is saved — the scheduler uses this to write to your sheet.

---

## Step 5 — Configure Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=your_google_sheet_id_here

# Optional — email alerts on errors
NOTIFY_EMAIL=your_email@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password
```

For Gmail app passwords: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
(requires 2FA to be enabled on your Google account)

---

## Step 6 — Test the Connections

```bash
npm run test-connection
```

You should see:

```
[1/2] Testing Apollo.io connection...
  ✓ Apollo connected successfully
    Results on page 1 : 25
    Have phone number : 8
    Sample lead:
      Business : Kalamazoo Comfort Systems
      Contact  : John Smith
      Phone    : (269) 555-0100
      City     : Kalamazoo

[2/2] Testing Google Sheets connection...
  ✓ Google Sheets connected successfully
    Spreadsheet name : "HVAC Leads SW Michigan"
    Leads tab        : "Leads" (0 existing leads)

✓ All systems connected. You're ready to go!
```

If either test fails, follow the troubleshooting output before proceeding.

---

## Step 7 — Run It Once Manually

Before activating the daily schedule, do a test run:

```bash
node index.js --now
```

Check your Google Sheet — you should see new rows added to the **Leads** tab with
today's date, business names, contact info, and phone numbers.

---

## Step 8 — Start the Daily Scheduler

```bash
node index.js
```

Runs at **7:00 AM Eastern** every morning. Keep this terminal session running,
or use a process manager to keep it alive:

### With PM2 (recommended for always-on)

```bash
npm install -g pm2
pm2 start index.js --name "hvac-lead-gen"
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### With a system cron job (alternative)

If you prefer not to keep Node running 24/7, add this to your crontab (`crontab -e`):

```cron
0 7 * * * cd /path/to/apollo-lead-gen && /usr/local/bin/node index.js --now >> /var/log/lead-gen.log 2>&1
```

---

## Customizing the Workflow

All key settings live in `config.js`:

| Setting | What to change |
|---|---|
| `targetCities` | Add or remove SW Michigan cities |
| `apolloLocations` | Add city-level strings passed to Apollo's filter |
| `industries` | Add other trade industries (e.g. `"electrician"`) |
| `jobTitlePriority` | Change which titles are targeted and their order |
| `maxLeadsPerRun` | Increase/decrease the daily cap (default: 25) |
| `cronSchedule` | Change the daily run time (cron format) |
| `sheetTab` | Name of the Google Sheet tab to write to |

---

## Google Sheet Column Reference

The workflow writes these columns in order (A through I):

| Column | Field | Notes |
|---|---|---|
| A | Date Added | Auto-filled |
| B | Business Name | Used for duplicate detection |
| C | Owner First Name | From Apollo |
| D | Owner Last Name | From Apollo |
| E | Phone Number | Mobile preferred over direct |
| F | City | From Apollo person or company profile |
| G | Website | Company domain from Apollo |
| H | Called | Leave blank — fill in manually |
| I | Notes | Leave blank — for your own notes |

---

## Error Handling

- All errors print to the console with a clear code and message
- Errors are appended to `error.log` in the project folder
- If `NOTIFY_EMAIL` + SMTP settings are configured, errors also trigger an email

Common error codes:

| Code | Meaning |
|---|---|
| `NO_RESULTS` | Apollo returned no leads with phones — check plan credits |
| `RUN_ERROR` | Unexpected failure — check the message for details |

---

## Apollo Plan Notes

| Plan | Monthly Phone Credits | Cost |
|---|---|---|
| Free | ~5 mobile exports | $0 |
| Basic | 1,000 mobile exports | $49/mo |
| Professional | Unlimited | $99/mo |

At 25 leads/day × 22 weekdays = ~550 leads/month → **Basic plan is sufficient**.
