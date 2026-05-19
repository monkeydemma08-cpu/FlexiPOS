const mysql = require('mysql2/promise');

const {
  MYSQL_HOST = 'localhost',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '',
  MYSQL_DATABASE = '',
  MYSQL_PORT = 3306,
  MYSQL_POOL_LIMIT = '15',
} = process.env;

// Pool de conexiones MySQL con configuracion defensiva:
//   - enableKeepAlive: mantiene viva la conexion para evitar que MySQL la
//     cierre por inactividad (default 8 horas), lo cual dejaria al pool con
//     conexiones zombie que cuelgan los requests.
//   - keepAliveInitialDelay: cuando empezar a hacer keep-alive (ms).
//   - connectionLimit: 15 da margen sobre los 10 originales. Si el polling
//     se acumula, hay 5 conexiones de buffer para auth.
//   - queueLimit: 50. Antes era 0 (ilimitado). Con cola ilimitada, si el
//     pool se agota, los requests se acumulan eternamente. Con limite, fallan
//     rapido y devuelven 503 en vez de colgar.
//   - connectTimeout: 10s para abrir nuevas conexiones (default 10s, explicito).
const pool = mysql.createPool({
  host: MYSQL_HOST,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  port: Number(MYSQL_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: Math.max(Number(MYSQL_POOL_LIMIT) || 15, 5),
  queueLimit: 50,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000, // 10s
  connectTimeout: 10_000, // 10s
});

// Logging defensivo: si el pool se agota, queremos saberlo en producción.
let _ultimoPoolWarnAt = 0;
pool.on?.('enqueue', () => {
  const ahora = Date.now();
  if (ahora - _ultimoPoolWarnAt > 30_000) {
    _ultimoPoolWarnAt = ahora;
    console.warn(
      '[mysql-pool] Pool agotado, request en cola. Considera subir MYSQL_POOL_LIMIT o reducir polling.'
    );
  }
});

async function query(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('Error ejecutando consulta MySQL:', error);
    throw error;
  }
}

// Helper: devuelve metricas del pool para health check / debugging.
function poolStats() {
  try {
    // mysql2 expone _allConnections, _freeConnections, _connectionQueue
    return {
      total: pool.pool?._allConnections?.length ?? null,
      free: pool.pool?._freeConnections?.length ?? null,
      queue: pool.pool?._connectionQueue?.length ?? null,
      limit: pool.pool?.config?.connectionLimit ?? null,
    };
  } catch (_) {
    return null;
  }
}

module.exports = { query, pool, poolStats };
