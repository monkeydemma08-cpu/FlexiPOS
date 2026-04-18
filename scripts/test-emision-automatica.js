// Prueba: simula el flujo real del POS
// 1. Login admin
// 2. Crea pedido en estado 'cerrado' (como lo hacen los otros scripts) -> NO usa emision automatica
//    En su lugar usamos el endpoint REAL /api/cuentas/:id/cerrar para verificar el trigger
//
// Estrategia: insertar pedido 'en_curso', luego llamar PUT /api/cuentas/:id/cerrar
// y observar que se emita automaticamente sin pasar por /api/dgii/ecf/emitir/...

const http = require('http');
const mysql = require('mysql2/promise');

const ADMIN = { usuario: 'admin', password: 'admin123' };

function req({ path, method = 'GET', token = null, body = null }) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-session-token'] = token;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: 'localhost', port: 3000, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    r.setTimeout(60000, () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

async function login() {
  const r = await req({ path: '/api/login', method: 'POST', body: ADMIN });
  if (!r.body?.ok) throw new Error('login failed: ' + JSON.stringify(r.body));
  return r.body.token;
}

async function main() {
  const token = await login();
  console.log('[LOGIN] OK token=' + token.substring(0, 12) + '...');

  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Emma123*', database: 'FlexiPOS',
  });

  // 1. Crear pedido en_curso simulando un mostrador (estado 'pendiente_cobro' o 'en_curso')
  const cliente = { documento: '131903045', nombre: 'NEROZERO SRL' };
  const items = [{ producto_id: 36, cantidad: 2, precio: 500 }];
  const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  const itbis = +(subtotal * 0.18).toFixed(2);
  const total = subtotal + itbis;

  const [resPed] = await conn.query(
    `INSERT INTO pedidos
      (cliente, cliente_documento, tipo_comprobante,
       subtotal, impuesto, total, estado, estado_comprobante,
       fecha_creacion, fecha_listo, pago_efectivo, pago_tarjeta, pago_transferencia, pago_cambio,
       negocio_id, origen_caja, modo_servicio, cogs_total, mesa)
     VALUES (?, ?, NULL, ?, ?, ?, 'listo', 'sin_emitir',
             NOW(), NOW(), 0, 0, 0, 0, 1, 'mostrador', 'en_local', 0, 'TEST-AUTO-ECF')`,
    [cliente.nombre, cliente.documento, subtotal, itbis, total]
  );
  const pedidoId = resPed.insertId;
  console.log('[CREATE] Pedido creado id=' + pedidoId + ' total=' + total + ' estado=listo');

  for (const it of items) {
    await conn.query(
      `INSERT INTO detalle_pedido
        (pedido_id, producto_id, cantidad, precio_unitario,
         descuento_porcentaje, descuento_monto, negocio_id,
         costo_unitario_snapshot, cogs_linea, estado_preparacion)
       VALUES (?, ?, ?, ?, 0, 0, 1, 0, 0, 'pendiente')`,
      [pedidoId, it.producto_id, it.cantidad, it.precio]
    );
  }

  // El endpoint /api/cuentas/:id/cerrar acepta el propio pedido.id como cuentaId
  // (WHERE cuenta_id = ? OR id = ?)
  const finalCuentaId = pedidoId;

  // 3. Llamar al endpoint real PUT /api/cuentas/:id/cerrar con tipo_comprobante=E32
  console.log('\n[CIERRE] Llamando PUT /api/cuentas/' + finalCuentaId + '/cerrar con E32...');
  const tStart = Date.now();
  const cierreRes = await req({
    path: '/api/cuentas/' + finalCuentaId + '/cerrar',
    method: 'PUT',
    token,
    body: {
      tipo_comprobante: 'E31',
      cliente: cliente.nombre,
      cliente_documento: cliente.documento,
      generar_ncf: 0, // NCF se genera por la secuencia e-CF, no NCF tradicional
      pago: { metodo: 'efectivo', efectivo_recibido: total, tarjeta: 0, transferencia: 0, cambio: 0 },
    },
  });
  console.log('[CIERRE] Status=' + cierreRes.status + ' duracion=' + (Date.now() - tStart) + 'ms');
  console.log('[CIERRE] Respuesta:', JSON.stringify(cierreRes.body, null, 2).substring(0, 500));

  // 4. Esperar 12 segundos para que setImmediate + emision se completen
  console.log('\n[ESPERA] Esperando 12s para que se complete la emision automatica...');
  await new Promise((r) => setTimeout(r, 12000));

  // 5. Consultar estado del pedido
  const [final] = await conn.query(
    'SELECT id, estado, ecf_tipo, ecf_estado, ecf_encf, ecf_codigo_dgii, ecf_mensaje_dgii, ecf_intentos FROM pedidos WHERE id=?',
    [pedidoId]
  );
  console.log('\n[FINAL] Estado del pedido:');
  console.log(JSON.stringify(final[0], null, 2));

  if (final[0].ecf_estado === 'ACEPTADO') {
    console.log('\n[OK] Emision automatica EXITOSA');
  } else if (final[0].ecf_estado === 'PENDIENTE') {
    console.log('\n[FAIL] Quedo PENDIENTE - el trigger no se disparo');
  } else if (final[0].ecf_estado === 'RECHAZADO') {
    console.log('\n[FAIL] DGII RECHAZO el e-CF');
  } else if (final[0].ecf_estado === 'ENVIADO') {
    console.log('\n[OK?] Quedo ENVIADO - aceptado por DGII pero aun en cola, normal');
  } else {
    console.log('\n[?] Estado inesperado: ' + final[0].ecf_estado);
  }

  await conn.end();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
