// Script: clona un pedido por cada tipo de e-CF y lo emite via API DGII
// Objetivo: Verificar que los 10 tipos (E31-E47) obtienen ACEPTADO en DGII

const http = require('http');

const MYSQL_HOST = process.env.DB_HOST || 'localhost';
const MYSQL_USER = process.env.DB_USER || 'root';
const MYSQL_PASS = process.env.DB_PASS || 'Emma123*';
const MYSQL_DB = process.env.DB_NAME || 'FlexiPOS';
const API_BASE = 'http://localhost:3000';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const mysql = require('mysql2/promise');

// Pedidos base (plantilla) para clonar, uno por tipo
// Estos son los ultimos ACEPTADOS que ya funcionaron
const PLANTILLAS = [
  { tipo: 'E31', plantillaId: 206 }, // Credito Fiscal >= 250k
  { tipo: 'E32', plantillaId: 215 }, // Consumo < 250k (RFCE)
  { tipo: 'E33', plantillaId: 204 }, // Nota Credito
  { tipo: 'E34', plantillaId: 208 }, // Nota Debito (referencia E41)
  { tipo: 'E41', plantillaId: 209 }, // Compras
  { tipo: 'E43', plantillaId: 210 }, // Gastos Menores
  { tipo: 'E44', plantillaId: 211 }, // Regimenes Especiales
  { tipo: 'E45', plantillaId: 212 }, // Gubernamental
  { tipo: 'E46', plantillaId: 213 }, // Exportaciones
  { tipo: 'E47', plantillaId: 214 }, // Pagos al Exterior
];

