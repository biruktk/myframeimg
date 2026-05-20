/**
 * PM2 — Next.js marketing + portal (port 3000).
 * API uses web/backend/ecosystem.config.cjs on port 3001.
 */
module.exports = {
  apps: [
    {
      name: "myframe-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
