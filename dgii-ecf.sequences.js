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

  try {
    await db.run('BEGIN');
    const row = await db.get(
      'SELECT correlativo, correlativo_inicial, correlativo_fin, fecha_vencimiento, rnc_emisor, activa FROM secuencias_ecf WHERE tipo = ? AND negocio_id = ? FOR UPDATE',
      [tipoNorm, negocioId]
    );

    if (!row || row.correlativo == null) {
      await db.run('ROLLBACK');
      throw new Error(`No existe secuencia e-CF para tipo ${tipoNorm}. Inicializa la secuencia primero.`);
    }

    if (row.activa != null && Number(row.activa) === 0) {
      await db.run('ROLLBACK');
      throw new Error(`La secuencia e-CF tipo ${tipoNorm} esta desactivada para este negocio.`);
    }

    const correlativo = Number(row.correlativo);
    if (correlativo > MAX_CORRELATIVO) {
      await db.run('ROLLBACK');
      throw new Error(`La secuencia e-CF tipo ${tipoNorm} alcanzo el limite de ${MAX_CORRELATIVO.toLocaleString()}.`);
    }

    // Si hay rango definido (fin > 0), validar que no se haya excedido.
    const correlativoFin = row.correlativo_fin != null ? Number(row.correlativo_fin) : null;
    if (correlativoFin && correlativoFin > 0 && correlativo > correlativoFin) {
      await db.run('ROLLBACK');
      throw new Error(`La secuencia e-CF tipo ${tipoNorm} agoto su rango (fin = ${correlativoFin}). Solicita una nueva secuencia a la DGII.`);
    }

    const encf = formatEncf(tipoNorm, correlativo);
    const nuevoCorrelativo = correlativo + 1;

    await db.run(
      'UPDATE secuencias_ecf SET correlativo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE tipo = ? AND negocio_id = ?',
      [nuevoCorrelativo, tipoNorm, negocioId]
    );
    await db.run('COMMIT');

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
    try { await db.run('ROLLBACK'); } catch (_) {}
    throw error;
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

const inicializarSecuencia = async (
  tipo,
  rncEmisor,
  negocioId,
  db,
  {
    correlativoInicial = 1,
    correlativoFin = null,
    fechaVencimiento = null,
    activa = 1,
  } = {}
) => {
  const tipoNorm = String(tipo || '').toUpperCase().trim();
  if (!tipoNorm) throw new Error('Tipo e-CF requerido.');
  const inicial = Math.max(Number(correlativoInicial) || 1, 1);
  const fin = correlativoFin != null && correlativoFin !== '' ? Number(correlativoFin) || null : null;
  const activaFlag = Number(activa) === 0 ? 0 : 1;
  await db.run(
    `INSERT INTO secuencias_ecf (tipo, rnc_emisor, correlativo, correlativo_inicial, correlativo_fin, fecha_vencimiento, activa, negocio_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rnc_emisor = VALUES(rnc_emisor),
       correlativo = VALUES(correlativo),
       correlativo_inicial = VALUES(correlativo_inicial),
       correlativo_fin = VALUES(correlativo_fin),
       fecha_vencimiento = VALUES(fecha_vencimiento),
       activa = VALUES(activa),
       actualizado_en = CURRENT_TIMESTAMP`,
    [tipoNorm, rncEmisor || '', inicial, inicial, fin, fechaVencimiento || null, activaFlag, negocioId]
  );
};

// Actualiza solo el rango (inicio/fin), vencimiento o flag activa de una secuencia
// existente, SIN tocar el correlativo actual a menos que el inicio se aumente
// (en cuyo caso se mueve el correlativo al nuevo inicio si todavia esta detras).
const actualizarRangoSecuencia = async (tipo, negocioId, db, payload = {}) => {
  const tipoNorm = String(tipo || '').toUpperCase().trim();
  if (!tipoNorm) throw new Error('Tipo e-CF requerido.');

  const row = await db.get(
    'SELECT correlativo, correlativo_inicial, correlativo_fin, fecha_vencimiento, rnc_emisor, activa FROM secuencias_ecf WHERE tipo = ? AND negocio_id = ?',
    [tipoNorm, negocioId]
  );
  if (!row) {
    const error = new Error(`No existe secuencia e-CF para tipo ${tipoNorm}.`);
    error.status = 404;
    throw error;
  }

  const inicialNuevo =
    payload.correlativoInicial != null && payload.correlativoInicial !== ''
      ? Math.max(Number(payload.correlativoInicial) || 1, 1)
      : row.correlativo_inicial != null
      ? Number(row.correlativo_inicial)
      : 1;
  const finNuevo =
    payload.correlativoFin != null && payload.correlativoFin !== ''
      ? Number(payload.correlativoFin) || null
      : row.correlativo_fin != null
      ? Number(row.correlativo_fin)
      : null;

  if (finNuevo != null && finNuevo > 0 && finNuevo < inicialNuevo) {
    const error = new Error('El correlativo final no puede ser menor al inicial.');
    error.status = 400;
    throw error;
  }

  const correlativoActual = Number(row.correlativo) || inicialNuevo;
  // Si el inicio nuevo es mayor que el correlativo actual, lo movemos al inicio.
  // Si no, mantenemos el correlativo actual (ya emitio comprobantes).
  const correlativoFinal = correlativoActual < inicialNuevo ? inicialNuevo : correlativoActual;

  const activaFlag =
    payload.activa != null
      ? Number(payload.activa) === 0
        ? 0
        : 1
      : row.activa != null
      ? Number(row.activa)
      : 1;

  const fechaVencimientoFinal =
    payload.fechaVencimiento !== undefined
      ? payload.fechaVencimiento || null
      : row.fecha_vencimiento || null;

  await db.run(
    `UPDATE secuencias_ecf
     SET correlativo_inicial = ?, correlativo_fin = ?, correlativo = ?,
         fecha_vencimiento = ?, activa = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE tipo = ? AND negocio_id = ?`,
    [inicialNuevo, finNuevo, correlativoFinal, fechaVencimientoFinal, activaFlag, tipoNorm, negocioId]
  );

  return {
    tipo: tipoNorm,
    correlativo: correlativoFinal,
    correlativo_inicial: inicialNuevo,
    correlativo_fin: finNuevo,
    fecha_vencimiento: fechaVencimientoFinal,
    activa: activaFlag,
  };
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
    `SELECT tipo, rnc_emisor, correlativo, correlativo_inicial, correlativo_fin,
            fecha_vencimiento, activa, actualizado_en
     FROM secuencias_ecf WHERE negocio_id = ? ORDER BY tipo`,
    [negocioId]
  );
  return (rows || []).map((r) => {
    const correlativo = Number(r.correlativo) || 0;
    const fin = r.correlativo_fin != null ? Number(r.correlativo_fin) : null;
    const inicial = r.correlativo_inicial != null ? Number(r.correlativo_inicial) : null;
    const restantes = fin != null && fin > 0 ? Math.max(fin - correlativo + 1, 0) : null;
    return {
      ...r,
      correlativo,
      correlativo_inicial: inicial,
      correlativo_fin: fin,
      activa: r.activa != null ? Number(r.activa) : 1,
      restantes,
    };
  });
};

module.exports = {
  MAX_CORRELATIVO,
  formatEncf,
  generarEncf,
  obtenerFechaVencimiento,
  inicializarSecuencia,
  actualizarRangoSecuencia,
  avanzarSecuenciaTrasDuplicado,
  obtenerSecuencias,
};
