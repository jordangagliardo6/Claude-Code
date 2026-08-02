# HVAC Lead Gen — Apollo → Google Sheets

Daily automated lead generation: pulls up to 25 HVAC owner contacts from
Apollo.io in Southwest Michigan and appends them to your Google Sheet every
morning at 7 AM Eastern.

---

## Quick Start

```bash
cd lead-gen
npm install
cp .env.example .env
# fill in .env (see Setup section)
npm test          # verify both connections first
node index.js --now   # run one pull right now
node index.js         # start the daily scheduler
```

---

## Setup (one-time)

### 1. Apollo.io API Key

1. Go to [developer.apollo.io](https://developer.apollo.io) → API Keys
2. Copy your key
3. Set `APOLLO_API_KEY=your_key` in `.env`

> **Plan requirement:** The People Search API (`/v1/mixed_people/search`) requires
> **Apollo Basic ($49/mo)** or higher. The free plan will return a 403 error.
> Upgrade at [apollo.io/pricing](https://www.apollo.io/pricing).

### 2. Google Sheets Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Name it anything (e.g. `hvac-lead-gen`)
6. Click **Keys → Add Key → JSON** — this downloads `google-credentials.json`
7. Move that file to the `lead-gen/` folder
8. **Share your spreadsheet** with the service account email (looks like
   `hvac-lead-gen@your-project.iam.gserviceaccount.com`) and give it **Editor** access
9. Set `GOOGLE_CREDENTIALS_PATH=./google-credentials.json` in `.env`

### 3. Target Spreadsheet

The sheet ID is already pre-filled as your "HVAC SW Michigan Leads" spreadsheet:
```
GOOGLE_SHEET_ID=1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk
```

The sheet must have these headers in row 1:
```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

### 4. Email Alerts (optional)

Set these in `.env` to receive an email when something breaks:
```
ALERT_EMAIL=you@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
```

For Gmail, use an **App Password** (not your regular password):
Google Account → Security → 2-Step Verification → App Passwords

---

## Configuration

All settings live in `.env`. Key options:

| Variable | Default | Description |
|---|---|---|
| `APOLLO_API_KEY` | — | Your Apollo API key |
| `GOOGLE_SHEET_ID` | pre-filled | Your spreadsheet ID |
| `SHEET_TAB_NAME` | `Sheet1` | Tab name inside the spreadsheet |
| `MAX_LEADS_PER_RUN` | `25` | Max new leads added per run |
| `CRON_SCHEDULE` | `0 7 * * *` | When to run (7:00 AM daily) |
| `CRON_TIMEZONE` | `America/New_York` | Timezone for the schedule |

---

## Customizing Cities

Edit `apollo.js` → `SW_MICHIGAN_CITIES` array. Add or remove cities freely:

```js
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Kalamazoo, Michigan',
  // add more here
];
```

---

## Customizing Columns

If you change the column order, update the `rows.push([...])` block in
`index.js` around line 120 to match your new layout.

---

## Phone Numbers

By default, the script uses the **standard enrichment** endpoint which returns
phone numbers already in Apollo's database (no extra credit cost).

If a contact has no phone in Apollo's basic data, you can enable **async phone
reveal** (costs credits per successful lookup) by changing the `enrichPerson`
call in `index.js`:

```js
const result = await enrichPerson({ ... }, true); // second arg = revealPhone
```

Then call `pollForPhone(result.request_id)` to wait for the async result.
See `apollo.js` for the full implementation.

---

## Running as a Background Service (Linux)

To keep the scheduler running after you close your terminal, use `pm2`:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

Or use a system cron job instead of `node-cron`:
```bash
# Add to crontab (crontab -e):
0 7 * * * cd /path/to/lead-gen && node index.js --now >> logs/run.log 2>&1
```

---

## File Structure

```
lead-gen/
├── index.js          ← main entry point + scheduler
├── apollo.js         ← Apollo search & enrichment logic
├── sheets.js         ← Google Sheets read/write
├── notify.js         ← console + email error alerts
├── test-connections.js  ← first-run verification script
├── package.json
├── .env.example
├── .gitignore        ← excludes .env and credentials
└── README.md
```
