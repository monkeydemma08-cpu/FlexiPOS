// Genera XML actual para cada tipo y muestra IdDoc, Totales, Item[0]
const { buildEcfPayloadDirecto } = require('./dgii-ecf.mapper');
const { buildEcfXml } = require('./dgii-paso2.xml');

const baseEmisor = { rnc: '40229712860', nombre: 'POSIUM', direccion: 'Test', telefono: '809-223-0001' };
const baseConfig = { rnc_emisor: '40229712860' };

const escenarios = [
  { tipo: 'E31', items: [{ nombre: 'batido', cantidad: 2, precio_unitario: 200 }], totales: { subtotal: 400, impuesto: 72, total: 472 } },
  { tipo: 'E32', items: [{ nombre: 'batido', cantidad: 2, precio_unitario: 200 }], totales: { subtotal: 400, impuesto: 72, total: 472 } },
  { tipo: 'E33', items: [{ nombre: 'bizcocho', cantidad: 1, precio_unitario: 200 }], totales: { subtotal: 200, impuesto: 0, total: 200 }, ref: { encf: 'E310000000040', fecha: '17-04-2026', cod: '3' } },
  { tipo: 'E34', items: [{ nombre: 'bizcocho', cantidad: 1, precio_unitario: 1000 }], totales: { subtotal: 1000, impuesto: 180, total: 1180 }, ref: { encf: 'E310000000040', fecha: '17-04-2026', cod: '1' } },
  { tipo: 'E41', items: [{ nombre: 'batido', cantidad: 8, precio_unitario: 350 }], totales: { subtotal: 2800, impuesto: 504, total: 3304 } },
  { tipo: 'E43', items: [{ nombre: 'Cafe', cantidad: 6, precio_unitario: 80 }], totales: { subtotal: 480, impuesto: 0, total: 480 } },
  { tipo: 'E44', items: [{ nombre: 'hamburguesa', cantidad: 2, precio_unitario: 800 }], totales: { subtotal: 1600, impuesto: 0, total: 1600 } },
  { tipo: 'E45', items: [{ nombre: 'bizcocho', cantidad: 6, precio_unitario: 280 }], totales: { subtotal: 1680, impuesto: 302.40, total: 1982.40 } },
  { tipo: 'E46', items: [{ nombre: 'batido', cantidad: 30, precio_unitario: 250 }], totales: { subtotal: 7500, impuesto: 0, total: 7500 } },
  { tipo: 'E47', items: [{ nombre: 'bizcocho', cantidad: 1, precio_unitario: 7500 }], totales: { subtotal: 7500, impuesto: 0, total: 7500 } },
];

for (const e of escenarios) {
  const tipoNum = e.tipo.replace('E','');
  const payload = buildEcfPayloadDirecto({
    ecfTipo: e.tipo,
    emisor: baseEmisor,
    comprador: { documento: '131903045', tipo_documento: 'RNC', nombre: 'NEROZERO SRL', direccion: 'SD' },
    items: e.items,
    totales: e.totales,
    fechaEmision: '19-04-2026',
    pagos: { efectivo: e.totales.total },
    encfData: { encf: `${e.tipo}0000000099`, fechaVencimiento: '31-12-2028' },
    configDgii: baseConfig,
    referenciaEncf: e.ref?.encf || null,
    referenciaFecha: e.ref?.fecha || null,
    codigoModificacion: e.ref?.cod || null,
  });
  const tiposConFVS = ['31','33','41','43','44','45','46','47'];
  const xml = buildEcfXml({
    payload,
    rncEmisorFallback: '40229712860',
    fechaVencimientoSecuenciaFallback: tiposConFVS.includes(tipoNum) ? '31-12-2028' : null,
  });
  const idDoc = xml.match(/<IdDoc>.*?<\/IdDoc>/s);
  const totales = xml.match(/<Totales>.*?<\/Totales>/s);
  const item1 = xml.match(/<Item>.*?<\/Item>/s);
  const comprador = xml.match(/<Comprador>.*?<\/Comprador>/s);
  const ref = xml.match(/<InformacionReferencia>.*?<\/InformacionReferencia>/s);
  console.log('====', e.tipo, '====');
  console.log('IdDoc:    ', idDoc ? idDoc[0] : '-');
  console.log('Comprador:', comprador ? comprador[0] : '(omitido)');
  console.log('Totales:  ', totales ? totales[0] : '-');
  console.log('Item[0]:  ', item1 ? item1[0] : '-');
  if (ref) console.log('InfoRef:  ', ref[0]);
}
