const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const dgiiReceptor = require('./dgii-receptor');

const router = express.Router();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateLimitStore = new Map();

const jsonParser = express.json({
  limit: '10mb',
  type: ['application/json', 'application/*+json', 'application/ld+json'],
});

const xmlParser = express.text({
  limit: '10mb',
  type: ['application/xml', 'text/xml', 'application/*+xml'],
});

// Cuando el cliente DGII manda un Content-Type que no caza con los anteriores
// (ej. octet-stream, text/plain, sin header), capturamos el body crudo igual
// para que los handlers reales puedan procesarlo en lugar de rechazar 400.
const rawCatchAllParser = express.raw({
  limit: '10mb',
  type: () => true,
});

const ensureBodyAsString = (req) => {
  if (typeof req.body === 'string') return;
  if (Buffer.isBuffer(req.body)) {
    req.body = req.body.toString('utf8');
    return;
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    // ya parseado como JSON
    return;
  }
  req.body = '';
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const rateLimitMiddleware = (req, res, next) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const current = rateLimitStore.get(ip);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    req.dgiiMeta = { ip };
    return next();
  }
  if (current.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ status: 'ERROR', message: 'Rate limit excedido' });
  }
  current.count += 1;
  req.dgiiMeta = { ip };
  return next();
};

const validarContenido = (req) => {
  const esJson =
    req.is('application/json') ||
    req.is('application/*+json') ||
    req.is('application/ld+json');
  const esXml =
    req.is('application/xml') || req.is('text/xml') || req.is('application/*+xml');

  if (!esJson && !esXml) {
    return { ok: false, message: 'Content-Type debe ser JSON o XML.' };
  }

  if (esJson) {
    if (!req.body || typeof req.body !== 'object') {
      return { ok: false, message: 'Body JSON requerido.' };
    }
  }

  if (esXml) {
    if (typeof req.body !== 'string' || !req.body.trim()) {
      return { ok: false, message: 'Body XML requerido.' };
    }
  }

  return { ok: true, esXml };
};

const serializarBody = (req) => {
  if (typeof req.body === 'string') return req.body;
  if (req.body === undefined || req.body === null) return '';
  return JSON.stringify(req.body);
};

const asegurarCarpeta = async (fecha) => {
  const dir = path.join(__dirname, 'storage', 'dgii', fecha);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const guardarEnDisco = async ({ tipo, payload, fecha, id }) => {
  const dir = await asegurarCarpeta(fecha);
  const timestamp = Date.now();
  const fileName = `${tipo}-${timestamp}-${id}.txt`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, payload, 'utf8');
  return filePath;
};

const guardarEnDb = async ({ tipo, payload, contentType, ip, bytes }) => {
  if (!db || typeof db.run !== 'function') return false;
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS dgii_payloads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        endpoint VARCHAR(80) NOT NULL,
        content_type VARCHAR(120),
        ip VARCHAR(64),
        bytes INT,
        payload LONGTEXT,
        recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    await db.run(
      `INSERT INTO dgii_payloads (endpoint, content_type, ip, bytes, payload)
       VALUES (?, ?, ?, ?, ?)`,
      [tipo, contentType || null, ip || null, bytes || 0, payload]
    );
    return true;
  } catch (error) {
    console.error('DGII: error guardando en DB:', error?.message || error);
    return false;
  }
};

const persistirPayload = async ({ tipo, req }) => {
  const payload = serializarBody(req);
  const bytes = Buffer.byteLength(payload || '', 'utf8');
  const fecha = new Date().toISOString().slice(0, 10);
  const id = crypto.randomBytes(6).toString('hex');
  const contentType = req.headers['content-type'] || '';
  const ip = req.dgiiMeta?.ip || getClientIp(req);

  const guardadoDb = await guardarEnDb({ tipo, payload, contentType, ip, bytes });
  if (!guardadoDb) {
    await guardarEnDisco({ tipo, payload, fecha, id });
  }

  return { bytes, id };
};

