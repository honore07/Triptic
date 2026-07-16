// PM2 — VPS Hostinger (pm2 start ecosystem.config.cjs --env production)
module.exports = {
  apps: [
    {
      name: 'triptic-api',
      cwd: './server',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
