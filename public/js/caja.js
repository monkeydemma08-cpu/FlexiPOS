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

const botonRecalcular = document.getElementById('caja-recalcular');

const botonCobrar = document.getElementById('caja-cobrar');

const resumenSubtotal = document.getElementById('caja-resumen-subtotal');

const resumenImpuesto = document.getElementById('caja-resumen-impuesto');

const resumenPropina = document.getElementById('caja-resumen-propina');

const resumenDescuento = document.getElementById('caja-resumen-descuento');

const resumenTotal = document.getElementById('caja-resumen-total');

const facturaAcciones = document.getElementById('caja-factura-acciones');

const facturaInfo = document.getElementById('caja-factura-info');

const botonImprimir = document.getElementById('caja-imprimir');



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

const tabsContainer = document.querySelector('.caja-tabs');

const tabsCaja = Array.from(document.querySelectorAll('.caja-tabs .kanm-tab'));

const panelCobros = document.getElementById('panel-cobros');

const panelCuadre = document.getElementById('panel-cuadre');

let secuenciasConfig = {
  permitir_b01: 1,
  permitir_b02: 1,
  permitir_b14: 1,
};



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



const buscarClientes = async (term = '') => {

  try {

    const resp = await fetch(`/api/clientes?search=${encodeURIComponent(term)}`);

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

  const monto = Number(salidaMontoInput?.value);

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

    salidaMontoInput.value = '';

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
    const valor = Number(raw);
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
      cuadreFondoInicialInput.value = '';
      delete cuadreFondoInicialInput.dataset.dirty;
    }
    return;
  }
  cuadreFondoInicialInput.value = String(valor);
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

  const valor = Number(cuadreFondoInicialInput?.value);

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