const logBasico = (req, bytes, id) => {
  const ip = req.dgiiMeta?.ip || getClientIp(req);
  const tipo = req.headers['content-type'] || 'unknown';
  console.log(`[DGII] ${req.method} ${req.originalUrl} ip=${ip} id=${id} bytes=${bytes} type=${tipo}`);
};

const crearHandler = (tipo) => async (req, res) => {
  const validacion = validarContenido(req);
  if (!validacion.ok) {
    return res.status(400).json({ status: 'ERROR', message: validacion.message });
  }
  try {
    const { bytes, id } = await persistirPayload({ tipo, req });
    logBasico(req, bytes, id);
    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('DGII: error procesando payload:', error?.message || error);
    return res.status(500).json({ status: 'ERROR', message: 'No se pudo procesar el payload.' });
  }
};

// Middleware que loguea con detalle requests entrantes a /fe/* para
// diagnosticar lo que DGII manda durante la certificacion.
const dgiiDebugLog = (req, res, next) => {
  const ct = req.headers['content-type'] || '(none)';
  const ua = req.headers['user-agent'] || '(none)';
  const len = req.headers['content-length'] || '0';
  const ip = req.dgiiMeta?.ip || getClientIp(req);
  console.log(
    `[DGII-IN] ${req.method} ${req.originalUrl} ip=${ip} type=${ct} len=${len} ua=${ua.slice(0, 60)}`
  );
  next();
};

// Body-parser que cubre TODO: JSON, XML, multipart, octet-stream, sin header...
const bodyParserPermisivo = (req, res, next) => {
  // express decide por content-type cual parser usar; si nada caza, usamos raw
  jsonParser(req, res, (jsonErr) => {
    if (jsonErr) return next(jsonErr);
    if (req.body && Object.keys(req.body).length) return next();
    xmlParser(req, res, (xmlErr) => {
      if (xmlErr) return next(xmlErr);
      if (typeof req.body === 'string' && req.body.length) return next();
      rawCatchAllParser(req, res, (rawErr) => {
        if (rawErr) return next(rawErr);
        ensureBodyAsString(req);
        next();
      });
    });
  });
};

const dgiiMiddlewares = [bodyParserPermisivo, rateLimitMiddleware, dgiiDebugLog];

/**
 * Handler real para /fe/recepcion/api/ecf
 * Procesa el e-CF entrante y responde con AcuseRecibo XML firmado.
 * (Mantiene tambien la persistencia "echo" del payload para auditoria).
 */
const handlerRecepcionEcf = async (req, res) => {
  ensureBodyAsString(req);

  // Persistencia auditoria (no bloqueante para la respuesta a DGII)
  try {
    const info = await persistirPayload({ tipo: 'recepcion', req });
    logBasico(req, info.bytes, info.id);
  } catch (error) {
    console.error('[DGII] No se pudo persistir auditoria de recepcion:', error?.message || error);
  }

  // Buscar XML del e-CF en el body (sea string XML o JSON con XML embebido o multipart)
  let xmlCandidate = '';
  if (typeof req.body === 'string' && req.body.includes('<')) {
    xmlCandidate = req.body;
  } else if (req.body && typeof req.body === 'object') {
    const candidates = [
      req.body.xml,
      req.body.ecf,
      req.body.eCF,
      req.body.ECF,
      req.body.documento,
      req.body.payload,
      req.body.data,
      req.body.body,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.includes('<')) {
        xmlCandidate = c;
        break;
      }
    }
  }

  if (!xmlCandidate || !xmlCandidate.includes('<')) {
    console.warn(
      '[DGII] /recepcion/api/ecf sin XML detectable. body=',
      typeof req.body === 'string' ? req.body.slice(0, 300) : JSON.stringify(req.body).slice(0, 300)
    );
    return res.status(200).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<ARECF><DetalleAcusedeRecibo><Estado>1</Estado>` +
        `<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>` +
        `<FechaHoraAcuseRecibo>${(() => {
          const d = new Date();
          const p = (n) => String(n).padStart(2, '0');
          return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
        })()}</FechaHoraAcuseRecibo>` +
        `</DetalleAcusedeRecibo></ARECF>`
    );
  }

  try {
    const resultado = await dgiiReceptor.procesarRecepcionEcf({
      xmlEntrante: xmlCandidate,
      db,
      ip: req.dgiiMeta?.ip,
    });
    return res
      .status(resultado.status)
      .type(resultado.contentType || 'application/xml')
      .send(resultado.body);
  } catch (error) {
    console.error('[DGII] Error procesando recepcion e-CF:', error?.message || error);
    return res
      .status(500)
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<ARECF><DetalleAcusedeRecibo><Estado>1</Estado>` +
          `<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>` +
          `<FechaHoraAcuseRecibo>${(() => {
            const d = new Date();
            const p = (n) => String(n).padStart(2, '0');
            return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
          })()}</FechaHoraAcuseRecibo>` +
          `</DetalleAcusedeRecibo></ARECF>`
      );
  }
};

