// ---------------------------------------------------------------------------
// dgii-ecf.mapper.js — Maps POS pedido data to e-CF XML payload
// ---------------------------------------------------------------------------

const { normalizeDateDgii, formatMoney } = require('./dgii-core');

// ---------------------------------------------------------------------------
// Tipo comprobante mapping
// ---------------------------------------------------------------------------

const TIPO_COMPROBANTE_MAP = {
  B01: 'E31',
  B02: 'E32',
  B14: 'E44',
  E31: 'E31',
  E32: 'E32',
  E33: 'E33',
  E34: 'E34',
  E41: 'E41',
  E43: 'E43',
  E44: 'E44',
  E45: 'E45',
  E46: 'E46',
  E47: 'E47',
};

const ECF_TIPO_NUMERICO = {
  E31: '31',
  E32: '32',
  E33: '33',
  E34: '34',
  E41: '41',
  E43: '43',
  E44: '44',
  E45: '45',
  E46: '46',
  E47: '47',
};

const determineTipoEcf = (tipoComprobante) => {
  const raw = String(tipoComprobante || '').toUpperCase().trim();
  return TIPO_COMPROBANTE_MAP[raw] || null;
};

const ecfTipoNumerico = (ecfTipo) => ECF_TIPO_NUMERICO[ecfTipo] || '';

// ---------------------------------------------------------------------------
// DGII unit mapping
// ---------------------------------------------------------------------------

const UNIDAD_MEDIDA_MAP = {
  UND: '5',
  KG: '18',
  LB: '19',
  LT: '24',
  ML: '24',
  GR: '18',
  OZ: '31',
  CAJA: '55',
  DOC: '13',
  PAR: '6',
};

const mapUnidadBase = (unidadBase) => UNIDAD_MEDIDA_MAP[String(unidadBase || 'UND').toUpperCase()] || '5';

// ---------------------------------------------------------------------------
// DGII payment method mapping
// ---------------------------------------------------------------------------

const buildFormasPago = (pedido) => {
  const formas = {};
  let idx = 0;
  const efectivo = Number(pedido.pago_efectivo || 0);
  const tarjeta = Number(pedido.pago_tarjeta || 0);
  const transferencia = Number(pedido.pago_transferencia || 0);

  if (efectivo > 0) {
    formas[`FormaPago[${idx}]`] = '1';
    formas[`MontoPago[${idx}]`] = formatMoney(efectivo).toFixed(2);
    idx++;
  }
  if (tarjeta > 0) {
    formas[`FormaPago[${idx}]`] = '3';
    formas[`MontoPago[${idx}]`] = formatMoney(tarjeta).toFixed(2);
    idx++;
  }
  if (transferencia > 0) {
    formas[`FormaPago[${idx}]`] = '2';
    formas[`MontoPago[${idx}]`] = formatMoney(transferencia).toFixed(2);
    idx++;
  }

  if (idx === 0) {
    const total = Number(pedido.total || 0);
    formas['FormaPago[0]'] = '1';
    formas['MontoPago[0]'] = formatMoney(total).toFixed(2);
  }

  return formas;
};

const deriveTipoPago = (pedido) => {
  const efectivo = Number(pedido.pago_efectivo || 0);
  const tarjeta = Number(pedido.pago_tarjeta || 0);
  const transferencia = Number(pedido.pago_transferencia || 0);
  const total = Number(pedido.total || 0);
  if (efectivo >= total) return '1';
  if (tarjeta > 0 || transferencia > 0) return '1';
  return '1';
};

// ---------------------------------------------------------------------------
// Indicador Monto Gravado
// ---------------------------------------------------------------------------

const deriveIndicadorMontoGravado = (pedido) => {
  const impuesto = Number(pedido.impuesto || 0);
  return impuesto > 0 ? '1' : '0';
};

// ---------------------------------------------------------------------------
// Main mapper: pedido → e-CF payload (flat key-value)
// ---------------------------------------------------------------------------

