module.exports = {
  apps: [
    {
      name: 'socorre-ai-homolog-backend',
      cwd: '/var/www/socorre-ai/staging/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