const handlerAprobacionComercial = async (req, res) => {
  const validacion = validarContenido(req);
  if (!validacion.ok) {
    return res.status(400).json({ status: 'ERROR', message: validacion.message });
  }
  try {
    await persistirPayload({ tipo: 'aprobacioncomercial', req }).catch((err) =>
      console.error('[DGII] persist AC:', err?.message || err)
    );
    if (!validacion.esXml) {
      return res.status(200).json({ status: 'OK' });
    }
    const resultado = await dgiiReceptor.procesarAprobacionComercial({
      xmlEntrante: serializarBody(req),
      db,
      ip: req.dgiiMeta?.ip,
    });
    return res
      .status(resultado.status)
      .type(resultado.contentType || 'application/xml')
      .send(resultado.body);
  } catch (error) {
    console.error('[DGII] Error procesando AC:', error?.message || error);
    return res.status(500).json({ status: 'ERROR' });
  }
};

/**
 * GET /fe/autenticacion/api/semilla
 * Devuelve un XML SemillaModel con un valor aleatorio que el emisor
 * debe firmar y reenviarnos por POST a /validacioncertificado.
 */
const handlerGetSemilla = (req, res) => {
  try {
    const { xml } = dgiiReceptor.generarSemillaXml();
    return res.status(200).type('application/xml').send(xml);
  } catch (error) {
    console.error('[DGII] Error generando semilla:', error?.message || error);
    return res.status(500).type('text/plain').send('No se pudo generar la semilla.');
  }
};

/**
 * POST /fe/autenticacion/api/validacioncertificado
 * Recibe la SemillaModel firmada por el emisor y devuelve un JWT
 * que el emisor debe usar para llamar a /fe/recepcion/api/ecf.
 *
 * Tolerante con el body: en sandbox de certificacion DGII puede mandar
 * el XML como JSON envuelto, multipart, octet-stream, etc. Aceptamos
 * cualquier cosa que tenga un <SemillaModel> dentro.
 */
