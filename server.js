require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
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
        await usuariosRepo.create(usuario);
      }
    } catch (err) {
      console.error('Error al insertar usuarios iniciales:', err?.message || err);
    }
  }
};

const estadosValidos = ['pendiente', 'preparando', 'listo', 'pagado', 'cancelado'];
const ADMIN_PASSWORD = 'admin123';
const SESSION_EXPIRATION_HOURS = 12; // Ventana m?xima para considerar una sesi?n activa

const usuarioRolesPermitidos = ['mesera', 'cocina', 'bar', 'caja'];

const generarTokenSesion = () => crypto.randomBytes(24).toString('hex');

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
      if (adminPassword) updates.password = adminPassword;
      updates.negocio_id = negocioId;
      await usuariosRepo.update(usuarioExistente.id, updates);
    } else {
      let passwordFinal = adminPassword;
      if (!passwordFinal) {
        passwordFinal = Math.random().toString(36).slice(2, 12);
        passwordGenerada = passwordFinal;
      }
      const nuevo = await usuariosRepo.create({
        nombre: nombreParaUsuario,
        usuario: adminUsuario,
        password: passwordFinal,
        rol: 'admin',
        activo: 1,
        negocio_id: negocioId,
        es_super_admin: 0,
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
  };
}

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
  if (!row) {
    return null;
  }

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
        configModulos: usuarioSesion.config_modulos,
        token: usuarioSesion.token,
      };

      callback(null, usuarioSesion);
    })
    .catch((err) => callback(err));
};

