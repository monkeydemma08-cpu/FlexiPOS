// Completa la simulacion DGII enviando los comprobantes faltantes con
// contenido VARIADO (diferentes clientes, items, montos) para evitar dedup.

const http = require('http');
const mysql = require('mysql2/promise');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

// Lo que falta segun dashboard:
// E31: 4 (0/4) | E32>=250k: 1 (1/2) | E33: 1 (0/1) | E34: 1 (1/2)
// E41: 2 (0/2) | E43: 2 (0/2) | E44: 1 (1/2) | E45: 2 (0/2)
// E46: 1 (1/2) | E47: 1 (1/2) | E32 RFCE: 3 (1/4)

// Variantes de contenido para evitar dedup:
// Para cada tipo, diferentes combinaciones de (cliente, producto, cantidad, precio)

const CLIENTES = [
  { documento: '132854111', nombre: 'KAN M REPOSTERIA Y CATERING SRL' },
  { documento: '131903045', nombre: 'NEROZERO SRL' },
  { documento: '401000131', nombre: 'ASOCIACION POPULAR DE AHORROS Y PRESTAMOS (APAP)' },
  { documento: '00102144700', nombre: 'Intec' },
];

const ITEMS = [
  { producto_id: 1, nombre: 'Cafe', precio: 50 },
  { producto_id: 2, nombre: 'batido', precio: 150 },
  { producto_id: 4, nombre: 'bizcocho', precio: 100 },
  { producto_id: 36, nombre: 'hamburguesa', precio: 400 },
];