const buildEcfPayloadFromPedido = ({ pedido, detalle, cliente, negocio, encfData, configDgii }) => {
  const tipoEcf = ecfTipoNumerico(pedido.ecf_tipo || determineTipoEcf(pedido.tipo_comprobante));
  const fechaEmision = normalizeDateDgii(pedido.fecha_factura || pedido.fecha_cierre || pedido.fecha_creacion, { fallbackToday: true });

  const payload = {};

  // IdDoc
  payload.TipoeCF = tipoEcf;
  payload.eNCF = encfData.encf;
  if (encfData.fechaVencimiento) {
    payload.FechaVencimientoSecuencia = encfData.fechaVencimiento;
  }
  payload.IndicadorMontoGravado = deriveIndicadorMontoGravado(pedido);
  payload.TipoIngresos = '01';
  payload.TipoPago = deriveTipoPago(pedido);

  // Formas de pago
  Object.assign(payload, buildFormasPago(pedido));

  // Emisor
  const rncEmisor = configDgii?.rnc_emisor || negocio.rnc || '';
  payload.RNCEmisor = rncEmisor;
  payload.RazonSocialEmisor = negocio.nombre || '';
  if (negocio.direccion) payload.DireccionEmisor = negocio.direccion;
  if (negocio.telefono) payload['TelefonoEmisor[0]'] = negocio.telefono;
  payload.FechaEmision = fechaEmision;

  // Comprador (solo para tipos que requieren datos del comprador)
  const tiposConComprador = ['31', '33', '34', '41', '44', '45', '46', '47'];
  if (tiposConComprador.includes(tipoEcf) && cliente) {
    if (cliente.documento) {
      const tipoDoc = String(cliente.tipo_documento || '').toUpperCase();
      if (tipoDoc === 'RNC' || tipoDoc === 'CEDULA' || /^\d{9,11}$/.test(cliente.documento)) {
        payload.RNCComprador = String(cliente.documento).replace(/[^0-9]/g, '');
      }
    }
    if (cliente.nombre) payload.RazonSocialComprador = cliente.nombre;
    if (cliente.email) payload.CorreoComprador = cliente.email;
    if (cliente.direccion) payload.DireccionComprador = cliente.direccion;
  } else if (tipoEcf === '32' && cliente?.documento) {
    const docLimpio = String(cliente.documento).replace(/[^0-9]/g, '');
    if (docLimpio.length >= 9) {
      payload.RNCComprador = docLimpio;
      if (cliente.nombre) payload.RazonSocialComprador = cliente.nombre;
    }
  }

  // Detalle items
  const items = Array.isArray(detalle) ? detalle : [];
  items.forEach((item, i) => {
    const cantidad = Number(item.cantidad || 1);
    const precioUnit = Number(item.precio_unitario || 0);
    const descuento = Number(item.descuento_monto || 0);
    const montoItem = formatMoney(cantidad * precioUnit - descuento);

    payload[`NumeroLinea[${i}]`] = String(i + 1);
    payload[`IndicadorFacturacion[${i}]`] = Number(pedido.impuesto || 0) > 0 ? '1' : '3';
    payload[`NombreItem[${i}]`] = item.nombre_producto || item.nombre || `Producto ${item.producto_id}`;
    payload[`IndicadorBienoServicio[${i}]`] = item.tipo_producto === 'INSUMO' ? '2' : '1';
    payload[`CantidadItem[${i}]`] = String(cantidad);
    payload[`UnidadMedida[${i}]`] = mapUnidadBase(item.unidad_base);
    payload[`PrecioUnitarioItem[${i}]`] = formatMoney(precioUnit).toFixed(2);
    if (descuento > 0) {
      payload[`DescuentoMonto[${i}]`] = formatMoney(descuento).toFixed(2);
    }
    payload[`MontoItem[${i}]`] = montoItem.toFixed(2);
  });

  // Totales
  const subtotal = Number(pedido.subtotal || 0);
  const impuesto = Number(pedido.impuesto || 0);
  const total = Number(pedido.total || 0);

  if (impuesto > 0) {
    payload.MontoGravadoTotal = formatMoney(subtotal).toFixed(2);
    payload.MontoGravadoI1 = formatMoney(subtotal).toFixed(2);
    payload.ITBIS1 = '18';
    payload.TotalITBIS = formatMoney(impuesto).toFixed(2);
    payload.TotalITBIS1 = formatMoney(impuesto).toFixed(2);
  } else {
    payload.MontoExento = formatMoney(subtotal).toFixed(2);
  }
  payload.MontoTotal = formatMoney(total).toFixed(2);

  // Descuentos globales
  const descuentoMonto = Number(pedido.descuento_monto || 0);
  if (descuentoMonto > 0) {
    payload['NumeroLineaDoR[0]'] = '1';
    payload['TipoAjuste[0]'] = '1';
    payload['ValorDescuentooRecargo[0]'] = formatMoney(descuentoMonto).toFixed(2);
    payload['MontoDescuentooRecargo[0]'] = formatMoney(descuentoMonto).toFixed(2);
  }

  return payload;
};

