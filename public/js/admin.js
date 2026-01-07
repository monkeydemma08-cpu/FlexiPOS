const productosLista = document.getElementById('productos-lista');
const productosBuscarInput = document.getElementById('productos-buscar');
const formProducto = document.getElementById('prod-form');
const inputProdId = document.getElementById('prod-id');
const inputProdNombre = document.getElementById('prod-nombre');
const inputProdPrecio = document.getElementById('prod-precio');
const inputProdStock = document.getElementById('prod-stock');
const inputProdStockIndefinido = document.getElementById('prod-stock-indefinido');
const inputProdCategoria = document.getElementById('prod-categoria');
const inputProdActivo = document.getElementById('prod-activo');
const mensajeProductos = document.getElementById('admin-mensaje');
const filtroCategoriaProductos = document.getElementById('productos-filtro-categoria');


const impuestoForm = document.getElementById('impuesto-form');
const impuestoValorInput = document.getElementById('impuesto-valor');
const impuestoGuardarBtn = document.getElementById('impuesto-guardar');
const impuestoMensaje = document.getElementById('impuesto-mensaje');

const facturaForm = document.getElementById('factura-form');
const facturaTelefonosContainer = document.getElementById('factura-telefonos');
const facturaTelefonoAgregarBtn = document.getElementById('factura-telefono-agregar');
const facturaDireccionInput = document.getElementById('factura-direccion');
const facturaRncInput = document.getElementById('factura-rnc');
const facturaLogoInput = document.getElementById('factura-logo');
const facturaPieInput = document.getElementById('factura-pie');
const facturaGuardarBtn = document.getElementById('factura-guardar');
const facturaMensaje = document.getElementById('factura-mensaje');
const ncfB02InicioInput = document.getElementById('ncf-b02-inicio');
const ncfB02FinInput = document.getElementById('ncf-b02-fin');
const ncfB02Restante = document.getElementById('ncf-b02-restante');
const ncfB02Alerta = document.getElementById('ncf-b02-alerta');
const ncfB01InicioInput = document.getElementById('ncf-b01-inicio');
const ncfB01FinInput = document.getElementById('ncf-b01-fin');
const ncfB01Restante = document.getElementById('ncf-b01-restante');
const ncfB01Alerta = document.getElementById('ncf-b01-alerta');

let facturaConfigDirty = false;
let cacheCategorias = [];

const compraForm = document.getElementById('compra-form');
const compraProveedorInput = document.getElementById('compra-proveedor');
const compraRncInput = document.getElementById('compra-rnc');
const compraFechaInput = document.getElementById('compra-fecha');
const compraTipoInput = document.getElementById('compra-tipo');
const compraNcfInput = document.getElementById('compra-ncf');
const compraGravadoInput = document.getElementById('compra-gravado');
const compraImpuestoInput = document.getElementById('compra-impuesto');
const compraExentoInput = document.getElementById('compra-exento');
const compraTotalInput = document.getElementById('compra-total');
const compraComentariosInput = document.getElementById('compra-comentarios');
const compraDetallesContainer = document.getElementById('compra-detalles');
const compraAgregarDetalleBtn = document.getElementById('compra-agregar-detalle');
const compraRecalcularBtn = document.getElementById('compra-recalcular');
const compraMensaje = document.getElementById('compra-mensaje');

const comprasMensaje = document.getElementById('compras-mensaje');
const comprasTabla = document.getElementById('compras-tabla');

const gastosResumenTotal = document.getElementById('gastos-resumen-total');
const gastosResumenPromedio = document.getElementById('gastos-resumen-promedio');
const gastosResumenTop = document.getElementById('gastos-resumen-top');
const gastoForm = document.getElementById('gasto-form');
const gastoIdInput = document.getElementById('gasto-id');
const gastoFechaInput = document.getElementById('gasto-fecha');
const gastoMontoInput = document.getElementById('gasto-monto');
const gastoMonedaInput = document.getElementById('gasto-moneda');
const gastoCategoriaInput = document.getElementById('gasto-categoria');
const gastoMetodoInput = document.getElementById('gasto-metodo');
const gastoProveedorInput = document.getElementById('gasto-proveedor');
const gastoDescripcionInput = document.getElementById('gasto-descripcion');
const gastoNcfInput = document.getElementById('gasto-ncf');
const gastoReferenciaInput = document.getElementById('gasto-referencia');
const gastoRecurrenteInput = document.getElementById('gasto-recurrente');
const gastoFrecuenciaInput = document.getElementById('gasto-frecuencia');
const gastoTagsInput = document.getElementById('gasto-tags');
const gastoCancelarBtn = document.getElementById('gasto-cancelar');
const gastoMensaje = document.getElementById('gasto-mensaje');
const gastosDesdeInput = document.getElementById('gastos-desde');
const gastosHastaInput = document.getElementById('gastos-hasta');
const gastosCategoriaFiltroInput = document.getElementById('gastos-categoria-filtro');
const gastosMetodoFiltroInput = document.getElementById('gastos-metodo-filtro');
const gastosBuscarInput = document.getElementById('gastos-buscar');
const gastosConsultarBtn = document.getElementById('gastos-consultar');
const gastosLimpiarBtn = document.getElementById('gastos-limpiar');
const gastosMensajeLista = document.getElementById('gastos-mensaje-lista');
const gastosTabla = document.getElementById('gastos-tabla');
const gastosCategoriasList = document.getElementById('gastos-categorias');

const analisisDesdeInput = document.getElementById('analisis-desde');
const analisisHastaInput = document.getElementById('analisis-hasta');
const analisisActualizarBtn = document.getElementById('analisis-actualizar');
const analisisMensaje = document.getElementById('analisis-mensaje');
const analisisRangeButtons = Array.from(document.querySelectorAll('[data-analisis-range]'));
const analisisKpiVentas = document.getElementById('analisis-kpi-ventas');
const analisisKpiGastos = document.getElementById('analisis-kpi-gastos');
const analisisKpiGanancia = document.getElementById('analisis-kpi-ganancia');
const analisisKpiMargen = document.getElementById('analisis-kpi-margen');
const analisisKpiTicket = document.getElementById('analisis-kpi-ticket');
const analisisKpiVentasCount = document.getElementById('analisis-kpi-ventas-count');
const analisisKpiVentasDelta = document.getElementById('analisis-kpi-ventas-delta');
const analisisKpiGastosDelta = document.getElementById('analisis-kpi-gastos-delta');
const analisisKpiGananciaDelta = document.getElementById('analisis-kpi-ganancia-delta');
const analisisKpiTicketDelta = document.getElementById('analisis-kpi-ticket-delta');
const analisisSerieBody = document.getElementById('analisis-serie-body');
const analisisTopCantidad = document.getElementById('analisis-top-cantidad');
const analisisTopIngresos = document.getElementById('analisis-top-ingresos');
const analisisBottomProductos = document.getElementById('analisis-bottom-productos');
const analisisTopDias = document.getElementById('analisis-top-dias');
const analisisTopHoras = document.getElementById('analisis-top-horas');
const analisisTopDiasMes = document.getElementById('analisis-top-dias-mes');
const analisisMetodosPago = document.getElementById('analisis-metodos-pago');
const analisisTopCategorias = document.getElementById('analisis-top-categorias');
const analisisGastosRecurrentes = document.getElementById('analisis-gastos-recurrentes');
const analisisAlertas = document.getElementById('analisis-alertas');

const usuariosRolSelect = document.getElementById('usuarios-rol');
const usuariosTablaBody = document.getElementById('usuarios-tabla-body');
const usuariosMensaje = document.getElementById('usuarios-mensaje');
const usuarioForm = document.getElementById('usuario-form');
const usuarioIdInput = document.getElementById('usuario-id');
const usuarioNombreInput = document.getElementById('usuario-nombre');
const usuarioUsuarioInput = document.getElementById('usuario-usuario');
const usuarioPasswordInput = document.getElementById('usuario-password');
const usuarioRolInput = document.getElementById('usuario-rol');
const usuarioActivoInput = document.getElementById('usuario-activo');
const usuarioFormMensaje = document.getElementById('usuario-form-mensaje');
const usuarioLimpiarBtn = document.getElementById('usuario-limpiar');

const reporte607MesInput = document.getElementById('reporte-607-mes');
const reporte607ConsultarBtn = document.getElementById('reporte-607-consultar');
const reporte607ExportarBtn = document.getElementById('reporte-607-exportar');
const reporte607TotalSpan = document.getElementById('reporte-607-total');
const reporte607MontoSpan = document.getElementById('reporte-607-monto');
const reporte607Mensaje = document.getElementById('reporte-607-mensaje');
const reporte607Tabla = document.getElementById('reporte-607-tabla');

const reporte606MesInput = document.getElementById('reporte-606-mes');
const reporte606ConsultarBtn = document.getElementById('reporte-606-consultar');
const reporte606ExportarBtn = document.getElementById('reporte-606-exportar');
const reporte606TotalSpan = document.getElementById('reporte-606-total');
const reporte606MontoSpan = document.getElementById('reporte-606-monto');
const reporte606Mensaje = document.getElementById('reporte-606-mensaje');
const reporte606Tabla = document.getElementById('reporte-606-tabla');

const cierresDesdeInput = document.getElementById('cierres-desde');
const cierresHastaInput = document.getElementById('cierres-hasta');
const cierresBuscarBtn = document.getElementById('cierres-buscar');
const cierresExportarBtn = document.getElementById('cierres-exportar');
const cierresMensaje = document.getElementById('cierres-mensaje');
const cierresTabla = document.getElementById('cierres-tabla');
const cierresDetalleWrapper = document.getElementById('cierres-detalle-wrapper');
const cierresDetalleTabla = document.getElementById('cierres-detalle-tabla');

const histCocinaFechaInput = document.getElementById('hist-cocina-fecha');
const histCocinaBuscarBtn = document.getElementById('hist-cocina-buscar');
const histCocinaExportarBtn = document.getElementById('hist-cocina-exportar');
const histCocinaMensaje = document.getElementById('hist-cocina-mensaje');
const histCocinaTabla = document.getElementById('hist-cocina-tabla');
const histCocinaPrev = document.getElementById('hist-cocina-prev');
const histCocinaNext = document.getElementById('hist-cocina-next');
const histCocinaInfo = document.getElementById('hist-cocina-info');
const histCocinaCocineroSelect = document.getElementById('hist-cocina-cocinero');
const adminTabs = Array.from(document.querySelectorAll('[data-admin-tab]'));
const adminSections = Array.from(document.querySelectorAll('[data-admin-section]'));

let paginaHistorialCocina = 1;
const HIST_COCINA_PAGE_SIZE = 50;

let productos = [];
let compras = [];
let gastos = [];
let datosReporte607 = [];
let datosReporte606 = [];
let cierresCaja = [];
let detalleCierreActivo = null;
let usuarios = [];

const REFRESH_INTERVAL_ADMIN = 15000;
const SYNC_STORAGE_KEY = 'kanm:last-update';
let refreshTimerAdmin = null;
let recargandoAdmin = false;
let ultimaMarcaSyncProcesada = 0;

const modalEliminarOverlay = document.getElementById('admin-eliminar-modal');
const modalEliminarTitulo = document.getElementById('admin-eliminar-titulo');
const modalEliminarDescripcion = document.getElementById('admin-eliminar-descripcion');
const modalEliminarPassword = document.getElementById('admin-eliminar-password');
const modalEliminarCancelar = document.getElementById('admin-eliminar-cancelar');
const modalEliminarConfirmar = document.getElementById('admin-eliminar-confirmar');
const modalEliminarMensaje = document.getElementById('admin-eliminar-mensaje');

const sessionApi = window.KANMSession;
let usuarioActual = null;
try {
  if (sessionApi && typeof sessionApi.getUser === 'function') {
    usuarioActual = sessionApi.getUser();
  } else {
    const fallback =
      sessionStorage.getItem('kanmUser') || localStorage.getItem('kanmUser');
    if (fallback) {
      const parsed = JSON.parse(fallback);
      if (parsed && typeof parsed === 'object') {
        usuarioActual = parsed;
      }
    }
  }
} catch (error) {
  console.warn('No fue posible leer el usuario activo:', error);
}

let modalEliminarEstado = null;
const authApi = window.kanmAuth;
const puedeImprimirCierres = () => {
  if (usuarioActual?.rol === 'admin') return true;
  if (usuarioActual?.es_super_admin || usuarioActual?.esSuperAdmin) return true;
  return Boolean(authApi?.isSuperAdmin?.());
};

const obtenerAuthHeaders = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener encabezados de autenticación:', error);
    return {};
  }
};

const crearHeadersJson = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...obtenerAuthHeaders(),
  ...extra,
});

const crearHeadersAuth = (extra = {}) => ({
  ...obtenerAuthHeaders(),
  ...extra,
});

const fetchConAutorizacion = async (url, options = {}) => {
  const headers = { ...obtenerAuthHeaders(), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    authApi?.handleUnauthorized?.();
  }
  return response;
};

const fetchJsonAutorizado = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...obtenerAuthHeaders(),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    authApi?.handleUnauthorized?.();
  }
  return response;
};

const formatCurrency = (value) => {
  const number = Number(value);
  if (Number.isNaN(number)) return 'DOP 0.00';
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(number);
};

