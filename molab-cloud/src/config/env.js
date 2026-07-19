require('dotenv').config();

function required(name, fallback) {
  const val = process.env[name];
  if (val === undefined || val === '') {
    if (fallback !== undefined) return fallback;
    console.warn(`[config] Warning: environment variable ${name} is not set.`);
    return '';
  }
  return val;
}

const config = {
  port: parseInt(required('PORT', '4000'), 10),
  nodeEnv: required('NODE_ENV', 'development'),
  appBaseUrl: required('APP_BASE_URL', 'http://localhost:4000'),

  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '7d'),
  verificationTokenTtlHours: parseInt(required('EMAIL_VERIFICATION_TOKEN_TTL_HOURS', '48'), 10),

  databasePath: required('DATABASE_PATH', './data/molab.db'),

  smtpHost: required('SMTP_HOST', ''),
  smtpPort: parseInt(required('SMTP_PORT', '587'), 10),
  smtpSecure: required('SMTP_SECURE', 'false') === 'true',
  smtpUser: required('SMTP_USER', ''),
  smtpPass: required('SMTP_PASS', ''),
  mailFrom: required('MAIL_FROM', 'MOLAB Cloud <no-reply@localhost>'),

  adminRouteSecret: required('ADMIN_ROUTE_SECRET', ''),
  adminAccessKey: required('ADMIN_ACCESS_KEY', ''),

  corsOrigin: required('CORS_ORIGIN', ''),
};

if (config.nodeEnv === 'production') {
  const problems = [];
  if (config.jwtSecret === 'dev-only-insecure-secret-change-me') problems.push('JWT_SECRET is still the default value.');
  if (!config.adminRouteSecret) problems.push('ADMIN_ROUTE_SECRET is not set — the admin panel will not be reachable.');
  if (!config.smtpHost) problems.push('SMTP_HOST is not set — verification emails will only be logged, not sent.');
  if (problems.length) {
    console.warn('[config] Production startup warnings:\n - ' + problems.join('\n - '));
  }
}

module.exports = { config };
