const { query } = require('../db-mysql');

const baseColumns = 'id, nombre, usuario, password, rol, activo, negocio_id, es_super_admin';

async function findByUsuario(usuario) {
  try {
    const rows = await query(
      `SELECT ${baseColumns} FROM usuarios WHERE usuario = ? LIMIT 1`,
      [usuario]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Error buscando usuario por nombre de usuario:', error);
    throw error;
  }
}

async function findById(id) {
  try {
    const rows = await query(`SELECT ${baseColumns} FROM usuarios WHERE id = ? LIMIT 1`, [id]);
    return rows[0] || null;
  } catch (error) {
    console.error('Error buscando usuario por ID:', error);
    throw error;
  }
}

async function getAll(options = {}) {
  const { rol, soloActivos = true, negocioId = null, incluirTodosNegocios = false } = options;

  try {
    const condiciones = [];
    const params = [];

    if (soloActivos) {
      condiciones.push('activo = 1');
    }

    if (rol) {
      condiciones.push('rol = ?');
      params.push(rol);
    }

    if (!incluirTodosNegocios && negocioId) {
      condiciones.push('negocio_id = ?');
      params.push(negocioId);
    }

    let sql = `SELECT ${baseColumns} FROM usuarios`;
    if (condiciones.length) {
      sql += ` WHERE ${condiciones.join(' AND ')}`;
    }
    sql += ' ORDER BY rol ASC, nombre ASC';

    return await query(sql, params);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    throw error;
  }
}

async function create(usuarioData) {
  try {
    const {
      nombre,
      usuario,
      password,
      rol,
      activo = 1,
      negocio_id = 1,
      es_super_admin = 0,
    } = usuarioData;
    const result = await query(
      'INSERT INTO usuarios (nombre, usuario, password, rol, activo, negocio_id, es_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nombre, usuario, password, rol, activo ? 1 : 0, negocio_id || 1, es_super_admin ? 1 : 0]
    );
    const newId = result.insertId || result.lastInsertId;
    return newId ? await findById(newId) : null;
  } catch (error) {
    console.error('Error creando usuario:', error);
    throw error;
  }
}

async function update(id, usuarioData) {
  try {
    const fields = [];
    const params = [];

    if (usuarioData.nombre !== undefined) {
      fields.push('nombre = ?');
      params.push(usuarioData.nombre);
    }
    if (usuarioData.usuario !== undefined) {
      fields.push('usuario = ?');
      params.push(usuarioData.usuario);
    }
    if (usuarioData.password !== undefined) {
      fields.push('password = ?');
      params.push(usuarioData.password);
    }
    if (usuarioData.rol !== undefined) {
      fields.push('rol = ?');
      params.push(usuarioData.rol);
    }
    if (usuarioData.activo !== undefined) {
      fields.push('activo = ?');
      params.push(usuarioData.activo ? 1 : 0);
    }
    if (usuarioData.negocio_id !== undefined) {
      fields.push('negocio_id = ?');
      params.push(usuarioData.negocio_id || 1);
    }
    if (usuarioData.es_super_admin !== undefined) {
      fields.push('es_super_admin = ?');
      params.push(usuarioData.es_super_admin ? 1 : 0);
    }

    if (!fields.length) {
      return findById(id);
    }

    params.push(id);
    await query(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`, params);

    return findById(id);
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    throw error;
  }
}

async function countNonAdmin(negocioId = null) {
  try {
    const condiciones = ['rol != "admin"'];
    const params = [];
    if (negocioId) {
      condiciones.push('negocio_id = ?');
      params.push(negocioId);
    }
    const rows = await query(
      `SELECT COUNT(*) AS total FROM usuarios WHERE ${condiciones.join(' AND ')}`,
      params
    );
    return Number(rows[0]?.total ?? 0);
  } catch (error) {
    console.error('Error contando usuarios no admin:', error);
    throw error;
  }
}

async function removeNonAdmin(id, negocioId = null) {
  try {
    const condiciones = ['id = ?', 'rol != "admin"'];
    const params = [id];
    if (negocioId) {
      condiciones.push('negocio_id = ?');
      params.push(negocioId);
    }
    const result = await query(`DELETE FROM usuarios WHERE ${condiciones.join(' AND ')}`, params);
    return (result?.affectedRows ?? 0) > 0;
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    throw error;
  }
}

module.exports = {
  findByUsuario,
  findById,
  getAll,
  create,
  update,
  countNonAdmin,
  removeNonAdmin,
};