const requireUsuarioSesion = (req, res, next) => {
  obtenerUsuarioDesdeHeaders(req, (sessionErr, usuarioSesion) => {
    if (sessionErr) {
      console.error('Error al validar sesi?n:', sessionErr.message || sessionErr);
      return res.status(500).json({ error: 'Error al validar sesi?n' });
    }

    if (!usuarioSesion) {
      return res.status(401).json({ error: 'Sesi?n no v?lida. Inicia sesi?n nuevamente.' });
    }

    if (usuarioSesion.negocio_id == null) {
      console.warn('Usuario sin negocio_id en sesi?n autorizada', usuarioSesion.id);
      return res.status(403).json({ error: 'Acceso restringido: negocio no configurado' });
    }

    req.session = req.session || {};
    req.session.usuario = usuarioSesion;
    req.usuarioSesion = usuarioSesion;
    req.sesion = req.sesion || {
      usuarioId: usuarioSesion.id,
      rol: usuarioSesion.rol,
      negocioId: usuarioSesion.negocio_id,
      esSuperAdmin: esSuperAdmin(usuarioSesion),
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

const aplicarAjusteInsumos = (pedidoId, opciones = {}, callback) => {
  const {
    signo = -1, // -1 descuenta, +1 repone
    omitirSiYaAplicado = false,
    revertirSoloSiMarcado = false,
    marcarFlag = true,
    usarTransaccionExistente = false,
  } = opciones;
  const negocioId = opciones?.negocio_id || NEGOCIO_ID_DEFAULT;

  if (!pedidoId) return callback(null);

  db.get(
    'SELECT insumos_descontados FROM pedidos WHERE id = ? AND negocio_id = ?',
    [pedidoId, negocioId],
    (pedidoErr, pedido) => {
    if (pedidoErr) {
      console.error('Error al validar pedido para ajuste de insumos:', pedidoErr.message);
      return callback(pedidoErr);
    }

    if (!pedido) {
      return callback(new Error('Pedido no encontrado'));
    }

    const yaDescontado = Number(pedido.insumos_descontados) === 1;
    if (omitirSiYaAplicado && yaDescontado && signo < 0) {
      return callback(null);
    }

    if (revertirSoloSiMarcado && signo > 0 && !yaDescontado) {
      return callback(null);
    }

    const sql = `
      SELECT dp.producto_id, dp.cantidad AS cantidad_vendida, rd.insumo_id, rd.cantidad_por_unidad
      FROM detalle_pedido dp
      JOIN recetas r ON r.producto_id = dp.producto_id
      JOIN receta_detalle rd ON rd.receta_id = r.id
      WHERE dp.pedido_id = ?
        AND dp.negocio_id = ?
    `;

    db.all(sql, [pedidoId, negocioId], (err, rows) => {
      if (err) {
        console.error('Error al obtener receta para ajuste de insumos:', err.message);
        return callback(err);
      }

      const consumo = new Map();

      (rows || []).forEach((row) => {
        const total = (Number(row.cantidad_vendida) || 0) * (Number(row.cantidad_por_unidad) || 0);
        if (!Number.isFinite(total) || total <= 0) return;
        const acumulado = consumo.get(row.insumo_id) || 0;
        consumo.set(row.insumo_id, acumulado + total);
      });

      const entries = Array.from(consumo.entries());

      const finalizarSinTransaccion = (errFinal) => {
        if (!marcarFlag) return callback(errFinal || null);
        const flagValor = signo < 0 ? 1 : 0;
        db.run(
          'UPDATE pedidos SET insumos_descontados = ? WHERE id = ? AND negocio_id = ?',
          [flagValor, pedidoId, negocioId],
          (flagErr) => {
          if (flagErr && !errFinal) {
            console.error('Error al actualizar flag de insumos:', flagErr.message);
            return callback(flagErr);
          }
          callback(errFinal || null);
        });
      };

      if (!entries.length) {
        return finalizarSinTransaccion(null);
      }

      const aplicarActualizacion = () => {
        const actualizar = (indice) => {
          if (indice >= entries.length) {
            if (!marcarFlag) {
              return (usarTransaccionExistente ? callback : db.run.bind(db, 'COMMIT'))((commitErr) => {
                if (commitErr) {
                  console.error('Error al confirmar ajuste de insumos:', commitErr.message);
                  return callback(commitErr);
                }
                return callback(null);
              });
            }

            const flagValor = signo < 0 ? 1 : 0;
            db.run(
              'UPDATE pedidos SET insumos_descontados = ? WHERE id = ? AND negocio_id = ?',
              [flagValor, pedidoId, negocioId],
              (flagErr) => {
              if (flagErr) {
                console.error('Error al marcar ajuste de insumos:', flagErr.message);
                return (usarTransaccionExistente ? callback : db.run.bind(db, 'ROLLBACK'))(() => callback(flagErr));
              }

              if (usarTransaccionExistente) {
                return callback(null);
              }

              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error('Error al confirmar ajuste de insumos:', commitErr.message);
                  return callback(commitErr);
                }
                return callback(null);
              });
            });
            return;
          }

          const [insumoId, cantidad] = entries[indice];
          db.run(
            'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ? AND negocio_id = ?',
            [cantidad * signo, insumoId, negocioId],
            (updateErr) => {
              if (updateErr) {
                console.warn('No se pudo ajustar insumo:', updateErr.message);
                return (usarTransaccionExistente ? callback : db.run.bind(db, 'ROLLBACK'))(() => callback(updateErr));
              }
              actualizar(indice + 1);
            }
          );
        };

        actualizar(0);
      };

      if (usarTransaccionExistente) {
        aplicarActualizacion();
      } else {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            console.error('No se pudo iniciar transacci?n de ajuste de insumos:', beginErr.message);
            return callback(beginErr);
          }
          aplicarActualizacion();
        });
      }
    });
  });
};

