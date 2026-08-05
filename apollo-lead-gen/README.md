# Apollo HVAC Lead Gen — SW Michigan

Pulls up to 25 new HVAC business owner contacts per day from Apollo.io and appends them to a Google Sheet. Runs automatically every morning at 7:00 AM Eastern Time.

---

## What it does

- Searches Apollo.io for **HVAC, plumbing, and mechanical contracting** companies (SIC 1711) in: St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven
- Targets **Owner / President / Founder / Co-Founder / General Manager** at companies with **1–25 employees**
- Skips anyone with no phone number
- Appends to your Google Sheet with columns: Date Added · Business Name · Owner First Name · Owner Last Name · Phone Number · City · Website · Called · Notes
- Deduplicates by Business Name — never adds the same company twice

---

## Prerequisites

- Node.js 18 or later
- An [Apollo.io account](https://app.apollo.io) (Basic plan recommended for phone reveals — ~$49/mo for 1,000 enrichments)
- A Google Cloud project with the Sheets API enabled
- A Google Sheet with the column headers listed above

---

## Step 1 — Clone and install

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Create your Google Sheet

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Name the first tab **Leads** (or anything — just keep it consistent with `GOOGLE_SHEET_TAB` in `.env`).
3. Add these headers in row 1, columns A through I:

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

4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_ID`**`/edit`

---

## Step 3 — Create a Google Service Account

A Service Account authenticates automatically without any browser login — ideal for a scheduled script.

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create or select a project.
2. Enable the **Google Sheets API**: APIs & Services → Library → search "Google Sheets API" → Enable.
3. Create a Service Account: APIs & Services → Credentials → Create Credentials → Service Account.
   - Name it anything (e.g. `lead-gen-bot`).
   - Role: **Editor** (or a custom role with Sheets read/write).
4. Click the service account → **Keys** tab → **Add Key** → **JSON** → Download.
5. Rename the downloaded file to `credentials.json` and place it in the `apollo-lead-gen/` folder.
6. Open `credentials.json` and copy the `client_email` value (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`).
7. **Share your Google Sheet** with that email address and grant it **Editor** access.

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
APOLLO_API_KEY=<your Apollo.io API key>
GOOGLE_SHEET_ID=<the ID from step 2>
GOOGLE_SHEET_TAB=Leads
GOOGLE_CREDENTIALS_FILE=credentials.json
NOTIFICATION_EMAIL=your@email.com
```

**Apollo API key location:** Apollo app → Settings → Integrations → API → Copy Key.

---

## Step 5 — Test the connection

```bash
node test-connection.js
```

Expected output:
```
Testing connections...

1. Apollo.io API key ... ✓ Connected
2. Google Sheets       ... ✓ Connected

✓ All systems go!

Next steps:
  1. Test a live pull:   node index.js --now
  2. Check your sheet — new leads should appear within ~30 seconds
  3. Start the scheduler: node index.js
```

If either check fails, the output tells you exactly what to fix.

---

## Step 6 — Run your first pull

```bash
node index.js --now
```

This runs immediately and prints each lead found. Check your Google Sheet — new rows should appear within about 30 seconds.

---

## Step 7 — Start the daily scheduler

```bash
node index.js
```

This keeps the process running and fires automatically at **7:00 AM Eastern** every day.

### Keeping it running in the background

**Using pm2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 startup           # makes it survive reboots
pm2 save
pm2 logs lead-gen     # view live logs
```

**Using nohup (simple):**
```bash
nohup node index.js > lead-gen.log 2>&1 &
tail -f lead-gen.log
```

---

## Customizing

**Change the target cities** — edit `TARGET_CITIES` in `index.js` (display names only; search config is in `src/apollo.js → SW_MICHIGAN_CITIES`).

**Change max leads per run** — edit `MAX_LEADS_PER_RUN` in `index.js`.

**Add more industries** — edit `INDUSTRY_KEYWORDS` and/or `HVAC_SIC_CODES` in `src/apollo.js`.

**Change target job titles** — edit `TARGET_JOB_TITLES` in `src/apollo.js`.

**Change the schedule** — edit the cron expression `'0 7 * * *'` in `index.js`. Format: `minute hour * * *`.

**Enable email alerts on errors** — uncomment the nodemailer block in `index.js` and add `SMTP_USER` / `SMTP_PASS` to `.env`.

---

## Apollo credit usage

Each batch enrichment (to reveal phone numbers) costs credits. With 25 leads/day and Apollo Basic plan (1,000 credits/month), you have ~40 days of runway per month. Credits reset monthly.

- **Free plan:** 50 enrichments/month — not enough for daily runs
- **Basic plan ($49/mo):** 1,000 enrichments/month — covers ~25 leads/day comfortably
- **Professional ($79/mo):** 2,000 credits/month

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Copy key from Apollo → Settings → Integrations → API |
| `GOOGLE_SHEET_ID is not set` | Copy the ID from your spreadsheet URL |
| `404 / Sheet not found` | Check sheet ID and make sure you shared with the service account email |
| `invalid_grant` | Re-download credentials.json (key may have been rotated or revoked) |
| No leads found | Try broader keyword tags or add more cities in `src/apollo.js` |
| Duplicate entries appearing | The dedup check reads column B — make sure column B header is `Business Name` |
