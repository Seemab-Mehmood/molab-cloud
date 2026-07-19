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
  console.warn('[email] SMTP_HOST not configured — verification emails will be logged locally instead of sent.');
}

function logDevEmail(to, subject, body) {
  const logDir = path.dirname(config.databasePath);
  const logPath = path.join(logDir, 'dev-emails.log');
  const entry = `\n--- ${new Date().toISOString()} ---\nTo: ${to}\nSubject: ${subject}\n\n${body}\n`;
  try { fs.appendFileSync(logPath, entry); } catch (e) { /* ignore in read-only environments */ }
  console.log(`[email:DEV MODE] Would send to ${to} — "${subject}"\n${body}`);
}

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    logDevEmail(to, subject, text || html);
    return { delivered: false, mode: 'logged' };
  }
  await transporter.sendMail({ from: config.mailFrom, to, subject, text, html });
  return { delivered: true, mode: 'smtp' };
}

async function sendVerificationEmail(toEmail, hospitalName, verifyUrl) {
  const subject = 'Verify your MOLAB Cloud representative account';
  const text = `Hello,

A MOLAB Cloud account was registered for "${hospitalName}" using this email address.

Verify your email to activate your account:
${verifyUrl}

This link expires in ${config.verificationTokenTtlHours} hours. Your hospital will also need
to be approved by a network administrator before you can register patients.

If you did not request this, you can ignore this email.

— MOLAB Cloud`;
  return sendMail({ to: toEmail, subject, text });
}

async function sendApprovalEmail(toEmail, hospitalName) {
  const subject = 'Your hospital has been approved on MOLAB Cloud';
  const text = `Hello,

"${hospitalName}" has been approved by a MOLAB Cloud network administrator. You can now
log in and begin registering patients for prognosis simulation.

— MOLAB Cloud`;
  return sendMail({ to: toEmail, subject, text });
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const subject = 'Reset your MOLAB Cloud password';
  const text = `Hello,

A password reset was requested for this account. If this was you, use the link
below (expires in 1 hour):
${resetUrl}

If you did not request this, you can ignore this email.

— MOLAB Cloud`;
  return sendMail({ to: toEmail, subject, text });
}

module.exports = { sendVerificationEmail, sendApprovalEmail, sendPasswordResetEmail };
