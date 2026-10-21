# HVAC Lead Generator

Pulls HVAC leads for Southwest Michigan from Apollo.io and appends them to a Google Sheets spreadsheet every morning at 7 AM Eastern.

## What it does

- Searches Apollo.io for HVAC, Plumbing, and Mechanical Contracting companies in 7 Southwest Michigan cities
- Targets owner-operated businesses (1–25 employees)
- Finds Owner / President / Founder / Co-Founder / General Manager contacts with a direct phone number
- Deduplicates against existing rows in your spreadsheet
- Pulls up to 25 new leads per run
- Runs automatically at 7:00 AM ET every day

---

## First-Time Setup

### Step 1 — Install dependencies

```bash
cd lead-generator
npm install
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in the values (instructions for each are below).

### Step 3 — Get your Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Paste it as `APOLLO_API_KEY` in `.env`

### Step 4 — Set up Google Sheets access

#### 4a. Create a Google Cloud project

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable these APIs:
   - **Google Sheets API**
   - **Google Drive API**

#### 4b. Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Choose **Desktop app** as the application type
4. Download the JSON file
5. Copy `client_id` → `GOOGLE_CLIENT_ID` in `.env`
6. Copy `client_secret` → `GOOGLE_CLIENT_SECRET` in `.env`

#### 4c. Generate your refresh token

Run the one-time OAuth setup script:

```bash
node setup-oauth.js
```

- It will print a URL — open it in your browser
- Sign in with your Google account and click **Allow**
- Copy the code shown and paste it into the terminal
- Copy the `GOOGLE_REFRESH_TOKEN` it prints into your `.env` file

#### 4d. Get your spreadsheet ID

Open your Google Sheet and copy the ID from the URL:

```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

Paste it as `GOOGLE_SPREADSHEET_ID` in `.env`.

> **Tip:** If you don't have a spreadsheet yet, create a blank one at [sheets.google.com](https://sheets.google.com). The script will write the header row on the first run.

### Step 5 — Test the connections

```bash
node test-connection.js
```

You should see two green checkmarks. If either test fails, it will tell you exactly what's wrong.

### Step 6 — Run it now (optional)

```bash
node index.js
```

This pulls up to 25 leads immediately so you can see it working before the scheduler kicks in.

### Step 7 — Start the scheduler

```bash
node cron-job.js
```

This runs in the foreground. To keep it running after you close the terminal:

```bash
# Option A: nohup (simple)
nohup node cron-job.js > leads.log 2>&1 &

# Option B: PM2 (recommended for production)
npm install -g pm2
pm2 start cron-job.js --name hvac-leads
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

---

## Spreadsheet columns

| Column | Description |
|--------|-------------|
| Date Added | Date the lead was pulled (MM/DD/YYYY) |
| Business Name | Company name from Apollo |
| Owner First Name | Contact's first name |
| Owner Last Name | Contact's last name |
| Phone Number | Best available phone (direct > mobile > main) |
| City | City from Apollo contact or org record |
| Website | Company website URL |
| Called | **You fill this in** — yes/no/callback |
| Notes | **You fill this in** — anything you want to track |

---

## Customizing

### Change the target cities

Edit the `TARGET_CITIES` array at the top of `index.js`:

```js
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  // add or remove cities here
];
```

### Change the max leads per run

Either edit `.env`:
```
MAX_LEADS_PER_RUN=50
```

Or edit the default in `index.js`:
```js
const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
```

### Change the schedule

Edit the `CRON_SCHEDULE` in `cron-job.js`. Uses standard cron syntax:

```
'0 7 * * *'   → 7:00 AM every day
'0 8 * * 1-5' → 8:00 AM weekdays only
'0 6,18 * * *'→ 6:00 AM and 6:00 PM every day
```

### Change the target industries or job titles

Edit `TARGET_INDUSTRIES` and `TARGET_TITLES` arrays in `index.js`.

---

## Error handling

- Errors are printed to the console and appended to `error.log`
- The script exits with code 1 on failure so the cron scheduler knows it failed
- If Apollo returns no results, a warning is logged (not necessarily an error — try adjusting cities or industries)
- If the Google Sheets write fails, the error is logged and no partial data is written

---

## Files

| File | Purpose |
|------|---------|
| `index.js` | Main workflow — Apollo search + Google Sheets write |
| `cron-job.js` | Daily scheduler (7 AM ET) |
| `setup-oauth.js` | One-time Google OAuth token generator |
| `test-connection.js` | Verify both APIs are connected before first run |
| `.env.example` | Environment variable template |
| `error.log` | Created automatically if any errors occur |
