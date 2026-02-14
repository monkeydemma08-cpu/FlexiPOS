const productosLista = document.getElementById('admin-inventario-body');
const productosBuscarInput = document.getElementById('admin-inventario-buscar');
const inventarioTipoSelect = document.getElementById('admin-inventario-tipo');
const inventarioEstadoSelect = document.getElementById('admin-inventario-estado');
const inventarioStockSelect = document.getElementById('admin-inventario-stock');
const inventarioFiltrarBtn = document.getElementById('admin-inventario-filtrar');
const inventarioLimpiarBtn = document.getElementById('admin-inventario-limpiar');
const inventarioTotalEl = document.getElementById('admin-inventario-total');
const inventarioCriticoEl = document.getElementById('admin-inventario-critico');
const inventarioBajoEl = document.getElementById('admin-inventario-bajo');
const inventarioValorEl = document.getElementById('admin-inventario-valor');
const inventarioNuevoBtn = document.getElementById('admin-inventario-nuevo');
const inventarioMovimientoBtn = document.getElementById('admin-inventario-movimiento-nuevo');
const inventarioSelectAll = document.getElementById('admin-inventario-select-all');
const inventarioBulkActivarBtn = document.getElementById('admin-inventario-bulk-activar');
const inventarioBulkDesactivarBtn = document.getElementById('admin-inventario-bulk-desactivar');
const inventarioBulkPrecioBtn = document.getElementById('admin-inventario-bulk-precio');
const inventarioMensaje = document.getElementById('admin-inventario-mensaje');
const inventarioModal = document.getElementById('admin-inventario-modal');
const inventarioModalCerrarBtn = document.getElementById('admin-inventario-cancelar');
const inventarioMetodoSelect = document.getElementById('admin-inventario-metodo');
const formProducto = document.getElementById('prod-form');
const inputProdId = document.getElementById('prod-id');
const inputProdNombre = document.getElementById('prod-nombre');
const inputProdPrecio = document.getElementById('prod-precio');
const inputProdCostoBase = document.getElementById('prod-costo-base');
const inputProdCostoPromedio = document.getElementById('prod-costo-promedio');
const inputProdUltimoCosto = document.getElementById('prod-ultimo-costo');
const inputProdActualizaCostoCompras = document.getElementById('prod-actualiza-costo');
const inputProdCostoReal = document.getElementById('prod-costo-real');
const inputProdCostoRealIncluyeItbis = document.getElementById('prod-costo-real-incluye-itbis');
const inputProdEsInsumo = document.getElementById('prod-es-insumo');
const inputProdInsumoVendible = document.getElementById('prod-insumo-vendible');
const inputProdUnidadBase = document.getElementById('prod-unidad-base');
const inputProdContenidoUnidad = document.getElementById('prod-contenido-unidad');
const prodInsumoVendibleGroup = document.querySelector('.insumo-vendible-group');
const prodRecetaSection = document.getElementById('prod-receta-section');
const prodRecetaDetalles = document.getElementById('prod-receta-detalles');
const prodRecetaAgregarBtn = document.getElementById('prod-receta-agregar');
const prodRecetaGuardarBtn = document.getElementById('prod-receta-guardar');
const prodRecetaMensaje = document.getElementById('prod-receta-mensaje');
const prodPreciosLista = document.getElementById('prod-precios-lista');
const prodPrecioAgregarBtn = document.getElementById('prod-precio-agregar');
const inputProdStock = document.getElementById('prod-stock');
const inputProdStockIndefinido = document.getElementById('prod-stock-indefinido');
const inputProdCategoria = document.getElementById('prod-categoria');
const inputProdActivo = document.getElementById('prod-activo');
const botonProdCancelar = document.getElementById('prod-cancelar');
const mensajeProductos = document.getElementById('admin-mensaje');
const filtroCategoriaProductos = document.getElementById('productos-filtro-categoria');
const productosVistaCompletaBtn = document.getElementById('productos-vista-completa');
const productosVistaModal = document.getElementById('kanm-productos-vista-modal');
const productosVistaCerrarBtn = document.getElementById('productos-vista-cerrar');
const productosVistaBuscarInput = document.getElementById('productos-vista-buscar');
const productosVistaCategoriaInput = document.getElementById('productos-vista-categoria');
const productosVistaTipoInput = document.getElementById('productos-vista-tipo');
const productosVistaOrdenInput = document.getElementById('productos-vista-orden');
const productosVistaLista = document.getElementById('productos-vista-lista');
const productosVistaBackdrop = productosVistaModal?.querySelector('.kanm-modal-backdrop');


const impuestoForm = document.getElementById('impuesto-form');
const impuestoValorInput = document.getElementById('impuesto-valor');
const impuestoGuardarBtn = document.getElementById('impuesto-guardar');
const impuestoMensaje = document.getElementById('impuesto-mensaje');
const itbisAcreditaInput = document.getElementById('itbis-acredita');
const itbisAcreditaGuardarBtn = document.getElementById('itbis-acredita-guardar');
const itbisAcreditaMensaje = document.getElementById('itbis-acredita-mensaje');

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
const permitirB01Input = document.getElementById('permitir-b01');
const permitirB02Input = document.getElementById('permitir-b02');
const permitirB14Input = document.getElementById('permitir-b14');
const secuenciasGuardarBtn = document.getElementById('secuencias-guardar');
const secuenciasMensaje = document.getElementById('secuencias-mensaje');

let facturaConfigDirty = false;
let secuenciasConfigDirty = false;
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

const abastecimientoForm = document.getElementById('abastecimiento-form');
const abastecimientoProveedorInput = document.getElementById('abastecimiento-proveedor');
const abastecimientoFechaInput = document.getElementById('abastecimiento-fecha');
const abastecimientoOrigenInput = document.getElementById('abastecimiento-origen');
const abastecimientoMetodoInput = document.getElementById('abastecimiento-metodo');
const abastecimientoObservacionesInput = document.getElementById('abastecimiento-observaciones');
const abastecimientoDetallesContainer = document.getElementById('abastecimiento-detalles');
const abastecimientoAgregarDetalleBtn = document.getElementById('abastecimiento-agregar-detalle');
const abastecimientoAplicaItbisInput = document.getElementById('abastecimiento-aplica-itbis');
const abastecimientoItbisCapitalizableInput = document.getElementById('abastecimiento-itbis-capitalizable');
const abastecimientoSubtotalSpan = document.getElementById('abastecimiento-subtotal');
const abastecimientoItbisSpan = document.getElementById('abastecimiento-itbis');
const abastecimientoItbisRow = document.getElementById('abastecimiento-itbis-row');
const abastecimientoTotalSpan = document.getElementById('abastecimiento-total');
const abastecimientoTotalLabel = document.getElementById('abastecimiento-total-label');
const abastecimientoSubmitBtn = document.getElementById('abastecimiento-submit');
const abastecimientoCancelarBtn = document.getElementById('abastecimiento-cancelar');
const abastecimientoMensaje = document.getElementById('abastecimiento-mensaje');
const abastecimientoListaMensaje = document.getElementById('abastecimiento-lista-mensaje');
const abastecimientoTabla = document.getElementById('abastecimiento-tabla');
const abastecimientoDetalleWrapper = document.getElementById('abastecimiento-detalle-wrapper');
const abastecimientoDetalleTabla = document.getElementById('abastecimiento-detalle-tabla');
const abastecimientoDetalleTitulo = document.getElementById('abastecimiento-detalle-titulo');
const abastecimientoDetalleSubtitulo = document.getElementById('abastecimiento-detalle-subtitulo');

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
const gastoTipoInput = document.getElementById('gasto-tipo');
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
const gastosTipoFiltroInput = document.getElementById('gastos-tipo-filtro');
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
const analisisKpiUtilidadReal = document.getElementById('analisis-kpi-utilidad-real');
const analisisUtilidadRealAviso = document.getElementById('analisis-utilidad-real-aviso');
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
const analisisAvanzadoAlertas = document.getElementById('analisis-avanzado-alertas');
const analisisAdvComprasInventario = document.getElementById('analisis-adv-compras-inventario');
const analisisAdvGastosOperativos = document.getElementById('analisis-adv-gastos-operativos');
const analisisAdvCogsTotal = document.getElementById('analisis-adv-cogs-total');
const analisisAdvUtilidadBruta = document.getElementById('analisis-adv-utilidad-bruta');
const analisisAdvUtilidadNeta = document.getElementById('analisis-adv-utilidad-neta');
const analisisAdvFlujoCaja = document.getElementById('analisis-adv-flujo-caja');
const analisisAdvCajaInicial = document.getElementById('analisis-adv-caja-inicial');
const analisisAdvCajaFinal = document.getElementById('analisis-adv-caja-final');
const analisisAdvInventarioInicial = document.getElementById('analisis-adv-inventario-inicial');
const analisisAdvInventarioFinal = document.getElementById('analisis-adv-inventario-final');
const analisisCapitalModal = document.getElementById('analisis-capital-modal');
const analisisCapitalAbrirBtn = document.getElementById('analisis-capital-abrir');
const analisisCapitalCerrarBtn = document.getElementById('analisis-capital-cerrar');
const analisisCapitalCancelarBtn = document.getElementById('analisis-capital-cancelar');
const analisisCapitalDesdeInput = document.getElementById('analisis-capital-desde');
const analisisCapitalHastaInput = document.getElementById('analisis-capital-hasta');
const analisisCapitalCajaInput = document.getElementById('analisis-capital-caja');
const analisisCapitalInventarioInput = document.getElementById('analisis-capital-inventario');
const analisisCogsEstimadoInput = document.getElementById('analisis-cogs-estimado');
const analisisCapitalGuardarBtn = document.getElementById('analisis-capital-guardar');
const analisisCapitalMensaje = document.getElementById('analisis-capital-mensaje');
const analisisCapitalAviso = document.getElementById('analisis-capital-aviso');

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
const histCocinaAreaSelect = document.getElementById('hist-cocina-area');
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
const ADMIN_STOCK_BAJO = 5;
let productoEdicionBase = null;
let compras = [];
let comprasInventario = [];
let gastos = [];
let datosReporte607 = [];
let datosReporte606 = [];
let cierresCaja = [];
let detalleCierreActivo = null;
let detalleAbastecimientoActivo = null;
let abastecimientoEditId = null;
let usuarios = [];
let acreditaItbisConfig = true;
let recetaProductoIdActivo = null;

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
const btnEmpresaPanel = document.getElementById('kanm-empresa-panel');

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
const esRolAdmin = (rol) => rol === 'admin' || rol === 'supervisor' || rol === 'empresa';
const esSupervisor = () => usuarioActual?.rol === 'supervisor';
const esImpersonacionEmpresa = () =>
  Boolean(
    usuarioActual?.impersonated &&
      (usuarioActual?.impersonated_by_role === 'empresa' || usuarioActual?.impersonatedByRole === 'empresa')
  );
const puedeGestionarSupervisores = () => {
  if (usuarioActual?.es_super_admin || usuarioActual?.esSuperAdmin) return true;
  if (usuarioActual?.rol === 'admin') return true;
  if (usuarioActual?.rol === 'empresa') return true;
  if (esImpersonacionEmpresa()) return true;
  return false;
};
const EMPRESA_BACKUP_KEY = 'kanmEmpresaBackup';
const solicitarPasswordSupervisor = (motivo = 'continuar') => {
  if (!esSupervisor()) return null;
  const texto = `Confirma tu contraseña para ${motivo}.`;
  const password = window.prompt(texto);
  const limpio = password ? password.trim() : '';
  return limpio || null;
};
const puedeVerPanelEmpresa = () => {
  if (usuarioActual?.es_super_admin || usuarioActual?.esSuperAdmin) return true;
  return usuarioActual?.rol === 'admin' || usuarioActual?.rol === 'empresa';
};
const puedeImprimirCierres = () => {
  if (esRolAdmin(usuarioActual?.rol)) return true;
  if (usuarioActual?.es_super_admin || usuarioActual?.esSuperAdmin) return true;
  return Boolean(authApi?.isSuperAdmin?.());
};

const obtenerAuthHeaders = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener encabezados de autenticaciÃ³n:', error);
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

const restaurarSesionEmpresa = () => {
  const sessionApi = window.KANMSession;
  try {
    const raw = localStorage.getItem(EMPRESA_BACKUP_KEY);
    if (!raw) return false;
    const sesion = JSON.parse(raw);
    if (!sesion) return false;
    if (sessionApi && typeof sessionApi.setUser === 'function') {
      sessionApi.setUser(sesion);
    } else {
      sessionStorage.setItem('kanmUser', JSON.stringify(sesion));
      localStorage.setItem('sesionApp', JSON.stringify(sesion));
    }
    window.APP_SESION = sesion;
    localStorage.removeItem(EMPRESA_BACKUP_KEY);
    return true;
  } catch (error) {
    console.warn('No se pudo restaurar sesion empresa:', error);
    return false;
  }
};