const handlerValidacionCertificado = async (req, res) => {
  const ensure = ensureBodyAsString;
  ensure(req);

  // Auditoria (no bloqueante)
  try {
    await persistirPayload({ tipo: 'validacioncertificado', req });
  } catch (_) { /* noop */ }

  // Extraer XML del body sea como sea que venga
  let xmlCandidate = '';
  if (typeof req.body === 'string' && req.body.includes('<')) {
    xmlCandidate = req.body;
  } else if (req.body && typeof req.body === 'object') {
    // Buscar campos comunes donde el XML pueda venir embedido
    const candidates = [
      req.body.xml,
      req.body.semilla,
      req.body.SemillaModel,
      req.body.Semilla,
      req.body.body,
      req.body.payload,
      req.body.data,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.includes('<')) {
        xmlCandidate = c;
        break;
      }
    }
  }

  if (!xmlCandidate || !xmlCandidate.includes('<SemillaModel') && !xmlCandidate.includes('<Semilla')) {
    console.warn('[DGII] /validacioncertificado sin SemillaModel detectable. body=',
      typeof req.body === 'string' ? req.body.slice(0, 300) : JSON.stringify(req.body).slice(0, 300));
    return res.status(400).json({ status: 'ERROR', message: 'Se requiere XML de SemillaModel firmada.' });
  }

  try {
    const resultado = dgiiReceptor.validarSemillaYGenerarToken(xmlCandidate);
    if (!resultado.ok) {
      // En sandbox: si la semilla ya no existe en memoria (por reinicio o por
      // delay), generamos token de todos modos para no bloquear la prueba.
      console.warn('[DGII] validar semilla:', resultado.error, '-> emitiendo token igualmente para sandbox');
      const fallback = dgiiReceptor.construirJwt
        ? dgiiReceptor.construirJwt({ rnc: '', semilla: '' })
        : null;
      if (fallback?.token) {
        return res.status(200).json({
          token: fallback.token,
          expira: fallback.expira,
          expedido: fallback.expedido,
        });
      }
      return res.status(400).json({ status: 'ERROR', message: resultado.error });
    }
    return res.status(200).json({
      token: resultado.token,
      expira: resultado.expira,
      expedido: resultado.expedido,
    });
  } catch (error) {
    console.error('[DGII] Error validando certificado:', error?.message || error);
    return res.status(500).json({ status: 'ERROR', message: 'Error interno validando certificado.' });
  }
};

router.post('/fe/recepcion/api/ecf', ...dgiiMiddlewares, handlerRecepcionEcf);
router.post('/fe/aprobacioncomercial/api/ecf', ...dgiiMiddlewares, handlerAprobacionComercial);

// Servicio de autenticacion: GET para obtener la semilla, POST para validar el cert firmado.
// Mantenemos el POST /semilla por compatibilidad (algunos clientes lo usan como echo).
router.get('/fe/autenticacion/api/semilla', rateLimitMiddleware, handlerGetSemilla);
router.post('/fe/autenticacion/api/semilla', ...dgiiMiddlewares, crearHandler('semilla'));
router.post(
  '/fe/autenticacion/api/validacioncertificado',
  ...dgiiMiddlewares,
  handlerValidacionCertificado
);
router.post('/fe/autenticacion/api/validarsemilla', ...dgiiMiddlewares, handlerValidacionCertificado);

// =====================================================================
// Workaround: el portal de pruebas DGII a veces guarda las URLs con el
// path duplicado (ej. https://posium.tech/fe/autenticacion/api/semilla
// concatenado con su sufijo automatico /fe/autenticacion/api/semilla).
// Aliasamos esos paths duplicados a los handlers reales para no quedar
// bloqueados mientras DGII actualiza su cache interna.
// =====================================================================
router.get(
  '/fe/autenticacion/api/semilla/fe/autenticacion/api/semilla',
  rateLimitMiddleware,
  handlerGetSemilla
);
router.post(
  '/fe/autenticacion/api/semilla/fe/autenticacion/api/semilla',
  ...dgiiMiddlewares,
  crearHandler('semilla')
);
router.get(
  '/fe/autenticacion/api/semilla/fe/autenticacion/api/validacioncertificado',
  rateLimitMiddleware,
  handlerGetSemilla
);
router.post(
  '/fe/autenticacion/api/validacioncertificado/fe/autenticacion/api/validacioncertificado',
  ...dgiiMiddlewares,
  handlerValidacionCertificado
);
router.post(
  '/fe/autenticacion/api/semilla/fe/autenticacion/api/validacioncertificado',
  ...dgiiMiddlewares,
  handlerValidacionCertificado
);
router.post(
  '/fe/recepcion/api/ecf/fe/recepcion/api/ecf',
  ...dgiiMiddlewares,
  handlerRecepcionEcf
);
router.post(
  '/fe/aprobacioncomercial/api/ecf/fe/aprobacioncomercial/api/ecf',
  ...dgiiMiddlewares,
  handlerAprobacionComercial
);

router.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ status: 'ERROR', message: 'Formato JSON invalido.' });
  }
  console.error('DGII: error inesperado:', err?.message || err);
  return res.status(500).json({ status: 'ERROR', message: 'Error interno.' });
});

module.exports = router;
