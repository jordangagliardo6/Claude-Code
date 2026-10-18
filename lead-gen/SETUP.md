# HVAC Lead Gen — First-Run Setup Guide

This guide walks you through everything you need to run the workflow for the first time.

---

## What you need

| Requirement | Details |
|---|---|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| Apollo.io account | Basic plan or higher (free plan does not include phone numbers) |
| Google Cloud project | Free tier is fine |

---

## Step 1 — Clone and install

```bash
cd lead-gen
npm install
```

---

## Step 2 — Set up Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. You'll paste it into `.env` in Step 4

> **Plan note:** Returning phone numbers requires a **Basic plan or higher**. Free plan searches work, but the `phone` field will be empty and the workflow will skip those leads. Upgrade at: https://app.apollo.io/#/settings/plans/upgrade

---

## Step 3 — Set up Google Sheets access (service account)

The script connects to your existing spreadsheet:
**HVAC Leads — SW Michigan (Master)**
`https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8`

### 3a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project**, name it anything (e.g. `hvac-lead-gen`)
3. Select the project

### 3b. Enable the Google Sheets API

1. In the left menu, go to **APIs & Services → Library**
2. Search for **Google Sheets API** and click **Enable**

### 3c. Create a service account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it anything (e.g. `lead-gen-bot`)
4. Click **Done** (no roles needed)
5. Click on the service account you just created
6. Go to the **Keys** tab → **Add Key → Create new key → JSON**
7. Download the file — save it as `credentials.json` inside the `lead-gen/` folder

### 3d. Share the spreadsheet with the service account

1. Open `credentials.json` and copy the `client_email` value (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
2. Open the [spreadsheet](https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8)
3. Click **Share**, paste the service account email, set role to **Editor**, click **Send**

---

## Step 4 — Configure environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Open `.env` and set:

```
APOLLO_API_KEY=your_actual_apollo_api_key
GOOGLE_CREDENTIALS_PATH=./credentials.json
```

---

## Step 5 — Test the connections

Run the connection test before starting the scheduler:

```bash
node test-connection.js
```

You should see:
```
✓  APOLLO_API_KEY is set
✓  Apollo API responded — total matching records: 143
✓  Phone numbers are included in Apollo results (plan supports it)
✓  credentials.json found at: /path/to/lead-gen/credentials.json
✓  Google Sheets read OK — 71 existing business(es) in sheet

Result: 4 passed, 0 failed
All connections verified. You are ready to run the scheduler.
```

> If you see a phone number warning, upgrade your Apollo plan before relying on the scheduler.

---

## Step 6 — Run once manually to confirm it works

```bash
node run-now.js
```

This performs one real run immediately and appends up to 25 new leads to your spreadsheet. Open the sheet and confirm the rows were added.

---

## Step 7 — Start the scheduler

```bash
node index.js
```

The scheduler runs in the foreground. It fires at **7:00 AM Eastern Time** every morning and adds up to 25 new leads.

### Keeping it running permanently

On a server or VPS, use **PM2** so it survives reboots:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to enable on boot
```

Check logs:
```bash
pm2 logs hvac-lead-gen
```

---

## Customizing the workflow

| What to change | Where |
|---|---|
| Cities / regions | `config.js` → `cities` array |
| Max leads per run | `config.js` → `apollo.maxLeadsPerRun` |
| Job titles to target | `config.js` → `apollo.personTitles` |
| Industry keywords | `config.js` → `apollo.industryKeywords` |
| Cron schedule | `config.js` → `cronSchedule` (uses standard cron syntax) |
| Target spreadsheet | `config.js` → `sheets.spreadsheetId` |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY environment variable is not set` | Copy `.env.example` to `.env` and add your key |
| `Google credentials file not found` | Download credentials.json from Google Cloud and place it in `lead-gen/` |
| `The caller does not have permission` | Share the spreadsheet with the service account email (Step 3d) |
| Apollo returns 0 leads with phones | Upgrade your Apollo plan for phone number access |
| `Error: Could not load the default credentials` | Ensure `GOOGLE_CREDENTIALS_PATH` in `.env` points to your `credentials.json` |
