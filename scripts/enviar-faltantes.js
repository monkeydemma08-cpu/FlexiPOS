// Envia 1 de cada tipo que esta en 0 segun el dashboard DGII
// (E31, E32>=250k, E33, E41, E43, E44, E45, E46, E47, E32 RFCE)

const http = require('http');
const mysql = require('mysql2/promise');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const PLAN = [
  { tipo: 'E31', cliente: { documento: '131903045', nombre: 'NEROZERO SRL' }, items: [{ producto_id: 36, cantidad: 4, precio: 60000 }], conItbis: true },
  { tipo: 'E32', cliente: { documento: '401000131', nombre: 'ASOCIACION POPULAR DE AHORROS Y PRESTAMOS (APAP)' }, items: [{ producto_id: 4, cantidad: 700, precio: 500 }], conItbis: true, label: 'E32>=250k' },
  { tipo: 'E32', cliente: { documento: '131903045', nombre: 'NEROZERO SRL' }, items: [{ producto_id: 1, cantidad: 12, precio: 80 }], conItbis: true, label: 'E32 RFCE' },
  { tipo: 'E33', cliente: { documento: '131903045', nombre: 'NEROZERO SRL' }, items: [{ producto_id: 4, cantidad: 1, precio: 200 }], conItbis: false, ref: 'E31' },
  { tipo: 'E41', cliente: { documento: '401000131', nombre: 'ASOCIACION POPULAR DE AHORROS Y PRESTAMOS (APAP)' }, items: [{ producto_id: 2, cantidad: 8, precio: 350 }], conItbis: true },
  { tipo: 'E43', cliente: null, items: [{ producto_id: 1, cantidad: 6, precio: 80 }], conItbis: false },
  { tipo: 'E44', cliente: { documento: '131903045', nombre: 'NEROZERO SRL' }, items: [{ producto_id: 36, cantidad: 2, precio: 800 }], conItbis: false },
  { tipo: 'E45', cliente: { documento: '401000131', nombre: 'ASOCIACION POPULAR DE AHORROS Y PRESTAMOS (APAP)' }, items: [{ producto_id: 4, cantidad: 6, precio: 280 }], conItbis: true },
  { tipo: 'E46', cliente: { documento: '131903045', nombre: 'NEROZERO SRL' }, items: [{ producto_id: 2, cantidad: 30, precio: 250 }], conItbis: false },
  { tipo: 'E47', cliente: { documento: 'EXTABC456', nombre: 'INTERNATIONAL VENDOR LLC' }, items: [{ producto_id: 4, cantidad: 1, precio: 7500 }], conItbis: false },
];

async function login() {
  const body = JSON.stringify({ usuario: ADMIN_USER, password: ADMIN_PASS });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { try { const j = JSON.parse(data); j.ok ? resolve(j.token) : reject(new Error(j.error)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function emitir(pedidoId, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port: 3000, path: `/api/dgii/ecf/emitir/${pedidoId}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': token } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ ok: false, raw: data }); } });
      }
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function crearPedido(conn, plan) {
  const subtotal = plan.items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  const impuesto = plan.conItbis ? +(subtotal * 0.18).toFixed(2) : 0;
  const total = subtotal + impuesto;
  const [result] = await conn.query(
    `INSERT INTO pedidos (cliente, cliente_documento, tipo_comprobante, subtotal, impuesto, total, estado, estado_comprobante, fecha_creacion, fecha_cierre, fecha_factura, pago_efectivo, pago_tarjeta, pago_transferencia, pago_cambio, negocio_id, origen_caja, modo_servicio, cogs_total) VALUES (?, ?, ?, ?, ?, ?, 'cerrado', 'sin_emitir', NOW(), NOW(), NOW(), ?, 0, 0, 0, 1, 'caja', 'en_local', 0)`,
    [plan.cliente?.nombre || null, plan.cliente?.documento || null, plan.tipo, subtotal, impuesto, total, total]
  );
  const pedidoId = result.insertId;
  for (const it of plan.items) {
    await conn.query(
      `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, descuento_porcentaje, descuento_monto, negocio_id, costo_unitario_snapshot, cogs_linea, estado_preparacion) VALUES (?, ?, ?, ?, 0, 0, 1, 0, 0, 'pendiente')`,
      [pedidoId, it.producto_id, it.cantidad, it.precio]
    );
  }
  return pedidoId;
}

async function main() {
  const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'Emma123*', database: 'FlexiPOS' });
  const token = await login();
  console.log('Token:', token.substring(0, 12) + '...\n');

  // Crear todos
  console.log('=== CREAR PEDIDOS ===');
  let primerE31Id = null;
  for (const plan of PLAN) {
    if (plan.ref) continue;
    plan._pedidoId = await crearPedido(conn, plan);
    console.log(`  ${plan.label || plan.tipo} -> pedido ${plan._pedidoId}`);
  }

  // Emitir base en orden
  console.log('\n=== EMITIR ===');
  const orden = ['E31', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47', 'E32'];
  const resultados = [];
  for (const tipoOrden of orden) {
    for (const plan of PLAN.filter((p) => p.tipo === tipoOrden && !p.ref)) {
      const r = await emitir(plan._pedidoId, token);
      const ok = r.ok || r.estado === 'ACEPTADO';
      const lbl = plan.label || plan.tipo;
      console.log(`  ${ok ? '✓' : '✗'} ${lbl} pedido ${plan._pedidoId} eNCF=${r.encf || '-'} ${r.message || r.error || ''}`);
      resultados.push({ ...plan, ok, encf: r.encf });
      if (ok && plan.tipo === 'E31' && !primerE31Id) primerE31Id = plan._pedidoId;
    }
  }

  // E33 nota credito
  console.log('\n=== NOTA CREDITO ===');
  const e33Plan = PLAN.find((p) => p.tipo === 'E33');
  if (e33Plan && primerE31Id) {
    const id = await crearPedido(conn, e33Plan);
    await conn.query('UPDATE pedidos SET nota_credito_referencia=? WHERE id=?', [primerE31Id, id]);
    const r = await emitir(id, token);
    const ok = r.ok || r.estado === 'ACEPTADO';
    console.log(`  ${ok ? '✓' : '✗'} E33 pedido ${id} eNCF=${r.encf || '-'} ${r.message || r.error || ''}`);
    resultados.push({ tipo: 'E33', _pedidoId: id, ok, encf: r.encf });
  }

  console.log('\n=== RESUMEN ===');
  const aceptados = resultados.filter((r) => r.ok).length;
  console.log(`${aceptados}/${resultados.length} ACEPTADOS`);
  resultados.forEach((r) => {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.label || r.tipo} | eNCF=${r.encf || '-'}`);
  });

  await conn.end();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
