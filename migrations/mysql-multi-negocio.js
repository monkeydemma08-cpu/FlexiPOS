require('dotenv').config();
const { query } = require('../db-mysql');

const DEFAULT_NEGOCIO_ID = 1;
const DEFAULT_CONFIG_MODULOS = {
  admin: true,
  mesera: true,
  cocina: true,
  bar: false,
  caja: true,
  mostrador: true,
  historialCocina: true,
};
const DEFAULT_COLOR_TEXTO = '#24344a';
const DEFAULT_COLOR_PELIGRO = '#ff4b4b';
const DEFAULT_NEGOCIO = {
  id: DEFAULT_NEGOCIO_ID,
  nombre: 'Negocio Principal',
  slug: 'negocio-principal',
  activo: 1,
  color_primario: '#255bc7',
  color_secundario: '#7b8fb8',
  color_header: '#255bc7',
  color_boton_primario: '#255bc7',
  color_boton_secundario: '#7b8fb8',
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

async function ensureTableEmpresas() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_empresas_nombre (nombre)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureDefaultEmpresa() {
  if (!(await tableExists('empresas'))) return;
  try {
    const row = await query('SELECT id FROM empresas WHERE id = 1 LIMIT 1');
    if (!row || row.length === 0) {
      await query('INSERT INTO empresas (id, nombre, activo) VALUES (1, ?, 1)', ['Empresa Principal']);
    }
  } catch (error) {
    console.warn('No se pudo asegurar empresa por defecto:', error?.message || error);
  }
}

async function ensureTableEmpresaProductos() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_productos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      categoria VARCHAR(120) NULL,
      tipo_producto ENUM('FINAL', 'INSUMO') NOT NULL DEFAULT 'FINAL',
      costo_base DECIMAL(12,2) NOT NULL DEFAULT 0,
      precio_sugerido DECIMAL(12,2) NOT NULL DEFAULT 0,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_empresa_productos_empresa (empresa_id),
      CONSTRAINT fk_empresa_productos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableEmpresaInventarioMovimientos() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_inventario_movimientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      producto_id INT NOT NULL,
      tipo ENUM('ENTRADA', 'SALIDA', 'AJUSTE') NOT NULL,
      cantidad DECIMAL(12,4) NOT NULL DEFAULT 0,
      costo_unitario DECIMAL(12,4) NOT NULL DEFAULT 0,
      motivo VARCHAR(255) NULL,
      referencia VARCHAR(120) NULL,
      usuario_id INT NULL,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      stock_antes DECIMAL(12,4) NULL,
      stock_despues DECIMAL(12,4) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_emp_inv_mov_empresa_fecha (empresa_id, fecha),
      KEY idx_emp_inv_mov_producto (producto_id),
      CONSTRAINT fk_emp_inv_mov_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      CONSTRAINT fk_emp_inv_mov_producto FOREIGN KEY (producto_id) REFERENCES empresa_productos(id),
      CONSTRAINT fk_emp_inv_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableEmpresaInventarioCapas() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_inventario_capas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      producto_id INT NOT NULL,
      cantidad_restante DECIMAL(12,4) NOT NULL DEFAULT 0,
      costo_unitario DECIMAL(12,4) NOT NULL DEFAULT 0,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_emp_inv_capas_empresa (empresa_id),
      KEY idx_emp_inv_capas_producto_fecha (producto_id, fecha),
      CONSTRAINT fk_emp_inv_capas_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      CONSTRAINT fk_emp_inv_capas_producto FOREIGN KEY (producto_id) REFERENCES empresa_productos(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableEmpresaEmpleados() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_empleados (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      negocio_id INT NULL,
      nombre VARCHAR(255) NOT NULL,
      documento VARCHAR(80) NULL,
      telefono VARCHAR(50) NULL,
      cargo VARCHAR(120) NULL,
      tipo_pago ENUM('MENSUAL', 'QUINCENAL', 'HORA') NOT NULL DEFAULT 'MENSUAL',
      sueldo_base DECIMAL(12,2) NOT NULL DEFAULT 0,
      tarifa_hora DECIMAL(12,2) NOT NULL DEFAULT 0,
      ars_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
      afp_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
      isr_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_empresa_empleados_empresa (empresa_id),
      KEY idx_empresa_empleados_negocio (negocio_id),
      CONSTRAINT fk_empresa_empleados_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      CONSTRAINT fk_empresa_empleados_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableEmpresaAsistencias() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_asistencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empleado_id INT NOT NULL,
      negocio_id INT NULL,
      fecha DATE NOT NULL,
      hora_entrada TIME NOT NULL,
      hora_salida TIME NOT NULL,
      horas DECIMAL(6,2) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_empresa_asistencias_empleado (empleado_id),
      KEY idx_empresa_asistencias_negocio (negocio_id),
      CONSTRAINT fk_empresa_asistencias_empleado FOREIGN KEY (empleado_id) REFERENCES empresa_empleados(id) ON DELETE CASCADE,
      CONSTRAINT fk_empresa_asistencias_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableEmpresaNominaMovimientos() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_nomina_movimientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empleado_id INT NOT NULL,
      negocio_id INT NULL,
      tipo ENUM('COMISION', 'BONO', 'DEDUCCION') NOT NULL DEFAULT 'COMISION',
      monto DECIMAL(12,2) NOT NULL DEFAULT 0,
      fecha DATE NOT NULL,
      notas TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_empresa_nomina_mov_empleado (empleado_id),
      KEY idx_empresa_nomina_mov_negocio (negocio_id),
      CONSTRAINT fk_empresa_nomina_mov_empleado FOREIGN KEY (empleado_id) REFERENCES empresa_empleados(id) ON DELETE CASCADE,
      CONSTRAINT fk_empresa_nomina_mov_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableEmpresaContabilidad() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_contabilidad_movimientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      negocio_id INT NULL,
      tipo ENUM('ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'GASTO') NOT NULL DEFAULT 'ACTIVO',
      cuenta VARCHAR(150) NOT NULL,
      descripcion TEXT NULL,
      monto DECIMAL(12,2) NOT NULL DEFAULT 0,
      fecha DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_empresa_conta_empresa (empresa_id),
      KEY idx_empresa_conta_negocio (negocio_id),
      KEY idx_empresa_conta_fecha (fecha),
      CONSTRAINT fk_empresa_conta_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      CONSTRAINT fk_empresa_conta_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableContabilidadCuentas() {
  await query(`
    CREATE TABLE IF NOT EXISTS contabilidad_cuentas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      codigo VARCHAR(40) NOT NULL,
      nombre VARCHAR(180) NOT NULL,
      tipo ENUM('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'COSTO', 'GASTO') NOT NULL,
      alias VARCHAR(60) NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_conta_cuentas_empresa_codigo (empresa_id, codigo),
      UNIQUE KEY idx_conta_cuentas_empresa_alias (empresa_id, alias)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableContabilidadAsientos() {
  await query(`
    CREATE TABLE IF NOT EXISTS contabilidad_asientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      negocio_id INT NULL,
      fecha DATE NOT NULL,
      descripcion VARCHAR(255) NULL,
      referencia_tipo VARCHAR(60) NULL,
      referencia_id BIGINT NULL,
      estado ENUM('BORRADOR', 'CONTABILIZADO', 'ANULADO') NOT NULL DEFAULT 'CONTABILIZADO',
      creado_por INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_conta_asientos_empresa_fecha (empresa_id, fecha),
      KEY idx_conta_asientos_negocio (negocio_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableContabilidadAsientoLineas() {
  await query(`
    CREATE TABLE IF NOT EXISTS contabilidad_asiento_lineas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asiento_id INT NOT NULL,
      cuenta_id INT NOT NULL,
      descripcion VARCHAR(255) NULL,
      debe DECIMAL(12,2) NOT NULL DEFAULT 0,
      haber DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_conta_lineas_asiento (asiento_id),
      KEY idx_conta_lineas_cuenta (cuenta_id),
      CONSTRAINT fk_conta_lineas_asiento FOREIGN KEY (asiento_id) REFERENCES contabilidad_asientos(id) ON DELETE CASCADE,
      CONSTRAINT fk_conta_lineas_cuenta FOREIGN KEY (cuenta_id) REFERENCES contabilidad_cuentas(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableContabilidadPeriodos() {
  await query(`
    CREATE TABLE IF NOT EXISTS contabilidad_periodos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      anio INT NOT NULL,
      mes INT NOT NULL,
      estado ENUM('ABIERTO', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',
      cerrado_at DATETIME NULL,
      cerrado_por INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_conta_periodos_empresa (empresa_id, anio, mes)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableContabilidadEventos() {
  await query(`
    CREATE TABLE IF NOT EXISTS contabilidad_eventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empresa_id INT NOT NULL,
      tipo VARCHAR(60) NOT NULL,
      origen_id BIGINT NOT NULL,
      asiento_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_conta_eventos_unique (empresa_id, tipo, origen_id),
      KEY idx_conta_eventos_asiento (asiento_id),
      CONSTRAINT fk_conta_eventos_asiento FOREIGN KEY (asiento_id) REFERENCES contabilidad_asientos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureDefaultPlanCuentas() {
  if (!(await tableExists('empresas')) || !(await tableExists('contabilidad_cuentas'))) return;
  const empresas = await query('SELECT id FROM empresas');
  if (!empresas || empresas.length === 0) return;

  const cuentasBase = [
    { codigo: '1.1.1', nombre: 'Caja', tipo: 'ACTIVO', alias: 'CAJA' },
    { codigo: '1.1.2', nombre: 'Bancos', tipo: 'ACTIVO', alias: 'BANCO' },
    { codigo: '1.1.3', nombre: 'Cuentas por cobrar', tipo: 'ACTIVO', alias: 'CXC' },
    { codigo: '1.1.4', nombre: 'Inventario', tipo: 'ACTIVO', alias: 'INVENTARIO' },
    { codigo: '1.1.5', nombre: 'ITBIS acreditable', tipo: 'ACTIVO', alias: 'ITBIS_ACREDITABLE' },
    { codigo: '1.2.1', nombre: 'Activos fijos', tipo: 'ACTIVO', alias: 'ACTIVOS_FIJOS' },
    { codigo: '2.1.1', nombre: 'Cuentas por pagar', tipo: 'PASIVO', alias: 'CXP' },
    { codigo: '2.1.2', nombre: 'ITBIS por pagar', tipo: 'PASIVO', alias: 'ITBIS_POR_PAGAR' },
    { codigo: '2.1.3', nombre: 'Sueldos por pagar', tipo: 'PASIVO', alias: 'SUELDOS_POR_PAGAR' },
    { codigo: '2.1.4', nombre: 'Prestamos', tipo: 'PASIVO', alias: 'PRESTAMOS' },
    { codigo: '3.1.1', nombre: 'Capital', tipo: 'PATRIMONIO', alias: 'CAPITAL' },
    { codigo: '3.1.2', nombre: 'Resultados acumulados', tipo: 'PATRIMONIO', alias: 'RESULTADOS_ACUMULADOS' },
    { codigo: '3.1.3', nombre: 'Utilidad del periodo', tipo: 'PATRIMONIO', alias: 'UTILIDAD_PERIODO' },
    { codigo: '4.1.1', nombre: 'Ventas', tipo: 'INGRESO', alias: 'VENTAS' },
    { codigo: '4.1.2', nombre: 'Otros ingresos', tipo: 'INGRESO', alias: 'OTROS_INGRESOS' },
    { codigo: '4.1.3', nombre: 'Propinas', tipo: 'INGRESO', alias: 'PROPINA' },
    { codigo: '5.1.1', nombre: 'Costo de ventas', tipo: 'COSTO', alias: 'COGS' },
    { codigo: '6.1.1', nombre: 'Nomina', tipo: 'GASTO', alias: 'GASTO_NOMINA' },
    { codigo: '6.1.2', nombre: 'Alquiler', tipo: 'GASTO', alias: 'GASTO_ALQUILER' },
    { codigo: '6.1.3', nombre: 'Luz y agua', tipo: 'GASTO', alias: 'GASTO_SERVICIOS' },
    { codigo: '6.1.4', nombre: 'Marketing', tipo: 'GASTO', alias: 'GASTO_MARKETING' },
    { codigo: '6.1.5', nombre: 'Mantenimiento', tipo: 'GASTO', alias: 'GASTO_MANTENIMIENTO' },
    { codigo: '6.1.6', nombre: 'Comisiones', tipo: 'GASTO', alias: 'GASTO_COMISIONES' },
    { codigo: '6.1.7', nombre: 'Gastos generales', tipo: 'GASTO', alias: 'GASTOS_GENERALES' },
  ];

  for (const empresa of empresas) {
    const empresaId = empresa.id;
    const existente = await query(
      'SELECT id FROM contabilidad_cuentas WHERE empresa_id = ? LIMIT 1',
      [empresaId]
    );
    if (existente && existente.length) continue;
    for (const cuenta of cuentasBase) {
      await query(
        `INSERT INTO contabilidad_cuentas (empresa_id, codigo, nombre, tipo, alias)
         VALUES (?, ?, ?, ?, ?)`,
        [empresaId, cuenta.codigo, cuenta.nombre, cuenta.tipo, cuenta.alias]
      );
    }
  }
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

async function ensureTableDgiiPaso2Config() {
  await query(`
    CREATE TABLE IF NOT EXISTS dgii_paso2_config (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      usuario_certificacion VARCHAR(180) NULL,
      clave_certificacion_enc LONGTEXT NULL,
      p12_nombre_archivo VARCHAR(255) NULL,
      p12_base64 LONGTEXT NULL,
      p12_password_enc LONGTEXT NULL,
      rnc_emisor VARCHAR(20) NULL,
      modo_autenticacion VARCHAR(30) NOT NULL DEFAULT 'CREDENCIALES',
      endpoints_json LONGTEXT NULL,
      token_cache LONGTEXT NULL,
      token_expira_en DATETIME NULL,
      updated_by_usuario_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_dgii_paso2_config_negocio (negocio_id),
      CONSTRAINT fk_dgii_paso2_config_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableDgiiPaso2Sets() {
  await query(`
    CREATE TABLE IF NOT EXISTS dgii_paso2_sets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      nombre_archivo VARCHAR(255) NOT NULL,
      hash_sha256 VARCHAR(64) NULL,
      metadata_json LONGTEXT NULL,
      total_casos INT NOT NULL DEFAULT 0,
      total_ecf INT NOT NULL DEFAULT 0,
      total_fc INT NOT NULL DEFAULT 0,
      total_resumenes INT NOT NULL DEFAULT 0,
      estado VARCHAR(20) NOT NULL DEFAULT 'CARGADO',
      creado_por_usuario_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_dgii_paso2_sets_negocio_fecha (negocio_id, created_at),
      CONSTRAINT fk_dgii_paso2_sets_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableDgiiPaso2Casos() {
  await query(`
    CREATE TABLE IF NOT EXISTS dgii_paso2_casos (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      set_id BIGINT NOT NULL,
      negocio_id INT NOT NULL,
      hoja VARCHAR(120) NULL,
      fila_excel INT NULL,
      caso_codigo VARCHAR(120) NULL,
      orden_envio INT NOT NULL DEFAULT 0,
      flujo VARCHAR(30) NOT NULL DEFAULT 'ECF_NORMAL',
      tipo_documento VARCHAR(60) NULL,
      encf VARCHAR(30) NULL,
      ncf VARCHAR(30) NULL,
      monto_total DECIMAL(14,2) NOT NULL DEFAULT 0,
      payload_json LONGTEXT NOT NULL,
      xml_generado LONGTEXT NULL,
      xml_firmado LONGTEXT NULL,
      estado_local VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
      dgii_estado VARCHAR(30) NULL,
      dgii_codigo VARCHAR(80) NULL,
      dgii_mensaje LONGTEXT NULL,
      dgii_track_id VARCHAR(120) NULL,
      intentos INT NOT NULL DEFAULT 0,
      ultimo_procesado_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_dgii_paso2_casos_set (set_id),
      KEY idx_dgii_paso2_casos_negocio_estado (negocio_id, estado_local),
      KEY idx_dgii_paso2_casos_negocio_orden (negocio_id, orden_envio),
      KEY idx_dgii_paso2_casos_negocio_flujo (negocio_id, flujo),
      CONSTRAINT fk_dgii_paso2_casos_set FOREIGN KEY (set_id) REFERENCES dgii_paso2_sets(id),
      CONSTRAINT fk_dgii_paso2_casos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureTableDgiiPaso2Intentos() {
  await query(`
    CREATE TABLE IF NOT EXISTS dgii_paso2_intentos (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      caso_id BIGINT NOT NULL,
      negocio_id INT NOT NULL,
      tipo_envio VARCHAR(30) NOT NULL,
      endpoint VARCHAR(300) NULL,
      request_headers_json LONGTEXT NULL,
      request_body LONGTEXT NULL,
      response_status INT NULL,
      response_headers_json LONGTEXT NULL,
      response_body LONGTEXT NULL,
      resultado VARCHAR(20) NOT NULL DEFAULT 'ERROR',
      codigo VARCHAR(80) NULL,
      mensaje LONGTEXT NULL,
      track_id VARCHAR(120) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_dgii_paso2_intentos_caso (caso_id),
      KEY idx_dgii_paso2_intentos_negocio_fecha (negocio_id, created_at),
      CONSTRAINT fk_dgii_paso2_intentos_caso FOREIGN KEY (caso_id) REFERENCES dgii_paso2_casos(id),
      CONSTRAINT fk_dgii_paso2_intentos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
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
      estado VARCHAR(20) NOT NULL DEFAULT 'PAGADO',
      fecha_vencimiento DATE NULL,
      fecha_pago DATE NULL,
      monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0,
      origen_fondos VARCHAR(20) NULL,
      origen_detalle VARCHAR(80) NULL,
      tipo_comprobante VARCHAR(30) NULL,
      itbis DECIMAL(12,2) NOT NULL DEFAULT 0,
      centro_costo VARCHAR(80) NULL,
      aprobado_por INT NULL,
      aprobado_at DATETIME NULL,
      anulado_por INT NULL,
      anulado_at DATETIME NULL,
      motivo_anulacion TEXT NULL,
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
  await ensureColumn('gastos', "estado VARCHAR(20) NOT NULL DEFAULT 'PAGADO'");
  await ensureColumn('gastos', 'fecha_vencimiento DATE NULL');
  await ensureColumn('gastos', 'fecha_pago DATE NULL');
  await ensureColumn('gastos', 'monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('gastos', 'origen_fondos VARCHAR(20) NULL');
  await ensureColumn('gastos', 'origen_detalle VARCHAR(80) NULL');
  await ensureColumn('gastos', 'tipo_comprobante VARCHAR(30) NULL');
  await ensureColumn('gastos', 'itbis DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('gastos', 'centro_costo VARCHAR(80) NULL');
  await ensureColumn('gastos', 'aprobado_por INT NULL');
  await ensureColumn('gastos', 'aprobado_at DATETIME NULL');
  await ensureColumn('gastos', 'anulado_por INT NULL');
  await ensureColumn('gastos', 'anulado_at DATETIME NULL');
  await ensureColumn('gastos', 'motivo_anulacion TEXT NULL');
  await ensureColumn('gastos', 'empresa_id INT NULL');
  try {
    await query('ALTER TABLE gastos MODIFY COLUMN negocio_id INT NULL');
  } catch (error) {
    console.warn('No se pudo actualizar negocio_id en gastos:', error?.message || error);
  }
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
  await query(
    `UPDATE gastos g
        JOIN negocios n ON n.id = g.negocio_id
       SET g.empresa_id = n.empresa_id
     WHERE g.empresa_id IS NULL`
  );

  await ensureIndexByName('gastos', 'idx_gastos_negocio_fecha', '(negocio_id, fecha)');
  await ensureIndexByName('gastos', 'idx_gastos_negocio_categoria_fecha', '(negocio_id, categoria, fecha)');
  await ensureIndexByName('gastos', 'idx_gastos_referencia', '(negocio_id, referencia_tipo, referencia_id)');
  await ensureIndexByName('gastos', 'idx_gastos_empresa_fecha', '(empresa_id, fecha)');
  await ensureForeignKey('gastos', 'negocio_id');
}

async function ensureTableGastosPagos() {
  await query(`
    CREATE TABLE IF NOT EXISTS gastos_pagos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gasto_id INT NOT NULL,
      negocio_id INT NOT NULL,
      fecha DATE NOT NULL,
      monto DECIMAL(12,2) NOT NULL DEFAULT 0,
      metodo_pago VARCHAR(40) NULL,
      origen_fondos VARCHAR(20) NULL,
      origen_detalle VARCHAR(80) NULL,
      referencia VARCHAR(60) NULL,
      notas TEXT NULL,
      usuario_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_gastos_pagos_gasto FOREIGN KEY (gasto_id) REFERENCES gastos(id),
      CONSTRAINT fk_gastos_pagos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  try {
    await query('ALTER TABLE gastos_pagos MODIFY COLUMN negocio_id INT NULL');
  } catch (error) {
    console.warn('No se pudo actualizar negocio_id en gastos_pagos:', error?.message || error);
  }

  await ensureIndexByName('gastos_pagos', 'idx_gastos_pagos_negocio_fecha', '(negocio_id, fecha)');
  await ensureIndexByName('gastos_pagos', 'idx_gastos_pagos_gasto', '(gasto_id)');
  await ensureForeignKey('gastos_pagos', 'negocio_id');
  await ensureForeignKey('gastos_pagos', 'gasto_id', 'gastos');
}

async function ensureTableGastosAdjuntos() {
  await query(`
    CREATE TABLE IF NOT EXISTS gastos_adjuntos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gasto_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      mime VARCHAR(80) NULL,
      contenido_base64 LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_gastos_adjuntos_gasto FOREIGN KEY (gasto_id) REFERENCES gastos(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('gastos_adjuntos', 'idx_gastos_adjuntos_gasto', '(gasto_id)');
  await ensureForeignKey('gastos_adjuntos', 'gasto_id', 'gastos');
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
      itbis_capitalizable TINYINT(1) NOT NULL DEFAULT 0,
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
  await ensureColumn('compras_inventario', 'itbis_capitalizable TINYINT(1) NOT NULL DEFAULT 0');
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
      costo_unitario_sin_itbis DECIMAL(12,2) NOT NULL DEFAULT 0,
      costo_unitario_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0,
      itbis_aplica TINYINT(1) NOT NULL DEFAULT 0,
      itbis_capitalizable TINYINT(1) NOT NULL DEFAULT 0,
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
  await ensureColumn('compras_inventario_detalle', 'costo_unitario_sin_itbis DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('compras_inventario_detalle', 'costo_unitario_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('compras_inventario_detalle', 'itbis_aplica TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('compras_inventario_detalle', 'itbis_capitalizable TINYINT(1) NOT NULL DEFAULT 0');
}

async function ensureTableRecetas() {
  await query(`
    CREATE TABLE IF NOT EXISTS recetas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      producto_final_id INT NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_recetas_producto (negocio_id, producto_final_id),
      CONSTRAINT fk_recetas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
      CONSTRAINT fk_recetas_producto FOREIGN KEY (producto_final_id) REFERENCES productos(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('recetas', 'idx_recetas_negocio', '(negocio_id)');
}

async function ensureTableRecetaDetalle() {
  await query(`
    CREATE TABLE IF NOT EXISTS receta_detalle (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receta_id INT NOT NULL,
      insumo_id INT NOT NULL,
      cantidad DECIMAL(12,4) NOT NULL,
      unidad ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_receta_detalle_receta FOREIGN KEY (receta_id) REFERENCES recetas(id),
      CONSTRAINT fk_receta_detalle_insumo FOREIGN KEY (insumo_id) REFERENCES productos(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('receta_detalle', 'idx_receta_detalle_receta', '(receta_id)');
  await ensureIndexByName('receta_detalle', 'idx_receta_detalle_insumo', '(insumo_id)');
}

async function ensureTableConsumoInsumos() {
  await query(`
    CREATE TABLE IF NOT EXISTS consumo_insumos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pedido_id INT NOT NULL,
      detalle_pedido_id INT NULL,
      producto_final_id INT NOT NULL,
      insumo_id INT NOT NULL,
      cantidad_base DECIMAL(12,4) NOT NULL,
      unidad_base ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND',
      revertido TINYINT(1) NOT NULL DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      negocio_id INT NOT NULL,
      CONSTRAINT fk_consumo_insumos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
      CONSTRAINT fk_consumo_insumos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
      CONSTRAINT fk_consumo_insumos_producto FOREIGN KEY (producto_final_id) REFERENCES productos(id),
      CONSTRAINT fk_consumo_insumos_insumo FOREIGN KEY (insumo_id) REFERENCES productos(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('consumo_insumos', 'idx_consumo_insumos_negocio_pedido', '(negocio_id, pedido_id)');
  await ensureIndexByName('consumo_insumos', 'idx_consumo_insumos_negocio_insumo', '(negocio_id, insumo_id)');
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

async function ensureTableClientes() {
  await query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      documento VARCHAR(100),
      tipo_documento VARCHAR(50),
      telefono VARCHAR(50),
      email VARCHAR(255),
      direccion TEXT,
      notas TEXT,
      activo TINYINT DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME,
      negocio_id INT NULL,
      empresa_id INT NULL,
      codigo VARCHAR(40) NULL,
      tipo_cliente VARCHAR(20) NULL,
      segmento VARCHAR(30) NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
      vip TINYINT(1) NOT NULL DEFAULT 0,
      credito_activo TINYINT(1) NOT NULL DEFAULT 0,
      credito_limite DECIMAL(12,2) NOT NULL DEFAULT 0,
      credito_dias INT NOT NULL DEFAULT 0,
      credito_bloqueo_exceso TINYINT(1) NOT NULL DEFAULT 0,
      tags TEXT NULL,
      notas_internas TEXT NULL,
      fecha_cumple DATE NULL,
      metodo_pago_preferido VARCHAR(40) NULL,
      whatsapp VARCHAR(50) NULL,
      CONSTRAINT fk_clientes_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn('clientes', 'empresa_id INT NULL');
  await ensureColumn('clientes', 'codigo VARCHAR(40) NULL');
  await ensureColumn('clientes', 'tipo_cliente VARCHAR(20) NULL');
  await ensureColumn('clientes', 'segmento VARCHAR(30) NULL');
  await ensureColumn('clientes', "estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'");
  await ensureColumn('clientes', 'vip TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('clientes', 'credito_activo TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('clientes', 'credito_limite DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('clientes', 'credito_dias INT NOT NULL DEFAULT 0');
  await ensureColumn('clientes', 'credito_bloqueo_exceso TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('clientes', 'tags TEXT NULL');
  await ensureColumn('clientes', 'notas_internas TEXT NULL');
  await ensureColumn('clientes', 'fecha_cumple DATE NULL');
  await ensureColumn('clientes', 'metodo_pago_preferido VARCHAR(40) NULL');
  await ensureColumn('clientes', 'whatsapp VARCHAR(50) NULL');

  try {
    await query('ALTER TABLE clientes MODIFY COLUMN negocio_id INT NULL');
  } catch (error) {
    console.warn('No se pudo actualizar negocio_id en clientes:', error?.message || error);
  }

  try {
    await query(
      `UPDATE clientes c
          JOIN negocios n ON n.id = c.negocio_id
         SET c.empresa_id = n.empresa_id
       WHERE c.empresa_id IS NULL`
    );
  } catch (error) {
    console.warn('No se pudo actualizar empresa_id en clientes:', error?.message || error);
  }

  await query("UPDATE clientes SET estado = 'ACTIVO' WHERE estado IS NULL OR estado = ''");
  await query("UPDATE clientes SET tipo_cliente = 'PERSONA' WHERE tipo_cliente IS NULL OR tipo_cliente = ''");
  await query("UPDATE clientes SET segmento = 'CONSUMIDOR' WHERE segmento IS NULL OR segmento = ''");

  await ensureIndexByName('clientes', 'idx_clientes_empresa', '(empresa_id)');
  await ensureIndexByName('clientes', 'idx_clientes_negocio', '(negocio_id)');
  await ensureIndexByName('clientes', 'idx_clientes_codigo', '(codigo)');
}

async function ensureTableClientesNotas() {
  await query(`
    CREATE TABLE IF NOT EXISTS clientes_notas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      empresa_id INT NOT NULL,
      negocio_id INT NULL,
      nota TEXT NOT NULL,
      usuario_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_clientes_notas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('clientes_notas', 'idx_clientes_notas_cliente', '(cliente_id)');
  await ensureIndexByName('clientes_notas', 'idx_clientes_notas_empresa', '(empresa_id)');
}

async function ensureTableClientesAdjuntos() {
  await query(`
    CREATE TABLE IF NOT EXISTS clientes_adjuntos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      mime VARCHAR(80) NULL,
      contenido_base64 LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_clientes_adjuntos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('clientes_adjuntos', 'idx_clientes_adjuntos_cliente', '(cliente_id)');
}

async function ensureTableClientesDeudas() {
  await query(`
    CREATE TABLE IF NOT EXISTS clientes_deudas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      negocio_id INT NOT NULL,
      fecha DATE NOT NULL,
      descripcion TEXT,
      monto_total DECIMAL(12,2) NOT NULL,
      origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja',
      cierre_id INT NULL,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_clientes_deudas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      CONSTRAINT fk_clientes_deudas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('clientes_deudas', 'idx_clientes_deudas_cliente', '(cliente_id)');
  await ensureIndexByName('clientes_deudas', 'idx_clientes_deudas_negocio', '(negocio_id)');
}

async function ensureTableClientesDeudasDetalle() {
  await query(`
    CREATE TABLE IF NOT EXISTS clientes_deudas_detalle (
      id INT AUTO_INCREMENT PRIMARY KEY,
      deuda_id INT NOT NULL,
      producto_id INT NOT NULL,
      nombre_producto VARCHAR(255),
      cantidad DECIMAL(12,2) NOT NULL,
      precio_unitario DECIMAL(12,2) NOT NULL,
      total_linea DECIMAL(12,2) NOT NULL,
      negocio_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_clientes_deudas_detalle_deuda FOREIGN KEY (deuda_id) REFERENCES clientes_deudas(id),
      CONSTRAINT fk_clientes_deudas_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
      CONSTRAINT fk_clientes_deudas_detalle_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('clientes_deudas_detalle', 'idx_clientes_deudas_detalle_deuda', '(deuda_id)');
  await ensureIndexByName('clientes_deudas_detalle', 'idx_clientes_deudas_detalle_producto', '(producto_id)');
  await ensureIndexByName('clientes_deudas_detalle', 'idx_clientes_deudas_detalle_negocio', '(negocio_id)');
}

async function ensureTableClientesAbonos() {
  await query(`
    CREATE TABLE IF NOT EXISTS clientes_abonos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      deuda_id INT NOT NULL,
      cliente_id INT NOT NULL,
      negocio_id INT NOT NULL,
      fecha DATE NOT NULL,
      monto DECIMAL(12,2) NOT NULL,
      metodo_pago VARCHAR(40) NULL,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_clientes_abonos_deuda FOREIGN KEY (deuda_id) REFERENCES clientes_deudas(id),
      CONSTRAINT fk_clientes_abonos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      CONSTRAINT fk_clientes_abonos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndexByName('clientes_abonos', 'idx_clientes_abonos_deuda', '(deuda_id)');
  await ensureIndexByName('clientes_abonos', 'idx_clientes_abonos_cliente', '(cliente_id)');
  await ensureIndexByName('clientes_abonos', 'idx_clientes_abonos_negocio', '(negocio_id)');
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

async function ensureEmpresaColumns() {
  await ensureColumn('negocios', 'empresa_id INT NOT NULL DEFAULT 1');
  await ensureColumn('usuarios', 'empresa_id INT NULL');
  try {
    await query('UPDATE negocios SET empresa_id = 1 WHERE empresa_id IS NULL OR empresa_id = 0');
  } catch (error) {
    console.warn('No se pudo normalizar empresa_id en negocios:', error?.message || error);
  }
  await ensureIndexByName('negocios', 'idx_negocios_empresa', '(empresa_id)');
  await ensureIndexByName('usuarios', 'idx_usuarios_empresa', '(empresa_id)');
  await ensureForeignKey('negocios', 'empresa_id', 'empresas');
  await ensureForeignKey('usuarios', 'empresa_id', 'empresas');
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
    'clientes_deudas',
    'clientes_deudas_detalle',
    'clientes_abonos',
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
    if (table === 'clientes') {
      continue;
    }
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
    'clientes_deudas',
    'clientes_deudas_detalle',
    'clientes_abonos',
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

async function ensureTableRegistroSolicitudes() {
  await query(`
    CREATE TABLE IF NOT EXISTS registro_solicitudes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(24) NOT NULL,
      negocio_nombre VARCHAR(180) NOT NULL,
      negocio_id INT NULL,
      negocio_slug VARCHAR(140) NULL,
      negocio_tipo VARCHAR(80) NULL,
      admin_nombre VARCHAR(180) NOT NULL,
      admin_usuario VARCHAR(120) NOT NULL,
      admin_usuario_id INT NULL,
      admin_password_hash TEXT NULL,
      telefono VARCHAR(40) NULL,
      email VARCHAR(255) NULL,
      ciudad VARCHAR(120) NULL,
      cantidad_usuarios VARCHAR(40) NULL,
      usa_cocina TINYINT(1) NOT NULL DEFAULT 0,
      usa_delivery TINYINT(1) NOT NULL DEFAULT 0,
      modulo_kds TINYINT(1) NOT NULL DEFAULT 0,
      modulos_solicitados_json JSON NULL,
      modulos_recomendados_json JSON NULL,
      respuestas_json JSON NULL,
      estado VARCHAR(30) NOT NULL DEFAULT 'pendiente_pago',
      estado_pago_limite DATETIME NULL,
      notas_publicas TEXT NULL,
      notas_internas TEXT NULL,
      correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
      correo_error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_registro_solicitudes_codigo (codigo),
      KEY idx_registro_solicitudes_estado (estado),
      KEY idx_registro_solicitudes_creado (created_at),
      KEY idx_registro_solicitudes_negocio (negocio_id),
      KEY idx_registro_solicitudes_admin_usuario (admin_usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn('registro_solicitudes', 'negocio_id INT NULL');
  await ensureColumn('registro_solicitudes', 'negocio_slug VARCHAR(140) NULL');
  await ensureColumn('registro_solicitudes', 'admin_usuario_id INT NULL');
  await ensureIndexByName('registro_solicitudes', 'idx_registro_solicitudes_negocio', '(negocio_id)');
  await ensureIndexByName('registro_solicitudes', 'idx_registro_solicitudes_admin_usuario', '(admin_usuario_id)');
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
                ELSE JSON_SET(
                  JSON_SET(
                    config_modulos,
                    '$.bar',
                    IFNULL(JSON_EXTRACT(config_modulos, '$.bar'), JSON_EXTRACT(?, '$.bar'))
                  ),
                  '$.mostrador',
                  IFNULL(JSON_EXTRACT(config_modulos, '$.mostrador'), JSON_EXTRACT(?, '$.mostrador'))
                )
              END,
              color_boton_primario = COALESCE(color_boton_primario, color_primario),
              color_boton_secundario = COALESCE(color_boton_secundario, color_secundario),
              color_boton_peligro = COALESCE(color_boton_peligro, ?),
              color_header = COALESCE(color_header, color_primario, color_secundario),
              color_texto = COALESCE(color_texto, ?)` ,
      [defaultConfig, defaultConfig, defaultConfig, defaultConfig, DEFAULT_COLOR_PELIGRO, DEFAULT_COLOR_TEXTO]
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
  await ensureTableEmpresas();
  await ensureTableNegocios();
  await ensureTableContabilidadCuentas();
  await ensureTableContabilidadAsientos();
  await ensureTableContabilidadAsientoLineas();
  await ensureTableContabilidadPeriodos();
  await ensureTableContabilidadEventos();
  await ensureTableEmpresaProductos();
  await ensureTableEmpresaInventarioMovimientos();
  await ensureTableEmpresaInventarioCapas();
  await ensureColumn('empresa_productos', 'sku VARCHAR(120) NULL');
  await ensureColumn('empresa_productos', 'codigo_barras VARCHAR(120) NULL');
  await ensureColumn('empresa_productos', 'familia VARCHAR(120) NULL');
  await ensureColumn('empresa_productos', 'tags VARCHAR(255) NULL');
  await ensureColumn('empresa_productos', 'atributos_json JSON NULL');
  await ensureColumn('empresa_productos', 'stock DECIMAL(12,4) NULL DEFAULT 0');
  await ensureColumn('empresa_productos', 'stock_minimo DECIMAL(12,4) NOT NULL DEFAULT 0');
  await ensureColumn('empresa_productos', 'stock_indefinido TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('empresa_productos', 'ubicacion VARCHAR(120) NULL');
  await ensureColumn('empresa_productos', 'bodega VARCHAR(120) NULL');
  await ensureColumn('empresa_productos', 'serializable TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('empresa_productos', 'costo_promedio_actual DECIMAL(12,4) NOT NULL DEFAULT 0');
  await ensureColumn('empresas', "inventario_valoracion_metodo VARCHAR(20) NOT NULL DEFAULT 'PROMEDIO'");
  await ensureTableEmpresaEmpleados();
  await ensureColumn('empresa_empleados', 'telefono VARCHAR(50) NULL');
  await ensureColumn('empresa_empleados', 'ars_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0');
  await ensureColumn('empresa_empleados', 'afp_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0');
  await ensureColumn('empresa_empleados', 'isr_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0');
  await modifyColumn('empresa_empleados', "tipo_pago ENUM('MENSUAL', 'QUINCENAL', 'HORA') NOT NULL DEFAULT 'MENSUAL'");
  await ensureTableEmpresaAsistencias();
  await ensureTableEmpresaNominaMovimientos();
  await ensureTableEmpresaContabilidad();
  await ensureTableHistorialBar();
  await ensureTablePosiumFacturacionConfig();
  await ensureTablePosiumFacturas();
  await ensureTableDgiiPaso2Config();
  await ensureTableDgiiPaso2Sets();
  await ensureTableDgiiPaso2Casos();
  await ensureTableDgiiPaso2Intentos();
  await ensureTableGastos();
  await ensureTableGastosPagos();
  await ensureTableGastosAdjuntos();
  await ensureTableComprasInventario();
  await ensureTableComprasInventarioDetalle();
  await ensureTableRecetas();
  await ensureTableRecetaDetalle();
  await ensureTableConsumoInsumos();
  await ensureTableAnalisisCapitalInicial();
  await ensureTableClientes();
  await ensureTableClientesNotas();
  await ensureTableClientesAdjuntos();
  await ensureTableClientesDeudas();
  await ensureTableClientesDeudasDetalle();
  await ensureTableClientesAbonos();
  await ensureColumn('clientes_deudas', "origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja'");
  await ensureColumn('clientes_deudas', 'cierre_id INT NULL');
  await ensureIndexByName('clientes_deudas', 'idx_clientes_deudas_cierre', '(cierre_id)');
  await ensureIndexByName('clientes_deudas', 'idx_clientes_deudas_origen', '(origen_caja)');
  await modifyColumn('configuracion', 'valor LONGTEXT NOT NULL');
  await ensureColumn('salidas_caja', 'usuario_id INT NULL');
  await ensureColumn('negocios', 'slug VARCHAR(120) UNIQUE');
  await ensureColumn('negocios', 'color_primario VARCHAR(20) NULL');
  await ensureColumn('negocios', 'color_secundario VARCHAR(20) NULL');
  await ensureColumn('negocios', 'logo_url VARCHAR(255) NULL');
  await ensureColumn('negocios', 'titulo_sistema VARCHAR(150) NULL');
  await ensureColumn('categorias', "area_preparacion ENUM('ninguna', 'cocina', 'bar') NOT NULL DEFAULT 'ninguna'");
  await ensureColumn('productos', 'stock_indefinido TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('productos', 'precios JSON NULL');
  await ensureColumn('productos', 'costo_base_sin_itbis DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('productos', 'costo_promedio_actual DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('productos', 'ultimo_costo_sin_itbis DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('productos', 'actualiza_costo_con_compras TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('productos', 'costo_unitario_real DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('productos', 'costo_unitario_real_incluye_itbis TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('productos', "tipo_producto ENUM('FINAL', 'INSUMO') NOT NULL DEFAULT 'FINAL'");
  await ensureColumn('productos', 'insumo_vendible TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('productos', "unidad_base ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND'");
  await modifyColumn('productos', "unidad_base ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND'");
  await modifyColumn('receta_detalle', "unidad ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND'");
  await modifyColumn('consumo_insumos', "unidad_base ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND'");
  await ensureColumn('productos', 'contenido_por_unidad DECIMAL(12,4) NOT NULL DEFAULT 1');
  await modifyColumn('productos', 'stock DECIMAL(12,4) NULL DEFAULT 0');
  await ensureColumn('pedidos', 'bartender_id INT NULL');
  await ensureColumn('pedidos', 'bartender_nombre VARCHAR(255) NULL');
  await ensureColumn('pedidos', "origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja'");
  await ensureColumn('pedidos', 'cogs_total DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('pedidos', 'delivery_estado VARCHAR(20) NULL');
  await ensureColumn('pedidos', 'delivery_usuario_id INT NULL');
  await ensureColumn('pedidos', 'delivery_usuario_nombre VARCHAR(255) NULL');
  await ensureColumn('pedidos', 'delivery_fecha_asignacion DATETIME NULL');
  await ensureColumn('pedidos', 'delivery_fecha_entrega DATETIME NULL');
  await ensureColumn('pedidos', 'delivery_telefono VARCHAR(50) NULL');
  await ensureColumn('pedidos', 'delivery_direccion TEXT NULL');
  await ensureColumn('pedidos', 'delivery_referencia VARCHAR(255) NULL');
  await ensureColumn('pedidos', 'delivery_notas TEXT NULL');
  await ensureColumn('cierres_caja', "origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja'");
  await ensureColumn('salidas_caja', "origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja'");
  await ensureColumn('detalle_pedido', 'costo_unitario_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureColumn('detalle_pedido', 'cogs_linea DECIMAL(12,2) NOT NULL DEFAULT 0');
  await ensureNegocioThemeAndModulesColumns();
  await ensureDefaultEmpresa();
  await ensureDefaultPlanCuentas();
  await ensureEmpresaColumns();
  await ensureLogoUrlCapacity();
  await ensureNegocioStatusColumns();
  await ensureDefaultNegocio();
  await initializeNegocioThemeAndModulesDefaults();
  await addNegocioIdToTables();
  await removeInsumosModule();
  try {
    await query(
      `UPDATE productos
          SET costo_unitario_real = CASE
            WHEN COALESCE(costo_unitario_real, 0) = 0 THEN COALESCE(costo_promedio_actual, costo_base_sin_itbis, 0)
            ELSE costo_unitario_real
          END`
    );
  } catch (error) {
    console.warn('No se pudo inicializar costo_unitario_real desde costos previos:', error?.message || error);
  }
  await ensurePedidosNcfUniqueIndex();
  await ensureEsSuperAdminColumn();
  await ensurePasswordControlColumns();
  await ensureTableAdminImpersonations();
  await ensureTableAdminActions();
  await ensureTableRegistroSolicitudes();
  await normalizeConfiguracionKeys();
  await normalizeSecuenciasPk();
}

module.exports = runMigrations;



