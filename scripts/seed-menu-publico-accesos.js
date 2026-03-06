require('dotenv').config();

const crypto = require('crypto');
const { pool } = require('../db-mysql');
const runMigrations = require('../migrations/mysql-multi-negocio');

const DEFAULT_NEGOCIO_ID = 3;
const DEFAULT_MESAS = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5'];

const negocioId = Number(process.argv[2] || process.env.NEGOCIO_ID_MENU_PUBLICO || DEFAULT_NEGOCIO_ID) || DEFAULT_NEGOCIO_ID;
const mesas = process.argv.slice(3).length
  ? process.argv.slice(3).map((value) => String(value || '').trim()).filter(Boolean)
  : DEFAULT_MESAS;

const limpiarTexto = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const buildBaseUrl = () => {
  const raw =
    process.env.MENU_PUBLICO_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    'http://localhost:3000';
  return String(raw || '').replace(/\/+$/, '');
};

const ensureAccess = async (connection, mesa) => {
  const mesaNormalizada = limpiarTexto(mesa);
  if (!mesaNormalizada) {
    throw new Error('Cada mesa debe tener un nombre valido.');
  }

  const [rows] = await connection.execute(
    `SELECT id, token
       FROM menu_publico_accesos
      WHERE negocio_id = ? AND tipo = 'mesa' AND mesa = ?
      LIMIT 1`,
    [negocioId, mesaNormalizada]
  );

  if (rows.length) {
    await connection.execute(
      `UPDATE menu_publico_accesos
          SET nombre = ?, activo = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND negocio_id = ?`,
      [mesaNormalizada, rows[0].id, negocioId]
    );
    return {
      mesa: mesaNormalizada,
      token: rows[0].token,
      created: false,
    };
  }

  while (true) {
    const token = crypto.randomBytes(18).toString('hex');
    try {
      await connection.execute(
        `INSERT INTO menu_publico_accesos (negocio_id, token, nombre, mesa, tipo, activo)
         VALUES (?, ?, ?, ?, 'mesa', 1)`,
        [negocioId, token, mesaNormalizada, mesaNormalizada]
      );
      return {
        mesa: mesaNormalizada,
        token,
        created: true,
      };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
  }
};

const main = async () => {
  await runMigrations();

  const connection = await pool.getConnection();
  try {
    const [negocioRows] = await connection.execute(
      'SELECT id, nombre, slug, activo FROM negocios WHERE id = ? LIMIT 1',
      [negocioId]
    );

    if (!negocioRows.length) {
      throw new Error(`Negocio ${negocioId} no existe.`);
    }

    const negocio = negocioRows[0];
    const baseUrl = buildBaseUrl();
    const accesos = [];

    await connection.beginTransaction();
    for (const mesa of mesas) {
      const acceso = await ensureAccess(connection, mesa);
      accesos.push({
        ...acceso,
        url: `${baseUrl}/menu/${encodeURIComponent(acceso.token)}`,
      });
    }
    await connection.commit();

    console.log(
      JSON.stringify(
        {
          ok: true,
          negocio: {
            id: Number(negocio.id),
            nombre: negocio.nombre,
            slug: negocio.slug,
            activo: Number(negocio.activo) === 1,
          },
          accesos,
        },
        null,
        2
      )
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
