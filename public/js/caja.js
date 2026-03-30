const pedidosContainer = document.getElementById('caja-pedidos');

const mensajeLista = document.getElementById('caja-mensaje-lista');

const seleccionPlaceholder = document.getElementById('caja-seleccion');

const formulario = document.getElementById('caja-form');

const mensajeDetalle = document.getElementById('caja-mensaje');

const infoContainer = document.getElementById('caja-detalle-info');

const itemsContainer = document.getElementById('caja-detalle-items');

const inputDescuento = document.getElementById('caja-descuento');

const inputPropina = document.getElementById('caja-propina');

const inputClienteBuscar = document.getElementById('caja-cliente-buscar');

const inputClienteNombre = document.getElementById('caja-cliente-nombre');

const inputClienteDocumento = document.getElementById('caja-cliente-documento');

const datalistClientes = document.getElementById('caja-clientes');

const selectTipoComprobante = document.getElementById('caja-tipo-comprobante');

const inputNcfManual = document.getElementById('caja-ncf-manual');

const inputComentarios = document.getElementById('caja-comentarios');

const botonVistaPrevia = document.getElementById('caja-vista-previa');

const botonCobrar = document.getElementById('caja-cobrar');

const botonCobroAdelantado = document.getElementById('caja-cobro-adelantado');

const resumenSubtotal = document.getElementById('caja-resumen-subtotal');

const resumenImpuesto = document.getElementById('caja-resumen-impuesto');

const resumenPropina = document.getElementById('caja-resumen-propina');

const resumenDescuento = document.getElementById('caja-resumen-descuento');

const resumenTotal = document.getElementById('caja-resumen-total');

const resumenPagado = document.getElementById('caja-resumen-pagado');

const resumenRestante = document.getElementById('caja-resumen-restante');

const facturaAcciones = document.getElementById('caja-factura-acciones');

const facturaInfo = document.getElementById('caja-factura-info');

const botonImprimir = document.getElementById('caja-imprimir');

const botonSepararCuenta = document.getElementById('caja-separar');
const botonJuntarCuentas = document.getElementById('caja-juntar');
const botonEliminarCuenta = document.getElementById('caja-eliminar-cuenta');
const splitModal = document.getElementById('caja-split-modal');
const splitModalCerrar = document.getElementById('caja-split-cerrar');
const splitModalConfirmar = document.getElementById('caja-split-confirmar');
const splitModalLimpiar = document.getElementById('caja-split-limpiar');
const splitModalOrigen = document.getElementById('caja-split-origen');
const splitModalDestino = document.getElementById('caja-split-destino');
const splitModalTotalesOrigen = document.getElementById('caja-split-totales-origen');
const splitModalTotalesDestino = document.getElementById('caja-split-totales-destino');
const splitModalMensaje = document.getElementById('caja-split-mensaje');
const splitModalSubtitle = document.getElementById('caja-split-subtitle');
const mergeModal = document.getElementById('caja-merge-modal');
const mergeModalCerrar = document.getElementById('caja-merge-cerrar');
const mergeModalConfirmar = document.getElementById('caja-merge-confirmar');
const mergeModalLista = document.getElementById('caja-merge-lista');
const mergeModalMensaje = document.getElementById('caja-merge-mensaje');
const mergeModalResumen = document.getElementById('caja-merge-resumen');
const mergeModalSubtitle = document.getElementById('caja-merge-subtitle');
const adminPasswordModal = document.getElementById('caja-admin-password-modal');
const adminPasswordModalCerrar = document.getElementById('caja-admin-password-cerrar');
const adminPasswordModalCancelar = document.getElementById('caja-admin-password-cancelar');
const adminPasswordModalConfirmar = document.getElementById('caja-admin-password-confirmar');
const adminPasswordModalInput = document.getElementById('caja-admin-password-input');
const adminPasswordModalMensaje = document.getElementById('caja-admin-password-mensaje');
const adminPasswordModalContext = document.getElementById('caja-admin-password-context');


const cuadreFechaInput = document.getElementById('cuadre-fecha');

const cuadreTotalSistemaDisplay = document.getElementById('cuadre-total-sistema');

const cuadreCantidadPedidosDisplay = document.getElementById('cuadre-cantidad-pedidos');

const cuadreTotalEfectivoDisplay = document.getElementById('cuadre-total-efectivo');

const cuadreTotalTarjetaDisplay = document.getElementById('cuadre-total-tarjeta');

const cuadreTotalTransferenciaDisplay = document.getElementById('cuadre-total-transferencia');

const cuadreTotalGeneralDisplay = document.getElementById('cuadre-total-general');

const cuadreFondoInicialDisplay = document.getElementById('cuadre-fondo-display');

const cuadreSalidasDisplay = document.getElementById('cuadre-salidas-display');

const cuadreEfectivoEsperadoDisplay = document.getElementById('cuadre-efectivo-esperado');

const cuadreDeclaradoInput = document.getElementById('cuadre-total-declarado');

const cuadreDiferenciaDisplay = document.getElementById('cuadre-diferencia');

const cuadreUsuarioInput = document.getElementById('cuadre-usuario');

const cuadreObservacionesInput = document.getElementById('cuadre-observaciones');

const cuadreMensaje = document.getElementById('cuadre-mensaje');

const cuadreRegistrarBtn = document.getElementById('cuadre-registrar');

const cuadreDetalleWrapper = document.getElementById('cuadre-detalle-wrapper');

const cuadreDetalleBody = document.getElementById('cuadre-detalle-body');

const cuadreDetalleBtn = document.getElementById('cuadre-ver-detalle');

const cuadreFondoInicialInput = document.getElementById('cuadre-fondo-inicial');

const salidasMensaje = document.getElementById('salidas-mensaje');

const salidasListaBody = document.getElementById('salida-lista');

const salidaDescripcionInput = document.getElementById('salida-descripcion');

const salidaMontoInput = document.getElementById('salida-monto');

const salidaAgregarBtn = document.getElementById('salida-agregar');

const inputPagoEfectivoEntregado = document.getElementById('pago-efectivo-entregado');

const inputPagoTarjeta = document.getElementById('pago-tarjeta');

const inputPagoTransferencia = document.getElementById('pago-transferencia');

const pagoCambioDisplay = document.getElementById('pago-cambio');

const selectMetodoPago = document.getElementById('pago-metodo');

const camposPago = Array.from(document.querySelectorAll('[data-metodo]'));

const toggleCobroAdelantado = document.getElementById('caja-cobro-adelantado-toggle');

const tabsContainer = document.querySelector('.caja-tabs');

const tabsCaja = Array.from(document.querySelectorAll('.caja-tabs .kanm-tab'));

const panelCobros = document.getElementById('panel-cobros');

const panelCuadre = document.getElementById('panel-cuadre');

let secuenciasConfig = {
  permitir_b01: 1,
  permitir_b02: 1,
  permitir_b14: 1,
};

const METODOS_PAGO_CUADRE = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia/Deposito' },
];



const obtenerUsuarioActual = () => {

  try {

    return window.KANMSession?.getUser?.() || null;

  } catch (error) {

    return null;

  }

};



const authApi = window.kanmAuth;

const obtenerTokenDesdeStorage = () => {
  try {
    const raw =
      window.sessionStorage?.getItem?.('kanmUser') ||
      window.localStorage?.getItem?.('kanmUser') ||
      '';
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch (err) {
    return null;
  }
};

const obtenerAuthHeadersCaja = () => {
  try {
    const headers = authApi?.getAuthHeaders?.();
    if (headers && Object.keys(headers).length) {
      return headers;
    }
  } catch (error) {
    console.warn('No se pudieron obtener encabezados de autenticacion desde kanmAuth:', error);
  }

  const token = obtenerTokenDesdeStorage();
  if (token) {
    return {
      'x-session-token': token,
      Authorization: `Bearer ${token}`
    };
  }

  return {};
};

const fetchAutorizadoCaja = async (url, options = {}) => {
  const headers = { ...obtenerAuthHeadersCaja(), ...(options.headers || {}) };
  const respuesta = await fetch(url, { ...options, headers });

  if (respuesta.status === 401 || respuesta.status === 403) {
    authApi?.handleUnauthorized?.();
    throw new Error('Sesion expirada. Inicia sesion nuevamente.');
  }

  return respuesta;
};

const leerRespuestaJsonCaja = async (respuesta) => {
  const contentType = respuesta.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await respuesta.json().catch(() => null);
    return { data, esJson: true, contentType };
  }
  const texto = await respuesta.text().catch(() => '');
  return { data: texto, esJson: false, contentType };
};

const construirErrorNoJsonCaja = (respuesta, contenido, contentType) => {
  let mensaje = 'Respuesta inesperada del servidor.';
  if (respuesta.status === 404) {
    mensaje = 'Ruta no existe o servicio no disponible.';
  } else if (respuesta.status >= 500) {
    mensaje = 'Error del servidor. Intenta nuevamente.';
  }
  console.error('Respuesta no JSON en caja:', {
    status: respuesta.status,
    contentType,
    body: contenido,
  });
  return new Error(mensaje);
};

const normalizarFlagUI = (valor, predeterminado = 1) => {
  if (valor === undefined || valor === null) {
    return predeterminado;
  }
  if (typeof valor === 'string') {
    const limpio = valor.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes', 'si'].includes(limpio)) return 1;
    if (['0', 'false', 'off', 'no'].includes(limpio)) return 0;
  }
  return valor ? 1 : 0;
};

const normalizarTipoComprobante = (valor) => {
  if (valor === undefined || valor === null) {
    return '';
  }
  const texto = String(valor).trim();
  if (!texto) {
    return '';
  }
  const lower = texto.toLowerCase();
  if (['sin comprobante', 'sin_comprobante', 'sin'].includes(lower)) {
    return 'Sin comprobante';
  }
  if (['b01', 'b02', 'b14'].includes(lower)) {
    return lower.toUpperCase();
  }
  return texto;
};

const esSinComprobante = (valor) => normalizarTipoComprobante(valor).toLowerCase() === 'sin comprobante';

const resolverConfigSecuencias = (tema = {}) => ({
  permitir_b01: normalizarFlagUI(tema?.permitir_b01 ?? tema?.permitirB01, 1),
  permitir_b02: normalizarFlagUI(tema?.permitir_b02 ?? tema?.permitirB02, 1),
  permitir_b14: normalizarFlagUI(tema?.permitir_b14 ?? tema?.permitirB14, 1),
});

const actualizarEstadoNcfManual = (tipoComprobante) => {
  if (!inputNcfManual) return;
  const sinComprobante = esSinComprobante(tipoComprobante);
  inputNcfManual.disabled = sinComprobante;
  if (sinComprobante) {
    inputNcfManual.value = '';
  }
};

const obtenerOpcionDisponible = () => {
  if (!selectTipoComprobante) return null;
  const opciones = Array.from(selectTipoComprobante.options || []);
  return opciones.find((opt) => !opt.disabled && !opt.hidden) || null;
};

const seleccionarTipoComprobantePermitido = (preferido) => {
  if (!selectTipoComprobante) return;
  const valorPreferido = normalizarTipoComprobante(preferido || 'B02');
  const valorPreferidoUpper = valorPreferido.toUpperCase();
  const permitirB01 = Number(secuenciasConfig.permitir_b01) !== 0;
  const permitirB02 = Number(secuenciasConfig.permitir_b02) !== 0;
  const permitirB14 = Number(secuenciasConfig.permitir_b14) !== 0;

  let valorFinal = valorPreferido;
  if (valorPreferidoUpper === 'B01' && !permitirB01) {
    valorFinal = null;
  }
  if (valorPreferidoUpper === 'B02' && !permitirB02) {
    valorFinal = null;
  }
  if (valorPreferidoUpper === 'B14' && !permitirB14) {
    valorFinal = null;
  }

  if (!valorFinal) {
    const fallback = obtenerOpcionDisponible();
    valorFinal = fallback?.value || valorPreferido;
  }

  selectTipoComprobante.value = valorFinal;
  actualizarEstadoNcfManual(valorFinal);
};

const aplicarConfigSecuencias = (config = {}) => {
  secuenciasConfig = {
    ...secuenciasConfig,
    permitir_b01: normalizarFlagUI(config.permitir_b01 ?? config.permitirB01, 1),
    permitir_b02: normalizarFlagUI(config.permitir_b02 ?? config.permitirB02, 1),
    permitir_b14: normalizarFlagUI(config.permitir_b14 ?? config.permitirB14, 1),
  };

  if (!selectTipoComprobante) return;

  const permitirB01 = Number(secuenciasConfig.permitir_b01) !== 0;
  const permitirB02 = Number(secuenciasConfig.permitir_b02) !== 0;
  const permitirB14 = Number(secuenciasConfig.permitir_b14) !== 0;
  const opciones = Array.from(selectTipoComprobante.options || []);

  opciones.forEach((opt) => {
    if (opt.value === 'B01') {
      opt.hidden = !permitirB01;
      opt.disabled = !permitirB01;
    }
    if (opt.value === 'B02') {
      opt.hidden = !permitirB02;
      opt.disabled = !permitirB02;
    }
    if (opt.value === 'B14') {
      opt.hidden = !permitirB14;
      opt.disabled = !permitirB14;
    }
  });

  seleccionarTipoComprobantePermitido(selectTipoComprobante.value || 'B02');
};

const cargarConfigSecuencias = async () => {
  if (!selectTipoComprobante) return;

  try {
    const temaActual = window.APP_TEMA_NEGOCIO;
    if (temaActual) {
      aplicarConfigSecuencias(resolverConfigSecuencias(temaActual));
      return;
    }

    const respuesta = await fetchAutorizadoCaja('/api/negocios/mi-tema');
    if (!respuesta.ok) {
      return;
    }
    const data = await respuesta.json().catch(() => ({}));
    if (data?.ok && data.tema) {
      aplicarConfigSecuencias(resolverConfigSecuencias(data.tema));
    }
  } catch (error) {
    console.warn('No se pudo cargar configuracion de secuencias fiscales:', error);
  }
};

const renderOpcionesClientes = (lista = []) => {

  if (!datalistClientes) return;

  datalistClientes.innerHTML = '';

  lista.forEach((cli) => {

    const opt = document.createElement('option');

    opt.value = cli.documento ? `${cli.nombre} (${cli.documento})` : cli.nombre;

    opt.dataset.id = cli.id;

    datalistClientes.appendChild(opt);

  });

};



const normalizarDocumentoFiscal = (valor = '') => String(valor || '').replace(/\D+/g, '').trim();

const reiniciarLookupDgii = () => {
  if (consultaDgiiTimer) {
    clearTimeout(consultaDgiiTimer);
    consultaDgiiTimer = null;
  }
  if (consultaDgiiController) {
    consultaDgiiController.abort();
    consultaDgiiController = null;
  }
  ultimoDocumentoConsultadoDgii = '';
  ultimoDocumentoSincronizadoCliente = '';
  ultimoNombreAutocompletadoDgii = '';
};

const inyectarClienteSugerido = (cliente) => {
  if (!cliente || !cliente.id) return;
  const id = Number(cliente.id);
  if (!Number.isFinite(id) || id <= 0) return;
  const idx = clientesSugeridos.findIndex((item) => Number(item.id) === id);
  if (idx >= 0) {
    clientesSugeridos[idx] = { ...clientesSugeridos[idx], ...cliente };
  } else {
    clientesSugeridos.unshift(cliente);
  }
  clientesSugeridos = clientesSugeridos.slice(0, 50);
  renderOpcionesClientes(clientesSugeridos);
};

const aplicarContribuyenteDesdeDgii = (contribuyente, documentoConsultado) => {
  if (!contribuyente) return;
  const nombre = (contribuyente.nombre || '').trim();
  const documento = (contribuyente.documento || '').trim();

  if (inputClienteDocumento && documento) {
    inputClienteDocumento.value = documento;
  } else if (inputClienteDocumento && documentoConsultado) {
    inputClienteDocumento.value = documentoConsultado;
  }

  if (!inputClienteNombre || !nombre) return;
  const nombreActual = inputClienteNombre.value.trim();
  const puedeSobrescribir =
    !nombreActual || (ultimoNombreAutocompletadoDgii && nombreActual === ultimoNombreAutocompletadoDgii);
  if (!puedeSobrescribir) return;

  inputClienteNombre.value = nombre;
  ultimoNombreAutocompletadoDgii = nombre;
};

