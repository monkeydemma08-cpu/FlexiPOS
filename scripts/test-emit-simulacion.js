// Envia 1 e-CF de cada tipo requerido por la simulacion DGII
// E31, E32>=250k, E32 RFCE (<250k), E34, E41, E43, E44, E45, E46, E47
// E33 ya esta en 1/1 segun dashboard, no se envia

const http = require('http');
const mysql = require('mysql2/promise');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

// Config: cada item especifica el plantilla pedido para clonar y el tipo objetivo
const PRUEBAS = [
  { tipo: 'E31', plantilla: 206, label: 'Credito Fiscal' },
  { tipo: 'E32', plantilla: 207, label: 'Consumo >= 250k', forzarTotalMin: 250000 },
  { tipo: 'E32', plantilla: 215, label: 'Consumo RFCE (<250k)' },
  { tipo: 'E34', plantilla: 208, label: 'Nota Debito', referenciaTipo: 'E41' },
  { tipo: 'E41', plantilla: 209, label: 'Compras' },
  { tipo: 'E43', plantilla: 210, label: 'Gastos Menores' },
  { tipo: 'E44', plantilla: 211, label: 'Regimenes Especiales' },
  { tipo: 'E45', plantilla: 212, label: 'Gubernamental' },
  { tipo: 'E46', plantilla: 213, label: 'Exportaciones' },
  { tipo: 'E47', plantilla: 214, label: 'Pagos al Exterior' },
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
  const [pedidos] = await conn.query('SELECT * FROM pedidos WHERE id=?', [plantillaId]);
  if (!pedidos.length) throw new Error(`Plantilla ${plantillaId} no existe`);
  const p = pedidos[0];

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

  return nuevoId;
}

async function main() {
  console.log('Conectando a MySQL...');
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Emma123*', database: 'FlexiPOS',
  });

  console.log('Login admin...');
  const token = await login();
  console.log('  Token:', token.substring(0, 12) + '...');

  const nuevosIds = {};
  const resultados = [];

  // Fase 1: clonar todos los que NO son E34 (E34 necesita referencia al E41 nuevo)
  console.log('\n=== FASE 1: Clonar pedidos base ===');
  const fase1 = PRUEBAS.filter((p) => p.tipo !== 'E34');
  for (let i = 0; i < fase1.length; i++) {
    const t = fase1[i];
    try {
      const id = await clonarPedido(conn, t.plantilla, t.tipo);
      const key = `${t.tipo}-${i}`;
      nuevosIds[key] = { id, ...t };
      console.log(`  [${t.tipo}] ${t.label}: clonado de ${t.plantilla} -> pedido ${id}`);
    } catch (e) {
      console.error(`  [${t.tipo}] ERROR: ${e.message}`);
    }
  }

  // Fase 2: emitir base (orden: E31, E41-E47, E32)
  console.log('\n=== FASE 2: Emitir pedidos base ===');
  const orden = ['E31', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47', 'E32'];
  let e41NuevoId = null;
  for (const tipoOrden of orden) {
    const matches = Object.entries(nuevosIds).filter(([k, v]) => v.tipo === tipoOrden);
    for (const [key, t] of matches) {
      console.log(`\n  Emitiendo ${t.tipo} ${t.label} (pedido ${t.id})...`);
      try {
        const r = await emitir(t.id, token);
        const ok = r.ok || r.estado === 'ACEPTADO';
        console.log(`    -> ${r.estado || (r.ok ? 'OK' : 'FAIL')} | eNCF=${r.encf || '-'} | ${r.message || r.error || ''}`);
        resultados.push({ tipo: t.tipo, label: t.label, pedidoId: t.id, ok, estado: r.estado, encf: r.encf, msg: r.message || r.error });
        if (t.tipo === 'E41' && ok) e41NuevoId = t.id;
      } catch (e) {
        console.error(`    ERROR: ${e.message}`);
        resultados.push({ tipo: t.tipo, label: t.label, pedidoId: t.id, ok: false, error: e.message });
      }
    }
  }

  // Fase 3: clonar E34 con referencia al E41 nuevo
  console.log('\n=== FASE 3: Clonar E34 y emitir ===');
  if (e41NuevoId) {
    const id = await clonarPedido(conn, 208, 'E34');
    await conn.query('UPDATE pedidos SET nota_credito_referencia=? WHERE id=?', [e41NuevoId, id]);
    console.log(`  [E34] clonado -> pedido ${id}, ref a E41 (${e41NuevoId})`);
    console.log(`\n  Emitiendo E34 Nota Debito (pedido ${id})...`);
    const r = await emitir(id, token);
    const ok = r.ok || r.estado === 'ACEPTADO';
    console.log(`    -> ${r.estado || (r.ok ? 'OK' : 'FAIL')} | eNCF=${r.encf || '-'} | ${r.message || r.error || ''}`);
    resultados.push({ tipo: 'E34', label: 'Nota Debito', pedidoId: id, ok, estado: r.estado, encf: r.encf, msg: r.message || r.error });
  } else {
    console.log('  ⚠ No se pudo emitir E34: E41 fallo');
  }

  console.log('\n===================================');
  console.log('RESUMEN FINAL');
  console.log('===================================');
  let aceptados = 0;
  for (const r of resultados) {
    const status = r.ok ? '✓ ACEPTADO' : '✗ RECHAZADO';
    console.log(`${status} | ${r.tipo} ${r.label} | pedido ${r.pedidoId} | eNCF=${r.encf || '-'}`);
    if (!r.ok) console.log(`   msg: ${r.msg || r.error}`);
    if (r.ok) aceptados++;
  }
  console.log(`\nTotal: ${aceptados}/${resultados.length} aceptados`);

  await conn.end();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
