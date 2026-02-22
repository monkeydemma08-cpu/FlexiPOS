const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
let XLSX = null;
let forge = null;
let SignedXml = null;
const dgiiPaso2MissingDeps = [];
try {
  XLSX = require('xlsx');
} catch (error) {
  dgiiPaso2MissingDeps.push('xlsx');
}
try {
  forge = require('node-forge');
} catch (error) {
  dgiiPaso2MissingDeps.push('node-forge');
}
try {
  ({ SignedXml } = require('xml-crypto'));
} catch (error) {
  dgiiPaso2MissingDeps.push('xml-crypto');
}

const DGII_DEFAULT_ENDPOINTS = Object.freeze({
  autenticacion: 'https://eCF.dgii.gov.do/CerteCF/Autenticacion',
  recepcion: 'https://eCF.dgii.gov.do/CerteCF/Recepcion',
  consultaResultado: 'https://eCF.dgii.gov.do/CerteCF/ConsultaResultado',
  recepcionFc: 'https://fc.dgii.gov.do/CerteCF/RecepcionFC',
});

const EMPTY_MARKERS = new Set([
  '',
  '#e',
  '#n/a',
  '#na',
  'n/a',
  'na',
  'null',
  'none',
  'no aplica',
  'nulo',
  '-',
]);

const DEFAULT_TIMEOUT_MS = 40000;

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

const normalizeHeader = (value, index) => {
  const raw = String(value ?? '').trim();
  if (!raw) return `col_${index + 1}`;
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `col_${index + 1}`
  );
};

const sanitizeCellValue = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  const text = String(value).trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (EMPTY_MARKERS.has(lowered)) return null;
  return text;
};

const parseNumberLike = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value)
    .replace(/rd\$/gi, '')
    .replace(/,/g, '')
    .trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const pickByPatterns = (obj, patterns = []) => {
  const entries = Object.entries(obj || {});
  for (const pattern of patterns) {
    const hit = entries.find(([k, v]) => pattern.test(String(k)) && v != null && String(v).trim() !== '');
    if (hit) return hit[1];
  }
  return null;
};

const containsKeyword = (obj, keywords = []) => {
  const text = Object.values(obj || {})
    .filter((v) => v != null)
    .map((v) => String(v).toLowerCase())
    .join(' ');
  return keywords.some((k) => text.includes(String(k).toLowerCase()));
};

const hashSha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const detectHeaderRowIndex = (rows = []) => {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const values = row.map((cell) => String(cell ?? '').trim()).filter(Boolean);
    if (!values.length) continue;
    const joined = values.join(' ').toLowerCase();
    let score = values.length;
    if (/(caso|prueba|monto|total|ncf|encf|fecha|resumen|comprobante|secuencia|orden|itbis|rnc)/i.test(joined)) {
      score += 6;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
};

const normalizeDocType = (value) => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const match = raw.match(/\d{2}/);
  return match ? match[0] : raw.toUpperCase();
};

const inferFlow = ({ row, sheetName, montoTotal, tipoDocumento }) => {
  const normalizedSheet = String(sheetName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const rowHasResumen = containsKeyword(row, ['resumen', 'recepcionfc', 'recepcion fc']);
  const sheetLooksResumen =
    /\brfce\b/.test(normalizedSheet) || /resumen/.test(normalizedSheet) || /recepcion_?fc/.test(normalizedSheet);
  if (rowHasResumen || sheetLooksResumen) {
    return 'RESUMEN_FC';
  }

  const tipo = normalizeDocType(tipoDocumento || pickByPatterns(row, [/tipo_?comprobante/i, /tipo_?ecf/i, /^tipo$/i]));
  if (tipo === '32') {
    if (montoTotal != null && montoTotal < 250000) return 'FC_MENOR_250K';
    return 'ECF_NORMAL';
  }

  return 'ECF_NORMAL';
};

const EMISION_TIPOS_FASE_1 = ['31', '32', '41', '43', '44', '45', '46', '47'];
const EMISION_TIPOS_FASE_2 = ['33', '34'];

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

const sanitizeForFileName = (value, fallback = 'caso') => {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
};

const formatTimestampCompact = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
};

const formatMoney = (n) => Number(Number(n || 0).toFixed(2));

const normalizeDateIso = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return new Date().toISOString().slice(0, 10);
  const candidate = text.length >= 10 ? text.slice(0, 10) : text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
};

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const stripPem = (pem = '') =>
  String(pem)
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '');

const buildItems = (payload = {}) => {
  const itemsRaw =
    payload.items ||
    payload.detalle_items ||
    payload.detalle ||
    payload.productos ||
    payload.lineas ||
    payload.lines ||
    null;

  const list = Array.isArray(itemsRaw) ? itemsRaw : [];
  if (list.length) {
    return list.map((item, idx) => {
      const cantidad = parseNumberLike(item.cantidad) || 1;
      const precio = parseNumberLike(item.precio_unitario ?? item.precio) || 0;
      const subtotal = parseNumberLike(item.subtotal) ?? cantidad * precio;
      const itbis = parseNumberLike(item.itbis) ?? 0;
      return {
        linea: idx + 1,
        descripcion: item.descripcion || item.nombre || `Item ${idx + 1}`,
        cantidad,
        precio,
        subtotal: formatMoney(subtotal),
        itbis: formatMoney(itbis),
      };
    });
  }

  const monto = parseNumberLike(payload.monto_total ?? payload.total ?? payload.total_factura ?? payload.total_documento);
  return [
    {
      linea: 1,
      descripcion: payload.descripcion || payload.concepto || 'Servicio POSIUM',
      cantidad: 1,
      precio: formatMoney(monto || 0),
      subtotal: formatMoney(monto || 0),
      itbis: 0,
    },
  ];
};
const buildEcfXml = ({ payload = {}, flujo = 'ECF_NORMAL', rncEmisorFallback = '' }) => {
  const tipoeCF =
    payload.tipo_ecf ||
    payload.tipoe_cf ||
    payload.tipo_comprobante ||
    payload.tipo ||
    (flujo === 'FC_MENOR_250K' ? '32' : '31');
  const eNCF = payload.encf || payload.e_ncf || payload.ncf || payload.comprobante || '';
  const fecha = normalizeDateIso(payload.fecha_emision || payload.fecha || payload.fecha_documento);
  const rncEmisor = payload.rnc_emisor || payload.rnc || rncEmisorFallback || '';
  const razonEmisor = payload.razon_social_emisor || payload.emisor || payload.nombre_emisor || 'EMISOR';
  const rncComprador = payload.rnc_comprador || payload.rnc_receptor || payload.rnc_cliente || '';
  const razonComprador = payload.razon_social_comprador || payload.receptor || payload.cliente || '';
  const moneda = payload.moneda || payload.codigo_moneda || 'DOP';
  const items = buildItems(payload);
  const subtotalItems = formatMoney(items.reduce((acc, item) => acc + (item.subtotal || 0), 0));
  const itbisItems = formatMoney(items.reduce((acc, item) => acc + (item.itbis || 0), 0));
  const totalDoc = formatMoney(parseNumberLike(payload.total) ?? parseNumberLike(payload.monto_total) ?? subtotalItems + itbisItems);

  const itemsXml = items
    .map(
      (item) => `
      <Item>
        <NumeroLinea>${item.linea}</NumeroLinea>
        <IndicadorFacturacion>1</IndicadorFacturacion>
        <NombreItem>${escapeXml(item.descripcion)}</NombreItem>
        <CantidadItem>${Number(item.cantidad || 1).toFixed(2)}</CantidadItem>
        <PrecioUnitarioItem>${Number(item.precio || 0).toFixed(2)}</PrecioUnitarioItem>
        <MontoItem>${Number(item.subtotal || 0).toFixed(2)}</MontoItem>
      </Item>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns="https://dgii.gov.do/ecf">
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${escapeXml(tipoeCF)}</TipoeCF>
      <eNCF>${escapeXml(eNCF)}</eNCF>
      <FechaEmision>${escapeXml(fecha)}</FechaEmision>
      <TipoIngresos>01</TipoIngresos>
      <TipoMoneda>${escapeXml(moneda)}</TipoMoneda>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${escapeXml(rncEmisor)}</RNCEmisor>
      <RazonSocialEmisor>${escapeXml(razonEmisor)}</RazonSocialEmisor>
    </Emisor>
    <Comprador>
      <RNCComprador>${escapeXml(rncComprador)}</RNCComprador>
      <RazonSocialComprador>${escapeXml(razonComprador)}</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>${subtotalItems.toFixed(2)}</MontoGravadoTotal>
      <MontoITBIS>${itbisItems.toFixed(2)}</MontoITBIS>
      <MontoTotal>${totalDoc.toFixed(2)}</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>${itemsXml}
  </DetallesItems>
</ECF>`;
};

const buildResumenFcXml = ({ payload = {}, rncEmisorFallback = '' }) => {
  const fecha = normalizeDateIso(payload.fecha || payload.fecha_emision || payload.fecha_resumen);
  const rncEmisor = payload.rnc_emisor || payload.rnc || rncEmisorFallback || '';
  const cantidad =
    parseNumberLike(
      payload.cantidad_facturas ??
        payload.cantidad ??
        payload.total_facturas ??
        payload.facturas_total ??
        payload.cantidad_documentos
    ) || 1;
  const montoTotal =
    formatMoney(parseNumberLike(payload.monto_total ?? payload.total ?? payload.total_facturas ?? payload.total_documentos) || 0);
  const montoItbis = formatMoney(parseNumberLike(payload.itbis ?? payload.monto_itbis) || 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ResumenFacturaConsumo xmlns="https://dgii.gov.do/ecf">
  <RNCEmisor>${escapeXml(rncEmisor)}</RNCEmisor>
  <FechaResumen>${escapeXml(fecha)}</FechaResumen>
  <CantidadFacturas>${Math.max(1, Math.round(cantidad))}</CantidadFacturas>
  <MontoTotalFacturas>${montoTotal.toFixed(2)}</MontoTotalFacturas>
  <MontoITBISTotal>${montoItbis.toFixed(2)}</MontoITBISTotal>
</ResumenFacturaConsumo>`;
};

const buildSetFieldsXml = ({ payload = {}, casoCodigo = '', flujo = '', tipoDocumento = '', hoja = '', filaExcel = 0 }) => {
  const entries = Object.entries(payload || {});
  const fieldsXml = entries
    .map(([key, value], index) => {
      const isEmpty = value === null || value === undefined || String(value).trim() === '';
      return (
        `    <Campo orden="${index + 1}" nombre="${escapeXml(key)}" vacio="${isEmpty ? '1' : '0'}">` +
        `${isEmpty ? '' : escapeXml(value)}</Campo>`
      );
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<SetPruebaCaso>
  <CasoCodigo>${escapeXml(casoCodigo)}</CasoCodigo>
  <Flujo>${escapeXml(flujo)}</Flujo>
  <TipoDocumento>${escapeXml(tipoDocumento)}</TipoDocumento>
  <Hoja>${escapeXml(hoja)}</Hoja>
  <FilaExcel>${Number(filaExcel || 0)}</FilaExcel>
  <Campos>
${fieldsXml}
  </Campos>
</SetPruebaCaso>`;
};

const buildOrderGuideLines = () => [
  'Orden de emision aplicado (DGII Paso 2):',
  '1) 31, 32 >= 250k, 41, 43, 44, 45, 46, 47',
  '2) 33, 34',
  '3) Resumen FC 32 < 250k',
  '4) Facturas FC 32 < 250k',
];

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

  const statusTextRaw = pick('estado', 'estatus', 'status', 'resultado', 'message', 'mensaje') || rawText;
  const statusText = String(statusTextRaw || '').toLowerCase();
  const accepted = /aceptad|aprobad|valido|validado|recibido|ok|success/.test(statusText) && !/rechaz|error|invalid/.test(statusText);
  const rejected = /rechaz|error|invalid|fallo|deneg/.test(statusText);

  const code = pick('codigo', 'code', 'codigorespuesta', 'idrespuesta', 'idestado') || (rawText.match(/<Codigo>([^<]+)<\/Codigo>/i)?.[1] || null);
  const message = pick('mensaje', 'message', 'descripcion', 'detalle', 'observacion') || (rawText.match(/<Mensaje>([^<]+)<\/Mensaje>/i)?.[1] || null);
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

const decodeBase64Input = (input) => {
  if (!input || typeof input !== 'string') return null;
  const clean = input.includes(',') ? input.split(',').pop() : input;
  if (!clean) return null;
  return Buffer.from(clean, 'base64');
};

const looksLikeXml = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^<\?xml/i.test(text) || /^<[a-zA-Z_]/.test(text);
};

const extractSignedXmlFromBody = (body = {}) => {
  const base64 =
    body.xml_firmada_base64 ||
    body.xmlFirmadaBase64 ||
    body.archivo_base64 ||
    body.archivoBase64 ||
    '';
  if (base64) {
    const buffer = decodeBase64Input(base64);
    const text = buffer ? buffer.toString('utf8').trim() : '';
    if (looksLikeXml(text)) return text;
  }
  const raw = body.xml_firmada || body.xmlFirmada || body.xml || '';
  const textRaw = String(raw || '').trim();
  return looksLikeXml(textRaw) ? textRaw : '';
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

const signXmlDocument = ({ xml, privateKeyPem, certPem }) => {
  const sig = new SignedXml();
  sig.privateKey = privateKeyPem;
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  sig.addReference({
    xpath: '/*',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    isEmptyUri: true,
  });
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${stripPem(certPem)}</X509Certificate></X509Data>`,
    getKey: () => null,
  };
  sig.computeSignature(xml, { location: { reference: '/*', action: 'append' } });
  return sig.getSignedXml();
};
const parseXlsxCases = ({ fileBuffer, fileName }) => {
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    raw: false,
    cellDates: true,
    dense: false,
  });
  const cases = [];
  let runningOrder = 1;

  for (const sheetName of workbook.SheetNames || []) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false,
    });
    if (!rows.length) continue;

    const headerRowIndex = detectHeaderRowIndex(rows);
    const headerRow = Array.isArray(rows[headerRowIndex]) ? rows[headerRowIndex] : [];
    const headers = headerRow.map((v, idx) => normalizeHeader(v, idx));

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const sourceRow = Array.isArray(rows[i]) ? rows[i] : [];
      if (!sourceRow.length) continue;
      const rowObj = {};
      let hasData = false;
      const maxCols = Math.max(headers.length, sourceRow.length);
      for (let col = 0; col < maxCols; col += 1) {
        const key = headers[col] || `col_${col + 1}`;
        const sanitized = sanitizeCellValue(sourceRow[col]);
        rowObj[key] = sanitized;
        if (sanitized !== null && sanitized !== '') hasData = true;
      }
      if (!hasData) continue;

      const montoTotalRaw = parseNumberLike(
        pickByPatterns(rowObj, [/monto_?total/i, /total_?monto/i, /^total$/i, /importe/i, /monto/i])
      );

      const caseCodeRaw = pickByPatterns(rowObj, [/caso/i, /id_?prueba/i, /codigo/i]);
      const ordenEnvioRaw = parseNumberLike(pickByPatterns(rowObj, [/orden/i, /secuencia/i, /prioridad/i]));
      const tipoDocumento = pickByPatterns(rowObj, [/tipo_?comprobante/i, /tipo_?ecf/i, /^tipo$/i]);
      const encf = pickByPatterns(rowObj, [/e_?ncf/i, /encf/i]);
      const ncf = pickByPatterns(rowObj, [/\bncf\b/i]);
      const flujo = inferFlow({ row: rowObj, sheetName, montoTotal: montoTotalRaw, tipoDocumento });

      cases.push({
        sheetName,
        excelRow: i + 1,
        caseCode: caseCodeRaw ? String(caseCodeRaw) : `${sheetName}-${i + 1}`,
        order: Number.isFinite(ordenEnvioRaw) ? Number(ordenEnvioRaw) : 0,
        sourceOrder: runningOrder,
        flow: flujo,
        tipoDocumento: tipoDocumento ? String(tipoDocumento) : null,
        encf: encf ? String(encf) : null,
        ncf: ncf ? String(ncf) : null,
        montoTotal: formatMoney(montoTotalRaw),
        payload: rowObj,
      });
      runningOrder += 1;
    }
  }

  const sortedCases = [...cases].sort((a, b) => {
    const byEmission = buildEmissionSortValue({
      flujo: a.flow,
      tipoDocumento: a.tipoDocumento,
      sourceOrder: a.sourceOrder,
      excelRow: a.excelRow,
    }) -
      buildEmissionSortValue({
        flujo: b.flow,
        tipoDocumento: b.tipoDocumento,
        sourceOrder: b.sourceOrder,
        excelRow: b.excelRow,
      });
    if (byEmission !== 0) return byEmission;
    return (a.sourceOrder || 0) - (b.sourceOrder || 0);
  });
  sortedCases.forEach((item, index) => {
    item.order = index + 1;
  });

  const totals = {
    totalCases: sortedCases.length,
    totalEcf: sortedCases.filter((c) => c.flow === 'ECF_NORMAL').length,
    totalFc: sortedCases.filter((c) => c.flow === 'FC_MENOR_250K').length,
    totalResumenes: sortedCases.filter((c) => c.flow === 'RESUMEN_FC').length,
  };

  return {
    fileName,
    workbookSheets: workbook.SheetNames || [],
    cases: sortedCases,
    totals,
  };
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

  // En DGII certificacion la autenticacion oficial es por Semilla + ValidarSemilla.
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

const createDgiiPaso2Router = ({ db, requireUsuarioSesion, tienePermisoAdmin, obtenerNegocioIdUsuario } = {}) => {
  if (!db || !requireUsuarioSesion || !tienePermisoAdmin || !obtenerNegocioIdUsuario) {
    throw new Error('createDgiiPaso2Router requiere db y middlewares de sesion.');
  }

  const router = express.Router();
  if (dgiiPaso2MissingDeps.length) {
    router.use((req, res) => {
      return res.status(503).json({
        ok: false,
        error:
          `Modulo DGII Paso 2 no disponible. Faltan dependencias: ${dgiiPaso2MissingDeps.join(', ')}. ` +
          'Ejecuta npm install para habilitarlo.',
      });
    });
    return router;
  }

  const resolveEndpoints = (row) => {
    const custom = toSafeJson(row?.endpoints_json, {});
    return {
      autenticacion: custom.autenticacion || DGII_DEFAULT_ENDPOINTS.autenticacion,
      recepcion: custom.recepcion || DGII_DEFAULT_ENDPOINTS.recepcion,
      consultaResultado: custom.consultaResultado || DGII_DEFAULT_ENDPOINTS.consultaResultado,
      recepcionFc: custom.recepcionFc || custom.recepcionFC || DGII_DEFAULT_ENDPOINTS.recepcionFc,
    };
  };

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

  const saveConfig = async ({
    negocioId,
    usuarioId,
    usuarioCertificacion,
    claveCertificacion,
    p12NombreArchivo,
    p12Base64,
    p12Password,
    rncEmisor,
    modoAutenticacion,
    endpoints,
    preserveSecrets = true,
  }) => {
    const existing = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);

    const claveToStore =
      claveCertificacion !== undefined
        ? encryptSensitive(claveCertificacion || '')
        : preserveSecrets
          ? existing?.clave_certificacion_enc || null
          : null;

    const p12PasswordToStore =
      p12Password !== undefined
        ? encryptSensitive(p12Password || '')
        : preserveSecrets
          ? existing?.p12_password_enc || null
          : null;

    const p12Base64ToStore =
      p12Base64 !== undefined ? p12Base64 || null : preserveSecrets ? existing?.p12_base64 || null : null;
    const p12NombreToStore =
      p12NombreArchivo !== undefined
        ? p12NombreArchivo || null
        : preserveSecrets
          ? existing?.p12_nombre_archivo || null
          : null;

    const endpointsJson = JSON.stringify({
      ...DGII_DEFAULT_ENDPOINTS,
      ...(toSafeJson(existing?.endpoints_json, {}) || {}),
      ...(endpoints && typeof endpoints === 'object' ? endpoints : {}),
    });

    await db.run(
      `INSERT INTO dgii_paso2_config (
         negocio_id, usuario_certificacion, clave_certificacion_enc,
         p12_nombre_archivo, p12_base64, p12_password_enc, rnc_emisor,
         modo_autenticacion, endpoints_json, token_cache, token_expira_en, updated_by_usuario_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE
         usuario_certificacion = VALUES(usuario_certificacion),
         clave_certificacion_enc = VALUES(clave_certificacion_enc),
         p12_nombre_archivo = VALUES(p12_nombre_archivo),
         p12_base64 = VALUES(p12_base64),
         p12_password_enc = VALUES(p12_password_enc),
         rnc_emisor = VALUES(rnc_emisor),
         modo_autenticacion = VALUES(modo_autenticacion),
         endpoints_json = VALUES(endpoints_json),
         token_cache = NULL,
         token_expira_en = NULL,
         updated_by_usuario_id = VALUES(updated_by_usuario_id)`,
      [
        negocioId,
        usuarioCertificacion || '',
        claveToStore,
        p12NombreToStore,
        p12Base64ToStore,
        p12PasswordToStore,
        rncEmisor || null,
        modoAutenticacion || 'AUTO',
        endpointsJson,
        usuarioId || null,
      ]
    );
  };

  const ensureCanAdmin = (req, res, callback) =>
    requireUsuarioSesion(req, res, (usuarioSesion) => {
      if (!tienePermisoAdmin(usuarioSesion)) {
        return res.status(403).json({ ok: false, error: 'Acceso restringido para modulo DGII Paso 2.' });
      }
      return callback(usuarioSesion);
    });

  const registrarIntento = async ({
    casoId,
    negocioId,
    tipoEnvio,
    endpoint,
    requestHeaders,
    requestBody,
    responseStatus,
    responseHeaders,
    responseBody,
    resultado,
    codigo,
    mensaje,
    trackId,
  }) => {
    await db.run(
      `INSERT INTO dgii_paso2_intentos (
         caso_id, negocio_id, tipo_envio, endpoint, request_headers_json, request_body,
         response_status, response_headers_json, response_body, resultado, codigo, mensaje, track_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        casoId,
        negocioId,
        tipoEnvio,
        endpoint || null,
        requestHeaders ? JSON.stringify(requestHeaders) : null,
        requestBody || null,
        responseStatus || null,
        responseHeaders ? JSON.stringify(responseHeaders) : null,
        responseBody || null,
        resultado || 'ERROR',
        codigo || null,
        mensaje || null,
        trackId || null,
      ]
    );
  };

  const actualizarCaso = async ({
    casoId,
    xmlGenerado,
    xmlFirmado,
    estadoLocal,
    dgiiEstado,
    dgiiCodigo,
    dgiiMensaje,
    dgiiTrackId,
    incrementarIntentos = false,
  }) => {
    const fields = [];
    const params = [];
    if (xmlGenerado !== undefined) {
      fields.push('xml_generado = ?');
      params.push(xmlGenerado);
    }
    if (xmlFirmado !== undefined) {
      fields.push('xml_firmado = ?');
      params.push(xmlFirmado);
    }
    if (estadoLocal !== undefined) {
      fields.push('estado_local = ?');
      params.push(estadoLocal);
    }
    if (dgiiEstado !== undefined) {
      fields.push('dgii_estado = ?');
      params.push(dgiiEstado);
    }
    if (dgiiCodigo !== undefined) {
      fields.push('dgii_codigo = ?');
      params.push(dgiiCodigo);
    }
    if (dgiiMensaje !== undefined) {
      fields.push('dgii_mensaje = ?');
      params.push(dgiiMensaje);
    }
    if (dgiiTrackId !== undefined) {
      fields.push('dgii_track_id = ?');
      params.push(dgiiTrackId);
    }
    if (incrementarIntentos) {
      fields.push('intentos = intentos + 1');
    }
    fields.push('ultimo_procesado_at = CURRENT_TIMESTAMP');
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(casoId);
    await db.run(`UPDATE dgii_paso2_casos SET ${fields.join(', ')} WHERE id = ?`, params);
  };
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
          });

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

  const getTokenFromCache = async (configRow) => {
    const tokenCache = toSafeJson(configRow?.token_cache, null);
    if (!tokenCache?.token) return '';
    if (!configRow?.token_expira_en) return '';
    const exp = new Date(configRow.token_expira_en);
    if (Number.isNaN(exp.getTime())) return '';
    if (Date.now() >= exp.getTime() - 60 * 1000) return '';
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

  const validarConfiguracionAutenticacion = (config, { hasTokenCache = false } = {}) => {
    const endpoints = config?.endpoints || DGII_DEFAULT_ENDPOINTS;
    const configuredMode = String(config?.modo_autenticacion || 'AUTO').toUpperCase();
    const mode = isOfficialDgiiAuthBase(endpoints.autenticacion) ? 'SEMILLA' : configuredMode;
    const hasCreds = Boolean(config?.usuario_certificacion && config?.clave_certificacion);
    const hasP12 = Boolean(config?.p12_base64 && config?.p12_password != null);
    if (mode === 'CREDENCIALES' && !hasCreds) {
      return 'Faltan usuario y clave DGII para autenticacion por credenciales.';
    }
    if (mode === 'SEMILLA' && !hasP12 && !hasTokenCache) {
      return 'Falta certificado P12 y/o clave para autenticacion por semilla.';
    }
    if (mode === 'AUTO' && !hasCreds && !hasP12 && !hasTokenCache) {
      return 'Configura credenciales DGII o certificado P12 para autenticar.';
    }
    return null;
  };

  const resolveToken = async ({ config, configRow, negocioId }) => {
    const cached = await getTokenFromCache(configRow);
    if (cached) return cached;
    const auth = await autenticarDGII({ config });
    if (!auth?.token) throw new Error('DGII no devolvio token de autenticacion.');
    await saveTokenCache({ negocioId, token: auth.token, expira: auth.expira });
    return auth.token;
  };

  const sendXmlToDgii = async ({ endpoint, apiPath, xmlPayload, token }) => {
    const endpointFinal = withApiPath(endpoint, apiPath);
    const formData = new FormData();
    formData.append('xml', new Blob([String(xmlPayload || '')], { type: 'application/xml' }), 'ecf.xml');
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
      if (attempt.contentType) headers['Content-Type'] = attempt.contentType;
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
    return last || { ok: false, status: 500, raw: '', extracted: {} };
  };

  const calcularResumenSet = async (setId, negocioId) => {
    const totals = await db.get(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN estado_local = 'ACEPTADO' THEN 1 ELSE 0 END) AS aceptados,
         SUM(CASE WHEN estado_local = 'RECHAZADO' THEN 1 ELSE 0 END) AS rechazados,
         SUM(CASE WHEN estado_local = 'ENVIADO' THEN 1 ELSE 0 END) AS enviados,
         SUM(CASE WHEN estado_local = 'PENDIENTE' THEN 1 ELSE 0 END) AS pendientes,
         SUM(CASE WHEN flujo = 'RESUMEN_FC' THEN 1 ELSE 0 END) AS total_resumenes,
         SUM(CASE WHEN flujo = 'RESUMEN_FC' AND estado_local = 'ACEPTADO' THEN 1 ELSE 0 END) AS resumenes_aceptados,
         SUM(CASE WHEN flujo <> 'RESUMEN_FC' THEN 1 ELSE 0 END) AS total_comprobantes,
         SUM(CASE WHEN flujo <> 'RESUMEN_FC' AND estado_local = 'ACEPTADO' THEN 1 ELSE 0 END) AS comprobantes_aceptados
       FROM dgii_paso2_casos
       WHERE set_id = ? AND negocio_id = ?`,
      [setId, negocioId]
    );
    return {
      total: Number(totals?.total || 0),
      aceptados: Number(totals?.aceptados || 0),
      rechazados: Number(totals?.rechazados || 0),
      enviados: Number(totals?.enviados || 0),
      pendientes: Number(totals?.pendientes || 0),
      resumenes: {
        total: Number(totals?.total_resumenes || 0),
        aceptados: Number(totals?.resumenes_aceptados || 0),
      },
      comprobantes: {
        total: Number(totals?.total_comprobantes || 0),
        aceptados: Number(totals?.comprobantes_aceptados || 0),
      },
    };
  };

  const procesarCasoInterno = async ({ caso, config, configRow, negocioId }) => {
    const payload = toSafeJson(caso.payload_json, {});
    const endpoints = config.endpoints;
    const token = await resolveToken({ config, configRow, negocioId });

    let xmlGenerado = '';
    if (caso.flujo === 'RESUMEN_FC') {
      xmlGenerado = buildResumenFcXml({ payload, rncEmisorFallback: config.rnc_emisor || '' });
    } else {
      xmlGenerado = buildEcfXml({ payload, flujo: caso.flujo || 'ECF_NORMAL', rncEmisorFallback: config.rnc_emisor || '' });
    }

    let xmlFirmado = xmlGenerado;
    if (config.p12_base64 && config.p12_password != null) {
      const cert = extractPemFromP12({ p12Base64: config.p12_base64, p12Password: config.p12_password || '' });
      xmlFirmado = signXmlDocument({ xml: xmlGenerado, privateKeyPem: cert.privateKeyPem, certPem: cert.certPem });
    }

    await actualizarCaso({ casoId: caso.id, xmlGenerado, xmlFirmado, estadoLocal: 'PROCESANDO', incrementarIntentos: true });

    const esResumen = caso.flujo === 'RESUMEN_FC';
    const endpoint = esResumen ? endpoints.recepcionFc : endpoints.recepcion;
    const apiPath = esResumen ? '/api/recepcion/ecf' : '/api/FacturasElectronicas';
    const envio = await sendXmlToDgii({ endpoint, apiPath, xmlPayload: xmlFirmado, token });

    const envioAccepted = envio.extracted.accepted || false;
    const envioRejected = envio.extracted.rejected || (!envio.ok && !envio.extracted.accepted);
    const envioState = envioAccepted ? 'ACEPTADO' : envioRejected ? 'RECHAZADO' : 'ENVIADO';
    const trackId = envio.extracted.trackId || caso.dgii_track_id || null;

    await registrarIntento({
      casoId: caso.id,
      negocioId,
      tipoEnvio: esResumen ? 'RESUMEN' : 'ECF',
      endpoint: envio.endpoint || endpoint,
      requestHeaders: envio.requestHeaders,
      requestBody: xmlFirmado,
      responseStatus: envio.status,
      responseHeaders: envio.headers,
      responseBody: envio.raw,
      resultado: envioState,
      codigo: envio.extracted.code,
      mensaje: envio.extracted.message || envio.extracted.statusText,
      trackId,
    });

    let finalState = envioState;
    let finalCode = envio.extracted.code || null;
    let finalMessage = envio.extracted.message || envio.extracted.statusText || null;
    let finalTrackId = trackId;

    if (trackId && endpoints.consultaResultado) {
      const consulta = await consultDgiiResult({
        endpoint: endpoints.consultaResultado,
        token,
        trackId,
        encf: caso.encf || payload.encf || payload.ncf || '',
        rncEmisor: config.rnc_emisor || payload.rnc_emisor || '',
      });

      const consultaState = consulta.extracted.accepted ? 'ACEPTADO' : consulta.extracted.rejected ? 'RECHAZADO' : finalState;

      await registrarIntento({
        casoId: caso.id,
        negocioId,
        tipoEnvio: 'CONSULTA',
        endpoint: consulta.endpoint || endpoints.consultaResultado,
        requestHeaders: consulta.requestHeaders,
        requestBody: consulta.requestBody || '',
        responseStatus: consulta.status,
        responseHeaders: consulta.headers,
        responseBody: consulta.raw,
        resultado: consultaState,
        codigo: consulta.extracted.code,
        mensaje: consulta.extracted.message || consulta.extracted.statusText,
        trackId: consulta.extracted.trackId || trackId,
      });

      finalState = consultaState;
      finalCode = consulta.extracted.code || finalCode;
      finalMessage = consulta.extracted.message || consulta.extracted.statusText || finalMessage;
      finalTrackId = consulta.extracted.trackId || finalTrackId;
    }

    await actualizarCaso({
      casoId: caso.id,
      xmlGenerado,
      xmlFirmado,
      estadoLocal: finalState,
      dgiiEstado: finalState,
      dgiiCodigo: finalCode,
      dgiiMensaje: finalMessage,
      dgiiTrackId: finalTrackId,
    });

    return {
      casoId: caso.id,
      estado: finalState,
      codigo: finalCode,
      mensaje: finalMessage,
      trackId: finalTrackId,
    };
  };

  router.get('/config', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const row = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!row) {
          return res.json({
            ok: true,
            config: {
              negocio_id: negocioId,
              usuario_certificacion: '',
              rnc_emisor: '',
              modo_autenticacion: 'AUTO',
              endpoints: DGII_DEFAULT_ENDPOINTS,
              tiene_clave: false,
              tiene_certificado: false,
            },
          });
        }
        return res.json({
          ok: true,
          config: {
            negocio_id: Number(row.negocio_id),
            usuario_certificacion: row.usuario_certificacion || '',
            rnc_emisor: row.rnc_emisor || '',
            modo_autenticacion: row.modo_autenticacion || 'AUTO',
            endpoints: resolveEndpoints(row),
            tiene_clave: Boolean(row.clave_certificacion_enc),
            tiene_certificado: Boolean(row.p12_base64),
            p12_nombre_archivo: row.p12_nombre_archivo || '',
            token_expira_en: row.token_expira_en || null,
          },
        });
      } catch (error) {
        console.error('DGII Paso2: error obteniendo config:', error?.message || error);
        return res.status(500).json({ ok: false, error: 'No se pudo cargar la configuracion DGII.' });
      }
    });
  });

  router.put('/config', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const body = req.body || {};
        await saveConfig({
          negocioId,
          usuarioId: usuarioSesion.id,
          usuarioCertificacion: body.usuario_certificacion ?? body.usuarioCertificacion,
          claveCertificacion: body.clave_certificacion ?? body.claveCertificacion,
          p12NombreArchivo: body.p12_nombre_archivo ?? body.p12NombreArchivo,
          p12Base64: body.p12_base64 ?? body.p12Base64,
          p12Password: body.p12_password ?? body.p12Password,
          rncEmisor: body.rnc_emisor ?? body.rncEmisor,
          modoAutenticacion: body.modo_autenticacion ?? body.modoAutenticacion,
          endpoints: body.endpoints,
          preserveSecrets: true,
        });
        return res.json({ ok: true });
      } catch (error) {
        console.error('DGII Paso2: error guardando config:', error?.message || error);
        return res.status(500).json({ ok: false, error: 'No se pudo guardar la configuracion DGII.' });
      }
    });
  });
  router.post('/importar-set', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const body = req.body || {};
        const fileName = String(body.nombre_archivo || body.nombreArchivo || 'set_pruebas.xlsx');
        const base64 = body.archivo_base64 || body.archivoBase64 || '';
        if (!base64) return res.status(400).json({ ok: false, error: 'Debes enviar el archivo XLSX en base64.' });

        const fileBuffer = decodeBase64Input(base64);
        if (!fileBuffer || !fileBuffer.length) {
          return res.status(400).json({ ok: false, error: 'No se pudo decodificar el archivo XLSX.' });
        }

        const parsed = parseXlsxCases({ fileBuffer, fileName });
        if (!parsed.cases.length) {
          return res.status(400).json({ ok: false, error: 'El set no contiene casos validos. Verifica hojas y encabezados.' });
        }

        await db.run('BEGIN');
        const setInsert = await db.run(
          `INSERT INTO dgii_paso2_sets (
             negocio_id, nombre_archivo, hash_sha256, metadata_json,
             total_casos, total_ecf, total_fc, total_resumenes, estado, creado_por_usuario_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CARGADO', ?)`,
          [
            negocioId,
            fileName,
            hashSha256(fileBuffer),
            JSON.stringify({ sheets: parsed.workbookSheets }),
            parsed.totals.totalCases,
            parsed.totals.totalEcf,
            parsed.totals.totalFc,
            parsed.totals.totalResumenes,
            usuarioSesion.id || null,
          ]
        );

        const setId = Number(setInsert?.lastID || 0);
        if (!setId) throw new Error('No fue posible crear el lote DGII Paso 2.');

        for (const item of parsed.cases) {
          await db.run(
            `INSERT INTO dgii_paso2_casos (
               set_id, negocio_id, hoja, fila_excel, caso_codigo, orden_envio, flujo,
               tipo_documento, encf, ncf, monto_total, payload_json, estado_local
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
            [
              setId,
              negocioId,
              item.sheetName,
              item.excelRow,
              item.caseCode,
              item.order || 0,
              item.flow,
              item.tipoDocumento || null,
              item.encf || null,
              item.ncf || null,
              item.montoTotal || 0,
              JSON.stringify(item.payload || {}),
            ]
          );
        }
        await db.run('COMMIT');

        const resumen = await calcularResumenSet(setId, negocioId);
        return res.json({ ok: true, set_id: setId, archivo: fileName, totals: parsed.totals, resumen });
      } catch (error) {
        try {
          await db.run('ROLLBACK');
        } catch (rollbackError) {}
        console.error('DGII Paso2: error importando set:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'No se pudo importar el set de pruebas DGII.' });
      }
    });
  });

  router.get('/sets', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const rows = await db.all(
          `SELECT id, nombre_archivo, metadata_json, total_casos, total_ecf, total_fc, total_resumenes, estado, created_at, updated_at
             FROM dgii_paso2_sets
            WHERE negocio_id = ?
            ORDER BY id DESC
            LIMIT 50`,
          [negocioId]
        );

        const enriched = [];
        for (const row of rows || []) {
          const resumen = await calcularResumenSet(row.id, negocioId);
          const metadata = toSafeJson(row.metadata_json, {});
          enriched.push({
            ...row,
            resumen,
            ultimo_export_xml: metadata.xml_export || null,
          });
        }

        return res.json({ ok: true, sets: enriched });
      } catch (error) {
        console.error('DGII Paso2: error listando sets:', error?.message || error);
        return res.status(500).json({ ok: false, error: 'No se pudieron listar los lotes DGII.' });
      }
    });
  });

  router.get('/sets/:setId/casos', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const setId = Number(req.params.setId);
        if (!Number.isFinite(setId) || setId <= 0) return res.status(400).json({ ok: false, error: 'setId invalido.' });

        const casos = await db.all(
          `SELECT id, set_id, hoja, fila_excel, caso_codigo, orden_envio, flujo, tipo_documento,
                  encf, ncf, monto_total, estado_local, dgii_estado, dgii_codigo, dgii_mensaje, dgii_track_id,
                  intentos, ultimo_procesado_at, created_at, updated_at
             FROM dgii_paso2_casos
            WHERE negocio_id = ? AND set_id = ?
            ORDER BY orden_envio ASC, id ASC`,
          [negocioId, setId]
        );
        const casosOrdenados = [...(casos || [])].sort((a, b) => {
          const byEmission =
            buildEmissionSortValue({
              flujo: a.flujo,
              tipoDocumento: a.tipo_documento,
              sourceOrder: a.orden_envio,
              excelRow: a.fila_excel,
            }) -
            buildEmissionSortValue({
              flujo: b.flujo,
              tipoDocumento: b.tipo_documento,
              sourceOrder: b.orden_envio,
              excelRow: b.fila_excel,
            });
          if (byEmission !== 0) return byEmission;
          return Number(a.id || 0) - Number(b.id || 0);
        });
        casosOrdenados.forEach((item, index) => {
          item.orden_envio = index + 1;
        });

        const resumen = await calcularResumenSet(setId, negocioId);
        return res.json({ ok: true, resumen, casos: casosOrdenados || [] });
      } catch (error) {
        console.error('DGII Paso2: error listando casos:', error?.message || error);
        return res.status(500).json({ ok: false, error: 'No se pudieron listar los casos DGII.' });
      }
    });
  });

  router.post('/sets/:setId/generar-xml', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const setId = Number(req.params.setId);
        if (!Number.isFinite(setId) || setId <= 0) return res.status(400).json({ ok: false, error: 'setId invalido.' });

        const setRow = await db.get(
          `SELECT id, negocio_id, nombre_archivo, metadata_json
             FROM dgii_paso2_sets
            WHERE id = ? AND negocio_id = ?
            LIMIT 1`,
          [setId, negocioId]
        );
        if (!setRow) return res.status(404).json({ ok: false, error: 'Lote DGII no encontrado.' });

        const casos = await db.all(
          `SELECT id, hoja, fila_excel, caso_codigo, orden_envio, flujo, tipo_documento, encf, ncf, payload_json
             FROM dgii_paso2_casos
            WHERE negocio_id = ? AND set_id = ?
            ORDER BY orden_envio ASC, id ASC`,
          [negocioId, setId]
        );
        if (!Array.isArray(casos) || !casos.length) {
          return res.status(400).json({ ok: false, error: 'El lote no tiene casos para generar XML.' });
        }
        const casosOrdenados = [...casos].sort((a, b) => {
          const byEmission =
            buildEmissionSortValue({
              flujo: a.flujo,
              tipoDocumento: a.tipo_documento,
              sourceOrder: a.orden_envio,
              excelRow: a.fila_excel,
            }) -
            buildEmissionSortValue({
              flujo: b.flujo,
              tipoDocumento: b.tipo_documento,
              sourceOrder: b.orden_envio,
              excelRow: b.fila_excel,
            });
          if (byEmission !== 0) return byEmission;
          return Number(a.id || 0) - Number(b.id || 0);
        });

        const body = req.body || {};
        const incluirCamposSet = body.incluir_campos_set !== undefined ? Boolean(body.incluir_campos_set) : true;

        let rncFallback = '';
        try {
          const config = await loadConfig(negocioId);
          rncFallback = config?.rnc_emisor || '';
        } catch (error) {
          rncFallback = '';
        }

        const stamp = formatTimestampCompact(new Date());
        const baseExportDir = path.join(__dirname, 'storage', 'dgii', 'paso2_xml', `negocio_${negocioId}`);
        const exportDir = path.join(baseExportDir, `set_${setId}_${stamp}`);
        await fs.mkdir(exportDir, { recursive: true });

        const manifestCases = [];
        for (let index = 0; index < casosOrdenados.length; index += 1) {
          const caso = casosOrdenados[index];
          const payload = toSafeJson(caso.payload_json, {});
          const xmlBase =
            caso.flujo === 'RESUMEN_FC'
              ? buildResumenFcXml({ payload, rncEmisorFallback: rncFallback })
              : buildEcfXml({ payload, flujo: caso.flujo || 'ECF_NORMAL', rncEmisorFallback: rncFallback });

          const emission = resolveEmissionPhase({
            flujo: caso.flujo,
            tipoDocumento: caso.tipo_documento || payload.tipoecf || payload.tipo_ecf || payload.tipo || '',
          });
          const tipoDoc = normalizeDocType(caso.tipo_documento || payload.tipoecf || payload.tipo_ecf || payload.tipo || '');
          const filePrefix = String(index + 1).padStart(4, '0');
          const caseKey = sanitizeForFileName(caso.caso_codigo || caso.encf || caso.ncf || `caso_${caso.id}`, `caso_${caso.id}`);
          const mainFileName = `${filePrefix}_F${emission.phase}_${tipoDoc || 'NA'}_${caseKey}.xml`;
          const mainFilePath = path.join(exportDir, mainFileName);
          await fs.writeFile(mainFilePath, xmlBase, 'utf8');

          let camposFileName = null;
          if (incluirCamposSet) {
            camposFileName = `${filePrefix}_F${emission.phase}_${tipoDoc || 'NA'}_${caseKey}__campos_set.xml`;
            const camposXml = buildSetFieldsXml({
              payload,
              casoCodigo: caso.caso_codigo || '',
              flujo: caso.flujo || '',
              tipoDocumento: caso.tipo_documento || '',
              hoja: caso.hoja || '',
              filaExcel: caso.fila_excel || 0,
            });
            await fs.writeFile(path.join(exportDir, camposFileName), camposXml, 'utf8');
          }

          await db.run(
            `UPDATE dgii_paso2_casos
                SET xml_generado = ?, xml_firmado = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND negocio_id = ?`,
            [xmlBase, caso.id, negocioId]
          );

          manifestCases.push({
            orden_envio: Number(caso.orden_envio || 0),
            fase_emision: emission.phase,
            fase_label: emission.phaseLabel,
            tipo_documento: tipoDoc || null,
            caso_codigo: caso.caso_codigo || null,
            flujo: caso.flujo || null,
            archivo_xml: mainFileName,
            archivo_campos_set: camposFileName,
          });
        }

        const orderGuide = buildOrderGuideLines();
        const readmeLines = [
          'POSIUM - DGII Paso 2 (XML sin firma)',
          `Negocio: ${negocioId}`,
          `Lote: ${setId}`,
          `Archivo set: ${setRow.nombre_archivo || ''}`,
          `Generado: ${new Date().toISOString()}`,
          '',
          ...orderGuide,
          '',
          'Archivos:',
          ...manifestCases.map(
            (item) =>
              `${String(item.orden_envio).padStart(3, '0')} | F${item.fase_emision} | ${item.tipo_documento || 'NA'} | ` +
              `${item.caso_codigo || '--'} | ${item.archivo_xml}`
          ),
          '',
          'Notas:',
          '- Estos XML se generan sin firma digital.',
          '- Firma los XML con la app oficial DGII antes de enviarlos.',
          '- Si deseas verificar campos y orden del set, usa los archivos *__campos_set.xml.',
        ];

        const manifest = {
          negocio_id: negocioId,
          set_id: setId,
          archivo_set: setRow.nombre_archivo || null,
          generado_en: new Date().toISOString(),
          carpeta_absoluta: exportDir,
          carpeta_relativa: path.relative(__dirname, exportDir),
          casos: manifestCases,
        };

        await fs.writeFile(path.join(exportDir, 'README.txt'), readmeLines.join('\r\n'), 'utf8');
        await fs.writeFile(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        const setMetadata = toSafeJson(setRow.metadata_json, {});
        setMetadata.xml_export = {
          generado_en: manifest.generado_en,
          carpeta_relativa: manifest.carpeta_relativa,
          carpeta_absoluta: manifest.carpeta_absoluta,
          casos: manifestCases.length,
          incluye_campos_set: incluirCamposSet,
        };
        await db.run(
          `UPDATE dgii_paso2_sets
              SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND negocio_id = ?`,
          [JSON.stringify(setMetadata), setId, negocioId]
        );

        return res.json({
          ok: true,
          set_id: setId,
          casos: manifestCases.length,
          carpeta_absoluta: manifest.carpeta_absoluta,
          carpeta_relativa: manifest.carpeta_relativa,
          manifest: path.join(exportDir, 'manifest.json'),
        });
      } catch (error) {
        console.error('DGII Paso2: error generando XML del set:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'No se pudo generar XML del set.' });
      }
    });
  });

  router.get('/casos/:casoId/intentos', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const casoId = Number(req.params.casoId);
        if (!Number.isFinite(casoId) || casoId <= 0) return res.status(400).json({ ok: false, error: 'casoId invalido.' });

        const intentos = await db.all(
          `SELECT id, caso_id, tipo_envio, endpoint, response_status, resultado, codigo, mensaje, track_id, created_at
             FROM dgii_paso2_intentos
            WHERE negocio_id = ? AND caso_id = ?
            ORDER BY id DESC`,
          [negocioId, casoId]
        );

        return res.json({ ok: true, intentos: intentos || [] });
      } catch (error) {
        console.error('DGII Paso2: error listando intentos:', error?.message || error);
        return res.status(500).json({ ok: false, error: 'No se pudieron listar los intentos del caso.' });
      }
    });
  });

  router.post('/sets/:setId/procesar', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
      const setId = Number(req.params.setId);
      if (!Number.isFinite(setId) || setId <= 0) return res.status(400).json({ ok: false, error: 'setId invalido.' });

      try {
        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!configRow) return res.status(400).json({ ok: false, error: 'Debes configurar credenciales DGII antes de procesar.' });

        const config = await loadConfig(negocioId);
        const cachedToken = await getTokenFromCache(configRow);
        const authConfigError = validarConfiguracionAutenticacion(config, { hasTokenCache: Boolean(cachedToken) });
        if (authConfigError) return res.status(400).json({ ok: false, error: authConfigError });

        const body = req.body || {};
        const reprocesarRechazados = Boolean(body.reprocesar_rechazados ?? body.reprocesarRechazados ?? false);
        const soloPendientes = body.solo_pendientes !== undefined ? Boolean(body.solo_pendientes) : true;

        const whereParts = ['negocio_id = ?', 'set_id = ?'];
        const params = [negocioId, setId];
        if (soloPendientes && !reprocesarRechazados) {
          whereParts.push(`estado_local IN ('PENDIENTE', 'ENVIADO', 'PROCESANDO')`);
        } else if (reprocesarRechazados) {
          whereParts.push(`estado_local IN ('PENDIENTE', 'RECHAZADO', 'ENVIADO', 'PROCESANDO')`);
        }

        const casos = await db.all(
          `SELECT *
             FROM dgii_paso2_casos
            WHERE ${whereParts.join(' AND ')}
            ORDER BY orden_envio ASC, id ASC`,
          params
        );
        const casosOrdenados = [...(casos || [])].sort((a, b) => {
          const byEmission =
            buildEmissionSortValue({
              flujo: a.flujo,
              tipoDocumento: a.tipo_documento,
              sourceOrder: a.orden_envio,
              excelRow: a.fila_excel,
            }) -
            buildEmissionSortValue({
              flujo: b.flujo,
              tipoDocumento: b.tipo_documento,
              sourceOrder: b.orden_envio,
              excelRow: b.fila_excel,
            });
          if (byEmission !== 0) return byEmission;
          return Number(a.id || 0) - Number(b.id || 0);
        });

        const resultados = [];
        for (const caso of casosOrdenados) {
          try {
            if (caso.flujo === 'FC_MENOR_250K') {
              const resumenRelacionado = await db.get(
                `SELECT id, estado_local
                   FROM dgii_paso2_casos
                  WHERE negocio_id = ? AND set_id = ? AND flujo = 'RESUMEN_FC'
                    AND (
                      (encf IS NOT NULL AND encf <> '' AND encf = ?)
                      OR (ncf IS NOT NULL AND ncf <> '' AND ncf = ?)
                    )
                  ORDER BY id ASC
                  LIMIT 1`,
                [negocioId, setId, caso.encf || '', caso.ncf || '']
              );

              if (resumenRelacionado && resumenRelacionado.estado_local !== 'ACEPTADO') {
                const resumenCaso = await db.get('SELECT * FROM dgii_paso2_casos WHERE id = ? AND negocio_id = ? LIMIT 1', [
                  resumenRelacionado.id,
                  negocioId,
                ]);
                if (resumenCaso) {
                  const resResumen = await procesarCasoInterno({ caso: resumenCaso, config, configRow, negocioId });
                  resultados.push({ ...resResumen, precondicion_para: caso.id });
                  if (resResumen.estado !== 'ACEPTADO') {
                    resultados.push({
                      casoId: caso.id,
                      estado: 'BLOQUEADO',
                      mensaje: 'No se envio factura <250k porque su resumen fue rechazado o no aceptado.',
                    });
                    continue;
                  }
                }
              }
            }

            const result = await procesarCasoInterno({ caso, config, configRow, negocioId });
            resultados.push(result);
          } catch (error) {
            const message = error?.message || 'Error inesperado procesando caso DGII.';
            await actualizarCaso({ casoId: caso.id, estadoLocal: 'RECHAZADO', dgiiEstado: 'RECHAZADO', dgiiMensaje: message, incrementarIntentos: true });
            await registrarIntento({
              casoId: caso.id,
              negocioId,
              tipoEnvio: 'ERROR_LOCAL',
              endpoint: null,
              requestHeaders: null,
              requestBody: null,
              responseStatus: 0,
              responseHeaders: null,
              responseBody: message,
              resultado: 'RECHAZADO',
              codigo: null,
              mensaje: message,
              trackId: null,
            });
            resultados.push({ casoId: caso.id, estado: 'RECHAZADO', mensaje: message });
          }
        }

        const resumen = await calcularResumenSet(setId, negocioId);
        return res.json({ ok: true, procesados: resultados.length, resultados, resumen });
      } catch (error) {
        console.error('DGII Paso2: error procesando set:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'Error procesando set DGII.' });
      }
    });
  });

  router.post('/casos/:casoId/procesar', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
      const casoId = Number(req.params.casoId);
      if (!Number.isFinite(casoId) || casoId <= 0) return res.status(400).json({ ok: false, error: 'casoId invalido.' });

      try {
        const caso = await db.get('SELECT * FROM dgii_paso2_casos WHERE id = ? AND negocio_id = ? LIMIT 1', [casoId, negocioId]);
        if (!caso) return res.status(404).json({ ok: false, error: 'Caso no encontrado.' });

        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!configRow) return res.status(400).json({ ok: false, error: 'Configura DGII antes de procesar casos.' });

        const config = await loadConfig(negocioId);
        const cachedToken = await getTokenFromCache(configRow);
        const authConfigError = validarConfiguracionAutenticacion(config, { hasTokenCache: Boolean(cachedToken) });
        if (authConfigError) return res.status(400).json({ ok: false, error: authConfigError });
        const result = await procesarCasoInterno({ caso, config, configRow, negocioId });
        return res.json({ ok: true, resultado: result });
      } catch (error) {
        console.error('DGII Paso2: error procesando caso:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'Error procesando el caso.' });
      }
    });
  });

  router.post('/casos/:casoId/consultar', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
      const casoId = Number(req.params.casoId);
      if (!Number.isFinite(casoId) || casoId <= 0) return res.status(400).json({ ok: false, error: 'casoId invalido.' });

      try {
        const caso = await db.get('SELECT * FROM dgii_paso2_casos WHERE id = ? AND negocio_id = ? LIMIT 1', [casoId, negocioId]);
        if (!caso) return res.status(404).json({ ok: false, error: 'Caso no encontrado.' });
        if (!caso.dgii_track_id) return res.status(400).json({ ok: false, error: 'El caso no tiene trackId para consulta.' });

        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!configRow) return res.status(400).json({ ok: false, error: 'Configura DGII antes de consultar.' });

        const config = await loadConfig(negocioId);
        const cachedToken = await getTokenFromCache(configRow);
        const authConfigError = validarConfiguracionAutenticacion(config, { hasTokenCache: Boolean(cachedToken) });
        if (authConfigError) return res.status(400).json({ ok: false, error: authConfigError });
        const token = await resolveToken({ config, configRow, negocioId });
        const consulta = await consultDgiiResult({
          endpoint: config.endpoints.consultaResultado,
          token,
          trackId: caso.dgii_track_id,
          encf: caso.encf || caso.ncf || '',
          rncEmisor: config.rnc_emisor || '',
        });

        const estadoFinal = consulta.extracted.accepted
          ? 'ACEPTADO'
          : consulta.extracted.rejected
            ? 'RECHAZADO'
            : caso.estado_local || 'ENVIADO';

        await registrarIntento({
          casoId,
          negocioId,
          tipoEnvio: 'CONSULTA',
          endpoint: consulta.endpoint || config.endpoints.consultaResultado,
          requestHeaders: consulta.requestHeaders,
          requestBody: consulta.requestBody || '',
          responseStatus: consulta.status,
          responseHeaders: consulta.headers,
          responseBody: consulta.raw,
          resultado: estadoFinal,
          codigo: consulta.extracted.code,
          mensaje: consulta.extracted.message || consulta.extracted.statusText,
          trackId: consulta.extracted.trackId || caso.dgii_track_id,
        });

        await actualizarCaso({
          casoId,
          estadoLocal: estadoFinal,
          dgiiEstado: estadoFinal,
          dgiiCodigo: consulta.extracted.code,
          dgiiMensaje: consulta.extracted.message || consulta.extracted.statusText,
          dgiiTrackId: consulta.extracted.trackId || caso.dgii_track_id,
        });

        return res.json({
          ok: true,
          estado: estadoFinal,
          codigo: consulta.extracted.code,
          mensaje: consulta.extracted.message || consulta.extracted.statusText,
          trackId: consulta.extracted.trackId || caso.dgii_track_id,
        });
      } catch (error) {
        console.error('DGII Paso2: error consultando caso:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'Error consultando estado en DGII.' });
      }
    });
  });

  router.post('/probar-autenticacion', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!configRow) return res.status(400).json({ ok: false, error: 'Configura DGII antes de probar autenticacion.' });

        const config = await loadConfig(negocioId);
        const authConfigError = validarConfiguracionAutenticacion(config);
        if (authConfigError) return res.status(400).json({ ok: false, error: authConfigError });
        const auth = await autenticarDGII({ config });
        await saveTokenCache({ negocioId, token: auth.token, expira: auth.expira });

        return res.json({
          ok: true,
          endpoint: auth.endpoint,
          token_preview: auth.token ? `${String(auth.token).slice(0, 12)}...` : null,
          token_expira_en: auth.expira || null,
        });
      } catch (error) {
        console.error('DGII Paso2: error en prueba auth:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'No se pudo autenticar en DGII.' });
      }
    });
  });

  router.post('/autenticacion/validar-semilla-firmada', (req, res) => {
    ensureCanAdmin(req, res, async (usuarioSesion) => {
      try {
        const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
        const configRow = await db.get('SELECT * FROM dgii_paso2_config WHERE negocio_id = ? LIMIT 1', [negocioId]);
        if (!configRow) return res.status(400).json({ ok: false, error: 'Configura DGII antes de validar semilla firmada.' });

        const config = await loadConfig(negocioId);
        const endpoints = config?.endpoints || DGII_DEFAULT_ENDPOINTS;
        const candidates = buildAuthCandidates(endpoints.autenticacion, 'SEMILLA');
        const candidate = candidates.find((item) => item.mode === 'SEMILLA' && item.validarUrl);
        if (!candidate?.validarUrl) {
          return res.status(400).json({ ok: false, error: 'No hay endpoint de validacion de semilla configurado.' });
        }

        const body = req.body || {};
        const xmlFirmada = extractSignedXmlFromBody(body);
        if (!xmlFirmada) {
          return res.status(400).json({
            ok: false,
            error: 'Debes enviar un XML firmado valido (xml_firmada/xml_firmada_base64).',
          });
        }

        const formData = new FormData();
        const fileName = sanitizeForFileName(body.nombre_archivo || body.nombreArchivo || 'semilla_firmada.xml', 'semilla_firmada.xml');
        formData.append('xml', new Blob([xmlFirmada], { type: 'application/xml' }), fileName);

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
        const parsed = parseTextResponse(validarText);
        const token = extractToken(validarText, parsed.json);

        if (!validarResp.ok || !token) {
          const message = parsed.extracted?.message || parsed.raw || `ValidarSemilla fallida (${validarResp.status}).`;
          return res.status(400).json({
            ok: false,
            status: validarResp.status,
            endpoint: candidate.validarUrl,
            error: message.slice(0, 1200),
          });
        }

        await saveTokenCache({ negocioId, token, expira: parsed?.json?.expira || null });
        return res.json({
          ok: true,
          endpoint: candidate.validarUrl,
          status: validarResp.status,
          token_preview: `${String(token).slice(0, 12)}...`,
          token_expira_en: parsed?.json?.expira || null,
        });
      } catch (error) {
        console.error('DGII Paso2: error validando semilla firmada externa:', error?.message || error);
        return res.status(500).json({ ok: false, error: error?.message || 'No se pudo validar la semilla firmada.' });
      }
    });
  });

  return router;
};

module.exports = createDgiiPaso2Router;