const buscarContribuyenteDgiiPorDocumento = async (documento, { autoguardar = false } = {}) => {
  if (!documento || documento.length < 9) return;

  if (consultaDgiiController) {
    consultaDgiiController.abort();
  }
  const controller = new AbortController();
  consultaDgiiController = controller;
  ultimoDocumentoConsultadoDgii = documento;

  try {
    const params = new URLSearchParams();
    params.set('documento', documento);
    if (autoguardar) {
      params.set('autoguardar', '1');
      const nombreActual = (inputClienteNombre?.value || '').trim();
      if (nombreActual) {
        params.set('nombre', nombreActual);
      }
    }

    const resp = await fetchAutorizadoCaja(`/api/dgii/rnc-cache/lookup?${params.toString()}`, {
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      throw new Error(data?.error || 'No se pudo consultar DGII local.');
    }

    if (data?.cliente && typeof data.cliente === 'object') {
      inyectarClienteSugerido(data.cliente);
      if (data.cliente.nombre || data.cliente.documento) {
        aplicarClienteSeleccionado(data.cliente);
      }
    }

    if (data?.ok && data?.encontrado && data?.contribuyente) {
      aplicarContribuyenteDesdeDgii(data.contribuyente, documento);
    }

    if (autoguardar && data?.cliente_sincronizado) {
      ultimoDocumentoSincronizadoCliente = documento;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.warn('No se pudo autocompletar desde DGII local (caja):', error?.message || error);
  } finally {
    if (consultaDgiiController === controller) {
      consultaDgiiController = null;
    }
  }
};

const programarLookupDgiiPorDocumento = ({ immediate = false } = {}) => {
  const documento = normalizarDocumentoFiscal(inputClienteDocumento?.value || '');
  if (!documento || ![9, 11].includes(documento.length)) {
    if (consultaDgiiTimer) {
      clearTimeout(consultaDgiiTimer);
      consultaDgiiTimer = null;
    }
    if (consultaDgiiController) {
      consultaDgiiController.abort();
      consultaDgiiController = null;
    }
    ultimoDocumentoConsultadoDgii = '';
    ultimoDocumentoSincronizadoCliente = '';
    return;
  }
  if (!immediate && documento === ultimoDocumentoConsultadoDgii) return;
  if (immediate && documento === ultimoDocumentoSincronizadoCliente) return;

  if (consultaDgiiTimer) {
    clearTimeout(consultaDgiiTimer);
    consultaDgiiTimer = null;
  }

  if (immediate) {
    buscarContribuyenteDgiiPorDocumento(documento, { autoguardar: true });
    return;
  }

  consultaDgiiTimer = setTimeout(() => {
    buscarContribuyenteDgiiPorDocumento(documento, { autoguardar: false });
    consultaDgiiTimer = null;
  }, 280);
};

const buscarClientes = async (term = '') => {

  try {

    const resp = await fetchAutorizadoCaja(`/api/clientes?search=${encodeURIComponent(term)}`);

    const data = await resp.json();

    if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudieron obtener clientes');

    clientesSugeridos = data?.clientes || [];

    renderOpcionesClientes(clientesSugeridos);

  } catch (error) {

    console.error('Error al buscar clientes:', error);

  }

};



const aplicarClienteSeleccionado = (cliente) => {

  if (!cliente) return;

  inputClienteNombre.value = cliente.nombre || '';

  inputClienteDocumento.value = cliente.documento || '';

};



const expandirPedidosAgrupados = (grupos = []) =>

  grupos.flatMap((cuenta) =>

    (cuenta.pedidos || []).map((pedido) => ({

      ...pedido,

      cuenta_id: cuenta.cuenta_id,

      mesa: pedido.mesa ?? cuenta.mesa,

      cliente: pedido.cliente ?? cuenta.cliente,

      modo_servicio: pedido.modo_servicio ?? cuenta.modo_servicio,

      estado_cuenta: cuenta.estado_cuenta,

    }))

  );



let cuentas = [];

let cuentaSeleccionada = null;
let modoCobroAdelantado = false;
let splitItems = [];
let splitItemsMap = new Map();
const splitSeleccion = new Map();
const mergeSeleccion = new Set();
let resolverPasswordAdminPendiente = null;

let calculo = {

  subtotal: 0,

  impuesto: 0,

  descuentoPorcentaje: 0,

  propinaPorcentaje: 10,

  descuentoGeneralMonto: 0,

  descuentoItemsMonto: 0,

  descuentoPorcentajeEfectivo: 0,

  descuentoMonto: 0,

  propinaMonto: 0,

  baseConDescuento: 0,

  baseSinDescuento: 0,

  total: 0,

};



let resumenCuadre = {

  fecha: '',

  totalSistema: 0,

  totalGeneral: 0,

  totalEfectivo: 0,

  totalTarjeta: 0,

  totalTransferencia: 0,

  totalDescuentos: 0,

  cantidadPedidos: 0,

  pedidos: [],

};



let salidasDia = [];

let totalSalidas = 0;

let descuentosPorItem = [];

let clientesSugeridos = [];
let ultimoNombreAutocompletadoDgii = '';
let ultimoDocumentoConsultadoDgii = '';
let ultimoDocumentoSincronizadoCliente = '';
let consultaDgiiTimer = null;
let consultaDgiiController = null;

const detalleCuadreCache = new Map();
let detalleCuadreIdActivo = null;
let detalleCuadreFilaActiva = null;



const REFRESH_INTERVAL = 15000;

let refreshTimer = null;

let recargandoEstado = false;

const SYNC_STORAGE_KEY = 'kanm:last-update';
const FONDO_STORAGE_PREFIX = 'kanm:fondo-inicial:';
const PROPINA_STORAGE_KEY = 'kanm:propina-legal';
const PROPINA_DEFAULT = 10;

let ultimaMarcaSyncProcesada = 0;



const notificarActualizacionGlobal = (evento, payload = {}) => {

  try {

    const data = {

      evento,

      payload,

      timestamp: Date.now(),

      nonce: Math.random(),

    };

    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(data));

  } catch (error) {

    console.warn('No fue posible notificar la actualizacion global:', error);

  }

};



const procesarSyncGlobal = (valor) => {

  if (!valor) return;

  try {

    const data = JSON.parse(valor);

    if (!data || typeof data.timestamp !== 'number') {

      return;

    }



    if (data.timestamp <= ultimaMarcaSyncProcesada) {

      return;

    }



    ultimaMarcaSyncProcesada = data.timestamp;



    if (

      ['pedido-cobrado', 'pedido-actualizado', 'cierre-registrado', 'nota-credito-creada'].includes(

        data.evento

      )

    ) {

      recargarEstadoCaja(false).catch((error) => {

        console.error('Error al refrescar la vista de caja tras sincronizacion:', error);

      });

    }

  } catch (error) {

    console.warn('No fue posible interpretar la sincronizacion global en caja:', error);

  }

};



const formatCurrency = (valor) => {

  const numero = Number(valor) || 0;

  return new Intl.NumberFormat('es-DO', {

    style: 'currency',

    currency: 'DOP',

    minimumFractionDigits: 2,

  }).format(numero);

};

const parseMoneyValueCaja = (input, { fallback = 0, allowEmpty = true } = {}) => {
  const raw =
    input && typeof input === 'object' && 'value' in input ? input.value : input ?? '';
  const texto = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!texto) return allowEmpty ? fallback : NaN;
  const parsed = window.KANMMoney?.parse
    ? window.KANMMoney.parse(texto)
    : Number(texto.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const setMoneyInputValueCaja = (input, value) => {
  if (!input) return;
  if (window.KANMMoney?.setValue && input.matches?.('input[data-money]')) {
    window.KANMMoney.setValue(input, value);
    return;
  }
  input.value = value ?? '';
};



const formatCurrencySigned = (valor) => {

  const numero = Number(valor) || 0;

  if (numero === 0) {

    return formatCurrency(0);

  }

  const simbolo = numero > 0 ? '+ ' : '- ';

  return `${simbolo}${formatCurrency(Math.abs(numero))}`;

};



const parseFechaLocal = (valor) => {

  if (!valor) return null;

  const base = typeof valor === 'string' ? valor.replace(' ', 'T') : valor;

  const conZona = /([zZ]|[+-]\d\d:?\d\d)$/.test(base) ? base : `${base}Z`;

  const fecha = new Date(conZona);

  return Number.isNaN(fecha.getTime()) ? null : fecha;

};



const formatDateTime = (valor) => {

  const fecha = parseFechaLocal(valor);

  if (!fecha) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-DO', {

    dateStyle: 'short',

    timeStyle: 'short',

    hour12: true,

    timeZone: 'America/Santo_Domingo',

  }).format(fecha);

};



const setCampoCuadre = (id, valor, { currency = true } = {}) => {

  const val = currency ? formatCurrency(valor) : valor;

  document.querySelectorAll(`#${id}`).forEach((el) => {

    if ('value' in el) {

      el.value = val;

    } else {

      el.textContent = val;

    }

  });

};



const setCampoCuadreTexto = (id, texto = '') => {

  document.querySelectorAll(`#${id}`).forEach((el) => {

    if ('value' in el) {

      el.value = texto;

    } else {

      el.textContent = texto;

    }

  });

};



const mostrarTab = (tab) => {

  if (!tabsCaja.length) return;

  tabsCaja.forEach((btn) => {

    const activo = btn.dataset.tab === tab;

    btn.classList.toggle('active', activo);

    btn.setAttribute('aria-selected', activo ? 'true' : 'false');

  });



  if (panelCobros) {

    panelCobros.classList.toggle('hidden', tab !== 'cobros');

  }

  if (panelCuadre) {

    panelCuadre.classList.toggle('hidden', tab !== 'cuadre');

  }

};



const setSalidasMensaje = (texto, tipo = 'info') => {

  if (!salidasMensaje) return;

  salidasMensaje.textContent = texto;

  salidasMensaje.dataset.type = texto ? tipo : '';

};



const renderSalidas = () => {

  if (!salidasListaBody) return;



  salidasListaBody.innerHTML = '';

  if (!salidasDia.length) {

    const fila = document.createElement('div');

    fila.className = 'salida-empty';

    fila.textContent = 'No hay salidas registradas para esta fecha.';

    salidasListaBody.appendChild(fila);

    setSalidasMensaje('');

    return;

  }



  const fragment = document.createDocumentFragment();

  salidasDia.forEach((salida) => {

    const row = document.createElement('div');

    row.className = 'salida-row';

    const fecha = formatDateTime(salida.created_at || salida.fecha);

    row.innerHTML = `

      <span class="salida-fecha">${fecha}</span>

      <span class="salida-desc">${salida.descripcion || 'Sin descripcion'}</span>

      <span class="salida-monto">${formatCurrency(salida.monto)}</span>

    `;

    fragment.appendChild(row);

  });



  salidasListaBody.appendChild(fragment);

  setSalidasMensaje('');

};



const cargarSalidas = async (fecha, mostrarCarga = false) => {

  const fechaConsulta = fecha || cuadreFechaInput?.value || resumenCuadre.fecha || obtenerFechaLocalHoy();

  try {

    if (mostrarCarga) setSalidasMensaje('Cargando salidas...', 'info');

    const respuesta = await fetchAutorizadoCaja(`/api/caja/salidas?fecha=${fechaConsulta}`);

    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);

    if (!esJson) {

      throw construirErrorNoJsonCaja(respuesta, data, contentType);

    }

    if (!respuesta.ok || data?.ok === false) {

      throw new Error(data?.error || 'No se pudieron cargar las salidas de caja.');

    }

    if (!data.ok && data.total === undefined && !Array.isArray(data.salidas)) {

      throw new Error(data.error || 'No se pudieron cargar las salidas de caja.');

    }



    totalSalidas = Number(data.total || data.total_salidas || 0);

    salidasDia = Array.isArray(data.salidas) ? data.salidas : [];

    if (cuadreSalidasDisplay) {

      cuadreSalidasDisplay.textContent = formatCurrency(totalSalidas);

    }

    renderSalidas();

    actualizarEfectivoEsperado();

    actualizarDiferenciaCuadre();

  } catch (error) {

    console.error('Error al cargar salidas:', error);

    setSalidasMensaje('No se pudieron cargar las salidas de caja.', 'error');

  }

};



const registrarSalida = async () => {

  const descripcion = salidaDescripcionInput?.value?.trim() || '';

  const monto = parseMoneyValueCaja(salidaMontoInput, { allowEmpty: false });

  const fecha = cuadreFechaInput?.value || resumenCuadre.fecha || obtenerFechaLocalHoy();

  if (!descripcion) {

    setSalidasMensaje('Ingresa una descripcion para la salida.', 'error');

    return;

  }


  if (!Number.isFinite(monto) || monto <= 0) {

    setSalidasMensaje('Ingresa un monto valido mayor a 0.', 'error');

    return;

  }



  try {

    salidaAgregarBtn.disabled = true;

    setSalidasMensaje('Registrando salida...', 'info');

    const respuesta = await fetchAutorizadoCaja('/api/caja/salidas', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

      },

      body: JSON.stringify({ descripcion, monto, fecha }),

    });



    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);

    if (!esJson) {

      throw construirErrorNoJsonCaja(respuesta, data, contentType);

    }

    if (!respuesta.ok || !data?.ok) {

      throw new Error(data?.error || 'No se pudo registrar la salida.');

    }



    salidaDescripcionInput.value = '';

    setMoneyInputValueCaja(salidaMontoInput, '');

    await cargarSalidas(fecha, false);

    await cargarResumenCuadre(false);

    setSalidasMensaje('Salida registrada correctamente.', 'info');

  } catch (error) {

    console.error('Error al registrar salida:', error);

    setSalidasMensaje(error.message || 'No se pudo registrar la salida.', 'error');

  } finally {

    salidaAgregarBtn.disabled = false;

  }

};



const obtenerFechaFondoInicial = (fecha) => {
  if (fecha) return fecha;
  if (cuadreFechaInput?.value) return cuadreFechaInput.value;
  if (resumenCuadre?.fecha) return resumenCuadre.fecha;
  return obtenerFechaLocalHoy();
};

const obtenerKeyFondoInicial = (fecha) =>
  `${FONDO_STORAGE_PREFIX}${obtenerFechaFondoInicial(fecha)}`;

const leerFondoInicialPersistido = (fecha) => {
  if (!window.localStorage) return null;
  try {
    const raw = localStorage.getItem(obtenerKeyFondoInicial(fecha));
    if (raw === null || raw === undefined || raw === '') return null;
    const valor = Number(raw);
    if (!Number.isFinite(valor) || valor < 0) return null;
    return valor;
  } catch (error) {
    return null;
  }
};

const guardarFondoInicialPersistido = (fecha) => {
  if (!window.localStorage || !cuadreFondoInicialInput) return;
  try {
    const raw = cuadreFondoInicialInput.value;
    const key = obtenerKeyFondoInicial(fecha);
    if (raw === null || raw === undefined || raw === '') {
      localStorage.removeItem(key);
      return;
    }
    const valor = parseMoneyValueCaja(cuadreFondoInicialInput, { allowEmpty: false });
    if (!Number.isFinite(valor) || valor < 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, String(valor));
  } catch (error) {
    return;
  }
};

const aplicarFondoInicialPersistido = (fecha, { force = false } = {}) => {
  if (!cuadreFondoInicialInput) return;
  if (!force && cuadreFondoInicialInput.dataset.dirty) return;
  const valor = leerFondoInicialPersistido(fecha);
  if (valor === null) {
    if (force) {
      setMoneyInputValueCaja(cuadreFondoInicialInput, '');
      delete cuadreFondoInicialInput.dataset.dirty;
    }
    return;
  }
  setMoneyInputValueCaja(cuadreFondoInicialInput, valor);
  delete cuadreFondoInicialInput.dataset.dirty;
};

const normalizarPropinaPreferida = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.min(numero, 100);
};

const leerPropinaPreferida = () => {
  if (!window.localStorage) return null;
  try {
    const raw = localStorage.getItem(PROPINA_STORAGE_KEY);
    if (raw === null || raw === undefined || raw === '') return null;
    return normalizarPropinaPreferida(raw);
  } catch (error) {
    return null;
  }
};

const guardarPropinaPreferida = (valor) => {
  if (!window.localStorage) return;
  try {
    if (valor === null || valor === undefined || valor === '') {
      localStorage.removeItem(PROPINA_STORAGE_KEY);
      return;
    }
    const normalizado = normalizarPropinaPreferida(valor);
    if (normalizado === null) {
      localStorage.removeItem(PROPINA_STORAGE_KEY);
      return;
    }
    localStorage.setItem(PROPINA_STORAGE_KEY, String(normalizado));
  } catch (error) {
    return;
  }
};

const aplicarPropinaPreferida = ({ force = false } = {}) => {
  if (!inputPropina) return;
  if (!force && inputPropina.dataset.dirty) return;
  const preferida = leerPropinaPreferida();
  if (preferida === null) {
    if (force) {
      inputPropina.value = String(PROPINA_DEFAULT);
      delete inputPropina.dataset.dirty;
    }
    return;
  }
  inputPropina.value = String(preferida);
  delete inputPropina.dataset.dirty;
};

const obtenerFondoInicial = () => {

  const valor = parseMoneyValueCaja(cuadreFondoInicialInput, { allowEmpty: false });

  if (Number.isNaN(valor) || valor < 0) return 0;

  return valor;

};



const obtenerSalidasEfectivo = () => totalSalidas;



const calcularEfectivoEsperado = () => {

  const fondo = obtenerFondoInicial();

  const salidas = totalSalidas;

  const ventasEfectivo = Number(resumenCuadre.totalEfectivo) || 0;

  const esperado = fondo + ventasEfectivo - salidas;

  return Number.isFinite(esperado) ? esperado : 0;

};



const totalesBaseCuenta = (cuenta) => {

  const lista = cuenta?.pedidos || [];

  const subtotal = lista.reduce((acc, p) => acc + (Number(p.subtotal) || 0), 0);

  const impuesto = lista.reduce((acc, p) => acc + (Number(p.impuesto) || 0), 0);

  return {

    subtotal,

    impuesto,

    total: subtotal + impuesto,

    subtotalBruto: subtotal,

  };

};

const redondearMonedaCaja = (valor) => Number((Number(valor) || 0).toFixed(2));

const deduplicarPedidosCaja = (pedidos = []) => {
  const mapa = new Map();
  (pedidos || []).forEach((pedido) => {
    const pedidoId = Number(pedido?.id);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) return;
    mapa.set(pedidoId, { ...(mapa.get(pedidoId) || {}), ...pedido });
  });
  return Array.from(mapa.values()).sort((a, b) => {
    const fechaA = new Date(a?.fecha_creacion || 0).getTime();
    const fechaB = new Date(b?.fecha_creacion || 0).getTime();
    return fechaA - fechaB;
  });
};

const calcularEstadoCuentaCajaUI = (pedidos = []) => {
  const estados = new Set(
    (pedidos || [])
      .map((pedido) => (pedido?.estado || '').toString().trim().toLowerCase())
      .filter(Boolean)
  );
  if (!estados.size) return 'listo';
  if (estados.has('preparando') || (estados.has('pendiente') && estados.has('listo'))) {
    return 'preparando';
  }
  if (estados.size === 1) return Array.from(estados)[0];
  if (estados.has('pendiente')) return 'pendiente';
  if (estados.has('listo')) return 'listo';
  return 'preparando';
};

const obtenerPagosRegistradosCuenta = (cuenta = null) => {
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  if (!cuentaObjetivo) {
    return {
      efectivo: 0,
      efectivoEntregado: 0,
      tarjeta: 0,
      transferencia: 0,
      cambio: 0,
      total: 0,
    };
  }

  if (cuentaObjetivo?.pagos_registrados && typeof cuentaObjetivo.pagos_registrados === 'object') {
    const pagos = cuentaObjetivo.pagos_registrados;
    const efectivo = Number(pagos.efectivo) || 0;
    const efectivoEntregado = Number(pagos.efectivo_entregado ?? pagos.efectivoEntregado) || 0;
    const tarjeta = Number(pagos.tarjeta) || 0;
    const transferencia = Number(pagos.transferencia) || 0;
    const cambio = Number(pagos.cambio) || 0;
    return {
      efectivo: redondearMonedaCaja(efectivo),
      efectivoEntregado: redondearMonedaCaja(efectivoEntregado),
      tarjeta: redondearMonedaCaja(tarjeta),
      transferencia: redondearMonedaCaja(transferencia),
      cambio: redondearMonedaCaja(cambio),
      total: redondearMonedaCaja(
        Number(pagos.total) || redondearMonedaCaja(efectivo + tarjeta + transferencia)
      ),
    };
  }

  const pedidosCuenta = Array.isArray(cuentaObjetivo.pedidos) ? cuentaObjetivo.pedidos : [];
  let efectivo = 0;
  let efectivoEntregado = 0;
  let tarjeta = 0;
  let transferencia = 0;
  let cambio = 0;

  pedidosCuenta.forEach((pedido) => {
    const efectivoPedido = Number(pedido?.pago_efectivo) || 0;
    const efectivoEntregadoPedido = Number(pedido?.pago_efectivo_entregado) || 0;
    const cambioPedido = Number(pedido?.pago_cambio) || 0;
    efectivo += efectivoPedido > 0 ? efectivoPedido : Math.max(efectivoEntregadoPedido - cambioPedido, 0);
    efectivoEntregado += efectivoEntregadoPedido;
    tarjeta += Number(pedido?.pago_tarjeta) || 0;
    transferencia += Number(pedido?.pago_transferencia) || 0;
    cambio += cambioPedido;
  });

  return {
    efectivo: redondearMonedaCaja(efectivo),
    efectivoEntregado: redondearMonedaCaja(efectivoEntregado),
    tarjeta: redondearMonedaCaja(tarjeta),
    transferencia: redondearMonedaCaja(transferencia),
    cambio: redondearMonedaCaja(cambio),
    total: redondearMonedaCaja(efectivo + tarjeta + transferencia),
  };
};

const obtenerSaldoPendienteCuenta = (cuenta = null, totalCuenta = null) => {
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  const totalBase = totalCuenta === null ? Number(calculo.total || 0) : Number(totalCuenta) || 0;
  const pagosRegistrados = obtenerPagosRegistradosCuenta(cuentaObjetivo);
  return redondearMonedaCaja(Math.max(totalBase - pagosRegistrados.total, 0));
};

const cuentaTienePagosRegistrados = (cuenta = null) => obtenerPagosRegistradosCuenta(cuenta).total > 0.009;

const cuentaEstaListaParaCobro = (cuenta = null) => {
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  if (!cuentaObjetivo) return false;
  if (typeof cuentaObjetivo.puedeCobrar === 'boolean') return cuentaObjetivo.puedeCobrar;
  const pedidosCuenta = Array.isArray(cuentaObjetivo.pedidos) ? cuentaObjetivo.pedidos : [];
  return pedidosCuenta.every((pedido) => pedido?.estado === 'listo');
};

const cuentaPermiteCambiosEstructurales = (cuenta = null) => {
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  return Boolean(cuentaObjetivo) && cuentaEstaListaParaCobro(cuentaObjetivo) && !cuentaTienePagosRegistrados(cuentaObjetivo);
};

const combinarCuentasCaja = (...listas) => {
  const mapa = new Map();
  listas.flat().forEach((cuenta) => {
    if (!cuenta) return;
    const cuentaId = Number(cuenta.cuenta_id || cuenta.id);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) return;
    if (!mapa.has(cuentaId)) {
      mapa.set(cuentaId, {
        ...cuenta,
        cuenta_id: cuentaId,
        id: cuentaId,
        pedidos: [],
      });
    }

    const acumulada = mapa.get(cuentaId);
    if (!acumulada.mesa && cuenta.mesa) acumulada.mesa = cuenta.mesa;
    if (!acumulada.cliente && cuenta.cliente) acumulada.cliente = cuenta.cliente;
    if (!acumulada.modo_servicio && cuenta.modo_servicio) acumulada.modo_servicio = cuenta.modo_servicio;
    acumulada.pedidos = deduplicarPedidosCaja([...(acumulada.pedidos || []), ...(cuenta.pedidos || [])]);
    acumulada.estado = calcularEstadoCuentaCajaUI(acumulada.pedidos);
    acumulada.estado_cuenta = acumulada.estado;
    acumulada.puedeCobrar = acumulada.pedidos.every((pedido) => pedido?.estado === 'listo');
  });

  return Array.from(mapa.values()).sort((a, b) => {
    const fechaA = new Date(a?.pedidos?.[0]?.fecha_creacion || 0).getTime();
    const fechaB = new Date(b?.pedidos?.[0]?.fecha_creacion || 0).getTime();
    return fechaA - fechaB;
  });
};

