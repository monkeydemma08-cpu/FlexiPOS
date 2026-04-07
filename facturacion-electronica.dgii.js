const crypto = require('crypto');

let forge = null;
let SignedXml = null;
const missingDeps = [];

try {
  forge = require('node-forge');
} catch (error) {
  missingDeps.push('node-forge');
}

try {
  ({ SignedXml } = require('xml-crypto'));
} catch (error) {
  missingDeps.push('xml-crypto');
}

const DGII_DEFAULT_ENDPOINTS = Object.freeze({
  autenticacion: 'https://eCF.dgii.gov.do/CerteCF/Autenticacion',
  recepcion: 'https://eCF.dgii.gov.do/CerteCF/Recepcion',
  consultaResultado: 'https://eCF.dgii.gov.do/CerteCF/ConsultaResultado',
  recepcionFc: 'https://fc.dgii.gov.do/CerteCF/RecepcionFC',
  consultaRfce: 'https://fc.dgii.gov.do/CerteCF/ConsultaRFCe',
});

const DEFAULT_TIMEOUT_MS = 40000;
const EMPTY_MARKERS = new Set(['', '#e', '#n/a', '#na', 'n/a', 'na', 'null', 'none', 'no aplica', 'nulo', '-']);

const ensureDeps = () => {
  if (missingDeps.length) {
    throw new Error(`Faltan dependencias DGII: ${missingDeps.join(', ')}.`);
  }
};

const toSafeJson = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (error) {}
  return fallback;
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
  } catch (error) {
    return { raw: trimmed, json: null, extracted: extractDgiiPayload(null, trimmed) };
  }
};

const buildDgiiSecretKey = () => {
  const secret =
    process.env.DGII_PASO2_SECRET ||
    process.env.IMPERSONATION_JWT_SECRET ||
    process.env.JWT_SECRET ||
    'kanm-dgii-paso2-dev-secret';
  return crypto.createHash('sha256').update(String(secret)).digest();
};

const decryptDgiiSecret = (encoded) => {
  if (!encoded) return '';
  if (!String(encoded).startsWith('v1:')) return String(encoded);
  const parts = String(encoded).split(':');
  if (parts.length !== 4) return '';
  const [, ivB64, tagB64, dataB64] = parts;
  const key = buildDgiiSecretKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
};

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
    candidates.push({ url: withApiPath(cleanBase, '/api/Autenticacion'), method: 'POST', mode: 'CREDENTIALS_JSON' });
  }
  return candidates;
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
    const response = await fetch(url, { ...options, signal: timer.signal });
    return response;
  } finally {
    timer.done();
  }
};

