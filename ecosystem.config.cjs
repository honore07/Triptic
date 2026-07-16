// PM2 — VPS Hostinger (pm2 start ecosystem.config.cjs --env production)
module.exports = {
  apps: [
    {
      name: 'triptic-api',
      cwd: './server',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      // 1 instance tant que le store est in-memory (pas de DATABASE_URL/Redis
      // partagés) : le cluster fragmenterait quotas et trips entre workers.
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
