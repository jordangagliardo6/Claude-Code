# Google Service Account Setup

Place your Google service account JSON file in this folder as `service-account.json`.

## How to create a service account

1. Go to https://console.cloud.google.com/
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name it anything (e.g. "lead-gen-bot")
   - Skip optional role/user steps → Done
5. Click the service account → Keys tab → Add Key → JSON
6. Download the JSON file and save it here as `service-account.json`
7. **Copy the `client_email` from the JSON file**
8. Open your Google Sheet → Share → paste that email → give Editor access

The file will look like:
```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n",
  "client_email": "lead-gen-bot@your-project.iam.gserviceaccount.com",
  ...
}
```

## IMPORTANT: Never commit this file to git

The `.gitignore` excludes `*.json` from this folder automatically.