const extractPemFromP12 = ({ p12Base64, p12Password = '' }) => {
  ensureDeps();
  const binary = Buffer.from(p12Base64, 'base64').toString('binary');
  const p12Asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password || '');

  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
    [];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

  if (!keyBags.length) throw new Error('No se encontró llave privada en el certificado P12.');
  if (!certBags.length) throw new Error('No se encontró certificado X509 en el archivo P12.');

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
  canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
}) => {
  ensureDeps();
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm,
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

const sanitizeForFileName = (value, fallback = 'ecf.xml') => {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
};

const resolveDgiiEndpoints = (row = {}) => {
  const custom = toSafeJson(row?.endpoints_json, {});
  return {
    autenticacion: normalizeDgiiServiceBase(custom.autenticacion || DGII_DEFAULT_ENDPOINTS.autenticacion),
    recepcion: normalizeDgiiServiceBase(custom.recepcion || DGII_DEFAULT_ENDPOINTS.recepcion),
    consultaResultado: normalizeDgiiServiceBase(custom.consultaResultado || DGII_DEFAULT_ENDPOINTS.consultaResultado),
    recepcionFc: normalizeDgiiServiceBase(custom.recepcionFc || custom.recepcionFC || DGII_DEFAULT_ENDPOINTS.recepcionFc),
    consultaRfce: normalizeDgiiServiceBase(
      custom.consultaRfce || custom.consultaRFCE || custom.consulta_rfce || DGII_DEFAULT_ENDPOINTS.consultaRfce
    ),
  };
};

const getTokenFromCache = (configRow = {}) => {
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

const validateDgiiAuthConfig = (config, { hasTokenCache = false } = {}) => {
  const endpoints = config?.endpoints || DGII_DEFAULT_ENDPOINTS;
  const configuredMode = String(config?.modo_autenticacion || 'AUTO').toUpperCase();
  const mode = isOfficialDgiiAuthBase(endpoints.autenticacion) ? 'SEMILLA' : configuredMode;
  const hasCreds = Boolean(config?.usuario_certificacion && config?.clave_certificacion);
  const hasP12 = Boolean(config?.p12_base64 && config?.p12_password != null);
  if (mode === 'CREDENCIALES' && !hasCreds) {
    return 'Faltan usuario y clave DGII para autenticación por credenciales.';
  }
  if (mode === 'SEMILLA' && !hasP12 && !hasTokenCache) {
    return 'Falta certificado P12 y/o clave para autenticación por semilla.';
  }
  if (mode === 'AUTO' && !hasCreds && !hasP12 && !hasTokenCache) {
    return 'Configura credenciales DGII o certificado P12 para autenticar.';
  }
  return null;
};

const autenticarDgii = async ({ config }) => {
  const endpoints = config?.endpoints || DGII_DEFAULT_ENDPOINTS;
  const configuredMode = String(config?.modo_autenticacion || 'AUTO').toUpperCase();
  const mode = isOfficialDgiiAuthBase(endpoints.autenticacion) ? 'SEMILLA' : configuredMode;
  const candidates = buildAuthCandidates(endpoints.autenticacion, mode);
  if (!candidates.length) throw new Error('No hay endpoint de autenticación configurado.');

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
            `Autenticación fallida en ${candidate.url} (${resp.status}): ${parsed.extracted.message || parsed.raw || 'sin detalle'}`
          );
        }
      } else if (candidate.mode === 'SEMILLA') {
        if (!candidate.semillaUrl || !candidate.validarUrl) {
          lastError = new Error('Configuración de endpoints de semilla inválida.');
          continue;
        }
        if (!config?.p12_base64 || config?.p12_password == null) {
          lastError = new Error('Autenticación por semilla requiere certificado P12 y su clave.');
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
          canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
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
          `Autenticación semilla fallida en ${candidate.validarUrl} (${validarResp.status}): ` +
            `${parsedValidar.extracted.message || parsedValidar.raw || 'sin detalle'}`
        );
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No fue posible autenticar con DGII.');
};

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
    {
      method: 'GET',
      url: `${endpointFinal}?${query.toString()}`,
    },
    {
      method: 'GET',
      url: `${endpoint}?TrackId=${encodeURIComponent(trackId || '')}`,
    },
  ];

  let last = null;
  for (const attempt of attempts) {
    const headers = {
      Accept: 'application/json, text/xml, application/xml, text/plain, */*',
      Authorization: `Bearer ${token}`,
    };
    const resp = await fetchWithTimeout(
      attempt.url,
      {
        method: attempt.method,
        headers,
        body: attempt.body,
      },
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
      requestBody: attempt.body || '',
      endpoint: attempt.url,
    };
    if (resp.ok && !looksHtml) return result;
    last = result;
  }
  return last;
};

module.exports = {
  DGII_DEFAULT_ENDPOINTS,
  missingDeps,
  decryptDgiiSecret,
  resolveDgiiEndpoints,
  buildAuthCandidates,
  validateDgiiAuthConfig,
  getTokenFromCache,
  autenticarDgii,
  extractToken,
  fetchWithTimeout,
  extractPemFromP12,
  signXmlDocument,
  extractSignatureValueFromXml,
  sendXmlToDgii,
  consultDgiiResult,
  parseTextResponse,
};
