// PM2 — VPS Hostinger (pm2 start ecosystem.config.cjs --env production)
module.exports = {
  apps: [
    {
      name: 'triptic-api',
      cwd: './server',
      // node --import tsx : .bin/tsx est un script shell sous Linux,
      // PM2 ne peut pas l'exécuter directement comme du JS.
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
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