const descontarInsumosPorPedido = (pedidoId, negocioId, callback) =>
  aplicarAjusteInsumos(
    pedidoId,
    {
      signo: -1,
      omitirSiYaAplicado: true,
      revertirSoloSiMarcado: false,
      marcarFlag: true,
      negocio_id: negocioId,
    },
    callback
  );

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
    'SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ? AND negocio_id = ?',
    [pedidoId, negocioId]
  );
  for (const detalle of detalles || []) {
    const cantidad = Number(detalle.cantidad) || 0;
    if (!cantidad) continue;
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
const cerrarCuentaYRegistrarPago = (pedidosEntrada, opciones, callback) => {
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

          descontarInsumosPorPedido(p.id, negocioIdOperacion, (consumoErr) => {
            if (consumoErr) {
              console.error('Error al descontar insumos del pedido:', consumoErr.message);
              return db.run('ROLLBACK', () =>
                callback({
                  status: 500,
                  message: 'El pedido se cerro, pero no se pudieron descontar insumos',
                })
              );
            }

            actualizarPedido(indice + 1);
          });
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

const obtenerPedidosPendientesDeCierre = (fecha, negocioId, _usuarioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = NEGOCIO_ID_DEFAULT;
  } else if (typeof _usuarioId === 'function') {
    callback = _usuarioId;
  }

  const sql = `
    SELECT
      COALESCE(cuenta_id, id) AS id,
      MAX(cuenta_id) AS cuenta_id,
      MAX(mesa) AS mesa,
      MAX(cliente) AS cliente,
      MIN(fecha_cierre) AS fecha_cierre,
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
    WHERE estado = 'pagado'
      AND (cierre_id IS NULL)
      AND DATE(fecha_cierre) = ?
      AND negocio_id = ?
    GROUP BY id
  `;

  db.all(sql, [fecha, negocioId || NEGOCIO_ID_DEFAULT], (err, rows) => {
    if (err) {
      return callback(err);
    }

    callback(null, rows || []);
  });
};

const obtenerSalidasPorFecha = (fecha, negocioId, callback) => {
  if (typeof negocioId === 'function') {
    callback = negocioId;
    negocioId = NEGOCIO_ID_DEFAULT;
  }

  const sql = `
    SELECT id, negocio_id, fecha, descripcion, monto, metodo, created_at
    FROM salidas_caja
    WHERE DATE(fecha) = ?
      AND negocio_id = ?
    ORDER BY created_at ASC
  `;

  db.all(sql, [fecha, negocioId || NEGOCIO_ID_DEFAULT], (err, rows) => {
    if (err) {
      return callback(err);
    }

    const salidas = rows || [];
    const total = salidas.reduce((acc, salida) => acc + (Number(salida.monto) || 0), 0);
    callback(null, { salidas, total });
  });
};

const calcularResumenCajaPorFecha = (fecha, negocioIdOrCallback, maybeCallback) => {
  const callback = typeof negocioIdOrCallback === 'function' ? negocioIdOrCallback : maybeCallback;
  const negocioId =
    typeof negocioIdOrCallback === 'function' || negocioIdOrCallback === undefined
      ? NEGOCIO_ID_DEFAULT
      : negocioIdOrCallback;

  if (typeof callback !== 'function') {
    throw new TypeError('callback debe ser una funci?n');
  }

  obtenerPedidosPendientesDeCierre(fecha, negocioId, null, (err, pedidos) => {
    if (err) {
      return callback(err);
    }

    const obtenerDescuentosLineas = (hecho) => {
      const sql = `
        SELECT SUM(d.cantidad * d.precio_unitario * (COALESCE(d.descuento_porcentaje, 0) / 100.0) + COALESCE(d.descuento_monto, 0)) AS total_descuento
        FROM detalle_pedido d
        JOIN pedidos p ON p.id = d.pedido_id
        WHERE p.estado = 'pagado'
          AND DATE(p.fecha_cierre) = DATE(?)
          AND p.negocio_id = ?
      `;
      db.get(sql, [fecha, negocioId], (descErr, row) => {
        if (descErr) return hecho(descErr);
        hecho(null, Number(row?.total_descuento) || 0);
      });
    };

    obtenerSalidasPorFecha(fecha, negocioId, (salidasErr, salidasData) => {
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
    calcularResumenCajaPorFecha(fechaOperacion, negocio, (err, data) => {
      if (err) return reject(err);
      return resolve(data || {});
    });
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
         AND DATE(fecha_cierre) = ?
         AND negocio_id = ?`,
      [cierreId, fechaOperacion, negocio]
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

app.get('/api/productos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    const negocioId = usuarioSesion.negocio_id ?? NEGOCIO_ID_DEFAULT;

    try {
      const tieneNegocioId = await verificarCategoriaNegocioId();
      const joinCond = tieneNegocioId
        ? 'LEFT JOIN categorias c ON p.categoria_id = c.id AND c.negocio_id = ?'
        : 'LEFT JOIN categorias c ON p.categoria_id = c.id';

      const sql = `
        SELECT p.id, p.nombre, p.precio, p.stock, p.activo, p.categoria_id,
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

        res.json(rows);
      });
    } catch (error) {
      console.error('Error al construir consulta de productos:', error?.message || error);
      res.status(500).json({ error: 'Error al obtener productos' });
    }
  });
});