const formatCurrencySigned = (value) => {
  const number = Number(value) || 0;
  if (number === 0) return formatCurrency(0);
  const prefix = number > 0 ? '+ ' : '− ';
  return `${prefix}${formatCurrency(Math.abs(number))}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
};

const parseDateTimeToUtc = (value) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const fecha = new Date(withZone);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const DEFAULT_TEMA_ADMIN = {
  colorPrimario: '#ff6699',
  colorSecundario: '#ff99bb',
  colorTexto: '#222222',
  colorHeader: '#ff6699',
  colorBotonPrimario: '#ff6699',
  colorBotonSecundario: '#ff99bb',
  colorBotonPeligro: '#ff4b4b',
};

const aplicarTemaAdmin = (tema) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const colorPrimario = tema?.colorPrimario || tema?.color_primario || DEFAULT_TEMA_ADMIN.colorPrimario;
  const colorSecundario = tema?.colorSecundario || tema?.color_secundario || DEFAULT_TEMA_ADMIN.colorSecundario;
  const colorTexto = tema?.colorTexto || tema?.color_texto || DEFAULT_TEMA_ADMIN.colorTexto;
  const colorHeader =
    tema?.colorHeader || tema?.color_header || colorPrimario || colorSecundario || DEFAULT_TEMA_ADMIN.colorHeader;
  const colorBotonPrimario =
    tema?.colorBotonPrimario ||
    tema?.color_boton_primario ||
    colorPrimario ||
    DEFAULT_TEMA_ADMIN.colorBotonPrimario;
  const colorBotonSecundario =
    tema?.colorBotonSecundario ||
    tema?.color_boton_secundario ||
    colorSecundario ||
    DEFAULT_TEMA_ADMIN.colorBotonSecundario;
  const colorBotonPeligro = tema?.colorBotonPeligro || tema?.color_boton_peligro || DEFAULT_TEMA_ADMIN.colorBotonPeligro;
  const titulo = tema?.titulo || tema?.titulo_sistema || tema?.nombre || tema?.slug || '';
  const logoUrl = tema?.logoUrl || tema?.logo_url || '';

  root.style.setProperty('--color-primario', colorPrimario);
  root.style.setProperty('--color-secundario', colorSecundario);
  root.style.setProperty('--color-texto', colorTexto);
  root.style.setProperty('--color-header', colorHeader);
  root.style.setProperty('--color-boton-texto', colorTexto);
  root.style.setProperty('--color-boton-primario', colorBotonPrimario);
  root.style.setProperty('--color-boton-secundario', colorBotonSecundario);
  root.style.setProperty('--color-boton-peligro', colorBotonPeligro);
  root.style.setProperty('--kanm-pink', colorBotonPrimario);
  root.style.setProperty('--kanm-pink-dark', colorBotonPrimario);
  root.style.setProperty('--kanm-pink-light', colorBotonPrimario);

  if (titulo) {
    document.title = titulo;
  }

  const tituloEls = document.querySelectorAll('[data-negocio-titulo]');
  tituloEls.forEach((el) => {
    if (titulo) {
      el.textContent = titulo;
    }
  });

  const headerNombrePrincipal = document.getElementById('kanm-header-negocio-nombre-principal');
  if (headerNombrePrincipal) {
    headerNombrePrincipal.textContent = titulo || '';
  }
  const headerSubtitulo = document.getElementById('kanm-header-negocio-subtitulo');
  if (headerSubtitulo && !headerSubtitulo.textContent) {
    headerSubtitulo.textContent = 'Panel de administración';
  }

  const logoEl = document.getElementById('kanm-header-logo');
  const logoFallback = document.getElementById('kanm-header-logo-fallback');
  let iniciales = '';
  if (titulo) {
    const partes = titulo.trim().split(/\s+/);
    if (partes.length === 1) {
      iniciales = partes[0].slice(0, 2).toUpperCase();
    } else {
      iniciales = (partes[0][0] + partes[1][0]).toUpperCase();
    }
  }
  const hasLogo = !!(logoUrl && logoUrl.trim() !== '');
  if (logoEl && logoFallback) {
    logoEl.alt = '';
    if (hasLogo) {
      logoEl.src = logoUrl;
      logoEl.style.display = 'block';
      logoFallback.style.display = 'none';
      logoFallback.textContent = '';
      logoEl.onerror = () => {
        logoEl.style.display = 'none';
        logoFallback.style.display = 'flex';
        logoFallback.textContent = '';
      };
    } else {
      logoEl.src = '';
      logoEl.style.display = 'none';
      logoFallback.style.display = 'flex';
      logoFallback.textContent = iniciales || '';
    }
  }

  window.APP_TEMA_NEGOCIO =
    tema ||
    {
      colorPrimario,
      colorSecundario,
      colorTexto,
      colorHeader,
      colorBotonPrimario,
      colorBotonSecundario,
      colorBotonPeligro,
      titulo,
      logoUrl,
    };
};

const formatDateTime = (value) => {
  const fecha = parseDateTimeToUtc(value);
  if (!fecha) return '—';
  return new Intl.DateTimeFormat('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Santo_Domingo',
  }).format(fecha);
};

const getLocalDateISO = (value = new Date()) => {
  const base = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(base.getTime())) {
    return '';
  }
  const offset = base.getTimezoneOffset();
  const local = new Date(base.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
};

const mostrarTabAdmin = (tab = 'productos') => {
  const existeTab = adminTabs.some(
    (btn) => btn.dataset.adminTab === tab && !btn.classList.contains('hidden')
  );
  let tabDestino = tab;

  if (!existeTab) {
    const cotizaDisponible = adminTabs.find(
      (btn) => btn.dataset.adminTab === 'cotizaciones' && !btn.classList.contains('hidden')
    );
    tabDestino = cotizaDisponible ? 'cotizaciones' : tab;
  }

  adminTabs.forEach((btn) => {
    const esActivo = btn.dataset.adminTab === tabDestino;
    btn.classList.toggle('active', esActivo);
  });

  adminSections.forEach((section) => {
    const coincide = section.dataset.adminSection === tabDestino;
    section.classList.toggle('hidden', !coincide);
  });
};

const tabsSoloAdmin = ['productos', 'configuracion', 'usuarios', 'compras', 'gastos', 'ventas', 'analisis', 'cuadres', 'historial'];
const tabsSoloSuperAdmin = ['negocios'];

const aplicarModulosUI = () => {
  const modulos = window.APP_MODULOS || DEFAULT_CONFIG_MODULOS;
  document.querySelectorAll('[data-modulo]').forEach((tab) => {
    const mod = tab.dataset.modulo;
    if (mod && modulos && modulos[mod] === false) {
      tab.style.display = 'none';
      if (tab.classList?.contains('kanm-tab')) {
        tab.classList.remove('active');
      }
    } else {
      tab.style.display = '';
    }
  });
};

const ocultarTabsNoPermitidos = () => {
  adminTabs.forEach((btn) => {
    if (!usuarioActual?.esSuperAdmin && tabsSoloSuperAdmin.includes(btn.dataset.adminTab)) {
      btn.classList.add('hidden');
      btn.setAttribute('tabindex', '-1');
      return;
    }

    if (usuarioActual?.rol === 'admin') {
      return;
    }

    if (tabsSoloAdmin.includes(btn.dataset.adminTab)) {
      btn.classList.add('hidden');
      btn.setAttribute('tabindex', '-1');
    }
  });

  adminSections.forEach((section) => {
    if (!usuarioActual?.esSuperAdmin && tabsSoloSuperAdmin.includes(section.dataset.adminSection)) {
      section.classList.add('hidden');
      return;
    }

    if (usuarioActual?.rol === 'admin') {
      return;
    }

    if (tabsSoloAdmin.includes(section.dataset.adminSection)) {
      section.classList.add('hidden');
    }
  });
};

const obtenerTabInicialAdmin = () => {
  if (typeof window !== 'undefined' && window.location?.pathname?.includes('/admin/cotizaciones')) {
    return 'cotizaciones';
  }
  if (usuarioActual?.rol && usuarioActual.rol !== 'admin') {
    return 'cotizaciones';
  }
  return 'productos';
};

const setMessage = (element, text, type = 'info') => {
  if (!element) return;
  element.textContent = text || '';
  element.dataset.type = text ? type : '';
};

const cerrarModalEliminar = () => {
  if (!modalEliminarOverlay) return;
  modalEliminarOverlay.classList.remove('is-visible');
  modalEliminarOverlay.hidden = true;
  modalEliminarEstado = null;
  if (modalEliminarPassword) {
    modalEliminarPassword.value = '';
  }
  setMessage(modalEliminarMensaje, '', 'info');
};

const abrirModalEliminar = ({ titulo, descripcion, endpoint, forzar = false, extraBody = {}, onSuccess }) => {
  if (!modalEliminarOverlay || !modalEliminarTitulo || !modalEliminarDescripcion) {
    return;
  }

  modalEliminarEstado = {
    endpoint,
    forzar,
    extraBody,
    onSuccess,
  };

  modalEliminarTitulo.textContent = titulo || 'Eliminar registro';
  modalEliminarDescripcion.textContent =
    descripcion || 'Esta acción es irreversible. Confirma la eliminación del registro seleccionado.';

  if (modalEliminarPassword) {
    modalEliminarPassword.value = '';
  }

  setMessage(modalEliminarMensaje, '', 'info');

  modalEliminarOverlay.hidden = false;
  requestAnimationFrame(() => {
    modalEliminarOverlay.classList.add('is-visible');
    setTimeout(() => {
      modalEliminarPassword?.focus();
    }, 60);
  });
};

const ejecutarEliminacionAdmin = async () => {
  if (!modalEliminarEstado || !modalEliminarOverlay) {
    return;
  }

  const password = modalEliminarPassword?.value?.trim();
  if (!password) {
    setMessage(modalEliminarMensaje, 'Ingresa la contraseña de administrador para continuar.', 'warning');
    return;
  }

  if (!modalEliminarEstado.endpoint) {
    setMessage(modalEliminarMensaje, 'No se ha definido la acción a ejecutar.', 'error');
    return;
  }

  const payload = {
    password,
    usuario: usuarioActual?.usuario || 'admin',
    rol: usuarioActual?.rol || 'admin',
    ...modalEliminarEstado.extraBody,
  };

  if (modalEliminarEstado.forzar) {
    payload.forzar = true;
  }

  if (modalEliminarConfirmar) {
    modalEliminarConfirmar.disabled = true;
    modalEliminarConfirmar.classList.add('is-loading');
  }

  try {
    const respuesta = await fetch(modalEliminarEstado.endpoint, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await respuesta.json();
    } catch (parseError) {
      data = {};
    }

    if (!respuesta.ok || (data && data.ok === false)) {
      const mensajeError = data?.error || 'No fue posible eliminar el registro.';
      setMessage(modalEliminarMensaje, mensajeError, 'error');
      return;
    }

    const callback = modalEliminarEstado.onSuccess;
    cerrarModalEliminar();
    if (typeof callback === 'function') {
      await Promise.resolve(callback(data));
    }
  } catch (error) {
    console.error('Error al eliminar registro administrativo:', error);
    setMessage(modalEliminarMensaje, 'Ocurrió un error al eliminar el registro.', 'error');
  } finally {
    if (modalEliminarConfirmar) {
      modalEliminarConfirmar.disabled = false;
      modalEliminarConfirmar.classList.remove('is-loading');
    }
  }
};

const limpiarFormularioProducto = () => {
  formProducto?.reset();
  if (inputProdId) inputProdId.value = '';
  if (inputProdActivo) inputProdActivo.checked = true;
  if (inputProdStockIndefinido) inputProdStockIndefinido.checked = false;
  if (inputProdStock) inputProdStock.disabled = false;
  refrescarUiStockIndefinido(false);
};

const esProductoStockIndefinido = (producto) => Number(producto?.stock_indefinido) === 1;

const refrescarUiStockIndefinido = (limpiarValor = false) => {
  const indefinido = inputProdStockIndefinido?.checked ?? false;
  if (inputProdStock) {
    inputProdStock.disabled = indefinido;
    if (indefinido && limpiarValor) {
      inputProdStock.value = '';
    }
  }
};


/* =====================
 * Productos de venta
 * ===================== */
const renderProductos = (lista) => {
  if (!productosLista) return;
  productosLista.innerHTML = '';

  if (!Array.isArray(lista) || lista.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'kanm-empty-message';
    vacio.textContent = 'No hay productos registrados.';
    productosLista.appendChild(vacio);
    return;
  }

  lista.forEach((producto) => {
    const activo = Number(producto.activo) === 1;
    const stockEsIndefinido = esProductoStockIndefinido(producto);
    const item = document.createElement('article');
    item.className = 'producto-item';

    const header = document.createElement('div');
    header.className = 'producto-item-header';

    const nombre = document.createElement('div');
    nombre.className = 'producto-nombre';
    nombre.textContent = producto.nombre;

    const precio = document.createElement('div');
    precio.className = 'producto-precio';
    precio.textContent = formatCurrency(producto.precio);

    header.appendChild(nombre);
    header.appendChild(precio);

    const detalle = document.createElement('div');
    detalle.className = 'producto-detalle';
    const stockTexto = stockEsIndefinido ? 'Indefinido' : Number(producto.stock ?? 0);
    detalle.innerHTML = `
      <span><strong>Stock:</strong> ${stockTexto}</span>
      <span><strong>Categoría:</strong> ${producto.categoria_nombre ?? 'Sin asignar'}</span>
      <span><strong>Estado:</strong> <span class="estado-pill ${
        activo ? '' : 'estado-inactivo'
      }">${activo ? 'Activo' : 'Inactivo'}</span></span>
    `;

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'kanm-button';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', async () => {
      if (inputProdId) inputProdId.value = producto.id;
      if (inputProdNombre) inputProdNombre.value = producto.nombre ?? '';
      if (inputProdPrecio) inputProdPrecio.value = producto.precio ?? '';
      if (inputProdStockIndefinido) inputProdStockIndefinido.checked = stockEsIndefinido;
      if (inputProdStock) inputProdStock.value = stockEsIndefinido ? '' : (producto.stock ?? '');
      refrescarUiStockIndefinido(false);
      if (inputProdCategoria) inputProdCategoria.value = producto.categoria_id ?? '';
      if (inputProdActivo) inputProdActivo.checked = activo;
      setMessage(mensajeProductos, `Editando producto: ${producto.nombre}`, 'info');
      inputProdNombre?.focus();
    });

    const footer = document.createElement('div');
    footer.className = 'producto-footer';
    footer.appendChild(botonEditar);

    item.appendChild(header);
    item.appendChild(detalle);
    item.appendChild(footer);
    productosLista.appendChild(item);
  });
};

const filtrarProductos = () => {
  const termino = (productosBuscarInput?.value || '').toLowerCase();
  const categoriaFiltro = filtroCategoriaProductos?.value || '';
  let lista = Array.isArray(productos) ? [...productos] : [];

  if (termino) {
    lista = lista.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(termino) ||
        p.categoria_nombre?.toLowerCase().includes(termino) ||
        String(p.id || '').includes(termino)
    );
  }

  if (categoriaFiltro) {
    const catId = Number(categoriaFiltro);
    lista = lista.filter((p) => Number(p.categoria_id) === catId);
  }

  renderProductos(lista);
};

const cargarProductos = async () => {
  try {
  const respuesta = await fetchConAutorizacion('/api/productos');
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener los productos');
    }
    const data = await respuesta.json();
    productos = Array.isArray(data) ? data : [];
    filtrarProductos();
  } catch (error) {
    console.error('Error al cargar productos:', error);
    setMessage(mensajeProductos, 'Error al cargar los productos.', 'error');
  }
};

productosBuscarInput?.addEventListener('input', () => filtrarProductos());
filtroCategoriaProductos?.addEventListener('change', () => filtrarProductos());
inputProdStockIndefinido?.addEventListener('change', () => refrescarUiStockIndefinido(true));
refrescarUiStockIndefinido(false);

const obtenerValoresProducto = () => {
  const nombre = inputProdNombre?.value.trim();
  const precio = parseFloat(inputProdPrecio?.value ?? '');
  const stockIndefinido = inputProdStockIndefinido?.checked ?? false;
  const stockValor = inputProdStock?.value.trim();
  const stock = stockIndefinido ? null : stockValor === '' ? 0 : parseFloat(stockValor);
  const categoriaValor = inputProdCategoria?.value || '';
  const categoriaId = categoriaValor === '' ? null : parseInt(categoriaValor, 10);
  const activo = inputProdActivo?.checked ?? true;

  return { nombre, precio, stock, categoriaId, activo, stockIndefinido };
};

const validarProducto = ({ nombre, precio, stock, stockIndefinido }) => {
  if (!nombre) {
    setMessage(mensajeProductos, 'El nombre del producto es obligatorio.', 'error');
    return false;
  }
  if (Number.isNaN(precio)) {
    setMessage(mensajeProductos, 'El precio del producto es obligatorio y debe ser numerico.', 'error');
    return false;
  }
  if (!stockIndefinido) {
    if (stock === null || Number.isNaN(stock) || stock < 0) {
      setMessage(mensajeProductos, 'El stock es obligatorio y debe ser mayor o igual a 0.', 'error');
      return false;
    }
  } else if (stock !== null && !Number.isNaN(stock)) {
    setMessage(mensajeProductos, 'No es necesario capturar stock cuando es indefinido.', 'warning');
    return false;
  }
  return true;
};

const setCategoriasOptions = (lista = []) => {
  cacheCategorias = lista;
  if (inputProdCategoria) {
    const valorActual = inputProdCategoria.value;
    inputProdCategoria.innerHTML = '<option value="">Selecciona</option>';
    lista.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nombre;
      inputProdCategoria.appendChild(opt);
    });
    if (valorActual) {
      inputProdCategoria.value = valorActual;
    }
  }
  if (filtroCategoriaProductos) {
    const valorFiltro = filtroCategoriaProductos.value;
    filtroCategoriaProductos.innerHTML = '<option value="">Todas las categorías</option>';
    lista.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nombre;
      filtroCategoriaProductos.appendChild(opt);
    });
    if (valorFiltro) {
      filtroCategoriaProductos.value = valorFiltro;
    }
  }
};

window.KANMActualizarCategorias = (lista) => {
  setCategoriasOptions(lista || []);
};

const cargarCategorias = async () => {
  try {
    const resp = await fetchConAutorizacion('/api/categorias?activos=1');
    const data = await resp.json();
    if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudo cargar categorías');
    setCategoriasOptions(data?.categorias || []);
  } catch (error) {
    console.error('Error al cargar categorías:', error);
  }
};

const crearProducto = async ({ nombre, precio, stock, categoriaId, stockIndefinido }) => {
  const body = { nombre, precio, stock_indefinido: stockIndefinido ? 1 : 0 };
  if (stockIndefinido) {
    body.stock = null;
  } else {
    const stockEnviar = Number.isNaN(stock) || stock === null ? 0 : stock;
    body.stock = stockEnviar;
  }
  if (categoriaId !== null && !Number.isNaN(categoriaId)) body.categoria_id = categoriaId;

  const respuesta = await fetchJsonAutorizado('/api/productos', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.error || 'No se pudo crear el producto');
  }

  return respuesta.json();
};

const actualizarProducto = async (id, { nombre, precio, stock, categoriaId, activo, stockIndefinido }) => {
  const body = {
    nombre,
    precio,
    categoria_id: categoriaId !== null && !Number.isNaN(categoriaId) ? categoriaId : null,
    activo: activo ? 1 : 0,
    stock_indefinido: stockIndefinido ? 1 : 0,
  };
  if (stockIndefinido) {
    body.stock = null;
  } else {
    const stockEnviar = Number.isNaN(stock) || stock === null ? 0 : stock;
    body.stock = stockEnviar;
  }

  const respuesta = await fetchJsonAutorizado(`/api/productos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.error || 'No se pudo actualizar el producto');
  }
};

/* =====================
 * Configuración de impuesto
 * ===================== */
const cargarImpuesto = async () => {
  if (!impuestoValorInput) return;
  try {
    setMessage(impuestoMensaje, '', 'info');
    const respuesta = await fetchConAutorizacion('/api/configuracion/impuesto');
    if (!respuesta.ok) {
      throw new Error('Error al obtener la configuración de impuesto');
    }
    const data = await respuesta.json();
    if (data.ok) {
      const valorNumerico = Number(data.valor);
      impuestoValorInput.value = Number.isNaN(valorNumerico) ? '' : valorNumerico;
      setMessage(impuestoMensaje, '', 'info');
    } else {
      setMessage(
        impuestoMensaje,
        data.error || 'No se pudo obtener la configuración de impuesto.',
        'error'
      );
    }
  } catch (error) {
    console.error('Error al cargar el impuesto:', error);
    setMessage(impuestoMensaje, 'Error al obtener la configuración de impuesto.', 'error');
  }
};