const esCuentaConImpuestoIncluidoEnSplit = (subtotalItems, totalesCuenta) => {
  const subtotalCuenta = Math.max(Number(totalesCuenta?.subtotal) || 0, 0);
  const impuestoCuenta = Math.max(Number(totalesCuenta?.impuesto) || 0, 0);
  const totalCuenta = Math.max(Number(totalesCuenta?.total) || subtotalCuenta + impuestoCuenta, 0);

  if (impuestoCuenta <= 0) return false;

  const deltaContraTotal = Math.abs(subtotalItems - totalCuenta);
  const deltaContraSubtotal = Math.abs(subtotalItems - subtotalCuenta);
  return deltaContraTotal <= deltaContraSubtotal;
};

const calcularResumenSegmentoSplit = (montoSegmento, montoTotalSegmentos, totalesCuenta, impuestoIncluido) => {
  const baseSegmento = Math.max(Number(montoSegmento) || 0, 0);
  const baseTotal = Math.max(Number(montoTotalSegmentos) || 0, 0);
  const impuestoCuenta = Math.max(Number(totalesCuenta?.impuesto) || 0, 0);

  if (impuestoIncluido) {
    const subtotalCuenta = Math.max(Number(totalesCuenta?.subtotal) || 0, 0);
    const proporcion = baseTotal > 0 ? baseSegmento / baseTotal : 0;
    const subtotal = redondearMonedaCaja(subtotalCuenta * proporcion);
    const impuesto = redondearMonedaCaja(impuestoCuenta * proporcion);
    return {
      subtotal,
      impuesto,
      total: redondearMonedaCaja(baseSegmento),
    };
  }

  const subtotal = redondearMonedaCaja(baseSegmento);
  const proporcion = baseTotal > 0 ? baseSegmento / baseTotal : 0;
  const impuesto = redondearMonedaCaja(impuestoCuenta * proporcion);
  return {
    subtotal,
    impuesto,
    total: redondearMonedaCaja(subtotal + impuesto),
  };
};

const obtenerTotalCuenta = (cuenta) => {
  const base = totalesBaseCuenta(cuenta);
  return Number(base.total || 0);
};

const construirItemsSeparar = () => {
  if (!cuentaSeleccionada || !Array.isArray(cuentaSeleccionada.pedidos)) return [];
  const items = [];
  const seen = new Set();

  cuentaSeleccionada.pedidos.forEach((pedido) => {
    (pedido.items || []).forEach((item) => {
      const detalleId = Number(item.detalle_id ?? item.detalleId);
      if (!Number.isFinite(detalleId) || detalleId <= 0 || seen.has(detalleId)) return;
      seen.add(detalleId);
      const cantidad = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      const subtotalLinea = Math.max(cantidad * precio, 0);
      const descuentoPorcentaje = Math.max(Number(item.descuento_porcentaje) || 0, 0);
      const descuentoMonto = Math.max(Number(item.descuento_monto) || 0, 0);
      const cantidadDescuentoRaw = Number(item.cantidad_descuento);
      const cantidadDescuento = Number.isFinite(cantidadDescuentoRaw)
        ? Math.min(Math.max(cantidadDescuentoRaw, 0), cantidad)
        : cantidad;
      const proporcional = cantidad > 0 ? cantidadDescuento / cantidad : 1;
      const descuentoPorcentajeMonto = subtotalLinea * (descuentoPorcentaje / 100) * proporcional;
      const descuentoTotal = Math.min(descuentoPorcentajeMonto + descuentoMonto, subtotalLinea);
      const totalLinea = Math.max(subtotalLinea - descuentoTotal, 0);
      items.push({
        detalle_id: detalleId,
        pedido_id: Number(item.pedido_id ?? pedido.id) || null,
        producto_id: item.producto_id,
        nombre: item.nombre || `Producto ${item.producto_id || ''}`,
        cantidad,
        precio_unitario: precio,
        descuento_monto: descuentoMonto,
        descuento_porcentaje: descuentoPorcentaje,
        cantidad_descuento: cantidadDescuento,
        total_linea: Number(totalLinea.toFixed(2)),
      });
    });
  });

  return items;
};



const normalizarNumero = (valor, defecto = 0) => {

  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : defecto;

};



const obtenerKeyItem = (item, index = 0) => {

  const productoId = item?.producto_id || item?.id || `producto-${index}`;

  const precio = normalizarNumero(item?.precio_unitario, 0);

  return `item-${productoId}-${precio}-${index}`;

};



const obtenerDescuentoItem = (key) => descuentosPorItem.find((d) => d.key === key);



const registrarDescuentoItem = (entrada) => {

  const idx = descuentosPorItem.findIndex((d) => d.key === entrada.key);

  if (idx >= 0) {

    descuentosPorItem[idx] = { ...descuentosPorItem[idx], ...entrada };

  } else {

    descuentosPorItem.push(entrada);

  }

};



const eliminarDescuentoItem = (key) => {

  descuentosPorItem = descuentosPorItem.filter((d) => d.key !== key);

};



const limpiarDescuentosItems = () => {

  descuentosPorItem = [];

};

const inicializarDescuentosDesdeCuenta = (cuenta = null) => {
  limpiarDescuentosItems();
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  const items = Array.isArray(cuentaObjetivo?.items_agregados) ? cuentaObjetivo.items_agregados : [];

  items.forEach((item, itemIndex) => {
    const descuentoPorcentaje = Math.max(Number(item?.descuento_porcentaje) || 0, 0);
    const descuentoMonto = Math.max(Number(item?.descuento_monto) || 0, 0);
    if (descuentoPorcentaje <= 0 && descuentoMonto <= 0) return;

    const detalles = Array.isArray(item?.detalles) ? item.detalles : [];
    const cantidadTotal = Math.max(Number(item?.cantidad) || 0, 0);
    const cantidadAplicada = detalles.reduce((acc, detalle) => {
      const cantidadDetalle = Number(detalle?.cantidad_descuento);
      return acc + (Number.isFinite(cantidadDetalle) && cantidadDetalle > 0 ? cantidadDetalle : Number(detalle?.cantidad) || 0);
    }, 0) || cantidadTotal;

    const key = obtenerKeyItem(item, itemIndex);
    registrarDescuentoItem({
      key,
      tipo: descuentoPorcentaje > 0 ? 'porcentaje' : 'monto',
      valor:
        descuentoPorcentaje > 0
          ? descuentoPorcentaje
          : cantidadAplicada > 0
          ? redondearMonedaCaja(descuentoMonto / cantidadAplicada)
          : redondearMonedaCaja(descuentoMonto),
      cantidad: Math.min(cantidadAplicada, cantidadTotal) || cantidadTotal || 1,
      cantidad_total: cantidadTotal || 1,
      montoCalculado: descuentoMonto,
      precioUnitario: Number(item?.precio_unitario) || 0,
      detalle_ids: detalles.map((detalle) => ({
        detalle_id: Number(detalle?.detalle_id ?? detalle?.detalleId ?? detalle?.id),
        cantidad: Number(detalle?.cantidad) || 0,
        precio_unitario: Number(detalle?.precio_unitario) || 0,
      })),
    });
  });
};



const expandirDescuentosPorDetalle = () => {

  const payload = [];



  descuentosPorItem.forEach((entrada) => {

    if (Array.isArray(entrada.detalle_ids) && entrada.detalle_ids.length) {

      let restante = Number(entrada.cantidad) || 0;

      const valorPorcentaje = Number(entrada.valor) || 0;

      const montoPorUnidad = Number(entrada.valor) || 0;

      const precioUnitario = Number(entrada.precioUnitario) || 0;



      for (const detalle of entrada.detalle_ids) {

        if (!Number.isFinite(Number(detalle.detalle_id))) continue;

        const cantidadDetalle = Number(detalle.cantidad) || 0;

        const cantidadAplicada = Math.min(cantidadDetalle, restante);

        if (cantidadAplicada <= 0) continue;

        const registro = {

          detalle_id: Number(detalle.detalle_id),

          cantidad_descuento: cantidadAplicada,

        };

        if (entrada.tipo === 'porcentaje') {

          const aplicaCompleto = cantidadAplicada >= cantidadDetalle;

          if (aplicaCompleto) {

            registro.descuento_porcentaje = valorPorcentaje;

            registro.descuento_monto = 0;

          } else {

            registro.descuento_porcentaje = 0;

            const basePrecio = precioUnitario || Number(detalle.precio_unitario) || 0;

            registro.descuento_monto = Math.round(basePrecio * cantidadAplicada * (valorPorcentaje / 100) * 100) / 100;

          }

        } else {

          registro.descuento_porcentaje = 0;

          registro.descuento_monto = Math.round(montoPorUnidad * cantidadAplicada * 100) / 100;

        }

        payload.push(registro);

        restante -= cantidadAplicada;

        if (restante <= 0) break;

      }

      return;

    }



    if (!Number.isFinite(Number(entrada.detalle_id))) {

      return;

    }



    const cantidadTotal = Number(entrada.cantidad_total) || Number(entrada.cantidad) || 0;

    const cantidadAplicada = Number(entrada.cantidad) || 0;

    const aplicaCompleto = entrada.tipo === 'porcentaje' && cantidadTotal > 0 && cantidadAplicada >= cantidadTotal;

    const descuentoMonto = Number(entrada.montoCalculado) || 0;



    payload.push({

      detalle_id: Number(entrada.detalle_id),

      descuento_porcentaje: aplicaCompleto ? Number(entrada.valor) || 0 : 0,

      descuento_monto: aplicaCompleto ? 0 : descuentoMonto,

      cantidad_descuento: cantidadAplicada,

    });

  });



  return payload;

};



const actualizarEfectivoEsperado = () => {

  const esperado = calcularEfectivoEsperado();

  resumenCuadre.totalSistema = esperado;



  setCampoCuadre('cuadre-total-sistema', esperado);

  setCampoCuadre('cuadre-fondo-display', obtenerFondoInicial());

  setCampoCuadre('cuadre-salidas-display', obtenerSalidasEfectivo());

  setCampoCuadre('cuadre-efectivo-esperado', esperado);

};



const obtenerEfectivoAplicadoCuadre = (pedido = {}) => {
  const efectivoRegistrado = Number(pedido.pago_efectivo) || 0;
  if (efectivoRegistrado > 0) return efectivoRegistrado;

  const efectivoEntregado = Number(pedido.pago_efectivo_entregado) || 0;
  const cambioRegistrado = Number(pedido.pago_cambio) || 0;
  const efectivoInferido = Math.max(efectivoEntregado - cambioRegistrado, 0);
  if (efectivoInferido > 0) return efectivoInferido;

  const tarjeta = Number(pedido.pago_tarjeta) || 0;
  const transferencia = Number(pedido.pago_transferencia) || 0;
  const totalPedido = Math.max(
    (Number(pedido.subtotal) || 0) +
      (Number(pedido.impuesto) || 0) -
      (Number(pedido.descuento_monto) || 0) +
      (Number(pedido.propina_monto) || 0),
    0
  );
  if (tarjeta <= 0 && transferencia <= 0 && totalPedido > 0) {
    return totalPedido;
  }

  return 0;
};

const obtenerMetodoPagoLabel = (pedido = {}) => {

  const efectivoAplicado = obtenerEfectivoAplicadoCuadre(pedido);

  const tarjeta = Number(pedido.pago_tarjeta) || 0;

  const transferencia = Number(pedido.pago_transferencia) || 0;



  const partes = [];

  if (efectivoAplicado > 0) partes.push('Efectivo');

  if (tarjeta > 0) partes.push('Tarjeta');

  if (transferencia > 0) partes.push('Transferencia/Deposito');



  return partes.length ? partes.join(' + ') : 'Sin registrar';

};

const obtenerMetodoPagoValorCuadre = (pedido = {}) => {
  const efectivoAplicado = obtenerEfectivoAplicadoCuadre(pedido);
  const tarjeta = Number(pedido.pago_tarjeta) || 0;
  const transferencia = Number(pedido.pago_transferencia) || 0;

  const activos = [
    efectivoAplicado > 0 ? 'efectivo' : null,
    tarjeta > 0 ? 'tarjeta' : null,
    transferencia > 0 ? 'transferencia' : null,
  ].filter(Boolean);

  if (!activos.length) return 'sin_registrar';
  if (activos.length > 1) return 'mixto';
  return activos[0];
};

const limpiarDetalleCuadreExpandido = () => {
  if (detalleCuadreFilaActiva) {
    detalleCuadreFilaActiva.classList.remove('is-expanded');
    detalleCuadreFilaActiva.setAttribute('aria-expanded', 'false');
  }
  detalleCuadreFilaActiva = null;
  detalleCuadreIdActivo = null;
  const existente = cuadreDetalleBody?.querySelector('tr.cuadre-detalle-expand');
  if (existente) existente.remove();
};

const construirDetalleCuadreProductos = (cuenta) => {
  const items = Array.isArray(cuenta?.items_agregados) ? cuenta.items_agregados : [];
  if (!items.length) {
    return `
      <div class="cuadre-detalle-panel">
        <div class="cuadre-detalle-empty">No hay productos registrados para esta venta.</div>
      </div>
    `;
  }

  const filas = items
    .map((item) => {
      const nombre = item.nombre || 'Producto';
      const cantidad = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      const totalLinea = Number(item.total_linea) || 0;
      const descuento = Number(item.descuento_monto) || 0;
      const detalle = `${cantidad} x ${formatCurrency(precio)} = ${formatCurrency(totalLinea)}`;
      const textoDescuento = descuento > 0 ? ` (Desc. ${formatCurrency(descuento)})` : '';
      return `
        <div class="cuadre-detalle-item">
          <span class="cuadre-detalle-nombre">${nombre}</span>
          <span class="cuadre-detalle-meta">${detalle}${textoDescuento}</span>
        </div>
      `;
    })
    .join('');

  return `
    <div class="cuadre-detalle-panel">
      <div class="cuadre-detalle-title">Productos vendidos</div>
      <div class="cuadre-detalle-items">${filas}</div>
    </div>
  `;
};

const obtenerDetalleCuadre = async (cuadreId) => {
  const respuesta = await fetchAutorizadoCaja(`/api/caja/cuadre/${cuadreId}/detalle`);
  if (!respuesta.ok) {
    throw new Error('No se pudo obtener el detalle de la venta.');
  }
  const data = await respuesta.json();
  if (!data?.ok || !data.cuenta) {
    throw new Error(data?.error || 'No se pudo obtener el detalle de la venta.');
  }
  return data.cuenta;
};

const mostrarDetalleCuadre = async (fila, cuadreId) => {
  if (!cuadreDetalleBody) return;
  if (detalleCuadreIdActivo === cuadreId) {
    limpiarDetalleCuadreExpandido();
    return;
  }

  limpiarDetalleCuadreExpandido();
  detalleCuadreIdActivo = cuadreId;
  detalleCuadreFilaActiva = fila;
  fila.classList.add('is-expanded');
  fila.setAttribute('aria-expanded', 'true');

  const filaDetalle = document.createElement('tr');
  filaDetalle.className = 'cuadre-detalle-expand';
  const celda = document.createElement('td');
  celda.colSpan = 6;
  celda.textContent = 'Cargando productos...';
  filaDetalle.appendChild(celda);
  fila.parentNode?.insertBefore(filaDetalle, fila.nextSibling);

  try {
    let cuenta = detalleCuadreCache.get(cuadreId);
    if (!cuenta) {
      cuenta = await obtenerDetalleCuadre(cuadreId);
      detalleCuadreCache.set(cuadreId, cuenta);
    }
    celda.innerHTML = construirDetalleCuadreProductos(cuenta);
  } catch (error) {
    celda.textContent =
      error?.message || 'No se pudo cargar el detalle de productos. Intenta nuevamente.';
  }
};

const setMensajeLista = (texto, tipo = 'info') => {

  if (!mensajeLista) return;

  mensajeLista.textContent = texto;

  mensajeLista.dataset.type = texto ? tipo : '';

};



const setMensajeDetalle = (texto, tipo = 'info') => {

  if (!mensajeDetalle) return;

  mensajeDetalle.textContent = texto;

  mensajeDetalle.dataset.type = texto ? tipo : '';

};

const setMensajeSplit = (texto, tipo = 'info') => {
  if (!splitModalMensaje) return;
  splitModalMensaje.textContent = texto;
  splitModalMensaje.dataset.type = texto ? tipo : '';
};

const setMensajeMerge = (texto, tipo = 'info') => {
  if (!mergeModalMensaje) return;
  mergeModalMensaje.textContent = texto;
  mergeModalMensaje.dataset.type = texto ? tipo : '';
};

const setMensajePasswordAdmin = (texto, tipo = 'info') => {
  if (!adminPasswordModalMensaje) return;
  adminPasswordModalMensaje.textContent = texto;
  adminPasswordModalMensaje.dataset.type = texto ? tipo : '';
};

const mostrarModal = (overlay) => {
  if (!overlay) return;
  overlay.hidden = false;
  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
  });
};

const ocultarModal = (overlay) => {
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  setTimeout(() => {
    overlay.hidden = true;
  }, 200);
};

const cerrarModalPasswordAdmin = (valor = null) => {
  ocultarModal(adminPasswordModal);
  if (adminPasswordModalInput) {
    adminPasswordModalInput.value = '';
  }
  setMensajePasswordAdmin('');
  const resolver = resolverPasswordAdminPendiente;
  resolverPasswordAdminPendiente = null;
  if (resolver) {
    resolver(valor);
  }
};

const confirmarModalPasswordAdmin = () => {
  const password = (adminPasswordModalInput?.value || '').trim();
  if (!password) {
    setMensajePasswordAdmin('Ingresa la contrasena de admin.', 'error');
    adminPasswordModalInput?.focus();
    return;
  }
  cerrarModalPasswordAdmin(password);
};



const setCuadreMensaje = (texto, tipo = 'info') => {

  if (!cuadreMensaje) return;

  cuadreMensaje.textContent = texto;

  cuadreMensaje.dataset.type = texto ? tipo : '';

};



const resetFormularioCuadre = () => {

  if (cuadreDeclaradoInput) setMoneyInputValueCaja(cuadreDeclaradoInput, '');

  if (cuadreFondoInicialInput) {

    setMoneyInputValueCaja(cuadreFondoInicialInput, '');

    delete cuadreFondoInicialInput.dataset.dirty;

  }

  const usuarioActual = obtenerUsuarioActual();

  if (cuadreUsuarioInput) {

    cuadreUsuarioInput.value = usuarioActual?.nombre || usuarioActual?.usuario || '';

  }

  if (cuadreObservacionesInput) cuadreObservacionesInput.value = '';

  if (cuadreDiferenciaDisplay) {

    cuadreDiferenciaDisplay.textContent = formatCurrencySigned(0);

    cuadreDiferenciaDisplay.dataset.sign = 'neutral';

  }

  actualizarEfectivoEsperado();

};



const obtenerFechaLocalHoy = () => {

  const ahora = new Date();

  const tzOffset = ahora.getTimezoneOffset();

  const local = new Date(ahora.getTime() - tzOffset * 60000);

  return local.toISOString().slice(0, 10);

};



const limpiarSeleccion = () => {

  cuentaSeleccionada = null;
  splitItems = [];
  splitItemsMap = new Map();
  splitSeleccion.clear();
  mergeSeleccion.clear();

  limpiarDescuentosItems();

  if (formulario) formulario.hidden = true;

  if (seleccionPlaceholder) {

    seleccionPlaceholder.hidden = false;

    seleccionPlaceholder.textContent = 'Selecciona una cuenta para ver el detalle de cobro.';

  }

  if (formulario) formulario.reset();

  if (infoContainer) infoContainer.innerHTML = '';

  if (itemsContainer) itemsContainer.innerHTML = '';

  if (inputClienteNombre) inputClienteNombre.value = '';

  if (inputClienteDocumento) inputClienteDocumento.value = '';

  if (inputClienteBuscar) inputClienteBuscar.value = '';
  reiniciarLookupDgii();

  resetPagosFormulario(0);

  seleccionarTipoComprobantePermitido('B02');

  if (inputNcfManual) inputNcfManual.value = '';

  if (inputComentarios) inputComentarios.value = '';
  if (inputDescuento) inputDescuento.disabled = false;
  if (inputPropina) inputPropina.disabled = false;

  if (facturaAcciones) {

    facturaAcciones.hidden = true;

    if (facturaInfo) facturaInfo.innerHTML = '';

  }

  if (botonCobrar) {

    botonCobrar.disabled = false;

    botonCobrar.textContent = 'Confirmar pago';

    botonCobrar.classList.remove('is-loading');

  }
  if (botonCobroAdelantado) {
    botonCobroAdelantado.hidden = true;
    botonCobroAdelantado.disabled = false;
    botonCobroAdelantado.textContent = 'Cobrar por adelantado';
    botonCobroAdelantado.classList.remove('is-loading');
  }
  if (botonSepararCuenta) botonSepararCuenta.disabled = true;
  if (botonJuntarCuentas) botonJuntarCuentas.disabled = true;
  if (botonEliminarCuenta) botonEliminarCuenta.disabled = true;

  calculo = {

    subtotal: 0,

    impuesto: 0,

    descuentoPorcentaje: 0,

    propinaPorcentaje: 10,

    descuentoGeneralMonto: 0,

    descuentoItemsMonto: 0,

    descuentoPorcentajeEfectivo: 0,

    descuentoMonto: 0,

    propinaMonto: 0,

    baseConDescuento: 0,

    baseSinDescuento: 0,

    total: 0,

  };

  actualizarResumenUI();

};



