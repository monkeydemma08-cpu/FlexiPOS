// ---------------------------------------------------------------------------
// dgii-ecf.mapper.js — Maps POS pedido data to e-CF XML payload
// ---------------------------------------------------------------------------

const {
  normalizeDateDgii,
  formatMoney,
  normalizeRncDgii,
  normalizeRazonSocial,
} = require('./dgii-core');

// Best-effort syncrono: arma identidad emisor SIN tocar DB. La ruta debe
// pasar `emisorIdentidad` ya resuelto por `resolveEmisorIdentidad()` cuando
// quiere garantizar que el RazonSocial coincida con lo registrado en DGII.
const resolveEmisorIdentidadSync = ({ negocio = {}, configDgii = {} } = {}) => ({
  rnc: normalizeRncDgii(configDgii?.rnc_emisor || negocio?.rnc || ''),
  razonSocial: normalizeRazonSocial(
    configDgii?.razon_social || negocio?.razon_social || negocio?.nombre || ''
  ),
  nombreComercial: normalizeRazonSocial(
    configDgii?.nombre_comercial || negocio?.nombre_comercial || ''
  ),
});

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

const ecfTipoNumerico = (ecfTipo) => {
  const raw = String(ecfTipo || '').toUpperCase().trim();
  if (!raw) return '';
  // Aceptar forma con prefijo: 'E33' -> '33'
  if (ECF_TIPO_NUMERICO[raw]) return ECF_TIPO_NUMERICO[raw];
  // Aceptar forma sin prefijo: '33' -> '33' (siempre que sea un valor conocido)
  if (/^\d{2}$/.test(raw)) {
    const valoresValidos = Object.values(ECF_TIPO_NUMERICO);
    if (valoresValidos.includes(raw)) return raw;
  }
  return '';
};

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
  // 0 = montos NO incluyen ITBIS (precios netos)
  // 1 = montos SI incluyen ITBIS (precios brutos)
  //
  // En este POS los precios mostrados al cliente y guardados en
  // detalle_pedido.precio_unitario YA INCLUYEN ITBIS. El total que el
  // cliente paga = sum(item.precio_unitario * cantidad) - descuentos
  // (sin sumar 18% encima). El campo pedido.subtotal es la base sin
  // ITBIS calculada como total/1.18, e impuesto es la diferencia.
  //
  // Por eso debe ir IndicadorMontoGravado='1' y los totales del header
  // se decomponen del bruto: MontoGravadoI1 = sumBruto / 1.18,
  // TotalITBIS1 = sumBruto - MontoGravadoI1, MontoTotal = sumBruto.
  return '1';
};

// Tasa ITBIS estandar (18%). Se usa para decomponer precios con ITBIS
// incluido en base + impuesto cuando IndicadorMontoGravado='1'.
const ITBIS_RATE = 0.18;
const ITBIS_DIVISOR = 1 + ITBIS_RATE; // 1.18

// ---------------------------------------------------------------------------
// Main mapper: pedido → e-CF payload (flat key-value)
// ---------------------------------------------------------------------------