const mostrarBotonVolverEmpresa = () => {
  if (!usuarioActual?.impersonated) return;
  const raw = localStorage.getItem(EMPRESA_BACKUP_KEY);
  if (!raw) return;
  const headerActions = document.querySelector('.kanm-header-actions');
  if (!headerActions) return;
  if (document.getElementById('kanm-volver-empresa')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'kanm-volver-empresa';
  btn.className = 'kanm-button ghost';
  btn.textContent = 'Volver a empresa';
  btn.addEventListener('click', () => {
    if (restaurarSesionEmpresa()) {
      window.location.href = '/empresa.html';
    }
  });
  headerActions.prepend(btn);
};

const configurarBotonPanelEmpresa = () => {
  if (!btnEmpresaPanel) return;
  if (!puedeVerPanelEmpresa()) {
    btnEmpresaPanel.hidden = true;
    return;
  }
  btnEmpresaPanel.hidden = false;
  btnEmpresaPanel.addEventListener('click', () => {
    window.location.href = '/empresa.html';
  });
};

const parseMoneyValueAdmin = (input, { fallback = 0, allowEmpty = true } = {}) => {
  const rawValue =
    input && typeof input === 'object' && 'value' in input ? input.value : input ?? '';
  const rawText = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
  if (!rawText) return allowEmpty ? fallback : NaN;
  const parsed = window.KANMMoney?.parse ? window.KANMMoney.parse(rawText) : Number(rawText.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const setMoneyInputValueAdmin = (input, value) => {
  if (!input) return;
  if (window.KANMMoney?.setValue && input.matches?.('input[data-money]')) {
    window.KANMMoney.setValue(input, value);
    return;
  }
  input.value = value ?? '';
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

const formatNumber = (value) => {
  const number = Number(value);
  if (Number.isNaN(number)) return '--';
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(number);
};

const formatNumberInput = (value, decimals = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const factor = 10 ** Math.max(decimals, 0);
  const rounded = Math.round(number * factor) / factor;
  let text = rounded.toFixed(Math.max(decimals, 0));
  text = text.replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  return text;
};

const formatCurrencySigned = (value) => {
  const number = Number(value) || 0;
  if (number === 0) return formatCurrency(0);
  const prefix = number > 0 ? '+ ' : '- ';
  return `${prefix}${formatCurrency(Math.abs(number))}`;
};

const formatDate = (value) => {
  if (!value) return 'N/D';
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return 'N/D';
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
  colorPrimario: '#36c1b3',
  colorSecundario: '#91a2f4',
  colorTexto: '#1f2a2a',
  colorHeader: '#36c1b3',
  colorBotonPrimario: '#36c1b3',
  colorBotonSecundario: '#91a2f4',
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
    headerSubtitulo.textContent = 'Panel de administraciÃ³n';
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
  if (!fecha) return 'N/D';
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

const tabsSoloAdmin = [
  'productos',
  'configuracion',
  'usuarios',
  'compras',
  'abastecimiento',
  'gastos',
  'ventas',
  'analisis',
  'cuadres',
  'historial',
];
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

    if (esRolAdmin(usuarioActual?.rol)) {
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

    if (esRolAdmin(usuarioActual?.rol)) {
      return;
    }

    if (tabsSoloAdmin.includes(section.dataset.adminSection)) {
      section.classList.add('hidden');
    }
  });
};

const obtenerTabInicialAdmin = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search || '');
    const tabQuery = params.get('tab');
    if (tabQuery) {
      return tabQuery;
    }
    if (window.location?.pathname?.includes('/admin/cotizaciones')) {
      return 'cotizaciones';
    }
  }
  if (usuarioActual?.rol && !esRolAdmin(usuarioActual.rol)) {
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

const abrirModalCapitalInicial = () => {
  if (!analisisCapitalModal) return;
  if (analisisCapitalDesdeInput && analisisDesdeInput && !analisisCapitalDesdeInput.value) {
    analisisCapitalDesdeInput.value = analisisDesdeInput.value;
  }
  if (analisisCapitalHastaInput && analisisHastaInput && !analisisCapitalHastaInput.value) {
    analisisCapitalHastaInput.value = analisisHastaInput.value;
  }
  analisisCapitalModal.hidden = false;
  requestAnimationFrame(() => {
    analisisCapitalModal.classList.add('is-visible');
  });
};

const cerrarModalCapitalInicial = () => {
  if (!analisisCapitalModal) return;
  analisisCapitalModal.classList.remove('is-visible');
  analisisCapitalModal.hidden = true;
  if (analisisCapitalMensaje) {
    setMessage(analisisCapitalMensaje, '', 'info');
  }
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
    descripcion || 'Esta acciÃ³n es irreversible. Confirma la eliminaciÃ³n del registro seleccionado.';

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
    setMessage(modalEliminarMensaje, 'Ingresa la contraseÃ±a de administrador para continuar.', 'warning');
    return;
  }

  if (!modalEliminarEstado.endpoint) {
    setMessage(modalEliminarMensaje, 'No se ha definido la acciÃ³n a ejecutar.', 'error');
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
    const respuesta = await fetchJsonAutorizado(modalEliminarEstado.endpoint, {
      method: 'DELETE',
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
    setMessage(modalEliminarMensaje, 'OcurriÃ³ un error al eliminar el registro.', 'error');
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
  if (botonProdCancelar) botonProdCancelar.hidden = true;
  if (inputProdActivo) inputProdActivo.checked = true;
  if (inputProdStockIndefinido) inputProdStockIndefinido.checked = false;
  if (inputProdStock) inputProdStock.disabled = false;
  if (inputProdPrecio) setMoneyInputValueAdmin(inputProdPrecio, '');
  if (inputProdCostoBase) setMoneyInputValueAdmin(inputProdCostoBase, '');
  if (inputProdCostoPromedio) setMoneyInputValueAdmin(inputProdCostoPromedio, '');
  if (inputProdUltimoCosto) setMoneyInputValueAdmin(inputProdUltimoCosto, '');
  if (inputProdActualizaCostoCompras) inputProdActualizaCostoCompras.checked = true;
  if (inputProdCostoReal) setMoneyInputValueAdmin(inputProdCostoReal, '');
  if (inputProdCostoRealIncluyeItbis) inputProdCostoRealIncluyeItbis.checked = false;
  if (inputProdEsInsumo) inputProdEsInsumo.checked = false;
  if (inputProdInsumoVendible) inputProdInsumoVendible.checked = false;
  if (inputProdUnidadBase) inputProdUnidadBase.value = 'UND';
  if (inputProdContenidoUnidad) inputProdContenidoUnidad.value = '';
  setPreciosProductoUI([]);
  refrescarUiStockIndefinido(false);
  refrescarUiInsumo(true);
  limpiarRecetaUI();
  recetaProductoIdActivo = null;
  productoEdicionBase = null;
  actualizarEstadoRecetaUI();
};

const abrirInventarioModal = ({ limpiar = false } = {}) => {
  if (!inventarioModal) return;
  if (limpiar) {
    limpiarFormularioProducto();
    setMessage(mensajeProductos, '', 'info');
  }
  inventarioModal.hidden = false;
  requestAnimationFrame(() => {
    inventarioModal.classList.add('is-visible');
  });
};

const cerrarInventarioModal = () => {
  if (!inventarioModal) return;
  inventarioModal.classList.remove('is-visible');
  inventarioModal.hidden = true;
  limpiarFormularioProducto();
};

const esProductoStockIndefinido = (producto) => Number(producto?.stock_indefinido) === 1;
const esProductoInsumo = (producto) =>
  String(producto?.tipo_producto || 'FINAL').toUpperCase() === 'INSUMO';
const esProductoVendible = (producto) => {
  if (!producto) return false;
  return !esProductoInsumo(producto) || Number(producto.insumo_vendible) === 1;
};

const obtenerCostoProducto = (producto) => {
  const candidatos = [
    producto?.costo_unitario_real,
    producto?.costo_promedio_actual,
    producto?.costo_base_sin_itbis,
    producto?.ultimo_costo_sin_itbis,
  ];
  for (const valor of candidatos) {
    if (valor === null || valor === undefined || valor === '') continue;
    const numero = Number(valor);
    if (Number.isFinite(numero)) return numero;
  }
  return 0;
};

const obtenerEstadoStockAdmin = (producto) => {
  if (esProductoStockIndefinido(producto)) return 'indef';
  const stock = Number(producto?.stock || 0);
  if (stock <= 0) return 'critico';
  if (stock <= ADMIN_STOCK_BAJO) return 'bajo';
  return 'ok';
};

const actualizarResumenInventario = () => {
  const lista = Array.isArray(productos) ? productos : [];
  const resumen = lista.reduce(
    (acc, item) => {
      const estadoStock = obtenerEstadoStockAdmin(item);
      if (estadoStock === 'critico') acc.critico += 1;
      if (estadoStock === 'bajo') acc.bajo += 1;
      if (estadoStock !== 'indef') {
        const stock = Number(item?.stock || 0);
        acc.valor += stock * obtenerCostoProducto(item);
      }
      return acc;
    },
    { critico: 0, bajo: 0, valor: 0 }
  );

  if (inventarioTotalEl) inventarioTotalEl.textContent = formatNumber(lista.length);
  if (inventarioCriticoEl) inventarioCriticoEl.textContent = formatNumber(resumen.critico);
  if (inventarioBajoEl) inventarioBajoEl.textContent = formatNumber(resumen.bajo);
  if (inventarioValorEl) inventarioValorEl.textContent = formatCurrency(resumen.valor || 0);
  if (inventarioSelectAll) inventarioSelectAll.checked = false;
};

const obtenerIdsInventarioSeleccionados = () => {
  if (!productosLista) return [];
  return Array.from(productosLista.querySelectorAll('.admin-inventario-select:checked'))
    .map((input) => Number(input.dataset.id))
    .filter((id) => Number.isFinite(id) && id > 0);
};

const actualizarSelectAllInventario = () => {
  if (!inventarioSelectAll || !productosLista) return;
  const checks = Array.from(productosLista.querySelectorAll('.admin-inventario-select'));
  if (!checks.length) {
    inventarioSelectAll.checked = false;
    return;
  }
  inventarioSelectAll.checked = checks.every((input) => input.checked);
};

const actualizarProductosSeleccionados = async (payload, mensajeExito) => {
  const ids = obtenerIdsInventarioSeleccionados();
  if (!ids.length) {
    setMessage(inventarioMensaje, 'Selecciona al menos un producto.', 'warning');
    return;
  }
  try {
    for (const id of ids) {
      const resp = await fetchJsonAutorizado(`/api/productos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      let data = {};
      try {
        data = await resp.json();
      } catch (error) {
        data = {};
      }
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || 'No se pudo actualizar el producto.');
      }
    }
    await cargarProductos();
    setMessage(inventarioMensaje, mensajeExito, 'info');
  } catch (error) {
    console.error('Error al actualizar productos en lote:', error);
    setMessage(inventarioMensaje, error.message || 'Error al actualizar productos.', 'error');
  }
};

const actualizarPrecioProductosSeleccionados = async () => {
  const entrada = window.prompt('Nuevo precio para los productos seleccionados:');
  if (entrada === null) return;
  const valor = Number(entrada);
  if (!Number.isFinite(valor) || valor < 0) {
    setMessage(inventarioMensaje, 'Precio invalido.', 'error');
    return;
  }
  await actualizarProductosSeleccionados({ precio: valor }, 'Precio actualizado correctamente.');
};

const refrescarUiStockIndefinido = (limpiarValor = false) => {
  const indefinido = inputProdStockIndefinido?.checked ?? false;
  if (inputProdStock) {
    inputProdStock.disabled = indefinido;
    if (indefinido && limpiarValor) {
      inputProdStock.value = '';
    }
  }
};

const refrescarUiInsumo = (limpiarValores = false) => {
  const esInsumo = inputProdEsInsumo?.checked ?? false;
  if (prodInsumoVendibleGroup) {
    prodInsumoVendibleGroup.classList.toggle('hidden', !esInsumo);
  }
  if (!esInsumo && limpiarValores) {
    if (inputProdInsumoVendible) inputProdInsumoVendible.checked = false;
  }
  actualizarEstadoRecetaUI();
};

const actualizarEstadoRecetaUI = () => {
  if (!prodRecetaSection) return;
  const productoId = Number(inputProdId?.value || 0);
  const esInsumo = inputProdEsInsumo?.checked ?? false;
  const habilitado = productoId > 0 && !esInsumo;
  if (prodRecetaAgregarBtn) prodRecetaAgregarBtn.disabled = !habilitado;
  if (prodRecetaGuardarBtn) prodRecetaGuardarBtn.disabled = !habilitado;

  if (!habilitado) {
    const mensaje = esInsumo
      ? 'Los insumos no llevan receta.'
      : 'Guarda el producto para editar la receta.';
    setMessage(prodRecetaMensaje, mensaje, esInsumo ? 'warning' : 'info');
  } else if (prodRecetaMensaje?.textContent) {
    setMessage(prodRecetaMensaje, '', 'info');
  }
};

const limpiarPreciosProductoUI = () => {
  if (prodPreciosLista) {
    prodPreciosLista.innerHTML = '';
  }
};

const crearFilaPrecioProducto = (precio = {}) => {
  const fila = document.createElement('div');
  fila.className = 'producto-precio-row';

  const inputEtiqueta = document.createElement('input');
  inputEtiqueta.type = 'text';
  inputEtiqueta.placeholder = 'Etiqueta (opcional)';
  inputEtiqueta.value = precio.label ?? '';

  const inputValor = document.createElement('input');
  inputValor.type = 'text';
  inputValor.inputMode = 'decimal';
  inputValor.dataset.money = 'true';
  inputValor.placeholder = '0.00';
  if (precio.valor !== undefined && precio.valor !== null && precio.valor !== '') {
    setMoneyInputValueAdmin(inputValor, precio.valor);
  }

  const botonEliminar = document.createElement('button');
  botonEliminar.type = 'button';
  botonEliminar.className = 'kanm-button ghost kanm-button--sm';
  botonEliminar.textContent = 'Quitar';
  botonEliminar.addEventListener('click', () => {
    fila.remove();
  });

  fila.appendChild(inputEtiqueta);
  fila.appendChild(inputValor);
  fila.appendChild(botonEliminar);
  return fila;
};

const agregarPrecioProductoUI = (precio = {}) => {
  if (!prodPreciosLista) return;
  prodPreciosLista.appendChild(crearFilaPrecioProducto(precio));
};

const setPreciosProductoUI = (lista = []) => {
  limpiarPreciosProductoUI();
  const precios = Array.isArray(lista) ? lista : [];
  if (!precios.length) {
    agregarPrecioProductoUI();
    return;
  }
  precios.forEach((precio) => agregarPrecioProductoUI(precio));
};

const leerPreciosProductoUI = () => {
  if (!prodPreciosLista) return { precios: [], invalido: false };
  const filas = Array.from(prodPreciosLista.querySelectorAll('.producto-precio-row'));
  const precios = [];
  let invalido = false;

  filas.forEach((fila) => {
    const inputs = fila.querySelectorAll('input');
    const etiqueta = inputs[0]?.value?.trim() || '';
    const valorTexto = inputs[1]?.value?.trim() || '';
    if (!valorTexto) return;
    const valor = parseMoneyValueAdmin(inputs[1], { allowEmpty: false });
    if (!Number.isFinite(valor) || valor < 0) {
      invalido = true;
      return;
    }
    precios.push({ label: etiqueta, valor });
  });

  return { precios, invalido };
};

const UNIDADES_RECETA = [
  { value: 'UND', label: 'Unidades' },
  { value: 'ML', label: 'ML' },
  { value: 'LT', label: 'LT' },
  { value: 'GR', label: 'GR' },
  { value: 'KG', label: 'KG' },
  { value: 'OZ', label: 'OZ' },
  { value: 'LB', label: 'LB' },
];

const limpiarCerosDecimales = (valor) => {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor).trim();
  if (!texto) return '';
  if (!texto.includes('.')) return texto;
  const limpio = texto.replace(/0+$/, '').replace(/\.$/, '');
  return limpio === '' ? '0' : limpio;
};

const obtenerInsumosDisponibles = () =>
  (Array.isArray(productos) ? productos : []).filter((producto) => esProductoInsumo(producto));

const obtenerInsumoPorId = (id) =>
  (Array.isArray(productos) ? productos : []).find(
    (producto) => Number(producto?.id) === Number(id)
  );

const construirOpcionesInsumos = (select, seleccionadoId) => {
  if (!select) return;
  select.innerHTML = '';
  const insumos = obtenerInsumosDisponibles();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = insumos.length ? 'Selecciona insumo' : 'Sin insumos disponibles';
  select.appendChild(placeholder);

  insumos.forEach((insumo) => {
    const option = document.createElement('option');
    option.value = insumo.id;
    const unidad = String(insumo.unidad_base || 'UND').toUpperCase();
    option.textContent = `${insumo.nombre} (${unidad})`;
    select.appendChild(option);
  });

  if (seleccionadoId !== undefined && seleccionadoId !== null) {
    select.value = String(seleccionadoId);
  }
};

const construirOpcionesUnidadReceta = (select) => {
  if (!select) return;
  select.innerHTML = '';
  UNIDADES_RECETA.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
};

const actualizarUnidadReceta = (insumoSelect, unidadSelect) => {
  if (!unidadSelect) return;
  const insumo = obtenerInsumoPorId(insumoSelect?.value);
  const unidadBase = String(insumo?.unidad_base || unidadSelect.value || 'UND').toUpperCase();
  if (!unidadSelect.querySelector(`option[value="${unidadBase}"]`)) {
    const option = document.createElement('option');
    option.value = unidadBase;
    option.textContent = unidadBase;
    unidadSelect.appendChild(option);
  }
  unidadSelect.value = unidadBase;
};

const crearFilaReceta = (detalle = {}) => {
  const fila = document.createElement('div');
  fila.className = 'receta-row';

  const selectInsumo = document.createElement('select');
  selectInsumo.className = 'receta-insumo-select';
  construirOpcionesInsumos(selectInsumo, detalle.insumo_id ?? detalle.insumoId);

  const inputCantidad = document.createElement('input');
  inputCantidad.type = 'number';
  inputCantidad.min = '0';
  inputCantidad.step = '0.0001';
  inputCantidad.placeholder = 'Cantidad';
  inputCantidad.className = 'receta-cantidad-input';
  if (detalle.cantidad !== undefined && detalle.cantidad !== null) {
    inputCantidad.value = limpiarCerosDecimales(detalle.cantidad);
  }
  inputCantidad.addEventListener('blur', () => {
    inputCantidad.value = limpiarCerosDecimales(inputCantidad.value);
  });

  const selectUnidad = document.createElement('select');
  selectUnidad.className = 'receta-unidad-select';
  construirOpcionesUnidadReceta(selectUnidad);
  selectUnidad.disabled = true;
  if (detalle.unidad) {
    selectUnidad.value = String(detalle.unidad).toUpperCase();
  }

  const btnEliminar = document.createElement('button');
  btnEliminar.type = 'button';
  btnEliminar.className = 'kanm-button ghost kanm-button--sm';
  btnEliminar.textContent = 'Quitar';
  btnEliminar.addEventListener('click', () => {
    fila.remove();
  });

  selectInsumo.addEventListener('change', () => {
    actualizarUnidadReceta(selectInsumo, selectUnidad);
  });

  actualizarUnidadReceta(selectInsumo, selectUnidad);

  fila.appendChild(selectInsumo);
  fila.appendChild(inputCantidad);
  fila.appendChild(selectUnidad);
  fila.appendChild(btnEliminar);
  return fila;
};

const limpiarRecetaUI = () => {
  if (prodRecetaDetalles) {
    prodRecetaDetalles.innerHTML = '';
  }
};

const setRecetaUI = (detalles = []) => {
  limpiarRecetaUI();
  const lista = Array.isArray(detalles) ? detalles : [];
  if (!lista.length) {
    return;
  }
  lista.forEach((detalle) => {
    if (prodRecetaDetalles) {
      prodRecetaDetalles.appendChild(crearFilaReceta(detalle));
    }
  });
};

const obtenerRecetaDetallesUI = () => {
  if (!prodRecetaDetalles) return { detalles: [], invalido: false };
  const filas = Array.from(prodRecetaDetalles.querySelectorAll('.receta-row'));
  const detalles = [];
  let invalido = false;

  filas.forEach((fila) => {
    const selectInsumo = fila.querySelector('.receta-insumo-select');
    const inputCantidad = fila.querySelector('.receta-cantidad-input');
    const selectUnidad = fila.querySelector('.receta-unidad-select');
    const insumoId = Number(selectInsumo?.value);
    const cantidadTexto = (inputCantidad?.value ?? '').trim();
    const cantidad = cantidadTexto === '' ? NaN : parseFloat(cantidadTexto);
    const unidad = String(selectUnidad?.value || 'UND').toUpperCase();

    if (!insumoId && cantidadTexto === '') {
      return;
    }

    if (!Number.isFinite(insumoId) || insumoId <= 0 || !Number.isFinite(cantidad) || cantidad <= 0) {
      invalido = true;
      return;
    }

    detalles.push({
      insumo_id: insumoId,
      cantidad,
      unidad,
    });
  });

  return { detalles, invalido };
};

const agregarFilaReceta = (detalle = {}) => {
  if (!prodRecetaDetalles) return;
  const insumos = obtenerInsumosDisponibles();
  if (!insumos.length) {
    setMessage(
      prodRecetaMensaje,
      'No hay insumos disponibles. Crea un producto marcado como insumo.',
      'warning'
    );
    return;
  }
  prodRecetaDetalles.appendChild(crearFilaReceta(detalle));
  setMessage(prodRecetaMensaje, '', 'info');
};

const refrescarOpcionesReceta = () => {
  if (!prodRecetaDetalles) return;
  const filas = Array.from(prodRecetaDetalles.querySelectorAll('.receta-row'));
  filas.forEach((fila) => {
    const selectInsumo = fila.querySelector('.receta-insumo-select');
    const selectUnidad = fila.querySelector('.receta-unidad-select');
    const seleccionadoId = selectInsumo?.value;
    construirOpcionesInsumos(selectInsumo, seleccionadoId);
    actualizarUnidadReceta(selectInsumo, selectUnidad);
  });
};

const cargarRecetaProducto = async (productoId) => {
  limpiarRecetaUI();
  recetaProductoIdActivo = productoId || null;
  actualizarEstadoRecetaUI();

  if (!productoId || inputProdEsInsumo?.checked) {
    return;
  }

  try {
    setMessage(prodRecetaMensaje, 'Cargando receta...', 'info');
    const respuesta = await fetchConAutorizacion(`/api/productos/${productoId}/receta`);
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo obtener la receta.');
    }

    setRecetaUI(data.detalles || []);
    if (!data.detalles?.length) {
      setMessage(prodRecetaMensaje, 'Sin receta registrada.', 'info');
    } else {
      setMessage(prodRecetaMensaje, '', 'info');
    }
  } catch (error) {
    console.error('Error al cargar receta:', error);
    setMessage(prodRecetaMensaje, error.message || 'No se pudo obtener la receta.', 'error');
  }
};

const guardarRecetaProducto = async () => {
  const productoId = Number(inputProdId?.value || recetaProductoIdActivo || 0);
  if (!productoId) {
    setMessage(prodRecetaMensaje, 'Guarda el producto antes de crear la receta.', 'info');
    return;
  }
  if (inputProdEsInsumo?.checked) {
    setMessage(prodRecetaMensaje, 'Los insumos no llevan receta.', 'warning');
    return;
  }

  const { detalles, invalido } = obtenerRecetaDetallesUI();
  if (invalido) {
    setMessage(prodRecetaMensaje, 'Cada insumo debe tener cantidad valida.', 'error');
    return;
  }

  try {
    setMessage(prodRecetaMensaje, '', 'info');
    if (prodRecetaGuardarBtn) {
      prodRecetaGuardarBtn.disabled = true;
      prodRecetaGuardarBtn.classList.add('is-loading');
    }

    const respuesta = await fetchJsonAutorizado(`/api/productos/${productoId}/receta`, {
      method: 'PUT',
      body: JSON.stringify({ detalles }),
    });
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar la receta.');
    }

    setRecetaUI(data.detalles || detalles);
    setMessage(prodRecetaMensaje, 'Receta guardada correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar receta:', error);
    setMessage(prodRecetaMensaje, error.message || 'No se pudo guardar la receta.', 'error');
  } finally {
    if (prodRecetaGuardarBtn) {
      prodRecetaGuardarBtn.disabled = false;
      prodRecetaGuardarBtn.classList.remove('is-loading');
    }
  }
};


/* =====================
 * Productos de venta
 * ===================== */
const seleccionarProductoEdicion = (producto) => {
  if (!producto) return;
  const activo = Number(producto.activo) === 1;
  const stockEsIndefinido = esProductoStockIndefinido(producto);
  const actualizaCostoCompras = Number(producto.actualiza_costo_con_compras ?? 1) === 1;
  const esInsumo = esProductoInsumo(producto);

  productoEdicionBase = {
    id: producto.id,
    stock: producto.stock,
    stock_indefinido: producto.stock_indefinido,
  };

  if (inputProdId) inputProdId.value = producto.id;
  if (botonProdCancelar) botonProdCancelar.hidden = false;
  if (inputProdNombre) inputProdNombre.value = producto.nombre ?? '';
  if (inputProdPrecio) setMoneyInputValueAdmin(inputProdPrecio, producto.precio ?? '');
  if (inputProdCostoBase) setMoneyInputValueAdmin(inputProdCostoBase, producto.costo_base_sin_itbis ?? 0);
  if (inputProdCostoPromedio) setMoneyInputValueAdmin(inputProdCostoPromedio, producto.costo_promedio_actual ?? 0);
  if (inputProdUltimoCosto) setMoneyInputValueAdmin(inputProdUltimoCosto, producto.ultimo_costo_sin_itbis ?? 0);
  if (inputProdCostoReal) setMoneyInputValueAdmin(inputProdCostoReal, producto.costo_unitario_real ?? 0);
  if (inputProdEsInsumo) inputProdEsInsumo.checked = esInsumo;
  if (inputProdInsumoVendible) {
    inputProdInsumoVendible.checked = esInsumo && Number(producto.insumo_vendible) === 1;
  }
  if (inputProdUnidadBase) inputProdUnidadBase.value = producto.unidad_base || 'UND';
  if (inputProdContenidoUnidad) {
    const contenidoValor = producto.contenido_por_unidad;
    inputProdContenidoUnidad.value =
      contenidoValor === null || contenidoValor === undefined
        ? ''
        : formatNumberInput(contenidoValor, 2);
  }
  if (inputProdActualizaCostoCompras) inputProdActualizaCostoCompras.checked = actualizaCostoCompras;
  if (inputProdStockIndefinido) inputProdStockIndefinido.checked = stockEsIndefinido;
  if (inputProdStock) {
    const stockValorForm = producto.stock;
    inputProdStock.value =
      stockEsIndefinido || stockValorForm === null || stockValorForm === undefined
        ? ''
        : formatNumberInput(stockValorForm, 2);
  }
  refrescarUiStockIndefinido(false);
  refrescarUiInsumo(false);
  if (inputProdCategoria) inputProdCategoria.value = producto.categoria_id ?? '';
  if (inputProdActivo) inputProdActivo.checked = activo;
  setPreciosProductoUI(producto.precios || []);
  setMessage(mensajeProductos, `Editando producto: ${producto.nombre}`, 'info');
  cargarRecetaProducto(producto.id);
  inputProdNombre?.focus();
};

const renderProductos = (lista = []) => {
  if (!productosLista) return;
  actualizarResumenInventario();

  if (!Array.isArray(lista) || lista.length === 0) {
    productosLista.innerHTML = '<tr><td colspan="8">No hay productos registrados.</td></tr>';
    return;
  }

  productosLista.innerHTML = lista
    .map((producto) => {
      const estadoStock = obtenerEstadoStockAdmin(producto);
      const tipo = String(producto?.tipo_producto || 'FINAL').toUpperCase();
      const tipoLabel = tipo === 'INSUMO' ? 'Insumo' : 'Final';
      const categoria = producto.categoria_nombre || 'Sin categoria';
      const activo = Number(producto.activo) === 1;
      const estadoLabel = activo ? 'Activo' : 'Inactivo';
      const costo = formatCurrency(obtenerCostoProducto(producto));
      const precio = formatCurrency(producto.precio || 0);
      const stockTexto = esProductoStockIndefinido(producto)
        ? 'SIN LIMITE'
        : formatNumber(Number.isFinite(Number(producto.stock)) ? Number(producto.stock) : 0);
      const badgeClass =
        estadoStock === 'critico'
          ? 'inventario-stock-badge stock-critico'
          : estadoStock === 'bajo'
          ? 'inventario-stock-badge stock-bajo'
          : estadoStock === 'ok'
          ? 'inventario-stock-badge stock-ok'
          : 'inventario-stock-badge stock-indef';
      return `
        <tr>
          <td><input type="checkbox" class="admin-inventario-select" data-id="${producto.id}" /></td>
          <td>
            <div class="inventario-producto-nombre">
              <strong>${producto.nombre || ''}</strong>
              <span>${tipoLabel}</span>
            </div>
          </td>
          <td>${categoria}</td>
          <td><span class="${badgeClass}">${stockTexto}</span></td>
          <td>${costo}</td>
          <td>${precio}</td>
          <td>${estadoLabel}</td>
          <td>
            <div class="acciones-inline">
              <button type="button" class="kanm-button ghost sm" data-admin-inventario-action="editar" data-id="${producto.id}">
                Editar
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderProductosVistaCompleta = (lista) => {
  if (!productosVistaLista) return;
  productosVistaLista.innerHTML = '';

  if (!Array.isArray(lista) || lista.length === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'kanm-empty-message';
    vacio.textContent = 'No hay productos registrados.';
    productosVistaLista.appendChild(vacio);
    return;
  }

  lista.forEach((producto) => {
    const activo = Number(producto.activo) === 1;
    const esInsumo = esProductoInsumo(producto);
    const esVendible = esProductoVendible(producto);
    const stockEsIndefinido = esProductoStockIndefinido(producto);
    const stockValor = Number(producto.stock ?? 0);
    const stockTexto = stockEsIndefinido
      ? 'Indefinido'
      : formatNumber(Number.isFinite(stockValor) ? stockValor : 0);
    const costo = obtenerCostoProducto(producto);
    const costoLabel = producto.costo_unitario_real_calculado ? 'Costo real (receta)' : 'Costo real';
    const categoriaNombre = producto.categoria_nombre ?? 'Sin asignar';
    const unidadBase = producto.unidad_base || 'UND';

    const card = document.createElement('article');
    card.className = 'producto-vista-card';

    const header = document.createElement('div');
    header.className = 'producto-vista-head';

    const headerInfo = document.createElement('div');

    const titulo = document.createElement('h4');
    titulo.textContent = producto.nombre ?? '';

    const tags = document.createElement('div');
    tags.className = 'producto-vista-tags';

    const tagTipo = document.createElement('span');
    tagTipo.className = `producto-vista-tag ${esInsumo ? 'tag-insumo' : 'tag-final'}`;
    tagTipo.textContent = esInsumo ? 'Insumo' : 'Producto final';
    tags.appendChild(tagTipo);

    if (esInsumo && esVendible) {
      const tagVendible = document.createElement('span');
      tagVendible.className = 'producto-vista-tag tag-vendible';
      tagVendible.textContent = 'Vendible';
      tags.appendChild(tagVendible);
    }

    const tagEstado = document.createElement('span');
    tagEstado.className = `producto-vista-tag ${activo ? '' : 'tag-inactivo'}`.trim();
    tagEstado.textContent = activo ? 'Activo' : 'Inactivo';
    tags.appendChild(tagEstado);

    headerInfo.appendChild(titulo);
    headerInfo.appendChild(tags);

    const precio = document.createElement('div');
    precio.className = 'producto-vista-precio';
    precio.textContent = formatCurrency(producto.precio);

    header.appendChild(headerInfo);
    header.appendChild(precio);

    const body = document.createElement('div');
    body.className = 'producto-vista-body';

    const crearDetalle = (label, value) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = `${label}:`;
      item.appendChild(strong);
      item.appendChild(document.createTextNode(` ${value}`));
      return item;
    };

    body.appendChild(crearDetalle('Categoria', categoriaNombre));
    body.appendChild(crearDetalle('Stock', stockTexto));
    body.appendChild(crearDetalle(costoLabel, formatCurrency(costo)));
    body.appendChild(crearDetalle('Unidad', unidadBase));

    const footer = document.createElement('div');
    footer.className = 'producto-vista-footer';

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'kanm-button';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', () => {
      seleccionarProductoEdicion(producto);
      cerrarVistaCompletaProductos();
    });

    footer.appendChild(botonEditar);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    productosVistaLista.appendChild(card);
  });
};

const ordenarProductosVistaCompleta = (lista, criterio) => {
  const orden = criterio || 'nombre-asc';
  const comparadorNombre = (a, b) => {
    const nombreA = String(a?.nombre || '');
    const nombreB = String(b?.nombre || '');
    const resultado = nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
    if (resultado !== 0) return resultado;
    return Number(a?.id || 0) - Number(b?.id || 0);
  };

  return lista.sort((a, b) => {
    switch (orden) {
      case 'nombre-desc':
        return -comparadorNombre(a, b);
      case 'costo-desc': {
        const costoA = obtenerCostoProducto(a);
        const costoB = obtenerCostoProducto(b);
        if (costoA !== costoB) return costoB - costoA;
        return comparadorNombre(a, b);
      }
      case 'costo-asc': {
        const costoA = obtenerCostoProducto(a);
        const costoB = obtenerCostoProducto(b);
        if (costoA !== costoB) return costoA - costoB;
        return comparadorNombre(a, b);
      }
      case 'nombre-asc':
      default:
        return comparadorNombre(a, b);
    }
  });
};

const filtrarProductosVistaCompleta = () => {
  if (!productosVistaLista) return;
  const termino = (productosVistaBuscarInput?.value || '').toLowerCase();
  const categoriaFiltro = productosVistaCategoriaInput?.value || '';
  const tipoFiltro = productosVistaTipoInput?.value || '';
  const orden = productosVistaOrdenInput?.value || 'nombre-asc';
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

  if (tipoFiltro === 'insumo') {
    lista = lista.filter((p) => esProductoInsumo(p));
  }

  if (tipoFiltro === 'vendible') {
    lista = lista.filter((p) => esProductoVendible(p));
  }

  ordenarProductosVistaCompleta(lista, orden);
  renderProductosVistaCompleta(lista);
};

const abrirVistaCompletaProductos = () => {
  if (!productosVistaModal) return;
  productosVistaModal.classList.remove('oculto');
  filtrarProductosVistaCompleta();
  productosVistaBuscarInput?.focus();
};

const cerrarVistaCompletaProductos = () => {
  if (!productosVistaModal) return;
  productosVistaModal.classList.add('oculto');
};

const filtrarProductos = () => {
  const termino = (productosBuscarInput?.value || '').toLowerCase();
  const categoriaFiltro = filtroCategoriaProductos?.value || '';
  const tipoFiltro = inventarioTipoSelect?.value || '';
  const estadoFiltro = inventarioEstadoSelect?.value || '';
  const stockFiltro = inventarioStockSelect?.value || '';
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

  if (tipoFiltro) {
    lista = lista.filter((p) => String(p?.tipo_producto || 'FINAL').toUpperCase() === tipoFiltro);
  }

  if (estadoFiltro) {
    const activo = estadoFiltro === 'ACTIVO' ? 1 : 0;
    lista = lista.filter((p) => Number(p.activo) === activo);
  }

  if (stockFiltro) {
    lista = lista.filter((p) => {
      if (stockFiltro === 'sin_stock') {
        return !esProductoStockIndefinido(p) && Number(p.stock || 0) <= 0;
      }
      return obtenerEstadoStockAdmin(p) === stockFiltro;
    });
  }

  renderProductos(lista);
};

const limpiarFiltrosInventario = () => {
  if (productosBuscarInput) productosBuscarInput.value = '';
  if (filtroCategoriaProductos) filtroCategoriaProductos.value = '';
  if (inventarioTipoSelect) inventarioTipoSelect.value = '';
  if (inventarioEstadoSelect) inventarioEstadoSelect.value = '';
  if (inventarioStockSelect) inventarioStockSelect.value = '';
  filtrarProductos();
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
    if (productosVistaModal && !productosVistaModal.classList.contains('oculto')) {
      filtrarProductosVistaCompleta();
    }
    refrescarSelectsAbastecimiento();
    refrescarOpcionesReceta();
  } catch (error) {
    console.error('Error al cargar productos:', error);
    setMessage(inventarioMensaje || mensajeProductos, 'Error al cargar los productos.', 'error');
  }
};

productosBuscarInput?.addEventListener('input', () => filtrarProductos());
filtroCategoriaProductos?.addEventListener('change', () => filtrarProductos());
inventarioTipoSelect?.addEventListener('change', () => filtrarProductos());
inventarioEstadoSelect?.addEventListener('change', () => filtrarProductos());
inventarioStockSelect?.addEventListener('change', () => filtrarProductos());
inventarioFiltrarBtn?.addEventListener('click', () => filtrarProductos());
inventarioLimpiarBtn?.addEventListener('click', () => limpiarFiltrosInventario());
inventarioNuevoBtn?.addEventListener('click', () => abrirInventarioModal({ limpiar: true }));
inventarioModalCerrarBtn?.addEventListener('click', () => cerrarInventarioModal());
inventarioModal?.addEventListener('click', (event) => {
  if (event.target === inventarioModal) {
    cerrarInventarioModal();
  }
});
inventarioSelectAll?.addEventListener('change', (event) => {
  const checked = event.target.checked;
  if (!productosLista) return;
  productosLista.querySelectorAll('.admin-inventario-select').forEach((input) => {
    input.checked = checked;
  });
});
inventarioBulkActivarBtn?.addEventListener('click', () =>
  actualizarProductosSeleccionados({ activo: 1 }, 'Productos activados correctamente.')
);
inventarioBulkDesactivarBtn?.addEventListener('click', () =>
  actualizarProductosSeleccionados({ activo: 0 }, 'Productos desactivados correctamente.')
);
inventarioBulkPrecioBtn?.addEventListener('click', () => actualizarPrecioProductosSeleccionados());
inventarioMovimientoBtn?.addEventListener('click', () => {
  if (typeof mostrarTabAdmin === 'function') {
    mostrarTabAdmin('abastecimiento');
  }
  setMessage(inventarioMensaje, 'Usa Abastecimiento para registrar entradas de inventario.', 'info');
});
productosLista?.addEventListener('change', (event) => {
  if (event.target?.matches('.admin-inventario-select')) {
    actualizarSelectAllInventario();
  }
});
productosLista?.addEventListener('click', (event) => {
  const boton = event.target.closest('[data-admin-inventario-action="editar"]');
  if (!boton) return;
  const id = Number(boton.dataset.id || 0);
  const producto = (Array.isArray(productos) ? productos : []).find((item) => Number(item.id) === id);
  if (producto) {
    seleccionarProductoEdicion(producto);
    abrirInventarioModal({ limpiar: false });
  }
});
if (inventarioMetodoSelect) {
  inventarioMetodoSelect.value = 'PROMEDIO';
  inventarioMetodoSelect.disabled = true;
}
productosVistaCompletaBtn?.addEventListener('click', () => abrirVistaCompletaProductos());
productosVistaCerrarBtn?.addEventListener('click', () => cerrarVistaCompletaProductos());
productosVistaBackdrop?.addEventListener('click', () => cerrarVistaCompletaProductos());
productosVistaBuscarInput?.addEventListener('input', () => filtrarProductosVistaCompleta());
productosVistaCategoriaInput?.addEventListener('change', () => filtrarProductosVistaCompleta());
productosVistaTipoInput?.addEventListener('change', () => filtrarProductosVistaCompleta());
productosVistaOrdenInput?.addEventListener('change', () => filtrarProductosVistaCompleta());
inputProdStockIndefinido?.addEventListener('change', () => refrescarUiStockIndefinido(true));
inputProdEsInsumo?.addEventListener('change', () => refrescarUiInsumo(false));
refrescarUiStockIndefinido(false);
refrescarUiInsumo(false);
setPreciosProductoUI([]);

prodPrecioAgregarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  agregarPrecioProductoUI();
});

prodRecetaAgregarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  agregarFilaReceta();
});

prodRecetaGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarRecetaProducto();
});

botonProdCancelar?.addEventListener('click', (event) => {
  event.preventDefault();
  limpiarFormularioProducto();
  setMessage(mensajeProductos, 'Edicion cancelada.', 'info');
});

const obtenerValoresProducto = () => {
  const nombre = inputProdNombre?.value.trim();
  const esInsumo = inputProdEsInsumo?.checked ?? false;
  const tipoProducto = esInsumo ? 'INSUMO' : 'FINAL';
  const insumoVendible = esInsumo ? (inputProdInsumoVendible?.checked ?? false) : false;
  const allowEmptyPrecio = esInsumo && !insumoVendible;
  const precioParsed = parseMoneyValueAdmin(inputProdPrecio, {
    allowEmpty: allowEmptyPrecio,
    fallback: 0,
  });
  const precio = Number.isFinite(precioParsed) ? precioParsed : NaN;
  const costoBaseParsed = parseMoneyValueAdmin(inputProdCostoBase);
  const costoBase = Number.isFinite(costoBaseParsed) ? costoBaseParsed : 0;
  const costoRealTexto = (inputProdCostoReal?.value ?? '').trim();
  const costoRealParsed =
    costoRealTexto === '' ? 0 : parseMoneyValueAdmin(inputProdCostoReal, { allowEmpty: false });
  const costoReal = Number.isFinite(costoRealParsed) ? costoRealParsed : NaN;
  const unidadBase = (inputProdUnidadBase?.value || 'UND').toUpperCase();
  const contenidoTexto = (inputProdContenidoUnidad?.value ?? '').trim();
  const contenidoParsed = contenidoTexto === '' ? 1 : parseFloat(contenidoTexto);
  const contenidoPorUnidad = Number.isFinite(contenidoParsed) ? contenidoParsed : NaN;
  const stockIndefinido = inputProdStockIndefinido?.checked ?? false;
  const stockValor = inputProdStock?.value.trim();
  const stock = stockIndefinido ? null : stockValor === '' ? 0 : parseFloat(stockValor);
  const categoriaValor = inputProdCategoria?.value || '';
  const categoriaId = categoriaValor === '' ? null : parseInt(categoriaValor, 10);
  const activo = inputProdActivo?.checked ?? true;
  const actualizaCostoCompras = inputProdActualizaCostoCompras?.checked ?? true;
  const { precios } = leerPreciosProductoUI();

  return {
    nombre,
    precio,
    precios,
    stock,
    categoriaId,
    activo,
    stockIndefinido,
    costoBase,
    costoReal,
    tipoProducto,
    insumoVendible,
    unidadBase,
    contenidoPorUnidad,
    actualizaCostoCompras,
  };
};

