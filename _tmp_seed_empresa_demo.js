require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./db-mysql');

const now = new Date();
const suffix = String(Date.now()).slice(-5);
const empresaNombre = `Empresa Demo Sucursales ${suffix}`;
const basePassword = 'Test1234*';

const configModulos = JSON.stringify({
  admin: true,
  mesera: true,
  cocina: true,
  bar: true,
  caja: true,
  mostrador: true,
  historialCocina: true,
});

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function ensureEmpresa(nombre) {
  const rows = await query('SELECT id, nombre FROM empresas WHERE nombre = ? LIMIT 1', [nombre]);
  if (rows.length) return { id: rows[0].id, nombre: rows[0].nombre, existente: true };
  const res = await query('INSERT INTO empresas (nombre, activo) VALUES (?, 1)', [nombre]);
  return { id: res.insertId, nombre, existente: false };
}

async function ensureNegocio({ nombre, slugBase, empresaId }) {
  const existing = await query('SELECT id, slug, deleted_at FROM negocios WHERE slug = ? LIMIT 1', [slugBase]);
  if (existing.length && !existing[0].deleted_at) {
    return { id: existing[0].id, slug: existing[0].slug, nombre, existente: true };
  }
  let slugFinal = slugBase;
  if (existing.length && existing[0].deleted_at) {
    slugFinal = `${slugBase}-${suffix}`;
  }
  const res = await query(
    `INSERT INTO negocios (nombre, slug, titulo_sistema, activo, suspendido, config_modulos, empresa_id)
     VALUES (?, ?, ?, 1, 0, ?, ?)`,
    [nombre, slugFinal, nombre, configModulos, empresaId]
  );
  return { id: res.insertId, slug: slugFinal, nombre, existente: false };
}

async function ensureEmpresaUser({ empresaId, negocioId }) {
  const existing = await query(
    "SELECT id, usuario FROM usuarios WHERE rol = 'empresa' AND empresa_id = ? LIMIT 1",
    [empresaId]
  );
  if (existing.length) {
    return { id: existing[0].id, usuario: existing[0].usuario, created: false, password: null };
  }
  let usuarioBase = `empresa_demo_${suffix}`;
  let usuarioFinal = usuarioBase;
  for (let i = 0; i < 5; i += 1) {
    const conflict = await query('SELECT id FROM usuarios WHERE usuario = ? LIMIT 1', [usuarioFinal]);
    if (!conflict.length) break;
    usuarioFinal = `${usuarioBase}_${i + 1}`;
  }
  const passwordHash = await bcrypt.hash(basePassword, 10);
  const nombre = `Usuario Empresa Demo ${suffix}`;
  const res = await query(
    `INSERT INTO usuarios (nombre, usuario, password, rol, activo, negocio_id, empresa_id, es_super_admin, force_password_change)
     VALUES (?, ?, ?, 'empresa', 1, ?, ?, 0, 0)`,
    [nombre, usuarioFinal, passwordHash, negocioId, empresaId]
  );
  return { id: res.insertId, usuario: usuarioFinal, created: true, password: basePassword };
}

async function ensureSupervisor({ negocioId, empresaId, nombre, usuarioBase }) {
  const existing = await query(
    "SELECT id, usuario FROM usuarios WHERE rol = 'supervisor' AND negocio_id = ? LIMIT 1",
    [negocioId]
  );
  if (existing.length) {
    return { id: existing[0].id, usuario: existing[0].usuario, created: false, password: null };
  }
  let usuarioFinal = usuarioBase;
  for (let i = 0; i < 5; i += 1) {
    const conflict = await query('SELECT id FROM usuarios WHERE usuario = ? LIMIT 1', [usuarioFinal]);
    if (!conflict.length) break;
    usuarioFinal = `${usuarioBase}_${i + 1}`;
  }
  const passwordHash = await bcrypt.hash(basePassword, 10);
  const res = await query(
    `INSERT INTO usuarios (nombre, usuario, password, rol, activo, negocio_id, empresa_id, es_super_admin, force_password_change)
     VALUES (?, ?, ?, 'supervisor', 1, ?, ?, 0, 0)`,
    [nombre, usuarioFinal, passwordHash, negocioId, empresaId]
  );
  return { id: res.insertId, usuario: usuarioFinal, created: true, password: basePassword };
}

async function ensureProducto({ negocioId, nombre, precio }) {
  const existing = await query(
    'SELECT id FROM productos WHERE negocio_id = ? AND nombre = ? LIMIT 1',
    [negocioId, nombre]
  );
  if (existing.length) return { id: existing[0].id, nombre, precio, existente: true };
  const res = await query(
    `INSERT INTO productos (nombre, precio, stock, activo, negocio_id)
     VALUES (?, ?, 100, 1, ?)`,
    [nombre, precio, negocioId]
  );
  return { id: res.insertId, nombre, precio, existente: false };
}

