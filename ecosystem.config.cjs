module.exports = {
  apps: [
    {
      name: 'ai-call-backend',
      script: 'server-standalone.js',
      cwd: '/workspace/AI-Call-Front-Back-V2',
      env: {
        NODE_ENV: 'production',
        PORT: 12001
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: 'ai-call-frontend',
      script: 'npx',
      args: 'serve -s dist -l 12000 --cors',
      cwd: '/workspace/AI-Call-Front-Back-V2/frontend',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};