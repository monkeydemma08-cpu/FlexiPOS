require('dotenv').config();
const { query } = require('./db-mysql');

const negocioId = 2;

const round2 = (n) => Number((Math.round((Number(n) || 0) * 100) / 100).toFixed(2));
const formatDateOnly = (date) => date.toISOString().slice(0, 10);
const formatDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const daysAgo = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
};

async function getProductos(negocioId) {
  const rows = await query(
    'SELECT id, nombre, precio, tipo_producto FROM productos WHERE negocio_id = ? AND activo = 1',
    [negocioId]
  );
  const map = new Map();
  rows.forEach((row) => map.set(row.nombre.toLowerCase(), row));
  return { rows, map };
}

async function crearPedido({ fecha, mesa, items, pago }) {
  const subtotal = round2(items.reduce((acc, item) => acc + item.precio_unitario * item.cantidad, 0));
  const impuesto = round2(subtotal * 0.18);
  const propina = 0;
  const total = round2(subtotal + impuesto + propina);

  let pagoEfectivo = 0;
  let pagoTarjeta = 0;
  let pagoTransferencia = 0;
  if (pago === 'efectivo') pagoEfectivo = total;
  if (pago === 'tarjeta') pagoTarjeta = total;
  if (pago === 'transferencia') pagoTransferencia = total;

  const cogsTotal = round2(subtotal * 0.4);

  const res = await query(
    `INSERT INTO pedidos (
      mesa, estado, subtotal, impuesto, total, descuento_monto, propina_monto,
      fecha_creacion, fecha_cierre, fecha_factura,
      pago_efectivo, pago_efectivo_entregado, pago_tarjeta, pago_transferencia, pago_cambio,
      negocio_id, cogs_total
    ) VALUES (?, 'pagado', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)` ,
    [
      mesa,
      subtotal,
      impuesto,
      total,
      propina,
      fecha,
      fecha,
      fecha,
      pagoEfectivo,
      pagoEfectivo,
      pagoTarjeta,
      pagoTransferencia,
      negocioId,
      cogsTotal,
    ]
  );

  const pedidoId = res.insertId;
  const totalItemBase = items.reduce((acc, item) => acc + item.precio_unitario * item.cantidad, 0) || 1;
  for (const item of items) {
    const itemTotal = item.precio_unitario * item.cantidad;
    const cogsLinea = round2((itemTotal / totalItemBase) * cogsTotal);
    await query(
      `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, descuento_porcentaje, descuento_monto, cantidad_descuento, negocio_id, costo_unitario_snapshot, cogs_linea)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, ?)` ,
      [pedidoId, item.producto_id, item.cantidad, item.precio_unitario, negocioId, cogsLinea]
    );
  }

  return { pedidoId, subtotal, impuesto, total };
}

async function crearCompraInventario({ fecha, proveedor, origen, metodo, aplicaItbis, itbisCapitalizable, items }) {
  const subtotal = round2(items.reduce((acc, item) => acc + item.costo_unitario * item.cantidad, 0));
  const itbis = aplicaItbis ? round2(subtotal * 0.18) : 0;
  const total = round2(subtotal + itbis);

  const res = await query(
    `INSERT INTO compras_inventario
      (fecha, proveedor, origen_fondos, metodo_pago, total, observaciones, negocio_id, subtotal, itbis, aplica_itbis, itbis_capitalizable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fecha,
      proveedor,
      origen,
      metodo,
      total,
      'Compra de ejemplo',
      negocioId,
      subtotal,
      itbis,
      aplicaItbis ? 1 : 0,
      itbisCapitalizable ? 1 : 0,
    ]
  );

  const compraId = res.insertId;
  for (const item of items) {
    const totalLinea = round2(item.costo_unitario * item.cantidad);
    await query(
      `INSERT INTO compras_inventario_detalle
       (compra_id, producto_id, cantidad, costo_unitario, total_linea, negocio_id,
        costo_unitario_sin_itbis, costo_unitario_efectivo, itbis_aplica, itbis_capitalizable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        compraId,
        item.producto_id,
        item.cantidad,
        item.costo_unitario,
        totalLinea,
        negocioId,
        item.costo_unitario,
        item.costo_unitario,
        aplicaItbis ? 1 : 0,
        itbisCapitalizable ? 1 : 0,
      ]
    );
  }

  return { compraId, subtotal, itbis, total };
}

