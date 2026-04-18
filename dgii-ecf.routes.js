// ---------------------------------------------------------------------------
// dgii-ecf.routes.js — Live e-CF emission from POS pedidos
// ---------------------------------------------------------------------------

const express = require('express');
const { buildEcfXml, buildResumenFcXml } = require('./dgii-paso2.xml');
const {
  DGII_DEFAULT_ENDPOINTS,
  toSafeJson,
  signEcfXml,
  extractSignatureValueFromXml,
  computeCodigoSeguridadeCF,
  sendXmlToDgii,
  consultDgiiResultUntilSettled,
  consultRfceResult,
  remoteResultIsPending,
  buildDgiiXmlFileName,
  createDgiiConfigManager,
  resolveEmissionPhase,
  dgiiCoreMissingDeps,
} = require('./dgii-core');
const {
  generarEncf,
  avanzarSecuenciaTrasDuplicado,
  inicializarSecuencia,
  obtenerSecuencias,
  obtenerFechaVencimiento,
} = require('./dgii-ecf.sequences');
const {
  determineTipoEcf,
  ecfTipoNumerico,
  buildEcfPayloadFromPedido,
  buildResumenFcPayload,
  buildNotaEcfPayload,
  determineEcfFlujo,
} = require('./dgii-ecf.mapper');

const MAX_INTENTOS = 5;

