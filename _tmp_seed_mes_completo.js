require('dotenv').config();
const { query } = require('./db-mysql');

const targetNombre = process.argv[2] || 'Pala Pizza';

const hoy = new Date();
const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
const finMes = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
const seedTag = `SEED-${inicioMes.getFullYear()}-${String(inicioMes.getMonth() + 1).padStart(2, '0')}`;

const round2 = (n) => Number((Math.round((Number(n) || 0) * 100) / 100).toFixed(2));
const formatDateOnly = (date) => {
  const base = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return base.toISOString().slice(0, 10);
};
const formatDateTime = (date) => {
  const base = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return base.toISOString().slice(0, 19).replace('T', ' ');
};

const getDaysInRange = (start, end) => {
  const out = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    out.push(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function tableExists(name) {
  const safe = String(name).replace(/'/g, "''");
  const rows = await query(`SHOW TABLES LIKE '${safe}'`);
  return rows.length > 0;
}

async function getColumns(name) {
  const rows = await query(`SHOW COLUMNS FROM ${name}`);
  return new Set(rows.map((row) => row.Field));
}

async function insertRow(table, data, columns) {
  const keys = Object.keys(data).filter((key) => columns.has(key));
  if (!keys.length) return { insertId: null };
  const placeholders = keys.map(() => '?').join(',');
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
  const params = keys.map((key) => data[key]);
  return query(sql, params);
}

async function ensureEmpresaProductos(empresaId) {
  if (!(await tableExists('empresa_productos'))) return 0;
  const cols = await getColumns('empresa_productos');
  const base = [
    { nombre: 'Catalogo Maestro Pizza', categoria: 'Final', tipo_producto: 'FINAL', costo_base: 250, precio_sugerido: 520 },
    { nombre: 'Catalogo Maestro Pasta', categoria: 'Final', tipo_producto: 'FINAL', costo_base: 180, precio_sugerido: 420 },
    { nombre: 'Catalogo Maestro Refresco', categoria: 'Bebidas', tipo_producto: 'FINAL', costo_base: 45, precio_sugerido: 120 },
    { nombre: 'Catalogo Maestro Harina', categoria: 'Insumos', tipo_producto: 'INSUMO', costo_base: 40, precio_sugerido: 70 },
    { nombre: 'Catalogo Maestro Queso', categoria: 'Insumos', tipo_producto: 'INSUMO', costo_base: 65, precio_sugerido: 110 },
    { nombre: 'Catalogo Maestro Salsa', categoria: 'Insumos', tipo_producto: 'INSUMO', costo_base: 30, precio_sugerido: 60 },
  ];

  let insertados = 0;
  for (const item of base) {
    const existing = await query(
      'SELECT id FROM empresa_productos WHERE empresa_id = ? AND nombre = ? LIMIT 1',
      [empresaId, item.nombre]
    );
    if (existing.length) continue;
    await insertRow(
      'empresa_productos',
      {
        empresa_id: empresaId,
        nombre: item.nombre,
        categoria: item.categoria,
        tipo_producto: item.tipo_producto,
        costo_base: item.costo_base,
        precio_sugerido: item.precio_sugerido,
        activo: 1,
      },
      cols
    );
    insertados += 1;
  }
  return insertados;
}

async function ensureEmpresaEmpleados(empresaId, negocios) {
  if (!(await tableExists('empresa_empleados'))) return { empleados: [] };
  const cols = await getColumns('empresa_empleados');
  const plantilla = [
    { nombre: 'Carlos Torres', cargo: 'Gerente', tipo_pago: 'MENSUAL', sueldo_base: 50000, ars: 3.14, afp: 1.14, isr: 10 },
    { nombre: 'Maria Garcia', cargo: 'Administracion', tipo_pago: 'QUINCENAL', sueldo_base: 32000, ars: 3.14, afp: 1.14, isr: 8 },
    { nombre: 'Luis Reyes', cargo: 'Cocina', tipo_pago: 'MENSUAL', sueldo_base: 28000, ars: 3.14, afp: 1.14, isr: 5 },
    { nombre: 'Ana Perez', cargo: 'Mesera', tipo_pago: 'HORA', tarifa_hora: 220, ars: 3.14, afp: 1.14, isr: 0 },
    { nombre: 'Pedro Cruz', cargo: 'Cajero', tipo_pago: 'QUINCENAL', sueldo_base: 26000, ars: 3.14, afp: 1.14, isr: 6 },
    { nombre: 'Rosa Diaz', cargo: 'Bar', tipo_pago: 'HORA', tarifa_hora: 200, ars: 3.14, afp: 1.14, isr: 0 },
  ];

  const empleados = [];
  for (let i = 0; i < plantilla.length; i += 1) {
    const data = plantilla[i];
    const negocioId = i < negocios.length ? negocios[i].id : null;
    const existing = await query(
      'SELECT id FROM empresa_empleados WHERE empresa_id = ? AND nombre = ? LIMIT 1',
      [empresaId, data.nombre]
    );
    if (existing.length) {
      empleados.push({ id: existing[0].id, nombre: data.nombre, negocio_id: negocioId });
      continue;
    }
    const res = await insertRow(
      'empresa_empleados',
      {
        empresa_id: empresaId,
        negocio_id: negocioId,
        nombre: data.nombre,
        documento: `001-000000${i + 1}-0`,
        telefono: `80955510${(i + 1).toString().padStart(2, '0')}`,
        cargo: data.cargo,
        tipo_pago: data.tipo_pago,
        sueldo_base: data.sueldo_base || 0,
        tarifa_hora: data.tarifa_hora || 0,
        ars_porcentaje: data.ars,
        afp_porcentaje: data.afp,
        isr_porcentaje: data.isr,
        activo: 1,
      },
      cols
    );
    empleados.push({ id: res.insertId, nombre: data.nombre, negocio_id: negocioId });
  }
  return { empleados };
}

async function seedAsistencias(empleados) {
  if (!(await tableExists('empresa_asistencias'))) return 0;
  const cols = await getColumns('empresa_asistencias');
  const dias = getDaysInRange(inicioMes, finMes).filter((d) => ![0, 6].includes(d.getDay()));
  let insertados = 0;

  for (const empleado of empleados) {
    const existing = await query(
      'SELECT id FROM empresa_asistencias WHERE empleado_id = ? AND fecha BETWEEN ? AND ? LIMIT 1',
      [empleado.id, formatDateOnly(inicioMes), formatDateOnly(finMes)]
    );
    if (existing.length) continue;

    for (let i = 0; i < dias.length; i += 1) {
      const fecha = formatDateOnly(dias[i]);
      const entrada = '08:00:00';
      const salida = empleado.nombre.includes('Ana') || empleado.nombre.includes('Rosa') ? '14:00:00' : '16:00:00';
      const horas = salida === '14:00:00' ? 6 : 8;
      await insertRow(
        'empresa_asistencias',
        {
          empleado_id: empleado.id,
          negocio_id: empleado.negocio_id,
          fecha,
          hora_entrada: entrada,
          hora_salida: salida,
          horas,
        },
        cols
      );
      insertados += 1;
    }
  }
  return insertados;
}

async function seedNominaMovimientos(empleados) {
  if (!(await tableExists('empresa_nomina_movimientos'))) return 0;
  const cols = await getColumns('empresa_nomina_movimientos');
  const fechas = [
    formatDateOnly(new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 5)),
    formatDateOnly(new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 15)),
    formatDateOnly(new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 25)),
  ];
  let insertados = 0;

  for (const empleado of empleados) {
    const base = randInt(800, 1800);
    const movimientos = [
      { tipo: 'BONO', monto: base + 200, fecha: fechas[0], notas: `${seedTag} bono puntualidad` },
      { tipo: 'COMISION', monto: base + 350, fecha: fechas[1], notas: `${seedTag} comision ventas` },
      { tipo: 'DEDUCCION', monto: randInt(200, 600), fecha: fechas[2], notas: `${seedTag} prestamo` },
    ];
    for (const mov of movimientos) {
      await insertRow(
        'empresa_nomina_movimientos',
        {
          empleado_id: empleado.id,
          negocio_id: empleado.negocio_id,
          tipo: mov.tipo,
          monto: mov.monto,
          fecha: mov.fecha,
          notas: mov.notas,
        },
        cols
      );
      insertados += 1;
    }
  }
  return insertados;
}