async function crearPedido({ negocioId, mesa, items }) {
  const subtotal = items.reduce((acc, item) => acc + item.precio_unitario * item.cantidad, 0);
  const impuesto = Number((subtotal * 0.18).toFixed(2));
  const propina = Number((subtotal * 0.1).toFixed(2));
  const total = Number((subtotal + impuesto + propina).toFixed(2));
  const fecha = formatDateTime(new Date());

  const res = await query(
    `INSERT INTO pedidos (mesa, estado, subtotal, impuesto, total, descuento_monto, propina_monto, fecha_creacion, fecha_cierre, fecha_factura, pago_efectivo, negocio_id)
     VALUES (?, 'pagado', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [mesa, subtotal, impuesto, total, propina, fecha, fecha, fecha, total, negocioId]
  );
  const pedidoId = res.insertId;
  for (const item of items) {
    await query(
      `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, negocio_id)
       VALUES (?, ?, ?, ?, ?)`,
      [pedidoId, item.producto_id, item.cantidad, item.precio_unitario, negocioId]
    );
  }
  return { id: pedidoId, subtotal, impuesto, propina, total };
}

async function crearGasto({ negocioId, monto, descripcion }) {
  const fecha = formatDateOnly(new Date());
  await query(
    `INSERT INTO gastos (fecha, monto, descripcion, negocio_id)
     VALUES (?, ?, ?, ?)`,
    [fecha, monto, descripcion, negocioId]
  );
}

async function main() {
  console.log('Creando demo de empresa/sucursales...');
  const empresa = await ensureEmpresa(empresaNombre);

  const sucursalNorte = await ensureNegocio({
    nombre: `Demo Sucursal Norte ${suffix}`,
    slugBase: `demo-sucursal-norte-${suffix}`,
    empresaId: empresa.id,
  });
  const sucursalSur = await ensureNegocio({
    nombre: `Demo Sucursal Sur ${suffix}`,
    slugBase: `demo-sucursal-sur-${suffix}`,
    empresaId: empresa.id,
  });

  const empresaUser = await ensureEmpresaUser({ empresaId: empresa.id, negocioId: sucursalNorte.id });

  const supervisorNorte = await ensureSupervisor({
    negocioId: sucursalNorte.id,
    empresaId: empresa.id,
    nombre: `Supervisor Norte ${suffix}`,
    usuarioBase: `super_norte_${suffix}`,
  });
  const supervisorSur = await ensureSupervisor({
    negocioId: sucursalSur.id,
    empresaId: empresa.id,
    nombre: `Supervisor Sur ${suffix}`,
    usuarioBase: `super_sur_${suffix}`,
  });

  const productosNorte = [];
  productosNorte.push(await ensureProducto({ negocioId: sucursalNorte.id, nombre: `Pizza Demo ${suffix}`, precio: 500 }));
  productosNorte.push(await ensureProducto({ negocioId: sucursalNorte.id, nombre: `Refresco Demo ${suffix}`, precio: 120 }));
  productosNorte.push(await ensureProducto({ negocioId: sucursalNorte.id, nombre: `Pasta Demo ${suffix}`, precio: 350 }));

  const productosSur = [];
  productosSur.push(await ensureProducto({ negocioId: sucursalSur.id, nombre: `Burger Demo ${suffix}`, precio: 420 }));
  productosSur.push(await ensureProducto({ negocioId: sucursalSur.id, nombre: `Jugo Demo ${suffix}`, precio: 95 }));
  productosSur.push(await ensureProducto({ negocioId: sucursalSur.id, nombre: `Ensalada Demo ${suffix}`, precio: 280 }));

  await crearPedido({
    negocioId: sucursalNorte.id,
    mesa: 'N-1',
    items: [
      { producto_id: productosNorte[0].id, cantidad: 2, precio_unitario: productosNorte[0].precio },
      { producto_id: productosNorte[1].id, cantidad: 1, precio_unitario: productosNorte[1].precio },
    ],
  });
  await crearPedido({
    negocioId: sucursalNorte.id,
    mesa: 'N-2',
    items: [
      { producto_id: productosNorte[2].id, cantidad: 1, precio_unitario: productosNorte[2].precio },
      { producto_id: productosNorte[1].id, cantidad: 2, precio_unitario: productosNorte[1].precio },
    ],
  });

  await crearPedido({
    negocioId: sucursalSur.id,
    mesa: 'S-1',
    items: [
      { producto_id: productosSur[0].id, cantidad: 1, precio_unitario: productosSur[0].precio },
      { producto_id: productosSur[1].id, cantidad: 2, precio_unitario: productosSur[1].precio },
    ],
  });
  await crearPedido({
    negocioId: sucursalSur.id,
    mesa: 'S-2',
    items: [
      { producto_id: productosSur[2].id, cantidad: 2, precio_unitario: productosSur[2].precio },
      { producto_id: productosSur[1].id, cantidad: 1, precio_unitario: productosSur[1].precio },
    ],
  });

  await crearGasto({ negocioId: sucursalNorte.id, monto: 650, descripcion: 'Gasto demo insumos' });
  await crearGasto({ negocioId: sucursalSur.id, monto: 420, descripcion: 'Gasto demo delivery' });

  console.log('=== DEMO CREADO ===');
  console.log('Empresa:', empresa);
  console.log('Usuario empresa:', empresaUser);
  console.log('Sucursal Norte:', sucursalNorte);
  console.log('Supervisor Norte:', supervisorNorte);
  console.log('Sucursal Sur:', sucursalSur);
  console.log('Supervisor Sur:', supervisorSur);
  console.log('Productos Norte:', productosNorte.map((p) => p.nombre).join(', '));
  console.log('Productos Sur:', productosSur.map((p) => p.nombre).join(', '));
  console.log('Password demo (si se creo):', basePassword);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error creando demo:', err);
    process.exit(1);
  });
