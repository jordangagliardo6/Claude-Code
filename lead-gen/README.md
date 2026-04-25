# HVAC Lead Generation — Southwest Michigan

Automated daily lead generation for HVAC/plumbing owner-operators in Southwest Michigan.
Pulls up to 25 new leads per day from Apollo.io and appends them to a Google Sheet.

---

## What It Does

- Searches Apollo.io for HVAC, plumbing, and mechanical contracting companies
  in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, and South Haven
- Targets decision-makers: Owner → President → Founder → Co-Founder → General Manager
- Only keeps contacts that have a phone number
- Checks the sheet for duplicates before writing — won't re-add a business already present
- Runs automatically every morning at **7:00 AM Eastern Time**
- Logs all activity to `./logs/lead-gen.log` and errors to `./logs/errors.log`

---

## Project Structure

```
lead-gen/
├── index.js                  # Scheduler entry point (npm start)
├── scripts/
│   ├── setup.js              # Connection test (npm run setup)
│   └── run-now.js            # Manual trigger (npm run run-now)
├── src/
│   ├── config.js             # All tunable settings — cities, titles, limits
│   ├── apollo.js             # Apollo.io API integration
│   ├── sheets.js             # Google Sheets read/write
│   ├── workflow.js           # Main orchestration logic
│   └── logger.js             # Winston logger
├── logs/                     # Created automatically on first run
├── .env                      # Your credentials (never commit this)
├── .env.example              # Template — copy this to .env
├── credentials.json          # Google service account key (never commit this)
└── package.json
```

---

## First-Time Setup

### Step 1 — Install Node.js

Make sure you have Node.js 18+ installed:

```bash
node --version   # should be v18 or higher
```

Download from https://nodejs.org if needed.

### Step 2 — Install dependencies

```bash
cd lead-gen
npm install
```

### Step 3 — Get your Apollo.io API Key

1. Log in to your Apollo.io account
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. You'll paste this into your `.env` file in Step 5

### Step 4 — Set up Google Sheets access (Service Account)

This uses a Google **Service Account** — a server-side credential that doesn't require
a browser login every time the script runs.

#### 4a — Create the Google Cloud project

1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top → **New Project**
3. Name it anything (e.g. `hvac-lead-gen`) → **Create**

#### 4b — Enable the Google Sheets API

1. In your new project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

#### 4c — Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Give it a name (e.g. `lead-gen-bot`) → **Create and Continue**
4. Skip the optional role/user steps → **Done**

#### 4d — Download the credentials JSON

1. On the Credentials page, click your new service account email
2. Go to the **Keys** tab → **Add Key → Create new key**
3. Choose **JSON** → **Create**
4. A file downloads — rename it to `credentials.json`
5. Move `credentials.json` into the `lead-gen/` folder

#### 4e — Share your spreadsheet with the service account

1. Open your Google Sheet (create a blank one if you haven't yet)
2. Click **Share** (top-right)
3. Paste the service account email (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
4. Set permission to **Editor** → **Done**

#### 4f — Get your Spreadsheet ID

The Spreadsheet ID is in the URL of your sheet:

```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SPREADSHEET_ID/edit
```

Copy it — you'll need it in the next step.

### Step 5 — Configure your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_SERVICE_ACCOUNT_FILE=./credentials.json
ALERT_EMAIL=your_email@example.com
MAX_LEADS_PER_RUN=25
TIMEZONE=America/New_York
```

### Step 6 — Run the setup verification

```bash
npm run setup
```

This checks all four things before you commit to the schedule:
1. Environment variables are set
2. Apollo.io connection works
3. Google Sheets connection works
4. Header row is written to the spreadsheet

You should see `ALL CHECKS PASSED` before continuing.

---

## Running It

### Test pull (runs immediately, does not wait for 7 AM)

```bash
npm run run-now
```

Open your spreadsheet — you should see rows appear within 10–15 seconds.

### Start the daily scheduler

```bash
npm start
```

The process stays running and triggers automatically at 7:00 AM Eastern every day.
Use a process manager like **PM2** to keep it alive if you close the terminal:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup    # follow the printed instructions to auto-start on reboot
```

---

## Customizing the Search

All tunable settings live in `src/config.js`:

| Setting | What it controls |
|---|---|
| `cities` | List of target cities |
| `industries` | Apollo keyword tags for industry filtering |
| `jobTitles` | Titles to search, in priority order |
| `employeeRange` | Company size filter (`"1,25"` = 1 to 25 employees) |
| `maxLeadsPerRun` | Max new leads added per daily run |
| `scheduleTime` | Cron expression for the run time |

---

## Spreadsheet Columns

| Column | Notes |
|---|---|
| Date Added | Date the lead was added |
| Business Name | Company name from Apollo |
| Owner First Name | Contact first name |
| Owner Last Name | Contact last name |
| Phone Number | Best available number (mobile preferred) |
| City | City of the business |
| Website | Company website URL |
| Called | Leave blank — fill in manually after calling |
| Notes | Leave blank — your personal call notes |

---

## Error Handling

- **Apollo returns zero results**: Logged as an ACTION REQUIRED alert in the console and `errors.log`. Check your Apollo quota or widen the city list.
- **Google Sheets write fails**: Full error logged to `errors.log`. Check that the service account still has Editor access to the sheet.
- All errors include your `ALERT_EMAIL` in the log message so you know where to send a manual notification if you wire in email later (e.g. via Nodemailer).

---

## Logs

```
logs/lead-gen.log   — all activity
logs/errors.log     — errors only (easier to scan when something goes wrong)
```

Logs rotate automatically at 5 MB to avoid filling disk space.
