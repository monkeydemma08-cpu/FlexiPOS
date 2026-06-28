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
//   pm2 delete all && pm2 start ecosystem.config.js   (restart NO re-lee node_args/env)
module.exports = {
  apps: [
    {
      name: 'KANM',
      script: 'server.js',
      cwd: __dirname,

      // 1 sola instancia en modo fork. NO usar cluster aqui: cada instancia
      // duplica la RAM y este servidor solo tiene 2GB.
      instances: 1,
      exec_mode: 'fork',

      // Tope del heap de V8. Sin esto, Node cree que puede usar ~1.5GB antes
      // de hacer GC agresivo y el sistema se pone lento.
      // 512MB de heap => ~650-750MB de RSS real, que deja aire para MySQL.
      //
      // El limite va por NODE_OPTIONS (ver env, mas abajo) en vez de node_args:
      // node_args a veces NO lo aplica PM2 segun la version/modo (verificado:
      // el proceso arrancaba como "node server.js" sin el flag). NODE_OPTIONS
      // lo obedece el propio Node siempre. Dejamos node_args tambien por si
      // alguna version lo respeta (poner el flag dos veces es inofensivo).
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
        // Tope de heap REAL y confiable. Node lo respeta siempre.
        NODE_OPTIONS: '--max-old-space-size=512',
      },
    },
  ],
};