const buildEcfPayloadFromPedido = ({ pedido, detalle, cliente, negocio, encfData, configDgii, emisorIdentidad = null }) => {
  const tipoEcf = ecfTipoNumerico(pedido.ecf_tipo || determineTipoEcf(pedido.tipo_comprobante));
  const fechaEmision = normalizeDateDgii(pedido.fecha_factura || pedido.fecha_cierre || pedido.fecha_creacion, { fallbackToday: true });
  const ident = emisorIdentidad || resolveEmisorIdentidadSync({ negocio, configDgii });

  const payload = {};

  // IdDoc
  payload.TipoeCF = tipoEcf;
  payload.eNCF = encfData.encf;
  // FechaVencimientoSecuencia: solo para tipos que lo soportan (no E32/E34)
  const tiposConFVS = ['31', '33', '41', '43', '44', '45', '46', '47'];
  if (encfData.fechaVencimiento && tiposConFVS.includes(tipoEcf)) {
    payload.FechaVencimientoSecuencia = encfData.fechaVencimiento;
  }
  // IndicadorNotaCredito: requerido para E34
  if (tipoEcf === '34') {
    payload.IndicadorNotaCredito = '0';
  }

  // IndicadorMontoGravado: requerido para 31, 32, 33, 34, 41, 45
  // (E33 lo exige tras el reset de pruebas DGII de 04/2026 — antes era opcional.)
  const tiposConIndicadorGravado = ['31', '32', '33', '34', '41', '45'];
  if (tiposConIndicadorGravado.includes(tipoEcf)) {
    payload.IndicadorMontoGravado = deriveIndicadorMontoGravado(pedido);
  }

  // TipoIngresos: requerido para 31, 32, 33, 34, 44, 45, 46.
  // (E33 y E34 lo requieren tras el reset de pruebas DGII de 04/2026 — antes era
  //  opcional para E34, ahora la DGII rechaza con "TipoIngresos no es válido"
  //  si falta. E41/E43/E47 NO lo usan.)
  const tiposConTipoIngresos = ['31', '32', '33', '34', '44', '45', '46'];
  if (tiposConTipoIngresos.includes(tipoEcf)) {
    payload.TipoIngresos = '01';
  }

  // TipoPago: todos excepto 43
  // FormasPago: todos excepto 43 y 34 (E34 no lleva TablaFormasPago)
  if (tipoEcf !== '43') {
    payload.TipoPago = deriveTipoPago(pedido);
    if (tipoEcf !== '34') {
      Object.assign(payload, buildFormasPago(pedido));
    }
  }

  // Emisor — usa el resolver para garantizar coherencia RNC <-> RazonSocial
  // (la DGII rechaza si no coinciden con su registro oficial)
  payload.RNCEmisor = ident.rnc;
  payload.RazonSocialEmisor = ident.razonSocial;
  if (ident.nombreComercial && ident.nombreComercial !== ident.razonSocial) {
    payload.NombreComercial = ident.nombreComercial;
  }
  if (negocio.direccion) payload.DireccionEmisor = negocio.direccion;
  if (negocio.telefono) payload['TelefonoEmisor[0]'] = negocio.telefono;
  payload.FechaEmision = fechaEmision;

  // Comprador
  // E43 no lleva comprador. E47 usa IdentificadorExtranjero. Los demas usan RNCComprador.
  const tiposConRncComprador = ['31', '32', '33', '34', '41', '44', '45', '46'];
  const tiposConIdExtranjero = ['46', '47'];
  if (tipoEcf !== '43' && cliente) {
    if (tiposConIdExtranjero.includes(tipoEcf) && !tiposConRncComprador.includes(tipoEcf)) {
      // E47: solo IdentificadorExtranjero
      if (cliente.documento) payload.IdentificadorExtranjero = String(cliente.documento).replace(/[^0-9A-Za-z]/g, '');
    } else if (cliente.documento) {
      const tipoDoc = String(cliente.tipo_documento || '').toUpperCase();
      const docLimpio = String(cliente.documento).replace(/[^0-9]/g, '');
      if (tipoDoc === 'RNC' || tipoDoc === 'CEDULA' || /^\d{9,11}$/.test(docLimpio)) {
        payload.RNCComprador = docLimpio;
      }
    }
    if (cliente.nombre) payload.RazonSocialComprador = cliente.nombre;
    if (cliente.email) payload.CorreoComprador = cliente.email;
    if (cliente.direccion) payload.DireccionComprador = cliente.direccion;
  }

  // Detalle items — acumular sumas por IndicadorFacturacion para garantizar coherencia
  // con los totales del header (DGII valida MontoGravadoI1 == sum(MontoItem WHERE IndFact='1'))
  const items = Array.isArray(detalle) ? detalle : [];
  let sumGravado18 = 0;
  let sumTasaCero = 0;
  let sumExento = 0;
  let sumNoFacturable = 0;

  items.forEach((item, i) => {
    const cantidad = Number(item.cantidad || 1);
    const precioUnit = Number(item.precio_unitario || 0);
    const descuento = Number(item.descuento_monto || 0);
    const montoItem = formatMoney(cantidad * precioUnit - descuento);

    payload[`NumeroLinea[${i}]`] = String(i + 1);

    // IndicadorFacturacion segun tipo e-CF (codigos DGII):
    //   1 = Gravado tasa 18%      → MontoGravadoI1
    //   2 = Gravado tasa 16%      → MontoGravadoI2
    //   3 = Gravado tasa 0%       → MontoGravadoI3 (E46 Exportaciones)
    //   4 = Exento                → MontoExento
    // E43/E44/E47 solo permiten exento (4). E46 (Exportaciones) usa tasa cero (3).
    // Para el resto (E31/E32/E33/E34/E45): si hay ITBIS usa '1', si no usa '4' (Exento).
    let indicadorFact;
    if (tipoEcf === '43' || tipoEcf === '44' || tipoEcf === '47') {
      indicadorFact = '4';
    } else if (tipoEcf === '46') {
      indicadorFact = '3';
    } else {
      indicadorFact = Number(pedido.impuesto || 0) > 0 ? '1' : '4';
    }
    payload[`IndicadorFacturacion[${i}]`] = indicadorFact;

    // Acumular suma por categoria — los totales del header se derivan de aqui
    if (indicadorFact === '1') sumGravado18 += montoItem;
    else if (indicadorFact === '2') sumTasaCero += montoItem;
    else if (indicadorFact === '3') sumExento += montoItem;
    else if (indicadorFact === '4') sumNoFacturable += montoItem;

    // E41/E47: Retencion section required before NombreItem in XSD
    if (tipoEcf === '41') {
      payload[`IndicadorAgenteRetencionoPercepcion[${i}]`] = '1';
      payload[`MontoITBISRetenido[${i}]`] = '0.00';
      payload[`MontoISRRetenido[${i}]`] = '0.00';
    } else if (tipoEcf === '47') {
      payload[`IndicadorAgenteRetencionoPercepcion[${i}]`] = '1';
      payload[`MontoISRRetenido[${i}]`] = '0.00';
    }

    payload[`NombreItem[${i}]`] = item.nombre_producto || item.nombre || `Producto ${item.producto_id}`;
    // E47 (Pagos al Exterior): solo permite servicio (2)
    payload[`IndicadorBienoServicio[${i}]`] = tipoEcf === '47' ? '2' : (item.tipo_producto === 'INSUMO' ? '2' : '1');
    payload[`CantidadItem[${i}]`] = String(cantidad);
    payload[`UnidadMedida[${i}]`] = mapUnidadBase(item.unidad_base);
    payload[`PrecioUnitarioItem[${i}]`] = formatMoney(precioUnit).toFixed(2);
    if (descuento > 0) {
      payload[`DescuentoMonto[${i}]`] = formatMoney(descuento).toFixed(2);
    }
    payload[`MontoItem[${i}]`] = montoItem.toFixed(2);
  });

  // Normalizar sumas a 2 decimales
  sumGravado18 = formatMoney(sumGravado18);
  sumTasaCero = formatMoney(sumTasaCero);
  sumExento = formatMoney(sumExento);
  sumNoFacturable = formatMoney(sumNoFacturable);

  // Descuentos globales (DoR) — afectan MontoTotal pero no la base gravada del header
  const descuentoMonto = Number(pedido.descuento_monto || 0);

  // ----------------------------------------------------------------
  // Totales — Los precios del POS YA INCLUYEN ITBIS (IndicadorMontoGravado='1').
  // Se decomponen los items gravados al 18% en base imponible + ITBIS:
  //   MontoGravadoI1 = round(sumGravado18Bruto / 1.18, 2)
  //   TotalITBIS1   = sumGravado18Bruto - MontoGravadoI1
  //   MontoTotal    = sum(MontoItem) - descuentos globales
  //
  // Items exentos / tasa cero NO se decomponen — su precio ya es el final.
  //
  // El XSD de DGII valida:
  //   sum(MontoItem WHERE IndicadorFacturacion='1') = MontoGravadoI1 + TotalITBIS1
  //   MontoTotal = (MontoGravadoI1 + TotalITBIS1) + (resto items) - descuentos
  // ----------------------------------------------------------------
  const tiposSoloExento = ['43', '44', '47'];
  let totalItbis1 = 0;

  if (tiposSoloExento.includes(tipoEcf)) {
    // Estos tipos solo permiten MontoExento (items marcados '4' o '3')
    payload.MontoExento = formatMoney(sumNoFacturable + sumExento).toFixed(2);
    if (tipoEcf === '47') {
      payload.TotalISRRetencion = '0.00';
    }
  } else if (tipoEcf === '46') {
    // E46 (Exportaciones): gravado a tasa I3 (0%) — items se suman a MontoGravadoI3
    const totalGravadoI3 = formatMoney(sumExento + sumTasaCero);
    payload.MontoGravadoTotal = totalGravadoI3.toFixed(2);
    payload.MontoGravadoI3 = totalGravadoI3.toFixed(2);
    payload.ITBIS3 = '0';
    payload.TotalITBIS = '0.00';
    payload.TotalITBIS3 = '0.00';
  } else if (sumGravado18 > 0) {
    // Decomponer el bruto en base imponible + ITBIS (precios incluyen ITBIS).
    const baseGravadoI1 = formatMoney(sumGravado18 / ITBIS_DIVISOR);
    totalItbis1 = formatMoney(sumGravado18 - baseGravadoI1);
    payload.MontoGravadoTotal = baseGravadoI1.toFixed(2);
    payload.MontoGravadoI1 = baseGravadoI1.toFixed(2);
    payload.ITBIS1 = '18';
    payload.TotalITBIS = totalItbis1.toFixed(2);
    payload.TotalITBIS1 = totalItbis1.toFixed(2);
    if (sumExento + sumNoFacturable > 0) {
      payload.MontoExento = formatMoney(sumExento + sumNoFacturable).toFixed(2);
    }
    // E41 (Compras): requiere totales de retencion
    if (tipoEcf === '41') {
      payload.TotalITBISRetenido = '0.00';
      payload.TotalISRRetencion = '0.00';
    }
  } else {
    // Sin items gravados — todo va a MontoExento
    payload.MontoExento = formatMoney(sumExento + sumNoFacturable).toFixed(2);
  }

  // MontoTotal — sum(MontoItem) - descuentos. Los MontoItem YA incluyen ITBIS,
  // por lo tanto NO se vuelve a sumar totalItbis1.
  let montoTotalCalc;
  if (tipoEcf === '46') {
    montoTotalCalc = formatMoney(sumExento + sumTasaCero + sumNoFacturable - descuentoMonto);
  } else {
    // sumGravado18 ya contiene el ITBIS (precios brutos), no se suma totalItbis1 aparte.
    montoTotalCalc = formatMoney(
      sumGravado18 + sumTasaCero + sumExento + sumNoFacturable - descuentoMonto
    );
  }
  payload.MontoTotal = montoTotalCalc.toFixed(2);

  // Descuentos globales
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

const buildResumenFcPayload = ({ pedido, cliente, negocio, encfData, configDgii, codigoSeguridadeCF, ecfPayload = null, emisorIdentidad = null }) => {
  const tipoEcf = ecfTipoNumerico(pedido.ecf_tipo || 'E32');
  const fechaEmision = normalizeDateDgii(pedido.fecha_factura || pedido.fecha_cierre || pedido.fecha_creacion, { fallbackToday: true });
  const ident = emisorIdentidad || resolveEmisorIdentidadSync({ negocio, configDgii });

  const payload = {};

  payload.TipoeCF = tipoEcf;
  payload.eNCF = encfData.encf;
  payload.TipoIngresos = '01';
  payload.TipoPago = deriveTipoPago(pedido);
  Object.assign(payload, buildFormasPago(pedido));

  payload.RNCEmisor = ident.rnc;
  payload.RazonSocialEmisor = ident.razonSocial;
  payload.FechaEmision = fechaEmision;

  if (cliente?.documento) {
    const docLimpio = String(cliente.documento).replace(/[^0-9]/g, '');
    if (docLimpio.length >= 9) {
      payload.RNCComprador = docLimpio;
      if (cliente.nombre) payload.RazonSocialComprador = cliente.nombre;
    }
  }

  // Si recibimos el payload ECF ya calculado, copiamos los totales para garantizar
  // coherencia perfecta entre ECF y RFCE (DGII compara ambos).
  if (ecfPayload && typeof ecfPayload === 'object') {
    const camposTotales = [
      'MontoGravadoTotal', 'MontoGravadoI1', 'MontoGravadoI2', 'MontoGravadoI3',
      'TotalITBIS', 'TotalITBIS1', 'TotalITBIS2', 'TotalITBIS3',
      'MontoExento', 'MontoTotal',
    ];
    for (const campo of camposTotales) {
      if (ecfPayload[campo] !== undefined) payload[campo] = ecfPayload[campo];
    }
  } else {
    // Fallback (sin payload ECF): usar pedido.subtotal/impuesto/total
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
  }

  if (codigoSeguridadeCF) {
    payload.CodigoSeguridadeCF = codigoSeguridadeCF;
  }

  return payload;
};

// ---------------------------------------------------------------------------
// Nota de credito / debito mapper
// ---------------------------------------------------------------------------

const buildNotaEcfPayload = ({ pedido, detalle, cliente, negocio, encfData, configDgii, referenciaEncf, referenciaFecha, codigoModificacion, emisorIdentidad = null }) => {
  const payload = buildEcfPayloadFromPedido({ pedido, detalle, cliente, negocio, encfData, configDgii, emisorIdentidad });

  if (referenciaEncf) payload.NCFModificado = referenciaEncf;
  // FechaNCFModificado es requerido cuando hay NCFModificado
  payload.FechaNCFModificado = normalizeDateDgii(referenciaFecha || new Date(), { fallbackToday: true });
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

// ---------------------------------------------------------------------------
// Direct payload builder (compras / gastos / notas / especiales)
// Adapts raw external data to the format expected by buildEcfPayloadFromPedido
// ---------------------------------------------------------------------------

const buildEcfPayloadDirecto = ({
  ecfTipo,
  emisor = {},
  comprador = {},
  items = [],
  totales = {},
  fechaEmision = null,
  pagos = {},
  encfData,
  configDgii,
  // Solo para notas (E33/E34)
  referenciaEncf = null,
  referenciaFecha = null,
  codigoModificacion = null,
}) => {
  const tipoNum = ecfTipoNumerico(ecfTipo);
  if (!tipoNum) throw new Error(`Tipo e-CF '${ecfTipo}' no valido`);

  // Construir pseudo-pedido con campos que espera buildEcfPayloadFromPedido
  const pseudoPedido = {
    ecf_tipo: tipoNum,
    fecha_factura: fechaEmision || null,
    subtotal: Number(totales.subtotal || 0),
    impuesto: Number(totales.impuesto || 0),
    total: Number(totales.total || 0),
    descuento_monto: Number(totales.descuento || 0),
    pago_efectivo: Number(pagos.efectivo || 0),
    pago_tarjeta: Number(pagos.tarjeta || 0),
    pago_transferencia: Number(pagos.transferencia || 0),
    pago_credito: Number(pagos.credito || 0),
  };

  // Pseudo-detalle: items en formato de detalle_pedido
  const pseudoDetalle = items.map((it, idx) => ({
    cantidad: Number(it.cantidad || 1),
    precio_unitario: Number(it.precio_unitario || 0),
    descuento_monto: Number(it.descuento_monto || 0),
    nombre_producto: it.nombre || it.descripcion || `Item ${idx + 1}`,
    tipo_producto: it.tipo === 'SERVICIO' ? 'INSUMO' : 'PRODUCTO',
    unidad_base: it.unidad_base || 'UND',
    producto_id: it.producto_id || null,
  }));

  // Pseudo-cliente
  const pseudoCliente = {
    documento: comprador.documento || null,
    tipo_documento: comprador.tipo_documento || null,
    nombre: comprador.nombre || null,
    email: comprador.email || null,
    direccion: comprador.direccion || null,
  };

  // Pseudo-negocio (datos del emisor) — incluir razon_social oficial DGII
  // para que el resolver del mapper la use como RazonSocialEmisor
  const pseudoNegocio = {
    rnc: emisor.rnc || configDgii?.rnc_emisor || '',
    nombre: emisor.nombre || '',
    razon_social: emisor.razon_social || configDgii?.razon_social || emisor.nombre || '',
    nombre_comercial: emisor.nombre_comercial || configDgii?.nombre_comercial || null,
    direccion: emisor.direccion || null,
    telefono: emisor.telefono || null,
  };

  // Notas (E33/E34) usan buildNotaEcfPayload
  if (tipoNum === '33' || tipoNum === '34') {
    return buildNotaEcfPayload({
      pedido: pseudoPedido,
      detalle: pseudoDetalle,
      cliente: pseudoCliente,
      negocio: pseudoNegocio,
      encfData,
      configDgii,
      referenciaEncf: referenciaEncf || '',
      referenciaFecha: referenciaFecha || '',
      codigoModificacion: codigoModificacion || (tipoNum === '33' ? '3' : '1'),
    });
  }

  // Resto: usar el builder estandar
  return buildEcfPayloadFromPedido({
    pedido: pseudoPedido,
    detalle: pseudoDetalle,
    cliente: pseudoCliente,
    negocio: pseudoNegocio,
    encfData,
    configDgii,
  });
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
  buildEcfPayloadDirecto,
  determineEcfFlujo,
};
