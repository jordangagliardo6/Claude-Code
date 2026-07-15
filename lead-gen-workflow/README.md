# HVAC Lead Gen — Apollo.io × Google Sheets

Runs every morning at **7:00 AM Eastern** and appends up to 25 fresh HVAC
leads from Southwest Michigan to a Google Sheet.  Zero manual work after
first-time setup.

---

## What It Does Each Run

1. Queries Apollo.io for HVAC / Plumbing / Mechanical business owners in
   St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon,
   and South Haven (Michigan).
2. Filters for Owner / President / Founder / Co-Founder / General Manager
   at companies with 1–25 employees.
3. Drops anyone with no phone number on file.
4. Deduplicates against your existing sheet (by Business Name).
5. Appends new rows — max 25 per run.

---

## Spreadsheet Columns

| Col | Header            | Filled by script? |
|-----|-------------------|-------------------|
| A   | Date Added        | ✓                 |
| B   | Business Name     | ✓                 |
| C   | Owner First Name  | ✓                 |
| D   | Owner Last Name   | ✓                 |
| E   | Phone Number      | ✓                 |
| F   | City              | ✓                 |
| G   | Website           | ✓ (if available)  |
| H   | Called            | ← you fill this   |
| I   | Notes             | ← you fill this   |

---

## First-Time Setup (one-time, ~15 minutes)

### Step 1 — Install Node.js dependencies

```bash
cd lead-gen-workflow
npm install
```

### Step 2 — Copy and fill in your environment file

```bash
cp .env.example .env
```

Open `.env` and set:
- `APOLLO_API_KEY` — from [developer.apollo.io](https://developer.apollo.io) → Settings → API Keys
- `GOOGLE_SHEET_ID` — the long ID string in your Google Sheets URL

### Step 3 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first tab to **Leads** (exactly — case-sensitive).
3. Leave row 1 empty — the script writes the header row automatically.
4. Copy the sheet ID from the URL and paste it into `.env`.

### Step 4 — Enable the Google Sheets API

1. Open [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or use an existing one).
3. Go to **APIs & Services → Enable APIs** → search for **Google Sheets API** → Enable.
4. Also enable **Google Drive API** (same steps).
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
6. Application type: **Desktop app**.  Name it anything.
7. Click **Download JSON** → save the file as `credentials/credentials.json` inside
   this project folder.

### Step 5 — Run the setup test (authorises Google + verifies connections)

```bash
node setup.js
```

On first run, it will print a URL.  Open that URL in your browser, sign in
with your Google account, grant access, and paste the authorisation code back
into the terminal.  A token is saved to `credentials/token.json` — after this
the script runs fully unattended.

Expected output:
```
✓ APOLLO_API_KEY is set
✓ GOOGLE_SHEET_ID is set
✓ Apollo.io connected — 25 result(s) returned
✓ OAuth client authorised
✓ Header row verified
✓ Spreadsheet connected — 0 existing businesses on record
══ All systems go! ══
```

---

## Running the Workflow

| Command            | What it does                              |
|--------------------|-------------------------------------------|
| `node setup.js`    | Connection test + first-time Google auth  |
| `node run-now.js`  | Pull leads immediately (no waiting)       |
| `node index.js`    | Start the 7 AM daily scheduler (stays running) |

### Keep the scheduler alive 24/7 (recommended)

Install [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save          # auto-restart on reboot
pm2 logs hvac-leads   # watch live output
```

Or use a system cron job if you prefer not to run a Node process:

```
# crontab -e
0 7 * * * cd /path/to/lead-gen-workflow && node run-now.js >> cron.log 2>&1
```

---

## Customising the Search

All search parameters live in **`config.js`** — no need to touch other files.

| Setting              | What to change                                      |
|----------------------|-----------------------------------------------------|
| `CITIES`             | Add / remove cities to expand your territory        |
| `INDUSTRY_KEYWORDS`  | Add more trades (e.g. "electrician", "roofer")      |
| `TARGET_TITLES`      | Add titles like "Vice President", "Operations Mgr"  |
| `EMPLOYEE_RANGE`     | `'1,50'` to catch slightly larger companies         |
| `MAX_LEADS_PER_RUN`  | Increase if you want more per day                   |
| `CRON_SCHEDULE`      | Change the time (cron syntax)                       |

### Targeting more industries

Open `apollo.js` and add Apollo industry tag IDs to `INDUSTRY_TAG_IDS[]`:

1. In your Apollo account, go to **Search → People → Filters → Industry**.
2. Select your target industries, then open **DevTools → Network**.
3. Trigger a search and find the `mixed_people/search` request.
4. Copy the `organization_industry_tag_ids` values from the request body.
5. Paste them into `INDUSTRY_TAG_IDS` in `apollo.js`.

---

## Error Handling

- All errors are written to `error.log` in this folder with timestamps.
- A prominent console alert is printed so cron logs catch it.
- To add email alerts, implement `notifyByEmail()` in `logger.js`
  (Nodemailer setup instructions are in the comments there).

---

## Apollo Plan Notes

| Plan   | Price    | People searches/mo |
|--------|----------|--------------------|
| Free   | $0       | 50                 |
| Basic  | $49/mo   | 1,000              |
| Pro    | $99/mo   | 2,000+             |

At 25 leads/day × 30 days = 750 searches/month — the **Basic plan** covers
the full month with room to spare.
