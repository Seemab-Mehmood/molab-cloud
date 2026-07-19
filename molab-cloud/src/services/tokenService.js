const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('../config/env');

function signSessionToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifySessionToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (e) {
    return null;
  }
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hoursFromNowISO(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

module.exports = { signSessionToken, verifySessionToken, generateOpaqueToken, hoursFromNowISO };