const guardarImpuesto = async () => {
  if (!impuestoValorInput) return;
  const valorTexto = impuestoValorInput.value.trim();
  const valorNumerico = parseFloat(valorTexto);
  if (valorTexto === '' || Number.isNaN(valorNumerico) || valorNumerico < 0) {
    setMessage(
      impuestoMensaje,
      'El valor del impuesto es obligatorio y debe ser un número mayor o igual a 0.',
      'error'
    );
    return;
  }

  try {
    setMessage(impuestoMensaje, '', 'info');
    if (impuestoGuardarBtn) {
      impuestoGuardarBtn.disabled = true;
      impuestoGuardarBtn.classList.add('is-loading');
    }

    const respuesta = await fetchJsonAutorizado('/api/configuracion/impuesto', {
      method: 'PUT',
      body: JSON.stringify({ valor: valorNumerico }),
    });

    const data = await respuesta.json().catch(() => ({ ok: false }));
    if (!respuesta.ok || !data.ok) {
      const mensaje = data.error || 'Error al guardar la configuración de impuesto.';
      setMessage(impuestoMensaje, mensaje, 'error');
      return;
    }

    impuestoValorInput.value = Number(data.valor);
    setMessage(impuestoMensaje, 'Impuesto actualizado correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar el impuesto:', error);
    setMessage(impuestoMensaje, 'Error al guardar la configuración de impuesto.', 'error');
  } finally {
    if (impuestoGuardarBtn) {
      impuestoGuardarBtn.disabled = false;
      impuestoGuardarBtn.classList.remove('is-loading');
    }
  }
};

/* =====================
 * Configuración de facturación
 * ===================== */
const pintarRango = (inicioInput, finInput, restanteEl, alertaEl, datos, umbral) => {
  if (inicioInput) inicioInput.value = datos?.inicio ?? '';
  if (finInput) finInput.value = datos?.fin ?? '';
  if (restanteEl) restanteEl.textContent = datos?.restante ?? '—';

  if (alertaEl) {
    if (datos?.alerta) {
      alertaEl.dataset.type = 'warning';
      alertaEl.textContent = `Alerta: quedan ${datos.restante ?? 0} comprobantes disponibles (umbral ${umbral}).`;
    } else {
      alertaEl.dataset.type = '';
      alertaEl.textContent = '';
    }
  }
};

const normalizarTelefonos = (valor) => {
  if (Array.isArray(valor)) {
    return valor.map((t) => String(t || '').trim()).filter(Boolean);
  }

  const texto = String(valor || '');
  return texto
    .split(/[|,/;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
};

const marcarFacturaDirty = () => {
  facturaConfigDirty = true;
};

const limpiarTelefonosUI = () => {
  if (facturaTelefonosContainer) {
    facturaTelefonosContainer.innerHTML = '';
  }
};

const crearFilaTelefono = (valor = '') => {
  const fila = document.createElement('div');
  fila.className = 'factura-telefono-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'kanm-input';
  input.placeholder = 'Ej. (809) 000-0000';
  input.value = valor;
  input.addEventListener('input', marcarFacturaDirty);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kanm-button ghost kanm-button--sm';
  btn.textContent = 'Quitar';
  btn.addEventListener('click', () => {
    fila.remove();
    if (!facturaTelefonosContainer?.children.length) {
      agregarTelefonoUI();
    }
    marcarFacturaDirty();
  });

  fila.appendChild(input);
  fila.appendChild(btn);
  return fila;
};

const agregarTelefonoUI = (valor = '') => {
  if (!facturaTelefonosContainer) return;
  facturaTelefonosContainer.appendChild(crearFilaTelefono(valor));
};

const setTelefonosUI = (telefonos = []) => {
  limpiarTelefonosUI();

  const lista = normalizarTelefonos(telefonos);

  if (!lista.length) {
    agregarTelefonoUI('');
    facturaConfigDirty = false;
    return;
  }

  lista.forEach((telefono) => agregarTelefonoUI(telefono));
  facturaConfigDirty = false;
};

const obtenerTelefonosUI = () => {
  if (!facturaTelefonosContainer) return [];
  const valores = Array.from(facturaTelefonosContainer.querySelectorAll('input'))
    .map((input) => input.value.trim())
    .filter(Boolean);

  return valores;
};

const registrarListenersFactura = () => {
  [
    facturaDireccionInput,
    facturaRncInput,
    facturaLogoInput,
    facturaPieInput,
    ncfB02InicioInput,
    ncfB02FinInput,
    ncfB01InicioInput,
    ncfB01FinInput,
  ].forEach((input) => {
    input?.addEventListener('input', marcarFacturaDirty);
    input?.addEventListener('change', marcarFacturaDirty);
  });

  facturaTelefonosContainer?.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement) {
      marcarFacturaDirty();
    }
  });
};

const cargarConfiguracionFactura = async (options = {}) => {
  const { force = false } = options;
  try {
    const respuesta = await fetchConAutorizacion('/api/configuracion/factura');
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener la configuración de facturación');
    }
    const data = await respuesta.json();
    if (!data.ok || !data.configuracion) {
      throw new Error(data.error || 'Error al obtener la configuración de facturación');
    }

    const { configuracion } = data;

    if (facturaConfigDirty && !force) {
      return;
    }
    setTelefonosUI(configuracion.telefonos || configuracion.telefono || '');
    if (facturaDireccionInput) facturaDireccionInput.value = configuracion.direccion || '';
    if (facturaRncInput) facturaRncInput.value = configuracion.rnc || '';
    if (facturaLogoInput) facturaLogoInput.value = configuracion.logo || '';
    if (facturaPieInput) facturaPieInput.value = configuracion.pie || '';

    pintarRango(ncfB02InicioInput, ncfB02FinInput, ncfB02Restante, ncfB02Alerta, configuracion.b02, 20);
    pintarRango(ncfB01InicioInput, ncfB01FinInput, ncfB01Restante, ncfB01Alerta, configuracion.b01, 5);

    facturaConfigDirty = false;
    setMessage(facturaMensaje, '');
  } catch (error) {
    console.error('Error al cargar configuración de factura:', error);
    setMessage(facturaMensaje, 'No se pudo cargar la configuración de facturación.', 'error');
  }
};

const guardarConfiguracionFactura = async () => {
  const payload = {
    telefono: obtenerTelefonosUI(),
    direccion: facturaDireccionInput?.value || '',
    rnc: facturaRncInput?.value || '',
    logo: facturaLogoInput?.value || '',
    pie: facturaPieInput?.value || '',
    b02_inicio: ncfB02InicioInput?.value || 1,
    b02_fin: ncfB02FinInput?.value || '',
    b01_inicio: ncfB01InicioInput?.value || 1,
    b01_fin: ncfB01FinInput?.value || '',
  };

  try {
    if (facturaGuardarBtn) {
      facturaGuardarBtn.disabled = true;
      facturaGuardarBtn.classList.add('is-loading');
    }

    const respuesta = await fetchJsonAutorizado('/api/configuracion/factura', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    const data = await respuesta.json().catch(() => ({ ok: false }));
    if (!respuesta.ok || !data.ok || !data.configuracion) {
      throw new Error(data.error || 'No se pudo guardar la configuración de factura');
    }

    const { configuracion } = data;
    setTelefonosUI(configuracion.telefonos || configuracion.telefono || '');
    pintarRango(ncfB02InicioInput, ncfB02FinInput, ncfB02Restante, ncfB02Alerta, configuracion.b02, 20);
    pintarRango(ncfB01InicioInput, ncfB01FinInput, ncfB01Restante, ncfB01Alerta, configuracion.b01, 5);
    facturaConfigDirty = false;
    setMessage(facturaMensaje, 'Configuración de factura guardada correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar configuración de factura:', error);
    setMessage(facturaMensaje, error.message || 'No se pudo guardar la configuración.', 'error');
  } finally {
    if (facturaGuardarBtn) {
      facturaGuardarBtn.disabled = false;
      facturaGuardarBtn.classList.remove('is-loading');
    }
  }
};

/* =====================
 * Gestión de usuarios
 * ===================== */
const ROLES_PERMITIDOS = ['mesera', 'cocina', 'bar', 'caja'];

const limpiarFormularioUsuario = () => {
  usuarioForm?.reset();
  if (usuarioIdInput) usuarioIdInput.value = '';
  if (usuarioRolInput) usuarioRolInput.value = usuariosRolSelect?.value || 'mesera';
  if (usuarioActivoInput) usuarioActivoInput.checked = true;
  setMessage(usuarioFormMensaje, '');
};

const renderUsuarios = (lista) => {
  if (!usuariosTablaBody) return;

  usuariosTablaBody.innerHTML = '';

  if (!lista.length) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 9;
    celda.textContent = 'No hay usuarios registrados para este rol.';
    fila.appendChild(celda);
    usuariosTablaBody.appendChild(fila);
    return;
  }

  const fragment = document.createDocumentFragment();

  lista.forEach((usuario) => {
    const fila = document.createElement('tr');

    const celdaId = document.createElement('td');
    celdaId.textContent = usuario.id;

    const celdaNombre = document.createElement('td');
    celdaNombre.textContent = usuario.nombre;

    const celdaUsuario = document.createElement('td');
    celdaUsuario.textContent = usuario.usuario;

    const celdaRol = document.createElement('td');
    celdaRol.textContent = usuario.rol;

    const celdaEstado = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = usuario.activo ? 'estado-pill' : 'estado-pill estado-inactivo';
    badge.textContent = usuario.activo ? 'Activo' : 'Inactivo';
    celdaEstado.appendChild(badge);

    const enLineaRaw = usuario.en_linea ?? usuario.enLinea;
    const enLinea =
      enLineaRaw === true ||
      enLineaRaw === 1 ||
      enLineaRaw === '1';
    const conectadoEn = usuario.conectado_en ?? usuario.conectadoEn ?? null;
    const desconectadoEn = enLinea ? null : usuario.desconectado_en ?? usuario.desconectadoEn ?? null;

    const celdaLinea = document.createElement('td');
    const badgeLinea = document.createElement('span');
    badgeLinea.className = enLinea ? 'estado-pill' : 'estado-pill estado-inactivo';
    badgeLinea.textContent = enLinea ? 'En linea' : 'Fuera';
    celdaLinea.appendChild(badgeLinea);

    const celdaConectado = document.createElement('td');
    celdaConectado.textContent = conectadoEn ? formatDateTime(conectadoEn) : '--';

    const celdaDesconectado = document.createElement('td');
    celdaDesconectado.textContent = desconectadoEn ? formatDateTime(desconectadoEn) : '--';

    const celdaAcciones = document.createElement('td');
    const contenedor = document.createElement('div');
    contenedor.className = 'kanm-actions';

    if (usuario.rol !== 'admin') {
      const btnEditar = document.createElement('button');
      btnEditar.type = 'button';
      btnEditar.className = 'kanm-button secondary';
      btnEditar.textContent = 'Editar';
      btnEditar.dataset.action = 'editar';
      btnEditar.dataset.id = usuario.id;
      contenedor.appendChild(btnEditar);

      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.className = 'kanm-button ghost';
      btnToggle.textContent = usuario.activo ? 'Desactivar' : 'Activar';
      btnToggle.dataset.action = 'toggle';
      btnToggle.dataset.id = usuario.id;
      btnToggle.dataset.activo = usuario.activo ? '1' : '0';
      contenedor.appendChild(btnToggle);

      const btnEliminar = document.createElement('button');
      btnEliminar.type = 'button';
      btnEliminar.className = 'kanm-button ghost-danger';
      btnEliminar.textContent = 'Eliminar';
      btnEliminar.dataset.action = 'eliminar';
      btnEliminar.dataset.id = usuario.id;
      contenedor.appendChild(btnEliminar);
    }

    celdaAcciones.appendChild(contenedor);

    fila.appendChild(celdaId);
    fila.appendChild(celdaNombre);
    fila.appendChild(celdaUsuario);
    fila.appendChild(celdaRol);
    fila.appendChild(celdaEstado);
    fila.appendChild(celdaLinea);
    fila.appendChild(celdaConectado);
    fila.appendChild(celdaDesconectado);
    fila.appendChild(celdaAcciones);

    fragment.appendChild(fila);
  });

  usuariosTablaBody.appendChild(fragment);
};

const cargarUsuarios = async (rolSeleccionado) => {
  if (!usuariosRolSelect) return;

  const rol = rolSeleccionado || usuariosRolSelect.value || '';
  const query = rol ? `?rol=${encodeURIComponent(rol)}` : '';

  try {
    const respuesta = await fetchConAutorizacion(`/api/usuarios${query}`);
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener los usuarios');
    }
    const data = await respuesta.json();
    usuarios = Array.isArray(data) ? data : [];
    renderUsuarios(usuarios);
    setMessage(usuariosMensaje, '');
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
    setMessage(usuariosMensaje, 'No se pudieron cargar los usuarios.', 'error');
  }
};

const obtenerDatosFormularioUsuario = () => {
  const id = usuarioIdInput?.value || '';
  const nombre = usuarioNombreInput?.value.trim();
  const usuario = usuarioUsuarioInput?.value.trim();
  const password = usuarioPasswordInput?.value.trim();
  const rol = usuarioRolInput?.value;
  const activo = usuarioActivoInput?.checked ?? true;

  return { id, nombre, usuario, password, rol, activo };
};

const validarFormularioUsuario = ({ nombre, usuario, password, rol }, esEdicion) => {
  if (!nombre) {
    setMessage(usuarioFormMensaje, 'El nombre es obligatorio.', 'error');
    return false;
  }

  if (!usuario) {
    setMessage(usuarioFormMensaje, 'El usuario es obligatorio.', 'error');
    return false;
  }

  if (!esEdicion && !password) {
    setMessage(usuarioFormMensaje, 'La contraseña es obligatoria para crear usuarios.', 'error');
    return false;
  }

  if (!ROLES_PERMITIDOS.includes(rol)) {
    setMessage(usuarioFormMensaje, 'Selecciona un rol válido (mesera, cocina o caja).', 'error');
    return false;
  }

  return true;
};

