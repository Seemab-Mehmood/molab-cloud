const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { config } = require('./config/env');
const { readSession } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/memberRoutes');
const patientRoutes = require('./routes/patientRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const agreementRoutes = require('./routes/agreementRoutes');
const teamRoutes = require('./routes/teamRoutes');
const communityRoutes = require('./routes/communityRoutes');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // the static frontend is same-origin vanilla JS; tighten this if you add a CSP-aware build
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (config.corsOrigin) {
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
}
app.use(readSession);
app.use('/api', apiLimiter);

// Discourage crawling of anything that isn't the public marketing pages.
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /api/\n');
});

// ---------------------------------------------------------------- public API
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/agreement', agreementRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/community', communityRoutes);

// ------------------------------------------------------- hidden admin panel
// Mounted ONLY if ADMIN_ROUTE_SECRET is configured. The path segment itself
// is part of the access control: it is never linked from the public site,
// never appears in public/ static assets, and should be treated like a
// credential (long, random, not committed to source control).
if (config.adminRouteSecret) {
  const secret = config.adminRouteSecret.replace(/^\/|\/$/g, '');

  app.use(`/api/${secret}`, adminRoutes);

  app.get(`/${secret}`, (req, res) => {
    const templatePath = path.join(__dirname, '..', 'adminPanel', 'index.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    // Inject the secret bases directly into the served page — neither value
    // is present in any file under public/, so it cannot be discovered by
    // reading the public site's source.
    html = html.replace(/__ADMIN_API_BASE__/g, `/api/${secret}`);
    html = html.replace(/__ADMIN_PANEL_BASE__/g, `/${secret}`);
    html = html.replace(/__ADMIN_ACCESS_KEY__/g, config.adminAccessKey || '');
    res.type('html').send(html);
  });
  app.use(`/${secret}/assets`, express.static(path.join(__dirname, '..', 'adminPanel', 'assets')));

  console.log(`[admin] Panel mounted at a hidden path. (Not printing the path here — check your ADMIN_ROUTE_SECRET value.)`);
} else {
  console.warn('[admin] ADMIN_ROUTE_SECRET is not set — admin panel is disabled.');
}

// -------------------------------------------------------------- public site
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
