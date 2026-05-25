-- ============================================================
-- DIAGNOSTICO: bug de cobro adelantado con totales inflados
-- Negocio: 3 (Kan M Reposteria)
-- Uso: ejecuta cada bloque en MySQL Workbench o mysql cli en mobax.
--      cambia CURDATE() por una fecha especifica si lo necesitas, ej:
--      WHERE DATE(p.fecha_creacion) = '2026-05-25'
-- ============================================================


-- =========================================================================
-- BLOQUE A: Pedidos con discrepancia entre total guardado y suma de detalles
-- Esto detecta facturas donde el total en la tabla 'pedidos' NO coincide con
-- la suma cruda de (cantidad * precio_unitario) de sus detalles.
-- Si aparecen filas, hay corrupcion de totales.
-- =========================================================================
SELECT
  p.cuenta_id,
  p.id            AS pedido_id,
  p.estado,
  p.modo_servicio,
  p.cliente,
  p.ncf,
  p.tipo_comprobante,
  p.subtotal      AS subtotal_pedido,
  p.impuesto      AS impuesto_pedido,
  p.descuento_monto,
  p.propina_monto,
  p.total         AS total_pedido,
  COALESCE(ROUND(SUM(d.cantidad * d.precio_unitario), 2), 0) AS suma_cruda_detalles,
  ROUND(p.total - COALESCE(SUM(d.cantidad * d.precio_unitario), 0), 2) AS diferencia,
  p.fecha_creacion,
  p.fecha_cierre
FROM pedidos p
LEFT JOIN detalle_pedido d
  ON d.pedido_id = p.id
 AND d.negocio_id = p.negocio_id
WHERE p.negocio_id = 3
  AND DATE(p.fecha_creacion) = CURDATE()
GROUP BY p.id
HAVING ABS(diferencia) > 1.00
ORDER BY p.fecha_creacion DESC;


-- =========================================================================
-- BLOQUE B: Cuentas con MULTIPLES pedidos del dia
-- Si el bug es por "cuenta con varios pedidos" agregados juntos en el cuadre,
-- aqui aparecen. Una cuenta normalmente tiene 1 pedido. Con 2 o mas hay que
-- mirar si los items del segundo se sumaron por error.
-- =========================================================================
SELECT
  p.cuenta_id,
  COUNT(DISTINCT p.id)                         AS num_pedidos,
  GROUP_CONCAT(DISTINCT p.id ORDER BY p.id)    AS ids_pedidos,
  GROUP_CONCAT(DISTINCT p.estado)              AS estados,
  ROUND(SUM(p.total), 2)                       AS total_sumado,
  MIN(p.fecha_creacion)                        AS primera_creacion,
  MAX(p.fecha_creacion)                        AS ultima_creacion,
  GROUP_CONCAT(DISTINCT p.cliente)             AS clientes
FROM pedidos p
WHERE p.negocio_id = 3
  AND DATE(p.fecha_creacion) = CURDATE()
GROUP BY p.cuenta_id
HAVING num_pedidos > 1
ORDER BY ultima_creacion DESC;


-- =========================================================================
-- BLOQUE C: Detalles potencialmente DUPLICADOS dentro del mismo pedido
-- Si el mismo producto al mismo precio aparece mas de una vez en el mismo
-- pedido con timestamps casi identicos (1 minuto), es duplicacion.
-- (Nota: tener 2 lineas iguales por separacion de "rondas" es normal, hay
--  que mirar la diferencia de created_at)
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
  AND DATE(d.created_at) = CURDATE()
GROUP BY d.pedido_id, d.producto_id, d.precio_unitario, COALESCE(d.sabor,'')
HAVING veces_aparece > 1
ORDER BY d.pedido_id, d.producto_id;


-- =========================================================================
-- BLOQUE D: Vista completa de todos los pedidos pagados/pendientes del dia
-- Para identificar el pedido afectado. El que tenia 2950 y subio a 4071.20.
-- =========================================================================
SELECT
  p.cuenta_id,
  p.id          AS pedido_id,
  p.estado,
  p.modo_servicio,
  p.cliente,
  p.ncf,
  p.tipo_comprobante,
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
  AND DATE(p.fecha_creacion) = CURDATE()
  AND p.estado IN ('pagado', 'pendiente', 'listo', 'preparando')
ORDER BY p.total DESC, p.fecha_creacion DESC;


-- =========================================================================
-- BLOQUE E: Detalle completo de un pedido especifico
-- Cuando identifiques el pedido_id afectado en los bloques anteriores,
-- reemplaza el numero abajo y ejecuta para ver todos sus items.
-- =========================================================================
-- SET @pedido_id = 12345;  -- <<< CAMBIA ESTE NUMERO POR EL PEDIDO AFECTADO
--
-- SELECT
--   d.id           AS detalle_id,
--   d.pedido_id,
--   d.producto_id,
--   pr.nombre      AS producto,
--   d.cantidad,
--   ROUND(d.precio_unitario, 2)  AS precio_u,
--   ROUND(d.cantidad * d.precio_unitario, 2) AS subtotal_linea,
--   d.descuento_porcentaje,
--   ROUND(d.descuento_monto, 2)  AS desc_monto,
--   d.cantidad_descuento,
--   d.sabor,
--   d.estado_preparacion,
--   d.cantidad_lista,
--   d.created_at
-- FROM detalle_pedido d
-- LEFT JOIN productos pr ON pr.id = d.producto_id
-- WHERE d.pedido_id = @pedido_id
--   AND d.negocio_id = 3
-- ORDER BY d.created_at, d.id;


-- =========================================================================
-- BLOQUE F: Todos los pedidos de una CUENTA especifica
-- Si el bug es por cuenta multi-pedido, esto te muestra todos los pedidos
-- de la cuenta y los items de cada uno.
-- =========================================================================
-- SET @cuenta_id = 12345;  -- <<< CAMBIA POR EL cuenta_id AFECTADO
--
-- SELECT
--   p.id                          AS pedido_id,
--   p.estado,
--   ROUND(p.total, 2)             AS total,
--   d.id                          AS detalle_id,
--   pr.nombre                     AS producto,
--   d.cantidad,
--   ROUND(d.precio_unitario, 2)   AS precio_u,
--   ROUND(d.cantidad * d.precio_unitario, 2) AS linea,
--   d.sabor,
--   d.created_at
-- FROM pedidos p
-- LEFT JOIN detalle_pedido d ON d.pedido_id = p.id AND d.negocio_id = p.negocio_id
-- LEFT JOIN productos pr ON pr.id = d.producto_id
-- WHERE p.cuenta_id = @cuenta_id
--   AND p.negocio_id = 3
-- ORDER BY p.id, d.created_at;
