const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/env');

let transporter = null;
if (config.smtpHost) {
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });
} else {
  console.warn('[email] SMTP_HOST not configured — emails will be logged locally instead of sent.');
}

function logDevEmail(to, subject, body) {
  const logDir = path.dirname(config.databasePath);
  const logPath = path.join(logDir, 'dev-emails.log');
  const entry = `\n--- ${new Date().toISOString()} ---\nTo: ${to}\nSubject: ${subject}\n\n${body}\n`;
  try { fs.appendFileSync(logPath, entry); } catch (e) { /* ignore in read-only environments */ }
  console.log(`[email:DEV MODE] Would send to ${to} — "${subject}"\n${body}`);
}

async function sendMail({ to, subject, text, html, replyTo }) {
  if (!transporter) {
    logDevEmail(to, subject, text || html);
    return { delivered: false, mode: 'logged' };
  }
  await transporter.sendMail({ from: config.mailFrom, to, subject, text, html, replyTo });
  return { delivered: true, mode: 'smtp' };
}

async function sendFeedbackEmail(toEmail, subjectLine, messageBody) {
  return sendMail({ to: toEmail, subject: subjectLine, text: messageBody });
}

/** Member → MOLAB admin contact form. Reply-To is set to the member's own
 *  email so the admin can just hit "reply" in their inbox. */
async function sendContactAdminEmail({ adminEmail, memberName, molabId, memberEmail, subject, message }) {
  const fullSubject = `[MOLAB Cloud Contact] ${subject}`;
  const text = `From: ${memberName} (MOLAB ID: ${molabId})
Email: ${memberEmail}

${message}`;
  return sendMail({ to: adminEmail, subject: fullSubject, text, replyTo: memberEmail });
}

module.exports = { sendMail, sendFeedbackEmail, sendContactAdminEmail };