const guardarUsuario = async () => {
  const { id, nombre, usuario, password, rol, activo } = obtenerDatosFormularioUsuario();
  const esEdicion = Boolean(id);

  if (!validarFormularioUsuario({ nombre, usuario, password, rol }, esEdicion)) {
    return;
  }

  const body = { nombre, usuario, rol, activo: activo ? 1 : 0 };
  if (password) {
    body.password = password;
  }

  try {
    if (esEdicion) {
      /* eslint-disable-next-line no-underscore-dangle */
      const respuesta = await fetchJsonAutorizado(`/api/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      if (!respuesta.ok) {
        const error = await respuesta.json().catch(() => ({}));
        throw new Error(error.error || 'No se pudo actualizar el usuario');
      }
    } else {
      body.password = password; // obligatorio en creación
      const respuesta = await fetchJsonAutorizado('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!respuesta.ok) {
        const error = await respuesta.json().catch(() => ({}));
        throw new Error(error.error || 'No se pudo crear el usuario');
      }
    }

    setMessage(usuarioFormMensaje, 'Usuario guardado correctamente.', 'success');
    await cargarUsuarios(usuariosRolSelect?.value);
    limpiarFormularioUsuario();
  } catch (error) {
    console.error('Error al guardar usuario:', error);
    setMessage(usuarioFormMensaje, error.message || 'No se pudo guardar el usuario.', 'error');
  }
};

const cambiarEstadoUsuario = async (id, activo) => {
  try {
    const respuesta = await fetchJsonAutorizado(`/api/usuarios/${id}/activar`, {
      method: 'PUT',
      body: JSON.stringify({ activo }),
    });

    if (!respuesta.ok) {
      const error = await respuesta.json().catch(() => ({}));
      throw new Error(error.error || 'No se pudo actualizar el estado del usuario');
    }

    await cargarUsuarios(usuariosRolSelect?.value);
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    setMessage(usuariosMensaje, error.message || 'No se pudo actualizar el usuario.', 'error');
  }
};

const eliminarUsuario = async (id) => {
  const confirmar = window.confirm('¿Seguro que deseas eliminar este usuario? Esta acción no se puede deshacer.');
  if (!confirmar) return;

  try {
    const respuesta = await fetchConAutorizacion(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (!respuesta.ok) {
      const data = await respuesta.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo eliminar el usuario');
    }
    setMessage(usuariosMensaje, 'Usuario eliminado correctamente.', 'success');
    await cargarUsuarios(usuariosRolSelect?.value);
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    setMessage(usuariosMensaje, error.message || 'No se pudo eliminar el usuario.', 'error');
  }
};

/* =====================
 * Compras y detalle manual
 * ===================== */
const crearFilaDetalle = (detalle = {}) => {
  const fila = document.createElement('div');
  fila.className = 'compra-detalle-row';

  const descripcion = document.createElement('input');
  descripcion.type = 'text';
  descripcion.placeholder = 'Descripcion del producto o servicio';
  descripcion.className = 'compra-detalle-descripcion';
  descripcion.value = detalle.descripcion ?? '';

  const cantidad = document.createElement('input');
  cantidad.type = 'number';
  cantidad.min = '0';
  cantidad.step = '0.01';
  cantidad.placeholder = 'Cantidad';
  cantidad.className = 'compra-detalle-cantidad';
  cantidad.value = detalle.cantidad ?? '';

  const precio = document.createElement('input');
  precio.type = 'number';
  precio.min = '0';
  precio.step = '0.01';
  precio.placeholder = 'Precio unitario';
  precio.className = 'compra-detalle-precio';
  precio.value = detalle.precio_unitario ?? '';

  const itbis = document.createElement('input');
  itbis.type = 'number';
  itbis.min = '0';
  itbis.step = '0.01';
  itbis.placeholder = 'ITBIS';
  itbis.className = 'compra-detalle-itbis';
  itbis.value = detalle.itbis ?? '';

  const total = document.createElement('input');
  total.type = 'number';
  total.min = '0';
  total.step = '0.01';
  total.placeholder = 'Total linea';
  total.className = 'compra-detalle-total';
  total.value = detalle.total ?? '';

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'kanm-button ghost';
  remover.textContent = 'Quitar';
  remover.addEventListener('click', () => {
    fila.remove();
  });

  fila.appendChild(descripcion);
  fila.appendChild(cantidad);
  fila.appendChild(precio);
  fila.appendChild(itbis);
  fila.appendChild(total);
  fila.appendChild(remover);

  return fila;
};

const obtenerDetallesCompra = () => {
  const filas = compraDetallesContainer?.querySelectorAll('.compra-detalle-row');
  if (!filas || filas.length === 0) return [];

  const detalles = [];
  filas.forEach((fila) => {
    const descripcionInput = fila.querySelector('.compra-detalle-descripcion');
    const cantidadInput = fila.querySelector('.compra-detalle-cantidad');
    const precioInput = fila.querySelector('.compra-detalle-precio');
    const itbisInput = fila.querySelector('.compra-detalle-itbis');
    const totalInput = fila.querySelector('.compra-detalle-total');

    const descripcion = descripcionInput?.value?.trim();
    if (!descripcion) return;

    const cantidadValor = cantidadInput?.value === '' ? null : Number(cantidadInput?.value ?? '');
    const precioValor = precioInput?.value === '' ? null : Number(precioInput?.value ?? '');
    const itbisValor = itbisInput?.value === '' ? null : Number(itbisInput?.value ?? '');
    const totalValor = totalInput?.value === '' ? null : Number(totalInput?.value ?? '');

    detalles.push({
      descripcion,
      cantidad: Number.isNaN(cantidadValor) ? null : cantidadValor,
      precio_unitario: Number.isNaN(precioValor) ? null : precioValor,
      itbis: Number.isNaN(itbisValor) ? null : itbisValor,
      total: Number.isNaN(totalValor) ? null : totalValor,
    });
  });

  return detalles;
};

const recalcularMontosCompra = () => {
  const detalles = obtenerDetallesCompra();
  const totalGravado = detalles.reduce((acumulado, detalle) => {
    const cantidad = Number(detalle.cantidad) || 0;
    const precio = Number(detalle.precio_unitario) || 0;
    const totalLinea = detalle.total !== null && detalle.total !== undefined ? Number(detalle.total) || 0 : cantidad * precio;
    return acumulado + totalLinea;
  }, 0);

  const impuestoCalculado = detalles.reduce((acumulado, detalle) => acumulado + (Number(detalle.itbis) || 0), 0);

  if (compraGravadoInput) compraGravadoInput.value = totalGravado.toFixed(2);
  if (compraImpuestoInput) compraImpuestoInput.value = impuestoCalculado.toFixed(2);

  const exento = Number(compraExentoInput?.value ?? 0) || 0;
  const total = totalGravado + impuestoCalculado + exento;
  if (compraTotalInput) compraTotalInput.value = total.toFixed(2);
};

const cargarCompras = async () => {
  try {
    setMessage(comprasMensaje, 'Cargando compras...', 'info');
    const respuesta = await fetchConAutorizacion('/api/compras');
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener las compras');
    }
    const data = await respuesta.json();
    compras = Array.isArray(data) ? data : [];
    renderCompras(compras);
    setMessage(comprasMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar compras:', error);
    setMessage(comprasMensaje, 'Error al cargar el historial de compras.', 'error');
  }
};

const renderCompras = (lista) => {
  if (!comprasTabla) return;
  comprasTabla.innerHTML = '';

  if (!lista || lista.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 6;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay compras registradas.';
    fila.appendChild(celda);
    comprasTabla.appendChild(fila);
    return;
  }

  lista.forEach((compra) => {
    const fila = document.createElement('tr');

    const cFecha = document.createElement('td');
    cFecha.textContent = formatDate(compra.fecha);

    const cProveedor = document.createElement('td');
    cProveedor.textContent = compra.proveedor;

    const cNcf = document.createElement('td');
    cNcf.textContent = compra.ncf || '—';

    const cGravado = document.createElement('td');
    cGravado.textContent = formatCurrency(compra.monto_gravado ?? 0);

    const cImpuesto = document.createElement('td');
    cImpuesto.textContent = formatCurrency(compra.impuesto ?? 0);

    const cTotal = document.createElement('td');
    cTotal.textContent = formatCurrency(compra.total ?? 0);

    fila.appendChild(cFecha);
    fila.appendChild(cProveedor);
    fila.appendChild(cNcf);
    fila.appendChild(cGravado);
    fila.appendChild(cImpuesto);
    fila.appendChild(cTotal);
    comprasTabla.appendChild(fila);
  });
};

const registrarCompra = async (payload) => {
  const respuesta = await fetchJsonAutorizado('/api/compras', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.error || 'No se pudo registrar la compra');
  }
};

/* =====================
 * Gastos
 * ===================== */
const GASTOS_CATEGORIAS_SUGERIDAS = [
  'Alquiler',
  'Nomina',
  'Luz',
  'Gas',
  'Compras',
  'Marketing',
  'Transporte',
  'Mantenimiento',
  'Servicios',
];

const actualizarDatalistGastos = (extraCategorias = []) => {
  if (!gastosCategoriasList) return;
  const categorias = new Set();
  GASTOS_CATEGORIAS_SUGERIDAS.forEach((cat) => categorias.add(cat));
  extraCategorias.forEach((cat) => {
    const limpio = (cat || '').toString().trim();
    if (limpio) categorias.add(limpio);
  });
  gastosCategoriasList.innerHTML = '';
  categorias.forEach((cat) => {
    const option = document.createElement('option');
    option.value = cat;
    gastosCategoriasList.appendChild(option);
  });
};

const refrescarFrecuenciaGasto = (limpiar = false) => {
  const activo = gastoRecurrenteInput?.checked ?? false;
  if (gastoFrecuenciaInput) {
    gastoFrecuenciaInput.disabled = !activo;
    if (!activo && limpiar) {
      gastoFrecuenciaInput.value = '';
    }
  }
};

const limpiarFormularioGasto = () => {
  gastoForm?.reset();
  if (gastoIdInput) gastoIdInput.value = '';
  if (gastoMonedaInput) gastoMonedaInput.value = 'DOP';
  if (gastoRecurrenteInput) gastoRecurrenteInput.checked = false;
  if (gastoFechaInput) {
    gastoFechaInput.value = getLocalDateISO(new Date());
  }
  refrescarFrecuenciaGasto(true);
  setMessage(gastoMensaje, '', 'info');
};

const cargarGastoEnFormulario = (gasto) => {
  if (!gasto) return;
  if (gastoIdInput) gastoIdInput.value = gasto.id;
  if (gastoFechaInput) gastoFechaInput.value = (gasto.fecha || '').slice(0, 10);
  if (gastoMontoInput) gastoMontoInput.value = gasto.monto ?? '';
  if (gastoMonedaInput) gastoMonedaInput.value = gasto.moneda || 'DOP';
  if (gastoCategoriaInput) gastoCategoriaInput.value = gasto.categoria ?? '';
  if (gastoMetodoInput) gastoMetodoInput.value = gasto.metodo_pago ?? '';
  if (gastoProveedorInput) gastoProveedorInput.value = gasto.proveedor ?? '';
  if (gastoDescripcionInput) gastoDescripcionInput.value = gasto.descripcion ?? '';
  if (gastoNcfInput) gastoNcfInput.value = gasto.comprobante_ncf ?? '';
  if (gastoReferenciaInput) gastoReferenciaInput.value = gasto.referencia ?? '';
  if (gastoRecurrenteInput) gastoRecurrenteInput.checked = Number(gasto.es_recurrente) === 1;
  if (gastoFrecuenciaInput) gastoFrecuenciaInput.value = gasto.frecuencia ?? '';
  if (gastoTagsInput) gastoTagsInput.value = gasto.tags ?? '';
  refrescarFrecuenciaGasto(false);
  setMessage(gastoMensaje, `Editando gasto #${gasto.id}`, 'info');
};

const obtenerValoresGasto = () => {
  const fecha = gastoFechaInput?.value;
  const monto = parseFloat(gastoMontoInput?.value ?? '');
  const moneda = gastoMonedaInput?.value || 'DOP';
  const categoria = gastoCategoriaInput?.value.trim();
  const metodo_pago = gastoMetodoInput?.value || '';
  const proveedor = gastoProveedorInput?.value.trim();
  const descripcion = gastoDescripcionInput?.value.trim();
  const comprobante_ncf = gastoNcfInput?.value.trim();
  const referencia = gastoReferenciaInput?.value.trim();
  const es_recurrente = gastoRecurrenteInput?.checked ?? false;
  const frecuencia = gastoFrecuenciaInput?.value || '';
  const tags = gastoTagsInput?.value.trim();

  return {
    fecha,
    monto,
    moneda,
    categoria,
    metodo_pago,
    proveedor,
    descripcion,
    comprobante_ncf,
    referencia,
    es_recurrente,
    frecuencia,
    tags,
  };
};

const validarGasto = (gasto) => {
  if (!gasto.fecha) {
    setMessage(gastoMensaje, 'La fecha es obligatoria.', 'error');
    return false;
  }
  if (!Number.isFinite(gasto.monto) || gasto.monto <= 0) {
    setMessage(gastoMensaje, 'El monto debe ser mayor a 0.', 'error');
    return false;
  }
  if (gasto.es_recurrente && !gasto.frecuencia) {
    setMessage(gastoMensaje, 'Selecciona la frecuencia del gasto recurrente.', 'error');
    return false;
  }
  return true;
};

const renderResumenGastos = (resumen) => {
  if (gastosResumenTotal) gastosResumenTotal.textContent = formatCurrency(resumen?.total ?? 0);
  if (gastosResumenPromedio) gastosResumenPromedio.textContent = formatCurrency(resumen?.promedio_diario ?? 0);
  if (!gastosResumenTop) return;

  gastosResumenTop.innerHTML = '';
  const top = resumen?.top_categorias || [];
  if (!top.length) {
    gastosResumenTop.textContent = 'Sin datos';
    return;
  }
  top.forEach((item) => {
    const tag = document.createElement('span');
    tag.className = 'gastos-tag';
    tag.textContent = `${item.categoria}: ${formatCurrency(item.total)}`;
    gastosResumenTop.appendChild(tag);
  });
};

const renderGastosTabla = (lista) => {
  if (!gastosTabla) return;
  gastosTabla.innerHTML = '';

  if (!Array.isArray(lista) || lista.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 8;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay gastos registrados.';
    fila.appendChild(celda);
    gastosTabla.appendChild(fila);
    return;
  }

  lista.forEach((gasto) => {
    const fila = document.createElement('tr');

    const cFecha = document.createElement('td');
    cFecha.textContent = formatDate(gasto.fecha);

    const cCategoria = document.createElement('td');
    cCategoria.textContent = gasto.categoria || '--';

    const cMetodo = document.createElement('td');
    cMetodo.textContent = gasto.metodo_pago || '--';

    const cProveedor = document.createElement('td');
    cProveedor.textContent = gasto.proveedor || '--';

    const cMonto = document.createElement('td');
    cMonto.textContent = formatCurrency(gasto.monto ?? 0);

    const cNcf = document.createElement('td');
    cNcf.textContent = gasto.comprobante_ncf || '--';

    const cRecurrente = document.createElement('td');
    cRecurrente.textContent = Number(gasto.es_recurrente) === 1 ? 'Si' : 'No';

    const cAcciones = document.createElement('td');
    cAcciones.className = 'acciones-inline';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'kanm-button ghost';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => cargarGastoEnFormulario(gasto));

    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'kanm-button ghost';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', async () => {
      const confirmar = window.confirm('Seguro que deseas eliminar este gasto?');
      if (!confirmar) return;
      try {
        await eliminarGasto(gasto.id);
      } catch (error) {
        console.error('Error al eliminar gasto:', error);
        setMessage(gastosMensajeLista, error.message || 'No se pudo eliminar el gasto.', 'error');
      }
    });

    cAcciones.appendChild(btnEditar);
    cAcciones.appendChild(btnEliminar);

    fila.appendChild(cFecha);
    fila.appendChild(cCategoria);
    fila.appendChild(cMetodo);
    fila.appendChild(cProveedor);
    fila.appendChild(cMonto);
    fila.appendChild(cNcf);
    fila.appendChild(cRecurrente);
    fila.appendChild(cAcciones);
    gastosTabla.appendChild(fila);
  });
};

const cargarGastos = async () => {
  try {
    setMessage(gastosMensajeLista, 'Cargando gastos...', 'info');
    const params = new URLSearchParams();
    if (gastosDesdeInput?.value) params.set('from', gastosDesdeInput.value);
    if (gastosHastaInput?.value) params.set('to', gastosHastaInput.value);
    if (gastosCategoriaFiltroInput?.value) params.set('categoria', gastosCategoriaFiltroInput.value.trim());
    if (gastosMetodoFiltroInput?.value) params.set('metodo_pago', gastosMetodoFiltroInput.value);
    if (gastosBuscarInput?.value) params.set('q', gastosBuscarInput.value.trim());
    params.set('page', '1');
    params.set('limit', '200');

    const respuesta = await fetchConAutorizacion(`/api/admin/gastos?${params.toString()}`);
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener los gastos');
    }
    const data = await respuesta.json();
    gastos = Array.isArray(data.gastos) ? data.gastos : [];
    renderGastosTabla(gastos);
    renderResumenGastos(data.resumen || {});

    const categoriasExtra = gastos.map((gasto) => gasto.categoria).filter(Boolean);
    actualizarDatalistGastos(categoriasExtra);
    setMessage(gastosMensajeLista, '', 'info');
  } catch (error) {
    console.error('Error al cargar gastos:', error);
    setMessage(gastosMensajeLista, 'Error al cargar los gastos.', 'error');
  }
};

const guardarGasto = async (payload, id = null) => {
  const endpoint = id ? `/api/admin/gastos/${id}` : '/api/admin/gastos';
  const respuesta = await fetchJsonAutorizado(endpoint, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.error || 'No se pudo guardar el gasto');
  }
};

const eliminarGasto = async (id) => {
  const respuesta = await fetchConAutorizacion(`/api/admin/gastos/${id}`, { method: 'DELETE' });
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.error || 'No se pudo eliminar el gasto');
  }
  if (gastoIdInput?.value && Number(gastoIdInput.value) === Number(id)) {
    limpiarFormularioGasto();
  }
  await cargarGastos();
};

/* =====================
 * Reportes DGII 607 y 606
 * ===================== */
const obtenerMesActual = () => {
  const hoy = new Date();
  const anio = String(hoy.getFullYear());
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return { anio, mes, valor: `${anio}-${mes}` };
};

const asegurarMesSeleccionado = (input) => {
  if (!input) return null;
  const valor = input.value;
  if (valor && /\d{4}-\d{2}/.test(valor)) {
    const [anio, mes] = valor.split('-');
    return { anio, mes };
  }
  const mesActual = obtenerMesActual();
  input.value = mesActual.valor;
  return { anio: mesActual.anio, mes: mesActual.mes };
};

const obtenerParametrosMes = (input) => {
  if (!input) return null;
  const valor = input.value;
  if (valor && /\d{4}-\d{2}/.test(valor)) {
    const [anio, mes] = valor.split('-');
    return { anio, mes };
  }
  return null;
};

