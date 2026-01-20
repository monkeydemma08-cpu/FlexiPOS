require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

const db = require('./db');
const usuariosRepo = require('./repos/usuarios-mysql');
const runMultiNegocioMigrations = require('./migrations/mysql-multi-negocio');
const runChatMigrations = require('./migrations/mysql-chat');
console.log('server.js cargó correctamente');

const app = express();
let io = null;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const NEGOCIO_ID_DEFAULT = 1;
const DEFAULT_CONFIG_MODULOS = {
  admin: true,
  mesera: true,
  cocina: true,
  bar: false,
  caja: true,
  historialCocina: true,
};
const AREAS_PREPARACION = ['ninguna', 'cocina', 'bar'];
const DEFAULT_COLOR_TEXTO = '#222222';
const DEFAULT_COLOR_PELIGRO = '#ff4b4b';
const PASSWORD_HASH_ROUNDS = 10;
const IMPERSONATION_TOKEN_TTL_SECONDS = 60 * 60;
const IMPERSONATION_JWT_SECRET =
  process.env.IMPERSONATION_JWT_SECRET || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');


const seedUsuariosIniciales = async () => {
  const iniciales = [
    {
      nombre: 'Administrador',
      usuario: 'admin',
      password: 'admin123',
      rol: 'admin',
      activo: 1,
      negocio_id: NEGOCIO_ID_DEFAULT,
      es_super_admin: 1,
    },
    { nombre: 'Mesera', usuario: 'mesera', password: 'mesera123', rol: 'mesera', activo: 1, negocio_id: NEGOCIO_ID_DEFAULT },
    { nombre: 'Cocina', usuario: 'cocina', password: 'cocina123', rol: 'cocina', activo: 1, negocio_id: NEGOCIO_ID_DEFAULT },
    { nombre: 'Caja', usuario: 'caja', password: 'caja123', rol: 'caja', activo: 1, negocio_id: NEGOCIO_ID_DEFAULT },
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
const ADMIN_PASSWORD = 'admin123';
const SESSION_EXPIRATION_HOURS = 12; // Ventana m?xima para considerar una sesi?n activa
const ANALYTICS_CACHE_TTL_MS = 2 * 60 * 1000;
const analyticsCache = new Map();

const usuarioRolesPermitidos = ['mesera', 'cocina', 'bar', 'caja'];

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

function normalizarAreaPreparacion(area) {
  const valor = (area || 'ninguna').toString().trim().toLowerCase();
  return AREAS_PREPARACION.includes(valor) ? valor : 'ninguna';
}

function parseConfigModulos(configModulos) {
  if (configModulos === undefined || configModulos === null) {
    return { ...DEFAULT_CONFIG_MODULOS };
  }

  if (typeof configModulos === 'string') {
    const trimmed = configModulos.trim();
    if (!trimmed) {
      return { ...DEFAULT_CONFIG_MODULOS };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_CONFIG_MODULOS, ...parsed };
      }
    } catch (error) {
      console.warn('No se pudo parsear config_modulos, usando defaults:', error?.message || error);
      return { ...DEFAULT_CONFIG_MODULOS };
    }
  }

  if (typeof configModulos === 'object') {
    return { ...DEFAULT_CONFIG_MODULOS, ...configModulos };
  }

  return { ...DEFAULT_CONFIG_MODULOS };
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

const obtenerNegocioAdmin = async (negocioId) =>
  db.get(
    'SELECT id, activo, suspendido, deleted_at, motivo_suspension, admin_principal_usuario_id FROM negocios WHERE id = ? LIMIT 1',
    [negocioId]
  );

runMultiNegocioMigrations()
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
    es_super_admin: false,
    force_password_change: !!usuario.force_password_change,
    impersonated: true,
    impersonated_by: payload.admin_id,
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
const esUsuarioAdmin = (usuario) => usuario?.rol === 'admin';
const esSuperAdmin = (usuario) => Boolean(usuario?.es_super_admin || usuario?.esSuperAdmin);
const tienePermisoAdmin = (usuario) => esUsuarioAdmin(usuario) || esSuperAdmin(usuario);
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

const obtenerImpuestoConfigurado = (negocioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = 1;
  }

  db.get(
    "SELECT valor FROM configuracion WHERE clave = 'impuesto_porcentaje' AND negocio_id = ? LIMIT 1",
    [negocioId || 1],
    (err, row) => {
      if (err) {
        return callback(err);
      }
      const porcentaje = row ? parseFloat(row.valor) : 0;
      callback(null, Number.isNaN(porcentaje) ? 0 : porcentaje);
    }
  );
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
  const filtroFechaSql = soloHoy ? ' AND DATE(COALESCE(fecha_listo, fecha_creacion)) = CURDATE()' : '';
  const pedidos = await db.all(
    `
      SELECT id, cuenta_id, mesa, cliente, modo_servicio, estado, nota, subtotal,
             impuesto, total, fecha_creacion, fecha_listo, fecha_cierre,
             cocinero_id, cocinero_nombre, bartender_id, bartender_nombre, negocio_id
      FROM pedidos
      WHERE estado IN (${placeholders}) AND negocio_id = ?${filtroFechaSql}
      ORDER BY fecha_creacion ASC
    `,
    [...estadosBusqueda, negocioId]
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
             descuento_monto
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
          return db.run('COMMIT', (commitErr) => {
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

            return callback(null, { factura, totales });
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
  if (!ignorarFecha) {
    filtros.push(`DATE(${FECHA_BASE_PEDIDOS_SQL}) = ?`);
    params.push(fecha);
  }
  filtros.push('negocio_id = ?');
  params.push(negocioId || NEGOCIO_ID_DEFAULT);
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
    GROUP BY id
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      return callback(err);
    }

    callback(null, rows || []);
  });
};

