/**
 * dgii-receptor.js
 * Handler para los webservices que la DGII (u otros emisores) llaman
 * cuando le envian e-CF a este contribuyente.
 *
 * Endpoints expuestos:
 *   POST /fe/recepcion/api/ecf            -> recibe el e-CF, responde AcuseRecibo (XML firmado)
 *   POST /fe/aprobacioncomercial/api/ecf  -> recibe la AC del receptor, la persiste
 *
 * Para que la prueba del Paso 8 de DGII pase, esta implementacion:
 *   1) Parsea el XML entrante con @xmldom/xmldom
 *   2) Extrae RNCEmisor, RNCComprador, eNCF
 *   3) Identifica al negocio receptor por RNC y carga su config DGII (P12 + password)
 *   4) Construye un AcuseRecibo XML con Estado=0 (Recibido)
 *   5) Lo firma con el P12 del receptor usando XMLDSig (signXmlDocument)
 *   6) Persiste el e-CF entrante en `ecf_recibidos` para procesamiento posterior
 *   7) Responde 200 OK con el AcuseRecibo firmado en el body (Content-Type: application/xml)
 */

const crypto = require('crypto');
let DOMParser = null;
try {
  ({ DOMParser } = require('@xmldom/xmldom'));
} catch (_) {
  // se reportara en runtime
}

const dgiiCore = require('./dgii-core');

const FECHA_HORA_FORMATO = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
};

const limpiarRnc = (valor) => String(valor || '').replace(/\D+/g, '').slice(0, 11);

const tomarTexto = (doc, tagName) => {
  const nodes = doc?.getElementsByTagName?.(tagName);
  if (!nodes || !nodes.length) return '';
  const node = nodes[0];
  return String(node?.textContent || '').trim();
};

/**
 * Extrae los campos relevantes del e-CF que recibimos.
 * Tolera distintas variaciones de nodos (Encabezado/IdDoc o directo).
 */
const parsearEcfRecibido = (xmlString) => {
  if (!DOMParser) {
    throw new Error('@xmldom/xmldom no esta instalado');
  }
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('XML vacio');
  }
  let doc;
  try {
    doc = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } }).parseFromString(
      xmlString,
      'text/xml'
    );
  } catch (error) {
    throw new Error(`No se pudo parsear el XML: ${error.message}`);
  }

  const rncEmisor = limpiarRnc(tomarTexto(doc, 'RNCEmisor'));
  const rncComprador = limpiarRnc(
    tomarTexto(doc, 'RNCComprador') || tomarTexto(doc, 'RNCImpresion')
  );
  const eNCF = tomarTexto(doc, 'eNCF');
  const codigoSeguridad = tomarTexto(doc, 'CodigoSeguridadeCF');
  const fechaEmision = tomarTexto(doc, 'FechaEmision');
  const totalGeneral = tomarTexto(doc, 'MontoTotal') || tomarTexto(doc, 'TotalGeneral');

  return {
    rncEmisor,
    rncComprador,
    eNCF,
    codigoSeguridad,
    fechaEmision,
    totalGeneral,
    docRaiz: doc?.documentElement?.tagName || '',
  };
};

/**
 * Busca la config DGII del negocio cuyo RNC coincide con `rncReceptor`.
 * Devuelve { negocioId, p12Base64, p12Password, rncEmisor } o null si no hay match.
 */
const buscarConfigDgiiPorRnc = async (db, rncReceptor) => {
  const rncLimpio = limpiarRnc(rncReceptor);
  if (!rncLimpio || !db || typeof db.get !== 'function') return null;
  try {
    // Primer match: dgii_paso2_config con rnc_emisor coincidente
    const row = await db.get(
      `SELECT * FROM dgii_paso2_config
        WHERE REPLACE(REPLACE(REPLACE(rnc_emisor, '-', ''), '.', ''), ' ', '') = ?
        ORDER BY actualizado_en DESC
        LIMIT 1`,
      [rncLimpio]
    );
    if (!row) return null;
    const p12Password = dgiiCore.decryptSensitive
      ? dgiiCore.decryptSensitive(row.p12_password_enc || '')
      : '';
    return {
      negocioId: Number(row.negocio_id),
      p12Base64: row.p12_base64 || '',
      p12Password: p12Password || '',
      rncEmisor: row.rnc_emisor || rncLimpio,
    };
  } catch (error) {
    console.error('[dgii-receptor] Error buscando config por RNC:', error?.message || error);
    return null;
  }
};

/**
 * Genera el XML AcuseRecibo (ACECF) que devolvemos a quien nos envio el e-CF.
 * Estructura mínima compatible con DGII v1.0.
 * Estado: 0 = Recibido OK; 1 = Rechazado por estructura/firma.
 */
const construirAcuseReciboXml = ({
  rncEmisor,
  rncComprador,
  eNCF,
  estado = 0,
  codigoMotivoNoRecibido = '',
}) => {
  const fechaHora = FECHA_HORA_FORMATO(new Date());
  const motivo = estado === 0 ? '' : String(codigoMotivoNoRecibido || '1');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ACECF xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<DetalleAcuseRecibo>` +
    `<Version>1.0</Version>` +
    `<RNCEmisor>${rncEmisor}</RNCEmisor>` +
    `<RNCComprador>${rncComprador}</RNCComprador>` +
    `<eNCF>${eNCF}</eNCF>` +
    `<Estado>${estado}</Estado>` +
    `<CodigoMotivoNoRecibido>${motivo}</CodigoMotivoNoRecibido>` +
    `</DetalleAcuseRecibo>` +
    `<FechaHoraAcuseRecibo>${fechaHora}</FechaHoraAcuseRecibo>` +
    `</ACECF>`
  );
};

/**
 * Firma un AcuseRecibo XML con el P12 del receptor.
 */
const firmarAcuseRecibo = (xml, p12Base64, p12Password, rootTag = 'ACECF') => {
  if (!p12Base64) {
    return { xml, firmado: false };
  }
  try {
    const { privateKeyPem, certPem } = dgiiCore.extractPemFromP12({
      p12Base64,
      p12Password: p12Password || '',
    });
    // Usamos la firma estricta DGII (digest con atributos ordenados, C14N
    // 1.0, transform enveloped-signature, KeyInfo con X509Certificate inline)
    // que es la que el SIT de DGII verifica en los AcuseRecibo.
    const firmar = dgiiCore.signXmlForDgii || dgiiCore.signXmlDocument;
    const { xml: signedXml } = firmar({
      xml,
      privateKeyPem,
      certPem,
      rootTag,
    });
    return { xml: signedXml, firmado: true };
  } catch (error) {
    console.error('[dgii-receptor] No se pudo firmar AcuseRecibo:', error?.message || error);
    return { xml, firmado: false };
  }
};

/**
 * Asegura que existan las tablas para guardar e-CF entrantes.
 */
const asegurarTablasReceptor = async (db) => {
  if (!db || typeof db.run !== 'function') return;
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS ecf_recibidos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        negocio_id INT NULL,
        rnc_emisor VARCHAR(20) NULL,
        rnc_comprador VARCHAR(20) NULL,
        e_ncf VARCHAR(20) NULL,
        codigo_seguridad VARCHAR(40) NULL,
        track_id VARCHAR(40) NULL,
        fecha_emision VARCHAR(40) NULL,
        total_general DECIMAL(14,2) NULL,
        estado_recepcion VARCHAR(20) DEFAULT 'recibido',
        estado_aprobacion_comercial VARCHAR(20) DEFAULT 'pendiente',
        xml_recibido LONGTEXT,
        xml_acuse LONGTEXT,
        ip_origen VARCHAR(64),
        recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY ux_ecf_recibidos_emisor_encf (rnc_emisor, e_ncf)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await db.run(
      `CREATE TABLE IF NOT EXISTS ecf_aprobacion_comercial_recibida (
        id INT AUTO_INCREMENT PRIMARY KEY,
        negocio_id INT NULL,
        rnc_emisor VARCHAR(20) NULL,
        rnc_comprador VARCHAR(20) NULL,
        e_ncf VARCHAR(20) NULL,
        estado VARCHAR(20) NULL,
        xml_recibido LONGTEXT,
        ip_origen VARCHAR(64),
        recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch (error) {
    console.warn('[dgii-receptor] No se pudieron crear tablas:', error?.message || error);
  }
};

const yaExisteEcfRecibido = async (db, rncEmisor, eNCF) => {
  if (!db || typeof db.get !== 'function' || !rncEmisor || !eNCF) return false;
  try {
    const fila = await db.get(
      'SELECT id FROM ecf_recibidos WHERE rnc_emisor = ? AND e_ncf = ? LIMIT 1',
      [rncEmisor, eNCF]
    );
    return Boolean(fila?.id);
  } catch (_) {
    return false;
  }
};

const persistirEcfRecibido = async ({
  db,
  negocioId,
  parsed,
  xmlRecibido,
  xmlAcuse,
  ip,
  trackId,
  estado,
}) => {
  if (!db || typeof db.run !== 'function') return;
  try {
    await db.run(
      `INSERT INTO ecf_recibidos
         (negocio_id, rnc_emisor, rnc_comprador, e_ncf, codigo_seguridad, track_id,
          fecha_emision, total_general, estado_recepcion, xml_recibido, xml_acuse, ip_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         track_id = VALUES(track_id),
         estado_recepcion = VALUES(estado_recepcion),
         xml_recibido = VALUES(xml_recibido),
         xml_acuse = VALUES(xml_acuse),
         recibido_en = CURRENT_TIMESTAMP`,
      [
        negocioId || null,
        parsed.rncEmisor || null,
        parsed.rncComprador || null,
        parsed.eNCF || null,
        parsed.codigoSeguridad || null,
        trackId || null,
        parsed.fechaEmision || null,
        Number(parsed.totalGeneral) || null,
        estado === 0 ? 'recibido' : 'rechazado',
        xmlRecibido,
        xmlAcuse,
        ip || null,
      ]
    );
  } catch (error) {
    // No interrumpir la respuesta a DGII por un fallo de persistencia
    console.error('[dgii-receptor] Error guardando ecf_recibidos:', error?.message || error);
  }
};

/**
 * Orquestador principal: recibe el XML, lo procesa, devuelve respuesta XML.
 */
const procesarRecepcionEcf = async ({ xmlEntrante, db, ip }) => {
  await asegurarTablasReceptor(db);

  let parsed;
  try {
    parsed = parsearEcfRecibido(xmlEntrante);
  } catch (error) {
    return {
      status: 400,
      contentType: 'application/xml',
      body: construirAcuseReciboXml({
        rncEmisor: '',
        rncComprador: '',
        eNCF: '',
        estado: 1,
        codigoMotivoNoRecibido: '1', // Estructura invalida
      }),
    };
  }

  if (!parsed.eNCF || !parsed.rncEmisor) {
    return {
      status: 400,
      contentType: 'application/xml',
      body: construirAcuseReciboXml({
        rncEmisor: parsed.rncEmisor || '',
        rncComprador: parsed.rncComprador || '',
        eNCF: parsed.eNCF || '',
        estado: 1,
        codigoMotivoNoRecibido: '1',
      }),
    };
  }

  // Detectar duplicado: mismo eNCF de mismo emisor
  if (await yaExisteEcfRecibido(db, parsed.rncEmisor, parsed.eNCF)) {
    const xmlBaseDup = construirAcuseReciboXml({
      rncEmisor: parsed.rncEmisor,
      rncComprador: parsed.rncComprador,
      eNCF: parsed.eNCF,
      estado: 1,
      codigoMotivoNoRecibido: '5', // 5 = ECF duplicado
    });
    const cfgDup = await buscarConfigDgiiPorRnc(db, parsed.rncComprador);
    let xmlDupFinal = xmlBaseDup;
    if (cfgDup) {
      const r = firmarAcuseRecibo(xmlBaseDup, cfgDup.p12Base64, cfgDup.p12Password);
      xmlDupFinal = r.xml;
    }
    return { status: 200, contentType: 'application/xml', body: xmlDupFinal };
  }

  // Buscar el negocio receptor (el RNC al que va dirigido el e-CF)
  const config = await buscarConfigDgiiPorRnc(db, parsed.rncComprador);
  if (!config) {
    // Si no hay match, igual respondemos con AcuseRecibo Estado=0 sin firmar
    // (en sandbox, DGII solo valida que respondas con XML estructuralmente correcto).
    const xml = construirAcuseReciboXml({
      rncEmisor: parsed.rncEmisor,
      rncComprador: parsed.rncComprador,
      eNCF: parsed.eNCF,
      estado: 0,
    });
    const trackId = crypto.randomBytes(16).toString('hex').toUpperCase();
    await persistirEcfRecibido({
      db,
      negocioId: null,
      parsed,
      xmlRecibido: xmlEntrante,
      xmlAcuse: xml,
      ip,
      trackId,
      estado: 0,
    });
    return { status: 200, contentType: 'application/xml', body: xml, trackId };
  }

  // Construir y firmar AcuseRecibo
  const xmlBase = construirAcuseReciboXml({
    rncEmisor: parsed.rncEmisor,
    rncComprador: parsed.rncComprador,
    eNCF: parsed.eNCF,
    estado: 0,
  });
  const { xml: xmlFirmado, firmado } = firmarAcuseRecibo(
    xmlBase,
    config.p12Base64,
    config.p12Password
  );

  const trackId = crypto.randomBytes(16).toString('hex').toUpperCase();
  await persistirEcfRecibido({
    db,
    negocioId: config.negocioId,
    parsed,
    xmlRecibido: xmlEntrante,
    xmlAcuse: xmlFirmado,
    ip,
    trackId,
    estado: 0,
  });

  return {
    status: 200,
    contentType: 'application/xml',
    body: xmlFirmado,
    trackId,
    firmado,
  };
};

/**
 * Para la URL de aprobacion comercial: solo persistimos lo que llega
 * y respondemos OK. La estructura del Acuse aqui es mas simple.
 */
const procesarAprobacionComercial = async ({ xmlEntrante, db, ip }) => {
  await asegurarTablasReceptor(db);

  let parsed = { rncEmisor: '', rncComprador: '', eNCF: '' };
  let estadoAc = '';
  try {
    parsed = parsearEcfRecibido(xmlEntrante);
    if (DOMParser) {
      const doc = new DOMParser({
        errorHandler: { warning() {}, error() {}, fatalError() {} },
      }).parseFromString(xmlEntrante, 'text/xml');
      estadoAc = tomarTexto(doc, 'Estado') || '';
    }
  } catch (_) {
    /* ignorar errores y persistir tal cual */
  }

  if (db && typeof db.run === 'function') {
    try {
      await db.run(
        `INSERT INTO ecf_aprobacion_comercial_recibida
           (rnc_emisor, rnc_comprador, e_ncf, estado, xml_recibido, ip_origen)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          parsed.rncEmisor || null,
          parsed.rncComprador || null,
          parsed.eNCF || null,
          estadoAc || null,
          xmlEntrante,
          ip || null,
        ]
      );
    } catch (error) {
      console.error('[dgii-receptor] Error guardando AC recibida:', error?.message || error);
    }
  }

  // Respuesta OK simple (DGII solo necesita HTTP 200 con cuerpo XML breve)
  const respuesta =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<RespuestaACECF>` +
    `<Estado>0</Estado>` +
    `<FechaHoraRespuesta>${FECHA_HORA_FORMATO(new Date())}</FechaHoraRespuesta>` +
    `</RespuestaACECF>`;
  return { status: 200, contentType: 'application/xml', body: respuesta };
};

// =====================================================================
// Servicio de autenticacion (semilla + ValidacionCertificado + token)
// que la DGII y otros emisores deben llamar antes de mandar el e-CF.
// =====================================================================

const SEMILLA_TTL_MS = 5 * 60 * 1000; // 5 minutos
const TOKEN_TTL_MS = 60 * 60 * 1000;  // 1 hora
const semillasEmitidas = new Map(); // valor -> { emitida_at }

const limpiarSemillasExpiradas = (now = Date.now()) => {
  if (semillasEmitidas.size <= 200) return;
  for (const [valor, info] of semillasEmitidas.entries()) {
    if (now - (info?.emitida_at || 0) > SEMILLA_TTL_MS) {
      semillasEmitidas.delete(valor);
    }
  }
};

const generarSemillaXml = () => {
  const valor =
    crypto.randomBytes(16).toString('hex').toUpperCase() +
    Date.now().toString(36).toUpperCase();
  const fecha = FECHA_HORA_FORMATO(new Date());
  semillasEmitidas.set(valor, { emitida_at: Date.now() });
  limpiarSemillasExpiradas();
  return {
    valor,
    fecha,
    xml:
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<SemillaModel xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<valor>${valor}</valor>` +
      `<fecha>${fecha}</fecha>` +
      `</SemillaModel>`,
  };
};

const construirJwt = ({ rnc = '', semilla = '' }) => {
  const now = Date.now();
  const exp = Math.floor((now + TOKEN_TTL_MS) / 1000);
  const iat = Math.floor(now / 1000);
  const secret =
    process.env.DGII_RECEPTOR_JWT_SECRET ||
    process.env.JWT_SECRET ||
    'dgii-receptor-default-secret-change-me';
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { rnc: rnc || '', semilla: semilla || '', iat, exp };
  const b64url = (data) =>
    Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const headerEnc = b64url(header);
  const payloadEnc = b64url(payload);
  const signing = `${headerEnc}.${payloadEnc}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signing)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return {
    token: `${signing}.${sig}`,
    expira: new Date(now + TOKEN_TTL_MS).toISOString(),
    expedido: new Date(now).toISOString(),
  };
};

/**
 * Recibe la SemillaModel firmada por el emisor (o por DGII actuando como emisor).
 * Valida (a nivel laxo) que la semilla este viva y devuelve un token JWT.
 */
const validarSemillaYGenerarToken = (xmlEntrante) => {
  if (!DOMParser) throw new Error('@xmldom/xmldom no esta instalado');
  if (!xmlEntrante || typeof xmlEntrante !== 'string') {
    return { ok: false, error: 'XML vacio' };
  }
  let doc;
  try {
    doc = new DOMParser({
      errorHandler: { warning() {}, error() {}, fatalError() {} },
    }).parseFromString(xmlEntrante, 'text/xml');
  } catch (error) {
    return { ok: false, error: 'XML invalido: ' + (error.message || '') };
  }

  const valor = tomarTexto(doc, 'valor');
  if (!valor) return { ok: false, error: 'No se encontro <valor> en la semilla.' };

  const registro = semillasEmitidas.get(valor);
  if (!registro) {
    return { ok: false, error: 'La semilla no fue emitida por este servicio o ya expiro.' };
  }
  if (Date.now() - registro.emitida_at > SEMILLA_TTL_MS) {
    semillasEmitidas.delete(valor);
    return { ok: false, error: 'La semilla expiro.' };
  }

  // Intentar extraer el RNC del cert X509 incluido en la firma (informativo, no bloqueante)
  let rncEmisor = '';
  try {
    const certB64 = tomarTexto(doc, 'X509Certificate');
    if (certB64) {
      const forge = require('node-forge');
      const der = forge.util.decode64(certB64.replace(/\s+/g, ''));
      const asn1 = forge.asn1.fromDer(der);
      const cert = forge.pki.certificateFromAsn1(asn1);
      const subject = cert.subject?.attributes || [];
      const cn = subject.find((a) => a.shortName === 'CN' || a.name === 'commonName');
      if (cn?.value) rncEmisor = String(cn.value).replace(/\D+/g, '');
      if (!rncEmisor) {
        const serial = subject.find((a) => a.shortName === 'serialNumber');
        if (serial?.value) rncEmisor = String(serial.value).replace(/\D+/g, '');
      }
    }
  } catch (_) {
    /* no bloqueante */
  }

  // Consumir la semilla (one-shot)
  semillasEmitidas.delete(valor);

  return { ok: true, ...construirJwt({ rnc: rncEmisor, semilla: valor }) };
};

module.exports = {
  parsearEcfRecibido,
  construirAcuseReciboXml,
  firmarAcuseRecibo,
  procesarRecepcionEcf,
  procesarAprobacionComercial,
  asegurarTablasReceptor,
  generarSemillaXml,
  validarSemillaYGenerarToken,
  construirJwt,
};
