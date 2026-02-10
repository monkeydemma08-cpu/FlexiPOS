const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

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

router.use(jsonParser);
router.use(xmlParser);
router.use(rateLimitMiddleware);

router.post('/fe/recepcion/api/ecf', crearHandler('recepcion'));
router.post('/fe/aprobacioncomercial/api/ecf', crearHandler('aprobacioncomercial'));
router.post('/fe/autenticacion/api/semilla', crearHandler('semilla'));
router.post('/fe/autenticacion/api/validacioncertificado', crearHandler('validacioncertificado'));
router.post('/fe/autenticacion/api/validarsemilla', crearHandler('validarsemilla'));

router.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ status: 'ERROR', message: 'Formato JSON invalido.' });
  }
  console.error('DGII: error inesperado:', err?.message || err);
  return res.status(500).json({ status: 'ERROR', message: 'Error interno.' });
});

module.exports = router;
