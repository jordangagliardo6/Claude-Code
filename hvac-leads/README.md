# HVAC Lead Generator — SW Michigan

Fetches up to 25 HVAC decision-maker leads from Apollo.io every morning at **7 AM ET** and appends them to a Google Sheet, skipping any business already in the sheet.

---

## What it pulls

| Field | Source |
|---|---|
| Business Name | Apollo company record |
| Owner First Name | Apollo person record |
| Owner Last Name | Apollo person record |
| Phone Number | Mobile → Direct → Business (best available) |
| City | Apollo person/company location |
| Website | Apollo company record |

**Targets:** Owner, President, Founder, Co-Founder, General Manager  
**Industries:** HVAC, Heating & Cooling, Air Conditioning, Mechanical Contracting, Plumbing  
**Company size:** 1–25 employees  
**Locations:** St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven (all in Michigan)

---

## Setup (one-time)

### Step 1 — Install dependencies

```bash
cd hvac-leads
npm install
```

### Step 2 — Get your Apollo.io API key

1. Go to [developer.apollo.io](https://developer.apollo.io)
2. Sign in → **Settings** → **Integrations** → **API Keys**
3. Create or copy an existing key
4. Free tier gives 50 credits/month. Basic plan ($49/mo) gives 1,000/month.

### Step 3 — Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Rename the first tab to **Leads** (exact spelling, capital L)
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_IS_HERE/edit
   ```

### Step 4 — Set up Google Service Account credentials

You need a service account so the script can write to your sheet without a browser login.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**:
   - Navigation menu → APIs & Services → Enable APIs and Services
   - Search "Google Sheets API" → Enable
4. Create a service account:
   - Navigation menu → IAM & Admin → Service Accounts
   - Click **Create Service Account** → give it any name → Continue → Done
5. Download the JSON key:
   - Click the service account you just created
   - **Keys** tab → **Add Key** → Create New Key → **JSON** → Download
   - Rename the downloaded file to `google-credentials.json`
   - Move it into the `hvac-leads/` folder (same folder as `index.js`)
6. Share your Google Sheet with the service account:
   - Open the JSON file — find `"client_email"` — copy that email address
   - Open your Google Sheet → **Share** → paste the service account email → **Editor** → Share

### Step 5 — Configure your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEETS_ID=your_google_sheets_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-credentials.json
```

If you want email alerts when errors occur, also fill in the SMTP section (optional — the script always logs errors to the console regardless).

### Step 6 — Verify your connections

```bash
node index.js --test
```

You should see:
```
=== Connection Test ===

1. Apollo.io API key ... ✓ Connected
2. Google Sheets access ... ✓ Connected
```

If either fails, the error message tells you exactly what to fix.

### Step 7 — Set up the sheet headers

```bash
node index.js --setup
```

This writes the header row to your sheet so the columns are labeled correctly.

### Step 8 — Run it once to confirm it works

```bash
node index.js --run-now
```

Watch the console output. After it finishes, open your Google Sheet — you should see new HVAC leads in the **Leads** tab.

### Step 9 — Start the daily scheduler

```bash
node index.js
```

The script starts the cron job and runs every day at **7:00 AM Eastern Time**. Keep the terminal open (or run it in the background with a process manager like PM2).

**Running with PM2 (recommended for unattended use):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save           # auto-restart on reboot
pm2 logs hvac-leads  # watch logs
```

---

## Commands reference

| Command | What it does |
|---|---|
| `node index.js` | Start the daily 7 AM scheduler |
| `node index.js --test` | Verify Apollo + Sheets connection |
| `node index.js --setup` | Write header row to empty sheet |
| `node index.js --run-now` | Run the job once and exit |

---

## Customizing

**Change the target cities** — edit `SW_MICHIGAN_CITIES` in `apollo.js`

**Change the job titles** — edit `TARGET_TITLES` in `apollo.js`

**Change the schedule** — edit `CRON_SCHEDULE` and `CRON_TIMEZONE` at the top of `index.js`

**Change max leads per run** — edit `MAX_LEADS_PER_RUN` at the top of `index.js`

**Add more industries** — edit `HVAC_KEYWORDS` in `apollo.js`

---

## Column layout

| Column | Label | Auto-filled? |
|---|---|---|
| A | Date Added | Yes |
| B | Business Name | Yes |
| C | Owner First Name | Yes |
| D | Owner Last Name | Yes |
| E | Phone Number | Yes |
| F | City | Yes |
| G | Website | Yes |
| H | Called | No — you fill this in |
| I | Notes | No — you fill this in |

---

## Troubleshooting

**Apollo returns 0 results**
- Check your API key in `.env`
- Check your Apollo account usage limits (free tier: 50 credits/month)
- Try `--run-now` and watch for HTTP errors in the console

**Google Sheets "not found" error**
- Double-check `GOOGLE_SHEETS_ID` — it's the long string in the sheet URL
- Make sure the tab is named exactly `Leads` (capital L)

**Google Sheets "permission denied" error**
- The service account email must be added as an Editor on the sheet
- Find the email in `google-credentials.json` under `"client_email"`

**"Missing environment variables" error**
- Make sure `.env` exists (copied from `.env.example`) and has real values, not placeholders

**Scheduler not running**
- Keep the process alive with PM2 (see Step 9 above)
- Confirm your server's clock is set correctly (`date` in terminal)