const prepararSplitItems = () => {
  splitItems = construirItemsSeparar();
  splitItemsMap = new Map(splitItems.map((item) => [item.detalle_id, item]));
};

const TOLERANCIA_CANTIDAD_SPLIT = 0.0001;

const redondearCantidadSplit = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Number(Math.max(numero, 0).toFixed(4));
};

const formatearCantidadSplit = (valor) => {
  const numero = redondearCantidadSplit(valor);
  if (numero <= 0) return '0';
  if (Number.isInteger(numero)) return String(numero);
  return String(numero).replace(/\.?0+$/, '');
};

const obtenerCantidadMaximaSplit = (item) => redondearCantidadSplit(Number(item?.cantidad) || 0);

const calcularTotalLineaProporcionalSplit = (item, cantidadSeleccionada) => {
  const cantidadTotal = obtenerCantidadMaximaSplit(item);
  if (cantidadTotal <= 0) return 0;
  const cantidad = Math.min(redondearCantidadSplit(cantidadSeleccionada), cantidadTotal);
  const proporcion = cantidadTotal > 0 ? cantidad / cantidadTotal : 0;
  const totalLinea = Math.max(Number(item?.total_linea) || 0, 0);
  return redondearMonedaCaja(totalLinea * proporcion);
};

const obtenerCantidadSeleccionadaSplit = (detalleId) => {
  const seleccion = splitSeleccion.get(detalleId);
  if (!seleccion) return 0;
  return redondearCantidadSplit(seleccion.cantidad);
};

const establecerCantidadSeleccionSplit = (detalleId, cantidadEntrada) => {
  const item = splitItemsMap.get(detalleId);
  if (!item) return false;
  const maximo = obtenerCantidadMaximaSplit(item);
  if (maximo <= TOLERANCIA_CANTIDAD_SPLIT) {
    splitSeleccion.delete(detalleId);
    return false;
  }

  const cantidad =
    typeof cantidadEntrada === 'string'
      ? redondearCantidadSplit(Number(cantidadEntrada.replace(',', '.')))
      : redondearCantidadSplit(cantidadEntrada);
  const cantidadFinal = Math.min(Math.max(cantidad, 0), maximo);

  if (!Number.isFinite(cantidadFinal) || cantidadFinal <= TOLERANCIA_CANTIDAD_SPLIT) {
    splitSeleccion.delete(detalleId);
    return false;
  }

  splitSeleccion.set(detalleId, {
    detalle_id: detalleId,
    cantidad: cantidadFinal,
  });
  return true;
};

const calcularTotalesSplit = () => {
  const subtotalTotal = splitItems.reduce((acc, item) => acc + (Number(item.total_linea) || 0), 0);
  const subtotalSeleccion = Array.from(splitSeleccion.entries()).reduce((acc, [detalleId, seleccion]) => {
    const item = splitItemsMap.get(Number(detalleId));
    if (!item) return acc;
    return acc + calcularTotalLineaProporcionalSplit(item, seleccion?.cantidad);
  }, 0);
  const subtotalRestante = Math.max(subtotalTotal - subtotalSeleccion, 0);
  return { subtotalTotal, subtotalSeleccion, subtotalRestante };
};

const renderSplitModalContenido = () => {
  if (!splitModalOrigen || !splitModalDestino) return;

  splitModalOrigen.innerHTML = '';
  splitModalDestino.innerHTML = '';

  if (!splitItems.length) {
    splitModalOrigen.innerHTML = '<div class="caja-merge-lista-vacia">No hay productos para separar.</div>';
  }

  splitItems.forEach((item) => {
    const cantidadMaxima = obtenerCantidadMaximaSplit(item);
    const cantidadSeleccionada = Math.min(
      Math.max(obtenerCantidadSeleccionadaSplit(item.detalle_id), 0),
      cantidadMaxima
    );
    const seleccionado = cantidadSeleccionada > TOLERANCIA_CANTIDAD_SPLIT;
    if (splitSeleccion.has(item.detalle_id) && !seleccionado) {
      splitSeleccion.delete(item.detalle_id);
    }
    const row = document.createElement('div');
    row.className = `caja-split-item${seleccionado ? ' caja-split-item--selected' : ''}`;

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.detalleId = item.detalle_id;
    checkbox.checked = seleccionado;
    label.appendChild(checkbox);

    const info = document.createElement('div');
    const nombre = document.createElement('div');
    nombre.textContent = item.nombre;
    const meta = document.createElement('div');
    meta.className = 'caja-split-item-meta';
    const pedidoLabel = item.pedido_id ? `Pedido #${item.pedido_id}` : 'Pedido';
    meta.textContent = `${pedidoLabel} • ${formatearCantidadSplit(cantidadMaxima)} x ${formatCurrency(
      item.precio_unitario
    )}`;
    info.appendChild(nombre);
    info.appendChild(meta);
    label.appendChild(info);
    row.appendChild(label);

    const acciones = document.createElement('div');
    acciones.className = 'caja-split-item-actions';
    const total = document.createElement('div');
    total.className = 'caja-split-item-total';
    total.textContent = formatCurrency(
      seleccionado ? calcularTotalLineaProporcionalSplit(item, cantidadSeleccionada) : item.total_linea
    );
    acciones.appendChild(total);

    if (seleccionado) {
      const cantidadWrap = document.createElement('label');
      cantidadWrap.className = 'caja-split-cantidad';
      const cantidadTitulo = document.createElement('span');
      cantidadTitulo.textContent = 'Mover';
      const cantidadInput = document.createElement('input');
      cantidadInput.type = 'number';
      cantidadInput.min = '0';
      cantidadInput.max = String(cantidadMaxima);
      cantidadInput.step = Number.isInteger(cantidadMaxima) ? '1' : '0.01';
      cantidadInput.value = formatearCantidadSplit(cantidadSeleccionada);
      cantidadInput.dataset.detalleId = item.detalle_id;
      cantidadInput.dataset.accion = 'cantidad';
      cantidadWrap.appendChild(cantidadTitulo);
      cantidadWrap.appendChild(cantidadInput);
      acciones.appendChild(cantidadWrap);
    }

    row.appendChild(acciones);

    splitModalOrigen.appendChild(row);
  });

  const seleccionados = Array.from(splitSeleccion.entries())
    .map(([detalleId, seleccion]) => {
      const item = splitItemsMap.get(Number(detalleId));
      if (!item) return null;
      const cantidad = Math.min(
        Math.max(redondearCantidadSplit(seleccion?.cantidad), 0),
        obtenerCantidadMaximaSplit(item)
      );
      if (cantidad <= TOLERANCIA_CANTIDAD_SPLIT) return null;
      return { item, cantidad };
    })
    .filter(Boolean);
  if (!seleccionados.length) {
    splitModalDestino.innerHTML = '<div class="caja-merge-lista-vacia">Selecciona productos para mover.</div>';
  } else {
    seleccionados.forEach(({ item, cantidad }) => {
      const row = document.createElement('div');
      row.className = 'caja-split-item caja-split-item--selected';
      const info = document.createElement('div');
      const nombre = document.createElement('div');
      nombre.textContent = item.nombre;
      const meta = document.createElement('div');
      meta.className = 'caja-split-item-meta';
      const pedidoLabel = item.pedido_id ? `Pedido #${item.pedido_id}` : 'Pedido';
      meta.textContent = `${pedidoLabel} • ${formatearCantidadSplit(cantidad)} de ${formatearCantidadSplit(
        item.cantidad
      )} x ${formatCurrency(item.precio_unitario)}`;
      info.appendChild(nombre);
      info.appendChild(meta);
      row.appendChild(info);

      const acciones = document.createElement('div');
      acciones.className = 'caja-split-item-actions';
      const total = document.createElement('div');
      total.className = 'caja-split-item-total';
      total.textContent = formatCurrency(calcularTotalLineaProporcionalSplit(item, cantidad));
      acciones.appendChild(total);

      const cantidadWrap = document.createElement('label');
      cantidadWrap.className = 'caja-split-cantidad';
      const cantidadTitulo = document.createElement('span');
      cantidadTitulo.textContent = 'Mover';
      const cantidadInput = document.createElement('input');
      cantidadInput.type = 'number';
      cantidadInput.min = '0';
      cantidadInput.max = String(obtenerCantidadMaximaSplit(item));
      cantidadInput.step = Number.isInteger(Number(item.cantidad) || 0) ? '1' : '0.01';
      cantidadInput.value = formatearCantidadSplit(cantidad);
      cantidadInput.dataset.detalleId = item.detalle_id;
      cantidadInput.dataset.accion = 'cantidad';
      cantidadWrap.appendChild(cantidadTitulo);
      cantidadWrap.appendChild(cantidadInput);
      acciones.appendChild(cantidadWrap);

      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'kanm-button ghost';
      quitar.dataset.detalleId = item.detalle_id;
      quitar.dataset.accion = 'quitar';
      quitar.textContent = 'Quitar';
      acciones.appendChild(quitar);

      row.appendChild(acciones);
      splitModalDestino.appendChild(row);
    });
  }

  const { subtotalTotal, subtotalSeleccion } = calcularTotalesSplit();
  const totalesCuenta = totalesBaseCuenta(cuentaSeleccionada);
  const impuestoIncluido = esCuentaConImpuestoIncluidoEnSplit(subtotalTotal, totalesCuenta);
  const totalesSeleccion = calcularResumenSegmentoSplit(
    subtotalSeleccion,
    subtotalTotal,
    totalesCuenta,
    impuestoIncluido
  );
  const totalesRestantes = {
    subtotal: redondearMonedaCaja(
      Math.max((Number(totalesCuenta.subtotal) || 0) - (Number(totalesSeleccion.subtotal) || 0), 0)
    ),
    impuesto: redondearMonedaCaja(
      Math.max((Number(totalesCuenta.impuesto) || 0) - (Number(totalesSeleccion.impuesto) || 0), 0)
    ),
    total: redondearMonedaCaja(
      Math.max((Number(totalesCuenta.total) || 0) - (Number(totalesSeleccion.total) || 0), 0)
    ),
  };

  if (splitModalTotalesOrigen) {
    splitModalTotalesOrigen.innerHTML = `
      <div class="flex-between"><span>Subtotal</span><strong>${formatCurrency(totalesRestantes.subtotal)}</strong></div>
      <div class="flex-between"><span>ITBIS</span><strong>${formatCurrency(totalesRestantes.impuesto)}</strong></div>
      <div class="flex-between total"><span>Total</span><strong>${formatCurrency(totalesRestantes.total)}</strong></div>
    `;
  }

  if (splitModalTotalesDestino) {
    splitModalTotalesDestino.innerHTML = `
      <div class="flex-between"><span>Subtotal</span><strong>${formatCurrency(totalesSeleccion.subtotal)}</strong></div>
      <div class="flex-between"><span>ITBIS</span><strong>${formatCurrency(totalesSeleccion.impuesto)}</strong></div>
      <div class="flex-between total"><span>Total</span><strong>${formatCurrency(totalesSeleccion.total)}</strong></div>
    `;
  }

  if (splitModalConfirmar) {
    splitModalConfirmar.disabled = splitSeleccion.size === 0;
  }
};

const abrirSplitModal = () => {
  if (!cuentaSeleccionada) {
    setMensajeDetalle('Selecciona una cuenta para separar.', 'error');
    return;
  }
  if (!cuentaPermiteCambiosEstructurales(cuentaSeleccionada)) {
    setMensajeDetalle('Esta cuenta no permite separaciones porque esta en curso o ya tiene pagos registrados.', 'error');
    return;
  }

  prepararSplitItems();
  splitSeleccion.clear();
  setMensajeSplit('');

  if (splitModalSubtitle) {
    const mesaCliente = [];
    if (cuentaSeleccionada.mesa) mesaCliente.push(cuentaSeleccionada.mesa);
    if (cuentaSeleccionada.cliente) mesaCliente.push(cuentaSeleccionada.cliente);
    splitModalSubtitle.textContent = `Cuenta #${cuentaSeleccionada.cuenta_id}${
      mesaCliente.length ? ` • ${mesaCliente.join(' - ')}` : ''
    }`;
  }

  renderSplitModalContenido();
  mostrarModal(splitModal);
};

const cerrarSplitModal = () => {
  ocultarModal(splitModal);
  splitSeleccion.clear();
  setMensajeSplit('');
};

const confirmarSeparacion = async () => {
  if (!cuentaSeleccionada) return;
  const solicitudes = Array.from(splitSeleccion.entries())
    .map(([detalleId, seleccion]) => {
      const item = splitItemsMap.get(Number(detalleId));
      if (!item) return null;
      const cantidad = Math.min(
        Math.max(redondearCantidadSplit(seleccion?.cantidad), 0),
        obtenerCantidadMaximaSplit(item)
      );
      if (cantidad <= TOLERANCIA_CANTIDAD_SPLIT) return null;
      return {
        detalle_id: Number(detalleId),
        cantidad,
      };
    })
    .filter(Boolean);
  const cuentaOriginal = cuentaSeleccionada.cuenta_id;
  if (!solicitudes.length) {
    setMensajeSplit('Selecciona productos y cantidades para separar.', 'error');
    return;
  }

  try {
    setMensajeSplit('Separando cuenta...', 'info');
    if (splitModalConfirmar) {
      splitModalConfirmar.disabled = true;
      splitModalConfirmar.classList.add('is-loading');
    }

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaSeleccionada.cuenta_id}/separar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ detalle_ids: solicitudes }),
    });

    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);
    if (!esJson) {
      throw construirErrorNoJsonCaja(respuesta, data, contentType);
    }
    if (!respuesta.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo separar la cuenta.');
    }

    cerrarSplitModal();
    await recargarEstadoCaja(false);
    if (data?.cuenta_nueva_id) {
      const nuevaId = Number(data.cuenta_nueva_id);
      if (Number.isFinite(nuevaId) && cuentas.some((cuenta) => cuenta.cuenta_id === nuevaId)) {
        seleccionarCuenta(nuevaId);
      }
    }
    notificarActualizacionGlobal('pedido-actualizado', {
      cuentaId: cuentaOriginal,
      cuentaNuevaId: data?.cuenta_nueva_id,
    });
  } catch (error) {
    console.error('Error al separar cuenta:', error);
    setMensajeSplit(error.message || 'No se pudo separar la cuenta.', 'error');
  } finally {
    if (splitModalConfirmar) {
      splitModalConfirmar.disabled = splitSeleccion.size === 0;
      splitModalConfirmar.classList.remove('is-loading');
    }
  }
};

const obtenerCuentasDisponiblesMerge = () => {
  if (!cuentaSeleccionada) return [];
  if (!cuentaPermiteCambiosEstructurales(cuentaSeleccionada)) return [];
  const mesaBase = (cuentaSeleccionada.mesa || '').toString().trim();
  return (cuentas || []).filter((cuenta) => {
    if (cuenta.cuenta_id === cuentaSeleccionada.cuenta_id) return false;
    if (!cuentaPermiteCambiosEstructurales(cuenta)) return false;
    if (!mesaBase) return true;
    const mesaCuenta = (cuenta.mesa || '').toString().trim();
    return !mesaCuenta || mesaCuenta === mesaBase;
  });
};

const renderMergeModalContenido = () => {
  if (!mergeModalLista) return;
  mergeModalLista.innerHTML = '';

  const disponibles = obtenerCuentasDisponiblesMerge();
  if (!disponibles.length) {
    mergeModalLista.innerHTML = '<div class="caja-merge-lista-vacia">No hay cuentas disponibles para juntar.</div>';
    if (mergeModalConfirmar) mergeModalConfirmar.disabled = true;
    if (mergeModalResumen) mergeModalResumen.innerHTML = '';
    return;
  }

  disponibles.forEach((cuenta) => {
    const cuentaId = cuenta.cuenta_id;
    const seleccionado = mergeSeleccion.has(cuentaId);
    const row = document.createElement('div');
    row.className = `caja-merge-item${seleccionado ? ' caja-split-item--selected' : ''}`;

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.cuentaId = cuentaId;
    checkbox.checked = seleccionado;
    label.appendChild(checkbox);

    const info = document.createElement('div');
    const nombre = document.createElement('div');
    nombre.textContent = `Cuenta #${cuentaId}`;
    const meta = document.createElement('div');
    meta.className = 'caja-merge-item-meta';
    const mesaTexto = cuenta.mesa ? `Mesa ${cuenta.mesa}` : 'Sin mesa';
    meta.textContent = `${mesaTexto} • Total ${formatCurrency(obtenerTotalCuenta(cuenta))}`;
    info.appendChild(nombre);
    info.appendChild(meta);
    label.appendChild(info);
    row.appendChild(label);

    const total = document.createElement('div');
    total.className = 'caja-merge-item-total';
    total.textContent = formatCurrency(obtenerTotalCuenta(cuenta));
    row.appendChild(total);

    mergeModalLista.appendChild(row);
  });

  const totalDestino = obtenerTotalCuenta(cuentaSeleccionada);
  const totalSeleccion = disponibles.reduce(
    (acc, cuenta) => (mergeSeleccion.has(cuenta.cuenta_id) ? acc + obtenerTotalCuenta(cuenta) : acc),
    0
  );

  if (mergeModalResumen) {
    mergeModalResumen.innerHTML = `
      <div class="flex-between"><span>Cuenta destino</span><strong>#${cuentaSeleccionada.cuenta_id}</strong></div>
      <div class="flex-between"><span>Total actual</span><strong>${formatCurrency(totalDestino)}</strong></div>
      <div class="flex-between"><span>Cuentas seleccionadas</span><strong>${mergeSeleccion.size}</strong></div>
      <div class="flex-between total"><span>Total combinado</span><strong>${formatCurrency(
        totalDestino + totalSeleccion
      )}</strong></div>
    `;
  }

  if (mergeModalConfirmar) {
    mergeModalConfirmar.disabled = mergeSeleccion.size === 0;
  }
};

const abrirMergeModal = () => {
  if (!cuentaSeleccionada) {
    setMensajeDetalle('Selecciona una cuenta para juntar.', 'error');
    return;
  }
  if (!cuentaPermiteCambiosEstructurales(cuentaSeleccionada)) {
    setMensajeDetalle('Esta cuenta no permite juntar pedidos porque esta en curso o ya tiene pagos registrados.', 'error');
    return;
  }

  mergeSeleccion.clear();
  setMensajeMerge('');
  if (mergeModalSubtitle) {
    const mesaCliente = [];
    if (cuentaSeleccionada.mesa) mesaCliente.push(cuentaSeleccionada.mesa);
    if (cuentaSeleccionada.cliente) mesaCliente.push(cuentaSeleccionada.cliente);
    mergeModalSubtitle.textContent = `Cuenta destino #${cuentaSeleccionada.cuenta_id}${
      mesaCliente.length ? ` • ${mesaCliente.join(' - ')}` : ''
    }`;
  }

  renderMergeModalContenido();
  mostrarModal(mergeModal);
};

const cerrarMergeModal = () => {
  ocultarModal(mergeModal);
  mergeSeleccion.clear();
  setMensajeMerge('');
};

