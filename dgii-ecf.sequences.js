// ---------------------------------------------------------------------------
// dgii-ecf.sequences.js — e-CF sequence management (E31, E32, etc.)
// ---------------------------------------------------------------------------

const MAX_CORRELATIVO = 10_000_000;

const formatEncf = (tipo, correlativo) => {
  const prefix = String(tipo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${prefix}${String(correlativo).padStart(10, '0')}`;
};

const generarEncf = async (tipo, negocioId, db) => {
  const tipoNorm = String(tipo || '').toUpperCase().trim();
  if (!tipoNorm) throw new Error('Tipo e-CF requerido para generar eNCF.');

  const conn = await db.getConnection();
  try {
    await conn.query('START TRANSACTION');
    const [rows] = await conn.query(
      'SELECT correlativo, fecha_vencimiento, rnc_emisor FROM secuencias_ecf WHERE tipo = ? AND negocio_id = ? FOR UPDATE',
      [tipoNorm, negocioId]
    );
    const row = rows?.[0] || (Array.isArray(rows) ? rows : null);

    if (!row || row.correlativo == null) {
      await conn.query('ROLLBACK');
      throw new Error(`No existe secuencia e-CF para tipo ${tipoNorm}. Inicializa la secuencia primero.`);
    }

    const correlativo = Number(row.correlativo);
    if (correlativo > MAX_CORRELATIVO) {
      await conn.query('ROLLBACK');
      throw new Error(`La secuencia e-CF tipo ${tipoNorm} alcanzo el limite de ${MAX_CORRELATIVO.toLocaleString()}.`);
    }

    const encf = formatEncf(tipoNorm, correlativo);
    const nuevoCorrelativo = correlativo + 1;

    await conn.query(
      'UPDATE secuencias_ecf SET correlativo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE tipo = ? AND negocio_id = ?',
      [nuevoCorrelativo, tipoNorm, negocioId]
    );
    await conn.query('COMMIT');

    const fv = row.fecha_vencimiento;
    let fechaVencimiento = '';
    if (fv) {
      const d = fv instanceof Date ? fv : new Date(fv);
      if (!Number.isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        fechaVencimiento = `${dd}-${mm}-${yyyy}`;
      }
    }

    return {
      encf,
      correlativo,
      fechaVencimiento,
      rncEmisor: row.rnc_emisor || '',
    };
  } catch (error) {
    try { await conn.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    if (conn.release) conn.release();
  }
};

const obtenerFechaVencimiento = async (tipo, negocioId, db) => {
  const row = await db.get(
    'SELECT fecha_vencimiento FROM secuencias_ecf WHERE tipo = ? AND negocio_id = ? LIMIT 1',
    [String(tipo || '').toUpperCase(), negocioId]
  );
  if (!row?.fecha_vencimiento) return '';
  const d = row.fecha_vencimiento instanceof Date ? row.fecha_vencimiento : new Date(row.fecha_vencimiento);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

const inicializarSecuencia = async (tipo, rncEmisor, negocioId, db, { correlativoInicial = 1, fechaVencimiento = null } = {}) => {
  const tipoNorm = String(tipo || '').toUpperCase().trim();
  if (!tipoNorm) throw new Error('Tipo e-CF requerido.');
  await db.run(
    `INSERT INTO secuencias_ecf (tipo, rnc_emisor, correlativo, fecha_vencimiento, negocio_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rnc_emisor = VALUES(rnc_emisor),
       correlativo = VALUES(correlativo),
       fecha_vencimiento = VALUES(fecha_vencimiento),
       actualizado_en = CURRENT_TIMESTAMP`,
    [tipoNorm, rncEmisor || '', correlativoInicial, fechaVencimiento || null, negocioId]
  );
};

const avanzarSecuenciaTrasDuplicado = async (tipo, negocioId, db) => {
  const tipoNorm = String(tipo || '').toUpperCase().trim();
  await db.run(
    'UPDATE secuencias_ecf SET correlativo = correlativo + 1, actualizado_en = CURRENT_TIMESTAMP WHERE tipo = ? AND negocio_id = ?',
    [tipoNorm, negocioId]
  );
};

const obtenerSecuencias = async (negocioId, db) => {
  const rows = await db.all(
    'SELECT tipo, rnc_emisor, correlativo, fecha_vencimiento, actualizado_en FROM secuencias_ecf WHERE negocio_id = ? ORDER BY tipo',
    [negocioId]
  );
  return rows || [];
};

module.exports = {
  MAX_CORRELATIVO,
  formatEncf,
  generarEncf,
  obtenerFechaVencimiento,
  inicializarSecuencia,
  avanzarSecuenciaTrasDuplicado,
  obtenerSecuencias,
};
