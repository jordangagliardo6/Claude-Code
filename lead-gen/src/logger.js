'use strict';

const nodemailer = require('nodemailer');

function timestamp() {
  return new Date().toISOString();
}

function info(msg) {
  console.log(`[${timestamp()}] INFO  ${msg}`);
}

function warn(msg) {
  console.warn(`[${timestamp()}] WARN  ${msg}`);
}

async function error(msg, err, sendEmail = true) {
  const detail = err ? `\n  ${err.message || err}` : '';
  console.error(`[${timestamp()}] ERROR ${msg}${detail}`);

  if (err && err.stack) {
    console.error(err.stack);
  }

  if (sendEmail && process.env.NOTIFY_EMAIL && process.env.GMAIL_APP_PASSWORD) {
    await sendErrorEmail(msg, err);
  }
}

async function sendErrorEmail(subject, err) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_FROM,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const body = [
      `HVAC Lead Gen — Error at ${timestamp()}`,
      '',
      `Subject: ${subject}`,
      err ? `Details: ${err.message || err}` : '',
      err && err.stack ? `\nStack:\n${err.stack}` : '',
    ].join('\n');

    await transporter.sendMail({
      from: process.env.GMAIL_FROM,
      to: process.env.NOTIFY_EMAIL,
      subject: `[Lead Gen Error] ${subject}`,
      text: body,
    });

    console.log(`[${timestamp()}] INFO  Error notification sent to ${process.env.NOTIFY_EMAIL}`);
  } catch (mailErr) {
    console.error(`[${timestamp()}] ERROR Failed to send error email: ${mailErr.message}`);
  }
}

module.exports = { info, warn, error };
