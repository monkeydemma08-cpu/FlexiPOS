-- MySQL schema for POSIUM (generated from existing SQLite definitions)
CREATE TABLE IF NOT EXISTS negocios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  rnc VARCHAR(20),
  telefono VARCHAR(30),
  direccion VARCHAR(255),
  activo TINYINT DEFAULT 1,
  suspendido TINYINT(1) DEFAULT 0,
  deleted_at DATETIME NULL,
  motivo_suspension TEXT NULL,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  color_primario VARCHAR(20),
  color_secundario VARCHAR(20),
  color_texto VARCHAR(7) NULL,
  color_header VARCHAR(7) NULL,
  color_boton_primario VARCHAR(7) NULL,
  color_boton_secundario VARCHAR(7) NULL,
  color_boton_peligro VARCHAR(7) NULL,
  config_modulos JSON NULL,
  admin_principal_usuario_id BIGINT NULL,
  logo_url LONGTEXT,
  titulo_sistema VARCHAR(150),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  activo TINYINT DEFAULT 1,
  area_preparacion ENUM('ninguna', 'cocina', 'bar') NOT NULL DEFAULT 'ninguna',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_categorias_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  categoria_id INT,
  precio DECIMAL(10,2) NOT NULL,
  costo_base_sin_itbis DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_promedio_actual DECIMAL(12,2) NOT NULL DEFAULT 0,
  ultimo_costo_sin_itbis DECIMAL(12,2) NOT NULL DEFAULT 0,
  actualiza_costo_con_compras TINYINT(1) NOT NULL DEFAULT 1,
  costo_unitario_real DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_unitario_real_incluye_itbis TINYINT(1) NOT NULL DEFAULT 0,
  tipo_producto ENUM('FINAL', 'INSUMO') NOT NULL DEFAULT 'FINAL',
  insumo_vendible TINYINT(1) NOT NULL DEFAULT 0,
  unidad_base ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND',
  contenido_por_unidad DECIMAL(12,4) NOT NULL DEFAULT 1,
  stock DECIMAL(12,4) DEFAULT 0,
  stock_indefinido TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT DEFAULT 1,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  CONSTRAINT fk_productos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  negocio_id INT NOT NULL,
  CONSTRAINT fk_clientes_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clientes_deudas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  negocio_id INT NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT,
  monto_total DECIMAL(12,2) NOT NULL,
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_deudas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_clientes_deudas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clientes_abonos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deuda_id INT NOT NULL,
  cliente_id INT NOT NULL,
  negocio_id INT NOT NULL,
  fecha DATE NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  metodo_pago VARCHAR(40),
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_abonos_deuda FOREIGN KEY (deuda_id) REFERENCES clientes_deudas(id),
  CONSTRAINT fk_clientes_abonos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_clientes_abonos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS configuracion (
  clave VARCHAR(191) NOT NULL,
  valor LONGTEXT NOT NULL,
  negocio_id INT NOT NULL,
  PRIMARY KEY (clave, negocio_id),
  CONSTRAINT fk_configuracion_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  usuario VARCHAR(100) UNIQUE,
  password TEXT,
  rol VARCHAR(50) NOT NULL,
  activo TINYINT NOT NULL DEFAULT 1,
  negocio_id INT NOT NULL,
  es_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  force_password_change TINYINT(1) NOT NULL DEFAULT 0,
  password_reset_at DATETIME NULL,
  CONSTRAINT fk_usuarios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  negocio_id INT NOT NULL,
  accion VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id),
  CONSTRAINT fk_admin_actions_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_impersonations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  negocio_id INT NOT NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_impersonations_admin FOREIGN KEY (admin_id) REFERENCES usuarios(id),
  CONSTRAINT fk_admin_impersonations_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cotizaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(100),
  cliente_nombre VARCHAR(255),
  cliente_documento VARCHAR(100),
  cliente_contacto VARCHAR(255),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_validez DATETIME,
  estado VARCHAR(50) DEFAULT 'borrador',
  subtotal DECIMAL(10,2) DEFAULT 0,
  impuesto DECIMAL(10,2) DEFAULT 0,
  descuento_monto DECIMAL(10,2) DEFAULT 0,
  descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  notas_internas TEXT,
  notas_cliente TEXT,
  creada_por INT,
  pedido_id INT,
  negocio_id INT NOT NULL,
  UNIQUE KEY idx_cotizaciones_codigo_negocio (codigo, negocio_id),
  CONSTRAINT fk_cotizaciones_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cotizacion_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id INT NOT NULL,
  producto_id INT,
  descripcion TEXT,
  cantidad DECIMAL(10,2) DEFAULT 1,
  precio_unitario DECIMAL(10,2) DEFAULT 0,
  descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
  descuento_monto DECIMAL(10,2) DEFAULT 0,
  subtotal_linea DECIMAL(10,2) DEFAULT 0,
  impuesto_linea DECIMAL(10,2) DEFAULT 0,
  total_linea DECIMAL(10,2) DEFAULT 0,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_cotizacion_items_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_cotizacion_items_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_cotizacion_items_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cuenta_id INT,
  mesa VARCHAR(100),
  cliente VARCHAR(255),
  modo_servicio VARCHAR(50) DEFAULT 'en_local',
  pago_efectivo DECIMAL(10,2) DEFAULT 0,
  pago_efectivo_entregado DECIMAL(10,2) DEFAULT 0,
  pago_tarjeta DECIMAL(10,2) DEFAULT 0,
  pago_transferencia DECIMAL(10,2) DEFAULT 0,
  pago_cambio DECIMAL(10,2) DEFAULT 0,
  cliente_documento VARCHAR(100),
  tipo_comprobante VARCHAR(50),
  ncf VARCHAR(50),
  estado_comprobante VARCHAR(50) DEFAULT 'sin_emitir',
  nota_credito_referencia INT,
  comentarios TEXT,
  estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  subtotal DECIMAL(10,2) DEFAULT 0,
  impuesto DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  cogs_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
  descuento_monto DECIMAL(10,2) DEFAULT 0,
  propina_porcentaje DECIMAL(5,2) DEFAULT 0,
  propina_monto DECIMAL(10,2) DEFAULT 0,
  nota TEXT,
  delivery_estado VARCHAR(20),
  delivery_usuario_id INT,
  delivery_usuario_nombre VARCHAR(255),
  delivery_fecha_asignacion DATETIME,
  delivery_fecha_entrega DATETIME,
  delivery_telefono VARCHAR(50),
  delivery_direccion TEXT,
  delivery_referencia VARCHAR(255),
  delivery_notas TEXT,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_listo DATETIME,
  fecha_cierre DATETIME,
  fecha_factura DATETIME,
  cocinero_id INT,
  cocinero_nombre VARCHAR(255),
  bartender_id INT,
  bartender_nombre VARCHAR(255),
  origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja',
  cierre_id INT,
  creado_por INT,
  preparado_por INT,
  cobrado_por INT,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_pedidos_nota_credito FOREIGN KEY (nota_credito_referencia) REFERENCES pedidos(id),
  CONSTRAINT fk_pedidos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  UNIQUE KEY idx_pedidos_ncf (negocio_id, ncf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  costo_unitario_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0,
  cogs_linea DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
  descuento_monto DECIMAL(10,2) DEFAULT 0,
  cantidad_descuento DECIMAL(10,2),
  negocio_id INT NOT NULL,
  CONSTRAINT fk_detalle_pedido_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  CONSTRAINT fk_detalle_pedido_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_detalle_pedido_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS historial_cocina (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cuenta_id INT,
  pedido_id INT NOT NULL,
  item_nombre VARCHAR(255) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  cocinero_id INT,
  cocinero_nombre VARCHAR(255),
  created_at DATETIME,
  completed_at DATETIME,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_historial_cocina_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS historial_bar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cuenta_id INT,
  pedido_id INT NOT NULL,
  item_nombre VARCHAR(255) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  bartender_id INT,
  bartender_nombre VARCHAR(255),
  created_at DATETIME,
  completed_at DATETIME,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_historial_bar_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS compras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proveedor VARCHAR(255) NOT NULL,
  rnc VARCHAR(50),
  fecha DATETIME NOT NULL,
  tipo_comprobante VARCHAR(50),
  ncf VARCHAR(50),
  monto_gravado DECIMAL(10,2) DEFAULT 0,
  impuesto DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  estado VARCHAR(50) NOT NULL DEFAULT 'emitido',
  nota_credito_referencia INT,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME,
  monto_exento DECIMAL(10,2) DEFAULT 0,
  comentarios TEXT,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_compras_nota_credito FOREIGN KEY (nota_credito_referencia) REFERENCES compras(id),
  CONSTRAINT fk_compras_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS detalle_compra (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  cantidad DECIMAL(10,2) NULL,
  precio_unitario DECIMAL(10,2) NULL,
  itbis DECIMAL(10,2) NULL,
  total DECIMAL(10,2) NULL,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_detalle_compra_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
  CONSTRAINT fk_detalle_compra_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  INDEX idx_gastos_negocio_fecha (negocio_id, fecha),
  INDEX idx_gastos_negocio_categoria_fecha (negocio_id, categoria, fecha),
  INDEX idx_gastos_referencia (negocio_id, referencia_tipo, referencia_id),
  CONSTRAINT fk_gastos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receta_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receta_id INT NOT NULL,
  insumo_id INT NOT NULL,
  cantidad DECIMAL(12,4) NOT NULL,
  unidad ENUM('UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB') NOT NULL DEFAULT 'UND',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receta_detalle_receta FOREIGN KEY (receta_id) REFERENCES recetas(id),
  CONSTRAINT fk_receta_detalle_insumo FOREIGN KEY (insumo_id) REFERENCES productos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notas_credito_ventas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  fecha DATETIME NOT NULL,
  motivo TEXT,
  monto DECIMAL(10,2) NOT NULL,
  ncf_nota VARCHAR(50),
  ncf_referencia VARCHAR(50),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_notas_credito_ventas_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  CONSTRAINT fk_notas_credito_ventas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notas_credito_compras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NOT NULL,
  fecha DATETIME NOT NULL,
  motivo TEXT,
  monto DECIMAL(10,2) NOT NULL,
  ncf_nota VARCHAR(50),
  ncf_referencia VARCHAR(50),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_notas_credito_compras_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
  CONSTRAINT fk_notas_credito_compras_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS secuencias_ncf (
  tipo VARCHAR(50) NOT NULL,
  prefijo VARCHAR(50) NOT NULL,
  digitos INT NOT NULL DEFAULT 8,
  correlativo INT NOT NULL DEFAULT 1,
  negocio_id INT NOT NULL,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tipo, negocio_id),
  CONSTRAINT fk_secuencias_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cierres_caja (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha_cierre DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_operacion DATETIME NOT NULL,
  usuario VARCHAR(255) NOT NULL,
  usuario_rol VARCHAR(50),
  origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja',
  fondo_inicial DECIMAL(10,2) DEFAULT 0,
  total_sistema DECIMAL(10,2) DEFAULT 0,
  total_declarado DECIMAL(10,2) DEFAULT 0,
  diferencia DECIMAL(10,2) DEFAULT 0,
  observaciones TEXT,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_cierres_caja_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salidas_caja (
  id INT AUTO_INCREMENT PRIMARY KEY,
  negocio_id INT NOT NULL,
  fecha DATETIME NOT NULL,
  descripcion TEXT,
  monto DECIMAL(10,2) NOT NULL,
  metodo VARCHAR(50) DEFAULT 'efectivo',
  origen_caja VARCHAR(50) NOT NULL DEFAULT 'caja',
  usuario_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_salidas_caja_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sesiones_usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso DATETIME,
  user_agent TEXT,
  ip VARCHAR(100),
  cerrado_en DATETIME,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_sesiones_usuarios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_sesiones_usuarios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  UNIQUE KEY uq_sesiones_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_historial_cocina_completed ON historial_cocina (completed_at);
CREATE INDEX idx_historial_bar_completed ON historial_bar (completed_at);
CREATE INDEX idx_cierres_caja_fecha ON cierres_caja (negocio_id, fecha_operacion);
CREATE INDEX idx_salidas_caja_fecha ON salidas_caja (negocio_id, fecha);
CREATE INDEX idx_compras_inventario_negocio_fecha ON compras_inventario (negocio_id, fecha);
CREATE INDEX idx_compras_inventario_compra ON compras_inventario (compra_id);
CREATE INDEX idx_compra_inv_detalle_compra ON compras_inventario_detalle (compra_id);
CREATE INDEX idx_compra_inv_detalle_producto ON compras_inventario_detalle (producto_id);
CREATE INDEX idx_compra_inv_detalle_negocio ON compras_inventario_detalle (negocio_id);
CREATE INDEX idx_recetas_negocio ON recetas (negocio_id);
CREATE INDEX idx_receta_detalle_receta ON receta_detalle (receta_id);
CREATE INDEX idx_receta_detalle_insumo ON receta_detalle (insumo_id);
CREATE INDEX idx_consumo_insumos_negocio_pedido ON consumo_insumos (negocio_id, pedido_id);
CREATE INDEX idx_consumo_insumos_negocio_insumo ON consumo_insumos (negocio_id, insumo_id);
CREATE INDEX idx_sesiones_usuario ON sesiones_usuarios (usuario_id);
CREATE INDEX idx_pedidos_cierre_id ON pedidos (cierre_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones (negocio_id, estado, fecha_creacion);
CREATE INDEX idx_cotizacion_items_cotizacion ON cotizacion_items (cotizacion_id);
CREATE INDEX idx_clientes_activo_nombre ON clientes (negocio_id, activo, nombre);
CREATE INDEX idx_clientes_deudas_cliente ON clientes_deudas (cliente_id);
CREATE INDEX idx_clientes_deudas_negocio ON clientes_deudas (negocio_id);
CREATE INDEX idx_clientes_deudas_detalle_deuda ON clientes_deudas_detalle (deuda_id);
CREATE INDEX idx_clientes_deudas_detalle_producto ON clientes_deudas_detalle (producto_id);
CREATE INDEX idx_clientes_deudas_detalle_negocio ON clientes_deudas_detalle (negocio_id);
CREATE INDEX idx_clientes_abonos_deuda ON clientes_abonos (deuda_id);
CREATE INDEX idx_clientes_abonos_cliente ON clientes_abonos (cliente_id);
CREATE INDEX idx_clientes_abonos_negocio ON clientes_abonos (negocio_id);
CREATE INDEX idx_configuracion_negocio ON configuracion (negocio_id);
