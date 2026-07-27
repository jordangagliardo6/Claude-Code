/**
 * notify.js — Error notification
 *
 * Logs errors to the console. If SMTP credentials and ALERT_EMAIL are set,
 * also emails the error so you know to check it manually.
 *
 * To enable email alerts:
 *   1. Set ALERT_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env
 *   2. Run: npm install nodemailer
 *   3. Uncomment the nodemailer block below.
 */

'use strict';

async function notifyError(context, err) {
  const msg = `[lead-gen] ERROR in ${context}: ${err.message}`;
  console.error(msg);
  if (err.stack) console.error(err.stack);

  // ── Optional: send email alert ──────────────────────────────────────────
  // Uncomment and run `npm install nodemailer` to enable.
  //
  // if (!process.env.ALERT_EMAIL || !process.env.SMTP_HOST) return;
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: Number(process.env.SMTP_PORT) || 587,
  //   secure: false,
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  //
  // await transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to: process.env.ALERT_EMAIL,
  //   subject: `[lead-gen] Error: ${context}`,
  //   text: `${msg}\n\n${err.stack || ''}`,
  // });
  // console.log(`[notify] Alert email sent to ${process.env.ALERT_EMAIL}`);
}

module.exports = { notifyError };