app.get('/api/caja/resumen-dia', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const negocioId = usuarioSesion?.negocio_id || NEGOCIO_ID_DEFAULT;
    const fecha = normalizarFechaOperacion(req.query?.fecha || new Date());
    const detalle = req.query?.detalle === '1';

    calcularResumenCajaPorFecha(fecha, negocioId, (err, resumen) => {
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
    });
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
          `SELECT p.id, p.nombre, p.precio, p.stock, COALESCE(c.area_preparacion, 'ninguna') AS area_preparacion
           FROM productos p
           LEFT JOIN categorias c ON c.id = p.categoria_id
           WHERE p.id = ? AND p.negocio_id = ?`,
          [productoId, negocioId]
        );

        if (!producto) {
          return res.status(404).json({ error: `Producto ${productoId} no encontrado.` });
        }

        const stockDisponible = Number(producto.stock) || 0;
        if (cantidad > stockDisponible) {
          return res
            .status(400)
            .json({ error: `Stock insuficiente para ${producto.nombre || `el producto ${productoId}`}.` });
        }

        itemsProcesados.push({
          producto_id: producto.id,
          cantidad,
          precio_unitario: Number(producto.precio) || 0,
          nombre: producto.nombre,
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
        const stockResult = await db.run(
          'UPDATE productos SET stock = COALESCE(stock, 0) - ? WHERE id = ? AND negocio_id = ? AND COALESCE(stock, 0) >= ?',
          [item.cantidad, item.producto_id, negocioId, item.cantidad]
        );
        if (stockResult.changes === 0) {
          throw new Error(`No se pudo actualizar el stock del producto ${item.producto_id}.`);
        }
      }

      await db.run('COMMIT');

      descontarInsumosPorPedido(pedidoId, negocioId, (insumoErr) => {
        if (insumoErr) {
          console.error('Error al descontar insumos del pedido creado:', insumoErr.message);
        }
      });

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

    aplicarAjusteInsumos(
      pedidoId,
      { signo: 1, revertirSoloSiMarcado: true, marcarFlag: false, negocio_id: negocioId },
      () => {}
    );

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
      res.json(rows || []);
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
             n.logo_url, n.titulo_sistema, n.activo, n.creado_en
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
                n.logo_url, n.titulo_sistema, n.activo
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
              logo_url, activo
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
            activo: negocioTema.activo,
          },
        });
      }
    );
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

      const creado = await usuariosRepo.create({
        nombre,
        usuario: usuarioNormalizado,
        password,
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

      const payload = { nombre, usuario: usuarioNormalizado, password, rol, activo };
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

    if (!nombre || precio === undefined || precio === null) {
      return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
    }

    const sql = `
      INSERT INTO productos (nombre, precio, stock, categoria_id, activo, negocio_id)
      VALUES (?, ?, COALESCE(?, 0), ?, 1, ?)
    `;
    const params = [nombre, precio, stock, categoria_id, usuarioSesion.negocio_id];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al crear producto:', err.message);
        return res.status(500).json({ error: 'Error al crear producto' });
      }

      res.status(201).json({
        id: this.lastID,
        nombre,
        precio,
        stock: stock !== undefined && stock !== null ? stock : 0,
        categoria_id: categoria_id || null,
        activo: 1,
      });
    });
  });
});

