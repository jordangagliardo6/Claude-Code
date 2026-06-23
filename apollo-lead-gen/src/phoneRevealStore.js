// ---------------------------------------------------------------------------
// In-memory rendezvous point between the Apollo phone-reveal webhook
// (src/phoneWebhookServer.js) and the workflow code that's waiting on a
// specific person's number. Lives in the same process as the webhook
// server so no external storage is needed.
// ---------------------------------------------------------------------------

const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/**
 * Waits for a phone number reveal for the given Apollo person ID.
 * Resolves with the phone number string, or null if it times out.
 */
function waitForReveal(personId, timeoutMs) {
  return new Promise((resolve) => {
    const onReveal = (revealedPersonId, phoneNumber) => {
      if (revealedPersonId === personId) {
        clearTimeout(timer);
        resolve(phoneNumber);
      }
    };

    const timer = setTimeout(() => {
      emitter.off('reveal', onReveal);
      resolve(null);
    }, timeoutMs);

    emitter.on('reveal', onReveal);
  });
}

/**
 * Called by the webhook handler when Apollo POSTs a revealed phone number.
 */
function resolveReveal(personId, phoneNumber) {
  emitter.emit('reveal', personId, phoneNumber);
}

module.exports = { waitForReveal, resolveReveal };
