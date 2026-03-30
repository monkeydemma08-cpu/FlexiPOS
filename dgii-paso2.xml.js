const EMPTY_MARKERS = new Set(['', '#e', '#n/a', '#na', 'n/a', 'na', 'null', 'none', 'no aplica', 'nulo', '-']);

const sanitizeValue = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = String(value.getFullYear()).padStart(4, '0');
    return `${dd}-${mm}-${yyyy}`;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (EMPTY_MARKERS.has(text.toLowerCase())) return null;
  return text;
};

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeLookupKey = (value = '') =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const formatDate = (date = new Date()) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  return `${dd}-${mm}-${yyyy}`;
};

const formatDateTime = (date = new Date()) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
};

const normalizeDate = (value, { fallbackToday = false } = {}) => {
  if (value == null || value === '') return fallbackToday ? formatDate(new Date()) : '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value);
  const text = String(value).trim();
  if (!text) return fallbackToday ? formatDate(new Date()) : '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [yyyy, mm, dd] = text.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (match) {
    const [, a, b, c] = match;
    const yyyy = c.length === 2 ? `20${c}` : c;
    return `${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}-${yyyy}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);
  return fallbackToday ? formatDate(new Date()) : text;
};

const normalizeDateTime = (value) => {
  if (value == null || value === '') return formatDateTime(new Date());
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateTime(value);
  const text = String(value).trim();
  if (!text) return formatDateTime(new Date());
  if (/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatDateTime(parsed);
  return formatDateTime(new Date());
};

const formatFieldValue = (fieldName, value) => {
  if (!hasValue(value)) return '';
  if (fieldName === 'FechaHoraFirma') return normalizeDateTime(value);
  if (/^Fecha/i.test(fieldName)) return normalizeDate(value);
  return String(value).trim();
};

const tag = (name, value, fieldName = name) =>
  hasValue(value) ? `<${name}>${escapeXml(formatFieldValue(fieldName, value))}</${name}>` : '';

const section = (name, inner = '') => (inner ? `<${name}>${inner}</${name}>` : '');

const cleanPayloadEntries = (payload = {}) =>
  Object.entries(payload || {})
    .filter(([key]) => !String(key || '').startsWith('__'))
    .map(([key, value]) => [String(key || '').trim(), sanitizeValue(value)]);

const buildAccessor = (payload = {}) => {
  const entries = cleanPayloadEntries(payload);
  const raw = new Map();
  const normalized = new Map();
  for (const [key, value] of entries) {
    raw.set(key, value);
    const nk = normalizeLookupKey(key);
    if (nk && (!normalized.has(nk) || !hasValue(normalized.get(nk)))) normalized.set(nk, value);
  }
  const accessor = {
    entries,
    get(...candidates) {
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate instanceof RegExp) {
          for (const [key, value] of entries) {
            candidate.lastIndex = 0;
            if (candidate.test(key) && hasValue(value)) return value;
            candidate.lastIndex = 0;
            if (candidate.test(normalizeLookupKey(key)) && hasValue(value)) return value;
          }
          continue;
        }
        const rawKey = String(candidate).trim();
        const rawValue = raw.get(rawKey);
        if (hasValue(rawValue)) return rawValue;
        const normalizedValue = normalized.get(normalizeLookupKey(rawKey));
        if (hasValue(normalizedValue)) return normalizedValue;
      }
      return null;
    },
    getIndexed(fieldName, index, subIndex = null) {
      const base = normalizeLookupKey(fieldName);
      const rawKey = subIndex == null ? `${fieldName}[${index}]` : `${fieldName}[${index}][${subIndex}]`;
      const normalizedKey = subIndex == null ? `${base}_${index}` : `${base}_${index}_${subIndex}`;
      return this.get(rawKey, normalizedKey);
    },
    collectIndices(fieldName) {
      const out = new Set();
      const rawPattern = new RegExp(`^${escapeRegExp(String(fieldName).trim())}\\[(\\d+)\\](?:\\[(\\d+)\\])?$`, 'i');
      const normalizedPattern = new RegExp(`^${escapeRegExp(normalizeLookupKey(fieldName))}_(\\d+)(?:_(\\d+))?$`, 'i');
      for (const [key, value] of entries) {
        if (!hasValue(value)) continue;
        let match = key.match(rawPattern);
        if (!match) match = key.match(normalizedPattern);
        if (match?.[1]) out.add(Number(match[1]));
      }
      return [...out].filter(Number.isFinite).sort((a, b) => a - b);
    },
    collectSubIndices(fieldName, index) {
      const out = new Set();
      const rawPattern = new RegExp(`^${escapeRegExp(String(fieldName).trim())}\\[${Number(index)}\\]\\[(\\d+)\\]$`, 'i');
      const normalizedPattern = new RegExp(`^${escapeRegExp(normalizeLookupKey(fieldName))}_${Number(index)}_(\\d+)$`, 'i');
      for (const [key, value] of entries) {
        if (!hasValue(value)) continue;
        let match = key.match(rawPattern);
        if (!match) match = key.match(normalizedPattern);
        if (match?.[1]) out.add(Number(match[1]));
      }
      return [...out].filter(Number.isFinite).sort((a, b) => a - b);
    },
    has(...candidates) {
      return hasValue(this.get(...candidates));
    },
  };
  return accessor;
};

const renderFields = (accessor, fieldDefs = [], fallbackValues = {}) =>
  fieldDefs
    .map((fieldDef) => {
      const config = typeof fieldDef === 'string' ? { xmlName: fieldDef, keys: [fieldDef] } : fieldDef;
      const keys = config.keys || [config.xmlName];
      const value = accessor.get(...keys);
      return tag(config.xmlName, hasValue(value) ? value : fallbackValues[config.xmlName], keys[0] || config.xmlName);
    })
    .join('');

const wrapSimpleRepeating = (accessor, wrapperName, itemName, fieldName) => {
  const inner = accessor
    .collectIndices(fieldName)
    .map((index) => tag(itemName, accessor.getIndexed(fieldName, index), fieldName))
    .filter(Boolean)
    .join('');
  return section(wrapperName, inner);
};

const buildFormasPago = (accessor) => {
  const indices = new Set([...accessor.collectIndices('FormaPago'), ...accessor.collectIndices('MontoPago')]);
  const inner = [...indices]
    .sort((a, b) => a - b)
    .map((index) =>
      section(
        'FormaDePago',
        tag('FormaPago', accessor.getIndexed('FormaPago', index), 'FormaPago') +
          tag('MontoPago', accessor.getIndexed('MontoPago', index), 'MontoPago')
      )
    )
    .filter(Boolean)
    .join('');
  return section('TablaFormasPago', inner);
};

const buildGroupedRows = ({ accessor, indices, rowName, defs, after = '' }) =>
  [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      const inner =
        defs
          .map((def) => {
            const xmlName = def.xmlName || def.name;
            const fieldName = def.fieldName || xmlName;
            return tag(xmlName, accessor.getIndexed(fieldName, index, def.subIndex ?? null), fieldName);
          })
          .join('') + after(index);
      return section(rowName, inner);
    })
    .filter(Boolean)
    .join('');

const buildNestedIndexedTable = ({ accessor, wrapperName, rowName, baseFields, lineIndex }) => {
  const indices = new Set();
  baseFields.forEach((fieldName) => accessor.collectSubIndices(fieldName, lineIndex).forEach((index) => indices.add(index)));
  const inner = [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      const row = baseFields
        .map((fieldName) => tag(fieldName, accessor.getIndexed(fieldName, lineIndex, index), fieldName))
        .join('');
      return section(rowName, row);
    })
    .filter(Boolean)
    .join('');
  return section(wrapperName, inner);
};

const buildImpuestosAdicionales = (accessor, { otraMoneda = false, includeRate = true } = {}) => {
  const suffix = otraMoneda ? 'OtraMoneda' : '';
  const fields = [
    `TipoImpuesto${suffix}`,
    ...(includeRate ? [`TasaImpuestoAdicional${suffix}`] : []),
    `MontoImpuestoSelectivoConsumoEspecifico${suffix}`,
    `MontoImpuestoSelectivoConsumoAdvalorem${suffix}`,
    `OtrosImpuestosAdicionales${suffix}`,
  ];
  const indices = new Set();
  fields.forEach((fieldName) => accessor.collectIndices(fieldName).forEach((index) => indices.add(index)));
  const wrapperName = otraMoneda ? 'ImpuestosAdicionalesOtraMoneda' : 'ImpuestosAdicionales';
  const rowName = otraMoneda ? 'ImpuestoAdicionalOtraMoneda' : 'ImpuestoAdicional';
  const inner = [...indices]
    .sort((a, b) => a - b)
    .map((index) => section(rowName, fields.map((fieldName) => tag(fieldName, accessor.getIndexed(fieldName, index), fieldName)).join('')))
    .filter(Boolean)
    .join('');
  return section(wrapperName, inner);
};

const buildDetallesItems = (accessor) => {
  const lineIndices = new Set([...accessor.collectIndices('NumeroLinea'), ...accessor.collectIndices('NombreItem'), ...accessor.collectIndices('MontoItem')]);
  const inner = [...lineIndices]
    .sort((a, b) => a - b)
    .map((lineIndex) => {
      const content = [
        tag('NumeroLinea', accessor.getIndexed('NumeroLinea', lineIndex), 'NumeroLinea'),
        buildNestedIndexedTable({ accessor, wrapperName: 'TablaCodigosItem', rowName: 'CodigosItem', baseFields: ['TipoCodigo', 'CodigoItem'], lineIndex }),
        tag('IndicadorFacturacion', accessor.getIndexed('IndicadorFacturacion', lineIndex), 'IndicadorFacturacion'),
        section(
          'Retencion',
          tag('IndicadorAgenteRetencionoPercepcion', accessor.getIndexed('IndicadorAgenteRetencionoPercepcion', lineIndex), 'IndicadorAgenteRetencionoPercepcion') +
            tag('MontoITBISRetenido', accessor.getIndexed('MontoITBISRetenido', lineIndex), 'MontoITBISRetenido') +
            tag('MontoISRRetenido', accessor.getIndexed('MontoISRRetenido', lineIndex), 'MontoISRRetenido')
        ),
        tag('NombreItem', accessor.getIndexed('NombreItem', lineIndex), 'NombreItem'),
        tag('IndicadorBienoServicio', accessor.getIndexed('IndicadorBienoServicio', lineIndex), 'IndicadorBienoServicio'),
        tag('DescripcionItem', accessor.getIndexed('DescripcionItem', lineIndex), 'DescripcionItem'),
        tag('CantidadItem', accessor.getIndexed('CantidadItem', lineIndex), 'CantidadItem'),
        tag('UnidadMedida', accessor.getIndexed('UnidadMedida', lineIndex), 'UnidadMedida'),
        tag('CantidadReferencia', accessor.getIndexed('CantidadReferencia', lineIndex), 'CantidadReferencia'),
        tag('UnidadReferencia', accessor.getIndexed('UnidadReferencia', lineIndex), 'UnidadReferencia'),
        buildNestedIndexedTable({ accessor, wrapperName: 'TablaSubcantidad', rowName: 'SubcantidadItem', baseFields: ['Subcantidad', 'CodigoSubcantidad'], lineIndex }),
        tag('GradosAlcohol', accessor.getIndexed('GradosAlcohol', lineIndex), 'GradosAlcohol'),
        tag('PrecioUnitarioReferencia', accessor.getIndexed('PrecioUnitarioReferencia', lineIndex), 'PrecioUnitarioReferencia'),
        tag('FechaElaboracion', accessor.getIndexed('FechaElaboracion', lineIndex), 'FechaElaboracion'),
        tag('FechaVencimientoItem', accessor.getIndexed('FechaVencimientoItem', lineIndex), 'FechaVencimientoItem'),
        section(
          'Mineria',
          tag('PesoNetoKilogramo', accessor.getIndexed('PesoNetoKilogramo', lineIndex), 'PesoNetoKilogramo') +
            tag('PesoNetoMineria', accessor.getIndexed('PesoNetoMineria', lineIndex), 'PesoNetoMineria') +
            tag('TipoAfiliacion', accessor.getIndexed('TipoAfiliacion', lineIndex), 'TipoAfiliacion') +
            tag('Liquidacion', accessor.getIndexed('Liquidacion', lineIndex), 'Liquidacion')
        ),
        tag('PrecioUnitarioItem', accessor.getIndexed('PrecioUnitarioItem', lineIndex), 'PrecioUnitarioItem'),
        tag('DescuentoMonto', accessor.getIndexed('DescuentoMonto', lineIndex), 'DescuentoMonto'),
        buildNestedIndexedTable({ accessor, wrapperName: 'TablaSubDescuento', rowName: 'SubDescuento', baseFields: ['TipoSubDescuento', 'SubDescuentoPorcentaje', 'MontoSubDescuento'], lineIndex }),
        tag('RecargoMonto', accessor.getIndexed('RecargoMonto', lineIndex), 'RecargoMonto'),
        buildNestedIndexedTable({ accessor, wrapperName: 'TablaSubRecargo', rowName: 'SubRecargo', baseFields: ['TipoSubRecargo', 'SubRecargoPorcentaje', 'MontoSubRecargo'], lineIndex }),
        buildNestedIndexedTable({ accessor, wrapperName: 'TablaImpuestoAdicional', rowName: 'ImpuestoAdicional', baseFields: ['TipoImpuesto'], lineIndex }),
        section(
          'OtraMonedaDetalle',
          tag('PrecioOtraMoneda', accessor.getIndexed('PrecioOtraMoneda', lineIndex), 'PrecioOtraMoneda') +
            tag('DescuentoOtraMoneda', accessor.getIndexed('DescuentoOtraMoneda', lineIndex), 'DescuentoOtraMoneda') +
            tag('RecargoOtraMoneda', accessor.getIndexed('RecargoOtraMoneda', lineIndex), 'RecargoOtraMoneda') +
            tag('MontoItemOtraMoneda', accessor.getIndexed('MontoItemOtraMoneda', lineIndex), 'MontoItemOtraMoneda')
        ),
        tag('MontoItem', accessor.getIndexed('MontoItem', lineIndex), 'MontoItem'),
      ]
        .filter(Boolean)
        .join('');
      return section('Item', content);
    })
    .filter(Boolean)
    .join('');
  return section('DetallesItems', inner);
};

const buildSubtotales = (accessor) => {
  const defs = ['NumeroSubTotal', 'DescripcionSubtotal', 'Orden', 'SubTotalMontoGravadoTotal', 'SubTotalMontoGravadoI1', 'SubTotalMontoGravadoI2', 'SubTotalMontoGravadoI3', 'SubTotaITBIS', 'SubTotaITBIS1', 'SubTotaITBIS2', 'SubTotaITBIS3', 'SubTotalImpuestoAdicional', 'SubTotalExento', 'MontoSubTotal', 'Lineas'];
  if (!defs.some((name) => accessor.has(name))) return '';
  return section('Subtotales', section('Subtotal', renderFields(accessor, defs)));
};

const buildDescuentosORecargos = (accessor) => {
  const indices = new Set([...accessor.collectIndices('NumeroLineaDoR'), ...accessor.collectIndices('TipoAjuste'), ...accessor.collectIndices('MontoDescuentooRecargo')]);
  const inner = [...indices]
    .sort((a, b) => a - b)
    .map((index) =>
      section(
        'DescuentoORecargo',
        tag('NumeroLinea', accessor.getIndexed('NumeroLineaDoR', index), 'NumeroLineaDoR') +
          tag('TipoAjuste', accessor.getIndexed('TipoAjuste', index), 'TipoAjuste') +
          tag('IndicadorNorma1007', accessor.getIndexed('IndicadorNorma1007', index), 'IndicadorNorma1007') +
          tag('DescripcionDescuentooRecargo', accessor.getIndexed('DescripcionDescuentooRecargo', index), 'DescripcionDescuentooRecargo') +
          tag('TipoValor', accessor.getIndexed('TipoValor', index), 'TipoValor') +
          tag('ValorDescuentooRecargo', accessor.getIndexed('ValorDescuentooRecargo', index), 'ValorDescuentooRecargo') +
          tag('MontoDescuentooRecargo', accessor.getIndexed('MontoDescuentooRecargo', index), 'MontoDescuentooRecargo') +
          tag('MontoDescuentooRecargoOtraMoneda', accessor.getIndexed('MontoDescuentooRecargoOtraMoneda', index), 'MontoDescuentooRecargoOtraMoneda') +
          tag('IndicadorFacturacionDescuentooRecargo', accessor.getIndexed('IndicadorFacturacionDescuentooRecargo', index), 'IndicadorFacturacionDescuentooRecargo')
      )
    )
    .filter(Boolean)
    .join('');
  return section('DescuentosORecargos', inner);
};

const buildPaginacion = (accessor) => {
  const indices = new Set([...accessor.collectIndices('PaginaNo'), ...accessor.collectIndices('NoLineaDesde'), ...accessor.collectIndices('NoLineaHasta')]);
  const inner = [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      const subtotalAdicional =
        tag('SubtotalImpuestoSelectivoConsumoEspecificoPagina', accessor.getIndexed('SubtotalImpuestoSelectivoConsumoEspecificoPagina', index, 1) || accessor.getIndexed('SubtotalImpuestoSelectivoConsumoEspecificoPagina', index), 'SubtotalImpuestoSelectivoConsumoEspecificoPagina') +
        tag('SubtotalOtrosImpuesto', accessor.getIndexed('SubtotalOtrosImpuesto', index, 1) || accessor.getIndexed('SubtotalOtrosImpuesto', index), 'SubtotalOtrosImpuesto');
      return section(
        'Pagina',
        tag('PaginaNo', accessor.getIndexed('PaginaNo', index), 'PaginaNo') +
          tag('NoLineaDesde', accessor.getIndexed('NoLineaDesde', index), 'NoLineaDesde') +
          tag('NoLineaHasta', accessor.getIndexed('NoLineaHasta', index), 'NoLineaHasta') +
          tag('SubtotalMontoGravadoPagina', accessor.getIndexed('SubtotalMontoGravadoPagina', index), 'SubtotalMontoGravadoPagina') +
          tag('SubtotalMontoGravado1Pagina', accessor.getIndexed('SubtotalMontoGravado1Pagina', index), 'SubtotalMontoGravado1Pagina') +
          tag('SubtotalMontoGravado2Pagina', accessor.getIndexed('SubtotalMontoGravado2Pagina', index), 'SubtotalMontoGravado2Pagina') +
          tag('SubtotalMontoGravado3Pagina', accessor.getIndexed('SubtotalMontoGravado3Pagina', index), 'SubtotalMontoGravado3Pagina') +
          tag('SubtotalExentoPagina', accessor.getIndexed('SubtotalExentoPagina', index), 'SubtotalExentoPagina') +
          tag('SubtotalItbisPagina', accessor.getIndexed('SubtotalItbisPagina', index), 'SubtotalItbisPagina') +
          tag('SubtotalItbis1Pagina', accessor.getIndexed('SubtotalItbis1Pagina', index), 'SubtotalItbis1Pagina') +
          tag('SubtotalItbis2Pagina', accessor.getIndexed('SubtotalItbis2Pagina', index), 'SubtotalItbis2Pagina') +
          tag('SubtotalItbis3Pagina', accessor.getIndexed('SubtotalItbis3Pagina', index), 'SubtotalItbis3Pagina') +
          tag('SubtotalImpuestoAdicionalPagina', accessor.getIndexed('SubtotalImpuestoAdicionalPagina', index), 'SubtotalImpuestoAdicionalPagina') +
          section('SubtotalImpuestoAdicional', subtotalAdicional) +
          tag('MontoSubtotalPagina', accessor.getIndexed('MontoSubtotalPagina', index), 'MontoSubtotalPagina') +
          tag('SubtotalMontoNoFacturablePagina', accessor.getIndexed('SubtotalMontoNoFacturablePagina', index), 'SubtotalMontoNoFacturablePagina')
      );
    })
    .filter(Boolean)
    .join('');
  return section('Paginacion', inner);
};

const buildInformacionReferencia = (accessor) =>
  section('InformacionReferencia', renderFields(accessor, ['NCFModificado', 'RNCOtroContribuyente', 'FechaNCFModificado', 'CodigoModificacion', 'RazonModificacion']));

const buildEcfXml = ({ payload = {}, flujo = 'ECF_NORMAL', rncEmisorFallback = '', fechaHoraFirma = null }) => {
  const accessor = buildAccessor(payload);
  const tipoeCF = String(accessor.get('TipoeCF') || '').trim();
  const includeInformacionReferencia = tipoeCF === '33' || tipoeCF === '34';
  const encabezado = [
    tag('Version', accessor.get('Version') || '1.0', 'Version'),
    section('IdDoc', renderFields(accessor, [{ xmlName: 'TipoeCF', keys: ['TipoeCF'] }, { xmlName: 'eNCF', keys: ['eNCF', 'ENCF'] }, 'FechaVencimientoSecuencia', 'IndicadorNotaCredito', 'IndicadorEnvioDiferido', 'IndicadorMontoGravado', 'IndicadorServicioTodoIncluido', 'TipoIngresos', 'TipoPago', 'FechaLimitePago', 'TerminoPago']) + buildFormasPago(accessor) + renderFields(accessor, ['TipoCuentaPago', 'NumeroCuentaPago', 'BancoPago', 'FechaDesde', 'FechaHasta', 'TotalPaginas'])),
    section('Emisor', renderFields(accessor, [{ xmlName: 'RNCEmisor', keys: ['RNCEmisor'] }, 'RazonSocialEmisor', 'NombreComercial', 'Sucursal', 'DireccionEmisor', 'Municipio', 'Provincia'], { RNCEmisor: rncEmisorFallback || '' }) + wrapSimpleRepeating(accessor, 'TablaTelefonoEmisor', 'TelefonoEmisor', 'TelefonoEmisor') + renderFields(accessor, ['CorreoEmisor', 'WebSite', 'ActividadEconomica', 'CodigoVendedor', 'NumeroFacturaInterna', 'NumeroPedidoInterno', 'ZonaVenta', 'RutaVenta', 'InformacionAdicionalEmisor', 'FechaEmision'])),
    section('Comprador', renderFields(accessor, ['RNCComprador', 'IdentificadorExtranjero', 'RazonSocialComprador', 'ContactoComprador', 'CorreoComprador', 'DireccionComprador', 'MunicipioComprador', 'ProvinciaComprador', 'PaisComprador', 'FechaEntrega', 'ContactoEntrega', 'DireccionEntrega', 'TelefonoAdicional', 'FechaOrdenCompra', 'NumeroOrdenCompra', 'CodigoInternoComprador', 'ResponsablePago', 'InformacionAdicionalComprador'])),
    section('InformacionesAdicionales', renderFields(accessor, ['FechaEmbarque', 'NumeroEmbarque', 'NumeroContenedor', 'NumeroReferencia', 'NombrePuertoEmbarque', 'CondicionesEntrega', 'TotalFob', 'Seguro', 'Flete', 'OtrosGastos', 'TotalCif', 'RegimenAduanero', 'NombrePuertoSalida', 'NombrePuertoDesembarque', 'PesoBruto', 'PesoNeto', 'UnidadPesoBruto', 'UnidadPesoNeto', 'CantidadBulto', 'UnidadBulto', 'VolumenBulto', 'UnidadVolumen'])),
    section('Transporte', renderFields(accessor, ['ViaTransporte', 'PaisOrigen', 'DireccionDestino', 'PaisDestino', 'RNCIdentificacionCompaniaTransportista', 'NombreCompaniaTransportista', 'NumeroViaje', 'Conductor', 'DocumentoTransporte', 'Ficha', 'Placa', 'RutaTransporte', 'ZonaTransporte', 'NumeroAlbaran'])),
    section('Totales', renderFields(accessor, ['MontoGravadoTotal', 'MontoGravadoI1', 'MontoGravadoI2', 'MontoGravadoI3', 'MontoExento', 'ITBIS1', 'ITBIS2', 'ITBIS3', 'TotalITBIS', 'TotalITBIS1', 'TotalITBIS2', 'TotalITBIS3', 'MontoImpuestoAdicional']) + buildImpuestosAdicionales(accessor, { includeRate: true }) + renderFields(accessor, ['MontoTotal', 'MontoNoFacturable', 'MontoPeriodo', 'SaldoAnterior', 'MontoAvancePago', 'ValorPagar', 'TotalITBISRetenido', 'TotalISRRetencion', 'TotalITBISPercepcion', 'TotalISRPercepcion'])),
    section('OtraMoneda', renderFields(accessor, ['TipoMoneda', 'TipoCambio', 'MontoGravadoTotalOtraMoneda', 'MontoGravado1OtraMoneda', 'MontoGravado2OtraMoneda', 'MontoGravado3OtraMoneda', 'MontoExentoOtraMoneda', 'TotalITBISOtraMoneda', 'TotalITBIS1OtraMoneda', 'TotalITBIS2OtraMoneda', 'TotalITBIS3OtraMoneda', 'MontoImpuestoAdicionalOtraMoneda']) + buildImpuestosAdicionales(accessor, { otraMoneda: true, includeRate: true }) + renderFields(accessor, ['MontoTotalOtraMoneda'])),
  ]
    .filter(Boolean)
    .join('');
  const body = [
    section('Encabezado', encabezado),
    buildDetallesItems(accessor),
    buildSubtotales(accessor),
    buildDescuentosORecargos(accessor),
    buildPaginacion(accessor),
    includeInformacionReferencia ? buildInformacionReferencia(accessor) : '',
    tag('FechaHoraFirma', fechaHoraFirma || formatDateTime(new Date()), 'FechaHoraFirma'),
  ]
    .filter(Boolean)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ECF>${body}</ECF>`;
};