async function ensureProductosNegocio(negocioId, nombreNegocio) {
  if (!(await tableExists('productos'))) return { finales: [], insumos: [] };
  const cols = await getColumns('productos');
  const activos = await query(
    'SELECT id, nombre, precio, tipo_producto FROM productos WHERE negocio_id = ? AND activo = 1',
    [negocioId]
  );
  const finales = activos.filter((row) => row.tipo_producto !== 'INSUMO');
  const insumos = activos.filter((row) => row.tipo_producto === 'INSUMO');

  const crearProducto = async (data) => {
    const precioCol = cols.has('precio') ? 'precio' : cols.has('precio_base') ? 'precio_base' : null;
    const stockCol = cols.has('stock') ? 'stock' : cols.has('stock_actual') ? 'stock_actual' : null;
    const payload = {
      nombre: data.nombre,
      activo: 1,
      negocio_id: negocioId,
    };
    if (precioCol) payload[precioCol] = data.precio;
    if (stockCol) payload[stockCol] = data.stock;
    if (cols.has('tipo_producto')) payload.tipo_producto = data.tipo_producto;
    if (cols.has('insumo_vendible')) payload.insumo_vendible = data.tipo_producto === 'INSUMO' ? 1 : 0;
    if (cols.has('costo')) payload.costo = data.costo || 0;
    if (cols.has('costo_base')) payload.costo_base = data.costo || 0;
    const res = await insertRow('productos', payload, cols);
    return { id: res.insertId, nombre: data.nombre, precio: data.precio, tipo_producto: data.tipo_producto };
  };

  if (finales.length < 3) {
    const nuevos = [
      { nombre: `Pizza Clasica ${nombreNegocio}`, precio: 520, stock: 100, tipo_producto: 'FINAL', costo: 260 },
      { nombre: `Pasta Especial ${nombreNegocio}`, precio: 420, stock: 80, tipo_producto: 'FINAL', costo: 190 },
      { nombre: `Refresco 355ml ${nombreNegocio}`, precio: 120, stock: 150, tipo_producto: 'FINAL', costo: 45 },
    ];
    for (const item of nuevos) {
      const creado = await crearProducto(item);
      finales.push(creado);
    }
  }

  if (insumos.length < 3) {
    const nuevos = [
      { nombre: `Harina ${nombreNegocio}`, precio: 70, stock: 200, tipo_producto: 'INSUMO', costo: 40 },
      { nombre: `Queso ${nombreNegocio}`, precio: 110, stock: 120, tipo_producto: 'INSUMO', costo: 60 },
      { nombre: `Salsa ${nombreNegocio}`, precio: 60, stock: 160, tipo_producto: 'INSUMO', costo: 30 },
    ];
    for (const item of nuevos) {
      const creado = await crearProducto(item);
      insumos.push(creado);
    }
  }

  return { finales, insumos };
}