app.put('/api/productos/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const { nombre = null, precio = null, categoria_id = null, activo = null } = req.body;

    const sql = `
      UPDATE productos
      SET nombre = COALESCE(?, nombre),
          precio = COALESCE(?, precio),
          categoria_id = COALESCE(?, categoria_id),
          activo = COALESCE(?, activo)
      WHERE id = ? AND negocio_id = ?
    `;
    const params = [nombre, precio, categoria_id, activo, id, usuarioSesion.negocio_id];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al actualizar producto:', err.message);
        return res.status(500).json({ error: 'Error al actualizar producto' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      res.json({ message: 'Producto actualizado correctamente' });
    });
  });
});

app.put('/api/productos/:id/stock', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined || stock === null) {
      return res.status(400).json({ error: 'El stock es obligatorio' });
    }

    const sql = 'UPDATE productos SET stock = ? WHERE id = ? AND negocio_id = ?';
    const params = [stock, id, usuarioSesion.negocio_id];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al actualizar stock:', err.message);
        return res.status(500).json({ error: 'Error al actualizar stock' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      res.json({ message: 'Stock actualizado correctamente' });
    });
  });
});

app.get('/api/productos/:id/receta', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;

    db.get('SELECT id FROM productos WHERE id = ? AND negocio_id = ?', [id, usuarioSesion.negocio_id], (productoErr, producto) => {
      if (productoErr) {
        console.error('Error al validar producto:', productoErr.message);
        return res.status(500).json({ error: 'Error al obtener receta' });
      }

      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      const sql = `
        SELECT rd.id, rd.insumo_id, i.nombre AS insumo_nombre, i.unidad, rd.cantidad_por_unidad AS cantidad
        FROM recetas r
        JOIN receta_detalle rd ON rd.receta_id = r.id
        JOIN insumos i ON i.id = rd.insumo_id
        WHERE r.producto_id = ? AND r.negocio_id = ?
        ORDER BY rd.id ASC
      `;

      db.all(sql, [id, usuarioSesion.negocio_id], (err, rows) => {
        if (err) {
          console.error('Error al obtener receta:', err.message);
          return res.status(500).json({ error: 'Error al obtener receta' });
        }

        res.json(rows || []);
      });
    });
  });
});

