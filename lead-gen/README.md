# SW Michigan HVAC Lead Generator

Searches Apollo.io daily for owner-operated HVAC companies in Southwest Michigan and writes new leads to a Google Drive spreadsheet. Runs automatically at **7:00 AM Eastern** via `node-cron`.

---

## What it does each run

1. Reads all existing lead spreadsheets in your Drive folder to build a deduplication list
2. Searches Apollo.io for decision-makers (Owner / President / Founder / Co-Founder / GM) at HVAC, plumbing, and mechanical companies with 1–25 employees across the target cities
3. Enriches each match to retrieve their direct phone number; skips anyone without one
4. Creates a new Google Drive spreadsheet named `SW Michigan HVAC Leads — New [Today's Date]`
5. Appends up to 25 new (non-duplicate) leads with columns: Date Added, Business Name, Owner First Name, Owner Last Name, Phone Number, City, Website, Called, Notes
6. Emails you at `NOTIFICATION_EMAIL` if anything goes wrong or no leads are found

---

## First-time setup

### 1. Install Node.js dependencies

```bash
cd lead-gen
npm install
```

### 2. Get your Apollo.io API key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Note: the People Search endpoint (`/v1/mixed_people/search`) requires a **paid Apollo plan**. If you're on the free plan, upgrade at [apollo.io/pricing](https://www.apollo.io/pricing)

### 3. Set up Google Drive API (service account)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable these two APIs:
   - **Google Drive API**
   - **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it any name (e.g. `hvac-lead-bot`), click Create
6. On the next screen, click **Add Key → JSON** — this downloads `credentials.json`
7. Move `credentials.json` into this `lead-gen/` folder
8. **Share your Google Drive folder** with the service account's email address (looks like `hvac-lead-bot@your-project.iam.gserviceaccount.com`) — give it **Editor** access

### 4. Find your Google Drive folder ID

1. Open the folder in Google Drive where you want spreadsheets to be saved
2. Copy the ID from the URL: `drive.google.com/drive/folders/**FOLDER_ID_HERE**`

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in every value:

```
APOLLO_API_KEY=your_key
GOOGLE_CREDENTIALS_PATH=./credentials.json
SPREADSHEET_PARENT_FOLDER_ID=your_folder_id
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_16_char_app_password   # Gmail App Password, not your login password
```

**Gmail App Password:** go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create a new app password, paste it as `SMTP_PASS`.

### 6. Test the connections before the first live run

```bash
node index.js --test
```

You should see:

```
Testing Apollo.io API key...          ✓  Connected
Testing Google Drive credentials...   ✓  Connected as hvac-lead-bot@...
Testing Google Sheets access...       ✓  Can list spreadsheets (found 3 in test query)

✅  All systems connected — safe to start the scheduler (npm start)
```

Fix any ✗ errors before continuing.

### 7. Start the scheduler

```bash
npm start
```

The script runs once immediately (so you can confirm it works), then waits and re-runs every morning at 7:00 AM Eastern. Keep it running with a process manager like [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-bot
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing the workflow

All easy-to-change settings are at the top of `index.js`:

| Constant | Default | What it controls |
|---|---|---|
| `TARGET_CITIES` | 7 SW Michigan cities | Add or remove cities from the search |
| `TARGET_TITLES` | Owner, President, Founder… | Job titles to target (in priority order) |
| `INDUSTRY_TAGS` | HVAC, Plumbing… | Apollo keyword tags for industry filtering |
| `MAX_LEADS_PER_RUN` | `25` | Max leads appended per daily run |
| `CRON_SCHEDULE` | `'0 7 * * *'` | Cron expression for run time |

The cron schedule uses `timezone: 'America/New_York'` so it adjusts automatically for EST/EDT.

---

## Column structure

| Column | Description |
|---|---|
| Date Added | Date the row was inserted (MM/DD/YYYY) |
| Business Name | Company name |
| Owner First Name | Decision-maker's first name |
| Owner Last Name | Decision-maker's last name (may be partially masked without enrichment) |
| Phone Number | Direct or mobile number |
| City | Company city |
| Website | Company website URL |
| Called | Leave blank — fill in manually after calling |
| Notes | Leave blank — your call notes |

---

## Error handling

- **Apollo returns no results:** creates the spreadsheet (headers only) and emails you
- **Google Drive write fails:** logs the error and emails you
- **No phone number found:** that contact is silently skipped (per spec — only leads with phone numbers are written)
- **All results are duplicates:** treats this the same as "no results" and emails you

Logs are written to stdout with ISO timestamps. Pipe to a file for persistent logs:

```bash
npm start >> logs/hvac-leads.log 2>&1
```
