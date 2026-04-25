const path = require('path');
require('dotenv').config({ path: 'C:/Users/Usuario/OneDrive/Documents/KANM/.env' });
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT) || 3306,
  });
  const [rows] = await c.execute("SELECT id, ecf_tipo, ecf_encf, ecf_estado, ecf_codigo_dgii, LEFT(ecf_mensaje_dgii, 300) AS msg, LENGTH(ecf_xml_firmado) AS len_firm, LENGTH(ecf_xml_generado) AS len_gen FROM pedidos WHERE ecf_encf LIKE 'E32%' ORDER BY id DESC LIMIT 10");
  console.log(JSON.stringify(rows, null, 2));
  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
