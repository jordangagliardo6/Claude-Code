# Apollo Lead Gen — Setup Guide

Automated daily HVAC lead generation: Apollo.io → Google Sheets.  
Runs at **7:00 AM Eastern** every morning. Pulls up to **25 new leads per run**.

---

## What You'll Need

| Thing | Where to get it |
|---|---|
| Apollo.io account | [apollo.io](https://app.apollo.io) — free tier works for testing |
| Apollo API key | Apollo → Settings → Integrations → API |
| Google account | Already have one |
| Google Cloud project | [console.cloud.google.com](https://console.cloud.google.com) — free |
| Node.js 18+ | [nodejs.org](https://nodejs.org) |

---

## Step 1 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name the first tab exactly **Leads** (case-sensitive).
3. Add these column headers in **Row 1**, columns A through I:

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

4. Copy the spreadsheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/   THIS_PART_HERE   /edit
                                           ↑ copy this ↑
```

---

## Step 2 — Set Up Google Cloud Credentials

Choose **one** of the two auth methods below. Service Account is simpler for automation.

### Option A — Service Account (recommended)

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API**:
   - Search bar → "Google Sheets API" → Enable
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**.
5. Give it a name (e.g. `apollo-lead-gen`), click through, and hit **Done**.
6. Click the service account email address you just created.
7. Go to the **Keys** tab → **Add Key → Create new key → JSON**. Download the file.
8. Save the downloaded file as:
   ```
   apollo-lead-gen/credentials/service-account.json
   ```
9. **Share your Google Sheet** with the service account's email address  
   (it looks like `name@project-id.iam.gserviceaccount.com`).  
   Give it **Editor** access.

### Option B — OAuth2 (personal Google account)

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Google Sheets API** (same as above).
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Application type: **Desktop app**. Name it anything.
5. Download the JSON file. Save it as:
   ```
   apollo-lead-gen/credentials/oauth2-client.json
   ```
6. Update `.env`:
   ```
   GOOGLE_AUTH_METHOD=oauth2
   GOOGLE_CREDENTIALS_FILE=./credentials/oauth2-client.json
   ```
7. Run the one-time browser authorization (see Step 4 below).

---

## Step 3 — Configure Environment Variables

```bash
cd apollo-lead-gen
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here

GOOGLE_SPREADSHEET_ID=your_sheet_id_from_step_1
GOOGLE_SHEET_TAB=Leads

# If using Service Account (Option A):
GOOGLE_AUTH_METHOD=service_account
GOOGLE_CREDENTIALS_FILE=./credentials/service-account.json

# If using OAuth2 (Option B):
# GOOGLE_AUTH_METHOD=oauth2
# GOOGLE_CREDENTIALS_FILE=./credentials/oauth2-client.json

# Error notification email (optional)
NOTIFY_EMAIL=jgagliardo98@gmail.com
```

---

## Step 4 — Install Dependencies

```bash
cd apollo-lead-gen
npm install
```

**If you chose OAuth2:** complete the one-time browser auth flow now:

```bash
npm run auth
```

This opens a URL in your browser. After clicking Allow, paste the code back into
the terminal. A `token.json` file is saved — you never need to do this again.

---

## Step 5 — Test Both Connections

Before scheduling anything, verify both APIs are working:

```bash
npm run test-connection
```

You should see:

```
── Environment Variables ──────────────────────────────────────
  ✅  APOLLO_API_KEY: abc123…xyz9
  ✅  GOOGLE_SPREADSHEET_ID: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
  ...

── Apollo.io API ──────────────────────────────────────────────
  ✅  Connected. Test search returned 47 total results.

── Google Sheets / Drive ──────────────────────────────────────
  ✅  Connected. Successfully read from spreadsheet.

✅  All checks passed! You are ready to run.
```

If any check fails, the error message tells you exactly what to fix.

---

## Step 6 — First Run

Run once immediately to confirm everything works end-to-end:

```bash
npm run run-once
```

Check your Google Sheet — you should see new rows appearing in the **Leads** tab.

---

## Step 7 — Start the Scheduler

```bash
npm start
```

This starts the process and schedules it to run every morning at **7:00 AM Eastern**.
Keep this terminal session open (or run it in the background with `pm2` — see below).

**To run in the background with pm2:**

```bash
npm install -g pm2
pm2 start src/index.js --name apollo-lead-gen
pm2 save                         # persist across reboots
pm2 startup                      # auto-start on system boot (follow printed instructions)
```

**To check pm2 status and logs:**

```bash
pm2 status
pm2 logs apollo-lead-gen
```

---

## Customizing City List or Filters

Open `src/config.js` — everything you'd want to change is at the top:

```js
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  // Add or remove cities here
];

const MAX_LEADS_PER_RUN = 25;  // Change this to pull more/fewer per day

const JOB_TITLES = ['Owner', 'President', 'Founder', ...];
const EMPLOYEE_RANGES = ['1,10', '11,25'];  // 1–25 employees
const INDUSTRY_KEYWORDS = ['HVAC', 'Plumbing', ...];
```

No other files need to change when you update these.

---

## Adding Sheet Columns

To add or rename columns, do both of these:

1. Edit `SHEET_COLUMNS` in `src/config.js` — this controls the header row the
   script writes.
2. Edit the `appendLeads()` method in `src/sheets.js` — add the new field to
   the `rows.map(...)` array in matching order.

---

## Error Notifications

Errors are always printed to the console. To also receive email alerts:

1. Set `NOTIFY_EMAIL`, `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` in your `.env`.
2. Install nodemailer: `npm install nodemailer`

For Gmail, use an **App Password** (not your regular password):
Google Account → Security → 2-Step Verification → App Passwords.

---

## Troubleshooting

**Apollo returns 0 results**
- Check your API key in `.env`
- Verify your Apollo plan has search credits remaining
- Try broadening the industry keywords in `src/config.js`
- Apollo's free tier limits search results — upgrade if needed

**Google Sheets 403 error**
- If using Service Account: did you share the sheet with the service account email?
- If using OAuth2: run `npm run auth` again to refresh your token

**Google Sheets 404 error**
- Double-check `GOOGLE_SPREADSHEET_ID` in `.env`

**"Tab not found" error**
- Make sure your sheet tab is named exactly **Leads** (or update `GOOGLE_SHEET_TAB` in `.env`)

**Phone numbers empty**
- Apollo's free tier may not reveal phone numbers. Upgrade to Basic ($49/mo) or
  Professional for direct phone access. The script will skip contacts with no phone
  and log the count of contacts found vs. leads written.

**Process exits after `npm start`**
- This means it started successfully but your terminal session closed. Use pm2
  (see Step 7) to keep it running in the background.
