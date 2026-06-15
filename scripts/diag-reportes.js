/**
 * diag-reportes.js  (solo lectura, no cambia nada)
 *
 * Diagnostica las 2 cosas que reportaste:
 *   1) Ventas "de hoy" que no existen  -> casi seguro es zona horaria: el servidor
 *      agrupa las fechas en la zona de MySQL (UTC), pero las ventas de la NOCHE se
 *      guardan en UTC y "saltan" al día siguiente.
 *   2) 607 vs Análisis no coinciden -> el 607 SUMA la propina al total y el Análisis NO.
 *
 * Uso (en mobax):
 *   node scripts/diag-reportes.js <negocioId> [YYYY-MM]
 *   (si no pones mes, usa el mes actual)
 */
require('dotenv').config();
const db = require('../db');

(async () => {
  const negocioId = Number(process.argv[2]);
  if (!Number.isFinite(negocioId) || negocioId <= 0) {
    console.error('Uso: node scripts/diag-reportes.js <negocioId> [YYYY-MM]');
    process.exit(1);
  }
  const ym = process.argv[3] || null;

  // 1) Zona horaria de MySQL
  const tz = await db.get("SELECT @@session.time_zone AS sess, @@global.time_zone AS glob, NOW() AS now_, UTC_TIMESTAMP() AS utc_, CURDATE() AS hoy");
  console.log('== Zona horaria MySQL ==');
  console.log('  session:', tz.sess, '| global:', tz.glob);
  console.log('  NOW():', tz.now_, '| UTC_TIMESTAMP():', tz.utc_, '| CURDATE():', tz.hoy);
  const mismaHora = String(tz.now_) === String(tz.utc_);
  console.log('  -> MySQL', mismaHora ? 'está en UTC (probable causa del salto de día)' : 'NO está en UTC');

  // 2) Pedidos cuya fecha "UTC" cae HOY, mostrando su hora local RD
  console.log('\n== Pedidos cuya fecha (UTC) = HOY, con su hora local RD ==');
  const hoyRows = await db.all(
    `SELECT id, estado, total,
            COALESCE(fecha_factura, fecha_cierre, fecha_creacion) AS f_utc,
            CONVERT_TZ(COALESCE(fecha_factura, fecha_cierre, fecha_creacion), '+00:00', '-04:00') AS f_rd,
            DATE(COALESCE(fecha_factura, fecha_cierre, fecha_creacion)) AS dia_utc,
            DATE(CONVERT_TZ(COALESCE(fecha_factura, fecha_cierre, fecha_creacion), '+00:00', '-04:00')) AS dia_rd
       FROM pedidos
      WHERE negocio_id = ? AND estado = 'pagado'
        AND DATE(COALESCE(fecha_factura, fecha_cierre, fecha_creacion)) = CURDATE()
      ORDER BY id`, [negocioId]);
  if (!hoyRows.length) console.log('  (ninguno con fecha UTC = hoy)');
  hoyRows.forEach((r) => console.log(`  #${r.id}  total ${r.total}  UTC=${r.f_utc} (día ${r.dia_utc})  ->  RD=${r.f_rd} (día ${r.dia_rd})`));
  const saltaron = hoyRows.filter((r) => String(r.dia_rd) !== String(r.dia_utc));
  console.log(`  -> ${saltaron.length} de ${hoyRows.length} en realidad son de AYER en hora RD (por eso aparecen hoy).`);

  // 3) Totales del mes: 607 (con propina) vs Análisis (sin propina) -> diferencia = propina
  const filtroMes = ym
    ? `AND DATE_FORMAT(COALESCE(fecha_factura, fecha_cierre, fecha_creacion), '%Y-%m') = '${ym}'`
    : `AND DATE_FORMAT(COALESCE(fecha_factura, fecha_cierre, fecha_creacion), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`;
  const t = await db.get(
    `SELECT
       SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total_607,
       SUM(subtotal + impuesto - descuento_monto)                  AS total_analisis,
       SUM(propina_monto)                                          AS propina
     FROM pedidos WHERE negocio_id = ? AND estado = 'pagado' ${filtroMes}`, [negocioId]);
  console.log(`\n== Totales del mes ${ym || '(actual)'} ==`);
  console.log('  607 (con propina):   ', Number(t.total_607 || 0).toFixed(2));
  console.log('  Análisis (sin prop.):', Number(t.total_analisis || 0).toFixed(2));
  console.log('  Propina (diferencia):', Number(t.propina || 0).toFixed(2));
  console.log('  -> La diferencia entre 607 y Análisis debe ser exactamente la propina.');

  process.exit(0);
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
