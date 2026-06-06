/**
 * fix-fe-no-fiscal.js
 *
 * Para un negocio que NO debe usar facturación electrónica (e-CF) pero cuyas
 * ventas salieron con E31/E32 porque la config `facturacion_electronica_config.
 * habilitada` quedó en 1.
 *
 * Qué hace:
 *   1) DIAGNÓSTICO (por defecto): muestra el flag `habilitada` del negocio y
 *      lista las facturas e-CF (opcionalmente solo las de una fecha).
 *   2) --disable-fe : pone habilitada=0 (las ventas NUEVAS volverán a B02/legacy).
 *   3) --reset --apply : convierte las facturas e-CF del rango en "Sin comprobante"
 *      (editables). Hace BACKUP a un .json antes de tocar nada.
 *
 * Uso (en mobax, dentro de la carpeta del proyecto):
 *   node scripts/fix-fe-no-fiscal.js <negocioId>                  # solo diagnóstico
 *   node scripts/fix-fe-no-fiscal.js <negocioId> --fecha=2026-06-06
 *   node scripts/fix-fe-no-fiscal.js <negocioId> --disable-fe     # apaga FE (seguro/reversible)
 *   node scripts/fix-fe-no-fiscal.js <negocioId> --reset --fecha=2026-06-06 --apply
 *
 * Sin --apply, el --reset solo SIMULA (no cambia nada).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

const args = process.argv.slice(2);
const negocioId = Number(args[0]);
const flag = (name) => args.includes(`--${name}`);
const valOf = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};

const fecha = valOf('fecha'); // YYYY-MM-DD opcional
const doDisableFe = flag('disable-fe');
const doReset = flag('reset');
const apply = flag('apply');

const ECF_COLS = [
  'tipo_comprobante', 'ncf', 'ecf_tipo', 'ecf_encf', 'ecf_estado',
  'ecf_track_id', 'ecf_codigo_seguridad', 'ecf_qr_url', 'ecf_xml_firmado',
];

(async () => {
  if (!Number.isFinite(negocioId) || negocioId <= 0) {
    console.error('Uso: node scripts/fix-fe-no-fiscal.js <negocioId> [--fecha=YYYY-MM-DD] [--disable-fe] [--reset --apply]');
    process.exit(1);
  }

  // 1) Estado del flag FE
  const cfg = await db.get(
    'SELECT id, habilitada, ambiente FROM facturacion_electronica_config WHERE negocio_id = ? LIMIT 1',
    [negocioId]
  );
  console.log('=== Config facturación electrónica del negocio', negocioId, '===');
  console.log(cfg ? `habilitada=${cfg.habilitada}  ambiente=${cfg.ambiente}` : '(sin fila de config: FE nunca configurada)');

  // 2) Facturas e-CF (del rango)
  const params = [negocioId];
  let filtroFecha = '';
  if (fecha) { filtroFecha = ' AND DATE(fecha_creacion) = ?'; params.push(fecha); }
  const ecf = await db.all(
    `SELECT id, tipo_comprobante, ecf_tipo, ecf_encf, ecf_estado, fecha_creacion
       FROM pedidos
      WHERE negocio_id = ? AND (ecf_tipo IS NOT NULL OR tipo_comprobante LIKE 'E%')${filtroFecha}
      ORDER BY id`,
    params
  );
  console.log(`\n=== Facturas e-CF${fecha ? ' del ' + fecha : ''}: ${ecf.length} ===`);
  ecf.slice(0, 30).forEach((r) => console.log(` #${r.id}  ${r.ecf_tipo || r.tipo_comprobante}  ${r.ecf_encf || ''}  ${r.ecf_estado || ''}  ${r.fecha_creacion}`));
  if (ecf.length > 30) console.log(` ... y ${ecf.length - 30} más`);

  // 3) Disable FE (reversible, seguro)
  if (doDisableFe) {
    if (cfg) {
      await db.run('UPDATE facturacion_electronica_config SET habilitada = 0 WHERE negocio_id = ?', [negocioId]);
      console.log('\n[OK] FE deshabilitada (habilitada=0). Las ventas NUEVAS volverán a B02/legacy.');
    } else {
      console.log('\n[i] No hay fila de config FE; las ventas nuevas ya deberían ser B02. Nada que apagar.');
    }
  }

  // 4) Reset de facturas e-CF -> "Sin comprobante" (editables)
  if (doReset) {
    if (!ecf.length) {
      console.log('\n[i] No hay facturas e-CF en el rango. Nada que resetear.');
    } else if (!apply) {
      console.log(`\n[SIMULACIÓN] Con --apply se convertirían ${ecf.length} facturas a "Sin comprobante" (editables).`);
      console.log('             Se haría BACKUP antes. Repite el comando agregando --apply para ejecutar.');
    } else {
      // Backup completo de las columnas fiscales antes de tocar
      const ids = ecf.map((r) => r.id);
      const full = await db.all(
        `SELECT id, ${ECF_COLS.join(', ')} FROM pedidos WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const backupPath = path.join(
        __dirname,
        `backup-ecf-negocio${negocioId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );
      fs.writeFileSync(backupPath, JSON.stringify(full, null, 2), 'utf8');
      console.log(`\n[OK] Backup escrito: ${backupPath}`);

      await db.run('BEGIN');
      try {
        for (const id of ids) {
          await db.run(
            `UPDATE pedidos
                SET tipo_comprobante = 'Sin comprobante', ncf = NULL,
                    ecf_tipo = NULL, ecf_encf = NULL, ecf_estado = NULL,
                    ecf_track_id = NULL, ecf_codigo_seguridad = NULL,
                    ecf_qr_url = NULL, ecf_xml_firmado = NULL
              WHERE id = ? AND negocio_id = ?`,
            [id, negocioId]
          );
        }
        await db.run('COMMIT');
        console.log(`[OK] ${ids.length} facturas convertidas a "Sin comprobante" (ahora editables).`);
      } catch (e) {
        await db.run('ROLLBACK').catch(() => {});
        console.error('[ERROR] Reset revertido:', e?.message || e);
        process.exit(1);
      }
    }
  }

  console.log('\nListo.');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
