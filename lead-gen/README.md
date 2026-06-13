# HVAC Lead Generation — Southwest Michigan

Runs every morning at **7 AM Eastern**, pulls up to **25 new HVAC leads** from Apollo.io, and appends them to a Google Sheet — skipping any business already in the list.

---

## Quick-start checklist

```
[ ] 1. Get your Apollo API key
[ ] 2. Create a Google Cloud service account + enable Sheets API
[ ] 3. Share your spreadsheet with the service account email
[ ] 4. Copy .env.example → .env and fill in the values
[ ] 5. npm install
[ ] 6. node setup-test.js      ← confirms both APIs work
[ ] 7. node index.js           ← starts the daily scheduler
```

---

## Step-by-step setup

### 1 · Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API** (or visit developer.apollo.io)
3. Copy your API key
4. Paste it into `.env` as `APOLLO_API_KEY=...`

### 2 · Google Cloud service account

A service account lets the script write to your spreadsheet without any browser login.

1. Open the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or reuse an existing one)
3. Go to **APIs & Services → Enable APIs** → enable **Google Sheets API**
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
   - Name it anything (e.g. "hvac-lead-gen")
   - Skip optional role/access fields → click Done
5. Click the new service account → **Keys tab → Add Key → JSON**
6. A `.json` file downloads — move it to `lead-gen/credentials/service-account.json`
7. Set `GOOGLE_SERVICE_ACCOUNT_PATH=./credentials/service-account.json` in `.env`

### 3 · Share the spreadsheet

1. Open the downloaded JSON file and copy the `client_email` value
   (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet → Share → paste that email → give it **Editor** access

### 4 · Set your spreadsheet ID

The ID is the long string in the URL:

```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

Paste it into `.env` as `SPREADSHEET_ID=...`

### 5 · (Optional) Email alerts

To receive an email when a run fails:

1. Go to [myaccount.google.com → Security → App passwords](https://myaccount.google.com/apppasswords)
2. Generate an App Password for "Mail"
3. Fill in the `SMTP_*` and `ALERT_EMAIL_*` fields in `.env`

---

## Running it

```bash
cd lead-gen
npm install

# Verify both APIs work before scheduling
node setup-test.js

# Run once right now (great for testing)
node index.js --run-once

# Start the daily scheduler (7 AM Eastern every day)
node index.js
```

### Keep it running on a server / VM

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup      # follow the printed command to auto-start on reboot

# Or with nohup
nohup node index.js > lead-gen.log 2>&1 &
```

---

## Customising

| What to change | Where |
|---|---|
| Add/remove target cities | `config.js` → `targetCities` |
| Max leads per run | `config.js` → `maxLeadsPerRun` |
| Job titles targeted | `config.js` → `jobTitlePriority` |
| Schedule time | `config.js` → `cronSchedule` (cron syntax) |
| Industry filters | `config.js` → `sicCodes`, `naicsCodes`, `industryKeywords` |
| Sheet tab name | `.env` → `SHEET_TAB_NAME` |

---

## Sheet columns

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

---

## Troubleshooting

| Error | Likely cause |
|---|---|
| `APOLLO_API_KEY` not set | Missing from `.env` |
| Apollo 401 | Wrong API key |
| Apollo 422 | Plan doesn't support People Search |
| Google 403 | Service account not shared on spreadsheet |
| `ENOENT credentials/...` | JSON file not in the right path |
| 0 leads returned | Broaden city list or industry keywords in `config.js` |
