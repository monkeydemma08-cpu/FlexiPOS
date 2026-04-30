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
  resolveEmisorIdentidad,
  buildQrUrlNormalizado,
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
  buildEcfPayloadDirecto,
  determineEcfFlujo,
} = require('./dgii-ecf.mapper');
const {
  buildQrUrl,
  generateQrDataUrl,
  buildRepresentacionImpresa,
  detectarAmbiente,
  extractFechaFirmaFromXml,
  extractFechaEmisionFromXml,
  extractTotalesFromXml,
  extractItemsFromXml,
} = require('./dgii-ri');

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
    // Inyectar razon_social/nombre_comercial del row (configManager solo decifra credenciales)
    if (configRow.razon_social && !config.razon_social) config.razon_social = configRow.razon_social;
    if (configRow.nombre_comercial && !config.nombre_comercial) config.nombre_comercial = configRow.nombre_comercial;

    // Resolver identidad emisor — garantiza que RazonSocial coincida con lo que
    // DGII tiene registrado para el RNC (consulta dgii_rnc_cache si hace falta).
    const emisorIdentidad = await resolveEmisorIdentidad({ negocio, configDgii: config, db });
    const rncEmisor = emisorIdentidad.rnc;
    if (!rncEmisor) throw new Error('No hay RNC del emisor configurado (negocios.rnc o dgii_paso2_config.rnc_emisor).');
    if (!emisorIdentidad.razonSocial) throw new Error('No hay Razon Social del emisor configurada (negocios.razon_social o dgii_paso2_config.razon_social).');

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
        emisorIdentidad,
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
        emisorIdentidad,
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

    // Compute CodigoSeguridad y QR URL para Representacion Impresa
    const sigValue = extractSignatureValueFromXml(firmado.xml);
    const codigoSeguridad = computeCodigoSeguridadeCF(sigValue);
    const ambiente = detectarAmbiente(config.endpoints?.recepcion || DGII_DEFAULT_ENDPOINTS.recepcion);
    const fechaFirma = extractFechaFirmaFromXml(firmado.xml);
    const qrUrl = buildQrUrlNormalizado({
      ambiente,
      flujo,
      rncEmisor,
      rncComprador: payload.RNCComprador || null,
      encf: encfData.encf,
      fechaEmision: payload.FechaEmision,
      montoTotal: payload.MontoTotal,
      fechaFirma,
      codigoSeguridad,
    });

    await actualizarPedidoEcf(pedidoId, {
      ecf_xml_generado: xmlGenerado,
      ecf_xml_firmado: firmado.xml,
      ecf_codigo_seguridad: codigoSeguridad,
      ecf_qr_url: qrUrl,
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

    // Build RFCE — pasar ecfPayload para que herede los totales ya derivados de items
    // (garantiza coherencia entre el ECF firmado y el RFCE que se envia a DGII)
    const rfcePayload = buildResumenFcPayload({
      pedido: { ...pedido, ecf_tipo: encfData.encf.slice(0, 3) },
      cliente,
      negocio,
      encfData,
      configDgii: config,
      codigoSeguridadeCF: codigoSeguridad,
      ecfPayload: payload,
    });

    const rfceXml = buildResumenFcXml({
      payload: rfcePayload,
      rncEmisorFallback: rncEmisor,
      codigoSeguridadeCF: codigoSeguridad,
    });

    const rfceFirmado = signEcfXml({ xml: rfceXml, config });

    // Persistimos el RFCE firmado para que el admin pueda descargarlo despues
    // (necesario para validar manualmente el flujo completo en el portal DGII).
    await actualizarPedidoEcf(pedidoId, { ecf_xml_rfce_firmado: rfceFirmado.xml });

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

  // ---------------------------------------------------------------------------
  // External documents (compras, gastos, notas, especiales)
  // ---------------------------------------------------------------------------

  const registrarIntentoExterno = async ({ documentoId, tipoEnvio, endpoint, responseStatus, responseBody, resultado, codigo, mensaje, trackId }) => {
    if (!documentoId) return;
    try {
      const doc = await db.get('SELECT intentos_log, ecf_intentos FROM ecf_documentos_externos WHERE id = ?', [documentoId]);
      let log = [];
      try { log = doc?.intentos_log ? JSON.parse(doc.intentos_log) : []; } catch (_) { log = []; }
      log.push({
        ts: new Date().toISOString(),
        tipo_envio: tipoEnvio,
        endpoint: endpoint || null,
        response_status: responseStatus || null,
        resultado: resultado || 'ERROR',
        codigo: codigo || null,
        mensaje: mensaje || null,
        track_id: trackId || null,
        response_body: responseBody ? String(responseBody).slice(0, 4000) : null,
      });
      // Limitar a ultimos 30 intentos
      if (log.length > 30) log = log.slice(-30);
      await db.run(
        'UPDATE ecf_documentos_externos SET intentos_log = ?, ecf_intentos = ?, ecf_ultimo_intento_at = ? WHERE id = ?',
        [JSON.stringify(log), (doc?.ecf_intentos || 0) + 1, new Date().toISOString().slice(0, 19).replace('T', ' '), documentoId]
      );
    } catch (err) {
      console.error('Error registrando intento externo e-CF:', err.message);
    }
  };

  const actualizarDocumentoExterno = async (documentoId, fields) => {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (!sets.length) return;
    params.push(documentoId);
    await db.run(`UPDATE ecf_documentos_externos SET ${sets.join(', ')} WHERE id = ?`, params);
  };

  const emitirEcfDocumentoExterno = async ({
    negocioId,
    modulo,
    referenciaExterna,
    ecfTipo,
    emisor = {},
    comprador = {},
    items = [],
    totales = {},
    fechaEmision = null,
    pagos = {},
    referenciaEncf = null,
    referenciaFecha = null,
    codigoModificacion = null,
  }) => {
    if (!negocioId || !modulo || !ecfTipo) {
      throw new Error('emitirEcfDocumentoExterno requiere negocioId, modulo y ecfTipo.');
    }
    const tipoNum = ecfTipoNumerico(ecfTipo);
    if (!tipoNum) throw new Error(`Tipo e-CF '${ecfTipo}' no valido.`);

    // Cargar config DGII
    const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
    if (!configRow) throw new Error('Configura las credenciales DGII antes de emitir e-CF.');
    const config = await configManager.loadConfig(negocioId);
    const negocio = await db.get('SELECT * FROM negocios WHERE id = ?', [negocioId]);
    const rncEmisor = emisor.rnc || config.rnc_emisor || negocio?.rnc || '';
    const emisorFinal = {
      rnc: rncEmisor,
      nombre: emisor.nombre || negocio?.nombre || '',
      direccion: emisor.direccion || negocio?.direccion || null,
      telefono: emisor.telefono || negocio?.telefono || null,
    };

    // Crear registro inicial en ecf_documentos_externos
    const insertResult = await db.run(
      `INSERT INTO ecf_documentos_externos
       (negocio_id, modulo, referencia_externa, ecf_tipo, ecf_estado, cliente_documento, cliente_nombre, monto_total, ecf_intentos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        negocioId,
        modulo,
        referenciaExterna ? String(referenciaExterna) : null,
        tipoNum,
        'PROCESANDO',
        comprador.documento || null,
        comprador.nombre || null,
        Number(totales.total || 0),
      ]
    );
    const documentoId = insertResult.lastID || insertResult.insertId;

    try {
      // Generar eNCF
      const encfData = await generarEncf(`E${tipoNum}`, negocioId, db);

      // Construir payload
      const payload = buildEcfPayloadDirecto({
        ecfTipo: `E${tipoNum}`,
        emisor: emisorFinal,
        comprador,
        items,
        totales,
        fechaEmision,
        pagos,
        encfData,
        configDgii: config,
        referenciaEncf,
        referenciaFecha,
        codigoModificacion,
      });

      // Build XML
      const tiposConFVS = ['31', '33', '41', '43', '44', '45', '46', '47'];
      const xmlGenerado = buildEcfXml({
        payload,
        rncEmisorFallback: rncEmisor,
        fechaVencimientoSecuenciaFallback: tiposConFVS.includes(tipoNum) ? (encfData.fechaVencimiento || null) : null,
      });
      const firmado = signEcfXml({ xml: xmlGenerado, config });

      const flujo = determineEcfFlujo(`E${tipoNum}`, totales.total || 0);
      const endpoints = config.endpoints || DGII_DEFAULT_ENDPOINTS;

      // Compute CodigoSeguridad y QR URL para Representacion Impresa
      const sigValueExt = extractSignatureValueFromXml(firmado.xml);
      const codigoSeguridadExt = computeCodigoSeguridadeCF(sigValueExt);
      const ambienteExt = detectarAmbiente(endpoints.recepcion || '');
      const fechaFirmaExt = extractFechaFirmaFromXml(firmado.xml);
      const qrUrlExt = buildQrUrlNormalizado({
        ambiente: ambienteExt,
        flujo,
        rncEmisor,
        rncComprador: payload.RNCComprador || null,
        encf: encfData.encf,
        fechaEmision: payload.FechaEmision,
        montoTotal: payload.MontoTotal,
        fechaFirma: fechaFirmaExt,
        codigoSeguridad: codigoSeguridadExt,
      });

      await actualizarDocumentoExterno(documentoId, {
        ecf_encf: encfData.encf,
        ecf_xml_generado: xmlGenerado,
        ecf_xml_firmado: firmado.xml,
        payload_emision: JSON.stringify(payload),
        ecf_codigo_seguridad: codigoSeguridadExt,
        ecf_qr_url: qrUrlExt,
      });

      const token = await configManager.resolveToken({ config, configRow, negocioId });

      // FC < 250k flow (E32) — reutiliza codigoSeguridadExt ya computado arriba
      if (flujo === 'FC_MENOR_250K') {
        const codigoSeguridad = codigoSeguridadExt;

        const rfcePayload = buildResumenFcPayload({
          pedido: { ecf_tipo: tipoNum, total: totales.total || 0, fecha_factura: fechaEmision || null },
          cliente: comprador,
          negocio: emisorFinal,
          encfData,
          configDgii: config,
          codigoSeguridadeCF: codigoSeguridad,
          ecfPayload: payload,
        });
        const rfceXml = buildResumenFcXml({ payload: rfcePayload, rncEmisorFallback: rncEmisor, codigoSeguridadeCF: codigoSeguridad });
        const rfceFirmado = signEcfXml({ xml: rfceXml, config });
        const envio = await sendXmlToDgii({
          endpoint: endpoints.recepcionFc,
          apiPath: '/api/recepcion/ecf',
          xmlPayload: rfceFirmado.xml,
          token,
          fileName: buildDgiiXmlFileName({ rncEmisor, encf: encfData.encf, fallback: 'rfce.xml' }),
        });
        await registrarIntentoExterno({
          documentoId,
          tipoEnvio: 'RESUMEN_FC',
          endpoint: envio.endpoint,
          responseStatus: envio.status,
          responseBody: envio.raw,
          resultado: envio.extracted?.accepted ? 'ACEPTADO' : envio.extracted?.rejected ? 'RECHAZADO' : 'ENVIADO',
          codigo: envio.extracted?.code,
          mensaje: envio.extracted?.message,
          trackId: envio.extracted?.trackId,
        });

        const estadoFinal = envio.extracted?.accepted ? 'ACEPTADO' : envio.extracted?.rejected ? 'RECHAZADO' : 'ENVIADO';
        await actualizarDocumentoExterno(documentoId, {
          ecf_estado: estadoFinal,
          ecf_codigo_dgii: envio.extracted?.code || null,
          ecf_mensaje_dgii: envio.extracted?.message || null,
        });
        return { ok: estadoFinal !== 'RECHAZADO', documentoId, encf: encfData.encf, estado: estadoFinal, mensaje: envio.extracted?.message };
      }

      // ECF normal flow
      const envio = await sendXmlToDgii({
        endpoint: endpoints.recepcion,
        apiPath: '/api/FacturasElectronicas',
        xmlPayload: firmado.xml,
        token,
        fileName: buildDgiiXmlFileName({ rncEmisor, encf: encfData.encf }),
      });
      await registrarIntentoExterno({
        documentoId,
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
        if (/secuencia.*utiliza/i.test(mensaje)) {
          await avanzarSecuenciaTrasDuplicado(`E${tipoNum}`, negocioId, db);
        }
        await actualizarDocumentoExterno(documentoId, {
          ecf_estado: 'RECHAZADO',
          ecf_codigo_dgii: envio.extracted?.code || null,
          ecf_mensaje_dgii: mensaje,
        });
        return { ok: false, documentoId, encf: encfData.encf, estado: 'RECHAZADO', mensaje };
      }

      const trackId = envio.extracted?.trackId;
      let estadoFinal = 'ENVIADO';
      let codigoDgii = envio.extracted?.code || null;
      let mensajeDgii = envio.extracted?.message || null;

      if (trackId) {
        await actualizarDocumentoExterno(documentoId, { ecf_track_id: trackId });
        const consulta = await consultDgiiResultUntilSettled(
          { endpoint: endpoints.consultaResultado, token, trackId, encf: encfData.encf, rncEmisor },
          { maxAttempts: 5, delayMs: 1500 }
        );
        await registrarIntentoExterno({
          documentoId,
          tipoEnvio: 'CONSULTA',
          endpoint: consulta.endpoint,
          responseStatus: consulta.status,
          responseBody: consulta.raw,
          resultado: consulta.extracted?.accepted ? 'ACEPTADO' : consulta.extracted?.rejected ? 'RECHAZADO' : 'PENDIENTE',
          codigo: consulta.extracted?.code,
          mensaje: consulta.extracted?.message,
          trackId,
        });
        if (consulta.extracted?.accepted) estadoFinal = 'ACEPTADO';
        else if (consulta.extracted?.rejected) estadoFinal = 'RECHAZADO';
        codigoDgii = consulta.extracted?.code || codigoDgii;
        mensajeDgii = consulta.extracted?.message || mensajeDgii;
      } else if (envio.extracted?.accepted) {
        estadoFinal = 'ACEPTADO';
      }

      await actualizarDocumentoExterno(documentoId, {
        ecf_estado: estadoFinal,
        ecf_codigo_dgii: codigoDgii,
        ecf_mensaje_dgii: mensajeDgii,
      });
      return { ok: estadoFinal !== 'RECHAZADO', documentoId, encf: encfData.encf, estado: estadoFinal, mensaje: mensajeDgii, trackId };
    } catch (err) {
      await actualizarDocumentoExterno(documentoId, {
        ecf_estado: 'ERROR',
        ecf_mensaje_dgii: err.message || 'Error inesperado',
      });
      throw err;
    }
  };

  // ===========================================================================
  // Routes
  // ===========================================================================

  // POST /emitir-documento — Emit e-CF for external module (compras/gastos/notas/especiales)
  router.post('/emitir-documento', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const body = req.body || {};
        if (!body.modulo || !body.ecf_tipo) {
          return res.status(400).json({ ok: false, error: 'modulo y ecf_tipo son requeridos.' });
        }
        const result = await emitirEcfDocumentoExterno({
          negocioId,
          modulo: body.modulo,
          referenciaExterna: body.referencia_externa || null,
          ecfTipo: body.ecf_tipo,
          emisor: body.emisor || {},
          comprador: body.comprador || {},
          items: Array.isArray(body.items) ? body.items : [],
          totales: body.totales || {},
          fechaEmision: body.fecha_emision || null,
          pagos: body.pagos || {},
          referenciaEncf: body.referencia_encf || null,
          referenciaFecha: body.referencia_fecha || null,
          codigoModificacion: body.codigo_modificacion || null,
        });
        return res.json({ ok: result.ok, ...result });
      } catch (error) {
        console.error('Error emitiendo e-CF documento externo:', error);
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /documentos-externos — List external e-CF documents
  // Si modulo=notas, tambien incluye E33/E34 emitidas desde pedidos (flujo POS).
  router.get('/documentos-externos', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const { modulo, estado, limit = 100 } = req.query || {};
        // LIMIT se interpola como entero (mysql2 con execute() no acepta LIMIT ? como parametro).
        const lim = Math.max(1, Math.min(1000, Number(limit) || 100));
        const conditions = ['negocio_id = ?'];
        const params = [negocioId];
        if (modulo) { conditions.push('modulo = ?'); params.push(modulo); }
        if (estado) { conditions.push('ecf_estado = ?'); params.push(estado); }
        const docs = await db.all(
          `SELECT id, modulo, referencia_externa, ecf_tipo, ecf_encf, ecf_estado, ecf_track_id,
                  ecf_codigo_dgii, ecf_mensaje_dgii, ecf_codigo_seguridad, cliente_documento,
                  cliente_nombre, monto_total, ecf_intentos, ecf_ultimo_intento_at, created_at, updated_at
           FROM ecf_documentos_externos
           WHERE ${conditions.join(' AND ')}
           ORDER BY created_at DESC LIMIT ${lim}`,
          params
        );
        // Para modulo=notas, anexar tambien las E33/E34 emitidas desde pedidos POS.
        if (modulo === 'notas') {
          const pedidoConds = ['negocio_id = ?', "ecf_tipo IN ('E33','E34')", 'ecf_encf IS NOT NULL'];
          const pedidoParams = [negocioId];
          if (estado) { pedidoConds.push('ecf_estado = ?'); pedidoParams.push(estado); }
          const pedidoNotas = await db.all(
            `SELECT id, 'notas' AS modulo,
                    CAST(id AS CHAR) AS referencia_externa,
                    REPLACE(ecf_tipo, 'E', '') AS ecf_tipo,
                    ecf_encf, ecf_estado, ecf_track_id,
                    ecf_codigo_dgii, ecf_mensaje_dgii, ecf_codigo_seguridad,
                    cliente_documento, cliente AS cliente_nombre,
                    total AS monto_total,
                    ecf_intentos, ecf_ultimo_intento_at,
                    fecha_factura AS created_at, ecf_ultimo_intento_at AS updated_at,
                    'pedido' AS origen
               FROM pedidos
              WHERE ${pedidoConds.join(' AND ')}
              ORDER BY id DESC LIMIT ${lim}`,
            pedidoParams
          );
          // Marcar tambien las externas con origen para que el frontend pueda diferenciar
          docs.forEach((d) => { d.origen = 'externo'; });
          // Unir y ordenar por created_at desc
          const todos = [...docs, ...pedidoNotas].sort((a, b) => {
            const ta = new Date(a.created_at || 0).getTime();
            const tb = new Date(b.created_at || 0).getTime();
            return tb - ta;
          }).slice(0, lim);
          return res.json({ ok: true, documentos: todos });
        }
        return res.json({ ok: true, documentos: docs });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /documentos-externos/:id — Get single external document detail
  router.get('/documentos-externos/:id', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const docId = Number(req.params.id);
        const doc = await db.get(
          'SELECT * FROM ecf_documentos_externos WHERE id = ? AND negocio_id = ?',
          [docId, negocioId]
        );
        if (!doc) return res.status(404).json({ ok: false, error: 'No encontrado' });
        let intentos = [];
        try { intentos = doc.intentos_log ? JSON.parse(doc.intentos_log) : []; } catch (_) {}
        return res.json({ ok: true, documento: doc, intentos });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

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

  // GET /emitidos — Lista TODOS los pedidos con e-CF (incluye ACEPTADOS) para ver RI
  router.get('/emitidos', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const estadoFiltro = (req.query.estado || '').toString().toUpperCase().trim();
        const limit = Math.min(Number(req.query.limit) || 200, 1000);
        let where = 'negocio_id = ? AND ecf_tipo IS NOT NULL';
        const params = [negocioId];
        if (estadoFiltro) {
          where += ' AND ecf_estado = ?';
          params.push(estadoFiltro);
        }
        const rows = await db.all(
          `SELECT id, cliente, tipo_comprobante, ncf, total, ecf_tipo, ecf_encf, ecf_estado, ecf_codigo_dgii, ecf_mensaje_dgii, ecf_codigo_seguridad, ecf_qr_url, ecf_track_id, ecf_intentos, ecf_ultimo_intento_at, fecha_factura,
            (ecf_xml_rfce_firmado IS NOT NULL) AS tiene_rfce
           FROM pedidos
           WHERE ${where}
           ORDER BY id DESC
           LIMIT ${limit}`,
          params
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

  // GET /xml/:pedidoId — Descarga XML generado o firmado de un pedido
  router.get('/xml/:pedidoId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        const wantFirmado = req.query.firmado === '1' || req.query.firmado === 'true';
        const row = await db.get(
          'SELECT id, ecf_encf, ecf_xml_generado, ecf_xml_firmado FROM pedidos WHERE id = ? AND negocio_id = ?',
          [pedidoId, negocioId]
        );
        if (!row) return res.status(404).send('Pedido no encontrado');
        const xml = wantFirmado ? row.ecf_xml_firmado : (row.ecf_xml_firmado || row.ecf_xml_generado);
        if (!xml) return res.status(404).send('Sin XML disponible');
        const filename = `${row.ecf_encf || ('pedido_' + pedidoId)}${wantFirmado ? '_firmado' : ''}.xml`;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(xml);
      } catch (error) {
        return res.status(500).send(`Error: ${error.message}`);
      }
    })
  );

  // GET /xml-externo/:docId — Descarga XML de un documento externo
  router.get('/xml-externo/:docId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const docId = Number(req.params.docId);
        const wantFirmado = req.query.firmado === '1' || req.query.firmado === 'true';
        const row = await db.get(
          'SELECT id, ecf_encf, ecf_xml_generado, ecf_xml_firmado FROM ecf_documentos_externos WHERE id = ? AND negocio_id = ?',
          [docId, negocioId]
        );
        if (!row) return res.status(404).send('Documento no encontrado');
        const xml = wantFirmado ? row.ecf_xml_firmado : (row.ecf_xml_firmado || row.ecf_xml_generado);
        if (!xml) return res.status(404).send('Sin XML disponible');
        const filename = `${row.ecf_encf || ('doc_' + docId)}${wantFirmado ? '_firmado' : ''}.xml`;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(xml);
      } catch (error) {
        return res.status(500).send(`Error: ${error.message}`);
      }
    })
  );

  // GET /lookup-encf?encf=E310000000001 — Buscar el comprobante origen por eNCF
  // para auto-completar el formulario de Notas (E33/E34): cliente, items, totales,
  // fecha de emision. Busca primero en `pedidos` (POS) y luego en
  // `ecf_documentos_externos` (compras/gastos/notas/especiales).
  router.get('/lookup-encf', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const encf = String(req.query.encf || '').trim().toUpperCase();
        if (!/^E\d{12}$/.test(encf)) {
          return res.status(400).json({ ok: false, error: 'eNCF invalido. Formato esperado: E + 12 digitos.' });
        }

        // 1) Buscar en pedidos (POS)
        const pedido = await db.get(
          `SELECT id, ecf_tipo, ecf_encf, ecf_estado, fecha_factura, cliente, cliente_documento,
                  subtotal, impuesto, descuento_monto, total, tipo_comprobante
           FROM pedidos
           WHERE ecf_encf = ? AND negocio_id = ? LIMIT 1`,
          [encf, negocioId]
        );
        if (pedido) {
          const detalle = await db.all(
            `SELECT dp.cantidad, dp.precio_unitario, dp.descuento_monto, p.nombre
             FROM detalle_pedido dp
             LEFT JOIN productos p ON p.id = dp.producto_id
             WHERE dp.pedido_id = ? AND dp.negocio_id = ?
             ORDER BY dp.id ASC`,
            [pedido.id, negocioId]
          );
          let cliente = null;
          if (pedido.cliente_documento) {
            cliente = await db.get(
              'SELECT documento, nombre, direccion, telefono, email FROM clientes WHERE documento = ? AND negocio_id = ? LIMIT 1',
              [pedido.cliente_documento, negocioId]
            );
          }
          return res.json({
            ok: true,
            origen: 'pedido',
            encf,
            ecf_tipo: pedido.ecf_tipo || null,
            estado: pedido.ecf_estado || null,
            fecha_emision: pedido.fecha_factura || null,
            cliente: {
              documento: cliente?.documento || pedido.cliente_documento || '',
              nombre: cliente?.nombre || pedido.cliente || '',
              direccion: cliente?.direccion || '',
              telefono: cliente?.telefono || '',
              correo: cliente?.email || '',
            },
            items: (detalle || []).map((d) => {
              const cant = Number(d.cantidad || 0);
              const pu = Number(d.precio_unitario || 0);
              const desc = Number(d.descuento_monto || 0);
              return {
                nombre: d.nombre || 'Item',
                cantidad: cant,
                precio_unitario: pu,
                monto: Math.max(0, cant * pu - desc),
              };
            }),
            totales: {
              subtotal: Number(pedido.subtotal || 0),
              impuesto: Number(pedido.impuesto || 0),
              descuento: Number(pedido.descuento_monto || 0),
              total: Number(pedido.total || 0),
            },
          });
        }

        // 2) Buscar en documentos externos
        const externo = await db.get(
          `SELECT id, ecf_tipo, ecf_encf, ecf_estado, cliente_documento, cliente_nombre,
                  monto_total, payload_emision, created_at
           FROM ecf_documentos_externos
           WHERE ecf_encf = ? AND negocio_id = ? LIMIT 1`,
          [encf, negocioId]
        );
        if (externo) {
          let payload = {};
          try { payload = externo.payload_emision ? JSON.parse(externo.payload_emision) : {}; } catch (_) { payload = {}; }
          const items = Array.isArray(payload.items) ? payload.items : [];
          const totales = payload.totales || {};
          const comprador = payload.comprador || {};
          return res.json({
            ok: true,
            origen: 'externo',
            encf,
            ecf_tipo: externo.ecf_tipo ? `E${externo.ecf_tipo}` : null,
            estado: externo.ecf_estado || null,
            fecha_emision: payload.fecha_emision || (externo.created_at ? String(externo.created_at).slice(0, 10) : null),
            cliente: {
              documento: comprador.documento || externo.cliente_documento || '',
              nombre: comprador.nombre || externo.cliente_nombre || '',
              direccion: comprador.direccion || '',
              telefono: comprador.telefono || '',
              correo: comprador.correo || '',
            },
            items: items.map((it) => ({
              nombre: it.nombre || 'Item',
              cantidad: Number(it.cantidad || 0),
              precio_unitario: Number(it.precio_unitario || 0),
              monto: Number(it.monto || (Number(it.cantidad || 0) * Number(it.precio_unitario || 0))),
            })),
            totales: {
              subtotal: Number(totales.subtotal || 0),
              impuesto: Number(totales.impuesto || 0),
              descuento: Number(totales.descuento || 0),
              total: Number(totales.total || externo.monto_total || 0),
            },
          });
        }

        return res.status(404).json({ ok: false, error: `No se encontro ningun comprobante con eNCF ${encf}.` });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    })
  );

  // GET /xml-rfce/:pedidoId — Descarga el RFCE firmado para E32<250k
  // El RFCE (Resumen de Factura de Consumo Electronica) es obligatorio para
  // que la DGII reconozca el flujo completo cuando se valida manualmente desde
  // el portal de pruebas.
  router.get('/xml-rfce/:pedidoId', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        const row = await db.get(
          'SELECT id, ecf_encf, ecf_xml_rfce_firmado FROM pedidos WHERE id = ? AND negocio_id = ?',
          [pedidoId, negocioId]
        );
        if (!row) return res.status(404).send('Pedido no encontrado');
        if (!row.ecf_xml_rfce_firmado) {
          return res.status(404).send('Sin RFCE disponible (solo aplica a E32 menor a 250,000)');
        }
        const filename = `${row.ecf_encf || ('pedido_' + pedidoId)}_RFCE.xml`;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(row.ecf_xml_rfce_firmado);
      } catch (error) {
        return res.status(500).send(`Error: ${error.message}`);
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

  // GET /representacion/:pedidoId — Representacion Impresa (HTML imprimible) de un pedido
  router.get('/representacion/:pedidoId', (req, res) =>
    requireUsuarioSesion(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const pedidoId = Number(req.params.pedidoId);
        if (!pedidoId) return res.status(400).send('ID de pedido invalido.');

        const data = await loadPedidoCompleto(pedidoId, negocioId);
        if (!data) return res.status(404).send('Pedido no encontrado.');
        const { pedido, detalle, cliente, negocio } = data;

        if (!pedido.ecf_encf) {
          return res.status(400).send('Este pedido no tiene e-CF emitido.');
        }

        // Bloquear RI si el e-CF no fue ACEPTADO por DGII (a menos que se pase ?force=1).
        // Si se imprime sin aceptacion, el QR apunta a una factura que la DGII NO podra
        // encontrar en su sistema, devolviendo "No fue encontrada la Factura (e-CF)".
        const force = String(req.query?.force || '') === '1';
        const estado = String(pedido.ecf_estado || '').toUpperCase();
        if (estado !== 'ACEPTADO' && !force) {
          return res.status(409).send(
            `<h2>e-CF no aceptado por DGII</h2>` +
            `<p>Estado actual: <strong>${estado || 'DESCONOCIDO'}</strong></p>` +
            `<p>El portal DGII solo encuentra el e-CF cuando esta aceptado. ` +
            `Reintenta la emision o consulta el resultado antes de imprimir la RI.</p>` +
            `<p>Si necesitas la RI igual (debug), agrega <code>?force=1</code> a la URL.</p>`
          );
        }

        const config = await configManager.loadConfig(negocioId);
        // Inyectar razon_social del row para que el resolver la use
        const configRow = await db.get('SELECT razon_social, nombre_comercial FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (configRow?.razon_social && !config.razon_social) config.razon_social = configRow.razon_social;
        if (configRow?.nombre_comercial && !config.nombre_comercial) config.nombre_comercial = configRow.nombre_comercial;
        const emisorIdentidadRI = await resolveEmisorIdentidad({ negocio, configDgii: config, db });
        const flujo = determineEcfFlujo(pedido.ecf_tipo, pedido.total);
        const ambiente = detectarAmbiente(config?.endpoints?.recepcion || DGII_DEFAULT_ENDPOINTS.recepcion);

        // CRITICO: Para que el QR resuelva en el portal DGII, los totales y la
        // URL del QR DEBEN coincidir EXACTAMENTE con lo que se envio originalmente
        // a DGII. Si el pedido fue editado despues de emitir, los datos actuales
        // ya no concuerdan. Por eso preferimos extraer del XML firmado guardado
        // y usar el ecf_qr_url tal cual quedo al emitir.
        const xmlFirmado = pedido.ecf_xml_firmado || '';
        const totalesXml = xmlFirmado ? extractTotalesFromXml(xmlFirmado) : null;
        const itemsXml = xmlFirmado ? extractItemsFromXml(xmlFirmado) : [];

        // Items: preferir los del XML firmado; fallback al detalle actual.
        const itemsRender = itemsXml.length ? itemsXml : (detalle || []).map((d, i) => ({
          linea: String(i + 1),
          nombre: d.nombre_producto || d.nombre || `Item ${i + 1}`,
          cantidad: String(d.cantidad || 1),
          unidadMedida: '',
          precioUnitario: Number(d.precio_unitario || 0).toFixed(2),
          descuento: d.descuento_monto > 0 ? Number(d.descuento_monto).toFixed(2) : null,
          montoItem: (Number(d.cantidad || 1) * Number(d.precio_unitario || 0) - Number(d.descuento_monto || 0)).toFixed(2),
          indicadorFact: '',
        }));

        // Totales: preferir los del XML firmado; fallback al pedido actual.
        const totales = totalesXml && totalesXml.MontoTotal ? totalesXml : {
          MontoGravadoI1: pedido.impuesto > 0 ? Number(pedido.subtotal || 0).toFixed(2) : null,
          TotalITBIS1: pedido.impuesto > 0 ? Number(pedido.impuesto || 0).toFixed(2) : null,
          TotalITBIS: Number(pedido.impuesto || 0).toFixed(2),
          MontoExento: pedido.impuesto > 0 ? null : Number(pedido.subtotal || 0).toFixed(2),
          MontoTotal: Number(pedido.total || 0).toFixed(2),
        };

        const fechaFirma = xmlFirmado ? extractFechaFirmaFromXml(xmlFirmado) : null;
        const fechaVencimiento = await obtenerFechaVencimiento(pedido.ecf_tipo, negocioId, db).catch(() => null);

        // FechaEmision: preferir la del XML firmado (la que DGII tiene).
        const fechaEmisionDgii = (xmlFirmado ? extractFechaEmisionFromXml(xmlFirmado) : null) || (() => {
          const f = pedido.fecha_factura ? new Date(pedido.fecha_factura) : new Date();
          if (Number.isNaN(f.getTime())) return '';
          return `${String(f.getDate()).padStart(2, '0')}-${String(f.getMonth() + 1).padStart(2, '0')}-${f.getFullYear()}`;
        })();

        const { html } = await buildRepresentacionImpresa({
          payload: {},
          encf: pedido.ecf_encf,
          ecfTipo: pedido.ecf_tipo,
          emisor: {
            rnc: emisorIdentidadRI.rnc || config?.rnc_emisor || negocio?.rnc || '',
            nombre: emisorIdentidadRI.razonSocial || negocio?.nombre || '',
            nombreComercial: emisorIdentidadRI.nombreComercial || '',
            direccion: negocio?.direccion || '',
            telefono: negocio?.telefono || '',
          },
          comprador: cliente ? {
            documento: cliente.documento || pedido.cliente_documento || '',
            nombre: cliente.nombre || pedido.cliente || '',
            direccion: cliente.direccion || '',
            email: cliente.email || '',
          } : { nombre: pedido.cliente || '' },
          fechaEmision: fechaEmisionDgii,
          fechaVencimiento: fechaVencimiento || '',
          fechaFirma: fechaFirma || '',
          codigoSeguridad: pedido.ecf_codigo_seguridad || '',
          totales,
          items: itemsRender,
          trackId: pedido.ecf_track_id || '',
          estado: pedido.ecf_estado || '',
          flujo,
          ambiente,
          // CRITICO: pasar la URL exacta que se guardo al emitir, para que el
          // QR apunte al timbre que DGII tiene registrado (mismo MontoTotal,
          // misma fecha, mismo CodigoSeguridad).
          qrUrlOverride: pedido.ecf_qr_url || null,
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch (error) {
        console.error('Error generando RI pedido:', error.message);
        return res.status(500).send('Error generando Representacion Impresa: ' + error.message);
      }
    })
  );

  // GET /representacion-externo/:docId — Representacion Impresa de un documento externo (compras/gastos/notas/especiales)
  router.get('/representacion-externo/:docId', (req, res) =>
    requireUsuarioSesion(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);
        const docId = Number(req.params.docId);
        if (!docId) return res.status(400).send('ID de documento invalido.');

        const doc = await db.get(
          'SELECT * FROM ecf_documentos_externos WHERE id = ? AND negocio_id = ?',
          [docId, negocioId]
        );
        if (!doc) return res.status(404).send('Documento no encontrado.');
        if (!doc.ecf_encf) return res.status(400).send('Este documento no tiene e-CF emitido.');

        // Bloquear RI si el e-CF no fue ACEPTADO por DGII (ver explicacion en /representacion).
        const force = String(req.query?.force || '') === '1';
        const estado = String(doc.ecf_estado || '').toUpperCase();
        if (estado !== 'ACEPTADO' && !force) {
          return res.status(409).send(
            `<h2>e-CF no aceptado por DGII</h2>` +
            `<p>Estado actual: <strong>${estado || 'DESCONOCIDO'}</strong></p>` +
            `<p>El portal DGII no encuentra el e-CF hasta que esta aceptado. ` +
            `Reintenta la emision antes de imprimir la RI. Para forzar agrega <code>?force=1</code>.</p>`
          );
        }

        let payload = {};
        try { payload = doc.payload_emision ? JSON.parse(doc.payload_emision) : {}; } catch (_) { payload = {}; }

        const config = await configManager.loadConfig(negocioId);
        const configRow = await db.get('SELECT razon_social, nombre_comercial FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (configRow?.razon_social && !config.razon_social) config.razon_social = configRow.razon_social;
        if (configRow?.nombre_comercial && !config.nombre_comercial) config.nombre_comercial = configRow.nombre_comercial;
        const flujoCalc = determineEcfFlujo(`E${doc.ecf_tipo}`, doc.monto_total || 0);
        const ambiente = detectarAmbiente(config?.endpoints?.recepcion || DGII_DEFAULT_ENDPOINTS.recepcion);
        const xmlFirmadoExt = doc.ecf_xml_firmado || '';
        const fechaFirma = xmlFirmadoExt ? extractFechaFirmaFromXml(xmlFirmadoExt) : null;
        const negocio = await db.get('SELECT * FROM negocios WHERE id = ?', [negocioId]);
        const emisorIdentidadExt = await resolveEmisorIdentidad({ negocio, configDgii: config, db });

        // Preferir totales/items/fecha del XML firmado (lo que DGII tiene),
        // ya que es la fuente de verdad y debe coincidir con el QR.
        const totalesXmlExt = xmlFirmadoExt ? extractTotalesFromXml(xmlFirmadoExt) : null;
        const itemsXmlExt = xmlFirmadoExt ? extractItemsFromXml(xmlFirmadoExt) : [];
        const fechaEmisionXmlExt = xmlFirmadoExt ? extractFechaEmisionFromXml(xmlFirmadoExt) : null;

        const { html } = await buildRepresentacionImpresa({
          payload,
          encf: doc.ecf_encf,
          ecfTipo: doc.ecf_tipo,
          emisor: {
            rnc: emisorIdentidadExt.rnc || payload.RNCEmisor || config?.rnc_emisor || negocio?.rnc || '',
            nombre: emisorIdentidadExt.razonSocial || payload.RazonSocialEmisor || negocio?.nombre || '',
            nombreComercial: emisorIdentidadExt.nombreComercial || '',
            direccion: payload.DireccionEmisor || negocio?.direccion || '',
            telefono: payload['TelefonoEmisor[0]'] || negocio?.telefono || '',
          },
          comprador: {
            documento: payload.RNCComprador || doc.cliente_documento || '',
            nombre: payload.RazonSocialComprador || doc.cliente_nombre || '',
            direccion: payload.DireccionComprador || '',
            email: payload.CorreoComprador || '',
          },
          fechaEmision: fechaEmisionXmlExt || payload.FechaEmision || '',
          fechaVencimiento: payload.FechaVencimientoSecuencia || '',
          fechaFirma: fechaFirma || '',
          codigoSeguridad: doc.ecf_codigo_seguridad || payload.CodigoSeguridadeCF || '',
          totales: (totalesXmlExt && totalesXmlExt.MontoTotal) ? totalesXmlExt : undefined,
          items: itemsXmlExt.length ? itemsXmlExt : undefined,
          trackId: doc.ecf_track_id || '',
          estado: doc.ecf_estado || '',
          flujo: flujoCalc,
          ambiente,
          // CRITICO: pasar la URL exacta guardada al emitir (la que DGII reconoce).
          qrUrlOverride: doc.ecf_qr_url || null,
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch (error) {
        console.error('Error generando RI doc externo:', error.message);
        return res.status(500).send('Error generando Representacion Impresa: ' + error.message);
      }
    })
  );

  // GET /paso5-candidatos — Lista las RI requeridas por la certificacion DGII Paso 5.
  // Devuelve, para cada slot (E31, E32 >=250k, E32 <250k, E33, E34, E41, E43, E44, E45,
  // E46, E47), el documento ACEPTADO mas reciente disponible (entre `pedidos` y
  // `ecf_documentos_externos`). El frontend usa el URL para abrir la RI con ?print=1
  // y permitirle al usuario guardarla como PDF.
  router.get('/paso5-candidatos', (req, res) =>
    ensureAdmin(req, res, async (usuario) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuario);

        const slots = [
          { slot: '31',         label: 'Tipo 31 - Factura Credito Fiscal',   ecfTipo: '31' },
          { slot: '32_GE_250K', label: 'Tipo 32 - Consumo >= RD$250k',       ecfTipo: '32', minTotal: 250000 },
          { slot: '32_LT_250K', label: 'Tipo 32 - Consumo < RD$250k',        ecfTipo: '32', maxTotal: 249999.99 },
          { slot: '33',         label: 'Tipo 33 - Nota de Debito',           ecfTipo: '33' },
          { slot: '34',         label: 'Tipo 34 - Nota de Credito',          ecfTipo: '34' },
          { slot: '41',         label: 'Tipo 41 - Compras',                  ecfTipo: '41' },
          { slot: '43',         label: 'Tipo 43 - Gastos Menores',           ecfTipo: '43' },
          { slot: '44',         label: 'Tipo 44 - Regimenes Especiales',     ecfTipo: '44' },
          { slot: '45',         label: 'Tipo 45 - Gubernamental',            ecfTipo: '45' },
          { slot: '46',         label: 'Tipo 46 - Exportaciones',            ecfTipo: '46' },
          { slot: '47',         label: 'Tipo 47 - Pagos al Exterior',        ecfTipo: '47' },
        ];

        const out = [];
        for (const s of slots) {
          // Buscar en pedidos (POS) - ACEPTADO mas reciente para este tipo
          const ecfTipoPedido = `E${s.ecfTipo}`;
          const condsPedido = ['negocio_id = ?', 'ecf_tipo = ?', "ecf_estado = 'ACEPTADO'", 'ecf_encf IS NOT NULL'];
          const paramsPedido = [negocioId, ecfTipoPedido];
          if (s.minTotal != null) { condsPedido.push('total >= ?'); paramsPedido.push(s.minTotal); }
          if (s.maxTotal != null) { condsPedido.push('total <= ?'); paramsPedido.push(s.maxTotal); }
          const pedido = await db.get(
            `SELECT id, ecf_encf, ecf_tipo, ecf_estado, total AS monto_total,
                    cliente AS cliente_nombre, fecha_factura AS created_at
               FROM pedidos
              WHERE ${condsPedido.join(' AND ')}
              ORDER BY id DESC LIMIT 1`,
            paramsPedido
          );

          // Buscar en ecf_documentos_externos
          const condsExt = ['negocio_id = ?', 'ecf_tipo = ?', "ecf_estado = 'ACEPTADO'", 'ecf_encf IS NOT NULL'];
          const paramsExt = [negocioId, s.ecfTipo];
          if (s.minTotal != null) { condsExt.push('monto_total >= ?'); paramsExt.push(s.minTotal); }
          if (s.maxTotal != null) { condsExt.push('monto_total <= ?'); paramsExt.push(s.maxTotal); }
          const externo = await db.get(
            `SELECT id, ecf_encf, ecf_tipo, ecf_estado, monto_total,
                    cliente_nombre, created_at
               FROM ecf_documentos_externos
              WHERE ${condsExt.join(' AND ')}
              ORDER BY id DESC LIMIT 1`,
            paramsExt
          );

          // Elegir el mas reciente (por created_at)
          let elegido = null;
          if (pedido && externo) {
            const fp = new Date(pedido.created_at || 0).getTime();
            const fe = new Date(externo.created_at || 0).getTime();
            elegido = fp >= fe
              ? { ...pedido, origen: 'pedido', url: `/api/dgii/ecf/representacion/${pedido.id}?print=1` }
              : { ...externo, origen: 'externo', url: `/api/dgii/ecf/representacion-externo/${externo.id}?print=1` };
          } else if (pedido) {
            elegido = { ...pedido, origen: 'pedido', url: `/api/dgii/ecf/representacion/${pedido.id}?print=1` };
          } else if (externo) {
            elegido = { ...externo, origen: 'externo', url: `/api/dgii/ecf/representacion-externo/${externo.id}?print=1` };
          }

          out.push({
            slot: s.slot,
            label: s.label,
            ecf_tipo: s.ecfTipo,
            disponible: !!elegido,
            documento: elegido,
          });
        }

        return res.json({ ok: true, slots: out });
      } catch (error) {
        console.error('Error /paso5-candidatos:', error);
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

  return { router, emitirEcfParaPedido, emitirEcfDocumentoExterno };
};

module.exports = { createDgiiEcfRouter };
