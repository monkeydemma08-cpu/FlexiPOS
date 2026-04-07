const crypto = require('crypto');

let forge = null;
let SignedXml = null;
const dgiiCoreMissingDeps = [];
try {
  forge = require('node-forge');
} catch (_) {
  dgiiCoreMissingDeps.push('node-forge');
}
try {
  ({ SignedXml } = require('xml-crypto'));
} catch (_) {
  dgiiCoreMissingDeps.push('xml-crypto');
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DGII_DEFAULT_ENDPOINTS = Object.freeze({
  autenticacion: 'https://eCF.dgii.gov.do/CerteCF/Autenticacion',
  recepcion: 'https://eCF.dgii.gov.do/CerteCF/Recepcion',
  consultaResultado: 'https://eCF.dgii.gov.do/CerteCF/ConsultaResultado',
  recepcionFc: 'https://fc.dgii.gov.do/CerteCF/RecepcionFC',
  consultaRfce: 'https://fc.dgii.gov.do/CerteCF/ConsultaRFCe',
});

const DEFAULT_TIMEOUT_MS = 40000;

const EMISION_TIPOS_FASE_1 = ['31', '32', '41', '43', '44', '45', '46', '47'];
const EMISION_TIPOS_FASE_2 = ['33', '34'];

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

const toSafeJson = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_) {}
  return fallback;
};

const sanitizeForFileName = (value, fallback = 'caso') => {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
};

const formatMoney = (n) => Number(Number(n || 0).toFixed(2));

const formatDateDgii = (date = new Date()) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  return `${dd}-${mm}-${yyyy}`;
};

const formatDateTimeDgii = (date = new Date()) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
};

