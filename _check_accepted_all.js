// Lista todos los XMLs ACEPTADOS por DGII para cada tipo (de pedidos y ecf_documentos_externos)
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'kanm',
    port: Number(process.env.MYSQL_PORT || 3306),
  });

  const tipos = ['E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47'];
  for (const t of tipos) {
    // En pedidos
    const [pedRows] = await conn.execute(
      `SELECT id, ecf_encf, ecf_estado, ecf_mensaje_dgii, ecf_xml_generado AS xml
         FROM pedidos
        WHERE ecf_tipo = ? AND ecf_estado = 'ACEPTADO'
        ORDER BY id DESC LIMIT 1`,
      [t]
    );
    // En docs externos
    const tipoNum = t.replace('E','');
    const [extRows] = await conn.execute(
      `SELECT id, ecf_encf, ecf_estado, ecf_mensaje_dgii, ecf_xml_generado AS xml
         FROM ecf_documentos_externos
        WHERE ecf_tipo = ? AND ecf_estado = 'ACEPTADO'
        ORDER BY id DESC LIMIT 1`,
      [tipoNum]
    );
    const r = pedRows[0] || extRows[0];
    console.log('=========================');
    console.log(t, r ? `ACEPTADO (${r.ecf_encf})` : 'SIN ACEPTADOS');
    if (r && r.xml) {
      const idDoc = r.xml.match(/<IdDoc>.*?<\/IdDoc>/s);
      const emisor = r.xml.match(/<Emisor>.*?<\/Emisor>/s);
      const comprador = r.xml.match(/<Comprador>.*?<\/Comprador>/s);
      const totales = r.xml.match(/<Totales>.*?<\/Totales>/s);
      const item1 = r.xml.match(/<Item>.*?<\/Item>/s);
      const ref = r.xml.match(/<InformacionReferencia>.*?<\/InformacionReferencia>/s);
      console.log('IdDoc:    ', idDoc ? idDoc[0] : '-');
      console.log('Comprador:', comprador ? comprador[0] : '(omitido)');
      console.log('Totales:  ', totales ? totales[0] : '-');
      console.log('Item[0]:  ', item1 ? item1[0] : '-');
      if (ref) console.log('InfoRef:  ', ref[0]);
    }
  }
  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });
