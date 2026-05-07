const nodemailer = require('nodemailer');
const { config } = require('./config');
const logger = require('./logger');

async function sendEmailAlert(subject, body) {
  const { emailTo, emailFrom, emailPassword } = config.alert;

  if (!emailTo || !emailFrom || !emailPassword) {
    logger.warn('Email alert skipped — ALERT_EMAIL_* variables not configured');
    return;
  }

  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: { user: emailFrom, pass: emailPassword },
    });

    await transporter.sendMail({
      from: emailFrom,
      to: emailTo,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });

    logger.info('Email alert sent', { to: emailTo, subject });
  } catch (err) {
    // Don't throw — alerting should never crash the main workflow
    logger.error('Failed to send email alert', { error: err.message });
  }
}

async function notifyError(context, error) {
  const subject = `Error in workflow run`;
  const body = [
    `Time: ${new Date().toISOString()}`,
    `Context: ${context}`,
    `Error: ${error.message || String(error)}`,
    '',
    'Please check logs/workflow.log for full details.',
  ].join('\n');

  logger.error(`[NOTIFICATION] ${context}`, { error: error.message });
  await sendEmailAlert(subject, body);
}

async function notifySuccess(leadsAdded) {
  logger.success(`Workflow complete — ${leadsAdded} new lead(s) added`);
  // Only email on success if you want — currently just logs
}

module.exports = { notifyError, notifySuccess };
