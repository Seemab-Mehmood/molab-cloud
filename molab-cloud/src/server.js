const { config } = require('./config/env');
const app = require('./app');
const { seedAdminIfConfigured } = require('./services/adminSeed');

async function main() {
  await seedAdminIfConfigured();
  app.listen(config.port, () => {
    console.log(`MOLAB Cloud backend listening on port ${config.port} (${config.nodeEnv})`);
    console.log(`Public site:  ${config.appBaseUrl}`);
    if (!config.adminRouteSecret) {
      console.log('Admin panel:  disabled (set ADMIN_ROUTE_SECRET in .env to enable)');
    }
  });
}

main().catch((e) => { console.error('Fatal startup error:', e); process.exit(1); });