const validarProducto = ({
  nombre,
  precio,
  stock,
  stockIndefinido,
  costoBase,
  costoReal,
  contenidoPorUnidad,
  tipoProducto,
  insumoVendible,
}) => {
  if (!nombre) {
    setMessage(mensajeProductos, 'El nombre del producto es obligatorio.', 'error');
    return false;
  }
  if (Number.isNaN(precio)) {
    const esInsumoNoVendible =
      String(tipoProducto || '').toUpperCase() === 'INSUMO' && !insumoVendible;
    if (!esInsumoNoVendible) {
      setMessage(mensajeProductos, 'El precio del producto es obligatorio y debe ser numerico.', 'error');
      return false;
    }
    setMessage(mensajeProductos, 'El precio debe ser numerico si lo ingresas.', 'error');
    return false;
  }
  const { invalido } = leerPreciosProductoUI();
  if (invalido) {
    setMessage(mensajeProductos, 'Los precios adicionales deben ser numericos y mayores o iguales a 0.', 'error');
    return false;
  }
  if (!Number.isFinite(costoBase) || costoBase < 0) {
    setMessage(mensajeProductos, 'El costo base debe ser numerico y mayor o igual a 0.', 'error');
    return false;
  }
  if (!Number.isFinite(costoReal) || costoReal < 0) {
    setMessage(mensajeProductos, 'El costo real debe ser numerico y mayor o igual a 0.', 'error');
    return false;
  }
  if (!Number.isFinite(contenidoPorUnidad) || contenidoPorUnidad <= 0) {
    setMessage(mensajeProductos, 'El contenido por unidad debe ser numerico y mayor a 0.', 'error');
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
  if (productosVistaCategoriaInput) {
    const valorVista = productosVistaCategoriaInput.value;
    productosVistaCategoriaInput.innerHTML = '<option value="">Todas las categorías</option>';
    lista.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nombre;
      productosVistaCategoriaInput.appendChild(opt);
    });
    if (valorVista) {
      productosVistaCategoriaInput.value = valorVista;
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

const crearProducto = async ({
  nombre,
  precio,
  precios,
  stock,
  categoriaId,
  stockIndefinido,
  costoBase,
  costoReal,
  tipoProducto,
  insumoVendible,
  unidadBase,
  contenidoPorUnidad,
  actualizaCostoCompras,
}) => {
  const body = {
    nombre,
    precio,
    precios: Array.isArray(precios) ? precios : [],
    stock_indefinido: stockIndefinido ? 1 : 0,
    costo_base_sin_itbis: Number(costoBase.toFixed(2)),
    costo_unitario_real: Number(costoReal.toFixed(2)),
    tipo_producto: tipoProducto,
    insumo_vendible: insumoVendible ? 1 : 0,
    unidad_base: unidadBase,
    contenido_por_unidad: Number(contenidoPorUnidad.toFixed(4)),
    actualiza_costo_con_compras: actualizaCostoCompras ? 1 : 0,
  };
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

const actualizarProducto = async (
  id,
  {
    nombre,
    precio,
    precios,
    stock,
    categoriaId,
    activo,
    stockIndefinido,
    costoBase,
    costoReal,
    tipoProducto,
    insumoVendible,
    unidadBase,
    contenidoPorUnidad,
    actualizaCostoCompras,
  }
) => {
  const body = {
    nombre,
    precio,
    precios: Array.isArray(precios) ? precios : [],
    categoria_id: categoriaId !== null && !Number.isNaN(categoriaId) ? categoriaId : null,
    activo: activo ? 1 : 0,
    stock_indefinido: stockIndefinido ? 1 : 0,
    costo_base_sin_itbis: Number(costoBase.toFixed(2)),
    costo_unitario_real: Number(costoReal.toFixed(2)),
    tipo_producto: tipoProducto,
    insumo_vendible: insumoVendible ? 1 : 0,
    unidad_base: unidadBase,
    contenido_por_unidad: Number(contenidoPorUnidad.toFixed(4)),
    actualiza_costo_con_compras: actualizaCostoCompras ? 1 : 0,
  };
  if (stockIndefinido) {
    body.stock = null;
  } else {
    const stockEnviar = Number.isNaN(stock) || stock === null ? 0 : stock;
    body.stock = stockEnviar;
  }

  if (esSupervisor()) {
    let cambioStock = true;
    if (productoEdicionBase) {
      const baseIndef = Number(productoEdicionBase.stock_indefinido) === 1;
      if (baseIndef !== stockIndefinido) {
        cambioStock = true;
      } else if (!stockIndefinido) {
        const baseStock = Number(productoEdicionBase.stock ?? 0);
        const nuevoStock = Number(stock ?? 0);
        cambioStock = baseStock !== nuevoStock;
      } else {
        cambioStock = false;
      }
    }
    if (cambioStock) {
      const password = solicitarPasswordSupervisor('modificar el stock');
      if (!password) {
        throw new Error('Se requiere contraseña para actualizar el stock.');
      }
      body.password = password;
    }
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
 * Configuracion de impuesto
 * ===================== */
const cargarImpuesto = async () => {
  if (!impuestoValorInput) return;
  try {
    setMessage(impuestoMensaje, '', 'info');
    const respuesta = await fetchConAutorizacion('/api/configuracion/impuesto');
    if (!respuesta.ok) {
      throw new Error('Error al obtener la configuracion de impuesto');
    }
    const data = await respuesta.json();
    if (data.ok) {
      const valorNumerico = Number(data.valor);
      impuestoValorInput.value = Number.isNaN(valorNumerico) ? '' : valorNumerico;
      setMessage(impuestoMensaje, '', 'info');
    } else {
      setMessage(
        impuestoMensaje,
        data.error || 'No se pudo obtener la configuracion de impuesto.',
        'error'
      );
    }
  } catch (error) {
    console.error('Error al cargar el impuesto:', error);
    setMessage(impuestoMensaje, 'Error al obtener la configuracion de impuesto.', 'error');
  }
};

const guardarImpuesto = async () => {
  if (!impuestoValorInput) return;
  const valorTexto = impuestoValorInput.value.trim();
  const valorNumerico = parseFloat(valorTexto);
  if (valorTexto === '' || Number.isNaN(valorNumerico) || valorNumerico < 0) {
    setMessage(
      impuestoMensaje,
      'El valor del impuesto es obligatorio y debe ser un nÃºmero mayor o igual a 0.',
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
      const mensaje = data.error || 'Error al guardar la configuracion de impuesto.';
      setMessage(impuestoMensaje, mensaje, 'error');
      return;
    }

    impuestoValorInput.value = Number(data.valor);
    setMessage(impuestoMensaje, 'Impuesto actualizado correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar el impuesto:', error);
    setMessage(impuestoMensaje, 'Error al guardar la configuracion de impuesto.', 'error');
  } finally {
    if (impuestoGuardarBtn) {
      impuestoGuardarBtn.disabled = false;
      impuestoGuardarBtn.classList.remove('is-loading');
    }
  }
};

/* =====================
 * Configuracion de facturacion
 * ===================== */
const pintarRango = (inicioInput, finInput, restanteEl, alertaEl, datos, umbral) => {
  if (inicioInput) inicioInput.value = datos?.inicio ?? '';
  if (finInput) finInput.value = datos?.fin ?? '';
  if (restanteEl) restanteEl.textContent = datos?.restante ?? 'N/D';

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

const cargarConfiguracionItbisAcredita = async () => {
  if (!itbisAcreditaInput) return;
  try {
    setMessage(itbisAcreditaMensaje, '', 'info');
    const respuesta = await fetchConAutorizacion('/api/configuracion/itbis-acredita');
    if (!respuesta.ok) {
      throw new Error('Error al obtener la configuracion de ITBIS acreditable');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener la configuracion de ITBIS acreditable.');
    }
    acreditaItbisConfig = Number(data.acredita_itbis) === 1;
    itbisAcreditaInput.checked = acreditaItbisConfig;
    establecerItbisCapitalizableDefault();
    actualizarEstadoItbisCapitalizable();
    setMessage(itbisAcreditaMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar configuracion de ITBIS acreditable:', error);
    setMessage(
      itbisAcreditaMensaje,
      error.message || 'No se pudo cargar la configuracion de ITBIS acreditable.',
      'error'
    );
  }
};

const guardarConfiguracionItbisAcredita = async () => {
  if (!itbisAcreditaInput) return;
  const valor = itbisAcreditaInput.checked ? 1 : 0;
  try {
    setMessage(itbisAcreditaMensaje, '', 'info');
    if (itbisAcreditaGuardarBtn) {
      itbisAcreditaGuardarBtn.disabled = true;
      itbisAcreditaGuardarBtn.classList.add('is-loading');
    }
    const respuesta = await fetchJsonAutorizado('/api/configuracion/itbis-acredita', {
      method: 'PUT',
      body: JSON.stringify({ acredita_itbis: valor }),
    });
    const data = await respuesta.json().catch(() => ({ ok: false }));
    if (!respuesta.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar la configuracion de ITBIS acreditable.');
    }
    acreditaItbisConfig = Number(data.acredita_itbis) === 1;
    establecerItbisCapitalizableDefault();
    actualizarEstadoItbisCapitalizable();
    setMessage(itbisAcreditaMensaje, 'Configuracion guardada correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar configuracion de ITBIS acreditable:', error);
    setMessage(
      itbisAcreditaMensaje,
      error.message || 'No se pudo guardar la configuracion de ITBIS acreditable.',
      'error'
    );
  } finally {
    if (itbisAcreditaGuardarBtn) {
      itbisAcreditaGuardarBtn.disabled = false;
      itbisAcreditaGuardarBtn.classList.remove('is-loading');
    }
  }
};

const normalizarFlagUI = (valor, predeterminado = true) => {
  if (valor === undefined || valor === null) {
    return predeterminado;
  }
  if (typeof valor === 'string') {
    const limpio = valor.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes', 'si'].includes(limpio)) return true;
    if (['0', 'false', 'off', 'no'].includes(limpio)) return false;
  }
  return Boolean(valor);
};

const aplicarConfigSecuencias = (config = {}) => {
  const permitirB01 = normalizarFlagUI(config.permitir_b01 ?? config.permitirB01, true);
  const permitirB02 = normalizarFlagUI(config.permitir_b02 ?? config.permitirB02, true);
  const permitirB14 = normalizarFlagUI(config.permitir_b14 ?? config.permitirB14, true);

  if (permitirB01Input) permitirB01Input.checked = permitirB01;
  if (permitirB02Input) permitirB02Input.checked = permitirB02;
  if (permitirB14Input) permitirB14Input.checked = permitirB14;
};

const marcarSecuenciasDirty = () => {
  secuenciasConfigDirty = true;
  setMessage(secuenciasMensaje, '');
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

const cargarConfigSecuencias = async (options = {}) => {
  const { force = false } = options;
  if ((!permitirB01Input && !permitirB02Input && !permitirB14Input) || (secuenciasConfigDirty && !force)) {
    return;
  }

  try {
    setMessage(secuenciasMensaje, '', 'info');
    const respuesta = await fetchConAutorizacion('/api/admin/negocio/config');
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener la configuracion de secuencias fiscales');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener la configuracion de secuencias fiscales');
    }
    aplicarConfigSecuencias(data);
    secuenciasConfigDirty = false;
    setMessage(secuenciasMensaje, '');
  } catch (error) {
    console.error('Error al cargar configuracion de secuencias fiscales:', error);
    setMessage(secuenciasMensaje, 'No se pudo cargar la configuracion de secuencias fiscales.', 'error');
  }
};

const guardarConfigSecuencias = async () => {
  if (!permitirB01Input && !permitirB02Input && !permitirB14Input) return;

  const payload = {
    permitir_b01: permitirB01Input?.checked ? 1 : 0,
    permitir_b02: permitirB02Input?.checked ? 1 : 0,
    permitir_b14: permitirB14Input?.checked ? 1 : 0,
  };

  try {
    setMessage(secuenciasMensaje, '', 'info');
    if (secuenciasGuardarBtn) {
      secuenciasGuardarBtn.disabled = true;
      secuenciasGuardarBtn.classList.add('is-loading');
    }

    const respuesta = await fetchJsonAutorizado('/api/admin/negocio/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await respuesta.json().catch(() => ({ ok: false }));
    if (!respuesta.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar la configuracion de secuencias fiscales');
    }

    aplicarConfigSecuencias(data);
    secuenciasConfigDirty = false;
    setMessage(secuenciasMensaje, 'Secuencias fiscales actualizadas correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar configuracion de secuencias fiscales:', error);
    setMessage(secuenciasMensaje, error.message || 'No se pudo guardar la configuracion de secuencias.', 'error');
  } finally {
    if (secuenciasGuardarBtn) {
      secuenciasGuardarBtn.disabled = false;
      secuenciasGuardarBtn.classList.remove('is-loading');
    }
  }
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
      throw new Error('No se pudo obtener la configuracion de facturacion');
    }
    const data = await respuesta.json();
    if (!data.ok || !data.configuracion) {
      throw new Error(data.error || 'Error al obtener la configuracion de facturacion');
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
    console.error('Error al cargar configuracion de factura:', error);
    setMessage(facturaMensaje, 'No se pudo cargar la configuracion de facturacion.', 'error');
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
      throw new Error(data.error || 'No se pudo guardar la configuracion de factura');
    }

    const { configuracion } = data;
    setTelefonosUI(configuracion.telefonos || configuracion.telefono || '');
    pintarRango(ncfB02InicioInput, ncfB02FinInput, ncfB02Restante, ncfB02Alerta, configuracion.b02, 20);
    pintarRango(ncfB01InicioInput, ncfB01FinInput, ncfB01Restante, ncfB01Alerta, configuracion.b01, 5);
    facturaConfigDirty = false;
    setMessage(facturaMensaje, 'Configuracion de factura guardada correctamente.', 'info');
  } catch (error) {
    console.error('Error al guardar configuracion de factura:', error);
    setMessage(facturaMensaje, error.message || 'No se pudo guardar la configuracion.', 'error');
  } finally {
    if (facturaGuardarBtn) {
      facturaGuardarBtn.disabled = false;
      facturaGuardarBtn.classList.remove('is-loading');
    }
  }
};

/* =====================
 * GestiÃ³n de usuarios
 * ===================== */
const ROLES_PERMITIDOS_BASE = ['mesera', 'cocina', 'bar', 'caja', 'vendedor', 'delivery', 'supervisor'];
const obtenerRolesPermitidos = () =>
  puedeGestionarSupervisores()
    ? ROLES_PERMITIDOS_BASE
    : ROLES_PERMITIDOS_BASE.filter((rol) => rol !== 'supervisor');

const ajustarRolesUsuariosUI = () => {
  const puedeSupervisores = puedeGestionarSupervisores();
  const limpiarOpcion = (select, value) => {
    if (!select) return;
    const opcion = select.querySelector(`option[value="${value}"]`);
    if (opcion) {
      if (select.value === value) {
        select.value = 'mesera';
      }
      opcion.remove();
    }
  };
  const asegurarOpcion = (select, value, label) => {
    if (!select) return;
    if (select.querySelector(`option[value="${value}"]`)) return;
    const opcion = document.createElement('option');
    opcion.value = value;
    opcion.textContent = label;
    select.appendChild(opcion);
  };

  if (puedeSupervisores) {
    asegurarOpcion(usuarioRolInput, 'supervisor', 'Supervisor');
    asegurarOpcion(usuariosRolSelect, 'supervisor', 'Supervisor');
  } else {
    limpiarOpcion(usuarioRolInput, 'supervisor');
    limpiarOpcion(usuariosRolSelect, 'supervisor');
  }
};

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
    setMessage(usuarioFormMensaje, 'La contraseÃ±a es obligatoria para crear usuarios.', 'error');
    return false;
  }

  const rolesPermitidos = obtenerRolesPermitidos();
  if (!rolesPermitidos.includes(rol)) {
    const textoRoles = rolesPermitidos.includes('supervisor')
      ? 'mesera, cocina, bar, caja, mostrador o supervisor'
      : 'mesera, cocina, bar, caja o mostrador';
    setMessage(
      usuarioFormMensaje,
      `Selecciona un rol valido (${textoRoles}).`,
      'error'
    );
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
      body.password = password; // obligatorio en creaciÃ³n
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
  const confirmar = window.confirm('Â¿Seguro que deseas eliminar este usuario? Esta acciÃ³n no se puede deshacer.');
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
  precio.type = 'text';
  precio.inputMode = 'decimal';
  precio.dataset.money = 'true';
  precio.placeholder = 'Precio unitario';
  precio.className = 'compra-detalle-precio';
  if (detalle.precio_unitario !== undefined && detalle.precio_unitario !== null) {
    setMoneyInputValueAdmin(precio, detalle.precio_unitario);
  }

  const itbis = document.createElement('input');
  itbis.type = 'text';
  itbis.inputMode = 'decimal';
  itbis.dataset.money = 'true';
  itbis.placeholder = 'ITBIS';
  itbis.className = 'compra-detalle-itbis';
  if (detalle.itbis !== undefined && detalle.itbis !== null) {
    setMoneyInputValueAdmin(itbis, detalle.itbis);
  }

  const total = document.createElement('input');
  total.type = 'text';
  total.inputMode = 'decimal';
  total.dataset.money = 'true';
  total.placeholder = 'Total linea';
  total.className = 'compra-detalle-total';
  if (detalle.total !== undefined && detalle.total !== null) {
    setMoneyInputValueAdmin(total, detalle.total);
  }

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
    const precioValor = precioInput?.value === '' ? null : parseMoneyValueAdmin(precioInput, { allowEmpty: false });
    const itbisValor = itbisInput?.value === '' ? null : parseMoneyValueAdmin(itbisInput, { allowEmpty: false });
    const totalValor = totalInput?.value === '' ? null : parseMoneyValueAdmin(totalInput, { allowEmpty: false });

    detalles.push({
      descripcion,
      cantidad: Number.isFinite(cantidadValor) ? cantidadValor : null,
      precio_unitario: Number.isFinite(precioValor) ? precioValor : null,
      itbis: Number.isFinite(itbisValor) ? itbisValor : null,
      total: Number.isFinite(totalValor) ? totalValor : null,
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

  if (compraGravadoInput) setMoneyInputValueAdmin(compraGravadoInput, totalGravado);
  if (compraImpuestoInput) setMoneyInputValueAdmin(compraImpuestoInput, impuestoCalculado);

  const exento = parseMoneyValueAdmin(compraExentoInput);
  const total = totalGravado + impuestoCalculado + (Number.isFinite(exento) ? exento : 0);
  if (compraTotalInput) setMoneyInputValueAdmin(compraTotalInput, total);
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
    cNcf.textContent = compra.ncf || 'N/D';

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
 * Abastecimiento (compras inventario)
 * ===================== */
const ITBIS_RATE_ABASTECIMIENTO = 0.18;

const establecerItbisCapitalizableDefault = () => {
  if (!abastecimientoItbisCapitalizableInput) return;
  if (abastecimientoEditId) return;
  abastecimientoItbisCapitalizableInput.checked = !acreditaItbisConfig;
};

const actualizarEstadoItbisCapitalizable = () => {
  if (!abastecimientoItbisCapitalizableInput) return;
  const aplicaItbis = !!abastecimientoAplicaItbisInput?.checked;
  if (!aplicaItbis) {
    abastecimientoItbisCapitalizableInput.checked = false;
    abastecimientoItbisCapitalizableInput.disabled = true;
    return;
  }
  abastecimientoItbisCapitalizableInput.disabled = false;
};

const calcularTotalesAbastecimiento = (subtotal) => {
  const base = Number(subtotal) || 0;
  const aplicaItbis = !!abastecimientoAplicaItbisInput?.checked;
  const itbis = aplicaItbis ? Number((base * ITBIS_RATE_ABASTECIMIENTO).toFixed(2)) : 0;
  const total = Number((base + itbis).toFixed(2));
  return { aplicaItbis, itbis, total };
};

const actualizarResumenAbastecimiento = (subtotal) => {
  const base = Number(subtotal) || 0;
  const { aplicaItbis, itbis, total } = calcularTotalesAbastecimiento(base);
  if (abastecimientoSubtotalSpan) {
    abastecimientoSubtotalSpan.textContent = formatCurrency(base);
  }
  if (abastecimientoItbisSpan) {
    abastecimientoItbisSpan.textContent = formatCurrency(itbis);
  }
  if (abastecimientoTotalSpan) {
    abastecimientoTotalSpan.textContent = formatCurrency(total);
  }
  if (abastecimientoItbisRow) {
    abastecimientoItbisRow.hidden = !aplicaItbis;
  }
  if (abastecimientoTotalLabel) {
    abastecimientoTotalLabel.textContent = aplicaItbis ? 'Total con ITBIS' : 'Total';
  }
  return { aplicaItbis, itbis, total };
};

const establecerModoEdicionAbastecimiento = (compraId = null) => {
  abastecimientoEditId = Number.isFinite(Number(compraId)) ? Number(compraId) : null;
  if (abastecimientoSubmitBtn) {
    abastecimientoSubmitBtn.textContent = abastecimientoEditId ? 'Guardar cambios' : 'Registrar compra';
  }
  if (abastecimientoCancelarBtn) {
    abastecimientoCancelarBtn.hidden = !abastecimientoEditId;
  }
};

const obtenerFechaAbastecimiento = (valor) => {
  if (!valor) return '';
  return getLocalDateISO(valor);
};

const detectarAplicaItbisCompra = (compra) => {
  if (!compra) return false;
  const bandera = compra.aplica_itbis;
  if (bandera === true || bandera === 1 || bandera === '1') return true;
  const subtotal = Number(compra.subtotal ?? 0);
  const total = Number(compra.total ?? 0);
  return Number.isFinite(subtotal) && Number.isFinite(total) && total > subtotal;
};

const detectarItbisCapitalizableCompra = (compra) => {
  if (!compra) return false;
  const bandera = compra.itbis_capitalizable;
  if (bandera === undefined || bandera === null || bandera === '') {
    return !acreditaItbisConfig;
  }
  if (bandera === true || bandera === 1 || bandera === '1') return true;
  return false;
};
const construirOpcionesProductos = (select, seleccionado = null) => {
  if (!select) return;
  const valorActual = seleccionado ?? select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona producto';
  select.appendChild(placeholder);

  (productos || []).forEach((producto) => {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = producto.nombre;
    select.appendChild(option);
  });

  if (valorActual) {
    select.value = String(valorActual);
  }
};

const refrescarSelectsAbastecimiento = () => {
  if (!abastecimientoDetallesContainer) return;
  const selects = abastecimientoDetallesContainer.querySelectorAll('.abastecimiento-detalle-producto');
  selects.forEach((select) => {
    construirOpcionesProductos(select);
  });
};

const resolverCostoProductoAbastecimiento = (productoId) => {
  if (!productoId) return null;
  const producto = (productos || []).find((item) => Number(item.id) === Number(productoId));
  if (!producto) return null;
  const costoPromedio = Number(producto.costo_promedio_actual);
  if (Number.isFinite(costoPromedio) && costoPromedio > 0) return costoPromedio;
  const ultimoCosto = Number(producto.ultimo_costo_sin_itbis);
  if (Number.isFinite(ultimoCosto) && ultimoCosto > 0) return ultimoCosto;
  const costoBase = Number(producto.costo_base_sin_itbis);
  if (Number.isFinite(costoBase) && costoBase > 0) return costoBase;
  return 0;
};

const crearFilaAbastecimientoDetalle = (detalle = {}) => {
  const fila = document.createElement('div');
  fila.className = 'compra-detalle-row abastecimiento-detalle-row';

  const producto = document.createElement('select');
  producto.className = 'abastecimiento-detalle-producto';
  construirOpcionesProductos(producto, detalle.producto_id);

  const cantidad = document.createElement('input');
  cantidad.type = 'number';
  cantidad.min = '0';
  cantidad.step = '0.01';
  cantidad.placeholder = 'Cantidad';
  cantidad.className = 'abastecimiento-detalle-cantidad';
  cantidad.value = detalle.cantidad ?? '';

  const costo = document.createElement('input');
  costo.type = 'text';
  costo.inputMode = 'decimal';
  costo.dataset.money = 'true';
  costo.placeholder = 'Costo unitario';
  costo.className = 'abastecimiento-detalle-costo';
  if (detalle.costo_unitario !== undefined && detalle.costo_unitario !== null) {
    setMoneyInputValueAdmin(costo, detalle.costo_unitario);
  }

  const total = document.createElement('input');
  total.type = 'text';
  total.inputMode = 'decimal';
  total.dataset.money = 'true';
  total.placeholder = 'Total linea';
  total.className = 'abastecimiento-detalle-total';
  total.readOnly = true;
  if (detalle.total_linea !== undefined && detalle.total_linea !== null) {
    setMoneyInputValueAdmin(total, detalle.total_linea);
  }

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'kanm-button ghost';
  remover.textContent = 'Quitar';
  remover.addEventListener('click', () => {
    fila.remove();
    recalcularAbastecimientoTotales();
  });

  producto.addEventListener('change', () => {
    const productoId = Number(producto.value);
    const costoPreferido = resolverCostoProductoAbastecimiento(productoId);
    if (costoPreferido !== null) {
      setMoneyInputValueAdmin(costo, costoPreferido > 0 ? costoPreferido : '');
    }
    recalcularAbastecimientoTotales();
  });

  fila.appendChild(producto);
  fila.appendChild(cantidad);
  fila.appendChild(costo);
  fila.appendChild(total);
  fila.appendChild(remover);

  return fila;
};

const recalcularAbastecimientoTotales = () => {
  const filas = abastecimientoDetallesContainer?.querySelectorAll('.abastecimiento-detalle-row');
  if (!filas || !filas.length) {
    actualizarResumenAbastecimiento(0);
    return;
  }

  let subtotal = 0;
  filas.forEach((fila) => {
    const cantidadInput = fila.querySelector('.abastecimiento-detalle-cantidad');
    const costoInput = fila.querySelector('.abastecimiento-detalle-costo');
    const totalInput = fila.querySelector('.abastecimiento-detalle-total');

    const cantidad = Number(cantidadInput?.value ?? '');
    const costo = parseMoneyValueAdmin(costoInput, { allowEmpty: false });
    if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(costo) || costo < 0) {
      if (totalInput) setMoneyInputValueAdmin(totalInput, '');
      return;
    }

    const totalLinea = Number((cantidad * costo).toFixed(2));
    if (totalInput) setMoneyInputValueAdmin(totalInput, totalLinea);
    subtotal += totalLinea;
  });

  actualizarResumenAbastecimiento(subtotal);
};

const obtenerDetallesAbastecimiento = () => {
  const filas = abastecimientoDetallesContainer?.querySelectorAll('.abastecimiento-detalle-row');
  if (!filas || filas.length === 0) {
    return { detalles: [], invalido: true, subtotal: 0 };
  }

  const detalles = [];
  let subtotal = 0;
  let invalido = false;

  filas.forEach((fila) => {
    const productoInput = fila.querySelector('.abastecimiento-detalle-producto');
    const cantidadInput = fila.querySelector('.abastecimiento-detalle-cantidad');
    const costoInput = fila.querySelector('.abastecimiento-detalle-costo');

    const productoId = Number(productoInput?.value ?? '');
    const cantidad = Number(cantidadInput?.value ?? '');
    const costo = parseMoneyValueAdmin(costoInput, { allowEmpty: false });

    const filaVacia =
      !productoInput?.value && (cantidadInput?.value ?? '') === '' && (costoInput?.value ?? '') === '';

    if (filaVacia) {
      return;
    }

    if (!Number.isFinite(productoId) || productoId <= 0) {
      invalido = true;
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      invalido = true;
      return;
    }
    if (!Number.isFinite(costo) || costo < 0) {
      invalido = true;
      return;
    }

    const totalLinea = Number((cantidad * costo).toFixed(2));
    subtotal += totalLinea;
    detalles.push({
      producto_id: productoId,
      cantidad,
      costo_unitario: Number(costo.toFixed(2)),
      total_linea: totalLinea,
    });
  });

  return { detalles, invalido, subtotal: Number(subtotal.toFixed(2)) };
};

const limpiarFormularioAbastecimiento = () => {
  abastecimientoForm?.reset();
  if (abastecimientoFechaInput) {
    abastecimientoFechaInput.value = getLocalDateISO(new Date());
  }
  if (abastecimientoOrigenInput) abastecimientoOrigenInput.value = 'negocio';
  if (abastecimientoMetodoInput) abastecimientoMetodoInput.value = '';
  if (abastecimientoObservacionesInput) abastecimientoObservacionesInput.value = '';
  if (abastecimientoAplicaItbisInput) abastecimientoAplicaItbisInput.checked = true;
  establecerItbisCapitalizableDefault();
  actualizarEstadoItbisCapitalizable();
  if (abastecimientoDetallesContainer) {
    abastecimientoDetallesContainer.innerHTML = '';
    abastecimientoDetallesContainer.appendChild(crearFilaAbastecimientoDetalle());
  }
  actualizarResumenAbastecimiento(0);
  establecerModoEdicionAbastecimiento(null);
  setMessage(abastecimientoMensaje, '', 'info');
};

const renderComprasInventario = (lista) => {
  if (!abastecimientoTabla) return;
  abastecimientoTabla.innerHTML = '';

  if (!Array.isArray(lista) || lista.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 7;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay compras de inventario registradas.';
    fila.appendChild(celda);
    abastecimientoTabla.appendChild(fila);
    return;
  }

  const fragment = document.createDocumentFragment();
  lista.forEach((compra) => {
    const fila = document.createElement('tr');

    const fecha = document.createElement('td');
    fecha.textContent = formatDate(compra.fecha);

    const proveedor = document.createElement('td');
    proveedor.textContent = compra.proveedor || '--';

    const origen = document.createElement('td');
    const origenFondos = String(compra.origen_fondos || '').toLowerCase();
    origen.textContent =
      origenFondos === 'caja' ? 'Caja' : origenFondos === 'aporte_externo' ? 'Empresa' : 'Negocio';

    const items = document.createElement('td');
    const itemsValor = Number(compra.items) || 0;
    items.textContent = itemsValor ? itemsValor.toString() : '--';

    const subtotal = document.createElement('td');
    const subtotalBase =
      compra?.subtotal === undefined || compra?.subtotal === null || compra?.subtotal === ''
        ? Number(compra?.total || 0)
        : Number(compra?.subtotal || 0);
    subtotal.textContent = formatCurrency(subtotalBase || 0);

    const total = document.createElement('td');
    total.textContent = formatCurrency(compra.total || 0);

    const acciones = document.createElement('td');
    const accionesWrapper = document.createElement('div');
    accionesWrapper.className = 'tabla-acciones';
    const botonDetalle = document.createElement('button');
    botonDetalle.type = 'button';
    botonDetalle.className = 'kanm-button secondary';
    botonDetalle.textContent = 'Ver detalle';
    botonDetalle.dataset.detalleAbastecimiento = compra.id;

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'kanm-button ghost';
    botonEditar.textContent = 'Editar';
    botonEditar.dataset.editarAbastecimiento = compra.id;

    accionesWrapper.appendChild(botonDetalle);
    accionesWrapper.appendChild(botonEditar);
    acciones.appendChild(accionesWrapper);

    fila.appendChild(fecha);
    fila.appendChild(proveedor);
    fila.appendChild(origen);
    fila.appendChild(items);
    fila.appendChild(subtotal);
    fila.appendChild(total);
    fila.appendChild(acciones);

    fragment.appendChild(fila);
  });

  abastecimientoTabla.appendChild(fragment);
};

const limpiarDetalleAbastecimiento = () => {
  detalleAbastecimientoActivo = null;
  if (abastecimientoDetalleTabla) abastecimientoDetalleTabla.innerHTML = '';
  if (abastecimientoDetalleWrapper) abastecimientoDetalleWrapper.hidden = true;
  if (abastecimientoDetalleSubtitulo) abastecimientoDetalleSubtitulo.textContent = '';
};

const renderDetalleAbastecimiento = (compra, detalles) => {
  if (!abastecimientoDetalleWrapper || !abastecimientoDetalleTabla) return;
  abastecimientoDetalleTabla.innerHTML = '';

  if (abastecimientoDetalleTitulo) {
    abastecimientoDetalleTitulo.textContent = `Detalle compra #${compra?.id || ''}`;
  }
  if (abastecimientoDetalleSubtitulo) {
    const proveedor = compra?.proveedor || '';
    const subtotalBase =
      compra?.subtotal === undefined || compra?.subtotal === null || compra?.subtotal === ''
        ? Number(compra?.total || 0)
        : Number(compra?.subtotal || 0);
    const itbis = Number(compra?.itbis || 0);
    const total = Number(compra?.total ?? subtotalBase + itbis) || 0;
    const resumen =
      itbis > 0
        ? `Subtotal ${formatCurrency(subtotalBase)} | ITBIS ${formatCurrency(itbis)} | Total ${formatCurrency(total)}`
        : `Total ${formatCurrency(total)}`;
    abastecimientoDetalleSubtitulo.textContent = proveedor ? `${proveedor} | ${resumen}` : resumen;
  }

  if (!Array.isArray(detalles) || detalles.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 4;
    celda.className = 'tabla-vacia';
    celda.textContent = 'No hay detalle para esta compra.';
    fila.appendChild(celda);
    abastecimientoDetalleTabla.appendChild(fila);
    abastecimientoDetalleWrapper.hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  detalles.forEach((detalle) => {
    const fila = document.createElement('tr');
    const producto = document.createElement('td');
    producto.textContent = detalle.producto_nombre || `Producto ${detalle.producto_id}`;

    const cantidad = document.createElement('td');
    cantidad.textContent = formatNumber(detalle.cantidad);
    cantidad.className = 'text-right';

    const costo = document.createElement('td');
    const costoBase = Number(detalle.costo_unitario_sin_itbis);
    const costoMostrar =
      Number.isFinite(costoBase) && costoBase > 0 ? costoBase : Number(detalle.costo_unitario) || 0;
    costo.textContent = formatCurrency(costoMostrar || 0);
    costo.className = 'text-right';

    const total = document.createElement('td');
    total.textContent = formatCurrency(detalle.total_linea || 0);
    total.className = 'text-right';

    fila.appendChild(producto);
    fila.appendChild(cantidad);
    fila.appendChild(costo);
    fila.appendChild(total);
    fragment.appendChild(fila);
  });

  abastecimientoDetalleTabla.appendChild(fragment);
  abastecimientoDetalleWrapper.hidden = false;
};

const prepararEdicionAbastecimiento = (compra, detalles) => {
  if (!compra) return;
  if (abastecimientoProveedorInput) abastecimientoProveedorInput.value = compra.proveedor || '';
  if (abastecimientoFechaInput) abastecimientoFechaInput.value = obtenerFechaAbastecimiento(compra.fecha);
  if (abastecimientoOrigenInput) {
    const origenFondos = String(compra.origen_fondos || '').toLowerCase();
    abastecimientoOrigenInput.value =
      origenFondos === 'caja' || origenFondos === 'aporte_externo' ? origenFondos : 'negocio';
  }
  if (abastecimientoMetodoInput) abastecimientoMetodoInput.value = compra.metodo_pago || '';
  if (abastecimientoObservacionesInput) {
    abastecimientoObservacionesInput.value = compra.observaciones || '';
  }
  if (abastecimientoAplicaItbisInput) {
    abastecimientoAplicaItbisInput.checked = detectarAplicaItbisCompra(compra);
  }
  if (abastecimientoItbisCapitalizableInput) {
    abastecimientoItbisCapitalizableInput.checked = detectarItbisCapitalizableCompra(compra);
  }
  actualizarEstadoItbisCapitalizable();

  if (abastecimientoDetallesContainer) {
    abastecimientoDetallesContainer.innerHTML = '';
    if (Array.isArray(detalles) && detalles.length > 0) {
      detalles.forEach((detalle) => {
        const costoBase = Number(detalle.costo_unitario_sin_itbis);
        const costoMostrar =
          Number.isFinite(costoBase) && costoBase > 0 ? costoBase : Number(detalle.costo_unitario) || 0;
        abastecimientoDetallesContainer.appendChild(
          crearFilaAbastecimientoDetalle({
            producto_id: detalle.producto_id,
            cantidad: detalle.cantidad,
            costo_unitario: costoMostrar,
            total_linea: detalle.total_linea,
          })
        );
      });
    } else {
      abastecimientoDetallesContainer.appendChild(crearFilaAbastecimientoDetalle());
    }
  }

  establecerModoEdicionAbastecimiento(compra.id);
  recalcularAbastecimientoTotales();
  setMessage(abastecimientoMensaje, '', 'info');
  abastecimientoForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const cargarDetalleAbastecimiento = async (id) => {
  if (!id) return;
  try {
    setMessage(abastecimientoListaMensaje, 'Cargando detalle...', 'info');
    const respuesta = await fetchConAutorizacion(`/api/inventario/compras/${id}`);
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el detalle de la compra.');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener el detalle de la compra.');
    }

    detalleAbastecimientoActivo = id;
    renderDetalleAbastecimiento(data.compra, data.detalles || []);
    setMessage(abastecimientoListaMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar detalle de compra de inventario:', error);
    setMessage(abastecimientoListaMensaje, error.message || 'No se pudo cargar el detalle.', 'error');
    limpiarDetalleAbastecimiento();
  }
};

const cargarEdicionAbastecimiento = async (id) => {
  if (!id) return;
  try {
    setMessage(abastecimientoListaMensaje, 'Cargando compra...', 'info');
    const respuesta = await fetchConAutorizacion(`/api/inventario/compras/${id}`);
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener la compra.');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener la compra.');
    }

    prepararEdicionAbastecimiento(data.compra, data.detalles || []);
    setMessage(abastecimientoListaMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar compra para edicion:', error);
    setMessage(abastecimientoListaMensaje, error.message || 'No se pudo cargar la compra.', 'error');
  }
};

const cargarComprasInventario = async () => {
  if (!abastecimientoListaMensaje) return;
  if (!abastecimientoTabla) return;

  try {
    setMessage(abastecimientoListaMensaje, 'Cargando abastecimiento...', 'info');
    const respuesta = await fetchConAutorizacion('/api/inventario/compras');
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener las compras de inventario.');
    }
    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudieron obtener las compras de inventario.');
    }
    comprasInventario = Array.isArray(data.compras) ? data.compras : [];
    renderComprasInventario(comprasInventario);
    if (detalleAbastecimientoActivo) {
      const detalleExiste = comprasInventario.some(
        (item) => Number(item.id) === Number(detalleAbastecimientoActivo)
      );
      if (!detalleExiste) {
        limpiarDetalleAbastecimiento();
      }
    }
    setMessage(abastecimientoListaMensaje, '', 'info');
  } catch (error) {
    console.error('Error al cargar compras de inventario:', error);
    setMessage(
      abastecimientoListaMensaje,
      error.message || 'Error al cargar compras de inventario.',
      'error'
    );
    comprasInventario = [];
    renderComprasInventario(comprasInventario);
  }
};

const guardarCompraInventario = async (payload, compraId = null) => {
  const url = compraId ? `/api/inventario/compras/${compraId}` : '/api/inventario/compras';
  const respuesta = await fetchJsonAutorizado(url, {
    method: compraId ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  });

  const data = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !data.ok) {
    throw new Error(data.error || 'No se pudo guardar la compra de inventario.');
  }

  return data;
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
  if (gastoTipoInput) gastoTipoInput.value = 'OPERATIVO';
  if (gastoRecurrenteInput) gastoRecurrenteInput.checked = false;
  if (gastoMontoInput) setMoneyInputValueAdmin(gastoMontoInput, '');
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
  if (gastoMontoInput) setMoneyInputValueAdmin(gastoMontoInput, gasto.monto ?? '');
  if (gastoMonedaInput) gastoMonedaInput.value = gasto.moneda || 'DOP';
  if (gastoCategoriaInput) gastoCategoriaInput.value = gasto.categoria ?? '';
  if (gastoTipoInput) gastoTipoInput.value = gasto.tipo_gasto || 'OPERATIVO';
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
  const monto = parseMoneyValueAdmin(gastoMontoInput, { allowEmpty: false });
  const moneda = gastoMonedaInput?.value || 'DOP';
  const categoria = gastoCategoriaInput?.value.trim();
  const tipo_gasto = gastoTipoInput?.value || 'OPERATIVO';
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
    tipo_gasto,
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
  const tiposValidos = ['OPERATIVO', 'INVENTARIO', 'RETIRO_CAJA'];
  if (gasto.tipo_gasto && !tiposValidos.includes(gasto.tipo_gasto)) {
    setMessage(gastoMensaje, 'Selecciona un tipo de gasto valido.', 'error');
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

const formatearTipoGasto = (tipo) => {
  const limpio = String(tipo || '').toUpperCase();
  if (limpio === 'INVENTARIO') return 'Inventario';
  if (limpio === 'RETIRO_CAJA') return 'Retiro';
  return 'Operativo';
};

const renderGastosTabla = (lista) => {
  if (!gastosTabla) return;
  gastosTabla.innerHTML = '';

  if (!Array.isArray(lista) || lista.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 9;
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

    const cTipo = document.createElement('td');
    cTipo.textContent = formatearTipoGasto(gasto.tipo_gasto);

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
    fila.appendChild(cTipo);
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
    if (gastosTipoFiltroInput?.value) params.set('tipo_gasto', gastosTipoFiltroInput.value);
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
    celda.textContent = 'No hay ventas registradas en el periodo seleccionado.';
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
      <td>${filaDato.ncf || 'N/D'}</td>
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
    celda.textContent = 'No hay compras registradas en el periodo seleccionado.';
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
      <td>${filaDato.rnc || 'N/D'}</td>
      <td>${filaDato.tipo_comprobante || 'N/D'}</td>
      <td>${filaDato.ncf || 'N/D'}</td>
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

const renderAlertasAnalisis = (alertas, container = analisisAlertas) => {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(alertas) || alertas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanm-empty-message';
    empty.textContent = 'Sin alertas para este periodo.';
    container.appendChild(empty);
    return;
  }

  alertas.forEach((alerta) => {
    const item = document.createElement('div');
    const nivel = alerta?.nivel || 'info';
    item.className = `analisis-alerta analisis-alerta--${nivel}`;
    item.textContent = alerta?.mensaje || 'Alerta';
    container.appendChild(item);
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

const renderCapitalInicialAnalisis = (capital, configuracion, rango) => {
  const periodoInicio = capital?.periodo_inicio || rango?.desde || '';
  const periodoFin = capital?.periodo_fin || rango?.hasta || '';
  if (analisisCapitalDesdeInput) analisisCapitalDesdeInput.value = periodoInicio;
  if (analisisCapitalHastaInput) analisisCapitalHastaInput.value = periodoFin;
  if (analisisCapitalCajaInput) {
    const caja = capital?.caja_inicial ?? '';
    setMoneyInputValueAdmin(analisisCapitalCajaInput, caja === '' ? '' : Number(caja));
  }
  if (analisisCapitalInventarioInput) {
    const inventario = capital?.inventario_inicial ?? '';
    setMoneyInputValueAdmin(analisisCapitalInventarioInput, inventario === '' ? '' : Number(inventario));
  }
  if (analisisCogsEstimadoInput) {
    const costoEstimado = configuracion?.costo_estimado_cogs;
    setMoneyInputValueAdmin(
      analisisCogsEstimadoInput,
      costoEstimado === undefined || costoEstimado === null ? '' : Number(costoEstimado)
    );
  }

  if (analisisCapitalMensaje) {
    setMessage(analisisCapitalMensaje, '', 'info');
  }

  if (analisisCapitalAviso) {
    if (!capital?.encontrado) {
      analisisCapitalAviso.hidden = false;
      analisisCapitalAviso.textContent =
        'Configura tu capital inicial para obtener metricas mas precisas en este periodo.';
    } else {
      analisisCapitalAviso.hidden = true;
      analisisCapitalAviso.textContent = '';
    }
  }
};

const renderAnalisis = (data) => {
  if (!data) return;
  const ingresos = data.ingresos || {};
  const gastosData = data.gastos || {};
  const ganancias = data.ganancias || {};
  const comparacion = data.comparacion || {};
  const costosConfigurados = data.costos_configurados !== false;

  if (analisisKpiVentas) analisisKpiVentas.textContent = formatCurrency(ingresos.total || 0);
  if (analisisKpiGastos) analisisKpiGastos.textContent = formatCurrency(gastosData.total || 0);
  if (analisisKpiGanancia) analisisKpiGanancia.textContent = formatCurrency(ganancias.neta || 0);
  if (analisisKpiUtilidadReal) {
    analisisKpiUtilidadReal.textContent = costosConfigurados
      ? formatCurrency(ganancias.utilidad_real || 0)
      : '---';
  }
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

  if (analisisUtilidadRealAviso) {
    if (!costosConfigurados) {
      analisisUtilidadRealAviso.hidden = false;
      analisisUtilidadRealAviso.dataset.type = 'warning';
      analisisUtilidadRealAviso.textContent = 'Configura costos en Productos para ver utilidad real.';
    } else {
      analisisUtilidadRealAviso.hidden = true;
      analisisUtilidadRealAviso.textContent = '';
    }
  }

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

const renderAnalisisAvanzado = (data) => {
  if (!data) return;
  const gastos = data.gastos || {};
  const flujoCaja = data.flujo_caja || {};
  const inventario = data.inventario || {};
  const capital = data.capital_inicial || {};
  const configuracion = data.configuracion || {};

  if (analisisAdvComprasInventario) {
    analisisAdvComprasInventario.textContent = formatCurrency(gastos.total_inventario || 0);
  }
  if (analisisAdvGastosOperativos) {
    analisisAdvGastosOperativos.textContent = formatCurrency(gastos.total_operativos || 0);
  }
  if (analisisAdvCogsTotal) {
    analisisAdvCogsTotal.textContent = formatCurrency(data.cogs_total || 0);
  }
  if (analisisAdvUtilidadBruta) {
    analisisAdvUtilidadBruta.textContent = formatCurrency(data.utilidad_bruta || 0);
  }
  if (analisisAdvUtilidadNeta) {
    analisisAdvUtilidadNeta.textContent = formatCurrency(data.utilidad_neta_real || 0);
  }
  if (analisisAdvFlujoCaja) {
    analisisAdvFlujoCaja.textContent = formatCurrency(flujoCaja.variacion || 0);
  }
  if (analisisAdvCajaInicial) {
    analisisAdvCajaInicial.textContent = formatCurrency(flujoCaja.caja_inicial ?? capital.caja_inicial ?? 0);
  }
  if (analisisAdvCajaFinal) {
    analisisAdvCajaFinal.textContent = formatCurrency(flujoCaja.caja_final || 0);
  }
  if (analisisAdvInventarioInicial) {
    analisisAdvInventarioInicial.textContent = formatCurrency(inventario.inicial ?? capital.inventario_inicial ?? 0);
  }
  if (analisisAdvInventarioFinal) {
    analisisAdvInventarioFinal.textContent = formatCurrency(inventario.final || 0);
  }

  renderCapitalInicialAnalisis(capital, configuracion, data.rango || {});
  renderAlertasAnalisis(data.alertas || [], analisisAvanzadoAlertas);
};

const guardarCapitalInicialAnalisis = async () => {
  let passwordSupervisor = null;
  if (esSupervisor()) {
    passwordSupervisor = solicitarPasswordSupervisor('configurar el capital inicial');
    if (!passwordSupervisor) {
      setMessage(analisisCapitalMensaje, 'Se requiere contraseña para guardar el capital inicial.', 'warning');
      return;
    }
  }
  const periodoInicio = analisisCapitalDesdeInput?.value || analisisDesdeInput?.value || '';
  const periodoFin = analisisCapitalHastaInput?.value || analisisHastaInput?.value || '';
  const cajaInicial = parseMoneyValueAdmin(analisisCapitalCajaInput, { allowEmpty: false });
  const inventarioInicial = parseMoneyValueAdmin(analisisCapitalInventarioInput, { allowEmpty: false });
  const costoEstimado = parseMoneyValueAdmin(analisisCogsEstimadoInput, { allowEmpty: false });

  if (!periodoInicio || !periodoFin) {
    setMessage(analisisCapitalMensaje, 'Selecciona el periodo del capital inicial.', 'error');
    return;
  }

  const cajaValor = Number.isFinite(cajaInicial) ? cajaInicial : 0;
  const inventarioValor = Number.isFinite(inventarioInicial) ? inventarioInicial : 0;
  const costoValor = Number.isFinite(costoEstimado) ? costoEstimado : null;

  if (cajaValor < 0 || inventarioValor < 0) {
    setMessage(analisisCapitalMensaje, 'Los valores iniciales no pueden ser negativos.', 'error');
    return;
  }

  if (costoValor !== null && costoValor < 0) {
    setMessage(analisisCapitalMensaje, 'El costo estimado no puede ser negativo.', 'error');
    return;
  }

  const payload = {
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    caja_inicial: Number(cajaValor.toFixed(2)),
    inventario_inicial: Number(inventarioValor.toFixed(2)),
  };
  if (costoValor !== null) {
    payload.costo_estimado_cogs = Number(costoValor.toFixed(2));
  }
  if (passwordSupervisor) {
    payload.password = passwordSupervisor;
  }

  try {
    setMessage(analisisCapitalMensaje, 'Guardando capital inicial...', 'info');
    const respuesta = await fetchJsonAutorizado('/api/admin/analytics/capital', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!respuesta.ok) {
      const error = await respuesta.json().catch(() => ({}));
      throw new Error(error.error || 'No se pudo guardar el capital inicial.');
    }
    setMessage(analisisCapitalMensaje, 'Capital inicial guardado.', 'info');
    await cargarAnalisis();
    cerrarModalCapitalInicial();
  } catch (error) {
    console.error('Error al guardar capital inicial:', error);
    setMessage(
      analisisCapitalMensaje,
      error.message || 'No se pudo guardar el capital inicial.',
      'error'
    );
  }
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
    const urlBasico = `/api/admin/analytics/overview?${params.toString()}`;
    const urlAvanzado = `/api/admin/analytics/advanced?${params.toString()}`;

    let basicoOk = false;
    let avanzadoOk = false;

    try {
      const respuesta = await fetchConAutorizacion(urlBasico);
      if (!respuesta.ok) {
        throw new Error('No se pudo obtener el analisis');
      }
      const data = await respuesta.json();
      if (!data.ok) {
        throw new Error(data.error || 'No se pudo obtener el analisis');
      }
      renderAnalisis(data);
      basicoOk = true;
    } catch (error) {
      console.error('Error al cargar analisis basico:', error);
      setMessage(analisisMensaje, error.message || 'Error al cargar el analisis.', 'error');
    }

    try {
      const respuestaAvanzado = await fetchConAutorizacion(urlAvanzado);
      if (!respuestaAvanzado.ok) {
        throw new Error('No se pudo obtener el analisis avanzado');
      }
      const dataAvanzado = await respuestaAvanzado.json();
      if (!dataAvanzado.ok) {
        throw new Error(dataAvanzado.error || 'No se pudo obtener el analisis avanzado');
      }
      renderAnalisisAvanzado(dataAvanzado);
      avanzadoOk = true;
    } catch (error) {
      console.error('Error al cargar analisis avanzado:', error);
      renderAlertasAnalisis(
        [{ nivel: 'warning', mensaje: error.message || 'No se pudo cargar el analisis avanzado.' }],
        analisisAvanzadoAlertas
      );
      if (basicoOk) {
        setMessage(analisisMensaje, 'Analisis avanzado no disponible.', 'warning');
      }
    }

    if (basicoOk && avanzadoOk) {
      setMessage(analisisMensaje, '', 'info');
    }
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
    const observacionesTexto = cierre.observaciones || 'N/D';
    const observacionesReducidas =
      observacionesTexto.length > 60 ? `${observacionesTexto.slice(0, 57)}...` : observacionesTexto;

    const celdaFecha = document.createElement('td');
    celdaFecha.textContent = formatDate(cierre.fecha_operacion);
    fila.appendChild(celdaFecha);

    const celdaHora = document.createElement('td');
    celdaHora.textContent = formatDateTime(cierre.fecha_cierre);
    fila.appendChild(celdaHora);

    const celdaUsuario = document.createElement('td');
    celdaUsuario.textContent = cierre.usuario || 'N/D';
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
    celdaMesa.textContent = pedido.mesa || pedido.cliente || 'N/D';
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

  if (mostrarCarga || !detalleCierreActivo) {
    limpiarDetalleCierre();
  }

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
    if (detalleCierreActivo) {
      const detalleId = Number(detalleCierreActivo);
      const existeDetalle = cierresCaja.some((item) => Number(item.id) === detalleId);
      if (!existeDetalle) {
        limpiarDetalleCierre();
      }
    }
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
      const area = (item.area || '').toLowerCase() === 'bar' ? 'Bar' : 'Cocina';
      const preparador =
        item.preparador_nombre || item.cocinero_nombre || item.bartender_nombre || 'No asignado';
      return `
        <tr>
          <td>${item.cuenta_id || 'N/D'}</td>
          <td>${item.pedido_id}</td>
          <td>${item.item_nombre || 'N/D'}</td>
          <td>${item.cantidad}</td>
          <td>${area}</td>
          <td>${preparador}</td>
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

  histCocinaInfo.textContent = `Pagina ${pageNum} de ${totalPages}`;
  histCocinaPrev.disabled = pageNum <= 1;
  histCocinaNext.disabled = pageNum >= totalPages;
};

const cargarHistorialCocina = async (page = 1) => {
  if (!histCocinaTabla) return;
  const fecha = histCocinaFechaInput?.value || getLocalDateISO();
  const area = histCocinaAreaSelect?.value || 'todas';
  const preparador = histCocinaCocineroSelect?.value;
  paginaHistorialCocina = page;

  try {
    const params = new URLSearchParams({ fecha, page, limit: HIST_COCINA_PAGE_SIZE });
    if (area) params.append('area', area);
    if (preparador) params.append('preparador_id', preparador);

    const respuesta = await fetchConAutorizacion(`/api/preparacion/historial?${params.toString()}`);

    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el historial de preparacion.');
    }

    const data = await respuesta.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo obtener el historial de preparacion.');
    }

    renderHistorialCocina(data.items || []);
    actualizarPaginacionHistorialCocina(data.total || 0, data.pageSize || HIST_COCINA_PAGE_SIZE, data.page || page);
  } catch (error) {
    console.error('Error al cargar el historial de preparacion:', error);
    setMessage(
      histCocinaMensaje,
      error.message || 'No se pudo obtener el historial de preparacion. Intenta nuevamente.',
      'error'
    );
    if (histCocinaTabla) {
      histCocinaTabla.innerHTML = '';
    }
  }
};

const exportarHistorialCocina = async () => {
  const fecha = histCocinaFechaInput?.value || getLocalDateISO();
  const area = histCocinaAreaSelect?.value || 'todas';
  const preparador = histCocinaCocineroSelect?.value;
  try {
    const params = new URLSearchParams({ fecha });
    if (area) params.append('area', area);
    if (preparador) params.append('preparador_id', preparador);

    const respuesta = await fetchConAutorizacion(
      `/api/preparacion/historial/export?${params.toString()}`
    );
    if (!respuesta.ok) {
      throw new Error('No se pudo exportar el historial de preparacion.');
    }

    const blob = await respuesta.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_preparacion_${fecha}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al exportar historial de preparacion:', error);
    setMessage(
      histCocinaMensaje,
      error.message || 'No se pudo exportar el historial de preparacion.',
      'error'
    );
  }
};

const cargarCocinerosHistorial = async () => {
  if (!histCocinaCocineroSelect) return;
  try {
    const area = histCocinaAreaSelect?.value || 'todas';
    const params = new URLSearchParams();
    if (area) params.append('area', area);

    const resp = await fetchConAutorizacion(
      `/api/preparacion/historial/preparadores?${params.toString()}`
    );
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data?.ok || !Array.isArray(data.preparadores)) return;

    const opts = ['<option value="">Todos</option>'].concat(
      data.preparadores.map((p) => {
        const nombre = p.preparador_nombre || `ID ${p.preparador_id}`;
        return `<option value="${p.preparador_id}">${nombre}</option>`;
      })
    );
    histCocinaCocineroSelect.innerHTML = opts.join('');
  } catch (err) {
    console.warn('No se pudieron cargar los preparadores del historial:', err);
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

    if (abastecimientoTabla) {
      tareas.push(cargarComprasInventario());
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
        console.error('Error al refrescar el panel administrativo tras sincronizaciÃ³n:', error);
      });
    }
  } catch (error) {
    console.warn('No se pudo procesar la sincronizaciÃ³n de administrador:', error);
  }
};

/* =====================
 * Negocios (solo super admin)
 * ===================== */
let KANM_NEGOCIOS_CACHE = [];
let KANM_NEGOCIOS_CARGADO = false;
let empresaUsuarioEstado = null;
let EMPRESAS_TEMPLATE_CACHE = [];
let EMPRESAS_TEMPLATE_MAP = new Map();
const DEFAULT_CONFIG_MODULOS = {
  admin: true,
  mesera: true,
  cocina: true,
  bar: false,
  caja: true,
  mostrador: true,
  historialCocina: true,
};
const DEFAULT_NEGOCIO_COLORS = {
  primario: '#36c1b3',
  secundario: '#91a2f4',
  texto: '#1f2a2a',
  header: '#36c1b3',
  botonPrimario: '#36c1b3',
  botonSecundario: '#91a2f4',
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
  inputEmpresaNombre: document.getElementById('kanm-negocios-empresa-nombre'),
  selectEmpresa: document.getElementById('kanm-negocios-empresa-select'),
  selectEmpresaGroup: document.getElementById('kanm-negocios-empresa-select-group'),
  chkTieneSucursales: document.getElementById('kanm-negocios-tiene-sucursales'),
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
    chkModuloMostrador: document.getElementById('kanm-modulo-mostrador'),
    chkModuloDelivery: document.getElementById('kanm-modulo-delivery'),
    chkModuloHistorial: document.getElementById('kanm-modulo-historial'),
  inputAdminCorreo: document.getElementById('kanm-negocios-admin-correo'),
  inputAdminUsuario: document.getElementById('kanm-negocios-admin-usuario'),
  chkCambiarPassword: document.getElementById('kanm-negocios-cambiar-password'),
  inputAdminPassword: document.getElementById('kanm-negocios-admin-password'),
  adminTitulo: document.getElementById('kanm-negocios-admin-titulo'),
  adminCorreoLabel: document.getElementById('kanm-negocios-admin-correo-label'),
  adminUsuarioLabel: document.getElementById('kanm-negocios-admin-usuario-label'),
  adminUsuarioHelp: document.getElementById('kanm-negocios-admin-usuario-help'),
  adminPasswordLabel: document.getElementById('kanm-negocios-admin-password-label'),
  adminPasswordHelp: document.getElementById('kanm-negocios-admin-password-help'),
  inputLogoUrl: document.getElementById('kanm-negocios-logo-url'),
  btnCerrar: document.getElementById('kanm-negocios-btn-cerrar'),
  mensajeForm: document.getElementById('kanm-negocios-form-mensaje'),
});

const getEmpresaUsuarioDom = () => ({
  modal: document.getElementById('empresa-usuario-modal'),
  titulo: document.getElementById('empresa-usuario-titulo'),
  subtitulo: document.getElementById('empresa-usuario-subtitulo'),
  inputNombre: document.getElementById('empresa-usuario-nombre'),
  inputUsuario: document.getElementById('empresa-usuario-usuario'),
  inputPassword: document.getElementById('empresa-usuario-password'),
  btnCancelar: document.getElementById('empresa-usuario-cancelar'),
  btnGuardar: document.getElementById('empresa-usuario-guardar'),
  mensaje: document.getElementById('empresa-usuario-mensaje'),
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

const construirEmpresasTemplate = () => {
  const lista = KANM_NEGOCIOS_CACHE || [];
  const map = new Map();
  (lista || []).forEach((negocio) => {
    const nombreEmpresa = (negocio?.empresa_nombre || negocio?.empresaNombre || '').trim();
    if (!nombreEmpresa) return;
    const key = normalizarTextoNegocio(nombreEmpresa);
    const id = Number(negocio?.id);
    const existente = map.get(key);
    if (!existente || (Number.isFinite(id) && id < existente.id)) {
      map.set(key, { key, nombre: nombreEmpresa, negocio, id });
    }
  });
  const listaOrdenada = Array.from(map.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  );
  EMPRESAS_TEMPLATE_CACHE = listaOrdenada;
  EMPRESAS_TEMPLATE_MAP = map;
  return listaOrdenada;
};

const aplicarTemaDesdeEmpresa = (negocio = {}, dom) => {
  if (!dom) return;
  const colorPrimario = negocio?.color_primario || negocio?.colorPrimario || DEFAULT_NEGOCIO_COLORS.primario;
  const colorSecundario = negocio?.color_secundario || negocio?.colorSecundario || DEFAULT_NEGOCIO_COLORS.secundario;
  const colorTexto = negocio?.color_texto || negocio?.colorTexto || DEFAULT_NEGOCIO_COLORS.texto;
  const colorHeader =
    negocio?.color_header ||
    negocio?.colorHeader ||
    colorPrimario ||
    colorSecundario ||
    DEFAULT_NEGOCIO_COLORS.header;
  const colorBotonPrimario =
    negocio?.color_boton_primario ||
    negocio?.colorBotonPrimario ||
    colorPrimario ||
    DEFAULT_NEGOCIO_COLORS.botonPrimario;
  const colorBotonSecundario =
    negocio?.color_boton_secundario ||
    negocio?.colorBotonSecundario ||
    colorSecundario ||
    DEFAULT_NEGOCIO_COLORS.botonSecundario;
  const colorBotonPeligro =
    negocio?.color_boton_peligro || negocio?.colorBotonPeligro || DEFAULT_NEGOCIO_COLORS.botonPeligro;
  const logo = negocio?.logo_url || negocio?.logoUrl || '';

  if (dom.inputColorPrimario) dom.inputColorPrimario.value = colorPrimario;
  if (dom.inputColorSecundario) dom.inputColorSecundario.value = colorSecundario;
  if (dom.inputColorTexto) dom.inputColorTexto.value = colorTexto;
  if (dom.inputColorHeader) dom.inputColorHeader.value = colorHeader;
  if (dom.inputColorBotonPrimario) dom.inputColorBotonPrimario.value = colorBotonPrimario;
  if (dom.inputColorBotonSecundario) dom.inputColorBotonSecundario.value = colorBotonSecundario;
  if (dom.inputColorBotonPeligro) dom.inputColorBotonPeligro.value = colorBotonPeligro;
  if (dom.inputLogoUrl) dom.inputLogoUrl.value = logo;
};

const actualizarEmpresasSelect = (selectedNombre = '') => {
  const dom = getNegociosDom();
  if (!dom.selectEmpresa) return;
  const empresas = construirEmpresasTemplate();
  const selectedKey = selectedNombre ? normalizarTextoNegocio(selectedNombre) : '';
  dom.selectEmpresa.innerHTML = [
    '<option value="">Selecciona un grupo...</option>',
    ...empresas.map((item) => `<option value="${item.key}">${item.nombre}</option>`),
  ].join('');
  if (selectedKey && EMPRESAS_TEMPLATE_MAP.has(selectedKey)) {
    dom.selectEmpresa.value = selectedKey;
  } else {
    dom.selectEmpresa.value = '';
  }
};

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
  const disabled = eliminado ? 'disabled' : '';

  const btnEditar = `<button type="button" class="kanm-button ghost kanm-negocios-btn-editar" data-negocio-id="${id}" ${disabled}>Editar</button>`;
  const btnActivar = activo
    ? `<button type="button" class="kanm-button ghost" data-negocio-action="desactivar" data-negocio-id="${id}" ${disabled}>Desactivar</button>`
    : `<button type="button" class="kanm-button ghost" data-negocio-action="activar" data-negocio-id="${id}" ${disabled}>Activar</button>`;
  const btnFacturar = `<button type="button" class="kanm-button ghost" data-negocio-action="facturar-posium" data-negocio-id="${id}" ${disabled}>Generar factura</button>`;
  const btnHistorial = `<button type="button" class="kanm-button ghost" data-negocio-action="historial-posium" data-negocio-id="${id}" ${disabled}>Historial facturas</button>`;
  const btnReset = `<button type="button" class="kanm-button ghost" data-negocio-action="reset-password" data-negocio-id="${id}" ${disabled}>Resetear password</button>`;
  const btnForce = `<button type="button" class="kanm-button ghost" data-negocio-action="force-password" data-negocio-id="${id}" ${disabled}>Forzar cambio</button>`;
  const btnEmpresaUser = `<button type="button" class="kanm-button ghost" data-negocio-action="empresa-user" data-negocio-id="${id}" ${disabled}>Usuario empresa</button>`;
  const btnImpersonar = `<button type="button" class="kanm-button ghost" data-negocio-action="impersonar" data-negocio-id="${id}" ${disabled}>Entrar como negocio</button>`;
  const btnEliminar = `<button type="button" class="kanm-button danger" data-negocio-action="eliminar" data-negocio-id="${id}" ${disabled}>Eliminar</button>`;

  return `${btnEditar}${btnActivar}${btnFacturar}${btnHistorial}${btnReset}${btnForce}${btnEmpresaUser}${btnImpersonar}${btnEliminar}`;
};

const abrirModalEmpresaUsuario = (negocio = {}) => {
  const dom = getEmpresaUsuarioDom();
  if (!dom.modal) return;
  empresaUsuarioEstado = {
    empresaId: negocio?.empresa_id ?? negocio?.empresaId ?? null,
    empresaNombre: negocio?.empresa_nombre || negocio?.empresaNombre || '',
    negocioId: negocio?.id ?? null,
  };
  if (dom.titulo) dom.titulo.textContent = 'Crear usuario empresa';
  if (dom.subtitulo) {
    const etiqueta = empresaUsuarioEstado.empresaNombre || 'Empresa sin nombre';
    dom.subtitulo.textContent = `Empresa: ${etiqueta}`;
  }
  if (dom.inputNombre) dom.inputNombre.value = '';
  if (dom.inputUsuario) dom.inputUsuario.value = '';
  if (dom.inputPassword) dom.inputPassword.value = '';
  if (dom.mensaje) dom.mensaje.textContent = '';
  dom.modal.hidden = false;
  requestAnimationFrame(() => {
    dom.modal.classList.add('is-visible');
  });
};

const cerrarModalEmpresaUsuario = () => {
  const dom = getEmpresaUsuarioDom();
  if (!dom.modal) return;
  dom.modal.classList.remove('is-visible');
  dom.modal.hidden = true;
  empresaUsuarioEstado = null;
  if (dom.mensaje) dom.mensaje.textContent = '';
};

const guardarUsuarioEmpresa = async () => {
  const dom = getEmpresaUsuarioDom();
  if (!dom.modal || !empresaUsuarioEstado?.empresaId) return;
  const nombre = dom.inputNombre?.value?.trim() || '';
  const usuario = dom.inputUsuario?.value?.trim() || '';
  const password = dom.inputPassword?.value?.trim() || '';

  if (!nombre || !usuario || !password) {
    if (dom.mensaje) dom.mensaje.textContent = 'Completa nombre, usuario y contraseña.';
    return;
  }

  try {
    if (dom.mensaje) dom.mensaje.textContent = 'Creando usuario empresa...';
    const resp = await fetchJsonAutorizado(`/api/admin/empresas/${empresaUsuarioEstado.empresaId}/usuarios`, {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        usuario,
        password,
        negocio_id: empresaUsuarioEstado.negocioId || null,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || 'No se pudo crear el usuario empresa');
    }
    if (dom.mensaje) dom.mensaje.textContent = 'Usuario empresa creado.';
    cerrarModalEmpresaUsuario();
  } catch (error) {
    console.error('Error al crear usuario empresa:', error);
    if (dom.mensaje) dom.mensaje.textContent = error.message || 'No se pudo crear el usuario empresa.';
  }
};


const renderNegociosTabla = (lista = [], opciones = {}) => {
  const { tablaBody } = getNegociosDom();
  if (!tablaBody) return;
  tablaBody.innerHTML = '';
  const emptyText = opciones.emptyText || 'No hay negocios registrados.';
  if (!lista.length) {
    tablaBody.innerHTML = `<tr><td colspan="7">${emptyText}</td></tr>`;
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
          <td>${neg.empresa_nombre || neg.empresaNombre || '-'}</td>
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

let negocioModalEsEdicion = false;
const defaultNegocioAdminTexts = {
  titulo: 'Admin principal',
  correo: 'Correo del admin principal',
  usuario: 'Usuario admin (opcional)',
  usuarioHelp: 'Este usuario sera el admin principal del negocio.',
  password: 'Contrase?a admin (opcional)',
  passwordHelp: 'Solo se aplica si activas "Actualizar contrase?a".',
};

const actualizarModoSucursales = (esSucursales) => {
  const dom = getNegociosDom();
  if (!dom) return;
  const usarSucursales = Boolean(esSucursales);
  if (dom.chkTieneSucursales) {
    dom.chkTieneSucursales.checked = usarSucursales;
    dom.chkTieneSucursales.disabled = negocioModalEsEdicion;
  }
  if (dom.selectEmpresaGroup) {
    dom.selectEmpresaGroup.style.display = usarSucursales ? 'none' : '';
  }
  if (!usarSucursales) {
    actualizarEmpresasSelect(dom.inputEmpresaNombre?.value || '');
  } else if (dom.selectEmpresa) {
    dom.selectEmpresa.value = '';
  }
  if (dom.adminTitulo) {
    dom.adminTitulo.textContent = usarSucursales ? 'Usuario empresa' : defaultNegocioAdminTexts.titulo;
  }
  if (dom.adminCorreoLabel) {
    dom.adminCorreoLabel.textContent = usarSucursales
      ? 'Nombre del usuario empresa'
      : defaultNegocioAdminTexts.correo;
  }
  if (dom.inputAdminCorreo) {
    dom.inputAdminCorreo.type = usarSucursales ? 'text' : 'email';
    dom.inputAdminCorreo.placeholder = usarSucursales ? 'Nombre del usuario empresa' : 'admin@negocio.com';
  }
  if (dom.adminUsuarioLabel) {
    dom.adminUsuarioLabel.textContent = usarSucursales
      ? 'Usuario empresa (si es nuevo)'
      : defaultNegocioAdminTexts.usuario;
  }
  if (dom.inputAdminUsuario) {
    dom.inputAdminUsuario.placeholder = usarSucursales ? 'empresa.usuario' : 'admin.negocio';
  }
  if (dom.adminUsuarioHelp) {
    dom.adminUsuarioHelp.textContent = usarSucursales
      ? 'Si ya existe para esta empresa, puedes dejarlo vacio.'
      : defaultNegocioAdminTexts.usuarioHelp;
  }
  if (dom.adminPasswordLabel) {
    dom.adminPasswordLabel.textContent = usarSucursales
      ? 'Contrase?a del usuario empresa (opcional)'
      : defaultNegocioAdminTexts.password;
  }
  if (dom.adminPasswordHelp) {
    dom.adminPasswordHelp.textContent = usarSucursales
      ? 'Se puede dejar vacia para generar una contrase?a temporal.'
      : defaultNegocioAdminTexts.passwordHelp;
  }

  if (usarSucursales && dom.inputEmpresaNombre && dom.inputNombre) {
    if (!dom.inputEmpresaNombre.value) {
      dom.inputEmpresaNombre.value = dom.inputNombre.value || '';
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
    actualizarEmpresasSelect(getNegociosDom().inputEmpresaNombre?.value || '');
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
    if (accion === 'facturar-posium') {
      if (window.kanmFacturacionPosium?.abrirModal) {
        await window.kanmFacturacionPosium.abrirModal(id);
      } else {
        setNegociosMsg('Modulo de facturacion POSIUM no disponible.', 'error');
      }
      return;
    }
    if (accion === 'historial-posium') {
      if (window.kanmFacturacionPosium?.abrirHistorial) {
        await window.kanmFacturacionPosium.abrirHistorial(id);
      } else {
        setNegociosMsg('Modulo de facturacion POSIUM no disponible.', 'error');
      }
      return;
    }
    if (accion === 'empresa-user') {
      const negocio = (KANM_NEGOCIOS_CACHE || []).find((neg) => String(neg.id) === String(id));
      if (!negocio) {
        setNegociosMsg('Negocio no encontrado para crear usuario empresa.', 'error');
        return;
      }
      abrirModalEmpresaUsuario(negocio);
      return;
    }

    setNegociosMsg('Procesando accion...', 'info');
    if (accion === 'activar') {
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/activar`, { method: 'PUT' });
    } else if (accion === 'desactivar') {
      await ejecutarAccionNegocio(`/api/admin/negocios/${id}/desactivar`, { method: 'PUT' });
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
  negocioModalEsEdicion = esEdicion;
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
  if (dom.inputEmpresaNombre) {
    dom.inputEmpresaNombre.value =
      negocioSeleccionado?.empresa_nombre || negocioSeleccionado?.empresaNombre || '';
  }
  actualizarEmpresasSelect(dom.inputEmpresaNombre?.value || '');
  if (dom.chkTieneSucursales) {
    dom.chkTieneSucursales.checked = false;
    dom.chkTieneSucursales.disabled = esEdicion;
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
    if (dom.chkModuloMostrador) dom.chkModuloMostrador.checked = configParsed.mostrador !== false;
    if (dom.chkModuloDelivery) dom.chkModuloDelivery.checked = configParsed.delivery !== false;
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
  actualizarModoSucursales(dom.chkTieneSucursales?.checked);

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
  const tieneSucursales = dom.chkTieneSucursales?.checked === true;

    const configModulos = {
      admin: dom.chkModuloAdmin?.checked !== false,
      mesera: dom.chkModuloMesera?.checked !== false,
      cocina: dom.chkModuloCocina?.checked !== false,
      bar: dom.chkModuloBar?.checked !== false,
      caja: dom.chkModuloCaja?.checked !== false,
      mostrador: dom.chkModuloMostrador?.checked !== false,
      delivery: dom.chkModuloDelivery?.checked !== false,
      historialCocina: dom.chkModuloHistorial?.checked !== false,
    };

  const passwordEditable = dom.chkCambiarPassword?.checked === true;
  const adminPassword = passwordEditable ? dom.inputAdminPassword?.value || null : null;
  if (esEdicion && passwordEditable && !adminPassword) {
    setMessage(dom.mensajeForm, 'Ingresa la nueva contrasena del admin principal.', 'warning');
    return;
  }
  // El usuario empresa puede existir previamente; el backend valida si es obligatorio.

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
    empresa_nombre: dom.inputEmpresaNombre?.value?.trim() || null,
    tiene_sucursales: tieneSucursales ? 1 : 0,
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
    const empresaInfo = data?.empresaUsuario;
    if (adminInfo?.passwordGenerada) {
      alert(
        `Se creÃ³ el usuario admin ${adminInfo.correo} con la contraseÃ±a: ${adminInfo.passwordGenerada}. GuÃ¡rdala, no se mostrarÃ¡ de nuevo.`
      );
    }
    if (empresaInfo?.passwordGenerada) {
      alert(
        `Se creÃ³ el usuario empresa ${empresaInfo.usuario} con la contraseÃ±a: ${empresaInfo.passwordGenerada}. GuÃ¡rdala, no se mostrarÃ¡ de nuevo.`
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
    console.warn('SecciÃ³n de negocios no encontrada');
    return;
  }
  console.log('[Negocios] initNegociosAdmin llamado. APP_SESION:', window.APP_SESION);
  if (!sesion?.esSuperAdmin) {
    console.log('[Negocios] Usuario no es super admin, ocultando secciÃ³n');
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

  if (dom.chkTieneSucursales) {
    dom.chkTieneSucursales.addEventListener('change', (event) => {
      actualizarModoSucursales(event.target.checked);
    });
  }
  if (dom.selectEmpresa) {
    dom.selectEmpresa.addEventListener('change', (event) => {
      const key = event.target.value;
      const template = EMPRESAS_TEMPLATE_MAP.get(key);
      if (!template) return;
      if (dom.inputEmpresaNombre) {
        dom.inputEmpresaNombre.value = template.nombre;
      }
      aplicarTemaDesdeEmpresa(template.negocio, dom);
    });
  }
  if (dom.inputEmpresaNombre) {
    dom.inputEmpresaNombre.addEventListener('input', (event) => {
      if (!dom.selectEmpresa) return;
      const key = normalizarTextoNegocio(event.target.value || '');
      if (key && EMPRESAS_TEMPLATE_MAP.has(key)) {
        dom.selectEmpresa.value = key;
      } else {
        dom.selectEmpresa.value = '';
      }
    });
  }

  const domEmpresa = getEmpresaUsuarioDom();
  if (domEmpresa.btnCancelar) {
    domEmpresa.btnCancelar.addEventListener('click', () => cerrarModalEmpresaUsuario());
  }
  if (domEmpresa.btnGuardar) {
    domEmpresa.btnGuardar.addEventListener('click', () => guardarUsuarioEmpresa());
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

itbisAcreditaGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarConfiguracionItbisAcredita();
});

document.getElementById('factura-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
});

facturaGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarConfiguracionFactura();
});

secuenciasGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarConfigSecuencias();
});

permitirB01Input?.addEventListener('change', marcarSecuenciasDirty);
permitirB02Input?.addEventListener('change', marcarSecuenciasDirty);
permitirB14Input?.addEventListener('change', marcarSecuenciasDirty);

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

  const montoGravado = parseMoneyValueAdmin(compraGravadoInput);
  const impuesto = parseMoneyValueAdmin(compraImpuestoInput);
  const montoExento = parseMoneyValueAdmin(compraExentoInput);
  const totalCompra = parseMoneyValueAdmin(compraTotalInput);

  const payload = {
    proveedor,
    rnc: compraRncInput?.value,
    fecha,
    tipo_comprobante: compraTipoInput?.value,
    ncf: compraNcfInput?.value,
    monto_gravado: Number.isFinite(montoGravado) ? montoGravado : 0,
    impuesto: Number.isFinite(impuesto) ? impuesto : 0,
    monto_exento: Number.isFinite(montoExento) ? montoExento : 0,
    total: Number.isFinite(totalCompra) ? totalCompra : 0,
    comentarios: compraComentariosInput?.value,
    items: detalles,
  };

  try {
    setMessage(compraMensaje, 'Registrando compra...', 'info');
    await registrarCompra(payload);
    setMessage(compraMensaje, 'Compra registrada correctamente.', 'info');
    compraForm.reset();
    setMoneyInputValueAdmin(compraGravadoInput, '');
    setMoneyInputValueAdmin(compraImpuestoInput, '');
    setMoneyInputValueAdmin(compraExentoInput, '');
    setMoneyInputValueAdmin(compraTotalInput, '');
    compraDetallesContainer.innerHTML = '';
    compraDetallesContainer.appendChild(crearFilaDetalle());
    await cargarCompras();
  } catch (error) {
    console.error('Error al registrar compra:', error);
    setMessage(compraMensaje, error.message || 'No se pudo registrar la compra.', 'error');
  }
});

abastecimientoAgregarDetalleBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  if (!abastecimientoDetallesContainer) return;
  abastecimientoDetallesContainer.appendChild(crearFilaAbastecimientoDetalle());
});

abastecimientoDetallesContainer?.addEventListener('input', (event) => {
  if (
    event.target.matches('.abastecimiento-detalle-cantidad') ||
    event.target.matches('.abastecimiento-detalle-costo') ||
    event.target.matches('.abastecimiento-detalle-producto')
  ) {
    recalcularAbastecimientoTotales();
  }
});

abastecimientoAplicaItbisInput?.addEventListener('change', () => {
  recalcularAbastecimientoTotales();
  actualizarEstadoItbisCapitalizable();
});

abastecimientoCancelarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  limpiarFormularioAbastecimiento();
});

abastecimientoForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const proveedor = abastecimientoProveedorInput?.value.trim() || '';
  const fecha = abastecimientoFechaInput?.value;
  const origenFondos = abastecimientoOrigenInput?.value || 'negocio';
  const metodoPago = abastecimientoMetodoInput?.value || '';
  const observaciones = abastecimientoObservacionesInput?.value.trim();

  const { detalles, invalido, subtotal } = obtenerDetallesAbastecimiento();

  if (!proveedor || !fecha || detalles.length === 0 || invalido) {
    setMessage(
      abastecimientoMensaje,
      'Proveedor, fecha y al menos un producto valido son obligatorios.',
      'error'
    );
    return;
  }

  if (origenFondos === 'caja' && !metodoPago) {
    setMessage(abastecimientoMensaje, 'Selecciona el metodo de pago cuando el origen es caja.', 'error');
    return;
  }

  const aplicaItbis = !!abastecimientoAplicaItbisInput?.checked;
  const itbisCapitalizable = !!abastecimientoItbisCapitalizableInput?.checked;
  actualizarResumenAbastecimiento(subtotal || 0);

  const payload = {
    proveedor,
    fecha,
    origen_fondos: origenFondos,
    metodo_pago: metodoPago || null,
    observaciones: observaciones || null,
    aplica_itbis: aplicaItbis ? 1 : 0,
    itbis_capitalizable: itbisCapitalizable ? 1 : 0,
    items: detalles,
  };

  try {
    const edicionId = abastecimientoEditId;
    setMessage(
      abastecimientoMensaje,
      edicionId ? 'Actualizando compra...' : 'Registrando compra...',
      'info'
    );
    await guardarCompraInventario(payload, edicionId);
    setMessage(
      abastecimientoMensaje,
      edicionId ? 'Compra actualizada correctamente.' : 'Compra registrada y stock actualizado.',
      'info'
    );
    limpiarFormularioAbastecimiento();
    await cargarComprasInventario();
    if (edicionId && Number(detalleAbastecimientoActivo) === Number(edicionId)) {
      await cargarDetalleAbastecimiento(edicionId);
    }
    await cargarProductos();
  } catch (error) {
    console.error('Error al registrar compra de inventario:', error);
    setMessage(
      abastecimientoMensaje,
      error.message || 'No se pudo registrar la compra de inventario.',
      'error'
    );
  }
});