async function ensureReceta(negocioId, productoFinalId, insumos) {
  if (!(await tableExists('recetas')) || !(await tableExists('receta_detalle'))) return;
  const recetaCols = await getColumns('recetas');
  const detalleCols = await getColumns('receta_detalle');

  const existing = await query(
    'SELECT id FROM recetas WHERE negocio_id = ? AND producto_final_id = ? LIMIT 1',
    [negocioId, productoFinalId]
  );
  let recetaId = existing.length ? existing[0].id : null;
  if (!recetaId) {
    const res = await insertRow(
      'recetas',
      {
        negocio_id: negocioId,
        producto_final_id: productoFinalId,
        activo: 1,
      },
      recetaCols
    );
    recetaId = res.insertId;
  }
  const existentes = await query('SELECT id FROM receta_detalle WHERE receta_id = ? LIMIT 1', [recetaId]);
  if (existentes.length) return;
  for (const insumo of insumos.slice(0, 2)) {
    await insertRow(
      'receta_detalle',
      {
        receta_id: recetaId,
        insumo_id: insumo.id,
        cantidad: 1,
        unidad: 'UND',
      },
      detalleCols
    );
  }
}

async function seedPedidos(negocio, productos) {
  if (!(await tableExists('pedidos')) || !(await tableExists('detalle_pedido'))) return 0;
  const pedidosCols = await getColumns('pedidos');
  const detalleCols = await getColumns('detalle_pedido');
  const dias = getDaysInRange(inicioMes, finMes);
  let insertados = 0;

  for (let d = 0; d < dias.length; d += 1) {
    const fecha = dias[d];
    const esFin = [0, 6].includes(fecha.getDay());
    const cantidadPedidos = esFin ? 1 : 2;
    for (let p = 0; p < cantidadPedidos; p += 1) {
      const items = [];
      const itemA = productos[(d + p) % productos.length];
      const itemB = productos[(d + p + 1) % productos.length];
      items.push({ producto_id: itemA.id, precio_unitario: Number(itemA.precio || 250), cantidad: randInt(1, 3) });
      items.push({ producto_id: itemB.id, precio_unitario: Number(itemB.precio || 120), cantidad: randInt(1, 2) });

      const subtotal = round2(items.reduce((acc, item) => acc + item.precio_unitario * item.cantidad, 0));
      const impuesto = round2(subtotal * 0.18);
      const propina = 0;
      const total = round2(subtotal + impuesto + propina);
      const fechaHora = new Date(fecha.getTime());
      fechaHora.setHours(10 + p * 3, 15, 0, 0);
      const fechaStr = formatDateTime(fechaHora);
      const cogsTotal = round2(subtotal * 0.45);

      const metodoIdx = (d + p) % 3;
      const pagoEfectivo = metodoIdx === 0 ? total : 0;
      const pagoTarjeta = metodoIdx === 1 ? total : 0;
      const pagoTransferencia = metodoIdx === 2 ? total : 0;

      const res = await insertRow(
        'pedidos',
        {
          mesa: `M-${d + 1}-${p + 1}`,
          estado: 'pagado',
          subtotal,
          impuesto,
          total,
          descuento_monto: 0,
          propina_monto: propina,
          fecha_creacion: fechaStr,
          fecha_cierre: fechaStr,
          fecha_factura: fechaStr,
          pago_efectivo: pagoEfectivo,
          pago_efectivo_entregado: pagoEfectivo,
          pago_tarjeta: pagoTarjeta,
          pago_transferencia: pagoTransferencia,
          pago_cambio: 0,
          negocio_id: negocio.id,
          cogs_total: cogsTotal,
        },
        pedidosCols
      );
      const pedidoId = res.insertId;
      const totalBase = items.reduce((acc, item) => acc + item.precio_unitario * item.cantidad, 0) || 1;
      for (const item of items) {
        const itemTotal = item.precio_unitario * item.cantidad;
        const cogsLinea = round2((itemTotal / totalBase) * cogsTotal);
        await insertRow(
          'detalle_pedido',
          {
            pedido_id: pedidoId,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            descuento_porcentaje: 0,
            descuento_monto: 0,
            cantidad_descuento: 0,
            negocio_id: negocio.id,
            costo_unitario_snapshot: 0,
            cogs_linea: cogsLinea,
          },
          detalleCols
        );
      }
      insertados += 1;
    }
  }
  return insertados;
}

