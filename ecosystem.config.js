// Configuracion de PM2 para POSIUM.
// Objetivo: mantener el consumo de RAM controlado en el Droplet de 2GB.
//
// Como usarlo en el servidor (una sola vez):
//   cd ~/KANM
//   pm2 delete all          # borra el proceso viejo arrancado a mano
//   pm2 start ecosystem.config.js
//   pm2 save                # guarda para que reinicie solo al bootear
//
// De ahi en adelante, para actualizar tras un git pull:
//   pm2 reload ecosystem.config.js   (o: pm2 restart posium)
module.exports = {
  apps: [
    {
      name: 'posium',
      script: 'server.js',
      cwd: __dirname,

      // 1 sola instancia en modo fork. NO usar cluster aqui: cada instancia
      // duplica la RAM y este servidor solo tiene 2GB.
      instances: 1,
      exec_mode: 'fork',

      // Tope del heap de V8. Sin esto, Node cree que puede usar ~1.5GB antes
      // de hacer GC agresivo y, como el swap es 0, el sistema se pone lento.
      // 512MB de heap => ~650-750MB de RSS real, que deja aire para MySQL.
      node_args: '--max-old-space-size=512',

      // Red de seguridad: si aun asi pasa de 700MB, PM2 lo reinicia solo.
      // Esto automatiza el "pm2 restart all" que hacias a mano.
      max_memory_restart: '700M',

      autorestart: true,
      // Evita bucles de reinicio si el proceso crashea al arrancar.
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 3000,

      // Logs con fecha, en la carpeta logs/ que ya existe en el repo.
      error_file: 'logs/posium_stderr.log',
      out_file: 'logs/posium_stdout.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
