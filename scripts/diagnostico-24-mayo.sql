-- ============================================================
-- DIAGNOSTICO ESPECIFICO: bug del 24 de mayo (2950 -> 4071.20)
-- Negocio: 3 (Kan M Reposteria)
-- ============================================================
SET @fecha = '2026-05-24';


-- =========================================================================
-- BLOQUE 1: Pedidos del 24-may con total cercano a 4071.20
-- Esto te identifica directamente el pedido afectado.
-- =========================================================================
SELECT
  p.cuenta_id,
  p.id            AS pedido_id,
  p.estado,
  p.modo_servicio,
  p.cliente,
  p.ncf,
  p.tipo_comprobante,
  ROUND(p.subtotal, 2)        AS subtotal,
  ROUND(p.impuesto, 2)        AS impuesto,
  ROUND(p.descuento_monto, 2) AS descuento,
  ROUND(p.propina_monto, 2)   AS propina,
  ROUND(p.total, 2)           AS total,
  p.fecha_creacion,
  p.fecha_cierre
FROM pedidos p
WHERE p.negocio_id = 3
  AND DATE(p.fecha_creacion) = @fecha
  AND p.total BETWEEN 2800 AND 5000
ORDER BY p.total DESC;


-- =========================================================================
-- BLOQUE 2: Discrepancia REAL del 24-may (corregido, incluye propina/descuento)
-- Esto detecta totales que NO cuadran con (suma cruda + propina - descuento)
-- (Si en este negocio el precio_unitario YA incluye impuesto, la suma cruda
--  es el subtotal+impuesto, asi que total_esperado = suma + propina - desc)
-- =========================================================================
SELECT
  p.cuenta_id,
  p.id   AS pedido_id,
  p.estado,
  p.cliente,
  ROUND(p.subtotal, 2)            AS subtotal_pedido,
  ROUND(p.impuesto, 2)            AS impuesto_pedido,
  ROUND(p.descuento_monto, 2)     AS descuento,
  ROUND(p.propina_monto, 2)       AS propina,
  ROUND(p.total, 2)               AS total_pedido,
  ROUND(COALESCE(SUM(d.cantidad * d.precio_unitario), 0), 2) AS suma_cruda,
  ROUND(
    p.total - (
      COALESCE(SUM(d.cantidad * d.precio_unitario), 0)
      + COALESCE(p.propina_monto, 0)
      - COALESCE(p.descuento_monto, 0)
    ),
  2) AS diferencia_real,
  p.fecha_creacion
FROM pedidos p
LEFT JOIN detalle_pedido d
  ON d.pedido_id = p.id
 AND d.negocio_id = p.negocio_id
WHERE p.negocio_id = 3
  AND DATE(p.fecha_creacion) = @fecha
GROUP BY p.id
HAVING ABS(diferencia_real) > 1.00
ORDER BY ABS(diferencia_real) DESC;


-- =========================================================================
-- BLOQUE 3: Cuentas con MULTIPLES pedidos el 24-may
-- =========================================================================
SELECT
  p.cuenta_id,
  COUNT(DISTINCT p.id)                         AS num_pedidos,
  GROUP_CONCAT(DISTINCT p.id ORDER BY p.id)    AS ids_pedidos,
  GROUP_CONCAT(DISTINCT p.estado)              AS estados,
  ROUND(SUM(p.total), 2)                       AS suma_totales_pedidos,
  MIN(p.fecha_creacion)                        AS primera_creacion,
  MAX(p.fecha_creacion)                        AS ultima_creacion
FROM pedidos p
WHERE p.negocio_id = 3
  AND DATE(p.fecha_creacion) = @fecha
GROUP BY p.cuenta_id
HAVING num_pedidos > 1
ORDER BY suma_totales_pedidos DESC;


-- =========================================================================
-- BLOQUE 4: Detalles duplicados en pedidos del 24-may
-- (mismo producto al mismo precio en el mismo pedido, mas de 1 vez)
-- =========================================================================
SELECT
  d.pedido_id,
  d.producto_id,
  pr.nombre                                    AS producto,
  d.precio_unitario,
  COUNT(*)                                     AS veces_aparece,
  SUM(d.cantidad)                              AS cantidad_total,
  GROUP_CONCAT(d.id ORDER BY d.id)             AS detalle_ids,
  GROUP_CONCAT(d.cantidad ORDER BY d.id)       AS cantidades,
  GROUP_CONCAT(d.sabor SEPARATOR ' | ')        AS sabores,
  MIN(d.created_at)                            AS primer_created,
  MAX(d.created_at)                            AS ultimo_created,
  TIMESTAMPDIFF(SECOND, MIN(d.created_at), MAX(d.created_at)) AS segundos_entre
FROM detalle_pedido d
LEFT JOIN productos pr ON pr.id = d.producto_id
WHERE d.negocio_id = 3
  AND DATE(d.created_at) = @fecha
GROUP BY d.pedido_id, d.producto_id, d.precio_unitario, COALESCE(d.sabor,'')
HAVING veces_aparece > 1
ORDER BY d.pedido_id, d.producto_id;


-- =========================================================================
-- BLOQUE 5: Vista completa de pedidos del 24-may (ordenados por total DESC)
-- Aqui ubicas el pedido afectado y los que sean grandes.
-- =========================================================================
SELECT
  p.cuenta_id,
  p.id          AS pedido_id,
  p.estado,
  p.modo_servicio,
  p.cliente,
  p.ncf,
  ROUND(p.subtotal, 2)         AS subtotal,
  ROUND(p.impuesto, 2)         AS impuesto,
  ROUND(p.descuento_monto, 2)  AS descuento,
  ROUND(p.propina_monto, 2)    AS propina,
  ROUND(p.total, 2)            AS total,
  ROUND(p.pago_efectivo, 2)    AS pago_efe,
  ROUND(p.pago_tarjeta, 2)     AS pago_tar,
  ROUND(p.pago_transferencia, 2) AS pago_tra,
  p.fecha_creacion,
  p.fecha_cierre
FROM pedidos p
WHERE p.negocio_id = 3
  AND DATE(p.fecha_creacion) = @fecha
  AND p.estado IN ('pagado', 'pendiente', 'listo', 'preparando')
ORDER BY p.total DESC, p.fecha_creacion;
