const { query, pool, poolStats } = require('./db-mysql');
const { AsyncLocalStorage } = require('async_hooks');

// ---------------------------------------------------------------------------
// Aislamiento de transacciones POR REQUEST (fix de estabilidad).
//
// ANTES: habia UNA sola variable global `activeTransaction`. Mientras CUALQUIER
// request tenia una transaccion abierta, TODAS las consultas de TODOS los demas
// requests se iban por esa unica conexion (en vez de usar el pool). Bajo carga
// real (varios usuarios + el polling de mesera/cocina/caja/mostrador), todo se
// embotellaba en una sola conexion -> lentitud, "error de sesion" (la consulta
// que valida la sesion quedaba en cola), la RAM se acumulaba y habia que hacer
// `pm2 restart` para destrabar.
//
// AHORA: cada request corre dentro de su propio contexto (AsyncLocalStorage) con
// su propia transaccion. Las consultas de un request SIN transaccion usan el
// pool normal; solo las del request que abrio la tx usan su conexion dedicada.
// Codigo fuera de una request (migraciones al arranque, tareas de fondo) usa un
// contexto global de fallback — ahi no hay concurrencia de requests, es seguro.
// ---------------------------------------------------------------------------
const txStore = new AsyncLocalStorage();

// Contexto de fallback para codigo sin request (migraciones/arranque/tareas).
const _globalCtx = { tx: null, startedAt: 0 };

// Registro de contextos con transaccion activa (para el watchdog).
const _ctxsConTx = new Set();

// SAFETY NET: si una transaccion lleva mas de TX_WATCHDOG_MS sin commit/rollback,
// la liberamos automaticamente para no dejar la conexion pegada. Se aborta con
// rollback (nunca se confirma data inconsistente).
const TX_WATCHDOG_MS = 30_000;

function _ctxActual() {
  return txStore.getStore() || _globalCtx;
}

function _txActiva() {
  return _ctxActual().tx;
}

const _liberarTxColgada = async (ctx, motivo = 'watchdog') => {
  const tx = ctx && ctx.tx;
  if (!tx) return;
  console.warn(
    `[db.js] Transaccion colgada (${motivo}). Liberando connection para no bloquear el pool. PoolStats:`,
    poolStats?.() || 'n/a'
  );
  ctx.tx = null;
  ctx.startedAt = 0;
  _ctxsConTx.delete(ctx);
  try {
    await tx.rollback();
  } catch (e) {
    // ignore — la connection puede estar corrupta
  }
  try {
    tx.release();
  } catch (e) {
    // ignore
  }
};

// Cada 10 segundos revisa si algun contexto tiene una tx demasiado vieja.
setInterval(() => {
  if (!_ctxsConTx.size) return;
  const ahora = Date.now();
  for (const ctx of _ctxsConTx) {
    if (ctx.tx && ahora - ctx.startedAt > TX_WATCHDOG_MS) {
      _liberarTxColgada(ctx, `edad=${ahora - ctx.startedAt}ms`);
    }
  }
}, 10_000).unref?.();

// Middleware de Express: envuelve cada request en su propio contexto de tx, para
// que las transacciones de un usuario no afecten las consultas de los demas.
function transactionContextMiddleware(req, res, next) {
  txStore.run({ tx: null, startedAt: 0 }, () => next());
}

const normalizeParamsAndCallback = (args) => {
  const clone = [...args];
  let callback;
  if (clone.length && typeof clone[clone.length - 1] === 'function') {
    callback = clone.pop();
  }

  let params = [];
  if (clone.length === 1) {
    const only = clone[0];
    if (Array.isArray(only)) {
      params = only;
    } else if (only !== undefined) {
      params = [only];
    }
  } else if (clone.length > 1) {
    params = clone;
  }

  return { params, callback };
};

const transformSql = (sql = '') => {
  if (/^\s*INSERT\s+OR\s+IGNORE/i.test(sql)) {
    const leading = sql.match(/^\s*/)?.[0] || '';
    return `${leading}INSERT IGNORE${sql.slice(leading.length + 'INSERT OR IGNORE'.length)}`;
  }
  return sql;
};