const renderReporte607 = () => {
  if (!reporte607Tabla) return;
  reporte607Tabla.innerHTML = '';

  if (!datosReporte607.length) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 11;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay ventas registradas en el período seleccionado.';
    fila.appendChild(celda);
    reporte607Tabla.appendChild(fila);
    reporte607TotalSpan.textContent = '0';
    reporte607MontoSpan.textContent = formatCurrency(0);
    return;
  }

  datosReporte607.forEach((filaDato) => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${formatDate(filaDato.fecha_factura)}</td>
      <td>${filaDato.ncf || '—'}</td>
      <td>${filaDato.cliente}</td>
      <td>${filaDato.cliente_documento}</td>
      <td>${filaDato.tipo_comprobante}</td>
      <td>${formatCurrency(filaDato.monto_gravado)}</td>
      <td>${formatCurrency(filaDato.impuesto)}</td>
      <td>${formatCurrency(filaDato.descuento)}</td>
      <td>${formatCurrency(filaDato.propina)}</td>
      <td>${formatCurrency(filaDato.total)}</td>
    `;
    reporte607Tabla.appendChild(fila);
  });

  reporte607TotalSpan.textContent = String(datosReporte607.length);
  const totalMes = datosReporte607.reduce((acc, item) => acc + (item.total || 0), 0);
  reporte607MontoSpan.textContent = formatCurrency(totalMes);
};

const consultarReporte607 = async (mostrarCarga = true) => {
  let parametros = obtenerParametrosMes(reporte607MesInput);
  if (!parametros) {
    parametros = asegurarMesSeleccionado(reporte607MesInput);
    if (mostrarCarga) {
      setMessage(reporte607Mensaje, 'Selecciona un mes para consultar el reporte.', 'warning');
    }
    if (!parametros) {
      return false;
    }
  }

  try {
    if (mostrarCarga) {
      setMessage(reporte607Mensaje, 'Generando reporte 607...', 'info');
    }
    const respuesta = await fetchConAutorizacion(
      `/api/reportes/607?anio=${parametros.anio}&mes=${parametros.mes}`
    );
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el reporte 607');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'Error al generar el reporte 607');
    }
    datosReporte607 = Array.isArray(data.data) ? data.data : [];
    renderReporte607();
    setMessage(reporte607Mensaje, '', 'info');
    return true;
  } catch (error) {
    console.error('Error al consultar reporte 607:', error);
    setMessage(reporte607Mensaje, error.message || 'Error al generar el reporte 607.', 'error');
    datosReporte607 = [];
    renderReporte607();
    return false;
  }
};

const exportarReporte607 = async () => {
  let parametros = obtenerParametrosMes(reporte607MesInput);
  if (!parametros) {
    parametros = asegurarMesSeleccionado(reporte607MesInput);
    if (!parametros) {
      setMessage(reporte607Mensaje, 'Selecciona un mes antes de exportar.', 'warning');
      return;
    }
  }

  try {
    const respuesta = await fetchConAutorizacion(
      `/api/reportes/607?anio=${parametros.anio}&mes=${parametros.mes}&formato=csv`
    );
    if (!respuesta.ok) {
      throw new Error('No se pudo exportar el reporte 607');
    }
    const contenido = await respuesta.text();
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `reporte_607_${parametros.anio}-${parametros.mes}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  } catch (error) {
    console.error('Error al exportar reporte 607:', error);
    setMessage(reporte607Mensaje, 'No fue posible exportar el reporte 607.', 'error');
  }
};

const renderReporte606 = () => {
  if (!reporte606Tabla) return;
  reporte606Tabla.innerHTML = '';

  if (!datosReporte606.length) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 9;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay compras registradas en el período seleccionado.';
    fila.appendChild(celda);
    reporte606Tabla.appendChild(fila);
    reporte606TotalSpan.textContent = '0';
    reporte606MontoSpan.textContent = formatCurrency(0);
    return;
  }

  datosReporte606.forEach((filaDato) => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${formatDate(filaDato.fecha)}</td>
      <td>${filaDato.proveedor}</td>
      <td>${filaDato.rnc || '—'}</td>
      <td>${filaDato.tipo_comprobante || '—'}</td>
      <td>${filaDato.ncf || '—'}</td>
      <td>${formatCurrency(filaDato.monto_gravado)}</td>
      <td>${formatCurrency(filaDato.impuesto)}</td>
      <td>${formatCurrency(filaDato.monto_exento)}</td>
      <td>${formatCurrency(filaDato.total)}</td>
    `;
    reporte606Tabla.appendChild(fila);
  });

  reporte606TotalSpan.textContent = String(datosReporte606.length);
  const totalMes = datosReporte606.reduce((acc, item) => acc + (item.total || 0), 0);
  reporte606MontoSpan.textContent = formatCurrency(totalMes);
};

const consultarReporte606 = async (mostrarCarga = true) => {
  let parametros = obtenerParametrosMes(reporte606MesInput);
  if (!parametros) {
    parametros = asegurarMesSeleccionado(reporte606MesInput);
    if (mostrarCarga) {
      setMessage(reporte606Mensaje, 'Selecciona un mes para consultar el reporte.', 'warning');
    }
    if (!parametros) {
      return false;
    }
  }

  try {
    if (mostrarCarga) {
      setMessage(reporte606Mensaje, 'Generando reporte 606...', 'info');
    }
    const respuesta = await fetchConAutorizacion(
      `/api/reportes/606?anio=${parametros.anio}&mes=${parametros.mes}`
    );
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el reporte 606');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'Error al generar el reporte 606');
    }
    datosReporte606 = Array.isArray(data.data) ? data.data : [];
    renderReporte606();
    setMessage(reporte606Mensaje, '', 'info');
    return true;
  } catch (error) {
    console.error('Error al consultar reporte 606:', error);
    setMessage(reporte606Mensaje, error.message || 'Error al generar el reporte 606.', 'error');
    datosReporte606 = [];
    renderReporte606();
    return false;
  }
};

const exportarReporte606 = async () => {
  let parametros = obtenerParametrosMes(reporte606MesInput);
  if (!parametros) {
    parametros = asegurarMesSeleccionado(reporte606MesInput);
    if (!parametros) {
      setMessage(reporte606Mensaje, 'Selecciona un mes antes de exportar.', 'warning');
      return;
    }
  }

  try {
    const respuesta = await fetchConAutorizacion(
      `/api/reportes/606?anio=${parametros.anio}&mes=${parametros.mes}&formato=csv`
    );
    if (!respuesta.ok) {
      throw new Error('No se pudo exportar el reporte 606');
    }
    const contenido = await respuesta.text();
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `reporte_606_${parametros.anio}-${parametros.mes}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  } catch (error) {
    console.error('Error al exportar reporte 606:', error);
    setMessage(reporte606Mensaje, 'No fue posible exportar el reporte 606.', 'error');
  }
};

/* =====================
 * Analisis
 * ===================== */
const establecerRangoAnalisis = (desde, hasta) => {
  if (analisisDesdeInput) analisisDesdeInput.value = desde;
  if (analisisHastaInput) analisisHastaInput.value = hasta;
};

const obtenerRangoMes = (offset = 0) => {
  const base = new Date();
  const inicio = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const fin = new Date(base.getFullYear(), base.getMonth() + offset + 1, 0);
  return {
    desde: getLocalDateISO(inicio),
    hasta: getLocalDateISO(fin),
  };
};

const aplicarRangoAnalisis = (tipo) => {
  const hoy = new Date();
  if (tipo === 'hoy') {
    const valor = getLocalDateISO(hoy);
    establecerRangoAnalisis(valor, valor);
    cargarAnalisis();
    return;
  }

  if (tipo === '7d' || tipo === '30d') {
    const dias = tipo === '7d' ? 7 : 30;
    const inicio = new Date(hoy.getTime());
    inicio.setDate(inicio.getDate() - (dias - 1));
    establecerRangoAnalisis(getLocalDateISO(inicio), getLocalDateISO(hoy));
    cargarAnalisis();
    return;
  }

  if (tipo === 'mes') {
    const rango = obtenerRangoMes(0);
    establecerRangoAnalisis(rango.desde, rango.hasta);
    cargarAnalisis();
    return;
  }

  if (tipo === 'mes-anterior') {
    const rango = obtenerRangoMes(-1);
    establecerRangoAnalisis(rango.desde, rango.hasta);
    cargarAnalisis();
  }
};

const renderRankingList = (container, items, formatter) => {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanm-empty-message';
    empty.textContent = 'Sin datos';
    container.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const data = formatter(item, index);
    const row = document.createElement('div');
    row.className = 'analisis-ranking-item';

    const pos = document.createElement('span');
    pos.className = 'ranking-pos';
    pos.textContent = String(index + 1);

    const label = document.createElement('span');
    label.className = 'ranking-nombre';
    label.textContent = data.label;

    const value = document.createElement('span');
    value.className = 'ranking-valor';
    value.textContent = data.value;

    row.appendChild(pos);
    row.appendChild(label);
    row.appendChild(value);
    container.appendChild(row);
  });
};

const renderAlertasAnalisis = (alertas) => {
  if (!analisisAlertas) return;
  analisisAlertas.innerHTML = '';
  if (!Array.isArray(alertas) || alertas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanm-empty-message';
    empty.textContent = 'Sin alertas para este periodo.';
    analisisAlertas.appendChild(empty);
    return;
  }

  alertas.forEach((alerta) => {
    const item = document.createElement('div');
    const nivel = alerta?.nivel || 'info';
    item.className = `analisis-alerta analisis-alerta--${nivel}`;
    item.textContent = alerta?.mensaje || 'Alerta';
    analisisAlertas.appendChild(item);
  });
};

const renderDelta = (element, porcentaje) => {
  if (!element) return;
  element.textContent = '';
  element.classList.remove('delta-positive', 'delta-negative', 'delta-neutral');
  if (porcentaje === null || porcentaje === undefined) {
    return;
  }
  const valor = Number(porcentaje) * 100;
  const signo = valor > 0 ? '+' : '';
  element.textContent = `${signo}${valor.toFixed(1)}% vs periodo anterior`;
  element.classList.add(valor > 0 ? 'delta-positive' : valor < 0 ? 'delta-negative' : 'delta-neutral');
};

const renderAnalisisSerie = (ventasSerie, gastosSerie) => {
  if (!analisisSerieBody) return;
  analisisSerieBody.innerHTML = '';

  const mapa = new Map();
  (ventasSerie || []).forEach((row) => {
    mapa.set(row.fecha, {
      fecha: row.fecha,
      ventas: Number(row.total) || 0,
      gastos: 0,
    });
  });
  (gastosSerie || []).forEach((row) => {
    const actual = mapa.get(row.fecha) || { fecha: row.fecha, ventas: 0, gastos: 0 };
    actual.gastos = Number(row.total) || 0;
    mapa.set(row.fecha, actual);
  });

  const serie = Array.from(mapa.values()).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!serie.length) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 4;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay datos para el periodo seleccionado.';
    fila.appendChild(celda);
    analisisSerieBody.appendChild(fila);
    return;
  }

  const maxValor = serie.reduce((max, item) => Math.max(max, item.ventas, item.gastos), 0);

  serie.forEach((item) => {
    const fila = document.createElement('tr');
    const ganancia = Number((item.ventas - item.gastos).toFixed(2));
    const ventasPct = maxValor > 0 ? Math.round((item.ventas / maxValor) * 100) : 0;
    const gastosPct = maxValor > 0 ? Math.round((item.gastos / maxValor) * 100) : 0;

    const cFecha = document.createElement('td');
    cFecha.textContent = formatDate(item.fecha);

    const cVentas = document.createElement('td');
    const barVentas = document.createElement('div');
    barVentas.className = 'analisis-bar analisis-bar--ventas';
    const barVentasFill = document.createElement('span');
    barVentasFill.style.width = `${ventasPct}%`;
    barVentas.appendChild(barVentasFill);
    const ventasLabel = document.createElement('span');
    ventasLabel.className = 'analisis-bar-label';
    ventasLabel.textContent = formatCurrency(item.ventas);
    cVentas.appendChild(barVentas);
    cVentas.appendChild(ventasLabel);

    const cGastos = document.createElement('td');
    const barGastos = document.createElement('div');
    barGastos.className = 'analisis-bar analisis-bar--gastos';
    const barGastosFill = document.createElement('span');
    barGastosFill.style.width = `${gastosPct}%`;
    barGastos.appendChild(barGastosFill);
    const gastosLabel = document.createElement('span');
    gastosLabel.className = 'analisis-bar-label';
    gastosLabel.textContent = formatCurrency(item.gastos);
    cGastos.appendChild(barGastos);
    cGastos.appendChild(gastosLabel);

    const cGanancia = document.createElement('td');
    cGanancia.textContent = formatCurrency(ganancia);

    fila.appendChild(cFecha);
    fila.appendChild(cVentas);
    fila.appendChild(cGastos);
    fila.appendChild(cGanancia);
    analisisSerieBody.appendChild(fila);
  });
};

const renderAnalisis = (data) => {
  if (!data) return;
  const ingresos = data.ingresos || {};
  const gastosData = data.gastos || {};
  const ganancias = data.ganancias || {};
  const comparacion = data.comparacion || {};

  if (analisisKpiVentas) analisisKpiVentas.textContent = formatCurrency(ingresos.total || 0);
  if (analisisKpiGastos) analisisKpiGastos.textContent = formatCurrency(gastosData.total || 0);
  if (analisisKpiGanancia) analisisKpiGanancia.textContent = formatCurrency(ganancias.neta || 0);
  if (analisisKpiMargen) {
    const margen = Number(ganancias.margen) || 0;
    analisisKpiMargen.textContent = `${(margen * 100).toFixed(1)}%`;
  }
  if (analisisKpiTicket) analisisKpiTicket.textContent = formatCurrency(ingresos.ticket_promedio || 0);
  if (analisisKpiVentasCount) analisisKpiVentasCount.textContent = String(ingresos.count || 0);

  renderDelta(analisisKpiVentasDelta, comparacion.ventas?.porcentaje);
  renderDelta(analisisKpiGastosDelta, comparacion.gastos?.porcentaje);
  renderDelta(analisisKpiGananciaDelta, comparacion.ganancia?.porcentaje);
  renderDelta(analisisKpiTicketDelta, comparacion.ticket_promedio?.porcentaje);

  renderAnalisisSerie(ingresos.serie_diaria || [], gastosData.serie_diaria || []);

  renderRankingList(analisisTopCantidad, data.rankings?.top_productos_cantidad || [], (item) => ({
    label: item.nombre || `Producto ${item.id}`,
    value: `${Number(item.cantidad) || 0} uds`,
  }));

  renderRankingList(analisisTopIngresos, data.rankings?.top_productos_ingresos || [], (item) => ({
    label: item.nombre || `Producto ${item.id}`,
    value: formatCurrency(item.ingresos || 0),
  }));

  renderRankingList(analisisBottomProductos, data.rankings?.bottom_productos || [], (item) => ({
    label: item.nombre || `Producto ${item.id}`,
    value: `${Number(item.cantidad) || 0} uds`,
  }));

  renderRankingList(analisisTopDias, data.rankings?.top_dias_semana || [], (item) => ({
    label: item.dia || 'Dia',
    value: formatCurrency(item.total || 0),
  }));

  renderRankingList(analisisTopHoras, data.rankings?.top_horas || [], (item) => ({
    label: item.hora !== undefined ? `${String(item.hora).padStart(2, '0')}:00` : 'Hora',
    value: formatCurrency(item.total || 0),
  }));

  renderRankingList(analisisTopDiasMes, data.rankings?.top_dias_mes || [], (item) => ({
    label: item.dia_mes !== undefined ? `Dia ${item.dia_mes}` : 'Dia',
    value: formatCurrency(item.total || 0),
  }));

  renderRankingList(analisisMetodosPago, [
    { label: 'Efectivo', value: formatCurrency(data.metodos_pago?.efectivo || 0) },
    { label: 'Tarjeta', value: formatCurrency(data.metodos_pago?.tarjeta || 0) },
    { label: 'Transferencia', value: formatCurrency(data.metodos_pago?.transferencia || 0) },
  ], (item) => ({ label: item.label, value: item.value }));

  renderRankingList(analisisTopCategorias, gastosData.top_categorias || [], (item) => ({
    label: item.categoria || 'Sin categoria',
    value: formatCurrency(item.total || 0),
  }));

  const recurrentes = gastosData.recurrentes || [];
  const montoRecurrente = recurrentes.find((r) => r.es_recurrente)?.total || 0;
  const montoNoRecurrente = recurrentes.find((r) => !r.es_recurrente)?.total || 0;
  renderRankingList(
    analisisGastosRecurrentes,
    [
      { label: 'Recurrentes', value: formatCurrency(montoRecurrente) },
      { label: 'No recurrentes', value: formatCurrency(montoNoRecurrente) },
    ],
    (item) => ({ label: item.label, value: item.value })
  );

  renderAlertasAnalisis(data.alertas || []);
};

const cargarAnalisis = async () => {
  if (!analisisDesdeInput || !analisisHastaInput) return;
  const desde = analisisDesdeInput.value;
  const hasta = analisisHastaInput.value;

  try {
    setMessage(analisisMensaje, 'Actualizando analisis...', 'info');
    const params = new URLSearchParams();
    if (desde) params.set('from', desde);
    if (hasta) params.set('to', hasta);
    const respuesta = await fetchConAutorizacion(`/api/admin/analytics/overview?${params.toString()}`);
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el analisis');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener el analisis');
    }
    renderAnalisis(data);
    setMessage(analisisMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar analisis:', error);
    setMessage(analisisMensaje, error.message || 'Error al cargar el analisis.', 'error');
  }
};

