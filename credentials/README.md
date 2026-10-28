# Google Service Account Setup

This folder holds your Google service account key file.  
**Never commit it to git** — `service-account.json` is in `.gitignore`.

---

## Steps to create the key

### 1. Create a Google Cloud project (or use an existing one)
Go to https://console.cloud.google.com and click **New Project**.

### 2. Enable the Google Sheets API
1. In the left sidebar: **APIs & Services → Library**
2. Search for **Google Sheets API** and click **Enable**

### 3. Create a service account
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Give it a name (e.g. `hvac-lead-scraper`)
4. Click **Create and Continue** → skip optional role grants → **Done**

### 4. Download the JSON key
1. Click your new service account in the list
2. Go to the **Keys** tab
3. Click **Add Key → Create new key → JSON**
4. Save the downloaded file as `credentials/service-account.json` in this folder

### 5. Share your Google Sheet with the service account
1. Open the downloaded JSON — copy the `client_email` value
   (looks like `hvac-lead-scraper@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet
3. Click **Share** (top right)
4. Paste the service account email and give it **Editor** access
5. Uncheck "Notify people" and click **Share**

That's it — the script will now be able to read and write to your sheet.