app.put('/api/productos/:id/receta', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const ingredientes = Array.isArray(req.body?.items) ? req.body.items : [];

    db.get('SELECT id FROM productos WHERE id = ? AND negocio_id = ?', [id, usuarioSesion.negocio_id], (productoErr, producto) => {
      if (productoErr) {
        console.error('Error al validar producto:', productoErr.message);
        return res.status(500).json({ error: 'Error al guardar receta' });
      }

      if (!producto) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      if (!Array.isArray(ingredientes)) {
        return res.status(400).json({ error: 'La receta debe ser una lista de insumos' });
      }

      const insumosIds = ingredientes.map((item) => Number(item?.insumo_id)).filter(Number.isFinite);
      const insumosUnicos = Array.from(new Set(insumosIds));
      const cantidadesValidas = ingredientes.every(
        (item) => item && Number.isFinite(Number(item.insumo_id)) && Number(item.cantidad) > 0
      );

      if (!cantidadesValidas) {
        return res.status(400).json({ error: 'Cada ingrediente debe incluir insumo_id y cantidad' });
      }

      if (!ingredientes.length) {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          db.get('SELECT id FROM recetas WHERE producto_id = ? AND negocio_id = ?', [id, usuarioSesion.negocio_id], (buscarErr, receta) => {
            if (buscarErr) {
              console.error('Error al limpiar receta:', buscarErr.message);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Error al guardar receta' });
            }

            if (!receta) {
              db.run('COMMIT');
              return res.json({ ok: true });
            }

            db.run('DELETE FROM receta_detalle WHERE receta_id = ?', [receta.id], (delDetErr) => {
              if (delDetErr) {
                console.error('Error al limpiar detalle de receta:', delDetErr.message);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error al guardar receta' });
              }

              db.run('DELETE FROM recetas WHERE id = ?', [receta.id], (delRecErr) => {
                if (delRecErr) {
                  console.error('Error al limpiar receta:', delRecErr.message);
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Error al guardar receta' });
                }

                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    console.error('Error al confirmar cambios de receta:', commitErr.message);
                    return res.status(500).json({ error: 'Error al guardar receta' });
                  }

                  res.json({ ok: true });
                });
              });
            });
          });
        });
        return;
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.get('SELECT id FROM recetas WHERE producto_id = ? AND negocio_id = ?', [id, usuarioSesion.negocio_id], (buscarErr, receta) => {
          if (buscarErr) {
            console.error('Error al buscar receta:', buscarErr.message);
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error al guardar receta' });
          }

          const finalizarConError = (mensaje, errorObj) => {
            if (errorObj) {
              console.error(mensaje, errorObj.message);
            } else {
              console.error(mensaje);
            }
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Error al revertir cambios de receta:', rollbackErr.message);
              }
              res.status(500).json({ error: 'Error al guardar receta' });
            });
          };

          const upsertReceta = (recetaIdExistente, continuar) => {
            if (recetaIdExistente) {
              return continuar(recetaIdExistente);
            }

            db.run(
              'INSERT INTO recetas (producto_id, negocio_id) VALUES (?, ?)',
              [id, usuarioSesion.negocio_id],
              function (crearErr) {
                if (crearErr) {
                  return finalizarConError('Error al crear receta', crearErr);
                }
                continuar(this.lastID);
              }
            );
          };

          upsertReceta(receta?.id, (recetaIdUsar) => {
            db.run('DELETE FROM receta_detalle WHERE receta_id = ?', [recetaIdUsar], (delErr) => {
              if (delErr) {
                return finalizarConError('Error al limpiar detalle de receta', delErr);
              }

              const stmt = db.prepare(
                `INSERT INTO receta_detalle (receta_id, insumo_id, cantidad_por_unidad, negocio_id) VALUES (?, ?, ?, ?)`
              );

              const insertarDetalle = (indice) => {
                if (indice >= ingredientes.length) {
                  return stmt.finalize(() => {
                    db.run('COMMIT', (commitErr) => {
                      if (commitErr) {
                        console.error('Error al confirmar cambios de receta:', commitErr.message);
                        return res.status(500).json({ error: 'Error al guardar receta' });
                      }

                      res.json({ ok: true });
                    });
                  });
                }

                const ing = ingredientes[indice];
                stmt.run(recetaIdUsar, ing.insumo_id, ing.cantidad, usuarioSesion.negocio_id, (stmtErr) => {
                  if (stmtErr) {
                    return finalizarConError('Error al insertar detalle de receta', stmtErr);
                  }
                  insertarDetalle(indice + 1);
                });
              };

              insertarDetalle(0);
            });
          });
        });
      });
    });
  });
});
app.get('/api/insumos', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { activos } = req.query || {};
    const soloActivos = activos === '1' || activos === 'true';

    const sqlBase = `
      SELECT id, nombre, unidad, categoria, stock_actual, costo_unitario_promedio, activo, comentarios,
             creado_en, actualizado_en
      FROM insumos
      WHERE negocio_id = ?
    `;

    const params = [usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT];
    const sql = soloActivos ? `${sqlBase} AND activo = 1 ORDER BY nombre ASC` : `${sqlBase} ORDER BY nombre ASC`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error al obtener insumos:', err.message);
        return res.status(500).json({ error: 'Error al obtener insumos' });
      }

      res.json(rows);
    });
  });
});

