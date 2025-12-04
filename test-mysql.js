require('dotenv').config();
const { query } = require('./db-mysql');

(async () => {
  try {
    const rows = await query('SELECT 1 AS ok');
    console.log('Conexión MySQL OK:', rows);
    process.exit(0);
  } catch (err) {
    console.error('Error probando MySQL:', err);
    process.exit(1);
  }
})();