async function seedComprasInventario(negocio, insumos) {
  if (!(await tableExists('compras_inventario')) || !(await tableExists('compras_inventario_detalle'))) return 0;
  const compraCols = await getColumns('compras_inventario');
  const detalleCols = await getColumns('compras_inventario_detalle');
  const fechas = [
    new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 4),
    new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 11),
    new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 18),
    new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 25),
  ];
  let insertados = 0;

  for (let i = 0; i < fechas.length; i += 1) {
    const fecha = formatDateTime(fechas[i]);
    const aplicaItbis = i % 2 === 0;
    const itbisCapitalizable = i % 3 === 0;
    const items = insumos.slice(0, 3).map((insumo, idx) => ({
      producto_id: insumo.id,
      cantidad: 10 + idx * 5,
      costo_unitario: 40 + idx * 15,
    }));
    const subtotal = round2(items.reduce((acc, item) => acc + item.costo_unitario * item.cantidad, 0));
    const itbis = aplicaItbis ? round2(subtotal * 0.18) : 0;
    const total = round2(subtotal + itbis);

    const res = await insertRow(
      'compras_inventario',
      {
        fecha,
        proveedor: `Proveedor ${seedTag}`,
        origen_fondos: i % 2 === 0 ? 'banco' : 'caja',
        metodo_pago: i % 2 === 0 ? 'TRANSFERENCIA' : 'EFECTIVO',
        subtotal,
        itbis,
        aplica_itbis: aplicaItbis ? 1 : 0,
        itbis_capitalizable: itbisCapitalizable ? 1 : 0,
        total,
        observaciones: `${seedTag} compra inventario`,
        negocio_id: negocio.id,
      },
      compraCols
    );
    const compraId = res.insertId;
    for (const item of items) {
      const totalLinea = round2(item.costo_unitario * item.cantidad);
      await insertRow(
        'compras_inventario_detalle',
        {
          compra_id: compraId,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario,
          costo_unitario_sin_itbis: item.costo_unitario,
          costo_unitario_efectivo: item.costo_unitario,
          itbis_aplica: aplicaItbis ? 1 : 0,
          itbis_capitalizable: itbisCapitalizable ? 1 : 0,
          total_linea: totalLinea,
          negocio_id: negocio.id,
        },
        detalleCols
      );
    }
    insertados += 1;
  }
  return insertados;
}

async function seedClientesCxC(negocio) {
  if (!(await tableExists('clientes')) || !(await tableExists('clientes_deudas')) || !(await tableExists('clientes_abonos'))) {
    return 0;
  }
  const clientesCols = await getColumns('clientes');
  const deudasCols = await getColumns('clientes_deudas');
  const abonosCols = await getColumns('clientes_abonos');

  const clientes = [
    { nombre: 'Juan Perez', documento: '001-1234567-8', telefono: '8095551234' },
    { nombre: 'Lucia Martin', documento: '001-9876543-2', telefono: '8294443322' },
  ];

  const clientesIds = [];
  for (const cliente of clientes) {
    const existing = await query(
      'SELECT id FROM clientes WHERE negocio_id = ? AND nombre = ? LIMIT 1',
      [negocio.id, cliente.nombre]
    );
    if (existing.length) {
      clientesIds.push(existing[0].id);
      continue;
    }
    const res = await insertRow(
      'clientes',
      {
        nombre: cliente.nombre,
        documento: cliente.documento,
        tipo_documento: 'CEDULA',
        telefono: cliente.telefono,
        activo: 1,
        creado_en: formatDateTime(inicioMes),
        negocio_id: negocio.id,
      },
      clientesCols
    );
    clientesIds.push(res.insertId);
  }

  let insertados = 0;
  for (let i = 0; i < clientesIds.length; i += 1) {
    const fechaDeuda = formatDateOnly(new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 8 + i * 6));
    const deudaRes = await insertRow(
      'clientes_deudas',
      {
        cliente_id: clientesIds[i],
        negocio_id: negocio.id,
        fecha: fechaDeuda,
        descripcion: `${seedTag} servicio credito`,
        monto_total: 3500 + i * 400,
      },
      deudasCols
    );
    const deudaId = deudaRes.insertId;
    await insertRow(
      'clientes_abonos',
      {
        deuda_id: deudaId,
        cliente_id: clientesIds[i],
        negocio_id: negocio.id,
        fecha: formatDateOnly(new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 15 + i * 5)),
        monto: 1500 + i * 200,
        metodo_pago: 'transferencia',
        notas: `${seedTag} abono parcial`,
      },
      abonosCols
    );
    insertados += 1;
  }
  return insertados;
}

async function seedGastos({ empresaId, negocio, nivel }) {
  if (!(await tableExists('gastos'))) return { gastos: 0, pagos: 0 };
  const gastosCols = await getColumns('gastos');
  const pagosCols = (await tableExists('gastos_pagos')) ? await getColumns('gastos_pagos') : new Set();

  const baseCategorias = ['Alquiler', 'Nomina', 'Servicios', 'Marketing', 'Mantenimiento', 'Comisiones'];
  const gastos = [];
  for (let i = 0; i < 8; i += 1) {
    const fecha = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 2 + i * 3);
    const categoria = baseCategorias[i % baseCategorias.length];
    const estado = i % 5 === 0 ? 'ANULADO' : i % 4 === 0 ? 'APROBADO' : i % 3 === 0 ? 'PENDIENTE' : 'PAGADO';
    const metodo = estado === 'PENDIENTE' ? 'CREDITO' : i % 2 === 0 ? 'EFECTIVO' : 'TRANSFERENCIA';
    const monto = 1200 + i * 350 + (nivel === 'empresa' ? 800 : 0);
    gastos.push({
      fecha: formatDateOnly(fecha),
      monto,
      categoria,
      estado,
      metodo,
      referencia: `${seedTag}-${nivel}-${negocio ? negocio.id : 'emp'}-${i + 1}`,
      descripcion: `${seedTag} gasto ${categoria}`,
    });
  }

  let gastosInsertados = 0;
  let pagosInsertados = 0;
  for (const gasto of gastos) {
    const montoPagado = gasto.estado === 'PAGADO' ? gasto.monto : 0;
    const fechaPago = gasto.estado === 'PAGADO' ? gasto.fecha : null;
    const res = await insertRow(
      'gastos',
      {
        fecha: gasto.fecha,
        monto: gasto.monto,
        moneda: 'DOP',
        categoria: gasto.categoria,
        tipo_gasto: 'OPERATIVO',
        origen: 'manual',
        origen_fondos: gasto.metodo === 'EFECTIVO' ? 'caja' : 'banco',
        origen_detalle: gasto.metodo === 'EFECTIVO' ? 'Caja principal' : 'Banco Popular',
        metodo_pago: gasto.metodo,
        proveedor: 'Proveedor Local',
        descripcion: gasto.descripcion,
        referencia: gasto.referencia,
        estado: gasto.estado,
        fecha_pago: fechaPago,
        monto_pagado: montoPagado,
        itbis: 0,
        centro_costo: nivel === 'empresa' ? 'Administracion' : 'Sucursal',
        negocio_id: negocio ? negocio.id : null,
        empresa_id: empresaId,
      },
      gastosCols
    );
    const gastoId = res.insertId;
    gastosInsertados += 1;

    if (gasto.estado === 'PENDIENTE' && pagosCols.size) {
      await insertRow(
        'gastos_pagos',
        {
          gasto_id: gastoId,
          negocio_id: negocio ? negocio.id : null,
          fecha: formatDateOnly(new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 20)),
          monto: round2(gasto.monto * 0.5),
          metodo_pago: 'TRANSFERENCIA',
          origen_fondos: 'banco',
          origen_detalle: 'Banco Reservas',
          referencia: `${seedTag}-PAGO-${gastoId}`,
          notas: `${seedTag} pago parcial`,
        },
        pagosCols
      );
      pagosInsertados += 1;
    }
  }

  return { gastos: gastosInsertados, pagos: pagosInsertados };
}