async function login() {
  const body = JSON.stringify({ usuario: ADMIN_USER, password: ADMIN_PASS });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.ok && j.token) resolve(j.token);
            else reject(new Error(j.error || 'login failed'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function emitir(pedidoId, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: `/api/dgii/ecf/emitir/${pedidoId}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': token } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { resolve({ ok: false, raw: data }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function clonarPedido(conn, plantillaId, nuevoEcfTipo) {
  // 1. Obtener pedido plantilla
  const [pedidos] = await conn.query('SELECT * FROM pedidos WHERE id=?', [plantillaId]);
  if (!pedidos.length) throw new Error(`Plantilla ${plantillaId} no existe`);
  const p = pedidos[0];

  // 2. Insertar nuevo pedido con campos relevantes
  const [result] = await conn.query(
    `INSERT INTO pedidos
      (cliente, cliente_documento, tipo_comprobante, nota_credito_referencia,
       subtotal, impuesto, total, estado, estado_comprobante,
       fecha_creacion, fecha_cierre, fecha_factura,
       pago_efectivo, pago_tarjeta, pago_transferencia, pago_cambio,
       negocio_id, origen_caja, modo_servicio, cogs_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'cerrado', 'sin_emitir',
             NOW(), NOW(), NOW(),
             ?, ?, ?, 0.00,
             ?, 'caja', 'en_local', 0.00)`,
    [
      p.cliente, p.cliente_documento, nuevoEcfTipo, p.nota_credito_referencia,
      p.subtotal, p.impuesto, p.total,
      p.pago_efectivo || p.total, p.pago_tarjeta || 0, p.pago_transferencia || 0,
      p.negocio_id,
    ]
  );
  const nuevoId = result.insertId;

  // 3. Clonar detalles
  const [detalles] = await conn.query('SELECT * FROM detalle_pedido WHERE pedido_id=?', [plantillaId]);
  for (const d of detalles) {
    await conn.query(
      `INSERT INTO detalle_pedido
        (pedido_id, producto_id, cantidad, precio_unitario,
         descuento_porcentaje, descuento_monto, negocio_id,
         costo_unitario_snapshot, cogs_linea, estado_preparacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
      [
        nuevoId, d.producto_id, d.cantidad, d.precio_unitario,
        d.descuento_porcentaje || 0, d.descuento_monto || 0, d.negocio_id,
        d.costo_unitario_snapshot || 0, d.cogs_linea || 0,
      ]
    );
  }

  // Para E33 y E34, ajustar referencia al pedido nuevo equivalente
  return nuevoId;
}

async function main() {
  console.log('Conectando a MySQL...');
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASS, database: MYSQL_DB,
  });

  console.log('Login admin...');
  const token = await login();
  console.log('  Token obtenido:', token.substring(0, 12) + '...');

  const nuevosIds = {};
  const resultados = [];

  // Fase 1: crear pedidos que NO dependen de otros (E31, E32, E41, E43, E44, E45, E46, E47)
  const fase1 = PLANTILLAS.filter((p) => !['E33', 'E34'].includes(p.tipo));
  console.log('\n=== FASE 1: Clonar pedidos base ===');
  for (const t of fase1) {
    try {
      const id = await clonarPedido(conn, t.plantillaId, t.tipo);
      nuevosIds[t.tipo] = id;
      console.log(`  [${t.tipo}] clonado de ${t.plantillaId} -> nuevo pedido ${id}`);
    } catch (e) {
      console.error(`  [${t.tipo}] ERROR: ${e.message}`);
    }
  }

  // Fase 2: emitir los base en orden (E31, E32 >= 250k primero, E41-E47 al final)
  console.log('\n=== FASE 2: Emitir pedidos base ===');
  const ordenFase2 = ['E31', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47', 'E32'];
  for (const tipo of ordenFase2) {
    const id = nuevosIds[tipo];
    if (!id) continue;
    console.log(`\n  Emitiendo ${tipo} (pedido ${id})...`);
    try {
      const r = await emitir(id, token);
      const ok = r.ok || r.estado === 'ACEPTADO';
      console.log(`    -> ${r.estado || (r.ok ? 'OK' : 'FAIL')} | eNCF=${r.encf || '-'} | ${r.message || r.error || ''}`);
      resultados.push({ tipo, pedidoId: id, ok, estado: r.estado, encf: r.encf, msg: r.message || r.error });
    } catch (e) {
      console.error(`    ERROR: ${e.message}`);
      resultados.push({ tipo, pedidoId: id, ok: false, error: e.message });
    }
  }

  // Fase 3: clonar E33 y E34 (necesitan referenciar pedidos ACEPTADOS nuevos)
  console.log('\n=== FASE 3: Clonar E33 / E34 con nuevas referencias ===');
  const e31NuevoId = nuevosIds.E31;
  const e41NuevoId = nuevosIds.E41;

  if (e31NuevoId) {
    const id = await clonarPedido(conn, 204, 'E33');
    await conn.query('UPDATE pedidos SET nota_credito_referencia=? WHERE id=?', [e31NuevoId, id]);
    nuevosIds.E33 = id;
    console.log(`  [E33] clonado de 204 -> pedido ${id}, referencia a E31 (${e31NuevoId})`);
  }
  if (e41NuevoId) {
    const id = await clonarPedido(conn, 208, 'E34');
    await conn.query('UPDATE pedidos SET nota_credito_referencia=? WHERE id=?', [e41NuevoId, id]);
    nuevosIds.E34 = id;
    console.log(`  [E34] clonado de 208 -> pedido ${id}, referencia a E41 (${e41NuevoId})`);
  }

  // Fase 4: emitir E33 y E34
  console.log('\n=== FASE 4: Emitir E33 y E34 ===');
  for (const tipo of ['E33', 'E34']) {
    const id = nuevosIds[tipo];
    if (!id) continue;
    console.log(`\n  Emitiendo ${tipo} (pedido ${id})...`);
    try {
      const r = await emitir(id, token);
      const ok = r.ok || r.estado === 'ACEPTADO';
      console.log(`    -> ${r.estado || (r.ok ? 'OK' : 'FAIL')} | eNCF=${r.encf || '-'} | ${r.message || r.error || ''}`);
      resultados.push({ tipo, pedidoId: id, ok, estado: r.estado, encf: r.encf, msg: r.message || r.error });
    } catch (e) {
      console.error(`    ERROR: ${e.message}`);
      resultados.push({ tipo, pedidoId: id, ok: false, error: e.message });
    }
  }

  // Resumen
  console.log('\n===================================');
  console.log('RESUMEN FINAL');
  console.log('===================================');
  for (const r of resultados) {
    const status = r.ok ? 'ACEPTADO' : 'RECHAZADO/ERROR';
    console.log(`${r.tipo} | pedido ${r.pedidoId} | ${status} | eNCF=${r.encf || '-'}`);
    if (!r.ok) console.log(`   msg: ${r.msg || r.error}`);
  }

  await conn.end();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