const confirmarMerge = async () => {
  if (!cuentaSeleccionada) return;
  if (!mergeSeleccion.size) {
    setMensajeMerge('Selecciona al menos una cuenta para juntar.', 'error');
    return;
  }

  const cuentaDestino = cuentaSeleccionada.cuenta_id;
  const cuentaIds = [cuentaDestino, ...Array.from(mergeSeleccion)];

  try {
    setMensajeMerge('Juntando cuentas...', 'info');
    if (mergeModalConfirmar) {
      mergeModalConfirmar.disabled = true;
      mergeModalConfirmar.classList.add('is-loading');
    }

    const respuesta = await fetchAutorizadoCaja('/api/cuentas/juntar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cuenta_ids: cuentaIds, cuenta_destino_id: cuentaDestino }),
    });

    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);
    if (!esJson) {
      throw construirErrorNoJsonCaja(respuesta, data, contentType);
    }
    if (!respuesta.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudieron juntar las cuentas.');
    }

    cerrarMergeModal();
    await recargarEstadoCaja(false);
    if (cuentas.some((cuenta) => cuenta.cuenta_id === cuentaDestino)) {
      seleccionarCuenta(cuentaDestino);
    }
    notificarActualizacionGlobal('pedido-actualizado', { cuentaId: cuentaDestino });
  } catch (error) {
    console.error('Error al juntar cuentas:', error);
    setMensajeMerge(error.message || 'No se pudieron juntar las cuentas.', 'error');
  } finally {
    if (mergeModalConfirmar) {
      mergeModalConfirmar.disabled = mergeSeleccion.size === 0;
      mergeModalConfirmar.classList.remove('is-loading');
    }
  }
};

const actualizarAccionesCuenta = () => {
  const cuentaEditable = cuentaPermiteCambiosEstructurales(cuentaSeleccionada);
  if (botonSepararCuenta) {
    prepararSplitItems();
    botonSepararCuenta.disabled = !cuentaEditable || splitItems.length === 0;
  }
  if (botonJuntarCuentas) {
    const disponibles = obtenerCuentasDisponiblesMerge();
    botonJuntarCuentas.disabled = !cuentaEditable || disponibles.length === 0;
  }
  if (botonEliminarCuenta) {
    botonEliminarCuenta.disabled = !cuentaEditable;
  }
  const hayPagosRegistrados = cuentaTienePagosRegistrados(cuentaSeleccionada);
  if (inputDescuento) inputDescuento.disabled = hayPagosRegistrados;
  if (inputPropina) inputPropina.disabled = hayPagosRegistrados;
  if (botonCobrar) {
    const puedeCobrar = cuentaEstaListaParaCobro(cuentaSeleccionada);
    const saldoPendiente = cuentaSeleccionada ? obtenerSaldoPendienteActual() : 0;
    botonCobrar.hidden = !cuentaSeleccionada || !puedeCobrar;
    botonCobrar.disabled = !cuentaSeleccionada || !puedeCobrar;
    botonCobrar.textContent =
      saldoPendiente <= 0.009 && hayPagosRegistrados ? 'Cerrar cuenta prepagada' : hayPagosRegistrados ? 'Cobrar restante' : 'Confirmar pago';
  }
  if (botonCobroAdelantado) {
    const cuentaEnCurso = cuentaSeleccionada && !cuentaEstaListaParaCobro(cuentaSeleccionada);
    const saldoPendiente = cuentaSeleccionada ? obtenerSaldoPendienteActual() : 0;
    botonCobroAdelantado.hidden = !cuentaEnCurso;
    botonCobroAdelantado.disabled = !cuentaEnCurso || saldoPendiente <= 0.009;
    botonCobroAdelantado.textContent =
      saldoPendiente <= 0.009
        ? 'Pago adelantado completado'
        : hayPagosRegistrados
        ? 'Cobrar restante por adelantado'
        : 'Cobrar por adelantado';
  }
};

const renderPedidos = () => {

  if (!pedidosContainer) return;



  pedidosContainer.innerHTML = '';



  if (!cuentas.length) {

    const vacio = document.createElement('div');

    vacio.className = 'caja-empty';

    vacio.textContent = modoCobroAdelantado
      ? 'No hay cuentas en curso ni listas para cobrar.'
      : 'No hay pedidos listos para cobrar.';

    pedidosContainer.appendChild(vacio);

    return;

  }



  const fragment = document.createDocumentFragment();



  cuentas.forEach((cuenta) => {

    const card = document.createElement('article');

    card.className = 'kanm-card';

    card.dataset.cuentaId = cuenta.cuenta_id;

    if (cuentaSeleccionada && cuentaSeleccionada.cuenta_id === cuenta.cuenta_id) {

      card.classList.add('caja-cuenta-seleccionada');

    }



    const header = document.createElement('div');

    header.className = 'flex-between';

    const estadoCuenta = (cuenta.estado_cuenta || cuenta.estado || 'listo').toString().toLowerCase();
    const pagosRegistrados = obtenerPagosRegistradosCuenta(cuenta);
    const badges = [
      `<span class="kanm-badge estado-${estadoCuenta}">${estadoCuenta === 'listo' ? 'Listo' : estadoCuenta}</span>`,
    ];
    if (pagosRegistrados.total > 0.009) {
      badges.push('<span class="badge-prepago">Prepago</span>');
    }

    header.innerHTML = `

      <div>

        <h3 style="margin: 0;">Cuenta #${cuenta.cuenta_id}</h3>

        <p class="kanm-subtitle" style="margin: 4px 0 0; color: inherit;">

          ${cuenta.mesa || 'Mesa no asignada'}${cuenta.cliente ? ` - ${cuenta.cliente}` : ''}

        </p>

      </div>

      <div class="caja-cuenta-badges">${badges.join('')}</div>

    `;



    const pedidosLista = document.createElement('div');

    pedidosLista.className = 'caja-cuenta-pedidos';

    (cuenta.pedidos || []).forEach((pedido) => {

      const bloque = document.createElement('div');

      bloque.className = 'caja-subcard';

      const fechaListo = formatDateTime(pedido.fecha_listo || pedido.fecha_cierre);
      const fechaEntrada = formatDateTime(pedido.fecha_creacion);
      const itemsPedido = Array.isArray(pedido.items) ? pedido.items : [];
      const resumenItems =
        itemsPedido.slice(0, 3).map((item) => {
          const cantidad = Number(item.cantidad) || 0;
          const nombre = item.nombre || 'Producto';
          return `<span class="pill-label">${cantidad || 1}x ${nombre}</span>`;
        }).join('') || '<span class="kanm-subtitle">Sin detalle</span>';

      bloque.innerHTML = `

        <div class="flex-between" style="gap: 8px; align-items: center;">

          <div>
            <div class="item-meta">${fechaEntrada} -> ${fechaListo}</div>
            <div class="caja-pedido-items" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
              ${resumenItems}
            </div>
          </div>

          <span class="estado-pill estado-${pedido.estado}">${pedido.estado}</span>

        </div>

      `;

      pedidosLista.appendChild(bloque);

    });



    const acciones = document.createElement('div');

    acciones.className = 'caja-acciones';



    const botonSeleccionar = document.createElement('button');

    botonSeleccionar.type = 'button';

    botonSeleccionar.className = 'kanm-button primary caja-select-btn';

    botonSeleccionar.textContent = 'Seleccionar';

    botonSeleccionar.dataset.id = cuenta.cuenta_id;

    botonSeleccionar.dataset.selectCuenta = cuenta.cuenta_id;

    botonSeleccionar.addEventListener('click', (event) => {

      event.stopPropagation();

      seleccionarCuenta(cuenta.cuenta_id);

    });



    acciones.appendChild(botonSeleccionar);



    card.appendChild(header);

    card.appendChild(pedidosLista);

    card.appendChild(acciones);

    card.addEventListener('click', () => seleccionarCuenta(cuenta.cuenta_id));



    fragment.appendChild(card);

  });



  pedidosContainer.appendChild(fragment);

};



