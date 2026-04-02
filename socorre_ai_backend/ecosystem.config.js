module.exports = {
  apps: [
    {
      name: 'socorre-ai-backend',
      script: 'src/server.js',
      cwd: '/var/www/socorre-ai/backend',
      instances: 'max', // Usar todos os CPUs disponíveis
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // Configurações de restart
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Logs
      log_file: '/var/log/socorre-ai/combined.log',
      out_file: '/var/log/socorre-ai/out.log',
      error_file: '/var/log/socorre-ai/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Configurações de monitoramento
      watch: false, // Desabilitar em produção
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      
      // Configurações de cluster
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Configurações de memória
      node_args: '--max-old-space-size=1024',
      
      // Configurações de rede
      wait_ready: true,
      listen_timeout: 10000,
      
      // Configurações de erro
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Configurações de ambiente
      source_map_support: true,
      
      // Configurações de merge logs
      merge_logs: true,
      
      // Configurações de timezone
      time: true
    }
  ],

  // Configurações de deploy
  deploy: {
    production: {
      user: 'root',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/socorre-ai.git',
      path: '/var/www/socorre-ai',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
