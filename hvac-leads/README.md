# HVAC Lead Generator

Searches Apollo.io for HVAC owner-operators in Southwest Michigan and appends new
leads to a Google Sheets spreadsheet every morning at 7 AM Eastern. Skips duplicates
automatically and sends an email alert if anything goes wrong.

---

## What Gets Added to the Sheet

| Column | Contents |
|--------|----------|
| Date Added | Today's date (MM/DD/YYYY) |
| Business Name | HVAC company name |
| Owner First Name | Owner / president / founder first name |
| Owner Last Name | Last name |
| Phone Number | Mobile preferred, then direct line |
| City | City in Southwest Michigan |
| Website | Company website hostname |
| Called | **Blank — you fill this in** |
| Notes | **Blank — you fill this in** |

---

## Prerequisites

- **Node.js 18+** — check with `node -v`
- **Apollo.io account** — Free tier works for search; Basic plan (~$49/mo) required for phone number reveal
- **Google Cloud project** with Sheets API enabled (free, takes ~5 minutes to set up)

---

## Step 1 — Clone and install

```bash
cd hvac-leads
npm install
```

---

## Step 2 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name the first tab **Leads** (or whatever you put in `GOOGLE_SHEETS_TAB_NAME`).
3. Leave row 1 blank — the script writes the headers automatically on first run.
4. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   ```

---

## Step 3 — Set up Google Sheets API (Service Account)

A Service Account lets the script write to your sheet without any interactive
login prompt — perfect for a cron job.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create
   a project (or select an existing one).

2. Enable the **Google Sheets API**:
   - Search "Sheets API" in the top bar → click **Enable**.

3. Create a **Service Account**:
   - Go to **IAM & Admin → Service Accounts → Create Service Account**.
   - Name it something like `hvac-lead-writer`.
   - Click **Create and Continue** → skip the optional role step → **Done**.

4. Create a **key** for the service account:
   - Click the service account you just created.
   - Go to the **Keys** tab → **Add Key → Create new key → JSON**.
   - A `.json` file downloads to your computer.

5. **Rename that file to `google-credentials.json`** and place it in this `hvac-leads/` folder.

6. **Share your spreadsheet with the service account**:
   - Open the `.json` file and copy the `client_email` value (looks like
     `hvac-lead-writer@your-project.iam.gserviceaccount.com`).
   - In Google Sheets, click **Share** → paste that email → set role to **Editor** → **Send**.

> ⚠️ Never commit `google-credentials.json` to git. It is in `.gitignore` by default.

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEETS_TAB_NAME=Leads
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-credentials.json
MAX_LEADS_PER_RUN=25

# Optional — remove these lines if you don't want email alerts
NOTIFY_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=your_gmail@gmail.com
```

**Getting your Apollo API key:**
- Log into Apollo → Settings → Integrations → API → copy your key.
- Docs: [developer.apollo.io](https://developer.apollo.io)

**Gmail App Password (for email alerts):**
- Requires 2FA on your Google account.
- Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
- Create an app password for "Mail" and paste it as `SMTP_PASS`.

---

## Step 5 — Test the connection

Run this before starting the scheduler:

```bash
npm run test-connection
```

You should see:
```
✅  Apollo.io API key … authenticated as you@example.com
✅  Google Sheets …      connected — sheet title: "My Leads"
✅  Email alerts …       SMTP OK — test email sent to jgagliardo98@gmail.com
```

Fix any ❌ items before continuing.

---

## Step 6 — Do a manual test run

Trigger one immediate run (without waiting for 7am):

```bash
npm run run-now
```

Check your Google Sheet — new leads should appear within 30–60 seconds.

---

## Step 7 — Start the scheduler

```bash
node index.js
```

The process prints the next scheduled run time and stays alive. To keep it running
after you close the terminal, use `pm2` or a systemd service:

```bash
# Option A — pm2 (recommended)
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save                  # auto-restart on server reboot
pm2 logs hvac-leads       # tail the logs

# Option B — nohup (quick and simple)
nohup node index.js > hvac-leads.log 2>&1 &
```

---

## Customising city targets

Open `apollo.js` and edit the `SW_MICHIGAN_LOCATIONS` array at the top:

```js
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  // add more cities here
];
```

## Changing the industries targeted

Edit `HVAC_KEYWORDS` and `HVAC_SIC_CODES` in `apollo.js`. SIC codes for reference:

| Code | Industry |
|------|----------|
| 1711 | Plumbing, Heating, Air-Conditioning |
| 7623 | Refrigeration and A/C Service & Repair |
| 1731 | Electrical Work |
| 1521 | General Building Contractors — Residential |

## Changing the column order

Edit the `rows` mapping in `leadgen.js` around the comment `// Build rows in spreadsheet column order`.
The column headers are defined in `sheets.js` → `SHEET_HEADERS`.

---

## Error handling

| Scenario | What happens |
|----------|-------------|
| Apollo returns 0 results | Logged as warning; error email sent if SMTP configured |
| Google Sheets write fails | Error logged + email sent; run exits cleanly |
| Duplicate business name | Silently skipped — not re-added |
| Contact has no phone | Filtered out before writing to sheet |
| Apollo plan doesn't support phone reveal | Degrades gracefully — leads without phones are filtered |

---

## Apollo plan notes

- **Free plan** — search works but phone enrichment (`reveal_phone_number`) returns 403.
  The script degrades gracefully and only writes leads where Apollo already has a phone on file.
- **Basic plan (~$49/mo)** — unlocks phone reveals; recommended for best results.
- **Credit cost** — each bulk_match call costs 1 export credit per person. With `MAX_LEADS_PER_RUN=25`
  and the 3x over-fetch, expect up to 75 credits per day in the worst case.