// Plan de envios:
const PLAN = [
  // E31 (Credito Fiscal) - necesita 4
  { tipo: 'E31', cliente: CLIENTES[1], items: [{ producto_id: 36, cantidad: 5, precio: 50000 }], conItbis: true },
  { tipo: 'E31', cliente: CLIENTES[2], items: [{ producto_id: 2, cantidad: 10, precio: 75000 }], conItbis: true },
  { tipo: 'E31', cliente: CLIENTES[0], items: [{ producto_id: 4, cantidad: 3, precio: 100000 }], conItbis: true },
  { tipo: 'E31', cliente: CLIENTES[1], items: [{ producto_id: 1, cantidad: 200, precio: 1500 }], conItbis: true },

  // E32 >= 250k (Consumo grande) - necesita 1
  { tipo: 'E32', cliente: CLIENTES[2], items: [{ producto_id: 36, cantidad: 800, precio: 400 }], conItbis: true },

  // E32 < 250k (RFCE) - necesita 3
  { tipo: 'E32', cliente: CLIENTES[3], items: [{ producto_id: 1, cantidad: 10, precio: 50 }], conItbis: true },
  { tipo: 'E32', cliente: CLIENTES[0], items: [{ producto_id: 2, cantidad: 5, precio: 200 }], conItbis: true },
  { tipo: 'E32', cliente: CLIENTES[1], items: [{ producto_id: 4, cantidad: 8, precio: 150 }], conItbis: true },

  // E33 (Nota Credito) - necesita 1
  { tipo: 'E33', cliente: CLIENTES[1], items: [{ producto_id: 1, cantidad: 2, precio: 100 }], conItbis: false, ref: 'E31' },

  // E34 (Nota Debito) - necesita 1
  { tipo: 'E34', cliente: CLIENTES[2], items: [{ producto_id: 4, cantidad: 1, precio: 200 }], conItbis: true, ref: 'E41' },

  // E41 (Compras) - necesita 2
  { tipo: 'E41', cliente: CLIENTES[1], items: [{ producto_id: 2, cantidad: 5, precio: 300 }], conItbis: true },
  { tipo: 'E41', cliente: CLIENTES[2], items: [{ producto_id: 36, cantidad: 2, precio: 500 }], conItbis: true },

  // E43 (Gastos Menores) - necesita 2 (sin comprador)
  { tipo: 'E43', cliente: null, items: [{ producto_id: 1, cantidad: 4, precio: 75 }], conItbis: false },
  { tipo: 'E43', cliente: null, items: [{ producto_id: 4, cantidad: 2, precio: 250 }], conItbis: false },

  // E44 (Regimenes Especiales) - necesita 1 (exento)
  { tipo: 'E44', cliente: CLIENTES[3], items: [{ producto_id: 4, cantidad: 3, precio: 200 }], conItbis: false },

  // E45 (Gubernamental) - necesita 2
  { tipo: 'E45', cliente: CLIENTES[2], items: [{ producto_id: 36, cantidad: 5, precio: 350 }], conItbis: true },
  { tipo: 'E45', cliente: CLIENTES[1], items: [{ producto_id: 2, cantidad: 4, precio: 250 }], conItbis: true },

  // E46 (Exportaciones) - necesita 1 (exento)
  { tipo: 'E46', cliente: CLIENTES[3], items: [{ producto_id: 1, cantidad: 100, precio: 100 }], conItbis: false },

  // E47 (Pagos al Exterior) - necesita 1 (exento, servicio)
  { tipo: 'E47', cliente: { documento: 'EXT789012', nombre: 'EXTRANJERO LTDA' }, items: [{ producto_id: 4, cantidad: 1, precio: 5000 }], conItbis: false },
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

async function crearPedido(conn, plan) {
  const subtotal = plan.items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  const impuesto = plan.conItbis ? +(subtotal * 0.18).toFixed(2) : 0;
  const total = subtotal + impuesto;

  const [result] = await conn.query(
    `INSERT INTO pedidos
      (cliente, cliente_documento, tipo_comprobante,
       subtotal, impuesto, total, estado, estado_comprobante,
       fecha_creacion, fecha_cierre, fecha_factura,
       pago_efectivo, pago_tarjeta, pago_transferencia, pago_cambio,
       negocio_id, origen_caja, modo_servicio, cogs_total)
     VALUES (?, ?, ?, ?, ?, ?, 'cerrado', 'sin_emitir',
             NOW(), NOW(), NOW(),
             ?, 0, 0, 0,
             1, 'caja', 'en_local', 0)`,
    [
      plan.cliente?.nombre || null,
      plan.cliente?.documento || null,
      plan.tipo,
      subtotal, impuesto, total,
      total,
    ]
  );
  const pedidoId = result.insertId;

  for (const it of plan.items) {
    await conn.query(
      `INSERT INTO detalle_pedido
        (pedido_id, producto_id, cantidad, precio_unitario,
         descuento_porcentaje, descuento_monto, negocio_id,
         costo_unitario_snapshot, cogs_linea, estado_preparacion)
       VALUES (?, ?, ?, ?, 0, 0, 1, 0, 0, 'pendiente')`,
      [pedidoId, it.producto_id, it.cantidad, it.precio]
    );
  }

  return pedidoId;
}

async function main() {
  console.log('Conectando a MySQL...');
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Emma123*', database: 'FlexiPOS',
  });

  console.log('Login admin...');
  const token = await login();
  console.log('  Token:', token.substring(0, 12) + '...');

  // Fase 1: crear pedidos base (todos los que no son notas)
  console.log('\n=== FASE 1: Crear pedidos ===');
  const pedidos = [];
  let primerE31Id = null;
  let primerE41Id = null;

  for (const plan of PLAN) {
    if (plan.ref) continue; // saltarlas, se crean despues

    const id = await crearPedido(conn, plan);
    pedidos.push({ ...plan, pedidoId: id });
    console.log(`  ${plan.tipo} -> pedido ${id} (subtotal=${plan.items.reduce((s,it) => s + it.cantidad * it.precio, 0)})`);
  }

  // Fase 2: emitir base en orden (E31, E41-E47, E32)
  console.log('\n=== FASE 2: Emitir base ===');
  const orden = ['E31', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47', 'E32'];
  const resultados = [];
  for (const tipoOrden of orden) {
    const matches = pedidos.filter((p) => p.tipo === tipoOrden);
    for (const p of matches) {
      const r = await emitir(p.pedidoId, token);
      const ok = r.ok || r.estado === 'ACEPTADO';
      console.log(`  ${ok ? '✓' : '✗'} ${p.tipo} pedido ${p.pedidoId} eNCF=${r.encf || '-'} ${r.message || r.error || ''}`);
      resultados.push({ ...p, ok, encf: r.encf, msg: r.message || r.error });
      if (ok && p.tipo === 'E31' && !primerE31Id) primerE31Id = p.pedidoId;
      if (ok && p.tipo === 'E41' && !primerE41Id) primerE41Id = p.pedidoId;
    }
  }

  // Fase 3: crear y emitir notas (E33 ref E31, E34 ref E41)
  console.log('\n=== FASE 3: Notas ===');
  for (const plan of PLAN.filter((p) => p.ref)) {
    const refId = plan.ref === 'E31' ? primerE31Id : primerE41Id;
    if (!refId) {
      console.log(`  ⚠ ${plan.tipo}: no hay ${plan.ref} disponible`);
      continue;
    }
    const id = await crearPedido(conn, plan);
    await conn.query('UPDATE pedidos SET nota_credito_referencia=? WHERE id=?', [refId, id]);
    const r = await emitir(id, token);
    const ok = r.ok || r.estado === 'ACEPTADO';
    console.log(`  ${ok ? '✓' : '✗'} ${plan.tipo} pedido ${id} eNCF=${r.encf || '-'} ${r.message || r.error || ''}`);
    resultados.push({ ...plan, pedidoId: id, ok, encf: r.encf, msg: r.message || r.error });
  }

  // Resumen
  console.log('\n=== RESUMEN ===');
  const aceptados = resultados.filter((r) => r.ok).length;
  console.log(`Aceptados: ${aceptados}/${resultados.length}`);

  // Por tipo
  const porTipo = {};
  resultados.forEach((r) => {
    if (!porTipo[r.tipo]) porTipo[r.tipo] = { ok: 0, fail: 0 };
    porTipo[r.tipo][r.ok ? 'ok' : 'fail']++;
  });
  Object.entries(porTipo).forEach(([tipo, c]) => {
    console.log(`  ${tipo}: ${c.ok} aceptados${c.fail ? `, ${c.fail} fallidos` : ''}`);
  });

  await conn.end();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
