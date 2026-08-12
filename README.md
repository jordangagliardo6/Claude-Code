# Business Outreach Automation Suite

Two complementary lead generation tools — an n8n workflow for broad Google Maps scraping
and a Node.js scheduler for targeted Apollo.io prospecting.

---

## 📁 `lead-gen/` — SW Michigan HVAC Lead Generator (Apollo.io + Google Sheets)

A Node.js cron job that runs every morning at **7 AM Eastern Time** and:
- Searches Apollo.io for HVAC / plumbing / mechanical company **owners** (1–25 employees) in Southwest Michigan
- Enriches contacts to reveal direct or mobile phone numbers
- Deduplicates against an existing Google Sheet
- Appends up to 25 new leads per run: Date Added, Business Name, Owner First/Last Name, Phone, City, Website

**Quick start:** See [`lead-gen/SETUP.md`](lead-gen/SETUP.md) for step-by-step instructions.

**Your Google Sheet (already created):**
https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit

---

## 📁 n8n Business Outreach Agent

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
