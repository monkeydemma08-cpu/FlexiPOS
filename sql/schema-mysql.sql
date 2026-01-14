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
  stock INT DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS configuracion (
  clave VARCHAR(191) NOT NULL,
  valor TEXT NOT NULL,
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
  descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
  descuento_monto DECIMAL(10,2) DEFAULT 0,
  propina_porcentaje DECIMAL(5,2) DEFAULT 0,
  propina_monto DECIMAL(10,2) DEFAULT 0,
  nota TEXT,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_listo DATETIME,
  fecha_cierre DATETIME,
  fecha_factura DATETIME,
  cocinero_id INT,
  cocinero_nombre VARCHAR(255),
  bartender_id INT,
  bartender_nombre VARCHAR(255),
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
  metodo_pago VARCHAR(40),
  proveedor VARCHAR(120),
  descripcion TEXT,
  comprobante_ncf VARCHAR(30),
  referencia VARCHAR(60),
  es_recurrente TINYINT(1) NOT NULL DEFAULT 0,
  frecuencia VARCHAR(20) NULL,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  negocio_id INT NOT NULL,
  INDEX idx_gastos_negocio_fecha (negocio_id, fecha),
  INDEX idx_gastos_negocio_categoria_fecha (negocio_id, categoria, fecha),
  CONSTRAINT fk_gastos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS compras_inventario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL,
  proveedor VARCHAR(255) NOT NULL,
  origen_fondos VARCHAR(20) NOT NULL DEFAULT 'negocio',
  metodo_pago VARCHAR(40) NULL,
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
  total_linea DECIMAL(10,2) NOT NULL,
  negocio_id INT NOT NULL,
  CONSTRAINT fk_compra_inv_detalle_compra FOREIGN KEY (compra_id) REFERENCES compras_inventario(id),
  CONSTRAINT fk_compra_inv_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_compra_inv_detalle_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id)
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
CREATE INDEX idx_sesiones_usuario ON sesiones_usuarios (usuario_id);
CREATE INDEX idx_pedidos_cierre_id ON pedidos (cierre_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones (negocio_id, estado, fecha_creacion);
CREATE INDEX idx_cotizacion_items_cotizacion ON cotizacion_items (cotizacion_id);
CREATE INDEX idx_clientes_activo_nombre ON clientes (negocio_id, activo, nombre);
CREATE INDEX idx_configuracion_negocio ON configuracion (negocio_id);