const normalizeDateDgii = (value, { fallbackToday = false } = {}) => {
  if (value == null || value === '') return fallbackToday ? formatDateDgii(new Date()) : '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateDgii(value);
  const text = String(value).trim();
  if (!text) return fallbackToday ? formatDateDgii(new Date()) : '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [yyyy, mm, dd] = text.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (match) {
    const [, a, b, c] = match;
    const yyyy = c.length === 2 ? `20${c}` : c;
    return `${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}-${yyyy}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatDateDgii(parsed);
  return fallbackToday ? formatDateDgii(new Date()) : text;
};

const sleepMs = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

const buildEncKey = () => {
  const secret =
    process.env.DGII_PASO2_SECRET ||
    process.env.IMPERSONATION_JWT_SECRET ||
    process.env.JWT_SECRET ||
    'kanm-dgii-paso2-dev-secret';
  return crypto.createHash('sha256').update(String(secret)).digest();
};

const encryptSensitive = (plain) => {
  if (!plain) return null;
  const key = buildEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSensitive = (encoded) => {
  if (!encoded) return '';
  if (!String(encoded).startsWith('v1:')) return String(encoded);
  const parts = String(encoded).split(':');
  if (parts.length !== 4) return '';
  const [, ivB64, tagB64, dataB64] = parts;
  const key = buildEncKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
};

// ---------------------------------------------------------------------------
// XML / Crypto
// ---------------------------------------------------------------------------

const extractPemFromP12 = ({ p12Base64, p12Password = '' }) => {
  if (!forge) throw new Error('node-forge no disponible. Ejecuta npm install.');
  const binary = Buffer.from(p12Base64, 'base64').toString('binary');
  const p12Asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password || '');

  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
    [];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

  if (!keyBags.length) throw new Error('No se encontro llave privada en el certificado P12.');
  if (!certBags.length) throw new Error('No se encontro certificado X509 en el archivo P12.');

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBags[0].key),
    certPem: forge.pki.certificateToPem(certBags[0].cert),
  };
};

const signXmlDocument = ({
  xml,
  privateKeyPem,
  certPem,
  signatureLocation = { reference: '/*', action: 'append' },
}) => {
  if (!SignedXml) throw new Error('xml-crypto no disponible. Ejecuta npm install.');
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });
  sig.addReference({
    xpath: '/*',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    isEmptyUri: true,
  });
  sig.computeSignature(xml, { location: signatureLocation });
  const signedXml = sig.getSignedXml();
  const signatureValue = String(signedXml.match(/<SignatureValue[^>]*>([\s\S]*?)<\/SignatureValue>/i)?.[1] || '').replace(/\s+/g, '');
  return { xml: signedXml, signatureValue };
};

const extractSignatureValueFromXml = (xml = '') =>
  String(xml.match(/<SignatureValue[^>]*>([\s\S]*?)<\/SignatureValue>/i)?.[1] || '').replace(/\s+/g, '');

const computeCodigoSeguridadeCF = (signatureValue = '') => {
  const clean = String(signatureValue || '').replace(/\s+/g, '');
  if (!clean) return '';
  return crypto
    .createHash('sha256')
    .update(clean, 'utf8')
    .digest('base64')
    .slice(0, 6);
};

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const createTimeoutSignal = (timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Timeout DGII')), timeoutMs);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timeoutId),
  };
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const timer = createTimeoutSignal(timeoutMs);
  try {
    return await fetch(url, { ...options, signal: timer.signal });
  } finally {
    timer.done();
  }
};

const extractDgiiPayload = (jsonObj, rawText = '') => {
  const flattened = [];
  const walk = (value) => {
    if (value == null) return;
    if (typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => {
        flattened.push([String(k).toLowerCase(), v]);
        walk(v);
      });
      return;
    }
    flattened.push(['', value]);
  };
  if (jsonObj && typeof jsonObj === 'object') walk(jsonObj);

  const pick = (...keys) => {
    for (const key of keys) {
      const hit = flattened.find(([k, v]) => k === key && v != null && String(v).trim() !== '');
      if (hit) return hit[1];
    }
    return null;
  };

  const statusTextRaw =
    pick('estado', 'estatus', 'status', 'resultado', 'message', 'mensaje') ||
    (jsonObj && typeof jsonObj === 'object' ? '' : rawText);
  const statusText = String(statusTextRaw || '').toLowerCase();
  const accepted = /aceptad|aprobad|valido|validado|recibido|ok|success/.test(statusText) && !/rechaz|error|invalid/.test(statusText);
  const rejected = /rechaz|error|invalid|fallo|deneg/.test(statusText);

  const code = pick('codigo', 'code', 'codigorespuesta', 'idrespuesta', 'idestado') || (rawText.match(/<Codigo>([^<]+)<\/Codigo>/i)?.[1] || null);
  const message =
    pick('mensaje', 'message', 'descripcion', 'detalle', 'observacion', 'valor') ||
    (jsonObj && typeof jsonObj === 'object' ? null : rawText.match(/<Mensaje>([^<]+)<\/Mensaje>/i)?.[1] || null);
  const trackId = pick('trackid', 'track_id', 'idtrack', 'idseguimiento', 'ticket', 'id') || (rawText.match(/<TrackId>([^<]+)<\/TrackId>/i)?.[1] || null);

  return {
    accepted,
    rejected,
    statusText: String(statusTextRaw || '').slice(0, 2000),
    code: code != null ? String(code) : null,
    message: message != null ? String(message) : null,
    trackId: trackId != null ? String(trackId) : null,
  };
};

const parseTextResponse = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { raw: '', json: null, extracted: {} };
  try {
    const json = JSON.parse(trimmed);
    return { raw: trimmed, json, extracted: extractDgiiPayload(json, trimmed) };
  } catch (_) {
    return { raw: trimmed, json: null, extracted: extractDgiiPayload(null, trimmed) };
  }
};

const extractToken = (raw, jsonObj = null) => {
  const direct =
    (jsonObj && (jsonObj.token || jsonObj.access_token || jsonObj.accessToken || jsonObj.jwt || jsonObj.data?.token)) ||
    null;
  if (direct) return String(direct);

  const regexes = [
    /"access_token"\s*:\s*"([^"]+)"/i,
    /"token"\s*:\s*"([^"]+)"/i,
    /<token>([^<]+)<\/token>/i,
    /<access_token>([^<]+)<\/access_token>/i,
  ];
  for (const reg of regexes) {
    const match = String(raw || '').match(reg);
    if (match?.[1]) return String(match[1]);
  }
  return '';
};

const decodeJwtExpMs = (token = '') => {
  try {
    const payload = String(token || '').split('.')[1] || '';
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    const exp = Number(decoded?.exp || 0);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch (_) {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// DGII endpoint helpers
// ---------------------------------------------------------------------------

const withApiPath = (baseUrl, apiPath = '') => {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!cleanBase) return '';
  const cleanPath = String(apiPath || '').trim();
  if (!cleanPath) return cleanBase;
  const normalizedBase = cleanBase.toLowerCase();
  const normalizedPath = cleanPath.toLowerCase();
  if (normalizedBase.endsWith(normalizedPath)) return cleanBase;
  return `${cleanBase}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
};

