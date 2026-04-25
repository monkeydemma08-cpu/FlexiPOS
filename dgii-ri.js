// ---------------------------------------------------------------------------
// dgii-ri.js — Representacion Impresa (RI) para e-CF
//
// Genera el QR oficial DGII (URL ConsultaTimbre / ConsultaTimbreFC) y la
// pagina HTML imprimible que conserva los datos enviados a DGII tal cual,
// segun el requisito del Paso 4 (Certificacion).
// ---------------------------------------------------------------------------

let QRCodeLib = null;
try {
  QRCodeLib = require('qrcode');
} catch (_) {
  QRCodeLib = null;
}

const DGII_QR_HOST = 'https://ecf.dgii.gov.do';

const TIPO_ECF_NOMBRE = {
  '31': 'FACTURA DE CREDITO FISCAL ELECTRONICA',
  '32': 'FACTURA DE CONSUMO ELECTRONICA',
  '33': 'NOTA DE DEBITO ELECTRONICA',
  '34': 'NOTA DE CREDITO ELECTRONICA',
  '41': 'COMPRAS ELECTRONICA',
  '43': 'GASTOS MENORES ELECTRONICA',
  '44': 'REGIMENES ESPECIALES ELECTRONICA',
  '45': 'GUBERNAMENTAL ELECTRONICA',
  '46': 'EXPORTACIONES ELECTRONICA',
  '47': 'PAGOS AL EXTERIOR ELECTRONICA',
};

const detectarAmbiente = (endpoint = '') => {
  const lower = String(endpoint || '').toLowerCase();
  if (lower.includes('testecf')) return 'TesteCF';
  if (lower.includes('certecf')) return 'CerteCF';
  if (lower.includes('//ecf.dgii.gov.do')) return 'eCF';
  if (lower.includes('//fc.dgii.gov.do')) return 'CerteCF';
  return 'CerteCF';
};

const buildQrUrl = ({
  ambiente = 'CerteCF',
  flujo = 'ECF_NORMAL',
  rncEmisor,
  rncComprador = null,
  encf,
  fechaEmision,
  montoTotal,
  fechaFirma = null,
  codigoSeguridad,
}) => {
  const params = new URLSearchParams();
  params.set('RncEmisor', String(rncEmisor || ''));

  if (flujo === 'FC_MENOR_250K') {
    params.set('ENCF', String(encf || ''));
    params.set('MontoTotal', String(montoTotal || ''));
    params.set('CodigoSeguridad', String(codigoSeguridad || ''));
    return `${DGII_QR_HOST}/${ambiente}/ConsultaTimbreFC?${params.toString()}`;
  }

  if (rncComprador) params.set('RncComprador', String(rncComprador));
  params.set('ENCF', String(encf || ''));
  params.set('FechaEmision', String(fechaEmision || ''));
  params.set('MontoTotal', String(montoTotal || ''));
  if (fechaFirma) params.set('FechaFirma', String(fechaFirma));
  params.set('CodigoSeguridad', String(codigoSeguridad || ''));
  return `${DGII_QR_HOST}/${ambiente}/ConsultaTimbre?${params.toString()}`;
};

