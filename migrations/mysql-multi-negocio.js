require('dotenv').config();
const { query } = require('../db-mysql');

const DEFAULT_NEGOCIO_ID = 1;
const DEFAULT_CONFIG_MODULOS = {
  admin: true,
  mesera: true,
  cocina: true,
  bar: false,
  caja: true,
  historialCocina: true,
};
const DEFAULT_COLOR_TEXTO = '#222222';
const DEFAULT_COLOR_PELIGRO = '#ff4b4b';
const DEFAULT_NEGOCIO = {
  id: DEFAULT_NEGOCIO_ID,
  nombre: 'Negocio Principal',
  slug: 'negocio-principal',
  activo: 1,
  color_primario: '#f06292',
  color_secundario: '#d85682',
  color_header: '#f06292',
  color_boton_primario: '#f06292',
  color_boton_secundario: '#d85682',
  color_boton_peligro: DEFAULT_COLOR_PELIGRO,
  color_texto: DEFAULT_COLOR_TEXTO,
  titulo_sistema: 'KANM',
  config_modulos: DEFAULT_CONFIG_MODULOS,
};

async function tableExists(table) {
  const rows = await query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const rows = await query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function getColumnInfo(table, column) {
  const rows = await query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows?.[0];
}

async function columnsCompatibleForFk(sourceTable, sourceColumn, targetTable, targetColumn = 'id') {
  const source = await getColumnInfo(sourceTable, sourceColumn);
  const target = await getColumnInfo(targetTable, targetColumn);

  if (!source || !target) {
    return false;
  }

  const sourceType = (source.COLUMN_TYPE || source.DATA_TYPE || '').toLowerCase();
  const targetType = (target.COLUMN_TYPE || target.DATA_TYPE || '').toLowerCase();
  return sourceType === targetType;
}

async function indexExists(table, column) {
  const rows = await query(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexNameExists(table, indexName) {
  const rows = await query(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function ensureIndexByName(table, indexName, columnsDef) {
  if (!(await tableExists(table))) {
    return;
  }

  if (await indexNameExists(table, indexName)) {
    return;
  }

  try {
    await query(`CREATE INDEX ${indexName} ON ${table} ${columnsDef}`);
  } catch (error) {
    console.warn(`No se pudo crear indice ${indexName} en ${table}:`, error?.message || error);
  }
}

async function ensureTableNegocios() {
  await query(`
    CREATE TABLE IF NOT EXISTS negocios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      rnc VARCHAR(20) NULL,
      telefono VARCHAR(30) NULL,
      direccion VARCHAR(255) NULL,
      color_primario VARCHAR(20) NULL,
      color_secundario VARCHAR(20) NULL,
      color_texto VARCHAR(7) NULL,
      color_header VARCHAR(7) NULL,
      color_boton_primario VARCHAR(7) NULL,
      color_boton_secundario VARCHAR(7) NULL,
      color_boton_peligro VARCHAR(7) NULL,
      config_modulos JSON NULL,
      admin_principal_correo VARCHAR(255) NULL,
      admin_principal_usuario_id BIGINT NULL,
      logo_url VARCHAR(255) NULL,
      titulo_sistema VARCHAR(150) NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      suspendido TINYINT(1) NOT NULL DEFAULT 0,
      deleted_at DATETIME NULL,
      motivo_suspension TEXT NULL,
      updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableHistorialBar() {
  await query(`
    CREATE TABLE IF NOT EXISTS historial_bar (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cuenta_id INT NULL,
      pedido_id INT NOT NULL,
      item_nombre VARCHAR(255) NOT NULL,
      cantidad DECIMAL(10,2) NOT NULL,
      bartender_id INT NULL,
      bartender_nombre VARCHAR(255) NULL,
      created_at DATETIME NULL,
      completed_at DATETIME NULL,
      negocio_id INT NOT NULL,
      CONSTRAINT fk_historial_bar_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTablePosiumFacturacionConfig() {
  await query(`
    CREATE TABLE IF NOT EXISTS posium_facturacion_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      cliente_nombre VARCHAR(200) NULL,
      cliente_rnc VARCHAR(40) NULL,
      cliente_direccion VARCHAR(255) NULL,
      cliente_telefono VARCHAR(50) NULL,
      cliente_email VARCHAR(120) NULL,
      cliente_contacto VARCHAR(120) NULL,
      emisor_nombre VARCHAR(200) NULL,
      emisor_rnc VARCHAR(40) NULL,
      emisor_direccion VARCHAR(255) NULL,
      emisor_telefono VARCHAR(50) NULL,
      emisor_email VARCHAR(120) NULL,
      emisor_logo VARCHAR(255) NULL,
      emisor_nota TEXT NULL,
      plan_nombre VARCHAR(200) NULL,
      precio_base DECIMAL(12,2) NULL,
      moneda VARCHAR(10) NULL,
      impuesto_tipo VARCHAR(20) NULL,
      impuesto_valor DECIMAL(12,2) NULL,
      periodo_default VARCHAR(60) NULL,
      terminos_pago VARCHAR(120) NULL,
      metodo_pago VARCHAR(60) NULL,
      notas_internas TEXT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_posium_facturacion_config_negocio (negocio_id),
      CONSTRAINT fk_posium_facturacion_config_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTablePosiumFacturas() {
  await query(`
    CREATE TABLE IF NOT EXISTS posium_facturas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      numero_factura INT NOT NULL,
      fecha_emision DATE NOT NULL,
      periodo VARCHAR(60) NOT NULL,
      items_json JSON NULL,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      itbis DECIMAL(12,2) NOT NULL DEFAULT 0,
      descuento DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      moneda VARCHAR(10) NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      terminos_pago VARCHAR(120) NULL,
      metodo_pago VARCHAR(60) NULL,
      emisor_snapshot JSON NULL,
      cliente_snapshot JSON NULL,
      created_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_posium_facturas_numero (numero_factura),
      KEY idx_posium_facturas_negocio_fecha (negocio_id, fecha_emision),
      CONSTRAINT fk_posium_facturas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableGastos() {
  await query(`
    CREATE TABLE IF NOT EXISTS gastos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fecha DATE NOT NULL,
      monto DECIMAL(12,2) NOT NULL,
      moneda VARCHAR(3) DEFAULT 'DOP',
      categoria VARCHAR(80),
      tipo_gasto VARCHAR(20) NOT NULL DEFAULT 'OPERATIVO',
      origen VARCHAR(20) NOT NULL DEFAULT 'manual',
      metodo_pago VARCHAR(40),
      proveedor VARCHAR(120),
      descripcion TEXT,
      comprobante_ncf VARCHAR(30),
      referencia VARCHAR(60),
      referencia_tipo VARCHAR(40) NULL,
      referencia_id BIGINT NULL,
      usuario_id INT NULL,
      es_recurrente TINYINT(1) NOT NULL DEFAULT 0,
      frecuencia VARCHAR(20) NULL,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      negocio_id INT NOT NULL,
      CONSTRAINT fk_gastos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn('gastos', 'referencia_tipo VARCHAR(40) NULL');
  await ensureColumn('gastos', 'referencia_id BIGINT NULL');
  await ensureColumn('gastos', 'usuario_id INT NULL');
  await ensureColumn('gastos', "tipo_gasto VARCHAR(20) NOT NULL DEFAULT 'OPERATIVO'");
  await ensureColumn('gastos', "origen VARCHAR(20) NOT NULL DEFAULT 'manual'");
  await query("UPDATE gastos SET tipo_gasto = 'OPERATIVO' WHERE tipo_gasto IS NULL OR tipo_gasto = ''");
  await query(
    "UPDATE gastos SET tipo_gasto = 'INVENTARIO' WHERE (categoria = 'Compras inventario' OR referencia LIKE 'INV-%') AND (tipo_gasto IS NULL OR tipo_gasto = '' OR tipo_gasto = 'OPERATIVO')"
  );
  await query(
    "UPDATE gastos SET tipo_gasto = 'RETIRO_CAJA' WHERE (referencia_tipo = 'SALIDA_CAJA' OR categoria = 'SALIDA_CAJA') AND (tipo_gasto IS NULL OR tipo_gasto = '' OR tipo_gasto = 'OPERATIVO')"
  );
  await query("UPDATE gastos SET origen = 'manual' WHERE origen IS NULL OR origen = ''");
  await query(
    "UPDATE gastos SET origen = 'compra' WHERE (categoria = 'Compras inventario' OR referencia LIKE 'INV-%') AND (origen IS NULL OR origen = '' OR origen = 'manual')"
  );
  await query(
    "UPDATE gastos SET origen = 'caja' WHERE (referencia_tipo = 'SALIDA_CAJA' OR categoria = 'SALIDA_CAJA') AND (origen IS NULL OR origen = '' OR origen = 'manual')"
  );
  await query(
    "UPDATE gastos SET origen = 'nomina' WHERE (LOWER(categoria) LIKE 'nomina%' OR LOWER(descripcion) LIKE 'nomina%') AND (origen IS NULL OR origen = '' OR origen = 'manual')"
  );

  await ensureIndexByName('gastos', 'idx_gastos_negocio_fecha', '(negocio_id, fecha)');
  await ensureIndexByName('gastos', 'idx_gastos_negocio_categoria_fecha', '(negocio_id, categoria, fecha)');
  await ensureIndexByName('gastos', 'idx_gastos_referencia', '(negocio_id, referencia_tipo, referencia_id)');
  await ensureForeignKey('gastos', 'negocio_id');
}

async function ensureTableComprasInventario() {
  await query(`
    CREATE TABLE IF NOT EXISTS compras_inventario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fecha DATETIME NOT NULL,
      proveedor VARCHAR(255) NOT NULL,
      origen_fondos VARCHAR(20) NOT NULL DEFAULT 'negocio',
      metodo_pago VARCHAR(40) NULL,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      itbis DECIMAL(12,2) NOT NULL DEFAULT 0,
      aplica_itbis TINYINT(1) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      observaciones TEXT NULL,
      creado_por INT NULL,
      compra_id INT NULL,
      gasto_id INT NULL,
      salida_id INT NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      negocio_id INT NOT NULL,
      CONSTRAINT fk_compras_inventario_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
      CONSTRAINT fk_compras_inventario_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('compras_inventario', 'idx_compras_inventario_negocio_fecha', '(negocio_id, fecha)');
  await ensureIndexByName('compras_inventario', 'idx_compras_inventario_negocio', '(negocio_id)');
  await ensureIndexByName('compras_inventario', 'idx_compras_inventario_compra', '(compra_id)');
  await ensureForeignKey('compras_inventario', 'negocio_id');
  await ensureForeignKey('compras_inventario', 'compra_id', 'compras');
  await ensureColumn('compras_inventario', 'subtotal DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('compras_inventario', 'itbis DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('compras_inventario', 'aplica_itbis TINYINT(1) NOT NULL DEFAULT 0');
  await query(
    'UPDATE compras_inventario SET subtotal = total WHERE (subtotal IS NULL OR subtotal = 0) AND total > 0'
  );
}

async function ensureTableComprasInventarioDetalle() {
  await query(`
    CREATE TABLE IF NOT EXISTS compras_inventario_detalle (
      id INT AUTO_INCREMENT PRIMARY KEY,
      compra_id INT NOT NULL,
      producto_id INT NOT NULL,
      cantidad DECIMAL(10,2) NOT NULL,
      costo_unitario DECIMAL(10,2) NOT NULL,
      total_linea DECIMAL(10,2) NOT NULL,
      negocio_id INT NOT NULL,
      CONSTRAINT fk_compra_inv_detalle_compra FOREIGN KEY (compra_id) REFERENCES compras_inventario(id),
      CONSTRAINT fk_compra_inv_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
      CONSTRAINT fk_compra_inv_detalle_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('compras_inventario_detalle', 'idx_compra_inv_detalle_compra', '(compra_id)');
  await ensureIndexByName('compras_inventario_detalle', 'idx_compra_inv_detalle_producto', '(producto_id)');
  await ensureIndexByName('compras_inventario_detalle', 'idx_compra_inv_detalle_negocio', '(negocio_id)');
  await ensureForeignKey('compras_inventario_detalle', 'negocio_id');
  await ensureForeignKey('compras_inventario_detalle', 'compra_id', 'compras_inventario');
  await ensureForeignKey('compras_inventario_detalle', 'producto_id', 'productos');
}

async function ensureTableAnalisisCapitalInicial() {
  await query(`
    CREATE TABLE IF NOT EXISTS analisis_capital_inicial (
      id INT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      periodo_inicio DATE NOT NULL,
      periodo_fin DATE NOT NULL,
      caja_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
      inventario_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_capital_inicial_periodo (negocio_id, periodo_inicio, periodo_fin),
      CONSTRAINT fk_capital_inicial_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureDefaultNegocio() {
  await query(
    `INSERT INTO negocios (
        id,
        nombre,
        slug,
        activo,
        color_primario,
        color_secundario,
        color_header,
        color_boton_primario,
        color_boton_secundario,
        color_boton_peligro,
        color_texto,
        titulo_sistema,
        config_modulos,
        admin_principal_usuario_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nombre = COALESCE(nombre, VALUES(nombre)),
       slug = COALESCE(slug, VALUES(slug)),
       activo = COALESCE(activo, VALUES(activo)),
       color_primario = COALESCE(color_primario, VALUES(color_primario)),
       color_secundario = COALESCE(color_secundario, VALUES(color_secundario)),
       color_header = COALESCE(color_header, VALUES(color_header)),
       color_boton_primario = COALESCE(color_boton_primario, VALUES(color_boton_primario)),
       color_boton_secundario = COALESCE(color_boton_secundario, VALUES(color_boton_secundario)),
       color_boton_peligro = COALESCE(color_boton_peligro, VALUES(color_boton_peligro)),
       color_texto = COALESCE(color_texto, VALUES(color_texto)),
       titulo_sistema = COALESCE(titulo_sistema, VALUES(titulo_sistema)),
       config_modulos = COALESCE(config_modulos, VALUES(config_modulos)),
       admin_principal_usuario_id = COALESCE(admin_principal_usuario_id, VALUES(admin_principal_usuario_id))`,
    [
      DEFAULT_NEGOCIO.id,
      DEFAULT_NEGOCIO.nombre,
      DEFAULT_NEGOCIO.slug,
      DEFAULT_NEGOCIO.activo,
      DEFAULT_NEGOCIO.color_primario,
      DEFAULT_NEGOCIO.color_secundario,
      DEFAULT_NEGOCIO.color_header,
      DEFAULT_NEGOCIO.color_boton_primario,
      DEFAULT_NEGOCIO.color_boton_secundario,
      DEFAULT_NEGOCIO.color_boton_peligro,
      DEFAULT_NEGOCIO.color_texto,
      DEFAULT_NEGOCIO.titulo_sistema,
      JSON.stringify(DEFAULT_NEGOCIO.config_modulos || DEFAULT_CONFIG_MODULOS),
      null,
    ]
  );
}

async function ensureColumn(table, definition) {
  const column = definition.split(' ')[0];
  if (!(await tableExists(table))) {
    return;
  }

  if (!(await columnExists(table, column))) {
    await query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function ensureIndex(table, column) {
  if (!(await tableExists(table))) {
    return;
  }

  if (!(await indexExists(table, column))) {
    await query(`CREATE INDEX idx_${table}_${column} ON ${table} (${column})`);
  }
}

async function ensureForeignKey(table, column, referencedTable = 'negocios') {
  if (!(await tableExists(table)) || !(await columnExists(table, column))) {
    return;
  }

  const rows = await query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME = ?`,
    [table, column, referencedTable]
  );

  if (rows.length > 0) {
    return;
  }

  const constraint = `fk_${table}_${column}`;
  try {
    await query(
      `ALTER TABLE ${table}
         ADD CONSTRAINT ${constraint}
         FOREIGN KEY (${column}) REFERENCES ${referencedTable}(id)`
    );
  } catch (error) {
    console.warn(`No se pudo crear FK ${constraint} en ${table}:`, error?.message || error);
  }
}

async function dropForeignKeyByColumn(table, column) {
  if (!(await tableExists(table)) || !(await columnExists(table, column))) {
    return;
  }

  const rows = await query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, column]
  );

  for (const row of rows) {
    try {
      await query(`ALTER TABLE ${table} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`);
    } catch (error) {
      console.warn(`No se pudo eliminar FK ${row.CONSTRAINT_NAME} en ${table}:`, error?.message || error);
    }
  }
}

async function dropColumn(table, column) {
  if (!(await tableExists(table)) || !(await columnExists(table, column))) {
    return;
  }

  try {
    await query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch (error) {
    console.warn(`No se pudo eliminar columna ${column} en ${table}:`, error?.message || error);
  }
}

async function modifyColumn(table, definition) {
  const column = definition.split(' ')[0];
  if (!(await tableExists(table)) || !(await columnExists(table, column))) {
    return;
  }

  try {
    await query(`ALTER TABLE ${table} MODIFY COLUMN ${definition}`);
  } catch (error) {
    console.warn(`No se pudo modificar columna ${column} en ${table}:`, error?.message || error);
  }
}

async function dropTable(table) {
  if (!(await tableExists(table))) {
    return;
  }

  try {
    await query(`DROP TABLE ${table}`);
  } catch (error) {
    console.warn(`No se pudo eliminar tabla ${table}:`, error?.message || error);
  }
}

async function ensurePedidosNcfUniqueIndex() {
  if (!(await tableExists('pedidos'))) {
    return;
  }

  const indexRows = await query(
    `SELECT INDEX_NAME,
            NON_UNIQUE,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pedidos'
        AND INDEX_NAME = 'idx_pedidos_ncf'
      GROUP BY INDEX_NAME, NON_UNIQUE`
  );

  const desiredColumns = 'negocio_id,ncf';
  const hasDesiredDefinition = indexRows.some(
    (row) =>
      row.NON_UNIQUE === 0 &&
      typeof row.columns_in_index === 'string' &&
      row.columns_in_index.toLowerCase() === desiredColumns
  );

  if (hasDesiredDefinition) {
    return;
  }

  if (indexRows.length > 0) {
    try {
      await query('ALTER TABLE pedidos DROP INDEX idx_pedidos_ncf');
    } catch (error) {
      console.warn('No se pudo eliminar idx_pedidos_ncf existente:', error?.message || error);
      return;
    }
  }

  try {
    await query('ALTER TABLE pedidos ADD UNIQUE INDEX idx_pedidos_ncf (negocio_id, ncf)');
  } catch (error) {
    console.warn('No se pudo crear idx_pedidos_ncf compuesto:', error?.message || error);
  }
}

async function ensureNegocioThemeAndModulesColumns() {
  await ensureColumn('negocios', 'color_texto VARCHAR(7) NULL');
  await ensureColumn('negocios', 'color_header VARCHAR(7) NULL');
  await ensureColumn('negocios', 'color_boton_primario VARCHAR(7) NULL');
  await ensureColumn('negocios', 'color_boton_secundario VARCHAR(7) NULL');
  await ensureColumn('negocios', 'color_boton_peligro VARCHAR(7) NULL');
  await ensureColumn('negocios', 'config_modulos JSON NULL');
  await ensureColumn('negocios', 'permitir_b01 TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('negocios', 'permitir_b02 TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('negocios', 'permitir_b14 TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('negocios', 'admin_principal_correo VARCHAR(255) NULL');
  await ensureColumn('negocios', 'admin_principal_usuario_id BIGINT NULL');
  const fkCompatible = await columnsCompatibleForFk('negocios', 'admin_principal_usuario_id', 'usuarios', 'id');
  if (fkCompatible) {
    await ensureForeignKey('negocios', 'admin_principal_usuario_id', 'usuarios');
  }
}

async function ensureLogoUrlCapacity() {
  if (!(await tableExists('negocios'))) return;
  try {
    await query('ALTER TABLE negocios MODIFY COLUMN logo_url LONGTEXT NULL');
  } catch (error) {
    console.warn('No se pudo ampliar logo_url a LONGTEXT:', error?.message || error);
  }
}

async function ensurePrimaryKey(table, columns = []) {
  if (!(await tableExists(table)) || !Array.isArray(columns) || columns.length === 0) {
    return;
  }

  const current = await query(
    `SELECT COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION`,
    [table]
  );

  const same =
    current.length === columns.length &&
    current.every((row, idx) => row.COLUMN_NAME.toLowerCase() === columns[idx].toLowerCase());

  if (same) {
    return;
  }

  await query(`ALTER TABLE ${table} DROP PRIMARY KEY`);
  await query(`ALTER TABLE ${table} ADD PRIMARY KEY (${columns.join(', ')})`);
}

async function addNegocioIdToTables() {
  const tables = [
    'usuarios',
    'categorias',
    'productos',
    'clientes',
    'cotizaciones',
    'cotizacion_items',
    'pedidos',
    'detalle_pedido',
    'historial_cocina',
    'historial_bar',
    'configuracion',
    'compras',
    'detalle_compra',
    'gastos',
    'notas_credito_ventas',
    'notas_credito_compras',
    'secuencias_ncf',
    'cierres_caja',
    'salidas_caja',
    'sesiones_usuarios',
  ];

  for (const table of tables) {
    await ensureColumn(table, `negocio_id INT NOT NULL DEFAULT ${DEFAULT_NEGOCIO_ID}`);
    try {
      await query(`UPDATE ${table} SET negocio_id = ? WHERE negocio_id IS NULL`, [DEFAULT_NEGOCIO_ID]);
    } catch (error) {
      console.warn(`No se pudo normalizar negocio_id en ${table}:`, error?.message || error);
    }
  }

  // Normaliza usuarios existentes al negocio por defecto
  if (await tableExists('usuarios')) {
    await query('UPDATE usuarios SET negocio_id = ? WHERE negocio_id IS NULL', [DEFAULT_NEGOCIO_ID]);
  }

  // Normaliza sesiones con el negocio del usuario o por defecto
  if ((await tableExists('sesiones_usuarios')) && (await tableExists('usuarios'))) {
    try {
      await query(
        `UPDATE sesiones_usuarios s
            JOIN usuarios u ON u.id = s.usuario_id
           SET s.negocio_id = COALESCE(u.negocio_id, ?)
         WHERE s.negocio_id IS NULL`,
        [DEFAULT_NEGOCIO_ID]
      );
    } catch (error) {
      console.warn('No se pudieron actualizar negocio_id en sesiones_usuarios:', error?.message || error);
    }
  }

  const indexTargets = [
    'usuarios',
    'categorias',
    'productos',
    'clientes',
    'cotizaciones',
    'cotizacion_items',
    'pedidos',
    'detalle_pedido',
    'historial_cocina',
    'historial_bar',
    'compras',
    'detalle_compra',
    'gastos',
    'notas_credito_ventas',
    'notas_credito_compras',
    'secuencias_ncf',
    'cierres_caja',
    'salidas_caja',
    'sesiones_usuarios',
  ];

  for (const table of indexTargets) {
    await ensureIndex(table, 'negocio_id');
    await ensureForeignKey(table, 'negocio_id');
  }
}

async function ensureEsSuperAdminColumn() {
  await ensureColumn('usuarios', 'es_super_admin TINYINT(1) NOT NULL DEFAULT 0');
  try {
    await query(
      `UPDATE usuarios SET es_super_admin = 1 WHERE (usuario = 'admin' OR id = 1) AND es_super_admin = 0`
    );
  } catch (error) {
    console.warn('No se pudo marcar admin como super admin por defecto:', error?.message || error);
  }
}

async function ensurePasswordControlColumns() {
  await ensureColumn('usuarios', 'force_password_change TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('usuarios', 'password_reset_at DATETIME NULL');
}

async function ensureNegocioStatusColumns() {
  await ensureColumn('negocios', 'suspendido TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('negocios', 'deleted_at DATETIME NULL');
  await ensureColumn('negocios', 'motivo_suspension TEXT NULL');
  await ensureColumn(
    'negocios',
    'updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  );
}

async function ensureTableAdminImpersonations() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_impersonations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      negocio_id INT NOT NULL,
      ip VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_impersonations_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id),
      CONSTRAINT fk_admin_impersonations_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('admin_impersonations', 'idx_admin_impersonations_admin', '(admin_id)');
  await ensureIndexByName('admin_impersonations', 'idx_admin_impersonations_negocio', '(negocio_id)');
}

async function ensureTableAdminActions() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_actions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      negocio_id INT NOT NULL,
      accion VARCHAR(60) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id),
      CONSTRAINT fk_admin_actions_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('admin_actions', 'idx_admin_actions_admin', '(admin_id)');
  await ensureIndexByName('admin_actions', 'idx_admin_actions_negocio', '(negocio_id)');
  await ensureIndexByName('admin_actions', 'idx_admin_actions_accion', '(accion)');
}

async function migrateDetalleCompraManual() {
  if (!(await tableExists('detalle_compra'))) {
    return;
  }

  await ensureColumn('detalle_compra', 'descripcion VARCHAR(255) NOT NULL DEFAULT ""');
  await ensureColumn('detalle_compra', 'precio_unitario DECIMAL(10,2) NULL');
  await ensureColumn('detalle_compra', 'itbis DECIMAL(10,2) NULL');
  await ensureColumn('detalle_compra', 'total DECIMAL(10,2) NULL');
  await modifyColumn('detalle_compra', 'cantidad DECIMAL(10,2) NULL');

  if ((await columnExists('detalle_compra', 'costo_unitario')) && (await columnExists('detalle_compra', 'precio_unitario'))) {
    try {
      await query(
        `UPDATE detalle_compra
            SET precio_unitario = COALESCE(precio_unitario, costo_unitario)
          WHERE precio_unitario IS NULL`
      );
    } catch (error) {
      console.warn('No se pudo migrar costo_unitario a precio_unitario:', error?.message || error);
    }
  }

  if ((await columnExists('detalle_compra', 'insumo_id')) && (await tableExists('insumos'))) {
    try {
      await query(
        `UPDATE detalle_compra d
            JOIN insumos i ON i.id = d.insumo_id
           SET d.descripcion = COALESCE(NULLIF(d.descripcion, ''), i.nombre)
         WHERE d.descripcion IS NULL OR d.descripcion = ''`
      );
    } catch (error) {
      console.warn('No se pudo completar descripcion desde insumos:', error?.message || error);
    }
  }

  try {
    await query(
      `UPDATE detalle_compra
          SET descripcion = 'Detalle manual'
        WHERE descripcion IS NULL OR descripcion = ''`
    );
  } catch (error) {
    console.warn('No se pudo normalizar descripcion vacia en detalle_compra:', error?.message || error);
  }

  await dropForeignKeyByColumn('detalle_compra', 'insumo_id');
  await dropColumn('detalle_compra', 'insumo_id');
  await dropColumn('detalle_compra', 'costo_unitario');
}

async function removeInsumosModule() {
  await migrateDetalleCompraManual();
  await dropColumn('pedidos', 'insumos_descontados');
  await dropTable('receta_detalle');
  await dropTable('recetas');
  await dropTable('insumos');
}

async function initializeNegocioThemeAndModulesDefaults() {
  if (!(await tableExists('negocios'))) {
    return;
  }

  const defaultConfig = JSON.stringify(DEFAULT_CONFIG_MODULOS);
  try {
    await query(
      `UPDATE negocios
          SET config_modulos = CASE
                WHEN config_modulos IS NULL THEN ?
                WHEN JSON_VALID(config_modulos) = 0 THEN ?
                WHEN JSON_EXTRACT(config_modulos, '$.bar') IS NULL THEN JSON_SET(config_modulos, '$.bar', JSON_EXTRACT(?, '$.bar'))
                ELSE config_modulos
              END,
              color_boton_primario = COALESCE(color_boton_primario, color_primario),
              color_boton_secundario = COALESCE(color_boton_secundario, color_secundario),
              color_boton_peligro = COALESCE(color_boton_peligro, ?),
              color_header = COALESCE(color_header, color_primario, color_secundario),
              color_texto = COALESCE(color_texto, ?)` ,
      [defaultConfig, defaultConfig, defaultConfig, DEFAULT_COLOR_PELIGRO, DEFAULT_COLOR_TEXTO]
    );
  } catch (error) {
    console.warn('No se pudo inicializar temas y modulos de negocios:', error?.message || error);
  }
}

async function normalizeConfiguracionKeys() {
  if (!(await tableExists('configuracion'))) {
    return;
  }

  await ensurePrimaryKey('configuracion', ['clave', 'negocio_id']);
}

async function normalizeSecuenciasPk() {
  if (!(await tableExists('secuencias_ncf'))) {
    return;
  }

  await ensurePrimaryKey('secuencias_ncf', ['tipo', 'negocio_id']);
}

async function runMigrations() {
  await ensureTableNegocios();
  await ensureTableHistorialBar();
  await ensureTablePosiumFacturacionConfig();
  await ensureTablePosiumFacturas();
  await ensureTableGastos();
  await ensureTableComprasInventario();
  await ensureTableComprasInventarioDetalle();
  await ensureTableAnalisisCapitalInicial();
  await ensureColumn('salidas_caja', 'usuario_id INT NULL');
  await ensureColumn('negocios', 'slug VARCHAR(120) UNIQUE');
  await ensureColumn('negocios', 'color_primario VARCHAR(20) NULL');
  await ensureColumn('negocios', 'color_secundario VARCHAR(20) NULL');
  await ensureColumn('negocios', 'logo_url VARCHAR(255) NULL');
  await ensureColumn('negocios', 'titulo_sistema VARCHAR(150) NULL');
  await ensureColumn('categorias', "area_preparacion ENUM('ninguna', 'cocina', 'bar') NOT NULL DEFAULT 'ninguna'");
  await ensureColumn('productos', 'stock_indefinido TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('productos', 'precios JSON NULL');
  await ensureColumn('pedidos', 'bartender_id INT NULL');
  await ensureColumn('pedidos', 'bartender_nombre VARCHAR(255) NULL');
  await ensureNegocioThemeAndModulesColumns();
  await ensureLogoUrlCapacity();
  await ensureNegocioStatusColumns();
  await ensureDefaultNegocio();
  await initializeNegocioThemeAndModulesDefaults();
  await addNegocioIdToTables();
  await removeInsumosModule();
  await ensurePedidosNcfUniqueIndex();
  await ensureEsSuperAdminColumn();
  await ensurePasswordControlColumns();
  await ensureTableAdminImpersonations();
  await ensureTableAdminActions();
  await normalizeConfiguracionKeys();
  await normalizeSecuenciasPk();
}

module.exports = runMigrations;