const normalizeDgiiServiceBase = (baseUrl = '') =>
  String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/Autenticacion$/i, '/autenticacion')
    .replace(/\/Recepcion$/i, '/recepcion')
    .replace(/\/ConsultaResultado$/i, '/consultaresultado')
    .replace(/\/RecepcionFC$/i, '/recepcionfc')
    .replace(/\/ConsultaRFCe$/i, '/consultarfce');

const isOfficialDgiiAuthBase = (baseUrl = '') =>
  String(baseUrl || '')
    .toLowerCase()
    .replace(/\/+$/, '')
    .includes('ecf.dgii.gov.do/certecf/autenticacion');

const buildAuthCandidates = (baseUrl, mode = 'AUTO') => {
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  if (!cleanBase) return [];
  const isDgiiCertAuth = isOfficialDgiiAuthBase(cleanBase);
  const effectiveMode = mode === 'AUTO' && isDgiiCertAuth ? 'SEMILLA' : mode;

  if (isDgiiCertAuth) {
    return [
      {
        mode: 'SEMILLA',
        semillaUrl: withApiPath(cleanBase, '/api/Autenticacion/Semilla'),
        validarUrl: withApiPath(cleanBase, '/api/Autenticacion/ValidarSemilla'),
      },
    ];
  }

  const candidates = [];
  if (effectiveMode === 'SEMILLA' || effectiveMode === 'AUTO') {
    candidates.push({
      mode: 'SEMILLA',
      semillaUrl: withApiPath(cleanBase, '/api/Autenticacion/Semilla'),
      validarUrl: withApiPath(cleanBase, '/api/Autenticacion/ValidarSemilla'),
    });
    candidates.push({
      mode: 'SEMILLA',
      semillaUrl: withApiPath(cleanBase, '/api/autenticacion/semilla'),
      validarUrl: withApiPath(cleanBase, '/api/autenticacion/validarsemilla'),
    });
  }
  if (effectiveMode === 'CREDENCIALES' || effectiveMode === 'AUTO') {
    candidates.push({
      mode: 'CREDENTIALS_JSON',
      url: withApiPath(cleanBase, '/api/Autenticacion'),
      method: 'POST',
    });
  }
  return candidates;
};

const resolveEndpoints = (row) => {
  const custom = toSafeJson(row?.endpoints_json, {});
  return {
    autenticacion: normalizeDgiiServiceBase(custom.autenticacion || DGII_DEFAULT_ENDPOINTS.autenticacion),
    recepcion: normalizeDgiiServiceBase(custom.recepcion || DGII_DEFAULT_ENDPOINTS.recepcion),
    consultaResultado: normalizeDgiiServiceBase(custom.consultaResultado || DGII_DEFAULT_ENDPOINTS.consultaResultado),
    recepcionFc: normalizeDgiiServiceBase(custom.recepcionFc || custom.recepcionFC || DGII_DEFAULT_ENDPOINTS.recepcionFc),
    consultaRfce: normalizeDgiiServiceBase(custom.consultaRfce || custom.consultaRFCE || custom.consulta_rfce || DGII_DEFAULT_ENDPOINTS.consultaRfce),
  };
};

// ---------------------------------------------------------------------------
// Emission phase helpers
// ---------------------------------------------------------------------------

const normalizeDocType = (value) => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const match = raw.match(/\d{2}/);
  return match ? match[0] : raw.toUpperCase();
};