const buildResumenFcXml = ({ payload = {}, rncEmisorFallback = '', codigoSeguridadeCF = '' }) => {
  const accessor = buildAccessor(payload);
  const seguridad = codigoSeguridadeCF || accessor.get('CodigoSeguridadeCF');
  if (!seguridad) throw new Error('No fue posible generar RFCE: falta CodigoSeguridadeCF.');
  const encabezado = [
    tag('Version', accessor.get('Version') || '1.0', 'Version'),
    section('IdDoc', renderFields(accessor, [{ xmlName: 'TipoeCF', keys: ['TipoeCF'] }, { xmlName: 'eNCF', keys: ['eNCF', 'ENCF'] }, 'TipoIngresos', 'TipoPago']) + buildFormasPago(accessor)),
    section('Emisor', renderFields(accessor, [{ xmlName: 'RNCEmisor', keys: ['RNCEmisor'] }, 'RazonSocialEmisor', 'FechaEmision'], { RNCEmisor: rncEmisorFallback || '' })),
    section('Comprador', renderFields(accessor, ['RNCComprador', 'IdentificadorExtranjero', 'RazonSocialComprador'])),
    section('Totales', renderFields(accessor, ['MontoGravadoTotal', 'MontoGravadoI1', 'MontoGravadoI2', 'MontoGravadoI3', 'MontoExento', 'TotalITBIS', 'TotalITBIS1', 'TotalITBIS2', 'TotalITBIS3', 'MontoImpuestoAdicional']) + buildImpuestosAdicionales(accessor, { includeRate: false }) + renderFields(accessor, ['MontoTotal', 'MontoNoFacturable', 'MontoPeriodo'])),
    tag('CodigoSeguridadeCF', seguridad, 'CodigoSeguridadeCF'),
  ]
    .filter(Boolean)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<RFCE>${section('Encabezado', encabezado)}</RFCE>`;
};

module.exports = {
  buildEcfXml,
  buildResumenFcXml,
  cleanPayloadEntries,
};
