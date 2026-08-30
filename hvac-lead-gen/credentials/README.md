# Google Service Account Setup

This folder holds your Google API credentials. The file `service-account.json`
must be created here before the workflow can write to Google Sheets.

**This file is in `.gitignore` — it will NOT be committed to GitHub.**

---

## Steps

### 1. Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click **New Project** → name it "HVAC Lead Gen" (or anything you like)
3. Select the new project from the dropdown at the top

### 2. Enable the Google Sheets API

1. Go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click **Enable**

### 3. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name: `hvac-lead-gen`
4. Click **Create and Continue** → skip optional role → click **Done**

### 4. Download the JSON Key

1. Click the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key → Create new key → JSON**
4. The file downloads automatically — rename it to `service-account.json`
5. Move it into this `credentials/` folder

### 5. Share Your Spreadsheet with the Service Account

1. Open the service account JSON — find the `client_email` field.
   It will look like: `hvac-lead-gen@your-project.iam.gserviceaccount.com`
2. Open your Google Sheet
3. Click **Share** (top right)
4. Paste the service account email
5. Set permission to **Editor**
6. Uncheck "Notify people" (it's a robot, not a person)
7. Click **Share**

### 6. Get Your Spreadsheet ID

Your sheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```

The long string between `/d/` and `/edit` is your **Spreadsheet ID**.

Copy it into your `.env` file:
```
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

---

## Done

Run `node setup.js` from the project root to verify everything is connected.