async function main() {
  console.log(`Seed mensual: ${seedTag}`);
  const negocioBase = await query(
    `SELECT id, nombre, empresa_id
       FROM negocios
      WHERE deleted_at IS NULL
        AND (nombre LIKE ? OR slug LIKE ?)
      ORDER BY id ASC
      LIMIT 1`,
    [`%${targetNombre}%`, `%${targetNombre}%`]
  );
  if (!negocioBase.length) {
    throw new Error(`No se encontro un negocio con "${targetNombre}".`);
  }
  const empresaId = negocioBase[0].empresa_id;
  const negocios = await query(
    'SELECT id, nombre FROM negocios WHERE empresa_id = ? AND deleted_at IS NULL ORDER BY id ASC',
    [empresaId]
  );

  const existingSeed = await query('SELECT id FROM gastos WHERE referencia LIKE ? LIMIT 1', [`${seedTag}%`]);
  if (existingSeed.length) {
    console.log('Ya existe data seed con este tag. Cambia el tag o elimina esos registros.');
    return;
  }

  const resultados = {
    empresa_productos: 0,
    empleados: 0,
    asistencias: 0,
    nomina_mov: 0,
    pedidos: 0,
    compras: 0,
    cxc: 0,
    gastos_empresa: 0,
    gastos_sucursal: 0,
    pagos_gastos: 0,
  };

  resultados.empresa_productos = await ensureEmpresaProductos(empresaId);
  const { empleados } = await ensureEmpresaEmpleados(empresaId, negocios);
  resultados.empleados = empleados.length;
  resultados.asistencias = await seedAsistencias(empleados);
  resultados.nomina_mov = await seedNominaMovimientos(empleados);

  for (const negocio of negocios) {
    const { finales, insumos } = await ensureProductosNegocio(negocio.id, negocio.nombre);
    if (finales.length && insumos.length) {
      await ensureReceta(negocio.id, finales[0].id, insumos);
    }
    resultados.pedidos += await seedPedidos(negocio, finales);
    resultados.compras += await seedComprasInventario(negocio, insumos);
    resultados.cxc += await seedClientesCxC(negocio);
    const gastosRes = await seedGastos({ empresaId, negocio, nivel: 'sucursal' });
    resultados.gastos_sucursal += gastosRes.gastos;
    resultados.pagos_gastos += gastosRes.pagos;
  }

  const gastosEmpresa = await seedGastos({ empresaId, negocio: null, nivel: 'empresa' });
  resultados.gastos_empresa = gastosEmpresa.gastos;
  resultados.pagos_gastos += gastosEmpresa.pagos;

  console.log('Seed completo:', resultados);
}

main()
  .then(() => {
    console.log('Listo.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error en seed:', err?.message || err);
    process.exit(1);
  });