const createDgiiEcfRouter = ({ db, requireUsuarioSesion, tienePermisoAdmin, obtenerNegocioIdUsuario } = {}) => {
  if (!db || !requireUsuarioSesion || !tienePermisoAdmin || !obtenerNegocioIdUsuario) {
    throw new Error('createDgiiEcfRouter requiere db y middlewares de sesion.');
  }

  const router = express.Router();

  if (dgiiCoreMissingDeps.length) {
    router.use((_req, res) =>
      res.status(503).json({
        ok: false,
        error: `Modulo e-CF no disponible. Faltan: ${dgiiCoreMissingDeps.join(', ')}. Ejecuta npm install.`,
      })
    );
    return router;
  }

  const configManager = createDgiiConfigManager({ db });

  const ensureAdmin = (req, res, callback) =>
    requireUsuarioSesion(req, res, (usuarioSesion) => {
      if (!tienePermisoAdmin(usuarioSesion)) {
        return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
      }
      return callback(usuarioSesion);
    });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const loadPedidoCompleto = async (pedidoId, negocioId) => {
    const pedido = await db.get(
      'SELECT * FROM pedidos WHERE id = ? AND negocio_id = ?',
      [pedidoId, negocioId]
    );
    if (!pedido) return null;

    const detalle = await db.all(
      `SELECT dp.*, p.nombre AS nombre_producto, p.tipo_producto, p.unidad_base
       FROM detalle_pedido dp
       LEFT JOIN productos p ON p.id = dp.producto_id
       WHERE dp.pedido_id = ? AND dp.negocio_id = ?`,
      [pedidoId, negocioId]
    );

    let cliente = null;
    if (pedido.cliente_documento) {
      cliente = await db.get(
        'SELECT * FROM clientes WHERE documento = ? AND negocio_id = ? LIMIT 1',
        [pedido.cliente_documento, negocioId]
      );
    }
    if (!cliente && pedido.cliente) {
      cliente = { nombre: pedido.cliente, documento: pedido.cliente_documento || '' };
    }

    const negocio = await db.get('SELECT * FROM negocios WHERE id = ?', [negocioId]);

    return { pedido, detalle: detalle || [], cliente, negocio };
  };

  const registrarIntento = async ({ pedidoId, negocioId, tipoEnvio, endpoint, responseStatus, responseBody, resultado, codigo, mensaje, trackId }) => {
    await db.run(
      `INSERT INTO ecf_intentos (pedido_id, negocio_id, tipo_envio, endpoint, response_status, response_body, resultado, codigo, mensaje, track_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pedidoId, negocioId, tipoEnvio, endpoint || null, responseStatus || null,
       responseBody ? String(responseBody).slice(0, 65000) : null,
       resultado || 'ERROR', codigo || null, mensaje || null, trackId || null]
    );
  };

  const actualizarPedidoEcf = async (pedidoId, fields) => {
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (!sets.length) return;
    params.push(pedidoId);
    await db.run(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = ?`, params);
  };

  // ---------------------------------------------------------------------------
  // Core emission logic
  // ---------------------------------------------------------------------------

  const emitirEcfParaPedido = async (pedidoId, negocioId) => {
    const data = await loadPedidoCompleto(pedidoId, negocioId);
    if (!data) throw new Error(`Pedido ${pedidoId} no encontrado.`);

    const { pedido, detalle, cliente, negocio } = data;

    if (pedido.ecf_estado === 'ACEPTADO') {
      return { ok: true, message: 'e-CF ya fue aceptado.', encf: pedido.ecf_encf, estado: 'ACEPTADO' };
    }
    if ((pedido.ecf_intentos || 0) >= MAX_INTENTOS && pedido.ecf_estado !== 'PENDIENTE') {
      throw new Error(`Pedido ${pedidoId} alcanzo el maximo de ${MAX_INTENTOS} intentos.`);
    }

    // Resolve e-CF type
    let ecfTipo = pedido.ecf_tipo;
    if (!ecfTipo) {
      ecfTipo = determineTipoEcf(pedido.tipo_comprobante);
      if (!ecfTipo) throw new Error(`Tipo de comprobante '${pedido.tipo_comprobante}' no tiene equivalente e-CF.`);
    }

    // Load DGII config
    const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
    if (!configRow) throw new Error('Configura las credenciales DGII antes de emitir e-CF.');
    const config = await configManager.loadConfig(negocioId);
    const rncEmisor = config.rnc_emisor || negocio.rnc || '';

    // Generate eNCF if not already assigned
    let encfData;
    if (pedido.ecf_encf) {
      const fv = await obtenerFechaVencimiento(ecfTipo, negocioId, db);
      encfData = {
        encf: pedido.ecf_encf,
        fechaVencimiento: fv,
        rncEmisor,
      };
    } else {
      encfData = await generarEncf(ecfTipo, negocioId, db);
    }

    const flujo = determineEcfFlujo(ecfTipo, pedido.total);
    const tipoNumerico = ecfTipoNumerico(ecfTipo);
    const isNota = tipoNumerico === '33' || tipoNumerico === '34';

    // Build payload
    let payload;
    if (isNota && pedido.nota_credito_referencia) {
      const refPedido = await db.get('SELECT ecf_encf, fecha_factura FROM pedidos WHERE id = ? AND negocio_id = ?', [pedido.nota_credito_referencia, negocioId]);
      payload = buildNotaEcfPayload({
        pedido: { ...pedido, ecf_tipo: ecfTipo },
        detalle,
        cliente,
        negocio,
        encfData,
        configDgii: config,
        referenciaEncf: refPedido?.ecf_encf || '',
        referenciaFecha: refPedido?.fecha_factura || '',
        codigoModificacion: pedido.codigo_modificacion || (tipoNumerico === '33' ? '3' : '1'),
      });
    } else {
      payload = buildEcfPayloadFromPedido({
        pedido: { ...pedido, ecf_tipo: ecfTipo },
        detalle,
        cliente,
        negocio,
        encfData,
        configDgii: config,
      });
    }

    // Update pedido with initial state
    await actualizarPedidoEcf(pedidoId, {
      ecf_tipo: ecfTipo,
      ecf_encf: encfData.encf,
      ecf_estado: 'PROCESANDO',
      ecf_intentos: (pedido.ecf_intentos || 0) + 1,
      ecf_ultimo_intento_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    // Build XML — FechaVencimientoSecuencia solo para tipos que lo soportan (no E32/E34)
    const tiposConFVS = ['31', '33', '41', '43', '44', '45', '46', '47'];
    const xmlGenerado = buildEcfXml({
      payload,
      rncEmisorFallback: rncEmisor,
      fechaVencimientoSecuenciaFallback: tiposConFVS.includes(tipoNumerico) ? (encfData.fechaVencimiento || null) : null,
    });

    // Sign XML
    const firmado = signEcfXml({ xml: xmlGenerado, config });

    await actualizarPedidoEcf(pedidoId, {
      ecf_xml_generado: xmlGenerado,
      ecf_xml_firmado: firmado.xml,
    });

    // Get DGII token
    const token = await configManager.resolveToken({ config, configRow, negocioId });

    // Determine flow and send
    if (flujo === 'FC_MENOR_250K') {
      return await emitirFcMenor250k({ pedidoId, negocioId, pedido, cliente, negocio, config, encfData, xmlGenerado, firmado, token, rncEmisor, payload });
    }

    // Normal ECF flow
    const endpoints = config.endpoints || DGII_DEFAULT_ENDPOINTS;
    const envio = await sendXmlToDgii({
      endpoint: endpoints.recepcion,
      apiPath: '/api/FacturasElectronicas',
      xmlPayload: firmado.xml,
      token,
      fileName: buildDgiiXmlFileName({ rncEmisor, encf: encfData.encf }),
    });

    await registrarIntento({
      pedidoId,
      negocioId,
      tipoEnvio: 'EMISION',
      endpoint: envio.endpoint,
      responseStatus: envio.status,
      responseBody: envio.raw,
      resultado: envio.extracted?.accepted ? 'ACEPTADO' : envio.extracted?.rejected ? 'RECHAZADO' : 'ENVIADO',
      codigo: envio.extracted?.code,
      mensaje: envio.extracted?.message,
      trackId: envio.extracted?.trackId,
    });

    if (!envio.ok) {
      const mensaje = envio.extracted?.message || envio.raw?.slice(0, 500) || 'Error de envio';
      const isSecuenciaDuplicada = /secuencia.*utiliza/i.test(mensaje);
      if (isSecuenciaDuplicada) {
        await avanzarSecuenciaTrasDuplicado(ecfTipo, negocioId, db);
      }
      await actualizarPedidoEcf(pedidoId, {
        ecf_estado: 'RECHAZADO',
        ecf_codigo_dgii: envio.extracted?.code || null,
        ecf_mensaje_dgii: mensaje,
      });
      return { ok: false, message: mensaje, encf: encfData.encf, estado: 'RECHAZADO' };
    }

    // Consult result
    const trackId = envio.extracted?.trackId;
    let estadoFinal = 'ENVIADO';
    let codigoDgii = envio.extracted?.code || null;
    let mensajeDgii = envio.extracted?.message || null;

    if (trackId) {
      await actualizarPedidoEcf(pedidoId, { ecf_track_id: trackId });

      const consulta = await consultDgiiResultUntilSettled(
        { endpoint: endpoints.consultaResultado, token, trackId, encf: encfData.encf, rncEmisor },
        { maxAttempts: 5, delayMs: 1500 }
      );

      await registrarIntento({
        pedidoId,
        negocioId,
        tipoEnvio: 'CONSULTA',
        endpoint: consulta.endpoint,
        responseStatus: consulta.status,
        responseBody: consulta.raw,
        resultado: consulta.extracted?.accepted ? 'ACEPTADO' : consulta.extracted?.rejected ? 'RECHAZADO' : 'PENDIENTE',
        codigo: consulta.extracted?.code,
        mensaje: consulta.extracted?.message,
        trackId,
      });

      if (consulta.extracted?.accepted) {
        estadoFinal = 'ACEPTADO';
      } else if (consulta.extracted?.rejected) {
        estadoFinal = 'RECHAZADO';
      } else if (remoteResultIsPending(consulta.extracted)) {
        estadoFinal = 'ENVIADO';
      }
      codigoDgii = consulta.extracted?.code || codigoDgii;
      mensajeDgii = consulta.extracted?.message || mensajeDgii;
    } else if (envio.extracted?.accepted) {
      estadoFinal = 'ACEPTADO';
    }

    await actualizarPedidoEcf(pedidoId, {
      ecf_estado: estadoFinal,
      ecf_codigo_dgii: codigoDgii,
      ecf_mensaje_dgii: mensajeDgii,
    });

    return { ok: estadoFinal === 'ACEPTADO' || estadoFinal === 'ENVIADO', message: mensajeDgii, encf: encfData.encf, estado: estadoFinal, trackId };
  };

  // ---------------------------------------------------------------------------
  // FC < 250k flow (sign ECF → compute security code → build RFCE → send)
  // ---------------------------------------------------------------------------

  const emitirFcMenor250k = async ({ pedidoId, negocioId, pedido, cliente, negocio, config, encfData, xmlGenerado, firmado, token, rncEmisor, payload }) => {
    const signatureValue = extractSignatureValueFromXml(firmado.xml);
    const codigoSeguridad = computeCodigoSeguridadeCF(signatureValue);

    await actualizarPedidoEcf(pedidoId, { ecf_codigo_seguridad: codigoSeguridad });

    // Build RFCE
    const rfcePayload = buildResumenFcPayload({
      pedido: { ...pedido, ecf_tipo: encfData.encf.slice(0, 3) },
      cliente,
      negocio,
      encfData,
      configDgii: config,
      codigoSeguridadeCF: codigoSeguridad,
    });

    const rfceXml = buildResumenFcXml({
      payload: rfcePayload,
      rncEmisorFallback: rncEmisor,
      codigoSeguridadeCF: codigoSeguridad,
    });

    const rfceFirmado = signEcfXml({ xml: rfceXml, config });

    const endpoints = config.endpoints || DGII_DEFAULT_ENDPOINTS;
    const envio = await sendXmlToDgii({
      endpoint: endpoints.recepcionFc,
      apiPath: '/api/recepcion/ecf',
      xmlPayload: rfceFirmado.xml,
      token,
      fileName: buildDgiiXmlFileName({ rncEmisor, encf: encfData.encf, fallback: 'rfce.xml' }),
    });

    await registrarIntento({
      pedidoId,
      negocioId,
      tipoEnvio: 'RESUMEN_FC',
      endpoint: envio.endpoint,
      responseStatus: envio.status,
      responseBody: envio.raw,
      resultado: envio.extracted?.accepted ? 'ACEPTADO' : envio.extracted?.rejected ? 'RECHAZADO' : 'ENVIADO',
      codigo: envio.extracted?.code,
      mensaje: envio.extracted?.message,
      trackId: envio.extracted?.trackId,
    });

    if (!envio.ok) {
      const mensaje = envio.extracted?.message || envio.raw?.slice(0, 500) || 'Error envio RFCE';
      const isSecuenciaDuplicada = /secuencia.*utiliza/i.test(mensaje);
      if (isSecuenciaDuplicada) {
        await avanzarSecuenciaTrasDuplicado(encfData.encf.slice(0, 3), negocioId, db);
      }
      await actualizarPedidoEcf(pedidoId, {
        ecf_estado: 'RECHAZADO',
        ecf_codigo_dgii: envio.extracted?.code || null,
        ecf_mensaje_dgii: mensaje,
      });
      return { ok: false, message: mensaje, encf: encfData.encf, estado: 'RECHAZADO' };
    }

    // Si RecepcionFC ya acepto, no necesitamos consultar
    if (envio.extracted?.accepted) {
      const mensajeDgii = envio.extracted?.message || 'Aceptado';
      await actualizarPedidoEcf(pedidoId, {
        ecf_estado: 'ACEPTADO',
        ecf_codigo_dgii: envio.extracted?.code || null,
        ecf_mensaje_dgii: mensajeDgii,
      });
      return { ok: true, message: mensajeDgii, encf: encfData.encf, estado: 'ACEPTADO' };
    }

    // Consult RFCE result
    const consulta = await consultRfceResult({
      endpoint: endpoints.consultaRfce,
      token,
      rncEmisor,
      encf: encfData.encf,
      codigoSeguridadeCF: codigoSeguridad,
    });

    await registrarIntento({
      pedidoId,
      negocioId,
      tipoEnvio: 'CONSULTA_RFCE',
      endpoint: consulta.endpoint,
      responseStatus: consulta.status,
      responseBody: consulta.raw,
      resultado: consulta.extracted?.accepted ? 'ACEPTADO' : consulta.extracted?.rejected ? 'RECHAZADO' : 'PENDIENTE',
      codigo: consulta.extracted?.code,
      mensaje: consulta.extracted?.message,
    });

    const estadoFinal = consulta.extracted?.accepted ? 'ACEPTADO' : consulta.extracted?.rejected ? 'RECHAZADO' : 'ENVIADO';
    const mensajeDgii = consulta.extracted?.message || envio.extracted?.message || null;

    await actualizarPedidoEcf(pedidoId, {
      ecf_estado: estadoFinal,
      ecf_codigo_dgii: consulta.extracted?.code || envio.extracted?.code || null,
      ecf_mensaje_dgii: mensajeDgii,
    });

    return { ok: estadoFinal !== 'RECHAZADO', message: mensajeDgii, encf: encfData.encf, estado: estadoFinal };
  };

  // ===========================================================================
  // Routes
  // ===========================================================================

  // POST /emitir/:pedidoId — Emit e-CF for a single order
  router.post('/emitir/:pedidoId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        if (!pedidoId) return res.status(400).json({ ok: false, error: 'ID de pedido invalido.' });

        const result = await emitirEcfParaPedido(pedidoId, negocioId);
        return res.json({ ok: result.ok, ...result });
      } catch (error) {
        console.error('Error emitir e-CF:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // POST /emitir-lote — Batch emission (for simulation tests)
  router.post('/emitir-lote', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const { pedido_ids, filtro_estado, fase } = req.body || {};

        let pedidos;
        if (Array.isArray(pedido_ids) && pedido_ids.length) {
          const placeholders = pedido_ids.map(() => '?').join(',');
          pedidos = await db.all(
            `SELECT id, ecf_tipo, ecf_estado, total FROM pedidos
             WHERE id IN (${placeholders}) AND negocio_id = ?
             ORDER BY id`,
            [...pedido_ids, negocioId]
          );
        } else {
          const estado = filtro_estado || 'PENDIENTE';
          pedidos = await db.all(
            `SELECT id, ecf_tipo, ecf_estado, total FROM pedidos
             WHERE negocio_id = ? AND ecf_tipo IS NOT NULL AND (ecf_estado = ? OR ecf_estado IS NULL)
             ORDER BY id`,
            [negocioId, estado]
          );
        }

        if (!pedidos?.length) {
          return res.json({ ok: true, message: 'No hay pedidos pendientes de emision.', resultados: [] });
        }

        // Sort by emission phase
        const sorted = pedidos
          .map((p) => {
            const tipo = ecfTipoNumerico(p.ecf_tipo);
            const flujo = determineEcfFlujo(p.ecf_tipo, p.total);
            const emission = resolveEmissionPhase({ flujo, tipoDocumento: tipo });
            return { ...p, emission, flujo };
          })
          .sort((a, b) => {
            const phaseA = a.emission.phase * 1000 + a.emission.typeRank;
            const phaseB = b.emission.phase * 1000 + b.emission.typeRank;
            return phaseA - phaseB || a.id - b.id;
          });

        // Filter by fase if specified
        const filtered = fase ? sorted.filter((p) => p.emission.phase === Number(fase)) : sorted;

        const resultados = [];
        for (const p of filtered) {
          if (p.ecf_estado === 'ACEPTADO') {
            resultados.push({ pedidoId: p.id, ok: true, estado: 'ACEPTADO', message: 'Ya aceptado' });
            continue;
          }
          try {
            const result = await emitirEcfParaPedido(p.id, negocioId);
            resultados.push({ pedidoId: p.id, ...result });
          } catch (error) {
            resultados.push({ pedidoId: p.id, ok: false, estado: 'ERROR', message: error.message });
          }
        }

        const aceptados = resultados.filter((r) => r.estado === 'ACEPTADO').length;
        const rechazados = resultados.filter((r) => r.estado === 'RECHAZADO' || r.estado === 'ERROR').length;
        const pendientes = resultados.filter((r) => r.estado === 'ENVIADO' || r.estado === 'PENDIENTE').length;

        return res.json({
          ok: true,
          total: resultados.length,
          aceptados,
          rechazados,
          pendientes,
          resultados,
        });
      } catch (error) {
        console.error('Error emitir lote e-CF:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // POST /consultar/:pedidoId — Re-check DGII status
  router.post('/consultar/:pedidoId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        const pedido = await db.get('SELECT * FROM pedidos WHERE id = ? AND negocio_id = ?', [pedidoId, negocioId]);
        if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
        if (!pedido.ecf_track_id && !pedido.ecf_encf) {
          return res.status(400).json({ ok: false, error: 'Este pedido no tiene trackId ni eNCF para consultar.' });
        }

        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!configRow) return res.status(400).json({ ok: false, error: 'Configura DGII primero.' });
        const config = await configManager.loadConfig(negocioId);
        const token = await configManager.resolveToken({ config, configRow, negocioId });
        const endpoints = config.endpoints || DGII_DEFAULT_ENDPOINTS;
        const rncEmisor = config.rnc_emisor || '';

        const flujo = determineEcfFlujo(pedido.ecf_tipo, pedido.total);
        let consulta;
        if (flujo === 'FC_MENOR_250K' && pedido.ecf_codigo_seguridad) {
          consulta = await consultRfceResult({
            endpoint: endpoints.consultaRfce,
            token,
            rncEmisor,
            encf: pedido.ecf_encf,
            codigoSeguridadeCF: pedido.ecf_codigo_seguridad,
          });
        } else if (pedido.ecf_track_id) {
          consulta = await consultDgiiResultUntilSettled(
            { endpoint: endpoints.consultaResultado, token, trackId: pedido.ecf_track_id, encf: pedido.ecf_encf, rncEmisor },
            { maxAttempts: 3, delayMs: 1000 }
          );
        } else {
          return res.status(400).json({ ok: false, error: 'No hay datos suficientes para consultar estado.' });
        }

        const estadoFinal = consulta.extracted?.accepted ? 'ACEPTADO' : consulta.extracted?.rejected ? 'RECHAZADO' : 'ENVIADO';

        await actualizarPedidoEcf(pedidoId, {
          ecf_estado: estadoFinal,
          ecf_codigo_dgii: consulta.extracted?.code || pedido.ecf_codigo_dgii,
          ecf_mensaje_dgii: consulta.extracted?.message || pedido.ecf_mensaje_dgii,
        });

        await registrarIntento({
          pedidoId,
          negocioId,
          tipoEnvio: 'CONSULTA',
          endpoint: consulta.endpoint,
          responseStatus: consulta.status,
          responseBody: consulta.raw,
          resultado: estadoFinal,
          codigo: consulta.extracted?.code,
          mensaje: consulta.extracted?.message,
          trackId: pedido.ecf_track_id,
        });

        return res.json({ ok: true, estado: estadoFinal, codigo: consulta.extracted?.code, mensaje: consulta.extracted?.message });
      } catch (error) {
        console.error('Error consultar e-CF:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /estado/:pedidoId — Get e-CF status for UI
  router.get('/estado/:pedidoId', (req, res) =>
    requireUsuarioSesion(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        const pedido = await db.get(
          'SELECT ecf_tipo, ecf_encf, ecf_estado, ecf_codigo_dgii, ecf_mensaje_dgii, ecf_codigo_seguridad, ecf_intentos FROM pedidos WHERE id = ? AND negocio_id = ?',
          [pedidoId, negocioId]
        );
        if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
        return res.json({ ok: true, ...pedido });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // POST /reintentar/:pedidoId — Retry failed emission
  router.post('/reintentar/:pedidoId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        const pedido = await db.get('SELECT ecf_estado, ecf_intentos FROM pedidos WHERE id = ? AND negocio_id = ?', [pedidoId, negocioId]);
        if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });

        // Reset state for retry
        await actualizarPedidoEcf(pedidoId, {
          ecf_estado: 'PENDIENTE',
          ecf_encf: null,
          ecf_xml_generado: null,
          ecf_xml_firmado: null,
          ecf_track_id: null,
          ecf_codigo_dgii: null,
          ecf_mensaje_dgii: null,
          ecf_codigo_seguridad: null,
          ecf_intentos: 0,
        });

        const result = await emitirEcfParaPedido(pedidoId, negocioId);
        return res.json({ ok: result.ok, ...result });
      } catch (error) {
        console.error('Error reintentar e-CF:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /pendientes — List orders pending emission
  router.get('/pendientes', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const rows = await db.all(
          `SELECT id, cliente, tipo_comprobante, ncf, total, ecf_tipo, ecf_encf, ecf_estado, ecf_codigo_dgii, ecf_mensaje_dgii, ecf_intentos, fecha_factura
           FROM pedidos
           WHERE negocio_id = ? AND ecf_tipo IS NOT NULL AND (ecf_estado IS NULL OR ecf_estado IN ('PENDIENTE', 'RECHAZADO', 'ENVIADO'))
           ORDER BY id DESC
           LIMIT 200`,
          [negocioId]
        );
        return res.json({ ok: true, pedidos: rows || [] });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /resumen — Dashboard summary
  router.get('/resumen', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const rows = await db.all(
          `SELECT ecf_tipo, ecf_estado, COUNT(*) AS total
           FROM pedidos
           WHERE negocio_id = ? AND ecf_tipo IS NOT NULL
           GROUP BY ecf_tipo, ecf_estado
           ORDER BY ecf_tipo, ecf_estado`,
          [negocioId]
        );
        const secuencias = await obtenerSecuencias(negocioId, db);
        return res.json({ ok: true, resumen: rows || [], secuencias });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /intentos/:pedidoId — List emission attempts for a pedido
  router.get('/intentos/:pedidoId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        const rows = await db.all(
          `SELECT id, tipo_envio, endpoint, response_status, resultado, codigo, mensaje, track_id, created_at
           FROM ecf_intentos
           WHERE pedido_id = ? AND negocio_id = ?
           ORDER BY created_at DESC`,
          [pedidoId, negocioId]
        );
        return res.json({ ok: true, intentos: rows || [] });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // POST /secuencias/inicializar — Initialize e-CF sequences
  router.post('/secuencias/inicializar', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const { secuencias } = req.body || {};
        if (!Array.isArray(secuencias) || !secuencias.length) {
          return res.status(400).json({ ok: false, error: 'Envia un array de secuencias [{tipo, rnc_emisor, correlativo_inicial, fecha_vencimiento}].' });
        }
        for (const seq of secuencias) {
          await inicializarSecuencia(seq.tipo, seq.rnc_emisor, negocioId, db, {
            correlativoInicial: seq.correlativo_inicial || 1,
            fechaVencimiento: seq.fecha_vencimiento || null,
          });
        }
        const updated = await obtenerSecuencias(negocioId, db);
        return res.json({ ok: true, secuencias: updated });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /secuencias — Get current sequences
  router.get('/secuencias', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const secuencias = await obtenerSecuencias(negocioId, db);
        return res.json({ ok: true, secuencias });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // POST /preparar-pedido — Create/mark a pedido for e-CF emission
  router.post('/preparar-pedido', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const { pedido_id, ecf_tipo } = req.body || {};
        if (!pedido_id) return res.status(400).json({ ok: false, error: 'pedido_id requerido.' });
        const tipoEcf = ecf_tipo || null;
        if (tipoEcf && !ecfTipoNumerico(tipoEcf)) {
          return res.status(400).json({ ok: false, error: `Tipo e-CF '${tipoEcf}' no valido.` });
        }
        const pedido = await db.get('SELECT id, ecf_estado FROM pedidos WHERE id = ? AND negocio_id = ?', [pedido_id, negocioId]);
        if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
        if (pedido.ecf_estado === 'ACEPTADO') {
          return res.status(400).json({ ok: false, error: 'Este pedido ya tiene e-CF aceptado.' });
        }
        await actualizarPedidoEcf(pedido_id, {
          ecf_tipo: tipoEcf,
          ecf_estado: 'PENDIENTE',
        });
        return res.json({ ok: true, message: `Pedido ${pedido_id} marcado para emision e-CF tipo ${tipoEcf}.` });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // POST /test-auth — Test DGII authentication
  router.post('/test-auth', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const config = await configManager.loadConfig(negocioId);
        if (!config) return res.status(400).json({ ok: false, error: 'Configura DGII primero.' });
        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        const token = await configManager.resolveToken({ config, configRow, negocioId });
        return res.json({ ok: true, message: 'Autenticacion DGII exitosa.', tokenPreview: token.slice(0, 20) + '...' });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  return { router, emitirEcfParaPedido };
};

module.exports = { createDgiiEcfRouter };