const generateQrDataUrl = async (qrUrl) => {
  if (!qrUrl || !QRCodeLib) return null;
  try {
    return await QRCodeLib.toDataURL(qrUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (_) {
    return null;
  }
};

// Extrae FechaFirma (DD-MM-YYYY) del XML firmado. La firma DGII suele incluir
// un campo FechaHoraFirma; si no existe, retornamos null y el caller decide.
const extractFechaFirmaFromXml = (xml = '') => {
  if (!xml) return null;
  const match = xml.match(/<FechaHoraFirma[^>]*>([\s\S]*?)<\/FechaHoraFirma>/i);
  if (match) {
    const raw = String(match[1]).trim();
    // Formato esperado DGII: DD-MM-YYYY HH:MM:SS o DD-MM-YYYY
    return raw.slice(0, 10);
  }
  // Fallback: revisar SigningTime de xmldsig si existe
  const sig = xml.match(/<SigningTime[^>]*>([\s\S]*?)<\/SigningTime>/i);
  if (sig) {
    const iso = String(sig[1]).trim();
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${date.getFullYear()}`;
    }
  }
  return null;
};

const fechaHoyDgii = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

const fechaHoyHumano = () => {
  const d = new Date();
  return d.toLocaleString('es-DO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

// Reconstruye items desde el payload flat (NumeroLinea[i], NombreItem[i], ...)
const itemsFromPayload = (payload = {}) => {
  const items = [];
  for (let i = 0; i < 1000; i++) {
    if (payload[`NumeroLinea[${i}]`] === undefined && payload[`NombreItem[${i}]`] === undefined) break;
    items.push({
      linea: payload[`NumeroLinea[${i}]`] || String(i + 1),
      nombre: payload[`NombreItem[${i}]`] || '',
      cantidad: payload[`CantidadItem[${i}]`] || '1',
      unidadMedida: payload[`UnidadMedida[${i}]`] || '',
      precioUnitario: payload[`PrecioUnitarioItem[${i}]`] || '0.00',
      descuento: payload[`DescuentoMonto[${i}]`] || null,
      montoItem: payload[`MontoItem[${i}]`] || '0.00',
      indicadorFact: payload[`IndicadorFacturacion[${i}]`] || '',
    });
  }
  return items;
};

const escapeHtml = (str) =>
  String(str == null ? '' : str).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));

const formatMoneyDisplay = (n) => {
  const num = Number(String(n).replace(/,/g, '') || 0);
  if (Number.isNaN(num)) return String(n || '0.00');
  return num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ---------------------------------------------------------------------------
// Render principal
// ---------------------------------------------------------------------------

const renderRepresentacionImpresaHtml = ({
  emisor = {},
  comprador = {},
  ecfTipo,
  encf,
  fechaEmision = '',
  fechaVencimiento = '',
  fechaFirma = '',
  codigoSeguridad = '',
  qrDataUrl = null,
  qrUrl = '',
  totales = {},
  items = [],
  trackId = '',
  estado = '',
  flujo = 'ECF_NORMAL',
  ambiente = 'CerteCF',
  ncfModificado = '',
  fechaNcfModificado = '',
  codigoModificacion = '',
}) => {
  const tipoNum = String(ecfTipo || '').replace(/^E/, '');
  const tipoNombre = TIPO_ECF_NOMBRE[tipoNum] || `e-CF TIPO ${tipoNum}`;
  const fechaImpresion = fechaHoyHumano();

  const itemsRows = items.map((it) => `
    <tr>
      <td class="cell-num">${escapeHtml(it.linea)}</td>
      <td>${escapeHtml(it.nombre)}</td>
      <td class="cell-num">${escapeHtml(it.cantidad)}</td>
      <td class="cell-money">${escapeHtml(formatMoneyDisplay(it.precioUnitario))}</td>
      <td class="cell-money">${it.descuento ? escapeHtml(formatMoneyDisplay(it.descuento)) : '-'}</td>
      <td class="cell-money">${escapeHtml(formatMoneyDisplay(it.montoItem))}</td>
    </tr>
  `).join('');

  const filaTotal = (label, value) => value !== undefined && value !== null && value !== ''
    ? `<tr><td class="t-label">${escapeHtml(label)}</td><td class="t-value">${escapeHtml(formatMoneyDisplay(value))}</td></tr>`
    : '';

  const referenciaBlock = ncfModificado ? `
    <div class="seccion">
      <div class="seccion-titulo">Documento que modifica</div>
      <div class="grid-2">
        <div><span class="lbl">eNCF modificado:</span> <span class="val">${escapeHtml(ncfModificado)}</span></div>
        <div><span class="lbl">Fecha eNCF modificado:</span> <span class="val">${escapeHtml(fechaNcfModificado)}</span></div>
        <div><span class="lbl">Codigo modificacion:</span> <span class="val">${escapeHtml(codigoModificacion)}</span></div>
      </div>
    </div>
  ` : '';

  const compradorBlock = (comprador.documento || comprador.nombre) ? `
    <div class="seccion">
      <div class="seccion-titulo">Comprador</div>
      <div class="grid-2">
        ${comprador.nombre ? `<div><span class="lbl">Razon Social:</span> <span class="val">${escapeHtml(comprador.nombre)}</span></div>` : ''}
        ${comprador.documento ? `<div><span class="lbl">RNC / Cedula:</span> <span class="val">${escapeHtml(comprador.documento)}</span></div>` : ''}
        ${comprador.direccion ? `<div class="full"><span class="lbl">Direccion:</span> <span class="val">${escapeHtml(comprador.direccion)}</span></div>` : ''}
        ${comprador.email ? `<div><span class="lbl">Correo:</span> <span class="val">${escapeHtml(comprador.email)}</span></div>` : ''}
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Representacion Impresa ${escapeHtml(encf)}</title>
  <style>
    @page { size: Letter; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 18px;
      background: #f4f5f7;
      font-size: 12px;
    }
    .doc {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 24px 28px;
      border: 1px solid #d0d4dc;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 2px solid #1f3a8a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .header-left { flex: 1; }
    .header-right { text-align: right; min-width: 250px; }
    .emisor-nombre { font-size: 18px; font-weight: 700; color: #1f3a8a; margin: 0 0 4px; }
    .emisor-meta { color: #444; line-height: 1.4; }
    .doc-title { font-size: 14px; font-weight: 700; color: #1f3a8a; text-transform: uppercase; }
    .doc-encf {
      display: inline-block;
      background: #1f3a8a;
      color: #fff;
      padding: 4px 10px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.4px;
      margin-top: 4px;
      border-radius: 4px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 999px;
      margin-left: 6px;
      text-transform: uppercase;
    }
    .badge-aceptado { background: #d1fae5; color: #064e3b; }
    .badge-rechazado { background: #fee2e2; color: #7f1d1d; }
    .badge-pendiente { background: #fef3c7; color: #78350f; }
    .seccion { margin: 12px 0; }
    .seccion-titulo {
      font-size: 11px;
      font-weight: 700;
      color: #1f3a8a;
      text-transform: uppercase;
      border-bottom: 1px solid #d0d4dc;
      padding-bottom: 3px;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 18px;
    }
    .grid-2 .full { grid-column: 1 / -1; }
    .lbl { color: #666; font-weight: 600; }
    .val { color: #111; font-weight: 500; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
    }
    table.items thead th {
      background: #f3f4f6;
      border: 1px solid #d0d4dc;
      padding: 6px 8px;
      text-align: left;
      font-weight: 700;
      color: #1f3a8a;
    }
    table.items tbody td {
      border: 1px solid #d0d4dc;
      padding: 5px 8px;
      vertical-align: top;
    }
    .cell-num { text-align: center; }
    .cell-money { text-align: right; font-variant-numeric: tabular-nums; }
    .totales-wrap {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      margin-top: 14px;
    }
    .qr-bloque { text-align: center; }
    .qr-bloque img {
      width: 160px;
      height: 160px;
      border: 1px solid #d0d4dc;
      padding: 4px;
      background: #fff;
    }
    .qr-bloque .codigo {
      margin-top: 6px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .qr-bloque .leyenda {
      font-size: 10px;
      color: #666;
      margin-top: 4px;
      max-width: 180px;
    }
    .totales {
      min-width: 280px;
    }
    table.totales-tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    table.totales-tbl td {
      padding: 4px 8px;
      border-bottom: 1px dashed #d0d4dc;
    }
    table.totales-tbl .t-label { color: #444; }
    table.totales-tbl .t-value {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    table.totales-tbl tr.total td {
      border-top: 2px solid #1f3a8a;
      border-bottom: none;
      padding-top: 8px;
      font-size: 14px;
      font-weight: 700;
      color: #1f3a8a;
    }
    .pie {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid #d0d4dc;
      font-size: 10px;
      color: #555;
      line-height: 1.5;
    }
    .pie .legal {
      font-style: italic;
      color: #1f3a8a;
      margin-top: 4px;
    }
    .acciones {
      max-width: 800px;
      margin: 12px auto;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .acciones button {
      padding: 8px 16px;
      border: 1px solid #1f3a8a;
      background: #1f3a8a;
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    }
    .acciones button.ghost {
      background: #fff;
      color: #1f3a8a;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .doc { border: none; box-shadow: none; padding: 0; }
      .acciones { display: none; }
    }
  </style>
</head>
<body>
  <div class="acciones">
    <button class="ghost" onclick="window.close()">Cerrar</button>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <script>
    // Auto-imprimir cuando ?print=1 (para flujo Paso 5 certificacion DGII).
    (function () {
      try {
        var params = new URLSearchParams(window.location.search || '');
        if (params.get('print') === '1') {
          window.addEventListener('load', function () {
            setTimeout(function () { window.print(); }, 350);
          });
        }
      } catch (_) {}
    })();
  </script>
  <div class="doc">
    <div class="header">
      <div class="header-left">
        <div class="emisor-nombre">${escapeHtml(emisor.nombre || '')}</div>
        <div class="emisor-meta">
          <div><strong>RNC:</strong> ${escapeHtml(emisor.rnc || '')}</div>
          ${emisor.direccion ? `<div>${escapeHtml(emisor.direccion)}</div>` : ''}
          ${emisor.telefono ? `<div>Tel: ${escapeHtml(emisor.telefono)}</div>` : ''}
        </div>
      </div>
      <div class="header-right">
        <div class="doc-title">${escapeHtml(tipoNombre)}</div>
        <div class="doc-encf">${escapeHtml(encf || '')}</div>
        <div style="margin-top:6px;">
          <span class="lbl">Fecha emision:</span> <strong>${escapeHtml(fechaEmision)}</strong>
        </div>
        ${fechaVencimiento ? `<div><span class="lbl">Vence secuencia:</span> ${escapeHtml(fechaVencimiento)}</div>` : ''}
        ${fechaFirma ? `<div><span class="lbl">Fecha firma:</span> ${escapeHtml(fechaFirma)}</div>` : ''}
        ${estado ? `<div style="margin-top:4px;">Estado:
          <span class="badge badge-${String(estado).toLowerCase() === 'aceptado' ? 'aceptado' : (String(estado).toLowerCase() === 'rechazado' ? 'rechazado' : 'pendiente')}">${escapeHtml(estado)}</span>
        </div>` : ''}
        <div style="font-size:10px;color:#666;margin-top:4px;">Ambiente DGII: <strong>${escapeHtml(ambiente)}</strong></div>
        ${trackId ? `<div style="font-size:10px;color:#666;">TrackId: ${escapeHtml(trackId)}</div>` : ''}
      </div>
    </div>

    ${compradorBlock}
    ${referenciaBlock}

    <div class="seccion">
      <div class="seccion-titulo">Detalle</div>
      <table class="items">
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th>Descripcion</th>
            <th style="width:60px;">Cant.</th>
            <th style="width:90px;">Precio Unit.</th>
            <th style="width:80px;">Descuento</th>
            <th style="width:100px;">Importe</th>
          </tr>
        </thead>
        <tbody>${itemsRows || '<tr><td colspan="6" style="text-align:center;color:#666;">Sin items</td></tr>'}</tbody>
      </table>
    </div>

    <div class="totales-wrap">
      <div class="qr-bloque">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR DGII" />` : '<div style="width:160px;height:160px;border:1px dashed #999;display:flex;align-items:center;justify-content:center;color:#999;">Sin QR</div>'}
        ${codigoSeguridad ? `<div class="codigo">${escapeHtml(codigoSeguridad)}</div>` : ''}
        <div class="leyenda">Codigo de seguridad e-CF.<br>Escanee el QR para validar en DGII.</div>
      </div>
      <div class="totales">
        <table class="totales-tbl">
          ${filaTotal('Monto Gravado 18%', totales.MontoGravadoI1)}
          ${filaTotal('Monto Gravado 16%', totales.MontoGravadoI2)}
          ${filaTotal('Monto Tasa 0%', totales.MontoGravadoI3)}
          ${filaTotal('Monto Exento', totales.MontoExento)}
          ${filaTotal('ITBIS 18%', totales.TotalITBIS1)}
          ${filaTotal('ITBIS 16%', totales.TotalITBIS2)}
          ${filaTotal('ITBIS Total', totales.TotalITBIS)}
          ${filaTotal('ITBIS Retenido', totales.TotalITBISRetenido)}
          ${filaTotal('ISR Retenido', totales.TotalISRRetencion)}
          <tr class="total">
            <td class="t-label">MONTO TOTAL</td>
            <td class="t-value">${escapeHtml(formatMoneyDisplay(totales.MontoTotal || 0))}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="pie">
      <div><strong>Representacion Impresa generada:</strong> ${escapeHtml(fechaImpresion)}</div>
      <div><strong>URL validacion:</strong> <span style="word-break:break-all;">${escapeHtml(qrUrl)}</span></div>
      <div class="legal">
        Esta es una representacion impresa de un Comprobante Fiscal Electronico (e-CF).
        Verifique su autenticidad en el portal de la DGII escaneando el codigo QR o accediendo al URL anterior.
      </div>
    </div>
  </div>
</body>
</html>`;
};

// ---------------------------------------------------------------------------
// Helper de alto nivel: arma todo a partir de datos del pedido / documento
// ---------------------------------------------------------------------------

const buildRepresentacionImpresa = async ({
  payload = {},
  encf,
  ecfTipo,
  emisor,
  comprador,
  fechaEmision,
  fechaVencimiento,
  fechaFirma,
  codigoSeguridad,
  totales,
  items,
  trackId,
  estado,
  flujo = 'ECF_NORMAL',
  ambiente = 'CerteCF',
  ncfModificado = '',
  fechaNcfModificado = '',
  codigoModificacion = '',
}) => {
  const itemsFinal = items && items.length ? items : itemsFromPayload(payload);
  const totalesFinal = totales || {
    MontoGravadoI1: payload.MontoGravadoI1,
    MontoGravadoI2: payload.MontoGravadoI2,
    MontoGravadoI3: payload.MontoGravadoI3,
    MontoExento: payload.MontoExento,
    TotalITBIS: payload.TotalITBIS,
    TotalITBIS1: payload.TotalITBIS1,
    TotalITBIS2: payload.TotalITBIS2,
    TotalITBIS3: payload.TotalITBIS3,
    TotalITBISRetenido: payload.TotalITBISRetenido,
    TotalISRRetencion: payload.TotalISRRetencion,
    MontoTotal: payload.MontoTotal,
  };

  const qrUrl = buildQrUrl({
    ambiente,
    flujo,
    rncEmisor: emisor?.rnc || payload.RNCEmisor || '',
    rncComprador: comprador?.documento || payload.RNCComprador || null,
    encf: encf || payload.eNCF || '',
    fechaEmision: fechaEmision || payload.FechaEmision || '',
    montoTotal: totalesFinal.MontoTotal || payload.MontoTotal || '0.00',
    fechaFirma,
    codigoSeguridad,
  });

  const qrDataUrl = await generateQrDataUrl(qrUrl);

  const html = renderRepresentacionImpresaHtml({
    emisor: emisor || {
      rnc: payload.RNCEmisor,
      nombre: payload.RazonSocialEmisor,
      direccion: payload.DireccionEmisor,
      telefono: payload['TelefonoEmisor[0]'],
    },
    comprador: comprador || {
      documento: payload.RNCComprador,
      nombre: payload.RazonSocialComprador,
      direccion: payload.DireccionComprador,
      email: payload.CorreoComprador,
    },
    ecfTipo,
    encf,
    fechaEmision: fechaEmision || payload.FechaEmision || '',
    fechaVencimiento: fechaVencimiento || payload.FechaVencimientoSecuencia || '',
    fechaFirma: fechaFirma || '',
    codigoSeguridad: codigoSeguridad || payload.CodigoSeguridadeCF || '',
    qrDataUrl,
    qrUrl,
    totales: totalesFinal,
    items: itemsFinal,
    trackId,
    estado,
    flujo,
    ambiente,
    ncfModificado: ncfModificado || payload.NCFModificado || '',
    fechaNcfModificado: fechaNcfModificado || payload.FechaNCFModificado || '',
    codigoModificacion: codigoModificacion || payload.CodigoModificacion || '',
  });

  return { html, qrUrl, qrDataUrl };
};

module.exports = {
  buildQrUrl,
  generateQrDataUrl,
  extractFechaFirmaFromXml,
  detectarAmbiente,
  itemsFromPayload,
  renderRepresentacionImpresaHtml,
  buildRepresentacionImpresa,
  fechaHoyDgii,
  TIPO_ECF_NOMBRE,
};
