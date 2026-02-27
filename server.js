require('dotenv').config({ debug: false });
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.warn('nodemailer no disponible. El envio de correos de registro quedara desactivado.');
}

const db = require('./db');
const usuariosRepo = require('./repos/usuarios-mysql');
const runMultiNegocioMigrations = require('./migrations/mysql-multi-negocio');
const runChatMigrations = require('./migrations/mysql-chat');
const dgiiRoutes = require('./dgii.routes');
const createDgiiPaso2Router = require('./dgii-paso2.routes');
console.log('server.js carga correctamente');

const app = express();
let io = null;

app.set('trust proxy', 1);

// Allow larger payloads for long logo URLs or data URIs in configuration.
app.use(express.json({ limit: '35mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(dgiiRoutes);
const LOG_DELIVERY_REQUESTS = process.env.LOG_DELIVERY_REQUESTS === '1';
app.use((req, res, next) => {
  if (LOG_DELIVERY_REQUESTS && req.url.startsWith('/api/delivery')) {
    console.log('[delivery]', req.method, req.url);
  }
  next();
});

const NEGOCIO_ID_DEFAULT = 1;
const DEFAULT_CONFIG_MODULOS = {
  admin: true,
  mesera: true,
  cocina: true,
  bar: false,
  caja: true,
  mostrador: true,
  delivery: true,
  historialCocina: true,
};
const AREAS_PREPARACION = ['ninguna', 'cocina', 'bar'];
const TIPOS_PRODUCTO = new Set(['FINAL', 'INSUMO']);
const UNIDADES_BASE = new Set(['UND', 'ML', 'LT', 'GR', 'KG', 'OZ', 'LB']);
const MODOS_INVENTARIO_COSTOS = new Set(['REVENTA', 'PREPARACION']);
const DEFAULT_COLOR_PRIMARIO = '#255bc7';
const DEFAULT_COLOR_SECUNDARIO = '#7b8fb8';
const DEFAULT_COLOR_TEXTO = '#24344a';
const DEFAULT_COLOR_PELIGRO = '#ff4b4b';
const PASSWORD_HASH_ROUNDS = 10;
const IMPERSONATION_TOKEN_TTL_SECONDS = 60 * 60;
const IMPERSONATION_JWT_SECRET =
  process.env.IMPERSONATION_JWT_SECRET || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const INVENTARIO_VALORACION_DEFAULT = 'PROMEDIO';
const INVENTARIO_VALORACION_METODOS = new Set(['PROMEDIO', 'PEPS']);
const REGISTRO_DESTINO_CORREO = process.env.REGISTRO_DESTINO_CORREO || 'posiumtech@gmail.com';
const REGISTRO_PAGO_HORAS = 24;
const REGISTRO_ESTADOS_VALIDOS = new Set([
  'pendiente_pago',
  'en_revision',
  'pago_recibido',
  'aprobado',
  'rechazado',
]);
const REGISTRO_MODULOS_CATALOGO = Object.freeze([
  { key: 'pos', label: 'POS', disponible: true },
  { key: 'inventario', label: 'Inventario', disponible: true },
  { key: 'caja', label: 'Caja', disponible: true },
  { key: 'mesera', label: 'Mesera', disponible: true },
  { key: 'kds', label: 'KDS', disponible: true },
  { key: 'bar', label: 'Bar', disponible: true },
  { key: 'delivery', label: 'Delivery', disponible: true },
  { key: 'compras', label: 'Compras', disponible: true },
  { key: 'clientes', label: 'Clientes', disponible: true },
  { key: 'gastos', label: 'Gastos', disponible: true },
  { key: 'reportes', label: 'Reportes', disponible: true },
  { key: 'facturacion_electronica', label: 'Facturacion electronica', disponible: false },
]);
const REGISTRO_MODULOS_MAP = new Map(REGISTRO_MODULOS_CATALOGO.map((item) => [item.key, item]));
const DGII_CONSULTA_RNC_URL = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx';

let registroMailTransporter = null;
let registroMailTransporterIntentado = false;

const seedUsuariosIniciales = async () => {
  const iniciales = [
    {
      nombre: 'Administrador',
      usuario: 'admin',
      password: 'admin123',
      rol: 'admin',
      activo: 1,
      negocio_id: NEGOCIO_ID_DEFAULT,
      empresa_id: 1,
      es_super_admin: 1,
    },
    {
      nombre: 'Mesera',
      usuario: 'mesera',
      password: 'mesera123',
      rol: 'mesera',
      activo: 1,
      negocio_id: NEGOCIO_ID_DEFAULT,
      empresa_id: 1,
    },
    {
      nombre: 'Cocina',
      usuario: 'cocina',
      password: 'cocina123',
      rol: 'cocina',
      activo: 1,
      negocio_id: NEGOCIO_ID_DEFAULT,
      empresa_id: 1,
    },
    {
      nombre: 'Caja',
      usuario: 'caja',
      password: 'caja123',
      rol: 'caja',
      activo: 1,
      negocio_id: NEGOCIO_ID_DEFAULT,
      empresa_id: 1,
    },
  ];

  for (const usuario of iniciales) {
    try {
      const existente = await usuariosRepo.findByUsuario(usuario.usuario);
      if (!existente) {
        const passwordHash = await hashPasswordIfNeeded(usuario.password);
        await usuariosRepo.create({ ...usuario, password: passwordHash });
      }
    } catch (err) {
      console.error('Error al insertar usuarios iniciales:', err?.message || err);
    }
  }
};

const estadosValidos = ['pendiente', 'preparando', 'listo', 'pagado', 'cancelado'];
const ESTADOS_DELIVERY = ['pendiente', 'disponible', 'asignado', 'entregado', 'cancelado'];
const ADMIN_PASSWORD = 'admin123';
const SESSION_EXPIRATION_HOURS = 12; // Ventana m?xima para considerar una sesi?n activa
const ANALYTICS_CACHE_TTL_MS = 2 * 60 * 1000;
const analyticsCache = new Map();
const analyticsAdvancedCache = new Map();

const limpiarCacheAnalitica = (negocioId) => {
  if (!negocioId) {
    analyticsCache.clear();
    analyticsAdvancedCache.clear();
    return;
  }
  for (const key of analyticsCache.keys()) {
    if (key.startsWith(`${negocioId}:`)) {
      analyticsCache.delete(key);
    }
  }
  for (const key of analyticsAdvancedCache.keys()) {
    if (key.startsWith(`${negocioId}:`)) {
      analyticsAdvancedCache.delete(key);
    }
  }
};

const ROLES_OPERATIVOS = ['mesera', 'cocina', 'bar', 'caja', 'vendedor', 'delivery'];
const ROLES_GESTION = ['admin', 'supervisor', 'empresa'];
const usuarioRolesPermitidos = [...ROLES_OPERATIVOS, 'supervisor'];

const generarTokenSesion = () => crypto.randomBytes(24).toString('hex');
const generarPasswordTemporal = (length = 12) => {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
};

const esHashBcrypt = (valor) => typeof valor === 'string' && /^\$2[aby]\$/.test(valor);
const hashPassword = async (password) => bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
const hashPasswordIfNeeded = async (password) => {
  if (!password) return null;
  if (esHashBcrypt(password)) return password;
  return hashPassword(password);
};
const verificarPassword = async (password, stored) => {
  if (!stored) return false;
  if (esHashBcrypt(stored)) {
    return bcrypt.compare(password, stored);
  }
  return password === stored;
};
const validarPasswordUsuario = async (usuarioId, password) => {
  if (!usuarioId || !password) return false;
  try {
    const usuario = await usuariosRepo.findById(usuarioId);
    if (!usuario) return false;
    return verificarPassword(password, usuario.password);
  } catch (error) {
    console.warn('No se pudo validar password del usuario:', error?.message || error);
    return false;
  }
};

const base64UrlEncode = (value) =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64UrlDecode = (value) =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();

const crearTokenImpersonacion = (payload = {}) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + IMPERSONATION_TOKEN_TTL_SECONDS };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(body));
  const unsigned = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', IMPERSONATION_JWT_SECRET)
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${unsigned}.${signature}`;
};

const verificarTokenImpersonacion = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const partes = token.split('.');
  if (partes.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, firma] = partes;
  const unsigned = `${headerB64}.${payloadB64}`;
  const esperado = crypto
    .createHmac('sha256', IMPERSONATION_JWT_SECRET)
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (firma !== esperado) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (error) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now >= payload.exp) {
    return null;
  }

  return payload || null;
};

function normalizarCampoTexto(valor) {
  if (valor === undefined || valor === null) {
    return null;
  }
  if (typeof valor !== 'string') {
    valor = String(valor);
  }
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

function normalizarDocumentoFiscal(valor) {
  const clean = normalizarCampoTexto(valor);
  if (!clean) return null;
  const digits = clean.replace(/\D+/g, '');
  if (!digits) return null;
  return digits.slice(0, 20);
}

function inferirTipoDocumentoFiscal(documento, tipoRaw = null) {
  const tipo = normalizarCampoTexto(tipoRaw);
  if (tipo) {
    const normalized = tipo.toUpperCase();
    if (normalized.includes('CEDULA')) return 'CEDULA';
    if (normalized.includes('RNC')) return 'RNC';
  }
  const clean = normalizarDocumentoFiscal(documento) || '';
  if (clean.length === 11) return 'CEDULA';
  if (clean.length === 9) return 'RNC';
  return 'OTRO';
}

const SQL_CLIENTE_DOCUMENTO_NORMALIZADO =
  "REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(documento, ''), '-', ''), ' ', ''), '.', ''), '/', '')";

const obtenerClientePorDocumentoNormalizado = async (negocioId, documentoNormalizado) => {
  if (!negocioId || !documentoNormalizado) return null;
  return db.get(
    `
      SELECT id, nombre, documento, tipo_documento, telefono, email, direccion, notas, activo, negocio_id
      FROM clientes
      WHERE negocio_id = ?
        AND ${SQL_CLIENTE_DOCUMENTO_NORMALIZADO} = ?
      ORDER BY activo DESC, COALESCE(actualizado_en, creado_en) DESC, id DESC
      LIMIT 1
    `,
    [negocioId, documentoNormalizado]
  );
};

const obtenerContribuyenteDesdeCacheDgii = async (documentoNormalizado) => {
  if (!documentoNormalizado) return null;
  try {
    return await db.get(
      `
        SELECT documento,
               documento_formateado,
               tipo_documento,
               nombre_o_razon_social,
               nombre_comercial,
               estado,
               actividad_economica,
               updated_at
          FROM dgii_rnc_cache
         WHERE documento = ?
         LIMIT 1
      `,
      [documentoNormalizado]
    );
  } catch (error) {
    const mensaje = String(error?.message || '');
    const noExisteTabla =
      mensaje.includes("doesn't exist") ||
      mensaje.includes('no such table') ||
      mensaje.includes('Table');
    if (noExisteTabla) return null;
    throw error;
  }
};

const sincronizarClientePorDocumento = async ({ negocioId, documento, nombre }) => {
  const documentoNormalizado = normalizarDocumentoFiscal(documento);
  if (!negocioId || !documentoNormalizado || ![9, 11].includes(documentoNormalizado.length)) {
    return { ok: false, motivo: 'documento_invalido' };
  }

  const contribuyente = await obtenerContribuyenteDesdeCacheDgii(documentoNormalizado);
  const nombreFinal =
    normalizarCampoTexto(nombre) ||
    normalizarCampoTexto(contribuyente?.nombre_o_razon_social) ||
    normalizarCampoTexto(contribuyente?.nombre_comercial);
  if (!nombreFinal) {
    return { ok: false, motivo: 'nombre_no_disponible', contribuyente: contribuyente || null };
  }

  const documentoGuardado =
    normalizarCampoTexto(documento) ||
    normalizarCampoTexto(contribuyente?.documento_formateado) ||
    documentoNormalizado;
  const tipoDocumento = inferirTipoDocumentoFiscal(
    documentoNormalizado,
    contribuyente?.tipo_documento || null
  );

  const existente = await obtenerClientePorDocumentoNormalizado(negocioId, documentoNormalizado);
  if (existente) {
    await db.run(
      `
        UPDATE clientes
           SET nombre = ?,
               documento = ?,
               tipo_documento = ?,
               activo = 1,
               actualizado_en = CURRENT_TIMESTAMP
         WHERE id = ?
           AND negocio_id = ?
      `,
      [nombreFinal, documentoGuardado, tipoDocumento, existente.id, negocioId]
    );

    return {
      ok: true,
      creado: false,
      actualizado: true,
      cliente: {
        ...existente,
        nombre: nombreFinal,
        documento: documentoGuardado,
        tipo_documento: tipoDocumento,
        activo: 1,
      },
      contribuyente: contribuyente || null,
    };
  }

  const insert = await db.run(
    `
      INSERT INTO clientes (nombre, documento, tipo_documento, telefono, email, direccion, notas, activo, negocio_id)
      VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 1, ?)
    `,
    [nombreFinal, documentoGuardado, tipoDocumento, negocioId]
  );

  const nuevoId = insert?.lastID || null;
  const clienteCreado = nuevoId
    ? await db.get(
        `
          SELECT id, nombre, documento, tipo_documento, telefono, email, direccion, notas, activo, negocio_id
            FROM clientes
           WHERE id = ?
             AND negocio_id = ?
           LIMIT 1
        `,
        [nuevoId, negocioId]
      )
    : null;

  return {
    ok: true,
    creado: true,
    actualizado: false,
    cliente: clienteCreado || {
      id: nuevoId,
      nombre: nombreFinal,
      documento: documentoGuardado,
      tipo_documento: tipoDocumento,
      activo: 1,
      negocio_id: negocioId,
    },
    contribuyente: contribuyente || null,
  };
};

function normalizarMonto(valor) {
  if (valor === undefined || valor === null) {
    return null;
  }
  const texto = String(valor).replace(/,/g, '').trim();
  if (!texto) {
    return null;
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function normalizarListaTexto(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          input = parsed;
        } else {
          input = input.split(',');
        }
      } catch (error) {
        input = input.split(',');
      }
    } else {
      return [];
    }
  }

  const salida = [];
  const vistos = new Set();
  for (const item of input) {
    const texto = normalizarCampoTexto(item);
    if (!texto) continue;
    const valor = texto.toLowerCase();
    if (vistos.has(valor)) continue;
    vistos.add(valor);
    salida.push(valor);
  }
  return salida;
}

function normalizarModulosRegistro(input) {
  const modulos = normalizarListaTexto(input);
  return modulos.filter((item) => REGISTRO_MODULOS_MAP.has(item));
}

function moduloRegistroDisponible(key) {
  return REGISTRO_MODULOS_MAP.get(key)?.disponible !== false;
}

function toRegistroLabelList(keys = []) {
  return keys
    .map((key) => REGISTRO_MODULOS_MAP.get(key)?.label || key)
    .filter((item) => !!item);
}

function normalizarBooleanRegistro(valor, fallback = false) {
  if (valor === undefined || valor === null) return fallback;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor !== 0;
  if (typeof valor === 'string') {
    const clean = valor.trim().toLowerCase();
    if (['1', 'true', 'si', 'yes', 'on'].includes(clean)) return true;
    if (['0', 'false', 'no', 'off'].includes(clean)) return false;
  }
  return Boolean(valor);
}

function normalizarTipoNegocioRegistro(valor) {
  const clean = normalizarCampoTexto(valor);
  if (!clean) return null;
  return clean.toLowerCase().slice(0, 80);
}

function normalizarCantidadUsuariosRegistro(valor) {
  const clean = normalizarCampoTexto(valor);
  if (!clean) return null;
  const asNumber = Number(clean);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    if (asNumber <= 3) return '1-3';
    if (asNumber <= 10) return '4-10';
    return '11+';
  }
  const normalized = clean.toLowerCase();
  if (['1-3', '4-10', '11+', '10+'].includes(normalized)) return normalized === '10+' ? '11+' : normalized;
  return normalized.slice(0, 40);
}

function recomendarModulosRegistro({
  tipoNegocio = null,
  usaCocina = false,
  usaDelivery = false,
  usaBar = false,
  cantidadUsuarios = null,
}) {
  const tipo = normalizarTipoNegocioRegistro(tipoNegocio) || '';
  const moduloSet = new Set(['pos', 'caja', 'inventario', 'reportes', 'clientes', 'compras', 'gastos']);

  if (usaCocina || tipo.includes('restaurante') || tipo.includes('cafeteria') || tipo.includes('food')) {
    moduloSet.add('mesera');
    moduloSet.add('kds');
  }

  if (usaBar || tipo.includes('bar')) {
    moduloSet.add('bar');
    moduloSet.add('kds');
  }

  if (usaDelivery) {
    moduloSet.add('delivery');
  }

  if (cantidadUsuarios === '11+' || cantidadUsuarios === '4-10') {
    moduloSet.add('mesera');
  }

  const recomendado = Array.from(moduloSet).filter((key) => moduloRegistroDisponible(key));
  return {
    keys: recomendado,
    labels: toRegistroLabelList(recomendado),
  };
}

function resolverModulosSolicitadosRegistro(solicitados = [], recomendados = []) {
  const validos = normalizarModulosRegistro(solicitados).filter((key) => moduloRegistroDisponible(key));
  if (validos.length) return validos;
  return normalizarModulosRegistro(recomendados).filter((key) => moduloRegistroDisponible(key));
}

function generarCodigoRegistroSolicitud() {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RG${timestamp}${random}`;
}

function slugifyRegistro(input = '') {
  const base = (input || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 110);
  return base || 'negocio';
}

async function generarSlugRegistroUnico(nombreNegocio = '') {
  const base = slugifyRegistro(nombreNegocio);
  let candidato = base;
  let intentos = 0;
  while (intentos < 30) {
    // Incluye negocios activos y eliminados para evitar colisiones del indice UNIQUE.
    const existente = await db.get('SELECT id FROM negocios WHERE slug = ? LIMIT 1', [candidato]);
    if (!existente?.id) {
      return candidato;
    }
    intentos += 1;
    candidato = `${base}-${(intentos + 1).toString(36)}${crypto.randomBytes(1).toString('hex')}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function construirConfigModulosRegistro({ modulosSolicitados = [], usaCocina = false, usaDelivery = false, usaBar = false } = {}) {
  const selected = new Set(normalizarModulosRegistro(modulosSolicitados));
  const pos = selected.has('pos');
  const caja = selected.has('caja') || pos;
  const mostrador = pos || selected.has('inventario');
  const cocina = usaCocina || selected.has('kds');
  const bar = usaBar || selected.has('bar');
  const delivery = usaDelivery || selected.has('delivery');
  const mesera = selected.has('mesera') || cocina;

  return {
    ...DEFAULT_CONFIG_MODULOS,
    admin: true,
    mesera: mesera,
    cocina: cocina,
    bar: bar,
    caja: caja,
    mostrador: mostrador,
    delivery: delivery,
    historialCocina: cocina || bar,
  };
}

async function obtenerTemaBaseRegistro() {
  const columns = `
    color_primario,
    color_secundario,
    color_texto,
    color_header,
    color_boton_primario,
    color_boton_secundario,
    color_boton_peligro,
    logo_url,
    titulo_sistema
  `;

  let row = await db.get(`SELECT ${columns} FROM negocios WHERE id = ? LIMIT 1`, [NEGOCIO_ID_DEFAULT]);
  if (!row) {
    row = await db.get(`SELECT ${columns} FROM negocios ORDER BY id ASC LIMIT 1`);
  }

  const colorPrimario =
    normalizarCampoTexto(row?.color_primario ?? row?.colorPrimario, null) || DEFAULT_COLOR_PRIMARIO;
  const colorSecundario =
    normalizarCampoTexto(row?.color_secundario ?? row?.colorSecundario, null) || DEFAULT_COLOR_SECUNDARIO;
  const colorTexto = normalizarCampoTexto(row?.color_texto ?? row?.colorTexto, null) || DEFAULT_COLOR_TEXTO;
  const colorHeader =
    normalizarCampoTexto(row?.color_header ?? row?.colorHeader, null) || colorPrimario || colorSecundario;
  const colorBotonPrimario =
    normalizarCampoTexto(row?.color_boton_primario ?? row?.colorBotonPrimario, null) || colorPrimario;
  const colorBotonSecundario =
    normalizarCampoTexto(row?.color_boton_secundario ?? row?.colorBotonSecundario, null) || colorSecundario;
  const colorBotonPeligro =
    normalizarCampoTexto(row?.color_boton_peligro ?? row?.colorBotonPeligro, null) || DEFAULT_COLOR_PELIGRO;
  const logoUrl = normalizarCampoTexto(row?.logo_url ?? row?.logoUrl, null);
  const tituloSistema =
    normalizarCampoTexto(row?.titulo_sistema ?? row?.tituloSistema, null) || 'POSIUM';

  return {
    colorPrimario,
    colorSecundario,
    colorTexto,
    colorHeader,
    colorBotonPrimario,
    colorBotonSecundario,
    colorBotonPeligro,
    logoUrl,
    tituloSistema,
  };
}

function parseJsonSeguro(valor, fallback) {
  if (valor === undefined || valor === null || valor === '') return fallback;
  if (typeof valor === 'object') return valor;
  if (typeof valor !== 'string') return fallback;
  try {
    return JSON.parse(valor);
  } catch (error) {
    return fallback;
  }
}

function mapRegistroSolicitud(row = {}) {
  const modulosSolicitados = normalizarModulosRegistro(parseJsonSeguro(row.modulos_solicitados_json, []));
  const modulosRecomendados = normalizarModulosRegistro(parseJsonSeguro(row.modulos_recomendados_json, []));
  const respuestas = parseJsonSeguro(row.respuestas_json, {});

  return {
    id: row.id,
    codigo: row.codigo || null,
    negocio_nombre: row.negocio_nombre || '',
    negocio_id: row.negocio_id || null,
    negocio_slug: row.negocio_slug || null,
    negocio_tipo: row.negocio_tipo || '',
    admin_nombre: row.admin_nombre || '',
    admin_usuario: row.admin_usuario || '',
    admin_usuario_id: row.admin_usuario_id || null,
    telefono: row.telefono || '',
    email: row.email || '',
    ciudad: row.ciudad || '',
    cantidad_usuarios: row.cantidad_usuarios || '',
    usa_cocina: !!row.usa_cocina,
    usa_delivery: !!row.usa_delivery,
    modulo_kds: !!row.modulo_kds,
    modulos_solicitados: modulosSolicitados,
    modulos_solicitados_labels: toRegistroLabelList(modulosSolicitados),
    modulos_recomendados: modulosRecomendados,
    modulos_recomendados_labels: toRegistroLabelList(modulosRecomendados),
    respuestas: respuestas && typeof respuestas === 'object' ? respuestas : {},
    estado: row.estado || 'pendiente_pago',
    estado_pago_limite: row.estado_pago_limite || null,
    notas_publicas: row.notas_publicas || '',
    notas_internas: row.notas_internas || '',
    correo_enviado: !!row.correo_enviado,
    correo_error: row.correo_error || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function getRegistroMailTransporter() {
  if (registroMailTransporterIntentado) return registroMailTransporter;
  registroMailTransporterIntentado = true;

  if (!nodemailer) {
    registroMailTransporter = null;
    return registroMailTransporter;
  }

  const smtpHost = normalizarCampoTexto(process.env.SMTP_HOST);
  const smtpUser = normalizarCampoTexto(process.env.SMTP_USER);
  const smtpPass = normalizarCampoTexto(process.env.SMTP_PASS);
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = normalizarBooleanRegistro(process.env.SMTP_SECURE, smtpPort === 465);

  if (!smtpUser || !smtpPass) {
    registroMailTransporter = null;
    return registroMailTransporter;
  }

  try {
    if (smtpHost) {
      registroMailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });
    } else {
      registroMailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpPass },
      });
    }
  } catch (error) {
    console.warn('No se pudo inicializar transportador de correo SMTP:', error?.message || error);
    registroMailTransporter = null;
  }

  return registroMailTransporter;
}

async function enviarCorreoRegistroSolicitud(registro = {}) {
  const smtpFrom = normalizarCampoTexto(process.env.SMTP_FROM) || normalizarCampoTexto(process.env.SMTP_USER);
  const destinatario = normalizarCampoTexto(REGISTRO_DESTINO_CORREO) || 'posiumtech@gmail.com';
  const webhookUrl = normalizarCampoTexto(process.env.REGISTRO_EMAIL_WEBHOOK_URL);
  const transporter = getRegistroMailTransporter();
  const fechaRegistro = registro?.created_at ? new Date(registro.created_at) : new Date();
  const fechaLimite = registro?.estado_pago_limite ? new Date(registro.estado_pago_limite) : null;
  const fechaRegistroTexto = Number.isNaN(fechaRegistro.getTime())
    ? '--'
    : fechaRegistro.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', hour12: false });
  const fechaLimiteTexto =
    fechaLimite && !Number.isNaN(fechaLimite.getTime())
      ? fechaLimite.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', hour12: false })
      : '--';

  const lineas = [
    `Nueva solicitud de registro POSIUM (${registro?.codigo || 'sin-codigo'})`,
    '',
    `Negocio: ${registro?.negocio_nombre || '--'}`,
    `Negocio ID: ${registro?.negocio_id || '--'} | Slug: ${registro?.negocio_slug || '--'}`,
    `Tipo de negocio: ${registro?.negocio_tipo || '--'}`,
    `Ciudad: ${registro?.ciudad || '--'}`,
    `Admin: ${registro?.admin_nombre || '--'}`,
    `Usuario admin: ${registro?.admin_usuario || '--'} (listo para usar en /login.html)`,
    `Telefono: ${registro?.telefono || '--'}`,
    `Email: ${registro?.email || '--'}`,
    `Usuarios estimados: ${registro?.cantidad_usuarios || '--'}`,
    `Usa cocina: ${registro?.usa_cocina ? 'Si' : 'No'}`,
    `Usa delivery: ${registro?.usa_delivery ? 'Si' : 'No'}`,
    `Modulos solicitados: ${(registro?.modulos_solicitados_labels || []).join(', ') || '--'}`,
    `Modulos recomendados: ${(registro?.modulos_recomendados_labels || []).join(', ') || '--'}`,
    `Fecha registro: ${fechaRegistroTexto}`,
    `Limite de pago (24h): ${fechaLimiteTexto}`,
    '',
    'Recordatorio para el cliente: enviar foto del comprobante por WhatsApp o correo.',
  ];

  if (!transporter && webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: destinatario,
          subject: `Nuevo registro POSIUM - ${registro?.negocio_nombre || 'Negocio sin nombre'}`,
          text: lineas.join('\n'),
          registro,
        }),
      });
      if (!resp.ok) {
        throw new Error(`Webhook respondio ${resp.status}`);
      }
      return { enviado: true, error: null };
    } catch (error) {
      return { enviado: false, error: error?.message || 'No se pudo enviar correo por webhook.' };
    }
  }

  if (!transporter) {
    return {
      enviado: false,
      error:
        'Correo no configurado: define SMTP_HOST/SMTP_USER/SMTP_PASS o REGISTRO_EMAIL_WEBHOOK_URL para envio automatico.',
    };
  }

  try {
    await transporter.sendMail({
      from: smtpFrom || destinatario,
      to: destinatario,
      subject: `Nuevo registro POSIUM - ${registro?.negocio_nombre || 'Negocio sin nombre'}`,
      text: lineas.join('\n'),
    });
    return { enviado: true, error: null };
  } catch (error) {
    const detalle = normalizarErrorCorreoRegistro(error);
    return { enviado: false, error: detalle };
  }
}

function normalizarErrorCorreoRegistro(error) {
  const detalle = (error?.message || '').toString().trim();
  if (!detalle) return 'No se pudo enviar el correo de registro.';

  if (/535|BadCredentials|Username and Password not accepted|Invalid login/i.test(detalle)) {
    return 'SMTP rechazo las credenciales. Si usas Gmail, configura SMTP_PASS con una App Password de 16 caracteres.';
  }

  return detalle;
}

async function materializarSolicitudRegistroPendiente(row = {}) {
  const solicitudId = Number(row?.id);
  if (!Number.isInteger(solicitudId) || solicitudId <= 0) {
    throw new Error('Solicitud de registro invalida.');
  }

  if (row?.negocio_id && row?.admin_usuario_id) {
    return row;
  }

  const negocioNombre = normalizarCampoTexto(row.negocio_nombre) || `Negocio ${solicitudId}`;
  const negocioTipo = normalizarTipoNegocioRegistro(row.negocio_tipo) || 'otro';
  const adminNombre = normalizarCampoTexto(row.admin_nombre) || 'Administrador';
  const adminUsuario = normalizarCampoTexto(row.admin_usuario)?.toLowerCase();
  if (!adminUsuario) {
    throw new Error('La solicitud no tiene usuario admin para crear la cuenta.');
  }

  const email = normalizarCampoTexto(row.email);
  const telefono = normalizarCampoTexto(row.telefono);
  const direccion = normalizarCampoTexto(row.ciudad);
  const cantidadUsuarios = normalizarCantidadUsuariosRegistro(row.cantidad_usuarios);

  const respuestas = parseJsonSeguro(row.respuestas_json, {});
  const usaCocina = normalizarBooleanRegistro(row.usa_cocina, false);
  const usaDelivery = normalizarBooleanRegistro(row.usa_delivery, false);
  const usaBar = normalizarBooleanRegistro(respuestas?.usa_bar ?? respuestas?.usaBar, false);

  let modulosSolicitados = normalizarModulosRegistro(parseJsonSeguro(row.modulos_solicitados_json, []));
  if (!modulosSolicitados.length) {
    modulosSolicitados = recomendarModulosRegistro({
      tipoNegocio: negocioTipo,
      usaCocina,
      usaDelivery,
      usaBar,
      cantidadUsuarios,
    }).keys;
  }
  if (normalizarBooleanRegistro(row.modulo_kds, false) && moduloRegistroDisponible('kds') && !modulosSolicitados.includes('kds')) {
    modulosSolicitados.push('kds');
  }
  modulosSolicitados = modulosSolicitados.filter((item) => item !== 'facturacion_electronica');

  const configModulosNegocio = construirConfigModulosRegistro({
    modulosSolicitados,
    usaCocina,
    usaDelivery,
    usaBar,
  });
  const configModulosJson = stringifyConfigModulos(configModulosNegocio);
  const adminPasswordHashRaw = normalizarCampoTexto(row.admin_password_hash);
  const adminPasswordHash = adminPasswordHashRaw ? await hashPasswordIfNeeded(adminPasswordHashRaw) : null;

  const temaBase = await obtenerTemaBaseRegistro();
  const empresaId = (await resolverEmpresaId({ empresaNombre: negocioNombre })) || 1;
  const usuarioExistente = await usuariosRepo.findByUsuario(adminUsuario);

  if (
    usuarioExistente?.id &&
    usuarioExistente.negocio_id &&
    Number(usuarioExistente.negocio_id) !== Number(row.negocio_id || 0)
  ) {
    throw new Error(`El usuario admin ${adminUsuario} ya existe en otro negocio.`);
  }

  if (!usuarioExistente?.id && !adminPasswordHash) {
    throw new Error('La solicitud no tiene password del admin para crear la cuenta.');
  }

  const respuestasActualizadas = {
    ...(respuestas && typeof respuestas === 'object' ? respuestas : {}),
    usuario_listo: true,
    facturacion_electronica_disponible: false,
  };

  let negocioId = row.negocio_id ? Number(row.negocio_id) : null;
  let negocioSlug = normalizarCampoTexto(row.negocio_slug);
  let adminUsuarioId = row.admin_usuario_id ? Number(row.admin_usuario_id) : usuarioExistente?.id || null;

  await db.run('BEGIN');
  try {
    if (!negocioId) {
      if (!negocioSlug) {
        negocioSlug = await generarSlugRegistroUnico(negocioNombre);
      }

      const negocioInsert = await db.run(
        `INSERT INTO negocios (
           nombre, slug, telefono, direccion, color_primario, color_secundario, color_texto, color_header,
           color_boton_primario, color_boton_secundario, color_boton_peligro, config_modulos,
           admin_principal_correo, logo_url, titulo_sistema, activo, empresa_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          negocioNombre,
          negocioSlug,
          telefono || null,
          direccion || null,
          temaBase.colorPrimario,
          temaBase.colorSecundario,
          temaBase.colorTexto,
          temaBase.colorHeader,
          temaBase.colorBotonPrimario,
          temaBase.colorBotonSecundario,
          temaBase.colorBotonPeligro,
          configModulosJson,
          email || null,
          temaBase.logoUrl || null,
          temaBase.tituloSistema || 'POSIUM',
          empresaId,
        ]
      );
      negocioId = negocioInsert?.lastID || null;
      if (!negocioId) {
        throw new Error('No se pudo crear el negocio para la solicitud.');
      }
    } else {
      const negocioActual = await db.get('SELECT slug FROM negocios WHERE id = ? LIMIT 1', [negocioId]);
      negocioSlug = normalizarCampoTexto(negocioActual?.slug) || negocioSlug;
      await db.run(
        `UPDATE negocios
            SET config_modulos = COALESCE(config_modulos, ?),
                admin_principal_correo = COALESCE(admin_principal_correo, ?),
                empresa_id = COALESCE(empresa_id, ?),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [configModulosJson, email || null, empresaId, negocioId]
      );
    }

    if (adminUsuarioId) {
      await db.run(
        `UPDATE usuarios
            SET nombre = ?,
                rol = 'admin',
                activo = 1,
                negocio_id = ?,
                empresa_id = COALESCE(empresa_id, ?),
                password = COALESCE(?, password),
                force_password_change = 0,
                password_reset_at = CASE WHEN ? IS NOT NULL THEN NULL ELSE password_reset_at END
          WHERE id = ?`,
        [adminNombre, negocioId, empresaId, adminPasswordHash, adminPasswordHash, adminUsuarioId]
      );
    } else {
      const usuarioInsert = await db.run(
        `INSERT INTO usuarios (
           nombre, usuario, password, rol, activo, negocio_id, empresa_id, es_super_admin, force_password_change, password_reset_at
         ) VALUES (?, ?, ?, 'admin', 1, ?, ?, 0, 0, NULL)`,
        [adminNombre, adminUsuario, adminPasswordHash, negocioId, empresaId]
      );
      adminUsuarioId = usuarioInsert?.lastID || null;
      if (!adminUsuarioId) {
        throw new Error('No se pudo crear el usuario admin para la solicitud.');
      }
    }

    await db.run(
      'UPDATE negocios SET admin_principal_usuario_id = ?, admin_principal_correo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [adminUsuarioId, email || null, negocioId]
    );

    await db.run(
      `UPDATE registro_solicitudes
          SET negocio_id = ?,
              negocio_slug = ?,
              admin_usuario_id = ?,
              modulos_solicitados_json = ?,
              respuestas_json = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [
        negocioId,
        negocioSlug || null,
        adminUsuarioId,
        JSON.stringify(modulosSolicitados),
        JSON.stringify(respuestasActualizadas),
        solicitudId,
      ]
    );

    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK').catch(() => {});
    throw error;
  }

  return await db.get('SELECT * FROM registro_solicitudes WHERE id = ? LIMIT 1', [solicitudId]);
}

function getLocalDateISO(value = new Date()) {
  const base = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(base.getTime())) return '';
  const offset = base.getTimezoneOffset();
  const local = new Date(base.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizarAreaPreparacion(area) {
  const valor = (area || 'ninguna').toString().trim().toLowerCase();
  return AREAS_PREPARACION.includes(valor) ? valor : 'ninguna';
}

const ORIGENES_CAJA = new Set(['caja', 'mostrador']);

function normalizarOrigenCaja(valor, fallback = 'caja') {
  if (valor === undefined || valor === null) {
    return fallback;
  }
  const texto = String(valor).trim().toLowerCase();
  return ORIGENES_CAJA.has(texto) ? texto : fallback;
}

function construirFiltroOrigenCaja(origen, params = [], campo = 'origen_caja') {
  const normalizado = normalizarOrigenCaja(origen, 'caja');
  if (normalizado === 'caja') {
    return `(${campo} IS NULL OR ${campo} = 'caja')`;
  }
  params.push(normalizado);
  return `${campo} = ?`;
}

function parseConfigModulos(configModulos) {
  const normalizarFlagModulo = (valor, fallback = true) => {
    if (valor === undefined || valor === null) {
      return fallback;
    }
    if (typeof valor === 'boolean') {
      return valor;
    }
    if (typeof valor === 'number') {
      return valor !== 0;
    }
    if (typeof valor === 'string') {
      const limpio = valor.trim().toLowerCase();
      if (!limpio) return fallback;
      if (['1', 'true', 'si', 'yes', 'on'].includes(limpio)) return true;
      if (['0', 'false', 'no', 'off', 'null', 'undefined'].includes(limpio)) return false;
      return fallback;
    }
    return Boolean(valor);
  };

  const normalizarConfigModulos = (raw = {}) => {
    const base = { ...DEFAULT_CONFIG_MODULOS };
    if (!raw || typeof raw !== 'object') {
      return base;
    }
    for (const key of Object.keys(base)) {
      base[key] = normalizarFlagModulo(raw[key], base[key]);
    }
    for (const [key, value] of Object.entries(raw)) {
      if (!(key in base)) {
        base[key] = value;
      }
    }
    return base;
  };

  if (configModulos === undefined || configModulos === null) {
    return normalizarConfigModulos(DEFAULT_CONFIG_MODULOS);
  }

  if (typeof configModulos === 'string') {
    const trimmed = configModulos.trim();
    if (!trimmed) {
      return normalizarConfigModulos(DEFAULT_CONFIG_MODULOS);
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return normalizarConfigModulos(parsed);
      }
    } catch (error) {
      console.warn('No se pudo parsear config_modulos, usando defaults:', error?.message || error);
      return normalizarConfigModulos(DEFAULT_CONFIG_MODULOS);
    }
  }

  if (typeof configModulos === 'object') {
    return normalizarConfigModulos(configModulos);
  }

  return normalizarConfigModulos(DEFAULT_CONFIG_MODULOS);
}

function stringifyConfigModulos(configModulos) {
  const parsed = parseConfigModulos(configModulos);
  return JSON.stringify(parsed);
}

async function obtenerConfigModulosNegocio(negocioId) {
  const id = negocioId || NEGOCIO_ID_DEFAULT;
  try {
    const row = await db.get('SELECT config_modulos FROM negocios WHERE id = ? LIMIT 1', [id]);
    return parseConfigModulos(row?.config_modulos ?? row?.configModulos);
  } catch (error) {
    console.warn(`No se pudo obtener config_modulos para el negocio ${id}:`, error?.message || error);
    return { ...DEFAULT_CONFIG_MODULOS };
  }
}

async function moduloActivoParaNegocio(modulo, negocioId) {
  const config = await obtenerConfigModulosNegocio(negocioId);
  if (!config || typeof config !== 'object') {
    return false;
  }
  return config[modulo] !== false;
}

async function asegurarAdminPrincipalNegocio({ negocioId, negocioNombre, payload }) {
  const adminUsuario =
    normalizarCampoTexto(payload.adminPrincipalUsuario, null) ||
    normalizarCampoTexto(payload.admin_usuario, null) ||
    null; // clave de login (obligatoria para crear/vincular)
  const adminPassword =
    normalizarCampoTexto(payload.adminPrincipalPassword, null) ||
    normalizarCampoTexto(payload.admin_password, null) ||
    normalizarCampoTexto(payload.adminPassword, null) ||
    null; // password de login
  const adminCorreo =
    normalizarCampoTexto(payload.adminPrincipalCorreo, null) ||
    normalizarCampoTexto(payload.admin_principal_correo, null) ||
    null; // solo informativo

  // Si no viene usuario, no hacemos nada con admin principal
  if (!adminUsuario) {
    return null;
  }

  let usuarioExistente = null;
  try {
    usuarioExistente = await usuariosRepo.findByUsuario(adminUsuario);
  } catch (err) {
    console.error('Error buscando usuario admin principal:', err?.message || err);
    throw { status: 500, message: 'Error al validar usuario admin principal' };
  }

  let empresaIdNegocio = null;
  try {
    const rowEmpresa = await db.get('SELECT empresa_id FROM negocios WHERE id = ? LIMIT 1', [negocioId]);
    empresaIdNegocio = rowEmpresa?.empresa_id ?? null;
  } catch (error) {
    console.warn('No se pudo obtener empresa del negocio:', error?.message || error);
  }

  if (usuarioExistente && Number(usuarioExistente.negocio_id) !== Number(negocioId)) {
    throw { status: 400, message: 'Ya existe un usuario con ese usuario en otro negocio' };
  }

  let passwordGenerada = null;
  const nombreParaUsuario =
    adminCorreo ||
    `Admin ${negocioNombre || ''}`.trim() ||
    `Admin negocio ${negocioId}`.trim();

  let usuarioFinalId = usuarioExistente?.id || null;

  try {
    if (usuarioExistente) {
      const updates = {};
      if (usuarioExistente.rol !== 'admin') updates.rol = 'admin';
      if (!usuarioExistente.activo) updates.activo = 1;
      if (empresaIdNegocio && usuarioExistente.empresa_id !== empresaIdNegocio) {
        updates.empresa_id = empresaIdNegocio;
      }
      if (adminPassword) {
        updates.password = await hashPasswordIfNeeded(adminPassword);
        updates.password_reset_at = new Date();
      }
      updates.negocio_id = negocioId;
      await usuariosRepo.update(usuarioExistente.id, updates);
    } else {
      let passwordFinal = adminPassword;
      if (!passwordFinal) {
        passwordFinal = generarPasswordTemporal(12);
        passwordGenerada = passwordFinal;
      }
      const passwordHash = await hashPasswordIfNeeded(passwordFinal);
      const nuevo = await usuariosRepo.create({
        nombre: nombreParaUsuario,
        usuario: adminUsuario,
        password: passwordHash,
        rol: 'admin',
        activo: 1,
        negocio_id: negocioId,
        empresa_id: empresaIdNegocio,
        es_super_admin: 0,
        force_password_change: passwordGenerada ? 1 : 0,
        password_reset_at: passwordGenerada ? new Date() : null,
      });
      usuarioFinalId = nuevo?.id || null;
    }

    if (usuarioFinalId) {
      await db.run('UPDATE negocios SET admin_principal_usuario_id = ? WHERE id = ?', [
        usuarioFinalId,
        negocioId,
      ]);
    }

    return {
      usuarioId: usuarioFinalId,
      usuario: adminUsuario,
      correo: adminCorreo || null,
      passwordGenerada,
    };
  } catch (err) {
    console.error('Error gestionando admin principal del negocio:', err?.message || err);
    throw { status: 500, message: 'No se pudo procesar el admin principal del negocio' };
  }
}

async function asegurarUsuarioEmpresa({ empresaId, negocioId, negocioNombre, empresaNombre, payload }) {
  const empresaUsuario =
    normalizarCampoTexto(payload.adminPrincipalUsuario, null) ||
    normalizarCampoTexto(payload.admin_usuario, null) ||
    null;
  const empresaPassword =
    normalizarCampoTexto(payload.adminPrincipalPassword, null) ||
    normalizarCampoTexto(payload.admin_password, null) ||
    normalizarCampoTexto(payload.adminPassword, null) ||
    null;
  const empresaNombreUsuario =
    normalizarCampoTexto(payload.adminPrincipalCorreo, null) ||
    normalizarCampoTexto(payload.admin_principal_correo, null) ||
    null;

  const rowEmpresaUser = await db.get(
    `SELECT id, usuario
       FROM usuarios
      WHERE rol = 'empresa'
        AND empresa_id = ?
      LIMIT 1`,
    [empresaId]
  );
  if (rowEmpresaUser && (!empresaUsuario || rowEmpresaUser.usuario !== empresaUsuario)) {
    const nombreParaUsuario =
      empresaNombreUsuario ||
      empresaNombre ||
      `Empresa ${negocioNombre || ''}`.trim() ||
      `Empresa ${empresaId}`.trim();
    return {
      usuarioId: rowEmpresaUser.id,
      usuario: rowEmpresaUser.usuario,
      nombre: nombreParaUsuario,
      existente: true,
    };
  }

  if (!empresaUsuario) {
    return null;
  }

  let usuarioExistente = null;
  try {
    usuarioExistente = await usuariosRepo.findByUsuario(empresaUsuario);
  } catch (err) {
    console.error('Error buscando usuario empresa:', err?.message || err);
    throw { status: 500, message: 'Error al validar usuario empresa' };
  }

  const empresaExistenteId = usuarioExistente?.empresa_id ?? null;
  if (
    usuarioExistente &&
    empresaExistenteId === null &&
    usuarioExistente.rol &&
    !['admin', 'empresa'].includes(usuarioExistente.rol)
  ) {
    throw {
      status: 400,
      message: `El usuario ya existe con rol ${usuarioExistente.rol}. Usa otro usuario.`,
    };
  }
  if (
    usuarioExistente &&
    empresaExistenteId !== null &&
    Number(empresaExistenteId) !== Number(empresaId)
  ) {
    throw { status: 400, message: 'Ya existe un usuario con ese usuario en otra empresa' };
  }

  let passwordGenerada = null;
  const nombreParaUsuario =
    empresaNombreUsuario ||
    empresaNombre ||
    `Empresa ${negocioNombre || ''}`.trim() ||
    `Empresa ${empresaId}`.trim();

  let usuarioFinalId = usuarioExistente?.id || null;

  try {
    if (usuarioExistente) {
      const updates = {};
      if (usuarioExistente.rol !== 'empresa') updates.rol = 'empresa';
      if (!usuarioExistente.activo) updates.activo = 1;
      if (empresaId && usuarioExistente.empresa_id !== empresaId) {
        updates.empresa_id = empresaId;
      }
      if (empresaPassword) {
        updates.password = await hashPasswordIfNeeded(empresaPassword);
        updates.password_reset_at = new Date();
      }
      updates.negocio_id = negocioId || usuarioExistente.negocio_id || null;
      await usuariosRepo.update(usuarioExistente.id, updates);
    } else {
      let passwordFinal = empresaPassword;
      if (!passwordFinal) {
        passwordFinal = generarPasswordTemporal(12);
        passwordGenerada = passwordFinal;
      }
      const passwordHash = await hashPasswordIfNeeded(passwordFinal);
      const nuevo = await usuariosRepo.create({
        nombre: nombreParaUsuario,
        usuario: empresaUsuario,
        password: passwordHash,
        rol: 'empresa',
        activo: 1,
        negocio_id: negocioId || null,
        empresa_id: empresaId,
        es_super_admin: 0,
        force_password_change: passwordGenerada ? 1 : 0,
        password_reset_at: passwordGenerada ? new Date() : null,
      });
      usuarioFinalId = nuevo?.id || null;
    }

    return {
      usuarioId: usuarioFinalId,
      usuario: empresaUsuario,
      nombre: nombreParaUsuario,
      passwordGenerada,
    };
  } catch (err) {
    console.error('Error gestionando usuario empresa:', err?.message || err);
    throw { status: 500, message: 'No se pudo procesar el usuario empresa' };
  }
}

async function resolverEmpresaId({ empresaId, empresaNombre } = {}) {
  const empresaIdNum = empresaId === undefined || empresaId === null ? null : Number(empresaId);
  if (Number.isFinite(empresaIdNum) && empresaIdNum > 0) {
    return empresaIdNum;
  }
  const nombre = normalizarCampoTexto(empresaNombre, null);
  if (!nombre) return null;
  try {
    const existente = await db.get('SELECT id FROM empresas WHERE LOWER(nombre) = LOWER(?) LIMIT 1', [nombre]);
    if (existente?.id) return Number(existente.id);
    const insert = await db.run('INSERT INTO empresas (nombre, activo) VALUES (?, 1)', [nombre]);
    return insert?.lastID || insert?.lastId || insert?.insertId || null;
  } catch (error) {
    console.warn('No se pudo resolver empresa:', error?.message || error);
    return null;
  }
}

function mapNegocioWithDefaults(row = {}) {
  const colorPrimario = normalizarCampoTexto(row.color_primario ?? row.colorPrimario, null);
  const colorSecundario = normalizarCampoTexto(row.color_secundario ?? row.colorSecundario, null);
  const colorHeader =
    normalizarCampoTexto(row.color_header ?? row.colorHeader, null) || colorPrimario || colorSecundario || null;
  const colorTexto = normalizarCampoTexto(row.color_texto ?? row.colorTexto, null) || DEFAULT_COLOR_TEXTO;
  const colorBotonPrimario =
    normalizarCampoTexto(row.color_boton_primario ?? row.colorBotonPrimario, null) || colorPrimario || null;
  const colorBotonSecundario =
    normalizarCampoTexto(row.color_boton_secundario ?? row.colorBotonSecundario, null) || colorSecundario || null;
  const colorBotonPeligro =
    normalizarCampoTexto(row.color_boton_peligro ?? row.colorBotonPeligro, null) || DEFAULT_COLOR_PELIGRO;
  const adminPrincipalUsuarioIdRaw = row.admin_principal_usuario_id ?? row.adminPrincipalUsuarioId;
  const adminPrincipalUsuarioId =
    adminPrincipalUsuarioIdRaw === undefined || adminPrincipalUsuarioIdRaw === null
      ? null
      : Number(adminPrincipalUsuarioIdRaw);
  const adminPrincipalUsuarioIdFinal = Number.isFinite(adminPrincipalUsuarioId) ? adminPrincipalUsuarioId : null;
  const adminPrincipalCorreo =
    normalizarCampoTexto(
      row.admin_principal_correo ?? row.adminPrincipalCorreo ?? row.correoAdminPrincipal ?? row.correo_admin_principal,
      null
    ) || null;
  const adminPrincipalUsuario =
    normalizarCampoTexto(
      row.admin_principal_usuario ?? row.adminPrincipalUsuario ?? row.admin_usuario ?? row.usuarioAdminPrincipal,
      null
    ) || null;
  const empresaIdRaw = row.empresa_id ?? row.empresaId;
  const empresaId = empresaIdRaw === undefined || empresaIdRaw === null ? null : Number(empresaIdRaw);
  const empresaIdFinal = Number.isFinite(empresaId) ? empresaId : null;
  const empresaNombre =
    normalizarCampoTexto(row.empresa_nombre ?? row.empresaNombre, null) ||
    normalizarCampoTexto(row.empresaNombre, null) ||
    null;
  const rawConfigModulos = row.config_modulos ?? row.configModulos;
  const configModulos = parseConfigModulos(rawConfigModulos);
  const configModulosString =
    typeof rawConfigModulos === 'string' && rawConfigModulos.trim() ? rawConfigModulos : JSON.stringify(configModulos);
  const logoUrl = normalizarCampoTexto(row.logo_url ?? row.logoUrl, null);
  const motivoSuspension = normalizarCampoTexto(row.motivo_suspension ?? row.motivoSuspension, null) || null;
  const deletedAt = row.deleted_at ?? row.deletedAt ?? null;
  const suspendido = row.suspendido ?? row.suspendido ?? 0;
  const activo = row.activo ?? 1;

  return {
    ...row,
    colorPrimario,
    colorSecundario,
    color_header: colorHeader,
    color_texto: colorTexto,
    color_boton_primario: colorBotonPrimario,
    color_boton_secundario: colorBotonSecundario,
    color_boton_peligro: colorBotonPeligro,
    config_modulos: configModulosString,
    logoUrl,
    adminPrincipalCorreo,
    adminPrincipalUsuario,
    colorHeader,
    colorTexto,
    colorBotonPrimario,
    colorBotonSecundario,
    colorBotonPeligro,
    configModulos,
    adminPrincipalUsuarioId: adminPrincipalUsuarioIdFinal,
    empresa_id: empresaIdFinal,
    empresaId: empresaIdFinal,
    empresa_nombre: empresaNombre,
    empresaNombre,
    motivo_suspension: motivoSuspension,
    motivoSuspension,
    deleted_at: deletedAt,
    suspendido,
    activo,
  };
}

const registrarAccionAdmin = async ({ adminId, negocioId, accion }) => {
  if (!adminId || !negocioId || !accion) {
    return;
  }
  try {
    await db.run('INSERT INTO admin_actions (admin_id, negocio_id, accion) VALUES (?, ?, ?)', [
      adminId,
      negocioId,
      accion,
    ]);
  } catch (error) {
    console.warn('No se pudo registrar accion admin:', error?.message || error);
  }
};

const registrarImpersonacionAdmin = async ({ adminId, negocioId, ip }) => {
  if (!adminId || !negocioId) {
    return;
  }
  try {
    await db.run(
      'INSERT INTO admin_impersonations (admin_id, negocio_id, ip) VALUES (?, ?, ?)',
      [adminId, negocioId, ip || null]
    );
  } catch (error) {
    console.warn('No se pudo registrar impersonacion admin:', error?.message || error);
  }
};

const obtenerAdminPrincipalNegocio = async (negocioId, adminPrincipalId = null) => {
  if (adminPrincipalId) {
    const principal = await usuariosRepo.findById(adminPrincipalId);
    if (principal) {
      return principal;
    }
  }

  const row = await db.get(
    `SELECT id
       FROM usuarios
      WHERE negocio_id = ? AND rol = 'admin'
      ORDER BY id ASC
      LIMIT 1`,
    [negocioId]
  );
  if (!row?.id) return null;
  return usuariosRepo.findById(row.id);
};

const obtenerEstadoNegocio = async (negocioId) => {
  if (!negocioId) return null;
  return db.get(
    'SELECT id, activo, suspendido, deleted_at, motivo_suspension FROM negocios WHERE id = ? LIMIT 1',
    [negocioId]
  );
};

const validarEstadoNegocio = async (negocioId) => {
  const negocio = await obtenerEstadoNegocio(negocioId);
  if (!negocio) {
    return { ok: false, status: 403, error: 'Negocio no encontrado' };
  }

  if (negocio.deleted_at) {
    return { ok: false, status: 403, error: 'El negocio fue eliminado' };
  }

  if (negocio.activo !== null && Number(negocio.activo) === 0) {
    return { ok: false, status: 403, error: 'El negocio esta inactivo' };
  }

  if (Number(negocio.suspendido) === 1) {
    const motivo = normalizarCampoTexto(negocio.motivo_suspension, null);
    const mensaje = motivo ? `Negocio suspendido: ${motivo}` : 'El negocio esta suspendido';
    return { ok: false, status: 403, error: mensaje, motivo_suspension: motivo };
  }

  return { ok: true, negocio };
};

const obtenerNegocioIdReutilizable = async () => {
  try {
    const row = await db.get(
      `
        SELECT next_id
          FROM (
            SELECT 1 AS next_id
            WHERE NOT EXISTS (SELECT 1 FROM negocios WHERE id = 1)
            UNION ALL
            SELECT MIN(t1.id + 1) AS next_id
              FROM negocios t1
              LEFT JOIN negocios t2 ON t2.id = t1.id + 1
             WHERE t2.id IS NULL
          ) t
         ORDER BY next_id ASC
         LIMIT 1
      `
    );
    const nextId = Number(row?.next_id);
    if (!Number.isFinite(nextId) || nextId <= 0) {
      return null;
    }
    return nextId;
  } catch (error) {
    console.warn('No se pudo obtener ID reutilizable de negocio:', error?.message || error);
    return null;
  }
};

const NEGOCIO_DELETE_TABLES = [
  'admin_actions',
  'admin_impersonations',
  'analisis_capital_inicial',
  'categorias',
  'chat_messages',
  'chat_rooms',
  'cierres_caja',
  'clientes',
  'clientes_abonos',
  'clientes_deudas',
  'clientes_deudas_detalle',
  'compras',
  'compras_inventario',
  'compras_inventario_detalle',
  'configuracion',
  'consumo_insumos',
  'cotizacion_items',
  'cotizaciones',
  'detalle_compra',
  'detalle_pedido',
  'gastos',
  'historial_bar',
  'historial_cocina',
  'notas_credito_compras',
  'notas_credito_ventas',
  'pedidos',
  'posium_facturacion_config',
  'posium_facturas',
  'productos',
  'recetas',
  'salidas_caja',
  'secuencias_ncf',
  'sesiones_usuarios',
  'usuarios',
];

const eliminarNegocioCompleto = async ({ negocioId, empresaId }) => {
  const negocioIdNum = Number(negocioId);
  if (!Number.isFinite(negocioIdNum) || negocioIdNum <= 0) {
    throw new Error('ID de negocio invalido');
  }

  let negocioEmpresaId = empresaId ? Number(empresaId) : null;
  if (!Number.isFinite(negocioEmpresaId)) {
    const rowEmpresa = await db.get('SELECT empresa_id FROM negocios WHERE id = ? LIMIT 1', [negocioIdNum]);
    negocioEmpresaId = Number(rowEmpresa?.empresa_id) || null;
  }

  await db.run('BEGIN');
  try {
    if (Number.isFinite(negocioEmpresaId)) {
      const fallback = await db.get(
        `
          SELECT id
            FROM negocios
           WHERE empresa_id = ?
             AND id <> ?
             AND deleted_at IS NULL
             AND activo = 1
           ORDER BY id ASC
           LIMIT 1
        `,
        [negocioEmpresaId, negocioIdNum]
      );
      if (fallback?.id) {
        await db.run(
          `UPDATE usuarios
              SET negocio_id = ?
            WHERE rol = 'empresa'
              AND empresa_id = ?
              AND negocio_id = ?`,
          [fallback.id, negocioEmpresaId, negocioIdNum]
        );
      }
    }

    await db.run('SET FOREIGN_KEY_CHECKS = 0');

    await db.run(
      `DELETE FROM chat_message_reads
        WHERE message_id IN (SELECT id FROM chat_messages WHERE negocio_id = ?)`,
      [negocioIdNum]
    );
    await db.run(
      `DELETE FROM chat_mentions
        WHERE message_id IN (SELECT id FROM chat_messages WHERE negocio_id = ?)`,
      [negocioIdNum]
    );
    await db.run(
      `DELETE FROM chat_room_users
        WHERE room_id IN (SELECT id FROM chat_rooms WHERE negocio_id = ?)`,
      [negocioIdNum]
    );

    for (const table of NEGOCIO_DELETE_TABLES) {
      await db.run(`DELETE FROM ${table} WHERE negocio_id = ?`, [negocioIdNum]);
    }

    await db.run('DELETE FROM negocios WHERE id = ?', [negocioIdNum]);
    await db.run('SET FOREIGN_KEY_CHECKS = 1');
    await db.run('COMMIT');
  } catch (error) {
    try {
      await db.run('SET FOREIGN_KEY_CHECKS = 1');
    } catch (resetErr) {
      console.warn('No se pudo restaurar FOREIGN_KEY_CHECKS:', resetErr?.message || resetErr);
    }
    try {
      await db.run('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('No se pudo hacer rollback al eliminar negocio:', rollbackErr?.message || rollbackErr);
    }
    throw error;
  }
};

const obtenerNegocioAdmin = async (negocioId) =>
  db.get(
    'SELECT id, activo, suspendido, deleted_at, motivo_suspension, admin_principal_usuario_id, empresa_id FROM negocios WHERE id = ? LIMIT 1',
    [negocioId]
  );

const migrationsReady = runMultiNegocioMigrations()
  .then(() => runChatMigrations())
  .then(() => seedUsuariosIniciales())
  .catch((err) => {
    console.error('Error en migraciones/seed:', err?.message || err);
  });

let categoriasTieneNegocioId = null;

const verificarCategoriaNegocioId = async () => {
  if (categoriasTieneNegocioId !== null) {
    return categoriasTieneNegocioId;
  }

  try {
    const row = await db.get(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'categorias'
         AND COLUMN_NAME = 'negocio_id'
       LIMIT 1`
    );
    categoriasTieneNegocioId = Boolean(row?.COLUMN_NAME);
  } catch (error) {
    console.error('Error al verificar columna negocio_id en categorias:', error?.message || error);
    categoriasTieneNegocioId = false;
  }

  return categoriasTieneNegocioId;
};

const cerrarSesionPorToken = (token, callback) => {
  db.run(
    'UPDATE sesiones_usuarios SET cerrado_en = CURRENT_TIMESTAMP WHERE token = ? AND cerrado_en IS NULL',
    [token],
    function (err) {
      callback(err, this?.changes || 0);
    }
  );
};

const cerrarSesionesActivasDeUsuario = (usuarioId, callback) => {
  db.run(
    'UPDATE sesiones_usuarios SET cerrado_en = CURRENT_TIMESTAMP WHERE usuario_id = ? AND cerrado_en IS NULL',
    [usuarioId],
    function (err) {
      callback(err, this?.changes || 0);
    }
  );
};

// Mantiene una ?nica sesi?n activa por usuario sin bloquear el flujo de pedidos.
const cerrarSesionesExpiradas = (usuarioId, callback) => {
  const sql = `
    UPDATE sesiones_usuarios
    SET cerrado_en = CURRENT_TIMESTAMP
    WHERE usuario_id = ?
      AND cerrado_en IS NULL
      AND DATE_ADD(creado_en, INTERVAL ${SESSION_EXPIRATION_HOURS} HOUR) <= CURRENT_TIMESTAMP
  `;

  db.run(sql, [usuarioId], (err) => {
    if (err) {
      console.warn('No se pudieron cerrar sesiones expiradas:', err.message);
    }
    callback();
  });
};

const extraerTokenDeHeaders = (req) => {
  const headerToken = req.headers['x-session-token'];
  if (headerToken) return headerToken;

  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7);
  }
  return null;
};

async function obtenerUsuarioSesionPorToken(token) {
  if (!token) {
    return null;
  }

  const sql = `
    SELECT id AS sesion_id, usuario_id
    FROM sesiones_usuarios
    WHERE token = ?
      AND cerrado_en IS NULL
      AND DATE_ADD(creado_en, INTERVAL ${SESSION_EXPIRATION_HOURS} HOUR) > CURRENT_TIMESTAMP
    ORDER BY creado_en DESC
    LIMIT 1
  `;

  const row = await db.get(sql, [token]);

  if (row) {
    const usuario = await usuariosRepo.findById(row.usuario_id);
    if (!usuario || usuario.activo === 0) {
      return null;
    }

    await db.run('UPDATE sesiones_usuarios SET ultimo_uso = CURRENT_TIMESTAMP WHERE id = ?', [row.sesion_id]);

    const negocioId = usuario.negocio_id != null ? usuario.negocio_id : NEGOCIO_ID_DEFAULT;
    const configModulosSesion = await obtenerConfigModulosNegocio(negocioId);

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      usuario: usuario.usuario,
      rol: usuario.rol,
      negocio_id: negocioId,
      negocioId,
      empresa_id: usuario.empresa_id ?? null,
      empresaId: usuario.empresa_id ?? null,
      es_super_admin: !!usuario.es_super_admin,
      force_password_change: !!usuario.force_password_change,
      config_modulos: configModulosSesion,
      configModulos: configModulosSesion,
      token,
    };
  }

  const payload = verificarTokenImpersonacion(token);
  if (!payload?.impersonated) {
    return null;
  }

  const usuario = await usuariosRepo.findById(payload.usuario_id);
  if (!usuario || usuario.activo === 0) {
    return null;
  }

  const negocioId = payload.negocio_id ?? usuario.negocio_id ?? NEGOCIO_ID_DEFAULT;
  const configModulosSesion = await obtenerConfigModulosNegocio(negocioId);

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    usuario: usuario.usuario,
    rol: payload.role || usuario.rol || 'admin',
    negocio_id: negocioId,
    negocioId,
    empresa_id: usuario.empresa_id ?? null,
    empresaId: usuario.empresa_id ?? null,
    es_super_admin: false,
    force_password_change: !!usuario.force_password_change,
    impersonated: true,
    impersonated_by: payload.admin_id,
    impersonated_by_role: payload.impersonated_by_role ?? payload.impersonatedByRole ?? null,
    impersonatedByRole: payload.impersonated_by_role ?? payload.impersonatedByRole ?? null,
    config_modulos: configModulosSesion,
    configModulos: configModulosSesion,
    token,
  };
}

const obtenerUsuarioDesdeHeaders = (req, callback) => {
  const token = extraerTokenDeHeaders(req);
  if (!token) {
    return callback(null, null);
  }

  obtenerUsuarioSesionPorToken(token)
    .then((usuarioSesion) => {
      if (!usuarioSesion) {
        return callback(null, null);
      }

      req.session = req.session || {};
      req.session.usuario = usuarioSesion;
      req.usuarioSesion = usuarioSesion;
      req.sesion = {
        usuarioId: usuarioSesion.id,
        rol: usuarioSesion.rol,
        negocioId: usuarioSesion.negocio_id,
        esSuperAdmin: !!usuarioSesion.es_super_admin,
        impersonated: !!usuarioSesion.impersonated,
        forcePasswordChange: !!usuarioSesion.force_password_change,
        configModulos: usuarioSesion.config_modulos,
        token: usuarioSesion.token,
      };

      callback(null, usuarioSesion);
    })
    .catch((err) => callback(err));
};

const rutasPermitidasForcePassword = new Set(['/api/usuarios/mi-password', '/api/logout', '/api/negocios/mi-tema']);

const requireUsuarioSesion = (req, res, next) => {
  obtenerUsuarioDesdeHeaders(req, async (sessionErr, usuarioSesion) => {
    if (sessionErr) {
      console.error('Error al validar sesi?n:', sessionErr.message || sessionErr);
      return res.status(500).json({ error: 'Error al validar sesion' });
    }

    if (!usuarioSesion) {
      return res.status(401).json({ error: 'Sesion no valida. Inicia sesion nuevamente.' });
    }

    if (usuarioSesion.negocio_id == null) {
      console.warn('Usuario sin negocio_id en sesi?n autorizada', usuarioSesion.id);
      return res.status(403).json({ error: 'Acceso restringido: negocio no configurado' });
    }

    const rutaActual = (req.path || req.originalUrl || '').split('?')[0];
    if (usuarioSesion.force_password_change && !rutasPermitidasForcePassword.has(rutaActual)) {
      return res
        .status(403)
        .json({ error: 'Debes cambiar la contrasena antes de continuar', force_password_change: true });
    }

    try {
      const estado = await validarEstadoNegocio(usuarioSesion.negocio_id);
      if (!estado.ok) {
        return res
          .status(estado.status || 403)
          .json({ error: estado.error || 'Acceso restringido', motivo_suspension: estado.motivo_suspension });
      }
    } catch (error) {
      console.error('Error validando estado del negocio:', error?.message || error);
      return res.status(500).json({ error: 'Error al validar estado del negocio' });
    }

    req.session = req.session || {};
    req.session.usuario = usuarioSesion;
    req.usuarioSesion = usuarioSesion;
    req.sesion = req.sesion || {
      usuarioId: usuarioSesion.id,
      rol: usuarioSesion.rol,
      negocioId: usuarioSesion.negocio_id,
      esSuperAdmin: esSuperAdmin(usuarioSesion),
      impersonated: !!usuarioSesion.impersonated,
      forcePasswordChange: !!usuarioSesion.force_password_change,
      token: usuarioSesion.token,
    };

    next(usuarioSesion);
  });
};

const esUsuarioCocina = (usuario) => usuario?.rol === 'cocina';
const esUsuarioBar = (usuario) => usuario?.rol === 'bar';
const esUsuarioDelivery = (usuario) => usuario?.rol === 'delivery';
const esUsuarioAdmin = (usuario) => usuario?.rol === 'admin' || usuario?.rol === 'empresa';
const esUsuarioSupervisor = (usuario) => usuario?.rol === 'supervisor';
const esUsuarioEmpresa = (usuario) => usuario?.rol === 'empresa';
const esSuperAdmin = (usuario) => Boolean(usuario?.es_super_admin || usuario?.esSuperAdmin);
const tienePermisoAdmin = (usuario) =>
  esUsuarioAdmin(usuario) || esUsuarioSupervisor(usuario) || esUsuarioEmpresa(usuario) || esSuperAdmin(usuario);
const esImpersonacionEmpresa = (usuario) =>
  Boolean(
    usuario?.impersonated &&
      (usuario?.impersonated_by_role === 'empresa' || usuario?.impersonatedByRole === 'empresa')
  );
const puedeGestionarSupervisores = (usuario) =>
  esSuperAdmin(usuario) || esUsuarioEmpresa(usuario) || esImpersonacionEmpresa(usuario);
const puedeGestionarRol = (usuario, rolObjetivo) => {
  if (!rolObjetivo) return true;
  if (rolObjetivo === 'empresa') return esSuperAdmin(usuario);
  if (rolObjetivo === 'supervisor') return puedeGestionarSupervisores(usuario);
  return true;
};

const ROLES_POR_MODULO = Object.freeze({
  mesera: 'mesera',
  cocina: 'cocina',
  bar: 'bar',
  caja: 'caja',
  vendedor: 'mostrador',
  delivery: 'delivery',
});

const MODULO_LABELS = Object.freeze({
  mesera: 'Mesera',
  cocina: 'Cocina',
  bar: 'Bar',
  caja: 'Caja',
  mostrador: 'Mostrador',
  delivery: 'Delivery',
});

async function validarRolSegunModulosNegocio(rol, negocioId) {
  if (!rol || !negocioId) return null;
  const modulo = ROLES_POR_MODULO[rol];
  if (!modulo) return null;
  const activo = await moduloActivoParaNegocio(modulo, negocioId);
  if (activo !== false) return null;
  const nombreModulo = MODULO_LABELS[modulo] || modulo;
  return `El modulo de ${nombreModulo} esta desactivado para este negocio.`;
}
const requireSuperAdmin = (req, res, next) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    if (!esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido a super administradores' });
    }
    next(usuarioSesion);
  });
};

const CHAT_PAGE_SIZE = 30;
const CHAT_ROOM_TYPES = ['channel', 'private'];
const CHAT_SOCKET_EVENTS = {
  NEW_MESSAGE: 'message:new',
  PINNED: 'message:pinned',
  CLEARED: 'chat:cleared',
  TYPING: 'typing:update',
  MESSAGES_READ: 'messages:read',
};
const getChatRoomChannel = (roomId) => `chat-room-${roomId}`;

const normalizarContenidoMensaje = (texto) => {
  if (texto === undefined || texto === null) return '';
  return String(texto).trim();
};

const extraerUsernamesMencionados = (contenido = '') => {
  const coincidencias =
    contenido.match(/@([A-Za-z0-9_]+)/g)?.map((item) => item.slice(1).toLowerCase()) || [];
  return Array.from(new Set(coincidencias.filter(Boolean)));
};

const obtenerNegocioIdUsuario = (usuarioSesion) =>
  usuarioSesion?.negocio_id ?? usuarioSesion?.negocioId ?? NEGOCIO_ID_DEFAULT;

async function obtenerSalaPorId(roomId) {
  if (!roomId) return null;
  return db.get(
    `SELECT id, negocio_id, nombre, tipo, creado_por_usuario_id, created_at
       FROM chat_rooms
      WHERE id = ?
      LIMIT 1`,
    [roomId]
  );
}

async function obtenerRelacionSalaUsuario(roomId, usuarioId) {
  if (!roomId || !usuarioId) {
    return { esMiembro: false, esAdminSala: false };
  }

  const relacion = await db.get(
    'SELECT id, is_admin FROM chat_room_users WHERE room_id = ? AND usuario_id = ? LIMIT 1',
    [roomId, usuarioId]
  );

  return {
    esMiembro: !!relacion,
    esAdminSala: !!relacion?.is_admin,
  };
}

async function asegurarMembresiaSala(roomId, usuarioId) {
  if (!roomId || !usuarioId) return null;
  try {
    await db.run(
      'INSERT INTO chat_room_users (room_id, usuario_id, is_admin) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE usuario_id = usuario_id',
      [roomId, usuarioId]
    );
    return true;
  } catch (error) {
    console.warn('No se pudo asegurar la membresia en la sala:', error?.message || error);
    return false;
  }
}

async function validarAccesoSala(roomId, usuarioSesion) {
  const room = await obtenerSalaPorId(roomId);
  if (!room) {
    return { error: 'Sala no encontrada', status: 404 };
  }

  const negocioIdUsuario = obtenerNegocioIdUsuario(usuarioSesion);
  if (Number(room.negocio_id) !== Number(negocioIdUsuario)) {
    return { error: 'La sala no pertenece a tu negocio', status: 403 };
  }

  let { esMiembro, esAdminSala } = await obtenerRelacionSalaUsuario(room.id, usuarioSesion.id);
  if (room.tipo === 'channel' && !esMiembro) {
    await asegurarMembresiaSala(room.id, usuarioSesion.id);
    esMiembro = true;
  }

  const esAdministradorNegocio = esUsuarioAdmin(usuarioSesion) || esSuperAdmin(usuarioSesion);
  const puedeVer = room.tipo !== 'private' || esMiembro || esAdministradorNegocio;
  const puedeAdministrar = esAdministradorNegocio || esAdminSala;

  if (!puedeVer) {
    return { error: 'No tienes acceso a esta sala', status: 403 };
  }

  return { room, esMiembro, esAdminSala, puedeVer, puedeAdministrar };
}

async function obtenerUsuariosMencionados(contenido, negocioId) {
  const usernames = extraerUsernamesMencionados(contenido);
  if (!usernames.length) return [];

  const placeholders = usernames.map(() => '?').join(', ');
  const params = [...usernames, negocioId];

  const rows = await db.all(
    `SELECT id, nombre, usuario
       FROM usuarios
      WHERE LOWER(usuario) IN (${placeholders})
        AND negocio_id = ?
        AND activo = 1`,
    params
  );

  return rows || [];
}

async function guardarMenciones(messageId, usuariosMencionados) {
  if (!messageId || !usuariosMencionados?.length) return [];

  const inserciones = [];
  const usados = new Set();

  for (const usuario of usuariosMencionados) {
    if (!usuario?.id || usados.has(usuario.id)) continue;
    usados.add(usuario.id);
    try {
      await db.run('INSERT INTO chat_mentions (message_id, mentioned_usuario_id) VALUES (?, ?)', [
        messageId,
        usuario.id,
      ]);
      inserciones.push({ usuario_id: usuario.id, nombre: usuario.nombre, usuario: usuario.usuario });
    } catch (error) {
      console.warn('No se pudo registrar la mencion en el chat:', error?.message || error);
    }
  }

  return inserciones;
}

async function cargarMensajeCompleto(messageId, usuarioActualId = null) {
  if (!messageId) return null;

  const mensaje = await db.get(
    `SELECT m.id, m.room_id, m.negocio_id, m.usuario_id, m.contenido, m.tipo, m.is_pinned,
            m.reply_to_message_id, m.created_at, m.deleted_at,
            u.nombre AS usuario_nombre, u.usuario AS usuario_usuario,
            r.nombre AS room_nombre
       FROM chat_messages m
       JOIN usuarios u ON u.id = m.usuario_id
       LEFT JOIN chat_rooms r ON r.id = m.room_id
      WHERE m.id = ?
      LIMIT 1`,
    [messageId]
  );

  if (!mensaje) return null;

  const menciones = await db.all(
    `SELECT cm.mentioned_usuario_id AS usuario_id, u.nombre, u.usuario
       FROM chat_mentions cm
       JOIN usuarios u ON u.id = cm.mentioned_usuario_id
      WHERE cm.message_id = ?`,
    [messageId]
  );

  const mencionaActual =
    usuarioActualId != null &&
    menciones.some((m) => Number(m.usuario_id) === Number(usuarioActualId));

  return {
    ...mensaje,
    menciones: menciones || [],
    menciona_actual: mencionaActual,
    es_propietario: Number(mensaje.usuario_id) === Number(usuarioActualId),
  };
}

async function obtenerMensajesDeSala({
  roomId,
  negocioId,
  usuarioActualId,
  page = 1,
  limit = CHAT_PAGE_SIZE,
}) {
  const takeInput = Number(limit);
  const pageInput = Number(page);
  const take = Number.isFinite(takeInput)
    ? Math.max(1, Math.min(Math.trunc(takeInput), 100))
    : CHAT_PAGE_SIZE;
  const pageNumber = Number.isFinite(pageInput) ? Math.max(1, Math.trunc(pageInput)) : 1;
  const offset = Math.max(0, (pageNumber - 1) * take);
  const roomIdNumber = Number(roomId);
  const negocioIdNumber = Number(negocioId);
  const usuarioIdNumber = Number(usuarioActualId) || 0;
  const limitClause = `LIMIT ${take} OFFSET ${offset}`;

  const rows = await db.all(
    `SELECT m.id, m.room_id, m.negocio_id, m.usuario_id, m.contenido, m.tipo,
            m.is_pinned, m.reply_to_message_id, m.created_at, m.deleted_at,
            u.nombre AS usuario_nombre, u.usuario AS usuario_usuario,
            CASE WHEN cm.id IS NULL THEN 0 ELSE 1 END AS menciona_actual
       FROM chat_messages m
       JOIN usuarios u ON u.id = m.usuario_id
       LEFT JOIN chat_mentions cm ON cm.message_id = m.id AND cm.mentioned_usuario_id = ?
      WHERE m.room_id = ?
        AND m.negocio_id = ?
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      ${limitClause}`,
    [usuarioIdNumber, roomIdNumber, negocioIdNumber]
  );

  const mensajesDesc = rows || [];
  const ids = mensajesDesc.map((m) => m.id).filter(Boolean);
  const mensajesOrdenados = [...mensajesDesc].reverse();

  let mencionesPorMensaje = {};
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(', ');
    const menciones = await db.all(
      `SELECT cm.message_id, cm.mentioned_usuario_id AS usuario_id, u.nombre, u.usuario
         FROM chat_mentions cm
         JOIN usuarios u ON u.id = cm.mentioned_usuario_id
        WHERE cm.message_id IN (${placeholders})`,
      ids
    );

    mencionesPorMensaje = (menciones || []).reduce((acc, menc) => {
      acc[menc.message_id] = acc[menc.message_id] || [];
      acc[menc.message_id].push({
        usuario_id: menc.usuario_id,
        nombre: menc.nombre,
        usuario: menc.usuario,
      });
      return acc;
    }, {});
  }

  const mensajes = mensajesOrdenados.map((m) => ({
    ...m,
    menciones: mencionesPorMensaje[m.id] || [],
    menciona_actual: Boolean(m.menciona_actual),
    es_propietario: Number(m.usuario_id) === Number(usuarioActualId),
    created_at: m.created_at,
  }));

  return { mensajes, hasMore: mensajesDesc.length === take };
}

// Guarda lecturas de mensajes por usuario para soportar estados "visto"
async function marcarMensajesComoLeidos({ roomId, negocioId, usuarioId, lastVisibleMessageId }) {
  const roomIdNumber = Number(roomId);
  const negocioIdNumber = Number(negocioId);
  const usuarioIdNumber = Number(usuarioId);
  const lastIdNumber = Number(lastVisibleMessageId);

  if (!roomIdNumber || !negocioIdNumber || !usuarioIdNumber || !lastIdNumber) {
    return { ok: false, error: 'Parametros incompletos para marcar lectura' };
  }

  try {
    // Limitar la cantidad de mensajes a insertar para reducir locking y evitar deadlocks
    const mensajes = await db.all(
      `
        SELECT id
          FROM chat_messages
         WHERE room_id = ?
           AND negocio_id = ?
           AND deleted_at IS NULL
           AND id <= ?
         ORDER BY id DESC
         LIMIT 200
      `,
      [roomIdNumber, negocioIdNumber, lastIdNumber]
    );

    if (!mensajes || !mensajes.length) {
      return { ok: true, last_read_message_id: lastIdNumber };
    }

    const valuesPlaceholders = mensajes.map(() => '(?, ?, CURRENT_TIMESTAMP)').join(', ');
    const params = mensajes.flatMap((m) => [m.id, usuarioIdNumber]);

    await db.run(
      `INSERT IGNORE INTO chat_message_reads (message_id, usuario_id, read_at) VALUES ${valuesPlaceholders}`,
      params
    );

    return { ok: true, last_read_message_id: lastIdNumber };
  } catch (error) {
    console.error('Error marcando mensajes como leidos:', error?.message || error);
    return { ok: false, error: 'No se pudieron marcar los mensajes como leidos' };
  }
}

async function crearMensaje({ room, usuarioSesion, contenido, tipo = 'text' }) {
  const texto = normalizarContenidoMensaje(contenido);
  if (!texto) {
    throw { status: 400, message: 'El mensaje no puede estar vacio' };
  }

  const resultado = await db.run(
    'INSERT INTO chat_messages (room_id, negocio_id, usuario_id, contenido, tipo) VALUES (?, ?, ?, ?, ?)',
    [room.id, room.negocio_id, usuarioSesion.id, texto, tipo || 'text']
  );
  const mensajeId = resultado?.lastID || resultado?.lastId || resultado?.insertId;

  const usuariosMencionados = await obtenerUsuariosMencionados(texto, room.negocio_id);
  await guardarMenciones(mensajeId, usuariosMencionados);

  return cargarMensajeCompleto(mensajeId, usuarioSesion.id);
}

const emitirNuevoMensaje = (mensaje) => {
  if (!io || !mensaje?.room_id) return;
  io.to(getChatRoomChannel(mensaje.room_id)).emit(CHAT_SOCKET_EVENTS.NEW_MESSAGE, mensaje);
};

const emitirPinMensaje = (roomId, payload) => {
  if (!io || !roomId) return;
  io.to(getChatRoomChannel(roomId)).emit(CHAT_SOCKET_EVENTS.PINNED, payload);
};

const emitirChatVaciado = (roomId, usuarioId) => {
  if (!io || !roomId) return;
  io.to(getChatRoomChannel(roomId)).emit(CHAT_SOCKET_EVENTS.CLEARED, {
    room_id: roomId,
    vaciado_por: usuarioId || null,
  });
};

const emitirLecturas = ({ roomId, usuarioId, lastReadMessageId }) => {
  if (!io || !roomId || !usuarioId || !lastReadMessageId) return;
  io.to(getChatRoomChannel(roomId)).emit(CHAT_SOCKET_EVENTS.MESSAGES_READ, {
    room_id: roomId,
    usuario_id: usuarioId,
    last_read_message_id: lastReadMessageId,
  });
};

async function listarSalasChat(usuarioSesion, filtros = {}) {
  const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
  const { tipo, nombre } = filtros;
  const filtroTipo = CHAT_ROOM_TYPES.includes(tipo) ? tipo : null;
  const busqueda = nombre ? `%${nombre.trim()}%` : null;
  const esAdministradorNegocio = esUsuarioAdmin(usuarioSesion) || esSuperAdmin(usuarioSesion);
  const usuarioId = usuarioSesion.id;

  const condiciones = ['r.negocio_id = ?'];
  const params = [negocioId];

  if (filtroTipo) {
    condiciones.push('r.tipo = ?');
    params.push(filtroTipo);
  }

  if (busqueda) {
    condiciones.push('r.nombre LIKE ?');
    params.push(busqueda);
  }

  const sql = `
    SELECT r.id, r.nombre, r.tipo, r.negocio_id, r.creado_por_usuario_id, r.created_at,
           MAX(COALESCE(cru.is_admin, 0)) AS es_admin_sala,
           MAX(CASE WHEN cru.id IS NULL THEN 0 ELSE 1 END) AS es_miembro,
           MIN(CASE WHEN r.tipo = 'private' THEN u2.id END) AS contacto_id,
           MIN(CASE WHEN r.tipo = 'private' THEN u2.nombre END) AS contacto_nombre,
           MIN(CASE WHEN r.tipo = 'private' THEN u2.usuario END) AS contacto_usuario,
           COALESCE(uc.unread_count, 0) AS unread_count,
           lm.last_message_id,
           lm.last_message_at
      FROM chat_rooms r
      LEFT JOIN chat_room_users cru ON cru.room_id = r.id AND cru.usuario_id = ?
      LEFT JOIN chat_room_users cru2 ON cru2.room_id = r.id AND cru2.usuario_id != ?
      LEFT JOIN usuarios u2 ON u2.id = cru2.usuario_id
      LEFT JOIN (
        SELECT m.room_id, COUNT(*) AS unread_count
          FROM chat_messages m
          JOIN chat_rooms r2 ON r2.id = m.room_id
          LEFT JOIN chat_message_reads mr ON mr.message_id = m.id AND mr.usuario_id = ?
         WHERE m.deleted_at IS NULL
           AND mr.id IS NULL
           AND m.usuario_id <> ?
           AND r2.negocio_id = ?
         GROUP BY m.room_id
      ) uc ON uc.room_id = r.id
      LEFT JOIN (
        SELECT room_id, MAX(id) AS last_message_id, MAX(created_at) AS last_message_at
          FROM chat_messages
         WHERE deleted_at IS NULL
         GROUP BY room_id
      ) lm ON lm.room_id = r.id
     WHERE ${condiciones.join(' AND ')}
       AND (r.tipo != 'private' OR cru.id IS NOT NULL OR ?)
     GROUP BY r.id
     ORDER BY COALESCE(uc.unread_count, 0) DESC, lm.last_message_at DESC, r.nombre ASC
  `;

  const filas = await db.all(sql, [
    usuarioId,
    usuarioId,
    usuarioId,
    usuarioId,
    negocioId,
    ...params,
    esAdministradorNegocio ? 1 : 0,
  ]);
  return (filas || []).map((row) => ({
    ...row,
    es_miembro: !!row.es_miembro,
    es_admin_sala: !!row.es_admin_sala,
    puede_fijar: esAdministradorNegocio || !!row.es_admin_sala,
    titulo_privado:
      row.tipo === 'private'
        ? row.contacto_nombre || row.contacto_usuario || row.nombre || 'Chat privado'
        : row.nombre,
    unread_count: Number(row.unread_count || 0),
  }));
}

async function obtenerMensajeConSala(messageId) {
  if (!messageId) return null;
  return db.get(
    `SELECT m.id, m.room_id, m.negocio_id, m.usuario_id, m.is_pinned, m.deleted_at,
            r.tipo AS room_tipo, r.negocio_id AS room_negocio_id
       FROM chat_messages m
       JOIN chat_rooms r ON r.id = m.room_id
      WHERE m.id = ?
      LIMIT 1`,
    [messageId]
  );
}

// Busqueda filtrada dentro de una sala concreta (texto, usuario, fechas)
async function buscarMensajesEnSala({ roomId, negocioId, q, usuarioId, fechaDesde, fechaHasta, page = 1 }) {
  const take = 30;
  const pageNumber = Number.isFinite(Number(page)) ? Math.max(1, Math.trunc(Number(page))) : 1;
  const offset = (pageNumber - 1) * take;

  const condiciones = ['m.room_id = ?', 'm.negocio_id = ?', 'm.deleted_at IS NULL'];
  const params = [Number(roomId), Number(negocioId)];

  if (q && q.trim()) {
    condiciones.push('m.contenido LIKE ?');
    params.push(`%${q.trim()}%`);
  }

  if (usuarioId) {
    condiciones.push('m.usuario_id = ?');
    params.push(Number(usuarioId));
  }

  if (fechaDesde) {
    condiciones.push('DATE(m.created_at) >= ?');
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    condiciones.push('DATE(m.created_at) <= ?');
    params.push(fechaHasta);
  }

  const sql = `
    SELECT m.id, m.room_id, m.negocio_id, m.usuario_id, m.contenido, m.tipo,
           m.is_pinned, m.created_at, u.nombre AS usuario_nombre, u.usuario AS usuario_usuario
      FROM chat_messages m
      JOIN usuarios u ON u.id = m.usuario_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY m.created_at DESC
     LIMIT ${take}
    OFFSET ${offset}
  `;

  const rows = await db.all(sql, params);
  return rows || [];
}

// Busca o crea una sala privada entre dos usuarios del mismo negocio
async function obtenerSalaPrivada(usuarioSesion, usuarioObjetivoId) {
  const usuarioId = Number(usuarioSesion?.id);
  const objetivoId = Number(usuarioObjetivoId);
  if (!usuarioId || !objetivoId || usuarioId === objetivoId) {
    throw { status: 400, message: 'Usuario objetivo invalido' };
  }

  const usuarioObjetivo = await usuariosRepo.findById(objetivoId);
  if (!usuarioObjetivo || !usuarioObjetivo.activo) {
    throw { status: 404, message: 'Usuario destino no encontrado o inactivo' };
  }

  const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
  if (Number(usuarioObjetivo.negocio_id) !== Number(negocioId)) {
    throw { status: 403, message: 'El usuario destino pertenece a otro negocio' };
  }

  // Buscar si ya existe sala privada entre ambos usuarios
  const existente = await db.get(
    `
    SELECT r.id, r.nombre, r.tipo, r.negocio_id
      FROM chat_rooms r
      JOIN chat_room_users cru1 ON cru1.room_id = r.id AND cru1.usuario_id = ?
      JOIN chat_room_users cru2 ON cru2.room_id = r.id AND cru2.usuario_id = ?
     WHERE r.tipo = 'private'
       AND r.negocio_id = ?
     LIMIT 1
    `,
    [usuarioId, objetivoId, negocioId]
  );

  if (existente) {
    return existente;
  }

  const nombreSala = `Privado ${usuarioSesion.nombre || usuarioSesion.usuario || usuarioId} - ${
    usuarioObjetivo.nombre || usuarioObjetivo.usuario || usuarioObjetivo.id
  }`;

  const insert = await db.run(
    'INSERT INTO chat_rooms (negocio_id, nombre, tipo, creado_por_usuario_id) VALUES (?, ?, "private", ?)',
    [negocioId, nombreSala, usuarioId]
  );
  const roomId = insert?.lastID || insert?.insertId;

  await db.run(
    'INSERT INTO chat_room_users (room_id, usuario_id, is_admin) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE usuario_id = usuario_id',
    [roomId, usuarioId]
  );
  await db.run(
    'INSERT INTO chat_room_users (room_id, usuario_id, is_admin) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE usuario_id = usuario_id',
    [roomId, objetivoId]
  );

  return {
    id: roomId,
    nombre: nombreSala,
    tipo: 'private',
    negocio_id: negocioId,
  };
}

const registrarHistorialCocina = (pedidoId, negocioId, callback = () => {}) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = NEGOCIO_ID_DEFAULT;
  }

  db.get(
    `SELECT cuenta_id, fecha_creacion, COALESCE(fecha_listo, CURRENT_TIMESTAMP) AS fecha_listo, cocinero_id, cocinero_nombre
     FROM pedidos WHERE id = ? AND negocio_id = ?`,
    [pedidoId, negocioId],
    (pedidoErr, pedido) => {
      if (pedidoErr || !pedido) {
        if (pedidoErr) {
          console.error('Error al preparar historial de cocina:', pedidoErr.message);
        }
        return callback();
      }

      db.get(
        'SELECT COUNT(1) AS total FROM historial_cocina WHERE pedido_id = ? AND negocio_id = ?',
        [pedidoId, negocioId],
        (countErr, row) => {
          if (countErr) {
            console.error('Error verificando historial de cocina:', countErr.message);
            return callback();
          }

          if (row?.total > 0) {
            return callback();
          }

          db.all(
            `SELECT d.cantidad, p.nombre
             FROM detalle_pedido d
             JOIN productos p ON p.id = d.producto_id
             LEFT JOIN categorias c ON c.id = p.categoria_id
             WHERE d.pedido_id = ? AND d.negocio_id = ?
               AND COALESCE(c.area_preparacion, 'ninguna') = 'cocina'`,
            [pedidoId, negocioId],
            (detalleErr, items) => {
              if (detalleErr) {
                console.error('Error obteniendo detalle para historial de cocina:', detalleErr.message);
                return callback();
              }

              if (!items || !items.length) {
                return callback();
              }

              const stmt = db.prepare(
                `INSERT INTO historial_cocina (
                  cuenta_id,
                  pedido_id,
                  item_nombre,
                  cantidad,
                  cocinero_id,
                  cocinero_nombre,
                  created_at,
                  completed_at,
                  negocio_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );

              items.forEach((item) => {
                stmt.run(
                  pedido.cuenta_id || pedidoId,
                  pedidoId,
                  item.nombre,
                  item.cantidad,
                  pedido.cocinero_id || null,
                  pedido.cocinero_nombre || null,
                  pedido.fecha_creacion,
                  pedido.fecha_listo,
                  negocioId
                );
              });

              stmt.finalize(() => callback());
            }
          );
        }
      );
    }
  );
};

const registrarHistorialBar = (pedidoId, negocioId, callback = () => {}) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = NEGOCIO_ID_DEFAULT;
  }

  db.get(
    `SELECT cuenta_id, fecha_creacion, COALESCE(fecha_listo, CURRENT_TIMESTAMP) AS fecha_listo, bartender_id, bartender_nombre
     FROM pedidos WHERE id = ? AND negocio_id = ?`,
    [pedidoId, negocioId],
    (pedidoErr, pedido) => {
      if (pedidoErr || !pedido) {
        if (pedidoErr) {
          console.error('Error al preparar historial de bar:', pedidoErr.message);
        }
        return callback();
      }

      db.get(
        'SELECT COUNT(1) AS total FROM historial_bar WHERE pedido_id = ? AND negocio_id = ?',
        [pedidoId, negocioId],
        (countErr, row) => {
          if (countErr) {
            console.error('Error verificando historial de bar:', countErr.message);
            return callback();
          }

          if (row?.total > 0) {
            return callback();
          }

          db.all(
            `SELECT d.cantidad, p.nombre
             FROM detalle_pedido d
             JOIN productos p ON p.id = d.producto_id
             LEFT JOIN categorias c ON c.id = p.categoria_id
             WHERE d.pedido_id = ? AND d.negocio_id = ?
               AND COALESCE(c.area_preparacion, 'ninguna') = 'bar'`,
            [pedidoId, negocioId],
            (detalleErr, items) => {
              if (detalleErr) {
                console.error('Error obteniendo detalle para historial de bar:', detalleErr.message);
                return callback();
              }

              if (!items || !items.length) {
                return callback();
              }

              const stmt = db.prepare(
                `INSERT INTO historial_bar (
                  cuenta_id,
                  pedido_id,
                  item_nombre,
                  cantidad,
                  bartender_id,
                  bartender_nombre,
                  created_at,
                  completed_at,
                  negocio_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );

              items.forEach((item) => {
              stmt.run(
                  pedido.cuenta_id || pedidoId,
                  pedidoId,
                  item.nombre,
                  item.cantidad,
                  pedido.bartender_id || null,
                  pedido.bartender_nombre || null,
                  pedido.fecha_creacion,
                  pedido.fecha_listo,
                  negocioId
                );
              });

              stmt.finalize(() => callback());
            }
          );
        }
      );
    }
  );
};

const IMPUESTO_POR_DEFECTO = 18;
const IMPUESTO_CONFIG_CLAVE = 'impuesto_porcentaje';
const PRODUCTOS_CON_IMPUESTO_CONFIG_CLAVE = 'productos_con_impuesto';
const IMPUESTO_INCLUIDO_CONFIG_CLAVE = 'impuesto_incluido_porcentaje';

const obtenerConfiguracionImpuestoNegocio = async (negocioId) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const valores = await leerConfiguracionNegocio(negocio, [
    IMPUESTO_CONFIG_CLAVE,
    PRODUCTOS_CON_IMPUESTO_CONFIG_CLAVE,
    IMPUESTO_INCLUIDO_CONFIG_CLAVE,
  ]);
  const porcentajeRaw = Number.parseFloat(valores?.[IMPUESTO_CONFIG_CLAVE]);
  const porcentajeBase =
    Number.isFinite(porcentajeRaw) && porcentajeRaw >= 0 ? porcentajeRaw : IMPUESTO_POR_DEFECTO;
  const productosConImpuesto = normalizarFlag(valores?.[PRODUCTOS_CON_IMPUESTO_CONFIG_CLAVE], 0) === 1;
  const porcentajeIncluidoRaw = Number.parseFloat(valores?.[IMPUESTO_INCLUIDO_CONFIG_CLAVE]);
  const impuestoIncluidoValor =
    Number.isFinite(porcentajeIncluidoRaw) && porcentajeIncluidoRaw >= 0
      ? porcentajeIncluidoRaw
      : porcentajeBase;

  return {
    valorBase: porcentajeBase,
    valor: productosConImpuesto ? 0 : porcentajeBase,
    productosConImpuesto,
    impuestoIncluidoValor,
  };
};

const obtenerImpuestoConfigurado = (negocioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = 1;
  }

  obtenerConfiguracionImpuestoNegocio(negocioId || 1)
    .then((config) => callback(null, config.valor))
    .catch((err) => callback(err));
};

const padNumber = (valor, digitos) => {
  const numero = Number(valor) || 0;
  return numero.toString().padStart(digitos, '0');
};

const formatearFechaHoraMySQL = (valor) => {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const year = fecha.getFullYear();
  const month = pad(fecha.getMonth() + 1);
  const day = pad(fecha.getDate());
  const hours = pad(fecha.getHours());
  const minutes = pad(fecha.getMinutes());
  const seconds = pad(fecha.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const obtenerLimiteNCF = (tipo, negocioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = 1;
  }

  const clave = tipo === 'B01' ? 'ncf_b01_fin' : 'ncf_b02_fin';
  db.get(
    'SELECT valor FROM configuracion WHERE clave = ? AND negocio_id = ? LIMIT 1',
    [clave, negocioId || 1],
    (err, row) => {
      if (err) {
        return callback(err, null);
      }
      if (!row || row.valor === null || row.valor === undefined || row.valor === '') {
        return callback(null, null);
      }
      const fin = Number(row.valor);
      callback(null, Number.isNaN(fin) ? null : fin);
    }
  );
};

const generarNCF = (tipoSolicitado, negocioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = 1;
  }

  const tipo = tipoSolicitado || 'B02';
  db.get(
    'SELECT tipo, prefijo, digitos, correlativo FROM secuencias_ncf WHERE tipo = ? AND negocio_id = ?',
    [tipo, negocioId || 1],
    (err, row) => {
      if (err) {
        return callback(err);
      }

      obtenerLimiteNCF(tipo, negocioId || 1, (limiteErr, fin) => {
        if (limiteErr) {
          return callback(limiteErr);
        }

        const prefijo = row ? row.prefijo : tipo;
        const digitos = row ? Number(row.digitos) || 8 : 8;
        const correlativo = row ? Number(row.correlativo) || 1 : 1;

        if (fin && correlativo > fin) {
          return callback(new Error('No hay comprobantes disponibles en la secuencia configurada'));
        }

        const ncf = `${prefijo}${padNumber(correlativo, digitos)}`;
        const siguiente = correlativo + 1;
          const actualizarCorrelativo = () => {
            if (row) {
              db.run(
              'UPDATE secuencias_ncf SET correlativo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE tipo = ? AND negocio_id = ?',
              [siguiente, tipo, negocioId || 1],
              (updateErr) => {
                if (updateErr) {
                  return callback(updateErr);
                }
                callback(null, ncf);
              }
            );
          } else {
            db.run(
              'INSERT INTO secuencias_ncf (tipo, prefijo, digitos, correlativo, negocio_id) VALUES (?, ?, ?, ?, ?)',
              [tipo, prefijo, digitos, siguiente, negocioId || 1],
              (insertErr) => {
                if (insertErr) {
                  return callback(insertErr);
                }
                callback(null, ncf);
              }
            );
          }
        };

        if (fin && siguiente > fin + 1) {
          return callback(new Error('Secuencia de NCF agotada'));
        }

        actualizarCorrelativo();
      });
    }
  );
};

const FACTURACION_CLAVES = {
  telefonos: 'facturacion_telefonos',
  telefono: 'facturacion_telefono',
  direccion: 'facturacion_direccion',
  rnc: 'facturacion_rnc',
  logo: 'facturacion_logo',
  pie: 'facturacion_pie',
  b02_inicio: 'ncf_b02_inicio',
  b02_fin: 'ncf_b02_fin',
  b01_inicio: 'ncf_b01_inicio',
  b01_fin: 'ncf_b01_fin',
};

const leerConfiguracionNegocio = (negocioId, claves) =>
  new Promise((resolve, reject) => {
    const negocio = negocioId || NEGOCIO_ID_DEFAULT;
    const clavesFiltradas = Array.from(new Set(Array.isArray(claves) ? claves.filter(Boolean) : []));
    if (!clavesFiltradas.length) {
      return resolve({});
    }
    const placeholders = clavesFiltradas.map(() => '?').join(', ');
    const sql = `
      SELECT clave, valor
      FROM configuracion
      WHERE negocio_id = ?
        AND clave IN (${placeholders})
    `;
    db.all(sql, [negocio, ...clavesFiltradas], (err, rows) => {
      if (err) {
        return reject(err);
      }
      const valores = {};
      (rows || []).forEach((fila) => {
        if (fila?.clave) {
          valores[fila.clave] = fila.valor;
        }
      });
      resolve(valores);
    });
  });

const upsertConfiguracionValor = (negocioId, clave, valor) =>
  new Promise((resolve, reject) => {
    const negocio = negocioId || NEGOCIO_ID_DEFAULT;
    db.run(
      'INSERT INTO configuracion (clave, valor, negocio_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
      [clave, valor, negocio],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });

const guardarConfiguracionNegocio = async (negocioId, valores = {}) => {
  const entries = Object.entries(valores);
  for (const [clave, rawValor] of entries) {
    if (!clave) continue;
    const valor = rawValor === undefined || rawValor === null ? '' : String(rawValor);
    await upsertConfiguracionValor(negocioId, clave, valor);
  }
};

const COGS_CONFIG_KEY = 'cogs_costo_estimado';
const ITBIS_ACREDITA_CONFIG_KEY = 'itbis_acredita';
const INVENTARIO_MODO_CONFIG_KEY = 'modo_inventario_costos';
const INSUMOS_BLOQUEO_CONFIG_KEY = 'insumos_bloquear_sin_stock';

const obtenerCostoEstimadoCogs = async (negocioId) => {
  try {
    const valores = await leerConfiguracionNegocio(negocioId, [COGS_CONFIG_KEY]);
    const raw = valores?.[COGS_CONFIG_KEY];
    const valor = normalizarNumero(raw, 0);
    return valor >= 0 ? Number(valor.toFixed(2)) : 0;
  } catch (error) {
    console.warn('No se pudo obtener el costo estimado de COGS:', error?.message || error);
    return 0;
  }
};

const obtenerConfigAcreditaItbis = async (negocioId) => {
  try {
    const valores = await leerConfiguracionNegocio(negocioId, [ITBIS_ACREDITA_CONFIG_KEY]);
    const raw = valores?.[ITBIS_ACREDITA_CONFIG_KEY];
    return normalizarFlag(raw, 1) === 1;
  } catch (error) {
    console.warn('No se pudo obtener configuracion de ITBIS acreditable:', error?.message || error);
    return true;
  }
};

const obtenerModoInventarioCostos = async (negocioId) => {
  try {
    const valores = await leerConfiguracionNegocio(negocioId, [INVENTARIO_MODO_CONFIG_KEY]);
    const raw = valores?.[INVENTARIO_MODO_CONFIG_KEY];
    return normalizarModoInventarioCostos(raw, 'PREPARACION');
  } catch (error) {
    console.warn('No se pudo obtener configuracion de modo inventario:', error?.message || error);
    return 'PREPARACION';
  }
};

const obtenerConfigBloqueoInsumos = async (negocioId) => {
  try {
    const valores = await leerConfiguracionNegocio(negocioId, [INSUMOS_BLOQUEO_CONFIG_KEY]);
    const raw = valores?.[INSUMOS_BLOQUEO_CONFIG_KEY];
    return normalizarFlag(raw, 0) === 1;
  } catch (error) {
    console.warn('No se pudo obtener configuracion de bloqueo de insumos:', error?.message || error);
    return false;
  }
};

const leerSecuenciaCorrelativo = (tipo, negocioId) =>
  new Promise((resolve, reject) => {
    const negocio = negocioId || NEGOCIO_ID_DEFAULT;
    db.get(
      'SELECT correlativo FROM secuencias_ncf WHERE tipo = ? AND negocio_id = ?',
      [tipo || 'B02', negocio],
      (err, row) => {
        if (err) {
          return reject(err);
        }
        const correlativo = row ? Number(row.correlativo) || 1 : 1;
        resolve(correlativo);
      }
    );
  });

const construirRangoNCF = async (tipo, inicioValor, finValor, negocioId, umbral = 0) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const inicioNumero = Number(inicioValor);
  const finNumero = Number(finValor);
  const correlativo = await leerSecuenciaCorrelativo(tipo, negocio);
  const limite = Number.isFinite(finNumero) ? finNumero : null;
  let restante = null;
  if (limite !== null) {
    const siguiente = Number.isFinite(correlativo) ? correlativo : 1;
    restante = Math.max(limite - siguiente + 1, 0);
    if (restante < 0) {
      restante = 0;
    }
  }
  const alerta = restante !== null && Number.isFinite(umbral) && restante <= umbral;
  return {
    inicio: Number.isFinite(inicioNumero) ? inicioNumero : null,
    fin: limite,
    restante: Number.isFinite(restante) ? restante : null,
    alerta: Boolean(alerta),
  };
};

const extraerTelefonosConfiguracion = (valor) => {
  if (!valor) return [];
  if (Array.isArray(valor)) {
    return valor
      .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
      .filter(Boolean);
  }

  const texto = String(valor).trim();
  if (!texto) {
    return [];
  }

  try {
    const parsed = JSON.parse(texto);
    if (Array.isArray(parsed)) {
      const procesados = parsed
        .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
        .filter(Boolean);
      if (procesados.length) {
        return procesados;
      }
    }
  } catch (error) {
    // ignore errores de parseo
  }

  return texto
    .split(/[|,/;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizarTextoConfiguracion = (valor) => (valor === undefined || valor === null ? '' : String(valor).trim());

const normalizarNumeroConfiguracion = (valor) => {
  if (valor === undefined || valor === null || valor === '') {
    return '';
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return '';
  }
  return String(Math.max(0, Math.floor(numero)));
};

const obtenerConfiguracionFacturacion = async (negocioId) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const claves = Array.from(new Set(Object.values(FACTURACION_CLAVES)));
  const valores = await leerConfiguracionNegocio(negocio, claves);

  const telefonosConfigurados = extraerTelefonosConfiguracion(
    valores[FACTURACION_CLAVES.telefonos] || valores[FACTURACION_CLAVES.telefono]
  );

  const b02 = await construirRangoNCF(
    'B02',
    valores[FACTURACION_CLAVES.b02_inicio],
    valores[FACTURACION_CLAVES.b02_fin],
    negocio,
    20
  );
  const b01 = await construirRangoNCF(
    'B01',
    valores[FACTURACION_CLAVES.b01_inicio],
    valores[FACTURACION_CLAVES.b01_fin],
    negocio,
    5
  );

  return {
    telefonos: telefonosConfigurados,
    telefono:
      telefonosConfigurados.length > 0
        ? telefonosConfigurados.join(' | ')
        : valores[FACTURACION_CLAVES.telefono] || '',
    direccion: valores[FACTURACION_CLAVES.direccion] || '',
    rnc: valores[FACTURACION_CLAVES.rnc] || '',
    logo: valores[FACTURACION_CLAVES.logo] || '',
    pie: valores[FACTURACION_CLAVES.pie] || '',
    b02,
    b01,
  };
};

const obtenerImpuestoConfiguradoAsync = (negocioId) =>
  new Promise((resolve, reject) => {
    obtenerImpuestoConfigurado(negocioId, (err, valor) => {
      if (err) {
        return reject(err);
      }
      resolve(valor);
    });
  });

const redondearMoneda = (valor) => Number((Number(valor) || 0).toFixed(2));

const calcularTotalesConImpuestoConfigurado = (montoBase, configuracion = {}) => {
  const base = Math.max(Number(montoBase) || 0, 0);
  const productosConImpuesto = normalizarFlag(
    configuracion.productosConImpuesto ?? configuracion.productos_con_impuesto,
    0
  ) === 1;
  const tasaNormal = Math.max(Number(configuracion.valor) || 0, 0);
  const tasaIncluida = Math.max(
    Number(configuracion.impuestoIncluidoValor ?? configuracion.impuesto_incluido_valor) || 0,
    0
  );

  if (productosConImpuesto) {
    if (tasaIncluida > 0) {
      const subtotal = base / (1 + tasaIncluida / 100);
      const impuesto = base - subtotal;
      return {
        subtotal: redondearMoneda(subtotal),
        impuesto: redondearMoneda(impuesto),
        total: redondearMoneda(base),
      };
    }
    return {
      subtotal: redondearMoneda(base),
      impuesto: 0,
      total: redondearMoneda(base),
    };
  }

  const impuesto = base * (tasaNormal / 100);
  return {
    subtotal: redondearMoneda(base),
    impuesto: redondearMoneda(impuesto),
    total: redondearMoneda(base + impuesto),
  };
};

const construirCSV = (headers, rows) => {
  const escapeValor = (valor) => {
    if (valor === null || valor === undefined) {
      return '';
    }
    const texto = String(valor);
    if (/[",\n]/.test(texto)) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  };

  const lineas = [headers.join(',')];
  rows.forEach((row) => {
    const linea = headers.map((header) => escapeValor(row[header]));
    lineas.push(linea.join(','));
  });
  return lineas.join('\n');
};

const obtenerRangoMensual = (anio, mes) => {
  const year = Number(anio);
  const month = Number(mes);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const inicio = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const fin = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return {
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
  };
};

const normalizarNumero = (valor, predeterminado = 0) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : predeterminado;
};

const normalizarListaPrecios = (entrada) => {
  if (entrada === undefined || entrada === null || entrada === '') {
    return [];
  }

  let lista = entrada;
  if (typeof lista === 'string') {
    try {
      lista = JSON.parse(lista);
    } catch (error) {
      return [];
    }
  }

  if (!Array.isArray(lista)) {
    return [];
  }

  const resultado = [];
  const vistos = new Set();

  lista.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const valor = normalizarNumero(item.valor ?? item.precio ?? item.price ?? item.value, null);
    if (valor === null || valor < 0) return;
    const etiqueta =
      normalizarCampoTexto(item.label ?? item.nombre ?? item.name ?? item.etiqueta, null) || `Precio ${index + 1}`;
    const valorRedondeado = Number(valor.toFixed(2));
    const key = `${etiqueta}|${valorRedondeado}`;
    if (vistos.has(key)) return;
    vistos.add(key);
    resultado.push({ label: etiqueta, valor: valorRedondeado });
  });

  return resultado;
};

const construirOpcionesPrecioProducto = (producto) => {
  const base = normalizarNumero(producto?.precio, 0);
  const extras = normalizarListaPrecios(producto?.precios);
  const opciones = [{ label: 'Base', valor: Number(base.toFixed(2)) }, ...extras];
  const vistos = new Set();
  return opciones.filter((opcion) => {
    const key = `${opcion.label}|${Number(opcion.valor).toFixed(2)}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
};

const normalizarFlag = (valor, predeterminado = 0) => {
  if (valor === undefined || valor === null) {
    return predeterminado;
  }
  if (typeof valor === 'string') {
    const limpio = valor.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes', 'si'].includes(limpio)) return 1;
    if (['0', 'false', 'off', 'no'].includes(limpio)) return 0;
  }
  return valor ? 1 : 0;
};

const normalizarTipoProducto = (valor, predeterminado = 'FINAL') => {
  const limpio = String(valor || '').trim().toUpperCase();
  if (TIPOS_PRODUCTO.has(limpio)) {
    return limpio;
  }
  return predeterminado;
};

const normalizarUnidadBase = (valor, predeterminado = 'UND') => {
  const limpio = String(valor || '').trim().toUpperCase();
  if (UNIDADES_BASE.has(limpio)) {
    return limpio;
  }
  return predeterminado;
};

const normalizarModoInventarioCostos = (valor, predeterminado = 'PREPARACION') => {
  const limpio = String(valor || '').trim().toUpperCase();
  if (MODOS_INVENTARIO_COSTOS.has(limpio)) {
    return limpio;
  }
  return predeterminado;
};

const normalizarMetodoValoracionInventario = (valor, predeterminado = INVENTARIO_VALORACION_DEFAULT) => {
  const limpio = String(valor || '').trim().toUpperCase();
  if (INVENTARIO_VALORACION_METODOS.has(limpio)) {
    return limpio;
  }
  return predeterminado;
};

const obtenerMetodoValoracionEmpresa = async (empresaId) => {
  if (!empresaId) return INVENTARIO_VALORACION_DEFAULT;
  try {
    const row = await db.get(
      'SELECT inventario_valoracion_metodo FROM empresas WHERE id = ? LIMIT 1',
      [empresaId]
    );
    return normalizarMetodoValoracionInventario(row?.inventario_valoracion_metodo, INVENTARIO_VALORACION_DEFAULT);
  } catch (error) {
    console.warn('No se pudo obtener metodo de valoracion de inventario:', error?.message || error);
    return INVENTARIO_VALORACION_DEFAULT;
  }
};

const guardarMetodoValoracionEmpresa = async (empresaId, metodo) => {
  if (!empresaId) return;
  const normalizado = normalizarMetodoValoracionInventario(metodo, INVENTARIO_VALORACION_DEFAULT);
  await db.run('UPDATE empresas SET inventario_valoracion_metodo = ? WHERE id = ?', [normalizado, empresaId]);
  return normalizado;
};

const registrarCapaInventarioEmpresa = async ({ empresaId, productoId, cantidad, costoUnitario, fecha }) => {
  if (!empresaId || !productoId || !cantidad || cantidad <= 0) return;
  await db.run(
    `INSERT INTO empresa_inventario_capas (empresa_id, producto_id, cantidad_restante, costo_unitario, fecha)
     VALUES (?, ?, ?, ?, ?)`,
    [empresaId, productoId, cantidad, costoUnitario, fecha || new Date()]
  );
};

const consumirCapasInventarioEmpresa = async ({ empresaId, productoId, cantidad }) => {
  const resultado = { cantidadConsumida: 0, costoTotal: 0 };
  if (!empresaId || !productoId || !cantidad || cantidad <= 0) return resultado;
  const capas = await db.all(
    `SELECT id, cantidad_restante, costo_unitario
       FROM empresa_inventario_capas
      WHERE empresa_id = ? AND producto_id = ? AND cantidad_restante > 0
      ORDER BY fecha ASC, id ASC`,
    [empresaId, productoId]
  );
  let restante = cantidad;
  for (const capa of capas || []) {
    if (restante <= 0) break;
    const disponible = Number(capa.cantidad_restante) || 0;
    if (disponible <= 0) continue;
    const tomar = Math.min(disponible, restante);
    restante -= tomar;
    resultado.cantidadConsumida += tomar;
    resultado.costoTotal += tomar * (Number(capa.costo_unitario) || 0);
    const nuevaCantidad = Number((disponible - tomar).toFixed(4));
    if (nuevaCantidad <= 0) {
      await db.run('DELETE FROM empresa_inventario_capas WHERE id = ?', [capa.id]);
    } else {
      await db.run('UPDATE empresa_inventario_capas SET cantidad_restante = ? WHERE id = ?', [
        nuevaCantidad,
        capa.id,
      ]);
    }
  }
  return resultado;
};

const normalizarContenidoPorUnidad = (valor, predeterminado = 1) => {
  const numero = normalizarNumero(valor, predeterminado);
  if (!Number.isFinite(numero) || numero <= 0) {
    return predeterminado;
  }
  return Number(numero);
};

const TIPOS_GASTO = ['OPERATIVO', 'INVENTARIO', 'RETIRO_CAJA', 'ACTIVO_FIJO'];
const ORIGENES_GASTO = ['manual', 'compra', 'nomina', 'caja'];
const ESTADOS_GASTO = ['BORRADOR', 'PENDIENTE', 'APROBADO', 'PAGADO', 'ANULADO'];
const ORIGENES_FONDOS_COMPRA = ['negocio', 'caja', 'aporte_externo'];
const ESTADOS_CLIENTE = ['ACTIVO', 'INACTIVO', 'MORA', 'BLOQUEADO'];
const SEGMENTOS_CLIENTE = ['CONSUMIDOR', 'FRECUENTE', 'EMPRESA', 'MAYORISTA'];
const TIPOS_CLIENTE = ['PERSONA', 'EMPRESA'];

const normalizarTipoGasto = (valor, predeterminado = 'OPERATIVO') => {
  if (!valor) {
    return predeterminado;
  }
  const limpio = String(valor).trim().toUpperCase();
  if (TIPOS_GASTO.includes(limpio)) {
    return limpio;
  }
  return predeterminado;
};

const normalizarOrigenGasto = (valor, predeterminado = 'manual') => {
  if (!valor) {
    return predeterminado;
  }
  const limpio = String(valor).trim().toLowerCase();
  if (ORIGENES_GASTO.includes(limpio)) {
    return limpio;
  }
  return predeterminado;
};

const normalizarEstadoGasto = (valor, predeterminado = 'PENDIENTE') => {
  if (!valor) {
    return ESTADOS_GASTO.includes(predeterminado) ? predeterminado : 'PENDIENTE';
  }
  const limpio = String(valor).trim().toUpperCase();
  if (ESTADOS_GASTO.includes(limpio)) {
    return limpio;
  }
  if (['DRAFT', 'BORRADOR'].includes(limpio)) return 'BORRADOR';
  if (['PENDIENTE_APROBACION', 'PENDIENTE APROBACION'].includes(limpio)) return 'PENDIENTE';
  if (['APROBADO', 'APROBADA'].includes(limpio)) return 'APROBADO';
  if (['PAGADO', 'PAGADA'].includes(limpio)) return 'PAGADO';
  if (['ANULADO', 'CANCELADO'].includes(limpio)) return 'ANULADO';
  return ESTADOS_GASTO.includes(predeterminado) ? predeterminado : 'PENDIENTE';
};

const normalizarOrigenFondosGasto = (valor, predeterminado = null) => {
  if (!valor) {
    return predeterminado;
  }
  const limpio = String(valor).trim().toLowerCase();
  if (['caja', 'efectivo', 'cash'].includes(limpio)) return 'caja';
  if (['banco', 'transferencia', 'tarjeta', 'pos', 'debito', 'credito'].includes(limpio)) return 'banco';
  if (['externo', 'aporte', 'aporte_externo', 'aporte externo'].includes(limpio)) return 'externo';
  return limpio.slice(0, 20);
};

const normalizarOrigenFondosCompra = (valor, predeterminado = 'negocio') => {
  if (!valor) {
    return ORIGENES_FONDOS_COMPRA.includes(predeterminado) ? predeterminado : 'negocio';
  }
  const limpio = String(valor).trim().toLowerCase();
  if (limpio === 'caja') return 'caja';
  if (limpio === 'negocio') return 'negocio';
  if (['aporte_externo', 'aporte externo', 'aporte-externo', 'aporte', 'externo'].includes(limpio)) {
    return 'aporte_externo';
  }
  return ORIGENES_FONDOS_COMPRA.includes(predeterminado) ? predeterminado : 'negocio';
};

const normalizarEstadoCliente = (valor, predeterminado = 'ACTIVO') => {
  if (!valor) {
    return ESTADOS_CLIENTE.includes(predeterminado) ? predeterminado : 'ACTIVO';
  }
  const limpio = String(valor).trim().toUpperCase();
  if (ESTADOS_CLIENTE.includes(limpio)) {
    return limpio;
  }
  if (['SUSPENDIDO', 'INACTIVO', 'BLOQUEADO'].includes(limpio)) return limpio === 'INACTIVO' ? 'INACTIVO' : 'BLOQUEADO';
  if (['MORA', 'VENCIDO'].includes(limpio)) return 'MORA';
  return ESTADOS_CLIENTE.includes(predeterminado) ? predeterminado : 'ACTIVO';
};

const normalizarSegmentoCliente = (valor, predeterminado = 'CONSUMIDOR') => {
  if (!valor) {
    return SEGMENTOS_CLIENTE.includes(predeterminado) ? predeterminado : 'CONSUMIDOR';
  }
  const limpio = String(valor).trim().toUpperCase();
  if (SEGMENTOS_CLIENTE.includes(limpio)) {
    return limpio;
  }
  if (['CONSUMIDOR FINAL', 'FINAL'].includes(limpio)) return 'CONSUMIDOR';
  if (['FRECUENTE', 'VIP'].includes(limpio)) return 'FRECUENTE';
  if (['B2B', 'EMPRESA'].includes(limpio)) return 'EMPRESA';
  if (['MAYORISTA', 'WHOLESALE'].includes(limpio)) return 'MAYORISTA';
  return SEGMENTOS_CLIENTE.includes(predeterminado) ? predeterminado : 'CONSUMIDOR';
};

const normalizarTipoCliente = (valor, predeterminado = 'PERSONA') => {
  if (!valor) {
    return TIPOS_CLIENTE.includes(predeterminado) ? predeterminado : 'PERSONA';
  }
  const limpio = String(valor).trim().toUpperCase();
  if (TIPOS_CLIENTE.includes(limpio)) {
    return limpio;
  }
  if (['EMPRESA', 'B2B'].includes(limpio)) return 'EMPRESA';
  if (['PERSONA', 'INDIVIDUAL'].includes(limpio)) return 'PERSONA';
  return TIPOS_CLIENTE.includes(predeterminado) ? predeterminado : 'PERSONA';
};

const obtenerConfiguracionSecuenciasNegocio = async (negocioId) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  try {
    const row = await db.get(
      'SELECT permitir_b01, permitir_b02, permitir_b14 FROM negocios WHERE id = ? LIMIT 1',
      [negocio]
    );
    return {
      permitir_b01: normalizarFlag(row?.permitir_b01 ?? row?.permitirB01, 1),
      permitir_b02: normalizarFlag(row?.permitir_b02 ?? row?.permitirB02, 1),
      permitir_b14: normalizarFlag(row?.permitir_b14 ?? row?.permitirB14, 1),
    };
  } catch (error) {
    console.warn('No se pudo obtener configuracion de secuencias fiscales:', error?.message || error);
    return { permitir_b01: 1, permitir_b02: 1, permitir_b14: 1 };
  }
};

const esStockIndefinido = (producto) => Number(producto?.stock_indefinido) === 1;

const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aceptada', 'rechazada', 'facturada', 'vencida'];

const normalizarEstadoCotizacion = (valor, original = 'borrador') => {
  if (typeof valor !== 'string') {
    return ESTADOS_COTIZACION.includes(original) ? original : 'borrador';
  }
  const limpio = valor.trim().toLowerCase();
  if (ESTADOS_COTIZACION.includes(limpio)) {
    return limpio;
  }
  return ESTADOS_COTIZACION.includes(original) ? original : 'borrador';
};

const normalizarEstadoDelivery = (valor, fallback = null) => {
  if (typeof valor !== 'string') {
    return fallback;
  }
  const limpio = valor.trim().toLowerCase();
  if (ESTADOS_DELIVERY.includes(limpio)) {
    return limpio;
  }
  return fallback;
};

const limpiarTextoGeneral = (valor) => {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'string') {
    const trimmed = valor.trim();
    return trimmed || null;
  }
  return String(valor);
};

const esCotizacionVencida = (cotizacion) => {
  if (!cotizacion?.fecha_validez) return false;
  const fecha = new Date(cotizacion.fecha_validez);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.getTime() < Date.now();
};

const marcarVencidaSiAplica = (cotizacion, done) => {
  if (!cotizacion || !cotizacion.id) {
    if (typeof done === 'function') done();
    return;
  }

  if (!esCotizacionVencida(cotizacion)) {
    if (typeof done === 'function') done();
    return;
  }

  if (!['borrador', 'enviada'].includes(cotizacion.estado)) {
    cotizacion.estado = cotizacion.estado || 'vencida';
    if (typeof done === 'function') done();
    return;
  }

  const negocioDestino = cotizacion.negocio_id || cotizacion.negocioId || null;
  let sql = "UPDATE cotizaciones SET estado = 'vencida' WHERE id = ? AND estado IN ('borrador', 'enviada')";
  const params = [cotizacion.id];
  if (negocioDestino) {
    sql += ' AND negocio_id = ?';
    params.push(negocioDestino);
  }

  db.run(sql, params, () => {
    cotizacion.estado = 'vencida';
    if (typeof done === 'function') done();
  });
};

const calcularTotalesCotizacion = (
  itemsEntrada,
  impuestoPorcentaje,
  descuentoPorcentajeGlobal = 0,
  descuentoMontoGlobal = 0
) => {
  const impuestoTasa = Math.max(normalizarNumero(impuestoPorcentaje, 0), 0) / 100;
  const porcentajeGlobal = Math.max(normalizarNumero(descuentoPorcentajeGlobal, 0), 0);
  const montoGlobal = Math.max(normalizarNumero(descuentoMontoGlobal, 0), 0);

  if (!Array.isArray(itemsEntrada) || !itemsEntrada.length) {
    return { error: 'Debe agregar al menos un item en la cotizaci\u00f3n' };
  }

  let subtotalBase = 0;
  const itemsLimpios = [];

  itemsEntrada.forEach((item) => {
    const cantidad = normalizarNumero(item?.cantidad, 0);
    const precio = normalizarNumero(item?.precio_unitario, 0);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return;
    }

    const descLineaPct = Math.max(normalizarNumero(item?.descuento_porcentaje, 0), 0);
    const descLineaMonto = Math.max(normalizarNumero(item?.descuento_monto, 0), 0);
    const bruto = Math.max(precio * cantidad, 0);
    const descuentoLinea = Math.min(bruto * (descLineaPct / 100) + descLineaMonto, bruto);
    const baseLinea = Math.max(bruto - descuentoLinea, 0);

    subtotalBase += baseLinea;
    itemsLimpios.push({
      producto_id: item?.producto_id ? Number(item.producto_id) : null,
      descripcion: limpiarTextoGeneral(item?.descripcion),
      cantidad,
      precio_unitario: precio,
      descuento_porcentaje: descLineaPct,
      descuento_monto: descLineaMonto,
      base_linea: baseLinea,
    });
  });

  if (!itemsLimpios.length) {
    return { error: 'Debe agregar al menos un item con cantidad mayor a 0' };
  }

  const descuentoGlobalCalculado = Math.min(
    subtotalBase * (porcentajeGlobal / 100) + montoGlobal,
    subtotalBase
  );
  const subtotalNeto = Math.max(subtotalBase - descuentoGlobalCalculado, 0);
  const impuesto = Number((subtotalNeto * impuestoTasa).toFixed(2));
  const total = Number((subtotalNeto + impuesto).toFixed(2));

  if (total < 0) {
    return { error: 'El total de la cotizaci\u00f3n no puede ser negativo' };
  }

  const itemsCalculados = itemsLimpios.map((item) => {
    const proporcion = subtotalBase > 0 ? item.base_linea / subtotalBase : 0;
    const descuentoAsignado = descuentoGlobalCalculado * proporcion;
    const subtotalLinea = Math.max(item.base_linea - descuentoAsignado, 0);
    const impuestoLinea = Number((subtotalLinea * impuestoTasa).toFixed(2));
    return {
      ...item,
      subtotal_linea: Number(subtotalLinea.toFixed(2)),
      impuesto_linea: impuestoLinea,
      total_linea: Number((subtotalLinea + impuestoLinea).toFixed(2)),
    };
  });

  return {
    subtotal_base: Number(subtotalBase.toFixed(2)),
    subtotal: Number(subtotalNeto.toFixed(2)),
    descuento_global: Number(descuentoGlobalCalculado.toFixed(2)),
    descuento_porcentaje: porcentajeGlobal,
    impuesto,
    total,
    items: itemsCalculados,
  };
};

const generarCodigoCotizacion = (negocioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = NEGOCIO_ID_DEFAULT;
  }
  const year = new Date().getFullYear();
  const prefijo = `COT-${year}-`;

  db.get(
    'SELECT codigo FROM cotizaciones WHERE codigo LIKE ? AND negocio_id = ? ORDER BY codigo DESC LIMIT 1',
    [`${prefijo}%`, negocioId || NEGOCIO_ID_DEFAULT],
    (err, row) => {
      if (err) {
        return callback(err);
      }

      const ultimo = row?.codigo || '';
      const match = ultimo.match(/COT-\d{4}-(\d+)/);
      const correlativo = match ? Number(match[1]) + 1 : 1;
      const codigo = `${prefijo}${padNumber(correlativo, 4)}`;

      callback(null, codigo);
    }
  );
};

const obtenerDetallePedidosPorIds = async (pedidoIds, negocioId, opciones = {}) => {
  if (!Array.isArray(pedidoIds) || !pedidoIds.length) {
    return new Map();
  }

  const placeholders = pedidoIds.map(() => '?').join(', ');
  const areaFiltro = opciones.area_preparacion || opciones.area || null;
  const rows = await db.all(
    `
      SELECT dp.id AS detalle_id,
             dp.pedido_id,
             dp.producto_id,
             dp.cantidad,
             dp.precio_unitario,
             COALESCE(dp.descuento_porcentaje, 0) AS descuento_porcentaje,
             COALESCE(dp.descuento_monto, 0) AS descuento_monto,
             COALESCE(dp.cantidad_descuento, 0) AS cantidad_descuento,
             p.nombre,
             COALESCE(c.area_preparacion, 'ninguna') AS area_preparacion
      FROM detalle_pedido dp
      LEFT JOIN productos p ON p.id = dp.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE dp.pedido_id IN (${placeholders}) AND dp.negocio_id = ?
      ORDER BY dp.id ASC
    `,
    [...pedidoIds, negocioId]
  );

  const itemsMap = new Map();
  (rows || []).forEach((row) => {
    const lista = itemsMap.get(row.pedido_id) || [];
    const areaPreparacion = normalizarAreaPreparacion(row.area_preparacion || row.areaPreparacion || 'ninguna');
    if (areaFiltro && areaPreparacion !== areaFiltro) {
      itemsMap.set(row.pedido_id, lista);
      return;
    }
    const cantidad = Number(row.cantidad) || 0;
    const precio = Number(row.precio_unitario) || 0;
    const subtotalBruto = cantidad * precio;
    const descuentoMonto = Number(row.descuento_monto) || 0;
    lista.push({
      detalle_id: Number(row.detalle_id) || null,
      pedido_id: Number(row.pedido_id) || null,
      producto_id: row.producto_id,
      cantidad,
      precio_unitario: precio,
      nombre: row.nombre || null,
      descuento_porcentaje: Number(row.descuento_porcentaje) || 0,
      descuento_monto: descuentoMonto,
      cantidad_descuento: Number(row.cantidad_descuento) || null,
      area: areaPreparacion,
      area_preparacion: areaPreparacion,
      subtotal_sin_descuento: subtotalBruto,
      total_linea: Math.max(subtotalBruto - descuentoMonto, 0),
    });
    itemsMap.set(row.pedido_id, lista);
  });

  return itemsMap;
};

const obtenerHistorialAreasPorPedidos = async (pedidoIds = [], negocioId) => {
  const vacio = { cocina: new Set(), bar: new Set() };
  if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
    return vacio;
  }

  const placeholders = pedidoIds.map(() => '?').join(', ');
  const params = [...pedidoIds, negocioId];
  const [historialCocina, historialBar] = await Promise.all([
    db.all(
      `SELECT DISTINCT pedido_id FROM historial_cocina WHERE pedido_id IN (${placeholders}) AND negocio_id = ?`,
      params
    ),
    db.all(
      `SELECT DISTINCT pedido_id FROM historial_bar WHERE pedido_id IN (${placeholders}) AND negocio_id = ?`,
      params
    ),
  ]);

  return {
    cocina: new Set((historialCocina || []).map((row) => Number(row.pedido_id ?? row.pedidoId))),
    bar: new Set((historialBar || []).map((row) => Number(row.pedido_id ?? row.pedidoId))),
  };
};

const calcularEstadoAreaPedido = (pedido, items = [], area, historialesPorArea = {}) => {
  const areaNormalizada = normalizarAreaPreparacion(area);
  const itemsArea = (items || []).filter(
    (item) => normalizarAreaPreparacion(item.area_preparacion || item.area || 'ninguna') === areaNormalizada
  );

  if (!itemsArea.length) {
    return null;
  }

  if (pedido.estado === 'cancelado') {
    return 'cancelado';
  }

  if (pedido.estado === 'listo') {
    return 'listo';
  }

  const historialSet = areaNormalizada === 'bar' ? historialesPorArea.bar : historialesPorArea.cocina;
  const yaListo = historialSet instanceof Set && historialSet.has(Number(pedido.id));
  if (yaListo) {
    return 'listo';
  }

  if (pedido.estado === 'pagado') {
    return 'listo';
  }

  const responsableId =
    areaNormalizada === 'bar'
      ? pedido.bartender_id ?? pedido.bartenderId
      : pedido.cocinero_id ?? pedido.cocineroId;

  if (responsableId) {
    return 'preparando';
  }

  return 'pendiente';
};

const calcularEstadosAreasPedido = (pedido, items = [], historialesPorArea = {}) => ({
  estadoCocina: calcularEstadoAreaPedido(pedido, items, 'cocina', historialesPorArea),
  estadoBar: calcularEstadoAreaPedido(pedido, items, 'bar', historialesPorArea),
});

const calcularEstadoAreaCuenta = (pedidos = [], area = 'cocina') => {
  const estados = new Set();
  (pedidos || []).forEach((pedido) => {
    const estadoArea = area === 'bar' ? pedido.estadoBar : pedido.estadoCocina;
    if (estadoArea === null || estadoArea === undefined) {
      estados.add('sin_productos');
    } else {
      estados.add(estadoArea);
    }
  });

  if (estados.size === 0) {
    return 'sin_productos';
  }

  if (estados.has('preparando') || (estados.has('pendiente') && estados.has('listo'))) {
    return 'preparando';
  }

  if (estados.size === 1) {
    const unico = Array.from(estados)[0];
    return unico;
  }

  if (estados.has('pendiente')) {
    return 'preparando';
  }

  return 'preparando';
};

function calcularEstadoCuentaMesera(estadoCocina, estadoBar, tienePagosPendientes) {
  if (!tienePagosPendientes) {
    return 'pagado';
  }

  const areasListasOSinProd =
    (estadoCocina === 'listo' || estadoCocina === 'sin_productos') &&
    (estadoBar === 'listo' || estadoBar === 'sin_productos');

  const areasPendientes =
    (estadoCocina === 'pendiente' || estadoCocina === 'sin_productos') &&
    (estadoBar === 'pendiente' || estadoBar === 'sin_productos');

  if (areasListasOSinProd) {
    return 'listo';
  }

  if (areasPendientes) {
    return 'pendiente';
  }

  return 'preparando';
}

const combinarEstadoCuenta = (pedido) => {
  if (pedido.estado === 'pagado' || pedido.estado === 'cancelado') {
    return pedido.estado;
  }

  const estados = new Set([pedido.estadoCocina, pedido.estadoBar].filter(Boolean));
  if (estados.size === 0) {
    return pedido.estado;
  }

  if (estados.has('preparando') || (estados.has('pendiente') && estados.has('listo'))) {
    return 'preparando';
  }

  if (estados.size === 1 && estados.has('pendiente')) {
    return 'pendiente';
  }

  if (estados.size === 1 && estados.has('listo')) {
    return 'listo';
  }

  return 'preparando';
};

const agruparPedidosEnCuentas = (pedidos = [], itemsMap = new Map()) => {
  const cuentasMap = new Map();

  pedidos.forEach((pedido) => {
    const clave = String(pedido.cuenta_id ?? pedido.id);
    if (!cuentasMap.has(clave)) {
      cuentasMap.set(clave, {
        id: pedido.cuenta_id || pedido.id,
        cuenta_id: pedido.cuenta_id || pedido.id,
        mesa: pedido.mesa,
        cliente: pedido.cliente,
        modo_servicio: pedido.modo_servicio,
        estado: pedido.estado,
        estado_cuenta: pedido.estado,
        estadoCocina: null,
        estadoBar: null,
        estadoCuentaMesera: null,
        pedidos: [],
      });
    }

    const cuenta = cuentasMap.get(clave);
    const detalle = itemsMap.get(pedido.id) || [];
    const estadoCuenta = combinarEstadoCuenta(pedido);
    cuenta.pedidos.push({
      ...pedido,
      items: detalle,
    });
    cuenta.estado = estadoCuenta;
    cuenta.estado_cuenta = estadoCuenta;
  });

  const cuentas = Array.from(cuentasMap.values());
  cuentas.forEach((cuenta) => {
    const pedidosCuenta = cuenta.pedidos || [];
    const estadoCocinaCuenta = calcularEstadoAreaCuenta(pedidosCuenta, 'cocina');
    const estadoBarCuenta = calcularEstadoAreaCuenta(pedidosCuenta, 'bar');
    cuenta.estadoCocina = estadoCocinaCuenta;
    cuenta.estadoBar = estadoBarCuenta;

    const tienePagosPendientes = pedidosCuenta.some(
      (p) => p.estado !== 'pagado' && p.estado !== 'cancelado'
    );
    cuenta.estadoCuentaMesera = calcularEstadoCuentaMesera(
      estadoCocinaCuenta,
      estadoBarCuenta,
      tienePagosPendientes
    );

    const cocinaListo = estadoCocinaCuenta === 'listo' || estadoCocinaCuenta === 'sin_productos';
    const barListo = estadoBarCuenta === 'listo' || estadoBarCuenta === 'sin_productos';
    cuenta.cocinaListo = cocinaListo;
    cuenta.barListo = barListo;
    cuenta.puedeCobrar = cocinaListo && barListo;
  });

  return cuentas;
};

const agruparItemsCuenta = (itemsMap = new Map()) => {
  const agrupados = new Map();

  (itemsMap || new Map()).forEach((items) => {
    (items || []).forEach((item) => {
      const cantidad = Number(item.cantidad) || 0;
      if (!cantidad) return;
      const precio = Number(item.precio_unitario) || 0;
      const porcentaje = Number(item.descuento_porcentaje) || 0;
      const monto = Number(item.descuento_monto) || 0;
      const descuentoPorUnidad = cantidad ? monto / cantidad : 0;
      const key = `${item.producto_id || ''}|${precio}|${porcentaje}|${descuentoPorUnidad.toFixed(8)}`;

      if (!agrupados.has(key)) {
        agrupados.set(key, {
          producto_id: item.producto_id,
          nombre: item.nombre || null,
          precio_unitario: precio,
          cantidad: 0,
          subtotal_sin_descuento: 0,
          descuento_porcentaje: porcentaje,
          descuento_monto: 0,
          total_linea: 0,
          detalles: [],
        });
      }

      const linea = agrupados.get(key);
      const subtotalBruto = cantidad * precio;
      linea.cantidad += cantidad;
      linea.subtotal_sin_descuento += subtotalBruto;
      linea.descuento_monto += monto;
      linea.total_linea += Math.max(subtotalBruto - monto, 0);
      linea.detalles.push({
        detalle_id: item.detalle_id,
        pedido_id: item.pedido_id,
        cantidad,
        precio_unitario: precio,
        descuento_porcentaje: porcentaje,
        descuento_monto: monto,
        cantidad_descuento: item.cantidad_descuento,
      });
    });
  });

  return Array.from(agrupados.values()).map((item) => ({
    ...item,
    cantidad: Number(item.cantidad) || 0,
    subtotal_sin_descuento: Number(item.subtotal_sin_descuento.toFixed(2)),
    descuento_monto: Number(item.descuento_monto.toFixed(2)),
    total_linea: Number(item.total_linea.toFixed(2)),
  }));
};

const normalizarTasaImpuestoPedido = (subtotal, impuesto, fallback = 0) => {
  const base = Number(subtotal) || 0;
  const impuestoValor = Number(impuesto) || 0;
  if (base > 0) {
    const tasa = impuestoValor / base;
    if (Number.isFinite(tasa) && tasa >= 0) {
      return tasa;
    }
  }
  return fallback;
};

const recalcularTotalesPedido = async (pedidoId, negocioId, tasaImpuesto = null) => {
  const detalles = await db.all(
    `SELECT cantidad, precio_unitario, COALESCE(descuento_monto, 0) AS descuento_monto
       FROM detalle_pedido
      WHERE pedido_id = ? AND negocio_id = ?`,
    [pedidoId, negocioId]
  );

  if (!detalles || detalles.length === 0) {
    return { subtotal: 0, impuesto: 0, total: 0, cantidadDetalles: 0 };
  }

  let subtotal = 0;
  (detalles || []).forEach((det) => {
    const cantidad = Number(det.cantidad) || 0;
    const precio = Number(det.precio_unitario) || 0;
    const descuento = Number(det.descuento_monto) || 0;
    const linea = Math.max(cantidad * precio - descuento, 0);
    subtotal += linea;
  });

  subtotal = Number(subtotal.toFixed(2));

  let tasa = tasaImpuesto;
  if (tasa === null || tasa === undefined) {
    const pedidoBase = await db.get(
      'SELECT subtotal, impuesto FROM pedidos WHERE id = ? AND negocio_id = ?',
      [pedidoId, negocioId]
    );
    tasa = normalizarTasaImpuestoPedido(pedidoBase?.subtotal, pedidoBase?.impuesto, 0);
  }

  const impuesto = Number((subtotal * (Number(tasa) || 0)).toFixed(2));
  const total = Number((subtotal + impuesto).toFixed(2));

  await db.run('UPDATE pedidos SET subtotal = ?, impuesto = ?, total = ? WHERE id = ? AND negocio_id = ?', [
    subtotal,
    impuesto,
    total,
    pedidoId,
    negocioId,
  ]);

  return { subtotal, impuesto, total, cantidadDetalles: detalles.length };
};

const obtenerCuentasPorEstados = async (estados, negocioId, opciones = {}) => {
  if (!Array.isArray(estados) || !estados.length) {
    return [];
  }

  const areaFiltro = opciones.area_preparacion || opciones.area || null;
  const filtrarPorEstadoArea = Boolean(areaFiltro) && opciones.filtrarPorEstadoArea !== false;
  const incluirSiAreaLista = opciones.incluirSiAreaLista === true;
  const incluyeListos = estados.includes('listo');
  const estadosBusqueda = filtrarPorEstadoArea || (incluyeListos && incluirSiAreaLista) ? estadosValidos : estados;
  const placeholders = estadosBusqueda.map(() => '?').join(', ');
  const soloHoy = opciones.hoy === true || opciones.soloHoy === true;
  const origenSolicitado = opciones?.origen_caja ?? opciones?.origen;
  const usarFiltroOrigen =
    origenSolicitado !== undefined &&
    origenSolicitado !== null &&
    String(origenSolicitado).trim() !== '';
  const filtros = [`estado IN (${placeholders})`, 'negocio_id = ?'];
  const params = [...estadosBusqueda, negocioId];
  if (soloHoy) {
    filtros.push('DATE(COALESCE(fecha_listo, fecha_creacion)) = CURDATE()');
  }
  if (usarFiltroOrigen) {
    filtros.push(construirFiltroOrigenCaja(origenSolicitado, params, 'origen_caja'));
  }
  const pedidos = await db.all(
    `
      SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
             impuesto, total, fecha_creacion, fecha_listo, fecha_cierre,
             cocinero_id, cocinero_nombre, bartender_id, bartender_nombre, negocio_id
      FROM pedidos
      WHERE ${filtros.join(' AND ')}
      ORDER BY fecha_creacion ASC
    `,
    params
  );

  if (!pedidos.length) {
    return [];
  }

  const pedidoIds = pedidos.map((pedido) => pedido.id);
  const detalle = await obtenerDetallePedidosPorIds(pedidoIds, negocioId, opciones);
  const historiales = await obtenerHistorialAreasPorPedidos(pedidoIds, negocioId);

  const pedidosConEstados = pedidos.map((pedido) => {
    const items = detalle.get(pedido.id) || [];
    const { estadoCocina, estadoBar } = calcularEstadosAreasPedido(pedido, items, historiales);
    return { ...pedido, estadoCocina, estadoBar };
  });

  const estadosAreaFiltro = filtrarPorEstadoArea ? new Set(estados) : null;
  const pedidosFiltrados =
    areaFiltro && detalle
      ? pedidosConEstados.filter((pedido) => {
          const items = detalle.get(pedido.id) || [];
          if (!items.length) {
            return false;
          }
          if (estadosAreaFiltro) {
            const estadoArea = areaFiltro === 'bar' ? pedido.estadoBar : pedido.estadoCocina;
            return estadosAreaFiltro.has(estadoArea);
          }
          return true;
        })
      : pedidosConEstados.filter((pedido) => {
          const estadoPrincipal = estados.includes(pedido.estado);
          if (estadoPrincipal) {
            return true;
          }
          if (incluyeListos && incluirSiAreaLista) {
            return pedido.estadoCocina === 'listo' || pedido.estadoBar === 'listo';
          }
          return false;
        });

  return agruparPedidosEnCuentas(pedidosFiltrados, detalle);
};

const obtenerPedidoConDetalle = async (pedidoId, negocioId) => {
  const pedido = await db.get(
    `
        SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
               impuesto, total, fecha_creacion, fecha_listo, fecha_cierre,
               cocinero_id, cocinero_nombre, bartender_id, bartender_nombre, cliente_documento, ncf, tipo_comprobante, propina_monto,
               descuento_monto, delivery_estado, delivery_usuario_id, delivery_usuario_nombre, delivery_fecha_asignacion,
               delivery_fecha_entrega, delivery_telefono, delivery_direccion, delivery_referencia, delivery_notas
        FROM pedidos
      WHERE id = ? AND negocio_id = ?
    `,
    [pedidoId, negocioId]
  );

  if (!pedido) {
    return null;
  }

  const detalle = await obtenerDetallePedidosPorIds([pedidoId], negocioId);
  const historiales = await obtenerHistorialAreasPorPedidos([pedidoId], negocioId);
  const { estadoCocina, estadoBar } = calcularEstadosAreasPedido(
    pedido,
    detalle.get(pedidoId) || [],
    historiales
  );
  return {
    ...pedido,
    estadoCocina,
    estadoBar,
    items: detalle.get(pedidoId) || [],
  };
};

const ajustarStockPorPedido = async (pedidoId, negocioId, signo = 1) => {
  const detalles = await db.all(
    `SELECT dp.producto_id, dp.cantidad, COALESCE(p.stock_indefinido, 0) AS stock_indefinido
       FROM detalle_pedido dp
       LEFT JOIN productos p ON p.id = dp.producto_id AND p.negocio_id = ?
      WHERE dp.pedido_id = ? AND dp.negocio_id = ?`,
    [negocioId, pedidoId, negocioId]
  );
  for (const detalle of detalles || []) {
    const cantidad = Number(detalle.cantidad) || 0;
    if (!cantidad) continue;
    if (esStockIndefinido(detalle)) continue;
    await db.run('UPDATE productos SET stock = stock + ? WHERE id = ? AND negocio_id = ?', [
      cantidad * signo,
      detalle.producto_id,
      negocioId,
    ]);
  }
};

const obtenerRecetasPorProductos = async (productoIds, negocioId) => {
  if (!Array.isArray(productoIds) || productoIds.length === 0) {
    return new Map();
  }

  const placeholders = productoIds.map(() => '?').join(', ');
  const rows = await db.all(
    `
      SELECT r.producto_final_id,
             rd.insumo_id,
             rd.cantidad,
             rd.unidad,
             i.nombre AS insumo_nombre,
             COALESCE(i.stock, 0) AS stock,
             COALESCE(i.stock_indefinido, 0) AS stock_indefinido,
             COALESCE(i.contenido_por_unidad, 1) AS contenido_por_unidad,
             COALESCE(i.unidad_base, 'UND') AS unidad_base,
             COALESCE(i.tipo_producto, 'FINAL') AS tipo_producto
      FROM recetas r
      JOIN receta_detalle rd ON rd.receta_id = r.id
      JOIN productos i ON i.id = rd.insumo_id AND i.negocio_id = ?
      WHERE r.negocio_id = ?
        AND r.activo = 1
        AND r.producto_final_id IN (${placeholders})
    `,
    [negocioId, negocioId, ...productoIds]
  );

  const recetasMap = new Map();
  (rows || []).forEach((row) => {
    const productoId = Number(row.producto_final_id);
    if (!Number.isFinite(productoId)) return;
    const lista = recetasMap.get(productoId) || [];
    lista.push({
      insumo_id: Number(row.insumo_id),
      cantidad: Number(row.cantidad) || 0,
      unidad: normalizarUnidadBase(row.unidad, 'UND'),
      insumo_nombre: row.insumo_nombre,
      stock: Number(row.stock) || 0,
      stock_indefinido: Number(row.stock_indefinido) || 0,
      contenido_por_unidad: normalizarContenidoPorUnidad(row.contenido_por_unidad, 1),
      unidad_base: normalizarUnidadBase(row.unidad_base, 'UND'),
      tipo_producto: normalizarTipoProducto(row.tipo_producto, 'FINAL'),
    });
    recetasMap.set(productoId, lista);
  });

  return recetasMap;
};

const obtenerCostosRecetaPorProductos = async (productoIds, negocioId) => {
  if (!Array.isArray(productoIds) || productoIds.length === 0) {
    return new Map();
  }

  const placeholders = productoIds.map(() => '?').join(', ');
  const rows = await db.all(
    `
      SELECT r.producto_final_id,
             rd.cantidad,
             COALESCE(i.costo_unitario_real, 0) AS costo_unitario_real,
             COALESCE(i.costo_promedio_actual, 0) AS costo_promedio_actual,
             COALESCE(i.contenido_por_unidad, 1) AS contenido_por_unidad
      FROM recetas r
      JOIN receta_detalle rd ON rd.receta_id = r.id
      JOIN productos i ON i.id = rd.insumo_id AND i.negocio_id = ?
      WHERE r.negocio_id = ?
        AND r.activo = 1
        AND r.producto_final_id IN (${placeholders})
    `,
    [negocioId, negocioId, ...productoIds]
  );

  const costosMap = new Map();
  (rows || []).forEach((row) => {
    const productoId = Number(row.producto_final_id);
    if (!Number.isFinite(productoId)) return;
    const contenido = normalizarContenidoPorUnidad(row.contenido_por_unidad, 1);
    let costoBase = Number(row.costo_unitario_real) || 0;
    if (costoBase <= 0) {
      costoBase = Number(row.costo_promedio_actual) || 0;
    }
    const costoUnitario = contenido > 0 ? costoBase / contenido : costoBase;
    const costoInsumo = Number(row.cantidad) * costoUnitario;
    const acumulado = costosMap.get(productoId) || 0;
    costosMap.set(productoId, Number((acumulado + costoInsumo).toFixed(4)));
  });

  return costosMap;
};

const revertirConsumoInsumosPorPedido = async (pedidoId, negocioId) => {
  const consumos = await db.all(
    `
      SELECT insumo_id, cantidad_base
      FROM consumo_insumos
      WHERE pedido_id = ? AND negocio_id = ? AND COALESCE(revertido, 0) = 0
    `,
    [pedidoId, negocioId]
  );

  if (!consumos || consumos.length === 0) {
    return;
  }

  const insumoIds = Array.from(
    new Set(consumos.map((consumo) => Number(consumo.insumo_id)).filter((id) => Number.isFinite(id) && id > 0))
  );
  if (!insumoIds.length) {
    return;
  }

  const placeholders = insumoIds.map(() => '?').join(', ');
  const insumos = await db.all(
    `SELECT id, stock_indefinido, contenido_por_unidad FROM productos WHERE negocio_id = ? AND id IN (${placeholders})`,
    [negocioId, ...insumoIds]
  );
  const insumosMap = new Map((insumos || []).map((insumo) => [Number(insumo.id), insumo]));

  const totals = new Map();
  consumos.forEach((consumo) => {
    const insumoId = Number(consumo.insumo_id);
    if (!Number.isFinite(insumoId)) return;
    const insumo = insumosMap.get(insumoId);
    if (!insumo || esStockIndefinido(insumo)) return;
    const contenido = normalizarContenidoPorUnidad(insumo.contenido_por_unidad, 1);
    const cantidadBase = Number(consumo.cantidad_base) || 0;
    const cantidadUnidades = contenido > 0 ? cantidadBase / contenido : 0;
    const acumulado = totals.get(insumoId) || 0;
    totals.set(insumoId, Number((acumulado + cantidadUnidades).toFixed(4)));
  });

  for (const [insumoId, cantidad] of totals.entries()) {
    if (!cantidad) continue;
    await db.run('UPDATE productos SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND negocio_id = ?', [
      cantidad,
      insumoId,
      negocioId,
    ]);
  }

  await db.run(
    'UPDATE consumo_insumos SET revertido = 1 WHERE pedido_id = ? AND negocio_id = ? AND COALESCE(revertido, 0) = 0',
    [pedidoId, negocioId]
  );
};

const actualizarCogsPedidos = async (pedidoIds, negocioId) => {
  if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
    return new Map();
  }

  const modoInventario = await obtenerModoInventarioCostos(negocioId);
  const esReventa = modoInventario === 'REVENTA';
  const placeholders = pedidoIds.map(() => '?').join(', ');
  const rows = await db.all(
    `
      SELECT dp.id AS detalle_id,
             dp.pedido_id,
             dp.producto_id,
             dp.cantidad,
             COALESCE(p.costo_promedio_actual, 0) AS costo_promedio_actual,
             COALESCE(p.costo_unitario_real, 0) AS costo_unitario_real
      FROM detalle_pedido dp
      JOIN productos p ON p.id = dp.producto_id
      WHERE dp.pedido_id IN (${placeholders}) AND dp.negocio_id = ?
    `,
    [...pedidoIds, negocioId]
  );

  const productoIds = Array.from(
    new Set((rows || []).map((row) => Number(row.producto_id)).filter((id) => Number.isFinite(id) && id > 0))
  );
  const costosReceta = !esReventa
    ? await obtenerCostosRecetaPorProductos(productoIds, negocioId)
    : new Map();

  const cogsPorPedido = new Map();
  const detalles = rows || [];

  for (const row of detalles) {
    const productoId = Number(row.producto_id);
    const costoReceta = costosReceta.get(productoId);
    let costoUnitario = 0;
    if (costoReceta !== undefined) {
      costoUnitario = Number(costoReceta) || 0;
    } else if (esReventa) {
      costoUnitario = Number(row.costo_unitario_real) || 0;
    } else {
      costoUnitario = Number(row.costo_promedio_actual) || 0;
    }
    const cantidad = Number(row.cantidad) || 0;
    const cogsLinea = Number((cantidad * costoUnitario).toFixed(2));
    const pedidoId = Number(row.pedido_id);
    const acumulado = cogsPorPedido.get(pedidoId) || 0;
    cogsPorPedido.set(pedidoId, Number((acumulado + cogsLinea).toFixed(2)));

    await db.run(
      'UPDATE detalle_pedido SET costo_unitario_snapshot = ?, cogs_linea = ? WHERE id = ? AND negocio_id = ?',
      [Number(costoUnitario.toFixed(2)), cogsLinea, row.detalle_id, negocioId]
    );
  }

  for (const pedidoId of pedidoIds) {
    const cogsTotal = cogsPorPedido.get(Number(pedidoId)) || 0;
    await db.run('UPDATE pedidos SET cogs_total = ? WHERE id = ? AND negocio_id = ?', [
      Number(cogsTotal.toFixed(2)),
      pedidoId,
      negocioId,
    ]);
  }

  return cogsPorPedido;
};

const construirFacturaDesdePedido = async (pedidoId, negocioId) => {
  const pedido = await db.get(
    `
      SELECT *
      FROM pedidos
      WHERE id = ? AND negocio_id = ?
    `,
    [pedidoId, negocioId]
  );

  if (!pedido) {
    return null;
  }

  const cuentaId = pedido.cuenta_id || pedido.id;
  const pedidosRelacionados = await db.all(
    `
      SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
             impuesto, total, descuento_monto, propina_monto, tipo_comprobante, ncf,
             cliente_documento, fecha_creacion, fecha_cierre, fecha_factura
      FROM pedidos
      WHERE (cuenta_id = ? OR id = ?)
        AND negocio_id = ?
      ORDER BY fecha_creacion ASC
    `,
    [cuentaId, cuentaId, negocioId]
  );

  const idsRelacionados = pedidosRelacionados.length
    ? pedidosRelacionados.map((p) => p.id)
    : [pedido.id];

  const detalle = await obtenerDetallePedidosPorIds(idsRelacionados, negocioId);
  const itemsAgregados = agruparItemsCuenta(detalle);

  const subtotalTotal = pedidosRelacionados.reduce((acc, p) => acc + (Number(p.subtotal) || 0), 0);
  const impuestoTotal = pedidosRelacionados.reduce((acc, p) => acc + (Number(p.impuesto) || 0), 0);
  const descuentoTotal = pedidosRelacionados.reduce((acc, p) => acc + (Number(p.descuento_monto) || 0), 0);
  const propinaTotal = pedidosRelacionados.reduce((acc, p) => acc + (Number(p.propina_monto) || 0), 0);
  const totalFinal = pedidosRelacionados.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

  const pedidoReferencia =
    pedidosRelacionados.find((p) => Number(p.id) === Number(pedido.id)) ||
    pedidosRelacionados[0] ||
    pedido;

  return {
    pedido: {
      ...pedidoReferencia,
      cuenta_id: cuentaId,
      subtotal: subtotalTotal,
      impuesto: impuestoTotal,
      descuento_monto: descuentoTotal,
      propina_monto: propinaTotal,
      total: totalFinal,
      total_final: totalFinal,
    },
    items: itemsAgregados,
  };
};

// Cierra uno o varios pedidos aplicando descuentos, pagos y registro en caja.
// Devuelve via callback un objeto { factura, totales } o un error con status/message.
const cerrarCuentaYRegistrarPago = async (pedidosEntrada, opciones, callback) => {
  const pedidosActivos = Array.isArray(pedidosEntrada)
    ? pedidosEntrada.filter((p) => p && p.estado !== 'cancelado')
    : [];

  if (!pedidosActivos.length) {
    return callback({ status: 404, message: 'No hay pedidos cobrables en esta cuenta' });
  }

  const {
    descuento_porcentaje = 0,
    propina_porcentaje = 0,
    cliente: clienteNombre,
    cliente_nombre,
    cliente_documento,
    tipo_comprobante,
    comentarios,
    usuario_id,
    detalle_descuentos = [],
    pagos = {},
    generar_ncf = true,
    ncf: ncfManual,
  } = opciones || {};

  const negocioIdOperacion =
    opciones?.negocio_id ||
    (pedidosActivos.length ? pedidosActivos[0].negocio_id : null) ||
    NEGOCIO_ID_DEFAULT;
  const origenFallback = opciones?.usuario_rol === 'vendedor' ? 'mostrador' : 'caja';
  const origenCaja = normalizarOrigenCaja(opciones?.origen_caja ?? opciones?.origen, origenFallback);

  const descuentoValor = normalizarNumero(descuento_porcentaje, 0);
  const propinaValor = normalizarNumero(propina_porcentaje, 0);

  if (descuentoValor < 0 || propinaValor < 0) {
    return callback({
      status: 400,
      message: 'Los porcentajes de descuento y propina deben ser numeros mayores o iguales a 0',
    });
  }

  const clienteFinal = normalizarCampoTexto(
    clienteNombre !== undefined ? clienteNombre : cliente_nombre,
    null
  );
  const documentoFinal = normalizarCampoTexto(cliente_documento, null);
  const tipoFinal = normalizarCampoTexto(tipo_comprobante, 'B02') || 'B02';
  const comentariosFinal = normalizarCampoTexto(comentarios, null);
  const ncfManualNormalizado = normalizarCampoTexto(ncfManual, null);

  try {
    const permisosSecuencias = await obtenerConfiguracionSecuenciasNegocio(negocioIdOperacion);
    if (tipoFinal === 'B01' && Number(permisosSecuencias.permitir_b01) === 0) {
      return callback({ status: 400, message: 'B01 desactivado para este negocio' });
    }
    if (tipoFinal === 'B02' && Number(permisosSecuencias.permitir_b02) === 0) {
      return callback({ status: 400, message: 'B02 desactivado para este negocio' });
    }
    if (tipoFinal === 'B14' && Number(permisosSecuencias.permitir_b14) === 0) {
      return callback({ status: 400, message: 'B14 desactivado para este negocio' });
    }
  } catch (error) {
    console.error('Error al validar secuencias fiscales:', error?.message || error);
    return callback({ status: 500, message: 'No se pudo validar la secuencia fiscal' });
  }

  const descuentosPorDetalle = new Map();
  if (Array.isArray(detalle_descuentos)) {
    detalle_descuentos.forEach((d) => {
      if (!d) return;
      const detId = Number(d.detalle_id || d.id);
      if (!Number.isFinite(detId)) return;
      const porcentaje = normalizarNumero(d.descuento_porcentaje, 0);
      const monto = normalizarNumero(d.descuento_monto, 0);
      const cantidad_descuento = normalizarNumero(d.cantidad_descuento, null);
      descuentosPorDetalle.set(detId, { porcentaje, monto, cantidad_descuento });
    });
  }

  const actualizarPedidosConDescuentos = (done) => {
    const procesar = (idx) => {
      if (idx >= pedidosActivos.length) return done();
      const pedido = pedidosActivos[idx];

      db.all(
        `SELECT id, cantidad, precio_unitario, COALESCE(descuento_porcentaje, 0) AS descuento_porcentaje, COALESCE(descuento_monto, 0) AS descuento_monto
         FROM detalle_pedido
         WHERE pedido_id = ?
           AND negocio_id = ?`,
        [pedido.id, negocioIdOperacion],
        (detErr, detalles) => {
          if (detErr) {
            console.error('Error al obtener detalles del pedido:', detErr.message);
            return done(detErr);
          }

          let subtotalOriginal = 0;
          let descuentoLineaTotal = 0;

          (detalles || []).forEach((det) => {
            const subtotalLinea = Number(det.precio_unitario || 0) * Number(det.cantidad || 0);
            subtotalOriginal += subtotalLinea;
            const desc = descuentosPorDetalle.get(det.id);
            const pct = desc ? desc.porcentaje : det.descuento_porcentaje || 0;
            const montoExtra = desc ? desc.monto : det.descuento_monto || 0;
            const cantDesc = desc && Number.isFinite(desc.cantidad_descuento) ? desc.cantidad_descuento : det.cantidad;
            const cantidadAplicada = Math.min(Number(det.cantidad) || 0, Math.max(cantDesc || 0, 0));
            const baseCantidad = cantidadAplicada > 0 ? cantidadAplicada : Number(det.cantidad) || 0;
            const proporcional = baseCantidad > 0 ? baseCantidad / (Number(det.cantidad) || 1) : 1;
            const montoPct = subtotalLinea * (pct / 100) * proporcional;
            const descuentoLinea = Math.min(montoPct + montoExtra, subtotalLinea);
            descuentoLineaTotal += descuentoLinea;

            if (desc) {
              db.run(
                'UPDATE detalle_pedido SET descuento_porcentaje = ?, descuento_monto = ? WHERE id = ? AND negocio_id = ?',
                [pct, montoExtra, det.id, negocioIdOperacion],
                (updErr) => {
                  if (updErr) {
                    console.warn('No se pudo actualizar descuento del detalle:', updErr.message);
                  }
                }
              );
            }
          });

          const subtotalNuevo = Math.max(subtotalOriginal - descuentoLineaTotal, 0);
          const subtotalPedido = Number(pedido.subtotal) || subtotalOriginal || 0;
          const impuestoPedido = Number(pedido.impuesto) || 0;
          const factor = subtotalPedido > 0 ? subtotalNuevo / subtotalPedido : 1;
          const impuestoNuevo = impuestoPedido * factor;

          db.run(
            'UPDATE pedidos SET subtotal = ?, impuesto = ? WHERE id = ? AND negocio_id = ?',
            [subtotalNuevo, impuestoNuevo, pedido.id, negocioIdOperacion],
            (updErr) => {
              if (updErr) {
                console.error('Error al actualizar pedido con descuento:', updErr.message);
                return done(updErr);
              }
              pedido.subtotal = subtotalNuevo;
              pedido.impuesto = impuestoNuevo;
              procesar(idx + 1);
            }
          );
        }
      );
    };

    procesar(0);
  };

  actualizarPedidosConDescuentos((descErr) => {
    if (descErr) {
      return callback({
        status: 500,
        message: 'No se pudieron aplicar los descuentos por producto',
      });
    }

    const subtotalTotal = pedidosActivos.reduce((acc, p) => acc + (Number(p.subtotal) || 0), 0);
    const impuestoTotal = pedidosActivos.reduce((acc, p) => acc + (Number(p.impuesto) || 0), 0);
    const base = subtotalTotal + impuestoTotal;
    const descuentoMonto = Math.min(base * (descuentoValor / 100), base);
    const baseConDescuento = Math.max(base - descuentoMonto, 0);
    const propinaMonto = baseConDescuento * (propinaValor / 100);
    const totalAPagar = baseConDescuento + propinaMonto;

    const tarjeta = normalizarNumero(pagos.tarjeta, 0);
    const transferencia = normalizarNumero(pagos.transferencia, 0);
    const efectivoSolicitado =
      pagos.efectivo !== undefined ? normalizarNumero(pagos.efectivo, 0) : null;
    const efectivoEntregado =
      pagos.efectivo_entregado !== undefined
        ? normalizarNumero(pagos.efectivo_entregado, efectivoSolicitado || 0)
        : efectivoSolicitado !== null
        ? efectivoSolicitado
        : Math.max(totalAPagar - (tarjeta + transferencia), 0);

    if ([tarjeta, transferencia, efectivoEntregado].some((monto) => monto < 0)) {
      return callback({
        status: 400,
        message: 'Los montos de pago deben ser numeros mayores o iguales a 0',
      });
    }

    const totalNoEfectivo = tarjeta + transferencia;
    if (totalNoEfectivo > totalAPagar + 0.01) {
      return callback({
        status: 400,
        message: 'Los montos asignados a tarjeta o transferencia exceden el total a cobrar',
      });
    }

    const efectivoRequerido = Math.max(totalAPagar - totalNoEfectivo, 0);
    const efectivoAplicado = efectivoSolicitado !== null ? efectivoSolicitado : efectivoRequerido;

    if (efectivoAplicado + totalNoEfectivo < totalAPagar - 0.01) {
      return callback({
        status: 400,
        message: 'La suma de los metodos de pago no cubre el total a cobrar',
      });
    }

    if (efectivoEntregado < efectivoAplicado - 0.01) {
      return callback({
        status: 400,
        message: 'El efectivo recibido no es suficiente para cubrir el monto en efectivo',
      });
    }

    const cambio = Math.max(efectivoEntregado - efectivoRequerido, 0);
    const pagoEfectivoFinal = Math.max(efectivoAplicado, efectivoRequerido);

    const pedidoReferencia = pedidosActivos.reduce(
      (min, p) => (!min || Number(p.id) < Number(min.id) ? p : min),
      null
    );

    const distribuirSegunSubtotal = (monto) => {
      if (subtotalTotal <= 0) {
        const proporcion = 1 / pedidosActivos.length;
        return pedidosActivos.map(() => monto * proporcion);
      }
      return pedidosActivos.map((p) => monto * ((Number(p.subtotal) || 0) / subtotalTotal));
    };

    const descuentosDistribuidos = distribuirSegunSubtotal(descuentoMonto);
    const propinasDistribuidas = distribuirSegunSubtotal(propinaMonto);
    const pagoEfectivoDistribuido = distribuirSegunSubtotal(pagoEfectivoFinal);
    const pagoTarjetaDistribuido = distribuirSegunSubtotal(tarjeta);
    const pagoTransferenciaDistribuido = distribuirSegunSubtotal(transferencia);

  const reintentosNCF = 2;
  const puedeReintentarNCF = generar_ncf !== false && !ncfManualNormalizado;
  const ncfManualEnviado = Boolean(ncfManualNormalizado);

  const ejecutarCierre = (ncfAsignado, intentosRestantes = 0) => {
    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) {
        console.error('No se pudo iniciar transaccion de cierre:', beginErr.message);
        return callback({ status: 500, message: 'No se pudo cerrar la cuenta' });
      }

      const actualizarPedido = (indice) => {
        if (indice >= pedidosActivos.length) {
          const pedidoIds = pedidosActivos.map((pedido) => pedido.id);
          return actualizarCogsPedidos(pedidoIds, negocioIdOperacion)
            .then(() =>
              db.run('COMMIT', async (commitErr) => {
                if (commitErr) {
                  console.error('Error al confirmar cierre de cuenta:', commitErr.message);
                  return callback({ status: 500, message: 'No se pudo cerrar la cuenta' });
                }

                const factura = {
                  id: Number(pedidoReferencia.id),
                  cliente: clienteFinal || pedidoReferencia.cliente,
                  cliente_documento: documentoFinal || pedidoReferencia.cliente_documento,
                  tipo_comprobante: tipoFinal,
                  ncf: ncfAsignado || pedidoReferencia.ncf,
                  fecha: new Date().toISOString(),
                };

                const totales = {
                  subtotal: subtotalTotal,
                  impuesto: impuestoTotal,
                  descuento_porcentaje: descuentoValor,
                  descuento_monto: descuentoMonto,
                  propina_porcentaje: propinaValor,
                  propina_monto: propinaMonto,
                  total_cobrado: totalAPagar,
                };

                let clienteSincronizado = null;
                try {
                  const sync = await sincronizarClientePorDocumento({
                    negocioId: negocioIdOperacion,
                    documento: factura.cliente_documento,
                    nombre: factura.cliente,
                  });
                  if (sync?.ok) {
                    clienteSincronizado = sync.cliente || null;
                  }
                } catch (syncError) {
                  console.warn(
                    'No se pudo sincronizar cliente automaticamente al cerrar cuenta:',
                    syncError?.message || syncError
                  );
                }

                limpiarCacheAnalitica(negocioIdOperacion);
                return callback(null, { factura, totales, cliente: clienteSincronizado });
              })
            )
            .catch((cogsErr) => {
              console.error('Error al registrar COGS del pedido:', cogsErr?.message || cogsErr);
              return db.run('ROLLBACK', () =>
                callback({ status: 500, message: 'No se pudo registrar el costo de la venta' })
              );
            });
        }

        const p = pedidosActivos[indice];
        const esReferencia = p.id === pedidoReferencia.id;
        const estadoComprobante = ncfAsignado && esReferencia ? 'emitido' : 'sin_emitir';
        const sql = esReferencia
          ? `
          UPDATE pedidos
          SET estado = 'pagado',
              fecha_cierre = COALESCE(fecha_cierre, CURRENT_TIMESTAMP),
              fecha_factura = COALESCE(fecha_factura, CURRENT_TIMESTAMP),
              cliente = COALESCE(?, cliente),
              cliente_documento = ?,
              tipo_comprobante = ?,
              ncf = ?,
              estado_comprobante = ?,
              descuento_porcentaje = ?,
              descuento_monto = ?,
              propina_porcentaje = ?,
              propina_monto = ?,
              comentarios = COALESCE(?, comentarios),
              cobrado_por = COALESCE(cobrado_por, ?),
              origen_caja = ?,
              pago_efectivo = ?,
              pago_efectivo_entregado = ?,
              pago_tarjeta = ?,
              pago_transferencia = ?,
              pago_cambio = ?
          WHERE id = ?
            AND negocio_id = ?
        `
          : `
          UPDATE pedidos
          SET estado = 'pagado',
              fecha_cierre = COALESCE(fecha_cierre, CURRENT_TIMESTAMP),
              fecha_factura = COALESCE(fecha_factura, CURRENT_TIMESTAMP),
              cliente = COALESCE(?, cliente),
              cliente_documento = ?,
              tipo_comprobante = ?,
              ncf = COALESCE(ncf, ?),
              estado_comprobante = ?,
              descuento_porcentaje = ?,
              descuento_monto = ?,
              propina_porcentaje = ?,
              propina_monto = ?,
              comentarios = COALESCE(?, comentarios),
              cobrado_por = COALESCE(cobrado_por, ?),
              origen_caja = ?,
              pago_efectivo = ?,
              pago_efectivo_entregado = ?,
              pago_tarjeta = ?,
              pago_transferencia = ?,
              pago_cambio = ?
          WHERE id = ?
            AND negocio_id = ?
        `;

        const params = [
          clienteFinal !== null ? clienteFinal : p.cliente,
          documentoFinal,
          tipoFinal,
          esReferencia ? ncfAsignado || p.ncf || null : p.ncf || null,
          estadoComprobante,
          descuentoValor,
          descuentosDistribuidos[indice] || 0,
          propinaValor,
          propinasDistribuidas[indice] || 0,
          comentariosFinal,
          usuario_id || null,
          origenCaja,
          pagoEfectivoDistribuido[indice] || 0,
          efectivoEntregado,
          pagoTarjetaDistribuido[indice] || 0,
          pagoTransferenciaDistribuido[indice] || 0,
          cambio,
          p.id,
          negocioIdOperacion,
        ];

        db.run(sql, params, (updateErr) => {
          const esNCFDuplicado =
            updateErr && typeof updateErr.message === 'string' && updateErr.message.includes('UNIQUE constraint failed: pedidos.ncf');

          if (esNCFDuplicado) {
            if (ncfManualEnviado) {
              db.run('ROLLBACK', () =>
                callback({ status: 400, message: 'El NCF ingresado ya existe. Usa otro NCF.' })
              );
              return;
            }

            if (puedeReintentarNCF && esReferencia && intentosRestantes > 0) {
              // El NCF generado ya existe; reintentamos con uno nuevo, forzando a escribirlo en el pedido de referencia.
              return db.run('ROLLBACK', () =>
                generarNCF(tipoFinal, negocioIdOperacion, (nuevoErr, nuevoNcf) => {
                  if (nuevoErr) {
                    console.error('Error al regenerar NCF tras conflicto:', nuevoErr.message);
                    return callback({ status: 500, message: 'No fue posible generar un NCF unico' });
                  }
                  ejecutarCierre(nuevoNcf, intentosRestantes - 1);
                })
              );
            }
          }

          if (esNCFDuplicado) {
            console.error('Conflicto de NCF y no se pudo regenerar.');
            return db.run('ROLLBACK', () =>
              callback({ status: 500, message: 'No se pudo asignar un NCF unico al pedido' })
            );
          }

          if (updateErr) {
            console.error('Error al cerrar pedido:', updateErr.message);
            return db.run('ROLLBACK', () =>
              callback({ status: 500, message: 'Error al cerrar la cuenta' })
            );
          }

          actualizarPedido(indice + 1);
        });
      };

      actualizarPedido(0);
    });
  };

    if (pedidoReferencia.ncf) {
      return ejecutarCierre(pedidoReferencia.ncf, puedeReintentarNCF ? reintentosNCF : 0);
    }

    if (ncfManualNormalizado) {
      return ejecutarCierre(ncfManualNormalizado, 0);
    }

    if (generar_ncf) {
      return generarNCF(tipoFinal, negocioIdOperacion, (ncfErr, nuevoNcf) => {
        if (ncfErr) {
          console.error('Error al generar NCF:', ncfErr.message);
          return callback({ status: 500, message: 'No fue posible generar el NCF' });
        }
        ejecutarCierre(nuevoNcf, reintentosNCF);
      });
    }

    ejecutarCierre(null, 0);
  });
};

const esFechaISOValida = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);

const obtenerFechaLocalISO = (valor) => {
  if (valor instanceof Date) {
    const tzOffset = valor.getTimezoneOffset();
    const local = new Date(valor.getTime() - tzOffset * 60000);
    return local.toISOString().slice(0, 10);
  }

  if (typeof valor === 'string') {
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) {
      return obtenerFechaLocalISO(fecha);
    }
  }

  return obtenerFechaLocalISO(new Date());
};

const normalizarFechaOperacion = (valor) => {
  if (esFechaISOValida(valor)) {
    return valor;
  }
  return obtenerFechaLocalISO(new Date());
};

const FECHA_BASE_PEDIDOS_SQL = 'COALESCE(fecha_factura, fecha_cierre, fecha_creacion)';
const FECHA_BASE_PEDIDOS_ALIAS_SQL = 'COALESCE(p.fecha_factura, p.fecha_cierre, p.fecha_creacion)';

const obtenerPedidosPendientesDeCierre = (fecha, negocioId, opcionesOrCallback, maybeCallback) => {
  let callback = maybeCallback;
  let opciones = {};
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = NEGOCIO_ID_DEFAULT;
  } else if (typeof opcionesOrCallback === 'function') {
    callback = opcionesOrCallback;
  } else if (opcionesOrCallback && typeof opcionesOrCallback === 'object') {
    opciones = opcionesOrCallback;
  }

  const soloPendientes = opciones?.soloPendientes !== false;
  const ignorarFecha = opciones?.ignorarFecha === true;
  const filtros = ["estado = 'pagado'"];
  const params = [];
  const origenCaja = normalizarOrigenCaja(opciones?.origen_caja ?? opciones?.origen, 'caja');
  if (!ignorarFecha) {
    filtros.push(`DATE(${FECHA_BASE_PEDIDOS_SQL}) = ?`);
    params.push(fecha);
  }
  filtros.push('negocio_id = ?');
  params.push(negocioId || NEGOCIO_ID_DEFAULT);
  filtros.push(construirFiltroOrigenCaja(origenCaja, params, 'origen_caja'));
  if (soloPendientes) {
    filtros.push('(cierre_id IS NULL)');
  }

  const sql = `
    SELECT
      COALESCE(cuenta_id, id) AS id,
      MAX(cuenta_id) AS cuenta_id,
      MAX(mesa) AS mesa,
      MAX(cliente) AS cliente,
      MIN(${FECHA_BASE_PEDIDOS_SQL}) AS fecha_cierre,
      SUM(subtotal) AS subtotal,
      SUM(impuesto) AS impuesto,
      SUM(COALESCE(descuento_monto, 0)) AS descuento_monto,
      SUM(COALESCE(propina_monto, 0)) AS propina_monto,
      SUM(COALESCE(pago_efectivo_entregado, 0)) AS pago_efectivo_entregado,
      SUM(COALESCE(pago_efectivo, 0)) AS pago_efectivo,
      SUM(COALESCE(pago_tarjeta, 0)) AS pago_tarjeta,
      SUM(COALESCE(pago_transferencia, 0)) AS pago_transferencia,
      SUM(COALESCE(pago_cambio, 0)) AS pago_cambio
    FROM pedidos
    WHERE ${filtros.join('\n      AND ')}
    GROUP BY COALESCE(cuenta_id, id)
    ORDER BY MIN(${FECHA_BASE_PEDIDOS_SQL}) ASC, COALESCE(cuenta_id, id) ASC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      return callback(err);
    }

    callback(null, rows || []);
  });
};

const obtenerUltimoCierreCaja = (negocioIdOrCallback, origenOrCallback, maybeCallback) => {
  let negocioId = negocioIdOrCallback;
  let origen = null;
  let callback = maybeCallback;

  if (typeof negocioIdOrCallback === 'function') {
    callback = negocioIdOrCallback;
    negocioId = NEGOCIO_ID_DEFAULT;
  } else if (typeof origenOrCallback === 'function') {
    callback = origenOrCallback;
  } else {
    origen = origenOrCallback;
  }

  const params = [negocioId || NEGOCIO_ID_DEFAULT];
  const filtros = ['negocio_id = ?'];
  const origenCaja = normalizarOrigenCaja(origen, 'caja');
  filtros.push(construirFiltroOrigenCaja(origenCaja, params, 'origen_caja'));

  const sql = `
    SELECT fecha_cierre
    FROM cierres_caja
    WHERE ${filtros.join('\n      AND ')}
    ORDER BY fecha_cierre DESC
    LIMIT 1
  `;
  db.get(sql, params, (err, row) => {
    if (err) {
      return callback(err);
    }
    callback(null, row?.fecha_cierre || null);
  });
};

const obtenerSalidasPorFecha = (fecha, negocioIdOrCallback, opcionesOrCallback, maybeCallback) => {
  let negocioId = negocioIdOrCallback;
  let opciones = {};
  let callback = maybeCallback;

  if (typeof negocioIdOrCallback === 'function') {
    callback = negocioIdOrCallback;
    negocioId = NEGOCIO_ID_DEFAULT;
  } else if (typeof opcionesOrCallback === 'function') {
    callback = opcionesOrCallback;
  } else {
    opciones = opcionesOrCallback || {};
  }

  const ignorarFecha = opciones?.ignorarFecha === true;
  const desde = opciones?.desde || null;
  const hasta = opciones?.hasta || null;
  const filtros = [];
  const params = [];
  const origenCaja = normalizarOrigenCaja(opciones?.origen_caja ?? opciones?.origen, 'caja');

  if (!ignorarFecha) {
    filtros.push('DATE(fecha) = ?');
    params.push(fecha);
  }

  filtros.push('negocio_id = ?');
  params.push(negocioId || NEGOCIO_ID_DEFAULT);
  filtros.push(construirFiltroOrigenCaja(origenCaja, params, 'origen_caja'));

  if (ignorarFecha && desde) {
    filtros.push('created_at >= ?');
    params.push(desde);
  }
  if (ignorarFecha && hasta) {
    filtros.push('created_at <= ?');
    params.push(hasta);
  }

  const sql = `
    SELECT id, negocio_id, fecha, descripcion, monto, metodo, created_at
    FROM salidas_caja
    WHERE ${filtros.join('\n      AND ')}
    ORDER BY created_at ASC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      return callback(err);
    }

    const salidas = rows || [];
    const total = salidas.reduce((acc, salida) => acc + (Number(salida.monto) || 0), 0);
    callback(null, { salidas, total });
  });
};

const REFERENCIA_TIPO_SALIDA = 'SALIDA_CAJA';
const construirReferenciaSalida = (salidaId) => `${REFERENCIA_TIPO_SALIDA}:${salidaId}`;

const obtenerFechaSalidaGasto = (fechaEntrada) => {
  if (fechaEntrada instanceof Date) {
    return obtenerFechaLocalISO(fechaEntrada);
  }
  if (typeof fechaEntrada === 'string') {
    const valor = fechaEntrada.trim();
    if (esFechaISOValida(valor)) {
      return valor;
    }
    if (valor.length >= 10) {
      const recorte = valor.slice(0, 10);
      if (esFechaISOValida(recorte)) {
        return recorte;
      }
    }
  }
  return obtenerFechaLocalISO(new Date());
};

const obtenerGastoSalidaCaja = async (negocioId, salidaId) => {
  return db.get(
    `SELECT id, fecha, monto, descripcion, referencia, referencia_tipo, referencia_id
       FROM gastos
      WHERE negocio_id = ?
        AND referencia_tipo = ?
        AND referencia_id = ?
      LIMIT 1`,
    [negocioId, REFERENCIA_TIPO_SALIDA, salidaId]
  );
};

const crearGastoSalidaCaja = async ({ negocioId, usuarioId, fecha, monto, descripcion, salidaId }) => {
  const descripcionGasto = `Salida de caja: ${descripcion}`;
  const referencia = construirReferenciaSalida(salidaId);
  const params = [
    fecha,
    monto,
    'DOP',
    REFERENCIA_TIPO_SALIDA,
    'RETIRO_CAJA',
    'caja',
    'EFECTIVO',
    null,
    descripcionGasto,
    referencia,
    REFERENCIA_TIPO_SALIDA,
    salidaId,
    usuarioId || null,
    0,
    null,
    null,
    negocioId,
  ];

  const insert = await db.run(
    `
      INSERT INTO gastos (
        fecha, monto, moneda, categoria, tipo_gasto, origen, metodo_pago, proveedor, descripcion,
        referencia, referencia_tipo, referencia_id, usuario_id, es_recurrente,
        frecuencia, tags, negocio_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    params
  );

  return {
    id: insert?.lastID || null,
    fecha,
    monto,
    moneda: 'DOP',
    categoria: REFERENCIA_TIPO_SALIDA,
    origen: 'caja',
    metodo_pago: 'EFECTIVO',
    descripcion: descripcionGasto,
    referencia,
    referencia_tipo: REFERENCIA_TIPO_SALIDA,
    referencia_id: salidaId,
    usuario_id: usuarioId || null,
  };
};

const actualizarGastoSalidaCaja = async ({
  gastoId,
  negocioId,
  usuarioId,
  fecha,
  monto,
  descripcion,
  salidaId,
}) => {
  const descripcionGasto = `Salida de caja: ${descripcion}`;
  const referencia = construirReferenciaSalida(salidaId);
  const params = [
    fecha,
    monto,
    REFERENCIA_TIPO_SALIDA,
    'RETIRO_CAJA',
    'caja',
    'EFECTIVO',
    descripcionGasto,
    referencia,
    REFERENCIA_TIPO_SALIDA,
    salidaId,
    usuarioId || null,
    gastoId,
    negocioId,
  ];

  await db.run(
    `
      UPDATE gastos
         SET fecha = ?,
             monto = ?,
             categoria = ?,
             tipo_gasto = ?,
             origen = ?,
             metodo_pago = ?,
             descripcion = ?,
             referencia = ?,
             referencia_tipo = ?,
             referencia_id = ?,
             usuario_id = ?
       WHERE id = ?
         AND negocio_id = ?
    `,
    params
  );

  return {
    id: gastoId,
    fecha,
    monto,
    categoria: REFERENCIA_TIPO_SALIDA,
    origen: 'caja',
    metodo_pago: 'EFECTIVO',
    descripcion: descripcionGasto,
    referencia,
    referencia_tipo: REFERENCIA_TIPO_SALIDA,
    referencia_id: salidaId,
    usuario_id: usuarioId || null,
  };
};

const calcularResumenCajaPorFecha = (
  fecha,
  negocioIdOrCallback,
  opcionesOrCallback,
  maybeCallback
) => {
  let callback = null;
  let opciones = {};
  const negocioId =
    typeof negocioIdOrCallback === 'function' || negocioIdOrCallback === undefined
      ? NEGOCIO_ID_DEFAULT
      : negocioIdOrCallback;

  if (typeof negocioIdOrCallback === 'function') {
    callback = negocioIdOrCallback;
  } else if (typeof opcionesOrCallback === 'function') {
    callback = opcionesOrCallback;
  } else {
    opciones = opcionesOrCallback || {};
    callback = maybeCallback;
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback debe ser una funci?n');
  }

  const ignorarFecha = opciones?.ignorarFecha === true;
  const soloPendientes = ignorarFecha ? true : opciones?.soloPendientes !== false;
  const origenCaja = normalizarOrigenCaja(opciones?.origen_caja ?? opciones?.origen, 'caja');

  obtenerPedidosPendientesDeCierre(
    fecha,
    negocioId,
    { soloPendientes, ignorarFecha, origen_caja: origenCaja },
    (err, pedidos) => {
    if (err) {
      return callback(err);
    }

    const obtenerDescuentosLineas = (hecho) => {
      const filtros = ["p.estado = 'pagado'"];
      const params = [];
      if (!ignorarFecha) {
        filtros.push(`DATE(${FECHA_BASE_PEDIDOS_ALIAS_SQL}) = ?`);
        params.push(fecha);
      }
      filtros.push('p.negocio_id = ?');
      params.push(negocioId);
      filtros.push(construirFiltroOrigenCaja(origenCaja, params, 'p.origen_caja'));
      if (soloPendientes) {
        filtros.push('p.cierre_id IS NULL');
      }
      const sql = `
        SELECT SUM(d.cantidad * d.precio_unitario * (COALESCE(d.descuento_porcentaje, 0) / 100.0) + COALESCE(d.descuento_monto, 0)) AS total_descuento
        FROM detalle_pedido d
        JOIN pedidos p ON p.id = d.pedido_id
        WHERE ${filtros.join('\n          AND ')}
      `;
      db.get(sql, params, (descErr, row) => {
        if (descErr) return hecho(descErr);
        hecho(null, Number(row?.total_descuento) || 0);
      });
    };

    const cargarSalidas = (hecho) => {
      if (!ignorarFecha) {
        return obtenerSalidasPorFecha(fecha, negocioId, { origen_caja: origenCaja }, hecho);
      }
      obtenerUltimoCierreCaja(negocioId, origenCaja, (inicioErr, inicioTurno) => {
        if (inicioErr) return hecho(inicioErr);
        obtenerSalidasPorFecha(
          null,
          negocioId,
          { ignorarFecha: true, desde: inicioTurno, origen_caja: origenCaja },
          hecho
        );
      });
    };

    cargarSalidas((salidasErr, salidasData) => {
      if (salidasErr) {
        return callback(salidasErr);
      }

      obtenerDescuentosLineas((descErr, descuentosLineas) => {
        if (descErr) {
          return callback(descErr);
        }

        let totalEfectivo = 0;
        let totalTarjeta = 0;
        let totalTransferencia = 0;
        let totalDescuentos = 0;

        const total = pedidos.reduce((acumulado, pedido) => {
          const subtotal = Number(pedido.subtotal) || 0;
          const impuesto = Number(pedido.impuesto) || 0;
          const descuento = Number(pedido.descuento_monto) || 0;
          const propina = Number(pedido.propina_monto) || 0;
          const totalPedido = subtotal + impuesto - descuento + propina;
          totalDescuentos += descuento;

          const efectivoEntregado = Number(pedido.pago_efectivo_entregado) || 0;
          const efectivoRegistrado = Number(pedido.pago_efectivo) || 0;
          const cambioRegistrado = Number(pedido.pago_cambio) || 0;
          const tarjeta = Number(pedido.pago_tarjeta) || 0;
          const transferencia = Number(pedido.pago_transferencia) || 0;

          const baseEfectivo = efectivoEntregado > 0 ? efectivoEntregado : efectivoRegistrado;
          const efectivoNeto = Math.max(baseEfectivo - cambioRegistrado, 0);
          let efectivo = efectivoNeto;

          if (baseEfectivo + tarjeta + transferencia === 0) {
            efectivo = totalPedido;
          } else if (efectivo <= 0 && baseEfectivo > 0) {
            efectivo = Math.min(baseEfectivo, totalPedido);
          }

          efectivo = Math.min(efectivo, totalPedido);

          totalEfectivo += efectivo;
          totalTarjeta += tarjeta;
          totalTransferencia += transferencia;

          return acumulado + totalPedido;
        }, 0);

        const totalRedondeado = Number(total.toFixed(2));
        const efectivoRedondeado = Number(totalEfectivo.toFixed(2));
        const tarjetaRedondeado = Number(totalTarjeta.toFixed(2));
        const transferenciaRedondeado = Number(totalTransferencia.toFixed(2));
        const totalSalidas = Number((salidasData?.total || 0).toFixed(2));
        const totalDescuentosRedondeado = Number((totalDescuentos + descuentosLineas).toFixed(2));
        const agruparPedidosResumen = (lista) => {
          const mapa = new Map();
          lista.forEach((pedido) => {
            const clave = String(pedido.cuenta_id || pedido.id || 'pedido');
            if (!mapa.has(clave)) {
              mapa.set(clave, {
                id: pedido.cuenta_id || pedido.id,
                cuenta_id: pedido.cuenta_id || pedido.id,
                mesa: pedido.mesa,
              cliente: pedido.cliente,
              modo_servicio: pedido.modo_servicio,
              fecha_cierre: pedido.fecha_cierre || null,
              pedidos: [],
              subtotal: 0,
              impuesto: 0,
              total: 0,
              descuento_monto: 0,
              propina_monto: 0,
              pago_efectivo: 0,
              pago_efectivo_entregado: 0,
              pago_tarjeta: 0,
              pago_transferencia: 0,
              pago_cambio: 0,
              });
            }
            const cuenta = mapa.get(clave);
            const subtotal = Number(pedido.subtotal) || 0;
            const impuesto = Number(pedido.impuesto) || 0;
            const descuentoMonto = Number(pedido.descuento_monto) || 0;
            const propinaMonto = Number(pedido.propina_monto) || 0;

            cuenta.subtotal += subtotal;
            cuenta.impuesto += impuesto;
            cuenta.descuento_monto += descuentoMonto;
            cuenta.propina_monto += propinaMonto;
            cuenta.total += subtotal + impuesto - descuentoMonto + propinaMonto;
            cuenta.pago_efectivo += Number(pedido.pago_efectivo) || 0;
            cuenta.pago_efectivo_entregado += Number(pedido.pago_efectivo_entregado) || 0;
            cuenta.pago_tarjeta += Number(pedido.pago_tarjeta) || 0;
            cuenta.pago_transferencia += Number(pedido.pago_transferencia) || 0;
            cuenta.pago_cambio += Number(pedido.pago_cambio) || 0;

            if (!cuenta.fecha_cierre && pedido.fecha_cierre) {
              cuenta.fecha_cierre = pedido.fecha_cierre;
            }

            if (!cuenta.mesa && pedido.mesa) {
              cuenta.mesa = pedido.mesa;
            }
            if (!cuenta.cliente && pedido.cliente) {
              cuenta.cliente = pedido.cliente;
            }

            cuenta.pedidos.push(pedido);
          });
          return Array.from(mapa.values()).map((cuenta) => ({
            ...cuenta,
            subtotal: Number(cuenta.subtotal.toFixed(2)),
            impuesto: Number(cuenta.impuesto.toFixed(2)),
            descuento_monto: Number(cuenta.descuento_monto.toFixed(2)),
            propina_monto: Number(cuenta.propina_monto.toFixed(2)),
            total: Number(cuenta.total.toFixed(2)),
            pago_efectivo: Number(cuenta.pago_efectivo.toFixed(2)),
            pago_efectivo_entregado: Number(cuenta.pago_efectivo_entregado.toFixed(2)),
            pago_tarjeta: Number(cuenta.pago_tarjeta.toFixed(2)),
            pago_transferencia: Number(cuenta.pago_transferencia.toFixed(2)),
            pago_cambio: Number(cuenta.pago_cambio.toFixed(2)),
            fecha_cierre: cuenta.fecha_cierre
              ? new Date(cuenta.fecha_cierre).toISOString()
              : cuenta.pedidos[0]?.fecha_cierre
              ? new Date(cuenta.pedidos[0].fecha_cierre).toISOString()
              : null,
          }));
        };

        callback(null, {
          fecha,
          cantidad_pedidos: pedidos.length,
          total_sistema: efectivoRedondeado,
          total_general: totalRedondeado,
          total_efectivo: efectivoRedondeado,
          total_tarjeta: tarjetaRedondeado,
          total_transferencia: transferenciaRedondeado,
          total_salidas: totalSalidas,
          total_descuentos: totalDescuentosRedondeado,
          pedidos: agruparPedidosResumen(pedidos),
          salidas: salidasData?.salidas || [],
        });
      });
    });
  });
};

const normalizarRangoCierres = (desde, hasta) => {
  const fechaDesde = normalizarFechaOperacion(desde);
  const fechaHasta = normalizarFechaOperacion(hasta);
  const actual = obtenerFechaLocalISO(new Date());
  let inicio = fechaDesde || actual;
  let fin = fechaHasta || inicio;

  if (inicio && fin && inicio > fin) {
    [inicio, fin] = [fin, inicio];
  }

  return {
    desde: inicio || actual,
    hasta: fin || inicio || actual,
  };
};

const parseFechaISO = (valor) => {
  if (!esFechaISOValida(valor)) {
    return null;
  }
  return new Date(`${valor}T00:00:00`);
};

const calcularDiasIncluidos = (desde, hasta) => {
  const ms = hasta.getTime() - desde.getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
};

const normalizarRangoAnalisis = (desdeInput, hastaInput, diasDefecto = 30) => {
  let fechaHasta = parseFechaISO(hastaInput) || new Date();
  let fechaDesde = parseFechaISO(desdeInput);

  if (!fechaDesde) {
    const inicio = new Date(fechaHasta.getTime());
    inicio.setDate(inicio.getDate() - Math.max(diasDefecto - 1, 0));
    fechaDesde = inicio;
  }

  if (fechaDesde > fechaHasta) {
    [fechaDesde, fechaHasta] = [fechaHasta, fechaDesde];
  }

  const dias = calcularDiasIncluidos(fechaDesde, fechaHasta);
  return {
    desde: obtenerFechaLocalISO(fechaDesde),
    hasta: obtenerFechaLocalISO(fechaHasta),
    dias,
  };
};

const obtenerRangoAnterior = (desde, dias) => {
  const fechaDesde = parseFechaISO(desde) || new Date();
  const finAnterior = new Date(fechaDesde.getTime());
  finAnterior.setDate(finAnterior.getDate() - 1);
  const inicioAnterior = new Date(finAnterior.getTime());
  inicioAnterior.setDate(inicioAnterior.getDate() - Math.max(dias - 1, 0));
  return {
    desde: obtenerFechaLocalISO(inicioAnterior),
    hasta: obtenerFechaLocalISO(finAnterior),
  };
};

app.use(
  '/api/dgii/paso2',
  createDgiiPaso2Router({
    db,
    requireUsuarioSesion,
    tienePermisoAdmin: esSuperAdmin,
    obtenerNegocioIdUsuario,
  })
);

app.post('/api/caja/cierres', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    try {
      const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
      const cierre = await registrarCierreCaja(req.body || {}, negocioId);
      res.json({ ok: true, cierre });
    } catch (error) {
      const status = error?.status || 500;
      console.error('Error al registrar cierre de caja:', error?.message || error);
      res
        .status(status)
        .json({ ok: false, error: error?.message || 'No se pudo registrar el cuadre de caja.' });
    }
  });
});

const obtenerCierresCaja = (desde, hasta, negocioId, origen, callback) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const params = [negocio, desde, hasta];
  const filtros = ['negocio_id = ?', 'DATE(fecha_operacion) BETWEEN ? AND ?'];
  const origenCaja = normalizarOrigenCaja(origen, 'caja');
  filtros.push(construirFiltroOrigenCaja(origenCaja, params, 'origen_caja'));
  const sql = `
    SELECT id, fecha_operacion, fecha_cierre, usuario, usuario_rol, origen_caja,
           total_sistema, total_declarado, diferencia, observaciones
    FROM cierres_caja
    WHERE ${filtros.join('\n      AND ')}
    ORDER BY fecha_operacion DESC
  `;
  db.all(sql, params, (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows || []);
  });
};

const obtenerPedidosDetalleCierre = (cierreId, negocioId, origen, callback) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const params = [cierreId, negocio];
  const filtroOrigen = construirFiltroOrigenCaja(origen, params, 'origen_caja');
  const sql = `
    SELECT
      COALESCE(cuenta_id, id) AS id,
      MAX(cuenta_id) AS cuenta_id,
      MAX(mesa) AS mesa,
      MAX(cliente) AS cliente,
      SUM(total) AS total,
      MIN(fecha_cierre) AS fecha_cierre,
      MIN(fecha_listo) AS fecha_listo
    FROM pedidos
    WHERE cierre_id = ?
      AND negocio_id = ?
      AND ${filtroOrigen}
    GROUP BY id
    ORDER BY fecha_cierre DESC, id ASC
  `;
  db.all(sql, params, (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows || []);
  });
};

const obtenerFacturasClientesDetalleCierre = (
  cierreId,
  negocioId,
  origen,
  fechaOperacionOrCallback,
  maybeCallback
) => {
  let callback = maybeCallback;
  let fechaOperacion = fechaOperacionOrCallback;
  if (typeof fechaOperacionOrCallback === 'function') {
    callback = fechaOperacionOrCallback;
    fechaOperacion = null;
  }

  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const cierreNumero = Number(cierreId);
  const fechaBase = esFechaISOValida(fechaOperacion) ? fechaOperacion : null;
  const params = [negocio];
  let filtroCierreFecha = '1 = 0';

  if (Number.isInteger(cierreNumero) && cierreNumero > 0 && fechaBase) {
    filtroCierreFecha = '(d.cierre_id = ? OR (d.cierre_id IS NULL AND DATE(d.fecha) = ?))';
    params.push(cierreNumero, fechaBase);
  } else if (Number.isInteger(cierreNumero) && cierreNumero > 0) {
    filtroCierreFecha = 'd.cierre_id = ?';
    params.push(cierreNumero);
  } else if (fechaBase) {
    filtroCierreFecha = 'DATE(d.fecha) = ?';
    params.push(fechaBase);
  }

  const filtroOrigen = construirFiltroOrigenCaja(origen, params, 'd.origen_caja');
  const sql = `
    SELECT
      d.id,
      d.id AS factura_deuda_id,
      c.nombre AS cliente,
      d.monto_total AS total,
      COALESCE(d.updated_at, d.created_at, CONCAT(d.fecha, ' 00:00:00')) AS fecha_cierre
    FROM clientes_deudas d
    LEFT JOIN clientes c ON c.id = d.cliente_id
    WHERE d.negocio_id = ?
      AND ${filtroCierreFecha}
      AND ${filtroOrigen}
    ORDER BY fecha_cierre DESC, d.id ASC
  `;
  db.all(sql, params, (err, rows) => {
    if (err) {
      return callback(err);
    }
    const facturas = (rows || []).map((row) => ({
      id: Number(row.id) || null,
      factura_deuda_id: Number(row.factura_deuda_id) || Number(row.id) || null,
      cuenta_id: null,
      mesa: null,
      cliente: row.cliente || 'Cliente',
      total: Number(row.total) || 0,
      fecha_cierre: row.fecha_cierre || null,
      fecha_listo: null,
      tipo_registro: 'factura_cliente',
    }));
    callback(null, facturas);
  });
};

const registrarCierreCaja = async (payload, negocioId) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const fechaOperacion = normalizarFechaOperacion(payload?.fecha_operacion);
  if (!fechaOperacion) {
    const err = new Error('Fecha de operacion invalida.');
    err.status = 400;
    throw err;
  }

  const totalDeclarado = Number(payload?.total_declarado);
  if (!Number.isFinite(totalDeclarado) || totalDeclarado < 0) {
    const err = new Error('Total declarado invalido.');
    err.status = 400;
    throw err;
  }

  const usuario = (payload?.usuario || '').toString().trim();
  if (!usuario) {
    const err = new Error('Usuario requerido para registrar el cuadre.');
    err.status = 400;
    throw err;
  }

  const fondoInicial = Number(payload?.fondo_inicial) || 0;
  const usuarioRol = payload?.usuario_rol || null;
  const observaciones = (payload?.observaciones || '').toString();
  const origenFallback = usuarioRol === 'vendedor' ? 'mostrador' : 'caja';
  const origenCaja = normalizarOrigenCaja(payload?.origen_caja ?? payload?.origen, origenFallback);

  const resumenDia = await new Promise((resolve, reject) => {
    calcularResumenCajaPorFecha(
      fechaOperacion,
      negocio,
      { soloPendientes: true, ignorarFecha: true, origen_caja: origenCaja },
      (err, data) => {
        if (err) return reject(err);
        return resolve(data || {});
      }
    );
  });

  const totalEfectivo = Number(resumenDia.total_efectivo) || 0;
  const totalSalidas = Number(resumenDia.total_salidas) || 0;
  const esperado = Number((fondoInicial + totalEfectivo - totalSalidas).toFixed(2));
  const diferencia = Number((totalDeclarado - esperado).toFixed(2));

  const insert = await db.run(
    `INSERT INTO cierres_caja
      (fecha_operacion, usuario, usuario_rol, origen_caja, fondo_inicial, total_sistema, total_declarado, diferencia, observaciones, negocio_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fechaOperacion,
      usuario,
      usuarioRol,
      origenCaja,
      fondoInicial,
      esperado,
      Number(totalDeclarado.toFixed(2)),
      diferencia,
      observaciones,
      negocio,
    ]
  );

  const cierreId = insert?.lastID || insert?.lastInsertId || null;
  if (cierreId) {
    const params = [cierreId, origenCaja, negocio];
    const filtroOrigen = construirFiltroOrigenCaja(origenCaja, params, 'origen_caja');
    await db.run(
      `UPDATE pedidos
         SET cierre_id = ?,
             origen_caja = ?
       WHERE estado = 'pagado'
         AND (cierre_id IS NULL)
         AND negocio_id = ?
        AND ${filtroOrigen}`,
      params
    );

    const paramsFacturas = [cierreId, origenCaja, negocio];
    const filtroOrigenFacturas = construirFiltroOrigenCaja(origenCaja, paramsFacturas, 'origen_caja');
    await db.run(
      `UPDATE clientes_deudas
         SET cierre_id = ?,
             origen_caja = COALESCE(origen_caja, ?)
       WHERE cierre_id IS NULL
         AND negocio_id = ?
         AND ${filtroOrigenFacturas}`,
      paramsFacturas
    );
  }

  return {
    id: cierreId,
    fecha_operacion: fechaOperacion,
    usuario,
    usuario_rol: usuarioRol,
    origen_caja: origenCaja,
    fondo_inicial: fondoInicial,
    total_sistema: esperado,
    total_declarado: Number(totalDeclarado.toFixed(2)),
    diferencia,
    observaciones,
  };
};

const construirFilasCierresCSV = (cierres) =>
  (cierres || []).map((cierre) => ({
    fecha_operacion: cierre.fecha_operacion,
    fecha_cierre: cierre.fecha_cierre,
    usuario: cierre.usuario,
    total_sistema: cierre.total_sistema,
    total_declarado: cierre.total_declarado,
    diferencia: cierre.diferencia,
    observaciones: cierre.observaciones || '',
  }));

app.get('/api/caja/cierres', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');
    const rango = normalizarRangoCierres(req.query?.desde, req.query?.hasta);

    obtenerCierresCaja(rango.desde, rango.hasta, negocioId, origenCaja, (err, cierres) => {
      if (err) {
        console.error('Error al consultar cierres de caja:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'Error al consultar cierres de caja' });
      }
      res.json({ ok: true, cierres, desde: rango.desde, hasta: rango.hasta });
    });
  });
});

app.get('/api/caja/cierres/export', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rango = normalizarRangoCierres(req.query?.desde, req.query?.hasta);
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');
    obtenerCierresCaja(rango.desde, rango.hasta, negocioId, origenCaja, (err, cierres) => {
      if (err) {
        console.error('Error al exportar cierres de caja:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'Error al exportar cierres de caja' });
      }
      const headers = [
        'fecha_operacion',
        'fecha_cierre',
        'usuario',
        'total_sistema',
        'total_declarado',
        'diferencia',
        'observaciones',
      ];
      const csv = construirCSV(headers, construirFilasCierresCSV(cierres));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cierres_caja_${rango.desde}_a_${rango.hasta}.csv"`
      );
      res.send(csv);
    });
  });
});

app.get('/api/caja/cierres/hoja-detalle-mes', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');
    const rango = normalizarRangoCierres(req.query?.desde, req.query?.hasta);

    const normalizarClaveCompra = (valor) => {
      if (!valor) return '';
      return String(valor).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    try {
      const cierres = await new Promise((resolve, reject) => {
        obtenerCierresCaja(rango.desde, rango.hasta, negocioId, origenCaja, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });

      const cierreIds = cierres
        .map((item) => Number(item.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      const placeholdersCierres = cierreIds.map(() => '?').join(', ');
      const paramsVentas = [negocioId, ...cierreIds];
      const filtroOrigenPedidos = construirFiltroOrigenCaja(origenCaja, paramsVentas, 'p.origen_caja');
      const paramsVentasFacturas = [negocioId, rango.desde, rango.hasta];
      const filtroOrigenFacturas = construirFiltroOrigenCaja(origenCaja, paramsVentasFacturas, 'd.origen_caja');
      const fechaDesdeTs = `${rango.desde} 00:00:00`;
      const fechaHastaTs = `${rango.hasta} 23:59:59`;
      const ventasPedidosPromise = cierreIds.length
        ? db.all(
            `SELECT dp.producto_id,
                    dp.precio_unitario,
                    SUM(dp.cantidad) AS venta_cantidad,
                    SUM(dp.cantidad * dp.precio_unitario) AS venta_bruta,
                    SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS venta_neta,
                    SUM(COALESCE(dp.descuento_monto, 0)) AS descuento_total
               FROM detalle_pedido dp
               JOIN pedidos p ON p.id = dp.pedido_id
              WHERE p.negocio_id = ?
                AND p.cierre_id IN (${placeholdersCierres})
                AND p.estado = 'pagado'
                AND ${filtroOrigenPedidos}
              GROUP BY dp.producto_id, dp.precio_unitario`,
            paramsVentas
          )
        : Promise.resolve([]);

      const [productos, ventasRows, ventasFacturasRows, comprasRows, salidasData] = await Promise.all([
        db.all(
          `SELECT id, nombre, precio, precios, stock, stock_indefinido
             FROM productos
            WHERE negocio_id = ?
            ORDER BY nombre ASC`,
          [negocioId]
        ),
        ventasPedidosPromise,
        db.all(
          `SELECT dd.producto_id,
                  dd.precio_unitario,
                  SUM(dd.cantidad) AS venta_cantidad,
                  SUM(dd.total_linea) AS venta_bruta,
                  SUM(dd.total_linea) AS venta_neta,
                  0 AS descuento_total
             FROM clientes_deudas_detalle dd
             JOIN clientes_deudas d ON d.id = dd.deuda_id
            WHERE d.negocio_id = ?
              AND DATE(d.fecha) BETWEEN ? AND ?
              AND ${filtroOrigenFacturas}
            GROUP BY dd.producto_id, dd.precio_unitario`,
          paramsVentasFacturas
        ),
        db.all(
          `SELECT dc.descripcion, dc.cantidad
             FROM detalle_compra dc
             JOIN compras c ON c.id = dc.compra_id
            WHERE c.negocio_id = ?
              AND DATE(c.fecha) BETWEEN ? AND ?`,
          [negocioId, rango.desde, rango.hasta]
        ),
        new Promise((resolve, reject) => {
          obtenerSalidasPorFecha(
            null,
            negocioId,
            { ignorarFecha: true, desde: fechaDesdeTs, hasta: fechaHastaTs, origen_caja: origenCaja },
            (err, data) => {
              if (err) return reject(err);
              resolve(data || {});
            }
          );
        }),
      ]);

      let gastos = [];
      let totalGastos = 0;
      if (tienePermisoAdmin(usuarioSesion)) {
        gastos = await db.all(
          `SELECT id, fecha, monto, moneda, categoria, metodo_pago, proveedor, descripcion
             FROM gastos
            WHERE negocio_id = ?
              AND DATE(fecha) BETWEEN ? AND ?
            ORDER BY fecha ASC, id ASC`,
          [negocioId, rango.desde, rango.hasta]
        );
        totalGastos = (gastos || []).reduce((acc, gasto) => acc + (Number(gasto.monto) || 0), 0);
      }

      const ventasMap = new Map();
      const ventasCombinadas = [...(ventasRows || []), ...(ventasFacturasRows || [])];
      ventasCombinadas.forEach((row) => {
        const productoId = Number(row.producto_id);
        if (!productoId) return;
        const ventaCantidad = Number(row.venta_cantidad) || 0;
        const ventaBruta = Number(row.venta_bruta) || 0;
        const ventaNeta = Number(row.venta_neta) || 0;
        const precioUnitario = normalizarNumero(row.precio_unitario, 0);
        const existente = ventasMap.get(productoId) || {
          ventaCantidad: 0,
          ventaBruta: 0,
          ventaNeta: 0,
          descuentoTotal: 0,
          precios: [],
        };

        existente.ventaCantidad += ventaCantidad;
        existente.ventaBruta += ventaBruta;
        existente.ventaNeta += ventaNeta;
        existente.descuentoTotal += Number(row.descuento_total) || 0;
        if (ventaCantidad > 0) {
          existente.precios.push({
            precio_unitario: Number(precioUnitario.toFixed(2)),
            cantidad: ventaCantidad,
            venta_bruta: Number(ventaBruta.toFixed(2)),
            venta_neta: Number(ventaNeta.toFixed(2)),
          });
        }
        ventasMap.set(productoId, existente);
      });

      ventasMap.forEach((venta) => {
        if (Array.isArray(venta.precios)) {
          venta.precios.sort((a, b) => a.precio_unitario - b.precio_unitario);
        }
      });

      const comprasMap = new Map();
      (comprasRows || []).forEach((row) => {
        const key = normalizarClaveCompra(row?.descripcion);
        if (!key) return;
        const cantidad = Number(row.cantidad) || 0;
        if (!cantidad) return;
        comprasMap.set(key, (comprasMap.get(key) || 0) + cantidad);
      });

      const detalleProductos = (productos || []).map((producto) => {
        const stockIndefinido = Number(producto.stock_indefinido) === 1;
        const venta = ventasMap.get(Number(producto.id)) || {};
        const compraCantidad = stockIndefinido
          ? null
          : comprasMap.get(normalizarClaveCompra(producto.nombre)) || 0;
        const ventaCantidad = Number(venta.ventaCantidad) || 0;
        const ventaValor = Number(venta.ventaNeta) || 0;
        const precioUnitario =
          ventaCantidad > 0 ? Number(venta.ventaBruta || 0) / ventaCantidad : Number(producto.precio) || 0;
        const stockFinal = stockIndefinido ? null : Number(producto.stock) || 0;
        const stockInicial =
          stockIndefinido || stockFinal === null
            ? null
            : Number((stockFinal + ventaCantidad - (compraCantidad || 0)).toFixed(2));
        const preciosConfigurados = construirOpcionesPrecioProducto(producto);
        const preciosVendidos = Array.isArray(venta.precios) ? venta.precios : [];

        return {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio: Number(producto.precio) || 0,
          precios_configurados: preciosConfigurados,
          precios_vendidos: preciosVendidos,
          stock: stockFinal,
          stock_indefinido: stockIndefinido ? 1 : 0,
          inv_inicial: stockInicial,
          compra: compraCantidad,
          inv_final: stockFinal,
          venta: ventaCantidad,
          precio_unitario: Number(precioUnitario) || 0,
          valor_venta: Number(ventaValor.toFixed(2)),
        };
      });

      const totalValorVenta = detalleProductos.reduce((acc, item) => acc + (Number(item.valor_venta) || 0), 0);
      const totalSistema = cierres.reduce((acc, item) => acc + (Number(item.total_sistema) || 0), 0);
      const totalDeclarado = cierres.reduce((acc, item) => acc + (Number(item.total_declarado) || 0), 0);
      const totalDiferencia = cierres.reduce((acc, item) => acc + (Number(item.diferencia) || 0), 0);

      const ultimoCierre = cierres.reduce((actual, item) => {
        const fechaActual = new Date(actual?.fecha_cierre || 0).getTime();
        const fechaNueva = new Date(item?.fecha_cierre || 0).getTime();
        return fechaNueva > fechaActual ? item : actual;
      }, null);

      res.json({
        ok: true,
        tipo: 'mes',
        rango,
        cierre: {
          id: `${rango.desde} a ${rango.hasta}`,
          fecha_operacion: rango.desde,
          fecha_cierre: ultimoCierre?.fecha_cierre || null,
          usuario: 'Consolidado mensual',
          usuario_rol: null,
          total_sistema: Number(totalSistema.toFixed(2)),
          total_declarado: Number(totalDeclarado.toFixed(2)),
          diferencia: Number(totalDiferencia.toFixed(2)),
          cantidad_cierres: cierres.length,
        },
        cierres: cierres.map((cierre) => ({
          id: cierre.id,
          fecha_operacion: cierre.fecha_operacion,
          fecha_cierre: cierre.fecha_cierre,
          usuario: cierre.usuario,
          total_sistema: cierre.total_sistema,
          total_declarado: cierre.total_declarado,
          diferencia: cierre.diferencia,
          observaciones: cierre.observaciones || '',
        })),
        fecha_operacion: rango.desde,
        productos: detalleProductos,
        totales: {
          total_venta: Number(totalValorVenta.toFixed(2)),
          total_salidas: Number((salidasData?.total || 0).toFixed(2)),
          total_gastos: Number(totalGastos.toFixed(2)),
        },
        salidas: salidasData?.salidas || [],
        gastos,
      });
    } catch (error) {
      console.error('Error al generar hoja de detalle mensual de cierres:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar el cuadre mensual.' });
    }
  });
});

app.get('/api/caja/cierres/:id/detalle', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const corteId = Number(req.params.id);
    if (!Number.isInteger(corteId) || corteId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cierre invalido' });
    }
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');

    const params = [corteId, negocioId];
    const filtroOrigen = construirFiltroOrigenCaja(origenCaja, params, 'origen_caja');
    db.get(
      `SELECT id, fecha_operacion, fecha_cierre
         FROM cierres_caja
        WHERE id = ? AND negocio_id = ? AND ${filtroOrigen}`,
      params,
      (cierreErr, cierreRow) => {
        if (cierreErr) {
          console.error('Error al consultar el cierre de caja:', cierreErr?.message || cierreErr);
          return res.status(500).json({ ok: false, error: 'Error al consultar el cierre' });
        }
        if (!cierreRow) {
          return res.status(404).json({ ok: false, error: 'Cierre no encontrado' });
        }

        obtenerPedidosDetalleCierre(corteId, negocioId, origenCaja, (detalleErr, pedidos) => {
          if (detalleErr) {
            console.error('Error al obtener detalle del cierre:', detalleErr?.message || detalleErr);
            return res.status(500).json({ ok: false, error: 'Error al obtener el detalle del cierre' });
          }

          const fechaOperacionCierre = normalizarFechaOperacion(
            cierreRow?.fecha_operacion || cierreRow?.fecha_cierre || new Date()
          );
          obtenerFacturasClientesDetalleCierre(
            corteId,
            negocioId,
            origenCaja,
            fechaOperacionCierre,
            (facturaErr, facturas) => {
              if (facturaErr) {
                console.error(
                  'Error al obtener facturas de clientes del cierre:',
                  facturaErr?.message || facturaErr
                );
                return res.status(500).json({ ok: false, error: 'Error al obtener el detalle del cierre' });
              }

              const pedidosNormalizados = (pedidos || []).map((pedido) => ({
                ...pedido,
                tipo_registro: 'pedido',
              }));
              const detalle = [...pedidosNormalizados, ...(facturas || [])].sort((a, b) => {
                const fechaA = new Date(a?.fecha_cierre || a?.fecha_listo || 0).getTime();
                const fechaB = new Date(b?.fecha_cierre || b?.fecha_listo || 0).getTime();
                if (fechaA !== fechaB) {
                  return fechaB - fechaA;
                }
                return (Number(b?.id) || 0) - (Number(a?.id) || 0);
              });

              res.json({ ok: true, pedidos: detalle });
            }
          );
        });
      }
    );
  });
});

app.delete('/api/admin/eliminar/cierre-caja/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    if (!esUsuarioAdmin(usuarioSesion) && !esUsuarioSupervisor(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    }

    const contrasenia = req.body?.password;
    if (!contrasenia || contrasenia !== ADMIN_PASSWORD) {
      return res.status(403).json({ ok: false, error: 'Credenciales invalidas' });
    }

    const cierreId = Number(req.params.id);
    if (!Number.isInteger(cierreId) || cierreId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cierre invalido' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    db.run('DELETE FROM cierres_caja WHERE id = ? AND negocio_id = ?', [cierreId, negocioId], function (err) {
      if (err) {
        console.error('Error al eliminar cierre de caja:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'No fue posible eliminar el cierre' });
      }

      if ((this?.changes || 0) === 0) {
        return res.status(404).json({ ok: false, error: 'Cierre no encontrado' });
      }

      db.run(
        'UPDATE pedidos SET cierre_id = NULL WHERE cierre_id = ? AND negocio_id = ?',
        [cierreId, negocioId],
        (updateErr) => {
          if (updateErr) {
            console.error(
              'Error al desasociar pedidos del cierre eliminado:',
              updateErr?.message || updateErr
            );
          }
          db.run(
            'UPDATE clientes_deudas SET cierre_id = NULL WHERE cierre_id = ? AND negocio_id = ?',
            [cierreId, negocioId],
            (updateFactErr) => {
              if (updateFactErr) {
                console.error(
                  'Error al desasociar facturas de clientes del cierre eliminado:',
                  updateFactErr?.message || updateFactErr
                );
              }
              res.json({ ok: true });
            }
          );
        }
      );
    });
  });
});

app.get('/api/caja/cierres/:id/hoja-detalle', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cierreId = Number(req.params.id);
    if (!Number.isInteger(cierreId) || cierreId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cierre invalido' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');

    const normalizarClaveCompra = (valor) => {
      if (!valor) return '';
      return String(valor).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const normalizarFechaConsulta = (valor) => {
      if (!valor) return obtenerFechaLocalISO(new Date());
      if (typeof valor === 'string') {
        const match = valor.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        const fecha = new Date(valor);
        return Number.isNaN(fecha.getTime()) ? obtenerFechaLocalISO(new Date()) : obtenerFechaLocalISO(fecha);
      }
      if (valor instanceof Date) {
        return obtenerFechaLocalISO(valor);
      }
      const fecha = new Date(valor);
      return Number.isNaN(fecha.getTime()) ? obtenerFechaLocalISO(new Date()) : obtenerFechaLocalISO(fecha);
    };

    try {
      const paramsCierre = [cierreId, negocioId];
      const filtroOrigen = construirFiltroOrigenCaja(origenCaja, paramsCierre, 'origen_caja');
      const cierre = await db.get(
        `SELECT id, fecha_operacion, fecha_cierre, usuario, usuario_rol, origen_caja, total_sistema, total_declarado, diferencia
         FROM cierres_caja
         WHERE id = ? AND negocio_id = ? AND ${filtroOrigen}`,
        paramsCierre
      );

      if (!cierre) {
        return res.status(404).json({ ok: false, error: 'Cierre no encontrado' });
      }

      const fechaOperacion = normalizarFechaConsulta(cierre.fecha_operacion || cierre.fecha_cierre);

      const paramsVentas = [negocioId, cierreId];
      const filtroOrigenPedidos = construirFiltroOrigenCaja(origenCaja, paramsVentas, 'p.origen_caja');
      const paramsVentasFacturas = [negocioId, cierreId, fechaOperacion];
      const filtroOrigenFacturas = construirFiltroOrigenCaja(origenCaja, paramsVentasFacturas, 'd.origen_caja');
      const [productos, ventasRows, ventasFacturasRows, comprasRows] = await Promise.all([
        db.all(
          `SELECT id, nombre, precio, precios, stock, stock_indefinido
           FROM productos
           WHERE negocio_id = ?
           ORDER BY nombre ASC`,
          [negocioId]
        ),
        db.all(
          `SELECT dp.producto_id,
                  dp.precio_unitario,
                  SUM(dp.cantidad) AS venta_cantidad,
                  SUM(dp.cantidad * dp.precio_unitario) AS venta_bruta,
                  SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS venta_neta,
                  SUM(COALESCE(dp.descuento_monto, 0)) AS descuento_total
             FROM detalle_pedido dp
             JOIN pedidos p ON p.id = dp.pedido_id
            WHERE p.negocio_id = ?
              AND p.cierre_id = ?
              AND p.estado = 'pagado'
              AND ${filtroOrigenPedidos}
            GROUP BY dp.producto_id, dp.precio_unitario`,
          paramsVentas
        ),
        db.all(
          `SELECT dd.producto_id,
                  dd.precio_unitario,
                  SUM(dd.cantidad) AS venta_cantidad,
                  SUM(dd.total_linea) AS venta_bruta,
                  SUM(dd.total_linea) AS venta_neta,
                  0 AS descuento_total
            FROM clientes_deudas_detalle dd
            JOIN clientes_deudas d ON d.id = dd.deuda_id
            WHERE d.negocio_id = ?
              AND (d.cierre_id = ? OR (d.cierre_id IS NULL AND DATE(d.fecha) = ?))
              AND ${filtroOrigenFacturas}
            GROUP BY dd.producto_id, dd.precio_unitario`,
          paramsVentasFacturas
        ),
        db.all(
          `SELECT dc.descripcion, dc.cantidad
             FROM detalle_compra dc
             JOIN compras c ON c.id = dc.compra_id
            WHERE c.negocio_id = ?
              AND DATE(c.fecha) = ?`,
          [negocioId, fechaOperacion]
        ),
      ]);

      const ventasMap = new Map();
      const ventasCombinadas = [...(ventasRows || []), ...(ventasFacturasRows || [])];
      ventasCombinadas.forEach((row) => {
        const productoId = Number(row.producto_id);
        if (!productoId) return;
        const ventaCantidad = Number(row.venta_cantidad) || 0;
        const ventaBruta = Number(row.venta_bruta) || 0;
        const ventaNeta = Number(row.venta_neta) || 0;
        const precioUnitario = normalizarNumero(row.precio_unitario, 0);
        const existente = ventasMap.get(productoId) || {
          ventaCantidad: 0,
          ventaBruta: 0,
          ventaNeta: 0,
          descuentoTotal: 0,
          precios: [],
        };

        existente.ventaCantidad += ventaCantidad;
        existente.ventaBruta += ventaBruta;
        existente.ventaNeta += ventaNeta;
        existente.descuentoTotal += Number(row.descuento_total) || 0;
        if (ventaCantidad > 0) {
          existente.precios.push({
            precio_unitario: Number(precioUnitario.toFixed(2)),
            cantidad: ventaCantidad,
            venta_bruta: Number(ventaBruta.toFixed(2)),
            venta_neta: Number(ventaNeta.toFixed(2)),
          });
        }
        ventasMap.set(productoId, existente);
      });
      ventasMap.forEach((venta) => {
        if (Array.isArray(venta.precios)) {
          venta.precios.sort((a, b) => a.precio_unitario - b.precio_unitario);
        }
      });

      const comprasMap = new Map();
      (comprasRows || []).forEach((row) => {
        const key = normalizarClaveCompra(row?.descripcion);
        if (!key) return;
        const cantidad = Number(row.cantidad) || 0;
        if (!cantidad) return;
        comprasMap.set(key, (comprasMap.get(key) || 0) + cantidad);
      });

      const detalleProductos = (productos || []).map((producto) => {
        const stockIndefinido = Number(producto.stock_indefinido) === 1;
        const venta = ventasMap.get(Number(producto.id)) || {};
        const compraCantidad = stockIndefinido
          ? null
          : comprasMap.get(normalizarClaveCompra(producto.nombre)) || 0;
        const ventaCantidad = Number(venta.ventaCantidad) || 0;
        const ventaValor = Number(venta.ventaNeta) || 0;
        const precioUnitario =
          ventaCantidad > 0 ? Number(venta.ventaBruta || 0) / ventaCantidad : Number(producto.precio) || 0;
        const stockFinal = stockIndefinido ? null : Number(producto.stock) || 0;
        const stockInicial =
          stockIndefinido || stockFinal === null
            ? null
            : Number((stockFinal + ventaCantidad - (compraCantidad || 0)).toFixed(2));
        const preciosConfigurados = construirOpcionesPrecioProducto(producto);
        const preciosVendidos = Array.isArray(venta.precios) ? venta.precios : [];

        return {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio: Number(producto.precio) || 0,
          precios_configurados: preciosConfigurados,
          precios_vendidos: preciosVendidos,
          stock: stockFinal,
          stock_indefinido: stockIndefinido ? 1 : 0,
          inv_inicial: stockInicial,
          compra: compraCantidad,
          inv_final: stockFinal,
          venta: ventaCantidad,
          precio_unitario: Number(precioUnitario) || 0,
          valor_venta: Number(ventaValor.toFixed(2)),
        };
      });

      const totalValorVenta = detalleProductos.reduce((acc, item) => acc + (Number(item.valor_venta) || 0), 0);

      const salidasData = await new Promise((resolve, reject) => {
        obtenerSalidasPorFecha(fechaOperacion, negocioId, { origen_caja: origenCaja }, (err, data) => {
          if (err) return reject(err);
          resolve(data || {});
        });
      });

      let gastos = [];
      let totalGastos = 0;
      if (tienePermisoAdmin(usuarioSesion)) {
        gastos = await db.all(
          `SELECT id, fecha, monto, moneda, categoria, metodo_pago, proveedor, descripcion
             FROM gastos
            WHERE negocio_id = ?
              AND DATE(fecha) = ?
            ORDER BY fecha ASC, id ASC`,
          [negocioId, fechaOperacion]
        );
        totalGastos = (gastos || []).reduce((acc, gasto) => acc + (Number(gasto.monto) || 0), 0);
      }

      res.json({
        ok: true,
        cierre,
        fecha_operacion: fechaOperacion,
        productos: detalleProductos,
        totales: {
          total_venta: Number(totalValorVenta.toFixed(2)),
          total_salidas: Number((salidasData?.total || 0).toFixed(2)),
          total_gastos: Number(totalGastos.toFixed(2)),
        },
        salidas: salidasData?.salidas || [],
        gastos,
      });
    } catch (error) {
      console.error('Error al generar hoja de detalle de cierre:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar la hoja de detalle' });
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

app.get('/admin/cotizaciones', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/supervisor/cotizaciones', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supervisor.html'));
});

app.get('/admin/cotizaciones/:id/imprimir', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cotizacion-imprimir.html'));
});

app.get('/api/configuracion/impuesto', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const configImpuesto = await obtenerConfiguracionImpuestoNegocio(negocioId);
      res.json({
        ok: true,
        valor: configImpuesto.valor,
        productos_con_impuesto: configImpuesto.productosConImpuesto ? 1 : 0,
        impuesto_incluido_valor: configImpuesto.impuestoIncluidoValor,
      });
    } catch (error) {
      console.error('Error al obtener el impuesto configurado:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo consultar el impuesto configurado' });
    }
  });
});

app.put('/api/configuracion/impuesto', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rawValor = req.body?.valor;
    const rawProductosConImpuesto = req.body?.productos_con_impuesto ?? req.body?.productosConImpuesto;
    const rawImpuestoIncluido = req.body?.impuesto_incluido_valor ?? req.body?.impuestoIncluidoValor;
    const valor = Number(rawValor);
    const productosConImpuesto = normalizarFlag(rawProductosConImpuesto, 0) === 1;
    if (!Number.isFinite(valor) || valor < 0) {
      return res.status(400).json({
        ok: false,
        error: 'El valor del impuesto debe ser un numero mayor o igual a 0',
      });
    }

    const impuestoIncluidoValor = rawImpuestoIncluido === undefined || rawImpuestoIncluido === null || rawImpuestoIncluido === ''
      ? valor
      : Number(rawImpuestoIncluido);
    if (!Number.isFinite(impuestoIncluidoValor) || impuestoIncluidoValor < 0) {
      return res.status(400).json({
        ok: false,
        error: 'El impuesto incluido debe ser un numero mayor o igual a 0',
      });
    }

    const valorFinal = productosConImpuesto ? 0 : valor;

    try {
      await guardarConfiguracionNegocio(negocioId, {
        [IMPUESTO_CONFIG_CLAVE]: valorFinal,
        [PRODUCTOS_CON_IMPUESTO_CONFIG_CLAVE]: productosConImpuesto ? 1 : 0,
        [IMPUESTO_INCLUIDO_CONFIG_CLAVE]: impuestoIncluidoValor,
      });
      res.json({
        ok: true,
        valor: valorFinal,
        productos_con_impuesto: productosConImpuesto ? 1 : 0,
        impuesto_incluido_valor: impuestoIncluidoValor,
      });
    } catch (error) {
      console.error('Error al guardar el impuesto configurado:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el impuesto' });
    }
  });
});

app.get('/api/configuracion/itbis-acredita', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const acreditaItbis = await obtenerConfigAcreditaItbis(negocioId);
      res.json({ ok: true, acredita_itbis: acreditaItbis ? 1 : 0 });
    } catch (error) {
      console.error('Error al obtener configuracion de ITBIS acreditable:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo consultar la configuracion de ITBIS.' });
    }
  });
});

app.put('/api/configuracion/itbis-acredita', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rawValor = req.body?.acredita_itbis ?? req.body?.acreditaItbis;
    const valor = normalizarFlag(rawValor, 1);
    try {
      await guardarConfiguracionNegocio(negocioId, {
        [ITBIS_ACREDITA_CONFIG_KEY]: valor,
      });
      res.json({ ok: true, acredita_itbis: valor });
    } catch (error) {
      console.error('Error al guardar configuracion de ITBIS acreditable:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar la configuracion de ITBIS.' });
    }
  });
});

app.get('/api/configuracion/inventario', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const modoInventario = await obtenerModoInventarioCostos(negocioId);
      const bloquearInsumos = await obtenerConfigBloqueoInsumos(negocioId);
      res.json({
        ok: true,
        modo_inventario_costos: modoInventario,
        bloquear_insumos_sin_stock: bloquearInsumos ? 1 : 0,
      });
    } catch (error) {
      console.error('Error al obtener configuracion de inventario:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo consultar la configuracion de inventario.' });
    }
  });
});

app.put('/api/configuracion/inventario', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rawModo = req.body?.modo_inventario_costos ?? req.body?.modoInventarioCostos;
    const rawBloqueo =
      req.body?.bloquear_insumos_sin_stock ?? req.body?.bloquearInsumosSinStock;
    const modoInventario = normalizarModoInventarioCostos(rawModo, 'PREPARACION');
    const bloquearInsumos = normalizarFlag(rawBloqueo, 0);
    try {
      await guardarConfiguracionNegocio(negocioId, {
        [INVENTARIO_MODO_CONFIG_KEY]: modoInventario,
        [INSUMOS_BLOQUEO_CONFIG_KEY]: bloquearInsumos,
      });
      res.json({
        ok: true,
        modo_inventario_costos: modoInventario,
        bloquear_insumos_sin_stock: bloquearInsumos,
      });
    } catch (error) {
      console.error('Error al guardar configuracion de inventario:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar la configuracion de inventario.' });
    }
  });
});

app.get('/api/configuracion/factura', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const configuracion = await obtenerConfiguracionFacturacion(negocioId);
      res.json({ ok: true, configuracion });
    } catch (error) {
      console.error('Error al obtener la configuracion de factura:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener la configuracion de factura' });
    }
  });
});

app.put('/api/configuracion/factura', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const payload = req.body || {};
    const telefonosEntrada = Array.isArray(payload.telefono)
      ? payload.telefono.map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim())).filter(Boolean)
      : [];

    const datosActualizar = {
      [FACTURACION_CLAVES.telefonos]: telefonosEntrada.length ? JSON.stringify(telefonosEntrada) : '',
      [FACTURACION_CLAVES.telefono]: telefonosEntrada.join(' | '),
      [FACTURACION_CLAVES.direccion]: normalizarTextoConfiguracion(payload.direccion),
      [FACTURACION_CLAVES.rnc]: normalizarTextoConfiguracion(payload.rnc),
      [FACTURACION_CLAVES.logo]: normalizarTextoConfiguracion(payload.logo),
      [FACTURACION_CLAVES.pie]: normalizarTextoConfiguracion(payload.pie),
      [FACTURACION_CLAVES.b02_inicio]: normalizarNumeroConfiguracion(payload.b02_inicio),
      [FACTURACION_CLAVES.b02_fin]: normalizarNumeroConfiguracion(payload.b02_fin),
      [FACTURACION_CLAVES.b01_inicio]: normalizarNumeroConfiguracion(payload.b01_inicio),
      [FACTURACION_CLAVES.b01_fin]: normalizarNumeroConfiguracion(payload.b01_fin),
    };

    try {
      await guardarConfiguracionNegocio(negocioId, datosActualizar);
      const configuracion = await obtenerConfiguracionFacturacion(negocioId);
      res.json({ ok: true, configuracion });
    } catch (error) {
      console.error('Error al guardar la configuracion de factura:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo guardar la configuracion de factura' });
    }
  });
});

app.get('/api/admin/negocio/config', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const configuracion = await obtenerConfiguracionSecuenciasNegocio(negocioId);
      res.json({ ok: true, ...configuracion });
    } catch (error) {
      console.error('Error al obtener configuracion de secuencias fiscales:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener la configuracion de secuencias fiscales' });
    }
  });
});

app.put('/api/admin/negocio/config', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const payload = req.body || {};
    const permitirB01 = normalizarFlag(payload.permitir_b01 ?? payload.permitirB01, 1);
    const permitirB02 = normalizarFlag(payload.permitir_b02 ?? payload.permitirB02, 1);
    const permitirB14 = normalizarFlag(payload.permitir_b14 ?? payload.permitirB14, 1);

    try {
      await db.run(
        'UPDATE negocios SET permitir_b01 = ?, permitir_b02 = ?, permitir_b14 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [permitirB01, permitirB02, permitirB14, negocioId]
      );
      const configuracion = await obtenerConfiguracionSecuenciasNegocio(negocioId);
      res.json({ ok: true, ...configuracion });
    } catch (error) {
      console.error('Error al guardar configuracion de secuencias fiscales:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo guardar la configuracion de secuencias fiscales' });
    }
  });
});

app.get('/api/productos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion.negocio_id ?? NEGOCIO_ID_DEFAULT;

    try {
      const tieneNegocioId = await verificarCategoriaNegocioId();
      const joinCond = tieneNegocioId
        ? 'LEFT JOIN categorias c ON p.categoria_id = c.id AND c.negocio_id = ?'
        : 'LEFT JOIN categorias c ON p.categoria_id = c.id';

      const soloVentaRaw = req.query?.solo_venta ?? req.query?.soloVenta ?? req.query?.venta;
      const soloVenta = normalizarFlag(soloVentaRaw, 0) === 1;
      const tipoFiltroRaw = req.query?.tipo_producto ?? req.query?.tipoProducto ?? req.query?.tipo;
      const tipoFiltro = tipoFiltroRaw ? normalizarTipoProducto(tipoFiltroRaw, null) : null;
      const filtrarVenta = !tienePermisoAdmin(usuarioSesion) || soloVenta;

      const filtros = ['p.negocio_id = ?'];
      if (filtrarVenta) {
        filtros.push("(COALESCE(p.tipo_producto, 'FINAL') <> 'INSUMO' OR COALESCE(p.insumo_vendible, 0) = 1)");
      }
      if (tipoFiltro) {
        filtros.push("COALESCE(p.tipo_producto, 'FINAL') = ?");
      }

      const sql = `
        SELECT p.id, p.nombre, p.precio, p.precios, p.stock, p.stock_indefinido, p.activo, p.categoria_id,
               p.costo_base_sin_itbis, p.costo_promedio_actual, p.ultimo_costo_sin_itbis,
               p.actualiza_costo_con_compras, p.costo_unitario_real, p.costo_unitario_real_incluye_itbis,
               p.tipo_producto, p.insumo_vendible, p.unidad_base, p.contenido_por_unidad,
               c.nombre AS categoria_nombre
        FROM productos p
        ${joinCond}
        WHERE ${filtros.join(' AND ')}
        ORDER BY p.nombre ASC
      `;

      const params = [];
      if (tieneNegocioId) {
        params.push(negocioId);
      }
      params.push(negocioId);
      if (tipoFiltro) {
        params.push(tipoFiltro);
      }

      const rows = await db.all(sql, params);
      const productosBase = (rows || []).map((row) => ({
        ...row,
        precios: normalizarListaPrecios(row.precios),
      }));

      const productosRecetaIds = productosBase
        .filter((row) => Number(row.stock_indefinido) === 1)
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0);

      const costosReceta = productosRecetaIds.length
        ? await obtenerCostosRecetaPorProductos(productosRecetaIds, negocioId)
        : new Map();

      const productos = productosBase.map((row) => {
        const costoReceta = costosReceta.get(Number(row.id));
        if (costoReceta !== undefined) {
          return {
            ...row,
            costo_unitario_real: Number(costoReceta.toFixed(4)),
            costo_unitario_real_calculado: 1,
          };
        }
        return row;
      });

      res.json(productos);
    } catch (error) {
      console.error('Error al construir consulta de productos:', error?.message || error);
      res.status(500).json({ error: 'Error al obtener productos' });
    }
  });
});

app.get('/api/caja/salidas', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
    const fechaQuery = normalizarCampoTexto(req.query?.fecha, null);
    const fecha = fechaQuery ? (esFechaISOValida(fechaQuery) ? fechaQuery : null) : obtenerFechaLocalISO(new Date());
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Fecha invalida.' });
    }

    obtenerSalidasPorFecha(fecha, negocioId, { origen_caja: origenCaja }, (err, data) => {
      if (err) {
        console.error('Error al obtener salidas de caja:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'No se pudieron cargar las salidas de caja.' });
      }

      res.json({
        ok: true,
        fecha,
        total: data?.total || 0,
        total_salidas: data?.total || 0,
        salidas: data?.salidas || [],
      });
    });
  });
});

const POSIUM_FACTURA_ESTADOS = new Set(['pendiente', 'pagada', 'anulada']);
const POSIUM_IMPUESTO_TIPOS = new Set(['porcentaje', 'fijo']);

const normalizarNumeroPosium = (valor, fallback = 0) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
};

const normalizarMonedaPosium = (valor) => {
  const texto = normalizarCampoTexto(valor, null);
  return texto || 'RD$';
};

const normalizarImpuestoTipoPosium = (valor) => {
  const texto = normalizarCampoTexto(valor, null);
  const tipo = texto ? texto.toLowerCase() : '';
  return POSIUM_IMPUESTO_TIPOS.has(tipo) ? tipo : 'porcentaje';
};

const normalizarEstadoFacturaPosium = (valor) => {
  const texto = normalizarCampoTexto(valor, null);
  const estado = texto ? texto.toLowerCase() : '';
  return POSIUM_FACTURA_ESTADOS.has(estado) ? estado : 'pendiente';
};

const normalizarFechaPosium = (valor) => {
  if (!valor) return new Date().toISOString().slice(0, 10);
  const texto = String(valor).slice(0, 10);
  return texto || new Date().toISOString().slice(0, 10);
};

const aplicarConfigPosium = (payload = {}, actual = {}) => ({
  cliente_nombre: normalizarCampoTexto(payload.cliente_nombre ?? actual.cliente_nombre, null),
  cliente_rnc: normalizarCampoTexto(payload.cliente_rnc ?? actual.cliente_rnc, null),
  cliente_direccion: normalizarCampoTexto(payload.cliente_direccion ?? actual.cliente_direccion, null),
  cliente_telefono: normalizarCampoTexto(payload.cliente_telefono ?? actual.cliente_telefono, null),
  cliente_email: normalizarCampoTexto(payload.cliente_email ?? actual.cliente_email, null),
  cliente_contacto: normalizarCampoTexto(payload.cliente_contacto ?? actual.cliente_contacto, null),
  emisor_nombre: normalizarCampoTexto(payload.emisor_nombre ?? actual.emisor_nombre, null),
  emisor_rnc: normalizarCampoTexto(payload.emisor_rnc ?? actual.emisor_rnc, null),
  emisor_direccion: normalizarCampoTexto(payload.emisor_direccion ?? actual.emisor_direccion, null),
  emisor_telefono: normalizarCampoTexto(payload.emisor_telefono ?? actual.emisor_telefono, null),
  emisor_email: normalizarCampoTexto(payload.emisor_email ?? actual.emisor_email, null),
  emisor_logo: normalizarCampoTexto(payload.emisor_logo ?? actual.emisor_logo, null),
  emisor_nota: normalizarCampoTexto(payload.emisor_nota ?? actual.emisor_nota, null),
  plan_nombre: normalizarCampoTexto(payload.plan_nombre ?? actual.plan_nombre, null),
  precio_base: normalizarNumeroPosium(payload.precio_base ?? actual.precio_base, 0),
  moneda: normalizarMonedaPosium(payload.moneda ?? actual.moneda),
  impuesto_tipo: normalizarImpuestoTipoPosium(payload.impuesto_tipo ?? actual.impuesto_tipo),
  impuesto_valor: normalizarNumeroPosium(payload.impuesto_valor ?? actual.impuesto_valor, 0),
  periodo_default: normalizarCampoTexto(payload.periodo_default ?? actual.periodo_default, null),
  terminos_pago: normalizarCampoTexto(payload.terminos_pago ?? actual.terminos_pago, null),
  metodo_pago: normalizarCampoTexto(payload.metodo_pago ?? actual.metodo_pago, null),
  notas_internas: normalizarCampoTexto(payload.notas_internas ?? actual.notas_internas, null),
});

app.post('/api/caja/salidas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
    const descripcion = normalizarCampoTexto(req.body?.descripcion, null);
    const monto = normalizarNumero(req.body?.monto, null);
    const fechaInput = normalizarCampoTexto(req.body?.fecha, null);
    const fecha = fechaInput ? (esFechaISOValida(fechaInput) ? fechaInput : null) : obtenerFechaLocalISO(new Date());
    const origenFallback = usuarioSesion?.rol === 'vendedor' ? 'mostrador' : 'caja';
    const origenCaja = normalizarOrigenCaja(req.body?.origen_caja ?? req.body?.origen ?? req.query?.origen, origenFallback);

    if (!descripcion) {
      return res.status(400).json({ ok: false, error: 'La descripcion es obligatoria.' });
    }

    if (monto === null || monto <= 0) {
      return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0.' });
    }

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Fecha invalida.' });
    }

    try {
      await db.run('BEGIN');

      const salidaInsert = await db.run(
        `
          INSERT INTO salidas_caja (negocio_id, fecha, descripcion, monto, metodo, origen_caja, usuario_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [negocioId, fecha, descripcion, monto, 'efectivo', origenCaja, usuarioSesion?.id || null]
      );
      const salidaId = salidaInsert?.lastID || null;
      if (!salidaId) {
        throw new Error('No se pudo registrar la salida.');
      }

      const gastoExistente = await obtenerGastoSalidaCaja(negocioId, salidaId);
      const gasto =
        gastoExistente ||
        (await crearGastoSalidaCaja({
          negocioId,
          usuarioId: usuarioSesion?.id || null,
          fecha: obtenerFechaSalidaGasto(fecha),
          monto,
          descripcion,
          salidaId,
        }));

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.status(201).json({
        ok: true,
        salida: {
          id: salidaId,
          fecha,
          descripcion,
          monto,
          metodo: 'efectivo',
        },
        gasto,
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al registrar salida de caja:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar la salida de caja.' });
    }
  });
});

app.put('/api/caja/salidas/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const salidaId = Number(req.params.id);
    if (!Number.isFinite(salidaId) || salidaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Salida invalida.' });
    }

    const descripcionInput = req.body?.descripcion;
    const montoInput = req.body?.monto;
    const fechaInput = req.body?.fecha;
    const descripcion = descripcionInput !== undefined ? normalizarCampoTexto(descripcionInput, null) : null;
    const monto = montoInput !== undefined ? normalizarNumero(montoInput, null) : null;
    const fecha = fechaInput !== undefined ? normalizarCampoTexto(fechaInput, null) : null;

    if (descripcionInput !== undefined && !descripcion) {
      return res.status(400).json({ ok: false, error: 'La descripcion es obligatoria.' });
    }

    if (montoInput !== undefined && (monto === null || monto <= 0)) {
      return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0.' });
    }

    if (fechaInput !== undefined && (!fecha || !esFechaISOValida(fecha))) {
      return res.status(400).json({ ok: false, error: 'Fecha invalida.' });
    }

    if (descripcionInput === undefined && montoInput === undefined && fechaInput === undefined) {
      return res.status(400).json({ ok: false, error: 'No hay cambios para aplicar.' });
    }

    const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
    const origenFallback = usuarioSesion?.rol === 'vendedor' ? 'mostrador' : 'caja';
    const origenCaja = normalizarOrigenCaja(req.body?.origen_caja ?? req.body?.origen ?? req.query?.origen, origenFallback);

    try {
      const params = [salidaId, negocioId];
      const filtroOrigen = construirFiltroOrigenCaja(origenCaja, params, 'origen_caja');
      const existente = await db.get(
        `SELECT id, fecha, descripcion, monto, metodo
           FROM salidas_caja
          WHERE id = ? AND negocio_id = ? AND ${filtroOrigen}
          LIMIT 1`,
        params
      );

      if (!existente) {
        return res.status(404).json({ ok: false, error: 'Salida no encontrada.' });
      }

      const fechaFinal = obtenerFechaSalidaGasto(fecha || existente.fecha);
      const descripcionFinal = descripcion ?? existente.descripcion ?? '';
      const montoFinal = monto ?? Number(existente.monto || 0);

      await db.run('BEGIN');

      const updates = [];
      const updateParams = [];
      if (descripcionInput !== undefined) {
        updates.push('descripcion = ?');
        updateParams.push(descripcionFinal);
      }
      if (montoInput !== undefined) {
        updates.push('monto = ?');
        updateParams.push(montoFinal);
      }
      if (fechaInput !== undefined) {
        updates.push('fecha = ?');
        updateParams.push(fecha);
      }

      if (updates.length) {
        updateParams.push(salidaId, negocioId);
        await db.run(
          `UPDATE salidas_caja SET ${updates.join(', ')} WHERE id = ? AND negocio_id = ?`,
          updateParams
        );
      }

      const gastoExistente = await obtenerGastoSalidaCaja(negocioId, salidaId);
      const gasto = gastoExistente
        ? await actualizarGastoSalidaCaja({
            gastoId: gastoExistente.id,
            negocioId,
            usuarioId: usuarioSesion?.id || null,
            fecha: fechaFinal,
            monto: montoFinal,
            descripcion: descripcionFinal,
            salidaId,
          })
        : await crearGastoSalidaCaja({
            negocioId,
            usuarioId: usuarioSesion?.id || null,
            fecha: fechaFinal,
            monto: montoFinal,
            descripcion: descripcionFinal,
            salidaId,
          });

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.json({
        ok: true,
        salida: {
          id: salidaId,
          fecha: fechaInput !== undefined ? fecha : existente.fecha,
          descripcion: descripcionFinal,
          monto: montoFinal,
          metodo: existente.metodo || 'efectivo',
        },
        gasto,
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al actualizar salida de caja:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar la salida de caja.' });
    }
  });
});

app.delete('/api/caja/salidas/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const salidaId = Number(req.params.id);
    if (!Number.isFinite(salidaId) || salidaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Salida invalida.' });
    }

    const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
    const origenFallback = usuarioSesion?.rol === 'vendedor' ? 'mostrador' : 'caja';
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, origenFallback);

    try {
      const params = [salidaId, negocioId];
      const filtroOrigen = construirFiltroOrigenCaja(origenCaja, params, 'origen_caja');
      const existente = await db.get(
        `SELECT id FROM salidas_caja WHERE id = ? AND negocio_id = ? AND ${filtroOrigen}`,
        params
      );
      if (!existente) {
        return res.status(404).json({ ok: false, error: 'Salida no encontrada.' });
      }

      await db.run('BEGIN');

      await db.run(
        `DELETE FROM gastos
          WHERE negocio_id = ?
            AND referencia_tipo = ?
            AND referencia_id = ?`,
        [negocioId, REFERENCIA_TIPO_SALIDA, salidaId]
      );

      await db.run(
        `DELETE FROM salidas_caja WHERE id = ? AND negocio_id = ? AND ${filtroOrigen}`,
        params
      );

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.json({ ok: true });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al eliminar salida de caja:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar la salida de caja.' });
    }
  });
});

app.get('/api/caja/resumen-dia', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const fecha = normalizarFechaOperacion(req.query?.fecha || new Date());
    const detalle = req.query?.detalle === '1';
    const modoTurno = req.query?.turno === '1';
    const soloPendientes = modoTurno || req.query?.pendientes === '1';
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');

    calcularResumenCajaPorFecha(
      fecha,
      negocioId,
      { soloPendientes, ignorarFecha: modoTurno, origen_caja: origenCaja },
      (err, resumen) => {
        if (err) {
          console.error('Error al calcular resumen de caja:', err);
          return res.status(500).json({ ok: false, error: 'No se pudo obtener el resumen diario.' });
        }

        const respuesta = {
          ok: true,
          fecha: resumen.fecha || fecha,
          total_sistema: resumen.total_sistema,
          total_general: resumen.total_general,
          total_efectivo: resumen.total_efectivo,
          total_tarjeta: resumen.total_tarjeta,
          total_transferencia: resumen.total_transferencia,
          total_salidas: resumen.total_salidas,
          total_descuentos: resumen.total_descuentos,
          cantidad_pedidos: resumen.cantidad_pedidos,
          salidas: resumen.salidas,
        };

        if (detalle) {
          respuesta.pedidos = resumen.pedidos || [];
        }

        res.json(respuesta);
      }
    );
  });
});

app.get('/api/caja/cuadre/:id/detalle', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cuentaId = Number(req.params.id);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta invalida.' });
    }

    const fecha = req.query?.fecha;
    if (fecha && !esFechaISOValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha invalida.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const origenCaja = normalizarOrigenCaja(req.query?.origen ?? req.query?.origen_caja, 'caja');
    const params = [cuentaId, cuentaId, negocioId];
    const filtroOrigen = construirFiltroOrigenCaja(origenCaja, params, 'origen_caja');
    const filtroFechaSql = fecha ? ` AND DATE(${FECHA_BASE_PEDIDOS_SQL}) = ?` : '';
    if (fecha) params.push(fecha);

    try {
      const pedidos = await db.all(
        `
          SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
                 impuesto, total, fecha_creacion, fecha_listo, fecha_cierre, cliente_documento,
                 ncf, tipo_comprobante, propina_monto, descuento_monto, comentarios
          FROM pedidos
          WHERE (cuenta_id = ? OR id = ?)
            AND estado = 'pagado'
            AND negocio_id = ?
            AND ${filtroOrigen}${filtroFechaSql}
          ORDER BY fecha_creacion ASC
        `,
        params
      );

      if (!pedidos.length) {
        return res.status(404).json({ ok: false, error: 'No se encontro detalle para esta venta.' });
      }

      const detalle = await obtenerDetallePedidosPorIds(
        pedidos.map((pedido) => pedido.id),
        negocioId
      );
      const itemsAgrupados = agruparItemsCuenta(detalle);
      const cuenta = {
        cuenta_id: pedidos[0].cuenta_id || pedidos[0].id,
        mesa: pedidos[0].mesa,
        cliente: pedidos[0].cliente,
        modo_servicio: pedidos[0].modo_servicio,
        estado: 'pagado',
        estado_cuenta: 'pagado',
        items_agregados: itemsAgrupados,
        pedidos: pedidos.map((pedido) => ({
          ...pedido,
          items: detalle.get(pedido.id) || [],
        })),
      };

      res.json({ ok: true, cuenta });
    } catch (error) {
      console.error('Error al obtener detalle del cuadre:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el detalle del cuadre.' });
    }
  });
});

const asegurarEstadoPedidoEditable = (estado) => {
  const permitidos = ['preparando', 'listo', 'pagado'];
  return permitidos.includes(estado);
};

const actualizarEstadoPedido = async ({ pedidoId, estadoDeseado, usuarioSesion, areaSolicitada }) => {
  if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
    return { ok: false, status: 400, error: 'Pedido no v\u00e1lido.' };
  }

  if (!asegurarEstadoPedidoEditable(estadoDeseado)) {
    return { ok: false, status: 400, error: 'Estado no v\u00e1lido para actualizar.' };
  }

  const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
  const areaNormalizada = normalizarAreaPreparacion(
    areaSolicitada ?? (esUsuarioBar(usuarioSesion) ? 'bar' : 'cocina')
  );

  if (estadoDeseado === 'pagado') {
    const resultadoPago = await db.run(
      `UPDATE pedidos SET estado = ?, fecha_listo = COALESCE(fecha_listo, CURRENT_TIMESTAMP) WHERE id = ? AND negocio_id = ?`,
      ['pagado', pedidoId, negocioId]
    );
    if (resultadoPago.changes === 0) {
      return { ok: false, status: 404, error: 'Pedido no encontrado.' };
    }
    try {
      await actualizarCogsPedidos([pedidoId], negocioId);
      limpiarCacheAnalitica(negocioId);
    } catch (error) {
      console.error('Error al registrar COGS del pedido:', error?.message || error);
      return { ok: false, status: 500, error: 'No se pudo registrar el costo de la venta.' };
    }
    return { ok: true, estado: 'pagado' };
  }

  if (areaNormalizada === 'bar') {
    const barActivo = await moduloActivoParaNegocio('bar', negocioId);
    if (!barActivo) {
      return { ok: false, status: 403, error: 'El m\u00f3dulo de bar est\u00e1 desactivado para este negocio.' };
    }
  }

    const pedidoActual = await db.get(
      `SELECT id, estado, modo_servicio, delivery_estado, cocinero_id, cocinero_nombre, bartender_id, bartender_nombre
         FROM pedidos
        WHERE id = ? AND negocio_id = ?`,
      [pedidoId, negocioId]
    );

  if (!pedidoActual) {
    return { ok: false, status: 404, error: 'Pedido no encontrado.' };
  }

  const detalle = await obtenerDetallePedidosPorIds([pedidoId], negocioId);
  const items = detalle.get(pedidoId) || [];
  const requiereCocina = items.some((item) => item.area_preparacion === 'cocina');
  const requiereBar = items.some((item) => item.area_preparacion === 'bar');
  const historiales = await obtenerHistorialAreasPorPedidos([pedidoId], negocioId);

  if (areaNormalizada === 'bar' && !requiereBar) {
    return { ok: false, status: 400, error: 'El pedido no tiene productos de bar.' };
  }

  if (areaNormalizada === 'cocina' && !requiereCocina) {
    return { ok: false, status: 400, error: 'El pedido no tiene productos de cocina.' };
  }

  const pedidoActualizado = {
    ...pedidoActual,
    estado: estadoDeseado === 'listo' ? 'listo' : 'preparando',
  };

  if (areaNormalizada === 'bar') {
    pedidoActualizado.bartender_id = usuarioSesion.id;
    pedidoActualizado.bartender_nombre = usuarioSesion.nombre;
  } else {
    pedidoActualizado.cocinero_id = usuarioSesion.id;
    pedidoActualizado.cocinero_nombre = usuarioSesion.nombre;
  }

  const historialesActualizados = {
    cocina: new Set(historiales.cocina || []),
    bar: new Set(historiales.bar || []),
  };

  if (estadoDeseado === 'listo') {
    if (areaNormalizada === 'bar') {
      historialesActualizados.bar.add(Number(pedidoId));
    } else {
      historialesActualizados.cocina.add(Number(pedidoId));
    }
  }

  let estadosArea = calcularEstadosAreasPedido(pedidoActualizado, items, historialesActualizados);
  const areasListas =
    (!requiereCocina || estadosArea.estadoCocina === 'listo') &&
    (!requiereBar || estadosArea.estadoBar === 'listo');

  const nuevoEstadoGlobal = estadoDeseado === 'listo' && areasListas ? 'listo' : 'preparando';
  if (pedidoActualizado.estado !== nuevoEstadoGlobal) {
    pedidoActualizado.estado = nuevoEstadoGlobal;
    estadosArea = calcularEstadosAreasPedido(pedidoActualizado, items, historialesActualizados);
  }

  const campos = ['estado = ?'];
  const valores = [nuevoEstadoGlobal];

  if (areaNormalizada === 'bar') {
    campos.push('bartender_id = ?', 'bartender_nombre = ?');
    valores.push(usuarioSesion.id, usuarioSesion.nombre);
  } else {
    campos.push('cocinero_id = ?', 'cocinero_nombre = ?');
    valores.push(usuarioSesion.id, usuarioSesion.nombre);
  }

  if (nuevoEstadoGlobal === 'listo') {
    campos.push('fecha_listo = CURRENT_TIMESTAMP');
  }

  if (nuevoEstadoGlobal === 'listo' && pedidoActual?.modo_servicio === 'delivery') {
    const estadoDeliveryActual = (pedidoActual.delivery_estado || '').toString().toLowerCase();
    if (!estadoDeliveryActual || estadoDeliveryActual === 'pendiente') {
      campos.push('delivery_estado = ?');
      valores.push('disponible');
    }
  }

  const resultado = await db.run(
    `UPDATE pedidos SET ${campos.join(', ')} WHERE id = ? AND negocio_id = ?`,
    [...valores, pedidoId, negocioId]
  );

  if (resultado.changes === 0) {
    return { ok: false, status: 404, error: 'Pedido no encontrado.' };
  }

  if (estadoDeseado === 'listo') {
    if (areaNormalizada === 'bar') {
      registrarHistorialBar(pedidoId, negocioId);
    } else {
      registrarHistorialCocina(pedidoId, negocioId);
    }
  }

  return { ok: true, estado: nuevoEstadoGlobal, ...estadosArea };
};

app.get('/api/pedidos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const estadoSolicitud = (req.query.estado || '').toString().trim().toLowerCase();
    if (!estadoSolicitud) {
      return res.status(400).json({ error: 'El estado del pedido es obligatorio.' });
    }

    if (!estadosValidos.includes(estadoSolicitud)) {
      return res.status(400).json({ error: 'Estado de pedido no valido.' });
    }

    try {
      const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
      const incluirSiAreaLista = estadoSolicitud === 'listo' && usuarioSesion?.rol === 'mesera';
      const origenQuery = req.query?.origen ?? req.query?.origen_caja;
      const opcionesConsulta = { incluirSiAreaLista };
      if (origenQuery !== undefined && origenQuery !== null && String(origenQuery).trim() !== '') {
        opcionesConsulta.origen_caja = origenQuery;
      }
      const cuentas = await obtenerCuentasPorEstados([estadoSolicitud], negocioId, opcionesConsulta);
      const cuentasFiltradas = (cuentas || []).filter(
        (cuenta) => cuenta.estadoCuentaMesera !== 'pagado'
      );
      res.json(cuentasFiltradas);
    } catch (error) {
      console.error('Error al obtener pedidos:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos.' });
    }
  });
});

app.get('/api/pedidos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const pedidoId = Number(req.params.id);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ error: 'Pedido no valido.' });
    }

    try {
      const pedido = await obtenerPedidoConDetalle(pedidoId, usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT);
      if (!pedido) {
        return res.status(404).json({ error: 'Pedido no encontrado.' });
      }
      res.json(pedido);
    } catch (error) {
      console.error('Error al obtener el detalle del pedido:', error);
      res.status(500).json({ error: 'No se pudo obtener el detalle del pedido.' });
    }
  });
});

app.get('/api/cuentas/:id/detalle', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cuentaId = Number(req.params.id);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta invalida.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const pedidos = await db.all(
        `
          SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
                 impuesto, total, fecha_creacion, fecha_listo, fecha_cierre, cocinero_id,
                 cocinero_nombre, cliente_documento, ncf, tipo_comprobante, propina_monto,
                 descuento_monto,comentarios
          FROM pedidos
          WHERE (cuenta_id = ? OR id = ?)
            AND estado = 'listo'
            AND negocio_id = ?
          ORDER BY fecha_creacion ASC
        `,
        [cuentaId, cuentaId, negocioId]
      );

      if (!pedidos.length) {
        return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
      }

      const detalle = await obtenerDetallePedidosPorIds(pedidos.map((pedido) => pedido.id), negocioId);
      const itemsAgrupados = agruparItemsCuenta(detalle);
      const cuenta = {
        cuenta_id: pedidos[0].cuenta_id || pedidos[0].id,
        mesa: pedidos[0].mesa,
        cliente: pedidos[0].cliente,
        modo_servicio: pedidos[0].modo_servicio,
        estado: 'listo',
        estado_cuenta: 'listo',
        items_agregados: itemsAgrupados,
        pedidos: pedidos.map((pedido) => ({
          ...pedido,
          items: detalle.get(pedido.id) || [],
        })),
      };

      res.json({ ok: true, cuenta });
    } catch (error) {
      console.error('Error al obtener detalle de cuenta:', error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el detalle de la cuenta.' });
    }
  });
});

app.post('/api/cuentas/:id/separar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cuentaId = Number(req.params.id);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta invalida.' });
    }

    const detallesEntrada =
      req.body?.detalle_ids ??
      req.body?.detalleIds ??
      req.body?.detalles ??
      req.body?.detalle_ids;

    if (!Array.isArray(detallesEntrada) || !detallesEntrada.length) {
      return res.status(400).json({ ok: false, error: 'Selecciona al menos un producto para separar.' });
    }

    const detalleIds = Array.from(
      new Set(
        detallesEntrada
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (!detalleIds.length) {
      return res.status(400).json({ ok: false, error: 'No se identificaron productos validos para separar.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;

    try {
      await db.run('BEGIN');

      const cuentaPagada = await db.get(
        `SELECT COUNT(1) AS total
           FROM pedidos
          WHERE (cuenta_id = ? OR id = ?)
            AND negocio_id = ?
            AND estado = 'pagado'`,
        [cuentaId, cuentaId, negocioId]
      );

      if (Number(cuentaPagada?.total || 0) > 0) {
        await db.run('ROLLBACK');
        return res
          .status(400)
          .json({ ok: false, error: 'No se puede separar una cuenta que ya fue cobrada.' });
      }

      const placeholders = detalleIds.map(() => '?').join(', ');
      const detalles = await db.all(
        `
          SELECT dp.id AS detalle_id,
                 dp.pedido_id,
                 dp.cantidad,
                 dp.precio_unitario,
                 COALESCE(dp.descuento_monto, 0) AS descuento_monto,
                 COALESCE(dp.descuento_porcentaje, 0) AS descuento_porcentaje,
                 COALESCE(dp.cantidad_descuento, 0) AS cantidad_descuento,
                 p.cuenta_id,
                 p.mesa,
                 p.cliente,
                 p.modo_servicio,
                 p.nota,
                 p.estado,
                 p.fecha_listo,
                 p.cocinero_id,
                 p.cocinero_nombre,
                 p.bartender_id,
                 p.bartender_nombre,
                 p.origen_caja,
                 p.creado_por,
                 p.subtotal AS pedido_subtotal,
                 p.impuesto AS pedido_impuesto
            FROM detalle_pedido dp
            JOIN pedidos p ON p.id = dp.pedido_id
           WHERE dp.id IN (${placeholders})
             AND dp.negocio_id = ?
             AND p.negocio_id = ?
        `,
        [...detalleIds, negocioId, negocioId]
      );

      if (!detalles || detalles.length !== detalleIds.length) {
        await db.run('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'No se encontraron todos los productos seleccionados.' });
      }

      const impuestoConfig = Number(await obtenerImpuestoConfiguradoAsync(negocioId)) || 0;
      const tasaImpuestoFallback = impuestoConfig / 100;
      const detallesPorPedido = new Map();
      const tasaPorPedido = new Map();

      for (const detalle of detalles) {
        const cuentaReferencia = Number(detalle.cuenta_id || detalle.pedido_id);
        if (cuentaReferencia !== cuentaId) {
          await db.run('ROLLBACK');
          return res
            .status(400)
            .json({ ok: false, error: 'Los productos seleccionados no pertenecen a esta cuenta.' });
        }

        if (detalle.estado === 'pagado' || detalle.estado === 'cancelado') {
          await db.run('ROLLBACK');
          return res
            .status(400)
            .json({ ok: false, error: 'No se pueden mover productos de pedidos ya cobrados o cancelados.' });
        }

        const lista = detallesPorPedido.get(detalle.pedido_id) || [];
        lista.push(detalle);
        detallesPorPedido.set(detalle.pedido_id, lista);

        if (!tasaPorPedido.has(detalle.pedido_id)) {
          const tasa = normalizarTasaImpuestoPedido(
            detalle.pedido_subtotal,
            detalle.pedido_impuesto,
            tasaImpuestoFallback
          );
          tasaPorPedido.set(detalle.pedido_id, tasa);
        }
      }

      if (!detallesPorPedido.size) {
        await db.run('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'No se pudieron preparar los productos para separar.' });
      }

      let cuentaNuevaId = null;
      const pedidoNuevoPorOrigen = new Map();
      const tasaPorPedidoNuevo = new Map();

      for (const [pedidoId, listaDetalles] of detallesPorPedido.entries()) {
        const base = listaDetalles[0];
        const insertResult = await db.run(
          `
            INSERT INTO pedidos (
              cuenta_id,
              mesa,
              cliente,
              modo_servicio,
              nota,
              estado,
              subtotal,
              impuesto,
              total,
              fecha_listo,
              cocinero_id,
              cocinero_nombre,
              bartender_id,
              bartender_nombre,
              origen_caja,
              creado_por,
              negocio_id
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            cuentaNuevaId,
            base.mesa,
            base.cliente,
            base.modo_servicio,
            base.nota,
            base.estado,
            base.fecha_listo,
            base.cocinero_id,
            base.cocinero_nombre,
            base.bartender_id,
            base.bartender_nombre,
            base.origen_caja,
            base.creado_por || usuarioSesion.id,
            negocioId,
          ]
        );

        const nuevoPedidoId = insertResult?.lastID;
        if (!nuevoPedidoId) {
          throw new Error('No se pudo crear la nueva cuenta.');
        }

        if (!cuentaNuevaId) {
          cuentaNuevaId = nuevoPedidoId;
          await db.run('UPDATE pedidos SET cuenta_id = ? WHERE id = ? AND negocio_id = ?', [
            cuentaNuevaId,
            nuevoPedidoId,
            negocioId,
          ]);
        }

        pedidoNuevoPorOrigen.set(pedidoId, nuevoPedidoId);
        const tasa = tasaPorPedido.get(pedidoId) ?? tasaImpuestoFallback;
        tasaPorPedidoNuevo.set(nuevoPedidoId, tasa);
      }

      for (const [pedidoId, listaDetalles] of detallesPorPedido.entries()) {
        const nuevoPedidoId = pedidoNuevoPorOrigen.get(pedidoId);
        const ids = listaDetalles.map((d) => d.detalle_id);
        const groupPlaceholders = ids.map(() => '?').join(', ');

        await db.run(
          `UPDATE detalle_pedido
              SET pedido_id = ?
            WHERE id IN (${groupPlaceholders})
              AND negocio_id = ?`,
          [nuevoPedidoId, ...ids, negocioId]
        );

        await db.run(
          `UPDATE consumo_insumos
              SET pedido_id = ?
            WHERE detalle_pedido_id IN (${groupPlaceholders})
              AND negocio_id = ?`,
          [nuevoPedidoId, ...ids, negocioId]
        );
      }

      const pedidosAjustar = new Set([
        ...Array.from(detallesPorPedido.keys()),
        ...Array.from(pedidoNuevoPorOrigen.values()),
      ]);

      for (const pedidoId of pedidosAjustar) {
        const tasa = tasaPorPedidoNuevo.get(pedidoId) ?? tasaPorPedido.get(pedidoId) ?? tasaImpuestoFallback;
        const resultado = await recalcularTotalesPedido(pedidoId, negocioId, tasa);
        if (resultado.cantidadDetalles === 0) {
          await db.run('DELETE FROM pedidos WHERE id = ? AND negocio_id = ?', [pedidoId, negocioId]);
        }
      }

      await db.run('COMMIT');
      return res.json({
        ok: true,
        cuenta_nueva_id: cuentaNuevaId,
        pedidos_nuevos: Array.from(pedidoNuevoPorOrigen.values()),
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al separar cuenta:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'No se pudo separar la cuenta.' });
    }
  });
});

app.post('/api/cuentas/juntar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cuentasEntrada = req.body?.cuentas ?? req.body?.cuenta_ids ?? req.body?.cuentaIds ?? [];
    const cuentaDestinoRaw = req.body?.cuenta_destino_id ?? req.body?.cuentaDestinoId ?? null;

    if (!Array.isArray(cuentasEntrada) || cuentasEntrada.length < 2) {
      return res.status(400).json({ ok: false, error: 'Debes seleccionar al menos dos cuentas para juntar.' });
    }

    const cuentaIds = Array.from(
      new Set(
        cuentasEntrada
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const cuentaDestino = Number(cuentaDestinoRaw ?? cuentaIds[0]);
    if (!Number.isFinite(cuentaDestino) || cuentaDestino <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta destino invalida.' });
    }

    if (!cuentaIds.includes(cuentaDestino)) {
      cuentaIds.unshift(cuentaDestino);
    }

    if (cuentaIds.length < 2) {
      return res.status(400).json({ ok: false, error: 'Debes seleccionar al menos dos cuentas validas.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;

    try {
      await db.run('BEGIN');
      const placeholders = cuentaIds.map(() => '?').join(', ');
      const pedidos = await db.all(
        `
          SELECT id, cuenta_id, mesa, estado
            FROM pedidos
           WHERE negocio_id = ?
             AND (cuenta_id IN (${placeholders}) OR id IN (${placeholders}))
        `,
        [negocioId, ...cuentaIds, ...cuentaIds]
      );

      if (!pedidos || pedidos.length === 0) {
        await db.run('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'No se encontraron las cuentas seleccionadas.' });
      }

      const cuentasEncontradas = new Set(
        pedidos.map((pedido) => Number(pedido.cuenta_id || pedido.id)).filter((id) => Number.isFinite(id))
      );

      const faltantes = cuentaIds.filter((id) => !cuentasEncontradas.has(id));
      if (faltantes.length) {
        await db.run('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Una o mas cuentas no existen o no pertenecen a tu negocio.' });
      }

      const tienePagados = pedidos.some((pedido) => pedido.estado === 'pagado');
      if (tienePagados) {
        await db.run('ROLLBACK');
        return res
          .status(400)
          .json({ ok: false, error: 'No se pueden juntar cuentas que ya fueron cobradas.' });
      }

      const mesasDistintas = new Set(
        pedidos
          .map((pedido) => (pedido.mesa || '').toString().trim())
          .filter((mesa) => mesa)
      );
      if (mesasDistintas.size > 1) {
        await db.run('ROLLBACK');
        return res
          .status(400)
          .json({ ok: false, error: 'No se pueden juntar cuentas de mesas diferentes.' });
      }

      await db.run(
        `
          UPDATE pedidos
             SET cuenta_id = ?
           WHERE negocio_id = ?
             AND (cuenta_id IN (${placeholders}) OR id IN (${placeholders}))
        `,
        [cuentaDestino, negocioId, ...cuentaIds, ...cuentaIds]
      );

      const pedidoIds = Array.from(new Set((pedidos || []).map((pedido) => Number(pedido.id)).filter(Boolean)));
      if (pedidoIds.length) {
        const placeholdersPedidos = pedidoIds.map(() => '?').join(', ');
        await db.run(
          `UPDATE historial_cocina SET cuenta_id = ? WHERE pedido_id IN (${placeholdersPedidos}) AND negocio_id = ?`,
          [cuentaDestino, ...pedidoIds, negocioId]
        );
        await db.run(
          `UPDATE historial_bar SET cuenta_id = ? WHERE pedido_id IN (${placeholdersPedidos}) AND negocio_id = ?`,
          [cuentaDestino, ...pedidoIds, negocioId]
        );
      }

      await db.run('COMMIT');
      return res.json({ ok: true, cuenta_id: cuentaDestino });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al juntar cuentas:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'No se pudo juntar las cuentas.' });
    }
  });
});

app.put('/api/cuentas/:id/cerrar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cuentaId = Number(req.params.id);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta invalida.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const pedidos = await db.all(
        `
          SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
                 impuesto, total, fecha_creacion, fecha_listo, fecha_cierre, cocinero_id,
                 cocinero_nombre, cliente_documento, ncf, tipo_comprobante, propina_monto,
                 descuento_monto, comentarios, negocio_id
          FROM pedidos
          WHERE (cuenta_id = ? OR id = ?)
            AND estado = 'listo'
            AND negocio_id = ?
          ORDER BY fecha_creacion ASC
        `,
        [cuentaId, cuentaId, negocioId]
      );

      if (!pedidos.length) {
        return res.status(404).json({ ok: false, error: 'No hay pedidos listos para esta cuenta.' });
      }

      const payload = {
        ...req.body,
        usuario_id: req.body?.usuario_id || usuarioSesion.id,
        usuario_rol: req.body?.usuario_rol || usuarioSesion.rol,
        negocio_id: negocioId,
      };

      cerrarCuentaYRegistrarPago(pedidos, payload, (err, resultado) => {
        if (err) {
          const status = err.status || 500;
          return res.status(status).json({ ok: false, error: err.message || 'No se pudo cerrar la cuenta.' });
        }

        res.json({
          ok: true,
          factura: resultado?.factura || null,
          totales: resultado?.totales || null,
          cliente: resultado?.cliente || null,
        });
      });
    } catch (error) {
      console.error('Error al cerrar la cuenta:', error);
      res.status(500).json({ ok: false, error: 'No se pudo cerrar la cuenta.' });
    }
  });
});

app.post('/api/pedidos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const payload = req.body || {};
    const itemsEntrada = Array.isArray(payload.items) ? payload.items : [];

    if (!itemsEntrada.length) {
      return res.status(400).json({ error: 'Agrega al menos un producto al pedido.' });
    }

    const modoInventario = await obtenerModoInventarioCostos(negocioId);
    const usaRecetas = modoInventario === 'PREPARACION';
    const bloquearInsumosSinStock = usaRecetas ? await obtenerConfigBloqueoInsumos(negocioId) : false;
    const advertenciasInsumos = [];

    const modoServicio = limpiarTextoGeneral(payload.modo_servicio) || 'en_local';
    const destino = (payload.destino || 'cocina').toString().trim().toLowerCase();
    const esParaCaja = destino === 'caja';
    const mesa = limpiarTextoGeneral(payload.mesa);
    const cliente = limpiarTextoGeneral(payload.cliente);
    const nota = limpiarTextoGeneral(payload.nota);
    const deliveryPayload = payload.delivery && typeof payload.delivery === 'object' ? payload.delivery : {};
    const deliveryTelefono = limpiarTextoGeneral(
      deliveryPayload.telefono ?? payload.delivery_telefono ?? payload.deliveryTelefono ?? payload.telefono_delivery
    );
    const deliveryDireccion = limpiarTextoGeneral(
      deliveryPayload.direccion ?? payload.delivery_direccion ?? payload.deliveryDireccion
    );
    const deliveryReferencia = limpiarTextoGeneral(
      deliveryPayload.referencia ?? payload.delivery_referencia ?? payload.deliveryReferencia
    );
    const deliveryNotas = limpiarTextoGeneral(
      deliveryPayload.notas ?? deliveryPayload.nota ?? payload.delivery_notas ?? payload.deliveryNotas
    );
    const omitirPreparacion =
      normalizarFlag(
        deliveryPayload.omitir_preparacion ??
          payload.omitir_preparacion ??
          payload.delivery_directo ??
          payload.directo,
        0
      ) === 1;
      const esDelivery = modoServicio === 'delivery';
    const cuentaReferencia = payload.cuenta_id ?? payload.cuentaId ?? null;
    const origenFallback = usuarioSesion?.rol === 'vendedor' ? 'mostrador' : 'caja';
    const origenCaja = normalizarOrigenCaja(payload.origen_caja ?? payload.origen, origenFallback);

    const itemsProcesados = [];

    try {
      for (const item of itemsEntrada) {
        const productoId = Number(item?.producto_id);
        const cantidad = Number(item?.cantidad);
        if (!Number.isFinite(productoId) || productoId <= 0) {
          return res.status(400).json({ error: 'Hay un producto invalido en el pedido.' });
        }
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          return res.status(400).json({ error: 'Todas las cantidades deben ser mayores a cero.' });
        }

        const producto = await db.get(
          `SELECT p.id, p.nombre, p.precio, p.precios, p.stock, p.stock_indefinido,
                  p.tipo_producto, p.insumo_vendible, p.unidad_base, p.contenido_por_unidad,
                  COALESCE(c.area_preparacion, 'ninguna') AS area_preparacion
           FROM productos p
           LEFT JOIN categorias c ON c.id = p.categoria_id
           WHERE p.id = ? AND p.negocio_id = ?`,
          [productoId, negocioId]
        );

        if (!producto) {
          return res.status(404).json({ error: `Producto ${productoId} no encontrado.` });
        }

        const tipoProducto = normalizarTipoProducto(producto.tipo_producto, 'FINAL');
        const esInsumo = tipoProducto === 'INSUMO';
        const insumoVendible = normalizarFlag(producto.insumo_vendible, 0) === 1;
        if (usaRecetas && esInsumo && !insumoVendible) {
          return res.status(400).json({
            error: `El producto ${producto.nombre || productoId} es un insumo no vendible.`,
          });
        }

        const stockIndefinido = esStockIndefinido(producto);
        if (!stockIndefinido) {
          const stockDisponible = Number(producto.stock) || 0;
          if (cantidad > stockDisponible) {
            return res
              .status(400)
              .json({ error: `Stock insuficiente para ${producto.nombre || `el producto ${productoId}`}.` });
          }
        }

        const opcionesPrecio = construirOpcionesPrecioProducto(producto);
        const precioSolicitadoRaw = item?.precio_unitario ?? item?.precioUnitario ?? null;
        let precioUnitario = opcionesPrecio.length ? opcionesPrecio[0].valor : 0;
        if (precioSolicitadoRaw !== null && precioSolicitadoRaw !== undefined && precioSolicitadoRaw !== '') {
          const precioSolicitado = normalizarNumero(precioSolicitadoRaw, null);
          if (precioSolicitado === null || precioSolicitado < 0) {
            return res.status(400).json({ error: `Precio invalido para ${producto.nombre || productoId}.` });
          }
          const precioRedondeado = Number(precioSolicitado.toFixed(2));
          const permitido = opcionesPrecio.some(
            (opcion) => Number(opcion.valor).toFixed(2) === precioRedondeado.toFixed(2)
          );
          if (!permitido) {
            return res
              .status(400)
              .json({ error: `Precio no permitido para ${producto.nombre || productoId}.` });
          }
          precioUnitario = precioRedondeado;
        }

        itemsProcesados.push({
          producto_id: producto.id,
          cantidad,
          precio_unitario: precioUnitario,
          nombre: producto.nombre,
          stock_indefinido: stockIndefinido ? 1 : 0,
          area_preparacion: normalizarAreaPreparacion(producto.area_preparacion),
          tipo_producto: tipoProducto,
          insumo_vendible: insumoVendible ? 1 : 0,
          unidad_base: normalizarUnidadBase(producto.unidad_base, 'UND'),
          contenido_por_unidad: normalizarContenidoPorUnidad(producto.contenido_por_unidad, 1),
        });
      }

      const productoIds = itemsProcesados
        .map((item) => Number(item.producto_id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const recetasMap = usaRecetas ? await obtenerRecetasPorProductos(productoIds, negocioId) : new Map();
      const insumosMap = new Map();
      const consumoPorInsumo = new Map();

      if (usaRecetas && recetasMap.size > 0) {
        for (const item of itemsProcesados) {
          const receta = recetasMap.get(Number(item.producto_id));
          if (!Array.isArray(receta) || receta.length === 0) {
            continue;
          }
          item.consumos = [];
          for (const detalle of receta) {
            if (detalle.tipo_producto !== 'INSUMO') {
              return res.status(400).json({
                error: `La receta de ${item.nombre || item.producto_id} tiene insumos invalidos.`,
              });
            }
            const cantidadBase = Number((item.cantidad * (Number(detalle.cantidad) || 0)).toFixed(4));
            if (!cantidadBase) {
              continue;
            }
            const contenido = normalizarContenidoPorUnidad(detalle.contenido_por_unidad, 1);
            const cantidadUnidades = contenido > 0 ? Number((cantidadBase / contenido).toFixed(4)) : 0;
            item.consumos.push({
              insumo_id: Number(detalle.insumo_id),
              cantidad_base: cantidadBase,
              cantidad_unidades: cantidadUnidades,
              unidad_base: detalle.unidad_base,
            });
            const acumulado = consumoPorInsumo.get(detalle.insumo_id) || 0;
            consumoPorInsumo.set(detalle.insumo_id, Number((acumulado + cantidadUnidades).toFixed(4)));
            if (!insumosMap.has(detalle.insumo_id)) {
              insumosMap.set(detalle.insumo_id, detalle);
            }
          }
        }

        for (const [insumoId, cantidadRequerida] of consumoPorInsumo.entries()) {
          if (!cantidadRequerida) continue;
          const insumo = insumosMap.get(insumoId);
          if (!insumo || esStockIndefinido(insumo)) {
            continue;
          }
          const stockDisponible = Number(insumo.stock) || 0;
          if (cantidadRequerida > stockDisponible) {
            const mensaje = `Stock insuficiente para insumo ${insumo.insumo_nombre || insumoId}.`;
            if (bloquearInsumosSinStock) {
              return res.status(400).json({ error: mensaje });
            }
            advertenciasInsumos.push(mensaje);
          }
        }
      }

      const tienePreparacion = itemsProcesados.some(
        (item) => item.area_preparacion === 'cocina' || item.area_preparacion === 'bar'
      );
      const subtotalBruto = itemsProcesados.reduce(
        (acc, item) => acc + (Number(item.precio_unitario) || 0) * item.cantidad,
        0
      );
      const configImpuesto = await obtenerConfiguracionImpuestoNegocio(negocioId);
      const totalesPedido = calcularTotalesConImpuestoConfigurado(subtotalBruto, configImpuesto);
      const subtotal = totalesPedido.subtotal;
      const impuesto = totalesPedido.impuesto;
      const total = totalesPedido.total;
        const omitirPreparacionEntrega = esDelivery && omitirPreparacion;
        const marcarListo = esParaCaja || omitirPreparacionEntrega || !tienePreparacion;
        const estadoInicial = marcarListo ? 'listo' : 'pendiente';
        const fechaListo = marcarListo ? new Date() : null;
        const deliveryEstadoInicial = esDelivery ? (marcarListo ? 'disponible' : 'pendiente') : null;

      await db.run('BEGIN');

      const consumoRegistros = [];

      const insertResult = await db.run(
        `
            INSERT INTO pedidos (
              cuenta_id, mesa, cliente, modo_servicio, nota, estado,
              subtotal, impuesto, total, fecha_listo, origen_caja, creado_por, negocio_id,
              delivery_estado, delivery_telefono, delivery_direccion, delivery_referencia, delivery_notas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            cuentaReferencia,
            mesa,
            cliente,
            modoServicio,
            nota,
            estadoInicial,
            subtotal,
            impuesto,
            total,
            fechaListo,
            origenCaja,
            usuarioSesion.id,
            negocioId,
            deliveryEstadoInicial,
            deliveryTelefono,
            deliveryDireccion,
            deliveryReferencia,
            deliveryNotas,
          ]
        );

      const pedidoId = insertResult.lastID;
      const cuentaAsignada = cuentaReferencia || pedidoId;

      if (!cuentaReferencia) {
        await db.run(
          'UPDATE pedidos SET cuenta_id = ? WHERE id = ? AND negocio_id = ?',
          [cuentaAsignada, pedidoId, negocioId]
        );
      }

      for (const item of itemsProcesados) {
        const detalleResult = await db.run(
          'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, negocio_id) VALUES (?, ?, ?, ?, ?)',
          [pedidoId, item.producto_id, item.cantidad, item.precio_unitario, negocioId]
        );
        const detalleId = detalleResult?.lastID;
        if (detalleId && Array.isArray(item.consumos) && item.consumos.length) {
          item.consumos.forEach((consumo) => {
            consumoRegistros.push({
              detalle_pedido_id: detalleId,
              producto_final_id: item.producto_id,
              insumo_id: consumo.insumo_id,
              cantidad_base: consumo.cantidad_base,
              unidad_base: consumo.unidad_base,
            });
          });
        }
        if (!item.stock_indefinido) {
          const stockResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
            [item.cantidad, item.producto_id, negocioId, item.cantidad]
          );
          if (stockResult.changes === 0) {
            throw new Error(`No se pudo actualizar el stock del producto ${item.producto_id}.`);
          }
        }
      }

      if (usaRecetas && consumoPorInsumo.size > 0) {
        for (const [insumoId, cantidadUnidades] of consumoPorInsumo.entries()) {
          if (!cantidadUnidades) continue;
          const insumo = insumosMap.get(insumoId);
          if (!insumo || esStockIndefinido(insumo)) {
            continue;
          }
          const stockResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
            [cantidadUnidades, insumoId, negocioId, cantidadUnidades]
          );
          if (stockResult.changes === 0) {
            throw new Error(`No se pudo actualizar el stock del insumo ${insumoId}.`);
          }
        }
        for (const consumo of consumoRegistros) {
          await db.run(
            `INSERT INTO consumo_insumos
              (pedido_id, detalle_pedido_id, producto_final_id, insumo_id, cantidad_base, unidad_base, negocio_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              pedidoId,
              consumo.detalle_pedido_id,
              consumo.producto_final_id,
              consumo.insumo_id,
              consumo.cantidad_base,
              consumo.unidad_base,
              negocioId,
            ]
          );
        }
      }

      await db.run('COMMIT');

      return res.status(201).json({
        ok: true,
          pedido: {
            id: pedidoId,
            cuenta_id: cuentaAsignada,
            estado: estadoInicial,
            subtotal,
            impuesto,
            total,
            modo_servicio: modoServicio,
            mesa,
            cliente,
            nota,
            delivery_estado: deliveryEstadoInicial,
            delivery_telefono: deliveryTelefono,
            delivery_direccion: deliveryDireccion,
            delivery_referencia: deliveryReferencia,
            delivery_notas: deliveryNotas,
            fecha_listo: fechaListo,
            items: itemsProcesados,
          },
        advertencias: advertenciasInsumos.length ? advertenciasInsumos : undefined,
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al crear pedido:', error);
      if (error.message?.toLowerCase().includes('stock')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'No se pudo procesar el pedido.' });
    }
  });
});

app.put('/api/pedidos/:id/estado', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioCocina(usuarioSesion) && !esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.params.id);
    const estadoDeseado = (req.body?.estado || '').toString().trim().toLowerCase();
    const areaSolicitada = req.body?.area_preparacion ?? req.body?.areaPreparacion;

    const resultado = await actualizarEstadoPedido({
      pedidoId,
      estadoDeseado,
      usuarioSesion,
      areaSolicitada,
    });

    if (!resultado.ok) {
      const statusCode = resultado.status || 500;
      return res.status(statusCode).json({ error: resultado.error || 'No se pudo actualizar el pedido.' });
    }

    res.json({ ok: true, estado: resultado.estado });
  });
});

  app.put('/api/pedidos/:id/cancelar', (req, res) => {
    requireUsuarioSesion(req, res, async (usuarioSesion) => {
      const pedidoId = Number(req.params.id);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ error: 'Pedido no valido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const pedido = await db.get(
      'SELECT estado FROM pedidos WHERE id = ? AND negocio_id = ?',
      [pedidoId, negocioId]
    );

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    if (pedido.estado === 'cancelado') {
      return res.status(400).json({ error: 'El pedido ya esta cancelado.' });
    }

    try {
      await db.run('BEGIN');
        await db.run(
          "UPDATE pedidos SET estado = ?, delivery_estado = CASE WHEN modo_servicio = 'delivery' THEN 'cancelado' ELSE delivery_estado END WHERE id = ? AND negocio_id = ?",
          ['cancelado', pedidoId, negocioId]
        );
      await ajustarStockPorPedido(pedidoId, negocioId, 1);
      await revertirConsumoInsumosPorPedido(pedidoId, negocioId);
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al cancelar el pedido:', error);
      return res.status(500).json({ error: 'No se pudo cancelar el pedido.' });
    }

    res.json({ ok: true });
  });
});

app.get('/api/pedidos/:id/factura', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const pedidoId = Number(req.params.id);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ error: 'Pedido no valido.' });
    }

    try {
      const factura = await construirFacturaDesdePedido(pedidoId, usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT);
      if (!factura) {
        return res.status(404).json({ error: 'Pedido no encontrado.' });
      }
      res.json({ ok: true, ...factura });
    } catch (error) {
      console.error('Error al obtener la factura:', error);
      res.status(500).json({ error: 'No se pudo cargar la factura.' });
    }
  });
});

app.get('/api/cocina/pedidos-activos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioCocina(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    try {
      const cuentas = await obtenerCuentasPorEstados(
        ['pendiente', 'preparando'],
        usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT,
        { area_preparacion: 'cocina' }
      );
      res.json(cuentas);
    } catch (error) {
      console.error('Error al obtener pedidos activos de cocina:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos activos.' });
    }
  });
});

app.get('/api/cocina/pedidos-finalizados', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioCocina(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    try {
      const cuentas = await obtenerCuentasPorEstados(
        ['listo', 'pagado', 'cancelado'],
        usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT,
        { area_preparacion: 'cocina', hoy: true }
      );
      res.json(cuentas);
    } catch (error) {
      console.error('Error al obtener pedidos finalizados de cocina:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos finalizados.' });
    }
  });
});

app.get('/api/bar/pedidos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const barActivo = await moduloActivoParaNegocio('bar', negocioId);
    if (!barActivo) {
      console.warn('Modulo de bar desactivado, devolviendo lista vacia para pedidos activos.');
      return res.json([]);
    }

    try {
      const cuentas = await obtenerCuentasPorEstados(
        ['pendiente', 'preparando'],
        negocioId,
        { area_preparacion: 'bar' }
      );
      res.json(cuentas);
    } catch (error) {
      console.error('Error al obtener pedidos de bar:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos de bar.' });
    }
  });
});

app.get('/api/bar/pedidos-finalizados', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const barActivo = await moduloActivoParaNegocio('bar', negocioId);
    if (!barActivo) {
      console.warn('Modulo de bar desactivado, devolviendo lista vacia para pedidos finalizados.');
      return res.json([]);
    }

    try {
      const cuentas = await obtenerCuentasPorEstados(
        ['listo', 'pagado', 'cancelado'],
        negocioId,
        { area_preparacion: 'bar', hoy: true }
      );
      res.json(cuentas);
    } catch (error) {
      console.error('Error al obtener pedidos finalizados de bar:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos de bar.' });
    }
  });
});

app.post('/api/bar/marcar-en-preparacion', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.body?.pedido_id ?? req.body?.pedidoId);
    const resultado = await actualizarEstadoPedido({
      pedidoId,
      estadoDeseado: 'preparando',
      usuarioSesion,
      areaSolicitada: 'bar',
    });

    if (!resultado.ok) {
      const statusCode = resultado.status || 500;
      return res.status(statusCode).json({ error: resultado.error || 'No se pudo actualizar el pedido.' });
    }

    res.json({ ok: true, estado: resultado.estado });
  });
});

app.post('/api/bar/marcar-listo', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.body?.pedido_id ?? req.body?.pedidoId);
    const resultado = await actualizarEstadoPedido({
      pedidoId,
      estadoDeseado: 'listo',
      usuarioSesion,
      areaSolicitada: 'bar',
    });

    if (!resultado.ok) {
      const statusCode = resultado.status || 500;
      return res.status(statusCode).json({ error: resultado.error || 'No se pudo actualizar el pedido.' });
    }

    res.json({ ok: true, estado: resultado.estado });
  });
});

  // Gesti?n de usuarios (solo roles operativos)
  app.get('/api/usuarios', (req, res) => {
    requireUsuarioSesion(req, res, async (usuarioSesion) => {
      if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido' });
    }

    const { rol, negocio_id: negocioFiltro } = req.query;
    const rolSolicitado = (rol || '').toString().trim();
    const puedeVerSupervisores = puedeGestionarSupervisores(usuarioSesion);
    const puedeVerEmpresa = esSuperAdmin(usuarioSesion);
    if (rolSolicitado === 'supervisor' && !puedeVerSupervisores) {
      return res.status(403).json({ error: 'Acceso restringido' });
    }
    if (rolSolicitado === 'empresa' && !puedeVerEmpresa) {
      return res.status(403).json({ error: 'Acceso restringido' });
    }
    const filtroRol = rolSolicitado && usuarioRolesPermitidos.includes(rolSolicitado) ? rolSolicitado : undefined;
    const esSuper = esSuperAdmin(usuarioSesion);
    const negocioId = esSuper && negocioFiltro ? Number(negocioFiltro) || null : usuarioSesion.negocio_id;
    const incluirTodos = esSuper && !negocioFiltro;

      try {
        const rows = await usuariosRepo.getAll({
          rol: filtroRol,
          soloActivos: false,
          negocioId,
          incluirTodosNegocios: incluirTodos,
        });
        let usuarios = rows || [];
        if (!puedeVerSupervisores) {
          usuarios = usuarios.filter((usuario) => usuario.rol !== 'supervisor');
        }
        if (!puedeVerEmpresa) {
          usuarios = usuarios.filter((usuario) => usuario.rol !== 'empresa');
        }
        if (esUsuarioSupervisor(usuarioSesion)) {
          usuarios = usuarios.filter((usuario) => usuario.rol !== 'admin');
        }
        if (!usuarios.length) {
          return res.json([]);
        }

        const ids = usuarios
          .map((usuario) => Number(usuario.id))
          .filter((id) => Number.isInteger(id) && id > 0);

        if (!ids.length) {
          return res.json(usuarios);
        }

        const placeholders = ids.map(() => '?').join(', ');
        const activeSql = `
          SELECT usuario_id, creado_en, ultimo_uso
          FROM sesiones_usuarios
          WHERE usuario_id IN (${placeholders})
            AND cerrado_en IS NULL
            AND DATE_ADD(creado_en, INTERVAL ${SESSION_EXPIRATION_HOURS} HOUR) > CURRENT_TIMESTAMP
        `;
        const lastSql = `
          SELECT s.usuario_id, s.creado_en, s.ultimo_uso, s.cerrado_en
          FROM sesiones_usuarios s
          JOIN (
            SELECT usuario_id, MAX(id) AS max_id
            FROM sesiones_usuarios
            WHERE usuario_id IN (${placeholders})
            GROUP BY usuario_id
          ) ult ON s.id = ult.max_id
        `;

        const [activeRows, lastRows] = await Promise.all([
          db.all(activeSql, ids),
          db.all(lastSql, ids),
        ]);

        const activeMap = new Map();
        (activeRows || []).forEach((row) => {
          const key = Number(row.usuario_id);
          if (!key) return;
          const current = activeMap.get(key);
          if (!current) {
            activeMap.set(key, row);
            return;
          }
          const currentDate = current?.creado_en ? new Date(current.creado_en) : null;
          const nextDate = row?.creado_en ? new Date(row.creado_en) : null;
          if (!currentDate || (nextDate && nextDate > currentDate)) {
            activeMap.set(key, row);
          }
        });

        const lastMap = new Map();
        (lastRows || []).forEach((row) => {
          const key = Number(row.usuario_id);
          if (!key) return;
          lastMap.set(key, row);
        });

        const resultado = usuarios.map((usuario) => {
          const id = Number(usuario.id);
          const active = activeMap.get(id) || null;
          const last = lastMap.get(id) || null;
          const enLinea = Boolean(active);
          const conectadoEn = active?.creado_en || last?.creado_en || null;
          const desconectadoEn = enLinea ? null : last?.cerrado_en || last?.ultimo_uso || null;
          return {
            ...usuario,
            en_linea: enLinea,
            conectado_en: conectadoEn,
            desconectado_en: desconectadoEn,
          };
        });

        res.json(resultado);
      } catch (err) {
        console.error('Error al obtener usuarios:', err?.message || err);
        res.status(500).json({ error: 'Error al obtener usuarios' });
      }
    });
});

// Gestion de negocios (solo super admin)
app.get('/api/negocios', (req, res) => {
  requireSuperAdmin(req, res, () => {
    const sql = `
      SELECT n.id, n.nombre, n.slug, n.rnc, n.telefono, n.direccion, n.color_primario, n.color_secundario,
             n.color_texto, n.color_header, n.color_boton_primario, n.color_boton_secundario, n.color_boton_peligro,
             n.config_modulos, n.admin_principal_correo, n.admin_principal_usuario_id, n.empresa_id,
             e.nombre AS empresa_nombre,
             u.usuario AS admin_principal_usuario,
             n.logo_url, n.titulo_sistema, n.activo, n.suspendido, n.deleted_at, n.motivo_suspension, n.updated_at,
             n.creado_en
        FROM negocios n
        LEFT JOIN usuarios u ON u.id = n.admin_principal_usuario_id
        LEFT JOIN empresas e ON e.id = n.empresa_id
       WHERE n.deleted_at IS NULL
       ORDER BY n.id ASC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('Error al listar negocios:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudieron obtener los negocios' });
      }
      const negocios = (rows || []).map((row) => mapNegocioWithDefaults(row));
      res.json({ ok: true, negocios });
    });
  });
});

app.get('/api/admin/registros-solicitudes', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const estadoFiltro = normalizarCampoTexto(req.query?.estado)?.toLowerCase() || null;
    const busqueda = normalizarCampoTexto(req.query?.q)?.toLowerCase() || null;
    const where = [];
    const params = [];

    if (estadoFiltro) {
      where.push('estado = ?');
      params.push(estadoFiltro);
    }

    if (busqueda) {
      where.push(
        `(LOWER(codigo) LIKE ? OR LOWER(negocio_nombre) LIKE ? OR LOWER(admin_nombre) LIKE ? OR LOWER(admin_usuario) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ? OR LOWER(COALESCE(telefono, '')) LIKE ?)`
      );
      const pattern = `%${busqueda}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    const sql = `
      SELECT *
        FROM registro_solicitudes
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC
       LIMIT 500
    `;

    try {
      const rows = await db.all(sql, params);
      const registros = (rows || []).map((row) => mapRegistroSolicitud(row));
      res.json({ ok: true, registros });
    } catch (error) {
      console.error('Error cargando solicitudes de registro:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar las solicitudes de registro.' });
    }
  });
});

app.patch('/api/admin/registros-solicitudes/:id', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de solicitud invalido.' });
    }

    const payload = req.body || {};
    const estado = normalizarCampoTexto(payload.estado)?.toLowerCase() || null;
    const notasInternas = normalizarCampoTexto(payload.notas_internas ?? payload.notasInternas);
    const fields = [];
    const params = [];

    if (estado !== null) {
      if (!REGISTRO_ESTADOS_VALIDOS.has(estado)) {
        return res.status(400).json({ ok: false, error: 'Estado de solicitud invalido.' });
      }
      fields.push('estado = ?');
      params.push(estado);
    }

    if (payload.notas_internas !== undefined || payload.notasInternas !== undefined) {
      fields.push('notas_internas = ?');
      params.push(notasInternas);
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'No hay campos para actualizar.' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    try {
      const result = await db.run(`UPDATE registro_solicitudes SET ${fields.join(', ')} WHERE id = ?`, params);
      let row = await db.get('SELECT * FROM registro_solicitudes WHERE id = ? LIMIT 1', [id]);
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
      }

      if ((row.estado || '').toLowerCase() === 'aprobado' && !row.negocio_id) {
        try {
          row = await materializarSolicitudRegistroPendiente(row);
        } catch (materializarError) {
          return res.status(409).json({
            ok: false,
            error:
              materializarError?.message ||
              'La solicitud fue actualizada, pero no se pudo crear automaticamente el negocio.',
          });
        }
      }

      res.json({ ok: true, solicitud: mapRegistroSolicitud(row || {}) });
    } catch (error) {
      console.error('Error actualizando solicitud de registro:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar la solicitud.' });
    }
  });
});

app.post('/api/admin/registros-solicitudes/:id/reenviar-correo', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de solicitud invalido.' });
    }

    try {
      const row = await db.get('SELECT * FROM registro_solicitudes WHERE id = ? LIMIT 1', [id]);
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
      }

      const registro = mapRegistroSolicitud(row);
      const correoResultado = await enviarCorreoRegistroSolicitud(registro);
      await db.run(
        'UPDATE registro_solicitudes SET correo_enviado = ?, correo_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [correoResultado.enviado ? 1 : 0, correoResultado.error || null, id]
      );

      const actualizado = await db.get('SELECT * FROM registro_solicitudes WHERE id = ? LIMIT 1', [id]);
      return res.json({
        ok: true,
        solicitud: mapRegistroSolicitud(actualizado || {}),
        correo: { enviado: correoResultado.enviado, error: correoResultado.error || null },
      });
    } catch (error) {
      console.error('Error reenviando correo de solicitud:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'No se pudo reenviar el correo de la solicitud.' });
    }
  });
});

app.post('/api/negocios', (req, res) => {
  requireSuperAdmin(req, res, () => {
    const payload = req.body || {};
    const slug = (payload.slug || '').toString().trim().toLowerCase();
    const nombre =
      normalizarCampoTexto(payload.nombre, null) || normalizarCampoTexto(payload.titulo_sistema ?? payload.tituloSistema, null);
    const tituloSistema = normalizarCampoTexto(payload.titulo_sistema ?? payload.tituloSistema, null) || nombre;
    const colorPrimario = normalizarCampoTexto(payload.color_primario ?? payload.colorPrimario, null);
    const colorSecundario = normalizarCampoTexto(payload.color_secundario ?? payload.colorSecundario, null);
    const colorTexto = normalizarCampoTexto(payload.color_texto ?? payload.colorTexto, null) || DEFAULT_COLOR_TEXTO;
    const colorHeaderInput = normalizarCampoTexto(payload.color_header ?? payload.colorHeader, null);
    const colorBotonPrimarioInput = normalizarCampoTexto(payload.color_boton_primario ?? payload.colorBotonPrimario, null);
    const colorBotonSecundarioInput = normalizarCampoTexto(payload.color_boton_secundario ?? payload.colorBotonSecundario, null);
    const colorBotonPeligro = normalizarCampoTexto(payload.color_boton_peligro ?? payload.colorBotonPeligro, null) || DEFAULT_COLOR_PELIGRO;
    const colorHeader = colorHeaderInput || colorPrimario || colorSecundario || null;
    const colorBotonPrimario = colorBotonPrimarioInput || colorPrimario || null;
    const colorBotonSecundario = colorBotonSecundarioInput || colorSecundario || null;
    const configModulosJson = stringifyConfigModulos(payload.config_modulos ?? payload.configModulos);
    const adminPrincipalUsuarioIdRaw = payload.admin_principal_usuario_id ?? payload.adminPrincipalUsuarioId;
    const adminPrincipalUsuarioId =
      adminPrincipalUsuarioIdRaw === undefined || adminPrincipalUsuarioIdRaw === null
        ? null
        : Number(adminPrincipalUsuarioIdRaw);
    const adminPrincipalUsuarioIdFinal = Number.isFinite(adminPrincipalUsuarioId) ? adminPrincipalUsuarioId : null;
    const logoUrl = normalizarCampoTexto(payload.logo_url ?? payload.logoUrl, null);
    const rnc = normalizarCampoTexto(payload.rnc, null);
    const telefono = normalizarCampoTexto(payload.telefono ?? payload.telefonoNegocio, null);
    const direccion = normalizarCampoTexto(payload.direccion ?? payload.direccionNegocio, null);
    const activo = payload.activo === 0 || payload.activo === false ? 0 : 1;
    const empresaNombre = normalizarCampoTexto(payload.empresa_nombre ?? payload.empresaNombre, null);
    const empresaIdProvided = payload.empresa_id ?? payload.empresaId;
    const adminPrincipalCorreo = normalizarCampoTexto(payload.adminPrincipalCorreo, null);
    const adminPrincipalUsuario =
      normalizarCampoTexto(payload.adminPrincipalUsuario, null) || normalizarCampoTexto(payload.admin_usuario, null);
    const adminPrincipalPassword = payload.adminPrincipalPassword || payload.admin_password || payload.adminPassword;
    const tieneSucursales = normalizarFlag(
      payload.tiene_sucursales ?? payload.tieneSucursales,
      0
    );

    if (!slug) {
      return res.status(400).json({ ok: false, error: 'El slug es obligatorio' });
    }
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre del negocio es obligatorio' });
    }
    db.get(
      'SELECT id, deleted_at FROM negocios WHERE slug = ? LIMIT 1',
      [slug],
      async (slugErr, existente) => {
      if (slugErr) {
        console.error('Error al validar slug de negocio:', slugErr.message);
        return res.status(500).json({ ok: false, error: 'No se pudo validar el slug' });
      }

        if (existente && !existente.deleted_at) {
          return res.status(400).json({ ok: false, error: 'Ya existe un negocio con ese slug' });
        }
        if (existente && existente.deleted_at) {
          try {
            await eliminarNegocioCompleto({ negocioId: existente.id });
          } catch (error) {
            console.warn('No se pudo eliminar definitivamente el negocio con slug repetido:', error?.message || error);
            return res.status(400).json({
              ok: false,
              error: 'Existe un negocio eliminado con ese slug. No se pudo eliminar definitivamente.',
            });
          }
        }

      const empresaNombreFinal = empresaNombre || nombre;
      const empresaIdFinal =
        (await resolverEmpresaId({ empresaId: empresaIdProvided, empresaNombre: empresaNombreFinal })) || 1;
      if (tieneSucursales && !adminPrincipalUsuario) {
        const empresaUsuarioExistente = await db.get(
          `SELECT id
             FROM usuarios
            WHERE rol = 'empresa'
              AND empresa_id = ?
            LIMIT 1`,
          [empresaIdFinal]
        );
        if (!empresaUsuarioExistente) {
          return res.status(400).json({ ok: false, error: 'El usuario empresa es obligatorio' });
        }
      }
      const insertSql = `
        INSERT INTO negocios ({{columns}})
        VALUES ({{placeholders}})
      `;

      const reusableId = await obtenerNegocioIdReutilizable();
      const usarIdReutilizable = Number.isFinite(reusableId) && reusableId > 0;
      const columns = [
        ...(usarIdReutilizable ? ['id'] : []),
        'nombre',
        'slug',
        'rnc',
        'telefono',
        'direccion',
        'color_primario',
        'color_secundario',
        'color_texto',
        'color_header',
        'color_boton_primario',
        'color_boton_secundario',
        'color_boton_peligro',
        'config_modulos',
        'admin_principal_correo',
        'admin_principal_usuario_id',
        'logo_url',
        'titulo_sistema',
        'activo',
        'empresa_id',
      ];

      const paramsBase = [
        ...(usarIdReutilizable ? [reusableId] : []),
        nombre,
        slug,
        rnc,
        telefono,
        direccion,
        colorPrimario,
        colorSecundario,
        colorTexto,
        colorHeader,
        colorBotonPrimario,
        colorBotonSecundario,
        colorBotonPeligro,
        configModulosJson,
        adminPrincipalCorreo,
        adminPrincipalUsuarioIdFinal,
        logoUrl,
        tituloSistema,
        activo,
        empresaIdFinal,
      ];

      const sqlConId = insertSql
        .replace('{{columns}}', columns.join(', '))
        .replace('{{placeholders}}', columns.map(() => '?').join(', '));

      const sqlSinId = insertSql
        .replace('{{columns}}', columns.filter((col) => col !== 'id').join(', '))
        .replace('{{placeholders}}', columns.filter((col) => col !== 'id').map(() => '?').join(', '));

      const paramsSinId = paramsBase.slice(usarIdReutilizable ? 1 : 0);

      const ejecutarInsert = (sql, params) =>
        new Promise((resolve, reject) => {
          db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
          });
        });

      let insertContext = null;
      try {
        insertContext = await ejecutarInsert(sqlConId, paramsBase);
      } catch (err) {
        if (usarIdReutilizable && err?.code === 'ER_DUP_ENTRY') {
          try {
            insertContext = await ejecutarInsert(sqlSinId, paramsSinId);
          } catch (fallbackErr) {
            console.error('Error al crear negocio:', fallbackErr.message || fallbackErr);
            return res.status(500).json({ ok: false, error: 'No se pudo crear el negocio' });
          }
        } else {
          console.error('Error al crear negocio:', err.message || err);
          return res.status(500).json({ ok: false, error: 'No se pudo crear el negocio' });
        }
      }

      const nuevoId = insertContext?.lastID || reusableId;
      const negocioCreado = mapNegocioWithDefaults({
          id: nuevoId,
          nombre,
          slug,
          rnc,
          telefono,
          direccion,
          color_primario: colorPrimario,
          color_secundario: colorSecundario,
          color_texto: colorTexto,
          color_header: colorHeader,
          color_boton_primario: colorBotonPrimario,
          color_boton_secundario: colorBotonSecundario,
          color_boton_peligro: colorBotonPeligro,
          config_modulos: configModulosJson,
          admin_principal_usuario_id: adminPrincipalUsuarioIdFinal,
          admin_principal_usuario: adminPrincipalUsuario,
          admin_principal_correo: adminPrincipalCorreo,
          logo_url: logoUrl,
          titulo_sistema: tituloSistema,
          activo,
          empresa_id: empresaIdFinal,
          empresa_nombre: empresaNombreFinal,
          suspendido: 0,
          deleted_at: null,
          motivo_suspension: null,
        });

        const responsePayload = { ok: true, negocio: negocioCreado };

        try {
          if (tieneSucursales) {
            const empresaInfo = await asegurarUsuarioEmpresa({
              empresaId: empresaIdFinal,
              negocioId: negocioCreado.id,
              negocioNombre: negocioCreado.nombre,
              empresaNombre: empresaNombreFinal,
              payload: {
                adminPrincipalCorreo,
                adminPrincipalUsuario,
                adminPrincipalPassword,
              },
            });
            if (empresaInfo) {
              responsePayload.empresaUsuario = empresaInfo;
            }
          } else {
            const adminInfo = await asegurarAdminPrincipalNegocio({
              negocioId: negocioCreado.id,
              negocioNombre: negocioCreado.nombre,
              payload: {
                adminPrincipalCorreo,
                adminPrincipalUsuario,
                adminPrincipalPassword,
              },
            });
            if (adminInfo) {
              responsePayload.adminPrincipal = adminInfo;
            }
          }
        } catch (admErr) {
          if (admErr?.status === 400) {
            return res.status(400).json({ ok: false, error: admErr.message || 'No se pudo procesar admin principal' });
          }
          console.warn('No se pudo procesar admin principal del negocio:', admErr?.message || admErr);
        }

        res.status(201).json(responsePayload);
    });
  });
});

app.put('/api/negocios/:id', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    const payload = req.body || {};
    const fields = [];
    const params = [];
    const colorPrimarioProvided = payload.color_primario ?? payload.colorPrimario;
    const colorSecundarioProvided = payload.color_secundario ?? payload.colorSecundario;
    const colorTextoProvided = payload.color_texto ?? payload.colorTexto;
    const colorHeaderProvided = payload.color_header ?? payload.colorHeader;
    const colorBotonPrimarioProvided = payload.color_boton_primario ?? payload.colorBotonPrimario;
    const colorBotonSecundarioProvided = payload.color_boton_secundario ?? payload.colorBotonSecundario;
    const colorBotonPeligroProvided = payload.color_boton_peligro ?? payload.colorBotonPeligro;
    const configModulosProvided = payload.config_modulos ?? payload.configModulos;
    const adminPrincipalUsuarioIdProvided = payload.admin_principal_usuario_id ?? payload.adminPrincipalUsuarioId;
    const adminPrincipalCorreo = normalizarCampoTexto(
      payload.adminPrincipalCorreo ?? payload.admin_principal_correo ?? payload.admin_principal_correo,
      null
    );
    const adminPrincipalUsuario =
      normalizarCampoTexto(payload.adminPrincipalUsuario, null) ||
      normalizarCampoTexto(payload.admin_usuario, null) ||
      null;
    const adminPrincipalPassword = payload.adminPrincipalPassword || payload.admin_password || payload.adminPassword || null;
    const payloadTieneLogoUrl =
      Object.prototype.hasOwnProperty.call(payload, 'logo_url') ||
      Object.prototype.hasOwnProperty.call(payload, 'logoUrl');
    const logoUrlProvided = payloadTieneLogoUrl
      ? (Object.prototype.hasOwnProperty.call(payload, 'logo_url') ? payload.logo_url : payload.logoUrl)
      : undefined;
    const rncProvided = payload.rnc;
    const telefonoProvided = payload.telefono ?? payload.telefonoNegocio;
    const direccionProvided = payload.direccion ?? payload.direccionNegocio;
    const empresaNombre = normalizarCampoTexto(payload.empresa_nombre ?? payload.empresaNombre, null);
    const empresaIdProvided = payload.empresa_id ?? payload.empresaId;

    if (payload.nombre !== undefined || payload.titulo_sistema !== undefined || payload.tituloSistema !== undefined) {
      const nombre =
        normalizarCampoTexto(payload.nombre, null) || normalizarCampoTexto(payload.titulo_sistema ?? payload.tituloSistema, null);
      if (!nombre) {
        return res.status(400).json({ ok: false, error: 'El nombre del negocio no puede ser vaci­o' });
      }
      fields.push('nombre = ?');
      params.push(nombre);
      fields.push('titulo_sistema = ?');
      params.push(normalizarCampoTexto(payload.titulo_sistema ?? payload.tituloSistema, null) || nombre);
    } else if (payload.titulo_sistema !== undefined || payload.tituloSistema !== undefined) {
      fields.push('titulo_sistema = ?');
      params.push(normalizarCampoTexto(payload.titulo_sistema ?? payload.tituloSistema, null));
    }

    if (colorPrimarioProvided !== undefined) {
      fields.push('color_primario = ?');
      params.push(normalizarCampoTexto(colorPrimarioProvided, null));
    }
    if (colorSecundarioProvided !== undefined) {
      fields.push('color_secundario = ?');
      params.push(normalizarCampoTexto(colorSecundarioProvided, null));
    }
    if (colorTextoProvided !== undefined) {
      fields.push('color_texto = ?');
      params.push(normalizarCampoTexto(colorTextoProvided, null) || DEFAULT_COLOR_TEXTO);
    }
    if (colorHeaderProvided !== undefined) {
      const colorHeader =
        normalizarCampoTexto(colorHeaderProvided, null) ||
        normalizarCampoTexto(colorPrimarioProvided, null) ||
        normalizarCampoTexto(colorSecundarioProvided, null) ||
        null;
      fields.push('color_header = ?');
      params.push(colorHeader);
    }
    if (colorBotonPrimarioProvided !== undefined) {
      const colorBotonPrimario =
        normalizarCampoTexto(colorBotonPrimarioProvided, null) || normalizarCampoTexto(colorPrimarioProvided, null) || null;
      fields.push('color_boton_primario = ?');
      params.push(colorBotonPrimario);
    }
    if (colorBotonSecundarioProvided !== undefined) {
      const colorBotonSecundario =
        normalizarCampoTexto(colorBotonSecundarioProvided, null) || normalizarCampoTexto(colorSecundarioProvided, null) || null;
      fields.push('color_boton_secundario = ?');
      params.push(colorBotonSecundario);
    }
    if (colorBotonPeligroProvided !== undefined) {
      fields.push('color_boton_peligro = ?');
      params.push(normalizarCampoTexto(colorBotonPeligroProvided, null) || DEFAULT_COLOR_PELIGRO);
    }
    if (configModulosProvided !== undefined) {
      fields.push('config_modulos = ?');
      params.push(stringifyConfigModulos(configModulosProvided));
    }
    if (payload.adminPrincipalCorreo !== undefined || payload.admin_principal_correo !== undefined) {
      fields.push('admin_principal_correo = ?');
      params.push(adminPrincipalCorreo);
    }
    if (adminPrincipalUsuarioIdProvided !== undefined) {
      const parsedId =
        adminPrincipalUsuarioIdProvided === null || adminPrincipalUsuarioIdProvided === '' ? null : Number(adminPrincipalUsuarioIdProvided);
      fields.push('admin_principal_usuario_id = ?');
      params.push(Number.isFinite(parsedId) ? parsedId : null);
    }
    if (payloadTieneLogoUrl) {
      fields.push('logo_url = ?');
      params.push(normalizarCampoTexto(logoUrlProvided, null));
    }
    if (rncProvided !== undefined) {
      fields.push('rnc = ?');
      params.push(normalizarCampoTexto(rncProvided, null));
    }
    if (telefonoProvided !== undefined) {
      fields.push('telefono = ?');
      params.push(normalizarCampoTexto(telefonoProvided, null));
    }
    if (direccionProvided !== undefined) {
      fields.push('direccion = ?');
      params.push(normalizarCampoTexto(direccionProvided, null));
    }
    if (empresaNombre !== null || empresaIdProvided !== undefined) {
      const empresaIdFinal = await resolverEmpresaId({
        empresaId: empresaIdProvided,
        empresaNombre,
      });
      if (empresaIdFinal) {
        fields.push('empresa_id = ?');
        params.push(empresaIdFinal);
      }
    }
    if (payload.activo !== undefined) {
      fields.push('activo = ?');
      params.push(payload.activo === 0 || payload.activo === false ? 0 : 1);
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
    }

    params.push(id);

    const sql = `UPDATE negocios SET ${fields.join(', ')} WHERE id = ?`;
    db.run(sql, params, async function (err) {
      if (err) {
        console.error('Error al actualizar negocio:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo actualizar el negocio' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }

            try {
        if (adminPrincipalCorreo || adminPrincipalUsuario || adminPrincipalPassword) {
          await asegurarAdminPrincipalNegocio({
            negocioId: id,
            negocioNombre: payload.nombre || payload.titulo_sistema || payload.tituloSistema || '',
            payload: {
              adminPrincipalCorreo,
              adminPrincipalUsuario,
              adminPrincipalPassword,
            },
          });
        }
      } catch (admErr) {
        if (admErr?.status === 400) {
          return res.status(400).json({ ok: false, error: admErr.message || 'No se pudo procesar admin principal' });
        }
        console.warn('No se pudo procesar admin principal en actualizaci?n:', admErr?.message || admErr);
      }

      db.get(
        `SELECT n.id, n.nombre, n.slug, n.rnc, n.telefono, n.direccion, n.color_primario, n.color_secundario, n.color_texto, n.color_header,
                n.color_boton_primario, n.color_boton_secundario, n.color_boton_peligro, n.config_modulos, n.admin_principal_correo, n.admin_principal_usuario_id,
                u.usuario AS admin_principal_usuario,
                n.logo_url, n.titulo_sistema, n.activo, n.suspendido, n.deleted_at, n.motivo_suspension, n.updated_at
           FROM negocios n
           LEFT JOIN usuarios u ON u.id = n.admin_principal_usuario_id
          WHERE n.id = ?`,
        [id],
        (selectErr, negocio) => {
          if (selectErr) {
            console.error('Error al consultar negocio actualizado:', selectErr.message);
            return res.status(500).json({ ok: false, error: 'Negocio actualizado pero no se pudo leer' });
          }
          const negocioConTema = mapNegocioWithDefaults(negocio || {});
          res.json({ ok: true, negocio: negocioConTema });
        }
      );
    });
  });
});

app.patch('/api/negocios/:id/estado', (req, res) => {
  requireSuperAdmin(req, res, () => {
    const id = Number(req.params.id);
    const { activo = 1 } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    const valor = activo === 0 || activo === false ? 0 : 1;
    db.run('UPDATE negocios SET activo = ? WHERE id = ?', [valor, id], function (err) {
      if (err) {
        console.error('Error al actualizar estado de negocio:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo actualizar el estado del negocio' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      res.json({ ok: true, activo: valor });
    });
  });
});

app.get('/api/negocios/mi-tema', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    db.get(
        `SELECT id, slug, nombre, titulo_sistema, color_primario, color_secundario, color_texto, color_header,
                color_boton_primario, color_boton_secundario, color_boton_peligro, config_modulos, admin_principal_usuario_id,
                logo_url, permitir_b01, permitir_b02, permitir_b14, activo
         FROM negocios
         WHERE id = ?`,
      [negocioId],
      (err, row) => {
        if (err) {
          console.error('Error al obtener tema de negocio:', err.message);
          return res.status(500).json({ ok: false, error: 'No se pudo obtener el tema del negocio' });
        }
        if (!row) {
          return res.status(404).json({ ok: false, error: 'Negocio no encontrado para la sesion actual' });
        }

          const negocioTema = mapNegocioWithDefaults(row);
          const permitirB01 = normalizarFlag(negocioTema.permitir_b01 ?? negocioTema.permitirB01, 1);
          const permitirB02 = normalizarFlag(negocioTema.permitir_b02 ?? negocioTema.permitirB02, 1);
          const permitirB14 = normalizarFlag(negocioTema.permitir_b14 ?? negocioTema.permitirB14, 1);
          res.json({
            ok: true,
            tema: {
              id: negocioTema.id,
              slug: negocioTema.slug,
              titulo: negocioTema.titulo_sistema || negocioTema.nombre,
            colorPrimario: negocioTema.colorPrimario,
            colorSecundario: negocioTema.colorSecundario,
            colorHeader: negocioTema.colorHeader,
            colorTexto: negocioTema.colorTexto,
            colorBotonPrimario: negocioTema.colorBotonPrimario,
            colorBotonSecundario: negocioTema.colorBotonSecundario,
            colorBotonPeligro: negocioTema.colorBotonPeligro,
              configModulos: negocioTema.configModulos,
              adminPrincipalUsuarioId: negocioTema.adminPrincipalUsuarioId,
              logoUrl: negocioTema.logoUrl || negocioTema.logo_url,
              permitirB01,
              permitirB02,
              permitirB14,
              permitir_b01: permitirB01,
              permitir_b02: permitirB02,
              permitir_b14: permitirB14,
              activo: negocioTema.activo,
            },
          });
      }
    );
  });
});

app.put('/api/admin/negocios/:id/activar', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio esta eliminado' });
      }

      await db.run('UPDATE negocios SET activo = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      await registrarAccionAdmin({ adminId: usuarioSesion.id, negocioId: id, accion: 'activar' });
      res.json({ ok: true, activo: 1 });
    } catch (error) {
      console.error('Error activando negocio:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo activar el negocio' });
    }
  });
});

app.put('/api/admin/negocios/:id/desactivar', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio esta eliminado' });
      }

      await db.run('UPDATE negocios SET activo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      await registrarAccionAdmin({ adminId: usuarioSesion.id, negocioId: id, accion: 'desactivar' });
      res.json({ ok: true, activo: 0 });
    } catch (error) {
      console.error('Error desactivando negocio:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo desactivar el negocio' });
    }
  });
});

app.put('/api/admin/negocios/:id/suspender', (req, res) => {
  res.status(404).json({ ok: false, error: 'Operacion no disponible' });
});

app.put('/api/admin/negocios/:id/reactivar', (req, res) => {
  res.status(404).json({ ok: false, error: 'Operacion no disponible' });
});

app.get('/api/admin/negocios/:id/facturacion-config', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await db.get(
        `SELECT n.id, n.nombre, n.rnc, n.telefono, n.direccion, n.admin_principal_correo,
                u.nombre AS admin_nombre, u.usuario AS admin_usuario
           FROM negocios n
           LEFT JOIN usuarios u ON u.id = n.admin_principal_usuario_id
          WHERE n.id = ?
          LIMIT 1`,
        [id]
      );
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }

      const existente = await db.get(
        'SELECT * FROM posium_facturacion_config WHERE negocio_id = ? LIMIT 1',
        [id]
      );
      const defaults = {
        cliente_nombre: negocio.nombre || '',
        cliente_rnc: negocio.rnc || '',
        cliente_direccion: negocio.direccion || '',
        cliente_telefono: negocio.telefono || '',
        cliente_email: negocio.admin_principal_correo || '',
        cliente_contacto: negocio.admin_nombre || negocio.admin_usuario || '',
        emisor_nombre: 'POSIUM',
        emisor_rnc: '',
        emisor_direccion: '',
        emisor_telefono: '',
        emisor_email: '',
        emisor_logo: '',
        emisor_nota: '',
        plan_nombre: 'Suscripcion POSIUM mensual',
        precio_base: 0,
        moneda: 'RD$',
        impuesto_tipo: 'porcentaje',
        impuesto_valor: 0,
        periodo_default: '',
        terminos_pago: 'Pago inmediato',
        metodo_pago: 'Transferencia',
        notas_internas: '',
      };

      const config = aplicarConfigPosium(existente || {}, defaults);
      res.json({ ok: true, config, negocio });
    } catch (error) {
      console.error('Error al obtener configuracion de facturacion POSIUM:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener la configuracion' });
    }
  });
});

app.put('/api/admin/negocios/:id/facturacion-config', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const existente = await db.get(
        'SELECT * FROM posium_facturacion_config WHERE negocio_id = ? LIMIT 1',
        [id]
      );
      const payload = req.body || {};
      const config = aplicarConfigPosium(payload, existente || {});

      const sql = `
        INSERT INTO posium_facturacion_config (
          negocio_id, cliente_nombre, cliente_rnc, cliente_direccion, cliente_telefono, cliente_email, cliente_contacto,
          emisor_nombre, emisor_rnc, emisor_direccion, emisor_telefono, emisor_email, emisor_logo, emisor_nota,
          plan_nombre, precio_base, moneda, impuesto_tipo, impuesto_valor, periodo_default, terminos_pago, metodo_pago,
          notas_internas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          cliente_nombre = VALUES(cliente_nombre),
          cliente_rnc = VALUES(cliente_rnc),
          cliente_direccion = VALUES(cliente_direccion),
          cliente_telefono = VALUES(cliente_telefono),
          cliente_email = VALUES(cliente_email),
          cliente_contacto = VALUES(cliente_contacto),
          emisor_nombre = VALUES(emisor_nombre),
          emisor_rnc = VALUES(emisor_rnc),
          emisor_direccion = VALUES(emisor_direccion),
          emisor_telefono = VALUES(emisor_telefono),
          emisor_email = VALUES(emisor_email),
          emisor_logo = VALUES(emisor_logo),
          emisor_nota = VALUES(emisor_nota),
          plan_nombre = VALUES(plan_nombre),
          precio_base = VALUES(precio_base),
          moneda = VALUES(moneda),
          impuesto_tipo = VALUES(impuesto_tipo),
          impuesto_valor = VALUES(impuesto_valor),
          periodo_default = VALUES(periodo_default),
          terminos_pago = VALUES(terminos_pago),
          metodo_pago = VALUES(metodo_pago),
          notas_internas = VALUES(notas_internas),
          updated_at = CURRENT_TIMESTAMP
      `;

      const params = [
        id,
        config.cliente_nombre,
        config.cliente_rnc,
        config.cliente_direccion,
        config.cliente_telefono,
        config.cliente_email,
        config.cliente_contacto,
        config.emisor_nombre,
        config.emisor_rnc,
        config.emisor_direccion,
        config.emisor_telefono,
        config.emisor_email,
        config.emisor_logo,
        config.emisor_nota,
        config.plan_nombre,
        config.precio_base,
        config.moneda,
        config.impuesto_tipo,
        config.impuesto_valor,
        config.periodo_default,
        config.terminos_pago,
        config.metodo_pago,
        config.notas_internas,
      ];

      await db.run(sql, params);
      res.json({ ok: true, config });
    } catch (error) {
      console.error('Error al guardar configuracion de facturacion POSIUM:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo guardar la configuracion' });
    }
  });
});

app.get('/api/admin/negocios/:id/facturas', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 20));
    const offset = (page - 1) * limit;

    try {
      const totalRow = await db.get(
        'SELECT COUNT(1) AS total FROM posium_facturas WHERE negocio_id = ?',
        [id]
      );
      const total = Number(totalRow?.total) || 0;
      const dataSql = `
        SELECT id, numero_factura, fecha_emision, periodo, subtotal, itbis, descuento, total, moneda, estado, created_at
          FROM posium_facturas
         WHERE negocio_id = ?
         ORDER BY fecha_emision DESC, id DESC
         LIMIT ${limit} OFFSET ${offset}
      `;
      const items = await db.all(dataSql, [id]);

      res.json({ ok: true, items: items || [], total, page, pageSize: limit });
    } catch (error) {
      console.error('Error al listar facturas POSIUM:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el historial de facturas' });
    }
  });
});

app.post('/api/admin/negocios/:id/facturas', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    const payload = req.body || {};
    const facturaPayload = payload.factura || payload;
    const configPayload = payload.config || null;
    const actualizarConfig = payload.actualizar_config !== false;

    try {
      const existente = await db.get(
        'SELECT * FROM posium_facturacion_config WHERE negocio_id = ? LIMIT 1',
        [id]
      );
      let configFinal = aplicarConfigPosium(configPayload || {}, existente || {});

      if (configPayload && actualizarConfig) {
        const sqlConfig = `
          INSERT INTO posium_facturacion_config (
            negocio_id, cliente_nombre, cliente_rnc, cliente_direccion, cliente_telefono, cliente_email, cliente_contacto,
            emisor_nombre, emisor_rnc, emisor_direccion, emisor_telefono, emisor_email, emisor_logo, emisor_nota,
            plan_nombre, precio_base, moneda, impuesto_tipo, impuesto_valor, periodo_default, terminos_pago, metodo_pago,
            notas_internas
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            cliente_nombre = VALUES(cliente_nombre),
            cliente_rnc = VALUES(cliente_rnc),
            cliente_direccion = VALUES(cliente_direccion),
            cliente_telefono = VALUES(cliente_telefono),
            cliente_email = VALUES(cliente_email),
            cliente_contacto = VALUES(cliente_contacto),
            emisor_nombre = VALUES(emisor_nombre),
            emisor_rnc = VALUES(emisor_rnc),
            emisor_direccion = VALUES(emisor_direccion),
            emisor_telefono = VALUES(emisor_telefono),
            emisor_email = VALUES(emisor_email),
            emisor_logo = VALUES(emisor_logo),
            emisor_nota = VALUES(emisor_nota),
            plan_nombre = VALUES(plan_nombre),
            precio_base = VALUES(precio_base),
            moneda = VALUES(moneda),
            impuesto_tipo = VALUES(impuesto_tipo),
            impuesto_valor = VALUES(impuesto_valor),
            periodo_default = VALUES(periodo_default),
            terminos_pago = VALUES(terminos_pago),
            metodo_pago = VALUES(metodo_pago),
            notas_internas = VALUES(notas_internas),
            updated_at = CURRENT_TIMESTAMP
        `;
        const paramsConfig = [
          id,
          configFinal.cliente_nombre,
          configFinal.cliente_rnc,
          configFinal.cliente_direccion,
          configFinal.cliente_telefono,
          configFinal.cliente_email,
          configFinal.cliente_contacto,
          configFinal.emisor_nombre,
          configFinal.emisor_rnc,
          configFinal.emisor_direccion,
          configFinal.emisor_telefono,
          configFinal.emisor_email,
          configFinal.emisor_logo,
          configFinal.emisor_nota,
          configFinal.plan_nombre,
          configFinal.precio_base,
          configFinal.moneda,
          configFinal.impuesto_tipo,
          configFinal.impuesto_valor,
          configFinal.periodo_default,
          configFinal.terminos_pago,
          configFinal.metodo_pago,
          configFinal.notas_internas,
        ];
        await db.run(sqlConfig, paramsConfig);
      }

      const fechaEmision = normalizarFechaPosium(facturaPayload.fecha_emision ?? facturaPayload.fecha);
      const periodo = normalizarCampoTexto(facturaPayload.periodo, null);
      if (!periodo) {
        return res.status(400).json({ ok: false, error: 'El periodo facturado es obligatorio' });
      }

      const descripcionBase = normalizarCampoTexto(facturaPayload.descripcion, null);
      const descripcion =
        descripcionBase ||
        [configFinal.plan_nombre || 'Suscripcion POSIUM', periodo].filter(Boolean).join(' - ');
      const cantidad = Math.max(1, normalizarNumeroPosium(facturaPayload.cantidad, 1));
      const precioUnitario = normalizarNumeroPosium(
        facturaPayload.precio_unitario ?? facturaPayload.precio_unitario_base ?? configFinal.precio_base,
        0
      );
      const subtotalLinea = cantidad * precioUnitario;
      const items = [
        {
          descripcion,
          cantidad,
          precio_unitario: precioUnitario,
          subtotal: subtotalLinea,
        },
      ];

      const subtotal = items.reduce((acc, item) => acc + normalizarNumeroPosium(item.subtotal, 0), 0);
      const impuestoTipo = normalizarImpuestoTipoPosium(
        facturaPayload.impuesto_tipo ?? configFinal.impuesto_tipo
      );
      const impuestoValor = normalizarNumeroPosium(
        facturaPayload.impuesto_valor ?? configFinal.impuesto_valor,
        0
      );
      const itbis =
        impuestoTipo === 'porcentaje' ? (subtotal * impuestoValor) / 100 : impuestoValor;
      const descuento = Math.max(0, normalizarNumeroPosium(facturaPayload.descuento, 0));
      const total = Math.max(0, subtotal + itbis - descuento);
      const moneda = normalizarMonedaPosium(facturaPayload.moneda ?? configFinal.moneda);
      const estado = normalizarEstadoFacturaPosium(facturaPayload.estado);
      const terminosPago =
        normalizarCampoTexto(facturaPayload.terminos_pago ?? configFinal.terminos_pago, null) || '';
      const metodoPago =
        normalizarCampoTexto(facturaPayload.metodo_pago ?? configFinal.metodo_pago, null) || '';

      const emisorSnapshot = {
        nombre: configFinal.emisor_nombre,
        rnc: configFinal.emisor_rnc,
        direccion: configFinal.emisor_direccion,
        telefono: configFinal.emisor_telefono,
        email: configFinal.emisor_email,
        logo: configFinal.emisor_logo,
        nota: configFinal.emisor_nota,
      };
      const clienteSnapshot = {
        nombre: configFinal.cliente_nombre,
        rnc: configFinal.cliente_rnc,
        direccion: configFinal.cliente_direccion,
        telefono: configFinal.cliente_telefono,
        email: configFinal.cliente_email,
        contacto: configFinal.cliente_contacto,
      };

      await db.run('BEGIN');
      const maxRow = await db.get('SELECT COALESCE(MAX(numero_factura), 0) AS max_num FROM posium_facturas');
      const numeroFactura = Number(maxRow?.max_num || 0) + 1;

      const insertSql = `
        INSERT INTO posium_facturas (
          negocio_id, numero_factura, fecha_emision, periodo, items_json, subtotal, itbis, descuento, total,
          moneda, estado, terminos_pago, metodo_pago, emisor_snapshot, cliente_snapshot, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const insertParams = [
        id,
        numeroFactura,
        fechaEmision,
        periodo,
        JSON.stringify(items),
        subtotal,
        itbis,
        descuento,
        total,
        moneda,
        estado,
        terminosPago,
        metodoPago,
        JSON.stringify(emisorSnapshot),
        JSON.stringify(clienteSnapshot),
        usuarioSesion?.id || null,
      ];

      const resultado = await db.run(insertSql, insertParams);
      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.status(201).json({
        ok: true,
        factura: {
          id: resultado?.lastID,
          numero_factura: numeroFactura,
          fecha_emision: fechaEmision,
          periodo,
          subtotal,
          itbis,
          descuento,
          total,
          moneda,
          estado,
        },
      });
    } catch (error) {
      try {
        await db.run('ROLLBACK');
      } catch (rollbackError) {
        console.warn('Error al revertir factura POSIUM:', rollbackError?.message || rollbackError);
      }
      console.error('Error al generar factura POSIUM:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar la factura' });
    }
  });
});

app.get('/api/admin/posium-facturas/:id', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de factura invalido' });
    }

    try {
      const row = await db.get('SELECT * FROM posium_facturas WHERE id = ? LIMIT 1', [id]);
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
      }

      const parseJsonField = (value, fallback) => {
        if (!value) return fallback;
        if (Array.isArray(value) || typeof value === 'object') return value;
        try {
          if (Buffer.isBuffer(value)) {
            return JSON.parse(value.toString('utf8'));
          }
          if (typeof value === 'string') {
            return JSON.parse(value);
          }
        } catch (parseErr) {
          return fallback;
        }
        return fallback;
      };

      const itemsRaw = parseJsonField(row.items_json, []);
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      const emisor = parseJsonField(row.emisor_snapshot, null);
      const cliente = parseJsonField(row.cliente_snapshot, null);

      res.json({
        ok: true,
        factura: {
          ...row,
          items,
          emisor,
          cliente,
        },
      });
    } catch (error) {
      console.error('Error al obtener factura POSIUM:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener la factura' });
    }
  });
});

app.put('/api/admin/posium-facturas/:id/estado', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de factura invalido' });
    }

    const estado = normalizarEstadoFacturaPosium(req.body?.estado);
    try {
      const resultado = await db.run(
        'UPDATE posium_facturas SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [estado, id]
      );
      if (!resultado?.changes) {
        return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
      }
      res.json({ ok: true, estado });
    } catch (error) {
      console.error('Error al actualizar estado de factura POSIUM:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el estado' });
    }
  });
});

app.delete('/api/admin/negocios/:id', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }

      await eliminarNegocioCompleto({ negocioId: id, empresaId: negocio.empresa_id });
      res.json({ ok: true, eliminado: 'definitivo' });
    } catch (error) {
      console.error('Error eliminando negocio:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar definitivamente el negocio' });
    }
  });
});

app.post('/api/admin/negocios/:id/reset-admin-password', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio esta eliminado' });
      }

      const adminUsuario = await obtenerAdminPrincipalNegocio(id, negocio.admin_principal_usuario_id);
      if (!adminUsuario) {
        return res.status(404).json({ ok: false, error: 'Admin principal no encontrado' });
      }

      const tempPassword = generarPasswordTemporal(12);
      const passwordHash = await hashPasswordIfNeeded(tempPassword);
      await usuariosRepo.update(adminUsuario.id, {
        password: passwordHash,
        force_password_change: 1,
        password_reset_at: new Date(),
      });

      cerrarSesionesActivasDeUsuario(adminUsuario.id, () => {});
      await registrarAccionAdmin({ adminId: usuarioSesion.id, negocioId: id, accion: 'reset_password' });

      res.json({
        ok: true,
        admin_usuario: adminUsuario.usuario,
        temp_password: tempPassword,
      });
    } catch (error) {
      console.error('Error reseteando password admin:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo resetear la contrasena' });
    }
  });
});

app.put('/api/admin/negocios/:id/force-password-change', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio esta eliminado' });
      }

      const adminUsuario = await obtenerAdminPrincipalNegocio(id, negocio.admin_principal_usuario_id);
      if (!adminUsuario) {
        return res.status(404).json({ ok: false, error: 'Admin principal no encontrado' });
      }

      await usuariosRepo.update(adminUsuario.id, { force_password_change: 1 });
      await registrarAccionAdmin({
        adminId: usuarioSesion.id,
        negocioId: id,
        accion: 'force_password_change',
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error forzando cambio de password:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo forzar el cambio de contrasena' });
    }
  });
});

app.post('/api/admin/negocios/:id/impersonar', (req, res) => {
  requireSuperAdmin(req, res, async (usuarioSesion) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }

    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio esta eliminado' });
      }

      let usuarioImpersonar = await obtenerAdminPrincipalNegocio(id, negocio.admin_principal_usuario_id);
      let rolImpersonado = 'admin';
      if (!usuarioImpersonar) {
        const supervisor = await db.get(
          `SELECT id
             FROM usuarios
            WHERE negocio_id = ? AND rol = 'supervisor' AND activo = 1
            ORDER BY id ASC
            LIMIT 1`,
          [id]
        );
        if (!supervisor?.id) {
          return res.status(404).json({ ok: false, error: 'No hay usuario supervisor disponible' });
        }
        usuarioImpersonar = await usuariosRepo.findById(supervisor.id);
        rolImpersonado = 'supervisor';
      }
      if (!usuarioImpersonar) {
        return res.status(404).json({ ok: false, error: 'Usuario principal no encontrado' });
      }

      const token = crearTokenImpersonacion({
        role: rolImpersonado,
        impersonated: true,
        negocio_id: id,
        usuario_id: usuarioImpersonar.id,
        admin_id: usuarioSesion.id,
      });

      await registrarImpersonacionAdmin({ adminId: usuarioSesion.id, negocioId: id, ip: req.ip || null });
      await registrarAccionAdmin({ adminId: usuarioSesion.id, negocioId: id, accion: 'impersonar' });

      res.json({
        ok: true,
        token,
        rol: rolImpersonado,
        usuario_id: usuarioImpersonar.id,
        usuario: usuarioImpersonar.usuario,
        nombre: usuarioImpersonar.nombre,
        negocio_id: id,
        force_password_change: !!usuarioImpersonar.force_password_change,
        impersonated: true,
        expires_in: IMPERSONATION_TOKEN_TTL_SECONDS,
      });
    } catch (error) {
      console.error('Error impersonando negocio:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo impersonar el negocio' });
    }
  });
});
app.put('/api/usuarios/mi-password', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const nuevaPassword = (req.body?.password || '').toString().trim();

    if (!nuevaPassword || nuevaPassword.length < 8) {
      return res
        .status(400)
        .json({ ok: false, error: 'La contrasena debe tener al menos 8 caracteres' });
    }

    try {
      const passwordHash = await hashPasswordIfNeeded(nuevaPassword);
      const actualizado = await usuariosRepo.update(usuarioSesion.id, {
        password: passwordHash,
        force_password_change: 0,
        password_reset_at: new Date(),
      });

      if (!actualizado) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Error al actualizar contrasena:', err?.message || err);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar la contrasena' });
    }
  });
});

app.post('/api/usuarios', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido' });
    }

    const { nombre, usuario, password, rol, activo = 1, negocio_id, es_super_admin } = req.body || {};
    const usuarioNormalizado = (usuario || '').trim();

    if (!nombre || !usuarioNormalizado || !password || !rol) {
      return res.status(400).json({ error: 'Nombre, usuario, contrase\u00f1a y rol son obligatorios' });
    }

    if (!usuarioRolesPermitidos.includes(rol)) {
      return res.status(400).json({ error: 'Rol inv\u00e1lido' });
    }
    if (rol === 'supervisor' && !puedeGestionarSupervisores(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido' });
    }

    const esSuper = esSuperAdmin(usuarioSesion);
    const negocioDestino =
      esSuper && negocio_id ? Number(negocio_id) || NEGOCIO_ID_DEFAULT : usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const flagSuperNuevo = esSuper ? !!es_super_admin : false;
    let empresaDestino = null;
    try {
      const rowEmpresa = await db.get('SELECT empresa_id FROM negocios WHERE id = ? LIMIT 1', [negocioDestino]);
      empresaDestino = rowEmpresa?.empresa_id ?? null;
    } catch (error) {
      console.warn('No se pudo obtener empresa del negocio para usuario:', error?.message || error);
    }
    const errorModuloRol = await validarRolSegunModulosNegocio(rol, negocioDestino);
    if (errorModuloRol) {
      return res.status(403).json({ error: errorModuloRol });
    }
    if (rol === 'supervisor') {
      const existenteSupervisor = await db.get(
        'SELECT id FROM usuarios WHERE rol = "supervisor" AND negocio_id = ? LIMIT 1',
        [negocioDestino]
      );
      if (existenteSupervisor) {
        return res.status(400).json({ error: 'Ya existe un supervisor asignado a esta sucursal.' });
      }
    }

    try {
      const existenteUsuario = await usuariosRepo.findByUsuario(usuarioNormalizado);
      if (existenteUsuario) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese nombre de usuario en otro negocio.' });
      }

      const passwordHash = await hashPasswordIfNeeded(password);
      const creado = await usuariosRepo.create({
        nombre,
        usuario: usuarioNormalizado,
        password: passwordHash,
        rol,
        activo,
        negocio_id: negocioDestino,
        empresa_id: empresaDestino,
        es_super_admin: flagSuperNuevo,
      });

      if (!creado) {
        return res.status(500).json({ error: 'Error al crear usuario' });
      }

      res.status(201).json({
        id: creado.id,
        nombre: creado.nombre,
        usuario: creado.usuario,
        rol: creado.rol,
        activo: creado.activo,
        negocio_id: creado.negocio_id,
        es_super_admin: creado.es_super_admin,
      });
    } catch (err) {
      console.error('Error al crear usuario:', err?.message || err);
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  });
});

app.put('/api/usuarios/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const { id } = req.params;
    const { nombre, usuario, password, rol, activo, negocio_id, es_super_admin } = req.body || {};
    const usuarioNormalizado = usuario?.trim();

    if (Number(id) === 1 || rol === 'admin') {
      return res.status(400).json({ error: 'No se puede modificar el usuario administrador' });
    }

    if (rol && !usuarioRolesPermitidos.includes(rol)) {
      return res.status(400).json({ error: 'Rol inv\u00e1lido' });
    }

    const esSuper = esSuperAdmin(usuarioSesion);

    try {
      const existente = await usuariosRepo.findById(id);

      if (!existente || existente.rol === 'admin') {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (!puedeGestionarRol(usuarioSesion, existente.rol)) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      if (!esSuper && existente.negocio_id !== usuarioSesion.negocio_id) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      const payload = { nombre, usuario: usuarioNormalizado, rol, activo };
      if (password !== undefined) {
        payload.password = await hashPasswordIfNeeded(password);
      }
      const negocioDestino = esSuper && negocio_id !== undefined ? negocio_id || NEGOCIO_ID_DEFAULT : existente.negocio_id;
      const rolDestino = rol || existente.rol;
      if (!puedeGestionarRol(usuarioSesion, rolDestino)) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }
      const errorModuloRol = await validarRolSegunModulosNegocio(rolDestino, negocioDestino);
      if (errorModuloRol) {
        return res.status(403).json({ error: errorModuloRol });
      }
      if (rolDestino === 'supervisor') {
        const existenteSupervisor = await db.get(
          'SELECT id FROM usuarios WHERE rol = "supervisor" AND negocio_id = ? AND id != ? LIMIT 1',
          [negocioDestino, existente.id]
        );
        if (existenteSupervisor) {
          return res.status(400).json({ error: 'Ya existe un supervisor asignado a esta sucursal.' });
        }
      }

      if (esSuper && negocio_id !== undefined) {
        payload.negocio_id = negocio_id || NEGOCIO_ID_DEFAULT;
        try {
          const rowEmpresa = await db.get('SELECT empresa_id FROM negocios WHERE id = ? LIMIT 1', [
            payload.negocio_id,
          ]);
          payload.empresa_id = rowEmpresa?.empresa_id ?? null;
        } catch (error) {
          console.warn('No se pudo actualizar empresa_id del usuario:', error?.message || error);
        }
      }

      if (esSuper && es_super_admin !== undefined) {
        payload.es_super_admin = es_super_admin ? 1 : 0;
      }

      if (usuarioNormalizado && usuarioNormalizado !== existente.usuario) {
        const usuarioEnUso = await usuariosRepo.findByUsuario(usuarioNormalizado);
        if (usuarioEnUso && Number(usuarioEnUso.id) !== Number(id)) {
          return res.status(400).json({ error: 'Ya existe un usuario con ese nombre de usuario en otro negocio.' });
        }
      }

      const actualizado = await usuariosRepo.update(id, payload);

      if (!actualizado) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ message: 'Usuario actualizado correctamente' });
    } catch (err) {
      console.error('Error al actualizar usuario:', err?.message || err);
      res.status(500).json({ error: 'Error al actualizar usuario' });
    }
  });
});


app.put('/api/usuarios/:id/activar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const { id } = req.params;
    const { activo } = req.body || {};

    if (Number(id) === 1) {
      return res.status(400).json({ error: 'No se puede desactivar el usuario administrador' });
    }

    const valor = activo ? 1 : 0;
    const esSuper = esSuperAdmin(usuarioSesion);

    try {
      const existente = await usuariosRepo.findById(id);
      if (!existente) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (existente.rol === 'admin') {
        return res.status(400).json({ error: 'No se puede desactivar el usuario administrador' });
      }

      if (!puedeGestionarRol(usuarioSesion, existente.rol)) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      if (!esSuper && existente.negocio_id !== usuarioSesion.negocio_id) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      const actualizado = await usuariosRepo.update(id, { activo: valor });

      if (!actualizado) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ message: 'Estado del usuario actualizado', activo: valor });
    } catch (err) {
      console.error('Error al actualizar estado de usuario:', err?.message || err);
      res.status(500).json({ error: 'Error al actualizar usuario' });
    }
  });
});

app.delete('/api/usuarios/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const { id } = req.params;

    if (Number(id) === 1) {
      return res.status(400).json({ error: 'No se puede eliminar el usuario administrador' });
    }

    const usuarioId = Number(id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ error: 'ID de usuario inv\u00e1lido' });
    }

    const esSuper = esSuperAdmin(usuarioSesion);

    try {
      const existente = await usuariosRepo.findById(usuarioId);
      if (!existente || existente.rol === 'admin') {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (!puedeGestionarRol(usuarioSesion, existente.rol)) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      if (!esSuper && existente.negocio_id !== usuarioSesion.negocio_id) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      const restantes = await usuariosRepo.countNonAdmin(esSuper ? null : usuarioSesion.negocio_id);
      if (restantes <= 1) {
        return res
          .status(400)
          .json({ error: 'Debe permanecer al menos un usuario adicional al administrador.' });
      }

      await new Promise((resolve, reject) => {
        db.run('DELETE FROM sesiones_usuarios WHERE usuario_id = ?', [usuarioId], (sesErr) => {
          if (sesErr) {
            return reject(sesErr);
          }
          resolve();
        });
      });

      const eliminado = await usuariosRepo.removeNonAdmin(usuarioId, esSuper ? null : usuarioSesion.negocio_id);

      if (!eliminado) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ message: 'Usuario eliminado correctamente' });
    } catch (err) {
      console.error('Error al eliminar usuario:', err?.message || err);
      res.status(500).json({ error: 'Error al eliminar usuario' });
    }
  });
});

app.post('/api/usuarios/:id/cerrar-sesiones', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const { id } = req.params;
    const usuarioId = Number(id);

    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de usuario inv\u00e1lido' });
    }

    const esSuper = esSuperAdmin(usuarioSesion);
    if (!esSuper && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido' });
    }

    try {
      const existente = await usuariosRepo.findById(usuarioId);
      if (!existente) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      if (!puedeGestionarRol(usuarioSesion, existente.rol)) {
        return res.status(403).json({ ok: false, error: 'Acceso restringido' });
      }

      if (!esSuper && existente.negocio_id !== usuarioSesion.negocio_id) {
        return res.status(403).json({ ok: false, error: 'Acceso restringido' });
      }

      cerrarSesionesActivasDeUsuario(usuarioId, (err, cerradas) => {
        if (err) {
          console.error('Error al cerrar sesiones del usuario:', err.message);
          return res
            .status(500)
            .json({ ok: false, error: 'No se pudieron cerrar las sesiones del usuario' });
        }

        res.json({ ok: true, sesiones_cerradas: cerradas });
      });
    } catch (error) {
      console.error('Error al cerrar sesiones de usuario:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cerrar las sesiones' });
    }
  });
});

app.get('/api/dgii/rnc-cache/lookup', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const documento = normalizarDocumentoFiscal(req.query?.documento);
    if (!documento) {
      return res.status(400).json({ ok: false, error: 'Documento invalido.' });
    }

    try {
      const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
      const autoguardar = normalizarFlag(req.query?.autoguardar ?? req.query?.guardar_cliente, 0) === 1;
      const clienteExistente = await obtenerClientePorDocumentoNormalizado(negocioId, documento);
      const row = await obtenerContribuyenteDesdeCacheDgii(documento);
      let sync = null;

      if (autoguardar) {
        const nombrePreferido = normalizarCampoTexto(req.query?.nombre, null) || row?.nombre_o_razon_social || '';
        sync = await sincronizarClientePorDocumento({
          negocioId,
          documento,
          nombre: nombrePreferido,
        });
      }

      if (!row) {
        return res.json({
          ok: true,
          encontrado: false,
          contribuyente: null,
          cliente: sync?.ok ? sync.cliente : clienteExistente || null,
          cliente_sincronizado: Boolean(sync?.ok),
          cliente_creado: Boolean(sync?.ok && sync?.creado),
          cliente_actualizado: Boolean(sync?.ok && sync?.actualizado),
          consulta_web_url: DGII_CONSULTA_RNC_URL,
        });
      }

      return res.json({
        ok: true,
        encontrado: true,
        consulta_web_url: DGII_CONSULTA_RNC_URL,
        cliente: sync?.ok ? sync.cliente : clienteExistente || null,
        cliente_sincronizado: Boolean(sync?.ok),
        cliente_creado: Boolean(sync?.ok && sync?.creado),
        cliente_actualizado: Boolean(sync?.ok && sync?.actualizado),
        contribuyente: {
          documento: row.documento_formateado || row.documento,
          documento_limpio: row.documento,
          tipo_documento: inferirTipoDocumentoFiscal(row.documento, row.tipo_documento),
          nombre: row.nombre_o_razon_social || '',
          nombre_comercial: row.nombre_comercial || '',
          estado: row.estado || '',
          actividad_economica: row.actividad_economica || '',
          actualizado_en: row.updated_at || null,
        },
      });
    } catch (error) {
      console.error('Error al buscar documento en dgii_rnc_cache:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'No se pudo consultar el cache DGII.' });
    }
  });
});

// Clientes
app.get('/api/clientes', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const term = (req.query.search || '').trim();
    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    if (esUsuarioBar(usuarioSesion)) {
      const barActivo = await moduloActivoParaNegocio('bar', negocioId);
      if (!barActivo) {
        return res.status(403).json({ error: 'El módulo de Bar está desactivado para este negocio.' });
      }
    }
    const areaSolicitada = normalizarAreaPreparacion(
      req.body?.area_preparacion ?? req.body?.areaPreparacion ?? (esUsuarioBar(usuarioSesion) ? 'bar' : 'cocina')
    );
    const params = [negocioId, negocioId, negocioId];
    let sql = `SELECT c.id,
                      c.nombre,
                      c.documento,
                      c.tipo_documento,
                      c.telefono,
                      c.email,
                      c.direccion,
                      c.notas,
                      c.activo,
                      COALESCE(d.total_deuda, 0) AS deuda_total,
                      COALESCE(a.total_abonos, 0) AS abonos_total,
                      GREATEST(COALESCE(d.total_deuda, 0) - COALESCE(a.total_abonos, 0), 0) AS saldo_pendiente
               FROM clientes c
               LEFT JOIN (
                 SELECT cliente_id, SUM(monto_total) AS total_deuda
                 FROM clientes_deudas
                 WHERE negocio_id = ?
                 GROUP BY cliente_id
               ) d ON d.cliente_id = c.id
               LEFT JOIN (
                 SELECT cliente_id, SUM(monto) AS total_abonos
                 FROM clientes_abonos
                 WHERE negocio_id = ?
                 GROUP BY cliente_id
               ) a ON a.cliente_id = c.id
               WHERE c.negocio_id = ?
                 AND c.activo = 1`;

    if (term) {
      sql += ' AND (c.nombre LIKE ? OR c.documento LIKE ?)';
      const like = `%${term}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY c.nombre ASC LIMIT 50';

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error al obtener clientes:', err.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener clientes' });
      }
      res.json({ ok: true, clientes: rows || [] });
    });
  });
});

app.post('/api/clientes', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { nombre, documento, tipo_documento, telefono, email, direccion, notas, activo = 1 } = req.body || {};
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ ok: false, error: 'El nombre del cliente es obligatorio' });
    }

    const sql = `INSERT INTO clientes (nombre, documento, tipo_documento, telefono, email, direccion, notas, activo, negocio_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      nombre.trim(),
      documento?.trim() || null,
      tipo_documento || null,
      telefono || null,
      email || null,
      direccion || null,
      notas || null,
      activo ? 1 : 0,
      usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al crear cliente:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo crear el cliente' });
      }
      res.json({
        ok: true,
        cliente: {
          id: this.lastID,
          nombre: nombre.trim(),
          documento: documento?.trim() || null,
          tipo_documento,
          telefono,
          email,
          direccion,
          notas,
          activo: activo ? 1 : 0,
        },
      });
    });
  });
});

app.put('/api/clientes/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const id = Number(req.params.id);
    const { nombre, documento, tipo_documento, telefono, email, direccion, notas, activo = 1 } = req.body || {};
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: 'ID de cliente inv\u00e1lido' });
    }
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ ok: false, error: 'El nombre del cliente es obligatorio' });
    }

    const sql = `UPDATE clientes
                 SET nombre = ?, documento = ?, tipo_documento = ?, telefono = ?, email = ?, direccion = ?, notas = ?, activo = ?, actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = ? AND negocio_id = ?`;
    const params = [
      nombre.trim(),
      documento?.trim() || null,
      tipo_documento || null,
      telefono || null,
      email || null,
      direccion || null,
      notas || null,
      activo ? 1 : 0,
      id,
      usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al actualizar cliente:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo actualizar el cliente' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
      }
      res.json({ ok: true });
    });
  });
});

app.get('/api/delivery/pedidos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (
      !esUsuarioDelivery(usuarioSesion) &&
      !esUsuarioAdmin(usuarioSesion) &&
      !esUsuarioEmpresa(usuarioSesion) &&
      !esUsuarioSupervisor(usuarioSesion)
    ) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const estadoSolicitado = normalizarEstadoDelivery(req.query?.estado, null);
    const soloMios =
      normalizarFlag(req.query?.mios ?? req.query?.solo_mios ?? req.query?.soloMios, 0) === 1;

    const filtros = ["p.modo_servicio = 'delivery'", 'p.negocio_id = ?'];
    const params = [negocioId];
    if (estadoSolicitado) {
      filtros.push("COALESCE(p.delivery_estado, 'pendiente') = ?");
      params.push(estadoSolicitado);
    }
    if (soloMios) {
      filtros.push('p.delivery_usuario_id = ?');
      params.push(usuarioSesion.id);
    }

    try {
      const pedidos = await db.all(
        `
          SELECT p.id, p.cuenta_id, p.mesa, p.cliente, p.modo_servicio, p.estado, p.nota,
                 p.subtotal, p.impuesto, p.total, p.fecha_creacion, p.fecha_listo, p.fecha_cierre,
                 p.delivery_estado, p.delivery_usuario_id, p.delivery_usuario_nombre,
                 p.delivery_fecha_asignacion, p.delivery_fecha_entrega,
                 p.delivery_telefono, p.delivery_direccion, p.delivery_referencia, p.delivery_notas
          FROM pedidos p
          WHERE ${filtros.join(' AND ')}
          ORDER BY COALESCE(p.fecha_listo, p.fecha_creacion) ASC
        `,
        params
      );

      if (!pedidos.length) {
        return res.json([]);
      }

      const pedidoIds = pedidos.map((pedido) => pedido.id);
      const detalle = await obtenerDetallePedidosPorIds(pedidoIds, negocioId);

      const pedidosConItems = pedidos.map((pedido) => ({
        ...pedido,
        items: detalle.get(pedido.id) || [],
      }));

      res.json(pedidosConItems);
    } catch (error) {
      console.error('Error al obtener pedidos delivery:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos de delivery.' });
    }
  });
});

app.put('/api/delivery/pedidos/:id/aceptar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioDelivery(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.params.id);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ error: 'Pedido no valido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const pedido = await db.get(
        `SELECT id, modo_servicio, delivery_estado, delivery_usuario_id
           FROM pedidos
          WHERE id = ? AND negocio_id = ?`,
        [pedidoId, negocioId]
      );

      if (!pedido) {
        return res.status(404).json({ error: 'Pedido no encontrado.' });
      }

      if (pedido.modo_servicio !== 'delivery') {
        return res.status(400).json({ error: 'El pedido no es de delivery.' });
      }

      const estadoActual = (pedido.delivery_estado || 'pendiente').toString().toLowerCase();
      if (estadoActual !== 'disponible') {
        return res.status(400).json({ error: 'El pedido no esta disponible para delivery.' });
      }

      await db.run(
        `UPDATE pedidos
            SET delivery_estado = ?, delivery_usuario_id = ?, delivery_usuario_nombre = ?, delivery_fecha_asignacion = CURRENT_TIMESTAMP
          WHERE id = ? AND negocio_id = ?`,
        ['asignado', usuarioSesion.id, usuarioSesion.nombre, pedidoId, negocioId]
      );

      res.json({ ok: true, estado: 'asignado' });
    } catch (error) {
      console.error('Error al aceptar pedido delivery:', error);
      res.status(500).json({ error: 'No se pudo aceptar el pedido de delivery.' });
    }
  });
});

app.put('/api/delivery/pedidos/:id/entregar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioDelivery(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.params.id);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ error: 'Pedido no valido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const pedido = await db.get(
        `SELECT id, modo_servicio, delivery_estado, delivery_usuario_id
           FROM pedidos
          WHERE id = ? AND negocio_id = ?`,
        [pedidoId, negocioId]
      );

      if (!pedido) {
        return res.status(404).json({ error: 'Pedido no encontrado.' });
      }

      if (pedido.modo_servicio !== 'delivery') {
        return res.status(400).json({ error: 'El pedido no es de delivery.' });
      }

      const estadoActual = (pedido.delivery_estado || 'pendiente').toString().toLowerCase();
      if (estadoActual !== 'asignado') {
        return res.status(400).json({ error: 'El pedido no esta asignado para entrega.' });
      }

      if (esUsuarioDelivery(usuarioSesion) && pedido.delivery_usuario_id !== usuarioSesion.id) {
        return res.status(403).json({ error: 'No puedes entregar un pedido asignado a otro delivery.' });
      }

      await db.run(
        `UPDATE pedidos
            SET delivery_estado = ?, delivery_fecha_entrega = CURRENT_TIMESTAMP
          WHERE id = ? AND negocio_id = ?`,
        ['entregado', pedidoId, negocioId]
      );

      res.json({ ok: true, estado: 'entregado' });
    } catch (error) {
      console.error('Error al entregar pedido delivery:', error);
      res.status(500).json({ error: 'No se pudo marcar el pedido como entregado.' });
    }
  });
});

app.put('/api/clientes/:id/estado', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const id = Number(req.params.id);
    const { activo = 1 } = req.body || {};
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: 'ID de cliente inv\u00e1lido' });
    }
    db.run(
      'UPDATE clientes SET activo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ? AND negocio_id = ?',
      [activo ? 1 : 0, id, usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT],
      function (err) {
        if (err) {
          console.error('Error al actualizar estado de cliente:', err.message);
          return res.status(500).json({ ok: false, error: 'No se pudo actualizar el estado del cliente' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
        }
        res.json({ ok: true });
      }
    );
  });
});

// --- Empresa: gestion de sucursales ---
app.get('/api/empresa/negocios', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    try {
      const rows = await db.all(
        `SELECT id, nombre, slug, activo, suspendido, deleted_at, empresa_id
           FROM negocios
          WHERE empresa_id = ?
          ORDER BY nombre ASC`,
        [empresaId]
      );
      res.json({ ok: true, negocios: rows || [] });
    } catch (error) {
      console.error('Error al listar sucursales de empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener las sucursales' });
    }
  });
});

app.get('/api/empresa/analytics/overview', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      const negocios = await db.all(
        `SELECT id, nombre, slug
           FROM negocios
          WHERE empresa_id = ?
            AND deleted_at IS NULL`,
        [empresaId]
      );
      const ids = (negocios || []).map((n) => Number(n.id)).filter((id) => Number.isFinite(id));
      if (!ids.length) {
        return res.json({
          ok: true,
          rango,
          resumen: {
            ventas_total: 0,
            ventas_count: 0,
            gastos_total: 0,
            ganancia_neta: 0,
            ticket_promedio: 0,
          },
          kpis: {
            nomina_total: 0,
            deudas_total: 0,
            deudas_abonos: 0,
            deudas_saldo: 0,
            usuarios_activos: 0,
          },
          sucursales: [],
        });
      }
      const placeholders = ids.map(() => '?').join(', ');
      const fechaBaseRaw = 'COALESCE(fecha_factura, fecha_cierre, fecha_creacion)';
      const fechaBase = `DATE(${fechaBaseRaw})`;
      const paramsBase = [...ids, rango.desde, rango.hasta];

      const supervisoresRows = await db.all(
        `SELECT u.id, u.nombre, u.usuario, u.negocio_id
           FROM usuarios u
          WHERE u.rol = 'supervisor'
            AND u.activo = 1
            AND u.empresa_id = ?`,
        [empresaId]
      );

      const ventasRows = await db.all(
        `
          SELECT negocio_id,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS total_ventas,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
            FROM pedidos
           WHERE estado = 'pagado'
             AND negocio_id IN (${placeholders})
             AND ${fechaBase} BETWEEN ? AND ?
           GROUP BY negocio_id
        `,
        paramsBase
      );
      const ventasDeudasRows = await db.all(
        `
          SELECT negocio_id,
                 COUNT(DISTINCT id) AS total_ventas,
                 SUM(monto_total) AS total
            FROM clientes_deudas
           WHERE negocio_id IN (${placeholders})
             AND DATE(fecha) BETWEEN ? AND ?
           GROUP BY negocio_id
        `,
        paramsBase
      );

      const gastosRows = await db.all(
        `
          SELECT negocio_id, SUM(monto) AS total
            FROM gastos
           WHERE negocio_id IN (${placeholders})
             AND DATE(fecha) BETWEEN ? AND ?
             AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
           GROUP BY negocio_id
        `,
        paramsBase
      );

      const nominaRow = await db.get(
        `
          SELECT SUM(monto) AS total
            FROM gastos
           WHERE negocio_id IN (${placeholders})
             AND DATE(fecha) BETWEEN ? AND ?
             AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
             AND (
               origen = 'nomina'
               OR LOWER(COALESCE(categoria, '')) LIKE 'nomina%'
               OR LOWER(COALESCE(descripcion, '')) LIKE 'nomina%'
             )
        `,
        paramsBase
      );

      const deudasRow = await db.get(
        `
          SELECT SUM(monto_total) AS total
            FROM clientes_deudas
           WHERE negocio_id IN (${placeholders})
             AND DATE(fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );

      const abonosRow = await db.get(
        `
          SELECT SUM(monto) AS total
            FROM clientes_abonos
           WHERE negocio_id IN (${placeholders})
             AND DATE(fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );

      const usuariosRow = await db.get(
        `
          SELECT COUNT(1) AS total
            FROM usuarios
           WHERE empresa_id = ?
             AND activo = 1
             AND (rol IS NULL OR rol <> 'empresa')
        `,
        [empresaId]
      );

      const ventasMap = new Map();
      [...(ventasRows || []), ...(ventasDeudasRows || [])].forEach((row) => {
        const negocioIdRow = Number(row?.negocio_id);
        if (!Number.isFinite(negocioIdRow)) return;
        const actual = ventasMap.get(negocioIdRow) || { total_ventas: 0, total: 0 };
        actual.total_ventas += Number(row?.total_ventas) || 0;
        actual.total += Number(row?.total) || 0;
        ventasMap.set(negocioIdRow, actual);
      });
      const gastosMap = new Map((gastosRows || []).map((row) => [Number(row.negocio_id), row]));
      let totalVentas = 0;
      let totalGastos = 0;
      let totalVentasCount = 0;
      (negocios || []).forEach((neg) => {
        const ventasRow = ventasMap.get(Number(neg.id)) || {};
        const gastosRow = gastosMap.get(Number(neg.id)) || {};
        const ventasTotal = Number(ventasRow.total) || 0;
        const ventasCount = Number(ventasRow.total_ventas) || 0;
        const gastosTotal = Number(gastosRow.total) || 0;
        totalVentas += ventasTotal;
        totalGastos += gastosTotal;
        totalVentasCount += ventasCount;
      });

      const supervisorMap = new Map();
      (supervisoresRows || []).forEach((row) => {
        const negocioId = Number(row.negocio_id);
        if (!Number.isFinite(negocioId)) return;
        if (!supervisorMap.has(negocioId)) {
          supervisorMap.set(negocioId, row);
        }
      });

      const sucursales = (negocios || []).map((neg) => {
        const negocioId = Number(neg.id);
        const ventasRow = ventasMap.get(negocioId) || {};
        const gastosRow = gastosMap.get(negocioId) || {};
        const ventasTotal = Number(ventasRow.total) || 0;
        const ventasCount = Number(ventasRow.total_ventas) || 0;
        const gastosTotal = Number(gastosRow.total) || 0;
        const gananciaNeta = Number((ventasTotal - gastosTotal).toFixed(2));
        const ticketPromedio = ventasCount > 0 ? Number((ventasTotal / ventasCount).toFixed(2)) : 0;
        const supervisor = supervisorMap.get(negocioId) || null;

        return {
          id: negocioId,
          nombre: neg.nombre,
          slug: neg.slug,
          sucursal_nombre: neg.nombre,
          sucursal_slug: neg.slug,
          supervisor_id: supervisor?.id || null,
          supervisor_nombre: supervisor?.nombre || null,
          supervisor_usuario: supervisor?.usuario || null,
          ventas_total: ventasTotal,
          ventas_count: ventasCount,
          gastos_total: gastosTotal,
          ganancia_neta: gananciaNeta,
          ticket_promedio: ticketPromedio,
        };
      });

      const resumen = {
        ventas_total: Number(totalVentas.toFixed(2)),
        ventas_count: totalVentasCount,
        gastos_total: Number(totalGastos.toFixed(2)),
        ganancia_neta: Number((totalVentas - totalGastos).toFixed(2)),
        ticket_promedio: totalVentasCount > 0 ? Number((totalVentas / totalVentasCount).toFixed(2)) : 0,
      };

      const nominaTotal = Number(nominaRow?.total || 0);
      const deudasTotal = Number(deudasRow?.total || 0);
      const abonosTotal = Number(abonosRow?.total || 0);
      const deudasSaldo = Math.max(deudasTotal - abonosTotal, 0);
      const usuariosActivos = Number(usuariosRow?.total || 0);

      const kpis = {
        nomina_total: Number(nominaTotal.toFixed(2)),
        deudas_total: Number(deudasTotal.toFixed(2)),
        deudas_abonos: Number(abonosTotal.toFixed(2)),
        deudas_saldo: Number(deudasSaldo.toFixed(2)),
        usuarios_activos: usuariosActivos,
      };

      res.json({ ok: true, rango, resumen, kpis, sucursales });
    } catch (error) {
      console.error('Error al generar analisis empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar el analisis de la empresa' });
    }
  });
});

// Empresa: productos maestro
app.get('/api/empresa/productos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    try {
      const metodoValoracion = await obtenerMetodoValoracionEmpresa(empresaId);
      const rows = await db.all(
        `SELECT id, nombre, categoria, tipo_producto, costo_base, costo_promedio_actual, precio_sugerido, activo,
                sku, codigo_barras, familia, tags, atributos_json, stock, stock_minimo, stock_indefinido,
                ubicacion, bodega, serializable
           FROM empresa_productos
          WHERE empresa_id = ?
          ORDER BY nombre ASC`,
        [empresaId]
      );
      let valoresMap = new Map();
      if (metodoValoracion === 'PEPS') {
        const valores = await db.all(
          `SELECT producto_id, SUM(cantidad_restante * costo_unitario) AS valor
             FROM empresa_inventario_capas
            WHERE empresa_id = ?
            GROUP BY producto_id`,
          [empresaId]
        );
        valoresMap = new Map((valores || []).map((row) => [Number(row.producto_id), Number(row.valor) || 0]));
      }
      const productos = (rows || []).map((row) => {
        const stock = Number(row.stock || 0);
        const stockIndefinido = Number(row.stock_indefinido || 0) === 1;
        let valorInventario = 0;
        if (!stockIndefinido) {
          if (metodoValoracion === 'PEPS') {
            valorInventario = valoresMap.get(Number(row.id)) || 0;
            if (!valorInventario && stock > 0) {
              const costoBase = Number(row.costo_promedio_actual || row.costo_base || 0);
              valorInventario = stock * costoBase;
            }
          } else {
            const costoBase = Number(row.costo_promedio_actual || row.costo_base || 0);
            valorInventario = stock * costoBase;
          }
        }
        const costoValoracion = stock > 0 ? Number((valorInventario / stock).toFixed(4)) : 0;
        return {
          ...row,
          valor_inventario: Number(valorInventario.toFixed(4)),
          costo_valoracion: costoValoracion,
        };
      });
      res.json({ ok: true, metodo_valoracion: metodoValoracion, productos });
    } catch (error) {
      console.error('Error al listar productos empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los productos' });
    }
  });
});

app.post('/api/empresa/productos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
    }
    const categoria = normalizarCampoTexto(req.body?.categoria, null);
    const sku = normalizarCampoTexto(req.body?.sku, null);
    const codigoBarras = normalizarCampoTexto(req.body?.codigo_barras ?? req.body?.codigoBarras, null);
    const familia = normalizarCampoTexto(req.body?.familia, null);
    const tags = normalizarCampoTexto(req.body?.tags, null);
    const ubicacion = normalizarCampoTexto(req.body?.ubicacion, null);
    const bodega = normalizarCampoTexto(req.body?.bodega, null);
    const serializable = normalizarFlag(req.body?.serializable, 0) ? 1 : 0;
    const stockIndefinido = normalizarFlag(req.body?.stock_indefinido ?? req.body?.stockIndefinido, 0) ? 1 : 0;
    const stockMinimo = normalizarNumero(req.body?.stock_minimo ?? req.body?.stockMinimo, 0);
    let stock = normalizarNumero(req.body?.stock, 0);
    if (stockIndefinido) {
      stock = null;
    }
    let atributosJson = null;
    if (req.body?.atributos_json !== undefined || req.body?.atributosJson !== undefined) {
      const raw = req.body?.atributos_json ?? req.body?.atributosJson;
      if (raw === null || raw === '') {
        atributosJson = null;
      } else if (typeof raw === 'object') {
        atributosJson = JSON.stringify(raw);
      } else {
        try {
          atributosJson = JSON.stringify(JSON.parse(raw));
        } catch (error) {
          return res.status(400).json({ ok: false, error: 'Atributos invalidos. Debe ser JSON.' });
        }
      }
    }
    const tipoProducto = (req.body?.tipo_producto || req.body?.tipo || 'FINAL').toString().toUpperCase();
    if (!['FINAL', 'INSUMO'].includes(tipoProducto)) {
      return res.status(400).json({ ok: false, error: 'Tipo de producto invalido' });
    }
    const costoBase = Number(req.body?.costo_base || 0) || 0;
    const precioSugerido = Number(req.body?.precio_sugerido || 0) || 0;
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;

    try {
      const insert = await db.run(
        `INSERT INTO empresa_productos (
            empresa_id, nombre, categoria, tipo_producto, costo_base, precio_sugerido, activo,
            sku, codigo_barras, familia, tags, atributos_json, stock, stock_minimo, stock_indefinido,
            ubicacion, bodega, serializable
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          empresaId,
          nombre,
          categoria,
          tipoProducto,
          costoBase,
          precioSugerido,
          activo,
          sku,
          codigoBarras,
          familia,
          tags,
          atributosJson,
          stock,
          stockMinimo,
          stockIndefinido,
          ubicacion,
          bodega,
          serializable,
        ]
      );
      res.status(201).json({
        ok: true,
        producto: {
          id: insert.lastID,
          nombre,
          categoria,
          tipo_producto: tipoProducto,
          costo_base: costoBase,
          precio_sugerido: precioSugerido,
          activo,
          sku,
          codigo_barras: codigoBarras,
          familia,
          tags,
          atributos_json: atributosJson,
          stock,
          stock_minimo: stockMinimo,
          stock_indefinido: stockIndefinido,
          ubicacion,
          bodega,
          serializable,
        },
      });
    } catch (error) {
      console.error('Error al crear producto empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el producto' });
    }
  });
});

app.put('/api/empresa/productos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }

    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
    }
    const categoria = normalizarCampoTexto(req.body?.categoria, null);
    const sku = normalizarCampoTexto(req.body?.sku, null);
    const codigoBarras = normalizarCampoTexto(req.body?.codigo_barras ?? req.body?.codigoBarras, null);
    const familia = normalizarCampoTexto(req.body?.familia, null);
    const tags = normalizarCampoTexto(req.body?.tags, null);
    const ubicacion = normalizarCampoTexto(req.body?.ubicacion, null);
    const bodega = normalizarCampoTexto(req.body?.bodega, null);
    const serializable = normalizarFlag(req.body?.serializable, 0) ? 1 : 0;
    const stockIndefinido = normalizarFlag(req.body?.stock_indefinido ?? req.body?.stockIndefinido, 0) ? 1 : 0;
    const stockMinimo = normalizarNumero(req.body?.stock_minimo ?? req.body?.stockMinimo, 0);
    let stock = normalizarNumero(req.body?.stock, 0);
    if (stockIndefinido) {
      stock = null;
    }
    let atributosJson = null;
    if (req.body?.atributos_json !== undefined || req.body?.atributosJson !== undefined) {
      const raw = req.body?.atributos_json ?? req.body?.atributosJson;
      if (raw === null || raw === '') {
        atributosJson = null;
      } else if (typeof raw === 'object') {
        atributosJson = JSON.stringify(raw);
      } else {
        try {
          atributosJson = JSON.stringify(JSON.parse(raw));
        } catch (error) {
          return res.status(400).json({ ok: false, error: 'Atributos invalidos. Debe ser JSON.' });
        }
      }
    }
    const tipoProducto = (req.body?.tipo_producto || req.body?.tipo || 'FINAL').toString().toUpperCase();
    if (!['FINAL', 'INSUMO'].includes(tipoProducto)) {
      return res.status(400).json({ ok: false, error: 'Tipo de producto invalido' });
    }
    const costoBase = Number(req.body?.costo_base || 0) || 0;
    const precioSugerido = Number(req.body?.precio_sugerido || 0) || 0;
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;

    try {
      const result = await db.run(
        `UPDATE empresa_productos
            SET nombre = ?, categoria = ?, tipo_producto = ?, costo_base = ?, precio_sugerido = ?, activo = ?,
                sku = ?, codigo_barras = ?, familia = ?, tags = ?, atributos_json = ?, stock = ?, stock_minimo = ?,
                stock_indefinido = ?, ubicacion = ?, bodega = ?, serializable = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ?`,
        [
          nombre,
          categoria,
          tipoProducto,
          costoBase,
          precioSugerido,
          activo,
          sku,
          codigoBarras,
          familia,
          tags,
          atributosJson,
          stock,
          stockMinimo,
          stockIndefinido,
          ubicacion,
          bodega,
          serializable,
          id,
          empresaId,
        ]
      );
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al actualizar producto empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el producto' });
    }
  });
});

app.delete('/api/empresa/productos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }
    try {
      const result = await db.run('DELETE FROM empresa_productos WHERE id = ? AND empresa_id = ?', [id, empresaId]);
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al eliminar producto empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el producto' });
    }
  });
});

app.get('/api/empresa/inventario/config', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    try {
      const metodo = await obtenerMetodoValoracionEmpresa(empresaId);
      res.json({ ok: true, metodo_valoracion: metodo });
    } catch (error) {
      console.error('Error al obtener configuracion de inventario empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo consultar la configuracion.' });
    }
  });
});

app.put('/api/empresa/inventario/config', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const rawMetodo = req.body?.metodo_valoracion ?? req.body?.metodoValoracion;
    const metodo = normalizarMetodoValoracionInventario(rawMetodo, INVENTARIO_VALORACION_DEFAULT);
    try {
      const guardado = await guardarMetodoValoracionEmpresa(empresaId, metodo);
      res.json({ ok: true, metodo_valoracion: guardado });
    } catch (error) {
      console.error('Error al guardar configuracion de inventario empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar la configuracion.' });
    }
  });
});

app.get('/api/empresa/inventario/movimientos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const hoy = new Date();
    const desdeRaw = req.query?.from || req.query?.desde;
    const hastaRaw = req.query?.to || req.query?.hasta;
    const desde = desdeRaw ? new Date(desdeRaw) : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29);
    const hasta = hastaRaw ? new Date(hastaRaw) : hoy;
    const fechaDesde = getLocalDateISO(desde);
    const fechaHasta = getLocalDateISO(hasta);
    const productoId = Number(req.query?.producto_id || req.query?.productoId || 0);
    const tipo = req.query?.tipo ? String(req.query.tipo).trim().toUpperCase() : '';
    const params = [empresaId, fechaDesde, fechaHasta];
    let filtro = '';
    if (Number.isFinite(productoId) && productoId > 0) {
      filtro += ' AND m.producto_id = ?';
      params.push(productoId);
    }
    if (tipo && ['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipo)) {
      filtro += ' AND m.tipo = ?';
      params.push(tipo);
    }
    try {
      const rows = await db.all(
        `SELECT m.id, m.fecha, m.tipo, m.cantidad, m.costo_unitario, m.motivo, m.referencia,
                m.stock_antes, m.stock_despues,
                p.nombre AS producto_nombre,
                u.nombre AS usuario_nombre
           FROM empresa_inventario_movimientos m
           JOIN empresa_productos p ON p.id = m.producto_id
           LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.empresa_id = ?
            AND DATE(m.fecha) BETWEEN ? AND ?
            ${filtro}
          ORDER BY m.fecha DESC, m.id DESC`,
        params
      );
      res.json({ ok: true, movimientos: rows || [] });
    } catch (error) {
      console.error('Error al listar movimientos de inventario empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los movimientos' });
    }
  });
});

app.post('/api/empresa/inventario/movimientos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const productoId = Number(req.body?.producto_id || req.body?.productoId);
    if (!Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: 'Producto invalido' });
    }
    const tipo = String(req.body?.tipo || '').trim().toUpperCase();
    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'Tipo de movimiento invalido' });
    }
    const cantidadRaw = normalizarNumero(req.body?.cantidad, null);
    if (!Number.isFinite(cantidadRaw) || cantidadRaw === 0) {
      return res.status(400).json({ ok: false, error: 'Cantidad invalida' });
    }
    const fecha = req.body?.fecha ? new Date(req.body.fecha) : new Date();
    const motivo = normalizarCampoTexto(req.body?.motivo ?? req.body?.descripcion, null);
    const referencia = normalizarCampoTexto(req.body?.referencia, null);

    try {
      const producto = await db.get(
        `SELECT id, nombre, stock, stock_indefinido, costo_base, costo_promedio_actual
           FROM empresa_productos
          WHERE id = ? AND empresa_id = ?
          LIMIT 1`,
        [productoId, empresaId]
      );
      if (!producto) {
        return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
      }

      const metodoValoracion = await obtenerMetodoValoracionEmpresa(empresaId);
      const stockIndefinido = Number(producto.stock_indefinido || 0) === 1;
      const stockAntes = stockIndefinido ? null : Number(producto.stock || 0);
      let cantidad = Number(cantidadRaw);
      if (tipo === 'ENTRADA' || tipo === 'SALIDA') {
        cantidad = Math.abs(cantidad);
      }
      const esSalida = tipo === 'SALIDA' || (tipo === 'AJUSTE' && cantidad < 0);
      const cantidadAbs = Math.abs(cantidad);

      let costoUnitario = normalizarNumero(req.body?.costo_unitario ?? req.body?.costoUnitario, 0);
      if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
        costoUnitario = Number(producto.costo_promedio_actual || producto.costo_base || 0);
      }
      let costoTotalMovimiento = cantidadAbs * costoUnitario;

      if (metodoValoracion === 'PEPS' && esSalida && cantidadAbs > 0) {
        const consumo = await consumirCapasInventarioEmpresa({ empresaId, productoId, cantidad: cantidadAbs });
        if (consumo.cantidadConsumida > 0) {
          const restante = Math.max(cantidadAbs - consumo.cantidadConsumida, 0);
          costoTotalMovimiento = consumo.costoTotal + restante * costoUnitario;
          costoUnitario =
            consumo.cantidadConsumida > 0
              ? (consumo.costoTotal + restante * costoUnitario) / cantidadAbs
              : costoUnitario;
        }
      }

      let stockDespues = stockAntes;
      if (!stockIndefinido && Number.isFinite(stockAntes)) {
        if (tipo === 'ENTRADA') {
          stockDespues = stockAntes + cantidadAbs;
        } else if (tipo === 'SALIDA') {
          stockDespues = stockAntes - cantidadAbs;
        } else if (tipo === 'AJUSTE') {
          stockDespues = stockAntes + cantidad;
        }
        stockDespues = Number(stockDespues.toFixed(4));
      }

      if (!stockIndefinido && Number.isFinite(stockDespues)) {
        await db.run('UPDATE empresa_productos SET stock = ? WHERE id = ? AND empresa_id = ?', [
          stockDespues,
          productoId,
          empresaId,
        ]);
      }

      if (metodoValoracion === 'PROMEDIO' && !esSalida && cantidadAbs > 0 && !stockIndefinido) {
        const stockBase = Number(stockAntes || 0);
        const costoActual = Number(producto.costo_promedio_actual || producto.costo_base || 0);
        const nuevoTotal = stockBase + cantidadAbs;
        const nuevoCosto =
          nuevoTotal > 0 ? (stockBase * costoActual + cantidadAbs * costoUnitario) / nuevoTotal : costoUnitario;
        await db.run(
          'UPDATE empresa_productos SET costo_promedio_actual = ? WHERE id = ? AND empresa_id = ?',
          [Number(nuevoCosto.toFixed(4)), productoId, empresaId]
        );
      }

      if (metodoValoracion === 'PEPS' && !esSalida && cantidadAbs > 0) {
        await registrarCapaInventarioEmpresa({
          empresaId,
          productoId,
          cantidad: cantidadAbs,
          costoUnitario,
          fecha,
        });
      }

      await db.run(
        `INSERT INTO empresa_inventario_movimientos
          (empresa_id, producto_id, tipo, cantidad, costo_unitario, motivo, referencia, usuario_id, fecha, stock_antes, stock_despues)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          empresaId,
          productoId,
          tipo,
          cantidad,
          Number(costoUnitario.toFixed(4)),
          motivo,
          referencia,
          usuarioSesion?.id ?? null,
          fecha,
          stockAntes,
          stockDespues,
        ]
      );

      res.status(201).json({
        ok: true,
        movimiento: {
          producto_id: productoId,
          tipo,
          cantidad,
          costo_unitario: Number(costoUnitario.toFixed(4)),
          costo_total: Number(costoTotalMovimiento.toFixed(4)),
          stock_antes: stockAntes,
          stock_despues: stockDespues,
        },
      });
    } catch (error) {
      console.error('Error al registrar movimiento de inventario empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el movimiento' });
    }
  });
});

// Empresa: nomina
app.get('/api/empresa/nomina/empleados', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    try {
      const rows = await db.all(
        `SELECT id, nombre, documento, telefono, cargo, tipo_pago, sueldo_base, tarifa_hora,
                ars_porcentaje, afp_porcentaje, isr_porcentaje, activo, negocio_id
           FROM empresa_empleados
          WHERE empresa_id = ?
          ORDER BY nombre ASC`,
        [empresaId]
      );
      res.json({ ok: true, empleados: rows || [] });
    } catch (error) {
      console.error('Error al listar empleados empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los empleados' });
    }
  });
});

app.post('/api/empresa/nomina/empleados', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
    }
    const documento = normalizarCampoTexto(req.body?.documento, null);
    const telefono = normalizarCampoTexto(req.body?.telefono, null);
    const cargo = normalizarCampoTexto(req.body?.cargo, null);
    const tipoPago = (req.body?.tipo_pago || 'MENSUAL').toString().toUpperCase();
    if (!['MENSUAL', 'QUINCENAL', 'HORA'].includes(tipoPago)) {
      return res.status(400).json({ ok: false, error: 'Tipo de pago invalido' });
    }
    const sueldoBase = Number(req.body?.sueldo_base || 0) || 0;
    const tarifaHora = Number(req.body?.tarifa_hora || 0) || 0;
    const arsPorcentaje = Number(req.body?.ars_porcentaje ?? req.body?.ars ?? 0) || 0;
    const afpPorcentaje = Number(req.body?.afp_porcentaje ?? req.body?.afp ?? 0) || 0;
    const isrPorcentaje = Number(req.body?.isr_porcentaje ?? req.body?.isr ?? 0) || 0;
    if ([arsPorcentaje, afpPorcentaje, isrPorcentaje].some((valor) => valor < 0 || valor > 100)) {
      return res.status(400).json({ ok: false, error: 'Los descuentos deben estar entre 0% y 100%' });
    }
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    const negocioId = Number(req.body?.negocio_id || 0) || null;

    try {
      const insert = await db.run(
        `INSERT INTO empresa_empleados (empresa_id, negocio_id, nombre, documento, telefono, cargo, tipo_pago, sueldo_base, tarifa_hora,
                                        ars_porcentaje, afp_porcentaje, isr_porcentaje, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          empresaId,
          negocioId,
          nombre,
          documento,
          telefono,
          cargo,
          tipoPago,
          sueldoBase,
          tarifaHora,
          arsPorcentaje,
          afpPorcentaje,
          isrPorcentaje,
          activo,
        ]
      );
      res.status(201).json({ ok: true, empleado: { id: insert.lastID } });
    } catch (error) {
      console.error('Error al crear empleado empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el empleado' });
    }
  });
});

app.put('/api/empresa/nomina/empleados/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }
    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
    }
    const documento = normalizarCampoTexto(req.body?.documento, null);
    const telefono = normalizarCampoTexto(req.body?.telefono, null);
    const cargo = normalizarCampoTexto(req.body?.cargo, null);
    const tipoPago = (req.body?.tipo_pago || 'MENSUAL').toString().toUpperCase();
    if (!['MENSUAL', 'QUINCENAL', 'HORA'].includes(tipoPago)) {
      return res.status(400).json({ ok: false, error: 'Tipo de pago invalido' });
    }
    const sueldoBase = Number(req.body?.sueldo_base || 0) || 0;
    const tarifaHora = Number(req.body?.tarifa_hora || 0) || 0;
    const arsPorcentaje = Number(req.body?.ars_porcentaje ?? req.body?.ars ?? 0) || 0;
    const afpPorcentaje = Number(req.body?.afp_porcentaje ?? req.body?.afp ?? 0) || 0;
    const isrPorcentaje = Number(req.body?.isr_porcentaje ?? req.body?.isr ?? 0) || 0;
    if ([arsPorcentaje, afpPorcentaje, isrPorcentaje].some((valor) => valor < 0 || valor > 100)) {
      return res.status(400).json({ ok: false, error: 'Los descuentos deben estar entre 0% y 100%' });
    }
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    const negocioId = Number(req.body?.negocio_id || 0) || null;

    try {
      const result = await db.run(
        `UPDATE empresa_empleados
            SET nombre = ?, documento = ?, telefono = ?, cargo = ?, tipo_pago = ?, sueldo_base = ?, tarifa_hora = ?,
                ars_porcentaje = ?, afp_porcentaje = ?, isr_porcentaje = ?, activo = ?, negocio_id = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ?`,
        [
          nombre,
          documento,
          telefono,
          cargo,
          tipoPago,
          sueldoBase,
          tarifaHora,
          arsPorcentaje,
          afpPorcentaje,
          isrPorcentaje,
          activo,
          negocioId,
          id,
          empresaId,
        ]
      );
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al actualizar empleado empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el empleado' });
    }
  });
});

app.delete('/api/empresa/nomina/empleados/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }
    try {
      const result = await db.run('DELETE FROM empresa_empleados WHERE id = ? AND empresa_id = ?', [id, empresaId]);
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al eliminar empleado empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el empleado' });
    }
  });
});

app.post('/api/empresa/nomina/asistencias', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const empleadoId = Number(req.body?.empleado_id);
    const fecha = normalizarCampoTexto(req.body?.fecha, null);
    const horaEntrada = normalizarCampoTexto(req.body?.hora_entrada, null);
    const horaSalida = normalizarCampoTexto(req.body?.hora_salida, null);
    if (!empleadoId || !fecha || !horaEntrada || !horaSalida) {
      return res.status(400).json({ ok: false, error: 'Completa empleado, fecha y horas' });
    }

    const empleado = await db.get(
      'SELECT id, empresa_id, negocio_id FROM empresa_empleados WHERE id = ? LIMIT 1',
      [empleadoId]
    );
    if (!empleado || Number(empleado.empresa_id) !== Number(empresaId)) {
      return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    }

    const parseHora = (valor) => {
      const [h, m] = String(valor).split(':').map((item) => Number(item));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const inicio = parseHora(horaEntrada);
    const fin = parseHora(horaSalida);
    if (inicio === null || fin === null) {
      return res.status(400).json({ ok: false, error: 'Hora invalida' });
    }
    let minutos = fin - inicio;
    if (minutos < 0) {
      minutos += 24 * 60;
    }
    const horas = Number((minutos / 60).toFixed(2));

    try {
      await db.run(
        `INSERT INTO empresa_asistencias (empleado_id, negocio_id, fecha, hora_entrada, hora_salida, horas)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [empleadoId, empleado.negocio_id ?? null, fecha, horaEntrada, horaSalida, horas]
      );
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error al registrar asistencia:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar la asistencia' });
    }
  });
});

app.post('/api/empresa/nomina/movimientos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const empleadoId = Number(req.body?.empleado_id);
    const tipo = (req.body?.tipo || 'COMISION').toString().toUpperCase();
    const fecha = normalizarCampoTexto(req.body?.fecha, null);
    const notas = normalizarCampoTexto(req.body?.notas, null);
    const monto = Number(req.body?.monto || 0) || 0;
    if (!empleadoId || !fecha || !monto) {
      return res.status(400).json({ ok: false, error: 'Empleado, fecha y monto son obligatorios' });
    }
    if (!['COMISION', 'BONO', 'DEDUCCION'].includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'Tipo invalido' });
    }
    const empleado = await db.get(
      'SELECT id, empresa_id, negocio_id FROM empresa_empleados WHERE id = ? LIMIT 1',
      [empleadoId]
    );
    if (!empleado || Number(empleado.empresa_id) !== Number(empresaId)) {
      return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    }
    try {
      await db.run(
        `INSERT INTO empresa_nomina_movimientos (empleado_id, negocio_id, tipo, monto, fecha, notas)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [empleadoId, empleado.negocio_id ?? null, tipo, monto, fecha, notas]
      );
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error al registrar movimiento de nomina:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el movimiento' });
    }
  });
});

app.get('/api/empresa/nomina/resumen', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      const empleados = await db.all(
        `SELECT id, nombre, tipo_pago, sueldo_base, tarifa_hora, ars_porcentaje, afp_porcentaje, isr_porcentaje
           FROM empresa_empleados
          WHERE empresa_id = ?
            AND activo = 1
          ORDER BY nombre ASC`,
        [empresaId]
      );
      const ids = (empleados || []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
      if (!ids.length) {
        return res.json({ ok: true, rango, resumen: {}, detalle: [] });
      }
      const placeholders = ids.map(() => '?').join(', ');

      const asistencias = await db.all(
        `SELECT empleado_id, SUM(horas) AS total_horas
           FROM empresa_asistencias
          WHERE empleado_id IN (${placeholders})
            AND fecha BETWEEN ? AND ?
          GROUP BY empleado_id`,
        [...ids, rango.desde, rango.hasta]
      );

      const movimientos = await db.all(
        `SELECT empleado_id, tipo, SUM(monto) AS total
           FROM empresa_nomina_movimientos
          WHERE empleado_id IN (${placeholders})
            AND fecha BETWEEN ? AND ?
          GROUP BY empleado_id, tipo`,
        [...ids, rango.desde, rango.hasta]
      );

      const horasMap = new Map((asistencias || []).map((row) => [Number(row.empleado_id), Number(row.total_horas) || 0]));
      const movimientosMap = new Map();
      (movimientos || []).forEach((row) => {
        const key = Number(row.empleado_id);
        if (!movimientosMap.has(key)) {
          movimientosMap.set(key, { COMISION: 0, BONO: 0, DEDUCCION: 0 });
        }
        const item = movimientosMap.get(key);
        item[row.tipo] = Number(row.total) || 0;
      });

      const resumen = { sueldos_base: 0, comisiones: 0, bonos: 0, deducciones: 0, total_pagar: 0 };
      const detalle = (empleados || []).map((emp) => {
        const horas = horasMap.get(Number(emp.id)) || 0;
        let base = 0;
        if (emp.tipo_pago === 'HORA') {
          base = Number((horas * (Number(emp.tarifa_hora) || 0)).toFixed(2));
        } else if (emp.tipo_pago === 'QUINCENAL') {
          base = Number(((Number(emp.sueldo_base) || 0) / 2).toFixed(2));
        } else {
          base = Number(emp.sueldo_base || 0);
        }

        const mov = movimientosMap.get(Number(emp.id)) || { COMISION: 0, BONO: 0, DEDUCCION: 0 };
        const comisiones = Number(mov.COMISION || 0);
        const bonos = Number(mov.BONO || 0);

        const arsPct = Number(emp.ars_porcentaje || 0);
        const afpPct = Number(emp.afp_porcentaje || 0);
        const isrPct = Number(emp.isr_porcentaje || 0);
        const arsMonto = Number(((base * arsPct) / 100).toFixed(2));
        const afpMonto = Number(((base * afpPct) / 100).toFixed(2));
        const isrMonto = Number(((base * isrPct) / 100).toFixed(2));
        const deduccionesLegales = Number((arsMonto + afpMonto + isrMonto).toFixed(2));
        const deduccionesMov = Number(mov.DEDUCCION || 0);
        const deducciones = Number((deduccionesLegales + deduccionesMov).toFixed(2));
        const total = Number((base + comisiones + bonos - deducciones).toFixed(2));

        resumen.sueldos_base += base;
        resumen.comisiones += comisiones;
        resumen.bonos += bonos;
        resumen.deducciones += deducciones;
        resumen.total_pagar += total;

        return {
          empleado_id: emp.id,
          nombre: emp.nombre,
          base,
          comisiones,
          bonos,
          deducciones,
          deducciones_legales: deduccionesLegales,
          deducciones_movimientos: deduccionesMov,
          ars_monto: arsMonto,
          afp_monto: afpMonto,
          isr_monto: isrMonto,
          total,
        };
      });

      res.json({ ok: true, rango, resumen, detalle });
    } catch (error) {
      console.error('Error al generar resumen nomina:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar la nomina' });
    }
  });
});

// ==========================
// Contabilidad (doble partida)
// ==========================
const CONTABILIDAD_CUENTAS_BASE = [
  { codigo: '1.1.1', nombre: 'Caja', tipo: 'ACTIVO', alias: 'CAJA' },
  { codigo: '1.1.2', nombre: 'Bancos', tipo: 'ACTIVO', alias: 'BANCO' },
  { codigo: '1.1.3', nombre: 'Cuentas por cobrar', tipo: 'ACTIVO', alias: 'CXC' },
  { codigo: '1.1.4', nombre: 'Inventario', tipo: 'ACTIVO', alias: 'INVENTARIO' },
  { codigo: '1.1.5', nombre: 'ITBIS acreditable', tipo: 'ACTIVO', alias: 'ITBIS_ACREDITABLE' },
  { codigo: '1.2.1', nombre: 'Activos fijos', tipo: 'ACTIVO', alias: 'ACTIVOS_FIJOS' },
  { codigo: '2.1.1', nombre: 'Cuentas por pagar', tipo: 'PASIVO', alias: 'CXP' },
  { codigo: '2.1.2', nombre: 'ITBIS por pagar', tipo: 'PASIVO', alias: 'ITBIS_POR_PAGAR' },
  { codigo: '2.1.3', nombre: 'Sueldos por pagar', tipo: 'PASIVO', alias: 'SUELDOS_POR_PAGAR' },
  { codigo: '2.1.4', nombre: 'Prestamos', tipo: 'PASIVO', alias: 'PRESTAMOS' },
  { codigo: '3.1.1', nombre: 'Capital', tipo: 'PATRIMONIO', alias: 'CAPITAL' },
  { codigo: '3.1.2', nombre: 'Resultados acumulados', tipo: 'PATRIMONIO', alias: 'RESULTADOS_ACUMULADOS' },
  { codigo: '3.1.3', nombre: 'Utilidad del periodo', tipo: 'PATRIMONIO', alias: 'UTILIDAD_PERIODO' },
  { codigo: '4.1.1', nombre: 'Ventas', tipo: 'INGRESO', alias: 'VENTAS' },
  { codigo: '4.1.2', nombre: 'Otros ingresos', tipo: 'INGRESO', alias: 'OTROS_INGRESOS' },
  { codigo: '4.1.3', nombre: 'Propinas', tipo: 'INGRESO', alias: 'PROPINA' },
  { codigo: '5.1.1', nombre: 'Costo de ventas', tipo: 'COSTO', alias: 'COGS' },
  { codigo: '6.1.1', nombre: 'Nomina', tipo: 'GASTO', alias: 'GASTO_NOMINA' },
  { codigo: '6.1.2', nombre: 'Alquiler', tipo: 'GASTO', alias: 'GASTO_ALQUILER' },
  { codigo: '6.1.3', nombre: 'Luz y agua', tipo: 'GASTO', alias: 'GASTO_SERVICIOS' },
  { codigo: '6.1.4', nombre: 'Marketing', tipo: 'GASTO', alias: 'GASTO_MARKETING' },
  { codigo: '6.1.5', nombre: 'Mantenimiento', tipo: 'GASTO', alias: 'GASTO_MANTENIMIENTO' },
  { codigo: '6.1.6', nombre: 'Comisiones', tipo: 'GASTO', alias: 'GASTO_COMISIONES' },
  { codigo: '6.1.7', nombre: 'Gastos generales', tipo: 'GASTO', alias: 'GASTOS_GENERALES' },
];

const asegurarPlanContableEmpresa = async (empresaId) => {
  const existe = await db.get(
    'SELECT id FROM contabilidad_cuentas WHERE empresa_id = ? LIMIT 1',
    [empresaId]
  );
  if (existe) return;
  for (const cuenta of CONTABILIDAD_CUENTAS_BASE) {
    await db.run(
      'INSERT INTO contabilidad_cuentas (empresa_id, codigo, nombre, tipo, alias) VALUES (?, ?, ?, ?, ?)',
      [empresaId, cuenta.codigo, cuenta.nombre, cuenta.tipo, cuenta.alias]
    );
  }
};

const obtenerMapaCuentasContables = async (empresaId) => {
  const rows = await db.all(
    'SELECT id, codigo, nombre, tipo, alias FROM contabilidad_cuentas WHERE empresa_id = ? AND activo = 1',
    [empresaId]
  );
  const map = new Map();
  (rows || []).forEach((row) => {
    if (row.alias) {
      map.set(row.alias, row);
    }
  });
  return { cuentas: rows || [], map };
};

const obtenerCuentaAlias = (cuentasMap, alias) => {
  const cuenta = cuentasMap.get(alias);
  if (!cuenta) {
    throw new Error(`Cuenta contable faltante: ${alias}`);
  }
  return cuenta;
};

const parseFechaContable = (fecha) => {
  const base = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(base.getTime())) return null;
  const anio = base.getFullYear();
  const mes = base.getMonth() + 1;
  return { anio, mes };
};

const periodoEstaCerrado = async (empresaId, fecha) => {
  const periodo = parseFechaContable(fecha);
  if (!periodo) return false;
  const row = await db.get(
    'SELECT estado FROM contabilidad_periodos WHERE empresa_id = ? AND anio = ? AND mes = ? LIMIT 1',
    [empresaId, periodo.anio, periodo.mes]
  );
  return row?.estado === 'CERRADO';
};

const asegurarPeriodo = async (empresaId, fecha) => {
  const periodo = parseFechaContable(fecha);
  if (!periodo) return;
  const row = await db.get(
    'SELECT id FROM contabilidad_periodos WHERE empresa_id = ? AND anio = ? AND mes = ? LIMIT 1',
    [empresaId, periodo.anio, periodo.mes]
  );
  if (row) return;
  await db.run(
    'INSERT INTO contabilidad_periodos (empresa_id, anio, mes, estado) VALUES (?, ?, ?, ?)',
    [empresaId, periodo.anio, periodo.mes, 'ABIERTO']
  );
};

const crearAsientoContable = async ({
  empresaId,
  negocioId,
  fecha,
  descripcion,
  referenciaTipo,
  referenciaId,
  lineas,
  usuarioId,
}) => {
  const lineasValidas = (lineas || []).filter((linea) => (Number(linea.debe) || 0) > 0 || (Number(linea.haber) || 0) > 0);
  if (!lineasValidas.length) return null;

  const totalDebe = lineasValidas.reduce((acc, linea) => acc + (Number(linea.debe) || 0), 0);
  const totalHaber = lineasValidas.reduce((acc, linea) => acc + (Number(linea.haber) || 0), 0);
  if (Math.abs(totalDebe - totalHaber) > 0.02) {
    throw new Error('Asiento descuadrado');
  }

  await asegurarPeriodo(empresaId, fecha);
  if (await periodoEstaCerrado(empresaId, fecha)) {
    return null;
  }

  await db.run('BEGIN');
  try {
    const asiento = await db.run(
      `INSERT INTO contabilidad_asientos (empresa_id, negocio_id, fecha, descripcion, referencia_tipo, referencia_id, estado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, 'CONTABILIZADO', ?)`,
      [empresaId, negocioId || null, fecha, descripcion || null, referenciaTipo || null, referenciaId || null, usuarioId || null]
    );
    const asientoId = asiento?.lastID;
    if (!asientoId) {
      throw new Error('No se pudo crear el asiento');
    }
    for (const linea of lineasValidas) {
      await db.run(
        `INSERT INTO contabilidad_asiento_lineas (asiento_id, cuenta_id, descripcion, debe, haber)
         VALUES (?, ?, ?, ?, ?)`,
        [asientoId, linea.cuenta_id, linea.descripcion || null, Number(linea.debe || 0), Number(linea.haber || 0)]
      );
    }
    await db.run('COMMIT');
    return asientoId;
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
};

const registrarEventoContable = async (empresaId, tipo, origenId, asientoId) => {
  if (!asientoId) return;
  await db.run(
    'INSERT INTO contabilidad_eventos (empresa_id, tipo, origen_id, asiento_id) VALUES (?, ?, ?, ?)',
    [empresaId, tipo, origenId, asientoId]
  );
};

const obtenerCuentaGasto = (categoria, cuentasMap) => {
  const valor = (categoria || '').toString().toLowerCase();
  if (valor.includes('nomina')) return obtenerCuentaAlias(cuentasMap, 'GASTO_NOMINA');
  if (valor.includes('alquiler') || valor.includes('renta')) return obtenerCuentaAlias(cuentasMap, 'GASTO_ALQUILER');
  if (valor.includes('luz') || valor.includes('agua') || valor.includes('energia')) return obtenerCuentaAlias(cuentasMap, 'GASTO_SERVICIOS');
  if (valor.includes('marketing') || valor.includes('publicidad')) return obtenerCuentaAlias(cuentasMap, 'GASTO_MARKETING');
  if (valor.includes('mantenimiento')) return obtenerCuentaAlias(cuentasMap, 'GASTO_MANTENIMIENTO');
  if (valor.includes('comision')) return obtenerCuentaAlias(cuentasMap, 'GASTO_COMISIONES');
  return obtenerCuentaAlias(cuentasMap, 'GASTOS_GENERALES');
};

const resolverCuentaPago = (metodoPago, origenFondos, cuentasMap) => {
  const metodo = (metodoPago || '').toString().toLowerCase();
  const origen = (origenFondos || '').toString().toLowerCase();
  if (!metodo || metodo.includes('credito')) {
    return obtenerCuentaAlias(cuentasMap, 'CXP');
  }
  if (origen === 'caja' || metodo.includes('efectivo')) {
    return obtenerCuentaAlias(cuentasMap, 'CAJA');
  }
  return obtenerCuentaAlias(cuentasMap, 'BANCO');
};

const contabilizarVentas = async (empresaId, desde, hasta, cuentasMap) => {
  const fechaBase = 'DATE(COALESCE(p.fecha_factura, p.fecha_cierre, p.fecha_creacion))';
  const rows = await db.all(
    `
      SELECT p.id, p.negocio_id, ${fechaBase} AS fecha, p.subtotal, p.impuesto, p.total, p.propina_monto, p.descuento_monto,
             p.pago_efectivo, p.pago_efectivo_entregado, p.pago_tarjeta, p.pago_transferencia, p.pago_cambio, p.cogs_total
        FROM pedidos p
        JOIN negocios n ON n.id = p.negocio_id
        LEFT JOIN contabilidad_eventos ce
               ON ce.empresa_id = n.empresa_id AND ce.tipo = 'VENTA' AND ce.origen_id = p.id
       WHERE n.empresa_id = ?
         AND n.deleted_at IS NULL
         AND p.estado = 'pagado'
         AND ${fechaBase} BETWEEN ? AND ?
         AND ce.id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  const cuentaCaja = obtenerCuentaAlias(cuentasMap, 'CAJA');
  const cuentaBanco = obtenerCuentaAlias(cuentasMap, 'BANCO');
  const cuentaVentas = obtenerCuentaAlias(cuentasMap, 'VENTAS');
  const cuentaItbis = obtenerCuentaAlias(cuentasMap, 'ITBIS_POR_PAGAR');
  const cuentaPropina = obtenerCuentaAlias(cuentasMap, 'PROPINA');
  const cuentaCogs = obtenerCuentaAlias(cuentasMap, 'COGS');
  const cuentaInventario = obtenerCuentaAlias(cuentasMap, 'INVENTARIO');

  for (const row of rows || []) {
    const fecha = row.fecha;
    const total = Number(row.total || 0);
    const itbis = Number(row.impuesto || 0);
    const propina = Number(row.propina_monto || 0);
    const pagoTarjeta = Number(row.pago_tarjeta || 0);
    const pagoTransferencia = Number(row.pago_transferencia || 0);
    const baseEfectivo = Number(row.pago_efectivo_entregado || 0) || Number(row.pago_efectivo || 0);
    const cambio = Number(row.pago_cambio || 0);
    let efectivo = Math.max(baseEfectivo - cambio, 0);
    let totalCobrado = Number((efectivo + pagoTarjeta + pagoTransferencia).toFixed(2));
    if (totalCobrado <= 0 && total > 0) {
      efectivo = total;
      totalCobrado = total;
    }

    const baseVenta = Math.max(0, Number((totalCobrado - itbis - propina).toFixed(2)));
    const lineas = [];
    if (efectivo > 0) {
      lineas.push({ cuenta_id: cuentaCaja.id, debe: efectivo, haber: 0, descripcion: 'Venta efectivo' });
    }
    const noEfectivo = Number((pagoTarjeta + pagoTransferencia).toFixed(2));
    if (noEfectivo > 0) {
      lineas.push({ cuenta_id: cuentaBanco.id, debe: noEfectivo, haber: 0, descripcion: 'Venta no efectivo' });
    }
    if (baseVenta > 0) {
      lineas.push({ cuenta_id: cuentaVentas.id, debe: 0, haber: baseVenta, descripcion: 'Ventas' });
    }
    if (itbis > 0) {
      lineas.push({ cuenta_id: cuentaItbis.id, debe: 0, haber: itbis, descripcion: 'ITBIS por pagar' });
    }
    if (propina > 0) {
      lineas.push({ cuenta_id: cuentaPropina.id, debe: 0, haber: propina, descripcion: 'Propinas' });
    }
    const cogs = Number(row.cogs_total || 0);
    if (cogs > 0) {
      lineas.push({ cuenta_id: cuentaCogs.id, debe: cogs, haber: 0, descripcion: 'Costo de ventas' });
      lineas.push({ cuenta_id: cuentaInventario.id, debe: 0, haber: cogs, descripcion: 'Salida de inventario' });
    }

    const asientoId = await crearAsientoContable({
      empresaId,
      negocioId: row.negocio_id,
      fecha,
      descripcion: 'Venta POS',
      referenciaTipo: 'VENTA',
      referenciaId: row.id,
      lineas,
    });
    if (asientoId) {
      await registrarEventoContable(empresaId, 'VENTA', row.id, asientoId);
    }
  }
};

const contabilizarCompras = async (empresaId, desde, hasta, cuentasMap) => {
  const rows = await db.all(
    `
      SELECT ci.id, ci.negocio_id, DATE(ci.fecha) AS fecha, ci.subtotal, ci.itbis, ci.total, ci.metodo_pago, ci.origen_fondos,
             ci.aplica_itbis, ci.itbis_capitalizable
        FROM compras_inventario ci
        JOIN negocios n ON n.id = ci.negocio_id
        LEFT JOIN contabilidad_eventos ce
               ON ce.empresa_id = n.empresa_id AND ce.tipo = 'COMPRA_INVENTARIO' AND ce.origen_id = ci.id
       WHERE n.empresa_id = ?
         AND n.deleted_at IS NULL
         AND DATE(ci.fecha) BETWEEN ? AND ?
         AND ce.id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  const cuentaInventario = obtenerCuentaAlias(cuentasMap, 'INVENTARIO');
  const cuentaItbisAcreditable = obtenerCuentaAlias(cuentasMap, 'ITBIS_ACREDITABLE');

  for (const row of rows || []) {
    const fecha = row.fecha;
    const subtotal = Number(row.subtotal || 0);
    const itbis = Number(row.itbis || 0);
    const total = Number(row.total || subtotal + itbis);
    const aplicaItbis = Number(row.aplica_itbis || 0) === 1;
    const itbisCapitalizable = Number(row.itbis_capitalizable || 0) === 1;
    const cuentaPago = resolverCuentaPago(row.metodo_pago, row.origen_fondos, cuentasMap);

    const lineas = [];
    const inventarioDebe = Number((subtotal + (aplicaItbis && itbisCapitalizable ? itbis : 0)).toFixed(2));
    if (inventarioDebe > 0) {
      lineas.push({ cuenta_id: cuentaInventario.id, debe: inventarioDebe, haber: 0, descripcion: 'Compra inventario' });
    }
    if (aplicaItbis && !itbisCapitalizable && itbis > 0) {
      lineas.push({ cuenta_id: cuentaItbisAcreditable.id, debe: itbis, haber: 0, descripcion: 'ITBIS acreditable' });
    }
    lineas.push({ cuenta_id: cuentaPago.id, debe: 0, haber: total, descripcion: 'Pago compra inventario' });

    const asientoId = await crearAsientoContable({
      empresaId,
      negocioId: row.negocio_id,
      fecha,
      descripcion: 'Compra de inventario',
      referenciaTipo: 'COMPRA_INVENTARIO',
      referenciaId: row.id,
      lineas,
    });
    if (asientoId) {
      await registrarEventoContable(empresaId, 'COMPRA_INVENTARIO', row.id, asientoId);
    }
  }
};

const contabilizarGastos = async (empresaId, desde, hasta, cuentasMap) => {
  const rows = await db.all(
    `
      SELECT g.id, g.negocio_id, g.fecha, g.monto, g.categoria, g.metodo_pago,
             COALESCE(g.origen_fondos, g.origen, 'manual') AS origen_fondos
        FROM gastos g
        LEFT JOIN negocios n ON n.id = g.negocio_id
        LEFT JOIN contabilidad_eventos ce
               ON ce.empresa_id = COALESCE(g.empresa_id, n.empresa_id) AND ce.tipo = 'GASTO' AND ce.origen_id = g.id
       WHERE COALESCE(g.empresa_id, n.empresa_id) = ?
         AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)
         AND g.fecha BETWEEN ? AND ?
         AND (g.estado IS NULL OR g.estado IN ('APROBADO', 'PAGADO'))
         AND ce.id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  for (const row of rows || []) {
    const fecha = row.fecha;
    const monto = Number(row.monto || 0);
    if (monto <= 0) continue;
    const cuentaGasto = obtenerCuentaGasto(row.categoria, cuentasMap);
    const cuentaPago = resolverCuentaPago(row.metodo_pago || 'efectivo', row.origen_fondos, cuentasMap);

    const lineas = [
      { cuenta_id: cuentaGasto.id, debe: monto, haber: 0, descripcion: 'Gasto operativo' },
      { cuenta_id: cuentaPago.id, debe: 0, haber: monto, descripcion: 'Pago gasto' },
    ];

    const asientoId = await crearAsientoContable({
      empresaId,
      negocioId: row.negocio_id,
      fecha,
      descripcion: 'Gasto',
      referenciaTipo: 'GASTO',
      referenciaId: row.id,
      lineas,
    });
    if (asientoId) {
      await registrarEventoContable(empresaId, 'GASTO', row.id, asientoId);
    }
  }
};

const contabilizarPagosGastos = async (empresaId, desde, hasta, cuentasMap) => {
  const rows = await db.all(
    `
      SELECT gp.id, gp.gasto_id, COALESCE(gp.negocio_id, g.negocio_id) AS negocio_id, gp.fecha, gp.monto, gp.metodo_pago,
             COALESCE(gp.origen_fondos, g.origen_fondos, g.origen, 'manual') AS origen_fondos
        FROM gastos_pagos gp
        JOIN gastos g ON g.id = gp.gasto_id
        LEFT JOIN negocios n ON n.id = COALESCE(gp.negocio_id, g.negocio_id)
        LEFT JOIN contabilidad_eventos ce
               ON ce.empresa_id = COALESCE(g.empresa_id, n.empresa_id) AND ce.tipo = 'PAGO_GASTO' AND ce.origen_id = gp.id
       WHERE COALESCE(g.empresa_id, n.empresa_id) = ?
         AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)
         AND gp.fecha BETWEEN ? AND ?
         AND ce.id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  const cuentaCxp = obtenerCuentaAlias(cuentasMap, 'CXP');

  for (const row of rows || []) {
    const fecha = row.fecha;
    const monto = Number(row.monto || 0);
    if (monto <= 0) continue;
    const cuentaPago = resolverCuentaPago(row.metodo_pago || 'efectivo', row.origen_fondos, cuentasMap);

    const lineas = [
      { cuenta_id: cuentaCxp.id, debe: monto, haber: 0, descripcion: 'Pago gasto a credito' },
      { cuenta_id: cuentaPago.id, debe: 0, haber: monto, descripcion: 'Salida por pago gasto' },
    ];

    const asientoId = await crearAsientoContable({
      empresaId,
      negocioId: row.negocio_id,
      fecha,
      descripcion: 'Pago gasto',
      referenciaTipo: 'PAGO_GASTO',
      referenciaId: row.id,
      lineas,
    });
    if (asientoId) {
      await registrarEventoContable(empresaId, 'PAGO_GASTO', row.id, asientoId);
    }
  }
};

const contabilizarCxC = async (empresaId, desde, hasta, cuentasMap) => {
  const rows = await db.all(
    `
      SELECT d.id, d.negocio_id, d.fecha, d.monto_total,
             (SELECT COALESCE(SUM(total_linea), 0)
                FROM clientes_deudas_detalle dd
               WHERE dd.deuda_id = d.id) AS subtotal_lineas
        FROM clientes_deudas d
        JOIN negocios n ON n.id = d.negocio_id
        LEFT JOIN contabilidad_eventos ce
               ON ce.empresa_id = n.empresa_id AND ce.tipo = 'CXC' AND ce.origen_id = d.id
       WHERE n.empresa_id = ?
         AND n.deleted_at IS NULL
         AND d.fecha BETWEEN ? AND ?
         AND ce.id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  const cuentaCxc = obtenerCuentaAlias(cuentasMap, 'CXC');
  const cuentaVentas = obtenerCuentaAlias(cuentasMap, 'VENTAS');
  const cuentaItbis = obtenerCuentaAlias(cuentasMap, 'ITBIS_POR_PAGAR');
  const cuentaCogs = obtenerCuentaAlias(cuentasMap, 'COGS');
  const cuentaInventario = obtenerCuentaAlias(cuentasMap, 'INVENTARIO');

  for (const row of rows || []) {
    const fecha = row.fecha;
    const montoTotal = Number(row.monto_total || 0);
    if (montoTotal <= 0) continue;
    const subtotalLineas = Number(row.subtotal_lineas || 0);
    let baseVentas = montoTotal;
    let itbis = 0;
    if (subtotalLineas > 0 && montoTotal >= subtotalLineas) {
      baseVentas = subtotalLineas;
      itbis = Number((montoTotal - subtotalLineas).toFixed(2));
    }

    const lineas = [
      { cuenta_id: cuentaCxc.id, debe: montoTotal, haber: 0, descripcion: 'Venta a credito' },
      { cuenta_id: cuentaVentas.id, debe: 0, haber: baseVentas, descripcion: 'Ventas credito' },
    ];
    if (itbis > 0) {
      lineas.push({ cuenta_id: cuentaItbis.id, debe: 0, haber: itbis, descripcion: 'ITBIS por pagar' });
    }

    const referenciaFactura = `FACTURA #${row.id}`;
    const costoRow = await db.get(
      `SELECT COALESCE(SUM(cantidad * costo_unitario), 0) AS costo
         FROM empresa_inventario_movimientos
        WHERE empresa_id = ?
          AND referencia = ?`,
      [empresaId, referenciaFactura]
    );
    const costoTotal = Number(costoRow?.costo || 0);
    if (costoTotal > 0) {
      lineas.push({ cuenta_id: cuentaCogs.id, debe: costoTotal, haber: 0, descripcion: 'Costo de ventas' });
      lineas.push({
        cuenta_id: cuentaInventario.id,
        debe: 0,
        haber: costoTotal,
        descripcion: 'Salida de inventario',
      });
    }

    const asientoId = await crearAsientoContable({
      empresaId,
      negocioId: row.negocio_id,
      fecha,
      descripcion: 'Cuenta por cobrar',
      referenciaTipo: 'CXC',
      referenciaId: row.id,
      lineas,
    });
    if (asientoId) {
      await registrarEventoContable(empresaId, 'CXC', row.id, asientoId);
    }
  }
};

const contabilizarAbonos = async (empresaId, desde, hasta, cuentasMap) => {
  const rows = await db.all(
    `
      SELECT a.id, a.negocio_id, a.fecha, a.monto, a.metodo_pago
        FROM clientes_abonos a
        JOIN negocios n ON n.id = a.negocio_id
        LEFT JOIN contabilidad_eventos ce
               ON ce.empresa_id = n.empresa_id AND ce.tipo = 'ABONO_CXC' AND ce.origen_id = a.id
       WHERE n.empresa_id = ?
         AND n.deleted_at IS NULL
         AND a.fecha BETWEEN ? AND ?
         AND ce.id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  const cuentaCxc = obtenerCuentaAlias(cuentasMap, 'CXC');

  for (const row of rows || []) {
    const fecha = row.fecha;
    const monto = Number(row.monto || 0);
    if (monto <= 0) continue;
    const cuentaPago = resolverCuentaPago(row.metodo_pago || 'efectivo', 'caja', cuentasMap);
    const lineas = [
      { cuenta_id: cuentaPago.id, debe: monto, haber: 0, descripcion: 'Cobro cliente' },
      { cuenta_id: cuentaCxc.id, debe: 0, haber: monto, descripcion: 'Abono CxC' },
    ];
    const asientoId = await crearAsientoContable({
      empresaId,
      negocioId: row.negocio_id,
      fecha,
      descripcion: 'Abono a cuentas por cobrar',
      referenciaTipo: 'ABONO_CXC',
      referenciaId: row.id,
      lineas,
    });
    if (asientoId) {
      await registrarEventoContable(empresaId, 'ABONO_CXC', row.id, asientoId);
    }
  }
};

const contabilizarRango = async (empresaId, desde, hasta, cuentasMap) => {
  await contabilizarVentas(empresaId, desde, hasta, cuentasMap);
  await contabilizarCompras(empresaId, desde, hasta, cuentasMap);
  await contabilizarGastos(empresaId, desde, hasta, cuentasMap);
  await contabilizarPagosGastos(empresaId, desde, hasta, cuentasMap);
  await contabilizarCxC(empresaId, desde, hasta, cuentasMap);
  await contabilizarAbonos(empresaId, desde, hasta, cuentasMap);
};

const cerrarPeriodoAnteriorAutomatico = async (empresaId, cuentasMap) => {
  const ahora = new Date();
  const previo = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
  const anio = previo.getFullYear();
  const mes = previo.getMonth() + 1;
  const row = await db.get(
    'SELECT estado FROM contabilidad_periodos WHERE empresa_id = ? AND anio = ? AND mes = ? LIMIT 1',
    [empresaId, anio, mes]
  );
  if (row?.estado === 'CERRADO') return;
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  await contabilizarRango(empresaId, desde, hasta, cuentasMap);
  await db.run(
    `INSERT INTO contabilidad_periodos (empresa_id, anio, mes, estado, cerrado_at)
     VALUES (?, ?, ?, 'CERRADO', NOW())
     ON DUPLICATE KEY UPDATE estado = 'CERRADO', cerrado_at = NOW()`,
    [empresaId, anio, mes]
  );
};

const sincronizarContabilidad = async (empresaId, desde, hasta) => {
  await asegurarPlanContableEmpresa(empresaId);
  const { cuentas, map } = await obtenerMapaCuentasContables(empresaId);
  await contabilizarRango(empresaId, desde, hasta, map);
  await cerrarPeriodoAnteriorAutomatico(empresaId, map);
  return { cuentas, map };
};

const obtenerBalanzaContable = async (empresaId, desde, hasta) => {
  const rows = await db.all(
    `
      SELECT c.id, c.codigo, c.nombre, c.tipo,
             SUM(l.debe) AS debe, SUM(l.haber) AS haber
        FROM contabilidad_asiento_lineas l
        JOIN contabilidad_asientos a ON a.id = l.asiento_id
        JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
       WHERE a.empresa_id = ?
         AND a.estado = 'CONTABILIZADO'
         AND a.fecha BETWEEN ? AND ?
       GROUP BY c.id
       ORDER BY c.codigo ASC
    `,
    [empresaId, desde, hasta]
  );

  const cuentas = (rows || []).map((row) => {
    const debe = Number(row.debe || 0);
    const haber = Number(row.haber || 0);
    const saldo =
      row.tipo === 'ACTIVO' || row.tipo === 'COSTO' || row.tipo === 'GASTO'
        ? Number((debe - haber).toFixed(2))
        : Number((haber - debe).toFixed(2));
    return {
      id: row.id,
      codigo: row.codigo,
      nombre: row.nombre,
      tipo: row.tipo,
      debe,
      haber,
      saldo,
    };
  });

  const resumen = {
    activos: 0,
    pasivos: 0,
    patrimonio: 0,
    ingresos: 0,
    costos: 0,
    gastos: 0,
    resultado: 0,
  };

  const grupos = {
    activos: [],
    pasivos: [],
    patrimonio: [],
    ingresos: [],
    costos: [],
    gastos: [],
  };

  for (const cuenta of cuentas) {
    if (cuenta.tipo === 'ACTIVO') {
      resumen.activos += cuenta.saldo;
      grupos.activos.push(cuenta);
    }
    if (cuenta.tipo === 'PASIVO') {
      resumen.pasivos += cuenta.saldo;
      grupos.pasivos.push(cuenta);
    }
    if (cuenta.tipo === 'PATRIMONIO') {
      resumen.patrimonio += cuenta.saldo;
      grupos.patrimonio.push(cuenta);
    }
    if (cuenta.tipo === 'INGRESO') {
      resumen.ingresos += cuenta.saldo;
      grupos.ingresos.push(cuenta);
    }
    if (cuenta.tipo === 'COSTO') {
      resumen.costos += cuenta.saldo;
      grupos.costos.push(cuenta);
    }
    if (cuenta.tipo === 'GASTO') {
      resumen.gastos += cuenta.saldo;
      grupos.gastos.push(cuenta);
    }
  }
  resumen.resultado = Number((resumen.ingresos - resumen.costos - resumen.gastos).toFixed(2));

  const balance = {
    activos: grupos.activos,
    pasivos: grupos.pasivos,
    patrimonio: grupos.patrimonio,
    total_activos: Number(resumen.activos.toFixed(2)),
    total_pasivos: Number(resumen.pasivos.toFixed(2)),
    total_patrimonio: Number(resumen.patrimonio.toFixed(2)),
    total_pasivo_patrimonio: Number((resumen.pasivos + resumen.patrimonio).toFixed(2)),
  };

  const resultados = {
    ingresos: grupos.ingresos,
    costos: grupos.costos,
    gastos: grupos.gastos,
    total_ingresos: Number(resumen.ingresos.toFixed(2)),
    total_costos: Number(resumen.costos.toFixed(2)),
    total_gastos: Number(resumen.gastos.toFixed(2)),
    utilidad: resumen.resultado,
  };

  return { cuentas, resumen, balance, resultados };
};

// Empresa: contabilidad
app.get('/api/empresa/contabilidad', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      const rows = await db.all(
        `SELECT m.id, m.tipo, m.cuenta, m.descripcion, m.monto, m.fecha, m.negocio_id, n.nombre AS sucursal_nombre
           FROM empresa_contabilidad_movimientos m
           LEFT JOIN negocios n ON n.id = m.negocio_id
          WHERE m.empresa_id = ?
            AND m.fecha BETWEEN ? AND ?
          ORDER BY m.fecha DESC, m.id DESC`,
        [empresaId, rango.desde, rango.hasta]
      );
      const resumen = { activos: 0, pasivos: 0, capital: 0, capital_neto: 0, ingresos: 0, gastos: 0, resultado: 0 };
      (rows || []).forEach((row) => {
        const monto = Number(row.monto) || 0;
        if (row.tipo === 'ACTIVO') resumen.activos += monto;
        if (row.tipo === 'PASIVO') resumen.pasivos += monto;
        if (row.tipo === 'CAPITAL') resumen.capital += monto;
        if (row.tipo === 'INGRESO') resumen.ingresos += monto;
        if (row.tipo === 'GASTO') resumen.gastos += monto;
      });
      resumen.capital_neto = Number((resumen.activos + resumen.capital - resumen.pasivos).toFixed(2));
      resumen.resultado = Number(
        (resumen.activos + resumen.ingresos + resumen.capital - resumen.pasivos - resumen.gastos).toFixed(2)
      );
      res.json({ ok: true, rango, resumen, movimientos: rows || [] });
    } catch (error) {
      console.error('Error al cargar contabilidad:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo cargar la contabilidad' });
    }
  });
});

app.post('/api/empresa/contabilidad', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const tipo = (req.body?.tipo || 'ACTIVO').toString().toUpperCase();
    if (!['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'GASTO'].includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'Tipo invalido' });
    }
    const cuenta = normalizarCampoTexto(req.body?.cuenta, null);
    if (!cuenta) {
      return res.status(400).json({ ok: false, error: 'La cuenta es obligatoria' });
    }
    const descripcion = normalizarCampoTexto(req.body?.descripcion, null);
    const monto = Number(req.body?.monto || 0) || 0;
    const fecha = normalizarCampoTexto(req.body?.fecha, null);
    if (!fecha || !monto) {
      return res.status(400).json({ ok: false, error: 'Monto y fecha son obligatorios' });
    }
    const negocioId = Number(req.body?.negocio_id || 0) || null;

    try {
      await db.run(
        `INSERT INTO empresa_contabilidad_movimientos (empresa_id, negocio_id, tipo, cuenta, descripcion, monto, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [empresaId, negocioId, tipo, cuenta, descripcion, monto, fecha]
      );
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error al registrar contabilidad:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el movimiento' });
    }
  });
});

app.put('/api/empresa/contabilidad/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }

    const tipo = (req.body?.tipo || 'ACTIVO').toString().toUpperCase();
    if (!['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'GASTO'].includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'Tipo invalido' });
    }
    const cuenta = normalizarCampoTexto(req.body?.cuenta, null);
    if (!cuenta) {
      return res.status(400).json({ ok: false, error: 'La cuenta es obligatoria' });
    }
    const descripcion = normalizarCampoTexto(req.body?.descripcion, null);
    const monto = Number(req.body?.monto || 0) || 0;
    const fecha = normalizarCampoTexto(req.body?.fecha, null);
    if (!fecha || !monto) {
      return res.status(400).json({ ok: false, error: 'Monto y fecha son obligatorios' });
    }
    const negocioId = Number(req.body?.negocio_id || 0) || null;

    try {
      const result = await db.run(
        `UPDATE empresa_contabilidad_movimientos
            SET tipo = ?, cuenta = ?, descripcion = ?, monto = ?, fecha = ?, negocio_id = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ?`,
        [tipo, cuenta, descripcion, monto, fecha, negocioId, id, empresaId]
      );
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al actualizar contabilidad:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el movimiento' });
    }
  });
});

app.delete('/api/empresa/contabilidad/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }
    try {
      const result = await db.run(
        'DELETE FROM empresa_contabilidad_movimientos WHERE id = ? AND empresa_id = ?',
        [id, empresaId]
      );
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al eliminar movimiento contable:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el movimiento' });
    }
  });
});

// Nuevo motor contable
app.get('/api/empresa/contabilidad/cuentas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    try {
      await asegurarPlanContableEmpresa(empresaId);
      const { cuentas } = await obtenerMapaCuentasContables(empresaId);
      res.json({ ok: true, cuentas: cuentas || [] });
    } catch (error) {
      console.error('Error al cargar plan de cuentas:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo cargar el plan de cuentas' });
    }
  });
});

app.get('/api/empresa/contabilidad/reportes', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      await sincronizarContabilidad(empresaId, rango.desde, rango.hasta);
      const { resumen, balance, resultados } = await obtenerBalanzaContable(empresaId, rango.desde, rango.hasta);
      res.json({ ok: true, rango, resumen, balance, resultados });
    } catch (error) {
      console.error('Error al generar reportes contables:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron generar los reportes' });
    }
  });
});

app.get('/api/empresa/contabilidad/asientos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      const lineas = await db.all(
        `
          SELECT a.id AS asiento_id, a.fecha, a.referencia_tipo, a.referencia_id, a.negocio_id,
                 n.nombre AS sucursal_nombre, c.codigo AS cuenta_codigo, c.nombre AS cuenta_nombre,
                 l.debe, l.haber
            FROM contabilidad_asiento_lineas l
            JOIN contabilidad_asientos a ON a.id = l.asiento_id
            JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
            LEFT JOIN negocios n ON n.id = a.negocio_id
           WHERE a.empresa_id = ?
             AND a.estado = 'CONTABILIZADO'
             AND a.fecha BETWEEN ? AND ?
           ORDER BY a.fecha DESC, a.id DESC, l.id ASC
        `,
        [empresaId, rango.desde, rango.hasta]
      );
      res.json({ ok: true, rango, lineas: lineas || [] });
    } catch (error) {
      console.error('Error al cargar asientos contables:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar los asientos' });
    }
  });
});

app.get('/api/empresa/contabilidad/mayor', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const cuentaId = Number(req.query?.cuenta_id ?? req.query?.cuentaId);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta invalida' });
    }
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      const cuenta = await db.get(
        'SELECT id, codigo, nombre, tipo FROM contabilidad_cuentas WHERE id = ? AND empresa_id = ? LIMIT 1',
        [cuentaId, empresaId]
      );
      if (!cuenta) {
        return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
      }

      const rows = await db.all(
        `
          SELECT a.id AS asiento_id, a.fecha, a.referencia_tipo, a.referencia_id, a.negocio_id,
                 n.nombre AS sucursal_nombre, l.debe, l.haber
            FROM contabilidad_asiento_lineas l
            JOIN contabilidad_asientos a ON a.id = l.asiento_id
            LEFT JOIN negocios n ON n.id = a.negocio_id
           WHERE a.empresa_id = ?
             AND a.estado = 'CONTABILIZADO'
             AND a.fecha BETWEEN ? AND ?
             AND l.cuenta_id = ?
           ORDER BY a.fecha ASC, a.id ASC, l.id ASC
        `,
        [empresaId, rango.desde, rango.hasta, cuentaId]
      );

      let saldo = 0;
      const lineas = (rows || []).map((row) => {
        const debe = Number(row.debe || 0);
        const haber = Number(row.haber || 0);
        if (['ACTIVO', 'COSTO', 'GASTO'].includes(cuenta.tipo)) {
          saldo = Number((saldo + debe - haber).toFixed(2));
        } else {
          saldo = Number((saldo + haber - debe).toFixed(2));
        }
        return { ...row, saldo };
      });

      res.json({ ok: true, rango, cuenta, lineas });
    } catch (error) {
      console.error('Error al cargar mayor contable:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo cargar el mayor' });
    }
  });
});

// ==========================
// Empresa: gastos
// ==========================
const MAX_GASTO_ADJUNTO_BYTES = 1024 * 1024 * 1.5;

const obtenerNegocioEmpresa = async (empresaId, negocioId) => {
  if (!empresaId || !negocioId) return null;
  return db.get(
    `SELECT id, nombre
       FROM negocios
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
      LIMIT 1`,
    [negocioId, empresaId]
  );
};

const obtenerClienteEmpresa = async (empresaId, clienteId) => {
  if (!empresaId || !clienteId) return null;
  return db.get(
    `SELECT *
       FROM clientes
      WHERE id = ?
        AND empresa_id = ?
      LIMIT 1`,
    [clienteId, empresaId]
  );
};

const calcularDiasTranscurridos = (fechaISO) => {
  const fecha = parseFechaISO(fechaISO);
  if (!fecha) return 0;
  const ahora = new Date();
  const ms = ahora.getTime() - fecha.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86400000));
};

const construirResumenClienteEmpresa = (row = {}) => {
  const total = Number(row.total_deuda ?? row.total ?? 0) || 0;
  const pagado = Number(row.total_abonos ?? row.pagado ?? 0) || 0;
  const saldo = Number((total - pagado).toFixed(2));
  const creditoActivo = Number(row.credito_activo ?? 0) === 1;
  const creditoLimite = Number(row.credito_limite ?? 0) || 0;
  const creditoDias = Number(row.credito_dias ?? 0) || 0;
  const diasMora = calcularDiasTranscurridos(row.fecha_antigua ?? row.primera_compra ?? row.ultima_compra);
  const enMora = creditoActivo && creditoDias > 0 && saldo > 0 && diasMora > creditoDias;
  const excedeLimite = creditoActivo && creditoLimite > 0 && saldo > creditoLimite;
  const estadoCredito = enMora ? 'MORA' : saldo > 0 ? 'PENDIENTE' : 'AL_DIA';
  return {
    total,
    pagado,
    saldo,
    dias_mora: diasMora,
    en_mora: enMora,
    excede_limite: excedeLimite,
    estado_credito: estadoCredito,
  };
};

const guardarAdjuntosGasto = async (gastoId, adjuntos = [], limpiarPrevios = false) => {
  if (!gastoId) return;
  if (limpiarPrevios) {
    await db.run('DELETE FROM gastos_adjuntos WHERE gasto_id = ?', [gastoId]);
  }
  if (!Array.isArray(adjuntos) || !adjuntos.length) return;
  for (const item of adjuntos) {
    if (!item) continue;
    const nombre = normalizarCampoTexto(item.nombre ?? item.file_name ?? item.filename, null);
    const mime = normalizarCampoTexto(item.mime ?? item.mimetype, null);
    const contenido = normalizarCampoTexto(item.contenido_base64 ?? item.base64 ?? item.contenido, null);
    if (!nombre || !contenido) continue;
    if (contenido.length > MAX_GASTO_ADJUNTO_BYTES * 1.4) {
      throw new Error('El adjunto supera el tamaño permitido.');
    }
    await db.run(
      `INSERT INTO gastos_adjuntos (gasto_id, nombre, mime, contenido_base64) VALUES (?, ?, ?, ?)`,
      [gastoId, nombre.slice(0, 255), mime ? mime.slice(0, 80) : null, contenido]
    );
  }
};

const obtenerAdjuntosGasto = async (gastoId, incluirContenido = false) => {
  if (!gastoId) return [];
  if (incluirContenido) {
    return db.all(
      `SELECT id, nombre, mime, contenido_base64
         FROM gastos_adjuntos
        WHERE gasto_id = ?
        ORDER BY id ASC`,
      [gastoId]
    );
  }
  return db.all(
    `SELECT id, nombre, mime
       FROM gastos_adjuntos
      WHERE gasto_id = ?
      ORDER BY id ASC`,
    [gastoId]
  );
};

app.get('/api/empresa/gastos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 40, 1), 200);
    const offset = (page - 1) * limit;
    const desde = esFechaISOValida(req.query?.from ?? req.query?.desde) ? req.query?.from ?? req.query?.desde : null;
    const hasta = esFechaISOValida(req.query?.to ?? req.query?.hasta) ? req.query?.to ?? req.query?.hasta : null;
    const negocioId = normalizarNumero(req.query?.negocio_id ?? req.query?.negocioId, null);
    const categoria = normalizarCampoTexto(req.query?.categoria, null);
    const tipoGastoRaw = normalizarCampoTexto(req.query?.tipo_gasto ?? req.query?.tipoGasto, null);
    const metodoPago = normalizarCampoTexto(req.query?.metodo_pago ?? req.query?.metodoPago, null);
    const estadoRaw = normalizarCampoTexto(req.query?.estado, null);
    const origenFondosRaw = normalizarCampoTexto(req.query?.origen_fondos ?? req.query?.origenFondos, null);
    const proveedor = normalizarCampoTexto(req.query?.proveedor, null);
    const origenDetalle = normalizarCampoTexto(req.query?.origen_detalle ?? req.query?.origenDetalle, null);
    const q = normalizarCampoTexto(req.query?.q ?? req.query?.buscar, null);
    const montoMin = normalizarNumero(req.query?.monto_min ?? req.query?.montoMin, null);
    const montoMax = normalizarNumero(req.query?.monto_max ?? req.query?.montoMax, null);
    const orden = normalizarCampoTexto(req.query?.orden ?? req.query?.order_by ?? req.query?.orderBy, null);
    const direccion = (req.query?.dir ?? req.query?.order_dir ?? 'desc').toString().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const empresaRef = 'COALESCE(g.empresa_id, n.empresa_id)';
    const filtros = [`${empresaRef} = ?`, '(g.negocio_id IS NULL OR n.deleted_at IS NULL)'];
    const params = [empresaId];

    if (Number.isFinite(negocioId) && negocioId > 0) {
      filtros.push('g.negocio_id = ?');
      params.push(negocioId);
    }
    if (desde) {
      filtros.push('DATE(g.fecha) >= ?');
      params.push(desde);
    }
    if (hasta) {
      filtros.push('DATE(g.fecha) <= ?');
      params.push(hasta);
    }
    if (categoria) {
      filtros.push('g.categoria = ?');
      params.push(categoria);
    }
    if (tipoGastoRaw) {
      const tipoGasto = normalizarTipoGasto(tipoGastoRaw, null);
      if (tipoGasto) {
        filtros.push("COALESCE(g.tipo_gasto, 'OPERATIVO') = ?");
        params.push(tipoGasto);
      }
    }
    if (metodoPago) {
      filtros.push('g.metodo_pago = ?');
      params.push(metodoPago);
    }
    if (estadoRaw) {
      const estado = normalizarEstadoGasto(estadoRaw, null);
      if (estado) {
        filtros.push("COALESCE(g.estado, 'PAGADO') = ?");
        params.push(estado);
      }
    }
    if (origenFondosRaw) {
      const origenFondos = normalizarOrigenFondosGasto(origenFondosRaw, null);
      if (origenFondos) {
        filtros.push("COALESCE(g.origen_fondos, g.origen, 'manual') = ?");
        params.push(origenFondos);
      }
    }
    if (origenDetalle) {
      filtros.push('LOWER(g.origen_detalle) LIKE ?');
      params.push(`%${origenDetalle.toLowerCase()}%`);
    }
    if (proveedor) {
      filtros.push('LOWER(g.proveedor) LIKE ?');
      params.push(`%${proveedor.toLowerCase()}%`);
    }
    if (Number.isFinite(montoMin)) {
      filtros.push('g.monto >= ?');
      params.push(montoMin);
    }
    if (Number.isFinite(montoMax)) {
      filtros.push('g.monto <= ?');
      params.push(montoMax);
    }
    if (q) {
      const termino = `%${q.toLowerCase()}%`;
      filtros.push(
        '(LOWER(g.proveedor) LIKE ? OR LOWER(g.descripcion) LIKE ? OR LOWER(g.comprobante_ncf) LIKE ? OR LOWER(g.referencia) LIKE ? OR LOWER(g.categoria) LIKE ?)'
      );
      params.push(termino, termino, termino, termino, termino);
    }

    const orderMap = {
      fecha: 'g.fecha',
      monto: 'g.monto',
      proveedor: 'g.proveedor',
      categoria: 'g.categoria',
    };
    const orderBy = orderMap[orden] || 'g.fecha';

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    try {
      const listadoSql = `
        SELECT g.id, g.fecha, g.monto, g.moneda, g.categoria,
               COALESCE(g.tipo_gasto, 'OPERATIVO') AS tipo_gasto,
               COALESCE(g.origen_fondos, g.origen, 'manual') AS origen_fondos,
               g.origen_detalle, g.metodo_pago, g.proveedor, g.descripcion,
               g.comprobante_ncf, g.tipo_comprobante, g.referencia,
               g.es_recurrente, g.frecuencia, g.tags,
               COALESCE(g.estado, 'PAGADO') AS estado,
               g.fecha_vencimiento, g.fecha_pago, g.monto_pagado, g.itbis, g.centro_costo,
               g.aprobado_por, g.aprobado_at, g.anulado_por, g.anulado_at, g.motivo_anulacion,
               g.created_at, g.updated_at, g.negocio_id,
               n.nombre AS sucursal_nombre
          FROM gastos g
          LEFT JOIN negocios n ON n.id = g.negocio_id
          ${whereClause}
          ORDER BY ${orderBy} ${direccion}, g.id DESC
          LIMIT ${limit} OFFSET ${offset}
      `;
      const gastos = await db.all(listadoSql, params);

      const conteoSql = `SELECT COUNT(1) AS total FROM gastos g LEFT JOIN negocios n ON n.id = g.negocio_id ${whereClause}`;
      const countRow = await db.get(conteoSql, params);
      const total = Number(countRow?.total) || 0;

      const resumenSql = `
        SELECT SUM(g.monto) AS total,
               SUM(CASE WHEN COALESCE(g.estado, 'PAGADO') = 'PAGADO' THEN g.monto ELSE 0 END) AS total_pagado,
               SUM(CASE WHEN COALESCE(g.estado, 'PAGADO') IN ('PENDIENTE','APROBADO','BORRADOR') THEN g.monto ELSE 0 END) AS total_pendiente,
               COUNT(DISTINCT DATE(g.fecha)) AS dias
        FROM gastos g
        LEFT JOIN negocios n ON n.id = g.negocio_id
        ${whereClause}
      `;
      const resumenRow = await db.get(resumenSql, params);
      const totalGastos = Number(resumenRow?.total) || 0;

      let diasPromedio = Number(resumenRow?.dias) || 0;
      if (desde && hasta) {
        const inicio = parseFechaISO(desde);
        const fin = parseFechaISO(hasta);
        if (inicio && fin) {
          diasPromedio = calcularDiasIncluidos(inicio, fin);
        }
      }
      const promedioDiario = diasPromedio > 0 ? Number((totalGastos / diasPromedio).toFixed(2)) : 0;

      const filtrosCategorias = [...filtros, "g.categoria IS NOT NULL", "g.categoria <> ''"];
      const whereCategorias = `WHERE ${filtrosCategorias.join(' AND ')}`;
      const topCategorias = await db.all(
        `
          SELECT g.categoria, SUM(g.monto) AS total
          FROM gastos g
          LEFT JOIN negocios n ON n.id = g.negocio_id
          ${whereCategorias}
          GROUP BY g.categoria
          ORDER BY total DESC
          LIMIT 3
        `,
        params
      );

      res.json({
        ok: true,
        gastos: gastos || [],
        total,
        page,
        limit,
        resumen: {
          total: totalGastos,
          total_pagado: Number(resumenRow?.total_pagado) || 0,
          total_pendiente: Number(resumenRow?.total_pendiente) || 0,
          promedio_diario: promedioDiario,
          top_categorias: topCategorias || [],
        },
      });
    } catch (error) {
      console.error('Error al obtener gastos empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los gastos' });
    }
  });
});

app.get('/api/empresa/gastos/export', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const desde = esFechaISOValida(req.query?.from ?? req.query?.desde) ? req.query?.from ?? req.query?.desde : null;
    const hasta = esFechaISOValida(req.query?.to ?? req.query?.hasta) ? req.query?.to ?? req.query?.hasta : null;
    const negocioId = normalizarNumero(req.query?.negocio_id ?? req.query?.negocioId, null);

    const empresaRef = 'COALESCE(g.empresa_id, n.empresa_id)';
    const filtros = [`${empresaRef} = ?`, '(g.negocio_id IS NULL OR n.deleted_at IS NULL)'];
    const params = [empresaId];
    if (Number.isFinite(negocioId) && negocioId > 0) {
      filtros.push('g.negocio_id = ?');
      params.push(negocioId);
    }
    if (desde) {
      filtros.push('DATE(g.fecha) >= ?');
      params.push(desde);
    }
    if (hasta) {
      filtros.push('DATE(g.fecha) <= ?');
      params.push(hasta);
    }

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    try {
      const rows = await db.all(
        `SELECT g.fecha, g.descripcion, g.proveedor, g.categoria, g.monto, g.metodo_pago,
                COALESCE(g.origen_fondos, g.origen, 'manual') AS origen_fondos,
                COALESCE(g.estado, 'PAGADO') AS estado,
                n.nombre AS sucursal
           FROM gastos g
           LEFT JOIN negocios n ON n.id = g.negocio_id
           ${whereClause}
           ORDER BY g.fecha DESC, g.id DESC`,
        params
      );

      const headers = ['Fecha', 'Concepto', 'Proveedor', 'Categoria', 'Monto', 'Metodo', 'Origen', 'Estado', 'Sucursal'];
      const csvRows = [headers.join(',')];
      (rows || []).forEach((row) => {
        const values = [
          row.fecha,
          row.descripcion || '',
          row.proveedor || '',
          row.categoria || '',
          row.monto || 0,
          row.metodo_pago || '',
          row.origen_fondos || '',
          row.estado || '',
          row.sucursal || '',
        ].map((val) => `"${String(val).replace(/\"/g, '\"\"')}"`);
        csvRows.push(values.join(','));
      });
      const csv = csvRows.join('\n');
      const nombre = `gastos_empresa_${desde || 'inicio'}_a_${hasta || 'hoy'}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.send(csv);
    } catch (error) {
      console.error('Error al exportar gastos empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo exportar.' });
    }
  });
});

app.get('/api/empresa/gastos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido.' });
    }

    try {
      const gasto = await db.get(
        `
          SELECT g.*, n.nombre AS sucursal_nombre
          FROM gastos g
          LEFT JOIN negocios n ON n.id = g.negocio_id
          WHERE g.id = ?
            AND COALESCE(g.empresa_id, n.empresa_id) = ?
            AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)
          LIMIT 1
        `,
        [id, empresaId]
      );
      if (!gasto) {
        return res.status(404).json({ ok: false, error: 'Gasto no encontrado.' });
      }
      const pagos = await db.all(
        `SELECT id, fecha, monto, metodo_pago, origen_fondos, origen_detalle, referencia, notas, created_at
           FROM gastos_pagos
          WHERE gasto_id = ?
          ORDER BY fecha ASC, id ASC`,
        [id]
      );
      const adjuntos = await obtenerAdjuntosGasto(id, true);
      res.json({ ok: true, gasto, pagos: pagos || [], adjuntos: adjuntos || [] });
    } catch (error) {
      console.error('Error al obtener detalle de gasto:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el gasto' });
    }
  });
});

app.post('/api/empresa/gastos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const payload = req.body || {};
    const negocioIdRaw = normalizarNumero(payload.negocio_id ?? payload.negocioId, null);
    const negocioId = Number.isFinite(negocioIdRaw) && negocioIdRaw > 0 ? negocioIdRaw : null;
    if (negocioId) {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }
    }

    const fecha = normalizarCampoTexto(payload.fecha, null);
    if (!fecha || !esFechaISOValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'La fecha del gasto es obligatoria y debe ser valida.' });
    }

    const montoValor = normalizarNumero(payload.monto, null);
    if (montoValor === null || montoValor <= 0) {
      return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0.' });
    }

    const moneda = (normalizarCampoTexto(payload.moneda, null) || 'DOP').toUpperCase();
    if (moneda.length > 3) {
      return res.status(400).json({ ok: false, error: 'La moneda debe tener maximo 3 caracteres.' });
    }

    const categoria = normalizarCampoTexto(payload.categoria, null);
    if (categoria && categoria.length > 80) {
      return res.status(400).json({ ok: false, error: 'La categoria no puede superar 80 caracteres.' });
    }

    const tipoGasto = normalizarTipoGasto(payload.tipo_gasto ?? payload.tipoGasto, 'OPERATIVO');
    const origen = normalizarOrigenGasto(payload.origen ?? payload.origen_gasto ?? payload.origenGasto, 'manual');
    const origenFondos = normalizarOrigenFondosGasto(
      payload.origen_fondos ?? payload.origenFondos ?? payload.origen_fondo,
      null
    );
    const origenDetalle = normalizarCampoTexto(payload.origen_detalle ?? payload.origenDetalle, null);

    const metodoPago = normalizarCampoTexto(payload.metodo_pago ?? payload.metodoPago, null);
    if (metodoPago && metodoPago.length > 40) {
      return res.status(400).json({ ok: false, error: 'El metodo de pago no puede superar 40 caracteres.' });
    }

    const proveedor = normalizarCampoTexto(payload.proveedor, null);
    if (proveedor && proveedor.length > 120) {
      return res.status(400).json({ ok: false, error: 'El proveedor no puede superar 120 caracteres.' });
    }

    const descripcion = normalizarCampoTexto(payload.descripcion ?? payload.concepto, null);
    const comprobanteNCF = normalizarCampoTexto(payload.comprobante_ncf ?? payload.comprobanteNCF, null);
    if (comprobanteNCF && comprobanteNCF.length > 30) {
      return res.status(400).json({ ok: false, error: 'El comprobante NCF no puede superar 30 caracteres.' });
    }

    const tipoComprobante = normalizarCampoTexto(payload.tipo_comprobante ?? payload.tipoComprobante, null);
    if (tipoComprobante && tipoComprobante.length > 30) {
      return res.status(400).json({ ok: false, error: 'El tipo de comprobante no puede superar 30 caracteres.' });
    }

    const referencia = normalizarCampoTexto(payload.referencia, null);
    if (referencia && referencia.length > 60) {
      return res.status(400).json({ ok: false, error: 'La referencia no puede superar 60 caracteres.' });
    }

    const esRecurrente = normalizarFlag(payload.es_recurrente ?? payload.esRecurrente, 0);
    const frecuencia = normalizarCampoTexto(payload.frecuencia, null);
    if (frecuencia && frecuencia.length > 20) {
      return res.status(400).json({ ok: false, error: 'La frecuencia no puede superar 20 caracteres.' });
    }
    if (esRecurrente && !frecuencia) {
      return res.status(400).json({ ok: false, error: 'La frecuencia es obligatoria para gastos recurrentes.' });
    }

    const fechaVencimiento = normalizarCampoTexto(payload.fecha_vencimiento ?? payload.fechaVencimiento, null);
    if (fechaVencimiento && !esFechaISOValida(fechaVencimiento)) {
      return res.status(400).json({ ok: false, error: 'La fecha de vencimiento no es valida.' });
    }
    const fechaPago = normalizarCampoTexto(payload.fecha_pago ?? payload.fechaPago, null);
    if (fechaPago && !esFechaISOValida(fechaPago)) {
      return res.status(400).json({ ok: false, error: 'La fecha de pago no es valida.' });
    }

    const itbisMonto = normalizarNumero(payload.itbis, 0) || 0;
    const centroCosto = normalizarCampoTexto(payload.centro_costo ?? payload.centroCosto ?? payload.area, null);

    let tagsEntrada = payload.tags;
    if (Array.isArray(tagsEntrada)) {
      tagsEntrada = tagsEntrada.map((tag) => String(tag).trim()).filter(Boolean).join(',');
    } else if (tagsEntrada && typeof tagsEntrada === 'object') {
      tagsEntrada = JSON.stringify(tagsEntrada);
    }
    const tags = normalizarCampoTexto(tagsEntrada, null);

    const esCredito = metodoPago ? metodoPago.toString().toLowerCase().includes('credito') : false;
    let estado = normalizarEstadoGasto(payload.estado, esCredito ? 'PENDIENTE' : 'PAGADO');
    if (esCredito && estado === 'PAGADO') {
      estado = 'PENDIENTE';
    }

    let montoPagado = normalizarNumero(payload.monto_pagado ?? payload.montoPagado, null);
    if (!Number.isFinite(montoPagado)) {
      montoPagado = estado === 'PAGADO' && !esCredito ? montoValor : 0;
    }

    const usuarioId = usuarioSesion?.id || null;
    const aprobadoPor = estado === 'APROBADO' || estado === 'PAGADO' ? usuarioId : null;
    const aprobadoAt = aprobadoPor ? new Date() : null;
    const aprobadoAtValue = aprobadoAt ? aprobadoAt.toISOString().slice(0, 19).replace('T', ' ') : null;
    const fechaPagoFinal = estado === 'PAGADO' && !fechaPago ? fecha : fechaPago;

    const adjuntos = Array.isArray(payload.adjuntos) ? payload.adjuntos : [];

    try {
      const sql = `
        INSERT INTO gastos (
          fecha, monto, moneda, categoria, tipo_gasto, origen, origen_fondos, origen_detalle, metodo_pago,
          proveedor, descripcion, comprobante_ncf, tipo_comprobante, referencia, es_recurrente, frecuencia,
          tags, estado, fecha_vencimiento, fecha_pago, monto_pagado, itbis, centro_costo,
          aprobado_por, aprobado_at, negocio_id, usuario_id, empresa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        fecha,
        montoValor,
        moneda,
        categoria,
        tipoGasto,
        origen,
        origenFondos,
        origenDetalle,
        metodoPago,
        proveedor,
        descripcion,
        comprobanteNCF,
        tipoComprobante,
        referencia,
        esRecurrente ? 1 : 0,
        frecuencia,
        tags,
        estado,
        fechaVencimiento,
        fechaPagoFinal,
        montoPagado || 0,
        itbisMonto || 0,
        centroCosto,
        aprobadoPor,
        aprobadoAtValue,
        negocioId,
        usuarioId,
        empresaId,
      ];

      const result = await db.run(sql, params);
      const gastoId = result?.lastID;
      if (gastoId && adjuntos.length) {
        await guardarAdjuntosGasto(gastoId, adjuntos);
      }

      limpiarCacheAnalitica(negocioId);
      res.status(201).json({ ok: true, id: gastoId });
    } catch (error) {
      console.error('Error al registrar gasto empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: error?.message || 'No se pudo registrar el gasto.' });
    }
  });
});

app.put('/api/empresa/gastos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido.' });
    }

    let existente;
    try {
      existente = await db.get(
        `SELECT g.*
           FROM gastos g
           LEFT JOIN negocios n ON n.id = g.negocio_id
          WHERE g.id = ?
            AND COALESCE(g.empresa_id, n.empresa_id) = ?
            AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)`,
        [id, empresaId]
      );
    } catch (error) {
      console.error('Error al obtener gasto:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'No se pudo obtener el gasto.' });
    }

    if (!existente) {
      return res.status(404).json({ ok: false, error: 'Gasto no encontrado.' });
    }

    if (String(existente.estado || '').toUpperCase() === 'ANULADO') {
      return res.status(400).json({ ok: false, error: 'No se puede editar un gasto anulado.' });
    }

    const payload = req.body || {};
    const updates = [];
    const params = [];

    const estadoActual = String(existente.estado || 'PAGADO').toUpperCase();
    const bloqueado = estadoActual === 'PAGADO';

    if (payload.negocio_id !== undefined || payload.negocioId !== undefined) {
      const nuevoNegocioRaw = normalizarNumero(payload.negocio_id ?? payload.negocioId, null);
      const nuevoNegocioId = Number.isFinite(nuevoNegocioRaw) && nuevoNegocioRaw > 0 ? nuevoNegocioRaw : null;
      const actualNegocioId = existente?.negocio_id ? Number(existente.negocio_id) : null;
      const cambia = String(actualNegocioId || '') !== String(nuevoNegocioId || '');
      if (cambia) {
        if (bloqueado) {
          return res.status(400).json({ ok: false, error: 'No se puede cambiar la sucursal de un gasto pagado.' });
        }
        if (nuevoNegocioId) {
          const negocio = await obtenerNegocioEmpresa(empresaId, nuevoNegocioId);
          if (!negocio) {
            return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
          }
        }
        updates.push('negocio_id = ?');
        params.push(nuevoNegocioId);
        if (!existente.empresa_id || !nuevoNegocioId) {
          updates.push('empresa_id = ?');
          params.push(empresaId);
        }
      }
    }

    if (payload.fecha !== undefined) {
      if (bloqueado) {
        return res.status(400).json({ ok: false, error: 'No se puede cambiar la fecha de un gasto pagado.' });
      }
      const fecha = normalizarCampoTexto(payload.fecha, null);
      if (!fecha || !esFechaISOValida(fecha)) {
        return res.status(400).json({ ok: false, error: 'La fecha del gasto es obligatoria y debe ser valida.' });
      }
      updates.push('fecha = ?');
      params.push(fecha);
    }

    if (payload.monto !== undefined) {
      if (bloqueado) {
        return res.status(400).json({ ok: false, error: 'No se puede cambiar el monto de un gasto pagado.' });
      }
      const montoValor = normalizarNumero(payload.monto, null);
      if (montoValor === null || montoValor <= 0) {
        return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0.' });
      }
      updates.push('monto = ?');
      params.push(montoValor);
    }

    if (payload.moneda !== undefined) {
      const moneda = (normalizarCampoTexto(payload.moneda, null) || 'DOP').toUpperCase();
      if (moneda.length > 3) {
        return res.status(400).json({ ok: false, error: 'La moneda debe tener maximo 3 caracteres.' });
      }
      updates.push('moneda = ?');
      params.push(moneda);
    }

    if (payload.categoria !== undefined) {
      const categoria = normalizarCampoTexto(payload.categoria, null);
      if (categoria && categoria.length > 80) {
        return res.status(400).json({ ok: false, error: 'La categoria no puede superar 80 caracteres.' });
      }
      updates.push('categoria = ?');
      params.push(categoria);
    }

    if (payload.tipo_gasto !== undefined || payload.tipoGasto !== undefined) {
      if (bloqueado) {
        return res.status(400).json({ ok: false, error: 'No se puede cambiar el tipo en un gasto pagado.' });
      }
      const tipoGasto = normalizarTipoGasto(payload.tipo_gasto ?? payload.tipoGasto, 'OPERATIVO');
      updates.push('tipo_gasto = ?');
      params.push(tipoGasto);
    }

    if (payload.metodo_pago !== undefined || payload.metodoPago !== undefined) {
      if (bloqueado) {
        return res.status(400).json({ ok: false, error: 'No se puede cambiar el metodo de pago en un gasto pagado.' });
      }
      const metodoPago = normalizarCampoTexto(payload.metodo_pago ?? payload.metodoPago, null);
      if (metodoPago && metodoPago.length > 40) {
        return res.status(400).json({ ok: false, error: 'El metodo de pago no puede superar 40 caracteres.' });
      }
      updates.push('metodo_pago = ?');
      params.push(metodoPago);
    }

    if (payload.origen_fondos !== undefined || payload.origenFondos !== undefined) {
      const origenFondos = normalizarOrigenFondosGasto(
        payload.origen_fondos ?? payload.origenFondos ?? payload.origen_fondo,
        null
      );
      updates.push('origen_fondos = ?');
      params.push(origenFondos);
    }

    if (payload.origen_detalle !== undefined || payload.origenDetalle !== undefined) {
      updates.push('origen_detalle = ?');
      params.push(normalizarCampoTexto(payload.origen_detalle ?? payload.origenDetalle, null));
    }

    if (payload.proveedor !== undefined) {
      const proveedor = normalizarCampoTexto(payload.proveedor, null);
      if (proveedor && proveedor.length > 120) {
        return res.status(400).json({ ok: false, error: 'El proveedor no puede superar 120 caracteres.' });
      }
      updates.push('proveedor = ?');
      params.push(proveedor);
    }

    if (payload.descripcion !== undefined || payload.concepto !== undefined) {
      updates.push('descripcion = ?');
      params.push(normalizarCampoTexto(payload.descripcion ?? payload.concepto, null));
    }

    if (payload.comprobante_ncf !== undefined || payload.comprobanteNCF !== undefined) {
      const comprobante = normalizarCampoTexto(payload.comprobante_ncf ?? payload.comprobanteNCF, null);
      if (comprobante && comprobante.length > 30) {
        return res.status(400).json({ ok: false, error: 'El comprobante NCF no puede superar 30 caracteres.' });
      }
      updates.push('comprobante_ncf = ?');
      params.push(comprobante);
    }

    if (payload.tipo_comprobante !== undefined || payload.tipoComprobante !== undefined) {
      const tipoComprobante = normalizarCampoTexto(payload.tipo_comprobante ?? payload.tipoComprobante, null);
      if (tipoComprobante && tipoComprobante.length > 30) {
        return res.status(400).json({ ok: false, error: 'El tipo de comprobante no puede superar 30 caracteres.' });
      }
      updates.push('tipo_comprobante = ?');
      params.push(tipoComprobante);
    }

    if (payload.referencia !== undefined) {
      const referencia = normalizarCampoTexto(payload.referencia, null);
      if (referencia && referencia.length > 60) {
        return res.status(400).json({ ok: false, error: 'La referencia no puede superar 60 caracteres.' });
      }
      updates.push('referencia = ?');
      params.push(referencia);
    }

    if (payload.fecha_vencimiento !== undefined || payload.fechaVencimiento !== undefined) {
      const fechaVencimiento = normalizarCampoTexto(
        payload.fecha_vencimiento ?? payload.fechaVencimiento,
        null
      );
      if (fechaVencimiento && !esFechaISOValida(fechaVencimiento)) {
        return res.status(400).json({ ok: false, error: 'La fecha de vencimiento no es valida.' });
      }
      updates.push('fecha_vencimiento = ?');
      params.push(fechaVencimiento);
    }

    if (payload.itbis !== undefined) {
      const itbisMonto = normalizarNumero(payload.itbis, 0) || 0;
      updates.push('itbis = ?');
      params.push(itbisMonto);
    }

    if (payload.centro_costo !== undefined || payload.centroCosto !== undefined || payload.area !== undefined) {
      updates.push('centro_costo = ?');
      params.push(normalizarCampoTexto(payload.centro_costo ?? payload.centroCosto ?? payload.area, null));
    }

    if (payload.tags !== undefined) {
      let tagsEntrada = payload.tags;
      if (Array.isArray(tagsEntrada)) {
        tagsEntrada = tagsEntrada.map((tag) => String(tag).trim()).filter(Boolean).join(',');
      } else if (tagsEntrada && typeof tagsEntrada === 'object') {
        tagsEntrada = JSON.stringify(tagsEntrada);
      }
      updates.push('tags = ?');
      params.push(normalizarCampoTexto(tagsEntrada, null));
    }

    const adjuntos = Array.isArray(payload.adjuntos) ? payload.adjuntos : null;

    if (!updates.length && !adjuntos) {
      return res.json({ ok: true });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    try {
      if (updates.length) {
        const sql = `UPDATE gastos SET ${updates.join(', ')} WHERE id = ?`;
        await db.run(sql, params);
      }
      if (adjuntos) {
        await guardarAdjuntosGasto(id, adjuntos, true);
      }
      limpiarCacheAnalitica(existente.negocio_id);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al actualizar gasto empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: error?.message || 'No se pudo actualizar el gasto.' });
    }
  });
});

app.post('/api/empresa/gastos/:id/aprobar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido.' });
    }

    try {
      const gasto = await db.get(
        `SELECT g.id, g.estado, g.negocio_id
           FROM gastos g
           LEFT JOIN negocios n ON n.id = g.negocio_id
          WHERE g.id = ?
            AND COALESCE(g.empresa_id, n.empresa_id) = ?
            AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)`,
        [id, empresaId]
      );
      if (!gasto) return res.status(404).json({ ok: false, error: 'Gasto no encontrado.' });
      const estado = String(gasto.estado || 'PAGADO').toUpperCase();
      if (estado === 'ANULADO') {
        return res.status(400).json({ ok: false, error: 'El gasto esta anulado.' });
      }
      if (estado === 'APROBADO' || estado === 'PAGADO') {
        return res.json({ ok: true });
      }
      const usuarioId = usuarioSesion?.id || null;
      await db.run(
        `UPDATE gastos
            SET estado = 'APROBADO',
                aprobado_por = ?,
                aprobado_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [usuarioId, id]
      );
      limpiarCacheAnalitica(gasto.negocio_id);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al aprobar gasto:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo aprobar el gasto.' });
    }
  });
});

app.post('/api/empresa/gastos/:id/anular', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido.' });
    }
    const motivo = normalizarCampoTexto(req.body?.motivo ?? req.body?.motivo_anulacion, null);
    if (!motivo) {
      return res.status(400).json({ ok: false, error: 'El motivo es obligatorio.' });
    }

    try {
      const gasto = await db.get(
        `SELECT g.id, g.estado, g.negocio_id, g.fecha
           FROM gastos g
           LEFT JOIN negocios n ON n.id = g.negocio_id
          WHERE g.id = ?
            AND COALESCE(g.empresa_id, n.empresa_id) = ?
            AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)`,
        [id, empresaId]
      );
      if (!gasto) return res.status(404).json({ ok: false, error: 'Gasto no encontrado.' });
      const estado = String(gasto.estado || 'PAGADO').toUpperCase();
      if (estado === 'ANULADO') {
        return res.json({ ok: true, reverso: false });
      }

      const usuarioId = usuarioSesion?.id || null;
      await db.run(
        `UPDATE gastos
            SET estado = 'ANULADO',
                anulado_por = ?,
                anulado_at = NOW(),
                motivo_anulacion = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [usuarioId, motivo, id]
      );

      let reverso = false;
      try {
        const evento = await db.get(
          `SELECT asiento_id
             FROM contabilidad_eventos
            WHERE empresa_id = ?
              AND tipo = 'GASTO'
              AND origen_id = ?
            LIMIT 1`,
          [empresaId, id]
        );
        if (evento?.asiento_id) {
          const lineas = await db.all(
            `SELECT cuenta_id, debe, haber
               FROM contabilidad_asiento_lineas
              WHERE asiento_id = ?`,
            [evento.asiento_id]
          );
          const lineasReverso = (lineas || []).map((linea) => ({
            cuenta_id: linea.cuenta_id,
            debe: Number(linea.haber || 0),
            haber: Number(linea.debe || 0),
            descripcion: 'Reverso gasto',
          }));
          const asientoId = await crearAsientoContable({
            empresaId,
            negocioId: gasto.negocio_id,
            fecha: obtenerFechaLocalISO(new Date()),
            descripcion: `Reverso gasto #${id}`,
            referenciaTipo: 'GASTO_ANULADO',
            referenciaId: id,
            lineas: lineasReverso,
            usuarioId,
          });
          if (asientoId) {
            await registrarEventoContable(empresaId, 'GASTO_ANULADO', id, asientoId);
            reverso = true;
          }
        }
      } catch (error) {
        console.warn('No se pudo generar reverso contable del gasto:', error?.message || error);
      }

      limpiarCacheAnalitica(gasto.negocio_id);
      res.json({ ok: true, reverso });
    } catch (error) {
      console.error('Error al anular gasto:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo anular el gasto.' });
    }
  });
});

app.post('/api/empresa/gastos/:id/pagar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido.' });
    }

    const payload = req.body || {};
    const fechaPago = normalizarCampoTexto(payload.fecha_pago ?? payload.fechaPago ?? payload.fecha, null);
    if (!fechaPago || !esFechaISOValida(fechaPago)) {
      return res.status(400).json({ ok: false, error: 'La fecha de pago es obligatoria.' });
    }
    const montoPago = normalizarNumero(payload.monto ?? payload.monto_pagado ?? payload.montoPagado, null);
    if (montoPago === null || montoPago <= 0) {
      return res.status(400).json({ ok: false, error: 'El monto pagado debe ser mayor a 0.' });
    }
    const metodoPago = normalizarCampoTexto(payload.metodo_pago ?? payload.metodoPago, null);
    if (!metodoPago) {
      return res.status(400).json({ ok: false, error: 'El metodo de pago es obligatorio.' });
    }
    const origenFondos = normalizarOrigenFondosGasto(
      payload.origen_fondos ?? payload.origenFondos ?? payload.origen_fondo,
      null
    );
    const origenDetalle = normalizarCampoTexto(payload.origen_detalle ?? payload.origenDetalle, null);
    const referencia = normalizarCampoTexto(payload.referencia, null);
    const notas = normalizarCampoTexto(payload.notas, null);

    try {
      const gasto = await db.get(
        `SELECT g.id, g.monto, g.monto_pagado, g.estado, g.negocio_id
           FROM gastos g
           LEFT JOIN negocios n ON n.id = g.negocio_id
          WHERE g.id = ?
            AND COALESCE(g.empresa_id, n.empresa_id) = ?
            AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)`,
        [id, empresaId]
      );
      if (!gasto) return res.status(404).json({ ok: false, error: 'Gasto no encontrado.' });
      const estadoActual = String(gasto.estado || 'PAGADO').toUpperCase();
      if (estadoActual === 'ANULADO') {
        return res.status(400).json({ ok: false, error: 'No se puede pagar un gasto anulado.' });
      }

      const montoAnterior = Number(gasto.monto_pagado || 0);
      const nuevoMontoPagado = Number((montoAnterior + montoPago).toFixed(2));
      const montoTotal = Number(gasto.monto || 0);
      const estadoFinal = nuevoMontoPagado >= montoTotal ? 'PAGADO' : estadoActual === 'BORRADOR' ? 'PENDIENTE' : estadoActual;

      await db.run(
        `INSERT INTO gastos_pagos
           (gasto_id, negocio_id, fecha, monto, metodo_pago, origen_fondos, origen_detalle, referencia, notas, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          gasto.negocio_id,
          fechaPago,
          montoPago,
          metodoPago,
          origenFondos,
          origenDetalle,
          referencia,
          notas,
          usuarioSesion?.id || null,
        ]
      );

      await db.run(
        `UPDATE gastos
            SET monto_pagado = ?,
                fecha_pago = ?,
                estado = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [nuevoMontoPagado, fechaPago, estadoFinal, id]
      );

      limpiarCacheAnalitica(gasto.negocio_id);
      res.json({ ok: true, estado: estadoFinal, monto_pagado: nuevoMontoPagado });
    } catch (error) {
      console.error('Error al registrar pago de gasto:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el pago.' });
    }
  });
});

app.post('/api/empresa/gastos/batch', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const accion = normalizarCampoTexto(req.body?.accion, null);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => Number(id)).filter((id) => id > 0) : [];
    if (!accion || !ids.length) {
      return res.status(400).json({ ok: false, error: 'Accion e ids son obligatorios.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    try {
      if (accion === 'aprobar') {
        await db.run(
          `UPDATE gastos g
              LEFT JOIN negocios n ON n.id = g.negocio_id
             SET g.estado = 'APROBADO',
                 g.aprobado_por = ?,
                 g.aprobado_at = NOW(),
                 g.updated_at = CURRENT_TIMESTAMP
           WHERE g.id IN (${placeholders})
             AND COALESCE(g.empresa_id, n.empresa_id) = ?
             AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)
             AND (g.estado IS NULL OR g.estado NOT IN ('ANULADO', 'PAGADO'))`,
          [usuarioSesion?.id || null, ...ids, empresaId]
        );
      } else if (accion === 'anular') {
        const motivo = normalizarCampoTexto(req.body?.motivo, 'Anulacion masiva');
        await db.run(
          `UPDATE gastos g
              LEFT JOIN negocios n ON n.id = g.negocio_id
             SET g.estado = 'ANULADO',
                 g.anulado_por = ?,
                 g.anulado_at = NOW(),
                 g.motivo_anulacion = ?,
                 g.updated_at = CURRENT_TIMESTAMP
           WHERE g.id IN (${placeholders})
             AND COALESCE(g.empresa_id, n.empresa_id) = ?
             AND (g.negocio_id IS NULL OR n.deleted_at IS NULL)`,
          [usuarioSesion?.id || null, motivo, ...ids, empresaId]
        );
      } else {
        return res.status(400).json({ ok: false, error: 'Accion no soportada.' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error en accion masiva de gastos:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo ejecutar la accion masiva.' });
    }
  });
});

// ==========================
// Clientes empresa
// ==========================
app.get('/api/empresa/negocios/:id/productos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const negocioId = Number(req.params.id);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Sucursal invalida.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    try {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }
      const productosEmpresa = await db.all(
        `SELECT id, nombre, precio_sugerido AS precio, tipo_producto, activo, stock, stock_indefinido
           FROM empresa_productos
          WHERE empresa_id = ?
            AND activo = 1
            AND tipo_producto <> 'INSUMO'
          ORDER BY nombre ASC`,
        [empresaId]
      );
      const productosMaster = (productosEmpresa || []).map((item) => ({
        ...item,
        origen: 'empresa',
        empresa_producto_id: item.id,
        selector_id: `e-${item.id}`,
      }));
      const productosFinal = [...productosMaster];
      const configImpuesto = await obtenerConfiguracionImpuestoNegocio(negocioId);
      res.json({
        ok: true,
        productos: productosFinal,
        impuesto_porcentaje: configImpuesto.valor,
        productos_con_impuesto: configImpuesto.productosConImpuesto ? 1 : 0,
        impuesto_incluido_valor: configImpuesto.impuestoIncluidoValor,
      });
    } catch (error) {
      console.error('Error al listar productos de sucursal:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar los productos.' });
    }
  });
});

const resolverCategoriaSucursal = async (negocioId, nombreCategoria) => {
  const nombre = normalizarCampoTexto(nombreCategoria, null);
  if (!nombre) return null;
  const existente = await db.get(
    'SELECT id FROM categorias WHERE negocio_id = ? AND LOWER(nombre) = ? LIMIT 1',
    [negocioId, nombre.toLowerCase()]
  );
  if (existente?.id) return existente.id;
  try {
    const insert = await db.run(
      `INSERT INTO categorias (nombre, activo, area_preparacion, negocio_id)
       VALUES (?, 1, 'ninguna', ?)`,
      [nombre, negocioId]
    );
    return insert?.id || null;
  } catch (error) {
    console.warn('No se pudo crear la categoria:', error?.message || error);
    return null;
  }
};

app.get('/api/empresa/negocios/:id/inventario', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const negocioId = Number(req.params.id);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Sucursal invalida.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    try {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }
      const tieneNegocioId = await verificarCategoriaNegocioId();
      const joinCond = tieneNegocioId
        ? 'LEFT JOIN categorias c ON p.categoria_id = c.id AND c.negocio_id = ?'
        : 'LEFT JOIN categorias c ON p.categoria_id = c.id';
      const params = [];
      if (tieneNegocioId) {
        params.push(negocioId);
      }
      params.push(negocioId);

      const rows = await db.all(
        `
        SELECT p.id, p.nombre, p.precio, p.stock, p.stock_indefinido, p.activo, p.tipo_producto,
               p.costo_base_sin_itbis, p.costo_promedio_actual, p.ultimo_costo_sin_itbis,
               p.costo_unitario_real, p.costo_unitario_real_incluye_itbis,
               p.categoria_id, p.unidad_base, p.contenido_por_unidad,
               c.nombre AS categoria_nombre
          FROM productos p
          ${joinCond}
         WHERE p.negocio_id = ?
         ORDER BY p.nombre ASC
        `,
        params
      );

      const productos = (rows || []).map((row) => {
        const stock = Number(row.stock || 0);
        const stockIndef = Number(row.stock_indefinido || 0) === 1;
        const costoBase =
          Number(row.costo_promedio_actual) ||
          Number(row.costo_base_sin_itbis) ||
          Number(row.ultimo_costo_sin_itbis) ||
          Number(row.costo_unitario_real) ||
          0;
        const valorInventario = stockIndef ? 0 : Number((stock * costoBase).toFixed(4));
        return {
          id: row.id,
          nombre: row.nombre,
          categoria: row.categoria_nombre || '',
          tipo_producto: row.tipo_producto || 'FINAL',
          costo_base: Number(row.costo_base_sin_itbis || 0),
          costo_promedio_actual: Number(row.costo_promedio_actual || 0),
          precio_sugerido: Number(row.precio || 0),
          activo: row.activo,
          stock: row.stock,
          stock_minimo: 0,
          stock_indefinido: row.stock_indefinido,
          valor_inventario: valorInventario,
          costo_valoracion: Number(costoBase.toFixed(4)),
        };
      });

      res.json({ ok: true, sucursal: { id: negocioId, nombre: negocio.nombre }, productos });
    } catch (error) {
      console.error('Error al listar inventario de sucursal:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar los productos.' });
    }
  });
});

app.post('/api/empresa/negocios/:id/inventario', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const negocioId = Number(req.params.id);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Sucursal invalida.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
    }
    const tipoProducto = normalizarTipoProducto(req.body?.tipo_producto ?? req.body?.tipo, 'FINAL');
    const precio = normalizarNumero(req.body?.precio_sugerido ?? req.body?.precio, 0);
    const costoBase = normalizarNumero(req.body?.costo_base ?? req.body?.costo, 0);
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    const stockIndefinido = normalizarFlag(req.body?.stock_indefinido ?? req.body?.stockIndefinido, 0) ? 1 : 0;
    let stock = normalizarNumero(req.body?.stock, 0);
    if (stockIndefinido) {
      stock = null;
    }

    try {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }

      const categoriaId = await resolverCategoriaSucursal(negocioId, req.body?.categoria);

      const insert = await db.run(
        `INSERT INTO productos (
            nombre, categoria_id, precio, costo_base_sin_itbis, costo_promedio_actual, ultimo_costo_sin_itbis,
            actualiza_costo_con_compras, costo_unitario_real, costo_unitario_real_incluye_itbis,
            tipo_producto, insumo_vendible, unidad_base, contenido_por_unidad,
            stock, stock_indefinido, activo, negocio_id
          )
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?, 0, 'UND', 1, ?, ?, ?, ?)`,
        [
          nombre,
          categoriaId,
          precio,
          costoBase,
          costoBase,
          costoBase,
          costoBase,
          tipoProducto,
          stock,
          stockIndefinido,
          activo,
          negocioId,
        ]
      );

      res.status(201).json({
        ok: true,
        producto: {
          id: insert?.lastID,
          nombre,
          categoria: req.body?.categoria || '',
          tipo_producto: tipoProducto,
          costo_base: Number(costoBase || 0),
          costo_promedio_actual: Number(costoBase || 0),
          precio_sugerido: Number(precio || 0),
          activo,
          stock,
          stock_indefinido: stockIndefinido,
        },
      });
    } catch (error) {
      console.error('Error al crear producto en sucursal:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el producto.' });
    }
  });
});

app.put('/api/empresa/negocios/:id/inventario/:productoId', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const negocioId = Number(req.params.id);
    const productoId = Number(req.params.productoId);
    if (!Number.isFinite(negocioId) || negocioId <= 0 || !Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: 'Parametros invalidos.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
    }
    const tipoProducto = normalizarTipoProducto(req.body?.tipo_producto ?? req.body?.tipo, 'FINAL');
    const precio = normalizarNumero(req.body?.precio_sugerido ?? req.body?.precio, 0);
    const costoBase = normalizarNumero(req.body?.costo_base ?? req.body?.costo, 0);
    const activo = req.body?.activo === 0 || req.body?.activo === false ? 0 : 1;
    const stockIndefinido = normalizarFlag(req.body?.stock_indefinido ?? req.body?.stockIndefinido, 0) ? 1 : 0;
    let stock = normalizarNumero(req.body?.stock, 0);
    if (stockIndefinido) {
      stock = null;
    }

    try {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }

      const categoriaId = await resolverCategoriaSucursal(negocioId, req.body?.categoria);

      const result = await db.run(
        `UPDATE productos
            SET nombre = ?, categoria_id = ?, precio = ?,
                costo_base_sin_itbis = ?, costo_promedio_actual = ?, ultimo_costo_sin_itbis = ?,
                costo_unitario_real = ?, tipo_producto = ?, stock = ?, stock_indefinido = ?, activo = ?
          WHERE id = ? AND negocio_id = ?`,
        [
          nombre,
          categoriaId,
          precio,
          costoBase,
          costoBase,
          costoBase,
          costoBase,
          tipoProducto,
          stock,
          stockIndefinido,
          activo,
          productoId,
          negocioId,
        ]
      );
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al actualizar producto de sucursal:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el producto.' });
    }
  });
});

app.delete('/api/empresa/negocios/:id/inventario/:productoId', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const negocioId = Number(req.params.id);
    const productoId = Number(req.params.productoId);
    if (!Number.isFinite(negocioId) || negocioId <= 0 || !Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: 'Parametros invalidos.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    try {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }
      const result = await db.run('DELETE FROM productos WHERE id = ? AND negocio_id = ?', [productoId, negocioId]);
      if (result.changes === 0) {
        return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al eliminar producto de sucursal:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el producto.' });
    }
  });
});

app.post('/api/empresa/clientes/desde-sucursal', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const negocioId = Number(req.body?.negocio_id ?? req.body?.negocioId);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Sucursal invalida.' });
    }

    try {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada.' });
      }

      const existente = await db.get(
        `SELECT * FROM clientes
          WHERE empresa_id = ?
            AND negocio_id = ?
            AND (tags LIKE '%SUCURSAL%' OR tipo_cliente = 'EMPRESA')
          ORDER BY id ASC
          LIMIT 1`,
        [empresaId, negocioId]
      );
      if (existente) {
        return res.json({ ok: true, cliente: existente });
      }

      const nombre = negocio.nombre || `Sucursal ${negocioId}`;
      const documento = negocio.rnc || null;
      const telefono = negocio.telefono || null;
      const direccion = negocio.direccion || null;
      const codigo = `SUC-${negocioId}`;

      const insert = await db.run(
        `INSERT INTO clientes (
            empresa_id, negocio_id, nombre, documento, telefono, direccion, codigo,
            tipo_cliente, segmento, estado, vip, credito_activo, credito_limite, credito_dias,
            credito_bloqueo_exceso, tags, activo, creado_en, actualizado_en
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'EMPRESA', 'EMPRESA', 'ACTIVO', 0, 0, 0, 0, 0, 'SUCURSAL', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [empresaId, negocioId, nombre, documento, telefono, direccion, codigo]
      );

      const cliente = await obtenerClienteEmpresa(empresaId, insert?.lastID);
      res.json({ ok: true, cliente });
    } catch (error) {
      console.error('Error al crear cliente desde sucursal:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo preparar la sucursal.' });
    }
  });
});

app.get('/api/empresa/clientes', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const q = normalizarCampoTexto(req.query?.q ?? req.query?.buscar, null);
    const segmentoRaw = normalizarCampoTexto(req.query?.segmento, null);
    const estadoRaw = normalizarCampoTexto(req.query?.estado, null);
    const vipRaw = req.query?.vip ?? req.query?.vip_only;
    const creditoRaw = normalizarCampoTexto(req.query?.credito ?? req.query?.credito_activo, null);
    const balanceRaw = normalizarCampoTexto(req.query?.balance ?? req.query?.saldo, null);
    const scopeRaw = normalizarCampoTexto(req.query?.scope ?? req.query?.alcance, null);
    const negocioId = normalizarNumero(req.query?.negocio_id ?? req.query?.negocioId, null);
    const orden = normalizarCampoTexto(req.query?.orden ?? req.query?.order_by ?? req.query?.orderBy, 'nombre');
    const direccion = (req.query?.dir ?? req.query?.order_dir ?? 'asc').toString().toLowerCase() === 'desc' ? 'desc' : 'asc';
    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 60, 1), 200);

    const segmento = segmentoRaw ? normalizarSegmentoCliente(segmentoRaw, null) : null;
    const estado = estadoRaw ? normalizarEstadoCliente(estadoRaw, null) : null;

    let vip = null;
    if (vipRaw !== undefined && vipRaw !== null && vipRaw !== '') {
      vip = normalizarFlag(vipRaw, 0) ? 1 : 0;
    }

    let creditoActivo = null;
    if (creditoRaw) {
      const credito = creditoRaw.toLowerCase();
      if (['si', 'con', 'true', '1', 'activo', 'credito'].includes(credito)) {
        creditoActivo = 1;
      } else if (['no', 'sin', 'false', '0', 'inactivo'].includes(credito)) {
        creditoActivo = 0;
      }
    } else if (req.query?.credito_activo !== undefined || req.query?.creditoActivo !== undefined) {
      creditoActivo = normalizarFlag(req.query?.credito_activo ?? req.query?.creditoActivo, 0) ? 1 : 0;
    }

    const filtros = ['c.empresa_id = ?'];
    const paramsWhere = [empresaId];

    if (q) {
      const termino = `%${q.toLowerCase()}%`;
      filtros.push(
        '(LOWER(c.nombre) LIKE ? OR LOWER(c.documento) LIKE ? OR LOWER(c.telefono) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.codigo) LIKE ? OR LOWER(c.notas) LIKE ? OR LOWER(c.notas_internas) LIKE ? OR LOWER(c.tags) LIKE ?)'
      );
      paramsWhere.push(termino, termino, termino, termino, termino, termino, termino, termino);
    }
    if (segmento) {
      filtros.push('c.segmento = ?');
      paramsWhere.push(segmento);
    }
    if (estado) {
      filtros.push('c.estado = ?');
      paramsWhere.push(estado);
    }
    if (vip !== null) {
      filtros.push('c.vip = ?');
      paramsWhere.push(vip);
    }
    if (creditoActivo !== null) {
      filtros.push('c.credito_activo = ?');
      paramsWhere.push(creditoActivo);
    }
    if (scopeRaw) {
      const scope = scopeRaw.toLowerCase();
      if (scope === 'global') {
        filtros.push('c.negocio_id IS NULL');
      } else if (scope === 'local') {
        filtros.push('c.negocio_id IS NOT NULL');
      }
    }
    if (Number.isFinite(negocioId) && negocioId > 0) {
      filtros.push('c.negocio_id = ?');
      paramsWhere.push(negocioId);
    }

    const negocioFiltroSql =
      Number.isFinite(negocioId) && negocioId > 0 ? 'AND d.negocio_id = ?' : '';

    const subTotalDeuda = `
      SELECT COALESCE(SUM(d.monto_total), 0)
        FROM clientes_deudas d
        JOIN negocios n ON n.id = d.negocio_id
       WHERE d.cliente_id = c.id
         AND n.empresa_id = ?
         ${negocioFiltroSql}
    `;
    const subTotalAbonos = `
      SELECT COALESCE(SUM(a.monto), 0)
        FROM clientes_abonos a
        JOIN negocios n ON n.id = a.negocio_id
       WHERE a.cliente_id = c.id
         AND n.empresa_id = ?
         ${negocioFiltroSql}
    `;
    const subUltimaCompra = `
      SELECT MAX(d.fecha)
        FROM clientes_deudas d
        JOIN negocios n ON n.id = d.negocio_id
       WHERE d.cliente_id = c.id
         AND n.empresa_id = ?
         ${negocioFiltroSql}
    `;
    const subPrimeraCompra = `
      SELECT MIN(d.fecha)
        FROM clientes_deudas d
        JOIN negocios n ON n.id = d.negocio_id
       WHERE d.cliente_id = c.id
         AND n.empresa_id = ?
         ${negocioFiltroSql}
    `;
    const subCompras = `
      SELECT COUNT(1)
        FROM clientes_deudas d
        JOIN negocios n ON n.id = d.negocio_id
       WHERE d.cliente_id = c.id
         AND n.empresa_id = ?
         ${negocioFiltroSql}
    `;

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const subParams = [];
    const pushSub = () => {
      subParams.push(empresaId);
      if (Number.isFinite(negocioId) && negocioId > 0) {
        subParams.push(negocioId);
      }
    };
    for (let i = 0; i < 5; i += 1) {
      pushSub();
    }

    try {
      const rows = await db.all(
        `
        SELECT c.*,
               (${subTotalDeuda}) AS total_deuda,
               (${subTotalAbonos}) AS total_abonos,
               (${subUltimaCompra}) AS ultima_compra,
               (${subPrimeraCompra}) AS primera_compra,
               (${subCompras}) AS compras_count,
               n.nombre AS sucursal_nombre
          FROM clientes c
          LEFT JOIN negocios n ON n.id = c.negocio_id
          ${whereClause}
        `,
        [...subParams, ...paramsWhere]
      );

      let clientes = (rows || []).map((row) => {
        const resumen = construirResumenClienteEmpresa({
          total_deuda: row.total_deuda,
          total_abonos: row.total_abonos,
          credito_activo: row.credito_activo,
          credito_limite: row.credito_limite,
          credito_dias: row.credito_dias,
          primera_compra: row.primera_compra,
          ultima_compra: row.ultima_compra,
        });

        const estadoCliente = row.estado || (Number(row.activo || 0) === 1 ? 'ACTIVO' : 'INACTIVO');
        return {
          ...row,
          estado: estadoCliente,
          total_deuda: resumen.total,
          total_abonos: resumen.pagado,
          saldo: resumen.saldo,
          en_mora: resumen.en_mora,
          excede_limite: resumen.excede_limite,
          estado_credito: resumen.estado_credito,
        };
      });

      if (balanceRaw) {
        const balance = balanceRaw.toLowerCase();
        if (['debe', 'pendiente', 'saldo', 'con'].includes(balance)) {
          clientes = clientes.filter((c) => Number(c.saldo || 0) > 0);
        } else if (['cero', 'al_dia'].includes(balance)) {
          clientes = clientes.filter((c) => Number(c.saldo || 0) <= 0);
        } else if (['favor', 'a_favor'].includes(balance)) {
          clientes = clientes.filter((c) => Number(c.saldo || 0) < 0);
        }
      }

      const ordenar = (a, b) => {
        const dir = direccion === 'desc' ? -1 : 1;
        const campo = (orden || 'nombre').toLowerCase();
        if (campo === 'ultima_compra') {
          const aVal = a.ultima_compra ? new Date(a.ultima_compra).getTime() : 0;
          const bVal = b.ultima_compra ? new Date(b.ultima_compra).getTime() : 0;
          return (aVal - bVal) * dir;
        }
        if (campo === 'saldo') {
          return (Number(a.saldo || 0) - Number(b.saldo || 0)) * dir;
        }
        if (campo === 'total') {
          return (Number(a.total_deuda || 0) - Number(b.total_deuda || 0)) * dir;
        }
        if (campo === 'compras') {
          return (Number(a.compras_count || 0) - Number(b.compras_count || 0)) * dir;
        }
        const aNombre = (a.nombre || '').toString().toLowerCase();
        const bNombre = (b.nombre || '').toString().toLowerCase();
        if (aNombre < bNombre) return -1 * dir;
        if (aNombre > bNombre) return 1 * dir;
        return 0;
      };

      clientes.sort(ordenar);

      const total = clientes.length;
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginated = clientes.slice(start, end);

      const resumen = clientes.reduce(
        (acc, item) => {
          acc.total += 1;
          acc.vip += Number(item.vip || 0) === 1 ? 1 : 0;
          acc.activos += item.estado === 'ACTIVO' ? 1 : 0;
          acc.en_mora += item.en_mora ? 1 : 0;
          acc.saldo_total += Number(item.saldo || 0);
          return acc;
        },
        { total: 0, vip: 0, activos: 0, en_mora: 0, saldo_total: 0 }
      );

      res.json({
        ok: true,
        clientes: paginated,
        total,
        page,
        limit,
        resumen,
      });
    } catch (error) {
      console.error('Error al listar clientes empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo cargar la lista de clientes.' });
    }
  });
});

app.get('/api/empresa/clientes/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }

    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) {
        return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
      }
      const tagsCliente = String(cliente.tags || '').toUpperCase();
      const tipoCliente = String(cliente.tipo_cliente || '').toUpperCase();
      const esSucursalInterna =
        Number(cliente.negocio_id) > 0 && (tagsCliente.includes('SUCURSAL') || tipoCliente === 'EMPRESA');
      const autoPagoSolicitado = normalizarFlag(req.body?.auto_pago ?? req.body?.autoPago, 0) ? 1 : 0;
      const autoPago = autoPagoSolicitado || esSucursalInterna;

      const totalDeudaRow = await db.get(
        `SELECT COALESCE(SUM(d.monto_total), 0) AS total
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.cliente_id = ?
            AND n.empresa_id = ?`,
        [clienteId, empresaId]
      );
      const totalAbonosRow = await db.get(
        `SELECT COALESCE(SUM(a.monto), 0) AS total
           FROM clientes_abonos a
           JOIN negocios n ON n.id = a.negocio_id
          WHERE a.cliente_id = ?
            AND n.empresa_id = ?`,
        [clienteId, empresaId]
      );
      const fechasRow = await db.get(
        `SELECT MAX(d.fecha) AS ultima_compra,
                MIN(d.fecha) AS primera_compra,
                COUNT(1) AS compras_count
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.cliente_id = ?
            AND n.empresa_id = ?`,
        [clienteId, empresaId]
      );

      const resumen = construirResumenClienteEmpresa({
        total_deuda: totalDeudaRow?.total,
        total_abonos: totalAbonosRow?.total,
        credito_activo: cliente.credito_activo,
        credito_limite: cliente.credito_limite,
        credito_dias: cliente.credito_dias,
        primera_compra: fechasRow?.primera_compra,
        ultima_compra: fechasRow?.ultima_compra,
      });

      res.json({
        ok: true,
        cliente,
        resumen: {
          ...resumen,
          compras_count: Number(fechasRow?.compras_count || 0),
          ultima_compra: fechasRow?.ultima_compra || null,
          primera_compra: fechasRow?.primera_compra || null,
        },
      });
    } catch (error) {
      console.error('Error al obtener cliente empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo cargar el cliente.' });
    }
  });
});

app.post('/api/empresa/clientes', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const payload = req.body || {};
    const nombre = normalizarCampoTexto(payload.nombre, null);
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre del cliente es obligatorio.' });
    }
    const negocioId = normalizarNumero(payload.negocio_id ?? payload.negocioId, null);
    if (Number.isFinite(negocioId) && negocioId > 0) {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(400).json({ ok: false, error: 'La sucursal seleccionada no es valida.' });
      }
    }

    const documento = normalizarCampoTexto(payload.documento, null);
    const tipoDocumento = normalizarCampoTexto(payload.tipo_documento ?? payload.tipoDocumento, null);
    const telefono = normalizarCampoTexto(payload.telefono, null);
    const whatsapp = normalizarCampoTexto(payload.whatsapp, null);
    const email = normalizarCampoTexto(payload.email, null);
    const direccion = normalizarCampoTexto(payload.direccion, null);
    const notas = normalizarCampoTexto(payload.notas, null);
    const codigo = normalizarCampoTexto(payload.codigo, null);
    const tipoCliente = payload.tipo_cliente ? normalizarTipoCliente(payload.tipo_cliente, 'PERSONA') : 'PERSONA';
    const segmento = payload.segmento ? normalizarSegmentoCliente(payload.segmento, 'CONSUMIDOR') : 'CONSUMIDOR';
    const estado = payload.estado ? normalizarEstadoCliente(payload.estado, 'ACTIVO') : 'ACTIVO';
    const vip = normalizarFlag(payload.vip, 0) ? 1 : 0;
    const creditoActivo = normalizarFlag(payload.credito_activo ?? payload.creditoActivo, 0) ? 1 : 0;
    const creditoLimite = normalizarNumero(payload.credito_limite ?? payload.creditoLimite, 0) || 0;
    const creditoDias = normalizarNumero(payload.credito_dias ?? payload.creditoDias, 0) || 0;
    const creditoBloqueo = normalizarFlag(payload.credito_bloqueo_exceso ?? payload.creditoBloqueoExceso, 0) ? 1 : 0;
    const tags = normalizarCampoTexto(payload.tags, null);
    const notasInternas = normalizarCampoTexto(payload.notas_internas ?? payload.notasInternas, null);
    const fechaCumple = esFechaISOValida(payload.fecha_cumple ?? payload.fechaCumple)
      ? payload.fecha_cumple ?? payload.fechaCumple
      : null;
    const metodoPagoPreferido = normalizarCampoTexto(
      payload.metodo_pago_preferido ?? payload.metodoPagoPreferido,
      null
    );

    const forzarDuplicado = normalizarFlag(payload.forceDuplicate ?? payload.forzar_duplicado, 0) === 1;
    if (!forzarDuplicado && (documento || telefono || email)) {
      const condiciones = [];
      const paramsDup = [empresaId];
      if (documento) {
        condiciones.push('documento = ?');
        paramsDup.push(documento);
      }
      if (telefono) {
        condiciones.push('telefono = ?');
        paramsDup.push(telefono);
      }
      if (email) {
        condiciones.push('email = ?');
        paramsDup.push(email);
      }
      if (condiciones.length) {
        const dup = await db.get(
          `SELECT id, nombre, documento, telefono, email
             FROM clientes
            WHERE empresa_id = ?
              AND (${condiciones.join(' OR ')})
            LIMIT 1`,
          paramsDup
        );
        if (dup) {
          return res.status(409).json({ ok: false, error: 'Cliente duplicado.', duplicado: dup });
        }
      }
    }

    try {
      const result = await db.run(
        `INSERT INTO clientes
          (nombre, documento, tipo_documento, telefono, whatsapp, email, direccion, notas, activo, negocio_id, empresa_id,
           codigo, tipo_cliente, segmento, estado, vip, credito_activo, credito_limite, credito_dias, credito_bloqueo_exceso,
           tags, notas_internas, fecha_cumple, metodo_pago_preferido, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          nombre,
          documento,
          tipoDocumento,
          telefono,
          whatsapp,
          email,
          direccion,
          notas,
          ['ACTIVO', 'MORA'].includes(estado) ? 1 : 0,
          Number.isFinite(negocioId) && negocioId > 0 ? negocioId : null,
          empresaId,
          codigo,
          tipoCliente,
          segmento,
          estado,
          vip,
          creditoActivo,
          creditoLimite,
          creditoDias,
          creditoBloqueo,
          tags,
          notasInternas,
          fechaCumple,
          metodoPagoPreferido,
        ]
      );

      const cliente = await obtenerClienteEmpresa(empresaId, result?.id);
      res.status(201).json({ ok: true, cliente });
    } catch (error) {
      console.error('Error al crear cliente empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el cliente.' });
    }
  });
});

app.put('/api/empresa/clientes/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }

    const existente = await obtenerClienteEmpresa(empresaId, clienteId);
    if (!existente) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
    }

    const payload = req.body || {};
    const negocioId = normalizarNumero(payload.negocio_id ?? payload.negocioId, null);
    if (Number.isFinite(negocioId) && negocioId > 0) {
      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(400).json({ ok: false, error: 'La sucursal seleccionada no es valida.' });
      }
    }

    const nombre = normalizarCampoTexto(payload.nombre ?? existente.nombre, null);
    const documento = normalizarCampoTexto(payload.documento ?? existente.documento, null);
    const tipoDocumento = normalizarCampoTexto(
      payload.tipo_documento ?? payload.tipoDocumento ?? existente.tipo_documento,
      null
    );
    const telefono = normalizarCampoTexto(payload.telefono ?? existente.telefono, null);
    const whatsapp = normalizarCampoTexto(payload.whatsapp ?? existente.whatsapp, null);
    const email = normalizarCampoTexto(payload.email ?? existente.email, null);
    const direccion = normalizarCampoTexto(payload.direccion ?? existente.direccion, null);
    const notas = normalizarCampoTexto(payload.notas ?? existente.notas, null);
    const codigo = normalizarCampoTexto(payload.codigo ?? existente.codigo, null);
    const tipoCliente = payload.tipo_cliente ? normalizarTipoCliente(payload.tipo_cliente, existente.tipo_cliente) : existente.tipo_cliente;
    const segmento = payload.segmento ? normalizarSegmentoCliente(payload.segmento, existente.segmento) : existente.segmento;
    const estado = payload.estado ? normalizarEstadoCliente(payload.estado, existente.estado) : existente.estado;
    const vip = payload.vip !== undefined ? (normalizarFlag(payload.vip, existente.vip) ? 1 : 0) : existente.vip;
    const creditoActivo =
      payload.credito_activo !== undefined || payload.creditoActivo !== undefined
        ? normalizarFlag(payload.credito_activo ?? payload.creditoActivo, existente.credito_activo) ? 1 : 0
        : existente.credito_activo;
    const creditoLimite = payload.credito_limite !== undefined || payload.creditoLimite !== undefined
      ? normalizarNumero(payload.credito_limite ?? payload.creditoLimite, existente.credito_limite)
      : existente.credito_limite;
    const creditoDias = payload.credito_dias !== undefined || payload.creditoDias !== undefined
      ? normalizarNumero(payload.credito_dias ?? payload.creditoDias, existente.credito_dias)
      : existente.credito_dias;
    const creditoBloqueo = payload.credito_bloqueo_exceso !== undefined || payload.creditoBloqueoExceso !== undefined
      ? normalizarFlag(payload.credito_bloqueo_exceso ?? payload.creditoBloqueoExceso, existente.credito_bloqueo_exceso) ? 1 : 0
      : existente.credito_bloqueo_exceso;
    const tags = normalizarCampoTexto(payload.tags ?? existente.tags, null);
    const notasInternas = normalizarCampoTexto(
      payload.notas_internas ?? payload.notasInternas ?? existente.notas_internas,
      null
    );
    const fechaCumple = esFechaISOValida(payload.fecha_cumple ?? payload.fechaCumple)
      ? payload.fecha_cumple ?? payload.fechaCumple
      : existente.fecha_cumple;
    const metodoPagoPreferido = normalizarCampoTexto(
      payload.metodo_pago_preferido ?? payload.metodoPagoPreferido ?? existente.metodo_pago_preferido,
      null
    );

    const forzarDuplicado = normalizarFlag(payload.forceDuplicate ?? payload.forzar_duplicado, 0) === 1;
    if (!forzarDuplicado && (documento || telefono || email)) {
      const condiciones = [];
      const paramsDup = [empresaId, clienteId];
      if (documento) {
        condiciones.push('documento = ?');
        paramsDup.push(documento);
      }
      if (telefono) {
        condiciones.push('telefono = ?');
        paramsDup.push(telefono);
      }
      if (email) {
        condiciones.push('email = ?');
        paramsDup.push(email);
      }
      if (condiciones.length) {
        const dup = await db.get(
          `SELECT id, nombre, documento, telefono, email
             FROM clientes
            WHERE empresa_id = ?
              AND id <> ?
              AND (${condiciones.join(' OR ')})
            LIMIT 1`,
          paramsDup
        );
        if (dup) {
          return res.status(409).json({ ok: false, error: 'Cliente duplicado.', duplicado: dup });
        }
      }
    }

    try {
      await db.run(
        `UPDATE clientes
            SET nombre = ?,
                documento = ?,
                tipo_documento = ?,
                telefono = ?,
                whatsapp = ?,
                email = ?,
                direccion = ?,
                notas = ?,
                activo = ?,
                negocio_id = ?,
                codigo = ?,
                tipo_cliente = ?,
                segmento = ?,
                estado = ?,
                vip = ?,
                credito_activo = ?,
                credito_limite = ?,
                credito_dias = ?,
                credito_bloqueo_exceso = ?,
                tags = ?,
                notas_internas = ?,
                fecha_cumple = ?,
                metodo_pago_preferido = ?,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ?
            AND empresa_id = ?`,
        [
          nombre,
          documento,
          tipoDocumento,
          telefono,
          whatsapp,
          email,
          direccion,
          notas,
          ['ACTIVO', 'MORA'].includes(estado) ? 1 : 0,
          Number.isFinite(negocioId) && negocioId > 0 ? negocioId : null,
          codigo,
          tipoCliente,
          segmento,
          estado,
          vip,
          creditoActivo,
          creditoLimite,
          creditoDias,
          creditoBloqueo,
          tags,
          notasInternas,
          fechaCumple,
          metodoPagoPreferido,
          clienteId,
          empresaId,
        ]
      );

      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      res.json({ ok: true, cliente });
    } catch (error) {
      console.error('Error al actualizar cliente empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el cliente.' });
    }
  });
});

app.put('/api/empresa/clientes/:id/estado', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }
    const estado = normalizarEstadoCliente(req.body?.estado ?? req.body?.status, 'ACTIVO');
    const activo = ['ACTIVO', 'MORA'].includes(estado) ? 1 : 0;
    try {
      const result = await db.run(
        `UPDATE clientes
            SET estado = ?,
                activo = ?,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ?
            AND empresa_id = ?`,
        [estado, activo, clienteId, empresaId]
      );
      if (!result?.changes) {
        return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
      }
      res.json({ ok: true, estado });
    } catch (error) {
      console.error('Error al cambiar estado de cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el estado.' });
    }
  });
});

app.get('/api/empresa/clientes/:id/notas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }
    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
      const notas = await db.all(
        `SELECT id, nota, usuario_id, created_at
           FROM clientes_notas
          WHERE cliente_id = ?
            AND empresa_id = ?
          ORDER BY id DESC`,
        [clienteId, empresaId]
      );
      res.json({ ok: true, notas: notas || [] });
    } catch (error) {
      console.error('Error al obtener notas de cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar las notas.' });
    }
  });
});

app.post('/api/empresa/clientes/:id/notas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }
    const nota = normalizarCampoTexto(req.body?.nota ?? req.body?.texto, null);
    if (!nota) {
      return res.status(400).json({ ok: false, error: 'La nota es obligatoria.' });
    }
    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
      const result = await db.run(
        `INSERT INTO clientes_notas (cliente_id, empresa_id, negocio_id, nota, usuario_id)
         VALUES (?, ?, ?, ?, ?)`,
        [clienteId, empresaId, cliente.negocio_id ?? null, nota, usuarioSesion?.id || null]
      );
      const nuevo = await db.get(
        `SELECT id, nota, usuario_id, created_at
           FROM clientes_notas
          WHERE id = ?`,
        [result?.id]
      );
      res.status(201).json({ ok: true, nota: nuevo });
    } catch (error) {
      console.error('Error al guardar nota de cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo guardar la nota.' });
    }
  });
});

app.get('/api/empresa/facturas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const q = normalizarCampoTexto(req.query?.q, null);
    const estadoFiltro = normalizarCampoTexto(req.query?.estado, null);
    const desde = esFechaISOValida(req.query?.desde ?? req.query?.from) ? req.query?.desde ?? req.query?.from : null;
    const hasta = esFechaISOValida(req.query?.hasta ?? req.query?.to) ? req.query?.hasta ?? req.query?.to : null;
    const negocioId = Number(req.query?.negocio_id ?? req.query?.negocioId ?? 0);
    const orden = normalizarCampoTexto(req.query?.orden, 'fecha_desc') || 'fecha_desc';

    const filtros = ['n.empresa_id = ?'];
    const params = [empresaId];
    if (q) {
      const termino = `%${q.toLowerCase()}%`;
      filtros.push('(LOWER(c.nombre) LIKE ? OR LOWER(c.documento) LIKE ? OR LOWER(d.descripcion) LIKE ?)');
      params.push(termino, termino, termino);
    }
    if (desde) {
      filtros.push('d.fecha >= ?');
      params.push(desde);
    }
    if (hasta) {
      filtros.push('d.fecha <= ?');
      params.push(hasta);
    }
    if (Number.isFinite(negocioId) && negocioId > 0) {
      filtros.push('d.negocio_id = ?');
      params.push(negocioId);
    }

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const subTotalAbonos = `
      SELECT COALESCE(SUM(a.monto), 0)
        FROM clientes_abonos a
       WHERE a.deuda_id = d.id
         AND a.negocio_id = d.negocio_id
    `;

    try {
      const rows = await db.all(
        `
        SELECT d.id,
               d.fecha,
               d.descripcion,
               d.monto_total,
               d.notas,
               d.cliente_id,
               d.negocio_id,
               c.nombre AS cliente_nombre,
               c.documento AS cliente_documento,
               c.tags AS cliente_tags,
               c.tipo_cliente AS cliente_tipo,
               c.negocio_id AS cliente_negocio_id,
               n.nombre AS sucursal_nombre,
               (${subTotalAbonos}) AS total_abonos
          FROM clientes_deudas d
          JOIN clientes c ON c.id = d.cliente_id
          JOIN negocios n ON n.id = d.negocio_id
          ${whereClause}
        `,
        params
      );

      let facturas = (rows || []).map((row) => {
        const total = Number(row.monto_total || 0);
        const tags = String(row.cliente_tags || '').toUpperCase();
        const tipoCliente = String(row.cliente_tipo || '').toUpperCase();
        const esSucursal =
          Number(row.cliente_negocio_id) > 0 && (tags.includes('SUCURSAL') || tipoCliente === 'EMPRESA');
        let abonos = Number(row.total_abonos || 0);
        if (esSucursal && abonos < total) {
          abonos = total;
        }
        const saldo = Math.max(total - abonos, 0);
        const estado = saldo <= 0 ? 'PAGADO' : 'PENDIENTE';
        return {
          ...row,
          total_abonos: Number(abonos.toFixed(2)),
          saldo: Number(saldo.toFixed(2)),
          estado,
          es_interna: esSucursal,
        };
      });

      if (estadoFiltro) {
        const estado = estadoFiltro.toUpperCase();
        facturas = facturas.filter((factura) => factura.estado === estado);
      }

      const ordenar = (a, b) => {
        const campo = (orden || 'fecha_desc').toLowerCase();
        if (campo === 'fecha_asc') {
          return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
        }
        if (campo === 'monto_desc') {
          return Number(b.monto_total || 0) - Number(a.monto_total || 0);
        }
        if (campo === 'monto_asc') {
          return Number(a.monto_total || 0) - Number(b.monto_total || 0);
        }
        if (campo === 'cliente') {
          return String(a.cliente_nombre || '').localeCompare(String(b.cliente_nombre || ''));
        }
        return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      };

      facturas.sort(ordenar);

      const resumen = facturas.reduce(
        (acc, row) => {
          acc.total += Number(row.monto_total || 0);
          acc.pagado += Number(row.total_abonos || 0);
          acc.saldo += Number(row.saldo || 0);
          acc.count += 1;
          return acc;
        },
        { total: 0, pagado: 0, saldo: 0, count: 0 }
      );

      res.json({
        ok: true,
        facturas,
        resumen: {
          total: Number(resumen.total.toFixed(2)),
          pagado: Number(resumen.pagado.toFixed(2)),
          saldo: Number(resumen.saldo.toFixed(2)),
          count: resumen.count,
        },
      });
    } catch (error) {
      console.error('Error al listar facturas empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar las facturas.' });
    }
  });
});

app.get('/api/empresa/clientes/:id/deudas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }
    const negocioId = normalizarNumero(req.query?.negocio_id ?? req.query?.negocioId, null);

    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });

      const filtros = ['d.cliente_id = ?', 'n.empresa_id = ?'];
      const params = [clienteId, empresaId];
      if (Number.isFinite(negocioId) && negocioId > 0) {
        filtros.push('d.negocio_id = ?');
        params.push(negocioId);
      }

      const whereClause = `WHERE ${filtros.join(' AND ')}`;
      const rows = await db.all(
        `SELECT d.id, d.fecha, d.descripcion, d.monto_total, d.notas, d.negocio_id, n.nombre AS sucursal_nombre,
                COALESCE(SUM(a.monto), 0) AS total_abonos
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
           LEFT JOIN clientes_abonos a
             ON a.deuda_id = d.id
            AND a.negocio_id = d.negocio_id
          ${whereClause}
          GROUP BY d.id
          ORDER BY d.fecha DESC, d.id DESC`,
        params
      );

      const deudas = (rows || []).map((row) => {
        const monto = Number(row.monto_total) || 0;
        const pagado = Number(row.total_abonos) || 0;
        const saldo = Math.max(monto - pagado, 0);
        const estado = saldo <= 0 ? 'saldada' : pagado > 0 ? 'parcial' : 'pendiente';
        return {
          ...row,
          monto_total: monto,
          total_abonos: pagado,
          pagado,
          saldo,
          estado,
        };
      });

      const resumen = deudas.reduce(
        (acc, deuda) => {
          acc.total_deuda += deuda.monto_total || 0;
          acc.total_abonos += deuda.total_abonos || 0;
          return acc;
        },
        { total_deuda: 0, total_abonos: 0 }
      );
      resumen.saldo_pendiente = Math.max(resumen.total_deuda - resumen.total_abonos, 0);

      res.json({ ok: true, cliente, resumen, deudas });
    } catch (error) {
      console.error('Error al obtener deudas empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar las deudas.' });
    }
  });
});

app.get('/api/empresa/clientes/:id/deudas/:deudaId/detalle', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isFinite(clienteId) || clienteId <= 0 || !Number.isFinite(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos.' });
    }
    try {
      const deuda = await db.get(
        `SELECT d.id
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.id = ?
            AND d.cliente_id = ?
            AND n.empresa_id = ?
          LIMIT 1`,
        [deudaId, clienteId, empresaId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada.' });
      }

      const items = await db.all(
        `SELECT id, producto_id, nombre_producto, cantidad, precio_unitario, total_linea
           FROM clientes_deudas_detalle
          WHERE deuda_id = ?
          ORDER BY id ASC`,
        [deudaId]
      );
      res.json({ ok: true, items: items || [] });
    } catch (error) {
      console.error('Error al obtener detalle de deuda:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el detalle.' });
    }
  });
});

app.post('/api/empresa/clientes/:id/deudas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }

    const negocioId = normalizarNumero(req.body?.negocio_id ?? req.body?.negocioId, null);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Selecciona una sucursal para la factura.' });
    }

    const descripcion = normalizarCampoTexto(req.body?.descripcion, null);
    const notas = normalizarCampoTexto(req.body?.notas, null);
    const fechaEntrada = normalizarCampoTexto(req.body?.fecha, null);
    const fecha = esFechaISOValida(fechaEntrada) ? fechaEntrada : obtenerFechaLocalISO(new Date());
    const origenCaja = normalizarOrigenCaja(req.body?.origen_caja ?? req.body?.origen, 'caja');
    const itemsEntrada = Array.isArray(req.body?.items) ? req.body.items : [];
    const montoEntrada = normalizarNumero(req.body?.monto_total ?? req.body?.montoTotal, null);

    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) {
        return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
      }

      const negocio = await obtenerNegocioEmpresa(empresaId, negocioId);
      if (!negocio) {
        return res.status(400).json({ ok: false, error: 'Sucursal no valida.' });
      }

      let itemsProcesados = [];
      const requeridosInventario = new Map();
      if (!itemsEntrada.length) {
        return res.status(400).json({ ok: false, error: 'Agrega al menos un producto.' });
      }

      const productos = await db.all(
        `SELECT id, nombre, precio
           FROM productos
          WHERE negocio_id = ?
            AND activo = 1`,
        [negocioId]
      );
      const productosMap = new Map((productos || []).map((p) => [Number(p.id), p]));

      const itemsNormalizados = [];
      for (const item of itemsEntrada) {
        const origenRaw = (item?.origen || '').toString().toLowerCase();
        const empresaProductoId = Number(
          item?.producto_empresa_id ??
            item?.productoEmpresaId ??
            (origenRaw === 'empresa' ? item?.id : null)
        );
        const cantidad = normalizarNumero(item?.cantidad, 0);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          return res.status(400).json({ ok: false, error: 'Cantidad invalida en la factura.' });
        }
        if (!Number.isFinite(empresaProductoId) || empresaProductoId <= 0) {
          return res.status(400).json({
            ok: false,
            error: 'Producto invalido. Solo se permiten productos del inventario de la empresa.',
          });
        }
        const precioUnitario = normalizarNumero(item?.precio_unitario ?? item?.precioUnitario, null);
        itemsNormalizados.push({
          empresa_producto_id: empresaProductoId,
          cantidad,
          precio_unitario: precioUnitario,
        });
        requeridosInventario.set(empresaProductoId, (requeridosInventario.get(empresaProductoId) || 0) + cantidad);
      }

      const idsEmpresa = Array.from(requeridosInventario.keys());
      const placeholdersEmpresa = idsEmpresa.map(() => '?').join(',');
      const productosEmpresaRows = await db.all(
        `SELECT id, nombre, precio_sugerido, costo_base, costo_promedio_actual, tipo_producto, activo, stock, stock_indefinido
           FROM empresa_productos
          WHERE empresa_id = ?
            AND id IN (${placeholdersEmpresa})`,
        [empresaId, ...idsEmpresa]
      );
      const productosEmpresaMap = new Map((productosEmpresaRows || []).map((p) => [Number(p.id), p]));
      if (productosEmpresaMap.size !== idsEmpresa.length) {
        return res.status(404).json({ ok: false, error: 'Producto empresa no encontrado.' });
      }

      for (const item of itemsNormalizados) {
        const productoEmpresa = productosEmpresaMap.get(Number(item.empresa_producto_id));
        if (!productoEmpresa || Number(productoEmpresa.activo || 0) !== 1) {
          return res.status(404).json({ ok: false, error: 'Producto empresa no encontrado.' });
        }
        const tipoEmpresa = normalizarTipoProducto(productoEmpresa.tipo_producto, 'FINAL');
        if (tipoEmpresa === 'INSUMO') {
          return res.status(400).json({ ok: false, error: 'No se puede facturar un insumo.' });
        }

        const nombreEmpresa = (productoEmpresa.nombre || '').trim();
        const nombreLower = nombreEmpresa.toLowerCase();
        let productoSucursal = null;
        if (nombreLower) {
          productoSucursal = await db.get(
            `SELECT id, nombre, precio
               FROM productos
              WHERE negocio_id = ?
                AND LOWER(nombre) = ?
              LIMIT 1`,
            [negocioId, nombreLower]
          );
        }
        if (!productoSucursal) {
          const precioBase = Number(productoEmpresa.precio_sugerido || 0) || 0;
          const costoBase = Number(productoEmpresa.costo_base || 0) || 0;
          const sql = `
            INSERT INTO productos (
              nombre, precio, precios, costo_base_sin_itbis, costo_promedio_actual, ultimo_costo_sin_itbis,
              actualiza_costo_con_compras, costo_unitario_real, costo_unitario_real_incluye_itbis,
              tipo_producto, insumo_vendible, unidad_base, contenido_por_unidad,
              stock, stock_indefinido, categoria_id, activo, negocio_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          `;
          const params = [
            nombreEmpresa || `Producto ${productoEmpresa.id}`,
            precioBase,
            null,
            costoBase,
            costoBase,
            costoBase,
            1,
            costoBase,
            0,
            tipoEmpresa,
            0,
            'UND',
            1,
            null,
            1,
            null,
            negocioId,
          ];
          const insert = await db.run(sql, params);
          productoSucursal = {
            id: insert?.lastID,
            nombre: nombreEmpresa,
            precio: precioBase,
          };
        }

        const precioUnitarioEmpresa = Number.isFinite(item.precio_unitario)
          ? Number(item.precio_unitario)
          : Number(productoEmpresa.precio_sugerido || productoSucursal?.precio || 0);
        itemsProcesados.push({
          producto_id: Number(productoSucursal.id),
          empresa_producto_id: Number(productoEmpresa.id),
          nombre: productoSucursal.nombre || nombreEmpresa,
          cantidad: Number(item.cantidad),
          precio_unitario: Number(precioUnitarioEmpresa) || 0,
        });
      }

      for (const [productoId, requerido] of requeridosInventario.entries()) {
        const productoEmpresa = productosEmpresaMap.get(Number(productoId));
        if (!productoEmpresa) continue;
        const stockIndefinido = Number(productoEmpresa.stock_indefinido || 0) === 1;
        const stockActual = Number(productoEmpresa.stock || 0);
        if (!stockIndefinido && stockActual < requerido) {
          return res.status(400).json({
            ok: false,
            error: `Stock insuficiente para ${productoEmpresa.nombre || 'producto'}. Disponible: ${stockActual}`,
          });
        }
      }

      let subtotalBase = Number(montoEntrada) || 0;
      if (itemsProcesados.length) {
        subtotalBase = Number(
          itemsProcesados.reduce(
            (acc, item) => acc + item.cantidad * (Number(item.precio_unitario) || 0),
            0
          ).toFixed(2)
        );
      }
      if (subtotalBase <= 0) {
        return res.status(400).json({ ok: false, error: 'El monto total debe ser mayor a 0.' });
      }

      const configImpuesto = await obtenerConfiguracionImpuestoNegocio(negocioId);
      const totalesDeuda = calcularTotalesConImpuestoConfigurado(subtotalBase, configImpuesto);
      const itbis = totalesDeuda.impuesto;
      const montoTotal = totalesDeuda.total;

      let deudaId = null;
      try {
        await db.run('BEGIN');
        const result = await db.run(
          `INSERT INTO clientes_deudas (cliente_id, negocio_id, fecha, descripcion, monto_total, origen_caja, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [clienteId, negocioId, fecha, descripcion, montoTotal, origenCaja, notas]
        );

        deudaId = result?.id;
        if (deudaId && itemsProcesados.length) {
          for (const item of itemsProcesados) {
            const totalLinea = Number((item.cantidad * item.precio_unitario).toFixed(2));
            await db.run(
              `INSERT INTO clientes_deudas_detalle
                (deuda_id, producto_id, nombre_producto, cantidad, precio_unitario, total_linea, negocio_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                deudaId,
                item.producto_id,
                item.nombre,
                item.cantidad,
                item.precio_unitario,
                totalLinea,
                negocioId,
              ]
            );
          }
        }

        const metodoValoracion = await obtenerMetodoValoracionEmpresa(empresaId);
        for (const [productoId, requerido] of requeridosInventario.entries()) {
          const productoActual = await db.get(
            `SELECT id, nombre, stock, stock_indefinido, costo_base, costo_promedio_actual
               FROM empresa_productos
              WHERE id = ? AND empresa_id = ?
              LIMIT 1`,
            [productoId, empresaId]
          );
          if (!productoActual) {
            const err = new Error('Producto empresa no encontrado.');
            err.status = 404;
            throw err;
          }
          const stockIndefinido = Number(productoActual.stock_indefinido || 0) === 1;
          const stockAntes = stockIndefinido ? null : Number(productoActual.stock || 0);
          if (!stockIndefinido && stockAntes < requerido) {
            const err = new Error(
              `Stock insuficiente para ${productoActual.nombre || 'producto'}. Disponible: ${stockAntes}`
            );
            err.status = 400;
            throw err;
          }

          let costoUnitario = Number(productoActual.costo_promedio_actual || productoActual.costo_base || 0);
          if (metodoValoracion === 'PEPS' && requerido > 0) {
            const consumo = await consumirCapasInventarioEmpresa({
              empresaId,
              productoId,
              cantidad: requerido,
            });
            if (consumo.cantidadConsumida > 0) {
              const restante = Math.max(requerido - consumo.cantidadConsumida, 0);
              const costoTotal = consumo.costoTotal + restante * costoUnitario;
              costoUnitario = requerido > 0 ? costoTotal / requerido : costoUnitario;
            }
          }

          let stockDespues = stockAntes;
          if (!stockIndefinido && Number.isFinite(stockAntes)) {
            stockDespues = Number((stockAntes - requerido).toFixed(4));
            await db.run('UPDATE empresa_productos SET stock = ? WHERE id = ? AND empresa_id = ?', [
              stockDespues,
              productoId,
              empresaId,
            ]);
          }

          await db.run(
            `INSERT INTO empresa_inventario_movimientos
              (empresa_id, producto_id, tipo, cantidad, costo_unitario, motivo, referencia, usuario_id, fecha, stock_antes, stock_despues)
             VALUES (?, ?, 'SALIDA', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              empresaId,
              productoId,
              requerido,
              Number(costoUnitario.toFixed(4)),
              'Factura',
              deudaId ? `FACTURA #${deudaId}` : 'FACTURA',
              usuarioSesion?.id ?? null,
              fecha,
              stockAntes,
              stockDespues,
            ]
          );
        }

        if (autoPago && deudaId) {
          await db.run(
            `INSERT INTO clientes_abonos (deuda_id, cliente_id, negocio_id, fecha, monto, metodo_pago, notas)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              deudaId,
              clienteId,
              negocioId,
              fecha,
              montoTotal,
              'INTERNO',
              'Registro interno de envio a sucursal',
            ]
          );
          await db.run('UPDATE clientes_deudas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deudaId]);
        }

        await db.run('COMMIT');
      } catch (error) {
        await db.run('ROLLBACK').catch(() => {});
        throw error;
      }

      limpiarCacheAnalitica(negocioId);
      res.status(201).json({ ok: true, deuda_id: deudaId });
    } catch (error) {
      console.error('Error al crear deuda empresa:', error?.message || error);
      if (error?.status) {
        res.status(error.status).json({ ok: false, error: error.message || 'No se pudo crear la deuda.' });
        return;
      }
      res.status(500).json({ ok: false, error: 'No se pudo crear la deuda.' });
    }
  });
});

app.get('/api/empresa/clientes/:id/deudas/:deudaId/abonos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isFinite(clienteId) || clienteId <= 0 || !Number.isFinite(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos.' });
    }
    try {
      const deuda = await db.get(
        `SELECT d.id, d.negocio_id
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.id = ?
            AND d.cliente_id = ?
            AND n.empresa_id = ?
          LIMIT 1`,
        [deudaId, clienteId, empresaId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada.' });
      }

      const abonos = await db.all(
        `SELECT id, fecha, monto, metodo_pago, notas, created_at
           FROM clientes_abonos
          WHERE deuda_id = ?
            AND negocio_id = ?
          ORDER BY fecha DESC, id DESC`,
        [deudaId, deuda.negocio_id]
      );
      res.json({ ok: true, abonos: abonos || [] });
    } catch (error) {
      console.error('Error al obtener abonos de deuda:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar los abonos.' });
    }
  });
});

app.post('/api/empresa/clientes/:id/deudas/:deudaId/abonos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isFinite(clienteId) || clienteId <= 0 || !Number.isFinite(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos.' });
    }

    const fechaEntrada = normalizarCampoTexto(req.body?.fecha, null);
    const fecha = esFechaISOValida(fechaEntrada) ? fechaEntrada : obtenerFechaLocalISO(new Date());
    const monto = normalizarNumero(req.body?.monto, null);
    const metodo = normalizarCampoTexto(req.body?.metodo_pago ?? req.body?.metodoPago, null);
    const notas = normalizarCampoTexto(req.body?.notas, null);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a 0.' });
    }
    if (!metodo) {
      return res.status(400).json({ ok: false, error: 'El metodo de pago es obligatorio.' });
    }

    try {
      const deuda = await db.get(
        `SELECT d.id, d.negocio_id
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.id = ?
            AND d.cliente_id = ?
            AND n.empresa_id = ?
          LIMIT 1`,
        [deudaId, clienteId, empresaId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada.' });
      }

      await db.run(
        `INSERT INTO clientes_abonos (deuda_id, cliente_id, negocio_id, fecha, monto, metodo_pago, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deudaId, clienteId, deuda.negocio_id, fecha, monto, metodo, notas]
      );
      await db.run('UPDATE clientes_deudas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deudaId]);
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error al registrar abono de cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el abono.' });
    }
  });
});

app.get('/api/empresa/clientes/:id/abonos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }

    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
      const abonos = await db.all(
        `SELECT a.id, a.fecha, a.monto, a.metodo_pago, a.notas, a.created_at,
                a.deuda_id, d.descripcion, d.negocio_id, n.nombre AS sucursal_nombre
           FROM clientes_abonos a
           JOIN clientes_deudas d ON d.id = a.deuda_id
           JOIN negocios n ON n.id = a.negocio_id
          WHERE a.cliente_id = ?
            AND n.empresa_id = ?
          ORDER BY a.fecha DESC, a.id DESC`,
        [clienteId, empresaId]
      );
      res.json({ ok: true, abonos: abonos || [] });
    } catch (error) {
      console.error('Error al listar abonos cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar los abonos.' });
    }
  });
});

app.get('/api/empresa/clientes/:id/estado-cuenta', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const clienteId = Number(req.params.id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    }
    const desde = esFechaISOValida(req.query?.from ?? req.query?.desde) ? req.query?.from ?? req.query?.desde : null;
    const hasta = esFechaISOValida(req.query?.to ?? req.query?.hasta) ? req.query?.to ?? req.query?.hasta : null;

    try {
      const cliente = await obtenerClienteEmpresa(empresaId, clienteId);
      if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });

      const filtros = ['d.cliente_id = ?', 'n.empresa_id = ?'];
      const params = [clienteId, empresaId];
      if (desde) {
        filtros.push('DATE(d.fecha) >= ?');
        params.push(desde);
      }
      if (hasta) {
        filtros.push('DATE(d.fecha) <= ?');
        params.push(hasta);
      }

      const whereClause = `WHERE ${filtros.join(' AND ')}`;
      const deudas = await db.all(
        `SELECT d.id, d.fecha, d.descripcion, d.monto_total, d.negocio_id, n.nombre AS sucursal_nombre,
                COALESCE(SUM(a.monto), 0) AS total_abonos
           FROM clientes_deudas d
           JOIN negocios n ON n.id = d.negocio_id
           LEFT JOIN clientes_abonos a
             ON a.deuda_id = d.id
            AND a.negocio_id = d.negocio_id
          ${whereClause}
          GROUP BY d.id
          ORDER BY d.fecha ASC`,
        params
      );

      const resumen = deudas.reduce(
        (acc, row) => {
          const monto = Number(row.monto_total) || 0;
          const pagado = Number(row.total_abonos) || 0;
          acc.total += monto;
          acc.pagado += pagado;
          return acc;
        },
        { total: 0, pagado: 0 }
      );
      resumen.saldo = Math.max(resumen.total - resumen.pagado, 0);

      res.json({ ok: true, cliente, desde, hasta, deudas: deudas || [], resumen });
    } catch (error) {
      console.error('Error al generar estado de cuenta:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar el estado de cuenta.' });
    }
  });
});

app.get('/api/empresa/clientes/deudas/:deudaId/factura', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }
    const deudaId = Number(req.params.deudaId);
    if (!Number.isFinite(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Factura invalida.' });
    }

    try {
      const deuda = await db.get(
        `SELECT d.id, d.fecha, d.descripcion, d.monto_total, d.notas, d.negocio_id,
                c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.telefono AS cliente_telefono,
                c.direccion AS cliente_direccion, c.email AS cliente_email,
                n.nombre AS sucursal_nombre, n.rnc AS sucursal_rnc, n.direccion AS sucursal_direccion, n.telefono AS sucursal_telefono
           FROM clientes_deudas d
           JOIN clientes c ON c.id = d.cliente_id
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.id = ?
            AND n.empresa_id = ?
          LIMIT 1`,
        [deudaId, empresaId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Factura no encontrada.' });
      }

      const config = await obtenerConfiguracionFacturacion(deuda.negocio_id);
      const configImpuesto = await obtenerConfiguracionImpuestoNegocio(deuda.negocio_id);
      const items = await db.all(
        `SELECT producto_id, nombre_producto, cantidad, precio_unitario, total_linea
           FROM clientes_deudas_detalle
          WHERE deuda_id = ?
          ORDER BY id ASC`,
        [deudaId]
      );

      let itemsFinal = items || [];
      if (!itemsFinal.length) {
        itemsFinal = [
          {
            producto_id: 0,
            nombre_producto: deuda.descripcion || 'Servicio',
            cantidad: 1,
            precio_unitario: Number(deuda.monto_total) || 0,
            total_linea: Number(deuda.monto_total) || 0,
          },
        ];
      }

      const subtotalItems = Number(
        itemsFinal.reduce((acc, item) => acc + (Number(item.total_linea) || 0), 0).toFixed(2)
      );
      let subtotalFactura = subtotalItems;
      let total = Number(deuda.monto_total) || subtotalItems;
      let itbis = 0;
      const impuestoPorcentaje = configImpuesto.productosConImpuesto
        ? Number(configImpuesto.impuestoIncluidoValor) || 0
        : Number(configImpuesto.valor) || 0;
      if (configImpuesto.productosConImpuesto) {
        const baseBruta = total > 0 ? total : subtotalItems;
        const totalesFactura = calcularTotalesConImpuestoConfigurado(baseBruta, configImpuesto);
        subtotalFactura = totalesFactura.subtotal;
        itbis = totalesFactura.impuesto;
        total = totalesFactura.total;
      } else if (impuestoPorcentaje > 0) {
        itbis = Number((total - subtotalItems).toFixed(2));
        if (itbis <= 0) {
          itbis = Number((subtotalItems * (impuestoPorcentaje / 100)).toFixed(2));
          total = Number((subtotalItems + itbis).toFixed(2));
        }
      }

      res.json({
        ok: true,
        factura: {
          numero: deuda.id,
          fecha: deuda.fecha,
          condicion: 'CREDITO',
          emisor: {
            nombre: deuda.sucursal_nombre,
            rnc: config?.rnc || deuda.sucursal_rnc || '',
            direccion: config?.direccion || deuda.sucursal_direccion || '',
            telefonos: config?.telefonos || (deuda.sucursal_telefono ? [deuda.sucursal_telefono] : []),
          },
          cliente: {
            nombre: deuda.cliente_nombre,
            documento: deuda.cliente_documento || '',
            direccion: deuda.cliente_direccion || '',
            telefono: deuda.cliente_telefono || '',
            email: deuda.cliente_email || '',
          },
          items: itemsFinal,
          subtotal: subtotalFactura,
          itbis,
          itbis_porcentaje: impuestoPorcentaje,
          total,
          notas: deuda.notas || '',
        },
      });
    } catch (error) {
      console.error('Error al generar factura de cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar la factura.' });
    }
  });
});

app.post('/api/empresa/negocios/:id/supervisor', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!puedeGestionarSupervisores(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido' });
    }

    const negocioId = Number(req.params.id);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Sucursal invalida' });
    }

    const empresaIdSesion = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
    if (!empresaIdSesion && !esSuperAdmin(usuarioSesion)) {
      return res.status(400).json({ ok: false, error: 'Empresa no asignada.' });
    }

    const nombre = normalizarCampoTexto(req.body?.nombre, null);
    const usuario = normalizarCampoTexto(req.body?.usuario, null);
    const password = (req.body?.password || '').toString().trim();

    if (!nombre || !usuario || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, usuario y contrasena son obligatorios' });
    }

    try {
      const negocio = await db.get(
        'SELECT id, empresa_id, deleted_at FROM negocios WHERE id = ? LIMIT 1',
        [negocioId]
      );
      if (!negocio || negocio.deleted_at) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
      }
      if (!esSuperAdmin(usuarioSesion) && Number(negocio.empresa_id) !== Number(empresaIdSesion)) {
        return res.status(403).json({ ok: false, error: 'Acceso restringido' });
      }

      const existenteSupervisor = await db.get(
        'SELECT id FROM usuarios WHERE rol = "supervisor" AND negocio_id = ? LIMIT 1',
        [negocioId]
      );
      if (existenteSupervisor) {
        return res.status(400).json({ ok: false, error: 'Ya existe un supervisor asignado a esta sucursal.' });
      }

      const existenteUsuario = await usuariosRepo.findByUsuario(usuario);
      if (existenteUsuario) {
        return res.status(400).json({ ok: false, error: 'Ya existe un usuario con ese nombre de usuario.' });
      }

      const passwordHash = await hashPasswordIfNeeded(password);
      const creado = await usuariosRepo.create({
        nombre,
        usuario,
        password: passwordHash,
        rol: 'supervisor',
        activo: 1,
        negocio_id: negocioId,
        empresa_id: negocio.empresa_id ?? null,
        es_super_admin: 0,
      });

      res.status(201).json({
        ok: true,
        supervisor: {
          id: creado.id,
          nombre: creado.nombre,
          usuario: creado.usuario,
          rol: creado.rol,
          negocio_id: creado.negocio_id,
        },
      });
    } catch (error) {
      console.error('Error al crear supervisor:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el supervisor' });
    }
  });
});

app.post('/api/empresa/negocios/:id/impersonar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioEmpresa(usuarioSesion) && !esSuperAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio invalido' });
    }
    try {
      const negocio = await obtenerNegocioAdmin(id);
      if (!negocio) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio esta eliminado' });
      }
      if (!esSuperAdmin(usuarioSesion)) {
        const empresaId = usuarioSesion?.empresa_id ?? usuarioSesion?.empresaId;
        if (!empresaId || Number(negocio.empresa_id) !== Number(empresaId)) {
          return res.status(403).json({ ok: false, error: 'Acceso restringido a esta sucursal.' });
        }
      }

      let usuarioImpersonar = await obtenerAdminPrincipalNegocio(id, negocio.admin_principal_usuario_id);
      let rolImpersonado = 'admin';
      if (!usuarioImpersonar) {
        const supervisor = await db.get(
          `SELECT id
             FROM usuarios
            WHERE negocio_id = ? AND rol = 'supervisor' AND activo = 1
            ORDER BY id ASC
            LIMIT 1`,
          [id]
        );
        if (!supervisor?.id) {
          return res.status(404).json({ ok: false, error: 'No hay usuario supervisor disponible' });
        }
        usuarioImpersonar = await usuariosRepo.findById(supervisor.id);
        rolImpersonado = 'supervisor';
      }
      if (!usuarioImpersonar) {
        return res.status(404).json({ ok: false, error: 'Usuario principal no encontrado' });
      }

      const token = crearTokenImpersonacion({
        role: rolImpersonado,
        impersonated: true,
        negocio_id: id,
        usuario_id: usuarioImpersonar.id,
        admin_id: usuarioSesion.id,
        impersonated_by_role: usuarioSesion.rol,
      });

      res.json({
        ok: true,
        token,
        rol: rolImpersonado,
        usuario_id: usuarioImpersonar.id,
        usuario: usuarioImpersonar.usuario,
        nombre: usuarioImpersonar.nombre,
        negocio_id: id,
        force_password_change: !!usuarioImpersonar.force_password_change,
        impersonated: true,
        impersonated_by_role: usuarioSesion.rol,
        expires_in: IMPERSONATION_TOKEN_TTL_SECONDS,
      });
    } catch (error) {
      console.error('Error impersonando negocio (empresa):', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo impersonar el negocio' });
    }
  });
});

app.post('/api/admin/empresas/:id/usuarios', (req, res) => {
  requireSuperAdmin(req, res, async () => {
    const empresaId = Number(req.params.id);
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Empresa invalida' });
    }

    const { nombre, usuario, password, negocio_id } = req.body || {};
    const usuarioNormalizado = (usuario || '').trim();
    if (!nombre || !usuarioNormalizado || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, usuario y contraseña son obligatorios' });
    }

    try {
      const empresa = await db.get('SELECT id, nombre FROM empresas WHERE id = ? LIMIT 1', [empresaId]);
      if (!empresa) {
        return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
      }

      let negocioDestino = null;
      if (negocio_id) {
        const negocioRow = await db.get(
          'SELECT id FROM negocios WHERE id = ? AND empresa_id = ? LIMIT 1',
          [negocio_id, empresaId]
        );
        negocioDestino = negocioRow?.id || null;
      }
      if (!negocioDestino) {
        const negocioRow = await db.get(
          'SELECT id FROM negocios WHERE empresa_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1',
          [empresaId]
        );
        negocioDestino = negocioRow?.id || null;
      }
      if (!negocioDestino) {
        return res.status(400).json({ ok: false, error: 'La empresa no tiene sucursales registradas' });
      }

      const existente = await usuariosRepo.findByUsuario(usuarioNormalizado);
      if (existente) {
        return res.status(400).json({ ok: false, error: 'Ya existe un usuario con ese nombre de usuario.' });
      }

      const passwordHash = await hashPasswordIfNeeded(password);
      const creado = await usuariosRepo.create({
        nombre,
        usuario: usuarioNormalizado,
        password: passwordHash,
        rol: 'empresa',
        activo: 1,
        negocio_id: negocioDestino,
        empresa_id: empresaId,
      });

      if (!creado) {
        return res.status(500).json({ ok: false, error: 'No se pudo crear el usuario empresa' });
      }

      res.status(201).json({
        ok: true,
        usuario: {
          id: creado.id,
          nombre: creado.nombre,
          usuario: creado.usuario,
          rol: creado.rol,
          empresa_id: empresaId,
          negocio_id: negocioDestino,
        },
      });
    } catch (error) {
      console.error('Error al crear usuario empresa:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo crear el usuario empresa' });
    }
  });
});

const construirResumenDeudaProductos = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const partes = items
    .map((item) => {
      const cantidad = Number(item?.cantidad) || 0;
      if (!cantidad) return null;
      const cantidadTexto = Number.isInteger(cantidad) ? cantidad : cantidad.toFixed(2);
      const nombre = item?.nombre || item?.producto_nombre || item?.nombre_producto || '';
      return nombre ? `${cantidadTexto}x ${nombre}` : null;
    })
    .filter(Boolean);
  if (!partes.length) return null;
  const resumen = partes.slice(0, 3).join(', ');
  return partes.length > 3 ? `${resumen} y ${partes.length - 3} mas` : resumen;
};

const calcularConsumoInsumosPorProductos = async (itemsPorProducto, negocioId) => {
  const consumoPorInsumo = new Map();
  const insumosMap = new Map();

  const productoIds = Array.from(itemsPorProducto.keys()).filter((id) => Number.isFinite(id) && id > 0);
  if (productoIds.length === 0) {
    return { consumoPorInsumo, insumosMap };
  }

  const recetasMap = await obtenerRecetasPorProductos(productoIds, negocioId);
  if (!recetasMap.size) {
    return { consumoPorInsumo, insumosMap };
  }

  for (const [productoId, cantidadProducto] of itemsPorProducto.entries()) {
    const receta = recetasMap.get(Number(productoId));
    if (!Array.isArray(receta) || receta.length === 0) {
      continue;
    }
    receta.forEach((detalle) => {
      if (detalle.tipo_producto !== 'INSUMO') {
        return;
      }
      const cantidadBase = Number((Number(cantidadProducto) * (Number(detalle.cantidad) || 0)).toFixed(4));
      if (!cantidadBase) return;
      const contenido = normalizarContenidoPorUnidad(detalle.contenido_por_unidad, 1);
      const cantidadUnidades = contenido > 0 ? Number((cantidadBase / contenido).toFixed(4)) : 0;
      if (!cantidadUnidades) return;
      const acumulado = consumoPorInsumo.get(detalle.insumo_id) || 0;
      consumoPorInsumo.set(detalle.insumo_id, Number((acumulado + cantidadUnidades).toFixed(4)));
      if (!insumosMap.has(detalle.insumo_id)) {
        insumosMap.set(detalle.insumo_id, detalle);
      }
    });
  }

  return { consumoPorInsumo, insumosMap };
};

const validarStockInsumos = (consumoPorInsumo, insumosMap, bloquearInsumosSinStock) => {
  const advertencias = [];
  for (const [insumoId, cantidadRequerida] of consumoPorInsumo.entries()) {
    if (!cantidadRequerida) continue;
    const insumo = insumosMap.get(insumoId);
    if (!insumo || esStockIndefinido(insumo)) {
      continue;
    }
    const stockDisponible = Number(insumo.stock) || 0;
    if (cantidadRequerida > stockDisponible) {
      const mensaje = `Stock insuficiente para insumo ${insumo.insumo_nombre || insumoId}.`;
      if (bloquearInsumosSinStock) {
        const error = new Error(mensaje);
        error.status = 400;
        throw error;
      }
      advertencias.push(mensaje);
    }
  }
  return advertencias;
};

const prepararItemsDeuda = async (
  itemsEntrada,
  negocioId,
  { validarStock = true, usaRecetas = false, bloquearInsumosSinStock = false } = {}
) => {
  const itemsLista = Array.isArray(itemsEntrada) ? itemsEntrada : [];
  const ids = Array.from(
    new Set(
      itemsLista
        .map((item) => Number(item?.producto_id ?? item?.productoId ?? item?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (!ids.length) {
    const error = new Error('Selecciona productos validos.');
    error.status = 400;
    throw error;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const productos = await db.all(
    `SELECT id, nombre, precio, precios, stock, stock_indefinido, tipo_producto, insumo_vendible,
            contenido_por_unidad, unidad_base
       FROM productos
      WHERE negocio_id = ? AND id IN (${placeholders})`,
    [negocioId, ...ids]
  );
  const productosMap = new Map((productos || []).map((producto) => [Number(producto.id), producto]));

  if (productosMap.size !== ids.length) {
    const error = new Error('Hay productos invalidos en la deuda.');
    error.status = 400;
    throw error;
  }

  const itemsProcesados = [];

  for (const item of itemsLista) {
    const productoId = Number(item?.producto_id ?? item?.productoId ?? item?.id);
    const cantidad = normalizarNumero(item?.cantidad, 0);
    if (!Number.isFinite(productoId) || productoId <= 0) {
      const error = new Error('Hay un producto invalido en la deuda.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      const error = new Error('Todas las cantidades deben ser mayores a cero.');
      error.status = 400;
      throw error;
    }

    const producto = productosMap.get(productoId);
    if (!producto) {
      const error = new Error(`Producto ${productoId} no encontrado.`);
      error.status = 404;
      throw error;
    }

    const tipoProducto = normalizarTipoProducto(producto.tipo_producto, 'FINAL');
    const esInsumo = tipoProducto === 'INSUMO';
    const insumoVendible = normalizarFlag(producto.insumo_vendible, 0) === 1;
    if (usaRecetas && esInsumo && !insumoVendible) {
      const error = new Error(`El producto ${producto.nombre || productoId} es un insumo no vendible.`);
      error.status = 400;
      throw error;
    }

    const stockIndefinido = esStockIndefinido(producto);
    if (validarStock && !stockIndefinido) {
      const stockDisponible = Number(producto.stock) || 0;
      if (cantidad > stockDisponible) {
        const error = new Error(`Stock insuficiente para ${producto.nombre || `el producto ${productoId}`}.`);
        error.status = 400;
        throw error;
      }
    }

    const opcionesPrecio = construirOpcionesPrecioProducto(producto);
    let precioUnitario = opcionesPrecio.length ? opcionesPrecio[0].valor : normalizarNumero(producto.precio, 0);
    const precioSolicitadoRaw = item?.precio_unitario ?? item?.precioUnitario ?? null;
    if (precioSolicitadoRaw !== null && precioSolicitadoRaw !== undefined && precioSolicitadoRaw !== '') {
      const precioSolicitado = normalizarNumero(precioSolicitadoRaw, null);
      if (precioSolicitado === null || precioSolicitado < 0) {
        const error = new Error(`Precio invalido para ${producto.nombre || productoId}.`);
        error.status = 400;
        throw error;
      }
      precioUnitario = Number(precioSolicitado.toFixed(2));
    }

    itemsProcesados.push({
      producto_id: productoId,
      nombre: producto.nombre,
      cantidad,
      precio_unitario: Number(precioUnitario) || 0,
      stock_indefinido: stockIndefinido ? 1 : 0,
      tipo_producto: tipoProducto,
      insumo_vendible: insumoVendible ? 1 : 0,
    });
  }

  const total = Number(
    itemsProcesados.reduce((acc, item) => acc + item.cantidad * (Number(item.precio_unitario) || 0), 0).toFixed(2)
  );

  const itemsPorProducto = new Map();
  itemsProcesados.forEach((item) => {
    const acumulado = itemsPorProducto.get(item.producto_id) || 0;
    itemsPorProducto.set(item.producto_id, Number((acumulado + item.cantidad).toFixed(4)));
  });

  let consumoPorInsumo = new Map();
  let insumosMap = new Map();
  let advertenciasInsumos = [];

  if (usaRecetas && itemsPorProducto.size > 0) {
    const resultadoConsumo = await calcularConsumoInsumosPorProductos(itemsPorProducto, negocioId);
    consumoPorInsumo = resultadoConsumo.consumoPorInsumo;
    insumosMap = resultadoConsumo.insumosMap;
    if (validarStock) {
      advertenciasInsumos = validarStockInsumos(
        consumoPorInsumo,
        insumosMap,
        bloquearInsumosSinStock
      );
    }
  }

  return {
    itemsProcesados,
    itemsPorProducto,
    total,
    consumoPorInsumo,
    insumosMap,
    advertenciasInsumos,
  };
};

// Deudas de clientes
app.get('/api/clientes/:id/deudas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const clienteId = Number(req.params.id);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cliente invalido' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const cliente = await db.get(
        'SELECT id, nombre FROM clientes WHERE id = ? AND negocio_id = ? LIMIT 1',
        [clienteId, negocioId]
      );
      if (!cliente) {
        return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
      }

      const rows = await db.all(
        `SELECT d.id,
                d.fecha,
                d.descripcion,
                d.monto_total,
                d.notas,
                COALESCE(SUM(a.monto), 0) AS total_abonos
           FROM clientes_deudas d
           LEFT JOIN clientes_abonos a
             ON a.deuda_id = d.id
            AND a.negocio_id = d.negocio_id
          WHERE d.cliente_id = ?
            AND d.negocio_id = ?
          GROUP BY d.id
          ORDER BY d.fecha DESC, d.id DESC`,
        [clienteId, negocioId]
      );

      const deudas = (rows || []).map((row) => {
        const monto = Number(row.monto_total) || 0;
        const pagado = Number(row.total_abonos) || 0;
        const saldo = Math.max(monto - pagado, 0);
        const estado = saldo <= 0 ? 'saldada' : pagado > 0 ? 'parcial' : 'pendiente';
        return {
          id: row.id,
          fecha: row.fecha,
          descripcion: row.descripcion,
          monto_total: monto,
          notas: row.notas,
          total_abonos: pagado,
          pagado,
          saldo,
          estado,
        };
      });

      const resumen = deudas.reduce(
        (acc, deuda) => {
          acc.total_deuda += deuda.monto_total || 0;
          acc.total_abonos += deuda.total_abonos || 0;
          return acc;
        },
        { total_deuda: 0, total_abonos: 0 }
      );
      resumen.saldo_pendiente = Math.max(resumen.total_deuda - resumen.total_abonos, 0);

      res.json({ ok: true, cliente, resumen, deudas });
    } catch (error) {
      console.error('Error al obtener deudas del cliente:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener las deudas' });
    }
  });
});

app.get('/api/clientes/:id/deudas/:deudaId/detalle', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isInteger(clienteId) || clienteId <= 0 || !Number.isInteger(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const deuda = await db.get(
        'SELECT id FROM clientes_deudas WHERE id = ? AND cliente_id = ? AND negocio_id = ? LIMIT 1',
        [deudaId, clienteId, negocioId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada' });
      }

      const items = await db.all(
        `SELECT id, producto_id, nombre_producto, cantidad, precio_unitario, total_linea
           FROM clientes_deudas_detalle
          WHERE deuda_id = ? AND negocio_id = ?
          ORDER BY id ASC`,
        [deudaId, negocioId]
      );

      res.json({ ok: true, items: items || [] });
    } catch (error) {
      console.error('Error al obtener detalle de deuda:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el detalle de la deuda' });
    }
  });
});

app.post('/api/clientes/:id/deudas', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const clienteId = Number(req.params.id);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cliente invalido' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const origenFallback = usuarioSesion?.rol === 'vendedor' ? 'mostrador' : 'caja';
    const origenCaja = normalizarOrigenCaja(req.body?.origen_caja ?? req.body?.origen, origenFallback);
    const descripcionEntrada = normalizarCampoTexto(req.body?.descripcion, null);
    const notas = normalizarCampoTexto(req.body?.notas, null);
    const fechaEntrada = normalizarCampoTexto(req.body?.fecha, null);
    const fecha = esFechaISOValida(fechaEntrada) ? fechaEntrada : obtenerFechaLocalISO(new Date());
    const itemsEntrada = Array.isArray(req.body?.items) ? req.body.items : [];
    const usaItems = itemsEntrada.length > 0;

    try {
      const cliente = await db.get(
        'SELECT id FROM clientes WHERE id = ? AND negocio_id = ? LIMIT 1',
        [clienteId, negocioId]
      );
      if (!cliente) {
        return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
      }

      const modoInventario = await obtenerModoInventarioCostos(negocioId);
      const usaRecetas = modoInventario === 'PREPARACION';
      const bloquearInsumosSinStock = usaRecetas ? await obtenerConfigBloqueoInsumos(negocioId) : false;

      let itemsProcesados = [];
      let consumoPorInsumo = new Map();
      let insumosMap = new Map();
      let advertenciasInsumos = [];
      let montoTotal = null;

      if (usaItems) {
        const resultado = await prepararItemsDeuda(itemsEntrada, negocioId, {
          validarStock: true,
          usaRecetas,
          bloquearInsumosSinStock,
        });
        itemsProcesados = resultado.itemsProcesados;
        consumoPorInsumo = resultado.consumoPorInsumo;
        insumosMap = resultado.insumosMap;
        advertenciasInsumos = resultado.advertenciasInsumos;
        montoTotal = resultado.total;
      } else {
        montoTotal = normalizarMonto(req.body?.monto ?? req.body?.monto_total ?? req.body?.total);
      }

      if (!montoTotal || montoTotal <= 0) {
        return res.status(400).json({ ok: false, error: 'El monto de la deuda es obligatorio' });
      }

      const descripcion =
        descripcionEntrada || (usaItems ? construirResumenDeudaProductos(itemsProcesados) : null);

      await db.run('BEGIN');

      const insert = await db.run(
        `INSERT INTO clientes_deudas (cliente_id, negocio_id, fecha, descripcion, monto_total, origen_caja, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [clienteId, negocioId, fecha, descripcion, montoTotal, origenCaja, notas]
      );

      const deudaId = insert.lastID;

      if (usaItems && deudaId) {
        for (const item of itemsProcesados) {
          const totalLinea = Number(
            (Number(item.precio_unitario || 0) * Number(item.cantidad || 0)).toFixed(2)
          );
          await db.run(
            `INSERT INTO clientes_deudas_detalle
              (deuda_id, producto_id, nombre_producto, cantidad, precio_unitario, total_linea, negocio_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              deudaId,
              item.producto_id,
              item.nombre || null,
              item.cantidad,
              item.precio_unitario,
              totalLinea,
              negocioId,
            ]
          );

          if (!item.stock_indefinido) {
            const stockResult = await db.run(
              'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
              [item.cantidad, item.producto_id, negocioId, item.cantidad]
            );
            if (stockResult.changes === 0) {
              const error = new Error(`No se pudo actualizar el stock del producto ${item.producto_id}.`);
              error.status = 400;
              throw error;
            }
          }
        }

        if (usaRecetas && consumoPorInsumo.size > 0) {
          for (const [insumoId, cantidadUnidades] of consumoPorInsumo.entries()) {
            if (!cantidadUnidades) continue;
            const insumo = insumosMap.get(insumoId);
            if (!insumo || esStockIndefinido(insumo)) {
              continue;
            }
            const stockResult = await db.run(
              'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
              [cantidadUnidades, insumoId, negocioId, cantidadUnidades]
            );
            if (stockResult.changes === 0) {
              const error = new Error(`No se pudo actualizar el stock del insumo ${insumoId}.`);
              error.status = 400;
              throw error;
            }
          }
        }
      }

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.status(201).json({
        ok: true,
        deuda: {
          id: deudaId,
          cliente_id: clienteId,
          fecha,
          descripcion,
          monto_total: montoTotal,
          notas,
        },
        advertencias: advertenciasInsumos.length ? advertenciasInsumos : undefined,
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      const status = error?.status || 500;
      console.error('Error al registrar deuda:', error?.message || error);
      res.status(status).json({ ok: false, error: error?.message || 'No se pudo registrar la deuda' });
    }
  });
});

app.put('/api/clientes/:id/deudas/:deudaId', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isInteger(clienteId) || clienteId <= 0 || !Number.isInteger(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const descripcionEntrada = normalizarCampoTexto(req.body?.descripcion, null);
    const notas = normalizarCampoTexto(req.body?.notas, null);
    const fechaEntrada = normalizarCampoTexto(req.body?.fecha, null);
    const fecha = esFechaISOValida(fechaEntrada) ? fechaEntrada : obtenerFechaLocalISO(new Date());
    const itemsEntrada = Array.isArray(req.body?.items) ? req.body.items : [];
    const usaItems = itemsEntrada.length > 0;

    try {
      const deuda = await db.get(
        'SELECT id FROM clientes_deudas WHERE id = ? AND cliente_id = ? AND negocio_id = ? LIMIT 1',
        [deudaId, clienteId, negocioId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada' });
      }

      let montoTotal = null;
      let itemsProcesados = [];
      let itemsPorProducto = new Map();
      let consumoPorInsumoNuevo = new Map();
      let insumosNuevoMap = new Map();
      let advertenciasInsumos = [];
      let usaRecetas = false;
      let bloquearInsumosSinStock = false;

      if (usaItems) {
        const modoInventario = await obtenerModoInventarioCostos(negocioId);
        usaRecetas = modoInventario === 'PREPARACION';
        bloquearInsumosSinStock = usaRecetas ? await obtenerConfigBloqueoInsumos(negocioId) : false;

        const resultado = await prepararItemsDeuda(itemsEntrada, negocioId, {
          validarStock: false,
          usaRecetas,
          bloquearInsumosSinStock,
        });
        itemsProcesados = resultado.itemsProcesados;
        itemsPorProducto = resultado.itemsPorProducto;
        consumoPorInsumoNuevo = resultado.consumoPorInsumo;
        insumosNuevoMap = resultado.insumosMap;
        montoTotal = resultado.total;
      } else {
        montoTotal = normalizarMonto(req.body?.monto ?? req.body?.monto_total ?? req.body?.total);
      }

      if (!montoTotal || montoTotal <= 0) {
        return res.status(400).json({ ok: false, error: 'El monto de la deuda es obligatorio' });
      }

      const descripcion =
        descripcionEntrada || (usaItems ? construirResumenDeudaProductos(itemsProcesados) : null);

      if (!usaItems) {
        const detalleExistente = await db.get(
          'SELECT COUNT(1) AS total FROM clientes_deudas_detalle WHERE deuda_id = ? AND negocio_id = ?',
          [deudaId, negocioId]
        );
        if (Number(detalleExistente?.total) > 0) {
          return res.status(400).json({
            ok: false,
            error: 'La deuda tiene productos registrados. Modifica el detalle para actualizar el monto.',
          });
        }

        const result = await db.run(
          `UPDATE clientes_deudas
              SET fecha = ?,
                  descripcion = ?,
                  monto_total = ?,
                  notas = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND cliente_id = ? AND negocio_id = ?`,
          [fecha, descripcion, montoTotal, notas, deudaId, clienteId, negocioId]
        );

        if (result.changes === 0) {
          return res.status(404).json({ ok: false, error: 'Deuda no encontrada' });
        }

        limpiarCacheAnalitica(negocioId);
        return res.json({ ok: true });
      }

      const prevRows = await db.all(
        'SELECT producto_id, cantidad FROM clientes_deudas_detalle WHERE deuda_id = ? AND negocio_id = ?',
        [deudaId, negocioId]
      );
      const prevItemsPorProducto = new Map();
      (prevRows || []).forEach((row) => {
        const productoId = Number(row.producto_id);
        if (!Number.isFinite(productoId) || productoId <= 0) return;
        const cantidad = normalizarNumero(row.cantidad, 0);
        const acumulado = prevItemsPorProducto.get(productoId) || 0;
        prevItemsPorProducto.set(productoId, Number((acumulado + cantidad).toFixed(4)));
      });

      const idsUnion = Array.from(
        new Set([...prevItemsPorProducto.keys(), ...itemsPorProducto.keys()])
      );
      if (idsUnion.length === 0) {
        return res.status(400).json({ ok: false, error: 'Selecciona productos validos.' });
      }

      const placeholders = idsUnion.map(() => '?').join(', ');
      const productosUnion = await db.all(
        `SELECT id, nombre, stock, stock_indefinido
           FROM productos
          WHERE negocio_id = ? AND id IN (${placeholders})`,
        [negocioId, ...idsUnion]
      );
      const productosUnionMap = new Map(
        (productosUnion || []).map((producto) => [Number(producto.id), producto])
      );

      if (productosUnionMap.size !== idsUnion.length) {
        return res.status(400).json({ ok: false, error: 'Hay productos invalidos en la deuda.' });
      }

      const consumoAnteriorResultado = usaRecetas
        ? await calcularConsumoInsumosPorProductos(prevItemsPorProducto, negocioId)
        : { consumoPorInsumo: new Map(), insumosMap: new Map() };
      const consumoPorInsumoPrevio = consumoAnteriorResultado.consumoPorInsumo;
      const insumosPrevMap = consumoAnteriorResultado.insumosMap;

      const insumosUnionMap = new Map([...insumosPrevMap.entries(), ...insumosNuevoMap.entries()]);
      const insumoIdsUnion = Array.from(
        new Set([...consumoPorInsumoPrevio.keys(), ...consumoPorInsumoNuevo.keys()])
      );

      for (const productoId of idsUnion) {
        const producto = productosUnionMap.get(productoId);
        if (!producto) continue;
        if (esStockIndefinido(producto)) continue;
        const cantidadPrev = prevItemsPorProducto.get(productoId) || 0;
        const cantidadNueva = itemsPorProducto.get(productoId) || 0;
        const delta = Number((cantidadNueva - cantidadPrev).toFixed(4));
        if (delta <= 0) continue;
        const stockDisponible = Number(producto.stock) || 0;
        if (delta > stockDisponible) {
          return res.status(400).json({
            ok: false,
            error: `Stock insuficiente para ${producto.nombre || `el producto ${productoId}`}.`,
          });
        }
      }

      if (usaRecetas && insumoIdsUnion.length > 0) {
        for (const insumoId of insumoIdsUnion) {
          const nuevo = consumoPorInsumoNuevo.get(insumoId) || 0;
          const previo = consumoPorInsumoPrevio.get(insumoId) || 0;
          const delta = Number((nuevo - previo).toFixed(4));
          if (delta <= 0) continue;
          const insumo = insumosUnionMap.get(insumoId);
          if (!insumo || esStockIndefinido(insumo)) continue;
          const stockDisponible = Number(insumo.stock) || 0;
          if (delta > stockDisponible) {
            const mensaje = `Stock insuficiente para insumo ${insumo.insumo_nombre || insumoId}.`;
            if (bloquearInsumosSinStock) {
              return res.status(400).json({ ok: false, error: mensaje });
            }
            advertenciasInsumos.push(mensaje);
          }
        }
      }

      await db.run('BEGIN');

      const result = await db.run(
        `UPDATE clientes_deudas
            SET fecha = ?,
                descripcion = ?,
                monto_total = ?,
                notas = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND cliente_id = ? AND negocio_id = ?`,
        [fecha, descripcion, montoTotal, notas, deudaId, clienteId, negocioId]
      );

      if (result.changes === 0) {
        await db.run('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada' });
      }

      await db.run('DELETE FROM clientes_deudas_detalle WHERE deuda_id = ? AND negocio_id = ?', [
        deudaId,
        negocioId,
      ]);

      for (const item of itemsProcesados) {
        const totalLinea = Number(
          (Number(item.precio_unitario || 0) * Number(item.cantidad || 0)).toFixed(2)
        );
        await db.run(
          `INSERT INTO clientes_deudas_detalle
            (deuda_id, producto_id, nombre_producto, cantidad, precio_unitario, total_linea, negocio_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            deudaId,
            item.producto_id,
            item.nombre || null,
            item.cantidad,
            item.precio_unitario,
            totalLinea,
            negocioId,
          ]
        );
      }

      for (const productoId of idsUnion) {
        const producto = productosUnionMap.get(productoId);
        if (!producto || esStockIndefinido(producto)) continue;
        const cantidadPrev = prevItemsPorProducto.get(productoId) || 0;
        const cantidadNueva = itemsPorProducto.get(productoId) || 0;
        const delta = Number((cantidadNueva - cantidadPrev).toFixed(4));
        if (!delta) continue;
        if (delta > 0) {
          const stockResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
            [delta, productoId, negocioId, delta]
          );
          if (stockResult.changes === 0) {
            const error = new Error(`No se pudo actualizar el stock del producto ${productoId}.`);
            error.status = 400;
            throw error;
          }
        } else {
          await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND negocio_id = ?',
            [Math.abs(delta), productoId, negocioId]
          );
        }
      }

      if (usaRecetas && insumoIdsUnion.length > 0) {
        for (const insumoId of insumoIdsUnion) {
          const nuevo = consumoPorInsumoNuevo.get(insumoId) || 0;
          const previo = consumoPorInsumoPrevio.get(insumoId) || 0;
          const delta = Number((nuevo - previo).toFixed(4));
          if (!delta) continue;
          const insumo = insumosUnionMap.get(insumoId);
          if (!insumo || esStockIndefinido(insumo)) continue;
          if (delta > 0) {
            const stockResult = await db.run(
              'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
              [delta, insumoId, negocioId, delta]
            );
            if (stockResult.changes === 0) {
              const error = new Error(`No se pudo actualizar el stock del insumo ${insumoId}.`);
              error.status = 400;
              throw error;
            }
          } else {
            await db.run(
              'UPDATE productos SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND negocio_id = ?',
              [Math.abs(delta), insumoId, negocioId]
            );
          }
        }
      }

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.json({ ok: true, advertencias: advertenciasInsumos.length ? advertenciasInsumos : undefined });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al actualizar deuda:', error?.message || error);
      const status = error?.status || 500;
      res.status(status).json({ ok: false, error: error?.message || 'No se pudo actualizar la deuda' });
    }
  });
});

app.get('/api/clientes/:id/deudas/:deudaId/abonos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isInteger(clienteId) || clienteId <= 0 || !Number.isInteger(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;

    try {
      const deuda = await db.get(
        'SELECT id FROM clientes_deudas WHERE id = ? AND cliente_id = ? AND negocio_id = ? LIMIT 1',
        [deudaId, clienteId, negocioId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada' });
      }

      const rows = await db.all(
        `SELECT id, fecha, monto, metodo_pago, notas
           FROM clientes_abonos
          WHERE deuda_id = ? AND cliente_id = ? AND negocio_id = ?
          ORDER BY fecha DESC, id DESC`,
        [deudaId, clienteId, negocioId]
      );

      res.json({ ok: true, abonos: rows || [] });
    } catch (error) {
      console.error('Error al obtener abonos:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los abonos' });
    }
  });
});

app.post('/api/clientes/:id/deudas/:deudaId/abonos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const clienteId = Number(req.params.id);
    const deudaId = Number(req.params.deudaId);
    if (!Number.isInteger(clienteId) || clienteId <= 0 || !Number.isInteger(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'IDs invalidos' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const fechaEntrada = normalizarCampoTexto(req.body?.fecha, null);
    const fecha = esFechaISOValida(fechaEntrada) ? fechaEntrada : obtenerFechaLocalISO(new Date());
    const monto = normalizarMonto(req.body?.monto);
    const metodoPago = normalizarCampoTexto(req.body?.metodo_pago ?? req.body?.metodoPago, null);
    const notas = normalizarCampoTexto(req.body?.notas, null);

    if (!monto || monto <= 0) {
      return res.status(400).json({ ok: false, error: 'El monto del abono es obligatorio' });
    }

    try {
      const deuda = await db.get(
        'SELECT id FROM clientes_deudas WHERE id = ? AND cliente_id = ? AND negocio_id = ? LIMIT 1',
        [deudaId, clienteId, negocioId]
      );
      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Deuda no encontrada' });
      }

      const insert = await db.run(
        `INSERT INTO clientes_abonos (deuda_id, cliente_id, negocio_id, fecha, monto, metodo_pago, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deudaId, clienteId, negocioId, fecha, monto, metodoPago, notas]
      );

      await db.run(
        'UPDATE clientes_deudas SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND negocio_id = ?',
        [deudaId, negocioId]
      );

      res.status(201).json({
        ok: true,
        abono: {
          id: insert.lastID,
          deuda_id: deudaId,
          cliente_id: clienteId,
          fecha,
          monto,
          metodo_pago: metodoPago,
          notas,
        },
      });
    } catch (error) {
      console.error('Error al registrar abono:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo registrar el abono' });
    }
  });
});

app.get('/api/clientes/deudas/:deudaId/factura', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const deudaId = Number(req.params.deudaId);
    if (!Number.isFinite(deudaId) || deudaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Factura invalida.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;

    try {
      const deuda = await db.get(
        `SELECT d.id, d.fecha, d.descripcion, d.monto_total, d.notas, d.negocio_id,
                c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.telefono AS cliente_telefono,
                c.direccion AS cliente_direccion, c.email AS cliente_email,
                n.nombre AS sucursal_nombre, n.rnc AS sucursal_rnc, n.direccion AS sucursal_direccion, n.telefono AS sucursal_telefono
           FROM clientes_deudas d
           JOIN clientes c ON c.id = d.cliente_id
           JOIN negocios n ON n.id = d.negocio_id
          WHERE d.id = ?
            AND d.negocio_id = ?
          LIMIT 1`,
        [deudaId, negocioId]
      );

      if (!deuda) {
        return res.status(404).json({ ok: false, error: 'Factura no encontrada.' });
      }

      const config = await obtenerConfiguracionFacturacion(deuda.negocio_id);
      const configImpuesto = await obtenerConfiguracionImpuestoNegocio(deuda.negocio_id);
      const items = await db.all(
        `SELECT producto_id, nombre_producto, cantidad, precio_unitario, total_linea
           FROM clientes_deudas_detalle
          WHERE deuda_id = ?
          ORDER BY id ASC`,
        [deudaId]
      );

      let itemsFinal = items || [];
      if (!itemsFinal.length) {
        itemsFinal = [
          {
            producto_id: 0,
            nombre_producto: deuda.descripcion || 'Servicio',
            cantidad: 1,
            precio_unitario: Number(deuda.monto_total) || 0,
            total_linea: Number(deuda.monto_total) || 0,
          },
        ];
      }

      const subtotalItems = Number(
        itemsFinal.reduce((acc, item) => acc + (Number(item.total_linea) || 0), 0).toFixed(2)
      );
      let subtotalFactura = subtotalItems;
      let total = Number(deuda.monto_total) || subtotalItems;
      let itbis = 0;
      const impuestoPorcentaje = configImpuesto.productosConImpuesto
        ? Number(configImpuesto.impuestoIncluidoValor) || 0
        : Number(configImpuesto.valor) || 0;
      if (configImpuesto.productosConImpuesto) {
        const baseBruta = total > 0 ? total : subtotalItems;
        const totalesFactura = calcularTotalesConImpuestoConfigurado(baseBruta, configImpuesto);
        subtotalFactura = totalesFactura.subtotal;
        itbis = totalesFactura.impuesto;
        total = totalesFactura.total;
      } else if (impuestoPorcentaje > 0) {
        itbis = Number((total - subtotalItems).toFixed(2));
        if (itbis <= 0) {
          itbis = Number((subtotalItems * (impuestoPorcentaje / 100)).toFixed(2));
          total = Number((subtotalItems + itbis).toFixed(2));
        }
      }

      res.json({
        ok: true,
        factura: {
          numero: deuda.id,
          fecha: deuda.fecha,
          condicion: 'CREDITO',
          emisor: {
            nombre: deuda.sucursal_nombre,
            rnc: config?.rnc || deuda.sucursal_rnc || '',
            direccion: config?.direccion || deuda.sucursal_direccion || '',
            telefonos: config?.telefonos || (deuda.sucursal_telefono ? [deuda.sucursal_telefono] : []),
          },
          cliente: {
            nombre: deuda.cliente_nombre,
            documento: deuda.cliente_documento || '',
            direccion: deuda.cliente_direccion || '',
            telefono: deuda.cliente_telefono || '',
            email: deuda.cliente_email || '',
          },
          items: itemsFinal,
          subtotal: subtotalFactura,
          itbis,
          itbis_porcentaje: impuestoPorcentaje,
          total,
          notas: deuda.notas || '',
        },
      });
    } catch (error) {
      console.error('Error al generar factura de cliente (admin):', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo generar la factura.' });
    }
  });
});

// Categor?as
app.get('/api/categorias', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const term = (req.query.search || '').trim();
    const activos = req.query.activos === '1' || req.query.activos === 'true';
    const params = [usuarioSesion.negocio_id];
    let sql = 'SELECT id, nombre, activo, area_preparacion FROM categorias WHERE negocio_id = ?';
    const condiciones = [];
    if (activos) condiciones.push('activo = 1');
    if (term) {
      condiciones.push('nombre LIKE ?');
      params.push(`%${term}%`);
    }
    if (condiciones.length) {
      sql += ` AND ${condiciones.join(' AND ')}`;
    }
    sql += ' ORDER BY nombre ASC';

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error al obtener categor?as:', err.message);
        return res.status(500).json({ ok: false, error: 'Error al obtener categor?as' });
      }
      res.json({ ok: true, categorias: rows || [] });
    });
  });
});

app.post('/api/categorias', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { nombre, activo = 1 } = req.body || {};
    const areaPreparacion = normalizarAreaPreparacion(req.body?.area_preparacion ?? req.body?.areaPreparacion);
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ ok: false, error: 'El nombre de la categor?a es obligatorio' });
    }
    db.run(
      'INSERT INTO categorias (nombre, activo, area_preparacion, negocio_id) VALUES (?, ?, ?, ?)',
      [nombre.trim(), activo ? 1 : 0, areaPreparacion, usuarioSesion.negocio_id],
      function (err) {
        if (err) {
          console.error('Error al crear categor?a:', err.message);
          return res.status(500).json({ ok: false, error: 'No se pudo crear la categor?a' });
        }
        res.json({
          ok: true,
          categoria: {
            id: this.lastID,
            nombre: nombre.trim(),
            activo: activo ? 1 : 0,
            area_preparacion: areaPreparacion,
            negocio_id: usuarioSesion.negocio_id,
          },
        });
      }
    );
  });
});

app.put('/api/categorias/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const id = Number(req.params.id);
    const { nombre, activo = 1 } = req.body || {};
    const areaPreparacion = normalizarAreaPreparacion(req.body?.area_preparacion ?? req.body?.areaPreparacion);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: 'ID de categor?a inv?lido' });
    }
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ ok: false, error: 'El nombre de la categor?a es obligatorio' });
    }

    db.run(
      'UPDATE categorias SET nombre = ?, activo = ?, area_preparacion = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ? AND negocio_id = ?',
      [nombre.trim(), activo ? 1 : 0, areaPreparacion, id, usuarioSesion.negocio_id],
      function (err) {
        if (err) {
          console.error('Error al actualizar categor?a:', err.message);
          return res.status(500).json({ ok: false, error: 'No se pudo actualizar la categor?a' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ ok: false, error: 'Categor?a no encontrada' });
        }
        res.json({
          ok: true,
          categoria: { id, nombre: nombre.trim(), activo: activo ? 1 : 0, area_preparacion: areaPreparacion },
        });
      }
    );
  });
});

app.post('/api/productos', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { nombre, precio, stock, categoria_id } = req.body;
    const preciosEntrada = req.body.precios ?? req.body.preciosLista ?? req.body.precios_lista;
    const stockIndefinido = normalizarFlag(req.body.stock_indefinido ?? req.body.stockIndefinido, 0);
    const precioValor = Number(precio);
    const costoBaseEntrada =
      req.body.costo_base_sin_itbis ?? req.body.costoBaseSinItbis ?? req.body.costo_base ?? req.body.costoBase;
    const costoBaseValor = Number(normalizarNumero(costoBaseEntrada, 0).toFixed(2));
    const costoUnitarioRealEntrada =
      req.body.costo_unitario_real ?? req.body.costoUnitarioReal ?? req.body.costo_real ?? req.body.costoReal;
    const costoUnitarioRealValor = Number(normalizarNumero(costoUnitarioRealEntrada, 0).toFixed(2));
    const costoUnitarioRealIncluyeItbis = normalizarFlag(
      req.body.costo_unitario_real_incluye_itbis ?? req.body.costoUnitarioRealIncluyeItbis,
      0
    );
    const tipoProducto = normalizarTipoProducto(req.body.tipo_producto ?? req.body.tipoProducto, 'FINAL');
    const insumoVendible =
      tipoProducto === 'INSUMO'
        ? normalizarFlag(req.body.insumo_vendible ?? req.body.insumoVendible, 0)
        : 0;
    const unidadBase = normalizarUnidadBase(req.body.unidad_base ?? req.body.unidadBase, 'UND');
    const contenidoPorUnidad = normalizarContenidoPorUnidad(
      req.body.contenido_por_unidad ?? req.body.contenidoPorUnidad,
      1
    );
    const actualizaCostoCompras = normalizarFlag(
      req.body.actualiza_costo_con_compras ?? req.body.actualizaCostoCompras,
      1
    );
    const preciosLista = normalizarListaPrecios(preciosEntrada);
    const preciosJson = preciosLista.length ? JSON.stringify(preciosLista) : null;
    const categoriaId = categoria_id ?? req.body.categoriaId ?? null;
    const stockValor =
      stock === undefined || stock === null || stock === ''
        ? null
        : Number(stock);

    if (!nombre || !Number.isFinite(precioValor)) {
      return res.status(400).json({ error: 'Nombre y precio numerico son obligatorios' });
    }
    if (!Number.isFinite(costoBaseValor) || costoBaseValor < 0) {
      return res.status(400).json({ error: 'El costo base debe ser un numero mayor o igual a 0' });
    }
    if (!Number.isFinite(costoUnitarioRealValor) || costoUnitarioRealValor < 0) {
      return res.status(400).json({ error: 'El costo real debe ser un numero mayor o igual a 0' });
    }
    if (!Number.isFinite(contenidoPorUnidad) || contenidoPorUnidad <= 0) {
      return res.status(400).json({ error: 'El contenido por unidad debe ser mayor a 0' });
    }

    if (!stockIndefinido) {
      const stockValidacion = stockValor === null ? 0 : stockValor;
      if (!Number.isFinite(stockValidacion) || stockValidacion < 0) {
        return res.status(400).json({ error: 'El stock debe ser un numero mayor o igual a 0' });
      }
    }

    const stockFinal = stockIndefinido ? null : Number.isFinite(stockValor) ? stockValor : 0;

    const sql = `
      INSERT INTO productos (
        nombre, precio, precios, costo_base_sin_itbis, costo_promedio_actual, ultimo_costo_sin_itbis,
        actualiza_costo_con_compras, costo_unitario_real, costo_unitario_real_incluye_itbis,
        tipo_producto, insumo_vendible, unidad_base, contenido_por_unidad,
        stock, stock_indefinido, categoria_id, activo, negocio_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `;
    const params = [
      nombre,
      precioValor,
      preciosJson,
      costoBaseValor,
      costoBaseValor,
      costoBaseValor,
      actualizaCostoCompras,
      costoUnitarioRealValor,
      costoUnitarioRealIncluyeItbis,
      tipoProducto,
      insumoVendible,
      unidadBase,
      Number(contenidoPorUnidad.toFixed(4)),
      stockFinal,
      stockIndefinido,
      categoriaId,
      usuarioSesion.negocio_id,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al crear producto:', err.message);
        return res.status(500).json({ error: 'Error al crear producto' });
      }

      res.status(201).json({
        id: this.lastID,
        nombre,
        precio: precioValor,
        precios: preciosLista,
        costo_base_sin_itbis: costoBaseValor,
        costo_promedio_actual: costoBaseValor,
        ultimo_costo_sin_itbis: costoBaseValor,
        actualiza_costo_con_compras: actualizaCostoCompras,
        costo_unitario_real: costoUnitarioRealValor,
        costo_unitario_real_incluye_itbis: costoUnitarioRealIncluyeItbis,
        tipo_producto: tipoProducto,
        insumo_vendible: insumoVendible,
        unidad_base: unidadBase,
        contenido_por_unidad: Number(contenidoPorUnidad.toFixed(4)),
        stock: stockIndefinido ? null : stockFinal,
        stock_indefinido: stockIndefinido,
        categoria_id: categoriaId || null,
        activo: 1,
      });
    });
  });
});

app.put('/api/productos/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const { nombre = null, precio = null, categoria_id = null, activo = null } = req.body;
    const preciosKeys = ['precios', 'preciosLista', 'precios_lista'];
    const preciosKey = preciosKeys.find((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
    const preciosEntrada = preciosKey ? req.body[preciosKey] : undefined;
    const preciosFueEnviado = Boolean(preciosKey);
    const stockIndefinidoEntrada = req.body.stock_indefinido ?? req.body.stockIndefinido;
    const stockEntrada = req.body.stock;
    const costoBaseEntrada =
      req.body.costo_base_sin_itbis ?? req.body.costoBaseSinItbis ?? req.body.costo_base ?? req.body.costoBase;
    const costoUnitarioRealEntrada =
      req.body.costo_unitario_real ?? req.body.costoUnitarioReal ?? req.body.costo_real ?? req.body.costoReal;
    const costoUnitarioRealIncluyeItbisEntrada =
      req.body.costo_unitario_real_incluye_itbis ?? req.body.costoUnitarioRealIncluyeItbis;
    const tipoProductoEntrada = req.body.tipo_producto ?? req.body.tipoProducto;
    const insumoVendibleEntrada = req.body.insumo_vendible ?? req.body.insumoVendible;
    const unidadBaseEntrada = req.body.unidad_base ?? req.body.unidadBase;
    const contenidoPorUnidadEntrada = req.body.contenido_por_unidad ?? req.body.contenidoPorUnidad;
    const actualizaCostoComprasEntrada =
      req.body.actualiza_costo_con_compras ?? req.body.actualizaCostoCompras;

    db.get(
      `SELECT stock, stock_indefinido, costo_base_sin_itbis, costo_promedio_actual, ultimo_costo_sin_itbis,
              actualiza_costo_con_compras, costo_unitario_real, costo_unitario_real_incluye_itbis,
              tipo_producto, insumo_vendible, unidad_base, contenido_por_unidad
         FROM productos WHERE id = ? AND negocio_id = ?`,
      [id, usuarioSesion.negocio_id],
      async (productoErr, productoActual) => {
        if (productoErr) {
          console.error('Error al obtener producto para actualizar:', productoErr.message);
          return res.status(500).json({ error: 'Error al actualizar producto' });
        }

        if (!productoActual) {
          return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const stockIndefinido = normalizarFlag(
          stockIndefinidoEntrada,
          Number(productoActual.stock_indefinido) || 0
        );

        let stockValor = undefined;
        let stockProporcionado = false;
        if (stockEntrada !== undefined) {
          stockProporcionado = true;
          stockValor =
            stockEntrada === null || stockEntrada === ''
              ? null
              : Number(stockEntrada);
          if (!stockIndefinido) {
            if (!Number.isFinite(stockValor) || stockValor < 0) {
              return res
                .status(400)
                .json({ error: 'El stock debe ser un numero mayor o igual a 0' });
            }
          }
        }

        if (!stockIndefinido) {
          const stockParaValidar =
            stockProporcionado && stockValor !== null && stockValor !== undefined
              ? stockValor
              : productoActual.stock;
          if (!Number.isFinite(stockParaValidar) || stockParaValidar < 0) {
            return res
              .status(400)
              .json({ error: 'Se requiere stock numerico para productos con control de inventario' });
          }
        } else if (!stockProporcionado) {
          stockValor = null;
          stockProporcionado = true;
        }

        if (stockIndefinido) {
          stockValor = null;
          stockProporcionado = true;
        }

        const stockIndefinidoActual = Number(productoActual.stock_indefinido) === 1;
        const stockActual = productoActual.stock;
        const stockNuevo = stockIndefinido ? null : stockValor;
        const cambioStock =
          stockIndefinido !== stockIndefinidoActual ||
          (!stockIndefinido && Number(stockNuevo) !== Number(stockActual));
        if (esUsuarioSupervisor(usuarioSesion) && cambioStock) {
          const okPassword = await validarPasswordUsuario(usuarioSesion.id, req.body?.password);
          if (!okPassword) {
            return res.status(403).json({ error: 'Credenciales invalidas' });
          }
        }

        let costoBaseValor = null;
        let costoBaseProporcionado = false;
        if (costoBaseEntrada !== undefined) {
          costoBaseProporcionado = true;
          costoBaseValor = normalizarNumero(costoBaseEntrada, null);
          if (costoBaseValor === null || costoBaseValor < 0) {
            return res.status(400).json({ error: 'El costo base debe ser un numero mayor o igual a 0' });
          }
        }

        let costoUnitarioRealValor = null;
        let costoUnitarioRealProporcionado = false;
        if (costoUnitarioRealEntrada !== undefined) {
          costoUnitarioRealProporcionado = true;
          costoUnitarioRealValor = normalizarNumero(costoUnitarioRealEntrada, null);
          if (costoUnitarioRealValor === null || costoUnitarioRealValor < 0) {
            return res.status(400).json({ error: 'El costo real debe ser un numero mayor o igual a 0' });
          }
        }

        let costoUnitarioRealIncluyeItbis = null;
        if (costoUnitarioRealIncluyeItbisEntrada !== undefined) {
          costoUnitarioRealIncluyeItbis = normalizarFlag(
            costoUnitarioRealIncluyeItbisEntrada,
            Number(productoActual.costo_unitario_real_incluye_itbis) || 0
          );
        }

        let tipoProducto = null;
        let tipoProductoProporcionado = false;
        if (tipoProductoEntrada !== undefined) {
          tipoProductoProporcionado = true;
          tipoProducto = normalizarTipoProducto(tipoProductoEntrada, 'FINAL');
        }

        let insumoVendible = null;
        if (insumoVendibleEntrada !== undefined) {
          insumoVendible = normalizarFlag(
            insumoVendibleEntrada,
            Number(productoActual.insumo_vendible) || 0
          );
        }

        let unidadBase = null;
        if (unidadBaseEntrada !== undefined) {
          unidadBase = normalizarUnidadBase(unidadBaseEntrada, productoActual.unidad_base || 'UND');
        }

        let contenidoPorUnidad = null;
        if (contenidoPorUnidadEntrada !== undefined) {
          contenidoPorUnidad = normalizarContenidoPorUnidad(contenidoPorUnidadEntrada, 1);
          if (!Number.isFinite(contenidoPorUnidad) || contenidoPorUnidad <= 0) {
            return res.status(400).json({ error: 'El contenido por unidad debe ser mayor a 0' });
          }
        }

        let actualizaCostoCompras = null;
        if (actualizaCostoComprasEntrada !== undefined) {
          actualizaCostoCompras = normalizarFlag(
            actualizaCostoComprasEntrada,
            Number(productoActual.actualiza_costo_con_compras) || 0
          );
        }

        const campos = [
          'nombre = COALESCE(?, nombre)',
          'precio = COALESCE(?, precio)',
          'categoria_id = COALESCE(?, categoria_id)',
          'activo = COALESCE(?, activo)',
          'stock_indefinido = ?',
        ];
        const params = [nombre, precio, categoria_id, activo, stockIndefinido];

        if (preciosFueEnviado) {
          const preciosLista = normalizarListaPrecios(preciosEntrada);
          const preciosJson = preciosLista.length ? JSON.stringify(preciosLista) : null;
          campos.push('precios = ?');
          params.push(preciosJson);
        }

        if (costoBaseProporcionado) {
          campos.push('costo_base_sin_itbis = ?');
          params.push(Number(costoBaseValor.toFixed(2)));
          const costoPromedioActual = Number(productoActual.costo_promedio_actual) || 0;
          const costoBaseActual = Number(productoActual.costo_base_sin_itbis) || 0;
          if (Number(costoPromedioActual.toFixed(2)) === Number(costoBaseActual.toFixed(2))) {
            campos.push('costo_promedio_actual = ?');
            params.push(Number(costoBaseValor.toFixed(2)));
          }
          const ultimoCostoActual = Number(productoActual.ultimo_costo_sin_itbis) || 0;
          if (Number(ultimoCostoActual.toFixed(2)) === 0) {
            campos.push('ultimo_costo_sin_itbis = ?');
            params.push(Number(costoBaseValor.toFixed(2)));
          }
        }

        if (costoUnitarioRealProporcionado) {
          campos.push('costo_unitario_real = ?');
          params.push(Number(costoUnitarioRealValor.toFixed(2)));
        }

        if (costoUnitarioRealIncluyeItbis !== null) {
          campos.push('costo_unitario_real_incluye_itbis = ?');
          params.push(costoUnitarioRealIncluyeItbis);
        }

        if (tipoProductoProporcionado) {
          campos.push('tipo_producto = ?');
          params.push(tipoProducto);
          if (tipoProducto !== 'INSUMO') {
            insumoVendible = 0;
          }
        }

        if (insumoVendible !== null) {
          campos.push('insumo_vendible = ?');
          params.push(insumoVendible);
        }

        if (unidadBase !== null) {
          campos.push('unidad_base = ?');
          params.push(unidadBase);
        }

        if (contenidoPorUnidad !== null) {
          campos.push('contenido_por_unidad = ?');
          params.push(Number(contenidoPorUnidad.toFixed(4)));
        }

        if (actualizaCostoCompras !== null) {
          campos.push('actualiza_costo_con_compras = ?');
          params.push(actualizaCostoCompras);
        }

        if (stockProporcionado) {
          campos.push('stock = ?');
          params.push(stockValor);
        }

        const sql = `
          UPDATE productos
          SET ${campos.join(', ')}
          WHERE id = ? AND negocio_id = ?
        `;

        params.push(id, usuarioSesion.negocio_id);

        db.run(sql, params, function (err) {
          if (err) {
            console.error('Error al actualizar producto:', err.message);
            return res.status(500).json({ error: 'Error al actualizar producto' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
          }

          res.json({
            ok: true,
            message: 'Producto actualizado correctamente',
            stock_indefinido: stockIndefinido,
            stock: stockProporcionado ? stockValor : productoActual.stock,
          });
        });
      }
    );
  });
});

app.get('/api/productos/:id/receta', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const productoId = Number(req.params.id);
    if (!Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const modoInventario = await obtenerModoInventarioCostos(negocioId);
    if (modoInventario !== 'PREPARACION') {
      return res.status(400).json({ error: 'Las recetas solo estan disponibles en modo preparacion.' });
    }

    try {
      const receta = await db.get(
        'SELECT id, activo FROM recetas WHERE producto_final_id = ? AND negocio_id = ?',
        [productoId, negocioId]
      );
      if (!receta) {
        return res.json({ ok: true, receta: null, detalles: [] });
      }

      const detalles = await db.all(
        `SELECT rd.id, rd.insumo_id, rd.cantidad, rd.unidad, p.nombre AS insumo_nombre
           FROM receta_detalle rd
           LEFT JOIN productos p ON p.id = rd.insumo_id
          WHERE rd.receta_id = ?
          ORDER BY rd.id ASC`,
        [receta.id]
      );

      res.json({ ok: true, receta, detalles: detalles || [] });
    } catch (error) {
      console.error('Error al obtener receta:', error?.message || error);
      res.status(500).json({ error: 'No se pudo obtener la receta.' });
    }
  });
});

app.put('/api/productos/:id/receta', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const productoId = Number(req.params.id);
    if (!Number.isFinite(productoId) || productoId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const modoInventario = await obtenerModoInventarioCostos(negocioId);
    if (modoInventario !== 'PREPARACION') {
      return res.status(400).json({ error: 'Las recetas solo estan disponibles en modo preparacion.' });
    }

    const detallesEntrada = Array.isArray(req.body?.detalles) ? req.body.detalles : [];

    try {
      const producto = await db.get(
        'SELECT id, nombre, tipo_producto FROM productos WHERE id = ? AND negocio_id = ?',
        [productoId, negocioId]
      );
      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado.' });
      }
      const tipoProducto = normalizarTipoProducto(producto.tipo_producto, 'FINAL');
      if (tipoProducto !== 'FINAL') {
        return res.status(400).json({ error: 'Solo los productos finales pueden tener receta.' });
      }

      const insumoIds = Array.from(
        new Set(
          detallesEntrada
            .map((detalle) => Number(detalle?.insumo_id ?? detalle?.insumoId))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );

      const insumosMap = new Map();
      if (insumoIds.length) {
        const placeholders = insumoIds.map(() => '?').join(', ');
        const insumos = await db.all(
          `SELECT id, nombre, tipo_producto, unidad_base
             FROM productos
            WHERE negocio_id = ? AND id IN (${placeholders})`,
          [negocioId, ...insumoIds]
        );
        (insumos || []).forEach((insumo) => {
          insumosMap.set(Number(insumo.id), insumo);
        });
      }

      const detallesLimpios = [];
      for (const detalle of detallesEntrada) {
        const insumoId = Number(detalle?.insumo_id ?? detalle?.insumoId);
        const cantidad = normalizarNumero(detalle?.cantidad, null);
        if (!Number.isFinite(insumoId) || insumoId <= 0 || cantidad === null || cantidad <= 0) {
          return res.status(400).json({ error: 'Cada insumo debe tener cantidad valida.' });
        }
        const insumo = insumosMap.get(insumoId);
        if (!insumo) {
          return res.status(400).json({ error: `Insumo ${insumoId} no encontrado.` });
        }
        const tipoInsumo = normalizarTipoProducto(insumo.tipo_producto, 'FINAL');
        if (tipoInsumo !== 'INSUMO') {
          return res.status(400).json({ error: `El producto ${insumo.nombre || insumoId} no es un insumo.` });
        }
        const unidad = normalizarUnidadBase(detalle?.unidad ?? detalle?.unidadBase ?? insumo.unidad_base, 'UND');
        if (unidad !== normalizarUnidadBase(insumo.unidad_base, 'UND')) {
          return res.status(400).json({
            error: `La unidad del insumo ${insumo.nombre || insumoId} debe ser ${insumo.unidad_base}.`,
          });
        }
        detallesLimpios.push({
          insumo_id: insumoId,
          cantidad: Number(cantidad.toFixed(4)),
          unidad,
        });
      }

      await db.run('BEGIN');
      const recetaActual = await db.get(
        'SELECT id FROM recetas WHERE producto_final_id = ? AND negocio_id = ?',
        [productoId, negocioId]
      );
      let recetaId = recetaActual?.id;
      if (!recetaId) {
        const insertReceta = await db.run(
          'INSERT INTO recetas (negocio_id, producto_final_id, activo) VALUES (?, ?, ?)',
          [negocioId, productoId, detallesLimpios.length ? 1 : 0]
        );
        recetaId = insertReceta?.lastID;
      } else {
        await db.run('UPDATE recetas SET activo = ? WHERE id = ? AND negocio_id = ?', [
          detallesLimpios.length ? 1 : 0,
          recetaId,
          negocioId,
        ]);
      }

      await db.run('DELETE FROM receta_detalle WHERE receta_id = ?', [recetaId]);
      for (const detalle of detallesLimpios) {
        await db.run(
          'INSERT INTO receta_detalle (receta_id, insumo_id, cantidad, unidad) VALUES (?, ?, ?, ?)',
          [recetaId, detalle.insumo_id, detalle.cantidad, detalle.unidad]
        );
      }

      await db.run('COMMIT');
      res.json({ ok: true, receta_id: recetaId, detalles: detallesLimpios });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al guardar receta:', error?.message || error);
      res.status(500).json({ error: 'No se pudo guardar la receta.' });
    }
  });
});

app.put('/api/productos/:id/stock', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const stockEntrada = req.body.stock;
    const negocioId = usuarioSesion.negocio_id;

    db.get(
      'SELECT stock_indefinido FROM productos WHERE id = ? AND negocio_id = ?',
      [id, negocioId],
      async (err, producto) => {
      if (err) {
        console.error('Error al validar producto:', err.message);
        return res.status(500).json({ error: 'Error al actualizar stock' });
      }

      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      if (esUsuarioSupervisor(usuarioSesion)) {
        const okPassword = await validarPasswordUsuario(usuarioSesion.id, req.body?.password);
        if (!okPassword) {
          return res.status(403).json({ error: 'Credenciales invalidas' });
        }
      }

      if (esStockIndefinido(producto)) {
        db.run(
          'UPDATE productos SET stock = NULL WHERE id = ? AND negocio_id = ?',
          [id, negocioId],
          function (updateErr) {
            if (updateErr) {
              console.error('Error al limpiar stock indefinido:', updateErr.message);
              return res.status(500).json({ error: 'Error al actualizar stock' });
            }
            return res.json({ message: 'Stock marcado como indefinido; no se controla cantidad.' });
          }
        );
        return;
      }

      if (stockEntrada === undefined || stockEntrada === null) {
        return res.status(400).json({ error: 'El stock es obligatorio' });
      }

      const stockValor = Number(stockEntrada);
      if (!Number.isFinite(stockValor) || stockValor < 0) {
        return res.status(400).json({ error: 'El stock debe ser un numero mayor o igual a 0' });
      }

      const sql = 'UPDATE productos SET stock = ? WHERE id = ? AND negocio_id = ?';
      const params = [stockValor, id, negocioId];

      db.run(sql, params, function (updateErr) {
        if (updateErr) {
          console.error('Error al actualizar stock:', updateErr.message);
          return res.status(500).json({ error: 'Error al actualizar stock' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({ message: 'Stock actualizado correctamente' });
      });
    });
  });
});

app.get('/api/compras', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { anio, mes } = req.query;
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    let sql = `
      SELECT id, proveedor, rnc, fecha, tipo_comprobante, ncf, monto_gravado, impuesto,
             total, monto_exento, estado, comentarios
      FROM compras
      WHERE negocio_id = ?
    `;
    const params = [negocioId];

    if (anio && mes) {
      sql += " AND DATE_FORMAT(fecha, '%Y') = ? AND DATE_FORMAT(fecha, '%m') = ?";
      params.push(String(anio));
      params.push(String(mes).padStart(2, '0'));
    }

    sql += ' ORDER BY fecha DESC, id DESC';

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error al obtener compras:', err.message);
        return res.status(500).json({ error: 'Error al obtener compras' });
      }

      res.json(rows);
    });
  });
});

app.get('/api/compras/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const compraSql = `
      SELECT id, proveedor, rnc, fecha, tipo_comprobante, ncf, monto_gravado, impuesto,
             total, monto_exento, estado, comentarios
      FROM compras
      WHERE id = ? AND negocio_id = ?
    `;

    db.get(compraSql, [id, negocioId], (compraErr, compra) => {
      if (compraErr) {
        console.error('Error al obtener compra:', compraErr.message);
        return res.status(500).json({ error: 'Error al obtener compra' });
      }

      if (!compra) {
        return res.status(404).json({ error: 'Compra no encontrada' });
      }

      const detalleSql = `
        SELECT id, descripcion, cantidad, precio_unitario, itbis, total
        FROM detalle_compra
        WHERE compra_id = ? AND negocio_id = ?
      `;

      db.all(detalleSql, [id, negocioId], (detalleErr, detalles) => {
        if (detalleErr) {
          console.error('Error al obtener detalle de compra:', detalleErr.message);
          return res.status(500).json({ error: 'Error al obtener compra' });
        }

        res.json({ compra, detalles });
      });
    });
  });
});

app.post('/api/compras', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const {
      proveedor,
      rnc,
      fecha,
      tipo_comprobante,
      ncf,
      monto_gravado = 0,
      impuesto = 0,
      total = 0,
      monto_exento = 0,
      comentarios,
      items,
    } = req.body || {};
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    if (!proveedor || !fecha || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Proveedor, fecha y al menos un detalle son obligatorios' });
    }

    const detallesLimpios = [];
    for (const item of items) {
      const descripcion = normalizarCampoTexto(item?.descripcion);
      if (!descripcion) {
        return res.status(400).json({ error: 'Cada detalle debe incluir una descripcion' });
      }
      if (descripcion.length > 255) {
        return res.status(400).json({ error: 'La descripcion no puede superar 255 caracteres' });
      }

      const cantidadValor =
        item?.cantidad === undefined || item?.cantidad === null || item?.cantidad === ''
          ? null
          : normalizarNumero(item?.cantidad, null);
      const precioUnitarioValor =
        item?.precio_unitario === undefined || item?.precio_unitario === null || item?.precio_unitario === ''
          ? null
          : normalizarNumero(item?.precio_unitario, null);
      const itbisValor =
        item?.itbis === undefined || item?.itbis === null || item?.itbis === ''
          ? null
          : normalizarNumero(item?.itbis, null);
      let totalValor =
        item?.total === undefined || item?.total === null || item?.total === ''
          ? null
          : normalizarNumero(item?.total, null);

      if (cantidadValor !== null && cantidadValor < 0) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor o igual a 0' });
      }
      if (precioUnitarioValor !== null && precioUnitarioValor < 0) {
        return res.status(400).json({ error: 'El precio unitario debe ser mayor o igual a 0' });
      }
      if (itbisValor !== null && itbisValor < 0) {
        return res.status(400).json({ error: 'El itbis debe ser mayor o igual a 0' });
      }
      if (totalValor !== null && totalValor < 0) {
        return res.status(400).json({ error: 'El total de linea debe ser mayor o igual a 0' });
      }

      if (totalValor === null && cantidadValor !== null && precioUnitarioValor !== null) {
        totalValor = Number((cantidadValor * precioUnitarioValor).toFixed(2));
      }

      detallesLimpios.push({
        descripcion,
        cantidad: cantidadValor,
        precio_unitario: precioUnitarioValor,
        itbis: itbisValor,
        total: totalValor,
      });
    }

    const montoGravadoValor = normalizarNumero(monto_gravado, 0);
    const impuestoValor = normalizarNumero(impuesto, 0);
    const totalValor = normalizarNumero(total, montoGravadoValor + impuestoValor);
    const montoExentoValor = normalizarNumero(monto_exento, 0);
    if (montoGravadoValor < 0 || impuestoValor < 0 || totalValor < 0 || montoExentoValor < 0) {
      return res.status(400).json({ error: 'Los montos de la compra deben ser mayores o iguales a 0' });
    }

    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) {
        console.error('Error al iniciar transacci?n de compra:', beginErr.message);
        return res.status(500).json({ error: 'Error al registrar la compra' });
      }

      const finalizarConError = (mensaje, errorObj) => {
        if (errorObj) {
          console.error(mensaje, errorObj.message);
        } else {
          console.error(mensaje);
        }
        db.run('ROLLBACK', (rollbackErr) => {
          if (rollbackErr) {
            console.error('Error al revertir transacci?n de compra:', rollbackErr.message);
          }
          res.status(500).json({ error: mensaje });
        });
      };

      const insertarDetalles = (compraId, indice, callback) => {
        if (indice >= detallesLimpios.length) {
          callback();
          return;
        }

        const detalle = detallesLimpios[indice];
        const sql = `
        INSERT INTO detalle_compra (compra_id, descripcion, cantidad, precio_unitario, itbis, total, negocio_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

        db.run(
          sql,
          [
            compraId,
            detalle.descripcion,
            detalle.cantidad,
            detalle.precio_unitario,
            detalle.itbis,
            detalle.total,
            negocioId,
          ],
          (detalleErr) => {
            if (detalleErr) {
              return finalizarConError('Error al guardar el detalle de compra', detalleErr);
            }
            insertarDetalles(compraId, indice + 1, callback);
          }
        );
      };

      const finalizarCompra = (compraId) => {
        return db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            return finalizarConError('Error al confirmar la compra', commitErr);
          }

          res.status(201).json({
            id: compraId,
            proveedor: proveedor.trim(),
            rnc: normalizarCampoTexto(rnc, null),
            fecha,
            tipo_comprobante: normalizarCampoTexto(tipo_comprobante, null),
            ncf: normalizarCampoTexto(ncf, null),
            monto_gravado: montoGravadoValor,
            impuesto: impuestoValor,
            total: totalValor,
            monto_exento: montoExentoValor,
          });
        });
      };

      const insertarCompra = () => {
        const sql = `
        INSERT INTO compras (proveedor, rnc, fecha, tipo_comprobante, ncf, monto_gravado, impuesto, total, monto_exento, comentarios, negocio_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
        const params = [
          proveedor.trim(),
          normalizarCampoTexto(rnc, null),
          fecha,
          normalizarCampoTexto(tipo_comprobante, null),
          normalizarCampoTexto(ncf, null),
          montoGravadoValor,
          impuestoValor,
          totalValor,
          montoExentoValor,
          normalizarCampoTexto(comentarios, null),
          negocioId,
        ];

        db.run(sql, params, function (insertErr) {
          if (insertErr) {
            return finalizarConError('Error al guardar la compra', insertErr);
          }

          const compraId = this.lastID;
          insertarDetalles(compraId, 0, () => finalizarCompra(compraId));
        });
      };

      insertarCompra();
    });
  });
});

const normalizarAplicaItbis = (valor) => {
  if (valor === true || valor === 1 || valor === '1' || valor === 'true') {
    return true;
  }
  return false;
};

const ITBIS_RATE = 0.18;

const resolverCostoUnitarioReal = (costoUnitario, aplicaItbis) => {
  const base = Number(costoUnitario) || 0;
  if (aplicaItbis) {
    return Number((base * (1 + ITBIS_RATE)).toFixed(2));
  }
  return Number(base.toFixed(2));
};

const resolverCostoUnitarioEfectivo = (costoUnitario, aplicaItbis, itbisCapitalizable) => {
  const base = Number(costoUnitario) || 0;
  if (aplicaItbis && itbisCapitalizable) {
    return Number((base * (1 + ITBIS_RATE)).toFixed(2));
  }
  return Number(base.toFixed(2));
};

const calcularTotalesCompraInventario = (subtotal, aplicaItbis) => {
  const base = Number(subtotal) || 0;
  const itbis = aplicaItbis ? Number((base * ITBIS_RATE).toFixed(2)) : 0;
  const total = Number((base + itbis).toFixed(2));
  return { subtotal: base, itbis, total };
};

app.get('/api/inventario/compras', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioIdRaw = usuarioSesion?.negocio_id ?? usuarioSesion?.negocioId ?? NEGOCIO_ID_DEFAULT;
    const negocioId = Number(negocioIdRaw);
    const negocioIdFinal = Number.isFinite(negocioId) ? negocioId : NEGOCIO_ID_DEFAULT;
    const limitRaw = Number.parseInt(req.query?.limit, 10);
    const limitBase = Number.isFinite(limitRaw) ? limitRaw : 100;
    const limit = Math.min(Math.max(limitBase, 1), 300);

    try {
      const rows = await db.all(
        `
        SELECT ci.id,
               ci.fecha,
               ci.proveedor,
               ci.origen_fondos,
               ci.metodo_pago,
               CASE WHEN ci.subtotal IS NULL OR ci.subtotal = 0 THEN ci.total ELSE ci.subtotal END AS subtotal,
               COALESCE(ci.itbis, 0) AS itbis,
               COALESCE(ci.aplica_itbis, 0) AS aplica_itbis,
               COALESCE(ci.itbis_capitalizable, 0) AS itbis_capitalizable,
               ci.total,
               ci.observaciones,
               ci.creado_en, u.nombre AS creado_por,
               (SELECT COUNT(1) FROM compras_inventario_detalle cid WHERE cid.compra_id = ci.id) AS lineas,
               (SELECT SUM(cid.cantidad) FROM compras_inventario_detalle cid WHERE cid.compra_id = ci.id) AS items
          FROM compras_inventario ci
          LEFT JOIN usuarios u ON u.id = ci.creado_por
         WHERE ci.negocio_id = ?
         ORDER BY ci.fecha DESC, ci.id DESC
         LIMIT ${limit}
      `,
        [negocioIdFinal]
      );

      res.json({ ok: true, compras: rows || [] });
    } catch (error) {
      console.error('Error al obtener compras de inventario:', error?.message || error);
      res.status(500).json({ error: 'No se pudieron obtener las compras de inventario.' });
    }
  });
});

app.get('/api/inventario/compras/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const compraId = Number(req.params.id);
    if (!Number.isInteger(compraId) || compraId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    try {
      const compra = await db.get(
        `
        SELECT ci.id,
               ci.fecha,
               ci.proveedor,
               ci.origen_fondos,
               ci.metodo_pago,
               CASE WHEN ci.subtotal IS NULL OR ci.subtotal = 0 THEN ci.total ELSE ci.subtotal END AS subtotal,
               COALESCE(ci.itbis, 0) AS itbis,
               COALESCE(ci.aplica_itbis, 0) AS aplica_itbis,
               COALESCE(ci.itbis_capitalizable, 0) AS itbis_capitalizable,
               ci.total,
               ci.observaciones,
               ci.creado_en,
               u.nombre AS creado_por
          FROM compras_inventario ci
          LEFT JOIN usuarios u ON u.id = ci.creado_por
         WHERE ci.id = ? AND ci.negocio_id = ?
        `,
        [compraId, negocioId]
      );

      if (!compra) {
        return res.status(404).json({ error: 'Compra no encontrada.' });
      }

      const detalles = await db.all(
        `
        SELECT cid.id, cid.producto_id, p.nombre AS producto_nombre, cid.cantidad,
               cid.costo_unitario, cid.costo_unitario_sin_itbis, cid.costo_unitario_efectivo,
               cid.itbis_aplica, cid.itbis_capitalizable, cid.total_linea
          FROM compras_inventario_detalle cid
          LEFT JOIN productos p ON p.id = cid.producto_id
         WHERE cid.compra_id = ? AND cid.negocio_id = ?
         ORDER BY cid.id ASC
        `,
        [compraId, negocioId]
      );

      res.json({ ok: true, compra, detalles: detalles || [] });
    } catch (error) {
      console.error('Error al obtener detalle de compra de inventario:', error?.message || error);
      res.status(500).json({ error: 'No se pudo obtener el detalle de la compra.' });
    }
  });
});

app.post('/api/inventario/compras', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const proveedor = normalizarCampoTexto(req.body?.proveedor);
    const fecha = req.body?.fecha;
    const origenFondosRaw =
      normalizarCampoTexto(req.body?.origen_fondos ?? req.body?.origenFondos) || 'negocio';
    const origenFondos = normalizarOrigenFondosCompra(origenFondosRaw, 'negocio');
    const metodoPago = normalizarCampoTexto(req.body?.metodo_pago ?? req.body?.metodoPago);
    const observaciones = normalizarCampoTexto(req.body?.observaciones ?? req.body?.comentarios);
    const aplicaItbis = normalizarAplicaItbis(req.body?.aplica_itbis ?? req.body?.aplicaItbis);
    const itbisCapitalizableEntrada = req.body?.itbis_capitalizable ?? req.body?.itbisCapitalizable;
    const itemsEntrada = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!proveedor || !esFechaISOValida(fecha)) {
      return res.status(400).json({ error: 'Proveedor y fecha son obligatorios.' });
    }

    if (!itemsEntrada.length) {
      return res.status(400).json({ error: 'Agrega al menos un producto a la compra.' });
    }

    if (origenFondos === 'caja' && !metodoPago) {
      return res.status(400).json({ error: 'Selecciona el metodo de pago cuando el origen es caja.' });
    }

    const productoIds = Array.from(
      new Set(
        itemsEntrada
          .map((item) => Number(item?.producto_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (!productoIds.length) {
      return res.status(400).json({ error: 'Selecciona productos validos.' });
    }

    try {
      const acreditaItbis = await obtenerConfigAcreditaItbis(negocioId);
      const itbisCapitalizableDefault = aplicaItbis ? (acreditaItbis ? 0 : 1) : 0;
      const itbisCapitalizable = aplicaItbis
        ? normalizarFlag(itbisCapitalizableEntrada ?? itbisCapitalizableDefault, itbisCapitalizableDefault)
        : 0;
      const modoInventario = await obtenerModoInventarioCostos(negocioId);
      const esReventa = modoInventario === 'REVENTA';
      const placeholders = productoIds.map(() => '?').join(',');
      const productos = await db.all(
        `SELECT id, nombre, stock, stock_indefinido, costo_promedio_actual, ultimo_costo_sin_itbis,
                costo_base_sin_itbis, actualiza_costo_con_compras
           FROM productos WHERE negocio_id = ? AND id IN (${placeholders})`,
        [negocioId, ...productoIds]
      );
      const productosMap = new Map((productos || []).map((producto) => [Number(producto.id), producto]));

      const detalles = [];
      const costosPorProducto = new Map();
      let subtotal = 0;

      for (const item of itemsEntrada) {
        const productoId = Number(item?.producto_id);
        if (!Number.isFinite(productoId) || productoId <= 0 || !productosMap.has(productoId)) {
          return res.status(400).json({ error: 'Hay productos invalidos en la compra.' });
        }

        const cantidad = normalizarNumero(item?.cantidad, null);
        const costoUnitario = normalizarNumero(
          item?.costo_unitario ?? item?.costoUnitario ?? item?.costo_unitario_sin_itbis ?? item?.costoUnitarioSinItbis,
          null
        );

        if (cantidad === null || cantidad <= 0) {
          return res.status(400).json({ error: 'La cantidad debe ser mayor a 0.' });
        }
        if (costoUnitario === null || costoUnitario < 0) {
          return res.status(400).json({ error: 'El costo unitario debe ser mayor o igual a 0.' });
        }

        const costoUnitarioSinItbis = Number(costoUnitario.toFixed(2));
        const costoUnitarioReal = resolverCostoUnitarioReal(costoUnitarioSinItbis, aplicaItbis);
        const costoUnitarioEfectivo = resolverCostoUnitarioEfectivo(
          costoUnitarioSinItbis,
          aplicaItbis,
          itbisCapitalizable === 1
        );
        const totalLinea = Number((cantidad * costoUnitarioSinItbis).toFixed(2));
        subtotal += totalLinea;
        detalles.push({
          producto_id: productoId,
          cantidad,
          costo_unitario: costoUnitarioSinItbis,
          costo_unitario_sin_itbis: costoUnitarioSinItbis,
          costo_unitario_efectivo: costoUnitarioEfectivo,
          itbis_aplica: aplicaItbis ? 1 : 0,
          itbis_capitalizable: itbisCapitalizable ? 1 : 0,
          total_linea: totalLinea,
        });

        const acumulado = costosPorProducto.get(productoId) || {
          cantidad: 0,
          costo_total_efectivo: 0,
          ultimo_costo_sin_itbis: 0,
          costo_unitario_real: 0,
          costo_unitario_real_incluye_itbis: 0,
        };
        acumulado.cantidad = Number((acumulado.cantidad + cantidad).toFixed(2));
        acumulado.costo_total_efectivo = Number(
          (acumulado.costo_total_efectivo + cantidad * costoUnitarioEfectivo).toFixed(2)
        );
        acumulado.ultimo_costo_sin_itbis = costoUnitarioSinItbis;
        acumulado.costo_unitario_real = costoUnitarioReal;
        acumulado.costo_unitario_real_incluye_itbis = aplicaItbis ? 1 : 0;
        costosPorProducto.set(productoId, acumulado);
      }

      subtotal = Number(subtotal.toFixed(2));
      const { subtotal: subtotalFinal, itbis, total } = calcularTotalesCompraInventario(
        subtotal,
        aplicaItbis
      );

      await db.run('BEGIN');

      const insertCompra = await db.run(
        `
          INSERT INTO compras_inventario
            (fecha, proveedor, origen_fondos, metodo_pago, subtotal, itbis, aplica_itbis, itbis_capitalizable, total, observaciones, creado_por, negocio_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          fecha,
          proveedor,
          origenFondos,
          metodoPago,
          subtotalFinal,
          itbis,
          aplicaItbis ? 1 : 0,
          itbisCapitalizable ? 1 : 0,
          total,
          observaciones,
          usuarioSesion.id,
          negocioId,
        ]
      );

      const compraId = insertCompra?.lastID;
      if (!compraId) {
        throw new Error('No se pudo registrar la compra de inventario.');
      }

      for (const detalle of detalles) {
        await db.run(
          `
            INSERT INTO compras_inventario_detalle
              (compra_id, producto_id, cantidad, costo_unitario, costo_unitario_sin_itbis, costo_unitario_efectivo,
               itbis_aplica, itbis_capitalizable, total_linea, negocio_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            compraId,
            detalle.producto_id,
            detalle.cantidad,
            detalle.costo_unitario,
            detalle.costo_unitario_sin_itbis,
            detalle.costo_unitario_efectivo,
            detalle.itbis_aplica,
            detalle.itbis_capitalizable,
            detalle.total_linea,
            negocioId,
          ]
        );

        const producto = productosMap.get(detalle.producto_id);
        if (!esStockIndefinido(producto)) {
          const updateResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND negocio_id = ?',
            [detalle.cantidad, detalle.producto_id, negocioId]
          );
          if ((updateResult?.changes || 0) === 0) {
            throw new Error(`No se pudo actualizar el stock del producto ${detalle.producto_id}.`);
          }
        }
      }

      for (const [productoId, costoData] of costosPorProducto.entries()) {
        const producto = productosMap.get(productoId);
        if (!producto) continue;
        const cantidadComprada = Number(costoData.cantidad) || 0;
        if (cantidadComprada <= 0) continue;
        const costoUnitarioReal = Number(costoData.costo_unitario_real) || 0;
        const incluyeItbis = Number(costoData.costo_unitario_real_incluye_itbis) || 0;
        const ultimoCostoSinItbis = Number(costoData.ultimo_costo_sin_itbis) || 0;
        const costoBaseSinItbis = Number(ultimoCostoSinItbis.toFixed(2));
        if (esReventa) {
          await db.run(
            'UPDATE productos SET costo_unitario_real = ?, costo_unitario_real_incluye_itbis = ?, costo_base_sin_itbis = ? WHERE id = ? AND negocio_id = ?',
            [Number(costoUnitarioReal.toFixed(2)), incluyeItbis, costoBaseSinItbis, productoId, negocioId]
          );
          continue;
        }
        const costoTotalEfectivo = Number(costoData.costo_total_efectivo) || 0;
        const costoPromedioActual = Number(producto.costo_promedio_actual) || 0;
        const stockActual = esStockIndefinido(producto) ? null : Number(producto.stock) || 0;
        const actualizaCosto = Number(producto.actualiza_costo_con_compras ?? 1) === 1;

        if (actualizaCosto) {
          let nuevoCostoPromedio = costoPromedioActual;
          if (Number.isFinite(stockActual) && stockActual > 0) {
            nuevoCostoPromedio =
              (stockActual * costoPromedioActual + costoTotalEfectivo) / (stockActual + cantidadComprada);
          } else {
            nuevoCostoPromedio = costoTotalEfectivo / cantidadComprada;
          }

          await db.run(
            'UPDATE productos SET costo_promedio_actual = ?, ultimo_costo_sin_itbis = ?, costo_base_sin_itbis = ?, costo_unitario_real = ?, costo_unitario_real_incluye_itbis = ? WHERE id = ? AND negocio_id = ?',
            [
              Number(nuevoCostoPromedio.toFixed(2)),
              Number(ultimoCostoSinItbis.toFixed(2)),
              costoBaseSinItbis,
              Number(costoUnitarioReal.toFixed(2)),
              incluyeItbis,
              productoId,
              negocioId,
            ]
          );
        } else {
          await db.run(
            'UPDATE productos SET ultimo_costo_sin_itbis = ?, costo_base_sin_itbis = ?, costo_unitario_real = ?, costo_unitario_real_incluye_itbis = ? WHERE id = ? AND negocio_id = ?',
            [
              Number(ultimoCostoSinItbis.toFixed(2)),
              costoBaseSinItbis,
              Number(costoUnitarioReal.toFixed(2)),
              incluyeItbis,
              productoId,
              negocioId,
            ]
          );
        }
      }

      const compraComentarios = `Compra inventario #${compraId}${observaciones ? ` - ${observaciones}` : ''}`;
      const compraInsert = await db.run(
        `
          INSERT INTO compras
            (proveedor, rnc, fecha, tipo_comprobante, ncf, monto_gravado, impuesto, total, monto_exento, comentarios, negocio_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [proveedor, null, fecha, null, null, subtotalFinal, itbis, total, 0, compraComentarios, negocioId]
      );
      const compra606Id = compraInsert?.lastID || null;

      if (compra606Id) {
        for (const detalle of detalles) {
          const producto = productosMap.get(detalle.producto_id);
          const itbisLinea = aplicaItbis ? Number((detalle.total_linea * ITBIS_RATE).toFixed(2)) : 0;
          const totalLinea = Number((detalle.total_linea + itbisLinea).toFixed(2));
          const costoLineaBase = detalle.costo_unitario_sin_itbis ?? detalle.costo_unitario;
          await db.run(
            `
              INSERT INTO detalle_compra
                (compra_id, descripcion, cantidad, precio_unitario, itbis, total, negocio_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              compra606Id,
              producto?.nombre || `Producto ${detalle.producto_id}`,
              detalle.cantidad,
              costoLineaBase,
              itbisLinea,
              totalLinea,
              negocioId,
            ]
          );
        }
      }

      let gastoId = null;
      if (origenFondos !== 'aporte_externo') {
        const descripcionGasto = `Compra inventario #${compraId}${observaciones ? ` - ${observaciones}` : ''}`;
        const gastoInsert = await db.run(
          `
          INSERT INTO gastos
            (fecha, monto, moneda, categoria, tipo_gasto, origen, metodo_pago, proveedor, descripcion, referencia, es_recurrente, negocio_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            fecha,
            total,
            'DOP',
            'Compras inventario',
            'INVENTARIO',
            'compra',
            metodoPago,
            proveedor,
            descripcionGasto,
            `INV-${compraId}`,
            0,
            negocioId,
          ]
        );

        gastoId = gastoInsert?.lastID || null;
      }

      let salidaId = null;
      if (origenFondos === 'caja') {
        const descripcionSalida = `Compra inventario #${compraId} - ${proveedor}`;
        const salidaInsert = await db.run(
          `
            INSERT INTO salidas_caja (negocio_id, fecha, descripcion, monto, metodo)
            VALUES (?, ?, ?, ?, ?)
          `,
          [negocioId, fecha, descripcionSalida, total, metodoPago || 'efectivo']
        );
        salidaId = salidaInsert?.lastID || null;
      }

      await db.run(
        `
          UPDATE compras_inventario
             SET compra_id = ?, gasto_id = ?, salida_id = ?
           WHERE id = ? AND negocio_id = ?
        `,
        [compra606Id, gastoId, salidaId, compraId, negocioId]
      );

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.status(201).json({
        ok: true,
        id: compraId,
        subtotal: subtotalFinal,
        itbis,
        total,
        aplica_itbis: aplicaItbis ? 1 : 0,
        itbis_capitalizable: itbisCapitalizable ? 1 : 0,
        compra_id: compra606Id,
        gasto_id: gastoId,
        salida_id: salidaId,
      }
    );
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al registrar compra de inventario:', error?.message || error);
      res.status(500).json({ error: error?.message || 'No se pudo registrar la compra de inventario.' });
    }
  });
});

app.get('/api/admin/gastos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const desde = esFechaISOValida(req.query?.from) ? req.query.from : null;
    const hasta = esFechaISOValida(req.query?.to) ? req.query.to : null;
    const categoria = normalizarCampoTexto(req.query?.categoria, null);
    const tipoGastoRaw = normalizarCampoTexto(req.query?.tipo_gasto ?? req.query?.tipoGasto, null);
    const metodoPago = normalizarCampoTexto(req.query?.metodo_pago ?? req.query?.metodoPago, null);
    const q = normalizarCampoTexto(req.query?.q, null);

    const filtros = ['negocio_id = ?'];
    const params = [negocioId];

    if (desde) {
      filtros.push('DATE(fecha) >= ?');
      params.push(desde);
    }
    if (hasta) {
      filtros.push('DATE(fecha) <= ?');
      params.push(hasta);
    }
    if (categoria) {
      filtros.push('categoria = ?');
      params.push(categoria);
    }
    if (tipoGastoRaw) {
      const limpio = tipoGastoRaw.trim().toUpperCase();
      const tipoGasto = TIPOS_GASTO.includes(limpio) ? limpio : null;
      if (tipoGasto) {
        filtros.push("COALESCE(tipo_gasto, 'OPERATIVO') = ?");
        params.push(tipoGasto);
      }
    }
    if (metodoPago) {
      filtros.push('metodo_pago = ?');
      params.push(metodoPago);
    }
    if (q) {
      const termino = `%${q.toLowerCase()}%`;
      filtros.push(
        '(LOWER(proveedor) LIKE ? OR LOWER(descripcion) LIKE ? OR LOWER(comprobante_ncf) LIKE ? OR LOWER(referencia) LIKE ? OR LOWER(categoria) LIKE ?)'
      );
      params.push(termino, termino, termino, termino, termino);
    }

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    try {
      const listadoSql = `
        SELECT id, fecha, monto, moneda, categoria, COALESCE(tipo_gasto, 'OPERATIVO') AS tipo_gasto,
               COALESCE(origen, 'manual') AS origen,
               metodo_pago, proveedor, descripcion,
               comprobante_ncf, referencia, es_recurrente, frecuencia, tags, created_at, updated_at
        FROM gastos
        ${whereClause}
        ORDER BY fecha DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const gastos = await db.all(listadoSql, params);

      const conteoSql = `SELECT COUNT(1) AS total FROM gastos ${whereClause}`;
      const countRow = await db.get(conteoSql, params);
      const total = Number(countRow?.total) || 0;

      const resumenSql = `
        SELECT SUM(monto) AS total, COUNT(DISTINCT DATE(fecha)) AS dias
        FROM gastos
        ${whereClause}
      `;
      const resumenRow = await db.get(resumenSql, params);
      const totalGastos = Number(resumenRow?.total) || 0;

      let diasPromedio = Number(resumenRow?.dias) || 0;
      if (desde && hasta) {
        const inicio = parseFechaISO(desde);
        const fin = parseFechaISO(hasta);
        if (inicio && fin) {
          diasPromedio = calcularDiasIncluidos(inicio, fin);
        }
      }
      const promedioDiario = diasPromedio > 0 ? Number((totalGastos / diasPromedio).toFixed(2)) : 0;

      const filtrosCategorias = [...filtros, "categoria IS NOT NULL", "categoria <> ''"];
      const whereCategorias = `WHERE ${filtrosCategorias.join(' AND ')}`;
      const topCategorias = await db.all(
        `
          SELECT categoria, SUM(monto) AS total
          FROM gastos
          ${whereCategorias}
          GROUP BY categoria
          ORDER BY total DESC
          LIMIT 3
        `,
        params
      );

      res.json({
        ok: true,
        gastos: gastos || [],
        total,
        page,
        limit,
        resumen: {
          total: totalGastos,
          promedio_diario: promedioDiario,
          top_categorias: topCategorias || [],
        },
      });
    } catch (error) {
      console.error('Error al obtener gastos:', error?.message || error);
      res.status(500).json({ error: 'Error al obtener los gastos' });
    }
  });
});

app.post('/api/admin/gastos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const payload = req.body || {};
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    const fecha = normalizarCampoTexto(payload.fecha, null);
    if (!fecha || !esFechaISOValida(fecha)) {
      return res.status(400).json({ error: 'La fecha del gasto es obligatoria y debe ser valida' });
    }

    const montoValor = normalizarNumero(payload.monto, null);
    if (montoValor === null || montoValor <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }

    const moneda = (normalizarCampoTexto(payload.moneda, null) || 'DOP').toUpperCase();
    if (moneda.length > 3) {
      return res.status(400).json({ error: 'La moneda debe tener maximo 3 caracteres' });
    }

    const categoria = normalizarCampoTexto(payload.categoria, null);
    if (categoria && categoria.length > 80) {
      return res.status(400).json({ error: 'La categoria no puede superar 80 caracteres' });
    }

    const tipoGasto = normalizarTipoGasto(payload.tipo_gasto ?? payload.tipoGasto, 'OPERATIVO');
    const origen = normalizarOrigenGasto(payload.origen ?? payload.origen_gasto ?? payload.origenGasto, 'manual');

    const metodoPago = normalizarCampoTexto(payload.metodo_pago ?? payload.metodoPago, null);
    if (metodoPago && metodoPago.length > 40) {
      return res.status(400).json({ error: 'El metodo de pago no puede superar 40 caracteres' });
    }

    const proveedor = normalizarCampoTexto(payload.proveedor, null);
    if (proveedor && proveedor.length > 120) {
      return res.status(400).json({ error: 'El proveedor no puede superar 120 caracteres' });
    }

    const descripcion = normalizarCampoTexto(payload.descripcion, null);
    const comprobanteNCF = normalizarCampoTexto(payload.comprobante_ncf ?? payload.comprobanteNCF, null);
    if (comprobanteNCF && comprobanteNCF.length > 30) {
      return res.status(400).json({ error: 'El comprobante NCF no puede superar 30 caracteres' });
    }

    const referencia = normalizarCampoTexto(payload.referencia, null);
    if (referencia && referencia.length > 60) {
      return res.status(400).json({ error: 'La referencia no puede superar 60 caracteres' });
    }

    const esRecurrente = normalizarFlag(payload.es_recurrente ?? payload.esRecurrente, 0);
    const frecuencia = normalizarCampoTexto(payload.frecuencia, null);
    if (frecuencia && frecuencia.length > 20) {
      return res.status(400).json({ error: 'La frecuencia no puede superar 20 caracteres' });
    }
    if (esRecurrente && !frecuencia) {
      return res.status(400).json({ error: 'La frecuencia es obligatoria para gastos recurrentes' });
    }

    let tagsEntrada = payload.tags;
    if (Array.isArray(tagsEntrada)) {
      tagsEntrada = tagsEntrada.map((tag) => String(tag).trim()).filter(Boolean).join(',');
    } else if (tagsEntrada && typeof tagsEntrada === 'object') {
      tagsEntrada = JSON.stringify(tagsEntrada);
    }
    const tags = normalizarCampoTexto(tagsEntrada, null);

    try {
      const sql = `
        INSERT INTO gastos (
          fecha, monto, moneda, categoria, tipo_gasto, origen, metodo_pago, proveedor, descripcion,
          comprobante_ncf, referencia, es_recurrente, frecuencia, tags, negocio_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        fecha,
        montoValor,
        moneda,
        categoria,
        tipoGasto,
        origen,
        metodoPago,
        proveedor,
        descripcion,
        comprobanteNCF,
        referencia,
        esRecurrente ? 1 : 0,
        frecuencia,
        tags,
        negocioId,
      ];

      const result = await db.run(sql, params);
      limpiarCacheAnalitica(negocioId);
      res.status(201).json({
        ok: true,
        gasto: {
          id: result.lastID,
          fecha,
          monto: montoValor,
          moneda,
          categoria,
          tipo_gasto: tipoGasto,
          origen,
          metodo_pago: metodoPago,
          proveedor,
          descripcion,
          comprobante_ncf: comprobanteNCF,
          referencia,
          es_recurrente: esRecurrente ? 1 : 0,
          frecuencia,
          tags,
        },
      });
    } catch (error) {
      console.error('Error al registrar gasto:', error?.message || error);
      res.status(500).json({ error: 'Error al registrar el gasto' });
    }
  });
});

app.put('/api/admin/gastos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de gasto invalido' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    let existente;
    try {
      existente = await db.get('SELECT * FROM gastos WHERE id = ? AND negocio_id = ?', [id, negocioId]);
    } catch (error) {
      console.error('Error al obtener gasto:', error?.message || error);
      return res.status(500).json({ error: 'Error al actualizar el gasto' });
    }
    if (!existente) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const payload = req.body || {};
    const updates = [];
    const params = [];

    if (payload.fecha !== undefined) {
      const fecha = normalizarCampoTexto(payload.fecha, null);
      if (!fecha || !esFechaISOValida(fecha)) {
        return res.status(400).json({ error: 'La fecha del gasto es obligatoria y debe ser valida' });
      }
      updates.push('fecha = ?');
      params.push(fecha);
    }

    if (payload.monto !== undefined) {
      const montoValor = normalizarNumero(payload.monto, null);
      if (montoValor === null || montoValor <= 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
      }
      updates.push('monto = ?');
      params.push(montoValor);
    }

    if (payload.moneda !== undefined) {
      const moneda = (normalizarCampoTexto(payload.moneda, null) || 'DOP').toUpperCase();
      if (moneda.length > 3) {
        return res.status(400).json({ error: 'La moneda debe tener maximo 3 caracteres' });
      }
      updates.push('moneda = ?');
      params.push(moneda);
    }

    if (payload.categoria !== undefined) {
      const categoria = normalizarCampoTexto(payload.categoria, null);
      if (categoria && categoria.length > 80) {
        return res.status(400).json({ error: 'La categoria no puede superar 80 caracteres' });
      }
      updates.push('categoria = ?');
      params.push(categoria);
    }

    if (payload.tipo_gasto !== undefined || payload.tipoGasto !== undefined) {
      const tipoGasto = normalizarTipoGasto(payload.tipo_gasto ?? payload.tipoGasto, 'OPERATIVO');
      updates.push('tipo_gasto = ?');
      params.push(tipoGasto);
    }

    if (payload.origen !== undefined || payload.origen_gasto !== undefined || payload.origenGasto !== undefined) {
      const origen = normalizarOrigenGasto(
        payload.origen ?? payload.origen_gasto ?? payload.origenGasto,
        'manual'
      );
      updates.push('origen = ?');
      params.push(origen);
    }

    if (payload.metodo_pago !== undefined || payload.metodoPago !== undefined) {
      const metodoPago = normalizarCampoTexto(payload.metodo_pago ?? payload.metodoPago, null);
      if (metodoPago && metodoPago.length > 40) {
        return res.status(400).json({ error: 'El metodo de pago no puede superar 40 caracteres' });
      }
      updates.push('metodo_pago = ?');
      params.push(metodoPago);
    }

    if (payload.proveedor !== undefined) {
      const proveedor = normalizarCampoTexto(payload.proveedor, null);
      if (proveedor && proveedor.length > 120) {
        return res.status(400).json({ error: 'El proveedor no puede superar 120 caracteres' });
      }
      updates.push('proveedor = ?');
      params.push(proveedor);
    }

    if (payload.descripcion !== undefined) {
      updates.push('descripcion = ?');
      params.push(normalizarCampoTexto(payload.descripcion, null));
    }

    if (payload.comprobante_ncf !== undefined || payload.comprobanteNCF !== undefined) {
      const comprobante = normalizarCampoTexto(payload.comprobante_ncf ?? payload.comprobanteNCF, null);
      if (comprobante && comprobante.length > 30) {
        return res.status(400).json({ error: 'El comprobante NCF no puede superar 30 caracteres' });
      }
      updates.push('comprobante_ncf = ?');
      params.push(comprobante);
    }

    if (payload.referencia !== undefined) {
      const referencia = normalizarCampoTexto(payload.referencia, null);
      if (referencia && referencia.length > 60) {
        return res.status(400).json({ error: 'La referencia no puede superar 60 caracteres' });
      }
      updates.push('referencia = ?');
      params.push(referencia);
    }

    let esRecurrenteValor;
    if (payload.es_recurrente !== undefined || payload.esRecurrente !== undefined) {
      esRecurrenteValor = normalizarFlag(payload.es_recurrente ?? payload.esRecurrente, 0);
      updates.push('es_recurrente = ?');
      params.push(esRecurrenteValor ? 1 : 0);
    }

    let frecuenciaEntrada;
    if (payload.frecuencia !== undefined) {
      frecuenciaEntrada = normalizarCampoTexto(payload.frecuencia, null);
      if (frecuenciaEntrada && frecuenciaEntrada.length > 20) {
        return res.status(400).json({ error: 'La frecuencia no puede superar 20 caracteres' });
      }
      updates.push('frecuencia = ?');
      params.push(frecuenciaEntrada);
    }

    if (payload.tags !== undefined) {
      let tagsEntrada = payload.tags;
      if (Array.isArray(tagsEntrada)) {
        tagsEntrada = tagsEntrada.map((tag) => String(tag).trim()).filter(Boolean).join(',');
      } else if (tagsEntrada && typeof tagsEntrada === 'object') {
        tagsEntrada = JSON.stringify(tagsEntrada);
      }
      updates.push('tags = ?');
      params.push(normalizarCampoTexto(tagsEntrada, null));
    }

    const esRecurrenteFinal =
      esRecurrenteValor !== undefined ? esRecurrenteValor : Number(existente.es_recurrente) || 0;
    const frecuenciaFinal = payload.frecuencia !== undefined ? frecuenciaEntrada : existente.frecuencia;

    if (esRecurrenteFinal && !frecuenciaFinal) {
      return res.status(400).json({ error: 'La frecuencia es obligatoria para gastos recurrentes' });
    }

    if (esRecurrenteValor === 0 && payload.frecuencia === undefined && existente.frecuencia) {
      updates.push('frecuencia = NULL');
    }

    if (!updates.length) {
      return res.json({ ok: true, gasto: existente });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, negocioId);

    try {
      const sql = `UPDATE gastos SET ${updates.join(', ')} WHERE id = ? AND negocio_id = ?`;
      const result = await db.run(sql, params);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Gasto no encontrado' });
      }
      limpiarCacheAnalitica(negocioId);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al actualizar gasto:', error?.message || error);
      res.status(500).json({ error: 'Error al actualizar el gasto' });
    }
  });
});

app.delete('/api/admin/gastos/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de gasto invalido' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    try {
      const result = await db.run('DELETE FROM gastos WHERE id = ? AND negocio_id = ?', [id, negocioId]);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Gasto no encontrado' });
      }
      limpiarCacheAnalitica(negocioId);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al eliminar gasto:', error?.message || error);
      res.status(500).json({ error: 'Error al eliminar el gasto' });
    }
  });
});

const obtenerCapitalInicialPeriodo = async (negocioId, desde, hasta) => {
  if (!desde || !hasta) {
    return {
      periodo_inicio: desde || '',
      periodo_fin: hasta || '',
      caja_inicial: 0,
      inventario_inicial: 0,
      encontrado: false,
    };
  }

  const row = await db.get(
    `
      SELECT periodo_inicio, periodo_fin, caja_inicial, inventario_inicial
      FROM analisis_capital_inicial
      WHERE negocio_id = ?
        AND periodo_inicio <= ?
        AND periodo_fin >= ?
      ORDER BY periodo_inicio DESC, periodo_fin ASC
      LIMIT 1
    `,
    [negocioId, desde, hasta]
  );

  if (!row) {
    return {
      periodo_inicio: desde,
      periodo_fin: hasta,
      caja_inicial: 0,
      inventario_inicial: 0,
      encontrado: false,
    };
  }

  return {
    periodo_inicio: row.periodo_inicio,
    periodo_fin: row.periodo_fin,
    caja_inicial: Number(row.caja_inicial) || 0,
    inventario_inicial: Number(row.inventario_inicial) || 0,
    encontrado: true,
  };
};

const guardarCapitalInicialPeriodo = async (
  negocioId,
  periodoInicio,
  periodoFin,
  cajaInicial,
  inventarioInicial
) => {
  await db.run(
    `
      INSERT INTO analisis_capital_inicial
        (negocio_id, periodo_inicio, periodo_fin, caja_inicial, inventario_inicial)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        caja_inicial = VALUES(caja_inicial),
        inventario_inicial = VALUES(inventario_inicial),
        updated_at = CURRENT_TIMESTAMP
    `,
    [negocioId, periodoInicio, periodoFin, cajaInicial, inventarioInicial]
  );
};

app.get('/api/admin/analytics/capital', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    try {
      const capital = await obtenerCapitalInicialPeriodo(negocioId, rango.desde, rango.hasta);
      const costoEstimado = await obtenerCostoEstimadoCogs(negocioId);
      res.json({ ok: true, capital, costo_estimado_cogs: costoEstimado });
    } catch (error) {
      console.error('Error al obtener capital inicial:', error?.message || error);
      res.status(500).json({ error: 'No se pudo obtener el capital inicial.' });
    }
  });
});

app.put('/api/admin/analytics/capital', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const periodoInicio = normalizarCampoTexto(req.body?.periodo_inicio ?? req.body?.periodoInicio, null);
    const periodoFin = normalizarCampoTexto(req.body?.periodo_fin ?? req.body?.periodoFin, null);
    if (!periodoInicio || !periodoFin || !esFechaISOValida(periodoInicio) || !esFechaISOValida(periodoFin)) {
      return res.status(400).json({ error: 'Periodo de capital invalido.' });
    }
    if (periodoInicio > periodoFin) {
      return res.status(400).json({ error: 'El periodo inicio no puede ser mayor que el fin.' });
    }

    const cajaInicialRaw = normalizarNumero(req.body?.caja_inicial ?? req.body?.cajaInicial, 0);
    const inventarioInicialRaw = normalizarNumero(
      req.body?.inventario_inicial ?? req.body?.inventarioInicial,
      0
    );
    if (cajaInicialRaw < 0 || inventarioInicialRaw < 0) {
      return res.status(400).json({ error: 'Los valores iniciales no pueden ser negativos.' });
    }

    const costoEstimadoRaw = req.body?.costo_estimado_cogs ?? req.body?.costoEstimadoCogs;
    const costoEstimado = costoEstimadoRaw !== undefined ? normalizarNumero(costoEstimadoRaw, 0) : null;
    if (costoEstimado !== null && costoEstimado < 0) {
      return res.status(400).json({ error: 'El costo estimado no puede ser negativo.' });
    }

    try {
      await guardarCapitalInicialPeriodo(
        negocioId,
        periodoInicio,
        periodoFin,
        Number(cajaInicialRaw.toFixed(2)),
        Number(inventarioInicialRaw.toFixed(2))
      );

      if (costoEstimado !== null) {
        await guardarConfiguracionNegocio(negocioId, {
          [COGS_CONFIG_KEY]: Number(costoEstimado.toFixed(2)),
        });
      }

      limpiarCacheAnalitica(negocioId);

      res.json({ ok: true });
    } catch (error) {
      console.error('Error al guardar capital inicial:', error?.message || error);
      res.status(500).json({ error: 'No se pudo guardar el capital inicial.' });
    }
  });
});

app.get('/api/admin/analytics/overview', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    const cacheKey = `${negocioId}:${rango.desde}:${rango.hasta}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const fechaBaseRaw = 'COALESCE(fecha_factura, fecha_cierre, fecha_creacion)';
    const fechaBase = `DATE(${fechaBaseRaw})`;
    const paramsBase = [negocioId, rango.desde, rango.hasta];

    try {
      const ventasPedidosResumen = await db.get(
        `
          SELECT COUNT(DISTINCT COALESCE(cuenta_id, id)) AS total_ventas,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsBase
      );
      const ventasDeudasResumen = await db.get(
        `
          SELECT COUNT(DISTINCT id) AS total_ventas,
                 SUM(monto_total) AS total
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );

      const ingresosTotal =
        (Number(ventasPedidosResumen?.total) || 0) + (Number(ventasDeudasResumen?.total) || 0);
      const ventasCount =
        (Number(ventasPedidosResumen?.total_ventas) || 0) +
        (Number(ventasDeudasResumen?.total_ventas) || 0);
      const ticketPromedio = ventasCount > 0 ? Number((ingresosTotal / ventasCount).toFixed(2)) : 0;
      const ventasSeriePedidos = await db.all(
        `
          SELECT ${fechaBase} AS fecha,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS ventas
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY fecha
        `,
        paramsBase
      );
      const ventasSerieDeudas = await db.all(
        `
          SELECT DATE(fecha) AS fecha,
                 SUM(monto_total) AS total,
                 COUNT(DISTINCT id) AS ventas
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
          GROUP BY fecha
        `,
        paramsBase
      );
      const ventasSerieMap = new Map();
      [...(ventasSeriePedidos || []), ...(ventasSerieDeudas || [])].forEach((row) => {
        const fecha = row?.fecha;
        if (!fecha) return;
        const key = String(fecha);
        const actual = ventasSerieMap.get(key) || { fecha, total: 0, ventas: 0 };
        actual.total += Number(row?.total) || 0;
        actual.ventas += Number(row?.ventas) || 0;
        ventasSerieMap.set(key, actual);
      });
      const ventasSerie = Array.from(ventasSerieMap.values()).sort((a, b) =>
        String(a.fecha).localeCompare(String(b.fecha))
      );

      const ventasPorDiaSemanaPedidos = await db.all(
        `
          SELECT DAYOFWEEK(${fechaBaseRaw}) AS dia_semana,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS ventas
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY dia_semana
        `,
        paramsBase
      );
      const ventasPorDiaSemanaDeudas = await db.all(
        `
          SELECT DAYOFWEEK(fecha) AS dia_semana,
                 SUM(monto_total) AS total,
                 COUNT(DISTINCT id) AS ventas
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
          GROUP BY dia_semana
        `,
        paramsBase
      );
      const ventasPorDiaSemanaMap = new Map();
      [...(ventasPorDiaSemanaPedidos || []), ...(ventasPorDiaSemanaDeudas || [])].forEach((row) => {
        const diaSemana = Number(row?.dia_semana) || 0;
        if (!diaSemana) return;
        const actual = ventasPorDiaSemanaMap.get(diaSemana) || { dia_semana: diaSemana, total: 0, ventas: 0 };
        actual.total += Number(row?.total) || 0;
        actual.ventas += Number(row?.ventas) || 0;
        ventasPorDiaSemanaMap.set(diaSemana, actual);
      });
      const ventasPorDiaSemana = Array.from(ventasPorDiaSemanaMap.values()).sort((a, b) => {
        const totalDiff = (Number(b?.total) || 0) - (Number(a?.total) || 0);
        if (totalDiff !== 0) return totalDiff;
        return (Number(a?.dia_semana) || 0) - (Number(b?.dia_semana) || 0);
      });

      const ventasPorHoraPedidos = await db.all(
        `
          SELECT HOUR(${fechaBaseRaw}) AS hora,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS ventas
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY hora
        `,
        paramsBase
      );
      const ventasPorHoraDeudas = await db.all(
        `
          SELECT HOUR(COALESCE(updated_at, created_at, CONCAT(fecha, ' 00:00:00'))) AS hora,
                 SUM(monto_total) AS total,
                 COUNT(DISTINCT id) AS ventas
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
          GROUP BY hora
        `,
        paramsBase
      );
      const ventasPorHoraMap = new Map();
      [...(ventasPorHoraPedidos || []), ...(ventasPorHoraDeudas || [])].forEach((row) => {
        const hora = Number(row?.hora);
        if (!Number.isInteger(hora) || hora < 0 || hora > 23) return;
        const actual = ventasPorHoraMap.get(hora) || { hora, total: 0, ventas: 0 };
        actual.total += Number(row?.total) || 0;
        actual.ventas += Number(row?.ventas) || 0;
        ventasPorHoraMap.set(hora, actual);
      });
      const ventasPorHora = Array.from(ventasPorHoraMap.values()).sort((a, b) => {
        const totalDiff = (Number(b?.total) || 0) - (Number(a?.total) || 0);
        if (totalDiff !== 0) return totalDiff;
        return (Number(a?.hora) || 0) - (Number(b?.hora) || 0);
      });

      const ventasProductosPedidos = await db.all(
        `
          SELECT p.id,
                 p.nombre,
                 COALESCE(c.nombre, 'Sin categoria') AS categoria,
                 SUM(dp.cantidad) AS cantidad,
                 SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos
          FROM detalle_pedido dp
          JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
          JOIN productos p ON p.id = dp.producto_id AND p.negocio_id = ?
          LEFT JOIN categorias c ON c.id = p.categoria_id AND c.negocio_id = ?
          WHERE dp.negocio_id = ?
            AND pe.estado = 'pagado'
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY p.id, p.nombre, categoria
        `,
        [negocioId, negocioId, negocioId, negocioId, rango.desde, rango.hasta]
      );
      const ventasProductosDeudas = await db.all(
        `
          SELECT p.id,
                 p.nombre,
                 COALESCE(c.nombre, 'Sin categoria') AS categoria,
                 SUM(dd.cantidad) AS cantidad,
                 SUM(dd.total_linea) AS ingresos
          FROM clientes_deudas_detalle dd
          JOIN clientes_deudas d ON d.id = dd.deuda_id AND d.negocio_id = ?
          JOIN productos p ON p.id = dd.producto_id AND p.negocio_id = ?
          LEFT JOIN categorias c ON c.id = p.categoria_id AND c.negocio_id = ?
          WHERE dd.negocio_id = ?
            AND DATE(d.fecha) BETWEEN ? AND ?
          GROUP BY p.id, p.nombre, categoria
        `,
        [negocioId, negocioId, negocioId, negocioId, rango.desde, rango.hasta]
      );
      const catalogoProductos = await db.all(
        `
          SELECT p.id,
                 p.nombre,
                 COALESCE(c.nombre, 'Sin categoria') AS categoria
          FROM productos p
          LEFT JOIN categorias c ON c.id = p.categoria_id AND c.negocio_id = p.negocio_id
          WHERE p.negocio_id = ?
        `,
        [negocioId]
      );

      const productosVentasMap = new Map();
      [...(ventasProductosPedidos || []), ...(ventasProductosDeudas || [])].forEach((row) => {
        const productoId = Number(row?.id);
        if (!productoId) return;
        const actual = productosVentasMap.get(productoId) || {
          id: productoId,
          nombre: row?.nombre || `Producto ${productoId}`,
          categoria: row?.categoria || 'Sin categoria',
          cantidad: 0,
          ingresos: 0,
        };
        actual.cantidad += Number(row?.cantidad) || 0;
        actual.ingresos += Number(row?.ingresos) || 0;
        if (!actual.nombre && row?.nombre) {
          actual.nombre = row.nombre;
        }
        if ((!actual.categoria || actual.categoria === 'Sin categoria') && row?.categoria) {
          actual.categoria = row.categoria;
        }
        productosVentasMap.set(productoId, actual);
      });

      const ventasProductosLista = Array.from(productosVentasMap.values()).map((item) => ({
        id: Number(item.id) || null,
        nombre: item.nombre || 'Producto',
        categoria: item.categoria || 'Sin categoria',
        cantidad: Number((Number(item.cantidad) || 0).toFixed(2)),
        ingresos: Number((Number(item.ingresos) || 0).toFixed(2)),
      }));

      const topProductosCantidad = [...ventasProductosLista]
        .sort((a, b) => {
          const cantidadDiff = (Number(b.cantidad) || 0) - (Number(a.cantidad) || 0);
          if (cantidadDiff !== 0) return cantidadDiff;
          const ingresosDiff = (Number(b.ingresos) || 0) - (Number(a.ingresos) || 0);
          if (ingresosDiff !== 0) return ingresosDiff;
          return String(a.nombre || '').localeCompare(String(b.nombre || ''));
        })
        .slice(0, 10);

      const topProductosIngresos = [...ventasProductosLista]
        .sort((a, b) => {
          const ingresosDiff = (Number(b.ingresos) || 0) - (Number(a.ingresos) || 0);
          if (ingresosDiff !== 0) return ingresosDiff;
          const cantidadDiff = (Number(b.cantidad) || 0) - (Number(a.cantidad) || 0);
          if (cantidadDiff !== 0) return cantidadDiff;
          return String(a.nombre || '').localeCompare(String(b.nombre || ''));
        })
        .slice(0, 10);

      const bottomProductos = (catalogoProductos || [])
        .map((producto) => {
          const venta = productosVentasMap.get(Number(producto.id)) || {};
          return {
            id: Number(producto.id) || null,
            nombre: producto.nombre || `Producto ${producto.id || ''}`,
            categoria: producto.categoria || 'Sin categoria',
            cantidad: Number((Number(venta.cantidad) || 0).toFixed(2)),
            ingresos: Number((Number(venta.ingresos) || 0).toFixed(2)),
          };
        })
        .sort((a, b) => {
          const cantidadDiff = (Number(a.cantidad) || 0) - (Number(b.cantidad) || 0);
          if (cantidadDiff !== 0) return cantidadDiff;
          const ingresosDiff = (Number(a.ingresos) || 0) - (Number(b.ingresos) || 0);
          if (ingresosDiff !== 0) return ingresosDiff;
          return String(a.nombre || '').localeCompare(String(b.nombre || ''));
        })
        .slice(0, 10);

      const categoriasVentasMap = new Map();
      ventasProductosLista.forEach((item) => {
        const categoria = item?.categoria || 'Sin categoria';
        const actual = categoriasVentasMap.get(categoria) || { categoria, cantidad: 0, ingresos: 0 };
        actual.cantidad += Number(item?.cantidad) || 0;
        actual.ingresos += Number(item?.ingresos) || 0;
        categoriasVentasMap.set(categoria, actual);
      });
      const topCategoriasVentas = Array.from(categoriasVentasMap.values())
        .map((item) => ({
          categoria: item.categoria,
          cantidad: Number((Number(item.cantidad) || 0).toFixed(2)),
          ingresos: Number((Number(item.ingresos) || 0).toFixed(2)),
        }))
        .sort((a, b) => {
          const ingresosDiff = (Number(b.ingresos) || 0) - (Number(a.ingresos) || 0);
          if (ingresosDiff !== 0) return ingresosDiff;
          return String(a.categoria || '').localeCompare(String(b.categoria || ''));
        })
        .slice(0, 5);

      const ventasPorDiaMesPedidos = await db.all(
        `
          SELECT DAY(${fechaBaseRaw}) AS dia_mes,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY dia_mes
        `,
        paramsBase
      );
      const ventasPorDiaMesDeudas = await db.all(
        `
          SELECT DAY(fecha) AS dia_mes,
                 SUM(monto_total) AS total
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
          GROUP BY dia_mes
        `,
        paramsBase
      );
      const ventasPorDiaMesMap = new Map();
      [...(ventasPorDiaMesPedidos || []), ...(ventasPorDiaMesDeudas || [])].forEach((row) => {
        const diaMes = Number(row?.dia_mes) || 0;
        if (!diaMes) return;
        ventasPorDiaMesMap.set(diaMes, (ventasPorDiaMesMap.get(diaMes) || 0) + (Number(row?.total) || 0));
      });
      const ventasPorDiaMes = Array.from(ventasPorDiaMesMap.entries())
        .map(([diaMes, total]) => ({
          dia_mes: Number(diaMes),
          total: Number(total) || 0,
        }))
        .sort((a, b) => {
          const totalDiff = (Number(b?.total) || 0) - (Number(a?.total) || 0);
          if (totalDiff !== 0) return totalDiff;
          return (Number(a?.dia_mes) || 0) - (Number(b?.dia_mes) || 0);
        });

      const metodosPago = await db.get(
        `
          SELECT SUM(pago_efectivo) AS efectivo,
                 SUM(pago_tarjeta) AS tarjeta,
                 SUM(pago_transferencia) AS transferencia
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsBase
      );

      const tipoGastoNormalizadoSql = `
        CASE
          WHEN UPPER(TRIM(COALESCE(tipo_gasto, ''))) IN ('OPERATIVO', 'INVENTARIO', 'RETIRO_CAJA', 'ACTIVO_FIJO') THEN UPPER(TRIM(tipo_gasto))
          WHEN UPPER(TRIM(COALESCE(categoria, ''))) = 'COMPRAS INVENTARIO'
            OR COALESCE(referencia, '') LIKE 'INV-%' THEN 'INVENTARIO'
          WHEN UPPER(TRIM(COALESCE(categoria, ''))) = 'SALIDA_CAJA'
            OR UPPER(TRIM(COALESCE(referencia_tipo, ''))) = 'SALIDA_CAJA' THEN 'RETIRO_CAJA'
          ELSE 'OPERATIVO'
        END
      `;

      const gastosResumen = await db.get(
        `
          SELECT SUM(monto) AS total,
                 SUM(CASE WHEN ${tipoGastoNormalizadoSql} = 'OPERATIVO' THEN monto ELSE 0 END) AS total_operativos
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
            AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
        `,
        paramsBase
      );
      const gastosTotal = Number(gastosResumen?.total) || 0;
      const gastosOperativosTotal = Number(gastosResumen?.total_operativos) || 0;

      const gastosSerie = await db.all(
        `
          SELECT DATE(fecha) AS fecha, SUM(monto) AS total
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
            AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
          GROUP BY fecha
          ORDER BY fecha ASC
        `,
        paramsBase
      );

      const gastosTopCategorias = await db.all(
        `
          SELECT categoria, SUM(monto) AS total
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
            AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
            AND categoria IS NOT NULL
            AND categoria <> ''
          GROUP BY categoria
          ORDER BY total DESC
          LIMIT 5
        `,
        paramsBase
      );

      const gastosRecurrentes = await db.all(
        `
          SELECT es_recurrente, SUM(monto) AS total
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
            AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
          GROUP BY es_recurrente
        `,
        paramsBase
      );

      const cogsPedidosResumen = await db.get(
        `
          SELECT SUM(cogs_total) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsBase
      );
      const cogsDeudasResumen = await db.get(
        `
          SELECT SUM(
                   COALESCE(dd.cantidad, 0) * COALESCE(
                     NULLIF(p.costo_unitario_real, 0),
                     NULLIF(p.costo_promedio_actual, 0),
                     NULLIF(p.costo_base_sin_itbis, 0),
                     NULLIF(p.ultimo_costo_sin_itbis, 0),
                     0
                   )
                 ) AS total
          FROM clientes_deudas_detalle dd
          JOIN clientes_deudas d ON d.id = dd.deuda_id
          LEFT JOIN productos p ON p.id = dd.producto_id AND p.negocio_id = d.negocio_id
          WHERE d.negocio_id = ?
            AND DATE(d.fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );
      const cogsTotal = (Number(cogsPedidosResumen?.total) || 0) + (Number(cogsDeudasResumen?.total) || 0);

      const costosConfiguradosRow = await db.get(
        `
          SELECT COUNT(1) AS total
          FROM productos
          WHERE negocio_id = ?
            AND (
              COALESCE(costo_unitario_real, 0) > 0
              OR
              COALESCE(costo_base_sin_itbis, 0) > 0
              OR COALESCE(costo_promedio_actual, 0) > 0
              OR COALESCE(ultimo_costo_sin_itbis, 0) > 0
            )
        `,
        [negocioId]
      );
      const costosConfigurados = Number(costosConfiguradosRow?.total) > 0;

      const gananciaNeta = Number((ingresosTotal - gastosTotal).toFixed(2));
      const margenNeto = ingresosTotal > 0 ? Number((gananciaNeta / ingresosTotal).toFixed(4)) : 0;
      const utilidadBruta = Number((ingresosTotal - cogsTotal).toFixed(2));
      const utilidadReal = Number((utilidadBruta - gastosOperativosTotal).toFixed(2));

      const rangoAnterior = obtenerRangoAnterior(rango.desde, rango.dias);
      const paramsAnterior = [negocioId, rangoAnterior.desde, rangoAnterior.hasta];
      const ventasAnteriorPedidos = await db.get(
        `
          SELECT COUNT(DISTINCT COALESCE(cuenta_id, id)) AS total_ventas,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsAnterior
      );
      const ventasAnteriorDeudas = await db.get(
        `
          SELECT COUNT(DISTINCT id) AS total_ventas,
                 SUM(monto_total) AS total
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
        `,
        paramsAnterior
      );
      const gastosAnterior = await db.get(
        `
          SELECT SUM(monto) AS total
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
        `,
        [negocioId, rangoAnterior.desde, rangoAnterior.hasta]
      );

      const ventasTotalAnterior =
        (Number(ventasAnteriorPedidos?.total) || 0) + (Number(ventasAnteriorDeudas?.total) || 0);
      const ventasCountAnterior =
        (Number(ventasAnteriorPedidos?.total_ventas) || 0) +
        (Number(ventasAnteriorDeudas?.total_ventas) || 0);
      const ticketPromedioAnterior =
        ventasCountAnterior > 0 ? Number((ventasTotalAnterior / ventasCountAnterior).toFixed(2)) : 0;
      const gastosTotalAnterior = Number(gastosAnterior?.total) || 0;
      const gananciaAnterior = Number((ventasTotalAnterior - gastosTotalAnterior).toFixed(2));

      const comparacion = {
        periodo_anterior: rangoAnterior,
        ventas: {
          total: ventasTotalAnterior,
          delta: Number((ingresosTotal - ventasTotalAnterior).toFixed(2)),
          porcentaje:
            ventasTotalAnterior > 0
              ? Number(((ingresosTotal - ventasTotalAnterior) / ventasTotalAnterior).toFixed(4))
              : null,
        },
        gastos: {
          total: gastosTotalAnterior,
          delta: Number((gastosTotal - gastosTotalAnterior).toFixed(2)),
          porcentaje:
            gastosTotalAnterior > 0
              ? Number(((gastosTotal - gastosTotalAnterior) / gastosTotalAnterior).toFixed(4))
              : null,
        },
        ganancia: {
          total: gananciaAnterior,
          delta: Number((gananciaNeta - gananciaAnterior).toFixed(2)),
          porcentaje:
            gananciaAnterior !== 0
              ? Number(((gananciaNeta - gananciaAnterior) / gananciaAnterior).toFixed(4))
              : null,
        },
        ticket_promedio: {
          total: ticketPromedioAnterior,
          delta: Number((ticketPromedio - ticketPromedioAnterior).toFixed(2)),
          porcentaje:
            ticketPromedioAnterior > 0
              ? Number(((ticketPromedio - ticketPromedioAnterior) / ticketPromedioAnterior).toFixed(4))
              : null,
        },
      };

      const alertas = [];
      if (comparacion.gastos.porcentaje !== null && comparacion.gastos.porcentaje > 0.2) {
        if (comparacion.ventas.porcentaje === null || comparacion.ventas.porcentaje <= 0) {
          alertas.push({
            nivel: 'warning',
            mensaje: 'Los gastos subieron en el periodo sin un aumento equivalente de ingresos.',
          });
        }
      }

      if (comparacion.ticket_promedio.porcentaje !== null && comparacion.ticket_promedio.porcentaje < -0.15) {
        alertas.push({
          nivel: 'warning',
          mensaje: 'El ticket promedio cayo frente al periodo anterior. Revisa promociones o precios.',
        });
      }

      const productosCero = (bottomProductos || []).filter((item) => Number(item.cantidad) === 0).length;
      if (productosCero > 0) {
        alertas.push({
          nivel: 'info',
          mensaje: `Hay ${productosCero} productos sin ventas en el periodo. Considera promociones o ajustes al menu.`,
        });
      }

      const diasSemanaTotales = ventasPorDiaSemana || [];
      if (diasSemanaTotales.length >= 3) {
        const promedioSemana =
          diasSemanaTotales.reduce((acc, item) => acc + (Number(item.total) || 0), 0) / diasSemanaTotales.length;
        const diaFlojo = diasSemanaTotales.reduce((min, item) =>
          Number(item.total) < Number(min.total) ? item : min
        );
        if (promedioSemana > 0 && Number(diaFlojo.total) < promedioSemana * 0.5) {
          alertas.push({
            nivel: 'info',
            mensaje: 'Hay un dia de la semana con ventas muy bajas. Considera promociones especificas.',
          });
        }
      }

      const totalProductosConVentas = (ventasProductosLista || []).filter((item) => {
        const cantidad = Number(item?.cantidad) || 0;
        const ingresos = Number(item?.ingresos) || 0;
        return cantidad > 0 || ingresos > 0;
      }).length;
      if (totalProductosConVentas > 0 && ingresosTotal > 0) {
        const topN = Math.max(1, Math.ceil(totalProductosConVentas * 0.2));
        const paretoRows = [...(ventasProductosLista || [])]
          .sort((a, b) => (Number(b?.ingresos) || 0) - (Number(a?.ingresos) || 0))
          .slice(0, topN);
        const ingresosTop = paretoRows.reduce((acc, row) => acc + (Number(row.ingresos) || 0), 0);
        if (ingresosTop / ingresosTotal >= 0.8) {
          alertas.push({
            nivel: 'success',
            mensaje: 'El 20% de los productos genera mas del 80% de los ingresos (efecto Pareto).',
          });
        }
      }

      const nombresDias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      const ventasDiaSemanaFormateadas = (ventasPorDiaSemana || []).map((item) => ({
        dia: nombresDias[(Number(item.dia_semana) || 1) - 1] || 'domingo',
        total: Number(item.total) || 0,
        ventas: Number(item.ventas) || 0,
      }));

      const ventasHoraFormateadas = (ventasPorHora || []).map((item) => ({
        hora: Number(item.hora),
        total: Number(item.total) || 0,
        ventas: Number(item.ventas) || 0,
      }));

      const responsePayload = {
        ok: true,
        rango,
        ingresos: {
          total: ingresosTotal,
          count: ventasCount,
          ticket_promedio: ticketPromedio,
          serie_diaria: (ventasSerie || []).map((row) => ({
            fecha: row.fecha,
            total: Number(row.total) || 0,
            ventas: Number(row.ventas) || 0,
          })),
          por_dia_semana: ventasDiaSemanaFormateadas,
          por_hora: ventasHoraFormateadas,
        },
        gastos: {
          total: gastosTotal,
          total_operativos: gastosOperativosTotal,
          top_categorias: (gastosTopCategorias || []).map((row) => ({
            categoria: row.categoria,
            total: Number(row.total) || 0,
          })),
          serie_diaria: (gastosSerie || []).map((row) => ({
            fecha: row.fecha,
            total: Number(row.total) || 0,
          })),
          recurrentes: (gastosRecurrentes || []).map((row) => ({
            es_recurrente: Number(row.es_recurrente) === 1,
            total: Number(row.total) || 0,
          })),
        },
        ganancias: {
          neta: gananciaNeta,
          margen: margenNeto,
          cogs_total: cogsTotal,
          utilidad_bruta: utilidadBruta,
          utilidad_real: utilidadReal,
        },
        costos_configurados: costosConfigurados,
        rankings: {
          top_productos_cantidad: topProductosCantidad || [],
          top_productos_ingresos: topProductosIngresos || [],
          bottom_productos: bottomProductos || [],
          top_categorias: topCategoriasVentas || [],
          top_dias_semana: ventasDiaSemanaFormateadas.slice(0, 3),
          top_horas: ventasHoraFormateadas.slice(0, 5),
          top_dias_mes: (ventasPorDiaMes || []).slice(0, 5).map((row) => ({
            dia_mes: Number(row.dia_mes),
            total: Number(row.total) || 0,
          })),
        },
        comparacion,
        metodos_pago: {
          efectivo: Number(metodosPago?.efectivo) || 0,
          tarjeta: Number(metodosPago?.tarjeta) || 0,
          transferencia: Number(metodosPago?.transferencia) || 0,
        },
        alertas,
      };

      analyticsCache.set(cacheKey, {
        expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
        data: responsePayload,
      });

      res.json(responsePayload);
    } catch (error) {
      console.error('Error al generar analisis:', error?.message || error);
      res.status(500).json({ error: 'Error al generar el analisis' });
    }
  });
});

app.get('/api/admin/analytics/advanced', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const rango = normalizarRangoAnalisis(req.query?.from ?? req.query?.desde, req.query?.to ?? req.query?.hasta);
    const cacheKey = `${negocioId}:${rango.desde}:${rango.hasta}`;
    const cached = analyticsAdvancedCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const fechaBaseRaw = 'COALESCE(fecha_factura, fecha_cierre, fecha_creacion)';
    const fechaBase = `DATE(${fechaBaseRaw})`;
    const paramsBase = [negocioId, rango.desde, rango.hasta];

    try {
      const metodosPago = await db.get(
        `
          SELECT SUM(pago_efectivo) AS efectivo,
                 SUM(pago_tarjeta) AS tarjeta,
                 SUM(pago_transferencia) AS transferencia
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsBase
      );

      const capitalInicial = await obtenerCapitalInicialPeriodo(negocioId, rango.desde, rango.hasta);
      const costoEstimadoCogs = await obtenerCostoEstimadoCogs(negocioId);
      const ventasPedidosResumen = await db.get(
        `
          SELECT SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsBase
      );
      const ventasDeudasResumen = await db.get(
        `
          SELECT SUM(monto_total) AS total
          FROM clientes_deudas
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );
      const ventasTotal =
        (Number(ventasPedidosResumen?.total) || 0) + (Number(ventasDeudasResumen?.total) || 0);

      const cogsPedidosResumen = await db.get(
        `
          SELECT SUM(cogs_total) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        paramsBase
      );
      const cogsDeudasResumen = await db.get(
        `
          SELECT SUM(
                   COALESCE(dd.cantidad, 0) * COALESCE(
                     NULLIF(p.costo_unitario_real, 0),
                     NULLIF(p.costo_promedio_actual, 0),
                     NULLIF(p.costo_base_sin_itbis, 0),
                     NULLIF(p.ultimo_costo_sin_itbis, 0),
                     0
                   )
                 ) AS total
          FROM clientes_deudas_detalle dd
          JOIN clientes_deudas d ON d.id = dd.deuda_id
          LEFT JOIN productos p ON p.id = dd.producto_id AND p.negocio_id = d.negocio_id
          WHERE d.negocio_id = ?
            AND DATE(d.fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );
      const cogsTotal = (Number(cogsPedidosResumen?.total) || 0) + (Number(cogsDeudasResumen?.total) || 0);

      const costosConfiguradosRow = await db.get(
        `
          SELECT COUNT(1) AS total
          FROM productos
          WHERE negocio_id = ?
            AND (
              COALESCE(costo_unitario_real, 0) > 0
              OR
              COALESCE(costo_base_sin_itbis, 0) > 0
              OR COALESCE(costo_promedio_actual, 0) > 0
              OR COALESCE(ultimo_costo_sin_itbis, 0) > 0
            )
        `,
        [negocioId]
      );
      const costosConfigurados = Number(costosConfiguradosRow?.total) > 0;

      const tipoGastoNormalizadoSql = `
        CASE
          WHEN UPPER(TRIM(COALESCE(tipo_gasto, ''))) IN ('OPERATIVO', 'INVENTARIO', 'RETIRO_CAJA', 'ACTIVO_FIJO') THEN UPPER(TRIM(tipo_gasto))
          WHEN UPPER(TRIM(COALESCE(categoria, ''))) = 'COMPRAS INVENTARIO'
            OR COALESCE(referencia, '') LIKE 'INV-%' THEN 'INVENTARIO'
          WHEN UPPER(TRIM(COALESCE(categoria, ''))) = 'SALIDA_CAJA'
            OR UPPER(TRIM(COALESCE(referencia_tipo, ''))) = 'SALIDA_CAJA' THEN 'RETIRO_CAJA'
          ELSE 'OPERATIVO'
        END
      `;

      const gastosTotalesResumen = await db.get(
        `
          SELECT
            SUM(monto) AS total,
            SUM(CASE WHEN ${tipoGastoNormalizadoSql} = 'OPERATIVO' THEN monto ELSE 0 END) AS total_operativos,
            SUM(CASE WHEN ${tipoGastoNormalizadoSql} = 'INVENTARIO' THEN monto ELSE 0 END) AS total_inventario,
            SUM(CASE WHEN ${tipoGastoNormalizadoSql} = 'RETIRO_CAJA' THEN monto ELSE 0 END) AS total_retiros,
            SUM(CASE WHEN tipo_gasto IS NULL OR TRIM(tipo_gasto) = '' THEN 1 ELSE 0 END) AS cantidad_sin_tipo,
            SUM(CASE WHEN tipo_gasto IS NULL OR TRIM(tipo_gasto) = '' THEN monto ELSE 0 END) AS total_sin_tipo,
            SUM(
              CASE
                WHEN tipo_gasto IS NOT NULL
                  AND TRIM(tipo_gasto) <> ''
                  AND UPPER(TRIM(tipo_gasto)) NOT IN ('OPERATIVO', 'INVENTARIO', 'RETIRO_CAJA', 'ACTIVO_FIJO')
                THEN 1
                ELSE 0
              END
            ) AS cantidad_tipo_invalido,
            SUM(
              CASE
                WHEN tipo_gasto IS NOT NULL
                  AND TRIM(tipo_gasto) <> ''
                  AND UPPER(TRIM(tipo_gasto)) NOT IN ('OPERATIVO', 'INVENTARIO', 'RETIRO_CAJA', 'ACTIVO_FIJO')
                THEN monto
                ELSE 0
              END
            ) AS total_tipo_invalido
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
            AND (estado IS NULL OR estado IN ('APROBADO', 'PAGADO'))
        `,
        paramsBase
      );

      const gastosPeriodoTotal = Number(gastosTotalesResumen?.total) || 0;
      const gastosOperativosTotal = Number(gastosTotalesResumen?.total_operativos) || 0;
      const gastosInventarioTotal = Number(gastosTotalesResumen?.total_inventario) || 0;
      const gastosRetirosTotal = Number(gastosTotalesResumen?.total_retiros) || 0;
      const gastosSinTipoCount = Number(gastosTotalesResumen?.cantidad_sin_tipo) || 0;
      const gastosSinTipoTotal = Number(gastosTotalesResumen?.total_sin_tipo) || 0;
      const gastosTipoInvalidoCount = Number(gastosTotalesResumen?.cantidad_tipo_invalido) || 0;
      const gastosTipoInvalidoTotal = Number(gastosTotalesResumen?.total_tipo_invalido) || 0;
      const utilidadBruta = Number((ventasTotal - cogsTotal).toFixed(2));
      const utilidadNetaReal = Number((utilidadBruta - gastosOperativosTotal).toFixed(2));

      const inventarioStockResumen = await db.get(
        `
          SELECT
            SUM(
              CASE
                WHEN COALESCE(stock_indefinido, 0) = 0
                  AND COALESCE(costo_unitario_real, 0) > 0
                THEN COALESCE(stock, 0) * COALESCE(costo_unitario_real, 0)
                ELSE 0
              END
            ) AS total,
            SUM(
              CASE
                WHEN COALESCE(stock_indefinido, 0) = 0
                  AND COALESCE(costo_unitario_real, 0) > 0
                THEN 1
                ELSE 0
              END
            ) AS cantidad
          FROM productos
          WHERE negocio_id = ?
        `,
        [negocioId]
      );

      const inventarioStockTotal = Number(inventarioStockResumen?.total) || 0;
      const inventarioStockCount = Number(inventarioStockResumen?.cantidad) || 0;
      const inventarioFinalEstimado = Number(
        (inventarioStockCount > 0
          ? inventarioStockTotal
          : capitalInicial.inventario_inicial + gastosInventarioTotal - cogsTotal).toFixed(2)
      );
      const inventarioInicialEstimado =
        inventarioStockCount > 0
          ? Number((inventarioFinalEstimado - gastosInventarioTotal + cogsTotal).toFixed(2))
          : capitalInicial.inventario_inicial;

      const entradasCaja =
        (Number(metodosPago?.efectivo) || 0) +
        (Number(metodosPago?.tarjeta) || 0) +
        (Number(metodosPago?.transferencia) || 0);
      const salidasCaja = Number((gastosOperativosTotal + gastosInventarioTotal + gastosRetirosTotal).toFixed(2));
      const variacionCaja = Number((entradasCaja - salidasCaja).toFixed(2));
      const cajaFinal = Number((capitalInicial.caja_inicial + variacionCaja).toFixed(2));

      const alertas = [];
      if (!capitalInicial?.encontrado) {
        alertas.push({
          nivel: 'warning',
          mensaje:
            inventarioStockCount > 0
              ? 'Configura capital inicial para obtener una caja final mas precisa.'
              : 'Configura capital inicial para obtener un inventario y caja final mas precisos.',
        });
      }
      if (gastosPeriodoTotal > 0 && gastosOperativosTotal === 0) {
        alertas.push({
          nivel: 'warning',
          mensaje:
            'Hay gastos en el periodo pero ninguno clasificado como operativo. Revisa el tipo de gasto para evitar KPIs en cero.',
        });
      }
      if (gastosSinTipoCount > 0) {
        alertas.push({
          nivel: 'warning',
          mensaje: `Se detectaron ${gastosSinTipoCount} gastos sin tipo (RD$${gastosSinTipoTotal.toFixed(
            2
          )}) y se asignaron automaticamente para el analisis.`,
        });
      }
      if (gastosTipoInvalidoCount > 0) {
        alertas.push({
          nivel: 'warning',
          mensaje: `Se detectaron ${gastosTipoInvalidoCount} gastos con tipo invalido (RD$${gastosTipoInvalidoTotal.toFixed(
            2
          )}). Corrige el tipo_gasto para mantener consistencia.`,
        });
      }

      const responsePayload = {
        ok: true,
        rango,
        gastos: {
          total: gastosPeriodoTotal,
          total_operativos: gastosOperativosTotal,
          total_inventario: gastosInventarioTotal,
          total_retiros: gastosRetirosTotal,
        },
        flujo_caja: {
          entradas: Number(entradasCaja) || 0,
          salidas: salidasCaja,
          variacion: variacionCaja,
          caja_inicial: capitalInicial.caja_inicial,
          caja_final: cajaFinal,
          salidas_detalle: {
            operativos: gastosOperativosTotal,
            inventario: gastosInventarioTotal,
            retiros: gastosRetirosTotal,
          },
        },
        inventario: {
          inicial: inventarioInicialEstimado,
          compras: gastosInventarioTotal,
          cogs: cogsTotal,
          final: inventarioFinalEstimado,
          calculado_por_stock: inventarioStockCount > 0,
        },
        ventas_total: ventasTotal,
        cogs_total: cogsTotal,
        utilidad_bruta: utilidadBruta,
        utilidad_neta_real: utilidadNetaReal,
        costos_configurados: costosConfigurados,
        capital_inicial: capitalInicial,
        configuracion: {
          costo_estimado_cogs: costoEstimadoCogs,
        },
        alertas,
      };

      analyticsAdvancedCache.set(cacheKey, {
        expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
        data: responsePayload,
      });

      res.json(responsePayload);
    } catch (error) {
      console.error('Error al generar analisis avanzado:', error?.message || error);
      res.status(500).json({ error: 'Error al generar el analisis avanzado' });
    }
  });
});

app.get('/api/reportes/607', (req, res) => {
  const { anio, mes, formato } = req.query;
  const rango = obtenerRangoMensual(anio, mes);

  if (!rango) {
    return res.status(400).json({ ok: false, error: 'Debe proporcionar un mes y a?o v?lidos' });
  }

  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    const sql = `
    SELECT
      COALESCE(cuenta_id, id) AS factura_id,
      MAX(cliente) AS cliente,
      MAX(cliente_documento) AS cliente_documento,
      MAX(tipo_comprobante) AS tipo_comprobante,
      MAX(ncf) AS ncf,
      SUM(subtotal) AS subtotal,
      SUM(impuesto) AS impuesto,
      SUM(descuento_monto) AS descuento_monto,
      SUM(propina_monto) AS propina_monto,
      MIN(COALESCE(fecha_factura, fecha_cierre, fecha_creacion)) AS fecha_factura
    FROM pedidos
    WHERE estado = 'pagado'
      AND DATE_FORMAT(COALESCE(fecha_factura, fecha_cierre, fecha_creacion), '%Y') = ?
      AND DATE_FORMAT(COALESCE(fecha_factura, fecha_cierre, fecha_creacion), '%m') = ?
      AND negocio_id = ?
    GROUP BY factura_id
    ORDER BY fecha_factura ASC
  `;

    db.all(
      sql,
      [String(anio), String(mes).padStart(2, '0'), negocioId],
      (err, rows) => {
        if (err) {
          console.error('Error al generar reporte 607:', err.message);
          return res.status(500).json({ ok: false, error: 'Error al generar el reporte 607' });
        }

        const datos = rows.map((row) => {
          const subtotal = Number(row.subtotal) || 0;
          const impuesto = Number(row.impuesto) || 0;
          const descuento = Number(row.descuento_monto) || 0;
          const propina = Number(row.propina_monto) || 0;
          const total = subtotal + impuesto - descuento + propina;

          return {
            id: row.id,
            cliente: row.cliente || 'Consumidor final',
            cliente_documento: row.cliente_documento || '00000000000',
            tipo_comprobante: row.tipo_comprobante || 'B02',
            ncf: row.ncf || '',
            fecha_factura: row.fecha_factura,
            monto_gravado: subtotal,
            impuesto,
            descuento,
            propina,
            total,
          };
        });

        if (formato === 'csv') {
          const headers = [
            'fecha_factura',
            'ncf',
            'tipo_comprobante',
            'cliente',
            'cliente_documento',
            'monto_gravado',
            'impuesto',
            'descuento',
            'propina',
            'total',
          ];
          const csv = construirCSV(headers, datos);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="reporte_607_${anio}-${String(mes).padStart(2, '0')}.csv"`
          );
          return res.send(csv);
        }

        const totalFacturas = datos.length;
        const totalMes = datos.reduce((acc, item) => acc + item.total, 0);

        res.json({ ok: true, resumen: { totalFacturas, totalMes }, data: datos });
      }
    );
  });
});

const normalizarAreaHistorial = (valor) => {
  const texto = normalizarCampoTexto(valor) || 'todas';
  const normalizado = texto.toLowerCase();
  if (normalizado === 'cocina' || normalizado === 'bar') return normalizado;
  return 'todas';
};

const tablasHistorialCache = new Map();
const tablaExiste = async (nombreTabla) => {
  if (!nombreTabla) return false;
  if (tablasHistorialCache.has(nombreTabla)) {
    return tablasHistorialCache.get(nombreTabla);
  }
  try {
    const row = await db.get(
      'SELECT 1 AS existe FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
      nombreTabla
    );
    const existe = Boolean(row && row.existe !== undefined);
    tablasHistorialCache.set(nombreTabla, existe);
    return existe;
  } catch (error) {
    console.warn(`No se pudo validar la tabla ${nombreTabla}:`, error?.message || error);
    tablasHistorialCache.set(nombreTabla, false);
    return false;
  }
};

const construirHistorialQuery = ({ table, area, idCol, nombreCol, negocioId, fecha, preparadorId }) => {
  const where = ['negocio_id = ?', 'DATE(created_at) = ?'];
  const params = [negocioId, fecha];

  if (Number.isFinite(preparadorId)) {
    where.push(`${idCol} = ?`);
    params.push(preparadorId);
  }

  const whereSql = where.join(' AND ');
  const selectSql = `
    SELECT id, cuenta_id, pedido_id, item_nombre, cantidad,
           ${idCol} AS preparador_id,
           ${nombreCol} AS preparador_nombre,
           created_at, completed_at,
           '${area}' AS area
    FROM ${table}
    WHERE ${whereSql}
  `;
  const countSql = `SELECT COUNT(1) AS total FROM ${table} WHERE ${whereSql}`;
  return { selectSql, countSql, params };
};

const resolverFiltroPreparador = (query) => {
  const raw =
    query?.user_id ?? query?.preparador_id ?? query?.cocinero_id ?? query?.bartender_id ?? null;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const numero = Number(raw);
  return Number.isFinite(numero) ? numero : null;
};

const obtenerNombreArea = (valor) => (valor === 'bar' ? 'Bar' : 'Cocina');

// Historial de preparacion (cocina + bar)
app.get('/api/preparacion/historial', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    const fecha = (req.query?.fecha || '').slice(0, 10);
    const area = normalizarAreaHistorial(req.query?.area);
    const preparadorId = resolverFiltroPreparador(req.query);
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit) || 50));
    const offset = (page - 1) * limit;
    const limitSafe = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
    const offsetSafe = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Debe especificar la fecha' });
    }

    try {
      const cocinaDisponible = await tablaExiste('historial_cocina');
      const barDisponible = await tablaExiste('historial_bar');

      let total = 0;
      let items = [];

      if (!cocinaDisponible && !barDisponible) {
        return res.json({ ok: true, items: [], total: 0, page, pageSize: limit });
      }

      const cocinaQuery = cocinaDisponible
        ? construirHistorialQuery({
            table: 'historial_cocina',
            area: 'cocina',
            idCol: 'cocinero_id',
            nombreCol: 'cocinero_nombre',
            negocioId,
            fecha,
            preparadorId,
          })
        : null;
      const barQuery = barDisponible
        ? construirHistorialQuery({
            table: 'historial_bar',
            area: 'bar',
            idCol: 'bartender_id',
            nombreCol: 'bartender_nombre',
            negocioId,
            fecha,
            preparadorId,
          })
        : null;

      if (area === 'cocina') {
        if (!cocinaQuery) {
          return res.json({ ok: true, items: [], total: 0, page, pageSize: limit });
        }
        const countRow = await db.get(cocinaQuery.countSql, cocinaQuery.params);
        total = Number(countRow?.total) || 0;
        const dataSql = `${cocinaQuery.selectSql} ORDER BY created_at DESC, id DESC LIMIT ${limitSafe} OFFSET ${offsetSafe}`;
        items = await db.all(dataSql, cocinaQuery.params);
      } else if (area === 'bar') {
        if (!barQuery) {
          return res.json({ ok: true, items: [], total: 0, page, pageSize: limit });
        }
        const countRow = await db.get(barQuery.countSql, barQuery.params);
        total = Number(countRow?.total) || 0;
        const dataSql = `${barQuery.selectSql} ORDER BY created_at DESC, id DESC LIMIT ${limitSafe} OFFSET ${offsetSafe}`;
        items = await db.all(dataSql, barQuery.params);
      } else if (cocinaQuery && barQuery) {
        const countCocina = await db.get(cocinaQuery.countSql, cocinaQuery.params);
        const countBar = await db.get(barQuery.countSql, barQuery.params);
        total = (Number(countCocina?.total) || 0) + (Number(countBar?.total) || 0);
        const dataSql = `
          SELECT *
          FROM (${cocinaQuery.selectSql} UNION ALL ${barQuery.selectSql}) AS historial
          ORDER BY created_at DESC, id DESC
          LIMIT ${limitSafe} OFFSET ${offsetSafe}
        `;
        items = await db.all(dataSql, [...cocinaQuery.params, ...barQuery.params]);
      } else if (cocinaQuery) {
        const countRow = await db.get(cocinaQuery.countSql, cocinaQuery.params);
        total = Number(countRow?.total) || 0;
        const dataSql = `${cocinaQuery.selectSql} ORDER BY created_at DESC, id DESC LIMIT ${limitSafe} OFFSET ${offsetSafe}`;
        items = await db.all(dataSql, cocinaQuery.params);
      } else if (barQuery) {
        const countRow = await db.get(barQuery.countSql, barQuery.params);
        total = Number(countRow?.total) || 0;
        const dataSql = `${barQuery.selectSql} ORDER BY created_at DESC, id DESC LIMIT ${limitSafe} OFFSET ${offsetSafe}`;
        items = await db.all(dataSql, barQuery.params);
      }

      const normalizados = (items || []).map((item) => ({
        ...item,
        area: normalizarAreaHistorial(item.area),
      }));

      res.json({
        ok: true,
        items: normalizados,
        total,
        page,
        pageSize: limitSafe,
      });
    } catch (error) {
      console.error('Error al obtener historial de preparacion:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el historial de preparacion.' });
    }
  });
});

app.put('/api/inventario/compras/:id', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const compraId = Number(req.params.id);
    if (!Number.isInteger(compraId) || compraId <= 0) {
      return res.status(400).json({ error: 'ID invalido.' });
    }

    const proveedor = normalizarCampoTexto(req.body?.proveedor);
    const fecha = req.body?.fecha;
    const origenFondosRaw =
      normalizarCampoTexto(req.body?.origen_fondos ?? req.body?.origenFondos) || 'negocio';
    const origenFondos = normalizarOrigenFondosCompra(origenFondosRaw, 'negocio');
    const metodoPago = normalizarCampoTexto(req.body?.metodo_pago ?? req.body?.metodoPago);
    const observaciones = normalizarCampoTexto(req.body?.observaciones ?? req.body?.comentarios);
    const aplicaItbis = normalizarAplicaItbis(req.body?.aplica_itbis ?? req.body?.aplicaItbis);
    const itbisCapitalizableEntrada = req.body?.itbis_capitalizable ?? req.body?.itbisCapitalizable;
    const itemsEntrada = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!proveedor || !esFechaISOValida(fecha)) {
      return res.status(400).json({ error: 'Proveedor y fecha son obligatorios.' });
    }

    if (!itemsEntrada.length) {
      return res.status(400).json({ error: 'Agrega al menos un producto a la compra.' });
    }

    if (origenFondos === 'caja' && !metodoPago) {
      return res.status(400).json({ error: 'Selecciona el metodo de pago cuando el origen es caja.' });
    }

    const nuevosProductoIds = Array.from(
      new Set(
        itemsEntrada
          .map((item) => Number(item?.producto_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (!nuevosProductoIds.length) {
      return res.status(400).json({ error: 'Selecciona productos validos.' });
    }

    try {
      const compraActual = await db.get(
        `
        SELECT id, origen_fondos, metodo_pago, compra_id, gasto_id, salida_id, itbis_capitalizable
          FROM compras_inventario
         WHERE id = ? AND negocio_id = ?
        `,
        [compraId, negocioId]
      );

      if (!compraActual) {
        return res.status(404).json({ error: 'Compra no encontrada.' });
      }

      const modoInventario = await obtenerModoInventarioCostos(negocioId);
      const esReventa = modoInventario === 'REVENTA';
      const acreditaItbis = await obtenerConfigAcreditaItbis(negocioId);
      const itbisCapitalizableDefault = aplicaItbis ? (acreditaItbis ? 0 : 1) : 0;
      const itbisCapitalizableBase =
        itbisCapitalizableEntrada !== undefined && itbisCapitalizableEntrada !== null
          ? itbisCapitalizableEntrada
          : compraActual.itbis_capitalizable;
      const itbisCapitalizable = aplicaItbis
        ? normalizarFlag(itbisCapitalizableBase ?? itbisCapitalizableDefault, itbisCapitalizableDefault)
        : 0;

      const detallesActuales = await db.all(
        `
        SELECT producto_id, cantidad
          FROM compras_inventario_detalle
         WHERE compra_id = ? AND negocio_id = ?
        `,
        [compraId, negocioId]
      );

      const productoIdsUnion = Array.from(
        new Set([
          ...nuevosProductoIds,
          ...detallesActuales.map((detalle) => Number(detalle?.producto_id)).filter((id) => id > 0),
        ])
      );

      const placeholders = productoIdsUnion.map(() => '?').join(',');
      const productos = await db.all(
        `SELECT id, nombre, stock, stock_indefinido, costo_promedio_actual, ultimo_costo_sin_itbis,
                costo_base_sin_itbis, actualiza_costo_con_compras
           FROM productos WHERE negocio_id = ? AND id IN (${placeholders})`,
        [negocioId, ...productoIdsUnion]
      );
      const productosMap = new Map((productos || []).map((producto) => [Number(producto.id), producto]));

      const detalles = [];
      const costosPorProducto = new Map();
      let subtotal = 0;

      for (const item of itemsEntrada) {
        const productoId = Number(item?.producto_id);
        if (!Number.isFinite(productoId) || productoId <= 0 || !productosMap.has(productoId)) {
          return res.status(400).json({ error: 'Hay productos invalidos en la compra.' });
        }

        const cantidad = normalizarNumero(item?.cantidad, null);
        const costoUnitario = normalizarNumero(
          item?.costo_unitario ?? item?.costoUnitario ?? item?.costo_unitario_sin_itbis ?? item?.costoUnitarioSinItbis,
          null
        );

        if (cantidad === null || cantidad <= 0) {
          return res.status(400).json({ error: 'La cantidad debe ser mayor a 0.' });
        }
        if (costoUnitario === null || costoUnitario < 0) {
          return res.status(400).json({ error: 'El costo unitario debe ser mayor o igual a 0.' });
        }

        const costoUnitarioSinItbis = Number(costoUnitario.toFixed(2));
        const costoUnitarioReal = resolverCostoUnitarioReal(costoUnitarioSinItbis, aplicaItbis);
        const costoUnitarioEfectivo = resolverCostoUnitarioEfectivo(
          costoUnitarioSinItbis,
          aplicaItbis,
          itbisCapitalizable === 1
        );
        const totalLinea = Number((cantidad * costoUnitarioSinItbis).toFixed(2));
        subtotal += totalLinea;
        detalles.push({
          producto_id: productoId,
          cantidad,
          costo_unitario: costoUnitarioSinItbis,
          costo_unitario_sin_itbis: costoUnitarioSinItbis,
          costo_unitario_efectivo: costoUnitarioEfectivo,
          itbis_aplica: aplicaItbis ? 1 : 0,
          itbis_capitalizable: itbisCapitalizable ? 1 : 0,
          total_linea: totalLinea,
        });

        const acumulado = costosPorProducto.get(productoId) || {
          cantidad: 0,
          costo_total_efectivo: 0,
          ultimo_costo_sin_itbis: 0,
          costo_unitario_real: 0,
          costo_unitario_real_incluye_itbis: 0,
        };
        acumulado.cantidad = Number((acumulado.cantidad + cantidad).toFixed(2));
        acumulado.costo_total_efectivo = Number(
          (acumulado.costo_total_efectivo + cantidad * costoUnitarioEfectivo).toFixed(2)
        );
        acumulado.ultimo_costo_sin_itbis = costoUnitarioSinItbis;
        acumulado.costo_unitario_real = costoUnitarioReal;
        acumulado.costo_unitario_real_incluye_itbis = aplicaItbis ? 1 : 0;
        costosPorProducto.set(productoId, acumulado);
      }

      subtotal = Number(subtotal.toFixed(2));
      const { subtotal: subtotalFinal, itbis, total } = calcularTotalesCompraInventario(
        subtotal,
        aplicaItbis
      );

      const cantidadesPrevias = new Map();
      detallesActuales.forEach((detalle) => {
        const productoId = Number(detalle?.producto_id);
        const cantidad = Number(detalle?.cantidad) || 0;
        if (!Number.isFinite(productoId) || productoId <= 0) return;
        const acumulado = cantidadesPrevias.get(productoId) || 0;
        cantidadesPrevias.set(productoId, Number((acumulado + cantidad).toFixed(2)));
      });

      const cantidadesNuevas = new Map();
      detalles.forEach((detalle) => {
        const productoId = Number(detalle?.producto_id);
        const cantidad = Number(detalle?.cantidad) || 0;
        if (!Number.isFinite(productoId) || productoId <= 0) return;
        const acumulado = cantidadesNuevas.get(productoId) || 0;
        cantidadesNuevas.set(productoId, Number((acumulado + cantidad).toFixed(2)));
      });

      const productosParaStock = new Set([...cantidadesPrevias.keys(), ...cantidadesNuevas.keys()]);

      await db.run('BEGIN');

      for (const productoId of productosParaStock) {
        const cantidadPrev = cantidadesPrevias.get(productoId) || 0;
        const cantidadNueva = cantidadesNuevas.get(productoId) || 0;
        const diferencia = Number((cantidadNueva - cantidadPrev).toFixed(2));
        if (diferencia === 0) {
          continue;
        }

        const producto = productosMap.get(productoId);
        if (!producto) {
          throw new Error(`Producto ${productoId} no encontrado.`);
        }
        if (!esStockIndefinido(producto)) {
          const updateResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND negocio_id = ?',
            [diferencia, productoId, negocioId]
          );
          if ((updateResult?.changes || 0) === 0) {
            throw new Error(`No se pudo actualizar el stock del producto ${productoId}.`);
          }
        }
      }

      await db.run(
        'DELETE FROM compras_inventario_detalle WHERE compra_id = ? AND negocio_id = ?',
        [compraId, negocioId]
      );

      for (const detalle of detalles) {
        await db.run(
          `
            INSERT INTO compras_inventario_detalle
              (compra_id, producto_id, cantidad, costo_unitario, costo_unitario_sin_itbis, costo_unitario_efectivo,
               itbis_aplica, itbis_capitalizable, total_linea, negocio_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            compraId,
            detalle.producto_id,
            detalle.cantidad,
            detalle.costo_unitario,
            detalle.costo_unitario_sin_itbis,
            detalle.costo_unitario_efectivo,
            detalle.itbis_aplica,
            detalle.itbis_capitalizable,
            detalle.total_linea,
            negocioId,
          ]
        );
      }

      for (const [productoId, costoData] of costosPorProducto.entries()) {
        const producto = productosMap.get(productoId);
        if (!producto) continue;
        const costoUnitarioReal = Number(costoData.costo_unitario_real) || 0;
        const incluyeItbis = Number(costoData.costo_unitario_real_incluye_itbis) || 0;
        const ultimoCostoSinItbis = Number(costoData.ultimo_costo_sin_itbis) || 0;
        const costoBaseSinItbis = Number(ultimoCostoSinItbis.toFixed(2));
        if (esReventa) {
          await db.run(
            'UPDATE productos SET costo_unitario_real = ?, costo_unitario_real_incluye_itbis = ?, costo_base_sin_itbis = ? WHERE id = ? AND negocio_id = ?',
            [Number(costoUnitarioReal.toFixed(2)), incluyeItbis, costoBaseSinItbis, productoId, negocioId]
          );
          continue;
        }
        const actualizaCosto = Number(producto.actualiza_costo_con_compras ?? 1) === 1;
        const costoPromedioActual = Number(producto.costo_promedio_actual) || 0;
        const cantidadComprada = Number(costoData.cantidad) || 0;
        const costoTotalEfectivo = Number(costoData.costo_total_efectivo) || 0;

        if (actualizaCosto && costoPromedioActual === 0 && cantidadComprada > 0) {
          const nuevoCostoPromedio = costoTotalEfectivo / cantidadComprada;
          await db.run(
            'UPDATE productos SET costo_promedio_actual = ?, ultimo_costo_sin_itbis = ?, costo_base_sin_itbis = ?, costo_unitario_real = ?, costo_unitario_real_incluye_itbis = ? WHERE id = ? AND negocio_id = ?',
            [
              Number(nuevoCostoPromedio.toFixed(2)),
              Number(ultimoCostoSinItbis.toFixed(2)),
              costoBaseSinItbis,
              Number(costoUnitarioReal.toFixed(2)),
              incluyeItbis,
              productoId,
              negocioId,
            ]
          );
        } else {
          await db.run(
            'UPDATE productos SET ultimo_costo_sin_itbis = ?, costo_base_sin_itbis = ?, costo_unitario_real = ?, costo_unitario_real_incluye_itbis = ? WHERE id = ? AND negocio_id = ?',
            [
              Number(ultimoCostoSinItbis.toFixed(2)),
              costoBaseSinItbis,
              Number(costoUnitarioReal.toFixed(2)),
              incluyeItbis,
              productoId,
              negocioId,
            ]
          );
        }
      }

      const compraComentarios = `Compra inventario #${compraId}${observaciones ? ` - ${observaciones}` : ''}`;
      if (compraActual.compra_id) {
        await db.run(
          `
            UPDATE compras
               SET proveedor = ?, fecha = ?, monto_gravado = ?, impuesto = ?, total = ?, comentarios = ?
             WHERE id = ? AND negocio_id = ?
          `,
          [proveedor, fecha, subtotalFinal, itbis, total, compraComentarios, compraActual.compra_id, negocioId]
        );

        await db.run(
          'DELETE FROM detalle_compra WHERE compra_id = ? AND negocio_id = ?',
          [compraActual.compra_id, negocioId]
        );

        for (const detalle of detalles) {
          const producto = productosMap.get(detalle.producto_id);
          const itbisLinea = aplicaItbis ? Number((detalle.total_linea * ITBIS_RATE).toFixed(2)) : 0;
          const totalLinea = Number((detalle.total_linea + itbisLinea).toFixed(2));
          const costoLineaBase = detalle.costo_unitario_sin_itbis ?? detalle.costo_unitario;
          await db.run(
            `
              INSERT INTO detalle_compra
                (compra_id, descripcion, cantidad, precio_unitario, itbis, total, negocio_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              compraActual.compra_id,
              producto?.nombre || `Producto ${detalle.producto_id}`,
              detalle.cantidad,
              costoLineaBase,
              itbisLinea,
              totalLinea,
              negocioId,
            ]
          );
        }
      }

      let gastoId = compraActual.gasto_id || null;
      if (origenFondos === 'aporte_externo') {
        if (gastoId) {
          await db.run('DELETE FROM gastos WHERE id = ? AND negocio_id = ?', [gastoId, negocioId]);
          gastoId = null;
        }
      } else {
        const descripcionGasto = `Compra inventario #${compraId}${observaciones ? ` - ${observaciones}` : ''}`;
        if (gastoId) {
          await db.run(
            `
            UPDATE gastos
               SET fecha = ?, monto = ?, tipo_gasto = ?, origen = ?, metodo_pago = ?, proveedor = ?, descripcion = ?
             WHERE id = ? AND negocio_id = ?
          `,
            [
              fecha,
              total,
              'INVENTARIO',
              'compra',
              metodoPago,
              proveedor,
              descripcionGasto,
              gastoId,
              negocioId,
            ]
          );
        } else {
          const gastoInsert = await db.run(
            `
            INSERT INTO gastos
              (fecha, monto, moneda, categoria, tipo_gasto, origen, metodo_pago, proveedor, descripcion, referencia, es_recurrente, negocio_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              fecha,
              total,
              'DOP',
              'Compras inventario',
              'INVENTARIO',
              'compra',
              metodoPago,
              proveedor,
              descripcionGasto,
              `INV-${compraId}`,
              0,
              negocioId,
            ]
          );
          gastoId = gastoInsert?.lastID || null;
        }
      }

      let salidaId = compraActual.salida_id || null;
      if (origenFondos === 'caja') {
        const descripcionSalida = `Compra inventario #${compraId} - ${proveedor}`;
        if (salidaId) {
          await db.run(
            `
              UPDATE salidas_caja
                 SET fecha = ?, descripcion = ?, monto = ?, metodo = ?
               WHERE id = ? AND negocio_id = ?
            `,
            [fecha, descripcionSalida, total, metodoPago || 'efectivo', salidaId, negocioId]
          );
        } else {
          const salidaInsert = await db.run(
            `
              INSERT INTO salidas_caja (negocio_id, fecha, descripcion, monto, metodo)
              VALUES (?, ?, ?, ?, ?)
            `,
            [negocioId, fecha, descripcionSalida, total, metodoPago || 'efectivo']
          );
          salidaId = salidaInsert?.lastID || null;
        }
      } else if (salidaId) {
        await db.run('DELETE FROM salidas_caja WHERE id = ? AND negocio_id = ?', [salidaId, negocioId]);
        salidaId = null;
      }

      await db.run(
        `
          UPDATE compras_inventario
             SET fecha = ?,
                 proveedor = ?,
                 origen_fondos = ?,
                 metodo_pago = ?,
                 subtotal = ?,
                 itbis = ?,
                 aplica_itbis = ?,
                 itbis_capitalizable = ?,
                 total = ?,
                 observaciones = ?,
                 gasto_id = ?,
                 salida_id = ?
           WHERE id = ? AND negocio_id = ?
        `,
        [
          fecha,
          proveedor,
          origenFondos,
          metodoPago,
          subtotalFinal,
          itbis,
          aplicaItbis ? 1 : 0,
          itbisCapitalizable ? 1 : 0,
          total,
          observaciones,
          gastoId,
          salidaId,
          compraId,
          negocioId,
        ]
      );

      await db.run('COMMIT');
      limpiarCacheAnalitica(negocioId);

      res.json({
        ok: true,
        id: compraId,
        subtotal: subtotalFinal,
        itbis,
        total,
        aplica_itbis: aplicaItbis ? 1 : 0,
        itbis_capitalizable: itbisCapitalizable ? 1 : 0,
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al actualizar compra de inventario:', error?.message || error);
      res.status(500).json({ error: error?.message || 'No se pudo actualizar la compra.' });
    }
  });
});

app.get('/api/preparacion/historial/export', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    const fecha = (req.query?.fecha || '').slice(0, 10);
    const area = normalizarAreaHistorial(req.query?.area);
    const preparadorId = resolverFiltroPreparador(req.query);

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Debe especificar la fecha' });
    }

    try {
      const cocinaDisponible = await tablaExiste('historial_cocina');
      const barDisponible = await tablaExiste('historial_bar');

      let rows = [];

      const cocinaQuery = cocinaDisponible
        ? construirHistorialQuery({
            table: 'historial_cocina',
            area: 'cocina',
            idCol: 'cocinero_id',
            nombreCol: 'cocinero_nombre',
            negocioId,
            fecha,
            preparadorId,
          })
        : null;
      const barQuery = barDisponible
        ? construirHistorialQuery({
            table: 'historial_bar',
            area: 'bar',
            idCol: 'bartender_id',
            nombreCol: 'bartender_nombre',
            negocioId,
            fecha,
            preparadorId,
          })
        : null;

      if (area === 'cocina') {
        if (cocinaQuery) {
          const dataSql = `${cocinaQuery.selectSql} ORDER BY created_at DESC, id DESC`;
          rows = await db.all(dataSql, cocinaQuery.params);
        }
      } else if (area === 'bar') {
        if (barQuery) {
          const dataSql = `${barQuery.selectSql} ORDER BY created_at DESC, id DESC`;
          rows = await db.all(dataSql, barQuery.params);
        }
      } else if (cocinaQuery && barQuery) {
        const dataSql = `
          SELECT *
          FROM (${cocinaQuery.selectSql} UNION ALL ${barQuery.selectSql}) AS historial
          ORDER BY created_at DESC, id DESC
        `;
        rows = await db.all(dataSql, [...cocinaQuery.params, ...barQuery.params]);
      } else if (cocinaQuery) {
        const dataSql = `${cocinaQuery.selectSql} ORDER BY created_at DESC, id DESC`;
        rows = await db.all(dataSql, cocinaQuery.params);
      } else if (barQuery) {
        const dataSql = `${barQuery.selectSql} ORDER BY created_at DESC, id DESC`;
        rows = await db.all(dataSql, barQuery.params);
      }

      const headers = [
        'cuenta',
        'pedido',
        'item',
        'cantidad',
        'area',
        'preparador',
        'entrada',
        'finalizado',
      ];
      const datos = (rows || []).map((r) => ({
        cuenta: r.cuenta_id || '',
        pedido: r.pedido_id || '',
        item: r.item_nombre || '',
        cantidad: r.cantidad || 0,
        area: obtenerNombreArea(normalizarAreaHistorial(r.area)),
        preparador: r.preparador_nombre || '',
        entrada: r.created_at || '',
        finalizado: r.completed_at || '',
      }));

      const csv = construirCSV(headers, datos);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="historial_preparacion_${fecha}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error al exportar historial de preparacion:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo exportar el historial de preparacion.' });
    }
  });
});

app.get('/api/preparacion/historial/preparadores', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ ok: false, error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    const area = normalizarAreaHistorial(req.query?.area);

    try {
      const queries = [];
      const params = [];
      const cocinaDisponible = await tablaExiste('historial_cocina');
      const barDisponible = await tablaExiste('historial_bar');

      if ((area === 'cocina' || area === 'todas') && cocinaDisponible) {
        queries.push(`
          SELECT DISTINCT cocinero_id AS preparador_id, cocinero_nombre AS preparador_nombre
          FROM historial_cocina
          WHERE negocio_id = ? AND cocinero_id IS NOT NULL
        `);
        params.push(negocioId);
      }

      if ((area === 'bar' || area === 'todas') && barDisponible) {
        queries.push(`
          SELECT DISTINCT bartender_id AS preparador_id, bartender_nombre AS preparador_nombre
          FROM historial_bar
          WHERE negocio_id = ? AND bartender_id IS NOT NULL
        `);
        params.push(negocioId);
      }

      if (!queries.length) {
        return res.json({ ok: true, preparadores: [] });
      }

      const rows = await db.all(queries.join(' UNION ALL '), params);
      const mapa = new Map();

      (rows || []).forEach((row) => {
        const id = Number(row.preparador_id);
        if (!Number.isFinite(id)) return;
        const nombre = normalizarCampoTexto(row.preparador_nombre, null) || `ID ${id}`;
        if (!mapa.has(id)) {
          mapa.set(id, { preparador_id: id, preparador_nombre: nombre });
        }
      });

      const preparadores = Array.from(mapa.values()).sort((a, b) =>
        (a.preparador_nombre || '').localeCompare(b.preparador_nombre || '')
      );

      res.json({ ok: true, preparadores });
    } catch (error) {
      console.error('Error al obtener preparadores de historial:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener los preparadores.' });
    }
  });
});

// Historial de cocina
app.get('/api/historial-cocina', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    const fecha = (req.query.fecha || '').slice(0, 10);
    const cocineroId = req.query.cocinero_id ? Number(req.query.cocinero_id) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Debe especificar la fecha' });
    }

    try {
      const where = ['negocio_id = ?', 'DATE(created_at) = ?'];
      const params = [negocioId, fecha];

      if (Number.isFinite(cocineroId)) {
        where.push('cocinero_id = ?');
        params.push(cocineroId);
      }

      const whereSql = where.join(' AND ');

      const countSql = `SELECT COUNT(1) AS total FROM historial_cocina WHERE ${whereSql}`;
      const [countRow] = await db.all(countSql, params);
      const total = Number(countRow?.total) || 0;

      const dataSql = `
        SELECT id, cuenta_id, pedido_id, item_nombre, cantidad, cocinero_id, cocinero_nombre, created_at, completed_at
        FROM historial_cocina
        WHERE ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const items = await db.all(dataSql, params);

      res.json({
        ok: true,
        items: items || [],
        total,
        page,
        pageSize: limit,
      });
    } catch (error) {
      console.error('Error al obtener historial de cocina:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener el historial de cocina.' });
    }
  });
});

app.get('/api/historial-cocina/export', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    const fecha = (req.query.fecha || '').slice(0, 10);
    const cocineroId = req.query.cocinero_id ? Number(req.query.cocinero_id) : null;

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Debe especificar la fecha' });
    }

    try {
      const where = ['negocio_id = ?', 'DATE(created_at) = ?'];
      const params = [negocioId, fecha];
      if (Number.isFinite(cocineroId)) {
        where.push('cocinero_id = ?');
        params.push(cocineroId);
      }
      const whereSql = where.join(' AND ');

      const dataSql = `
        SELECT cuenta_id, pedido_id, item_nombre, cantidad, cocinero_nombre, created_at, completed_at
        FROM historial_cocina
        WHERE ${whereSql}
        ORDER BY created_at DESC, id DESC
      `;
      const rows = await db.all(dataSql, params);
      const headers = ['cuenta', 'pedido', 'item', 'cantidad', 'cocinero', 'entrada', 'finalizado'];
      const datos = (rows || []).map((r) => ({
        cuenta: r.cuenta_id || '',
        pedido: r.pedido_id || '',
        item: r.item_nombre || '',
        cantidad: r.cantidad || 0,
        cocinero: r.cocinero_nombre || '',
        entrada: r.created_at || '',
        finalizado: r.completed_at || '',
      }));
      const csv = construirCSV(headers, datos);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="historial_cocina_${fecha}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error al exportar historial de cocina:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo exportar el historial de cocina.' });
    }
  });
});

app.get('/api/historial-cocina/cocineros', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || usuarioSesion?.negocioId || NEGOCIO_ID_DEFAULT;
    try {
      const rows = await db.all(
        `SELECT DISTINCT cocinero_id, cocinero_nombre
           FROM historial_cocina
          WHERE negocio_id = ? AND cocinero_id IS NOT NULL
          ORDER BY cocinero_nombre IS NULL, cocinero_nombre ASC`,
        [negocioId]
      );
      res.json({ ok: true, cocineros: rows || [] });
    } catch (error) {
      console.error('Error al obtener cocineros de historial:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener los cocineros.' });
    }
  });
});

app.get('/api/reportes/606', (req, res) => {
  const { anio, mes, formato } = req.query;
  const rango = obtenerRangoMensual(anio, mes);

  if (!rango) {
    return res.status(400).json({ ok: false, error: 'Debe proporcionar un mes y a?o v?lidos' });
  }

  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    const sql = `
      SELECT id, proveedor, rnc, fecha, tipo_comprobante, ncf, monto_gravado, impuesto, monto_exento, total, estado
      FROM compras
      WHERE estado != 'anulado'
        AND DATE_FORMAT(fecha, '%Y') = ?
        AND DATE_FORMAT(fecha, '%m') = ?
        AND negocio_id = ?
      ORDER BY fecha ASC
    `;

    db.all(sql, [String(anio), String(mes).padStart(2, '0'), negocioId], (err, rows) => {
    if (err) {
      console.error('Error al generar reporte 606:', err.message);
      return res.status(500).json({ ok: false, error: 'Error al generar el reporte 606' });
    }

    const datos = rows.map((row) => ({
      id: row.factura_id,
      proveedor: row.proveedor,
      rnc: row.rnc || '',
      tipo_comprobante: row.tipo_comprobante || '',
      ncf: row.ncf || '',
      fecha: row.fecha,
      monto_gravado: Number(row.monto_gravado) || 0,
      impuesto: Number(row.impuesto) || 0,
      monto_exento: Number(row.monto_exento) || 0,
      total: Number(row.total) || 0,
      estado: row.estado,
    }));

    if (formato === 'csv') {
      const headers = [
        'fecha',
        'proveedor',
        'rnc',
        'tipo_comprobante',
        'ncf',
        'monto_gravado',
        'impuesto',
        'monto_exento',
        'total',
        'estado',
      ];
      const csv = construirCSV(headers, datos);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_606_${anio}-${String(mes).padStart(2, '0')}.csv"`
      );
      return res.send(csv);
    }

    const totalFacturas = datos.length;
    const totalMes = datos.reduce((acc, item) => acc + item.total, 0);

    res.json({ ok: true, resumen: { totalFacturas, totalMes }, data: datos });
  });
  });
});

app.post('/api/notas-credito/ventas', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const { pedido_id, fecha, motivo, monto, ncf_nota, ncf_referencia } = req.body || {};
    const montoValor = normalizarNumero(monto, null);

    if (!pedido_id || montoValor === null || montoValor <= 0) {
      return res
        .status(400)
        .json({ ok: false, error: 'El pedido y el monto de la nota de cr?dito son obligatorios' });
    }

    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) {
        console.error('Error al iniciar nota de cr?dito de venta:', beginErr.message);
        return res.status(500).json({ ok: false, error: 'Error al registrar la nota de cr?dito' });
      }

      const finalizarError = (mensaje, errorObj) => {
        if (errorObj) {
          console.error(mensaje, errorObj.message);
        } else {
          console.error(mensaje);
        }
        db.run('ROLLBACK', (rollbackErr) => {
          if (rollbackErr) {
            console.error('Error al revertir nota de cr?dito:', rollbackErr.message);
          }
          res.status(500).json({ ok: false, error: mensaje });
        });
      };

      db.get(
        'SELECT id, ncf FROM pedidos WHERE id = ? AND negocio_id = ?',
        [pedido_id, negocioId],
        (pedidoErr, pedido) => {
          if (pedidoErr) {
            return finalizarError('Error al consultar el pedido para la nota de cr?dito', pedidoErr);
          }

          if (!pedido) {
            db.run('ROLLBACK', () => {
              res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
            });
            return;
          }

          const insertSql = `
        INSERT INTO notas_credito_ventas (pedido_id, fecha, motivo, monto, ncf_nota, ncf_referencia)
        VALUES (?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?)
      `;
          db.run(
            insertSql,
            [
              pedido_id,
              fecha,
              normalizarCampoTexto(motivo, null),
              montoValor,
              ncf_nota || null,
              ncf_referencia || pedido.ncf || null,
            ],
            function (notaErr) {
              if (notaErr) {
                return finalizarError('Error al registrar la nota de cr?dito', notaErr);
              }

              const notaId = this.lastID;
              const updateSql = `
            UPDATE pedidos
            SET estado_comprobante = 'nota_credito',
                nota_credito_referencia = ?
            WHERE id = ? AND negocio_id = ?
          `;

              db.run(updateSql, [notaId, pedido_id, negocioId], (updateErr) => {
                if (updateErr) {
                  return finalizarError('Error al actualizar el pedido con la nota de cr?dito', updateErr);
                }

                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    return finalizarError('Error al confirmar la nota de cr?dito', commitErr);
                  }

                  res.status(201).json({
                    ok: true,
                    nota_credito: {
                      id: notaId,
                      pedido_id,
                      monto: montoValor,
                      ncf_nota: ncf_nota || null,
                      ncf_referencia: ncf_referencia || pedido.ncf || null,
                    },
                  });
                });
              });
            }
          );
        }
      );
    });
  });
});

app.post('/api/notas-credito/compras', (req, res) => {
  const { compra_id, fecha, motivo, monto, ncf_nota, ncf_referencia } = req.body || {};
  const montoValor = normalizarNumero(monto, null);

  if (!compra_id || montoValor === null || montoValor <= 0) {
    return res
      .status(400)
      .json({ ok: false, error: 'La compra y el monto de la nota de cr?dito son obligatorios' });
  }

  db.run('BEGIN TRANSACTION', (beginErr) => {
    if (beginErr) {
      console.error('Error al iniciar nota de cr?dito de compra:', beginErr.message);
      return res.status(500).json({ ok: false, error: 'Error al registrar la nota de cr?dito' });
    }

    const finalizarError = (mensaje, errorObj) => {
      if (errorObj) {
        console.error(mensaje, errorObj.message);
      } else {
        console.error(mensaje);
      }
      db.run('ROLLBACK', (rollbackErr) => {
        if (rollbackErr) {
          console.error('Error al revertir nota de cr?dito de compra:', rollbackErr.message);
        }
        res.status(500).json({ ok: false, error: mensaje });
      });
    };

    db.get('SELECT id, ncf FROM compras WHERE id = ?', [compra_id], (compraErr, compra) => {
      if (compraErr) {
        return finalizarError('Error al consultar la compra para la nota de cr?dito', compraErr);
      }

      if (!compra) {
        db.run('ROLLBACK', () => {
          res.status(404).json({ ok: false, error: 'Compra no encontrada' });
        });
        return;
      }

      const insertSql = `
        INSERT INTO notas_credito_compras (compra_id, fecha, motivo, monto, ncf_nota, ncf_referencia)
        VALUES (?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?)
      `;

      db.run(
        insertSql,
        [
          compra_id,
          fecha,
          normalizarCampoTexto(motivo, null),
          montoValor,
          ncf_nota || null,
          ncf_referencia || compra.ncf || null,
        ],
        function (notaErr) {
          if (notaErr) {
            return finalizarError('Error al registrar la nota de cr?dito', notaErr);
          }

          const notaId = this.lastID;
          const updateSql = `
            UPDATE compras
            SET estado = 'nota_credito',
                nota_credito_referencia = ?
            WHERE id = ?
          `;

          db.run(updateSql, [notaId, compra_id], (updateErr) => {
            if (updateErr) {
              return finalizarError('Error al actualizar la compra con la nota de cr?dito', updateErr);
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                return finalizarError('Error al confirmar la nota de cr?dito de compra', commitErr);
              }

              res.status(201).json({
                ok: true,
                nota_credito: {
                  id: notaId,
                  compra_id,
                  monto: montoValor,
                  ncf_nota: ncf_nota || null,
                  ncf_referencia: ncf_referencia || compra.ncf || null,
                },
              });
            });
          });
        }
      );
    });
  });
});

app.get('/api/cotizaciones', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { fecha_desde, fecha_hasta, estado, q } = req.query || {};
    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const filtros = ['negocio_id = ?'];
    const params = [usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT];

    if (fecha_desde) {
      filtros.push('date(fecha_creacion) >= date(?)');
      params.push(fecha_desde);
    }

    if (fecha_hasta) {
      filtros.push('date(fecha_creacion) <= date(?)');
      params.push(fecha_hasta);
    }

    if (estado && estado !== 'todos') {
      const estadoNormalizado = normalizarEstadoCotizacion(estado);
      filtros.push('estado = ?');
      params.push(estadoNormalizado);
    }

    if (q) {
      const termino = `%${q.toLowerCase()}%`;
      filtros.push(
        '(LOWER(cliente_nombre) LIKE ? OR LOWER(codigo) LIKE ? OR LOWER(cliente_contacto) LIKE ? OR LOWER(cliente_documento) LIKE ?)'
      );
      params.push(termino, termino, termino, termino);
    }

    const whereClause = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const listadoSql = `
    SELECT id, codigo, cliente_nombre, cliente_documento, cliente_contacto, fecha_creacion, fecha_validez,
           estado, subtotal, impuesto, descuento_monto, descuento_porcentaje, total, pedido_id
    FROM cotizaciones
    ${whereClause}
    ORDER BY fecha_creacion DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

    db.all(listadoSql, params, (err, rows) => {
      if (err) {
        console.error('Error al obtener cotizaciones:', err.message);
        return res.status(500).json({ error: 'Error al obtener cotizaciones' });
      }

      const procesadas = (rows || []).map((row) => {
        const copia = { ...row };
        marcarVencidaSiAplica(copia);
        return copia;
      });

      const conteoSql = `SELECT COUNT(1) AS total FROM cotizaciones ${whereClause}`;
      db.get(conteoSql, params, (countErr, countRow) => {
        if (countErr) {
          console.error('Error al obtener cotizaciones:', countErr.message);
          return res.status(500).json({ error: 'Error al obtener cotizaciones' });
        }

        res.json({
          ok: true,
          cotizaciones: procesadas,
          total: countRow?.total || 0,
          page,
          limit,
        });
      });
    });
  });
});

app.get('/api/cotizaciones/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    db.get(
      `SELECT id, codigo, cliente_nombre, cliente_documento, cliente_contacto, fecha_creacion, fecha_validez,
            estado, subtotal, impuesto, descuento_monto, descuento_porcentaje, total, notas_internas,
            notas_cliente, creada_por, pedido_id
     FROM cotizaciones
     WHERE id = ? AND negocio_id = ?`,
      [id, negocioId],
      (err, cotizacion) => {
        if (err) {
          console.error('Error al obtener cotizaci\u00f3n:', err.message);
          return res.status(500).json({ error: 'Error al obtener la cotizaci\u00f3n' });
        }

        if (!cotizacion) {
          return res.status(404).json({ error: 'Cotizaci\u00f3n no encontrada' });
        }

        marcarVencidaSiAplica(cotizacion, () => {});

        const itemsSql = `
        SELECT ci.id, ci.producto_id, ci.descripcion, ci.cantidad, ci.precio_unitario,
               ci.descuento_porcentaje, ci.descuento_monto, ci.subtotal_linea, ci.impuesto_linea,
               ci.total_linea, p.nombre AS producto_nombre
        FROM cotizacion_items ci
        LEFT JOIN productos p ON p.id = ci.producto_id AND p.negocio_id = ?
        WHERE ci.cotizacion_id = ? AND ci.negocio_id = ?
        ORDER BY ci.id ASC
      `;

        db.all(itemsSql, [negocioId, id, negocioId], (itemsErr, items) => {
          if (itemsErr) {
            console.error('Error al obtener detalle de cotizaci\u00f3n:', itemsErr.message);
            return res.status(500).json({ error: 'Error al obtener la cotizaci\u00f3n' });
          }

          const itemsCalculados = (items || []).map((item) => {
            const cantidad = Number(item.cantidad) || 0;
            const precio = Number(item.precio_unitario) || 0;
            const subtotalBruto = cantidad * precio;
            const descPct = Number(item.descuento_porcentaje) || 0;
            const descMonto = Number(item.descuento_monto) || 0;
            const cantidadAplicada = Math.min(
              cantidad,
              Number(item.cantidad_descuento || item.cantidad || 0)
            );
            const proporcional = cantidad > 0 ? Math.max(cantidadAplicada, 0) / cantidad : 1;
            const descuentoTotal = Math.min(
              subtotalBruto * (descPct / 100) * proporcional + descMonto,
              subtotalBruto
            );
            const totalLinea =
              Number(item.total_linea || item.subtotal_linea) || subtotalBruto - descuentoTotal;
            return {
              ...item,
              subtotal_sin_descuento: subtotalBruto,
              descuento_total: descuentoTotal,
              total_linea: totalLinea,
            };
          });

          res.json({ ok: true, cotizacion, items: itemsCalculados || [] });
        });
      }
    );
  });
});

app.post('/api/cotizaciones', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const payload = req.body || {};
    const estadoInicial = normalizarEstadoCotizacion(payload.estado, 'borrador');
    const clienteNombre = limpiarTextoGeneral(payload.cliente_nombre);
    const clienteDocumento = limpiarTextoGeneral(payload.cliente_documento);
    const clienteContacto = limpiarTextoGeneral(payload.cliente_contacto);
    const fechaValidez = payload.fecha_validez || null;
    const notasInternas = limpiarTextoGeneral(payload.notas_internas);
    const notasCliente = limpiarTextoGeneral(payload.notas_cliente);
    const itemsEntrada = Array.isArray(payload.items) ? payload.items : [];
    const creadaPor = usuarioSesion?.id || null;
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    obtenerImpuestoConfigurado(negocioId, (configErr, impuestoAplicado) => {
      if (configErr) {
        console.error('Error al obtener impuesto configurado:', configErr.message);
        return res.status(500).json({ error: 'Error al crear la cotizaci\u00f3n' });
      }

      const totales = calcularTotalesCotizacion(
        itemsEntrada,
        impuestoAplicado,
        payload.descuento_porcentaje,
        payload.descuento_monto
      );

      if (totales?.error) {
        return res.status(400).json({ error: totales.error });
      }

      db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          console.error('No se pudo iniciar la cotizaci\u00f3n:', beginErr.message);
          return res.status(500).json({ error: 'Error al crear la cotizaci\u00f3n' });
        }

        const rollback = (mensaje, errorObj) => {
          if (errorObj) {
            console.error(mensaje, errorObj.message);
          } else {
            console.error(mensaje);
          }
          db.run('ROLLBACK', (rollbackErr) => {
            if (rollbackErr) {
              console.error('Error al revertir cotizaci\u00f3n:', rollbackErr.message);
            }
            res.status(500).json({ error: mensaje });
          });
        };

        const insertarItems = (cotizacionId, callback) => {
          if (!totales.items?.length) {
            callback(null);
            return;
          }

          const stmt = db.prepare(
            `INSERT INTO cotizacion_items (
              cotizacion_id, producto_id, descripcion, cantidad, precio_unitario,
              descuento_porcentaje, descuento_monto, subtotal_linea, impuesto_linea, total_linea, negocio_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );

          const insertarFila = (indice) => {
            if (indice >= totales.items.length) {
              return stmt.finalize((finalizeErr) => callback(finalizeErr || null));
            }

            const item = totales.items[indice];
            stmt.run(
              [
                cotizacionId,
                item.producto_id,
                item.descripcion,
                item.cantidad,
                item.precio_unitario,
                item.descuento_porcentaje,
                item.descuento_monto,
                item.subtotal_linea,
                item.impuesto_linea,
                item.total_linea,
                negocioId,
              ],
              (itemErr) => {
                if (itemErr) {
                  return stmt.finalize(() => callback(itemErr));
                }
                insertarFila(indice + 1);
              }
            );
          };

          insertarFila(0);
        };

        const confirmar = (cotizacionId, codigoGenerado) => {
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              return rollback('Error al confirmar la cotizaci\u00f3n', commitErr);
            }

            res.status(201).json({
              ok: true,
              cotizacion: {
                id: cotizacionId,
                codigo: codigoGenerado,
                cliente_nombre: clienteNombre,
                cliente_documento: clienteDocumento,
                cliente_contacto: clienteContacto,
                fecha_validez: fechaValidez,
                estado: estadoInicial,
                subtotal: totales.subtotal,
                descuento_monto: totales.descuento_global,
                descuento_porcentaje: totales.descuento_porcentaje,
                impuesto: totales.impuesto,
                total: totales.total,
                notas_internas: notasInternas,
                notas_cliente: notasCliente,
                creada_por: creadaPor,
                negocio_id: negocioId,
              },
              items: totales.items,
            });
          });
        };

        const insertarCotizacion = (codigoGenerado, intento = 0) => {
          const insertSql = `
            INSERT INTO cotizaciones (
              codigo, cliente_nombre, cliente_documento, cliente_contacto, fecha_validez, estado,
              subtotal, impuesto, descuento_monto, descuento_porcentaje, total, notas_internas,
              notas_cliente, creada_por, negocio_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(
            insertSql,
            [
              codigoGenerado,
              clienteNombre,
              clienteDocumento,
              clienteContacto,
              fechaValidez || null,
              estadoInicial,
              totales.subtotal,
              totales.impuesto,
              totales.descuento_global,
              totales.descuento_porcentaje,
              totales.total,
              notasInternas,
              notasCliente,
              creadaPor,
              negocioId,
            ],
            function (insertErr) {
              if (insertErr?.message?.includes('UNIQUE') && intento < 3) {
                return generarCodigoCotizacion(negocioId, (regenErr, nuevoCodigo) => {
                  if (regenErr) {
                    return rollback('No se pudo generar el c\u00f3digo de cotizaci\u00f3n', regenErr);
                  }
                  insertarCotizacion(nuevoCodigo, intento + 1);
                });
              }

              if (insertErr) {
                return rollback('Error al guardar la cotizaci\u00f3n', insertErr);
              }

              const cotizacionId = this.lastID;
              insertarItems(cotizacionId, (itemsErr) => {
                if (itemsErr) {
                  return rollback('Error al guardar los items de la cotizaci\u00f3n', itemsErr);
                }
                confirmar(cotizacionId, codigoGenerado);
              });
            }
          );
        };

        generarCodigoCotizacion(negocioId, (codigoErr, codigoGenerado) => {
          if (codigoErr) {
            return rollback('No se pudo generar el c\u00f3digo de cotizaci\u00f3n', codigoErr);
          }
          insertarCotizacion(codigoGenerado);
        });
      });
    });
  });
});

app.put('/api/cotizaciones/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const payload = req.body || {};
    const estadoSolicitud = payload.estado;
    const clienteNombre = limpiarTextoGeneral(payload.cliente_nombre);
    const clienteDocumento = limpiarTextoGeneral(payload.cliente_documento);
    const clienteContacto = limpiarTextoGeneral(payload.cliente_contacto);
    const fechaValidez = payload.fecha_validez || null;
    const notasInternas = limpiarTextoGeneral(payload.notas_internas);
    const notasCliente = limpiarTextoGeneral(payload.notas_cliente);
    const itemsEntrada = Array.isArray(payload.items) ? payload.items : [];
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    obtenerImpuestoConfigurado(negocioId, (configErr, impuestoAplicado) => {
      if (configErr) {
        console.error('Error al obtener impuesto configurado:', configErr.message);
        return res.status(500).json({ error: 'Error al actualizar la cotizaci\u00f3n' });
      }

      const totales = calcularTotalesCotizacion(
        itemsEntrada,
        impuestoAplicado,
        payload.descuento_porcentaje,
        payload.descuento_monto
      );

      if (totales?.error) {
        return res.status(400).json({ error: totales.error });
      }

      db.get(
        'SELECT id, codigo, estado, pedido_id FROM cotizaciones WHERE id = ? AND negocio_id = ?',
        [id, negocioId],
        (err, cotizacion) => {
          if (err) {
            console.error('Error al obtener cotizaci\u00f3n:', err.message);
            return res.status(500).json({ error: 'Error al actualizar estado de cotizaci\u00f3n' });
          }

          if (!cotizacion) {
            return res.status(404).json({ error: 'Cotizaci\u00f3n no encontrada' });
          }

          if (cotizacion.pedido_id) {
            return res.status(400).json({ error: 'No se puede editar una cotizaci\u00f3n ya facturada' });
          }

          const nuevoEstado = estadoSolicitud || cotizacion.estado;

          db.run(
            `UPDATE cotizaciones
             SET cliente_nombre = ?, cliente_documento = ?, cliente_contacto = ?,
                 fecha_validez = ?, notas_internas = ?, notas_cliente = ?, estado = ?,
                 subtotal = ?, impuesto = ?, descuento_monto = ?, descuento_porcentaje = ?, total = ?
             WHERE id = ? AND negocio_id = ?`,
            [
              clienteNombre,
              clienteDocumento,
              clienteContacto,
              fechaValidez,
              notasInternas,
              notasCliente,
              nuevoEstado,
              totales.subtotal,
              totales.impuesto,
              totales.descuento_global,
              totales.descuento_porcentaje,
              totales.total,
              id,
              negocioId,
            ],
            function (updateErr) {
              if (updateErr) {
                console.error('Error al actualizar la cotizaci\u00f3n:', updateErr.message);
                return res.status(500).json({ error: 'Error al actualizar la cotizaci\u00f3n' });
              }

              db.run('DELETE FROM cotizacion_items WHERE cotizacion_id = ? AND negocio_id = ?', [id, negocioId], (delErr) => {
                if (delErr) {
                  console.error('Error al limpiar items de cotizaci\u00f3n:', delErr.message);
                  return res.status(500).json({ error: 'Error al actualizar la cotizaci\u00f3n' });
                }

                const stmt = db.prepare(
                  `INSERT INTO cotizacion_items (
                    cotizacion_id, producto_id, descripcion, cantidad, precio_unitario,
                    descuento_porcentaje, descuento_monto, subtotal_linea, impuesto_linea, total_linea, negocio_id
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );

                const insertarItem = (indice) => {
                  if (indice >= totales.items.length) {
                    return stmt.finalize((finalizeErr) => {
                      if (finalizeErr) {
                        console.error('Error al finalizar inserci\u00f3n de items:', finalizeErr.message);
                        return res.status(500).json({ error: 'Error al actualizar la cotizaci\u00f3n' });
                      }

                      res.json({ ok: true, estado: nuevoEstado, totales });
                    });
                  }

                  const item = totales.items[indice];
                  stmt.run(
                    [
                      id,
                      item.producto_id,
                      item.descripcion,
                      item.cantidad,
                      item.precio_unitario,
                      item.descuento_porcentaje,
                      item.descuento_monto,
                      item.subtotal_linea,
                      item.impuesto_linea,
                      item.total_linea,
                      negocioId,
                    ],
                    (itemErr) => {
                      if (itemErr) {
                        console.error('Error al insertar item de cotizaci\u00f3n:', itemErr.message);
                        return stmt.finalize(() =>
                          res.status(500).json({ error: 'Error al actualizar la cotizaci\u00f3n' })
                        );
                      }
                      insertarItem(indice + 1);
                    }
                  );
                };

                insertarItem(0);
              });
            }
          );
        }
      );
    });
  });
});

app.put('/api/cotizaciones/:id/estado', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const nuevoEstado = normalizarEstadoCotizacion(req.body?.estado);
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    if (!nuevoEstado || nuevoEstado === 'facturada') {
      return res.status(400).json({ error: 'Estado de cotizaci\u00f3n no v\u00e1lido' });
    }

    db.get('SELECT estado, pedido_id FROM cotizaciones WHERE id = ? AND negocio_id = ?', [id, negocioId], (err, cotizacion) => {
      if (err) {
        console.error('Error al obtener cotizaci\u00f3n:', err.message);
        return res.status(500).json({ error: 'Error al actualizar estado de cotizaci\u00f3n' });
      }

      if (!cotizacion) {
        return res.status(404).json({ error: 'Cotizaci\u00f3n no encontrada' });
      }

      if (cotizacion.estado === 'facturada' || cotizacion.pedido_id) {
        return res.status(400).json({ error: 'La cotizaci\u00f3n ya fue facturada' });
      }

      db.run('UPDATE cotizaciones SET estado = ? WHERE id = ? AND negocio_id = ?', [nuevoEstado, id, negocioId], function (updateErr) {
        if (updateErr) {
          console.error('Error al actualizar estado de cotizaci\u00f3n:', updateErr.message);
          return res.status(500).json({ error: 'Error al actualizar estado de cotizaci\u00f3n' });
        }

        res.json({ ok: true, estado: nuevoEstado });
      });
    });
  });
});

app.post('/api/cotizaciones/:id/facturar', (req, res) => {
  const { id } = req.params;

  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioIdFactura = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    try {
      const cotizacion = await db.get(
        `SELECT id, codigo, cliente_nombre, cliente_documento, cliente_contacto, fecha_validez, estado,
                subtotal, impuesto, descuento_monto, descuento_porcentaje, total, notas_internas, notas_cliente,
                creada_por, pedido_id
           FROM cotizaciones
          WHERE id = ? AND negocio_id = ?`,
        [id, negocioIdFactura]
      );

      if (!cotizacion) {
        return res.status(404).json({ error: 'Cotizaci?n no encontrada' });
      }

      if (cotizacion.pedido_id || cotizacion.estado === 'facturada') {
        return res.status(400).json({ error: 'La cotizaci?n ya fue facturada' });
      }

      if (['borrador', 'enviada'].includes(cotizacion.estado) && esCotizacionVencida(cotizacion)) {
        marcarVencidaSiAplica(cotizacion, () => {});
        return res.status(400).json({ error: 'La cotizaci?n est? vencida' });
      }

      if (cotizacion.estado !== 'aceptada') {
        return res.status(400).json({ error: 'Solo se pueden facturar cotizaciones aceptadas' });
      }

      const itemsSql = `
        SELECT ci.id, ci.producto_id, ci.descripcion, ci.cantidad, ci.precio_unitario,
               ci.descuento_porcentaje, ci.descuento_monto, ci.subtotal_linea, ci.impuesto_linea, ci.total_linea,
               p.stock AS stock_producto, p.stock_indefinido, p.tipo_producto, p.insumo_vendible,
               p.contenido_por_unidad, p.unidad_base, p.nombre AS producto_nombre
          FROM cotizacion_items ci
          LEFT JOIN productos p ON p.id = ci.producto_id AND p.negocio_id = ?
         WHERE ci.cotizacion_id = ? AND ci.negocio_id = ?
      `;

      const items = await db.all(itemsSql, [negocioIdFactura, id, negocioIdFactura]);
      if (!items || !items.length) {
        return res.status(400).json({ error: 'La cotizaci?n no tiene productos para facturar' });
      }

      const modoInventario = await obtenerModoInventarioCostos(negocioIdFactura);
      const usaRecetas = modoInventario === 'PREPARACION';
      const bloquearInsumosSinStock = usaRecetas ? await obtenerConfigBloqueoInsumos(negocioIdFactura) : false;
      const advertenciasInsumos = [];

      const itemsProcesados = [];
      for (const item of items) {
        if (!item?.producto_id) {
          return res.status(400).json({ error: 'Todos los items deben estar vinculados a un producto para facturar' });
        }
        const cantidad = normalizarNumero(item.cantidad, 0);
        if (cantidad <= 0) {
          return res.status(400).json({ error: 'Hay items sin cantidad v?lida en la cotizaci?n' });
        }
        const tipoProducto = normalizarTipoProducto(item.tipo_producto, 'FINAL');
        const insumoVendible = normalizarFlag(item.insumo_vendible, 0) === 1;
        if (usaRecetas && tipoProducto === 'INSUMO' && !insumoVendible) {
          return res.status(400).json({
            error: `El producto ${item.producto_nombre || item.producto_id} es un insumo no vendible.`,
          });
        }
        const esIndefinido = esStockIndefinido({ stock_indefinido: item.stock_indefinido });
        if (!esIndefinido) {
          const stockDisponible = normalizarNumero(item.stock_producto, 0);
          if (cantidad > stockDisponible) {
            return res.status(400).json({
              error: `Stock insuficiente para el producto ${item.producto_id}. Disponible: ${stockDisponible}`,
            });
          }
        }
        itemsProcesados.push({
          producto_id: Number(item.producto_id),
          cantidad,
          producto_nombre: item.producto_nombre,
          tipo_producto: tipoProducto,
          insumo_vendible: insumoVendible ? 1 : 0,
        });
      }

      const productoIds = itemsProcesados
        .map((item) => Number(item.producto_id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const recetasMap = usaRecetas ? await obtenerRecetasPorProductos(productoIds, negocioIdFactura) : new Map();
      const insumosMap = new Map();
      const consumoPorInsumo = new Map();
      const consumosPorIndice = new Map();

      if (usaRecetas && recetasMap.size > 0) {
        itemsProcesados.forEach((item, index) => {
          const receta = recetasMap.get(item.producto_id);
          if (!Array.isArray(receta) || receta.length === 0) {
            return;
          }
          const consumos = [];
          receta.forEach((detalle) => {
            if (detalle.tipo_producto !== 'INSUMO') {
              return;
            }
            const cantidadBase = Number((item.cantidad * (Number(detalle.cantidad) || 0)).toFixed(4));
            if (!cantidadBase) {
              return;
            }
            const contenido = normalizarContenidoPorUnidad(detalle.contenido_por_unidad, 1);
            const cantidadUnidades = contenido > 0 ? Number((cantidadBase / contenido).toFixed(4)) : 0;
            consumos.push({
              insumo_id: Number(detalle.insumo_id),
              cantidad_base: cantidadBase,
              cantidad_unidades: cantidadUnidades,
              unidad_base: detalle.unidad_base,
            });
            const acumulado = consumoPorInsumo.get(detalle.insumo_id) || 0;
            consumoPorInsumo.set(detalle.insumo_id, Number((acumulado + cantidadUnidades).toFixed(4)));
            if (!insumosMap.has(detalle.insumo_id)) {
              insumosMap.set(detalle.insumo_id, detalle);
            }
          });
          if (consumos.length) {
            consumosPorIndice.set(index, consumos);
          }
        });

        for (const [insumoId, cantidadRequerida] of consumoPorInsumo.entries()) {
          if (!cantidadRequerida) continue;
          const insumo = insumosMap.get(insumoId);
          if (!insumo || esStockIndefinido(insumo)) {
            continue;
          }
          const stockDisponible = Number(insumo.stock) || 0;
          if (cantidadRequerida > stockDisponible) {
            const mensaje = `Stock insuficiente para insumo ${insumo.insumo_nombre || insumoId}.`;
            if (bloquearInsumosSinStock) {
              return res.status(400).json({ error: mensaje });
            }
            advertenciasInsumos.push(mensaje);
          }
        }
      }

      const impuestoAplicado = Number(await obtenerImpuestoConfiguradoAsync(negocioIdFactura)) || 0;
      const totales = calcularTotalesCotizacion(
        items,
        impuestoAplicado,
        cotizacion.descuento_porcentaje,
        cotizacion.descuento_monto
      );

      if (totales?.error) {
        return res.status(400).json({ error: totales.error });
      }

      await db.run('BEGIN');

      const fechaListo = formatearFechaHoraMySQL(new Date());
      const insertPedidoSql = `
        INSERT INTO pedidos (
          cuenta_id, mesa, cliente, modo_servicio, nota, estado, subtotal, impuesto, total,
          descuento_porcentaje, descuento_monto, cliente_documento, fecha_listo, creado_por, comentarios,
          negocio_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertPedido = await db.run(insertPedidoSql, [
        null,
        null,
        cotizacion.cliente_nombre || null,
        'en_local',
        cotizacion.notas_cliente || null,
        'listo',
        totales.subtotal,
        totales.impuesto,
        totales.total,
        cotizacion.descuento_porcentaje || 0,
        totales.descuento_global,
        cotizacion.cliente_documento || null,
        fechaListo,
        cotizacion.creada_por || null,
        cotizacion.notas_internas || null,
        negocioIdFactura,
      ]);

      const pedidoId = insertPedido?.lastID;
      if (!pedidoId) {
        throw new Error('No se pudo crear el pedido desde la cotizaci?n');
      }

      await db.run('UPDATE pedidos SET cuenta_id = COALESCE(cuenta_id, ?) WHERE id = ? AND negocio_id = ?', [
        pedidoId,
        pedidoId,
        negocioIdFactura,
      ]);

      const consumoRegistros = [];

      for (let index = 0; index < totales.items.length; index += 1) {
        const item = totales.items[index];
        const detalleResult = await db.run(
          `INSERT INTO detalle_pedido (
            pedido_id, producto_id, cantidad, precio_unitario, descuento_porcentaje, descuento_monto, negocio_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            pedidoId,
            item.producto_id,
            item.cantidad,
            item.precio_unitario,
            item.descuento_porcentaje,
            item.descuento_monto,
            negocioIdFactura,
          ]
        );

        const detalleId = detalleResult?.lastID;
        const consumos = consumosPorIndice.get(index);
        if (detalleId && Array.isArray(consumos)) {
          consumos.forEach((consumo) => {
            consumoRegistros.push({
              detalle_pedido_id: detalleId,
              producto_final_id: item.producto_id,
              insumo_id: consumo.insumo_id,
              cantidad_base: consumo.cantidad_base,
              unidad_base: consumo.unidad_base,
            });
          });
        }

        const itemOriginal = items[index];
        const esIndefinido = esStockIndefinido({ stock_indefinido: itemOriginal?.stock_indefinido });
        if (!esIndefinido) {
          const stockResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
            [item.cantidad, item.producto_id, negocioIdFactura, item.cantidad]
          );
          if (stockResult.changes === 0) {
            throw new Error('Error al actualizar stock de productos');
          }
        }
      }

      if (usaRecetas && consumoPorInsumo.size > 0) {
        for (const [insumoId, cantidadUnidades] of consumoPorInsumo.entries()) {
          if (!cantidadUnidades) continue;
          const insumo = insumosMap.get(insumoId);
          if (!insumo || esStockIndefinido(insumo)) {
            continue;
          }
          const stockResult = await db.run(
            'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
            [cantidadUnidades, insumoId, negocioIdFactura, cantidadUnidades]
          );
          if (stockResult.changes === 0) {
            throw new Error(`No se pudo actualizar stock del insumo ${insumoId}`);
          }
        }

        for (const consumo of consumoRegistros) {
          await db.run(
            `INSERT INTO consumo_insumos
              (pedido_id, detalle_pedido_id, producto_final_id, insumo_id, cantidad_base, unidad_base, negocio_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              pedidoId,
              consumo.detalle_pedido_id,
              consumo.producto_final_id,
              consumo.insumo_id,
              consumo.cantidad_base,
              consumo.unidad_base,
              negocioIdFactura,
            ]
          );
        }
      }

      await db.run("UPDATE cotizaciones SET estado = 'facturada', pedido_id = ? WHERE id = ? AND negocio_id = ?", [
        pedidoId,
        id,
        negocioIdFactura,
      ]);

      await db.run('COMMIT');

      res.status(201).json({
        ok: true,
        pedido: {
          id: pedidoId,
          cuenta_id: pedidoId,
          estado: 'listo',
          subtotal: totales.subtotal,
          impuesto: totales.impuesto,
          total: totales.total,
          descuento_porcentaje: cotizacion.descuento_porcentaje || 0,
          descuento_monto: totales.descuento_global,
          cliente: cotizacion.cliente_nombre || null,
          cliente_documento: cotizacion.cliente_documento || null,
          fecha_listo: fechaListo,
        },
        advertencias: advertenciasInsumos.length ? advertenciasInsumos : undefined,
      });
    } catch (error) {
      await db.run('ROLLBACK').catch(() => {});
      console.error('Error al facturar la cotizaci?n:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Error al facturar la cotizaci?n' });
    }
  });
});

// Chat interno
app.get('/api/chat/rooms', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    try {
      const filtros = {
        tipo: req.query?.tipo || null,
        nombre: req.query?.nombre || req.query?.q || null,
      };
      const rooms = await listarSalasChat(usuarioSesion, filtros);
      res.json({ ok: true, rooms });
    } catch (error) {
      console.error('Error al listar salas de chat:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener las salas de chat' });
    }
  });
});

app.get('/api/chat/messages', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const roomId = Number(req.query?.room_id ?? req.query?.roomId);
    const page = Number(req.query?.pagina ?? req.query?.page ?? 1) || 1;
    const limit = Number(req.query?.limite ?? req.query?.limit ?? CHAT_PAGE_SIZE) || CHAT_PAGE_SIZE;

    if (!roomId) {
      return res.status(400).json({ ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        const statusCode = acceso.status || 403;
        return res.status(statusCode).json({ ok: false, error: acceso.error });
      }

      const { mensajes, hasMore } = await obtenerMensajesDeSala({
        roomId: acceso.room.id,
        negocioId: acceso.room.negocio_id,
        usuarioActualId: usuarioSesion.id,
        page,
        limit,
      });

      res.json({
        ok: true,
        room: acceso.room,
        mensajes,
        pagina: page,
        limite: limit,
        has_more: hasMore,
      });
    } catch (error) {
      console.error('Error al obtener mensajes de chat:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron cargar los mensajes' });
    }
  });
});

app.post('/api/chat/messages/read', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const roomId = Number(req.body?.room_id ?? req.body?.roomId);
    const lastVisibleMessageId = Number(req.body?.last_visible_message_id ?? req.body?.lastVisibleMessageId);

    if (!roomId || !lastVisibleMessageId) {
      return res.status(400).json({ ok: false, error: 'room_id y last_visible_message_id son obligatorios' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        const statusCode = acceso.status || 403;
        return res.status(statusCode).json({ ok: false, error: acceso.error });
      }

      const resultado = await marcarMensajesComoLeidos({
        roomId: acceso.room.id,
        negocioId: acceso.room.negocio_id,
        usuarioId: usuarioSesion.id,
        lastVisibleMessageId,
      });

      if (!resultado.ok) {
        return res.status(500).json({ ok: false, error: resultado.error || 'No se pudieron marcar las lecturas' });
      }

      emitirLecturas({
        roomId: acceso.room.id,
        usuarioId: usuarioSesion.id,
        lastReadMessageId: lastVisibleMessageId,
      });

      res.json({ ok: true, last_read_message_id: lastVisibleMessageId });
    } catch (error) {
      console.error('Error al marcar mensajes leidos:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron marcar los mensajes como leidos' });
    }
  });
});

app.post('/api/chat/messages', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const roomId = Number(req.body?.room_id ?? req.body?.roomId);
    const contenido = req.body?.contenido ?? '';
    const tipo = req.body?.tipo || 'text';

    if (!roomId) {
      return res.status(400).json({ ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        const statusCode = acceso.status || 403;
        return res.status(statusCode).json({ ok: false, error: acceso.error });
      }

      const mensaje = await crearMensaje({
        room: acceso.room,
        usuarioSesion,
        contenido,
        tipo,
      });

      if (!mensaje) {
        return res.status(500).json({ ok: false, error: 'No se pudo guardar el mensaje' });
      }

      emitirNuevoMensaje(mensaje);
      res.status(201).json({ ok: true, mensaje });
    } catch (error) {
      console.error('Error al crear mensaje de chat:', error?.message || error);
      const statusCode = error?.status || 500;
      res.status(statusCode).json({ ok: false, error: error?.message || 'No se pudo enviar el mensaje' });
    }
  });
});

app.post('/api/chat/rooms/private', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const usuarioObjetivoId = Number(req.body?.usuario_id ?? req.body?.usuarioId);

    if (!usuarioObjetivoId) {
      return res.status(400).json({ ok: false, error: 'usuario_id es obligatorio' });
    }

    try {
      const room = await obtenerSalaPrivada(usuarioSesion, usuarioObjetivoId);
      res.status(201).json({ ok: true, room });
    } catch (error) {
      const statusCode = error?.status || 500;
      const mensaje = error?.message || 'No se pudo crear el chat privado';
      if (statusCode >= 500) {
        console.error('Error al crear chat privado:', error?.message || error);
      }
      res.status(statusCode).json({ ok: false, error: mensaje });
    }
  });
});

app.patch('/api/chat/messages/:id/pin', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const messageId = Number(req.params?.id);
    const isPinnedRaw = req.body?.is_pinned ?? req.body?.isPinned;
    const isPinned =
      typeof isPinnedRaw === 'boolean' ? isPinnedRaw : ['1', 'true', 1, 'on'].includes(isPinnedRaw);

    if (!messageId) {
      return res.status(400).json({ ok: false, error: 'Mensaje no especificado' });
    }

    if (isPinnedRaw === undefined) {
      return res.status(400).json({ ok: false, error: 'Falta el estado is_pinned' });
    }

    try {
      const mensajeConSala = await obtenerMensajeConSala(messageId);
      if (!mensajeConSala) {
        return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
      }

      const negocioIdUsuario = obtenerNegocioIdUsuario(usuarioSesion);
      if (Number(mensajeConSala.room_negocio_id) !== Number(negocioIdUsuario)) {
        return res.status(403).json({ ok: false, error: 'No puedes modificar mensajes de otro negocio' });
      }

      const acceso = await validarAccesoSala(mensajeConSala.room_id, usuarioSesion);
      if (acceso?.error) {
        const statusCode = acceso.status || 403;
        return res.status(statusCode).json({ ok: false, error: acceso.error });
      }

      if (!acceso.puedeAdministrar) {
        return res.status(403).json({ ok: false, error: 'No tienes permisos para fijar mensajes' });
      }

      await db.run(
        'UPDATE chat_messages SET is_pinned = ? WHERE id = ? AND room_id = ? AND negocio_id = ?',
        [isPinned ? 1 : 0, messageId, mensajeConSala.room_id, mensajeConSala.room_negocio_id]
      );

      const payload = { id: messageId, room_id: mensajeConSala.room_id, is_pinned: isPinned ? 1 : 0 };
      emitirPinMensaje(mensajeConSala.room_id, payload);
      res.json({ ok: true, ...payload });
    } catch (error) {
      console.error('Error al fijar mensaje de chat:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el mensaje fijado' });
    }
  });
});

app.post('/api/chat/rooms/:id/clear', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const roomId = Number(req.params?.id);
    if (!roomId) {
      return res.status(400).json({ ok: false, error: 'Sala no especificada' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        const statusCode = acceso.status || 403;
        return res.status(statusCode).json({ ok: false, error: acceso.error });
      }

      if (!acceso.puedeAdministrar) {
        return res.status(403).json({ ok: false, error: 'No tienes permisos para vaciar el chat' });
      }

      await db.run(
        'UPDATE chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE room_id = ? AND negocio_id = ? AND deleted_at IS NULL',
        [acceso.room.id, acceso.room.negocio_id]
      );

      emitirChatVaciado(acceso.room.id, usuarioSesion.id);
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al vaciar el chat:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo vaciar el chat' });
    }
  });
});

app.get('/api/chat/mentions/users', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = obtenerNegocioIdUsuario(usuarioSesion);
    const filtro = (req.query?.q || req.query?.busqueda || req.query?.search || '').trim();

    const condiciones = ['negocio_id = ?', 'activo = 1'];
    const params = [negocioId];

    if (filtro) {
      condiciones.push('(nombre LIKE ? OR usuario LIKE ?)');
      params.push(`%${filtro}%`, `%${filtro}%`);
    }

    try {
      const usuarios = await db.all(
        `SELECT id, nombre, usuario, rol
           FROM usuarios
          WHERE ${condiciones.join(' AND ')}
          ORDER BY nombre ASC`,
        params
      );

      res.json({ ok: true, usuarios: usuarios || [] });
    } catch (error) {
      console.error('Error al listar usuarios para menciones:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron obtener los usuarios para menciones' });
    }
  });
});

app.get('/api/chat/messages/search', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const roomId = Number(req.query?.room_id ?? req.query?.roomId);
    const termino = req.query?.q || '';
    const usuarioId = req.query?.usuario_id ? Number(req.query.usuario_id) : null;
    const fechaDesde = req.query?.fecha_desde || null;
    const fechaHasta = req.query?.fecha_hasta || null;
    const pagina = Number(req.query?.pagina ?? req.query?.page ?? 1) || 1;

    if (!roomId) {
      return res.status(400).json({ ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        const statusCode = acceso.status || 403;
        return res.status(statusCode).json({ ok: false, error: acceso.error });
      }

      const mensajes = await buscarMensajesEnSala({
        roomId: acceso.room.id,
        negocioId: acceso.room.negocio_id,
        q: termino,
        usuarioId,
        fechaDesde,
        fechaHasta,
        page: pagina,
      });

      res.json({ ok: true, resultados: mensajes || [] });
    } catch (error) {
      console.error('Error buscando mensajes en sala:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudieron buscar mensajes en el chat' });
    }
  });
});

app.post('/api/public/registro', async (req, res) => {
  const payload = req.body || {};

  const negocioNombre = normalizarCampoTexto(payload.negocio_nombre ?? payload.negocioNombre);
  const adminNombre = normalizarCampoTexto(payload.admin_nombre ?? payload.adminNombre);
  const adminUsuario = normalizarCampoTexto(payload.admin_usuario ?? payload.adminUsuario)?.toLowerCase();
  const adminPassword = normalizarCampoTexto(payload.admin_password ?? payload.adminPassword);
  const negocioTipo = normalizarTipoNegocioRegistro(payload.negocio_tipo ?? payload.negocioTipo);
  const telefono = normalizarCampoTexto(payload.telefono);
  const email = normalizarCampoTexto(payload.email);
  const ciudad = normalizarCampoTexto(payload.ciudad);
  const cantidadUsuarios = normalizarCantidadUsuariosRegistro(
    payload.cantidad_usuarios ?? payload.cantidadUsuarios ?? payload.usuarios_estimados
  );

  const usaCocina = normalizarBooleanRegistro(payload.usa_cocina ?? payload.usaCocina ?? payload.tiene_cocina, false);
  const usaDelivery = normalizarBooleanRegistro(payload.usa_delivery ?? payload.usaDelivery ?? payload.tiene_delivery, false);
  const usaBar = normalizarBooleanRegistro(payload.usa_bar ?? payload.usaBar, false);

  if (!negocioNombre || !adminNombre || !adminUsuario || !adminPassword) {
    return res.status(400).json({
      ok: false,
      error: 'Completa negocio, nombre admin, usuario admin y password para registrarte.',
    });
  }

  if (adminPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'La password del admin debe tener al menos 6 caracteres.' });
  }

  try {
    const usuarioExistentePrevio = await usuariosRepo.findByUsuario(adminUsuario);
    if (usuarioExistentePrevio) {
      return res.status(409).json({
        ok: false,
        error: 'El usuario admin ya existe. Usa otro usuario para el registro.',
      });
    }

    const recomendacion = recomendarModulosRegistro({
      tipoNegocio: negocioTipo,
      usaCocina,
      usaDelivery,
      usaBar,
      cantidadUsuarios,
    });

    const modulosEntrada =
      payload.modulos_solicitados ?? payload.modulosSolicitados ?? payload.modulos ?? payload.modulos_requeridos ?? [];
    let modulosSolicitados = resolverModulosSolicitadosRegistro(modulosEntrada, recomendacion.keys);
    const kdsSolicitado = normalizarBooleanRegistro(payload.modulo_kds ?? payload.kds, false);
    if (kdsSolicitado && !modulosSolicitados.includes('kds') && moduloRegistroDisponible('kds')) {
      modulosSolicitados.push('kds');
    }

    modulosSolicitados = modulosSolicitados.filter((item) => item !== 'facturacion_electronica');

    const passwordHash = await hashPasswordIfNeeded(adminPassword);
    const configModulosNegocio = construirConfigModulosRegistro({
      modulosSolicitados,
      usaCocina,
      usaDelivery,
      usaBar,
    });
    const configModulosJson = stringifyConfigModulos(configModulosNegocio);
    const codigo = generarCodigoRegistroSolicitud();
    const slugNegocio = await generarSlugRegistroUnico(negocioNombre);
    const temaBase = await obtenerTemaBaseRegistro();
    const empresaId = (await resolverEmpresaId({ empresaNombre: negocioNombre })) || 1;
    const ahora = new Date();
    const limitePago = new Date(ahora.getTime() + REGISTRO_PAGO_HORAS * 60 * 60 * 1000);

    const respuestas = {
      tipo_negocio: negocioTipo,
      usa_cocina: usaCocina,
      usa_delivery: usaDelivery,
      usa_bar: usaBar,
      cantidad_usuarios: cantidadUsuarios,
      canal_pago: 'whatsapp_o_correo',
      facturacion_electronica_disponible: false,
      usuario_listo: true,
    };

    let negocioId = null;
    let adminUsuarioId = null;
    let solicitudId = null;

    await db.run('BEGIN');
    try {
      const negocioInsert = await db.run(
        `INSERT INTO negocios (
           nombre, slug, color_primario, color_secundario, color_texto, color_header,
           color_boton_primario, color_boton_secundario, color_boton_peligro,
           config_modulos, admin_principal_correo, logo_url, titulo_sistema, activo, empresa_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          negocioNombre,
          slugNegocio,
          temaBase.colorPrimario,
          temaBase.colorSecundario,
          temaBase.colorTexto,
          temaBase.colorHeader,
          temaBase.colorBotonPrimario,
          temaBase.colorBotonSecundario,
          temaBase.colorBotonPeligro,
          configModulosJson,
          email || null,
          temaBase.logoUrl || null,
          temaBase.tituloSistema || 'POSIUM',
          empresaId,
        ]
      );
      negocioId = negocioInsert?.lastID || null;
      if (!negocioId) {
        throw new Error('No se pudo crear el negocio del registro.');
      }

      const usuarioInsert = await db.run(
        `INSERT INTO usuarios (
           nombre, usuario, password, rol, activo, negocio_id, empresa_id, es_super_admin, force_password_change, password_reset_at
         ) VALUES (?, ?, ?, 'admin', 1, ?, ?, 0, 0, NULL)`,
        [adminNombre, adminUsuario, passwordHash, negocioId, empresaId]
      );
      adminUsuarioId = usuarioInsert?.lastID || null;
      if (!adminUsuarioId) {
        throw new Error('No se pudo crear el usuario admin del registro.');
      }

      await db.run(
        'UPDATE negocios SET admin_principal_usuario_id = ?, admin_principal_correo = ? WHERE id = ?',
        [adminUsuarioId, email || null, negocioId]
      );

      const solicitudInsert = await db.run(
        `INSERT INTO registro_solicitudes (
           codigo, negocio_nombre, negocio_id, negocio_slug, negocio_tipo,
           admin_nombre, admin_usuario, admin_usuario_id, admin_password_hash,
           telefono, email, ciudad, cantidad_usuarios, usa_cocina, usa_delivery, modulo_kds,
           modulos_solicitados_json, modulos_recomendados_json, respuestas_json,
           estado, estado_pago_limite, notas_publicas, correo_enviado, correo_error
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [
          codigo,
          negocioNombre,
          negocioId,
          slugNegocio,
          negocioTipo,
          adminNombre,
          adminUsuario,
          adminUsuarioId,
          passwordHash,
          telefono,
          email,
          ciudad,
          cantidadUsuarios,
          usaCocina ? 1 : 0,
          usaDelivery ? 1 : 0,
          modulosSolicitados.includes('kds') ? 1 : 0,
          JSON.stringify(modulosSolicitados),
          JSON.stringify(recomendacion.keys),
          JSON.stringify(respuestas),
          'pendiente_pago',
          limitePago,
          'Usuario habilitado. Enviar comprobante de pago por WhatsApp o correo dentro de 24 horas.',
        ]
      );
      solicitudId = solicitudInsert?.lastID || null;
      if (!solicitudId) {
        throw new Error('No se pudo guardar la solicitud de registro.');
      }

      await db.run('COMMIT');
    } catch (txError) {
      await db.run('ROLLBACK').catch(() => {});
      throw txError;
    }

    const row =
      (solicitudId && (await db.get('SELECT * FROM registro_solicitudes WHERE id = ? LIMIT 1', [solicitudId]))) ||
      null;

    const registro = mapRegistroSolicitud(
      row || {
        id: solicitudId,
        codigo,
        negocio_nombre: negocioNombre,
        negocio_id: negocioId,
        negocio_slug: slugNegocio,
        negocio_tipo: negocioTipo,
        admin_nombre: adminNombre,
        admin_usuario: adminUsuario,
        admin_usuario_id: adminUsuarioId,
        telefono,
        email,
        ciudad,
        cantidad_usuarios: cantidadUsuarios,
        usa_cocina: usaCocina ? 1 : 0,
        usa_delivery: usaDelivery ? 1 : 0,
        modulo_kds: modulosSolicitados.includes('kds') ? 1 : 0,
        modulos_solicitados_json: JSON.stringify(modulosSolicitados),
        modulos_recomendados_json: JSON.stringify(recomendacion.keys),
        respuestas_json: JSON.stringify(respuestas),
        estado: 'pendiente_pago',
        estado_pago_limite: limitePago,
        created_at: ahora,
      }
    );

    const correoResultado = await enviarCorreoRegistroSolicitud(registro);
    await db.run(
      'UPDATE registro_solicitudes SET correo_enviado = ?, correo_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [correoResultado.enviado ? 1 : 0, correoResultado.error || null, solicitudId]
    );

    registro.correo_enviado = correoResultado.enviado;
    registro.correo_error = correoResultado.error || null;

    res.status(201).json({
      ok: true,
      solicitud: registro,
      acceso: {
        login_url: '/login.html',
        usuario: adminUsuario,
        negocio_id: negocioId,
        negocio_slug: slugNegocio,
      },
      recomendaciones: {
        modulos: recomendacion.keys,
        etiquetas: recomendacion.labels,
      },
      mensaje:
        'Registro completado. Tu usuario admin ya esta listo para usarse. Tienes 24 horas para realizar el pago y enviar el comprobante por WhatsApp o correo.',
      facturacion_electronica_disponible: false,
    });
  } catch (error) {
    console.error('Error creando solicitud de registro publico:', error?.message || error);
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, error: 'No se pudo completar el registro por datos duplicados.' });
    }
    res.status(500).json({ ok: false, error: 'No se pudo completar el registro. Intenta nuevamente.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contrasena son obligatorios' });
  }

  let row;
  try {
    row = await usuariosRepo.findByUsuario(usuario);
  } catch (err) {
    console.error('Error al buscar usuario:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Error al iniciar sesion' });
  }

  if (!row) {
    return res.status(400).json({ ok: false, error: 'Usuario no encontrado' });
  }

  if (!row.activo) {
    return res.status(403).json({ ok: false, error: 'El usuario esta inactivo' });
  }

  let negocioId = row.negocio_id || NEGOCIO_ID_DEFAULT;
  const passwordValido = await verificarPassword(password, row.password);
  if (!passwordValido) {
    return res.status(400).json({ ok: false, error: 'Contrasena incorrecta' });
  }

  if (row.rol === 'empresa') {
    const empresaId = row.empresa_id;
    if (!empresaId) {
      return res.status(403).json({ ok: false, error: 'El usuario empresa no tiene empresa asignada.' });
    }
    if (!row.negocio_id) {
      const negocioEmpresa = await db.get(
        'SELECT id FROM negocios WHERE empresa_id = ? AND deleted_at IS NULL AND activo = 1 LIMIT 1',
        [empresaId]
      );
      if (!negocioEmpresa?.id) {
        return res.status(403).json({ ok: false, error: 'No hay sucursales activas para esta empresa.' });
      }
      negocioId = negocioEmpresa.id;
    }
  }

  const estadoNegocio = await validarEstadoNegocio(negocioId);
  if (!estadoNegocio.ok) {
    return res
      .status(estadoNegocio.status || 403)
      .json({ ok: false, error: estadoNegocio.error, motivo_suspension: estadoNegocio.motivo_suspension });
  }

    const configModulosLogin = await obtenerConfigModulosNegocio(negocioId);
    if (row.rol === 'bar' && configModulosLogin.bar === false) {
      return res.status(403).json({ ok: false, error: 'El modulo de Bar esta desactivado para este negocio.' });
    }
    if (row.rol === 'delivery' && configModulosLogin.delivery === false) {
      return res
        .status(403)
        .json({ ok: false, error: 'El modulo de Delivery esta desactivado para este negocio.' });
    }
    if (row.rol === 'vendedor' && configModulosLogin.mostrador === false) {
      return res
        .status(403)
        .json({ ok: false, error: 'El modulo de Mostrador esta desactivado para este negocio.' });
    }

  cerrarSesionesExpiradas(row.id, () => {
    cerrarSesionesActivasDeUsuario(row.id, () => {
      const token = generarTokenSesion();
      const esSuperAdminUsuario = !!row.es_super_admin;
      db.run(
        'INSERT INTO sesiones_usuarios (usuario_id, token, user_agent, ip, ultimo_uso, cerrado_en, negocio_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, ?)',
        [row.id, token, req.get('user-agent') || '', req.ip || '', negocioId],
        (insertErr) => {
          if (insertErr) {
            console.error('Error al registrar sesion:', insertErr.message);
            return res.status(500).json({ ok: false, error: 'Error al iniciar sesion' });
          }

          res.json({
            ok: true,
            rol: row.rol,
            id: row.id,
            nombre: row.nombre,
            usuario: row.usuario,
            negocio_id: negocioId,
            empresa_id: row.empresa_id ?? null,
            es_super_admin: esSuperAdminUsuario,
            activo: row.activo,
            force_password_change: !!row.force_password_change,
            token,
          });
        }
      );
    });
  });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-session-token'] || req.body?.token;
  const usuarioId = req.body?.usuario_id;

  const finalizar = () => res.json({ ok: true });

  const cerrarPorUsuario = () => {
    if (!usuarioId) {
      return finalizar();
    }

    cerrarSesionesActivasDeUsuario(usuarioId, (cerrarErr) => {
      if (cerrarErr) {
        console.error('Error al cerrar sesiones por usuario:', cerrarErr.message);
        return res.status(500).json({ ok: false, error: 'No se pudo cerrar la sesion' });
      }
      finalizar();
    });
  };

  if (!token) {
    return cerrarPorUsuario();
  }

  cerrarSesionPorToken(token, (err, cambios) => {
    if (err) {
      console.error('Error al cerrar sesion:', err.message);
      return res.status(500).json({ ok: false, error: 'No se pudo cerrar la sesion' });
    }

    if (cambios === 0) {
      return cerrarPorUsuario();
    }

    finalizar();
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no existe.' });
});

app.use((err, req, res, next) => {
  const status = err?.status || err?.statusCode || 500;
  const payload = {
    ok: false,
    error: err?.message || 'Error del servidor.',
  };
  const ruta = req?.originalUrl || '';
  if (ruta.startsWith('/api')) {
    return res.status(status).json(payload);
  }
  return res.status(status).send(payload.error);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('Preparando para escuchar en el puerto...', { HOST, PORT });

const server = http.createServer(app);
io = new Server(server, {
  cors: {
    origin: '*',
  },
});

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.['x-session-token'] ||
      socket.handshake?.query?.token;
    const usuarioSesion = await obtenerUsuarioSesionPorToken(token);
    if (!usuarioSesion) {
      return next(new Error('UNAUTHORIZED'));
    }
    if (usuarioSesion.force_password_change) {
      return next(new Error('FORCE_PASSWORD_CHANGE'));
    }
    const estado = await validarEstadoNegocio(usuarioSesion.negocio_id);
    if (!estado.ok) {
      return next(new Error('NEGOCIO_BLOQUEADO'));
    }
    socket.data.usuarioSesion = usuarioSesion;
    next();
  } catch (error) {
    console.error('Error autenticando socket:', error?.message || error);
    next(error);
  }
});

io.on('connection', (socket) => {
  const usuarioSesion = socket.data?.usuarioSesion;
  const safeAck = (ack, payload) => {
    if (typeof ack === 'function') {
      ack(payload);
    }
  };

  socket.on('joinRoom', async (payload = {}, ack) => {
    const roomId = Number(payload?.room_id ?? payload?.roomId ?? payload);
    if (!roomId) {
      return safeAck(ack, { ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        return safeAck(ack, { ok: false, status: acceso.status || 403, error: acceso.error });
      }
      socket.join(getChatRoomChannel(roomId));
      safeAck(ack, { ok: true, room: acceso.room });
    } catch (error) {
      console.error('Error al unirse a sala via socket:', error?.message || error);
      safeAck(ack, { ok: false, error: 'No se pudo unir a la sala' });
    }
  });

  socket.on('leaveRoom', (payload = {}) => {
    const roomId = Number(payload?.room_id ?? payload?.roomId ?? payload);
    if (roomId) {
      socket.leave(getChatRoomChannel(roomId));
    }
  });

  const procesarLecturasSocket = async (payload = {}, ack) => {
    const roomId = Number(payload?.room_id ?? payload?.roomId);
    const lastVisibleMessageId = Number(payload?.last_visible_message_id ?? payload?.lastVisibleMessageId);

    if (!roomId || !lastVisibleMessageId) {
      return safeAck(ack, { ok: false, error: 'Parametros incompletos' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        return safeAck(ack, { ok: false, status: acceso.status || 403, error: acceso.error });
      }

      const resultado = await marcarMensajesComoLeidos({
        roomId: acceso.room.id,
        negocioId: acceso.room.negocio_id,
        usuarioId: usuarioSesion.id,
        lastVisibleMessageId,
      });

      if (!resultado.ok) {
        return safeAck(ack, { ok: false, error: resultado.error || 'No se pudieron marcar las lecturas' });
      }

      emitirLecturas({
        roomId: acceso.room.id,
        usuarioId: usuarioSesion.id,
        lastReadMessageId: lastVisibleMessageId,
      });

      safeAck(ack, { ok: true, last_read_message_id: lastVisibleMessageId });
    } catch (error) {
      console.error('Error marcando lecturas via socket:', error?.message || error);
      safeAck(ack, { ok: false, error: 'No se pudo marcar como leido' });
    }
  };

  socket.on('messages:read', procesarLecturasSocket);

  socket.on('typing:start', async (payload = {}, ack) => {
    const roomId = Number(payload?.room_id ?? payload?.roomId ?? payload);
    if (!roomId) {
      return safeAck(ack, { ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        return safeAck(ack, { ok: false, status: acceso.status || 403, error: acceso.error });
      }

      socket.to(getChatRoomChannel(roomId)).emit(CHAT_SOCKET_EVENTS.TYPING, {
        room_id: roomId,
        usuario_id: usuarioSesion.id,
        nombre: usuarioSesion.nombre || usuarioSesion.usuario,
        typing: true,
      });
      safeAck(ack, { ok: true });
    } catch (error) {
      console.error('Error enviando typing start:', error?.message || error);
      safeAck(ack, { ok: false, error: 'No se pudo notificar typing' });
    }
  });

  socket.on('typing:stop', async (payload = {}, ack) => {
    const roomId = Number(payload?.room_id ?? payload?.roomId ?? payload);
    if (!roomId) {
      return safeAck(ack, { ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        return safeAck(ack, { ok: false, status: acceso.status || 403, error: acceso.error });
      }

      socket.to(getChatRoomChannel(roomId)).emit(CHAT_SOCKET_EVENTS.TYPING, {
        room_id: roomId,
        usuario_id: usuarioSesion.id,
        nombre: usuarioSesion.nombre || usuarioSesion.usuario,
        typing: false,
      });
      safeAck(ack, { ok: true });
    } catch (error) {
      console.error('Error enviando typing stop:', error?.message || error);
      safeAck(ack, { ok: false, error: 'No se pudo notificar typing' });
    }
  });

  socket.on('message:new', async (payload = {}, ack) => {
    const roomId = Number(payload?.room_id ?? payload?.roomId);
    const contenido = payload?.contenido ?? '';
    const tipo = payload?.tipo || 'text';

    if (!roomId) {
      return safeAck(ack, { ok: false, error: 'room_id es obligatorio' });
    }

    try {
      const acceso = await validarAccesoSala(roomId, usuarioSesion);
      if (acceso?.error) {
        return safeAck(ack, { ok: false, status: acceso.status || 403, error: acceso.error });
      }

      const mensaje = await crearMensaje({ room: acceso.room, usuarioSesion, contenido, tipo });
      if (!mensaje) {
        return safeAck(ack, { ok: false, error: 'No se pudo crear el mensaje' });
      }

      emitirNuevoMensaje(mensaje);
      safeAck(ack, { ok: true, mensaje });
    } catch (error) {
      console.error('Error al crear mensaje via socket:', error?.message || error);
      safeAck(ack, { ok: false, error: 'No se pudo enviar el mensaje' });
    }
  });
});

migrationsReady.finally(() => {
  server.listen(PORT, HOST, () => {
    console.log(`Servidor iniciado en http://${HOST}:${PORT}`);
  });
});
