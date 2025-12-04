const { query, pool } = require('./db-mysql');

let activeTransaction = null;

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
      if (!activeTransaction) {
        activeTransaction = await pool.getConnection();
        await activeTransaction.beginTransaction();
      }
      return finish(null);
    }

    if (normalized.startsWith('COMMIT')) {
      if (activeTransaction) {
        await activeTransaction.commit();
        activeTransaction.release();
        activeTransaction = null;
      }
      return finish(null);
    }

    if (normalized.startsWith('ROLLBACK')) {
      if (activeTransaction) {
        await activeTransaction.rollback();
        activeTransaction.release();
        activeTransaction = null;
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
        activeTransaction.release();
        activeTransaction = null;
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