async function crearGasto({ fecha, monto, categoria, metodo, origen }) {
  await query(
    `INSERT INTO gastos (fecha, monto, categoria, metodo_pago, descripcion, negocio_id, origen)
     VALUES (?, ?, ?, ?, ?, ?, ?)` ,
    [fecha, monto, categoria, metodo, `Gasto ejemplo ${categoria}`, negocioId, origen]
  );
}

async function asegurarCliente() {
  const existing = await query('SELECT id FROM clientes WHERE negocio_id = ? AND nombre = ? LIMIT 1', [negocioId, 'Juan Perez']);
  if (existing.length) return existing[0].id;
  const res = await query(
    `INSERT INTO clientes (nombre, documento, tipo_documento, telefono, activo, creado_en, negocio_id)
     VALUES (?, ?, ?, ?, 1, NOW(), ?)` ,
    ['Juan Perez', '001-1234567-8', 'CEDULA', '8095551234', negocioId]
  );
  return res.insertId;
}

async function crearCxcEjemplo({ fechaDeuda, fechaAbono }) {
  const clienteId = await asegurarCliente();
  const deudaRes = await query(
    `INSERT INTO clientes_deudas (cliente_id, negocio_id, fecha, descripcion, monto_total)
     VALUES (?, ?, ?, ?, ?)` ,
    [clienteId, negocioId, fechaDeuda, 'Servicio catering credito', 3500]
  );
  const deudaId = deudaRes.insertId;
  await query(
    `INSERT INTO clientes_abonos (deuda_id, cliente_id, negocio_id, fecha, monto, metodo_pago, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)` ,
    [deudaId, clienteId, negocioId, fechaAbono, 1500, 'transferencia', 'Abono inicial']
  );
}