const resolveEmissionPhase = ({ flujo, tipoDocumento }) => {
  const tipo = normalizeDocType(tipoDocumento);
  if (flujo === 'RESUMEN_FC') {
    return { phase: 3, phaseLabel: 'TERCERO', typeRank: 1, typeLabel: '32 resumen <250k' };
  }
  if (flujo === 'FC_MENOR_250K') {
    return { phase: 4, phaseLabel: 'CUARTO', typeRank: 1, typeLabel: '32 consumo <250k' };
  }
  const rankFase1 = EMISION_TIPOS_FASE_1.indexOf(tipo);
  if (rankFase1 >= 0) {
    return { phase: 1, phaseLabel: 'PRIMERO', typeRank: rankFase1 + 1, typeLabel: tipo || 'SIN_TIPO' };
  }
  const rankFase2 = EMISION_TIPOS_FASE_2.indexOf(tipo);
  if (rankFase2 >= 0) {
    return { phase: 2, phaseLabel: 'SEGUNDO', typeRank: rankFase2 + 1, typeLabel: tipo || 'SIN_TIPO' };
  }
  return { phase: 5, phaseLabel: 'OTROS', typeRank: 99, typeLabel: tipo || 'SIN_TIPO' };
};

const buildEmissionSortValue = ({ flujo, tipoDocumento, sourceOrder, excelRow }) => {
  const emission = resolveEmissionPhase({ flujo, tipoDocumento });
  const sequence = Number.isFinite(Number(sourceOrder)) ? Number(sourceOrder) : Number(excelRow) || 0;
  return emission.phase * 1_000_000 + emission.typeRank * 10_000 + sequence;
};

// ---------------------------------------------------------------------------
// DGII Authentication (pure — does not depend on db)
// ---------------------------------------------------------------------------