const renderCierresCaja = () => {
  if (!cierresTabla) return;
  cierresTabla.innerHTML = '';

  if (!cierresCaja.length) {
    setMessage(cierresMensaje, 'No hay cierres registrados en este rango de fechas.', 'info');
    return;
  }

  setMessage(cierresMensaje, '', 'info');

  const fragment = document.createDocumentFragment();

  cierresCaja.forEach((cierre) => {
    const fila = document.createElement('tr');
    const diferencia = Number(cierre.diferencia) || 0;
    const observacionesTexto = cierre.observaciones || '—';
    const observacionesReducidas =
      observacionesTexto.length > 60 ? `${observacionesTexto.slice(0, 57)}…` : observacionesTexto;

    const celdaFecha = document.createElement('td');
    celdaFecha.textContent = formatDate(cierre.fecha_operacion);
    fila.appendChild(celdaFecha);

    const celdaHora = document.createElement('td');
    celdaHora.textContent = formatDateTime(cierre.fecha_cierre);
    fila.appendChild(celdaHora);

    const celdaUsuario = document.createElement('td');
    celdaUsuario.textContent = cierre.usuario || '—';
    fila.appendChild(celdaUsuario);

    const celdaSistema = document.createElement('td');
    celdaSistema.textContent = formatCurrency(cierre.total_sistema);
    fila.appendChild(celdaSistema);

    const celdaDeclarado = document.createElement('td');
    celdaDeclarado.textContent = formatCurrency(cierre.total_declarado);
    fila.appendChild(celdaDeclarado);

    const celdaDiferencia = document.createElement('td');
    const spanDiferencia = document.createElement('span');
    spanDiferencia.className = 'cuadre-diferencia';
    spanDiferencia.dataset.sign =
      diferencia > 0 ? 'positivo' : diferencia < 0 ? 'negativo' : 'neutral';
    spanDiferencia.textContent = formatCurrencySigned(diferencia);
    celdaDiferencia.appendChild(spanDiferencia);
    fila.appendChild(celdaDiferencia);

    const celdaObservaciones = document.createElement('td');
    celdaObservaciones.textContent = observacionesReducidas;
    if (observacionesTexto && observacionesTexto !== observacionesReducidas) {
      celdaObservaciones.title = observacionesTexto;
    }
    fila.appendChild(celdaObservaciones);

    const celdaAcciones = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'kanm-actions';

    const botonDetalle = document.createElement('button');
    botonDetalle.type = 'button';
    botonDetalle.className = 'kanm-button secondary';
    botonDetalle.textContent = 'Ver detalle';
    botonDetalle.dataset.detalleCierre = cierre.id;
    acciones.appendChild(botonDetalle);

    if (puedeImprimirCierres()) {
      const botonImprimir = document.createElement('button');
      botonImprimir.type = 'button';
      botonImprimir.className = 'kanm-button';
      botonImprimir.textContent = 'Imprimir PDF';
      botonImprimir.dataset.imprimirCierre = cierre.id;
      acciones.appendChild(botonImprimir);
    }

    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'kanm-button ghost-danger';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.dataset.eliminarCierre = cierre.id;
    acciones.appendChild(botonEliminar);

    celdaAcciones.appendChild(acciones);
    fila.appendChild(celdaAcciones);

    fragment.appendChild(fila);
  });

  cierresTabla.appendChild(fragment);
};

const renderDetalleCierre = (pedidos, cierreId) => {
  if (!cierresDetalleTabla || !cierresDetalleWrapper) return;

  detalleCierreActivo = cierreId;
  cierresDetalleTabla.innerHTML = '';

  if (!pedidos.length) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 4;
    celda.textContent = 'El cierre no tiene pedidos asociados.';
    fila.appendChild(celda);
    cierresDetalleTabla.appendChild(fila);
    cierresDetalleWrapper.hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  pedidos.forEach((pedido) => {
    const fila = document.createElement('tr');

    const celdaId = document.createElement('td');
    celdaId.textContent = pedido.id;
    fila.appendChild(celdaId);

    const celdaMesa = document.createElement('td');
    celdaMesa.textContent = pedido.mesa || pedido.cliente || '—';
    fila.appendChild(celdaMesa);

    const celdaTotal = document.createElement('td');
    celdaTotal.textContent = formatCurrency(pedido.total);
    fila.appendChild(celdaTotal);

    const celdaFecha = document.createElement('td');
    celdaFecha.textContent = formatDateTime(pedido.fecha_cierre || pedido.fecha_listo);
    fila.appendChild(celdaFecha);

    fragment.appendChild(fila);
  });

  cierresDetalleTabla.appendChild(fragment);
  cierresDetalleWrapper.hidden = false;
};

const limpiarDetalleCierre = () => {
  detalleCierreActivo = null;
  if (cierresDetalleTabla) cierresDetalleTabla.innerHTML = '';
  if (cierresDetalleWrapper) cierresDetalleWrapper.hidden = true;
};

const cargarDetalleCierre = async (cierreId) => {
  try {
    setMessage(cierresMensaje, 'Cargando detalle del cierre...', 'info');
    const respuesta = await fetchConAutorizacion(`/api/caja/cierres/${cierreId}/detalle`);
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el detalle del cierre.');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener el detalle del cierre.');
    }

    renderDetalleCierre(data.pedidos || [], cierreId);
    setMessage(cierresMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar detalle de cierre:', error);
    setMessage(cierresMensaje, error.message || 'No se pudo cargar el detalle.', 'error');
    limpiarDetalleCierre();
  }
};

const consultarCierresCaja = async (mostrarCarga = true) => {
  if (!cierresMensaje) return;

  limpiarDetalleCierre();

  let desde = cierresDesdeInput?.value || getLocalDateISO();
  let hasta = cierresHastaInput?.value || desde;

  if (desde && hasta && desde > hasta) {
    [desde, hasta] = [hasta, desde];
    if (cierresDesdeInput) cierresDesdeInput.value = desde;
    if (cierresHastaInput) cierresHastaInput.value = hasta;
  }

  const parametros = new URLSearchParams();
  if (desde) parametros.set('desde', desde);
  if (hasta) parametros.set('hasta', hasta);

  try {
    if (mostrarCarga) {
      setMessage(cierresMensaje, 'Cargando cierres de caja...', 'info');
    }
    const respuesta = await fetchConAutorizacion(`/api/caja/cierres?${parametros.toString()}`);
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener los cierres de caja.');
    }

    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudieron obtener los cierres de caja.');
    }

    cierresCaja = Array.isArray(data.cierres) ? data.cierres : [];
    if (cierresDesdeInput && data.desde) {
      cierresDesdeInput.value = data.desde;
    }
    if (cierresHastaInput && data.hasta) {
      cierresHastaInput.value = data.hasta;
    }

    renderCierresCaja();
    setMessage(cierresMensaje, '', 'info');
  } catch (error) {
    console.error('Error al consultar cierres de caja:', error);
    setMessage(
      cierresMensaje,
      error.message || 'No se pudieron obtener los cierres de caja. Intenta nuevamente.',
      'error'
    );
    cierresCaja = [];
    if (cierresTabla) {
      cierresTabla.innerHTML = '';
    }
  }
};

