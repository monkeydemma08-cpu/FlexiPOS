const { query, pool, poolStats } = require('./db-mysql');

let activeTransaction = null;
let activeTransactionStartedAt = 0; // timestamp para watchdog

// SAFETY NET: si una transaccion lleva mas de TX_WATCHDOG_MS sin commit/rollback,
// la liberamos automaticamente. Esto evita que un error inesperado deje la
// conexion pegada y todo el sistema esperando esa connection del pool.
// La transaccion se aborta con rollback (no se confirma data inconsistente).
const TX_WATCHDOG_MS = 30_000; // 30 segundos es mas que suficiente para cualquier tx normal

const _liberarTxColgada = async (motivo = 'watchdog') => {
  const tx = activeTransaction;
  if (!tx) return;
  console.warn(
    `[db.js] Transaccion colgada detectada (${motivo}). Liberando connection para no bloquear el pool. PoolStats:`,
    poolStats?.() || 'n/a'
  );
  activeTransaction = null;
  activeTransactionStartedAt = 0;
  try {
    await tx.rollback();
  } catch (e) {
    // ignore — la connection esta corrupta
  }
  try {
    tx.release();
  } catch (e) {
    // ignore
  }
};

// Cada 10 segundos verifica si activeTransaction lleva demasiado.
setInterval(() => {
  if (!activeTransaction) return;
  const edad = Date.now() - activeTransactionStartedAt;
  if (edad > TX_WATCHDOG_MS) {
    _liberarTxColgada(`edad=${edad}ms`);
  }
}, 10_000).unref?.();

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
  const executor = activeTransaction || pool;
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
      // Si ya hay una tx activa muy vieja, liberarla antes de empezar otra
      // (defensive: nunca debería pasar en flujo normal, pero por si acaso).
      if (activeTransaction && Date.now() - activeTransactionStartedAt > TX_WATCHDOG_MS) {
        await _liberarTxColgada('BEGIN sobre tx vieja');
      }
      if (!activeTransaction) {
        activeTransaction = await pool.getConnection();
        activeTransactionStartedAt = Date.now();
        await activeTransaction.beginTransaction();
      }
      return finish(null);
    }

    if (normalized.startsWith('COMMIT')) {
      if (activeTransaction) {
        await activeTransaction.commit();
        activeTransaction.release();
        activeTransaction = null;
        activeTransactionStartedAt = 0;
      }
      return finish(null);
    }

    if (normalized.startsWith('ROLLBACK')) {
      if (activeTransaction) {
        await activeTransaction.rollback();
        activeTransaction.release();
        activeTransaction = null;
        activeTransactionStartedAt = 0;
      }
      return finish(null);
    }

    const executor = activeTransaction || pool;
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
      if (activeTransaction) {
        try { activeTransaction.release(); } catch (_) {}
        activeTransaction = null;
        activeTransactionStartedAt = 0;
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
};