abastecimientoTabla?.addEventListener('click', (event) => {
  const botonEditar = event.target.closest('[data-editar-abastecimiento]');
  if (botonEditar) {
    event.preventDefault();
    const id = Number(botonEditar.dataset.editarAbastecimiento);
    if (Number.isFinite(id) && id > 0) {
      cargarEdicionAbastecimiento(id);
    }
    return;
  }

  const boton = event.target.closest('[data-detalle-abastecimiento]');
  if (!boton) return;
  event.preventDefault();
  const id = Number(boton.dataset.detalleAbastecimiento);
  if (Number.isFinite(id) && id > 0) {
    cargarDetalleAbastecimiento(id);
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
    tipo_gasto: valores.tipo_gasto || 'OPERATIVO',
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
  if (gastosTipoFiltroInput) gastosTipoFiltroInput.value = '';
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

analisisCapitalAbrirBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  abrirModalCapitalInicial();
});

analisisCapitalCerrarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  cerrarModalCapitalInicial();
});

analisisCapitalCancelarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  cerrarModalCapitalInicial();
});

analisisCapitalGuardarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  guardarCapitalInicialAnalisis();
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
      'Esta acciÃ³n es irreversible. Confirma que deseas eliminar el registro de cuadre de caja seleccionado.',
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
histCocinaAreaSelect?.addEventListener('change', () => {
  cargarCocinerosHistorial();
  cargarHistorialCocina(1);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (modalEliminarOverlay && !modalEliminarOverlay.hidden) {
    cerrarModalEliminar();
    return;
  }
  if (productosVistaModal && !productosVistaModal.classList.contains('oculto')) {
    cerrarVistaCompletaProductos();
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  mostrarBotonVolverEmpresa();
  configurarBotonPanelEmpresa();
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
  if (abastecimientoFechaInput && !abastecimientoFechaInput.value) {
    abastecimientoFechaInput.value = fechaHoy;
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
  ajustarRolesUsuariosUI();
  await cargarCategorias();
  const tabInicial = obtenerTabInicialAdmin();
  mostrarTabAdmin(tabInicial);

  const esAdmin = esRolAdmin(usuarioActual?.rol);
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
    cargarConfiguracionItbisAcredita(),
    cargarConfiguracionFactura(),
    cargarConfigSecuencias(),
    cargarCompras(),
    cargarComprasInventario(),
    cargarGastos(),
    cargarAnalisis(),
    cargarUsuarios(usuariosRolSelect?.value || 'mesera'),
  ]);
  if (compraDetallesContainer) {
    compraDetallesContainer.appendChild(crearFilaDetalle());
  }
  if (abastecimientoDetallesContainer) {
    abastecimientoDetallesContainer.appendChild(crearFilaAbastecimientoDetalle());
    recalcularAbastecimientoTotales();
    establecerItbisCapitalizableDefault();
    actualizarEstadoItbisCapitalizable();
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
      console.error('Error al refrescar el panel administrativo al volver a la pestaÃ±a:', error);
    });
  }
});