const renderDetallePedido = () => {

  if (!cuentaSeleccionada) {

    if (infoContainer) infoContainer.innerHTML = '';

    if (itemsContainer) itemsContainer.innerHTML = '';

    if (seleccionPlaceholder) {

      seleccionPlaceholder.hidden = false;

      seleccionPlaceholder.textContent = 'Selecciona una cuenta de la izquierda para ver el detalle y cobrar.';

    }

    return;

  }



  const pedidosCuenta = cuentaSeleccionada.pedidos || [];

  const encabezado = pedidosCuenta[0];
  const pagosRegistrados = obtenerPagosRegistradosCuenta(cuentaSeleccionada);
  const estadoCuenta = (cuentaSeleccionada.estado_cuenta || cuentaSeleccionada.estado || 'listo').toString();
  reiniciarLookupDgii();



  if (inputClienteNombre) inputClienteNombre.value = cuentaSeleccionada.cliente || '';

  if (inputClienteDocumento) inputClienteDocumento.value = encabezado?.cliente_documento || '';

  seleccionarTipoComprobantePermitido(encabezado?.tipo_comprobante || 'B02');

  if (inputNcfManual) inputNcfManual.value = encabezado?.ncf || '';

  if (inputComentarios) inputComentarios.value = encabezado?.comentarios || '';

  if (facturaAcciones) {

    facturaAcciones.hidden = true;

    if (facturaInfo) facturaInfo.innerHTML = '';

  }



  if (seleccionPlaceholder) {

    seleccionPlaceholder.hidden = true;

  }



  if (infoContainer) {

    const mesaCliente = [];

    if (cuentaSeleccionada.mesa) mesaCliente.push(cuentaSeleccionada.mesa);

    if (cuentaSeleccionada.cliente) mesaCliente.push(cuentaSeleccionada.cliente);



    infoContainer.innerHTML = `

      <div class="caja-detalle-linea">

        <span class="caja-detalle-etiqueta">Cuenta</span>

        <span>#${cuentaSeleccionada.cuenta_id}</span>

      </div>

      <div class="caja-detalle-linea">

        <span class="caja-detalle-etiqueta">Mesa / Cliente</span>

        <span>${mesaCliente.length ? mesaCliente.join(' - ') : 'Sin asignar'}</span>

      </div>

      <div class="caja-detalle-linea">

        <span class="caja-detalle-etiqueta">Creado</span>

        <span>${formatDateTime(encabezado?.fecha_creacion)}</span>

      </div>

      <div class="caja-detalle-linea">

        <span class="caja-detalle-etiqueta">Estado</span>

        <span>${estadoCuenta}</span>

      </div>

      <div class="caja-detalle-linea">

        <span class="caja-detalle-etiqueta">Pagado por adelantado</span>

        <span>${formatCurrency(pagosRegistrados.total)}</span>

      </div>

    `;

  }



  if (!itemsContainer) return;



  itemsContainer.innerHTML = '';



  const itemsAgrupados = cuentaSeleccionada.items_agregados || [];
  const bloquearDescuentos = cuentaTienePagosRegistrados(cuentaSeleccionada);
  const bloquearCambiosEstructurales = !cuentaPermiteCambiosEstructurales(cuentaSeleccionada);

  if (!itemsAgrupados.length) {

    itemsContainer.innerHTML = '<p class="caja-empty">No hay productos registrados.</p>';

    return;

  }



  const lista = document.createElement('ul');

  lista.className = 'caja-items-lista';



  itemsAgrupados.forEach((item, itemIndex) => {

    const li = document.createElement('li');

    const key = obtenerKeyItem(item, itemIndex);

    const cantidad = Number(item.cantidad) || 0;

    const precioLinea = Number(item.precio_unitario) || 0;

    const subtotal = Number(item.total_linea || item.subtotal_sin_descuento) || cantidad * precioLinea;

    const descuentoActual = obtenerDescuentoItem(key);

    const tipoActual = descuentoActual?.tipo || 'porcentaje';

    const valorActual = descuentoActual ? descuentoActual.valor : '';

    const cantidadAplicada = descuentoActual?.cantidad || cantidad || 1;

    const resumenDescuento = descuentoActual

      ? `<div class="kanm-badge" style="margin-top: 4px;">Desc: ${

          descuentoActual.tipo === 'porcentaje'

            ? `${descuentoActual.valor}% x ${descuentoActual.cantidad}`

            : `${formatCurrency(descuentoActual.valor)} x ${descuentoActual.cantidad}`

        } = -${formatCurrency(descuentoActual.montoCalculado)}</div>`

      : '';

    const nombreItem = item.nombre || `Producto ${item.producto_id || ''}`;

    const nombreSeguro = nombreItem.replace(/"/g, '&quot;');



    li.innerHTML = `

      <div class="caja-item-header">

        <label class="caja-item-selector" style="display: flex; gap: 10px; align-items: flex-start; width: 100%;">

          <input

            type="checkbox"

            class="caja-item-descuento-toggle"

            data-item-key="${key}"

            ${descuentoActual ? 'checked' : ''}
            ${bloquearDescuentos ? 'disabled' : ''}

            style="margin-top: 4px;"

          />

          <div class="caja-item-detalle" style="flex: 1 1 auto;">

            <div class="caja-item-nombre" style="font-weight: 600;">${nombreItem}</div>
            <div class="caja-item-meta">${cantidad} x ${formatCurrency(precioLinea)} = ${formatCurrency(subtotal)}</div>

            ${resumenDescuento}

          </div>

        </label>

      </div>

      <div class="caja-item-tools">
        <div class="kanm-input-group caja-item-precio-group">
          <label>Precio unitario</label>
          <input
            type="number"
            class="caja-item-precio-input"
            data-item-index="${itemIndex}"
            min="0"
            step="0.01"
            value="${Number(precioLinea).toFixed(2)}"
            ${bloquearCambiosEstructurales ? 'disabled' : ''}
          />
        </div>
        <div class="caja-acciones caja-item-tools-actions">
          <button
            type="button"
            class="kanm-button ghost caja-item-actualizar-precio"
            data-item-index="${itemIndex}"
            ${bloquearCambiosEstructurales ? 'disabled' : ''}
          >
            Guardar precio
          </button>
          <button
            type="button"
            class="kanm-button ghost-danger caja-item-eliminar"
            data-item-index="${itemIndex}"
            data-nombre="${nombreSeguro}"
            ${bloquearCambiosEstructurales ? 'disabled' : ''}
          >
            Eliminar producto
          </button>
        </div>
      </div>

      <div class="caja-item-descuento-panel" data-panel-key="${key}" ${descuentoActual ? '' : 'hidden'}>

        <div class="flex-between" style="align-items: center; gap: 8px; margin: 4px 0;">

          <span class="pill-label">Descuento por producto</span>

          <span class="kanm-subtitle">Cantidad disponible: ${cantidad}</span>

        </div>

        <div class="kanm-form-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;">

          <div class="kanm-input-group">

            <label>Cantidad a aplicar descuento</label>

            <input

              type="number"

              class="caja-item-descuento-cantidad"

              data-item-key="${key}"

              min="1"

              max="${cantidad}"

              value="${cantidadAplicada}"
              ${bloquearDescuentos ? 'disabled' : ''}

            />

          </div>

          <div class="kanm-input-group">

            <label>Tipo de descuento</label>

            <select class="caja-item-descuento-tipo" data-item-key="${key}" ${bloquearDescuentos ? 'disabled' : ''}>

              <option value="porcentaje" ${tipoActual === 'porcentaje' ? 'selected' : ''}>Porcentaje (%)</option>

              <option value="monto" ${tipoActual === 'monto' ? 'selected' : ''}>Monto fijo</option>

            </select>

          </div>

          <div class="kanm-input-group">

            <label>Valor del descuento</label>

            <input

              type="number"

              class="caja-item-descuento-valor"

              data-item-key="${key}"

              min="0"

              step="0.01"

              value="${valorActual !== '' ? valorActual : ''}"

              placeholder="0.00"
              ${bloquearDescuentos ? 'disabled' : ''}

            />

          </div>

        </div>

        <div class="caja-acciones" style="justify-content: flex-end; margin-top: 6px;">

          <button

            type="button"

            class="kanm-button ghost caja-item-aplicar-descuento"

            data-item-key="${key}"

            data-item-index="${itemIndex}"

            data-producto="${item.producto_id}"

            data-precio="${item.precio_unitario}"

            data-max="${cantidad}"

            data-nombre="${nombreSeguro}"
            ${bloquearDescuentos ? 'disabled' : ''}

          >

            Aplicar descuento

          </button>

        </div>

      </div>

    `;



    lista.appendChild(li);

  });



  itemsContainer.appendChild(lista);


};

const obtenerBaseItemsCuentaDetalle = (cuenta = null) => {
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  const items = Array.isArray(cuentaObjetivo?.items_agregados) ? cuentaObjetivo.items_agregados : [];
  return items.reduce((acc, item) => {
    const cantidad = Number(item?.cantidad) || 0;
    const precio = Number(item?.precio_unitario) || 0;
    const fallback = cantidad * precio;
    const baseLinea = Number(item?.total_linea ?? item?.subtotal_sin_descuento);
    const valor = Number.isFinite(baseLinea) ? baseLinea : fallback;
    return acc + Math.max(valor, 0);
  }, 0);
};

const esCuentaConImpuestoIncluidoParaDescuentos = (cuenta = null) => {
  const cuentaObjetivo = cuenta || cuentaSeleccionada;
  if (!cuentaObjetivo) return false;
  const totales = totalesBaseCuenta(cuentaObjetivo);
  const subtotalItems = obtenerBaseItemsCuentaDetalle(cuentaObjetivo);
  if (subtotalItems <= 0) return false;
  return esCuentaConImpuestoIncluidoEnSplit(subtotalItems, totales);
};

const calcularTotales = () => {

  if (!cuentaSeleccionada) {

    calculo = {

      subtotal: 0,

      impuesto: 0,

      descuentoPorcentaje: 0,

      propinaPorcentaje: 10,

      descuentoGeneralMonto: 0,

      descuentoItemsMonto: 0,

      descuentoPorcentajeEfectivo: 0,

      descuentoMonto: 0,

      propinaMonto: 0,

      baseConDescuento: 0,

      baseSinDescuento: 0,

      total: 0,

    };

    return;

  }



  const totalesBase = totalesBaseCuenta(cuentaSeleccionada);

  const subtotal = Number(totalesBase.subtotal) || 0;

  const impuestoBase = Number(totalesBase.impuesto) || 0;

  const base = subtotal + impuestoBase;

  const descuentoPorcentaje = Math.max(Number(inputDescuento?.value) || 0, 0);

  const propinaPorcentaje = Math.max(Number(inputPropina?.value) || 0, 0);
  const usaImpuestoIncluido = esCuentaConImpuestoIncluidoParaDescuentos(cuentaSeleccionada);



  const descuentoItemsBruto = descuentosPorItem.reduce(

    (acc, item) => acc + (Number(item.montoCalculado) || 0),

    0

  );
  const topeItems = usaImpuestoIncluido ? base : subtotal;
  const descuentoItemsMonto = Math.min(Math.max(descuentoItemsBruto, 0), Math.max(topeItems, 0));

  let subtotalConItems = subtotal;
  let impuestoConItems = impuestoBase;
  let baseConItems = base;

  if (usaImpuestoIncluido) {
    const baseTrasItems = Math.max(base - descuentoItemsMonto, 0);
    const factorItems = base > 0 ? baseTrasItems / base : 1;
    subtotalConItems = subtotal * factorItems;
    impuestoConItems = impuestoBase * factorItems;
    baseConItems = subtotalConItems + impuestoConItems;
  } else {
    subtotalConItems = Math.max(subtotal - descuentoItemsMonto, 0);
    const factorItems = subtotal > 0 ? subtotalConItems / subtotal : 1;
    impuestoConItems = impuestoBase * factorItems;
    baseConItems = subtotalConItems + impuestoConItems;
  }

  const descuentoGeneralMonto = Math.min(baseConItems * (descuentoPorcentaje / 100), baseConItems);

  const baseConDescuento = Math.max(baseConItems - descuentoGeneralMonto, 0);

  const factorDescuentoGeneral = baseConItems > 0 ? baseConDescuento / baseConItems : 1;

  const subtotalConDescuentoFinal = subtotalConItems * factorDescuentoGeneral;
  const impuestoAjustado = impuestoConItems * factorDescuentoGeneral;

  const propinaMonto = subtotalConDescuentoFinal * (propinaPorcentaje / 100);

  const total = baseConDescuento + propinaMonto;
  const descuentoMontoMostrado = descuentoGeneralMonto;

  const descuentoPorcentajeEfectivo =
    baseConItems > 0 ? (descuentoGeneralMonto / baseConItems) * 100 : 0;



  calculo = {

    subtotal: subtotalConItems,

    impuesto: impuestoConItems,

    descuentoPorcentaje,

    descuentoPorcentajeEfectivo,

    propinaPorcentaje,

    descuentoGeneralMonto,

    descuentoItemsMonto,

    descuentoMonto: descuentoMontoMostrado,

    propinaMonto,

    baseConDescuento,

    baseSinDescuento: baseConItems,

    total,

  };

};



const actualizarResumenUI = () => {

  calcularTotales();
  const pagosRegistrados = obtenerPagosRegistradosCuenta(cuentaSeleccionada);
  const saldoPendiente = obtenerSaldoPendienteCuenta(cuentaSeleccionada, calculo.total);

  if (resumenSubtotal) resumenSubtotal.textContent = formatCurrency(calculo.subtotal);

  if (resumenImpuesto) resumenImpuesto.textContent = formatCurrency(calculo.impuesto);

  if (resumenPropina) resumenPropina.textContent = formatCurrency(calculo.propinaMonto);

  if (resumenDescuento) resumenDescuento.textContent = `- ${formatCurrency(calculo.descuentoMonto)}`;

  if (resumenTotal) resumenTotal.textContent = formatCurrency(calculo.total);

  if (resumenPagado) resumenPagado.textContent = formatCurrency(pagosRegistrados.total);

  if (resumenRestante) resumenRestante.textContent = formatCurrency(saldoPendiente);

  recalcularCambio();
  actualizarAccionesCuenta();

};

const obtenerSaldoPendienteActual = () => obtenerSaldoPendienteCuenta(cuentaSeleccionada, calculo.total);



const obtenerPagosFormulario = () => {

  const metodo = selectMetodoPago?.value || 'efectivo';

  const total = obtenerSaldoPendienteActual();

  if (total <= 0.009) {
    return { efectivo: 0, efectivoEntregado: 0, tarjeta: 0, transferencia: 0, metodo };
  }



  if (metodo === 'tarjeta') {

    return { efectivo: 0, efectivoEntregado: 0, tarjeta: total, transferencia: 0, metodo };

  }



  if (metodo === 'transferencia') {

    return { efectivo: 0, efectivoEntregado: 0, tarjeta: 0, transferencia: total, metodo };

  }



  if (metodo === 'efectivo') {

    const recibido = Math.max(parseMoneyValueCaja(inputPagoEfectivoEntregado), 0);

    return { efectivo: total, efectivoEntregado: recibido || total, tarjeta: 0, transferencia: 0, metodo };

  }



  const tarjeta = Math.max(parseMoneyValueCaja(inputPagoTarjeta), 0);

  const transferencia = Math.max(parseMoneyValueCaja(inputPagoTransferencia), 0);

  const efectivoEntregado = Math.max(parseMoneyValueCaja(inputPagoEfectivoEntregado), 0);

  const efectivo = Math.min(efectivoEntregado, Math.max(total - tarjeta - transferencia, 0));



  return { efectivo, efectivoEntregado, tarjeta, transferencia, metodo };

};



const recalcularCambio = () => {

  const pagos = obtenerPagosFormulario();

  const total = obtenerSaldoPendienteActual();

  const totalNoEfectivo = pagos.tarjeta + pagos.transferencia;

  const efectivoRequerido = Math.max(total - totalNoEfectivo, 0);

  const entregado = pagos.efectivoEntregado;

  const efectivoAplicado = Math.min(entregado, efectivoRequerido);

  const cambio = Math.max(entregado - efectivoRequerido, 0);



  if (pagoCambioDisplay) {

    pagoCambioDisplay.textContent = formatCurrency(cambio);

  }



  return { ...pagos, efectivoAplicado, efectivoRequerido, cambio };

};



const resetPagosFormulario = (total = 0) => {

  if (selectMetodoPago) selectMetodoPago.value = 'efectivo';

  if (inputPagoEfectivoEntregado) setMoneyInputValueCaja(inputPagoEfectivoEntregado, Number(total) || 0);

  if (inputPagoTarjeta) setMoneyInputValueCaja(inputPagoTarjeta, 0);

  if (inputPagoTransferencia) setMoneyInputValueCaja(inputPagoTransferencia, 0);

  toggleCamposPago();

  recalcularCambio();

};



const toggleCamposPago = () => {

  const metodo = selectMetodoPago?.value || 'efectivo';
  const totalPendiente = obtenerSaldoPendienteActual();

  camposPago.forEach((campo) => {

    const metodos = (campo.dataset.metodo || '').split(' ');

    campo.hidden = !metodos.includes(metodo);

  });



  if (inputPagoEfectivoEntregado)

    inputPagoEfectivoEntregado.readOnly = !(metodo === 'efectivo' || metodo === 'combinado');

  if (inputPagoTarjeta) inputPagoTarjeta.readOnly = metodo !== 'combinado';

  if (inputPagoTransferencia) inputPagoTransferencia.readOnly = metodo !== 'combinado';



  if (metodo !== 'combinado' && totalPendiente) {

    if (metodo === 'efectivo') {

      if (inputPagoEfectivoEntregado) setMoneyInputValueCaja(inputPagoEfectivoEntregado, totalPendiente);

      if (inputPagoTarjeta) setMoneyInputValueCaja(inputPagoTarjeta, 0);

      if (inputPagoTransferencia) setMoneyInputValueCaja(inputPagoTransferencia, 0);

    } else if (metodo === 'tarjeta') {

      if (inputPagoTarjeta) setMoneyInputValueCaja(inputPagoTarjeta, totalPendiente);

      if (inputPagoEfectivoEntregado) setMoneyInputValueCaja(inputPagoEfectivoEntregado, 0);

      if (inputPagoTransferencia) setMoneyInputValueCaja(inputPagoTransferencia, 0);

    } else if (metodo === 'transferencia') {

      if (inputPagoTransferencia) setMoneyInputValueCaja(inputPagoTransferencia, totalPendiente);

      if (inputPagoEfectivoEntregado) setMoneyInputValueCaja(inputPagoEfectivoEntregado, 0);

      if (inputPagoTarjeta) setMoneyInputValueCaja(inputPagoTarjeta, 0);

    }

  } else if (metodo !== 'combinado') {

    if (inputPagoEfectivoEntregado) setMoneyInputValueCaja(inputPagoEfectivoEntregado, 0);

    if (inputPagoTarjeta) setMoneyInputValueCaja(inputPagoTarjeta, 0);

    if (inputPagoTransferencia) setMoneyInputValueCaja(inputPagoTransferencia, 0);

  } else if (metodo === 'combinado') {

    if (inputPagoEfectivoEntregado && inputPagoEfectivoEntregado.readOnly)

      inputPagoEfectivoEntregado.readOnly = false;

    if (inputPagoTarjeta && inputPagoTarjeta.readOnly) inputPagoTarjeta.readOnly = false;

    if (inputPagoTransferencia && inputPagoTransferencia.readOnly) inputPagoTransferencia.readOnly = false;

  }

  recalcularCambio();

};



const actualizarDiferenciaCuadre = () => {

  if (!cuadreDiferenciaDisplay) return;

  const valorEntrada = cuadreDeclaradoInput?.value;

  if (valorEntrada === '' || valorEntrada === null || valorEntrada === undefined) {

    cuadreDiferenciaDisplay.textContent = formatCurrencySigned(0);

    cuadreDiferenciaDisplay.dataset.sign = 'neutral';

    return;

  }



  const declarado = parseMoneyValueCaja(cuadreDeclaradoInput, { allowEmpty: false });

  if (Number.isNaN(declarado)) {

    cuadreDiferenciaDisplay.textContent = formatCurrencySigned(0);

    cuadreDiferenciaDisplay.dataset.sign = 'neutral';

    return;

  }



  const esperado = calcularEfectivoEsperado();

  const diferencia = declarado - esperado;

  cuadreDiferenciaDisplay.textContent = formatCurrencySigned(diferencia);

  cuadreDiferenciaDisplay.dataset.sign =

    diferencia > 0 ? 'positivo' : diferencia < 0 ? 'negativo' : 'neutral';

};



const renderDetalleCuadreActual = () => {

  if (!cuadreDetalleBody || !cuadreDetalleWrapper) return;



  cuadreDetalleBody.innerHTML = '';
  detalleCuadreIdActivo = null;
  detalleCuadreFilaActiva = null;



  if (!resumenCuadre.pedidos || !resumenCuadre.pedidos.length) {

    const fila = document.createElement('tr');

    const celda = document.createElement('td');

    celda.colSpan = 6;

    celda.textContent = 'No hay pedidos pendientes de cuadre en este turno.';

    fila.appendChild(celda);

    cuadreDetalleBody.appendChild(fila);

    return;

  }



  const fragment = document.createDocumentFragment();
  const pedidosOrdenados = [...resumenCuadre.pedidos].sort((a, b) => {
    const fechaA = parseFechaLocal(a.fecha_cierre || a.pedidos?.[0]?.fecha_cierre);
    const fechaB = parseFechaLocal(b.fecha_cierre || b.pedidos?.[0]?.fecha_cierre);
    const timeA = fechaA ? fechaA.getTime() : 0;
    const timeB = fechaB ? fechaB.getTime() : 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    const idA = Number(a.cuenta_id || a.id) || 0;
    const idB = Number(b.cuenta_id || b.id) || 0;
    return idA - idB;
  });



  pedidosOrdenados.forEach((pedido) => {

    const fila = document.createElement('tr');

    const total =

      (Number(pedido.subtotal) || 0) +

      (Number(pedido.impuesto) || 0) -

      (Number(pedido.descuento_monto) || 0) +

      (Number(pedido.propina_monto) || 0);



    const mesaCliente = pedido.mesa && pedido.cliente

      ? `${pedido.mesa} - ${pedido.cliente}`

      : pedido.mesa || pedido.cliente || 'N/D';



    const metodoLabel = obtenerMetodoPagoLabel(pedido);
    const metodoValor = obtenerMetodoPagoValorCuadre(pedido);
    const opcionActual =
      metodoValor === 'mixto'
        ? '<option value="" selected disabled>Mixto</option>'
        : metodoValor === 'sin_registrar'
          ? '<option value="" selected disabled>Sin registrar</option>'
          : '';
    const opcionesMetodo = METODOS_PAGO_CUADRE.map(
      (metodo) =>
        `<option value="${metodo.value}" ${metodo.value === metodoValor ? 'selected' : ''}>${metodo.label}</option>`
    ).join('');
    const metodoControl = `
      <div class="cuadre-metodo-cell">
        <select
          class="cuadre-metodo-select"
          data-cambiar-metodo="1"
          data-cuenta-id="${pedido.id}"
          data-metodo-actual="${metodoValor}"
          aria-label="Metodo de pago para cuenta #${pedido.id}"
          title="Metodo de pago actual: ${metodoLabel}"
        >
          ${opcionActual}
          ${opcionesMetodo}
        </select>
      </div>
    `;
    const pedidoFacturaId = Number(
      pedido.pedidos?.find((pedidoRelacionado) => {
        const id = Number(pedidoRelacionado?.id);
        return Number.isFinite(id) && id > 0;
      })?.id
    );
    const facturaId =
      Number.isFinite(pedidoFacturaId) && pedidoFacturaId > 0
        ? pedidoFacturaId
        : Number(pedido.id);
    const facturaDisponible = Number.isFinite(facturaId) && facturaId > 0;



    fila.dataset.cuadreId = pedido.id;
    fila.style.cursor = 'pointer';
    fila.setAttribute('aria-expanded', 'false');
    fila.setAttribute('title', 'Haz clic para ver productos');
    fila.innerHTML = `

      <td>#${pedido.id}</td>

      <td>${mesaCliente}</td>

      <td>${formatDateTime(pedido.fecha_cierre || pedido.pedidos?.[0]?.fecha_cierre)}</td>

      <td>${metodoControl}</td>

      <td>${formatCurrency(total)}</td>

      <td>
        <button
          type="button"
          class="kanm-button ghost"
          data-ver-factura="1"
          ${facturaDisponible ? `data-pedido-id="${facturaId}"` : 'disabled'}
        >
          Ver factura
        </button>
      </td>

    `;

    fragment.appendChild(fila);

  });

  fragment.querySelectorAll('[data-cambiar-metodo]').forEach((control) => {
    ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach((eventName) => {
      control.addEventListener(eventName, (event) => {
        event.stopPropagation();
      });
    });
  });



  cuadreDetalleBody.appendChild(fragment);

};

const actualizarMetodoPagoCuadre = async (cuentaId, metodo, control = null) => {
  if (!Number.isFinite(Number(cuentaId)) || Number(cuentaId) <= 0) {
    setCuadreMensaje('Cuenta invalida para actualizar metodo de pago.', 'error');
    return;
  }

  const metodoNormalizado = (metodo || '').toString().trim().toLowerCase();
  if (!METODOS_PAGO_CUADRE.some((item) => item.value === metodoNormalizado)) {
    setCuadreMensaje('Selecciona un metodo de pago valido.', 'error');
    return;
  }

  const metodoAnterior = control?.dataset?.metodoActual || '';

  if (control) {
    control.disabled = true;
  }

  try {
    setCuadreMensaje('Actualizando metodo de pago...', 'info');

    const respuesta = await fetchAutorizadoCaja(`/api/caja/cuadre/${Number(cuentaId)}/metodo-pago`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metodo_pago: metodoNormalizado,
        turno: '1',
        origen_caja: 'caja',
      }),
    });

    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo actualizar el metodo de pago.');
    }

    if (control) {
      control.dataset.metodoActual = metodoNormalizado;
    }

    await cargarResumenCuadre(false);
    setCuadreMensaje('Metodo de pago actualizado correctamente.', 'info');
  } catch (error) {
    if (control) {
      control.value = metodoAnterior && metodoAnterior !== 'mixto' && metodoAnterior !== 'sin_registrar' ? metodoAnterior : '';
    }
    setCuadreMensaje(error?.message || 'No se pudo actualizar el metodo de pago.', 'error');
  } finally {
    if (control) {
      control.disabled = false;
    }
  }
};



const cargarResumenCuadre = async (mostrarCarga = true) => {

  if (!cuadreFechaInput) return;



  const fechaSeleccionada = cuadreFechaInput.value || resumenCuadre.fecha || obtenerFechaLocalHoy();

  const params = new URLSearchParams({ fecha: fechaSeleccionada, detalle: '1', turno: '1' });



  try {

    if (mostrarCarga) {

      setCuadreMensaje('Cargando resumen del dia...', 'info');

    }

    const respuesta = await fetchAutorizadoCaja(`/api/caja/resumen-dia?${params.toString()}`);

    if (!respuesta.ok) {

      throw new Error('No se pudo obtener el resumen diario.');

    }



    const data = await respuesta.json();

    if (!data.ok) {

      throw new Error(data.error || 'No se pudo obtener el resumen diario.');

    }



    const fechaAnterior = resumenCuadre.fecha;
    const fecha = data.fecha || fechaSeleccionada;

    resumenCuadre = {

      fecha,

      totalSistema: Number(data.total_sistema) || 0,

      totalGeneral: Number(data.total_general) || 0,

      totalEfectivo: Number(data.total_efectivo) || 0,

      totalTarjeta: Number(data.total_tarjeta) || 0,

      totalTransferencia: Number(data.total_transferencia) || 0,

      totalDescuentos: Number(data.total_descuentos) || 0,

      cantidadPedidos: Number(data.cantidad_pedidos) || 0,

      pedidos: Array.isArray(data.pedidos) ? data.pedidos : [],

    };



    totalSalidas = Number(data.total_salidas) || 0;

    salidasDia = Array.isArray(data.salidas) ? data.salidas : salidasDia;





    if (fecha !== fechaAnterior) {
      detalleCuadreCache.clear();
      limpiarDetalleCuadreExpandido();
    }

    cuadreFechaInput.value = fecha;
    aplicarFondoInicialPersistido(fecha, { force: fecha !== fechaAnterior });

    setCampoCuadre('cuadre-total-sistema', resumenCuadre.totalSistema);

    setCampoCuadre('cuadre-total-efectivo', resumenCuadre.totalEfectivo);

    setCampoCuadre('cuadre-total-tarjeta', resumenCuadre.totalTarjeta);

    setCampoCuadre('cuadre-total-transferencia', resumenCuadre.totalTransferencia);

    setCampoCuadre('cuadre-salidas-display', totalSalidas);

    setCampoCuadre(

      'cuadre-total-general',

      resumenCuadre.totalGeneral || resumenCuadre.totalSistema || 0

    );

    setCampoCuadre('cuadre-total-descuentos', Number(data.total_descuentos) || 0);

    setCampoCuadreTexto('cuadre-cantidad-pedidos', resumenCuadre.cantidadPedidos.toString());



    renderSalidas();

    actualizarEfectivoEsperado();

    actualizarDiferenciaCuadre();

    if (mostrarCarga || (cuadreMensaje && cuadreMensaje.dataset.type === 'error')) {

      setCuadreMensaje('', 'info');

    }

    renderDetalleCuadreActual();

  } catch (error) {

    console.error('Error al cargar el resumen del cuadre:', error);
    const esRefrescoSilencioso = mostrarCarga === false;
    const hayDatosPrevios =
      Number(resumenCuadre?.cantidadPedidos) > 0 ||
      Number(resumenCuadre?.totalSistema) > 0 ||
      Number(resumenCuadre?.totalGeneral) > 0 ||
      (Array.isArray(resumenCuadre?.pedidos) && resumenCuadre.pedidos.length > 0) ||
      (Array.isArray(salidasDia) && salidasDia.length > 0);

    if (esRefrescoSilencioso && hayDatosPrevios) {
      setCuadreMensaje('Conexion inestable. Mostrando el ultimo resumen disponible.', 'warning');
      return;
    }

    setCuadreMensaje(

      error.message || 'No se pudo cargar el resumen de ventas del dia. Intenta nuevamente.',

      'error'

    );

    resumenCuadre = {

      fecha: fechaSeleccionada,

      totalSistema: 0,

      totalGeneral: 0,

      totalEfectivo: 0,

      totalTarjeta: 0,

      totalTransferencia: 0,

      totalDescuentos: 0,

      cantidadPedidos: 0,

      pedidos: [],

    };

    totalSalidas = 0;

    salidasDia = [];

    setCampoCuadre('cuadre-total-sistema', 0);

    setCampoCuadre('cuadre-total-efectivo', 0);

    setCampoCuadre('cuadre-total-tarjeta', 0);

    setCampoCuadre('cuadre-total-transferencia', 0);

    setCampoCuadre('cuadre-salidas-display', 0);

    setCampoCuadre('cuadre-total-general', 0);

    setCampoCuadre('cuadre-total-descuentos', 0);

    setCampoCuadreTexto('cuadre-cantidad-pedidos', '0');

    actualizarEfectivoEsperado();

    actualizarDiferenciaCuadre();

    renderDetalleCuadreActual();

  }

};



const recargarEstadoCaja = async (mostrarCarga = true) => {

  if (recargandoEstado) return;



  recargandoEstado = true;



  try {

    await Promise.all([cargarPedidos(mostrarCarga), cargarResumenCuadre(mostrarCarga)]);

  } finally {

    recargandoEstado = false;

  }

};



const iniciarActualizacionPeriodicaCaja = () => {

  if (refreshTimer) {

    clearInterval(refreshTimer);

  }



  refreshTimer = setInterval(() => {

    recargarEstadoCaja(false).catch((error) => {

      console.error('Error al actualizar la vista de caja automaticamente:', error);

    });

  }, REFRESH_INTERVAL);

};



const registrarCuadre = async () => {

  if (!cuadreRegistrarBtn) return;



  const usuarioActual = obtenerUsuarioActual();

  const nombre = usuarioActual?.nombre || usuarioActual?.usuario || cuadreUsuarioInput?.value?.trim();

  if (!nombre) {

    setCuadreMensaje('No se pudo identificar al usuario que realiza el cuadre.', 'error');

    return;

  }



  const montoDeclarado = parseMoneyValueCaja(cuadreDeclaradoInput, { allowEmpty: false });

  if (!Number.isFinite(montoDeclarado) || montoDeclarado < 0) {

    setCuadreMensaje('Ingresa un monto contado valido mayor o igual a 0.', 'error');

    return;

  }



  const fechaOperacion = cuadreFechaInput?.value || resumenCuadre.fecha || obtenerFechaLocalHoy();



  const payload = {

    fecha_operacion: fechaOperacion,

    usuario: nombre,

    total_declarado: montoDeclarado,

    observaciones: cuadreObservacionesInput?.value,

    fondo_inicial: obtenerFondoInicial(),

  };



  try {

    const sessionApi = window.KANMSession;

    const usuario =

      (sessionApi && typeof sessionApi.getUser === 'function' && sessionApi.getUser()) ||

      JSON.parse(sessionStorage.getItem('kanmUser') || 'null') ||

      null;



    if (usuario?.rol) {

      payload.usuario_rol = usuario.rol;

    }

    if (usuario?.id) {

      payload.usuario_id = usuario.id;

    }

  } catch (error) {

    console.warn('No fue posible leer el rol del usuario para el cuadre:', error);

  }



  try {

    setCuadreMensaje('Registrando cuadre...', 'info');

    cuadreRegistrarBtn.disabled = true;

    cuadreRegistrarBtn.classList.add('is-loading');



    const respuesta = await fetchAutorizadoCaja('/api/caja/cierres', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

      },

      body: JSON.stringify(payload),

    });



    const data = await respuesta.json().catch(() => ({ ok: false }));



    if (!respuesta.ok || !data.ok) {

      throw new Error(data.error || 'No se pudo registrar el cuadre de caja.');

    }



    setCuadreMensaje('Cuadre registrado correctamente.', 'info');

    resetFormularioCuadre();

    limpiarSeleccion();



    await recargarEstadoCaja(false);

    notificarActualizacionGlobal('cierre-registrado', { cierreId: data.cierre?.id });



    if (data.cierre) {

      document.dispatchEvent(

        new CustomEvent('kanm:cuadre-registrado', { detail: { cierre: data.cierre } })

      );

    } else {

      document.dispatchEvent(new CustomEvent('kanm:cuadre-registrado'));

    }

  } catch (error) {

    console.error('Error al registrar el cuadre de caja:', error);

    setCuadreMensaje(error.message || 'No se pudo registrar el cuadre de caja.', 'error');

  } finally {

    cuadreRegistrarBtn.disabled = false;

    cuadreRegistrarBtn.classList.remove('is-loading');

    actualizarDiferenciaCuadre();

  }

};