const obtenerUltimoCierreCaja = (negocioId, callback) => {
  const sql = `
    SELECT fecha_cierre
    FROM cierres_caja
    WHERE negocio_id = ?
    ORDER BY fecha_cierre DESC
    LIMIT 1
  `;
  db.get(sql, [negocioId || NEGOCIO_ID_DEFAULT], (err, row) => {
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

  if (!ignorarFecha) {
    filtros.push('DATE(fecha) = ?');
    params.push(fecha);
  }

  filtros.push('negocio_id = ?');
  params.push(negocioId || NEGOCIO_ID_DEFAULT);

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
        fecha, monto, moneda, categoria, metodo_pago, proveedor, descripcion,
        referencia, referencia_tipo, referencia_id, usuario_id, es_recurrente,
        frecuencia, tags, negocio_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    params
  );

  return {
    id: insert?.lastID || null,
    fecha,
    monto,
    moneda: 'DOP',
    categoria: REFERENCIA_TIPO_SALIDA,
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

  obtenerPedidosPendientesDeCierre(
    fecha,
    negocioId,
    { soloPendientes, ignorarFecha },
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
        return obtenerSalidasPorFecha(fecha, negocioId, hecho);
      }
      obtenerUltimoCierreCaja(negocioId, (inicioErr, inicioTurno) => {
        if (inicioErr) return hecho(inicioErr);
        obtenerSalidasPorFecha(null, negocioId, { ignorarFecha: true, desde: inicioTurno }, hecho);
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

const obtenerCierresCaja = (desde, hasta, negocioId, callback) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
  const sql = `
    SELECT id, fecha_operacion, fecha_cierre, usuario, usuario_rol,
           total_sistema, total_declarado, diferencia, observaciones
    FROM cierres_caja
    WHERE negocio_id = ?
      AND DATE(fecha_operacion) BETWEEN ? AND ?
    ORDER BY fecha_operacion DESC
  `;
  db.all(sql, [negocio, desde, hasta], (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows || []);
  });
};

const obtenerPedidosDetalleCierre = (cierreId, negocioId, callback) => {
  const negocio = negocioId || NEGOCIO_ID_DEFAULT;
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
    GROUP BY id
    ORDER BY fecha_cierre DESC, id ASC
  `;
  db.all(sql, [cierreId, negocio], (err, rows) => {
    if (err) {
      return callback(err);
    }
    callback(null, rows || []);
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

  const resumenDia = await new Promise((resolve, reject) => {
    calcularResumenCajaPorFecha(
      fechaOperacion,
      negocio,
      { soloPendientes: true, ignorarFecha: true },
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
      (fecha_operacion, usuario, usuario_rol, fondo_inicial, total_sistema, total_declarado, diferencia, observaciones, negocio_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fechaOperacion,
      usuario,
      usuarioRol,
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
    await db.run(
      `UPDATE pedidos
         SET cierre_id = ?
       WHERE estado = 'pagado'
         AND (cierre_id IS NULL)
         AND negocio_id = ?`,
      [cierreId, negocio]
    );
  }

  return {
    id: cierreId,
    fecha_operacion: fechaOperacion,
    usuario,
    usuario_rol: usuarioRol,
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
    const rango = normalizarRangoCierres(req.query?.desde, req.query?.hasta);

    obtenerCierresCaja(rango.desde, rango.hasta, negocioId, (err, cierres) => {
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
    obtenerCierresCaja(rango.desde, rango.hasta, negocioId, (err, cierres) => {
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

app.get('/api/caja/cierres/:id/detalle', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const corteId = Number(req.params.id);
    if (!Number.isInteger(corteId) || corteId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cierre inválido' });
    }
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    db.get(
      'SELECT id FROM cierres_caja WHERE id = ? AND negocio_id = ?',
      [corteId, negocioId],
      (cierreErr, cierreRow) => {
        if (cierreErr) {
          console.error('Error al consultar el cierre de caja:', cierreErr?.message || cierreErr);
          return res.status(500).json({ ok: false, error: 'Error al consultar el cierre' });
        }
        if (!cierreRow) {
          return res.status(404).json({ ok: false, error: 'Cierre no encontrado' });
        }

        obtenerPedidosDetalleCierre(corteId, negocioId, (detalleErr, pedidos) => {
          if (detalleErr) {
            console.error('Error al obtener detalle del cierre:', detalleErr?.message || detalleErr);
            return res.status(500).json({ ok: false, error: 'Error al obtener el detalle del cierre' });
          }
          res.json({ ok: true, pedidos: pedidos || [] });
        });
      }
    );
  });
});

app.delete('/api/admin/eliminar/cierre-caja/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    if (usuarioSesion?.rol !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    }

    const contrasenia = req.body?.password;
    if (!contrasenia || contrasenia !== ADMIN_PASSWORD) {
      return res.status(403).json({ ok: false, error: 'Credenciales inválidas' });
    }

    const cierreId = Number(req.params.id);
    if (!Number.isInteger(cierreId) || cierreId <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de cierre inválido' });
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
          res.json({ ok: true });
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
      const cierre = await db.get(
        `SELECT id, fecha_operacion, fecha_cierre, usuario, usuario_rol, total_sistema, total_declarado, diferencia
         FROM cierres_caja
         WHERE id = ? AND negocio_id = ?`,
        [cierreId, negocioId]
      );

      if (!cierre) {
        return res.status(404).json({ ok: false, error: 'Cierre no encontrado' });
      }

      const fechaOperacion = normalizarFechaConsulta(cierre.fecha_operacion || cierre.fecha_cierre);

      const [productos, ventasRows, comprasRows] = await Promise.all([
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
            GROUP BY dp.producto_id, dp.precio_unitario`,
          [negocioId, cierreId]
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
      (ventasRows || []).forEach((row) => {
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
        obtenerSalidasPorFecha(fechaOperacion, negocioId, (err, data) => {
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

app.get('/admin/cotizaciones', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/cotizaciones/:id/imprimir', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cotizacion-imprimir.html'));
});

app.get('/api/configuracion/impuesto', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    try {
      const valor = await obtenerImpuestoConfiguradoAsync(negocioId);
      res.json({ ok: true, valor });
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
    const valor = Number(rawValor);
    if (!Number.isFinite(valor) || valor < 0) {
      return res.status(400).json({
        ok: false,
        error: 'El valor del impuesto debe ser un número mayor o igual a 0',
      });
    }

    try {
      await guardarConfiguracionNegocio(negocioId, {
        impuesto_porcentaje: valor,
      });
      res.json({ ok: true, valor });
    } catch (error) {
      console.error('Error al guardar el impuesto configurado:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo actualizar el impuesto' });
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
      console.error('Error al obtener la configuración de factura:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo obtener la configuración de factura' });
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
      console.error('Error al guardar la configuración de factura:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo guardar la configuración de factura' });
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

        const sql = `
          SELECT p.id, p.nombre, p.precio, p.precios, p.stock, p.stock_indefinido, p.activo, p.categoria_id,
                 c.nombre AS categoria_nombre
          FROM productos p
          ${joinCond}
          WHERE p.negocio_id = ?
          ORDER BY p.nombre ASC
        `;

      const params = [];
      if (tieneNegocioId) {
        params.push(negocioId);
      }
      params.push(negocioId);

        db.all(sql, params, (err, rows) => {
          if (err) {
            console.error('Error al obtener productos:', err.message);
            return res.status(500).json({ error: 'Error al obtener productos' });
          }

          const productos = (rows || []).map((row) => ({
            ...row,
            precios: normalizarListaPrecios(row.precios),
          }));
          res.json(productos);
        });
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

    if (!fecha) {
      return res.status(400).json({ ok: false, error: 'Fecha invalida.' });
    }

    obtenerSalidasPorFecha(fecha, negocioId, (err, data) => {
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
          INSERT INTO salidas_caja (negocio_id, fecha, descripcion, monto, metodo, usuario_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [negocioId, fecha, descripcion, monto, 'efectivo', usuarioSesion?.id || null]
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

    try {
      const existente = await db.get(
        `SELECT id, fecha, descripcion, monto, metodo
           FROM salidas_caja
          WHERE id = ? AND negocio_id = ?
          LIMIT 1`,
        [salidaId, negocioId]
      );

      if (!existente) {
        return res.status(404).json({ ok: false, error: 'Salida no encontrada.' });
      }

      const fechaFinal = obtenerFechaSalidaGasto(fecha || existente.fecha);
      const descripcionFinal = descripcion ?? existente.descripcion ?? '';
      const montoFinal = monto ?? Number(existente.monto || 0);

      await db.run('BEGIN');

      const updates = [];
      const params = [];
      if (descripcionInput !== undefined) {
        updates.push('descripcion = ?');
        params.push(descripcionFinal);
      }
      if (montoInput !== undefined) {
        updates.push('monto = ?');
        params.push(montoFinal);
      }
      if (fechaInput !== undefined) {
        updates.push('fecha = ?');
        params.push(fecha);
      }

      if (updates.length) {
        params.push(salidaId, negocioId);
        await db.run(
          `UPDATE salidas_caja SET ${updates.join(', ')} WHERE id = ? AND negocio_id = ?`,
          params
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

    try {
      const existente = await db.get(
        'SELECT id FROM salidas_caja WHERE id = ? AND negocio_id = ?',
        [salidaId, negocioId]
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

      await db.run('DELETE FROM salidas_caja WHERE id = ? AND negocio_id = ?', [salidaId, negocioId]);

      await db.run('COMMIT');

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

    calcularResumenCajaPorFecha(
      fecha,
      negocioId,
      { soloPendientes, ignorarFecha: modoTurno },
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
    const params = [cuentaId, cuentaId, negocioId];
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
            AND negocio_id = ?${filtroFechaSql}
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
    return { ok: true, estado: 'pagado' };
  }

  if (areaNormalizada === 'bar') {
    const barActivo = await moduloActivoParaNegocio('bar', negocioId);
    if (!barActivo) {
      return { ok: false, status: 403, error: 'El m\u00f3dulo de bar est\u00e1 desactivado para este negocio.' };
    }
  }

  const pedidoActual = await db.get(
    `SELECT id, estado, cocinero_id, cocinero_nombre, bartender_id, bartender_nombre FROM pedidos WHERE id = ? AND negocio_id = ?`,
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
      return res.status(400).json({ error: 'Estado de pedido no válido.' });
    }

    try {
      const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
      const incluirSiAreaLista = estadoSolicitud === 'listo' && usuarioSesion?.rol === 'mesera';
      const cuentas = await obtenerCuentasPorEstados([estadoSolicitud], negocioId, { incluirSiAreaLista });
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
      return res.status(400).json({ error: 'Pedido no válido.' });
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
      return res.status(400).json({ ok: false, error: 'Cuenta inválida.' });
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

app.put('/api/cuentas/:id/cerrar', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const cuentaId = Number(req.params.id);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      return res.status(400).json({ ok: false, error: 'Cuenta inválida.' });
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

    const modoServicio = limpiarTextoGeneral(payload.modo_servicio) || 'en_local';
    const destino = (payload.destino || 'cocina').toString().trim().toLowerCase();
    const esParaCaja = destino === 'caja';
    const mesa = limpiarTextoGeneral(payload.mesa);
    const cliente = limpiarTextoGeneral(payload.cliente);
    const nota = limpiarTextoGeneral(payload.nota);
    const cuentaReferencia = payload.cuenta_id || null;

    const itemsProcesados = [];

    try {
      for (const item of itemsEntrada) {
        const productoId = Number(item?.producto_id);
        const cantidad = Number(item?.cantidad);
        if (!Number.isFinite(productoId) || productoId <= 0) {
          return res.status(400).json({ error: 'Hay un producto inválido en el pedido.' });
        }
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          return res.status(400).json({ error: 'Todas las cantidades deben ser mayores a cero.' });
        }

        const producto = await db.get(
          `SELECT p.id, p.nombre, p.precio, p.precios, p.stock, p.stock_indefinido,
                  COALESCE(c.area_preparacion, 'ninguna') AS area_preparacion
           FROM productos p
           LEFT JOIN categorias c ON c.id = p.categoria_id
           WHERE p.id = ? AND p.negocio_id = ?`,
          [productoId, negocioId]
        );

        if (!producto) {
          return res.status(404).json({ error: `Producto ${productoId} no encontrado.` });
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
        });
      }

      const tienePreparacion = itemsProcesados.some(
        (item) => item.area_preparacion === 'cocina' || item.area_preparacion === 'bar'
      );
      const subtotal = itemsProcesados.reduce(
        (acc, item) => acc + (Number(item.precio_unitario) || 0) * item.cantidad,
        0
      );
      const impuestoPorcentaje = Number(await obtenerImpuestoConfiguradoAsync(negocioId)) || 0;
      const impuesto = Number((subtotal * (impuestoPorcentaje / 100)).toFixed(2));
      const total = Number((subtotal + impuesto).toFixed(2));
      const estadoInicial = esParaCaja || !tienePreparacion ? 'listo' : 'pendiente';
      const fechaListo = esParaCaja || !tienePreparacion ? new Date() : null;

      await db.run('BEGIN');

      const insertResult = await db.run(
        `
          INSERT INTO pedidos (
            cuenta_id, mesa, cliente, modo_servicio, nota, estado,
            subtotal, impuesto, total, fecha_listo, creado_por, negocio_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          usuarioSesion.id,
          negocioId,
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
        await db.run(
          'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, negocio_id) VALUES (?, ?, ?, ?, ?)',
          [pedidoId, item.producto_id, item.cantidad, item.precio_unitario, negocioId]
        );
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
          fecha_listo: fechaListo,
          items: itemsProcesados,
        },
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
      return res.status(400).json({ error: 'Pedido no válido.' });
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
      return res.status(400).json({ error: 'El pedido ya está cancelado.' });
    }

    try {
      await db.run('BEGIN');
      await db.run(
        'UPDATE pedidos SET estado = ? WHERE id = ? AND negocio_id = ?',
        ['cancelado', pedidoId, negocioId]
      );
      await ajustarStockPorPedido(pedidoId, negocioId, 1);
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
      return res.status(400).json({ error: 'Pedido no válido.' });
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
    const filtroRol = rol && usuarioRolesPermitidos.includes(rol) ? rol : undefined;
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
        const usuarios = rows || [];
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

// Gestión de negocios (solo super admin)
app.get('/api/negocios', (req, res) => {
  requireSuperAdmin(req, res, () => {
    const sql = `
      SELECT n.id, n.nombre, n.slug, n.rnc, n.telefono, n.direccion, n.color_primario, n.color_secundario,
             n.color_texto, n.color_header, n.color_boton_primario, n.color_boton_secundario, n.color_boton_peligro,
             n.config_modulos, n.admin_principal_correo, n.admin_principal_usuario_id,
             u.usuario AS admin_principal_usuario,
             n.logo_url, n.titulo_sistema, n.activo, n.suspendido, n.deleted_at, n.motivo_suspension, n.updated_at,
             n.creado_en
        FROM negocios n
        LEFT JOIN usuarios u ON u.id = n.admin_principal_usuario_id
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
    const adminPrincipalCorreo = normalizarCampoTexto(payload.adminPrincipalCorreo, null);
    const adminPrincipalUsuario =
      normalizarCampoTexto(payload.adminPrincipalUsuario, null) || normalizarCampoTexto(payload.admin_usuario, null);
    const adminPrincipalPassword = payload.adminPrincipalPassword || payload.admin_password || payload.adminPassword;

    if (!slug) {
      return res.status(400).json({ ok: false, error: 'El slug es obligatorio' });
    }
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre del negocio es obligatorio' });
    }

    db.get('SELECT id FROM negocios WHERE slug = ? LIMIT 1', [slug], (slugErr, existente) => {
      if (slugErr) {
        console.error('Error al validar slug de negocio:', slugErr.message);
        return res.status(500).json({ ok: false, error: 'No se pudo validar el slug' });
      }

      if (existente) {
        return res.status(400).json({ ok: false, error: 'Ya existe un negocio con ese slug' });
      }

      const insertSql = `
        INSERT INTO negocios (nombre, slug, rnc, telefono, direccion, color_primario, color_secundario, color_texto, color_header,
                              color_boton_primario, color_boton_secundario, color_boton_peligro, config_modulos, admin_principal_correo,
                              admin_principal_usuario_id, logo_url, titulo_sistema, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
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
      ];

      db.run(insertSql, params, async function (err) {
        if (err) {
          console.error('Error al crear negocio:', err.message);
          return res.status(500).json({ ok: false, error: 'No se pudo crear el negocio' });
        }

        const negocioCreado = mapNegocioWithDefaults({
          id: this.lastID,
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
          suspendido: 0,
          deleted_at: null,
          motivo_suspension: null,
        });

        const responsePayload = { ok: true, negocio: negocioCreado };

        try {
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
});

app.put('/api/negocios/:id', (req, res) => {
  requireSuperAdmin(req, res, () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID de negocio inválido' });
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
    const logoUrlProvided = payload.logo_url ?? payload.logoUrl;
    const rncProvided = payload.rnc;
    const telefonoProvided = payload.telefono ?? payload.telefonoNegocio;
    const direccionProvided = payload.direccion ?? payload.direccionNegocio;

    if (payload.nombre !== undefined || payload.titulo_sistema !== undefined || payload.tituloSistema !== undefined) {
      const nombre =
        normalizarCampoTexto(payload.nombre, null) || normalizarCampoTexto(payload.titulo_sistema ?? payload.tituloSistema, null);
      if (!nombre) {
        return res.status(400).json({ ok: false, error: 'El nombre del negocio no puede ser vacío' });
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
    if (logoUrlProvided !== undefined) {
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
      return res.status(400).json({ ok: false, error: 'ID de negocio inválido' });
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
          return res.status(404).json({ ok: false, error: 'Negocio no encontrado para la sesión actual' });
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
      if (negocio.deleted_at) {
        return res.status(400).json({ ok: false, error: 'El negocio ya esta eliminado' });
      }

      await db.run(
        'UPDATE negocios SET deleted_at = CURRENT_TIMESTAMP, activo = 0, suspendido = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
      await registrarAccionAdmin({ adminId: usuarioSesion.id, negocioId: id, accion: 'eliminar' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error eliminando negocio:', error?.message || error);
      res.status(500).json({ ok: false, error: 'No se pudo eliminar el negocio' });
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

      const adminUsuario = await obtenerAdminPrincipalNegocio(id, negocio.admin_principal_usuario_id);
      if (!adminUsuario) {
        return res.status(404).json({ ok: false, error: 'Admin principal no encontrado' });
      }

      const token = crearTokenImpersonacion({
        role: 'admin',
        impersonated: true,
        negocio_id: id,
        usuario_id: adminUsuario.id,
        admin_id: usuarioSesion.id,
      });

      await registrarImpersonacionAdmin({ adminId: usuarioSesion.id, negocioId: id, ip: req.ip || null });
      await registrarAccionAdmin({ adminId: usuarioSesion.id, negocioId: id, accion: 'impersonar' });

      res.json({
        ok: true,
        token,
        rol: 'admin',
        usuario_id: adminUsuario.id,
        usuario: adminUsuario.usuario,
        nombre: adminUsuario.nombre,
        negocio_id: id,
        force_password_change: !!adminUsuario.force_password_change,
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

    const esSuper = esSuperAdmin(usuarioSesion);
    const negocioDestino =
      esSuper && negocio_id ? Number(negocio_id) || NEGOCIO_ID_DEFAULT : usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const flagSuperNuevo = esSuper ? !!es_super_admin : false;
    if (rol === 'bar') {
      const barActivo = await moduloActivoParaNegocio('bar', negocioDestino);
      if (!barActivo) {
        return res.status(403).json({ error: 'El m�dulo de bar est� desactivado para este negocio.' });
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

      if (!esSuper && existente.negocio_id !== usuarioSesion.negocio_id) {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      const payload = { nombre, usuario: usuarioNormalizado, rol, activo };
      if (password !== undefined) {
        payload.password = await hashPasswordIfNeeded(password);
      }
      const negocioDestino = esSuper && negocio_id !== undefined ? negocio_id || NEGOCIO_ID_DEFAULT : existente.negocio_id;
      const rolDestino = rol || existente.rol;
      if (rolDestino === 'bar') {
        const barActivo = await moduloActivoParaNegocio('bar', negocioDestino);
        if (!barActivo) {
          return res.status(403).json({ error: 'El m�dulo de bar est� desactivado para este negocio.' });
        }
      }

      if (esSuper && negocio_id !== undefined) {
        payload.negocio_id = negocio_id || NEGOCIO_ID_DEFAULT;
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

// Clientes
app.get('/api/clientes', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const term = (req.query.search || '').trim();
    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    if (esUsuarioBar(usuarioSesion)) {
      const barActivo = await moduloActivoParaNegocio('bar', negocioId);
      if (!barActivo) {
        return res.status(403).json({ error: 'El m�dulo de bar est� desactivado para este negocio.' });
      }
    }
    const areaSolicitada = normalizarAreaPreparacion(
      req.body?.area_preparacion ?? req.body?.areaPreparacion ?? (esUsuarioBar(usuarioSesion) ? 'bar' : 'cocina')
    );
    const params = [negocioId];
    let sql = `SELECT id, nombre, documento, tipo_documento, telefono, email, direccion, notas, activo
               FROM clientes
               WHERE negocio_id = ?
                 AND activo = 1`;

    if (term) {
      sql += ' AND (nombre LIKE ? OR documento LIKE ?)';
      const like = `%${term}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY nombre ASC LIMIT 50';

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

    if (!stockIndefinido) {
      const stockValidacion = stockValor === null ? 0 : stockValor;
      if (!Number.isFinite(stockValidacion) || stockValidacion < 0) {
        return res.status(400).json({ error: 'El stock debe ser un numero mayor o igual a 0' });
      }
    }

    const stockFinal = stockIndefinido ? null : Number.isFinite(stockValor) ? stockValor : 0;

    const sql = `
      INSERT INTO productos (nombre, precio, precios, stock, stock_indefinido, categoria_id, activo, negocio_id)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `;
    const params = [
      nombre,
      precioValor,
      preciosJson,
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

    db.get(
      'SELECT stock, stock_indefinido FROM productos WHERE id = ? AND negocio_id = ?',
      [id, usuarioSesion.negocio_id],
      (productoErr, productoActual) => {
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

app.put('/api/productos/:id/stock', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const stockEntrada = req.body.stock;
    const negocioId = usuarioSesion.negocio_id;

    db.get('SELECT stock_indefinido FROM productos WHERE id = ? AND negocio_id = ?', [id, negocioId], (err, producto) => {
      if (err) {
        console.error('Error al validar producto:', err.message);
        return res.status(500).json({ error: 'Error al actualizar stock' });
      }

      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado' });
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

const calcularTotalesCompraInventario = (subtotal, aplicaItbis) => {
  const base = Number(subtotal) || 0;
  const itbis = aplicaItbis ? Number((base * 0.18).toFixed(2)) : 0;
  const total = Number((base + itbis).toFixed(2));
  return { subtotal: base, itbis, total };
};

app.get('/api/inventario/compras', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!tienePermisoAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioIdRaw = usuarioSesion?.negocio_id ?? NEGOCIO_ID_DEFAULT;
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
               cid.costo_unitario, cid.total_linea
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
    const origenFondos = origenFondosRaw === 'caja' ? 'caja' : 'negocio';
    const metodoPago = normalizarCampoTexto(req.body?.metodo_pago ?? req.body?.metodoPago);
    const observaciones = normalizarCampoTexto(req.body?.observaciones ?? req.body?.comentarios);
    const aplicaItbis = normalizarAplicaItbis(req.body?.aplica_itbis ?? req.body?.aplicaItbis);
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
      const placeholders = productoIds.map(() => '?').join(',');
      const productos = await db.all(
        `SELECT id, nombre, stock_indefinido FROM productos WHERE negocio_id = ? AND id IN (${placeholders})`,
        [negocioId, ...productoIds]
      );
      const productosMap = new Map((productos || []).map((producto) => [Number(producto.id), producto]));

      const detalles = [];
      let subtotal = 0;

      for (const item of itemsEntrada) {
        const productoId = Number(item?.producto_id);
        if (!Number.isFinite(productoId) || productoId <= 0 || !productosMap.has(productoId)) {
          return res.status(400).json({ error: 'Hay productos invalidos en la compra.' });
        }

        const cantidad = normalizarNumero(item?.cantidad, null);
        const costoUnitario = normalizarNumero(item?.costo_unitario ?? item?.costoUnitario, null);

        if (cantidad === null || cantidad <= 0) {
          return res.status(400).json({ error: 'La cantidad debe ser mayor a 0.' });
        }
        if (costoUnitario === null || costoUnitario < 0) {
          return res.status(400).json({ error: 'El costo unitario debe ser mayor o igual a 0.' });
        }

        const totalLinea = Number((cantidad * costoUnitario).toFixed(2));
        subtotal += totalLinea;
        detalles.push({
          producto_id: productoId,
          cantidad,
          costo_unitario: Number(costoUnitario.toFixed(2)),
          total_linea: totalLinea,
        });
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
            (fecha, proveedor, origen_fondos, metodo_pago, subtotal, itbis, aplica_itbis, total, observaciones, creado_por, negocio_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          fecha,
          proveedor,
          origenFondos,
          metodoPago,
          subtotalFinal,
          itbis,
          aplicaItbis ? 1 : 0,
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
              (compra_id, producto_id, cantidad, costo_unitario, total_linea, negocio_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            compraId,
            detalle.producto_id,
            detalle.cantidad,
            detalle.costo_unitario,
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
          const itbisLinea = aplicaItbis ? Number((detalle.total_linea * 0.18).toFixed(2)) : 0;
          const totalLinea = Number((detalle.total_linea + itbisLinea).toFixed(2));
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
              detalle.costo_unitario,
              itbisLinea,
              totalLinea,
              negocioId,
            ]
          );
        }
      }

      const descripcionGasto = `Compra inventario #${compraId}${observaciones ? ` - ${observaciones}` : ''}`;
      const gastoInsert = await db.run(
        `
          INSERT INTO gastos
            (fecha, monto, moneda, categoria, metodo_pago, proveedor, descripcion, referencia, es_recurrente, negocio_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          fecha,
          total,
          'DOP',
          'Compras inventario',
          metodoPago,
          proveedor,
          descripcionGasto,
          `INV-${compraId}`,
          0,
          negocioId,
        ]
      );

      const gastoId = gastoInsert?.lastID || null;
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

      res.status(201).json({
        ok: true,
        id: compraId,
        subtotal: subtotalFinal,
        itbis,
        total,
        aplica_itbis: aplicaItbis ? 1 : 0,
        compra_id: compra606Id,
        gasto_id: gastoId,
        salida_id: salidaId,
      });
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
        SELECT id, fecha, monto, moneda, categoria, metodo_pago, proveedor, descripcion,
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
          fecha, monto, moneda, categoria, metodo_pago, proveedor, descripcion,
          comprobante_ncf, referencia, es_recurrente, frecuencia, tags, negocio_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        fecha,
        montoValor,
        moneda,
        categoria,
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
      res.status(201).json({
        ok: true,
        gasto: {
          id: result.lastID,
          fecha,
          monto: montoValor,
          moneda,
          categoria,
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
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al eliminar gasto:', error?.message || error);
      res.status(500).json({ error: 'Error al eliminar el gasto' });
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
      const ventasResumen = await db.get(
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

      const ingresosTotal = Number(ventasResumen?.total) || 0;
      const ventasCount = Number(ventasResumen?.total_ventas) || 0;
      const ticketPromedio = ventasCount > 0 ? Number((ingresosTotal / ventasCount).toFixed(2)) : 0;

      const ventasSerie = await db.all(
        `
          SELECT ${fechaBase} AS fecha,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS ventas
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY fecha
          ORDER BY fecha ASC
        `,
        paramsBase
      );

      const ventasPorDiaSemana = await db.all(
        `
          SELECT DAYOFWEEK(${fechaBaseRaw}) AS dia_semana,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS ventas
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY dia_semana
          ORDER BY total DESC
        `,
        paramsBase
      );

      const ventasPorHora = await db.all(
        `
          SELECT HOUR(${fechaBaseRaw}) AS hora,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total,
                 COUNT(DISTINCT COALESCE(cuenta_id, id)) AS ventas
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY hora
          ORDER BY total DESC
        `,
        paramsBase
      );

      const topProductosCantidad = await db.all(
        `
          SELECT p.id, p.nombre,
                 SUM(dp.cantidad) AS cantidad,
                 SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos
          FROM detalle_pedido dp
          JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
          JOIN productos p ON p.id = dp.producto_id
          WHERE dp.negocio_id = ?
            AND pe.estado = 'pagado'
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY p.id, p.nombre
          ORDER BY cantidad DESC
          LIMIT 10
        `,
        [negocioId, negocioId, rango.desde, rango.hasta]
      );

      const topProductosIngresos = await db.all(
        `
          SELECT p.id, p.nombre,
                 SUM(dp.cantidad) AS cantidad,
                 SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos
          FROM detalle_pedido dp
          JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
          JOIN productos p ON p.id = dp.producto_id
          WHERE dp.negocio_id = ?
            AND pe.estado = 'pagado'
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY p.id, p.nombre
          ORDER BY ingresos DESC
          LIMIT 10
        `,
        [negocioId, negocioId, rango.desde, rango.hasta]
      );

      const bottomProductos = await db.all(
        `
          SELECT p.id, p.nombre,
                 COALESCE(s.cantidad, 0) AS cantidad,
                 COALESCE(s.ingresos, 0) AS ingresos
          FROM productos p
          LEFT JOIN (
            SELECT dp.producto_id,
                   SUM(dp.cantidad) AS cantidad,
                   SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos
            FROM detalle_pedido dp
            JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
            WHERE dp.negocio_id = ?
              AND pe.estado = 'pagado'
              AND ${fechaBase} BETWEEN ? AND ?
            GROUP BY dp.producto_id
          ) s ON s.producto_id = p.id
          WHERE p.negocio_id = ?
          ORDER BY cantidad ASC, ingresos ASC
          LIMIT 10
        `,
        [negocioId, negocioId, rango.desde, rango.hasta, negocioId]
      );

      const topCategoriasVentas = await db.all(
        `
          SELECT COALESCE(c.nombre, 'Sin categoria') AS categoria,
                 SUM(dp.cantidad) AS cantidad,
                 SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos
          FROM detalle_pedido dp
          JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
          JOIN productos p ON p.id = dp.producto_id
          LEFT JOIN categorias c ON c.id = p.categoria_id AND c.negocio_id = ?
          WHERE dp.negocio_id = ?
            AND pe.estado = 'pagado'
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY categoria
          ORDER BY ingresos DESC
          LIMIT 5
        `,
        [negocioId, negocioId, negocioId, rango.desde, rango.hasta]
      );

      const ventasPorDiaMes = await db.all(
        `
          SELECT DAY(${fechaBaseRaw}) AS dia_mes,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
          GROUP BY dia_mes
          ORDER BY total DESC
        `,
        paramsBase
      );

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

      const gastosResumen = await db.get(
        `
          SELECT SUM(monto) AS total
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
        `,
        paramsBase
      );
      const gastosTotal = Number(gastosResumen?.total) || 0;

      const gastosSerie = await db.all(
        `
          SELECT DATE(fecha) AS fecha, SUM(monto) AS total
          FROM gastos
          WHERE negocio_id = ?
            AND DATE(fecha) BETWEEN ? AND ?
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
          GROUP BY es_recurrente
        `,
        paramsBase
      );

      const gananciaNeta = Number((ingresosTotal - gastosTotal).toFixed(2));
      const margenNeto = ingresosTotal > 0 ? Number((gananciaNeta / ingresosTotal).toFixed(4)) : 0;

      const rangoAnterior = obtenerRangoAnterior(rango.desde, rango.dias);
      const ventasAnterior = await db.get(
        `
          SELECT COUNT(DISTINCT COALESCE(cuenta_id, id)) AS total_ventas,
                 SUM(subtotal + impuesto - descuento_monto + propina_monto) AS total
          FROM pedidos
          WHERE estado = 'pagado'
            AND negocio_id = ?
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        [negocioId, rangoAnterior.desde, rangoAnterior.hasta]
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

      const ventasTotalAnterior = Number(ventasAnterior?.total) || 0;
      const ventasCountAnterior = Number(ventasAnterior?.total_ventas) || 0;
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

      const conteoProductos = await db.get(
        `
          SELECT COUNT(DISTINCT dp.producto_id) AS total
          FROM detalle_pedido dp
          JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
          WHERE dp.negocio_id = ?
            AND pe.estado = 'pagado'
            AND ${fechaBase} BETWEEN ? AND ?
        `,
        [negocioId, negocioId, rango.desde, rango.hasta]
      );
      const totalProductosConVentas = Number(conteoProductos?.total) || 0;
      if (totalProductosConVentas > 0 && ingresosTotal > 0) {
        const topN = Math.max(1, Math.ceil(totalProductosConVentas * 0.2));
        const paretoRows = await db.all(
          `
            SELECT dp.producto_id,
                   SUM(dp.cantidad * dp.precio_unitario - COALESCE(dp.descuento_monto, 0)) AS ingresos
            FROM detalle_pedido dp
            JOIN pedidos pe ON pe.id = dp.pedido_id AND pe.negocio_id = ?
            WHERE dp.negocio_id = ?
              AND pe.estado = 'pagado'
              AND ${fechaBase} BETWEEN ? AND ?
            GROUP BY dp.producto_id
            ORDER BY ingresos DESC
            LIMIT ${topN}
          `,
          [negocioId, negocioId, rango.desde, rango.hasta]
        );
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
        },
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
    const origenFondos = origenFondosRaw === 'caja' ? 'caja' : 'negocio';
    const metodoPago = normalizarCampoTexto(req.body?.metodo_pago ?? req.body?.metodoPago);
    const observaciones = normalizarCampoTexto(req.body?.observaciones ?? req.body?.comentarios);
    const aplicaItbis = normalizarAplicaItbis(req.body?.aplica_itbis ?? req.body?.aplicaItbis);
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
        SELECT id, origen_fondos, metodo_pago, compra_id, gasto_id, salida_id
          FROM compras_inventario
         WHERE id = ? AND negocio_id = ?
        `,
        [compraId, negocioId]
      );

      if (!compraActual) {
        return res.status(404).json({ error: 'Compra no encontrada.' });
      }

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
        `SELECT id, nombre, stock_indefinido FROM productos WHERE negocio_id = ? AND id IN (${placeholders})`,
        [negocioId, ...productoIdsUnion]
      );
      const productosMap = new Map((productos || []).map((producto) => [Number(producto.id), producto]));

      const detalles = [];
      let subtotal = 0;

      for (const item of itemsEntrada) {
        const productoId = Number(item?.producto_id);
        if (!Number.isFinite(productoId) || productoId <= 0 || !productosMap.has(productoId)) {
          return res.status(400).json({ error: 'Hay productos invalidos en la compra.' });
        }

        const cantidad = normalizarNumero(item?.cantidad, null);
        const costoUnitario = normalizarNumero(item?.costo_unitario ?? item?.costoUnitario, null);

        if (cantidad === null || cantidad <= 0) {
          return res.status(400).json({ error: 'La cantidad debe ser mayor a 0.' });
        }
        if (costoUnitario === null || costoUnitario < 0) {
          return res.status(400).json({ error: 'El costo unitario debe ser mayor o igual a 0.' });
        }

        const totalLinea = Number((cantidad * costoUnitario).toFixed(2));
        subtotal += totalLinea;
        detalles.push({
          producto_id: productoId,
          cantidad,
          costo_unitario: Number(costoUnitario.toFixed(2)),
          total_linea: totalLinea,
        });
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
              (compra_id, producto_id, cantidad, costo_unitario, total_linea, negocio_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            compraId,
            detalle.producto_id,
            detalle.cantidad,
            detalle.costo_unitario,
            detalle.total_linea,
            negocioId,
          ]
        );
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
          const itbisLinea = aplicaItbis ? Number((detalle.total_linea * 0.18).toFixed(2)) : 0;
          const totalLinea = Number((detalle.total_linea + itbisLinea).toFixed(2));
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
              detalle.costo_unitario,
              itbisLinea,
              totalLinea,
              negocioId,
            ]
          );
        }
      }

      if (compraActual.gasto_id) {
        const descripcionGasto = `Compra inventario #${compraId}${observaciones ? ` - ${observaciones}` : ''}`;
        await db.run(
          `
            UPDATE gastos
               SET fecha = ?, monto = ?, metodo_pago = ?, proveedor = ?, descripcion = ?
             WHERE id = ? AND negocio_id = ?
          `,
          [fecha, total, metodoPago, proveedor, descripcionGasto, compraActual.gasto_id, negocioId]
        );
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
                 total = ?,
                 observaciones = ?,
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
          total,
          observaciones,
          salidaId,
          compraId,
          negocioId,
        ]
      );

      await db.run('COMMIT');

      res.json({
        ok: true,
        id: compraId,
        subtotal: subtotalFinal,
        itbis,
        total,
        aplica_itbis: aplicaItbis ? 1 : 0,
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

  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioIdFactura = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;

    db.get(
      `SELECT id, codigo, cliente_nombre, cliente_documento, cliente_contacto, fecha_validez, estado,
            subtotal, impuesto, descuento_monto, descuento_porcentaje, total, notas_internas, notas_cliente,
            creada_por, pedido_id
     FROM cotizaciones
     WHERE id = ? AND negocio_id = ?`,
    [id, negocioIdFactura],
    (cotErr, cotizacion) => {
      if (cotErr) {
        console.error('Error al obtener cotizaci?n para facturar:', cotErr.message);
        return res.status(500).json({ error: 'Error al facturar la cotizaci?n' });
      }

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
               p.stock AS stock_producto, p.stock_indefinido
        FROM cotizacion_items ci
        LEFT JOIN productos p ON p.id = ci.producto_id AND p.negocio_id = ?
        WHERE ci.cotizacion_id = ? AND ci.negocio_id = ?
      `;

      db.all(itemsSql, [negocioIdFactura, id, negocioIdFactura], (itemsErr, items) => {
        if (itemsErr) {
          console.error('Error al obtener items de la cotizaci?n:', itemsErr.message);
          return res.status(500).json({ error: 'Error al facturar la cotizaci?n' });
        }

        if (!items || !items.length) {
          return res.status(400).json({ error: 'La cotizaci?n no tiene productos para facturar' });
        }

        const cantidades = new Map();
        for (const item of items) {
          if (!item?.producto_id) {
            return res.status(400).json({ error: 'Todos los items deben estar vinculados a un producto para facturar' });
          }
          const esIndefinido = esStockIndefinido(item);
          const cantidad = normalizarNumero(item.cantidad, 0);
          if (cantidad <= 0) {
            return res.status(400).json({ error: 'Hay items sin cantidad v?lida en la cotizaci?n' });
          }
          if (esIndefinido) {
            continue;
          }
          const acumulado = cantidades.get(item.producto_id) || 0;
          cantidades.set(item.producto_id, acumulado + cantidad);
        }

        for (const [productoId, cantidad] of cantidades.entries()) {
          const fila = items.find((i) => i.producto_id === productoId);
          const stockDisponible = normalizarNumero(fila?.stock_producto, 0);
          if (cantidad > stockDisponible) {
            return res
              .status(400)
              .json({ error: `Stock insuficiente para el producto ${productoId}. Disponible: ${stockDisponible}` });
          }
        }

        obtenerImpuestoConfigurado(negocioIdFactura, (configErr, impuestoAplicado) => {
          if (configErr) {
            console.error('Error al obtener impuesto configurado:', configErr.message);
            return res.status(500).json({ error: 'Error al facturar la cotizaci?n' });
          }

          const totales = calcularTotalesCotizacion(
            items,
            impuestoAplicado,
            cotizacion.descuento_porcentaje,
            cotizacion.descuento_monto
          );

          if (totales?.error) {
            return res.status(400).json({ error: totales.error });
          }

          db.run('BEGIN TRANSACTION', (beginErr) => {
            if (beginErr) {
              console.error('No se pudo iniciar la facturaci?n de cotizaci?n:', beginErr.message);
              return res.status(500).json({ error: 'Error al facturar la cotizaci?n' });
            }

            const rollback = (mensaje, errorObj) => {
              if (errorObj) {
                console.error(mensaje, errorObj.message);
              } else {
                console.error(mensaje);
              }
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('Error al revertir facturaci?n de cotizaci?n:', rollbackErr.message);
                }
                res.status(500).json({ error: mensaje });
              });
            };

            const fechaListo = formatearFechaHoraMySQL(new Date());
            const insertPedidoSql = `
              INSERT INTO pedidos (
                cuenta_id, mesa, cliente, modo_servicio, nota, estado, subtotal, impuesto, total,
                descuento_porcentaje, descuento_monto, cliente_documento, fecha_listo, creado_por, comentarios,
                negocio_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(
              insertPedidoSql,
              [
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
              ],
              function (pedidoErr) {
                if (pedidoErr) {
                  return rollback('Error al crear el pedido desde la cotizaci?n', pedidoErr);
                }

                const pedidoId = this.lastID;
                const cuentaAsignada = pedidoId;

                const asegurarCuentaId = (callback) => {
                  db.run(
                    'UPDATE pedidos SET cuenta_id = COALESCE(cuenta_id, ?) WHERE id = ? AND negocio_id = ?',
                    [cuentaAsignada, pedidoId, negocioIdFactura],
                    (cuentaErr) => {
                      if (cuentaErr) {
                        console.warn('No se pudo asignar cuenta al pedido creado de cotizaci?n:', cuentaErr.message);
                      }
                      callback();
                    }
                  );
                };

                const insertarDetalle = (indice) => {
                  if (indice >= totales.items.length) {
                    return asegurarCuentaId(() => actualizarStock(0));
                  }

                  const item = totales.items[indice];
                  db.run(
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
                    ],
                    (detalleErr) => {
                      if (detalleErr) {
                        return rollback('Error al guardar el detalle del pedido', detalleErr);
                      }
                      insertarDetalle(indice + 1);
                    }
                  );
                };

                const cantidadesEntries = Array.from(cantidades.entries());

                const actualizarStock = (indice) => {
                  if (indice >= cantidadesEntries.length) {
                    return db.run(
                      "UPDATE cotizaciones SET estado = 'facturada', pedido_id = ? WHERE id = ? AND negocio_id = ?",
                      [pedidoId, id, negocioIdFactura],
                      (updateCotErr) => {
                        if (updateCotErr) {
                          return rollback('Error al actualizar la cotizaci?n a facturada', updateCotErr);
                        }
                        db.run('COMMIT', (commitErr) => {
                          if (commitErr) {
                            return rollback('Error al confirmar pedido generado', commitErr);
                          }

                          res.status(201).json({
                            ok: true,
                            pedido: {
                              id: pedidoId,
                              cuenta_id: cuentaAsignada,
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
                          });
                        });
                      }
                    );
                  }

                  const [productoId, cantidad] = cantidadesEntries[indice];
                  db.run(
                    'UPDATE productos SET stock = stock - ? WHERE id = ? AND negocio_id = ?',
                    [cantidad, productoId, negocioIdFactura],
                    function (stockErr) {
                      if (stockErr) {
                        return rollback('Error al actualizar stock de productos', stockErr);
                      }
                      if (this.changes === 0) {
                        return rollback('Error al actualizar stock de productos');
                      }
                      actualizarStock(indice + 1);
                    }
                  );
                };

                insertarDetalle(0);
              }
            );
          });
        });
      });
    }
  );

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
    const pagina = Number(req.query?.pagina ?? 1) || 1;

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

  const negocioId = row.negocio_id || NEGOCIO_ID_DEFAULT;
  const passwordValido = await verificarPassword(password, row.password);
  if (!passwordValido) {
    return res.status(400).json({ ok: false, error: 'Contrasena incorrecta' });
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
        return res.status(500).json({ ok: false, error: 'No se pudo cerrar la sesión' });
      }
      finalizar();
    });
  };

  if (!token) {
    return cerrarPorUsuario();
  }

  cerrarSesionPorToken(token, (err, cambios) => {
    if (err) {
      console.error('Error al cerrar sesión:', err.message);
      return res.status(500).json({ ok: false, error: 'No se pudo cerrar la sesión' });
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

server.listen(PORT, HOST, () => {
  console.log(`Servidor iniciado en http://${HOST}:${PORT}`);
});
