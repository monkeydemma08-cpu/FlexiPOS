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
    'insumos',
    'recetas',
    'receta_detalle',
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
    'insumos',
    'recetas',
    'receta_detalle',
    'clientes',
    'cotizaciones',
    'cotizacion_items',
    'pedidos',
    'detalle_pedido',
    'historial_cocina',
    'historial_bar',
    'compras',
    'detalle_compra',
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
      'UPDATE usuarios SET es_super_admin = 1 WHERE (usuario = "admin" OR id = 1) AND es_super_admin = 0'
    );
  } catch (error) {
    console.warn('No se pudo marcar admin como super admin por defecto:', error?.message || error);
  }
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
  await ensureColumn('negocios', 'slug VARCHAR(120) UNIQUE');
  await ensureColumn('negocios', 'color_primario VARCHAR(20) NULL');
  await ensureColumn('negocios', 'color_secundario VARCHAR(20) NULL');
  await ensureColumn('negocios', 'logo_url VARCHAR(255) NULL');
  await ensureColumn('negocios', 'titulo_sistema VARCHAR(150) NULL');
  await ensureColumn('categorias', "area_preparacion ENUM('ninguna', 'cocina', 'bar') NOT NULL DEFAULT 'ninguna'");
  await ensureColumn('pedidos', 'bartender_id INT NULL');
  await ensureColumn('pedidos', 'bartender_nombre VARCHAR(255) NULL');
  await ensureNegocioThemeAndModulesColumns();
  await ensureLogoUrlCapacity();
  await ensureDefaultNegocio();
  await initializeNegocioThemeAndModulesDefaults();
  await addNegocioIdToTables();
  await ensurePedidosNcfUniqueIndex();
  await ensureEsSuperAdminColumn();
  await normalizeConfiguracionKeys();
  await normalizeSecuenciasPk();
}

module.exports = runMigrations;



