# HVAC Lead Generation — Apollo.io → Google Sheets (Node.js)

An automated daily lead pipeline that searches Apollo.io for HVAC/Plumbing owners in
Southwest Michigan, deduplicates against your existing sheet, and appends up to 25 new
rows every morning at 7 AM Eastern Time.

---

## Quick Start

```
git clone <this-repo>
cd <this-repo>
cp .env.example .env          # fill in your API keys (see Setup below)
npm install
npm run test-connection       # verify both APIs work before first run
RUN_NOW=true npm start        # run one cycle immediately, then keep scheduling
```

---

## Files

| File | Purpose |
|---|---|
| `index.js` | Scheduler + orchestrator (entry point) |
| `test-connection.js` | One-time connectivity test — run before first scheduled run |
| `src/apollo.js` | Apollo.io People Search API wrapper |
| `src/sheets.js` | Google Sheets read / append via service account |
| `src/mailer.js` | Optional email alerts on failure |
| `.env.example` | Template for environment variables |

---

## Setup

### 1. Apollo.io API Key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Set `APOLLO_API_KEY=...` in your `.env`

> **Plan note:** The People Search endpoint is available on all plans. Phone numbers
> are returned when available in Apollo's database — free tier may show fewer phones.
> For maximum phone coverage, a Basic plan ($49/mo) is recommended.

---

### 2. Google Sheets Service Account

A service account lets the script write to your sheet without browser OAuth prompts —
essential for a cron job that runs while you sleep.

**Step 1 — Create a Google Cloud project (skip if you have one)**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project picker → **New Project** → give it a name → Create

**Step 2 — Enable the Sheets API**

1. In your project: **APIs & Services → Enable APIs and Services**
2. Search for **Google Sheets API** → Enable

**Step 3 — Create a service account**

1. **IAM & Admin → Service Accounts → Create Service Account**
2. Name it (e.g. `hvac-lead-gen`) — no project roles needed → Done
3. Click the account you just created → **Keys** tab
4. **Add Key → Create New Key → JSON** → download saves as `...json`
5. Rename/move it to the project root as `google-credentials.json`

**Step 4 — Share your spreadsheet**

