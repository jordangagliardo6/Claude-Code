// ---------------------------------------------------------------------------
// Receives Apollo's asynchronous phone-number-reveal callbacks.
//
// Why this exists: Apollo does not return mobile/direct-dial numbers inline
// in search or enrichment responses. When you request reveal_phone_number on
// a People Enrichment call, Apollo looks up the number out-of-band and POSTs
// it to the webhook_url you supplied, typically within seconds. This server
// is that webhook receiver.
//
// This only matters if PHONE_REVEAL_WEBHOOK_URL is set in .env and points
// here (directly, or via a tunnel like ngrok in front of this port).
// ---------------------------------------------------------------------------

const express = require('express');
const config = require('../config');
const { resolveReveal } = require('./phoneRevealStore');
const { notifyInfo } = require('./notifier');

function startWebhookServer() {
  const app = express();
  app.use(express.json());

  app.post('/apollo/phone-webhook', (req, res) => {
    // Apollo's payload shape: { people: [ { id, phone_numbers: [...] }, ... ] }
    const people = req.body?.people || [];

    for (const person of people) {
      const bestNumber = (person.phone_numbers || [])[0]?.raw_number || null;
      resolveReveal(person.id, bestNumber);
    }

    // Always 200 quickly — Apollo just needs the ack.
    res.sendStatus(200);
  });

  app.get('/healthz', (_req, res) => res.send('ok'));

  const server = app.listen(config.webhookServerPort, () => {
    notifyInfo(`Phone reveal webhook server listening on port ${config.webhookServerPort}`);
  });

  return server;
}

module.exports = { startWebhookServer };