const obtenerMetodoPagoLabel = (pedido = {}) => {

  const efectivoRegistrado = Number(pedido.pago_efectivo) || 0;

  const cambioRegistrado = Number(pedido.pago_cambio) || 0;

  const efectivoAplicado = Math.max(efectivoRegistrado - cambioRegistrado, 0);

  const tarjeta = Number(pedido.pago_tarjeta) || 0;

  const transferencia = Number(pedido.pago_transferencia) || 0;



  const partes = [];

  if (efectivoAplicado > 0) partes.push('Efectivo');

  if (tarjeta > 0) partes.push('Tarjeta');

  if (transferencia > 0) partes.push('Transferencia/Deposito');



  return partes.length ? partes.join(' + ') : 'Sin registrar';

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
  celda.colSpan = 5;
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



const setCuadreMensaje = (texto, tipo = 'info') => {

  if (!cuadreMensaje) return;

  cuadreMensaje.textContent = texto;

  cuadreMensaje.dataset.type = texto ? tipo : '';

};



const resetFormularioCuadre = () => {

  if (cuadreDeclaradoInput) cuadreDeclaradoInput.value = '';

  if (cuadreFondoInicialInput) {

    cuadreFondoInicialInput.value = '';

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

  limpiarDescuentosItems();

  if (formulario) formulario.hidden = true;

  if (seleccionPlaceholder) {

    seleccionPlaceholder.hidden = false;

    seleccionPlaceholder.textContent = 'Selecciona un pedido para ver los detalles.';

  }

  if (formulario) formulario.reset();

  if (infoContainer) infoContainer.innerHTML = '';

  if (itemsContainer) itemsContainer.innerHTML = '';

  if (inputClienteNombre) inputClienteNombre.value = '';

  if (inputClienteDocumento) inputClienteDocumento.value = '';

  resetPagosFormulario(0);

  seleccionarTipoComprobantePermitido('B02');

  if (inputNcfManual) inputNcfManual.value = '';

  if (inputComentarios) inputComentarios.value = '';

  if (facturaAcciones) {

    facturaAcciones.hidden = true;

    if (facturaInfo) facturaInfo.innerHTML = '';

  }

  if (botonCobrar) {

    botonCobrar.disabled = false;

    botonCobrar.textContent = 'Confirmar pago';

    botonCobrar.classList.remove('is-loading');

  }

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



const renderPedidos = () => {

  if (!pedidosContainer) return;



  pedidosContainer.innerHTML = '';



  if (!cuentas.length) {

    const vacio = document.createElement('div');

    vacio.className = 'caja-empty';

    vacio.textContent = 'No hay pedidos listos para cobrar.';

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

    header.innerHTML = `

      <div>

        <h3 style="margin: 0;">Cuenta #${cuenta.cuenta_id}</h3>

        <p class="kanm-subtitle" style="margin: 4px 0 0; color: inherit;">

          ${cuenta.mesa || 'Mesa no asignada'}${cuenta.cliente ? ` - ${cuenta.cliente}` : ''}

        </p>

      </div>

      <span class="badge-listo">Listo</span>

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

    `;

  }



  if (!itemsContainer) return;



  itemsContainer.innerHTML = '';



  const itemsAgrupados = cuentaSeleccionada.items_agregados || [];

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

            style="margin-top: 4px;"

          />

          <div class="caja-item-detalle" style="flex: 1 1 auto;">

            <div class="caja-item-nombre" style="font-weight: 600;">${nombreItem}</div>
            <div class="caja-item-meta">${cantidad} x ${formatCurrency(precioLinea)} = ${formatCurrency(subtotal)}</div>

            ${resumenDescuento}

          </div>

        </label>

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

            />

          </div>

          <div class="kanm-input-group">

            <label>Tipo de descuento</label>

            <select class="caja-item-descuento-tipo" data-item-key="${key}">

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

          >

            Aplicar descuento

          </button>

        </div>

      </div>

    `;



    lista.appendChild(li);

  });



  itemsContainer.appendChild(lista);


};const calcularTotales = () => {

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

  const impuesto = Number(totalesBase.impuesto) || 0;

  const base = subtotal + impuesto;

  const descuentoPorcentaje = Math.max(Number(inputDescuento?.value) || 0, 0);

  const propinaPorcentaje = Math.max(Number(inputPropina?.value) || 0, 0);



  const tasaImpuesto = subtotal > 0 ? impuesto / subtotal : 0;

  const descuentoItemsBruto = descuentosPorItem.reduce(

    (acc, item) => acc + (Number(item.montoCalculado) || 0),

    0

  );

  const descuentoItemsMonto = Math.min(descuentoItemsBruto * (1 + tasaImpuesto), base);

  const descuentoGeneralMonto = Math.min(

    base * (descuentoPorcentaje / 100),

    Math.max(base - descuentoItemsMonto, 0)

  );

  const descuentoTotal = Math.min(descuentoItemsMonto + descuentoGeneralMonto, base);

  const baseConDescuento = Math.max(base - descuentoTotal, 0);

  const propinaMonto = baseConDescuento * (propinaPorcentaje / 100);

  const total = baseConDescuento + propinaMonto;

  const descuentoPorcentajeEfectivo = base > 0 ? (descuentoTotal / base) * 100 : 0;



  calculo = {

    subtotal,

    impuesto,

    descuentoPorcentaje,

    descuentoPorcentajeEfectivo,

    propinaPorcentaje,

    descuentoGeneralMonto,

    descuentoItemsMonto,

    descuentoMonto: descuentoTotal,

    propinaMonto,

    baseConDescuento,

    baseSinDescuento: base,

    total,

  };

};



const actualizarResumenUI = () => {

  calcularTotales();

  if (resumenSubtotal) resumenSubtotal.textContent = formatCurrency(calculo.subtotal);

  if (resumenImpuesto) resumenImpuesto.textContent = formatCurrency(calculo.impuesto);

  if (resumenPropina) resumenPropina.textContent = formatCurrency(calculo.propinaMonto);

  if (resumenDescuento) resumenDescuento.textContent = `- ${formatCurrency(calculo.descuentoMonto)}`;

  if (resumenTotal) resumenTotal.textContent = formatCurrency(calculo.total);

  recalcularCambio();

};



const obtenerPagosFormulario = () => {

  const metodo = selectMetodoPago?.value || 'efectivo';

  const total = calculo.total;



  if (metodo === 'tarjeta') {

    return { efectivo: 0, efectivoEntregado: 0, tarjeta: total, transferencia: 0, metodo };

  }



  if (metodo === 'transferencia') {

    return { efectivo: 0, efectivoEntregado: 0, tarjeta: 0, transferencia: total, metodo };

  }



  if (metodo === 'efectivo') {

    const recibido = Math.max(Number(inputPagoEfectivoEntregado?.value) || 0, 0);

    return { efectivo: total, efectivoEntregado: recibido || total, tarjeta: 0, transferencia: 0, metodo };

  }



  const tarjeta = Math.max(Number(inputPagoTarjeta?.value) || 0, 0);

  const transferencia = Math.max(Number(inputPagoTransferencia?.value) || 0, 0);

  const entregadoRaw = inputPagoEfectivoEntregado?.value;

  const efectivoEntregado = Math.max(Number(entregadoRaw) || 0, 0);

  const efectivo = Math.min(efectivoEntregado, Math.max(total - tarjeta - transferencia, 0));



  return { efectivo, efectivoEntregado, tarjeta, transferencia, metodo };

};



const recalcularCambio = () => {

  const pagos = obtenerPagosFormulario();

  const total = calculo.total;

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

  if (inputPagoEfectivoEntregado) inputPagoEfectivoEntregado.value = (Number(total) || 0).toFixed(2);

  if (inputPagoTarjeta) inputPagoTarjeta.value = '0';

  if (inputPagoTransferencia) inputPagoTransferencia.value = '0';

  toggleCamposPago();

  recalcularCambio();

};



const toggleCamposPago = () => {

  const metodo = selectMetodoPago?.value || 'efectivo';

  camposPago.forEach((campo) => {

    const metodos = (campo.dataset.metodo || '').split(' ');

    campo.hidden = !metodos.includes(metodo);

  });



  if (inputPagoEfectivoEntregado)

    inputPagoEfectivoEntregado.readOnly = !(metodo === 'efectivo' || metodo === 'combinado');

  if (inputPagoTarjeta) inputPagoTarjeta.readOnly = metodo !== 'combinado';

  if (inputPagoTransferencia) inputPagoTransferencia.readOnly = metodo !== 'combinado';



  if (metodo !== 'combinado' && calculo.total) {

    if (metodo === 'efectivo') {

      if (inputPagoEfectivoEntregado) inputPagoEfectivoEntregado.value = calculo.total.toFixed(2);

      if (inputPagoTarjeta) inputPagoTarjeta.value = '0';

      if (inputPagoTransferencia) inputPagoTransferencia.value = '0';

    } else if (metodo === 'tarjeta') {

      if (inputPagoTarjeta) inputPagoTarjeta.value = calculo.total.toFixed(2);

      if (inputPagoEfectivoEntregado) inputPagoEfectivoEntregado.value = '0';

      if (inputPagoTransferencia) inputPagoTransferencia.value = '0';

    } else if (metodo === 'transferencia') {

      if (inputPagoTransferencia) inputPagoTransferencia.value = calculo.total.toFixed(2);

      if (inputPagoEfectivoEntregado) inputPagoEfectivoEntregado.value = '0';

      if (inputPagoTarjeta) inputPagoTarjeta.value = '0';

    }

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



  const declarado = Number(valorEntrada);

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

    celda.colSpan = 5;

    celda.textContent = 'No hay pedidos pendientes de cuadre en este turno.';

    fila.appendChild(celda);

    cuadreDetalleBody.appendChild(fila);

    return;

  }



  const fragment = document.createDocumentFragment();



  resumenCuadre.pedidos.forEach((pedido) => {

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



    fila.dataset.cuadreId = pedido.id;
    fila.style.cursor = 'pointer';
    fila.setAttribute('aria-expanded', 'false');
    fila.setAttribute('title', 'Haz clic para ver productos');
    fila.innerHTML = `

      <td>#${pedido.id}</td>

      <td>${mesaCliente}</td>

      <td>${formatDateTime(pedido.fecha_cierre || pedido.pedidos?.[0]?.fecha_cierre)}</td>

      <td>${metodoLabel}</td>

      <td>${formatCurrency(total)}</td>

    `;

    fragment.appendChild(fila);

  });



  cuadreDetalleBody.appendChild(fragment);

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



  const montoDeclarado = Number(cuadreDeclaradoInput?.value);

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

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaId}/detalle`);

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

    limpiarDescuentosItems();



    if (seleccionPlaceholder) seleccionPlaceholder.hidden = true;

    if (formulario) formulario.hidden = false;

    if (botonCobrar) {

      botonCobrar.disabled = false;

      botonCobrar.textContent = 'Confirmar pago';

    }

    setMensajeDetalle('');



    if (inputDescuento) inputDescuento.value = '0';

    aplicarPropinaPreferida({ force: true });



    renderDetallePedido();

    const totales = totalesBaseCuenta(cuentaSeleccionada);

    actualizarResumenUI();

    resetPagosFormulario(calculo.total || totales.total || totales.subtotalBruto + totales.impuesto);

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

    const respuesta = await fetchAutorizadoCaja('/api/pedidos?estado=listo');

    if (!respuesta.ok) {

      throw new Error('No se pudieron obtener los pedidos listos.');

    }

    const data = await respuesta.json();

    cuentas = Array.isArray(data) ? data : [];

    if (!cuentas.length) {

      setMensajeLista('Sin pedidos listos para cobrar en este momento.', 'info');

    } else {

      setMensajeLista('');

    }

    renderPedidos();



    if (cuentaSeleccionada) {

      const sigueDisponible = cuentas.some((cuenta) => cuenta.cuenta_id === cuentaSeleccionada.cuenta_id);

      if (!sigueDisponible) limpiarSeleccion();

    }

  } catch (error) {

    console.error('Error al cargar pedidos para caja:', error);

    setMensajeLista('Error al cargar los pedidos listos. Intenta nuevamente.', 'error');

    pedidosContainer.innerHTML = '';

    limpiarSeleccion();

  }

};



const cerrarCuenta = async () => {

  if (!cuentaSeleccionada) {

    setMensajeDetalle('Selecciona una cuenta antes de cobrar.', 'error');

    return;

  }



  // Recalcular totales basados en descuentos por item antes de cobrar

  actualizarResumenUI();



  const pagos = recalcularCambio();

  const efectivoAplicado =

    pagos.efectivoAplicado ?? pagos.efectivo ?? Math.max(calculo.total - (pagos.tarjeta + pagos.transferencia), 0);

  const total = calculo.total;

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



    const detalleDescuentosPayload = expandirDescuentosPorDetalle();



    const tipoComprobante = normalizarTipoComprobante(selectTipoComprobante?.value || '');
    const sinComprobante = esSinComprobante(tipoComprobante);
    const ncfManual = sinComprobante ? null : inputNcfManual?.value;



    const usuario = obtenerUsuarioActual();

    const respuesta = await fetchAutorizadoCaja(`/api/cuentas/${cuentaSeleccionada.cuenta_id}/cerrar`, {

      method: 'PUT',

      headers: {

        'Content-Type': 'application/json',

      },

      body: JSON.stringify({

        descuento_porcentaje: calculo.descuentoPorcentajeEfectivo ?? calculo.descuentoPorcentaje,

        descuento_monto: calculo.descuentoMonto,

        propina_porcentaje: calculo.propinaPorcentaje,

        cliente: inputClienteNombre?.value,

        cliente_documento: inputClienteDocumento?.value,

        tipo_comprobante: tipoComprobante || 'B02',

        ncf: ncfManual,

        generar_ncf: !sinComprobante,

        comentarios: inputComentarios?.value,

        usuario_id: usuario?.id,

        detalle_descuentos: detalleDescuentosPayload,

        pagos: {

          efectivo: pagos.efectivoAplicado ?? pagos.efectivo ?? calculo.total,

          efectivo_entregado: pagos.efectivoEntregado,

          tarjeta: pagos.tarjeta,

          transferencia: pagos.transferencia,

        },

      }),

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



const inicializarEventos = () => {

  botonRecalcular?.addEventListener('click', (event) => {

    event.preventDefault();

    if (!cuentaSeleccionada) {

      setMensajeDetalle('Selecciona una cuenta para recalcular montos.', 'error');

      return;

    }

    setMensajeDetalle('');

    actualizarResumenUI();

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

    cerrarCuenta();

  });



  botonImprimir?.addEventListener('click', () => {

    if (!cuentaSeleccionada) {

      setMensajeDetalle('Selecciona una cuenta para imprimir la factura.', 'error');

      return;

    }

    const primera = cuentaSeleccionada.pedidos?.[0];

    if (primera?.id) {

      window.open(`/factura.html?id=${primera.id}`, '_blank');

    }

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



  itemsContainer?.addEventListener('click', (event) => {

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
    const fila = event.target.closest('tr');
    if (!fila || fila.classList.contains('cuadre-detalle-expand')) return;
    const cuadreId = Number(fila.dataset.cuadreId);
    if (!Number.isFinite(cuadreId) || cuadreId <= 0) return;
    mostrarDetalleCuadre(fila, cuadreId);
  });



  actualizarDiferenciaCuadre();

};



window.addEventListener('DOMContentLoaded', () => {

  cargarConfigSecuencias();

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