app.post('/api/insumos', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { nombre, unidad, categoria, stock_actual, costo_unitario_promedio, activo = 1, comentarios } =
      req.body || {};

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del insumo es obligatorio' });
    }

    const stock = normalizarNumero(stock_actual, 0);
    const costo = normalizarNumero(costo_unitario_promedio, 0);
    const activoValor = activo ? 1 : 0;

    const sql = `
      INSERT INTO insumos (nombre, unidad, categoria, stock_actual, costo_unitario_promedio, activo, comentarios, negocio_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      nombre.trim(),
      normalizarCampoTexto(unidad, null),
      normalizarCampoTexto(categoria, null),
      stock,
      costo,
      activoValor,
      normalizarCampoTexto(comentarios, null),
      usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al crear insumo:', err.message);
        return res.status(500).json({ error: 'Error al crear insumo' });
      }

      res.status(201).json({
        id: this.lastID,
        nombre: nombre.trim(),
        unidad: normalizarCampoTexto(unidad, null),
        categoria: normalizarCampoTexto(categoria, null),
        stock_actual: stock,
        costo_unitario_promedio: costo,
        activo: activoValor,
        comentarios: normalizarCampoTexto(comentarios, null),
      });
    });
  });
});

app.put('/api/insumos/:id', (req, res) => {
  requireUsuarioSesion(req, res, (usuarioSesion) => {
    const { id } = req.params;
    const { nombre, unidad, categoria, stock_actual, costo_unitario_promedio, activo, comentarios } =
      req.body || {};

    const sql = `
      UPDATE insumos
      SET nombre = COALESCE(?, nombre),
          unidad = COALESCE(?, unidad),
          categoria = COALESCE(?, categoria),
          stock_actual = COALESCE(?, stock_actual),
          costo_unitario_promedio = COALESCE(?, costo_unitario_promedio),
          activo = COALESCE(?, activo),
          comentarios = COALESCE(?, comentarios),
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ? AND negocio_id = ?
    `;

    const params = [
      nombre && nombre.trim() ? nombre.trim() : null,
      normalizarCampoTexto(unidad, null),
      normalizarCampoTexto(categoria, null),
      stock_actual !== undefined ? normalizarNumero(stock_actual, null) : null,
      costo_unitario_promedio !== undefined ? normalizarNumero(costo_unitario_promedio, null) : null,
      activo !== undefined ? (activo ? 1 : 0) : null,
      normalizarCampoTexto(comentarios, null),
      id,
      usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error al actualizar insumo:', err.message);
        return res.status(500).json({ error: 'Error al actualizar insumo' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Insumo no encontrado' });
      }

      res.json({ message: 'Insumo actualizado correctamente' });
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
        SELECT d.id, d.insumo_id, i.nombre, d.cantidad, d.costo_unitario
        FROM detalle_compra d
        JOIN insumos i ON i.id = d.insumo_id
        WHERE d.compra_id = ? AND d.negocio_id = ? AND i.negocio_id = ?
      `;

      db.all(detalleSql, [id, negocioId, negocioId], (detalleErr, detalles) => {
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
      const insumoId = item?.insumo_id;
      const cantidad = normalizarNumero(item?.cantidad, 0);
      const costoUnitario = normalizarNumero(item?.costo_unitario, 0);

      if (!insumoId || cantidad <= 0 || costoUnitario < 0) {
        return res
          .status(400)
          .json({ error: 'Cada detalle debe incluir un insumo v?lido, cantidad > 0 y costo unitario' });
      }

      detallesLimpios.push({ insumo_id: insumoId, cantidad, costo_unitario: costoUnitario });
    }

    const montoGravadoValor = normalizarNumero(monto_gravado, 0);
    const impuestoValor = normalizarNumero(impuesto, 0);
    const totalValor = normalizarNumero(total, montoGravadoValor + impuestoValor);
    const montoExentoValor = normalizarNumero(monto_exento, 0);

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
        INSERT INTO detalle_compra (compra_id, insumo_id, cantidad, costo_unitario, negocio_id)
        VALUES (?, ?, ?, ?, ?)
      `;

        db.run(
          sql,
          [compraId, detalle.insumo_id, detalle.cantidad, detalle.costo_unitario, negocioId],
          (detalleErr) => {
            if (detalleErr) {
              return finalizarConError('Error al guardar el detalle de compra', detalleErr);
            }
            insertarDetalles(compraId, indice + 1, callback);
          }
        );
      };

      const actualizarInsumos = (compraId, indice) => {
        if (indice >= detallesLimpios.length) {
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
        }

        const detalle = detallesLimpios[indice];

        db.get(
          'SELECT stock_actual, costo_unitario_promedio FROM insumos WHERE id = ? AND negocio_id = ?',
          [detalle.insumo_id, negocioId],
          (insumoErr, insumo) => {
            if (insumoErr) {
              return finalizarConError('Error al consultar insumo', insumoErr);
            }

            if (!insumo) {
              return finalizarConError('Insumo no encontrado al registrar compra');
            }

            const stockActual = Number(insumo.stock_actual) || 0;
            const costoActual = Number(insumo.costo_unitario_promedio) || 0;
            const nuevoStock = stockActual + detalle.cantidad;
            let nuevoCosto = costoActual;
            if (nuevoStock > 0) {
              nuevoCosto = (stockActual * costoActual + detalle.cantidad * detalle.costo_unitario) / nuevoStock;
            }

            const updateSql = `
          UPDATE insumos
          SET stock_actual = ?,
              costo_unitario_promedio = ?,
              actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ? AND negocio_id = ?
        `;

            db.run(updateSql, [nuevoStock, nuevoCosto, detalle.insumo_id, negocioId], (updateErr) => {
              if (updateErr) {
                return finalizarConError('Error al actualizar inventario de insumos', updateErr);
              }
              actualizarInsumos(compraId, indice + 1);
            });
          }
        );
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
          insertarDetalles(compraId, 0, () => actualizarInsumos(compraId, 0));
        });
      };

      insertarCompra();
    });
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
               p.stock AS stock_producto
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
          const cantidad = normalizarNumero(item.cantidad, 0);
          if (cantidad <= 0) {
            return res.status(400).json({ error: 'Hay items sin cantidad v?lida en la cotizaci?n' });
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

                        aplicarAjusteInsumos(
                          pedidoId,
                          {
                            signo: -1,
                            marcarFlag: true,
                            omitirSiYaAplicado: false,
                            usarTransaccionExistente: true,
                            negocio_id: negocioIdFactura,
                          },
                          (insumoErr) => {
                            if (insumoErr) {
                              return rollback('Error al descontar insumos del pedido creado', insumoErr);
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
                    );
                  }

                  const [productoId, cantidad] = cantidadesEntries[indice];
                  db.run(
                    'UPDATE productos SET stock = stock - ? WHERE id = ?',
                    [cantidad, productoId],
                    (stockErr) => {
                      if (stockErr) {
                        return rollback('Error al actualizar stock de productos', stockErr);
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
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña son obligatorios' });
  }

  let row;
  try {
    row = await usuariosRepo.findByUsuario(usuario);
  } catch (err) {
    console.error('Error al buscar usuario:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Error al iniciar sesión' });
  }

  if (!row) {
    return res.status(400).json({ ok: false, error: 'Usuario no encontrado' });
  }

  if (!row.activo) {
    return res.status(403).json({ ok: false, error: 'El usuario está inactivo' });
  }

  if (row.password !== password) {
    return res.status(400).json({ ok: false, error: 'Contraseña incorrecta' });
  }

  const negocioId = row.negocio_id || NEGOCIO_ID_DEFAULT;
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
            console.error('Error al registrar sesión:', insertErr.message);
            return res.status(500).json({ ok: false, error: 'Error al iniciar sesión' });
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
