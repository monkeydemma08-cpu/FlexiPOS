// ---------------------------------------------------------------------------
// analisis-extension.js — Endpoints avanzados de inteligencia de negocio.
//
// Aporta KPIs faltantes detectados en la auditoria del modulo de analisis:
//   GET /api/admin/analytics/restaurante      — KPIs de restaurante
//   GET /api/admin/analytics/productos        — Margenes por producto
//   GET /api/admin/analytics/inventario       — Rotacion, dias, mermas
//   GET /api/admin/analytics/personal         — Productividad por usuario/empleado
//   GET /api/admin/analytics/clientes         — Top, recurrencia, aging CxC
//   GET /api/admin/analytics/fiscal           — ITBIS, NCF, tipos comprobante
//   GET /api/admin/analytics/gastos-avanzado  — Proveedores, presupuestos
//   GET /api/admin/analytics/tendencias       — MoM, YoY, YTD, heatmap, forecast
// ---------------------------------------------------------------------------

const express = require('express');

const ANALYTICS_TTL_MS = 2 * 60 * 1000;
const cache = new Map();

const roundDecimal = (value, decimals = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const cacheGet = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

const cacheSet = (key, data) => {
  cache.set(key, { data, expiresAt: Date.now() + ANALYTICS_TTL_MS });
};

const limpiarCache = (negocioId) => {
  if (!negocioId) {
    cache.clear();
    return;
  }
  const prefix = `${negocioId}:`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

const buildPedidoFilter = ({ alias = 'p', includeDeudas = false } = {}) => {
  // Excluye pedidos pagados que ya esten registrados como deuda (evita doble
  // conteo). Los pedidos cobrados a CREDITO tambien se excluyen: su venta la
  // representa la deuda (cuenta por cobrar) que crea el cobro a credito.
  if (includeDeudas) {
    return `${alias}.estado = 'pagado' AND ${alias}.negocio_id = ?`;
  }
  return `${alias}.estado = 'pagado' AND ${alias}.negocio_id = ?
          AND COALESCE(${alias}.metodo_pago, '') <> 'credito'
          AND ${alias}.id NOT IN (
            SELECT COALESCE(pedido_id, 0) FROM clientes_deudas
            WHERE negocio_id = ? AND pedido_id IS NOT NULL
          )`;
};

const createAnalisisExtensionRouter = ({
  db,
  requireUsuarioSesion,
  tienePermisoAdmin,
  obtenerNegocioIdUsuario,
  normalizarRangoAnalisis,
  obtenerRangoAnterior,
  NEGOCIO_ID_DEFAULT = 1,
} = {}) => {
  if (!db || !requireUsuarioSesion || !tienePermisoAdmin || !normalizarRangoAnalisis) {
    throw new Error('createAnalisisExtensionRouter requiere db, middlewares y normalizarRangoAnalisis.');
  }

  const router = express.Router();

  const ensureAdmin = (req, res, callback) =>
    requireUsuarioSesion(req, res, (usuarioSesion) => {
      if (!tienePermisoAdmin(usuarioSesion)) {
        return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
      }
      const negocioId =
        (typeof obtenerNegocioIdUsuario === 'function' ? obtenerNegocioIdUsuario(usuarioSesion) : null) ||
        usuarioSesion?.negocio_id ||
        NEGOCIO_ID_DEFAULT;
      return callback(usuarioSesion, negocioId);
    });

  // Las ventas de la noche pueden quedar guardadas en UTC; al AGRUPAR por dia hay
  // que llevarlas a hora RD (UTC-4, sin DST) para que no "salten" al dia siguiente.
  // Auto-ajusta: 0 si la sesion MySQL ya esta en hora RD, -4 si esta en UTC.
  // OJO: el offset solo se aplica al DATE() de agrupacion. La version RAW se deja
  // sin tocar (la usa la hora mostrada y el analisis por hora/dia de semana; el
  // frontend ya convierte la hora cruda a hora RD para mostrarla).
  const OFFSET_RD = '(-4 - TIMESTAMPDIFF(HOUR, UTC_TIMESTAMP(), NOW()))';
  const fechaBaseRaw = 'COALESCE(fecha_factura, fecha_cierre, fecha_creacion)';
  const fechaBase = `DATE(${fechaBaseRaw} + INTERVAL ${OFFSET_RD} HOUR)`;
  // Helpers que prefijan correctamente cada columna con el alias dado.
  const fechaBaseRawFor = (alias = 'p') =>
    `COALESCE(${alias}.fecha_factura, ${alias}.fecha_cierre, ${alias}.fecha_creacion)`;
  const fechaBaseFor = (alias = 'p') => `DATE(${fechaBaseRawFor(alias)} + INTERVAL ${OFFSET_RD} HOUR)`;

  // -------------------------------------------------------------------------
  // /ventas-dia — detalle de las ventas (cuentas) de un dia. Es el drill-down
  // del "Analisis de negocio": al tocar un dia muestra, por cada venta, su
  // fecha/hora, el NCF (secuencia utilizada), el numero de cuenta y el monto.
  // El monto va SIN propina, igual que la serie de ventas del analisis.
  // -------------------------------------------------------------------------
  router.get('/ventas-dia', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const fecha = String(req.query?.fecha || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ ok: false, error: 'Fecha invalida (use YYYY-MM-DD).' });
      }
      try {
        const ventas = await db.all(
          `SELECT COALESCE(p.cuenta_id, p.id) AS cuenta_id,
                  MAX(p.numero_cuenta_negocio) AS numero_cuenta,
                  MAX(p.cliente) AS cliente,
                  MAX(p.ncf) AS ncf,
                  MAX(p.tipo_comprobante) AS tipo_comprobante,
                  MIN(${fechaBaseRawFor('p')}) AS fecha,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS monto,
                  SUM(p.propina_monto) AS propina
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} = ?
            GROUP BY COALESCE(p.cuenta_id, p.id)
            ORDER BY fecha ASC`,
          [negocioId, negocioId, fecha]
        );
        const data = (ventas || []).map((v) => ({
          cuenta_id: v.cuenta_id,
          numero_cuenta: v.numero_cuenta || v.cuenta_id,
          cliente: v.cliente || null,
          ncf: v.ncf || null,
          tipo_comprobante: v.tipo_comprobante || null,
          fecha: v.fecha,
          monto: roundDecimal(v.monto),
          propina: roundDecimal(v.propina),
        }));
        const total = data.reduce((acc, v) => acc + safeNumber(v.monto), 0);
        res.json({ ok: true, fecha, total: roundDecimal(total), cantidad: data.length, ventas: data });
      } catch (e) {
        console.error('Error en /ventas-dia:', e?.message || e);
        res.status(500).json({ ok: false, error: 'No se pudo cargar el detalle del dia.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 1) /restaurante — KPIs de la industria de restaurantes
  // -------------------------------------------------------------------------
  router.get('/restaurante', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:restaurante:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // Ventas y comensales (cuentas distintas + items)
        const ventasResumen = await db.get(
          `SELECT COUNT(DISTINCT COALESCE(p.cuenta_id, p.id)) AS tickets,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos,
                  SUM(p.subtotal - p.descuento_monto) AS ingresos_sin_itbis,
                  SUM(p.propina_monto) AS propinas,
                  SUM(p.descuento_monto) AS descuentos
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        const itemsResumen = await db.get(
          `SELECT SUM(dp.cantidad) AS items_totales,
                  COUNT(dp.id) AS lineas_totales
             FROM detalle_pedido dp
             JOIN pedidos p ON p.id = dp.pedido_id
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // COGS persistido (preferir snapshot)
        const cogsResumen = await db.get(
          `SELECT SUM(
                    COALESCE(dp.cogs_linea, 0) +
                    CASE WHEN dp.cogs_linea IS NULL OR dp.cogs_linea = 0
                         THEN COALESCE(dp.cantidad, 0) * COALESCE(
                                NULLIF(dp.costo_unitario_snapshot, 0),
                                NULLIF(pr.costo_unitario_real, 0),
                                NULLIF(pr.costo_promedio_actual, 0),
                                NULLIF(pr.costo_base_sin_itbis, 0),
                                0
                              )
                         ELSE 0 END
                  ) AS cogs_total
             FROM detalle_pedido dp
             JOIN pedidos p ON p.id = dp.pedido_id
             LEFT JOIN productos pr ON pr.id = dp.producto_id AND pr.negocio_id = p.negocio_id
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Gastos de personal en el rango (categoria 'Nomina%' o tipo nomina)
        const personalResumen = await db.get(
          `SELECT SUM(monto) AS total
             FROM gastos
            WHERE negocio_id = ?
              AND fecha BETWEEN ? AND ?
              AND COALESCE(estado, 'PAGADO') <> 'ANULADO'
              AND (LOWER(COALESCE(categoria, '')) LIKE 'nomina%'
                   OR LOWER(COALESCE(categoria, '')) LIKE 'sueldo%'
                   OR LOWER(COALESCE(categoria, '')) LIKE 'personal%'
                   OR LOWER(COALESCE(descripcion, '')) LIKE 'nomina%'
                   OR origen = 'nomina')`,
          [negocioId, rango.desde, rango.hasta]
        );

        // Mesas o cuentas distintas para rotacion
        const mesasResumen = await db.get(
          `SELECT COUNT(DISTINCT p.mesa) AS mesas_distintas
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
              AND p.mesa IS NOT NULL AND p.mesa <> ''`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        const ingresos = roundDecimal(ventasResumen?.ingresos);
        const ingresosSinItbis = roundDecimal(ventasResumen?.ingresos_sin_itbis);
        const tickets = safeNumber(ventasResumen?.tickets);
        const items = safeNumber(itemsResumen?.items_totales);
        const cogs = roundDecimal(cogsResumen?.cogs_total);
        const personal = roundDecimal(personalResumen?.total);
        const dias = Math.max(rango.dias || 1, 1);

        const ticketPromedio = tickets > 0 ? roundDecimal(ingresos / tickets) : 0;
        const itemsPorTicket = tickets > 0 ? roundDecimal(items / tickets, 2) : 0;
        const ventaPromedioDiaria = roundDecimal(ingresos / dias);
        const foodCostPct = ingresosSinItbis > 0 ? roundDecimal((cogs / ingresosSinItbis) * 100, 2) : 0;
        const laborCostPct = ingresosSinItbis > 0 ? roundDecimal((personal / ingresosSinItbis) * 100, 2) : 0;
        const primeCostPct = roundDecimal(foodCostPct + laborCostPct, 2);
        const margenContribucion = roundDecimal(ingresosSinItbis - cogs);
        const rotacionMesas = safeNumber(mesasResumen?.mesas_distintas) > 0
          ? roundDecimal(tickets / safeNumber(mesasResumen?.mesas_distintas), 2)
          : 0;

        // Diagnostico contra benchmarks de la industria
        const diagnosticos = [];
        if (foodCostPct > 35) {
          diagnosticos.push({
            kpi: 'food_cost',
            nivel: 'critico',
            mensaje: `Food Cost ${foodCostPct}% supera el 35%. Revisa precios, mermas y porciones.`,
          });
        } else if (foodCostPct > 30) {
          diagnosticos.push({
            kpi: 'food_cost',
            nivel: 'aviso',
            mensaje: `Food Cost ${foodCostPct}% por encima del optimo (28-30%).`,
          });
        }
        if (laborCostPct > 35) {
          diagnosticos.push({
            kpi: 'labor_cost',
            nivel: 'critico',
            mensaje: `Labor Cost ${laborCostPct}% es muy alto. Revisa programacion del personal.`,
          });
        }
        if (primeCostPct > 65) {
          diagnosticos.push({
            kpi: 'prime_cost',
            nivel: 'critico',
            mensaje: `Prime Cost ${primeCostPct}% supera el limite saludable (60-65%).`,
          });
        }
        if (ticketPromedio > 0 && itemsPorTicket < 1.5) {
          diagnosticos.push({
            kpi: 'items_ticket',
            nivel: 'aviso',
            mensaje: `Solo ${itemsPorTicket} items por ticket. Considera upselling.`,
          });
        }

        const payload = {
          ok: true,
          rango,
          benchmarks: {
            food_cost_optimo: '28-30%',
            food_cost_alerta: '> 35%',
            labor_cost_optimo: '< 30%',
            prime_cost_optimo: '< 60%',
            prime_cost_alerta: '> 65%',
          },
          kpis: {
            ingresos,
            ingresos_sin_itbis: ingresosSinItbis,
            cogs,
            personal,
            propinas: roundDecimal(ventasResumen?.propinas),
            descuentos: roundDecimal(ventasResumen?.descuentos),
            tickets,
            items_vendidos: items,
            ticket_promedio: ticketPromedio,
            items_por_ticket: itemsPorTicket,
            venta_promedio_diaria: ventaPromedioDiaria,
            food_cost_pct: foodCostPct,
            labor_cost_pct: laborCostPct,
            prime_cost_pct: primeCostPct,
            margen_contribucion: margenContribucion,
            rotacion_mesas: rotacionMesas,
          },
          diagnosticos,
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/restaurante] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudieron calcular los KPIs de restaurante.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2) /productos — Rentabilidad por producto
  // -------------------------------------------------------------------------
  router.get('/productos', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 50, 5), 500);
      const cacheKey = `${negocioId}:productos:${rango.desde}:${rango.hasta}:${limit}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        const rows = await db.all(
          `SELECT dp.producto_id,
                  COALESCE(pr.nombre, 'Sin nombre') AS nombre,
                  COALESCE(pr.activo, 1) AS activo,
                  c.nombre AS categoria,
                  SUM(dp.cantidad) AS unidades,
                  SUM((dp.precio_unitario * dp.cantidad) - COALESCE(dp.descuento_monto, 0)) AS ingresos,
                  SUM(
                    COALESCE(dp.cogs_linea, 0) +
                    CASE WHEN dp.cogs_linea IS NULL OR dp.cogs_linea = 0
                         THEN COALESCE(dp.cantidad, 0) * COALESCE(
                                NULLIF(dp.costo_unitario_snapshot, 0),
                                NULLIF(pr.costo_unitario_real, 0),
                                NULLIF(pr.costo_promedio_actual, 0),
                                NULLIF(pr.costo_base_sin_itbis, 0),
                                0
                              )
                         ELSE 0 END
                  ) AS cogs
             FROM detalle_pedido dp
             JOIN pedidos p ON p.id = dp.pedido_id
             LEFT JOIN productos pr ON pr.id = dp.producto_id AND pr.negocio_id = p.negocio_id
             LEFT JOIN categorias c ON c.id = pr.categoria_id AND c.negocio_id = p.negocio_id
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
            GROUP BY dp.producto_id, COALESCE(pr.nombre, 'Sin nombre'),
                     COALESCE(pr.activo, 1), c.nombre
            ORDER BY ingresos DESC
            LIMIT ${Number(limit)}`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        const productos = (rows || []).map((row) => {
          const ingresos = roundDecimal(row.ingresos);
          const cogs = roundDecimal(row.cogs);
          const margen = roundDecimal(ingresos - cogs);
          const margenPct = ingresos > 0 ? roundDecimal((margen / ingresos) * 100, 2) : 0;
          return {
            producto_id: row.producto_id,
            nombre: row.nombre,
            categoria: row.categoria || 'Sin categoria',
            activo: Number(row.activo) === 1,
            unidades: roundDecimal(row.unidades, 2),
            ingresos,
            cogs,
            margen,
            margen_pct: margenPct,
          };
        });

        const margenNegativo = productos
          .filter((p) => p.margen < 0)
          .sort((a, b) => a.margen - b.margen)
          .slice(0, 20);
        const margenBajo = productos
          .filter((p) => p.margen >= 0 && p.margen_pct < 20 && p.unidades >= 5)
          .sort((a, b) => a.margen_pct - b.margen_pct)
          .slice(0, 20);

        const payload = {
          ok: true,
          rango,
          total_productos: productos.length,
          productos,
          margen_negativo: margenNegativo,
          margen_bajo: margenBajo,
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/productos] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular rentabilidad por producto.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3) /inventario — Rotacion, dias inventario, mermas, stock bajo
  // -------------------------------------------------------------------------
  router.get('/inventario', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:inventario:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // Valor inventario actual (stock * costo)
        const valorInventarioRow = await db.get(
          `SELECT SUM(
                    COALESCE(stock, 0) * COALESCE(
                      NULLIF(costo_unitario_real, 0),
                      NULLIF(costo_promedio_actual, 0),
                      NULLIF(costo_base_sin_itbis, 0),
                      0
                    )
                  ) AS valor
             FROM productos
            WHERE negocio_id = ?
              AND COALESCE(activo, 1) = 1
              AND COALESCE(stock_indefinido, 0) = 0`,
          [negocioId]
        );

        // COGS del rango (para rotacion)
        const cogsRow = await db.get(
          `SELECT SUM(
                    COALESCE(dp.cogs_linea, 0) +
                    CASE WHEN dp.cogs_linea IS NULL OR dp.cogs_linea = 0
                         THEN COALESCE(dp.cantidad, 0) * COALESCE(
                                NULLIF(dp.costo_unitario_snapshot, 0),
                                NULLIF(pr.costo_unitario_real, 0),
                                NULLIF(pr.costo_promedio_actual, 0),
                                0
                              )
                         ELSE 0 END
                  ) AS cogs
             FROM detalle_pedido dp
             JOIN pedidos p ON p.id = dp.pedido_id
             LEFT JOIN productos pr ON pr.id = dp.producto_id AND pr.negocio_id = p.negocio_id
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Stock bajo (productos con stock <= stock_minimo)
        const stockBajoRows = await db.all(
          `SELECT id, nombre, stock, stock_minimo, stock_maximo
             FROM productos
            WHERE negocio_id = ?
              AND COALESCE(activo, 1) = 1
              AND COALESCE(stock_indefinido, 0) = 0
              AND COALESCE(stock_minimo, 0) > 0
              AND COALESCE(stock, 0) <= COALESCE(stock_minimo, 0)
            ORDER BY (COALESCE(stock_minimo, 0) - COALESCE(stock, 0)) DESC
            LIMIT 50`,
          [negocioId]
        );

        // Productos sin movimiento en el rango (no aparecen en detalle_pedido)
        const sinMovimientoRows = await db.all(
          `SELECT pr.id, pr.nombre, pr.stock, pr.precio
             FROM productos pr
            WHERE pr.negocio_id = ?
              AND COALESCE(pr.activo, 1) = 1
              AND COALESCE(pr.stock_indefinido, 0) = 0
              AND COALESCE(pr.stock, 0) > 0
              AND pr.id NOT IN (
                SELECT DISTINCT dp.producto_id
                  FROM detalle_pedido dp
                  JOIN pedidos p ON p.id = dp.pedido_id
                 WHERE ${buildPedidoFilter({ alias: 'p' })}
                   AND ${fechaBaseFor('p')} BETWEEN ? AND ?
                   AND dp.producto_id IS NOT NULL
              )
            ORDER BY pr.stock DESC
            LIMIT 30`,
          [negocioId, negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Movimientos de inventario (compras vs salidas) para mermas.
        // La tabla empresa_inventario_movimientos usa empresa_id, no negocio_id.
        // Como no siempre hay mapeo directo, usamos compras_inventario para entradas
        // y un try/catch defensivo para que el endpoint no caiga.
        let movimientosRow = { compras: 0, salidas: 0, mermas: 0 };
        try {
          const compras = await db.get(
            `SELECT COALESCE(SUM(total), 0) AS total
               FROM compras_inventario
              WHERE negocio_id = ?
                AND DATE(fecha) BETWEEN ? AND ?
                AND COALESCE(estado, 'CONFIRMADA') <> 'ANULADA'`,
            [negocioId, rango.desde, rango.hasta]
          );
          movimientosRow.compras = compras?.total || 0;
        } catch (errMov) {
          console.warn('[analytics/inventario] sin compras_inventario:', errMov.message);
        }

        const valorInventario = roundDecimal(valorInventarioRow?.valor);
        const cogs = roundDecimal(cogsRow?.cogs);
        const dias = Math.max(rango.dias || 1, 1);
        // Rotacion anualizada: COGS_anual / inventario promedio
        const cogsAnualizado = (cogs / dias) * 365;
        const rotacionAnual = valorInventario > 0 ? roundDecimal(cogsAnualizado / valorInventario, 2) : 0;
        const diasInventario = rotacionAnual > 0 ? roundDecimal(365 / rotacionAnual, 1) : 0;

        const payload = {
          ok: true,
          rango,
          inventario: {
            valor_actual: valorInventario,
            cogs_periodo: cogs,
            cogs_anualizado: roundDecimal(cogsAnualizado),
            rotacion_anual: rotacionAnual,
            dias_inventario: diasInventario,
            stock_bajo_count: (stockBajoRows || []).length,
            sin_movimiento_count: (sinMovimientoRows || []).length,
          },
          movimientos: {
            compras: roundDecimal(movimientosRow?.compras),
            salidas: roundDecimal(movimientosRow?.salidas),
            mermas: roundDecimal(movimientosRow?.mermas),
          },
          stock_bajo: (stockBajoRows || []).map((r) => ({
            id: r.id,
            nombre: r.nombre,
            stock: roundDecimal(r.stock, 2),
            stock_minimo: roundDecimal(r.stock_minimo, 2),
            stock_maximo: roundDecimal(r.stock_maximo, 2),
            faltante: roundDecimal((Number(r.stock_minimo) || 0) - (Number(r.stock) || 0), 2),
          })),
          sin_movimiento: (sinMovimientoRows || []).map((r) => ({
            id: r.id,
            nombre: r.nombre,
            stock: roundDecimal(r.stock, 2),
            valor_estimado: roundDecimal((Number(r.stock) || 0) * (Number(r.precio) || 0)),
          })),
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/inventario] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el analisis de inventario.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4) /personal — Productividad por usuario y empleado
  // -------------------------------------------------------------------------
  router.get('/personal', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:personal:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // Ventas por usuario (usuario_id_cierre o usuario_id)
        const ventasUsuario = await db.all(
          `SELECT COALESCE(p.usuario_id_cierre, p.cobrado_por, p.creado_por) AS usuario_id,
                  u.nombre AS usuario_nombre,
                  COUNT(DISTINCT COALESCE(p.cuenta_id, p.id)) AS tickets,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos,
                  SUM(p.propina_monto) AS propinas,
                  SUM(p.descuento_monto) AS descuentos
             FROM pedidos p
             LEFT JOIN usuarios u ON u.id = COALESCE(p.usuario_id_cierre, p.cobrado_por, p.creado_por)
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
              AND COALESCE(p.usuario_id_cierre, p.cobrado_por, p.creado_por) IS NOT NULL
            GROUP BY COALESCE(p.usuario_id_cierre, p.cobrado_por, p.creado_por), u.nombre
            ORDER BY ingresos DESC`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Empleados (de empresa_empleados) y su sueldo en el rango
        const empleadosRows = await db.all(
          `SELECT id, nombre, cargo, tipo_pago, sueldo_base, tarifa_hora, activo
             FROM empresa_empleados
            WHERE (negocio_id = ? OR negocio_id IS NULL)
              AND COALESCE(activo, 1) = 1
            ORDER BY nombre ASC`,
          [negocioId]
        );

        // Asistencias en el rango (suma horas)
        const asistenciasRows = await db.all(
          `SELECT empleado_id, SUM(horas) AS horas_total, COUNT(*) AS dias_trabajados
             FROM empresa_asistencias
            WHERE (negocio_id = ? OR negocio_id IS NULL)
              AND fecha BETWEEN ? AND ?
            GROUP BY empleado_id`,
          [negocioId, rango.desde, rango.hasta]
        );
        const asistenciasMap = new Map((asistenciasRows || []).map((r) => [Number(r.empleado_id), r]));

        const empleados = (empleadosRows || []).map((emp) => {
          const asistencia = asistenciasMap.get(Number(emp.id)) || {};
          const horas = roundDecimal(asistencia.horas_total, 2);
          const dias = safeNumber(asistencia.dias_trabajados);
          let costoEstimado = 0;
          if (emp.tipo_pago === 'HORA') {
            costoEstimado = horas * (Number(emp.tarifa_hora) || 0);
          } else if (emp.tipo_pago === 'QUINCENAL') {
            costoEstimado = (Number(emp.sueldo_base) || 0) * 2 * (rango.dias / 30);
          } else {
            costoEstimado = (Number(emp.sueldo_base) || 0) * (rango.dias / 30);
          }
          return {
            id: emp.id,
            nombre: emp.nombre,
            cargo: emp.cargo,
            tipo_pago: emp.tipo_pago,
            sueldo_base: roundDecimal(emp.sueldo_base),
            horas_trabajadas: horas,
            dias_trabajados: dias,
            costo_estimado_periodo: roundDecimal(costoEstimado),
          };
        });

        const totalCostoPersonal = empleados.reduce((acc, e) => acc + (e.costo_estimado_periodo || 0), 0);
        const totalVentas = (ventasUsuario || []).reduce((acc, v) => acc + safeNumber(v.ingresos), 0);

        const payload = {
          ok: true,
          rango,
          ventas_por_usuario: (ventasUsuario || []).map((v) => ({
            usuario_id: v.usuario_id,
            nombre: v.usuario_nombre || `Usuario ${v.usuario_id}`,
            tickets: safeNumber(v.tickets),
            ingresos: roundDecimal(v.ingresos),
            propinas: roundDecimal(v.propinas),
            descuentos: roundDecimal(v.descuentos),
            ticket_promedio: safeNumber(v.tickets) > 0
              ? roundDecimal(safeNumber(v.ingresos) / safeNumber(v.tickets))
              : 0,
          })),
          empleados,
          totales: {
            total_ventas: roundDecimal(totalVentas),
            total_costo_personal: roundDecimal(totalCostoPersonal),
            ratio_personal_ventas: totalVentas > 0
              ? roundDecimal((totalCostoPersonal / totalVentas) * 100, 2)
              : 0,
          },
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/personal] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el analisis de personal.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5) /clientes — Top, recurrencia, aging cuentas por cobrar
  // -------------------------------------------------------------------------
  router.get('/clientes', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:clientes:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // Top clientes por monto comprado (deudas + abonos)
        const topClientes = await db.all(
          `SELECT c.id, c.nombre, c.documento, c.telefono,
                  COUNT(DISTINCT d.id) AS facturas,
                  SUM(d.monto_total) AS total_comprado,
                  COALESCE(SUM(ab.total_abonos), 0) AS total_abonado,
                  MAX(d.fecha) AS ultima_compra
             FROM clientes c
             JOIN clientes_deudas d ON d.cliente_id = c.id AND d.negocio_id = c.negocio_id
             LEFT JOIN (
               SELECT deuda_id, SUM(monto) AS total_abonos
                 FROM clientes_abonos
                WHERE negocio_id = ?
                GROUP BY deuda_id
             ) ab ON ab.deuda_id = d.id
            WHERE c.negocio_id = ?
              AND DATE(d.fecha) BETWEEN ? AND ?
            GROUP BY c.id, c.nombre, c.documento, c.telefono
            ORDER BY total_comprado DESC
            LIMIT 20`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Recurrencia: clientes con >= 2 facturas en el rango
        const recurrencia = await db.get(
          `SELECT
                  COUNT(DISTINCT cliente_id) AS clientes_unicos,
                  SUM(CASE WHEN compras_periodo = 1 THEN 1 ELSE 0 END) AS clientes_nuevos,
                  SUM(CASE WHEN compras_periodo >= 2 THEN 1 ELSE 0 END) AS clientes_recurrentes
             FROM (
               SELECT cliente_id, COUNT(*) AS compras_periodo
                 FROM clientes_deudas
                WHERE negocio_id = ?
                  AND DATE(fecha) BETWEEN ? AND ?
                GROUP BY cliente_id
             ) t`,
          [negocioId, rango.desde, rango.hasta]
        );

        // Aging cuentas por cobrar
        const agingRow = await db.get(
          `SELECT
                  SUM(CASE WHEN dias_pendiente <= 30 THEN saldo ELSE 0 END) AS bucket_0_30,
                  SUM(CASE WHEN dias_pendiente BETWEEN 31 AND 60 THEN saldo ELSE 0 END) AS bucket_31_60,
                  SUM(CASE WHEN dias_pendiente BETWEEN 61 AND 90 THEN saldo ELSE 0 END) AS bucket_61_90,
                  SUM(CASE WHEN dias_pendiente > 90 THEN saldo ELSE 0 END) AS bucket_90_plus,
                  SUM(saldo) AS total_pendiente
             FROM (
               SELECT d.id,
                      DATEDIFF(CURRENT_DATE, d.fecha) AS dias_pendiente,
                      d.monto_total - COALESCE(ab.total_abonos, 0) AS saldo
                 FROM clientes_deudas d
                 LEFT JOIN (
                   SELECT deuda_id, SUM(monto) AS total_abonos
                     FROM clientes_abonos
                    WHERE negocio_id = ?
                    GROUP BY deuda_id
                 ) ab ON ab.deuda_id = d.id
                WHERE d.negocio_id = ?
                  AND d.monto_total > COALESCE(ab.total_abonos, 0)
             ) deudas_pendientes`,
          [negocioId, negocioId]
        );

        const totalAging = roundDecimal(agingRow?.total_pendiente);
        const aging = {
          bucket_0_30: roundDecimal(agingRow?.bucket_0_30),
          bucket_31_60: roundDecimal(agingRow?.bucket_31_60),
          bucket_61_90: roundDecimal(agingRow?.bucket_61_90),
          bucket_90_plus: roundDecimal(agingRow?.bucket_90_plus),
          total: totalAging,
        };

        const topConSaldo = topClientes
          .map((c) => {
            const totalComprado = roundDecimal(c.total_comprado);
            const totalAbonado = roundDecimal(c.total_abonado);
            return {
              id: c.id,
              nombre: c.nombre,
              documento: c.documento,
              telefono: c.telefono,
              facturas: safeNumber(c.facturas),
              total_comprado: totalComprado,
              total_abonado: totalAbonado,
              saldo: roundDecimal(totalComprado - totalAbonado),
              ultima_compra: c.ultima_compra,
              ticket_promedio: safeNumber(c.facturas) > 0
                ? roundDecimal(totalComprado / safeNumber(c.facturas))
                : 0,
            };
          });

        const payload = {
          ok: true,
          rango,
          top_clientes: topConSaldo,
          recurrencia: {
            clientes_unicos: safeNumber(recurrencia?.clientes_unicos),
            clientes_nuevos: safeNumber(recurrencia?.clientes_nuevos),
            clientes_recurrentes: safeNumber(recurrencia?.clientes_recurrentes),
            tasa_recurrencia_pct: safeNumber(recurrencia?.clientes_unicos) > 0
              ? roundDecimal(
                  (safeNumber(recurrencia?.clientes_recurrentes) /
                    safeNumber(recurrencia?.clientes_unicos)) *
                    100,
                  2
                )
              : 0,
          },
          aging_cuentas_por_cobrar: aging,
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/clientes] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el analisis de clientes.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6) /fiscal — ITBIS, NCF, tipos de comprobante
  // -------------------------------------------------------------------------
  router.get('/fiscal', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:fiscal:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // ITBIS de pedidos
        const itbisPedidos = await db.get(
          `SELECT SUM(p.impuesto) AS itbis,
                  SUM(p.subtotal - p.descuento_monto) AS base_imponible,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS total_facturado
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // ITBIS de deudas (preferir persistido)
        const itbisDeudas = await db.get(
          `SELECT
                  SUM(COALESCE(d.itbis_total, 0)) AS itbis,
                  SUM(COALESCE(d.subtotal_total, d.monto_total)) AS base_imponible,
                  SUM(d.monto_total) AS total_facturado
             FROM clientes_deudas d
            WHERE d.negocio_id = ?
              AND DATE(d.fecha) BETWEEN ? AND ?`,
          [negocioId, rango.desde, rango.hasta]
        );

        // ITBIS pagado en gastos
        const itbisGastos = await db.get(
          `SELECT SUM(itbis) AS itbis_pagado
             FROM gastos
            WHERE negocio_id = ?
              AND fecha BETWEEN ? AND ?
              AND COALESCE(estado, 'PAGADO') <> 'ANULADO'`,
          [negocioId, rango.desde, rango.hasta]
        );

        // Distribucion por tipo de comprobante (pedidos)
        const tiposPedidos = await db.all(
          `SELECT COALESCE(p.tipo_comprobante, 'Sin comprobante') AS tipo,
                  COUNT(*) AS cantidad,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS total
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
            GROUP BY p.tipo_comprobante
            ORDER BY total DESC`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Distribucion por tipo de comprobante (deudas)
        const tiposDeudas = await db.all(
          `SELECT COALESCE(d.tipo_comprobante, 'Sin comprobante') AS tipo,
                  COUNT(*) AS cantidad,
                  SUM(d.monto_total) AS total
             FROM clientes_deudas d
            WHERE d.negocio_id = ?
              AND DATE(d.fecha) BETWEEN ? AND ?
            GROUP BY d.tipo_comprobante
            ORDER BY total DESC`,
          [negocioId, rango.desde, rango.hasta]
        );

        // Estado e-CF de pedidos (si la columna existe)
        let ecfEstado = null;
        try {
          ecfEstado = await db.all(
            `SELECT COALESCE(p.ecf_estado, 'no_emitido') AS estado,
                    COUNT(*) AS cantidad,
                    SUM(p.subtotal + p.impuesto - p.descuento_monto) AS total
               FROM pedidos p
              WHERE ${buildPedidoFilter({ alias: 'p' })}
                AND ${fechaBaseFor('p')} BETWEEN ? AND ?
              GROUP BY p.ecf_estado`,
            [negocioId, negocioId, rango.desde, rango.hasta]
          );
        } catch (_e) {
          ecfEstado = null;
        }

        // Combina tipos pedidos + deudas
        const tiposMap = new Map();
        for (const row of tiposPedidos || []) {
          tiposMap.set(row.tipo, {
            tipo: row.tipo,
            cantidad: safeNumber(row.cantidad),
            total: roundDecimal(row.total),
          });
        }
        for (const row of tiposDeudas || []) {
          const existente = tiposMap.get(row.tipo);
          if (existente) {
            existente.cantidad += safeNumber(row.cantidad);
            existente.total = roundDecimal(existente.total + safeNumber(row.total));
          } else {
            tiposMap.set(row.tipo, {
              tipo: row.tipo,
              cantidad: safeNumber(row.cantidad),
              total: roundDecimal(row.total),
            });
          }
        }

        const itbisRecaudado = roundDecimal(
          safeNumber(itbisPedidos?.itbis) + safeNumber(itbisDeudas?.itbis)
        );
        const itbisPagado = roundDecimal(itbisGastos?.itbis_pagado);
        const itbisNeto = roundDecimal(itbisRecaudado - itbisPagado);

        const payload = {
          ok: true,
          rango,
          itbis: {
            recaudado: itbisRecaudado,
            pagado: itbisPagado,
            neto: itbisNeto,
            base_imponible: roundDecimal(
              safeNumber(itbisPedidos?.base_imponible) + safeNumber(itbisDeudas?.base_imponible)
            ),
            total_facturado: roundDecimal(
              safeNumber(itbisPedidos?.total_facturado) + safeNumber(itbisDeudas?.total_facturado)
            ),
          },
          tipos_comprobante: Array.from(tiposMap.values()).sort((a, b) => b.total - a.total),
          ecf_estado: (ecfEstado || []).map((r) => ({
            estado: r.estado,
            cantidad: safeNumber(r.cantidad),
            total: roundDecimal(r.total),
          })),
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/fiscal] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el analisis fiscal.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7) /gastos-avanzado — Proveedores, presupuestos, duplicados
  // -------------------------------------------------------------------------
  router.get('/gastos-avanzado', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:gastos-avanzado:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // Top proveedores
        const proveedoresRows = await db.all(
          `SELECT COALESCE(NULLIF(proveedor, ''), 'Sin proveedor') AS proveedor,
                  COUNT(*) AS facturas,
                  SUM(monto) AS total,
                  AVG(monto) AS promedio,
                  MIN(fecha) AS primer_gasto,
                  MAX(fecha) AS ultimo_gasto
             FROM gastos
            WHERE negocio_id = ?
              AND fecha BETWEEN ? AND ?
              AND COALESCE(estado, 'PAGADO') <> 'ANULADO'
            GROUP BY proveedor
            ORDER BY total DESC
            LIMIT 30`,
          [negocioId, rango.desde, rango.hasta]
        );

        // Presupuestos vs ejecutado por categoria (para el mes actual)
        // Tabla presupuestos_categoria_gasto guarda un monto_mensual unico por categoria.
        const mesIso = (rango.hasta || '').slice(0, 7);
        const presupuestos = await db.all(
          `SELECT pcg.categoria, pcg.monto_mensual AS monto_presupuestado, ? AS mes,
                  COALESCE(g.total_ejecutado, 0) AS total_ejecutado
             FROM presupuestos_categoria_gasto pcg
             LEFT JOIN (
               SELECT categoria, SUM(monto) AS total_ejecutado
                 FROM gastos
                WHERE negocio_id = ?
                  AND DATE_FORMAT(fecha, '%Y-%m') = ?
                  AND COALESCE(estado, 'PAGADO') <> 'ANULADO'
                GROUP BY categoria
             ) g ON g.categoria = pcg.categoria
            WHERE pcg.negocio_id = ?
              AND COALESCE(pcg.activo, 1) = 1
            ORDER BY pcg.monto_mensual DESC`,
          [mesIso, negocioId, mesIso, negocioId]
        );

        // Posibles duplicados (mismo proveedor, monto y fecha cercana)
        const duplicadosRows = await db.all(
          `SELECT g1.id AS id_a, g2.id AS id_b,
                  g1.fecha, g1.monto, g1.proveedor, g1.descripcion,
                  ABS(DATEDIFF(g1.fecha, g2.fecha)) AS dias_diferencia
             FROM gastos g1
             JOIN gastos g2 ON g2.id < g1.id
                            AND g2.negocio_id = g1.negocio_id
                            AND g2.proveedor = g1.proveedor
                            AND g2.monto = g1.monto
                            AND ABS(DATEDIFF(g1.fecha, g2.fecha)) <= 7
            WHERE g1.negocio_id = ?
              AND g1.fecha BETWEEN ? AND ?
              AND g1.proveedor IS NOT NULL AND g1.proveedor <> ''
              AND COALESCE(g1.estado, 'PAGADO') <> 'ANULADO'
              AND COALESCE(g2.estado, 'PAGADO') <> 'ANULADO'
            ORDER BY g1.fecha DESC
            LIMIT 50`,
          [negocioId, rango.desde, rango.hasta]
        );

        // Distribucion por categoria
        const categoriaRows = await db.all(
          `SELECT COALESCE(NULLIF(categoria, ''), 'Sin categoria') AS categoria,
                  COUNT(*) AS gastos_count,
                  SUM(monto) AS total
             FROM gastos
            WHERE negocio_id = ?
              AND fecha BETWEEN ? AND ?
              AND COALESCE(estado, 'PAGADO') <> 'ANULADO'
            GROUP BY categoria
            ORDER BY total DESC`,
          [negocioId, rango.desde, rango.hasta]
        );

        const presupuestosFormateados = (presupuestos || []).map((p) => {
          const presupuestado = roundDecimal(p.monto_presupuestado);
          const ejecutado = roundDecimal(p.total_ejecutado);
          const desviacion = roundDecimal(ejecutado - presupuestado);
          const desviacionPct = presupuestado > 0
            ? roundDecimal((desviacion / presupuestado) * 100, 2)
            : 0;
          return {
            categoria: p.categoria,
            mes: p.mes,
            presupuestado,
            ejecutado,
            desviacion,
            desviacion_pct: desviacionPct,
            estado:
              presupuestado === 0
                ? 'sin_presupuesto'
                : ejecutado > presupuestado
                ? 'sobre_presupuesto'
                : ejecutado / presupuestado > 0.9
                ? 'cerca_limite'
                : 'normal',
          };
        });

        const payload = {
          ok: true,
          rango,
          proveedores: (proveedoresRows || []).map((p) => ({
            proveedor: p.proveedor,
            facturas: safeNumber(p.facturas),
            total: roundDecimal(p.total),
            promedio: roundDecimal(p.promedio),
            primer_gasto: p.primer_gasto,
            ultimo_gasto: p.ultimo_gasto,
          })),
          categorias: (categoriaRows || []).map((c) => ({
            categoria: c.categoria,
            cantidad: safeNumber(c.gastos_count),
            total: roundDecimal(c.total),
          })),
          presupuestos: presupuestosFormateados,
          posibles_duplicados: (duplicadosRows || []).map((d) => ({
            id_a: d.id_a,
            id_b: d.id_b,
            fecha: d.fecha,
            monto: roundDecimal(d.monto),
            proveedor: d.proveedor,
            descripcion: d.descripcion,
            dias_diferencia: safeNumber(d.dias_diferencia),
          })),
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/gastos-avanzado] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el analisis avanzado de gastos.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8) /tendencias — MoM, YoY, YTD, heatmap, forecast
  // -------------------------------------------------------------------------
  router.get('/tendencias', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:tendencias:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        // Serie diaria de ventas en el rango
        const serieDiaria = await db.all(
          `SELECT ${fechaBaseFor('p')} AS dia,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos,
                  COUNT(DISTINCT COALESCE(p.cuenta_id, p.id)) AS tickets
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
            GROUP BY dia
            ORDER BY dia ASC`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // Heatmap: ventas por dia de semana y hora
        const heatmapRows = await db.all(
          `SELECT DAYOFWEEK(${fechaBaseRawFor('p')}) AS dia_semana,
                  HOUR(${fechaBaseRawFor('p')}) AS hora,
                  SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos,
                  COUNT(*) AS pedidos
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
            GROUP BY dia_semana, hora
            ORDER BY dia_semana ASC, hora ASC`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // YTD ingresos
        const ytdRow = await db.get(
          `SELECT SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos_ytd
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND YEAR(${fechaBaseRawFor('p')}) = YEAR(?)
              AND ${fechaBaseFor('p')} <= ?`,
          [negocioId, negocioId, rango.hasta, rango.hasta]
        );

        // YoY: mismos dias del año pasado
        const yoyRow = await db.get(
          `SELECT SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos_anio_pasado
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN DATE_SUB(?, INTERVAL 1 YEAR) AND DATE_SUB(?, INTERVAL 1 YEAR)`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // MoM: mes anterior completo
        const momRow = await db.get(
          `SELECT SUM(p.subtotal + p.impuesto - p.descuento_monto) AS ingresos_mes_anterior
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN
                DATE_SUB(?, INTERVAL 1 MONTH) AND DATE_SUB(?, INTERVAL 1 MONTH)`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );

        // ======================================================================
        // Forecast mejorado (F4): promedio movil ponderado + estacionalidad
        // semanal + bandas de confianza basadas en desviacion estandar.
        // ======================================================================
        const serieValores = (serieDiaria || []).map((row) => ({
          dia: row.dia,
          ingresos: safeNumber(row.ingresos),
          fecha: new Date(row.dia),
        }));
        const totalActual = serieValores.reduce((acc, v) => acc + v.ingresos, 0);
        const dias = Math.max(rango.dias || 1, 1);
        const promedioDiario = totalActual / dias;

        // 1) Promedio movil ponderado (mas peso a dias recientes)
        let promedioPonderado = 0;
        let sumPesos = 0;
        let sumValoresPond = 0;
        serieValores.forEach((v, idx) => {
          const peso = idx + 1; // peso lineal: ultimo dia = N, primer dia = 1
          sumPesos += peso;
          sumValoresPond += v.ingresos * peso;
        });
        promedioPonderado = sumPesos > 0 ? sumValoresPond / sumPesos : 0;

        // 2) Patron semanal (factor estacional por dia de semana 0=dom .. 6=sab)
        const patronSemanal = {};
        for (let dow = 0; dow < 7; dow++) patronSemanal[dow] = { suma: 0, conteo: 0 };
        serieValores.forEach((v) => {
          if (!Number.isNaN(v.fecha.getTime())) {
            const dow = v.fecha.getDay();
            patronSemanal[dow].suma += v.ingresos;
            patronSemanal[dow].conteo += 1;
          }
        });
        const promediosDow = {};
        let promedioGeneral = 0;
        let dowConDatos = 0;
        for (let dow = 0; dow < 7; dow++) {
          const p = patronSemanal[dow];
          promediosDow[dow] = p.conteo > 0 ? p.suma / p.conteo : 0;
          if (p.conteo > 0) {
            promedioGeneral += promediosDow[dow];
            dowConDatos += 1;
          }
        }
        promedioGeneral = dowConDatos > 0 ? promedioGeneral / dowConDatos : promedioPonderado;
        const factoresEstacionales = {};
        for (let dow = 0; dow < 7; dow++) {
          factoresEstacionales[dow] = promedioGeneral > 0
            ? promediosDow[dow] / promedioGeneral || 1
            : 1;
        }

        // 3) Desviacion estandar para bandas de confianza
        const meanVal = serieValores.length > 0 ? totalActual / serieValores.length : 0;
        const variance = serieValores.length > 0
          ? serieValores.reduce((acc, v) => acc + Math.pow(v.ingresos - meanVal, 2), 0) /
            serieValores.length
          : 0;
        const stdDev = Math.sqrt(variance);

        // 4) Proyeccion 30 dias aplicando estacionalidad
        let proyeccion30Estac = 0;
        const baseDate = new Date(rango.hasta);
        if (!Number.isNaN(baseDate.getTime())) {
          for (let i = 1; i <= 30; i++) {
            const futureDate = new Date(baseDate);
            futureDate.setDate(futureDate.getDate() + i);
            const dow = futureDate.getDay();
            const factor = factoresEstacionales[dow] || 1;
            proyeccion30Estac += promedioPonderado * factor;
          }
        } else {
          proyeccion30Estac = promedioPonderado * 30;
        }
        const proyeccion30 = roundDecimal(proyeccion30Estac);
        const proyeccionMes = proyeccion30;
        const proyeccionAnio = roundDecimal(promedioPonderado * 365);

        // Bandas de confianza (~68% IC con stddev * sqrt(30))
        const margenError = stdDev * Math.sqrt(30);
        const bandaSuperior = roundDecimal(proyeccion30Estac + margenError);
        const bandaInferior = roundDecimal(Math.max(0, proyeccion30Estac - margenError));

        const ingresosYtd = roundDecimal(ytdRow?.ingresos_ytd);
        const ingresosYoY = roundDecimal(yoyRow?.ingresos_anio_pasado);
        const ingresosMoM = roundDecimal(momRow?.ingresos_mes_anterior);

        const variacionYoY = ingresosYoY > 0
          ? roundDecimal(((totalActual - ingresosYoY) / ingresosYoY) * 100, 2)
          : null;
        const variacionMoM = ingresosMoM > 0
          ? roundDecimal(((totalActual - ingresosMoM) / ingresosMoM) * 100, 2)
          : null;

        const payload = {
          ok: true,
          rango,
          serie_diaria: (serieDiaria || []).map((r) => ({
            dia: r.dia,
            ingresos: roundDecimal(r.ingresos),
            tickets: safeNumber(r.tickets),
          })),
          heatmap: (heatmapRows || []).map((r) => ({
            dia_semana: safeNumber(r.dia_semana), // 1=domingo en MySQL DAYOFWEEK
            hora: safeNumber(r.hora),
            ingresos: roundDecimal(r.ingresos),
            pedidos: safeNumber(r.pedidos),
          })),
          comparativos: {
            ingresos_periodo: roundDecimal(totalActual),
            ingresos_ytd: ingresosYtd,
            ingresos_mismo_periodo_anio_pasado: ingresosYoY,
            ingresos_mismo_periodo_mes_anterior: ingresosMoM,
            variacion_yoy_pct: variacionYoY,
            variacion_mom_pct: variacionMoM,
          },
          forecast: {
            promedio_diario: roundDecimal(promedioDiario),
            promedio_diario_ponderado: roundDecimal(promedioPonderado),
            proyeccion_30_dias: proyeccion30,
            proyeccion_mes: proyeccionMes,
            proyeccion_anio: proyeccionAnio,
            banda_superior_30d: bandaSuperior,
            banda_inferior_30d: bandaInferior,
            margen_error: roundDecimal(margenError),
            std_dev_diario: roundDecimal(stdDev),
            factores_estacionales: {
              dom: roundDecimal(factoresEstacionales[0], 3),
              lun: roundDecimal(factoresEstacionales[1], 3),
              mar: roundDecimal(factoresEstacionales[2], 3),
              mie: roundDecimal(factoresEstacionales[3], 3),
              jue: roundDecimal(factoresEstacionales[4], 3),
              vie: roundDecimal(factoresEstacionales[5], 3),
              sab: roundDecimal(factoresEstacionales[6], 3),
            },
            metodo: 'promedio_ponderado_con_estacionalidad',
            advertencia:
              dias < 14
                ? 'Proyeccion poco confiable: rango menor a 14 dias.'
                : dias < 30
                ? 'Proyeccion mejorable: amplia el rango a >= 30 dias para mayor precision.'
                : null,
          },
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/tendencias] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el analisis de tendencias.' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 9) /alertas-accionables — Inbox priorizado de alertas (F4)
  //
  // Agrega senales operativas, fiscales, de inventario, cobros y gastos
  // que requieren accion del administrador, ordenadas por prioridad.
  // -------------------------------------------------------------------------
  router.get('/alertas-accionables', (req, res) => {
    ensureAdmin(req, res, async (usuarioSesion, negocioId) => {
      const rango = normalizarRangoAnalisis(
        req.query?.from ?? req.query?.desde,
        req.query?.to ?? req.query?.hasta
      );
      const cacheKey = `${negocioId}:alertas-acc:${rango.desde}:${rango.hasta}`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      try {
        const alertas = [];

        // ---------- 1) Stock bajo de inventario ----------
        const stockBajo = await db.all(
          `SELECT id, nombre, stock, stock_minimo,
                  COALESCE(costo_promedio_actual, costo_base_sin_itbis, 0) AS costo
             FROM productos
            WHERE negocio_id = ? AND activo = 1
              AND stock_minimo > 0 AND stock < stock_minimo
            ORDER BY (stock_minimo - stock) DESC
            LIMIT 50`,
          [negocioId]
        );
        if (stockBajo.length > 0) {
          const valorReposicion = stockBajo.reduce(
            (acc, p) => acc + safeNumber(p.stock_minimo - p.stock) * safeNumber(p.costo),
            0
          );
          const top3 = stockBajo.slice(0, 3).map((p) => p.nombre).join(', ');
          alertas.push({
            id: 'stock_bajo',
            categoria: 'inventario',
            nivel: stockBajo.length >= 10 ? 'critico' : 'aviso',
            prioridad: stockBajo.length >= 10 ? 1 : 2,
            titulo: `${stockBajo.length} productos por debajo del stock minimo`,
            mensaje: `Top: ${top3}. Reposicion estimada: ${roundDecimal(valorReposicion)}.`,
            accion_sugerida: 'Generar orden de compra al proveedor o ajustar el stock minimo.',
            metricas: {
              cantidad: stockBajo.length,
              valor_reposicion: roundDecimal(valorReposicion),
            },
            link: '#admin-section-inventario',
          });
        }

        // ---------- 2) Productos con margen negativo en el periodo ----------
        const margenNeg = await db.all(
          `SELECT pr.id, pr.nombre,
                  SUM(dp.cantidad) AS unidades,
                  SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos,
                  SUM(dp.cantidad * COALESCE(dp.costo_unitario_snapshot, pr.costo_promedio_actual, pr.costo_base_sin_itbis, 0)) AS costo_total
             FROM detalle_pedido dp
             JOIN pedidos p ON p.id = dp.pedido_id
             JOIN productos pr ON pr.id = dp.producto_id
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?
              AND pr.activo = 1
            GROUP BY pr.id, pr.nombre
           HAVING SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) -
                  SUM(dp.cantidad * COALESCE(dp.costo_unitario_snapshot, pr.costo_promedio_actual, pr.costo_base_sin_itbis, 0)) < 0
            ORDER BY (SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) -
                      SUM(dp.cantidad * COALESCE(dp.costo_unitario_snapshot, pr.costo_promedio_actual, pr.costo_base_sin_itbis, 0))) ASC
            LIMIT 30`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );
        if (margenNeg.length > 0) {
          const perdida = margenNeg.reduce(
            (acc, p) => acc + (safeNumber(p.ingresos) - safeNumber(p.costo_total)),
            0
          );
          const top3 = margenNeg.slice(0, 3).map((p) => p.nombre).join(', ');
          alertas.push({
            id: 'margen_negativo',
            categoria: 'rentabilidad',
            nivel: 'critico',
            prioridad: 1,
            titulo: `${margenNeg.length} productos vendidos a perdida`,
            mensaje: `Top: ${top3}. Perdida acumulada: ${roundDecimal(Math.abs(perdida))}.`,
            accion_sugerida: 'Revisar precio de venta o costo de produccion (receta/proveedor).',
            metricas: {
              cantidad: margenNeg.length,
              perdida: roundDecimal(perdida),
            },
            link: '#analisis-productos-rent-card',
          });
        }

        // ---------- 3) Cuentas por cobrar > 90 dias ----------
        // clientes_deudas usa columna `fecha`. El saldo se calcula como
        // monto_total - SUM(abonos) por deuda; un solo saldo agregado por cliente
        // se obtiene de una subquery con LEFT JOIN a clientes_abonos.
        const aging = await db.get(
          `SELECT
              SUM(CASE WHEN DATEDIFF(CURDATE(), d.fecha) > 90 THEN saldo_pendiente ELSE 0 END) AS bucket_90_plus,
              SUM(CASE WHEN DATEDIFF(CURDATE(), d.fecha) BETWEEN 61 AND 90 THEN saldo_pendiente ELSE 0 END) AS bucket_61_90,
              COUNT(CASE WHEN DATEDIFF(CURDATE(), d.fecha) > 90 THEN 1 ELSE NULL END) AS cuentas_90_plus,
              COUNT(CASE WHEN DATEDIFF(CURDATE(), d.fecha) > 60 THEN 1 ELSE NULL END) AS cuentas_60_plus,
              SUM(saldo_pendiente) AS total_saldo
            FROM (
              SELECT d.id, d.fecha,
                     GREATEST(d.monto_total - COALESCE(a.total_abonos, 0), 0) AS saldo_pendiente
                FROM clientes_deudas d
                LEFT JOIN (
                  SELECT deuda_id, SUM(monto) AS total_abonos
                    FROM clientes_abonos
                   WHERE negocio_id = ?
                   GROUP BY deuda_id
                ) a ON a.deuda_id = d.id
               WHERE d.negocio_id = ?
            ) d
           WHERE saldo_pendiente > 0`,
          [negocioId, negocioId]
        );
        if (aging && safeNumber(aging.bucket_90_plus) > 0) {
          alertas.push({
            id: 'cxc_vencidas',
            categoria: 'cobros',
            nivel: 'critico',
            prioridad: 1,
            titulo: `${aging.cuentas_90_plus} clientes con saldo vencido +90 dias`,
            mensaje: `Saldo en mora critica: ${roundDecimal(aging.bucket_90_plus)} (de ${roundDecimal(aging.total_saldo)} totales).`,
            accion_sugerida: 'Iniciar gestion de cobranza intensiva o evaluar incobrabilidad.',
            metricas: {
              monto_90_plus: roundDecimal(aging.bucket_90_plus),
              monto_61_90: roundDecimal(aging.bucket_61_90),
              cuentas_90_plus: safeNumber(aging.cuentas_90_plus),
              total_cxc: roundDecimal(aging.total_saldo),
            },
            link: '#admin-section-clientes',
          });
        }

        // ---------- 4) Sobre-presupuesto del mes ----------
        // Tabla presupuestos_categoria_gasto usa monto_mensual (sin anio/mes).
        let sobrePresupuesto = [];
        try {
          sobrePresupuesto = await db.all(
            `SELECT pcg.id, pcg.categoria, pcg.monto_mensual AS presupuestado,
                    COALESCE(SUM(g.monto), 0) AS ejecutado
               FROM presupuestos_categoria_gasto pcg
               LEFT JOIN gastos g ON g.categoria = pcg.categoria
                AND g.negocio_id = pcg.negocio_id
                AND YEAR(g.fecha) = YEAR(CURDATE())
                AND MONTH(g.fecha) = MONTH(CURDATE())
                AND COALESCE(g.estado, 'PAGADO') <> 'ANULADO'
              WHERE pcg.negocio_id = ?
                AND COALESCE(pcg.activo, 1) = 1
              GROUP BY pcg.id, pcg.categoria, pcg.monto_mensual
             HAVING COALESCE(SUM(g.monto), 0) > pcg.monto_mensual`,
            [negocioId]
          );
        } catch (err) {
          // tabla puede no existir todavia, continuamos sin alerta
          sobrePresupuesto = [];
        }
        if (sobrePresupuesto.length > 0) {
          const exceso = sobrePresupuesto.reduce(
            (acc, p) => acc + (safeNumber(p.ejecutado) - safeNumber(p.presupuestado)),
            0
          );
          const cats = sobrePresupuesto.slice(0, 3).map((p) => p.categoria).join(', ');
          alertas.push({
            id: 'sobre_presupuesto',
            categoria: 'gastos',
            nivel: 'aviso',
            prioridad: 2,
            titulo: `${sobrePresupuesto.length} categorias sobre presupuesto`,
            mensaje: `Top: ${cats}. Exceso acumulado: ${roundDecimal(exceso)}.`,
            accion_sugerida: 'Revisar gastos de la categoria o ajustar presupuesto si la situacion es estructural.',
            metricas: {
              cantidad: sobrePresupuesto.length,
              exceso: roundDecimal(exceso),
            },
            link: '#analisis-gastos-card',
          });
        }

        // ---------- 5) Posibles duplicados de gastos en periodo ----------
        const dupRow = await db.get(
          `SELECT COUNT(*) AS cantidad
             FROM gastos g1
             JOIN gastos g2 ON g1.negocio_id = g2.negocio_id
              AND g1.id < g2.id
              AND ROUND(g1.monto, 2) = ROUND(g2.monto, 2)
              AND COALESCE(g1.proveedor, '') = COALESCE(g2.proveedor, '')
              AND ABS(DATEDIFF(g1.fecha, g2.fecha)) <= 7
            WHERE g1.negocio_id = ?
              AND g1.fecha BETWEEN ? AND ?`,
          [negocioId, rango.desde, rango.hasta]
        );
        if (dupRow && safeNumber(dupRow.cantidad) > 0) {
          alertas.push({
            id: 'gastos_duplicados',
            categoria: 'gastos',
            nivel: 'aviso',
            prioridad: 3,
            titulo: `${dupRow.cantidad} posibles duplicados de gasto detectados`,
            mensaje: 'Mismo monto y proveedor en ventana de 7 dias.',
            accion_sugerida: 'Revisar la lista de duplicados y eliminar el registro repetido si aplica.',
            metricas: { cantidad: safeNumber(dupRow.cantidad) },
            link: '#analisis-gastos-card',
          });
        }

        // ---------- 6) Productos sin movimiento (mas de 90 dias) ----------
        let sinMovimiento = [];
        try {
          sinMovimiento = await db.all(
            `SELECT pr.id, pr.nombre, pr.stock,
                    COALESCE(pr.costo_promedio_actual, pr.costo_base_sin_itbis, 0) AS costo
               FROM productos pr
              WHERE pr.negocio_id = ? AND pr.activo = 1 AND pr.stock > 0
                AND pr.id NOT IN (
                  SELECT DISTINCT dp.producto_id
                    FROM detalle_pedido dp
                    JOIN pedidos p ON p.id = dp.pedido_id
                   WHERE p.negocio_id = ?
                     AND ${fechaBaseFor('p')} >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                )
              ORDER BY (pr.stock * COALESCE(pr.costo_promedio_actual, pr.costo_base_sin_itbis, 0)) DESC
              LIMIT 30`,
            [negocioId, negocioId]
          );
        } catch (err) {
          sinMovimiento = [];
        }
        if (sinMovimiento.length > 0) {
          const valorMuerto = sinMovimiento.reduce(
            (acc, p) => acc + safeNumber(p.stock) * safeNumber(p.costo),
            0
          );
          alertas.push({
            id: 'productos_sin_movimiento',
            categoria: 'inventario',
            nivel: 'info',
            prioridad: 4,
            titulo: `${sinMovimiento.length} productos sin venta en los ultimos 90 dias`,
            mensaje: `Capital inmovilizado: ${roundDecimal(valorMuerto)}.`,
            accion_sugerida: 'Considerar promociones, combos o descontinuar producto.',
            metricas: {
              cantidad: sinMovimiento.length,
              capital_inmovilizado: roundDecimal(valorMuerto),
            },
            link: '#analisis-inventario-card',
          });
        }

        // ---------- 7) Caida fuerte de ventas MoM ----------
        const ventasActualesRow = await db.get(
          `SELECT SUM(p.subtotal + p.impuesto - p.descuento_monto) AS total
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );
        const ventasMoMRow = await db.get(
          `SELECT SUM(p.subtotal + p.impuesto - p.descuento_monto) AS total
             FROM pedidos p
            WHERE ${buildPedidoFilter({ alias: 'p' })}
              AND ${fechaBaseFor('p')} BETWEEN
                  DATE_SUB(?, INTERVAL 1 MONTH) AND DATE_SUB(?, INTERVAL 1 MONTH)`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );
        const ventasActuales = safeNumber(ventasActualesRow?.total);
        const ventasMoM = safeNumber(ventasMoMRow?.total);
        if (ventasMoM > 0) {
          const variacion = ((ventasActuales - ventasMoM) / ventasMoM) * 100;
          if (variacion <= -20) {
            alertas.push({
              id: 'caida_ventas_mom',
              categoria: 'ventas',
              nivel: variacion <= -35 ? 'critico' : 'aviso',
              prioridad: variacion <= -35 ? 1 : 2,
              titulo: `Ventas cayeron ${roundDecimal(Math.abs(variacion))}% vs mes anterior`,
              mensaje: `Periodo actual: ${roundDecimal(ventasActuales)}; mes anterior: ${roundDecimal(ventasMoM)}.`,
              accion_sugerida: 'Revisar campanias, mix de productos, dias del periodo (festivos) o tendencias del sector.',
              metricas: {
                variacion_pct: roundDecimal(variacion),
                ventas_actuales: roundDecimal(ventasActuales),
                ventas_anteriores: roundDecimal(ventasMoM),
              },
              link: '#analisis-tendencias-card',
            });
          }
        }

        // ---------- 8) Food cost critico (> 35%) ----------
        // Necesita reusar el calculo de restaurante; aproximamos consultando COGS directo
        const cogsRow = await db.get(
          `SELECT
             SUM(p.subtotal - p.descuento_monto) AS ingresos_sin_itbis,
             COALESCE(SUM(dp.cogs_linea),
                      SUM(dp.cantidad * COALESCE(dp.costo_unitario_snapshot, 0))) AS cogs
            FROM pedidos p
            LEFT JOIN detalle_pedido dp ON dp.pedido_id = p.id
           WHERE ${buildPedidoFilter({ alias: 'p' })}
             AND ${fechaBaseFor('p')} BETWEEN ? AND ?`,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );
        const ingresosSinItbis = safeNumber(cogsRow?.ingresos_sin_itbis);
        const cogsTotal = safeNumber(cogsRow?.cogs);
        if (ingresosSinItbis > 0) {
          const foodCostPct = (cogsTotal / ingresosSinItbis) * 100;
          if (foodCostPct > 35) {
            alertas.push({
              id: 'food_cost_alto',
              categoria: 'operativo',
              nivel: foodCostPct > 40 ? 'critico' : 'aviso',
              prioridad: foodCostPct > 40 ? 1 : 2,
              titulo: `Food Cost en ${roundDecimal(foodCostPct, 1)}% (objetivo 28-30%)`,
              mensaje: `COGS: ${roundDecimal(cogsTotal)}; ingresos sin ITBIS: ${roundDecimal(ingresosSinItbis)}.`,
              accion_sugerida: 'Revisar mermas, escandallos, precios de proveedor y porciones.',
              metricas: {
                food_cost_pct: roundDecimal(foodCostPct, 2),
                cogs: roundDecimal(cogsTotal),
                ingresos_sin_itbis: roundDecimal(ingresosSinItbis),
              },
              link: '#analisis-restaurante-card',
            });
          }
        }

        // ---------- 9) Pedidos pendientes de cobro hace mas de 30 dias ----------
        // Usa fecha real y calcula saldo dinamico.
        const pendientes = await db.get(
          `SELECT COUNT(*) AS cantidad, SUM(saldo_pendiente) AS total
             FROM (
               SELECT d.id,
                      GREATEST(d.monto_total - COALESCE(a.total_abonos, 0), 0) AS saldo_pendiente,
                      d.fecha
                 FROM clientes_deudas d
                 LEFT JOIN (
                   SELECT deuda_id, SUM(monto) AS total_abonos
                     FROM clientes_abonos
                    WHERE negocio_id = ?
                    GROUP BY deuda_id
                 ) a ON a.deuda_id = d.id
                WHERE d.negocio_id = ?
             ) d
            WHERE saldo_pendiente > 0
              AND DATEDIFF(CURDATE(), d.fecha) BETWEEN 31 AND 90`,
          [negocioId, negocioId]
        );
        if (pendientes && safeNumber(pendientes.cantidad) > 0) {
          alertas.push({
            id: 'cxc_31_90',
            categoria: 'cobros',
            nivel: 'aviso',
            prioridad: 3,
            titulo: `${pendientes.cantidad} cuentas por cobrar entre 31-90 dias`,
            mensaje: `Saldo total pendiente: ${roundDecimal(pendientes.total)}.`,
            accion_sugerida: 'Enviar recordatorios automaticos o agendar llamadas de cobro.',
            metricas: {
              cantidad: safeNumber(pendientes.cantidad),
              total: roundDecimal(pendientes.total),
            },
            link: '#admin-section-clientes',
          });
        }

        // Ordenar por prioridad ascendente (1 = mas urgente)
        alertas.sort((a, b) => a.prioridad - b.prioridad);

        const payload = {
          ok: true,
          rango,
          totales: {
            criticas: alertas.filter((a) => a.nivel === 'critico').length,
            avisos: alertas.filter((a) => a.nivel === 'aviso').length,
            informativas: alertas.filter((a) => a.nivel === 'info').length,
            total: alertas.length,
          },
          alertas,
        };

        cacheSet(cacheKey, payload);
        res.json(payload);
      } catch (error) {
        console.error('[analytics/alertas-accionables] error:', error?.message || error);
        res.status(500).json({ ok: false, error: 'No se pudo calcular el inbox de alertas.' });
      }
    });
  });

  return { router, limpiarCache };
};

module.exports = {
  createAnalisisExtensionRouter,
};
