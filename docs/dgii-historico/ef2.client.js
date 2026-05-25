const EF2_DEFAULT_BASE_URL = 'https://master.ef2.do/api2';
const EF2_DEFAULT_TIMEOUT_MS = 25000;

const normalizeEf2BaseUrl = (baseUrl = '') => String(baseUrl || '').trim().replace(/\/+$/, '') || EF2_DEFAULT_BASE_URL;

const withEf2Path = (baseUrl, apiPath = '') => {
  const cleanBase = normalizeEf2BaseUrl(baseUrl);
  const cleanPath = String(apiPath || '').trim();
  if (!cleanPath) return cleanBase;
  return `${cleanBase}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
};

const createTimeoutSignal = (timeoutMs = EF2_DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Timeout EF2')), Math.max(1000, Number(timeoutMs) || EF2_DEFAULT_TIMEOUT_MS));
  return {
    signal: controller.signal,
    done: () => clearTimeout(timeoutId),
  };
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = EF2_DEFAULT_TIMEOUT_MS) => {
  const timer = createTimeoutSignal(timeoutMs);
  try {
    return await fetch(url, { ...options, signal: timer.signal });
  } finally {
    timer.done();
  }
};

const parseEf2Response = async (response) => {
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (_) {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    raw,
    json,
  };
};

const buildEf2Message = (payload = {}, fallback = 'Operacion EF2 fallida.') => {
  if (!payload || typeof payload !== 'object') return fallback;
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  if (Array.isArray(payload.errors) && payload.errors.length) return payload.errors.map((item) => String(item)).join(' | ');
  return fallback;
};

const isEf2Token = (value = '') => /^tok_[A-Za-z0-9]+$/i.test(String(value || '').trim());

const loginEf2 = async ({ baseUrl, username, password, timeoutMs = EF2_DEFAULT_TIMEOUT_MS } = {}) => {
  const endpoint = withEf2Path(baseUrl, '/auth/login.php');
  const user = String(username || '').trim();
  const pass = String(password || '').trim();
  if (!user) throw new Error('EF2 requiere username para autenticarse.');
  if (!pass) throw new Error('EF2 requiere password o token para autenticarse.');

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        username: user,
        password: pass,
      }),
    },
    timeoutMs
  );

  const parsed = await parseEf2Response(response);
  if (!parsed.ok || parsed.json?.success === false) {
    throw new Error(buildEf2Message(parsed.json, `Autenticacion EF2 fallida (${parsed.status}).`));
  }

  const token = String(parsed.json?.token || '').trim();
  if (!token) {
    throw new Error('EF2 no devolvio token de autenticacion.');
  }

  return {
    token,
    empresa: parsed.json?.empresa || null,
    endpoint,
    raw: parsed.raw,
    json: parsed.json,
  };
};

const resolveEf2Token = async ({ baseUrl, username, password, timeoutMs = EF2_DEFAULT_TIMEOUT_MS } = {}) => {
  const candidate = String(password || '').trim();
  if (isEf2Token(candidate)) return candidate;
  const login = await loginEf2({ baseUrl, username, password, timeoutMs });
  return login.token;
};

const procesarEf2Factura = async ({ baseUrl, token, factura, timeoutMs = EF2_DEFAULT_TIMEOUT_MS } = {}) => {
  const endpoint = withEf2Path(baseUrl, '/procesar_factura.php');
  const bearer = String(token || '').trim();
  if (!bearer) throw new Error('EF2 requiere Bearer token para emitir facturas.');
  if (!factura || typeof factura !== 'object') throw new Error('Debes enviar un payload JSON valido para EF2.');

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(factura),
    },
    timeoutMs
  );

  const parsed = await parseEf2Response(response);
  if (!parsed.ok || parsed.json?.success === false) {
    throw new Error(buildEf2Message(parsed.json, `Procesamiento EF2 fallido (${parsed.status}).`));
  }

  return {
    endpoint,
    raw: parsed.raw,
    json: parsed.json,
    resultado: {
      success: Boolean(parsed.json?.success),
      ncf: parsed.json?.ncf || parsed.json?.eNCF || null,
      estado: parsed.json?.estado || parsed.json?.Estado || null,
      qrLink: parsed.json?.qr_link || parsed.json?.qrLink || null,
      pdfUrl: parsed.json?.pdf_cloud_url || parsed.json?.pdf || null,
      xmlUrl: parsed.json?.xml_path || parsed.json?.xml_url || parsed.json?.xml || null,
      semillaXmlUrl: parsed.json?.semilla_xml_path || parsed.json?.semilla_xml_url || null,
      dgiiInfo: parsed.json?.dgii_info || null,
      payload: parsed.json,
    },
  };
};

module.exports = {
  EF2_DEFAULT_BASE_URL,
  EF2_DEFAULT_TIMEOUT_MS,
  buildEf2Message,
  isEf2Token,
  loginEf2,
  normalizeEf2BaseUrl,
  procesarEf2Factura,
  resolveEf2Token,
  withEf2Path,
};
