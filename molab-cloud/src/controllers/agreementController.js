const db = require('../db');
const { logAudit } = require('./sharedAudit');

const AGREEMENT_TEXT = `MOLAB Pakistan Research Data-Use Agreement — by accepting, I confirm that any
patient data I enter into MOLAB Cloud is de-identified (no names, no national
ID numbers, no direct identifiers) and that I have the appropriate authority
at my institution to submit it. I agree to allow MOLAB Pakistan to store this
de-identified data and use it for research purposes related to mathematical
oncology model development and validation. I understand model outputs are
decision-support only and require clinician review before any care decision.`;

function getAgreementText(req, res) {
  res.json({ text: AGREEMENT_TEXT });
}

function acceptAgreement(req, res) {
  const { signatureName } = req.body || {};
  if (!signatureName || !signatureName.trim()) {
    return res.status(400).json({ error: 'Type your full name as your signature to accept.' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE members SET agreement_accepted = 1, agreement_accepted_at = ?, agreement_signature_name = ?, updated_at = ? WHERE id = ?')
    .run(now, signatureName.trim(), now, req.member.id);
  logAudit('member', req.member.id, 'member.agreement_accepted', signatureName.trim());
  res.json({ message: 'Agreement accepted.', agreementAcceptedAt: now });
}

module.exports = { getAgreementText, acceptAgreement };