const seleccionarCuenta = async (cuentaId) => {

  const cuentaBase = cuentas.find((c) => c.cuenta_id === cuentaId);

  if (!cuentaBase) {

    setMensajeDetalle('No se encontro la cuenta seleccionada.', 'error');

    return;

  }



  mostrarTab('cobros');



  try {

    setMensajeDetalle('Cargando detalle de la cuenta...', 'info');

    const permitirEnCurso = modoCobroAdelantado || !cuentaEstaListaParaCobro(cuentaBase);
    const detalleUrl = new URL(`/api/cuentas/${cuentaId}/detalle`, window.location.origin);
    if (permitirEnCurso) {
      detalleUrl.searchParams.set('permitir_en_curso', '1');
    }
    const respuesta = await fetchAutorizadoCaja(`${detalleUrl.pathname}${detalleUrl.search}`);

    if (!respuesta.ok) {

      throw new Error('No se pudo obtener el detalle de la cuenta.');

    }



    const data = await respuesta.json();

    if (!data?.ok || !data.cuenta) {

      throw new Error(data?.error || 'No se pudo obtener el detalle de la cuenta.');

    }



    cuentaSeleccionada = {

      ...cuentaBase,

      ...data.cuenta,

    };

    inicializarDescuentosDesdeCuenta(cuentaSeleccionada);



    if (seleccionPlaceholder) seleccionPlaceholder.hidden = true;

    if (formulario) formulario.hidden = false;

    if (botonCobrar) {

      botonCobrar.disabled = false;

      botonCobrar.textContent = 'Confirmar pago';

    }

    setMensajeDetalle('');



    const pedidoBase = cuentaSeleccionada?.pedidos?.[0] || {};
    if (inputDescuento) {
      inputDescuento.value = String(Math.max(Number(pedidoBase?.descuento_porcentaje) || 0, 0));
    }

    const propinaGuardada = Number(pedidoBase?.propina_porcentaje);
    if (Number.isFinite(propinaGuardada) && propinaGuardada >= 0) {
      if (inputPropina) inputPropina.value = String(propinaGuardada);
    } else {
      aplicarPropinaPreferida({ force: true });
    }



    renderDetallePedido();
    actualizarAccionesCuenta();

    const totales = totalesBaseCuenta(cuentaSeleccionada);

    actualizarResumenUI();

    resetPagosFormulario(
      obtenerSaldoPendienteCuenta(
        cuentaSeleccionada,
        calculo.total || totales.total || totales.subtotalBruto + totales.impuesto
      )
    );

    recalcularCambio();

    renderPedidos();

  } catch (error) {

    console.error('Error al seleccionar cuenta:', error);

    setMensajeDetalle(error.message || 'No se pudo obtener el detalle de la cuenta.', 'error');

    limpiarSeleccion();

  }

};



const cargarPedidos = async (mostrarCarga = true) => {

  try {

    if (mostrarCarga) {

      setMensajeLista('Cargando pedidos...', 'info');

    }

    if (modoCobroAdelantado) {
      const [pendientesResp, preparandoResp, listosResp] = await Promise.all([
        fetchAutorizadoCaja('/api/pedidos?estado=pendiente&origen=caja'),
        fetchAutorizadoCaja('/api/pedidos?estado=preparando&origen=caja'),
        fetchAutorizadoCaja('/api/pedidos?estado=listo&origen=caja'),
      ]);

      if (!pendientesResp.ok || !preparandoResp.ok || !listosResp.ok) {
        throw new Error('No se pudieron obtener las cuentas para cobro adelantado.');
      }

      const [pendientesData, preparandoData, listosData] = await Promise.all([
        pendientesResp.json(),
        preparandoResp.json(),
        listosResp.json(),
      ]);

      cuentas = combinarCuentasCaja(
        Array.isArray(pendientesData) ? pendientesData : [],
        Array.isArray(preparandoData) ? preparandoData : [],
        Array.isArray(listosData) ? listosData : []
      );
    } else {
      const respuesta = await fetchAutorizadoCaja('/api/pedidos?estado=listo&origen=caja');

      if (!respuesta.ok) {

        throw new Error('No se pudieron obtener los pedidos listos.');

      }

      const data = await respuesta.json();

      cuentas = Array.isArray(data) ? data : [];
    }

    if (!cuentas.length) {

      setMensajeLista(
        modoCobroAdelantado
          ? 'Sin cuentas en curso ni listas para cobrar en este momento.'
          : 'Sin pedidos listos para cobrar en este momento.',
        'info'
      );

    } else {

      setMensajeLista('');

    }

    renderPedidos();
    actualizarAccionesCuenta();



    if (cuentaSeleccionada) {

      const sigueDisponible = cuentas.some((cuenta) => cuenta.cuenta_id === cuentaSeleccionada.cuenta_id);

      if (!sigueDisponible) limpiarSeleccion();

    }

  } catch (error) {

    console.error('Error al cargar pedidos para caja:', error);
    const esRefrescoSilencioso = mostrarCarga === false;
    if (esRefrescoSilencioso) {
      setMensajeLista('Conexion inestable. Mostrando datos anteriores, reintentando...', 'warning');
      return;
    }

    setMensajeLista(
      modoCobroAdelantado
        ? 'Error al cargar las cuentas para cobro adelantado. Intenta nuevamente.'
        : 'Error al cargar los pedidos listos. Intenta nuevamente.',
      'error'
    );

    pedidosContainer.innerHTML = '';

    limpiarSeleccion();

  }

};

const construirPayloadCobroCuenta = (pagos, { generarFactura = true } = {}) => {
  const detalleDescuentosPayload = expandirDescuentosPorDetalle();
  const tipoComprobante = normalizarTipoComprobante(selectTipoComprobante?.value || '');
  const sinComprobante = esSinComprobante(tipoComprobante);
  const ncfManual = generarFactura && !sinComprobante ? inputNcfManual?.value : null;
  const usuario = obtenerUsuarioActual();
  const usuarioId = Number(usuario?.id ?? usuario?.usuarioId);

  return {
    descuento_porcentaje: calculo.descuentoPorcentaje,
    descuento_monto: calculo.descuentoMonto,
    propina_porcentaje: calculo.propinaPorcentaje,
    cliente: inputClienteNombre?.value,
    cliente_documento: inputClienteDocumento?.value,
    tipo_comprobante: tipoComprobante || 'B02',
    ncf: ncfManual,
    generar_ncf: generarFactura ? !sinComprobante : false,
    comentarios: inputComentarios?.value,
    usuario_id: Number.isFinite(usuarioId) && usuarioId > 0 ? usuarioId : undefined,
    detalle_descuentos: detalleDescuentosPayload,
    pagos: {
      efectivo: pagos.efectivoAplicado ?? pagos.efectivo ?? obtenerSaldoPendienteActual(),
      efectivo_entregado: pagos.efectivoEntregado,
      tarjeta: pagos.tarjeta,
      transferencia: pagos.transferencia,
    },
  };
};



const cerrarCuenta = async () => {

  if (!cuentaSeleccionada) {

    setMensajeDetalle('Selecciona una cuenta antes de cobrar.', 'error');

    return;

  }

  if (!cuentaEstaListaParaCobro(cuentaSeleccionada)) {

    setMensajeDetalle('Esta cuenta aun no esta lista. Usa el cobro adelantado para registrar el pago antes de tiempo.', 'error');

    return;

  }



  // Recalcular totales basados en descuentos por item antes de cobrar

  actualizarResumenUI();



  const pagos = recalcularCambio();

  const efectivoAplicado =

    pagos.efectivoAplicado ?? pagos.efectivo ?? Math.max(obtenerSaldoPendienteActual() - (pagos.tarjeta + pagos.transferencia), 0);

  const total = obtenerSaldoPendienteActual();

  const toleranciaMinima = 0.05;

  const toleranciaExcesoNoEfectivo = 5;



  if (pagos.metodo === 'efectivo') {

    // Se permite efectivo >= total. Si hay cambio, ya lo calculamos.

    // No bloqueamos si es mayor.

  } else if (pagos.metodo === 'tarjeta') {

    if (pagos.tarjeta < total - toleranciaMinima) {

      setMensajeDetalle('El monto en tarjeta no cubre el total a cobrar.', 'error');

      return;

    }

  } else if (pagos.metodo === 'transferencia') {

    if (pagos.transferencia < total - toleranciaMinima) {

      setMensajeDetalle('El monto en transferencia no cubre el total a cobrar.', 'error');

      return;

    }

  } else if (pagos.metodo === 'combinado') {

    const totalPagado = pagos.efectivoEntregado + pagos.tarjeta + pagos.transferencia;



    if (totalPagado < total - toleranciaMinima) {

      setMensajeDetalle('La suma de los metodos de pago no cubre el total.', 'error');

      return;

    }



    if (totalPagado > total + toleranciaExcesoNoEfectivo) {

      setMensajeDetalle('Los montos ingresados exceden el total permitido.', 'error');

      return;

    }

    // Permitimos efectivo extra (cambio) y combinaciones siempre que cubran el total.

  }



  try {

    setMensajeDetalle('Procesando pago...', 'info');

    botonCobrar.disabled = true;

    botonCobrar.classList.add('is-loading');



    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaSeleccionada.cuenta_id}/cerrar`, {

      method: 'PUT',

      headers: {

        'Content-Type': 'application/json',

      },

      body: JSON.stringify(construirPayloadCobroCuenta(pagos, { generarFactura: true })),

    });



    const data = await respuesta.json().catch(() => ({ ok: false }));



    if (!respuesta.ok || !data.ok) {

      throw new Error(data.error || 'No se pudo cerrar la cuenta.');

    }



    setMensajeDetalle('Pago registrado correctamente.', 'info');



    const facturaGenerada = data.factura;

    if (facturaGenerada?.id) {

      const facturaId = Number(facturaGenerada.id);

      if (Number.isFinite(facturaId)) {

        window.open(`/factura.html?id=${facturaId}`, '_blank');

      }

    } else if (cuentaSeleccionada?.pedidos?.[0]?.id) {

      window.open(`/factura.html?id=${cuentaSeleccionada.pedidos[0].id}`, '_blank');

    }



    await recargarEstadoCaja(false);

    notificarActualizacionGlobal('cuenta-cobrada', {

      cuentaId: cuentaSeleccionada.cuenta_id,

    });

    limpiarSeleccion();

    if (seleccionPlaceholder) {

      seleccionPlaceholder.textContent =

        'Pago registrado correctamente. Selecciona una cuenta para continuar.';

    }

    setMensajeLista('Pago registrado correctamente.', 'info');

  } catch (error) {

    console.error('Error al cerrar la cuenta:', error);

    setMensajeDetalle(error.message || 'No se pudo confirmar el pago.', 'error');

    botonCobrar.disabled = false;

    botonCobrar.classList.remove('is-loading');

  }

};

const registrarCobroAdelantado = async () => {

  if (!cuentaSeleccionada) {

    setMensajeDetalle('Selecciona una cuenta antes de registrar el cobro adelantado.', 'error');

    return;

  }

  if (cuentaEstaListaParaCobro(cuentaSeleccionada)) {

    setMensajeDetalle('La cuenta ya esta lista. Usa Confirmar pago para cerrarla.', 'error');

    return;

  }

  actualizarResumenUI();

  const pagos = recalcularCambio();
  const total = obtenerSaldoPendienteActual();
  const toleranciaMinima = 0.05;
  const toleranciaExcesoNoEfectivo = 5;

  if (pagos.metodo === 'tarjeta') {

    if (pagos.tarjeta < total - toleranciaMinima) {

      setMensajeDetalle('El monto en tarjeta no cubre el saldo pendiente.', 'error');

      return;

    }

  } else if (pagos.metodo === 'transferencia') {

    if (pagos.transferencia < total - toleranciaMinima) {

      setMensajeDetalle('El monto en transferencia no cubre el saldo pendiente.', 'error');

      return;

    }

  } else if (pagos.metodo === 'combinado') {

    const totalPagado = pagos.efectivoEntregado + pagos.tarjeta + pagos.transferencia;

    if (totalPagado < total - toleranciaMinima) {

      setMensajeDetalle('La suma de los metodos de pago no cubre el saldo pendiente.', 'error');

      return;

    }

    if (totalPagado > total + toleranciaExcesoNoEfectivo) {

      setMensajeDetalle('Los montos ingresados exceden el total permitido.', 'error');

      return;

    }

  }

  try {

    setMensajeDetalle('Registrando cobro adelantado...', 'info');

    if (botonCobroAdelantado) {
      botonCobroAdelantado.disabled = true;
      botonCobroAdelantado.classList.add('is-loading');
    }

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaSeleccionada.cuenta_id}/cobro-adelantado`, {

      method: 'PUT',

      headers: {

        'Content-Type': 'application/json',

      },

      body: JSON.stringify(construirPayloadCobroCuenta(pagos, { generarFactura: false })),

    });

    const data = await respuesta.json().catch(() => ({ ok: false }));

    if (!respuesta.ok || !data.ok) {

      throw new Error(data.error || 'No se pudo registrar el cobro adelantado.');

    }

    const facturaId = Number(cuentaSeleccionada?.pedidos?.[0]?.id);
    if (Number.isFinite(facturaId)) {
      window.open(`/factura.html?id=${facturaId}`, '_blank');
    }

    const cuentaId = cuentaSeleccionada.cuenta_id;
    await recargarEstadoCaja(false);
    if (cuentas.some((cuenta) => cuenta.cuenta_id === cuentaId)) {
      await seleccionarCuenta(cuentaId);
      setMensajeDetalle('Cobro adelantado registrado correctamente.', 'info');
    } else {
      limpiarSeleccion();
    }

    setMensajeLista('Cobro adelantado registrado correctamente.', 'info');
    notificarActualizacionGlobal('pedido-actualizado', { cuentaId });

  } catch (error) {

    console.error('Error al registrar cobro adelantado:', error);

    setMensajeDetalle(error.message || 'No se pudo registrar el cobro adelantado.', 'error');

  } finally {

    if (botonCobroAdelantado) {
      botonCobroAdelantado.disabled = false;
      botonCobroAdelantado.classList.remove('is-loading');
    }

  }

};

const abrirFacturaCuentaSeleccionada = (mensajeSinCuenta, { vistaPrevia = false } = {}) => {
  if (!cuentaSeleccionada) {
    setMensajeDetalle(mensajeSinCuenta, 'error');
    return;
  }

  const primera = cuentaSeleccionada.pedidos?.[0];
  const facturaId = Number(primera?.id);
  if (!Number.isFinite(facturaId) || facturaId <= 0) {
    setMensajeDetalle('No se encontro un pedido para abrir la factura.', 'error');
    return;
  }

  const url = new URL(`/factura.html?id=${facturaId}`, window.location.origin);
  if (vistaPrevia) {
    calcularTotales();
    const descuentoVistaPrevia =
      Number(calculo.descuentoGeneralMonto || 0) + Number(calculo.descuentoItemsMonto || 0);
    url.searchParams.set('preview', '1');
    url.searchParams.set('preview_subtotal', String(Number(calculo.subtotal || 0).toFixed(2)));
    url.searchParams.set('preview_impuesto', String(Number(calculo.impuesto || 0).toFixed(2)));
    url.searchParams.set('preview_descuento', String(Number(descuentoVistaPrevia || 0).toFixed(2)));
    url.searchParams.set('preview_propina', String(Number(calculo.propinaMonto || 0).toFixed(2)));
    url.searchParams.set('preview_total', String(Number(calculo.total || 0).toFixed(2)));
  }

  window.open(url.toString(), '_blank');
};

const obtenerDetalleIdsItemCuenta = (item) =>
  Array.from(
    new Set(
      (Array.isArray(item?.detalles) ? item.detalles : [])
        .map((detalle) => Number(detalle?.detalle_id ?? detalle?.detalleId ?? detalle?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

const solicitarPasswordAdmin = (accion = 'esta accion') =>
  new Promise((resolve) => {
    if (!adminPasswordModal || !adminPasswordModalInput) {
      const fallback = window.prompt(`Ingresa la contrasena de admin para ${accion}:`);
      const limpia = fallback === null ? null : String(fallback || '').trim();
      resolve(limpia || null);
      return;
    }

    resolverPasswordAdminPendiente = resolve;
    if (adminPasswordModalContext) {
      adminPasswordModalContext.textContent = `Confirma para ${accion}.`;
    }
    adminPasswordModalInput.value = '';
    setMensajePasswordAdmin('');
    mostrarModal(adminPasswordModal);
    setTimeout(() => {
      adminPasswordModalInput.focus();
    }, 0);
  });

const eliminarCuentaSeleccionada = async () => {
  if (!cuentaSeleccionada) {
    setMensajeDetalle('Selecciona una cuenta para eliminar.', 'error');
    return;
  }
  if (!cuentaPermiteCambiosEstructurales(cuentaSeleccionada)) {
    setMensajeDetalle('Esta cuenta no se puede eliminar porque esta en curso o ya tiene pagos registrados.', 'error');
    return;
  }

  const cuentaId = Number(cuentaSeleccionada.cuenta_id);
  if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
    setMensajeDetalle('Cuenta invalida.', 'error');
    return;
  }

  const confirmar = window.confirm(
    `Esta accion eliminara la cuenta #${cuentaId} del flujo de cobro. Deseas continuar?`
  );
  if (!confirmar) return;

  const passwordAdmin = await solicitarPasswordAdmin(`eliminar la cuenta #${cuentaId}`);
  if (!passwordAdmin) {
    setMensajeDetalle('Debes ingresar la contrasena de admin.', 'error');
    return;
  }

  try {
    if (botonEliminarCuenta) {
      botonEliminarCuenta.disabled = true;
      botonEliminarCuenta.classList.add('is-loading');
    }
    setMensajeDetalle('Eliminando cuenta...', 'info');

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaId}/eliminar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: passwordAdmin }),
    });

    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);
    if (!esJson) {
      throw construirErrorNoJsonCaja(respuesta, data, contentType);
    }
    if (!respuesta.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo eliminar la cuenta.');
    }

    limpiarDescuentosItems();
    await recargarEstadoCaja(false);
    limpiarSeleccion();
    setMensajeLista(`Cuenta #${cuentaId} eliminada correctamente.`, 'info');
    notificarActualizacionGlobal('pedido-actualizado', { cuentaId });
  } catch (error) {
    console.error('Error al eliminar cuenta:', error);
    setMensajeDetalle(error.message || 'No se pudo eliminar la cuenta.', 'error');
  } finally {
    if (botonEliminarCuenta) {
      botonEliminarCuenta.disabled = !cuentaSeleccionada;
      botonEliminarCuenta.classList.remove('is-loading');
    }
  }
};