const autenticarDGII = async ({ config }) => {
  const endpoints = config?.endpoints || DGII_DEFAULT_ENDPOINTS;
  const configuredMode = String(config?.modo_autenticacion || 'AUTO').toUpperCase();
  const mode = isOfficialDgiiAuthBase(endpoints.autenticacion) ? 'SEMILLA' : configuredMode;
  const candidates = buildAuthCandidates(endpoints.autenticacion, mode);
  if (!candidates.length) throw new Error('No hay endpoint de autenticacion configurado.');

  const usuario = config?.usuario_certificacion || '';
  const clave = config?.clave_certificacion || '';

  let lastError = null;
  for (const candidate of candidates) {
    try {
      if (candidate.mode === 'CREDENTIALS_JSON') {
        if (!usuario || !clave) {
          lastError = new Error('No se puede autenticar por credenciales: faltan usuario o clave DGII.');
          continue;
        }
        const payloadVariants = [
          { usuario, clave },
          { username: usuario, password: clave },
          { UserName: usuario, Password: clave },
        ];
        for (const bodyObj of payloadVariants) {
          const resp = await fetchWithTimeout(
            candidate.url,
            {
              method: candidate.method,
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
              },
              body: JSON.stringify(bodyObj),
            },
            DEFAULT_TIMEOUT_MS
          );
          const text = await resp.text();
          const parsed = parseTextResponse(text);
          const token = extractToken(text, parsed.json);
          if (resp.ok && token) {
            return { token, raw: text, endpoint: candidate.url };
          }
          lastError = new Error(
            `Autenticacion fallida en ${candidate.url} (${resp.status}): ${parsed.extracted.message || parsed.raw || 'sin detalle'}`
          );
        }
      } else if (candidate.mode === 'SEMILLA') {
        if (!candidate.semillaUrl || !candidate.validarUrl) {
          lastError = new Error('Configuracion de endpoints de semilla invalida.');
          continue;
        }
        if (!config?.p12_base64 || config?.p12_password == null) {
          lastError = new Error('Autenticacion por semilla requiere certificado P12 y su clave.');
          continue;
        }

        const semillaResp = await fetchWithTimeout(
          candidate.semillaUrl,
          {
            method: 'GET',
            headers: { Accept: 'application/xml, text/xml, application/json, text/plain, */*' },
          },
          DEFAULT_TIMEOUT_MS
        );
        const semillaText = await semillaResp.text();
        if (!semillaResp.ok) {
          const parsedSemilla = parseTextResponse(semillaText);
          lastError = new Error(
            `Semilla DGII fallida en ${candidate.semillaUrl} (${semillaResp.status}): ` +
              `${parsedSemilla.extracted.message || parsedSemilla.raw || 'sin detalle'}`
          );
          continue;
        }

        const cert = extractPemFromP12({
          p12Base64: config.p12_base64,
          p12Password: config.p12_password || '',
        });
        const semillaFirmada = signXmlDocument({
          xml: semillaText,
          privateKeyPem: cert.privateKeyPem,
          certPem: cert.certPem,
        }).xml;

        const formData = new FormData();
        formData.append('xml', new Blob([semillaFirmada], { type: 'application/xml' }), 'semilla_firmada.xml');

        const validarResp = await fetchWithTimeout(
          candidate.validarUrl,
          {
            method: 'POST',
            headers: { Accept: 'application/json, text/xml, application/xml, text/plain, */*' },
            body: formData,
          },
          DEFAULT_TIMEOUT_MS
        );
        const validarText = await validarResp.text();
        const parsedValidar = parseTextResponse(validarText);
        const token = extractToken(validarText, parsedValidar.json);
        if (validarResp.ok && token) {
          return {
            token,
            raw: validarText,
            endpoint: candidate.validarUrl,
            expira: parsedValidar?.json?.expira || null,
          };
        }
        lastError = new Error(
          `Autenticacion semilla fallida en ${candidate.validarUrl} (${validarResp.status}): ` +
            `${parsedValidar.extracted.message || parsedValidar.raw || 'sin detalle'}`
        );
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (mode === 'CREDENCIALES' && (!usuario || !clave)) {
    throw new Error('Faltan credenciales de certificacion DGII en la configuracion.');
  }
  throw lastError || new Error('No fue posible autenticar con DGII.');
};

// ---------------------------------------------------------------------------
// DGII sending (pure — does not depend on db)
// ---------------------------------------------------------------------------

const sendXmlToDgii = async ({ endpoint, apiPath, xmlPayload, token, fileName = 'ecf.xml' }) => {
  const endpointFinal = withApiPath(endpoint, apiPath);
  const formData = new FormData();
  formData.append('xml', new Blob([String(xmlPayload || '')], { type: 'text/xml' }), sanitizeForFileName(fileName, 'ecf.xml'));
  const headers = {
    Accept: 'application/json, text/xml, application/xml, text/plain, */*',
    Authorization: `Bearer ${token}`,
  };
  const response = await fetchWithTimeout(
    endpointFinal,
    {
      method: 'POST',
      headers,
      body: formData,
    },
    DEFAULT_TIMEOUT_MS
  );
  const text = await response.text();
  const parsed = parseTextResponse(text);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const looksHtml =
    contentType.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
  return {
    ok: response.ok && !looksHtml,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    raw: text,
    extracted: parsed.extracted,
    json: parsed.json,
    requestHeaders: headers,
    endpoint: endpointFinal,
  };
};

const consultDgiiResult = async ({ endpoint, token, trackId, encf, rncEmisor }) => {
  const endpointFinal = withApiPath(endpoint, '/api/Consultas/Estado');
  const query = new URLSearchParams();
  query.set('TrackId', String(trackId || '').trim());
  if (encf) query.set('eNCF', String(encf));
  if (rncEmisor) query.set('RncEmisor', String(rncEmisor));
  const attempts = [
    { method: 'GET', url: `${endpointFinal}?${query.toString()}` },
    { method: 'GET', url: `${endpoint}?TrackId=${encodeURIComponent(trackId || '')}` },
  ];

  let last = null;
  for (const attempt of attempts) {
    const headers = {
      Accept: 'application/json, text/xml, application/xml, text/plain, */*',
      Authorization: `Bearer ${token}`,
    };
    const resp = await fetchWithTimeout(
      attempt.url,
      { method: attempt.method, headers },
      DEFAULT_TIMEOUT_MS
    );
    const text = await resp.text();
    const parsed = parseTextResponse(text);
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const looksHtml =
      contentType.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
    const result = {
      ok: resp.ok,
      status: resp.status,
      headers: Object.fromEntries(resp.headers.entries()),
      raw: text,
      extracted: parsed.extracted,
      requestHeaders: headers,
      endpoint: attempt.url,
    };
    if (resp.ok && !looksHtml) return result;
    last = result;
  }
  return last || { ok: false, status: 500, raw: '', extracted: {} };
};

const remoteResultIsPending = (extracted = {}) => {
  const code = String(extracted.code || '').trim();
  const status = String(extracted.statusText || extracted.message || '').toLowerCase();
  return code === '3' || /en proceso|procesando|pendiente|recibid/.test(status);
};

const consultDgiiResultUntilSettled = async (
  { endpoint, token, trackId, encf, rncEmisor },
  { maxAttempts = 5, delayMs = 1200 } = {}
) => {
  let last = await consultDgiiResult({ endpoint, token, trackId, encf, rncEmisor });
  for (let attempt = 1; attempt < Math.max(1, Number(maxAttempts) || 1); attempt += 1) {
    if (!last?.ok || !remoteResultIsPending(last.extracted)) break;
    await sleepMs(delayMs);
    last = await consultDgiiResult({ endpoint, token, trackId, encf, rncEmisor });
  }
  return last;
};

const consultRfceResult = async ({ endpoint, token, rncEmisor, encf, codigoSeguridadeCF }) => {
  const endpointFinal = withApiPath(endpoint, '/api/Consultas/Consulta');
  const paramsVariants = [
    {
      RNC_Emisor: String(rncEmisor || '').trim(),
      ENCF: String(encf || '').trim(),
      Cod_Seguridad_eCF: String(codigoSeguridadeCF || '').trim(),
    },
    {
      RncEmisor: String(rncEmisor || '').trim(),
      eNCF: String(encf || '').trim(),
      CodigoSeguridadeCF: String(codigoSeguridadeCF || '').trim(),
    },
    {
      RncEmisor: String(rncEmisor || '').trim(),
      ENCF: String(encf || '').trim(),
      CodSeguridadeCF: String(codigoSeguridadeCF || '').trim(),
    },
  ].filter((params) => params.ENCF || params.eNCF);

  const attempts = paramsVariants.flatMap((params) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    return [
      { method: 'GET', url: `${endpointFinal}?${query.toString()}` },
      { method: 'GET', url: `${endpoint}?${query.toString()}` },
    ];
  });

  let last = null;
  for (const attempt of attempts) {
    const headers = {
      Accept: 'application/json, text/xml, application/xml, text/plain, */*',
      Authorization: `Bearer ${token}`,
    };
    const resp = await fetchWithTimeout(
      attempt.url,
      { method: attempt.method, headers },
      DEFAULT_TIMEOUT_MS
    );
    const text = await resp.text();
    const parsed = parseTextResponse(text);
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const looksHtml =
      contentType.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
    const result = {
      ok: resp.ok,
      status: resp.status,
      headers: Object.fromEntries(resp.headers.entries()),
      raw: text,
      extracted: parsed.extracted,
      requestHeaders: headers,
      endpoint: attempt.url,
    };
    if (resp.ok && !looksHtml) return result;
    last = result;
  }
  return last || { ok: false, status: 500, raw: '', extracted: {} };
};

// ---------------------------------------------------------------------------
// DGII config manager (factory — needs db)
// ---------------------------------------------------------------------------

const createDgiiConfigManager = ({ db }) => {
  const loadConfig = async (negocioId) => {
    const row = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
    if (!row) return null;
    return {
      ...row,
      usuario_certificacion: row.usuario_certificacion || '',
      clave_certificacion: decryptSensitive(row.clave_certificacion_enc || ''),
      p12_password: decryptSensitive(row.p12_password_enc || ''),
      endpoints: resolveEndpoints(row),
    };
  };

  const getTokenFromCache = async (configRow) => {
    const tokenCache = toSafeJson(configRow?.token_cache, null);
    if (!tokenCache?.token) return '';
    const candidates = [];
    if (configRow?.token_expira_en) {
      const exp = new Date(configRow.token_expira_en);
      if (!Number.isNaN(exp.getTime())) candidates.push(exp.getTime());
    }
    const jwtExp = decodeJwtExpMs(tokenCache.token);
    if (jwtExp) candidates.push(jwtExp);
    if (!candidates.length) return '';
    const effectiveExpMs = Math.min(...candidates);
    if (Date.now() >= effectiveExpMs - 60 * 1000) return '';
    return String(tokenCache.token);
  };

  const saveTokenCache = async ({ negocioId, token, expira }) => {
    if (!token) return;
    let expires = new Date(Date.now() + 45 * 60 * 1000);
    if (expira) {
      const parsed = new Date(expira);
      if (!Number.isNaN(parsed.getTime())) {
        expires = parsed;
      }
    }
    await db.run(
      'UPDATE dgii_paso2_config SET token_cache = ?, token_expira_en = ?, updated_at = CURRENT_TIMESTAMP WHERE negocio_id = ?',
      [JSON.stringify({ token }), expires.toISOString().slice(0, 19).replace('T', ' '), negocioId]
    );
  };

  const resolveToken = async ({ config, configRow, negocioId }) => {
    const cached = await getTokenFromCache(configRow || config);
    if (cached) return cached;
    const auth = await autenticarDGII({ config });
    if (!auth?.token) throw new Error('DGII no devolvio token de autenticacion.');
    await saveTokenCache({ negocioId, token: auth.token, expira: auth.expira });
    return auth.token;
  };

  return { loadConfig, getTokenFromCache, saveTokenCache, resolveToken };
};

// ---------------------------------------------------------------------------
// Signing helpers
// ---------------------------------------------------------------------------

const getSigningCredentials = (config) => {
  if (!config?.p12_base64 || config?.p12_password == null) {
    throw new Error('Carga el certificado P12/PFX y su clave en la configuracion DGII.');
  }
  if (!config.__signingCredentials) {
    config.__signingCredentials = extractPemFromP12({
      p12Base64: config.p12_base64,
      p12Password: config.p12_password || '',
    });
  }
  return config.__signingCredentials;
};

const signEcfXml = ({ xml, config, signatureLocation } = {}) => {
  const cert = getSigningCredentials(config);
  return signXmlDocument({
    xml,
    privateKeyPem: cert.privateKeyPem,
    certPem: cert.certPem,
    signatureLocation,
  });
};

const buildDgiiXmlFileName = ({ rncEmisor, encf, fallback = 'ecf.xml' }) => {
  const rnc = String(rncEmisor || '').replace(/[^0-9]/g, '');
  const comprobante = String(encf || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!rnc || !comprobante) return sanitizeForFileName(fallback, fallback);
  return `${rnc}${comprobante}.xml`;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  DGII_DEFAULT_ENDPOINTS,
  DEFAULT_TIMEOUT_MS,
  EMISION_TIPOS_FASE_1,
  EMISION_TIPOS_FASE_2,

  // Pure utilities
  toSafeJson,
  sanitizeForFileName,
  formatMoney,
  formatDateDgii,
  formatDateTimeDgii,
  normalizeDateDgii,
  sleepMs,
  normalizeDocType,
  resolveEmissionPhase,
  buildEmissionSortValue,

  // Encryption
  buildEncKey,
  encryptSensitive,
  decryptSensitive,

  // XML / Crypto
  extractPemFromP12,
  signXmlDocument,
  extractSignatureValueFromXml,
  computeCodigoSeguridadeCF,

  // Network
  fetchWithTimeout,
  extractDgiiPayload,
  parseTextResponse,
  extractToken,
  decodeJwtExpMs,

  // DGII endpoint helpers
  withApiPath,
  normalizeDgiiServiceBase,
  isOfficialDgiiAuthBase,
  buildAuthCandidates,
  resolveEndpoints,

  // DGII auth / sending (pure)
  autenticarDGII,
  sendXmlToDgii,
  consultDgiiResult,
  remoteResultIsPending,
  consultDgiiResultUntilSettled,
  consultRfceResult,

  // Signing helpers
  getSigningCredentials,
  signEcfXml,
  buildDgiiXmlFileName,

  // Factory (needs db)
  createDgiiConfigManager,

  // Dep check
  dgiiCoreMissingDeps,
};