const executeSql = async (sql, params = []) => {
  const executor = _txActiva() || pool;
  return executor.execute(transformSql(sql), params);
};

function serialize(fn) {
  if (typeof fn === 'function') {
    fn();
  }
}

function all(sql, ...args) {
  const { params, callback } = normalizeParamsAndCallback(args);
  const promise = executeSql(sql, params).then(([rows]) => rows);

  if (callback) {
    promise.then((rows) => callback(null, rows)).catch((err) => callback(err));
    return;
  }

  return promise;
}

function get(sql, ...args) {
  const { params, callback } = normalizeParamsAndCallback(args);
  const promise = executeSql(sql, params).then(([rows]) => (Array.isArray(rows) ? rows[0] : undefined));

  if (callback) {
    promise.then((row) => callback(null, row)).catch((err) => callback(err));
    return;
  }

  return promise;
}

async function run(sql, ...args) {
  const { params, callback } = normalizeParamsAndCallback(args);
  const normalized = (sql || '').trim().toUpperCase();
  const context = { lastID: undefined, changes: 0 };

  const finish = (err) => {
    if (callback) {
      callback.call(context, err);
      return;
    }
    if (err) {
      throw err;
    }
    return context;
  };

  try {
    if (normalized.startsWith('BEGIN')) {
      const ctx = _ctxActual();
      // Defensive: si este contexto ya tuviera una tx muy vieja, liberarla.
      if (ctx.tx && Date.now() - ctx.startedAt > TX_WATCHDOG_MS) {
        await _liberarTxColgada(ctx, 'BEGIN sobre tx vieja');
      }
      if (!ctx.tx) {
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        ctx.tx = conn;
        ctx.startedAt = Date.now();
        _ctxsConTx.add(ctx);
      }
      return finish(null);
    }

    if (normalized.startsWith('COMMIT')) {
      const ctx = _ctxActual();
      if (ctx.tx) {
        await ctx.tx.commit();
        ctx.tx.release();
        ctx.tx = null;
        ctx.startedAt = 0;
        _ctxsConTx.delete(ctx);
      }
      return finish(null);
    }

    if (normalized.startsWith('ROLLBACK')) {
      const ctx = _ctxActual();
      if (ctx.tx) {
        await ctx.tx.rollback();
        ctx.tx.release();
        ctx.tx = null;
        ctx.startedAt = 0;
        _ctxsConTx.delete(ctx);
      }
      return finish(null);
    }

    const executor = _txActiva() || pool;
    const [result] = await executor.execute(transformSql(sql), params);

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      context.lastID = result.insertId || result.lastInsertId || context.lastID;
      context.changes = result.affectedRows ?? context.changes;
    } else if (Array.isArray(result)) {
      context.changes = result.length;
    }

    return finish(null);
  } catch (err) {
    if (normalized.startsWith('COMMIT') || normalized.startsWith('ROLLBACK')) {
      const ctx = _ctxActual();
      if (ctx.tx) {
        try { ctx.tx.release(); } catch (_) {}
        ctx.tx = null;
        ctx.startedAt = 0;
        _ctxsConTx.delete(ctx);
      }
    }
    return finish(err);
  }
}

function prepare(sql) {
  return {
    run: (...params) => run(sql, ...params),
    finalize: (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    },
  };
}

function each(sql, ...args) {
  const rest = [...args];
  let completion;
  if (rest.length && typeof rest[rest.length - 1] === 'function') {
    completion = rest.pop();
  }
  const { params, callback } = normalizeParamsAndCallback(rest);

  executeSql(sql, params)
    .then(([rows]) => {
      if (callback) {
        rows.forEach((row, idx) => callback(null, row, idx));
      }
      if (completion && completion !== callback) {
        completion(null, rows.length);
      }
    })
    .catch((err) => {
      if (callback) {
        callback(err);
      }
      if (completion && completion !== callback) {
        completion(err);
      }
    });
}

module.exports = {
  all,
  get,
  run,
  prepare,
  serialize,
  each,
  query,
  transactionContextMiddleware,
};