const actualizarPrecioProductoCuenta = async (itemIndex, boton = null) => {
  if (!cuentaSeleccionada) {
    setMensajeDetalle('Selecciona una cuenta.', 'error');
    return;
  }
  if (!cuentaPermiteCambiosEstructurales(cuentaSeleccionada)) {
    setMensajeDetalle('No se puede cambiar precios en una cuenta en curso o con pagos registrados.', 'error');
    return;
  }

  const item = cuentaSeleccionada?.items_agregados?.[itemIndex];
  if (!item) {
    setMensajeDetalle('No se encontro el producto seleccionado.', 'error');
    return;
  }

  const detalleIds = obtenerDetalleIdsItemCuenta(item);
  if (!detalleIds.length) {
    setMensajeDetalle('No se encontraron detalles validos del producto.', 'error');
    return;
  }

  const inputPrecio = itemsContainer?.querySelector(`.caja-item-precio-input[data-item-index="${itemIndex}"]`);
  const precio = Number(inputPrecio?.value);
  if (!Number.isFinite(precio) || precio < 0) {
    setMensajeDetalle('Ingresa un precio valido mayor o igual a 0.', 'error');
    return;
  }

  const cuentaId = Number(cuentaSeleccionada.cuenta_id);
  if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
    setMensajeDetalle('Cuenta invalida.', 'error');
    return;
  }

  try {
    if (boton) {
      boton.disabled = true;
      boton.classList.add('is-loading');
    }
    setMensajeDetalle('Actualizando precio del producto...', 'info');

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaId}/detalles/precio`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        detalle_ids: detalleIds,
        precio_unitario: Number(precio.toFixed(2)),
      }),
    });

    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);
    if (!esJson) {
      throw construirErrorNoJsonCaja(respuesta, data, contentType);
    }
    if (!respuesta.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo actualizar el precio del producto.');
    }

    limpiarDescuentosItems();
    await recargarEstadoCaja(false);
    if (cuentas.some((cuenta) => cuenta.cuenta_id === cuentaId)) {
      await seleccionarCuenta(cuentaId);
      setMensajeDetalle('Precio actualizado correctamente.', 'info');
    } else {
      limpiarSeleccion();
      setMensajeLista('La cuenta ya no esta disponible para cobrar.', 'info');
    }
    notificarActualizacionGlobal('pedido-actualizado', { cuentaId });
  } catch (error) {
    console.error('Error al actualizar precio del producto:', error);
    setMensajeDetalle(error.message || 'No se pudo actualizar el precio del producto.', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
  }
};

const eliminarProductoCuenta = async (itemIndex, nombreProducto, boton = null) => {
  if (!cuentaSeleccionada) {
    setMensajeDetalle('Selecciona una cuenta.', 'error');
    return;
  }
  if (!cuentaPermiteCambiosEstructurales(cuentaSeleccionada)) {
    setMensajeDetalle('No se pueden eliminar productos de una cuenta en curso o con pagos registrados.', 'error');
    return;
  }

  const item = cuentaSeleccionada?.items_agregados?.[itemIndex];
  if (!item) {
    setMensajeDetalle('No se encontro el producto seleccionado.', 'error');
    return;
  }

  const detalleIds = obtenerDetalleIdsItemCuenta(item);
  if (!detalleIds.length) {
    setMensajeDetalle('No se encontraron detalles validos del producto.', 'error');
    return;
  }

  const nombre = (nombreProducto || item.nombre || 'el producto').toString();
  const confirmar = window.confirm(`Deseas eliminar ${nombre} de la cuenta?`);
  if (!confirmar) return;

  const passwordAdmin = await solicitarPasswordAdmin(`eliminar ${nombre} de la cuenta`);
  if (!passwordAdmin) {
    setMensajeDetalle('Debes ingresar la contrasena de admin.', 'error');
    return;
  }

  const cuentaId = Number(cuentaSeleccionada.cuenta_id);
  if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
    setMensajeDetalle('Cuenta invalida.', 'error');
    return;
  }

  try {
    if (boton) {
      boton.disabled = true;
      boton.classList.add('is-loading');
    }
    setMensajeDetalle('Eliminando producto de la cuenta...', 'info');

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaId}/detalles/eliminar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        detalle_ids: detalleIds,
        password: passwordAdmin,
      }),
    });

    const { data, esJson, contentType } = await leerRespuestaJsonCaja(respuesta);
    if (!esJson) {
      throw construirErrorNoJsonCaja(respuesta, data, contentType);
    }
    if (!respuesta.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo eliminar el producto de la cuenta.');
    }

    limpiarDescuentosItems();
    await recargarEstadoCaja(false);
    if (cuentas.some((cuenta) => cuenta.cuenta_id === cuentaId)) {
      await seleccionarCuenta(cuentaId);
      setMensajeDetalle('Producto eliminado correctamente.', 'info');
    } else {
      limpiarSeleccion();
      setMensajeLista('La cuenta ya no tiene productos disponibles para cobrar.', 'info');
    }
    notificarActualizacionGlobal('pedido-actualizado', { cuentaId });
  } catch (error) {
    console.error('Error al eliminar producto de cuenta:', error);
    setMensajeDetalle(error.message || 'No se pudo eliminar el producto de la cuenta.', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
  }
};



const inicializarEventos = () => {

  toggleCobroAdelantado?.addEventListener('change', (event) => {
    modoCobroAdelantado = Boolean(event.target.checked);
    limpiarSeleccion();
    recargarEstadoCaja(true).catch((error) => {
      console.error('Error al cambiar el modo de cobro adelantado:', error);
      setMensajeLista('No se pudo actualizar la lista de cuentas.', 'error');
    });
  });

  botonCobroAdelantado?.addEventListener('click', (event) => {
    event.preventDefault();
    registrarCobroAdelantado();
  });

  botonSepararCuenta?.addEventListener('click', (event) => {
    event.preventDefault();
    abrirSplitModal();
  });

  botonJuntarCuentas?.addEventListener('click', (event) => {
    event.preventDefault();
    abrirMergeModal();
  });

  botonEliminarCuenta?.addEventListener('click', (event) => {
    event.preventDefault();
    eliminarCuentaSeleccionada();
  });

  splitModalCerrar?.addEventListener('click', (event) => {
    event.preventDefault();
    cerrarSplitModal();
  });

  splitModalLimpiar?.addEventListener('click', (event) => {
    event.preventDefault();
    splitSeleccion.clear();
    renderSplitModalContenido();
  });

  splitModalConfirmar?.addEventListener('click', (event) => {
    event.preventDefault();
    confirmarSeparacion();
  });

  splitModal?.addEventListener('click', (event) => {
    if (event.target === splitModal) cerrarSplitModal();
  });

  splitModalOrigen?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-detalle-id]');
    if (checkbox && checkbox.type === 'checkbox') {
      const detalleId = Number(checkbox.dataset.detalleId);
      if (!Number.isFinite(detalleId)) return;
      const item = splitItemsMap.get(detalleId);
      if (checkbox.checked && item) {
        establecerCantidadSeleccionSplit(detalleId, item.cantidad);
      } else {
        splitSeleccion.delete(detalleId);
      }
      renderSplitModalContenido();
      return;
    }

    const cantidadInput = event.target.closest('input[data-accion="cantidad"][data-detalle-id]');
    if (!cantidadInput) return;
    const detalleId = Number(cantidadInput.dataset.detalleId);
    if (!Number.isFinite(detalleId)) return;
    establecerCantidadSeleccionSplit(detalleId, cantidadInput.value);
    renderSplitModalContenido();
  });

  splitModalDestino?.addEventListener('change', (event) => {
    const cantidadInput = event.target.closest('input[data-accion="cantidad"][data-detalle-id]');
    if (!cantidadInput) return;
    const detalleId = Number(cantidadInput.dataset.detalleId);
    if (!Number.isFinite(detalleId)) return;
    establecerCantidadSeleccionSplit(detalleId, cantidadInput.value);
    renderSplitModalContenido();
  });

  splitModalDestino?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-accion="quitar"]');
    if (!btn) return;
    const detalleId = Number(btn.dataset.detalleId);
    if (!Number.isFinite(detalleId)) return;
    splitSeleccion.delete(detalleId);
    renderSplitModalContenido();
  });

  mergeModalCerrar?.addEventListener('click', (event) => {
    event.preventDefault();
    cerrarMergeModal();
  });

  mergeModalConfirmar?.addEventListener('click', (event) => {
    event.preventDefault();
    confirmarMerge();
  });

  mergeModal?.addEventListener('click', (event) => {
    if (event.target === mergeModal) cerrarMergeModal();
  });

  adminPasswordModalCerrar?.addEventListener('click', (event) => {
    event.preventDefault();
    cerrarModalPasswordAdmin(null);
  });

  adminPasswordModalCancelar?.addEventListener('click', (event) => {
    event.preventDefault();
    cerrarModalPasswordAdmin(null);
  });

  adminPasswordModalConfirmar?.addEventListener('click', (event) => {
    event.preventDefault();
    confirmarModalPasswordAdmin();
  });

  adminPasswordModal?.addEventListener('click', (event) => {
    if (event.target === adminPasswordModal) {
      cerrarModalPasswordAdmin(null);
    }
  });

  adminPasswordModalInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmarModalPasswordAdmin();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cerrarModalPasswordAdmin(null);
    }
  });

  mergeModalLista?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-cuenta-id]');
    if (!checkbox) return;
    const cuentaId = Number(checkbox.dataset.cuentaId);
    if (!Number.isFinite(cuentaId)) return;
    if (checkbox.checked) {
      mergeSeleccion.add(cuentaId);
    } else {
      mergeSeleccion.delete(cuentaId);
    }
    renderMergeModalContenido();
  });

  botonVistaPrevia?.addEventListener('click', (event) => {

    event.preventDefault();

    setMensajeDetalle('');
    abrirFacturaCuentaSeleccionada('Selecciona una cuenta para ver la vista previa de la factura.', {
      vistaPrevia: true,
    });

  });



  inputDescuento?.addEventListener('change', () => {

    if (!cuentaSeleccionada) return;

    setMensajeDetalle('');

    actualizarResumenUI();

  });



  inputPropina?.addEventListener('change', () => {
    if (inputPropina) {
      inputPropina.dataset.dirty = 'true';
      guardarPropinaPreferida(inputPropina.value);
    }

    if (!cuentaSeleccionada) return;

    setMensajeDetalle('');

    actualizarResumenUI();

  });



  [inputPagoEfectivoEntregado, inputPagoTarjeta, inputPagoTransferencia].forEach((control) => {

    control?.addEventListener('input', () => {

      setMensajeDetalle('');

      recalcularCambio();

    });

  });



  selectMetodoPago?.addEventListener('change', () => {

    setMensajeDetalle('');

    toggleCamposPago();

  });



  inputClienteBuscar?.addEventListener('input', (event) => {

    const valor = event.target.value || '';

    const opcion = Array.from(datalistClientes?.options || []).find((opt) => opt.value === valor);

    if (opcion) {

      const cli = clientesSugeridos.find((c) => String(c.id) === opcion.dataset.id);

      if (cli) aplicarClienteSeleccionado(cli);

    } else if (valor.length >= 2) {

      buscarClientes(valor);

    }

  });



  inputClienteBuscar?.addEventListener('focus', () => {

    if (!clientesSugeridos.length) buscarClientes('');

  });

  inputClienteDocumento?.addEventListener('input', () => {

    programarLookupDgiiPorDocumento();

  });

  inputClienteDocumento?.addEventListener('blur', () => {

    programarLookupDgiiPorDocumento({ immediate: true });

  });

  selectTipoComprobante?.addEventListener('change', (event) => {
    actualizarEstadoNcfManual(event.target.value);
  });



  pedidosContainer?.addEventListener('click', (event) => {

    const btn = event.target.closest('[data-select-cuenta]');

    if (btn) {

      event.preventDefault();

      const cuentaId = Number(btn.dataset.selectCuenta || btn.dataset.id);

      if (Number.isFinite(cuentaId)) {

        seleccionarCuenta(cuentaId);

      }

    }

  });



  formulario?.addEventListener('submit', (event) => {

    event.preventDefault();

    if (!cuentaSeleccionada) {

      setMensajeDetalle('Selecciona una cuenta para confirmar el pago.', 'error');

      return;

    }

    if (!cuentaEstaListaParaCobro(cuentaSeleccionada)) {

      setMensajeDetalle('Esta cuenta aun no esta lista. Usa Cobrar por adelantado para registrar el pago.', 'error');

      return;

    }

    cerrarCuenta();

  });



  botonImprimir?.addEventListener('click', () => {
    abrirFacturaCuentaSeleccionada('Selecciona una cuenta para imprimir la factura.');

  });



  itemsContainer?.addEventListener('change', (event) => {

    const toggle = event.target.closest('.caja-item-descuento-toggle');

    if (toggle) {

      const key = toggle.dataset.itemKey;

      const panel = itemsContainer.querySelector(`[data-panel-key="${key}"]`);

      if (panel) panel.hidden = !toggle.checked;

      if (!toggle.checked) {

        eliminarDescuentoItem(key);

        actualizarResumenUI();

        renderDetallePedido();

      } else {

        setMensajeDetalle('');

      }

      return;

    }

  });



  itemsContainer?.addEventListener('click', async (event) => {

    const botonGuardarPrecio = event.target.closest('.caja-item-actualizar-precio');
    if (botonGuardarPrecio) {
      event.preventDefault();
      const itemIndex = Number(botonGuardarPrecio.dataset.itemIndex);
      if (!Number.isFinite(itemIndex)) return;
      await actualizarPrecioProductoCuenta(itemIndex, botonGuardarPrecio);
      return;
    }

    const botonEliminarItem = event.target.closest('.caja-item-eliminar');
    if (botonEliminarItem) {
      event.preventDefault();
      const itemIndex = Number(botonEliminarItem.dataset.itemIndex);
      if (!Number.isFinite(itemIndex)) return;
      const nombre = (botonEliminarItem.dataset.nombre || '').replace(/&quot;/g, '"');
      await eliminarProductoCuenta(itemIndex, nombre, botonEliminarItem);
      return;
    }

    const botonAplicar = event.target.closest('.caja-item-aplicar-descuento');

    if (!botonAplicar) return;



    event.preventDefault();

    const key = botonAplicar.dataset.itemKey;

    const panel = itemsContainer.querySelector(`[data-panel-key="${key}"]`);

    const cantidadInput = panel?.querySelector('.caja-item-descuento-cantidad');

    const tipoSelect = panel?.querySelector('.caja-item-descuento-tipo');

    const valorInput = panel?.querySelector('.caja-item-descuento-valor');



    const cantidadMax = Math.max(Number(botonAplicar.dataset.max) || 0, 0);

    const precioUnitario = Math.max(Number(botonAplicar.dataset.precio) || 0, 0);

    const itemIndex = Number(botonAplicar.dataset.itemIndex);

    const item = cuentaSeleccionada?.items_agregados?.[itemIndex];

    let cantidad = Math.max(Number(cantidadInput?.value) || 0, 0);

    cantidad = Math.min(cantidad, cantidadMax);



    if (!cantidad || cantidad <= 0) {

      setMensajeDetalle('Ingresa una cantidad valida para aplicar el descuento.', 'error');

      return;

    }



    const tipo = (tipoSelect?.value || 'porcentaje') === 'monto' ? 'monto' : 'porcentaje';

    const valor = Math.max(Number(valorInput?.value) || 0, 0);



    if (!valor || valor <= 0) {

      setMensajeDetalle('Ingresa un valor de descuento mayor a 0.', 'error');

      return;

    }



    const maximoPermitido = precioUnitario * cantidad;

    let montoCalculado =

      tipo === 'porcentaje'

        ? precioUnitario * cantidad * (valor / 100)

        : valor * cantidad;



    montoCalculado = Math.max(Math.min(montoCalculado, maximoPermitido), 0);

    montoCalculado = Math.round(montoCalculado * 100) / 100;



    const nombre = (botonAplicar.dataset.nombre || 'Producto').replace(/&quot;/g, '"');

    registrarDescuentoItem({

      key,

      producto_id: Number(botonAplicar.dataset.producto) || null,

      cantidad_total: cantidadMax,

      nombre,

      cantidad,

      tipo,

      valor,

      montoCalculado,

      precioUnitario,

      detalle_ids: Array.isArray(item?.detalles) ? item.detalles : [],

    });



    setMensajeDetalle('');

    actualizarResumenUI();

    renderDetallePedido();

  });



  if (tabsContainer) {

    tabsContainer.addEventListener('click', (event) => {

      const btn = event.target.closest('[data-tab]');

      if (!btn) return;

      mostrarTab(btn.dataset.tab || 'cobros');

    });

  } else {

    tabsCaja.forEach((btn) =>

      btn.addEventListener('click', () => {

        mostrarTab(btn.dataset.tab || 'cobros');

      })

    );

  }



  mostrarTab('cobros');

};



const inicializarCuadre = () => {

  if (!cuadreFechaInput) return;



  const usuario = obtenerUsuarioActual();

  if (cuadreUsuarioInput) {

    cuadreUsuarioInput.value = usuario?.nombre || usuario?.usuario || '';

    cuadreUsuarioInput.readOnly = true;

  }



  if (!cuadreFechaInput.value) {

    cuadreFechaInput.value = resumenCuadre.fecha || obtenerFechaLocalHoy();

  }



  cuadreFondoInicialInput?.addEventListener('input', () => {

    cuadreFondoInicialInput.dataset.dirty = 'true';

    setCuadreMensaje('');

    actualizarEfectivoEsperado();

    actualizarDiferenciaCuadre();

    guardarFondoInicialPersistido();

  });



  cuadreFechaInput.addEventListener('change', () => {

    cargarResumenCuadre();

  });



  cuadreDeclaradoInput?.addEventListener('input', () => {

    setCuadreMensaje('');

    actualizarDiferenciaCuadre();

  });



  cuadreRegistrarBtn?.addEventListener('click', (event) => {

    event.preventDefault();

    registrarCuadre();

  });



  salidaAgregarBtn?.addEventListener('click', (event) => {

    event.preventDefault();

    registrarSalida();

  });



  cuadreDetalleBtn?.addEventListener('click', () => {

    if (!cuadreDetalleWrapper) return;

    cuadreDetalleWrapper.hidden = !cuadreDetalleWrapper.hidden;

    if (!cuadreDetalleWrapper.hidden) {

      renderDetalleCuadreActual();

    }

  });

  cuadreDetalleBody?.addEventListener('click', (event) => {
    const target = event.target;
    const selectorMetodo =
      target instanceof Element ? target.closest('[data-cambiar-metodo], .cuadre-metodo-cell') : null;
    const esOpcionMetodo = target instanceof HTMLOptionElement;
    if (selectorMetodo) {
      event.stopPropagation();
      return;
    }
    if (esOpcionMetodo) {
      event.stopPropagation();
      return;
    }

    const botonVerFactura = event.target.closest('[data-ver-factura]');
    if (botonVerFactura) {
      event.preventDefault();
      event.stopPropagation();
      const pedidoId = Number(botonVerFactura.dataset.pedidoId);
      if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
        setCuadreMensaje('No se encontro la factura de esta cuenta.', 'error');
        return;
      }
      setCuadreMensaje('');
      window.open(`/factura.html?id=${pedidoId}`, '_blank');
      return;
    }

    const fila = event.target.closest('tr');
    if (!fila || fila.classList.contains('cuadre-detalle-expand')) return;
    const cuadreId = Number(fila.dataset.cuadreId);
    if (!Number.isFinite(cuadreId) || cuadreId <= 0) return;
    mostrarDetalleCuadre(fila, cuadreId);
  });

  cuadreDetalleBody?.addEventListener('change', (event) => {
    const selectorMetodo = event.target.closest('[data-cambiar-metodo]');
    if (!selectorMetodo) return;
    const cuentaId = Number(selectorMetodo.dataset.cuentaId);
    const metodo = selectorMetodo.value;
    actualizarMetodoPagoCuadre(cuentaId, metodo, selectorMetodo);
  });



  actualizarDiferenciaCuadre();

};



window.addEventListener('DOMContentLoaded', () => {

  cargarConfigSecuencias();
  modoCobroAdelantado = Boolean(toggleCobroAdelantado?.checked);

  recargarEstadoCaja(true);

  inicializarEventos();

  inicializarCuadre();

  toggleCamposPago();

  iniciarActualizacionPeriodicaCaja();

  window.cambiarTabCaja = mostrarTab;

});



window.addEventListener('beforeunload', () => {

  if (refreshTimer) {

    clearInterval(refreshTimer);

  }

});



window.addEventListener('storage', (event) => {

  if (event.key === SYNC_STORAGE_KEY) {

    procesarSyncGlobal(event.newValue);

  }

});



document.addEventListener('visibilitychange', () => {

  if (!document.hidden) {

    recargarEstadoCaja(false).catch((error) => {

      console.error('Error al refrescar la vista de caja al volver a la pestana:', error);

    });

  }

});


