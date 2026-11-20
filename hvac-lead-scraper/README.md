# HVAC Lead Scraper — Southwest Michigan

Automatically searches Apollo.io for HVAC owner-operators in SW Michigan every morning at 7 AM Eastern and appends new contacts to a Google Sheet — no duplicates, max 25 leads per run.

---

## What It Does

- Searches Apollo.io for HVAC, plumbing, and mechanical contracting companies (1–25 employees) in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven, and surrounding areas
- Targets: Owner, President, Founder, Co-Founder, General Manager (in that priority order)
- Skips any contact with no phone number
- Appends to your Google Sheet with columns: Date Added, Business Name, Owner First Name, Owner Last Name, Phone Number, City, Website, Called, Notes
- Checks the Business Name column before inserting — never adds a duplicate
- Runs automatically at 7 AM Eastern via node-cron
- Sends an email alert if Apollo or Google Sheets fails

---

## Quick Start

### 1. Install dependencies

```bash
cd hvac-lead-scraper
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
# Then edit .env with your actual values
```

### 3. Set up Google Sheets credentials

You need a **Google Service Account** to write to Sheets without manual OAuth.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Google Sheets API"
4. Create a Service Account: IAM & Admin → Service Accounts → Create
   - Give it any name (e.g., `hvac-scraper`)
   - Skip role assignment
5. Under the service account, go to **Keys** → Add Key → JSON → Download
6. Save the downloaded file somewhere safe (e.g., `~/hvac-credentials.json`)
7. Set `GOOGLE_CREDENTIALS_PATH` in your `.env` to that file's absolute path

**Share your spreadsheet** with the service account:
- Open the service account JSON — find `"client_email"` (looks like `hvac-scraper@your-project.iam.gserviceaccount.com`)
- Open your Google Sheet → Share → paste that email → Editor access

### 4. Configure `.env`

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=your_sheet_id_from_the_url
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/your/service-account.json
ALERT_EMAIL_TO=you@email.com
ALERT_EMAIL_FROM=you@gmail.com
ALERT_EMAIL_PASSWORD=your_gmail_app_password
MAX_LEADS_PER_RUN=25
```

For `ALERT_EMAIL_PASSWORD`, use a **Gmail App Password** (not your regular password):  
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### 5. Verify the connection

```bash
node src/setup-verify.js
```

This will:
- Confirm all env vars are set
- Test your Apollo.io API key with a live query
- Connect to your Google Sheet and write the header row

**Fix any errors it reports before continuing.**

### 6. Run once manually

```bash
node src/run-once.js
```

This pulls up to 25 leads and adds them to your sheet. Check the sheet — you should see new rows.

### 7. Start the daily scheduler

```bash
node src/index.js
```

This starts node-cron. The job fires every day at **7:00 AM Eastern**. Keep the process running.

For production / always-on use, run with **pm2**:

```bash
npm install -g pm2
pm2 start src/index.js --name hvac-scraper
pm2 save
pm2 startup  # Follow the printed command to auto-start on reboot
```

---

## Customizing

### Change the target cities

Edit `swMichiganCities` in `src/config.js`. Each city is formatted as `"City, Michigan, United States"` when sent to Apollo.

### Change the max leads per run

Set `MAX_LEADS_PER_RUN` in your `.env` (default: 25).

### Change industries

Edit `targetIndustries` in `src/config.js`.

### Change the schedule

Edit the cron expression in `src/index.js`:
```js
cron.schedule('0 7 * * *', ...)  // 7:00 AM every day
```
Standard 5-field cron: `minute hour day month weekday`

---

## Google Sheet Columns

| Column | Contents |
|--------|----------|
| A | Date Added |
| B | Business Name |
| C | Owner First Name |
| D | Owner Last Name |
| E | Phone Number |
| F | City |
| G | Website |
| H | Called (you fill this in) |
| I | Notes (you fill this in) |

---

## Troubleshooting

**Apollo returns 0 results**
- Check your API key in the Apollo dashboard
- Verify you have remaining credits (free tier: 50/month; Basic: 1,000/month)
- Try broadening the city list or industries in `src/config.js`

**Google Sheets 403 / permission denied**
- Make sure you shared the spreadsheet with the service account email
- Confirm the service account JSON file has `"type": "service_account"`

**Gmail app password not working**
- Use a Gmail App Password, not your regular password
- 2FA must be enabled on your Google account to create App Passwords
- Create one at: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

**Scheduler fires but then stops**
- Use pm2 to keep the process alive across reboots (see step 7 above)
- Or add it to your server's crontab: `0 7 * * * /usr/bin/node /path/to/hvac-lead-scraper/src/run-once.js`

---

## Apollo.io API Plan Requirements

| Plan | Monthly enrichments | Cost |
|------|--------------------|----|
| Free | 50 | $0 |
| Basic | 1,000 | $49/mo |
| Professional | 5,000 | $99/mo |

At 25 leads/day × 22 weekdays = ~550/month → **Basic plan recommended**.

Get your API key at [developer.apollo.io](https://developer.apollo.io) → API Keys.
