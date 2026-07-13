// runner.js — Main orchestration: fetch → dedup → write
//
// Flow:
//   1. Ensure the Google Sheet has a header row (first run only)
//   2. Search Apollo for HVAC prospects matching your filters
//   3. Enrich phone numbers for each prospect
//   4. Read existing business names from the sheet
//   5. Filter out duplicates
//   6. Append new leads to the sheet

const { fetchLeads } = require('./apollo');
const { getExistingBusinessNames, ensureHeaders, appendLeads } = require('./sheets');
const { notifyError, notifySuccess } = require('./notify');

async function runLeadGeneration({ dryRun = false } = {}) {
  const maxLeads = Number(process.env.MAX_LEADS_PER_RUN) || 25;

  try {
    // ── Step 1: Ensure headers exist (safe to call every run) ──────────────
    if (!dryRun) {
      await ensureHeaders();
    }

    // ── Step 2: Fetch leads from Apollo (search + phone enrichment) ─────────
    const leads = await fetchLeads(maxLeads);

    if (leads.length === 0) {
      const err = new Error(
        'Apollo returned zero leads with phone numbers. ' +
        'Check your search filters, API key, and Apollo plan limits.'
      );
      await notifyError('Empty Apollo result', err);
      return;
    }

    // ── Step 3: Deduplicate against existing sheet entries ──────────────────
    let newLeads = leads;

    if (!dryRun) {
      const existingNames = await getExistingBusinessNames();
      const before = leads.length;

      newLeads = leads.filter(
        lead => !existingNames.has(lead.businessName.trim().toLowerCase())
      );

      const skipped = before - newLeads.length;
      if (skipped > 0) {
        console.log(`Dedup: skipped ${skipped} already-in-sheet business(es).`);
      }
    }

    if (newLeads.length === 0) {
      console.log('No new leads after dedup check — sheet is already up to date.');
      return;
    }

    // ── Step 4: Write to sheet or print dry-run preview ─────────────────────
    if (dryRun) {
      console.log(`\n── DRY RUN PREVIEW (${newLeads.length} lead(s)) ────────────────────`);
      newLeads.forEach((lead, i) => {
        console.log(
          `${String(i + 1).padStart(2, '0')}. ` +
          `${lead.businessName || '(no name)'} | ` +
          `${lead.firstName} ${lead.lastName} | ` +
          `${lead.phone} | ` +
          `${lead.city} | ` +
          `${lead.website || '(no website)'}`
        );
      });
      console.log('────────────────────────────────────────────────────────\n');
      console.log('Test passed. Run "npm start" to start the daily scheduler.');
    } else {
      const written = await appendLeads(newLeads);
      await notifySuccess(written);
    }

  } catch (err) {
    await notifyError('Run failed unexpectedly', err);
    throw err; // re-throw so the caller (cron or CLI) can log/exit appropriately
  }
}

module.exports = { runLeadGeneration };