async function main() {
  const negocio = await query('SELECT id, nombre, deleted_at FROM negocios WHERE id = ? LIMIT 1', [negocioId]);
  if (!negocio.length || negocio[0].deleted_at) {
    throw new Error('Negocio Pala Pizza no encontrado o eliminado.');
  }

  const { map } = await getProductos(negocioId);
  const getProd = (name) => {
    const prod = map.get(name.toLowerCase());
    if (!prod) throw new Error(`Producto no encontrado: ${name}`);
    return prod;
  };

  const counts = {
    pedidos: (await query('SELECT COUNT(*) AS c FROM pedidos WHERE negocio_id = ?', [negocioId]))[0].c,
    compras: (await query('SELECT COUNT(*) AS c FROM compras_inventario WHERE negocio_id = ?', [negocioId]))[0].c,
    gastos: (await query('SELECT COUNT(*) AS c FROM gastos WHERE negocio_id = ?', [negocioId]))[0].c,
    cxc: (await query('SELECT COUNT(*) AS c FROM clientes_deudas WHERE negocio_id = ?', [negocioId]))[0].c,
  };

  const fecha0 = formatDateTime(daysAgo(0));
  const fecha1 = formatDateTime(daysAgo(2));
  const fecha2 = formatDateTime(daysAgo(5));
  const fecha3 = formatDateTime(daysAgo(8));

  if (counts.pedidos === 0) {
    await crearPedido({
      fecha: fecha2,
      mesa: 'M-1',
      pago: 'efectivo',
      items: [
        { producto_id: getProd('Pizza Margarita').id, cantidad: 2, precio_unitario: Number(getProd('Pizza Margarita').precio) },
        { producto_id: getProd('Refresco 355ml').id, cantidad: 1, precio_unitario: Number(getProd('Refresco 355ml').precio) },
      ],
    });
    await crearPedido({
      fecha: fecha1,
      mesa: 'M-2',
      pago: 'tarjeta',
      items: [
        { producto_id: getProd('Pizza Pepperoni').id, cantidad: 1, precio_unitario: Number(getProd('Pizza Pepperoni').precio) },
        { producto_id: getProd('Agua embotellada').id, cantidad: 2, precio_unitario: Number(getProd('Agua embotellada').precio) },
      ],
    });
    await crearPedido({
      fecha: fecha0,
      mesa: 'M-3',
      pago: 'transferencia',
      items: [
        { producto_id: getProd('Pizza Jamon').id, cantidad: 1, precio_unitario: Number(getProd('Pizza Jamon').precio) },
        { producto_id: getProd('Refresco 355ml').id, cantidad: 1, precio_unitario: Number(getProd('Refresco 355ml').precio) },
      ],
    });
  }

  if (counts.compras === 0) {
    await crearCompraInventario({
      fecha: fecha3,
      proveedor: 'Insumos La 27',
      origen: 'caja',
      metodo: 'efectivo',
      aplicaItbis: true,
      itbisCapitalizable: false,
      items: [
        { producto_id: getProd('Harina de trigo').id, cantidad: 10, costo_unitario: 200 },
        { producto_id: getProd('Queso mozzarella').id, cantidad: 5, costo_unitario: 300 },
        { producto_id: getProd('Salsa de tomate').id, cantidad: 6, costo_unitario: 120 },
      ],
    });
    await crearCompraInventario({
      fecha: fecha1,
      proveedor: 'Distribuidora Central',
      origen: 'banco',
      metodo: 'transferencia',
      aplicaItbis: false,
      itbisCapitalizable: false,
      items: [
        { producto_id: getProd('Caja de pizza').id, cantidad: 30, costo_unitario: 25 },
        { producto_id: getProd('Oregano').id, cantidad: 8, costo_unitario: 50 },
        { producto_id: getProd('Sal').id, cantidad: 10, costo_unitario: 15 },
      ],
    });
  }

  if (counts.gastos === 0) {
    await crearGasto({ fecha: formatDateOnly(daysAgo(6)), monto: 12000, categoria: 'Alquiler', metodo: 'transferencia', origen: 'banco' });
    await crearGasto({ fecha: formatDateOnly(daysAgo(3)), monto: 2500, categoria: 'Marketing', metodo: 'efectivo', origen: 'caja' });
    await crearGasto({ fecha: formatDateOnly(daysAgo(1)), monto: 15000, categoria: 'Nomina', metodo: 'transferencia', origen: 'banco' });
  }

  if (counts.cxc === 0) {
    await crearCxcEjemplo({ fechaDeuda: formatDateOnly(daysAgo(2)), fechaAbono: formatDateOnly(daysAgo(0)) });
  }

  const resumen = {
    pedidos: (await query('SELECT COUNT(*) AS c FROM pedidos WHERE negocio_id = ?', [negocioId]))[0].c,
    compras: (await query('SELECT COUNT(*) AS c FROM compras_inventario WHERE negocio_id = ?', [negocioId]))[0].c,
    gastos: (await query('SELECT COUNT(*) AS c FROM gastos WHERE negocio_id = ?', [negocioId]))[0].c,
    cxc: (await query('SELECT COUNT(*) AS c FROM clientes_deudas WHERE negocio_id = ?', [negocioId]))[0].c,
    abonos: (await query('SELECT COUNT(*) AS c FROM clientes_abonos WHERE negocio_id = ?', [negocioId]))[0].c,
  };

  console.log('Seed contabilidad Pala Pizza completado:', resumen);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seed contabilidad:', err);
    process.exit(1);
  });