const exportarCierresCajaCSV = async () => {
  if (!cierresMensaje) return;

  let desde = cierresDesdeInput?.value || getLocalDateISO();
  let hasta = cierresHastaInput?.value || desde;

  if (desde && hasta && desde > hasta) {
    [desde, hasta] = [hasta, desde];
  }

  const parametros = new URLSearchParams();
  if (desde) parametros.set('desde', desde);
  if (hasta) parametros.set('hasta', hasta);

  try {
    setMessage(cierresMensaje, 'Generando CSV de cierres...', 'info');
    const respuesta = await fetchConAutorizacion(`/api/caja/cierres/export?${parametros.toString()}`);
    if (!respuesta.ok) {
      throw new Error('No se pudo exportar los cierres de caja.');
    }

    const contenido = await respuesta.text();
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `cierres_caja_${desde}_a_${hasta}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setMessage(cierresMensaje, '', 'info');
  } catch (error) {
    console.error('Error al exportar cierres de caja:', error);
    setMessage(
      cierresMensaje,
      error.message || 'No se pudo exportar los cierres de caja. Intenta nuevamente.',
      'error'
    );
  }
};

const renderHistorialCocina = (items = []) => {
  if (!histCocinaTabla) return;

  if (!items.length) {
    histCocinaTabla.innerHTML = '';
    setMessage(histCocinaMensaje, 'No hay registros para la fecha seleccionada.', 'info');
    return;
  }

  setMessage(histCocinaMensaje, '', 'info');
  histCocinaTabla.innerHTML = items
    .map((item) => {
      const entrada = formatDateTime(item.created_at);
      const salida = formatDateTime(item.completed_at);
      const cocinero = item.cocinero_nombre || 'No asignado';
      return `
        <tr>
          <td>${item.cuenta_id || '—'}</td>
          <td>${item.pedido_id}</td>
          <td>${item.item_nombre || '—'}</td>
          <td>${item.cantidad}</td>
          <td>${cocinero}</td>
          <td>${entrada}</td>
          <td>${salida}</td>
        </tr>
      `;
    })
    .join('');
};

const actualizarPaginacionHistorialCocina = (total, pageSize, page) => {
  if (!histCocinaInfo || !histCocinaPrev || !histCocinaNext) return;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNum = Math.min(page, totalPages);

  histCocinaInfo.textContent = `Página ${pageNum} de ${totalPages}`;
  histCocinaPrev.disabled = pageNum <= 1;
  histCocinaNext.disabled = pageNum >= totalPages;
};

const cargarHistorialCocina = async (page = 1) => {
  if (!histCocinaTabla) return;
  const fecha = histCocinaFechaInput?.value || getLocalDateISO();
  const cocinero = histCocinaCocineroSelect?.value;
  paginaHistorialCocina = page;

  try {
    const params = new URLSearchParams({ fecha, page, limit: HIST_COCINA_PAGE_SIZE });
    if (cocinero) params.append('cocinero_id', cocinero);

    const respuesta = await fetchConAutorizacion(`/api/historial-cocina?${params.toString()}`);

    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el historial de cocina.');
    }

    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener el historial de cocina.');
    }

    renderHistorialCocina(data.items || []);
    actualizarPaginacionHistorialCocina(data.total || 0, data.pageSize || HIST_COCINA_PAGE_SIZE, data.page || page);
  } catch (error) {
    console.error('Error al cargar el historial de cocina:', error);
    setMessage(
      histCocinaMensaje,
      error.message || 'No se pudo obtener el historial de cocina. Intenta nuevamente.',
      'error'
    );
    if (histCocinaTabla) {
      histCocinaTabla.innerHTML = '';
    }
  }
};

const exportarHistorialCocina = async () => {
  const fecha = histCocinaFechaInput?.value || getLocalDateISO();
  const cocinero = histCocinaCocineroSelect?.value;
  try {
    const params = new URLSearchParams({ fecha });
    if (cocinero) params.append('cocinero_id', cocinero);

    const respuesta = await fetchConAutorizacion(`/api/historial-cocina/export?${params.toString()}`);
    if (!respuesta.ok) {
      throw new Error('No se pudo exportar el historial de cocina.');
    }

    const blob = await respuesta.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_cocina_${fecha}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al exportar historial de cocina:', error);
    setMessage(histCocinaMensaje, error.message || 'No se pudo exportar el historial de cocina.', 'error');
  }
};

const cargarCocinerosHistorial = async () => {
  if (!histCocinaCocineroSelect) return;
  try {
    const resp = await fetchConAutorizacion('/api/historial-cocina/cocineros');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data?.ok || !Array.isArray(data.cocineros)) return;

    const opts = ['<option value="">Todos</option>'].concat(
      data.cocineros.map((c) => {
        const nombre = c.cocinero_nombre || `ID ${c.cocinero_id}`;
        return `<option value="${c.cocinero_id}">${nombre}</option>`;
      })
    );
    histCocinaCocineroSelect.innerHTML = opts.join('');
  } catch (err) {
    console.warn('No se pudieron cargar los cocineros del historial:', err);
  }
};

const recargarEstadoAdmin = async (mostrarCarga = false) => {
  if (recargandoAdmin) {
    return;
  }

  recargandoAdmin = true;

  try {
    const tareas = [];

    tareas.push(cargarProductos());

    if (reporte607Tabla) {
      tareas.push(consultarReporte607(mostrarCarga));
    }

    if (reporte606Tabla) {
      tareas.push(consultarReporte606(mostrarCarga));
    }

    if (cierresTabla) {
      tareas.push(consultarCierresCaja(mostrarCarga));
    }

    if (usuariosTablaBody) {
      tareas.push(cargarUsuarios(usuariosRolSelect?.value));
    }

    if (histCocinaTabla) {
      tareas.push(cargarHistorialCocina(paginaHistorialCocina));
    }

    if (tareas.length) {
      await Promise.allSettled(tareas);
    }
  } finally {
    recargandoAdmin = false;
  }
};

const iniciarActualizacionPeriodicaAdmin = () => {
  if (refreshTimerAdmin) {
    clearInterval(refreshTimerAdmin);
  }

  refreshTimerAdmin = setInterval(() => {
    recargarEstadoAdmin(false);
  }, REFRESH_INTERVAL_ADMIN);
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

    const eventosRelevantes = [
      'pedido-cobrado',
      'cierre-registrado',
      'nota-credito-creada',
      'stock-actualizado',
    ];

    if (!data.evento || eventosRelevantes.includes(data.evento)) {
      recargarEstadoAdmin(false).catch((error) => {
        console.error('Error al refrescar el panel administrativo tras sincronización:', error);
      });
    }
  } catch (error) {
    console.warn('No se pudo procesar la sincronización de administrador:', error);
  }
};

/* =====================
 * Negocios (solo super admin)
 * ===================== */
let KANM_NEGOCIOS_CACHE = [];
let KANM_NEGOCIOS_CARGADO = false;
const DEFAULT_CONFIG_MODULOS = {
  admin: true,
  mesera: true,
  cocina: true,
  bar: false,
  caja: true,
  historialCocina: true,
};
const DEFAULT_NEGOCIO_COLORS = {
  primario: '#ff6699',
  secundario: '#ff99bb',
  texto: '#222222',
  header: '#ff6699',
  botonPrimario: '#ff6699',
  botonSecundario: '#ff99bb',
  botonPeligro: '#ff4b4b',
};

const obtenerSesionNegocios = () =>
  window.APP_SESION || { esSuperAdmin: usuarioActual?.esSuperAdmin, negocioId: usuarioActual?.negocioId };

const getNegociosDom = () => ({
  section: document.getElementById('kanm-negocios-section'),
  mensaje: document.getElementById('kanm-negocios-mensaje'),
  inputBuscar: document.getElementById('kanm-negocios-buscar'),
  tablaBody: document.getElementById('kanm-negocios-tbody'),
  btnNuevo: document.getElementById('kanm-negocios-btn-nuevo'),
  modal: document.getElementById('kanm-negocios-modal'),
  modalTitulo: document.getElementById('kanm-negocios-modal-titulo'),
  form: document.getElementById('kanm-negocios-form'),
  inputId: document.getElementById('kanm-negocios-id'),
  inputNombre: document.getElementById('kanm-negocios-nombre'),
  inputSlug: document.getElementById('kanm-negocios-slug'),
  inputColorPrimario: document.getElementById('kanm-negocios-color-primario'),
  inputColorSecundario: document.getElementById('kanm-negocios-color-secundario'),
  inputColorTexto: document.getElementById('kanm-negocios-color-texto'),
  inputColorHeader: document.getElementById('kanm-negocios-color-header'),
  inputColorBotonPrimario: document.getElementById('kanm-negocios-color-boton-primario'),
  inputColorBotonSecundario: document.getElementById('kanm-negocios-color-boton-secundario'),
  inputColorBotonPeligro: document.getElementById('kanm-negocios-color-boton-peligro'),
  chkModuloAdmin: document.getElementById('kanm-modulo-admin'),
  chkModuloMesera: document.getElementById('kanm-modulo-mesera'),
  chkModuloCocina: document.getElementById('kanm-modulo-cocina'),
  chkModuloBar: document.getElementById('kanm-modulo-bar'),
  chkModuloCaja: document.getElementById('kanm-modulo-caja'),
  chkModuloHistorial: document.getElementById('kanm-modulo-historial'),
  inputAdminCorreo: document.getElementById('kanm-negocios-admin-correo'),
  inputAdminUsuario: document.getElementById('kanm-negocios-admin-usuario'),
  chkCambiarPassword: document.getElementById('kanm-negocios-cambiar-password'),
  inputAdminPassword: document.getElementById('kanm-negocios-admin-password'),
  inputLogoUrl: document.getElementById('kanm-negocios-logo-url'),
  btnCerrar: document.getElementById('kanm-negocios-btn-cerrar'),
  mensajeForm: document.getElementById('kanm-negocios-form-mensaje'),
});

const setNegociosMsg = (msg = '', type = 'info') => {
  const { mensaje } = getNegociosDom();
  if (typeof setMessage === 'function') {
    setMessage(mensaje, msg, type);
  } else if (mensaje) {
    mensaje.textContent = msg || '';
  }
};

const normalizarTextoNegocio = (valor = '') =>
  (valor || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const obtenerNombreNegocio = (negocio = {}) => negocio?.nombre || negocio?.titulo_sistema || '';

const obtenerEstadoNegocio = (neg = {}) => {
  if (neg.deleted_at) {
    return { label: 'Eliminado', clase: 'estado-eliminado' };
  }
  if (Number(neg.suspendido) === 1) {
    return {
      label: 'Suspendido',
      clase: 'estado-suspendido',
      motivo: neg.motivo_suspension || neg.motivoSuspension || '',
    };
  }
  if (Number(neg.activo) === 0) {
    return { label: 'Inactivo', clase: 'estado-inactivo' };
  }
  return { label: 'Activo', clase: '' };
};

const renderEstadoNegocio = (neg = {}) => {
  const estado = obtenerEstadoNegocio(neg);
  const clase = estado.clase ? ` ${estado.clase}` : '';
  const motivo = estado.motivo ? `<div class="negocio-motivo">Motivo: ${estado.motivo}</div>` : '';
  return `<div><span class="estado-pill${clase}">${estado.label}</span>${motivo}</div>`;
};

const renderAccionesNegocio = (neg = {}) => {
  const id = neg.id;
  const eliminado = Boolean(neg.deleted_at);
  const activo = Number(neg.activo) !== 0;
  const suspendido = Number(neg.suspendido) === 1;
  const disabled = eliminado ? 'disabled' : '';

  const btnEditar = `<button type="button" class="kanm-button ghost kanm-negocios-btn-editar" data-negocio-id="${id}" ${disabled}>Editar</button>`;
  const btnActivar = activo
    ? `<button type="button" class="kanm-button ghost" data-negocio-action="desactivar" data-negocio-id="${id}" ${disabled}>Desactivar</button>`
    : `<button type="button" class="kanm-button ghost" data-negocio-action="activar" data-negocio-id="${id}" ${disabled}>Activar</button>`;
  const btnSuspender = suspendido
    ? `<button type="button" class="kanm-button ghost" data-negocio-action="reactivar" data-negocio-id="${id}" ${disabled}>Reactivar</button>`
    : `<button type="button" class="kanm-button ghost" data-negocio-action="suspender" data-negocio-id="${id}" ${disabled}>Suspender</button>`;
  const btnReset = `<button type="button" class="kanm-button ghost" data-negocio-action="reset-password" data-negocio-id="${id}" ${disabled}>Resetear password</button>`;
  const btnForce = `<button type="button" class="kanm-button ghost" data-negocio-action="force-password" data-negocio-id="${id}" ${disabled}>Forzar cambio</button>`;
  const btnImpersonar = `<button type="button" class="kanm-button ghost" data-negocio-action="impersonar" data-negocio-id="${id}" ${disabled}>Entrar como negocio</button>`;
  const btnEliminar = `<button type="button" class="kanm-button danger" data-negocio-action="eliminar" data-negocio-id="${id}" ${disabled}>Eliminar</button>`;

  return `${btnEditar}${btnActivar}${btnSuspender}${btnReset}${btnForce}${btnImpersonar}${btnEliminar}`;
};


const renderNegociosTabla = (lista = [], opciones = {}) => {
  const { tablaBody } = getNegociosDom();
  if (!tablaBody) return;
  tablaBody.innerHTML = '';
  const emptyText = opciones.emptyText || 'No hay negocios registrados.';
  if (!lista.length) {
    tablaBody.innerHTML = `<tr><td colspan="6">${emptyText}</td></tr>`;
    return;
  }
  tablaBody.innerHTML = lista
    .map((neg) => {
      const nombre = obtenerNombreNegocio(neg) || '-';
      const swatchPrim = `<span class="kanm-color-swatch" style="background:${neg.color_primario || '#ccc'}"></span>`;
      const swatchSec = `<span class="kanm-color-swatch" style="background:${neg.color_secundario || '#ccc'}"></span>`;
      const logo = neg.logo_url
        ? `<img src="${neg.logo_url}" alt="logo" style="width:36px;height:36px;object-fit:contain;border-radius:6px;" />`
        : '<span class="kanm-subtitle">Sin logo</span>';
      const estadoHtml = renderEstadoNegocio(neg);
      const accionesHtml = renderAccionesNegocio(neg);
      return `
        <tr>
          <td>${nombre}</td>
          <td>${neg.slug || '-'}</td>
          <td>${estadoHtml}</td>
          <td class="negocios-colores">${swatchPrim} ${swatchSec}</td>
          <td>${logo}</td>
          <td><div class="negocio-actions">${accionesHtml}</div></td>
        </tr>
      `;
    })
    .join('');
};

const filtrarNegociosPorNombre = (termino = '') => {
  const filtro = normalizarTextoNegocio(termino);
  const lista = KANM_NEGOCIOS_CACHE || [];
  if (!filtro) return [...lista];
  return lista.filter((neg) => {
    const nombre = obtenerNombreNegocio(neg) || neg?.slug || '';
    return normalizarTextoNegocio(nombre).includes(filtro);
  });
};

const renderNegociosFiltrados = () => {
  const dom = getNegociosDom();
  const termino = dom.inputBuscar?.value || '';
  const listaFiltrada = filtrarNegociosPorNombre(termino);
  const hayBusqueda = Boolean(termino?.trim());
  const emptyText = hayBusqueda
    ? 'No hay negocios que coincidan con la busqueda.'
    : 'No hay negocios registrados.';
  renderNegociosTabla(listaFiltrada, { emptyText });
};

const setEstadoPasswordAdmin = (habilitar = false) => {
  const dom = getNegociosDom();
  if (dom.chkCambiarPassword) {
    dom.chkCambiarPassword.checked = habilitar;
  }
  if (dom.inputAdminPassword) {
    dom.inputAdminPassword.disabled = !habilitar;
    if (!habilitar) {
      dom.inputAdminPassword.value = '';
    }
  }
};

const cargarNegocios = async () => {
  const sesion = obtenerSesionNegocios();
  if (!sesion?.esSuperAdmin) return;
  setNegociosMsg('Cargando negocios...', 'info');
  try {
    const resp = await fetchJsonAutorizado('/api/negocios');
    const data = await resp.json();
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || 'No se pudieron obtener los negocios');
    }
    KANM_NEGOCIOS_CACHE = data?.negocios || [];
    KANM_NEGOCIOS_CARGADO = true;
    renderNegociosFiltrados();
    setNegociosMsg('', 'info');
  } catch (error) {
    console.error('Error al cargar negocios:', error);
    setNegociosMsg(error.message || 'No se pudieron cargar los negocios', 'error');
  }
};

const ejecutarAccionNegocio = async (url, options = {}) => {
  const resp = await fetchJsonAutorizado(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || 'No se pudo completar la accion');
  }
  return data;
};

const iniciarSesionImpersonada = (data = {}) => {
  const sessionApi = window.KANMSession;
  const usuarioId = data.usuario_id ?? data.id ?? null;
  const sesion = {
    usuario: data.usuario,
    nombre: data.nombre,
    rol: data.rol || 'admin',
    id: usuarioId,
    usuarioId,
    negocioId: data.negocio_id ?? data.negocioId,
    esSuperAdmin: false,
    forcePasswordChange: data.force_password_change === true,
    impersonated: true,
    token: data.token,
  };

  if (sessionApi && typeof sessionApi.setUser === 'function') {
    sessionApi.setUser(sesion);
  } else {
    try {
      sessionStorage.setItem('kanmUser', JSON.stringify(sesion));
      localStorage.setItem('sesionApp', JSON.stringify(sesion));
    } catch (error) {
      console.warn('No se pudo guardar sesion impersonada:', error);
    }
  }

  window.APP_SESION = sesion;
  window.location.href = '/admin.html';
};

const procesarAccionNegocio = async (accion, id) => {
  if (!id || !accion) return;
  try {
    setNegociosMsg('Procesando accion...', 'info');
    if (accion === 'activar') {
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/activar`, { method: 'PUT' });
    } else if (accion === 'desactivar') {
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/desactivar`, { method: 'PUT' });
    } else if (accion === 'suspender') {
      const motivo = prompt('Motivo de suspension (opcional):');
      if (motivo === null) {
        setNegociosMsg('', 'info');
        return;
      }
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/suspender`, {
        method: 'PUT',
        body: JSON.stringify({ motivo_suspension: motivo || null }),
      });
    } else if (accion === 'reactivar') {
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/reactivar`, { method: 'PUT' });
    } else if (accion === 'reset-password') {
      const data = await ejecutarAccionNegocio(`/api/admin/negocios/${id}/reset-admin-password`, { method: 'POST' });
      if (data?.temp_password) {
        alert(
          `Password temporal para ${data.admin_usuario || 'admin'}: ${data.temp_password}. Guardalo, no se mostrara de nuevo.`
        );
      }
    } else if (accion === 'force-password') {
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/force-password-change`, { method: 'PUT' });
    } else if (accion === 'impersonar') {
      const data = await ejecutarAccionNegocio(`/api/admin/negocios/${id}/impersonar`, { method: 'POST' });
      iniciarSesionImpersonada(data || {});
      return;
    } else if (accion === 'eliminar') {
      const confirmacion = prompt('Escribe ELIMINAR para confirmar la eliminacion. Esta accion es irreversible.');
      if (confirmacion !== 'ELIMINAR') {
        setNegociosMsg('Eliminacion cancelada.', 'info');
        return;
      }
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}`, { method: 'DELETE' });
    }

    await cargarNegocios();
    setNegociosMsg('Accion completada.', 'info');
  } catch (error) {
    console.error('Error procesando accion de negocio:', error);
    setNegociosMsg(error.message || 'No se pudo completar la accion', 'error');
  }
};

const abrirModalNegocio = async (id = null) => {
  const dom = getNegociosDom();
  if (!dom.modal || !dom.form) return;
  let negocioSeleccionado = null;
  if (id) {
    negocioSeleccionado = (KANM_NEGOCIOS_CACHE || []).find((n) => String(n.id) === String(id));
    if (!negocioSeleccionado) {
      await cargarNegocios();
      negocioSeleccionado = (KANM_NEGOCIOS_CACHE || []).find((n) => String(n.id) === String(id));
    }
  }
  const esEdicion = Boolean(negocioSeleccionado?.id);
  dom.form.reset();
  if (dom.mensajeForm) {
    dom.mensajeForm.textContent = '';
  }
  if (dom.inputId) dom.inputId.value = negocioSeleccionado?.id || '';
  if (dom.inputNombre) dom.inputNombre.value = negocioSeleccionado?.nombre || negocioSeleccionado?.titulo_sistema || '';
  if (dom.inputSlug) {
    dom.inputSlug.value = negocioSeleccionado?.slug || '';
    dom.inputSlug.disabled = Boolean(negocioSeleccionado?.id);
  }
  if (dom.inputColorPrimario) {
    dom.inputColorPrimario.value = negocioSeleccionado?.color_primario || DEFAULT_NEGOCIO_COLORS.primario;
  }
  if (dom.inputColorSecundario) {
    dom.inputColorSecundario.value = negocioSeleccionado?.color_secundario || DEFAULT_NEGOCIO_COLORS.secundario;
  }
  if (dom.inputColorTexto) {
    dom.inputColorTexto.value = negocioSeleccionado?.color_texto || DEFAULT_NEGOCIO_COLORS.texto;
  }
  if (dom.inputColorHeader) {
    dom.inputColorHeader.value =
      negocioSeleccionado?.color_header ||
      negocioSeleccionado?.color_primario ||
      negocioSeleccionado?.color_secundario ||
      DEFAULT_NEGOCIO_COLORS.header;
  }
  if (dom.inputColorBotonPrimario) {
    dom.inputColorBotonPrimario.value =
      negocioSeleccionado?.color_boton_primario ||
      negocioSeleccionado?.color_primario ||
      DEFAULT_NEGOCIO_COLORS.botonPrimario;
  }
  if (dom.inputColorBotonSecundario) {
    dom.inputColorBotonSecundario.value =
      negocioSeleccionado?.color_boton_secundario ||
      negocioSeleccionado?.color_secundario ||
      DEFAULT_NEGOCIO_COLORS.botonSecundario;
  }
  if (dom.inputColorBotonPeligro) {
    dom.inputColorBotonPeligro.value = negocioSeleccionado?.color_boton_peligro || DEFAULT_NEGOCIO_COLORS.botonPeligro;
  }
  if (dom.inputLogoUrl) {
    dom.inputLogoUrl.value = negocioSeleccionado?.logo_url || '';
  }

  const rawConfig = negocioSeleccionado?.configModulos || negocioSeleccionado?.config_modulos;
  let configParsed = { ...DEFAULT_CONFIG_MODULOS };
  if (typeof rawConfig === 'string') {
    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') {
        configParsed = { ...DEFAULT_CONFIG_MODULOS, ...parsed };
      }
    } catch (error) {
      configParsed = { ...DEFAULT_CONFIG_MODULOS };
    }
  } else if (rawConfig && typeof rawConfig === 'object') {
    configParsed = { ...DEFAULT_CONFIG_MODULOS, ...rawConfig };
  }

  if (dom.chkModuloAdmin) dom.chkModuloAdmin.checked = configParsed.admin !== false;
  if (dom.chkModuloMesera) dom.chkModuloMesera.checked = configParsed.mesera !== false;
  if (dom.chkModuloCocina) dom.chkModuloCocina.checked = configParsed.cocina !== false;
  if (dom.chkModuloBar) dom.chkModuloBar.checked = configParsed.bar !== false;
  if (dom.chkModuloCaja) dom.chkModuloCaja.checked = configParsed.caja !== false;
  if (dom.chkModuloHistorial) dom.chkModuloHistorial.checked = configParsed.historialCocina !== false;

  if (dom.inputAdminCorreo) {
    dom.inputAdminCorreo.value =
      negocioSeleccionado?.correoAdminPrincipal ||
      negocioSeleccionado?.admin_principal_correo ||
      negocioSeleccionado?.adminPrincipalCorreo ||
      '';
  }
  if (dom.inputAdminUsuario) {
    dom.inputAdminUsuario.value =
      negocioSeleccionado?.adminPrincipalUsuario ||
      negocioSeleccionado?.admin_principal_usuario ||
      negocioSeleccionado?.admin_usuario ||
      '';
  }
  if (dom.inputAdminPassword) {
    dom.inputAdminPassword.value = '';
  }
  setEstadoPasswordAdmin(!esEdicion);

  if (dom.modalTitulo) {
    dom.modalTitulo.textContent = negocioSeleccionado?.id ? 'Editar negocio' : 'Nuevo negocio';
  }
  dom.modal.classList.remove('oculto');
};

const cerrarModalNegocio = () => {
  const { modal } = getNegociosDom();
  if (!modal) return;
  modal.classList.add('oculto');
};

const reaplicarTemaNegocioActual = async () => {
  try {
    const resp = await fetchConAutorizacion('/api/negocios/mi-tema');
    if (!resp?.ok) return;
    const data = await resp.json();
    const tema = data?.tema || data;
    aplicarTemaAdmin(tema);
  } catch (error) {
    console.warn('No se pudo refrescar el tema del negocio actual:', error);
  }
};

const guardarNegocio = async (event) => {
  event?.preventDefault();
  const dom = getNegociosDom();
  if (!dom.form) return;
  if (dom.mensajeForm) setMessage(dom.mensajeForm, '', 'info');
  const esEdicion = Boolean(dom.inputId?.value);

  const configModulos = {
    admin: dom.chkModuloAdmin?.checked !== false,
    mesera: dom.chkModuloMesera?.checked !== false,
    cocina: dom.chkModuloCocina?.checked !== false,
    bar: dom.chkModuloBar?.checked !== false,
    caja: dom.chkModuloCaja?.checked !== false,
    historialCocina: dom.chkModuloHistorial?.checked !== false,
  };

  const passwordEditable = dom.chkCambiarPassword?.checked === true;
  const adminPassword = passwordEditable ? dom.inputAdminPassword?.value || null : null;
  if (esEdicion && passwordEditable && !adminPassword) {
    setMessage(dom.mensajeForm, 'Ingresa la nueva contrasena del admin principal.', 'warning');
    return;
  }

  const payload = {
    nombre: dom.inputNombre?.value?.trim(),
    titulo_sistema: dom.inputNombre?.value?.trim(),
    slug: dom.inputSlug?.value?.trim()?.toLowerCase(),
    color_primario: dom.inputColorPrimario?.value,
    color_secundario: dom.inputColorSecundario?.value,
    color_texto: dom.inputColorTexto?.value,
    color_header: dom.inputColorHeader?.value,
    color_boton_primario: dom.inputColorBotonPrimario?.value,
    color_boton_secundario: dom.inputColorBotonSecundario?.value,
    color_boton_peligro: dom.inputColorBotonPeligro?.value,
    configModulos,
    adminPrincipalCorreo: dom.inputAdminCorreo?.value?.trim() || null,
    adminPrincipalUsuario: dom.inputAdminUsuario?.value?.trim() || null,
    adminPrincipalPassword: adminPassword,
    logo_url: dom.inputLogoUrl?.value?.trim() || null,
  };

  const id = dom.inputId?.value;
  const url = esEdicion ? `/api/negocios/${id}` : '/api/negocios';
  const method = esEdicion ? 'PUT' : 'POST';

  try {
    const resp = await fetchJsonAutorizado(url, {
      method,
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || 'No se pudo guardar el negocio');
    }
    if (dom.inputAdminPassword) dom.inputAdminPassword.value = '';
    const adminInfo = data?.adminPrincipal;
    if (adminInfo?.passwordGenerada) {
      alert(
        `Se creó el usuario admin ${adminInfo.correo} con la contraseña: ${adminInfo.passwordGenerada}. Guárdala, no se mostrará de nuevo.`
      );
    }
    cerrarModalNegocio();
    await cargarNegocios();
    const sesion = obtenerSesionNegocios();
    const nuevoId = id || data?.negocio?.id;
    if (sesion?.negocioId && Number(nuevoId) === Number(sesion.negocioId)) {
      await reaplicarTemaNegocioActual();
    }
  } catch (error) {
    console.error('Error al guardar negocio:', error);
    if (dom.mensajeForm) {
      setMessage(
        dom.mensajeForm,
        error.message || 'No se pudo guardar el negocio. Verifique los datos.',
        'error'
      );
    }
  }
};

const initNegociosAdmin = () => {
  const sesion = obtenerSesionNegocios();
  const dom = getNegociosDom();
  if (!dom.section) {
    console.warn('Sección de negocios no encontrada');
    return;
  }
  console.log('[Negocios] initNegociosAdmin llamado. APP_SESION:', window.APP_SESION);
  if (!sesion?.esSuperAdmin) {
    console.log('[Negocios] Usuario no es super admin, ocultando sección');
    dom.section.style.display = 'none';
    return;
  }

  if (dom.btnNuevo) {
    dom.btnNuevo.addEventListener('click', () => {
      console.log('[Negocios] Click en Nuevo negocio');
      abrirModalNegocio(null);
    });
  } else {
    console.warn('Bot?n Nuevo negocio no encontrado');
  }

  if (dom.chkCambiarPassword) {
    dom.chkCambiarPassword.addEventListener('change', (event) => {
      setEstadoPasswordAdmin(event.target.checked);
    });
  }


  if (dom.inputBuscar) {
    dom.inputBuscar.addEventListener('input', () => renderNegociosFiltrados());
  }

  if (dom.tablaBody) {
    dom.tablaBody.addEventListener('click', (event) => {
      const btnEditar = event.target.closest('.kanm-negocios-btn-editar');
      if (btnEditar) {
        const id = btnEditar.dataset.negocioId;
        console.log('[Negocios] Click en Editar negocio', id);
        abrirModalNegocio(id);
        return;
      }

      const accionBtn = event.target.closest('[data-negocio-action]');
      if (accionBtn) {
        const accion = accionBtn.dataset.negocioAction;
        const id = accionBtn.dataset.negocioId;
        procesarAccionNegocio(accion, id);
      }
    });
  } else {
    console.warn('Tbody de negocios no encontrado');
  }

  if (dom.form) {
    dom.form.addEventListener('submit', guardarNegocio);
  }

  if (dom.btnCerrar) {
    dom.btnCerrar.addEventListener('click', () => cerrarModalNegocio());
  }

  cargarNegocios();
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Negocios] DOMContentLoaded, APP_SESION actual:', window.APP_SESION);

  if (!window.APP_SESION) {
    try {
      const raw = localStorage.getItem('sesionApp');
      if (raw) {
        window.APP_SESION = JSON.parse(raw);
        console.log('[Negocios] APP_SESION reconstruido desde localStorage:', window.APP_SESION);
      }
    } catch (e) {
      console.warn('[Negocios] Error leyendo sesionApp de localStorage', e);
    }
  }

  initNegociosAdmin();
});

/* =====================
 * Eventos y acciones
 * ===================== */

formProducto?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(mensajeProductos, '', 'info');
  const valores = obtenerValoresProducto();
  if (!validarProducto(valores)) return;

  const id = inputProdId?.value;
  try {
    let productoId = id;
    if (id) {
      await actualizarProducto(id, valores);
      setMessage(mensajeProductos, 'Producto actualizado correctamente.', 'info');
    } else {
      const creado = await crearProducto(valores);
      productoId = creado?.id;
      setMessage(mensajeProductos, 'Producto creado correctamente.', 'info');
    }

    limpiarFormularioProducto();
    await cargarProductos();
  } catch (error) {
    console.error('Error al guardar producto:', error);
    setMessage(mensajeProductos, error.message || 'No se pudo guardar el producto.', 'error');
  }
});

impuestoForm?.addEventListener('submit', (event) => {
  event.preventDefault();
});

impuestoGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarImpuesto();
});

document.getElementById('factura-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
});

facturaGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarConfiguracionFactura();
});

facturaTelefonoAgregarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  agregarTelefonoUI('');
});

usuarioForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await guardarUsuario();
});

usuarioLimpiarBtn?.addEventListener('click', () => {
  limpiarFormularioUsuario();
});

usuariosRolSelect?.addEventListener('change', (event) => {
  const rol = event.target.value;
  if (usuarioRolInput) {
    usuarioRolInput.value = rol;
  }
  cargarUsuarios(rol);
});

usuariosTablaBody?.addEventListener('click', (event) => {
  const boton = event.target.closest('button');
  if (!boton) return;

  const { action, id } = boton.dataset;
  const usuarioSeleccionado = usuarios.find((u) => String(u.id) === String(id));
  if (!usuarioSeleccionado) return;

  if (action === 'editar') {
    if (usuarioIdInput) usuarioIdInput.value = usuarioSeleccionado.id;
    if (usuarioNombreInput) usuarioNombreInput.value = usuarioSeleccionado.nombre || '';
    if (usuarioUsuarioInput) usuarioUsuarioInput.value = usuarioSeleccionado.usuario || '';
    if (usuarioRolInput) usuarioRolInput.value = usuarioSeleccionado.rol;
    if (usuarioActivoInput) usuarioActivoInput.checked = !!usuarioSeleccionado.activo;
    setMessage(usuarioFormMensaje, `Editando usuario ${usuarioSeleccionado.usuario}`, 'info');
  }

  if (action === 'toggle') {
    const nuevoEstado = boton.dataset.activo !== '1';
    cambiarEstadoUsuario(id, nuevoEstado);
  }

  if (action === 'eliminar') {
    eliminarUsuario(id);
  }
});

compraAgregarDetalleBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  if (!compraDetallesContainer) return;
  compraDetallesContainer.appendChild(crearFilaDetalle());
});

compraRecalcularBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  recalcularMontosCompra();
});

compraDetallesContainer?.addEventListener('input', (event) => {
  if (
    event.target.matches('.compra-detalle-cantidad') ||
    event.target.matches('.compra-detalle-precio') ||
    event.target.matches('.compra-detalle-itbis') ||
    event.target.matches('.compra-detalle-total')
  ) {
    recalcularMontosCompra();
  }
});

compraImpuestoInput?.addEventListener('input', () => {
  recalcularMontosCompra();
});

compraExentoInput?.addEventListener('input', () => {
  recalcularMontosCompra();
});

compraForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!compraProveedorInput || !compraFechaInput) return;

  const proveedor = compraProveedorInput.value.trim();
  const fecha = compraFechaInput.value;
  const detalles = obtenerDetallesCompra();

  if (!proveedor || !fecha || detalles.length === 0) {
    setMessage(
      compraMensaje,
      'Proveedor, fecha y al menos un detalle son obligatorios para registrar la compra.',
      'error'
    );
    return;
  }

  const payload = {
    proveedor,
    rnc: compraRncInput?.value,
    fecha,
    tipo_comprobante: compraTipoInput?.value,
    ncf: compraNcfInput?.value,
    monto_gravado: Number(compraGravadoInput?.value ?? 0),
    impuesto: Number(compraImpuestoInput?.value ?? 0),
    monto_exento: Number(compraExentoInput?.value ?? 0),
    total: Number(compraTotalInput?.value ?? 0),
    comentarios: compraComentariosInput?.value,
    items: detalles,
  };

  try {
    setMessage(compraMensaje, 'Registrando compra...', 'info');
    await registrarCompra(payload);
    setMessage(compraMensaje, 'Compra registrada correctamente.', 'info');
    compraForm.reset();
    compraDetallesContainer.innerHTML = '';
    compraDetallesContainer.appendChild(crearFilaDetalle());
    await cargarCompras();
  } catch (error) {
    console.error('Error al registrar compra:', error);
    setMessage(compraMensaje, error.message || 'No se pudo registrar la compra.', 'error');
  }
});

gastoRecurrenteInput?.addEventListener('change', () => refrescarFrecuenciaGasto(true));

gastoCancelarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  limpiarFormularioGasto();
});

gastoForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const valores = obtenerValoresGasto();
  if (!validarGasto(valores)) {
    return;
  }

  const payload = {
    fecha: valores.fecha,
    monto: valores.monto,
    moneda: valores.moneda,
    categoria: valores.categoria || null,
    metodo_pago: valores.metodo_pago || null,
    proveedor: valores.proveedor || null,
    descripcion: valores.descripcion || null,
    comprobante_ncf: valores.comprobante_ncf || null,
    referencia: valores.referencia || null,
    es_recurrente: valores.es_recurrente ? 1 : 0,
    frecuencia: valores.es_recurrente ? valores.frecuencia : null,
    tags: valores.tags || null,
  };

  try {
    setMessage(gastoMensaje, 'Guardando gasto...', 'info');
    const idRaw = gastoIdInput?.value;
    const idValor = idRaw ? Number(idRaw) : null;
    const idFinal = Number.isFinite(idValor) ? idValor : null;
    await guardarGasto(payload, idFinal);
    setMessage(gastoMensaje, 'Gasto guardado correctamente.', 'info');
    limpiarFormularioGasto();
    await cargarGastos();
  } catch (error) {
    console.error('Error al guardar gasto:', error);
    setMessage(gastoMensaje, error.message || 'No se pudo guardar el gasto.', 'error');
  }
});

gastosConsultarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  cargarGastos();
});

gastosLimpiarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  if (gastosDesdeInput) gastosDesdeInput.value = '';
  if (gastosHastaInput) gastosHastaInput.value = '';
  if (gastosCategoriaFiltroInput) gastosCategoriaFiltroInput.value = '';
  if (gastosMetodoFiltroInput) gastosMetodoFiltroInput.value = '';
  if (gastosBuscarInput) gastosBuscarInput.value = '';
  cargarGastos();
});

analisisRangeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    aplicarRangoAnalisis(btn.dataset.analisisRange || '');
  });
});

analisisActualizarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  cargarAnalisis();
});

reporte607ConsultarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  consultarReporte607();
});

reporte607ExportarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  exportarReporte607();
});

reporte606ConsultarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  consultarReporte606();
});

reporte606ExportarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  exportarReporte606();
});

cierresBuscarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  consultarCierresCaja();
});

cierresExportarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  exportarCierresCajaCSV();
});

cierresTabla?.addEventListener('click', (event) => {
  const botonDetalle = event.target.closest('[data-detalle-cierre]');
  if (botonDetalle) {
    event.preventDefault();
    const id = Number(botonDetalle.dataset.detalleCierre);
    if (Number.isInteger(id) && id > 0) {
      cargarDetalleCierre(id);
    }
    return;
  }

  const botonImprimir = event.target.closest('[data-imprimir-cierre]');
  if (botonImprimir) {
    event.preventDefault();
    const id = Number(botonImprimir.dataset.imprimirCierre);
    if (Number.isInteger(id) && id > 0) {
      const url = `/cuadre-imprimir.html?id=${encodeURIComponent(id)}`;
      window.open(url, '_blank', 'noopener');
    }
    return;
  }

  const botonEliminar = event.target.closest('[data-eliminar-cierre]');
  if (!botonEliminar) {
    return;
  }

  event.preventDefault();

  const id = Number(botonEliminar.dataset.eliminarCierre);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }

  abrirModalEliminar({
    titulo: 'Eliminar cuadre de caja',
    descripcion:
      'Esta acción es irreversible. Confirma que deseas eliminar el registro de cuadre de caja seleccionado.',
    endpoint: `/api/admin/eliminar/cierre-caja/${id}`,
    onSuccess: () => {
      cierresCaja = cierresCaja.filter((item) => item.id !== id);
      renderCierresCaja();
      setMessage(cierresMensaje, 'Registro eliminado correctamente.', 'info');
      if (detalleCierreActivo === id) {
        limpiarDetalleCierre();
      }
    },
  });
});

modalEliminarCancelar?.addEventListener('click', (event) => {
  event.preventDefault();
  cerrarModalEliminar();
});

modalEliminarOverlay?.addEventListener('click', (event) => {
  if (event.target === modalEliminarOverlay) {
    cerrarModalEliminar();
  }
});

modalEliminarConfirmar?.addEventListener('click', (event) => {
  event.preventDefault();
  ejecutarEliminacionAdmin();
});

adminTabs.forEach((btn) =>
  btn.addEventListener('click', () => {
    if (btn.classList.contains('hidden')) {
      return;
    }
    const tab = btn.dataset.adminTab || 'productos';
    const sesion = obtenerSesionNegocios();
    if (tab === 'negocios' && !sesion?.esSuperAdmin) {
      window.location.href = '/';
      return;
    }
    mostrarTabAdmin(tab);
    if (tab === 'negocios' && sesion?.esSuperAdmin && !KANM_NEGOCIOS_CARGADO) {
      initNegociosAdmin();
    }
    const tabUrl = btn.dataset.tabUrl;
    if (tabUrl) {
      window.history.replaceState(null, '', tabUrl);
    } else if (typeof window !== 'undefined' && window.location?.pathname?.includes('/admin')) {
      window.history.replaceState(null, '', '/admin.html');
    }
  })
);

histCocinaBuscarBtn?.addEventListener('click', () => cargarHistorialCocina(1));
histCocinaExportarBtn?.addEventListener('click', exportarHistorialCocina);
histCocinaPrev?.addEventListener('click', () => {
  const siguiente = Math.max(1, paginaHistorialCocina - 1);
  cargarHistorialCocina(siguiente);
});
histCocinaNext?.addEventListener('click', () => cargarHistorialCocina(paginaHistorialCocina + 1));
histCocinaCocineroSelect?.addEventListener('change', () => cargarHistorialCocina(1));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalEliminarOverlay && !modalEliminarOverlay.hidden) {
    cerrarModalEliminar();
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  const mesActual = obtenerMesActual();
  if (reporte607MesInput) reporte607MesInput.value = mesActual.valor;
  if (reporte606MesInput) reporte606MesInput.value = mesActual.valor;

  const fechaHoy = getLocalDateISO(new Date());
  if (cierresDesdeInput && !cierresDesdeInput.value) {
    cierresDesdeInput.value = fechaHoy;
  }
  if (cierresHastaInput && !cierresHastaInput.value) {
    cierresHastaInput.value = fechaHoy;
  }
  if (histCocinaFechaInput && !histCocinaFechaInput.value) {
    histCocinaFechaInput.value = fechaHoy;
  }
  if (gastosHastaInput && !gastosHastaInput.value) {
    gastosHastaInput.value = fechaHoy;
  }
  if (gastosDesdeInput && !gastosDesdeInput.value) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    gastosDesdeInput.value = getLocalDateISO(inicioMes);
  }
  if (analisisHastaInput && !analisisHastaInput.value) {
    analisisHastaInput.value = fechaHoy;
  }
  if (analisisDesdeInput && !analisisDesdeInput.value) {
    const inicioAnalisis = new Date();
    inicioAnalisis.setDate(inicioAnalisis.getDate() - 29);
    analisisDesdeInput.value = getLocalDateISO(inicioAnalisis);
  }

  ocultarTabsNoPermitidos();
  aplicarModulosUI();
  await cargarCategorias();
  const tabInicial = obtenerTabInicialAdmin();
  mostrarTabAdmin(tabInicial);

  const esAdmin = usuarioActual?.rol === 'admin';
  if (!esAdmin) {
    return;
  }

  await cargarCocinerosHistorial();

  registrarListenersFactura();
  actualizarDatalistGastos();
  limpiarFormularioGasto();

  await Promise.all([
    cargarProductos(),
    cargarImpuesto(),
    cargarConfiguracionFactura(),
    cargarCompras(),
    cargarGastos(),
    cargarAnalisis(),
    cargarUsuarios(usuariosRolSelect?.value || 'mesera'),
  ]);
  if (compraDetallesContainer) {
    compraDetallesContainer.appendChild(crearFilaDetalle());
  }
  await consultarReporte607();
  await consultarReporte606();
  await consultarCierresCaja();
  await cargarHistorialCocina();
  limpiarFormularioUsuario();
  iniciarActualizacionPeriodicaAdmin();
});

window.addEventListener('beforeunload', () => {
  if (refreshTimerAdmin) {
    clearInterval(refreshTimerAdmin);
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === SYNC_STORAGE_KEY) {
    procesarSyncGlobal(event.newValue);
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    recargarEstadoAdmin(false).catch((error) => {
      console.error('Error al refrescar el panel administrativo al volver a la pestaña:', error);
    });
  }
});