// ---------------------------------------------------------------------------
// Resumen FC mapper (for E32 < 250k)
// ---------------------------------------------------------------------------

const buildResumenFcPayload = ({ pedido, cliente, negocio, encfData, configDgii, codigoSeguridadeCF }) => {
  const tipoEcf = ecfTipoNumerico(pedido.ecf_tipo || 'E32');
  const fechaEmision = normalizeDateDgii(pedido.fecha_factura || pedido.fecha_cierre || pedido.fecha_creacion, { fallbackToday: true });

  const payload = {};

  payload.TipoeCF = tipoEcf;
  payload.eNCF = encfData.encf;
  payload.TipoIngresos = '01';
  payload.TipoPago = deriveTipoPago(pedido);
  Object.assign(payload, buildFormasPago(pedido));

  const rncEmisor = configDgii?.rnc_emisor || negocio.rnc || '';
  payload.RNCEmisor = rncEmisor;
  payload.RazonSocialEmisor = negocio.nombre || '';
  payload.FechaEmision = fechaEmision;

  if (cliente?.documento) {
    const docLimpio = String(cliente.documento).replace(/[^0-9]/g, '');
    if (docLimpio.length >= 9) {
      payload.RNCComprador = docLimpio;
      if (cliente.nombre) payload.RazonSocialComprador = cliente.nombre;
    }
  }

  const subtotal = Number(pedido.subtotal || 0);
  const impuesto = Number(pedido.impuesto || 0);
  const total = Number(pedido.total || 0);

  if (impuesto > 0) {
    payload.MontoGravadoTotal = formatMoney(subtotal).toFixed(2);
    payload.MontoGravadoI1 = formatMoney(subtotal).toFixed(2);
    payload.TotalITBIS = formatMoney(impuesto).toFixed(2);
    payload.TotalITBIS1 = formatMoney(impuesto).toFixed(2);
  } else {
    payload.MontoExento = formatMoney(subtotal).toFixed(2);
  }
  payload.MontoTotal = formatMoney(total).toFixed(2);

  if (codigoSeguridadeCF) {
    payload.CodigoSeguridadeCF = codigoSeguridadeCF;
  }

  return payload;
};

// ---------------------------------------------------------------------------
// Nota de credito / debito mapper
// ---------------------------------------------------------------------------

const buildNotaEcfPayload = ({ pedido, detalle, cliente, negocio, encfData, configDgii, referenciaEncf, referenciaFecha, codigoModificacion }) => {
  const payload = buildEcfPayloadFromPedido({ pedido, detalle, cliente, negocio, encfData, configDgii });

  if (referenciaEncf) payload.NCFModificado = referenciaEncf;
  if (referenciaFecha) payload.FechaNCFModificado = normalizeDateDgii(referenciaFecha);
  if (codigoModificacion) payload.CodigoModificacion = codigoModificacion;

  return payload;
};

// ---------------------------------------------------------------------------
// Determine emission flow
// ---------------------------------------------------------------------------

const determineEcfFlujo = (ecfTipo, montoTotal) => {
  const tipo = ecfTipoNumerico(ecfTipo);
  if (tipo === '32' && Number(montoTotal || 0) < 250000) {
    return 'FC_MENOR_250K';
  }
  return 'ECF_NORMAL';
};

module.exports = {
  TIPO_COMPROBANTE_MAP,
  ECF_TIPO_NUMERICO,
  determineTipoEcf,
  ecfTipoNumerico,
  mapUnidadBase,
  buildFormasPago,
  deriveTipoPago,
  buildEcfPayloadFromPedido,
  buildResumenFcPayload,
  buildNotaEcfPayload,
  determineEcfFlujo,
};