1. Open (or create) the Google Sheet you want to write to
2. Click **Share** → paste in the service account email from the JSON file
   (it looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
3. Give it **Editor** access → Send
4. Copy the spreadsheet ID from the URL and set `GOOGLE_SPREADSHEET_ID=...` in `.env`

**Sheet structure (columns A–I):**

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

The script creates the header row automatically on first run if the sheet is empty.

---

### 3. Email Alerts (optional)

To receive an email when a run fails:

1. Create a Gmail App Password:
   - [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Select **Mail** + **Other** → generate → copy the 16-character password
2. Set in `.env`:
   ```
   ALERT_EMAIL=jgagliardo98@gmail.com
   SMTP_USER=your_gmail@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx   # 16-char app password, spaces OK
   ```

---

### 4. First-Run Verification

After filling in `.env`, run the connection test:

```bash
npm run test-connection
```

Expected output:
```
  ✓ API key found (abc12345...)
  ✓ Apollo.io connected — test search returned 47 total available results
  ✓ Service account: hvac-lead-gen@your-project.iam.gserviceaccount.com
  ✓ Spreadsheet accessible — 0 existing lead(s) found
  ✓ Sheet tab: "Leads"

  Apollo.io:      CONNECTED ✓
  Google Sheets:  CONNECTED ✓
  Email Alerts:   CONFIGURED ✓
```

If either check fails, the script prints what to fix before exiting.

---

### 5. Running the Scheduler

```bash
# Start — stays running, fires at 7 AM ET every day
npm start

# Run one cycle right now AND keep the daily schedule
RUN_NOW=true npm start

# Run a single cycle and exit (useful for manual tests)
node -e "require('dotenv').config(); require('./src/apollo').searchLeads().then(r => console.log(r.leads.length + ' leads found'))"
```

**To run as a background process on Linux/Mac:**
```bash
nohup npm start >> lead-gen.log 2>&1 &
```

---

## Customising the Search

All the easy-to-change settings live at the top of each source file:

| What to change | File | Variable |
|---|---|---|
| Cities / geography | `src/apollo.js` | `TARGET_CITIES` |
| Industry keywords | `src/apollo.js` | `INDUSTRY_KEYWORDS` |
| Job title priority | `src/apollo.js` | `TITLE_PRIORITY` |
| Max leads per run | `index.js` | `MAX_LEADS_PER_RUN` |
| Sheet column order | `src/sheets.js` | `HEADERS` |
| Cron schedule | `index.js` | `CRON_SCHEDULE` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Apollo returns 0 results | API key wrong / plan limit | Check `APOLLO_API_KEY`, try a broader keyword |
| Apollo returns 401/403 | Invalid key | Regenerate key at apollo.io → Settings → API |
| Sheets returns 404 | Wrong spreadsheet ID | Re-copy the ID from the URL |
| Sheets returns 403 | Service account not shared | Share the sheet with the service account email (Editor) |
| Phone numbers missing | Apollo's database coverage | Normal — Apollo's phone data varies; enrichment credits improve yield |
| "Cannot find module" errors | Dependencies not installed | Run `npm install` |

---

---

# n8n Business Outreach Agent

An automated lead generation and ringless voicemail outreach system built on n8n.
It scrapes local business phone numbers via Apify, scores leads with AI, logs everything
to Google Sheets, and drops a ringless voicemail on each qualified prospect.

---

## How It Works (Full Flow)

```
Manual Trigger
     │
     ▼
Search Config  ◄── Set your niche + city here
     │
     ▼
Apify Scrape   ◄── Hits Google Maps, returns up to 50 businesses
     │
     ▼  (waits 3 min for Apify to finish)
     │
     ▼
Process Leads  ◄── Cleans data, filters out businesses with no phone
     │
     ▼
Google Sheets Check  ◄── Reads existing rows to avoid re-contacting
     │
     ▼
Filter Duplicates  ◄── Drops any phone # already in your sheet
     │
     ▼
Any New Leads? ─── No ──► Stop (change city/niche and retry)
     │
    Yes
     │
     ▼
Add to Google Sheets  ◄── Appends all new leads with status "New"
     │
     ▼
Get Uncontacted Leads  ◄── Re-reads sheet, filter: VM Sent = No
     │
     ▼
Loop Each Lead
     │
     ▼
AI Scoring (GPT-4o-mini)
   • High / Medium / Low priority
   • Personalized voicemail hook
   • Skip flag for chains/franchises
     │
     ├── skipOutreach = true  ──► Skip
     │
     ▼
Drop Cowboy API  ◄── Sends ringless voicemail (no phone rings)
     │
     ▼  (2s rate limit pause)
     │
     ▼
Update Google Sheet  ◄── Marks VM Sent = Yes, Status = Contacted
     │
     ▼
Loop back → next lead
```

---

## What You Need Before Starting

### Accounts / Services

| Service | What For | Cost |
|---|---|---|
| [Apify](https://apify.com) | Scrape Google Maps business data | Free tier works; ~$5/mo for heavy use |
| [Drop Cowboy](https://dropcowboy.com) | Ringless voicemail delivery | ~$0.05–0.10 per VM |
| [Google Sheets](https://sheets.google.com) | Lead tracking & CRM | Free |
| [OpenAI](https://platform.openai.com) | AI lead scoring | ~$0.01 per 10 leads (GPT-4o-mini) |
| [n8n](https://n8n.io) | Workflow automation | Free self-hosted or $20/mo cloud |

> **Alternative to OpenAI:** You can swap the AI node for Claude (Anthropic) or skip AI
> scoring entirely and remove that step.

---

## Step-by-Step Setup

### 1. Create Your Google Sheet

Create a new Google Sheet and name the first tab **Leads**.

Add these exact column headers in row 1 (A through S):

```
A: Business Name
B: Owner Name
C: Phone
D: Phone Type
E: Owner Mobile (Apollo)
F: Business Phone
G: Address
H: City
I: State
J: Website
K: Rating
L: Review Count
M: Category
N: Google Maps URL
O: Date Added
P: VM Sent
Q: VM Date
R: Status
S: Notes
```

**Phone Type** values the workflow will fill in automatically:
- `Owner Mobile` — Apollo found their personal cell (best)
- `Owner Direct` — Apollo found a direct line (great)
- `Apollo Found` — Apollo found a number, type unclear
- `Owner-Operated (Business #)` — under 30 reviews, owner likely answers themselves
- `Business Line (Screened)` — larger business, receptionist risk

Copy the Sheet ID from the URL:
`https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit`

### 2. Record Your Voicemail

Record a short voicemail (20–30 seconds). See `voicemail-scripts.md` for proven scripts.

- Save as MP3
- Host it somewhere publicly accessible:
  - Upload to Google Drive (get shareable link)
  - Upload to Dropbox (get direct link ending in `?dl=1`)
  - Upload to any web host / S3 bucket

### 3. Import the Workflow into n8n

1. Open your n8n instance
2. Click **Workflows** → **Import from file**
3. Select `n8n-business-outreach-workflow.json`
4. The workflow opens — do NOT activate it yet

### 4. Add Your Credentials

In n8n, go to **Credentials** and create:

**Google Sheets OAuth2**
- Type: `Google Sheets OAuth2 API`
- Follow the OAuth flow to connect your Google account

**OpenAI API**
- Type: `OpenAI API`
- API Key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

**Apify API Token**
- Paste directly into the two Apify HTTP Request nodes (replace `YOUR_APIFY_API_TOKEN`)
- Get it from [console.apify.com/account/integrations](https://console.apify.com/account/integrations)

**Apollo.io API Key**
- Add to the `Search Config` node in the `apolloApiKey` field
- Get it from [developer.apollo.io](https://developer.apollo.io) → API Keys
- Free tier: 50 enrichments/month | Basic ($49/mo): 1,000/month

**Drop Cowboy Token**
- Paste directly into the `Drop Cowboy – Send Ringless VM` HTTP Request node body
- Get your token from your Drop Cowboy account settings

### 5. Configure the Search Config Node

Open the **Search Config** node and update:

| Field | Example | Description |
|---|---|---|
| `searchQuery` | `"HVAC contractors in Phoenix AZ"` | What Apify searches on Google Maps |
| `maxResults` | `50` | How many businesses to scrape (max 100 free) |
| `niche` | `"hvac"` | Label for categorizing leads in your sheet |
| `city` | `"Phoenix"` | City label saved to sheet |
| `state` | `"AZ"` | State label saved to sheet |
| `callerID` | `"4805551234"` | Your 10-digit phone number (shows on VM) |
| `voicemailAudioURL` | `"https://..."` | Direct URL to your hosted MP3 |

### 6. Update Google Sheet ID in All Sheet Nodes

There are 4 Google Sheets nodes. Open each one and replace `YOUR_GOOGLE_SHEET_ID`
with your actual sheet ID (from step 1).

Nodes to update:
- `Google Sheets – Read Existing`
- `Google Sheets – Add New Leads`
- `Google Sheets – Get Uncontacted`
- `Google Sheets – Mark VM Sent`

### 7. Update API Tokens in HTTP Request Nodes

Replace these placeholder strings directly in the node bodies/params:
- `YOUR_APIFY_API_TOKEN` — in both Apify HTTP Request nodes
- `YOUR_DROP_COWBOY_TOKEN` — in the Drop Cowboy VM node

### 7. Test Run

1. Click **Execute Workflow** (manual run — does NOT activate the schedule)
2. Watch the execution log on the right panel
3. Check your Google Sheet — new leads should appear
4. Check your Drop Cowboy account — VMs should show as queued/sent
5. If errors appear, check the specific failing node for details

---

## Customizing Your Search Targets

To run against multiple niches/cities, run the workflow multiple times with different
Search Config values, OR duplicate the workflow for each niche.

**Good niches for AI automation pitching:**
- Plumbers, HVAC, electricians (high revenue, low tech)
- Landscapers, roofers, general contractors
- Dentists, chiropractors, med spas
- Real estate agents and brokers
- Auto repair shops
- Law firms (small/solo practices)
- Restaurants (avoid chains — filter already built in)

**Search query format:**
```
"{niche} in {city} {state}"

Examples:
"plumbers in Austin TX"
"dentists in Miami FL"
"HVAC contractors in Chicago IL"
"roofing companies in Seattle WA"
```

---

## Google Sheet as Your CRM

Once leads are in the sheet, update the **Status** column manually as you get callbacks:

| Status | Meaning |
|---|---|
| `New` | Just scraped, not yet contacted |
| `Contacted` | VM sent |
| `Interested` | Called back — follow up |
| `Not Interested` | Remove from future outreach |
| `Proposal Sent` | You've sent them a proposal |
| `Closed` | Won the deal |
| `No Answer` | Called back, didn't pick up — retry later |

You can add a **Google Sheets filter view** to see only "Interested" leads at a glance.

---

## AI Scoring Explained

The AI node (GPT-4o-mini) evaluates each lead and returns:

- **Priority: High** — Small local business, few reviews, basic/no website. Most likely
  to need automation help. Send VM immediately.
- **Priority: Medium** — Established local business. May already have some systems.
  Still worth contacting.
- **Priority: Low** — Moderate size, decent online presence. Lower urgency.
- **skipOutreach: true** — Chain, franchise, or clearly tech-forward. Workflow skips
  sending a VM and moves to the next lead.

The AI also generates a **personalized hook** for each lead type. While the current
workflow uses one universal audio file for the VM, you can use the hook text to
record different versions of your voicemail targeted at different industries.

---

## Drop Cowboy Notes

- Ringless voicemails go directly to voicemail without ringing the phone
- Delivery is not instant — typically 5–60 minutes
- Opt-out compliance: Drop Cowboy handles TCPA compliance but you are responsible
  for maintaining your do-not-contact list. The Google Sheet acts as your DNC tracker.
- The 2-second rate limit between VMs is intentional — respect provider limits.

---

## Optional Enhancements

**Add a Schedule Trigger** — Run automatically every Monday morning:
- Replace `Manual Trigger` with `Schedule Trigger`
- Set to run weekly

**Add Email Enrichment** — Before sending VMs, run leads through
[Hunter.io](https://hunter.io) or [Apollo.io](https://apollo.io) to find email
addresses for a multi-channel approach.

**Add SMS Follow-up** — After VM, send a follow-up SMS via Twilio 24 hours later
using a separate workflow triggered by a Google Sheets row change.

**Slack Notification** — Add a Slack node at the end to notify you when a batch
completes with a summary (X leads added, Y VMs sent).

**Callback Tracking** — Use a Twilio phone number as your caller ID and set up
a separate n8n webhook workflow to log inbound calls back to your Google Sheet.

---

## Troubleshooting

**Apify returns no results**
- Check your API token
- Try a broader search query (less specific city/niche)
- Apify free tier has monthly compute limits — check your usage

**Google Sheets errors**
- Make sure OAuth is connected and the sheet ID is correct
- Column headers must match exactly (case-sensitive)

**Drop Cowboy 4xx error**
- Verify your API token in the HTTP Request node body
- Check that the audio URL is publicly accessible (test it in your browser)
- Phone numbers must be 10 digits, US numbers only (unless you have an intl plan)

**AI node fails**
- Check your OpenAI API key and billing status
- You can disable the AI node and connect `Loop Each Lead` directly to `Skip This Lead?`
  with a hardcoded `skipOutreach: false` if you want to skip AI scoring

---

## Legal / Compliance Notes

- Ringless voicemail is subject to TCPA regulations. Consult legal counsel for
  your specific state and use case.
- Keep your Google Sheet as your Do Not Call list and check it before each run.
- B2B outreach (business to business) generally has more relaxed regulations than B2C.
- Do not misrepresent yourself in voicemails.
