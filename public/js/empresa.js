(() => {
  const authApi = window.kanmAuth;
  const sessionApi = window.KANMSession;
  const EMPRESA_BACKUP_KEY = 'kanmEmpresaBackup';

  const kpiVentas = document.getElementById('empresa-kpi-ventas');
  const kpiVentasCount = document.getElementById('empresa-kpi-ventas-count');
  const kpiGastos = document.getElementById('empresa-kpi-gastos');
  const kpiGanancia = document.getElementById('empresa-kpi-ganancia');
  const kpiTicket = document.getElementById('empresa-kpi-ticket');
  const kpiNomina = document.getElementById('empresa-kpi-nomina');
  const kpiDeudas = document.getElementById('empresa-kpi-deudas');
  const kpiUsuarios = document.getElementById('empresa-kpi-usuarios');

  const desdeInput = document.getElementById('empresa-desde');
  const hastaInput = document.getElementById('empresa-hasta');
  const actualizarBtn = document.getElementById('empresa-actualizar');
  const mensajeEl = document.getElementById('empresa-mensaje');
  const tablaBody = document.getElementById('empresa-sucursales-body');
  const totalSucursalesEl = document.getElementById('empresa-total-sucursales');
  const supervisoresListosEl = document.getElementById('empresa-supervisores-listos');
  const supervisoresPendientesEl = document.getElementById('empresa-supervisores-pendientes');
  const quickSucursalSelect = document.getElementById('empresa-quick-sucursal-select');
  const quickSupervisorSelect = document.getElementById('empresa-quick-supervisor-select');
  const quickSupervisorBtn = document.getElementById('empresa-quick-supervisor-btn');
  const empresaTabs = Array.from(document.querySelectorAll('[data-empresa-tab]'));
  const empresaPanels = Array.from(document.querySelectorAll('[data-empresa-section]'));
  const empresaTabTargets = Array.from(document.querySelectorAll('[data-empresa-tab-target]'));

  const supervisorModal = document.getElementById('empresa-supervisor-modal');
  const supervisorSubtitulo = document.getElementById('empresa-supervisor-subtitulo');
  const supervisorNombreInput = document.getElementById('empresa-supervisor-nombre');
  const supervisorUsuarioInput = document.getElementById('empresa-supervisor-usuario');
  const supervisorPasswordInput = document.getElementById('empresa-supervisor-password');
  const supervisorCancelarBtn = document.getElementById('empresa-supervisor-cancelar');
  const supervisorGuardarBtn = document.getElementById('empresa-supervisor-guardar');
  const supervisorMensaje = document.getElementById('empresa-supervisor-mensaje');
  let supervisorModalState = null;
  let sucursalesCache = [];
  let inventarioItems = [];
  let inventarioScope = { tipo: 'empresa', negocioId: null };
  let inventarioMetodoValoracion = 'PROMEDIO';
  let inventarioMovimientos = [];
  let empleadosEmpresa = [];
  let nominaDetalleMap = new Map();
  let gastosEmpresa = [];
  let gastosViewMode = 'cards';
  let gastoModalAccion = 'borrador';
  let gastoSeleccionadoId = null;
  let clientesEmpresa = [];
  let clientesViewMode = 'cards';
  let clienteActual = null;
  let clienteDeudas = [];
  let clientePagos = [];
  let clienteNotas = [];
  let clienteGuardarAbrirEstado = false;
  let clienteEstadoId = null;
  let clienteAbonoId = null;
  let clienteFacturaItems = [];
  let clienteFacturaProductos = [];
  let clienteFacturaImpuestoPorcentaje = 0;
  let clienteFacturaNegocioId = null;
  let facturasEmpresa = [];
  let contaAsientosLineas = [];
  let facturaEmpresaItems = [];
  let facturaEmpresaProductos = [];
  let facturaEmpresaClientes = [];
  let facturaEmpresaImpuestoPorcentaje = 0;
  let facturaEmpresaNegocioId = null;
  let facturaEmpresaDestinos = new Map();

  const inventarioNuevoBtn = document.getElementById('empresa-inventario-nuevo');
  const inventarioBuscarInput = document.getElementById('empresa-inventario-buscar');
  const inventarioCategoriaInput = document.getElementById('empresa-inventario-categoria');
  const inventarioTipoSelect = document.getElementById('empresa-inventario-tipo');
  const inventarioEstadoSelect = document.getElementById('empresa-inventario-estado');
  const inventarioStockSelect = document.getElementById('empresa-inventario-stock');
  const inventarioTagInput = document.getElementById('empresa-inventario-tag');
  const inventarioBodegaInput = document.getElementById('empresa-inventario-bodega');
  const inventarioUbicacionInput = document.getElementById('empresa-inventario-ubicacion');
  const inventarioFiltrarBtn = document.getElementById('empresa-inventario-filtrar');
  const inventarioLimpiarBtn = document.getElementById('empresa-inventario-limpiar');
  const inventarioMensaje = document.getElementById('empresa-inventario-mensaje');
  const inventarioTotalEl = document.getElementById('empresa-inventario-total');
  const inventarioCriticoEl = document.getElementById('empresa-inventario-critico');
  const inventarioBajoEl = document.getElementById('empresa-inventario-bajo');
  const inventarioValorEl = document.getElementById('empresa-inventario-valor');
  const inventarioScopeSelect = document.getElementById('empresa-inventario-scope');
  const inventarioMetodoSelect = document.getElementById('empresa-inventario-metodo');
  const inventarioMovNuevoBtn = document.getElementById('empresa-inventario-movimiento-nuevo');
  const inventarioSelectAll = document.getElementById('empresa-inventario-select-all');
  const inventarioBulkActivarBtn = document.getElementById('empresa-inventario-bulk-activar');
  const inventarioBulkDesactivarBtn = document.getElementById('empresa-inventario-bulk-desactivar');
  const inventarioBulkPrecioBtn = document.getElementById('empresa-inventario-bulk-precio');
  const inventarioModal = document.getElementById('empresa-inventario-modal');
  const inventarioModalCancelarBtn = document.getElementById('empresa-inventario-cancelar');
  const inventarioMovSection = document.getElementById('empresa-inventario-movimientos');

  const inventarioMovDesdeInput = document.getElementById('empresa-inventario-mov-desde');
  const inventarioMovHastaInput = document.getElementById('empresa-inventario-mov-hasta');
  const inventarioMovProductoSelect = document.getElementById('empresa-inventario-mov-producto');
  const inventarioMovTipoSelect = document.getElementById('empresa-inventario-mov-tipo');
  const inventarioMovFiltrarBtn = document.getElementById('empresa-inventario-mov-filtrar');
  const inventarioMovMensaje = document.getElementById('empresa-inventario-mov-mensaje');
  const inventarioMovBody = document.getElementById('empresa-inventario-mov-body');

  const inventarioMovModal = document.getElementById('empresa-inventario-mov-modal');
  const inventarioMovForm = document.getElementById('empresa-inventario-mov-form');
  const inventarioMovProductoForm = document.getElementById('empresa-inventario-mov-producto-form');
  const inventarioMovTipoForm = document.getElementById('empresa-inventario-mov-tipo-form');
  const inventarioMovCantidadInput = document.getElementById('empresa-inventario-mov-cantidad');
  const inventarioMovCostoInput = document.getElementById('empresa-inventario-mov-costo');
  const inventarioMovFechaInput = document.getElementById('empresa-inventario-mov-fecha');
  const inventarioMovAjusteNegativoInput = document.getElementById('empresa-inventario-mov-ajuste-negativo');
  const inventarioMovMotivoInput = document.getElementById('empresa-inventario-mov-motivo');
  const inventarioMovReferenciaInput = document.getElementById('empresa-inventario-mov-referencia');
  const inventarioMovCancelarBtn = document.getElementById('empresa-inventario-mov-cancelar');
  const inventarioMovEstado = document.getElementById('empresa-inventario-mov-estado');

  const productoForm = document.getElementById('empresa-producto-form');
  const productoIdInput = document.getElementById('empresa-producto-id');
  const productoNombreInput = document.getElementById('empresa-producto-nombre');
  const productoCategoriaInput = document.getElementById('empresa-producto-categoria');
  const productoFamiliaInput = document.getElementById('empresa-producto-familia');
  const productoTagsInput = document.getElementById('empresa-producto-tags');
  const productoUbicacionInput = document.getElementById('empresa-producto-ubicacion');
  const productoBodegaInput = document.getElementById('empresa-producto-bodega');
  const productoStockInput = document.getElementById('empresa-producto-stock');
  const productoStockMinInput = document.getElementById('empresa-producto-stock-minimo');
  const productoStockIndefInput = document.getElementById('empresa-producto-stock-indefinido');
  const productoSerializableInput = document.getElementById('empresa-producto-serializable');
  const productoTipoSelect = document.getElementById('empresa-producto-tipo');
  const productoCostoInput = document.getElementById('empresa-producto-costo');
  const productoPrecioInput = document.getElementById('empresa-producto-precio');
  const productoAtributosInput = document.getElementById('empresa-producto-atributos');
  const productoActivoInput = document.getElementById('empresa-producto-activo');
  const productoGuardarBtn = document.getElementById('empresa-producto-guardar');
  const productoLimpiarBtn = document.getElementById('empresa-producto-limpiar');
  const productoMensaje = document.getElementById('empresa-producto-mensaje');
  const productosBody = document.getElementById('empresa-inventario-body');

  const nominaDesdeInput = document.getElementById('empresa-nomina-desde');
  const nominaHastaInput = document.getElementById('empresa-nomina-hasta');
  const nominaActualizarBtn = document.getElementById('empresa-nomina-actualizar');
  const nominaMensaje = document.getElementById('empresa-nomina-mensaje');
  const nominaSueldosEl = document.getElementById('empresa-nomina-sueldos');
  const nominaComisionesEl = document.getElementById('empresa-nomina-comisiones');
  const nominaBonosEl = document.getElementById('empresa-nomina-bonos');
  const nominaDeduccionesEl = document.getElementById('empresa-nomina-deducciones');
  const nominaTotalEl = document.getElementById('empresa-nomina-total');
  const nominaBody = document.getElementById('empresa-nomina-body');

  const empleadoForm = document.getElementById('empresa-empleado-form');
  const empleadoIdInput = document.getElementById('empresa-empleado-id');
  const empleadoNombreInput = document.getElementById('empresa-empleado-nombre');
  const empleadoDocumentoInput = document.getElementById('empresa-empleado-documento');
  const empleadoTelefonoInput = document.getElementById('empresa-empleado-telefono');
  const empleadoCargoInput = document.getElementById('empresa-empleado-cargo');
  const empleadoSucursalSelect = document.getElementById('empresa-empleado-sucursal');
  const empleadoTipoSelect = document.getElementById('empresa-empleado-tipo');
  const empleadoSueldoInput = document.getElementById('empresa-empleado-sueldo');
  const empleadoTarifaInput = document.getElementById('empresa-empleado-tarifa');
  const empleadoArsInput = document.getElementById('empresa-empleado-ars');
  const empleadoAfpInput = document.getElementById('empresa-empleado-afp');
  const empleadoIsrInput = document.getElementById('empresa-empleado-isr');
  const empleadoActivoInput = document.getElementById('empresa-empleado-activo');
  const empleadoMensaje = document.getElementById('empresa-empleado-mensaje');
  const empleadoLimpiarBtn = document.getElementById('empresa-empleado-limpiar');
  const empleadosBody = document.getElementById('empresa-empleados-body');

  const asistenciaForm = document.getElementById('empresa-asistencia-form');
  const asistenciaEmpleadoSelect = document.getElementById('empresa-asistencia-empleado');
  const asistenciaFechaInput = document.getElementById('empresa-asistencia-fecha');
  const asistenciaEntradaInput = document.getElementById('empresa-asistencia-entrada');
  const asistenciaSalidaInput = document.getElementById('empresa-asistencia-salida');
  const asistenciaMensaje = document.getElementById('empresa-asistencia-mensaje');

  const movimientoForm = document.getElementById('empresa-movimiento-form');
  const movimientoEmpleadoSelect = document.getElementById('empresa-movimiento-empleado');
  const movimientoTipoSelect = document.getElementById('empresa-movimiento-tipo');
  const movimientoMontoInput = document.getElementById('empresa-movimiento-monto');
  const movimientoFechaInput = document.getElementById('empresa-movimiento-fecha');
  const movimientoNotasInput = document.getElementById('empresa-movimiento-notas');
  const movimientoMensaje = document.getElementById('empresa-movimiento-mensaje');

  const contaDesdeInput = document.getElementById('empresa-conta-desde');
  const contaHastaInput = document.getElementById('empresa-conta-hasta');
  const contaActualizarBtn = document.getElementById('empresa-conta-actualizar');
  const contaMensaje = document.getElementById('empresa-conta-mensaje');
  const contaActivosEl = document.getElementById('empresa-conta-activos');
  const contaPasivosEl = document.getElementById('empresa-conta-pasivos');
  const contaPatrimonioEl = document.getElementById('empresa-conta-patrimonio');
  const contaIngresosEl = document.getElementById('empresa-conta-ingresos');
  const contaCostosEl = document.getElementById('empresa-conta-costos');
  const contaGastosEl = document.getElementById('empresa-conta-gastos');
  const contaResultadoEl = document.getElementById('empresa-conta-resultado');
  const contaCuentasBody = document.getElementById('empresa-conta-cuentas-body');
  const contaAsientosBody = document.getElementById('empresa-conta-asientos-body');
  const contaAsientosSucursalSelect = document.getElementById('empresa-conta-asientos-sucursal');
  const contaResultadosBody = document.getElementById('empresa-conta-resultados-body');
  const contaBalanceBody = document.getElementById('empresa-conta-balance-body');
  const contaMayorSelect = document.getElementById('empresa-conta-mayor-cuenta');
  const contaMayorBtn = document.getElementById('empresa-conta-mayor-actualizar');
  const contaMayorMensaje = document.getElementById('empresa-conta-mayor-mensaje');
  const contaMayorBody = document.getElementById('empresa-conta-mayor-body');

  const gastosNuevoBtn = document.getElementById('empresa-gastos-nuevo');
  const gastosViewToggle = document.getElementById('empresa-gastos-view-toggle');
  const gastosTotalEl = document.getElementById('empresa-gastos-total');
  const gastosPendientesEl = document.getElementById('empresa-gastos-pendientes');
  const gastosPagadosEl = document.getElementById('empresa-gastos-pagados');
  const gastosBuscarInput = document.getElementById('empresa-gastos-buscar');
  const gastosDesdeInput = document.getElementById('empresa-gastos-desde');
  const gastosHastaInput = document.getElementById('empresa-gastos-hasta');
  const gastosEstadoSelect = document.getElementById('empresa-gastos-estado');
  const gastosCategoriaInput = document.getElementById('empresa-gastos-categoria');
  const gastosTipoSelect = document.getElementById('empresa-gastos-tipo');
  const gastosMetodoSelect = document.getElementById('empresa-gastos-metodo');
  const gastosOrigenSelect = document.getElementById('empresa-gastos-origen');
  const gastosOrigenDetalleInput = document.getElementById('empresa-gastos-origen-detalle');
  const gastosProveedorInput = document.getElementById('empresa-gastos-proveedor');
  const gastosMinInput = document.getElementById('empresa-gastos-min');
  const gastosMaxInput = document.getElementById('empresa-gastos-max');
  const gastosSucursalSelect = document.getElementById('empresa-gastos-sucursal');
  const gastosOrdenSelect = document.getElementById('empresa-gastos-orden');
  const gastosFiltrarBtn = document.getElementById('empresa-gastos-filtrar');
  const gastosLimpiarBtn = document.getElementById('empresa-gastos-limpiar');
  const gastosMensaje = document.getElementById('empresa-gastos-mensaje');
  const gastosCardsEl = document.getElementById('empresa-gastos-cards');
  const gastosTablaBody = document.getElementById('empresa-gastos-tabla-body');
  const gastosSelectAll = document.getElementById('empresa-gastos-select-all');
  const gastosBulkAprobarBtn = document.getElementById('empresa-gastos-bulk-aprobar');
  const gastosBulkAnularBtn = document.getElementById('empresa-gastos-bulk-anular');
  const gastosCategoriasList = document.getElementById('empresa-gastos-categorias');
  const gastosProveedoresList = document.getElementById('empresa-gastos-proveedores');
  const gastosOrigenesList = document.getElementById('empresa-gastos-origenes');

  const gastoModal = document.getElementById('empresa-gasto-modal');
  const gastoModalTitulo = document.getElementById('empresa-gasto-modal-titulo');
  const gastoModalSubtitulo = document.getElementById('empresa-gasto-modal-subtitulo');
  const gastoForm = document.getElementById('empresa-gasto-form');
  const gastoIdInput = document.getElementById('empresa-gasto-id');
  const gastoSucursalSelect = document.getElementById('empresa-gasto-sucursal');
  const gastoFechaInput = document.getElementById('empresa-gasto-fecha');
  const gastoConceptoInput = document.getElementById('empresa-gasto-concepto');
  const gastoCategoriaInput = document.getElementById('empresa-gasto-categoria');
  const gastoMontoInput = document.getElementById('empresa-gasto-monto');
  const gastoMonedaSelect = document.getElementById('empresa-gasto-moneda');
  const gastoTipoSelect = document.getElementById('empresa-gasto-tipo');
  const gastoItbisInput = document.getElementById('empresa-gasto-itbis');
  const gastoProveedorInput = document.getElementById('empresa-gasto-proveedor');
  const gastoReferenciaInput = document.getElementById('empresa-gasto-referencia');
  const gastoMetodoSelect = document.getElementById('empresa-gasto-metodo');
  const gastoOrigenSelect = document.getElementById('empresa-gasto-origen');
  const gastoOrigenDetalleInput = document.getElementById('empresa-gasto-origen-detalle');
  const gastoFechaVencInput = document.getElementById('empresa-gasto-fecha-venc');
  const gastoTipoComprobanteSelect = document.getElementById('empresa-gasto-tipo-comprobante');
  const gastoNcfInput = document.getElementById('empresa-gasto-ncf');
  const gastoCentroInput = document.getElementById('empresa-gasto-centro');
  const gastoTagsInput = document.getElementById('empresa-gasto-tags');
  const gastoCancelarBtn = document.getElementById('empresa-gasto-cancelar');
  const gastoMensaje = document.getElementById('empresa-gasto-mensaje');

  const gastoViewModal = document.getElementById('empresa-gasto-view-modal');
  const gastoViewTitulo = document.getElementById('empresa-gasto-view-titulo');
  const gastoViewSubtitulo = document.getElementById('empresa-gasto-view-subtitulo');
  const gastoViewResumen = document.getElementById('empresa-gasto-view-resumen');
  const gastoViewTimeline = document.getElementById('empresa-gasto-view-timeline');
  const gastoViewPagos = document.getElementById('empresa-gasto-view-pagos');
  const gastoViewEditarBtn = document.getElementById('empresa-gasto-view-editar');
  const gastoViewAprobarBtn = document.getElementById('empresa-gasto-view-aprobar');
  const gastoViewPagarBtn = document.getElementById('empresa-gasto-view-pagar');
  const gastoViewAnularBtn = document.getElementById('empresa-gasto-view-anular');
  const gastoViewCerrarBtn = document.getElementById('empresa-gasto-view-cerrar');

  const gastoPagoModal = document.getElementById('empresa-gasto-pago-modal');
  const gastoPagoForm = document.getElementById('empresa-gasto-pago-form');
  const gastoPagoFechaInput = document.getElementById('empresa-gasto-pago-fecha');
  const gastoPagoMontoInput = document.getElementById('empresa-gasto-pago-monto');
  const gastoPagoMetodoSelect = document.getElementById('empresa-gasto-pago-metodo');
  const gastoPagoOrigenSelect = document.getElementById('empresa-gasto-pago-origen');
  const gastoPagoOrigenDetalleInput = document.getElementById('empresa-gasto-pago-origen-detalle');
  const gastoPagoReferenciaInput = document.getElementById('empresa-gasto-pago-referencia');
  const gastoPagoNotasInput = document.getElementById('empresa-gasto-pago-notas');
  const gastoPagoCancelarBtn = document.getElementById('empresa-gasto-pago-cancelar');
  const gastoPagoMensaje = document.getElementById('empresa-gasto-pago-mensaje');

  const gastoAnularModal = document.getElementById('empresa-gasto-anular-modal');
  const gastoAnularMotivoInput = document.getElementById('empresa-gasto-anular-motivo');
  const gastoAnularConfirmInput = document.getElementById('empresa-gasto-anular-confirm');
  const gastoAnularCancelarBtn = document.getElementById('empresa-gasto-anular-cancelar');
  const gastoAnularConfirmarBtn = document.getElementById('empresa-gasto-anular-confirmar');
  const gastoAnularMensaje = document.getElementById('empresa-gasto-anular-mensaje');

  const clientesNuevoBtn = document.getElementById('empresa-clientes-nuevo');
  const clientesImportarBtn = document.getElementById('empresa-clientes-importar');
  const clientesExportarBtn = document.getElementById('empresa-clientes-exportar');
  const clientesBuscarInput = document.getElementById('empresa-clientes-buscar');
  const clientesSegmentoSelect = document.getElementById('empresa-clientes-segmento');
  const clientesEstadoSelect = document.getElementById('empresa-clientes-estado');
  const clientesCreditoSelect = document.getElementById('empresa-clientes-credito');
  const clientesBalanceSelect = document.getElementById('empresa-clientes-balance');
  const clientesScopeSelect = document.getElementById('empresa-clientes-scope');
  const clientesSucursalSelect = document.getElementById('empresa-clientes-sucursal');
  const clientesOrdenSelect = document.getElementById('empresa-clientes-orden');
  const clientesVipCheck = document.getElementById('empresa-clientes-vip');
  const clientesFiltrarBtn = document.getElementById('empresa-clientes-filtrar');
  const clientesLimpiarBtn = document.getElementById('empresa-clientes-limpiar');
  const clientesMensaje = document.getElementById('empresa-clientes-mensaje');
  const clientesTotalEl = document.getElementById('empresa-clientes-total');
  const clientesVipTotalEl = document.getElementById('empresa-clientes-vip-total');
  const clientesMoraTotalEl = document.getElementById('empresa-clientes-mora-total');
  const clientesSaldoTotalEl = document.getElementById('empresa-clientes-saldo-total');
  const clientesCardsEl = document.getElementById('empresa-clientes-cards');
  const clientesTablaBody = document.getElementById('empresa-clientes-tabla-body');
  const clientesSelectAll = document.getElementById('empresa-clientes-select-all');
  const clientesViewToggle = document.getElementById('empresa-clientes-view-toggle');
  const clientesBulkVipBtn = document.getElementById('empresa-clientes-bulk-vip');
  const clientesBulkActivarBtn = document.getElementById('empresa-clientes-bulk-activar');
  const clientesBulkBloquearBtn = document.getElementById('empresa-clientes-bulk-bloquear');

  const clienteModal = document.getElementById('empresa-cliente-modal');
  const clienteModalTitulo = document.getElementById('empresa-cliente-modal-titulo');
  const clienteModalSubtitulo = document.getElementById('empresa-cliente-modal-subtitulo');
  const clienteForm = document.getElementById('empresa-cliente-form');
  const clienteIdInput = document.getElementById('empresa-cliente-id');
  const clienteNombreInput = document.getElementById('empresa-cliente-nombre');
  const clienteDocumentoInput = document.getElementById('empresa-cliente-documento');
  const clienteTipoDocumentoSelect = document.getElementById('empresa-cliente-tipo-documento');
  const clienteTipoSelect = document.getElementById('empresa-cliente-tipo');
  const clienteCodigoInput = document.getElementById('empresa-cliente-codigo');
  const clienteSegmentoSelect = document.getElementById('empresa-cliente-segmento');
  const clienteEstadoSelect = document.getElementById('empresa-cliente-estado');
  const clienteSucursalSelect = document.getElementById('empresa-cliente-sucursal');
  const clienteVipInput = document.getElementById('empresa-cliente-vip');
  const clienteTelefonoInput = document.getElementById('empresa-cliente-telefono');
  const clienteWhatsappInput = document.getElementById('empresa-cliente-whatsapp');
  const clienteEmailInput = document.getElementById('empresa-cliente-email');
  const clienteDireccionInput = document.getElementById('empresa-cliente-direccion');
  const clienteCumpleInput = document.getElementById('empresa-cliente-cumple');
  const clienteCreditoActivoInput = document.getElementById('empresa-cliente-credito-activo');
  const clienteCreditoLimiteInput = document.getElementById('empresa-cliente-credito-limite');
  const clienteCreditoDiasInput = document.getElementById('empresa-cliente-credito-dias');
  const clienteCreditoBloqueoInput = document.getElementById('empresa-cliente-credito-bloqueo');
  const clienteMetodoInput = document.getElementById('empresa-cliente-metodo');
  const clienteTagsInput = document.getElementById('empresa-cliente-tags');
  const clienteNotasInput = document.getElementById('empresa-cliente-notas');
  const clienteNotasInternasInput = document.getElementById('empresa-cliente-notas-internas');
  const clienteCancelarBtn = document.getElementById('empresa-cliente-cancelar');
  const clienteGuardarEstadoBtn = document.getElementById('empresa-cliente-guardar-estado');
  const clienteGuardarBtn = document.getElementById('empresa-cliente-guardar');
  const clienteMensaje = document.getElementById('empresa-cliente-mensaje');

  const clienteViewModal = document.getElementById('empresa-cliente-view-modal');
  const clienteViewNombre = document.getElementById('empresa-cliente-view-nombre');
  const clienteViewSubtitulo = document.getElementById('empresa-cliente-view-subtitulo');
  const clienteViewInfo = document.getElementById('empresa-cliente-view-info');
  const clienteViewEditarBtn = document.getElementById('empresa-cliente-view-editar');
  const clienteViewAbonarBtn = document.getElementById('empresa-cliente-view-abonar');
  const clienteViewEstadoBtn = document.getElementById('empresa-cliente-view-estado');
  const clienteViewBloquearBtn = document.getElementById('empresa-cliente-view-bloquear');
  const clienteViewCerrarBtn = document.getElementById('empresa-cliente-view-cerrar');
  const clienteKpiTotalEl = document.getElementById('empresa-cliente-kpi-total');
  const clienteKpiComprasEl = document.getElementById('empresa-cliente-kpi-compras');
  const clienteKpiTicketEl = document.getElementById('empresa-cliente-kpi-ticket');
  const clienteKpiSaldoEl = document.getElementById('empresa-cliente-kpi-saldo');
  const clienteComprasBody = document.getElementById('empresa-cliente-compras-body');
  const clienteCxcBody = document.getElementById('empresa-cliente-cxc-body');
  const clientePagosBody = document.getElementById('empresa-cliente-pagos-body');
  const clienteNotaForm = document.getElementById('empresa-cliente-nota-form');
  const clienteNotaTexto = document.getElementById('empresa-cliente-nota-texto');
  const clienteNotaMensaje = document.getElementById('empresa-cliente-nota-mensaje');
  const clienteNotasList = document.getElementById('empresa-cliente-notas-list');
  const clienteNuevaFacturaBtn = document.getElementById('empresa-cliente-nueva-factura');

  const clienteAbonoModal = document.getElementById('empresa-cliente-abono-modal');
  const clienteAbonoForm = document.getElementById('empresa-cliente-abono-form');
  const clienteAbonoClienteId = document.getElementById('empresa-cliente-abono-cliente-id');
  const clienteAbonoDeudaSelect = document.getElementById('empresa-cliente-abono-deuda');
  const clienteAbonoFechaInput = document.getElementById('empresa-cliente-abono-fecha');
  const clienteAbonoMontoInput = document.getElementById('empresa-cliente-abono-monto');
  const clienteAbonoMetodoSelect = document.getElementById('empresa-cliente-abono-metodo');
  const clienteAbonoNotasInput = document.getElementById('empresa-cliente-abono-notas');
  const clienteAbonoCancelarBtn = document.getElementById('empresa-cliente-abono-cancelar');
  const clienteAbonoMensaje = document.getElementById('empresa-cliente-abono-mensaje');

  const clienteEstadoModal = document.getElementById('empresa-cliente-estado-modal');
  const clienteEstadoDesdeInput = document.getElementById('empresa-cliente-estado-desde');
  const clienteEstadoHastaInput = document.getElementById('empresa-cliente-estado-hasta');
  const clienteEstadoActualizarBtn = document.getElementById('empresa-cliente-estado-actualizar');
  const clienteEstadoImprimirBtn = document.getElementById('empresa-cliente-estado-imprimir');
  const clienteEstadoCerrarBtn = document.getElementById('empresa-cliente-estado-cerrar');
  const clienteEstadoTotalEl = document.getElementById('empresa-cliente-estado-total');
  const clienteEstadoPagadoEl = document.getElementById('empresa-cliente-estado-pagado');
  const clienteEstadoSaldoEl = document.getElementById('empresa-cliente-estado-saldo');
  const clienteEstadoBody = document.getElementById('empresa-cliente-estado-body');

  const clienteFacturaModal = document.getElementById('empresa-cliente-factura-modal');
  const clienteFacturaForm = document.getElementById('empresa-cliente-factura-form');
  const clienteFacturaClienteId = document.getElementById('empresa-cliente-factura-cliente-id');
  const clienteFacturaFechaInput = document.getElementById('empresa-cliente-factura-fecha');
  const clienteFacturaDescripcionInput = document.getElementById('empresa-cliente-factura-descripcion');
  const clienteFacturaProductoSelect = document.getElementById('empresa-cliente-factura-producto');
  const clienteFacturaCantidadInput = document.getElementById('empresa-cliente-factura-cantidad');
  const clienteFacturaAgregarBtn = document.getElementById('empresa-cliente-factura-agregar');
  const clienteFacturaItemsBody = document.getElementById('empresa-cliente-factura-items-body');
  const clienteFacturaNotasInput = document.getElementById('empresa-cliente-factura-notas');
  const clienteFacturaSubtotalInput = document.getElementById('empresa-cliente-factura-subtotal');
  const clienteFacturaItbisInput = document.getElementById('empresa-cliente-factura-itbis');
  const clienteFacturaItbisLabel = document.getElementById('empresa-cliente-factura-itbis-label');
  const clienteFacturaTotalInput = document.getElementById('empresa-cliente-factura-total');
  const clienteFacturaCancelarBtn = document.getElementById('empresa-cliente-factura-cancelar');
  const clienteFacturaMensaje = document.getElementById('empresa-cliente-factura-mensaje');
  const facturasNuevoBtn = document.getElementById('empresa-facturas-nuevo');
  const facturasBuscarInput = document.getElementById('empresa-facturas-buscar');
  const facturasDesdeInput = document.getElementById('empresa-facturas-desde');
  const facturasHastaInput = document.getElementById('empresa-facturas-hasta');
  const facturasEstadoSelect = document.getElementById('empresa-facturas-estado');
  const facturasSucursalSelect = document.getElementById('empresa-facturas-sucursal');
  const facturasOrdenSelect = document.getElementById('empresa-facturas-orden');
  const facturasFiltrarBtn = document.getElementById('empresa-facturas-filtrar');
  const facturasLimpiarBtn = document.getElementById('empresa-facturas-limpiar');
  const facturasMensaje = document.getElementById('empresa-facturas-mensaje');
  const facturasTotalEl = document.getElementById('empresa-facturas-total');
  const facturasPagadoEl = document.getElementById('empresa-facturas-pagado');
  const facturasSaldoEl = document.getElementById('empresa-facturas-saldo');
  const facturasCountEl = document.getElementById('empresa-facturas-count');
  const facturasTablaBody = document.getElementById('empresa-facturas-body');
  const facturaEmpresaModal = document.getElementById('empresa-factura-modal');
  const facturaEmpresaForm = document.getElementById('empresa-factura-form');
  const facturaEmpresaClienteSelect = document.getElementById('empresa-factura-cliente');
  const facturaEmpresaFechaInput = document.getElementById('empresa-factura-fecha');
  const facturaEmpresaDescripcionInput = document.getElementById('empresa-factura-descripcion');
  const facturaEmpresaProductoSelect = document.getElementById('empresa-factura-producto');
  const facturaEmpresaCantidadInput = document.getElementById('empresa-factura-cantidad');
  const facturaEmpresaAgregarBtn = document.getElementById('empresa-factura-agregar');
  const facturaEmpresaItemsBody = document.getElementById('empresa-factura-items-body');
  const facturaEmpresaNotasInput = document.getElementById('empresa-factura-notas');
  const facturaEmpresaSubtotalInput = document.getElementById('empresa-factura-subtotal');
  const facturaEmpresaItbisInput = document.getElementById('empresa-factura-itbis');
  const facturaEmpresaItbisLabel = document.getElementById('empresa-factura-itbis-label');
  const facturaEmpresaTotalInput = document.getElementById('empresa-factura-total');
  const facturaEmpresaCancelarBtn = document.getElementById('empresa-factura-cancelar');
  const facturaEmpresaMensaje = document.getElementById('empresa-factura-mensaje');

  const obtenerAuthHeaders = () => {
    try {
      return authApi?.getAuthHeaders?.() || {};
    } catch (error) {
      return {};
    }
  };

  const fetchConAutorizacion = async (url, options = {}) => {
    const headers = { ...obtenerAuthHeaders(), ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      authApi?.handleUnauthorized?.();
    }
    return response;
  };

  const formatCurrency = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return 'RD$0.00';
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(number);
  };

  const formatNumber = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return '0';
    return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(number);
  };

  const parseMoneyValue = (value) => {
    const raw = value === undefined || value === null ? '' : String(value).trim();
    if (!raw) return 0;
    if (window.KANMMoney?.parse) {
      const parsed = window.KANMMoney.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parsePercentValue = (value) => {
    const raw = value === undefined || value === null ? '' : String(value).trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/[%\s]/g, '').replace(/,/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const setMensajeGenerico = (element, texto = '', tipo = 'info') => {
    if (!element) return;
    element.textContent = texto;
    element.dataset.type = texto ? tipo : '';
  };

  const tieneSupervisorAsignado = (row = {}) => {
    const supervisorNombre = row.supervisor_nombre || '';
    const supervisorUsuario = row.supervisor_usuario || '';
    return Boolean(row.supervisor_id || supervisorNombre || supervisorUsuario);
  };

  const setMensaje = (texto = '', tipo = 'info') => {
    if (!mensajeEl) return;
    mensajeEl.textContent = texto;
    mensajeEl.dataset.type = texto ? tipo : '';
  };

  const getLocalDateISO = (value = new Date()) => {
    const base = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(base.getTime())) return '';
    const offset = base.getTimezoneOffset();
    const local = new Date(base.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  };

  const obtenerNegocioDefault = () => {
    const lista = Array.isArray(sucursalesCache) ? sucursalesCache : [];
    if (!lista.length) return null;
    const ordenada = [...lista].sort((a, b) => Number(a.id) - Number(b.id));
    const id = Number(ordenada[0]?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  const esClienteSucursal = (cliente) => {
    if (!cliente) return false;
    const tags = String(cliente.tags || '').toUpperCase();
    if (tags.includes('SUCURSAL')) return true;
    return String(cliente.tipo_cliente || '').toUpperCase() === 'EMPRESA' && Number(cliente.negocio_id) > 0;
  };

  const iniciarFechas = () => {
    const hoy = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 29);
    if (desdeInput && !desdeInput.value) desdeInput.value = getLocalDateISO(inicio);
    if (hastaInput && !hastaInput.value) hastaInput.value = getLocalDateISO(hoy);
    if (nominaDesdeInput && !nominaDesdeInput.value) nominaDesdeInput.value = getLocalDateISO(inicio);
    if (nominaHastaInput && !nominaHastaInput.value) nominaHastaInput.value = getLocalDateISO(hoy);
    if (gastosDesdeInput && !gastosDesdeInput.value) gastosDesdeInput.value = getLocalDateISO(inicio);
    if (gastosHastaInput && !gastosHastaInput.value) gastosHastaInput.value = getLocalDateISO(hoy);
    if (facturasDesdeInput && !facturasDesdeInput.value) facturasDesdeInput.value = getLocalDateISO(inicio);
    if (facturasHastaInput && !facturasHastaInput.value) facturasHastaInput.value = getLocalDateISO(hoy);
    if (contaDesdeInput && !contaDesdeInput.value) contaDesdeInput.value = getLocalDateISO(inicio);
    if (contaHastaInput && !contaHastaInput.value) contaHastaInput.value = getLocalDateISO(hoy);
    if (inventarioMovDesdeInput && !inventarioMovDesdeInput.value) {
      inventarioMovDesdeInput.value = getLocalDateISO(inicio);
    }
    if (inventarioMovHastaInput && !inventarioMovHastaInput.value) {
      inventarioMovHastaInput.value = getLocalDateISO(hoy);
    }
  };

  const mostrarTabEmpresa = (tab = 'panel') => {
    const normalizado = tab === 'productos' ? 'inventario' : tab;
    const existe = empresaTabs.some((btn) => btn.dataset.empresaTab === normalizado);
    const destino = existe ? normalizado : 'panel';
    empresaTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.empresaTab === destino);
    });
    empresaPanels.forEach((section) => {
      section.classList.toggle('hidden', section.dataset.empresaSection !== destino);
    });
    if (destino === 'inventario') {
      actualizarInventarioScopeUI();
      cargarInventario();
      if (esInventarioEmpresa()) {
        cargarInventarioMovimientos();
      }
    }
    if (destino === 'gastos') {
      setGastosViewMode(gastosViewMode);
      cargarGastos();
    }
    if (destino === 'clientes') {
      setClientesViewMode(clientesViewMode);
      cargarClientes();
    }
    if (destino === 'facturacion') {
      cargarFacturas();
      cargarClientesFacturaEmpresa();
    }
  };

  const renderResumen = (resumen = {}) => {
    if (kpiVentas) kpiVentas.textContent = formatCurrency(resumen.ventas_total || 0);
    if (kpiGastos) kpiGastos.textContent = formatCurrency(resumen.gastos_total || 0);
    if (kpiGanancia) kpiGanancia.textContent = formatCurrency(resumen.ganancia_neta || 0);
    if (kpiTicket) kpiTicket.textContent = formatCurrency(resumen.ticket_promedio || 0);
    if (kpiVentasCount) {
      const count = Number(resumen.ventas_count || 0);
      kpiVentasCount.textContent = `${formatNumber(count)} ventas`;
    }
  };

  const renderKpis = (kpis = {}) => {
    if (kpiNomina) kpiNomina.textContent = formatCurrency(kpis.nomina_total || 0);
    const deudaValor = kpis.deudas_saldo ?? kpis.deudas_total ?? 0;
    if (kpiDeudas) kpiDeudas.textContent = formatCurrency(deudaValor || 0);
    if (kpiUsuarios) kpiUsuarios.textContent = formatNumber(kpis.usuarios_activos || 0);
  };

  const limpiarProductoForm = () => {
    if (productoIdInput) productoIdInput.value = '';
    if (productoNombreInput) productoNombreInput.value = '';
    if (productoCategoriaInput) productoCategoriaInput.value = '';
    if (productoFamiliaInput) productoFamiliaInput.value = '';
    if (productoTagsInput) productoTagsInput.value = '';
    if (productoUbicacionInput) productoUbicacionInput.value = '';
    if (productoBodegaInput) productoBodegaInput.value = '';
    if (productoStockInput) productoStockInput.value = '';
    if (productoStockMinInput) productoStockMinInput.value = '';
    if (productoStockIndefInput) productoStockIndefInput.checked = false;
    if (productoSerializableInput) productoSerializableInput.checked = false;
    if (productoTipoSelect) productoTipoSelect.value = 'FINAL';
    if (productoCostoInput) productoCostoInput.value = '';
    if (productoPrecioInput) productoPrecioInput.value = '';
    if (productoAtributosInput) productoAtributosInput.value = '';
    if (productoActivoInput) productoActivoInput.checked = true;
    setMensajeGenerico(productoMensaje, '');
  };

  const abrirInventarioModal = (producto = null) => {
    if (!inventarioModal) return;
    if (!producto) {
      limpiarProductoForm();
    } else {
      if (productoIdInput) productoIdInput.value = producto.id || '';
      if (productoNombreInput) productoNombreInput.value = producto.nombre || '';
      if (productoCategoriaInput) productoCategoriaInput.value = producto.categoria || '';
      if (productoFamiliaInput) productoFamiliaInput.value = producto.familia || '';
      if (productoTagsInput) productoTagsInput.value = producto.tags || '';
      if (productoUbicacionInput) productoUbicacionInput.value = producto.ubicacion || '';
      if (productoBodegaInput) productoBodegaInput.value = producto.bodega || '';
      if (productoStockInput) productoStockInput.value = producto.stock ?? '';
      if (productoStockMinInput) productoStockMinInput.value = producto.stock_minimo ?? '';
      if (productoStockIndefInput) productoStockIndefInput.checked = Number(producto.stock_indefinido || 0) === 1;
      if (productoSerializableInput) productoSerializableInput.checked = Number(producto.serializable || 0) === 1;
      if (productoTipoSelect) productoTipoSelect.value = producto.tipo_producto || 'FINAL';
      if (productoCostoInput) productoCostoInput.value = Number(producto.costo_base || 0).toFixed(2);
      if (productoPrecioInput) productoPrecioInput.value = Number(producto.precio_sugerido || 0).toFixed(2);
      if (productoAtributosInput) {
        const atributos = producto.atributos_json || '';
        if (atributos && typeof atributos === 'object') {
          productoAtributosInput.value = JSON.stringify(atributos, null, 2);
        } else {
          productoAtributosInput.value = atributos || '';
        }
      }
      if (productoActivoInput) productoActivoInput.checked = Number(producto.activo || 0) === 1;
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
    limpiarProductoForm();
  };

  const obtenerFiltrosInventario = () => ({
    q: inventarioBuscarInput?.value?.trim().toLowerCase() || '',
    categoria: inventarioCategoriaInput?.value?.trim().toLowerCase() || '',
    tipo: inventarioTipoSelect?.value || '',
    estado: inventarioEstadoSelect?.value || '',
    stock: inventarioStockSelect?.value || '',
    tag: inventarioTagInput?.value?.trim().toLowerCase() || '',
    bodega: inventarioBodegaInput?.value?.trim().toLowerCase() || '',
    ubicacion: inventarioUbicacionInput?.value?.trim().toLowerCase() || '',
  });

  const evaluarEstadoStock = (item) => {
    if (Number(item.stock_indefinido || 0) === 1) {
      return 'indef';
    }
    const stock = Number(item.stock || 0);
    const minimo = Number(item.stock_minimo || 0);
    if (stock <= 0) return 'critico';
    if (minimo > 0 && stock <= minimo) return 'critico';
    if (minimo > 0 && stock <= minimo * 1.5) return 'bajo';
    return 'ok';
  };

  const filtrarInventario = (lista = []) => {
    const filtros = obtenerFiltrosInventario();
    return (lista || []).filter((item) => {
      const nombre = String(item.nombre || '').toLowerCase();
      const familia = String(item.familia || '').toLowerCase();
      const tags = String(item.tags || '').toLowerCase();
      const categoria = String(item.categoria || '').toLowerCase();
      const bodega = String(item.bodega || '').toLowerCase();
      const ubicacion = String(item.ubicacion || '').toLowerCase();
      const tipo = String(item.tipo_producto || '').toUpperCase();
      const estado = Number(item.activo || 0) === 1 ? 'ACTIVO' : 'INACTIVO';

      if (filtros.q) {
        const coincide = [nombre, familia, tags].some((campo) => campo.includes(filtros.q));
        if (!coincide) return false;
      }
      if (filtros.categoria && !categoria.includes(filtros.categoria)) return false;
      if (filtros.tipo && tipo !== filtros.tipo) return false;
      if (filtros.estado && estado !== filtros.estado) return false;
      if (filtros.tag && !tags.includes(filtros.tag)) return false;
      if (filtros.bodega && !bodega.includes(filtros.bodega)) return false;
      if (filtros.ubicacion && !ubicacion.includes(filtros.ubicacion)) return false;

      if (filtros.stock) {
        const estadoStock = evaluarEstadoStock(item);
        if (filtros.stock === 'critico' && estadoStock !== 'critico') return false;
        if (filtros.stock === 'bajo' && estadoStock !== 'bajo') return false;
        if (filtros.stock === 'ok' && estadoStock !== 'ok') return false;
        if (filtros.stock === 'sin_stock' && Number(item.stock || 0) > 0) return false;
      }
      return true;
    });
  };

  const renderInventario = (lista = []) => {
    if (!productosBody) return;
    const total = inventarioItems.length;
    const resumen = inventarioItems.reduce(
      (acc, item) => {
        const estadoStock = evaluarEstadoStock(item);
        if (estadoStock === 'critico') acc.critico += 1;
        if (estadoStock === 'bajo') acc.bajo += 1;
        if (estadoStock !== 'indef') {
          const stock = Number(item.stock || 0);
          const costoBase = Number(item.costo_valoracion || item.costo_promedio_actual || item.costo_base || 0);
          const valor = Number(item.valor_inventario ?? stock * costoBase) || 0;
          acc.valor += valor;
        }
        return acc;
      },
      { critico: 0, bajo: 0, valor: 0 }
    );

    if (inventarioTotalEl) inventarioTotalEl.textContent = formatNumber(total);
    if (inventarioCriticoEl) inventarioCriticoEl.textContent = formatNumber(resumen.critico);
    if (inventarioBajoEl) inventarioBajoEl.textContent = formatNumber(resumen.bajo);
    if (inventarioValorEl) inventarioValorEl.textContent = formatCurrency(resumen.valor || 0);
    if (inventarioSelectAll) inventarioSelectAll.checked = false;

    if (!lista.length) {
      productosBody.innerHTML = '<tr><td colspan="10">No hay productos registrados.</td></tr>';
      return;
    }

    productosBody.innerHTML = lista
      .map((item) => {
        const estadoStock = evaluarEstadoStock(item);
        const tipo = item.tipo_producto || 'FINAL';
        const tipoLabel = tipo === 'INSUMO' ? 'Insumo' : 'Final';
        const familia = item.familia ? ` - ${item.familia}` : '';
        const costo = formatCurrency(item.costo_valoracion || item.costo_promedio_actual || item.costo_base || 0);
        const precio = formatCurrency(item.precio_sugerido || 0);
        const estado = Number(item.activo || 0) === 1 ? 'Activo' : 'Inactivo';
        const stock = Number(item.stock_indefinido || 0) === 1 ? 'SIN LIMITE' : formatNumber(item.stock || 0);
        const minimo = Number(item.stock_minimo || 0);
        const ubicacion = [item.bodega, item.ubicacion].filter((valor) => valor && String(valor).trim()).join(' / ') || '--';
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
            <td><input type="checkbox" class="empresa-inventario-select" data-id="${item.id}" /></td>
            <td>
              <div class="inventario-producto-nombre">
                <strong>${item.nombre || ''}</strong>
                <span>${tipoLabel}${familia}</span>
              </div>
            </td>
            <td>${item.categoria || '--'}</td>
            <td>
              <span class="${badgeClass}">${stock}</span>
            </td>
            <td>${minimo || 0}</td>
            <td>${ubicacion}</td>
            <td>${costo}</td>
            <td>${precio}</td>
            <td>${estado}</td>
            <td>
              <div class="acciones-inline">
                <button type="button" class="kanm-button ghost sm" data-empresa-producto-action="editar" data-id="${item.id}">
                  Editar
                </button>
                <button type="button" class="kanm-button ghost sm" data-empresa-producto-action="eliminar" data-id="${item.id}">
                  Eliminar
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const esInventarioEmpresa = () => inventarioScope?.tipo !== 'sucursal';

  const obtenerInventarioEndpoint = (id = null) => {
    if (esInventarioEmpresa()) {
      return id ? `/api/empresa/productos/${id}` : '/api/empresa/productos';
    }
    const negocioId = Number(inventarioScope?.negocioId);
    if (!Number.isFinite(negocioId) || negocioId <= 0) return null;
    return id
      ? `/api/empresa/negocios/${negocioId}/inventario/${id}`
      : `/api/empresa/negocios/${negocioId}/inventario`;
  };

  const actualizarInventarioScopeUI = () => {
    const esEmpresa = esInventarioEmpresa();
    if (inventarioMetodoSelect) {
      inventarioMetodoSelect.disabled = !esEmpresa;
      if (!esEmpresa) inventarioMetodoSelect.value = 'PROMEDIO';
    }
    if (inventarioMovNuevoBtn) inventarioMovNuevoBtn.disabled = !esEmpresa;
    if (inventarioMovSection) inventarioMovSection.style.display = esEmpresa ? '' : 'none';

    const camposSoloEmpresa = [
      productoFamiliaInput,
      productoTagsInput,
      productoUbicacionInput,
      productoBodegaInput,
      productoStockMinInput,
      productoSerializableInput,
      productoAtributosInput,
    ];
    camposSoloEmpresa.forEach((campo) => {
      if (!campo) return;
      campo.disabled = !esEmpresa;
      if (!esEmpresa) {
        if (campo.type === 'checkbox') {
          campo.checked = false;
        } else if (campo.tagName === 'TEXTAREA') {
          campo.value = '';
        } else {
          campo.value = '';
        }
      }
    });
  };

  const cargarInventario = async () => {
    if (!productosBody) return;
    try {
      productosBody.innerHTML = '<tr><td colspan="10">Cargando...</td></tr>';
      const endpoint = obtenerInventarioEndpoint();
      if (!endpoint) {
        throw new Error('Selecciona una sucursal valida.');
      }
      const resp = await fetchConAutorizacion(endpoint);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los productos');
      }
      if (esInventarioEmpresa()) {
        inventarioMetodoValoracion = String(data?.metodo_valoracion || 'PROMEDIO').toUpperCase();
        if (inventarioMetodoSelect) inventarioMetodoSelect.value = inventarioMetodoValoracion;
      } else {
        inventarioMetodoValoracion = 'PROMEDIO';
      }
      inventarioItems = Array.isArray(data.productos) ? data.productos : [];
      actualizarInventarioSelects();
      renderInventario(filtrarInventario(inventarioItems));
      if (esInventarioEmpresa()) {
        await cargarInventarioMovimientos();
      }
    } catch (error) {
      console.error('Error cargando inventario:', error);
      productosBody.innerHTML = `<tr><td colspan="10">${error.message || 'No se pudieron cargar.'}</td></tr>`;
    }
  };

  const actualizarInventarioSelects = () => {
    const opciones = inventarioItems
      .map((item) => `<option value="${item.id}">${item.nombre || 'Producto'}</option>`)
      .join('');
    if (inventarioMovProductoSelect) {
      inventarioMovProductoSelect.innerHTML = `<option value="">Todos</option>${opciones}`;
    }
    if (inventarioMovProductoForm) {
      inventarioMovProductoForm.innerHTML = `<option value="">Selecciona producto</option>${opciones}`;
    }
  };

  const guardarProducto = async () => {
    if (!productoNombreInput || !productoTipoSelect) return;
    const nombre = productoNombreInput.value.trim();
    const categoria = productoCategoriaInput?.value?.trim() || '';
    const tipo = productoTipoSelect.value || 'FINAL';
    const costo = parseMoneyValue(productoCostoInput?.value);
    const precio = parseMoneyValue(productoPrecioInput?.value);
    const activo = productoActivoInput?.checked ? 1 : 0;
    const familia = productoFamiliaInput?.value?.trim() || '';
    const tags = productoTagsInput?.value?.trim() || '';
    const ubicacion = productoUbicacionInput?.value?.trim() || '';
    const bodega = productoBodegaInput?.value?.trim() || '';
    const stockIndefinido = productoStockIndefInput?.checked ? 1 : 0;
    const stockMinimo = parseMoneyValue(productoStockMinInput?.value);
    const serializable = productoSerializableInput?.checked ? 1 : 0;
    const stockValor = stockIndefinido ? null : parseMoneyValue(productoStockInput?.value);
    let atributos = null;
    if (productoAtributosInput?.value?.trim()) {
      try {
        atributos = JSON.parse(productoAtributosInput.value);
      } catch (error) {
        setMensajeGenerico(productoMensaje, 'Atributos invalidos. Usa formato JSON.', 'warning');
        return;
      }
    }

    if (!nombre) {
      setMensajeGenerico(productoMensaje, 'Completa el nombre del producto.', 'warning');
      return;
    }

    const payload = {
      nombre,
      categoria,
      tipo_producto: tipo,
      costo_base: costo,
      precio_sugerido: precio,
      activo,
      familia,
      tags,
      ubicacion,
      bodega,
      stock_minimo: stockMinimo,
      stock_indefinido: stockIndefinido,
      stock: stockValor,
      serializable,
      atributos_json: atributos,
    };
    const id = Number(productoIdInput?.value);
    const esEdicion = Number.isFinite(id) && id > 0;
    try {
      setMensajeGenerico(productoMensaje, esEdicion ? 'Actualizando...' : 'Guardando...', 'info');
      const endpoint = obtenerInventarioEndpoint(esEdicion ? id : null);
      if (!endpoint) {
        throw new Error('Selecciona una sucursal valida.');
      }
      const resp = await fetchConAutorizacion(endpoint, {
        method: esEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar el producto');
      }
      limpiarProductoForm();
      await cargarInventario();
      setMensajeGenerico(productoMensaje, 'Producto guardado.', 'info');
      cerrarInventarioModal();
    } catch (error) {
      console.error('Error guardando producto empresa:', error);
      setMensajeGenerico(productoMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  };

  const abrirInventarioMovimientoModal = () => {
    if (!inventarioMovModal) return;
    if (inventarioMovProductoForm) {
      if (!inventarioMovProductoForm.value) {
        const primera = Array.from(inventarioMovProductoForm.options || []).find((opt) => opt.value);
        if (primera) inventarioMovProductoForm.value = primera.value;
      }
    }
    if (inventarioMovTipoForm) inventarioMovTipoForm.value = 'ENTRADA';
    if (inventarioMovCantidadInput) inventarioMovCantidadInput.value = '';
    if (inventarioMovCostoInput) inventarioMovCostoInput.value = '';
    if (inventarioMovFechaInput) inventarioMovFechaInput.value = getLocalDateISO(new Date());
    if (inventarioMovMotivoInput) inventarioMovMotivoInput.value = '';
    if (inventarioMovReferenciaInput) inventarioMovReferenciaInput.value = '';
    if (inventarioMovAjusteNegativoInput) inventarioMovAjusteNegativoInput.checked = false;
    if (inventarioMovAjusteNegativoInput) {
      const grupo = inventarioMovAjusteNegativoInput.closest('.kanm-input-group');
      if (grupo) grupo.style.display = 'none';
      inventarioMovAjusteNegativoInput.disabled = true;
    }
    setMensajeGenerico(inventarioMovEstado, '');
    inventarioMovModal.hidden = false;
    requestAnimationFrame(() => {
      inventarioMovModal.classList.add('is-visible');
    });
  };

  const cerrarInventarioMovimientoModal = () => {
    if (!inventarioMovModal) return;
    inventarioMovModal.classList.remove('is-visible');
    inventarioMovModal.hidden = true;
  };

  const renderInventarioMovimientos = (lista = []) => {
    if (!inventarioMovBody) return;
    if (!lista.length) {
      inventarioMovBody.innerHTML = '<tr><td colspan="8">No hay movimientos registrados.</td></tr>';
      return;
    }
    inventarioMovBody.innerHTML = lista
      .map((mov) => {
        const fecha = mov.fecha ? String(mov.fecha).slice(0, 10) : '--';
        const tipo = mov.tipo || '--';
        const cantidad = formatNumber(mov.cantidad || 0);
        const costo = formatCurrency(mov.costo_unitario || 0);
        const stockAntes = Number(mov.stock_antes);
        const stockDespues = Number(mov.stock_despues);
        const stockTexto =
          Number.isFinite(stockAntes) && Number.isFinite(stockDespues)
            ? `${formatNumber(stockAntes)} â†’ ${formatNumber(stockDespues)}`
            : '--';
        return `
          <tr>
            <td>${fecha}</td>
            <td>${mov.producto_nombre || '--'}</td>
            <td>${tipo}</td>
            <td>${cantidad}</td>
            <td>${costo}</td>
            <td>${stockTexto}</td>
            <td>${mov.motivo || '--'}</td>
            <td>${mov.usuario_nombre || '--'}</td>
          </tr>
        `;
      })
      .join('');
  };

  const cargarInventarioMovimientos = async () => {
    if (!inventarioMovBody) return;
    if (!esInventarioEmpresa()) {
      inventarioMovBody.innerHTML = '<tr><td colspan="8">Disponible solo en inventario principal.</td></tr>';
      return;
    }
    try {
      inventarioMovBody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
      const params = new URLSearchParams();
      if (inventarioMovDesdeInput?.value) params.set('from', inventarioMovDesdeInput.value);
      if (inventarioMovHastaInput?.value) params.set('to', inventarioMovHastaInput.value);
      if (inventarioMovProductoSelect?.value) params.set('producto_id', inventarioMovProductoSelect.value);
      if (inventarioMovTipoSelect?.value) params.set('tipo', inventarioMovTipoSelect.value);
      const resp = await fetchConAutorizacion(`/api/empresa/inventario/movimientos?${params.toString()}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los movimientos');
      }
      inventarioMovimientos = Array.isArray(data.movimientos) ? data.movimientos : [];
      renderInventarioMovimientos(inventarioMovimientos);
      setMensajeGenerico(inventarioMovMensaje, '');
    } catch (error) {
      console.error('Error cargando movimientos inventario:', error);
      inventarioMovBody.innerHTML = `<tr><td colspan="8">${error.message || 'No se pudieron cargar.'}</td></tr>`;
    }
  };

  const guardarInventarioMovimiento = async () => {
    if (!esInventarioEmpresa()) {
      setMensajeGenerico(inventarioMovEstado, 'Los movimientos solo aplican al inventario principal.', 'warning');
      return;
    }
    const productoId = Number(inventarioMovProductoForm?.value);
    const tipo = inventarioMovTipoForm?.value || 'ENTRADA';
    const cantidadBase = parseMoneyValue(inventarioMovCantidadInput?.value);
    if (!Number.isFinite(productoId) || productoId <= 0) {
      setMensajeGenerico(inventarioMovEstado, 'Selecciona un producto.', 'warning');
      return;
    }
    if (!Number.isFinite(cantidadBase) || cantidadBase === 0) {
      setMensajeGenerico(inventarioMovEstado, 'Cantidad invalida.', 'warning');
      return;
    }
    const costoUnitario = parseMoneyValue(inventarioMovCostoInput?.value);
    const fecha = inventarioMovFechaInput?.value || getLocalDateISO(new Date());
    const motivo = inventarioMovMotivoInput?.value?.trim() || '';
    const referencia = inventarioMovReferenciaInput?.value?.trim() || '';
    let cantidad = cantidadBase;
    if (tipo === 'AJUSTE' && inventarioMovAjusteNegativoInput?.checked) {
      cantidad = -Math.abs(cantidadBase);
    }
    try {
      setMensajeGenerico(inventarioMovEstado, 'Guardando...', 'info');
      const resp = await fetchConAutorizacion('/api/empresa/inventario/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto_id: productoId,
          tipo,
          cantidad,
          costo_unitario: costoUnitario,
          fecha,
          motivo,
          referencia,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo registrar el movimiento');
      }
      cerrarInventarioMovimientoModal();
      await cargarInventario();
      await cargarInventarioMovimientos();
    } catch (error) {
      console.error('Error registrando movimiento inventario:', error);
      setMensajeGenerico(inventarioMovEstado, error.message || 'No se pudo registrar.', 'error');
    }
  };

  const obtenerInventarioSeleccion = () =>
    Array.from(document.querySelectorAll('.empresa-inventario-select:checked'))
      .map((input) => Number(input.dataset.id))
      .filter((id) => Number.isFinite(id) && id > 0);

  const construirPayloadProducto = (item, overrides = {}) => {
    const stockIndefinido = Number(item.stock_indefinido || 0) === 1;
    return {
      nombre: item.nombre || '',
      categoria: item.categoria || '',
      tipo_producto: item.tipo_producto || 'FINAL',
      costo_base: Number(item.costo_base || 0),
      precio_sugerido: Number(item.precio_sugerido || 0),
      activo: Number(item.activo || 0) === 1 ? 1 : 0,
      familia: item.familia || '',
      tags: item.tags || '',
      ubicacion: item.ubicacion || '',
      bodega: item.bodega || '',
      stock_minimo: Number(item.stock_minimo || 0),
      stock_indefinido: stockIndefinido ? 1 : 0,
      stock: stockIndefinido ? null : Number(item.stock || 0),
      serializable: Number(item.serializable || 0) === 1 ? 1 : 0,
      atributos_json: item.atributos_json ?? null,
      ...overrides,
    };
  };

  const actualizarInventarioLote = async (ids = [], overrides = {}) => {
    if (!ids.length) {
      setMensajeGenerico(inventarioMensaje, 'Selecciona items para aplicar cambios.', 'warning');
      return;
    }
    let okCount = 0;
    let errorCount = 0;
    setMensajeGenerico(inventarioMensaje, 'Actualizando inventario...', 'info');
    for (const id of ids) {
      const item = inventarioItems.find((producto) => Number(producto.id) === id);
      if (!item) continue;
      const base = typeof overrides === 'function' ? overrides(item) : overrides;
      const payload = construirPayloadProducto(item, base || {});
      try {
        const endpoint = obtenerInventarioEndpoint(id);
        if (!endpoint) {
          throw new Error('Selecciona una sucursal valida.');
        }
        const resp = await fetchConAutorizacion(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.ok === false) {
          throw new Error(data?.error || 'No se pudo actualizar');
        }
        okCount += 1;
      } catch (error) {
        console.error('Error actualizando item:', error);
        errorCount += 1;
      }
    }
    await cargarInventario();
    if (errorCount) {
      setMensajeGenerico(
        inventarioMensaje,
        `Actualizados ${okCount} items. Errores: ${errorCount}.`,
        'warning'
      );
    } else {
      setMensajeGenerico(inventarioMensaje, `Actualizados ${okCount} items.`, 'info');
    }
  };

  const limpiarEmpleadoForm = () => {
    if (empleadoIdInput) empleadoIdInput.value = '';
    if (empleadoNombreInput) empleadoNombreInput.value = '';
    if (empleadoDocumentoInput) empleadoDocumentoInput.value = '';
    if (empleadoTelefonoInput) empleadoTelefonoInput.value = '';
    if (empleadoCargoInput) empleadoCargoInput.value = '';
    if (empleadoSucursalSelect) empleadoSucursalSelect.value = '';
    if (empleadoTipoSelect) empleadoTipoSelect.value = 'MENSUAL';
    if (empleadoSueldoInput) empleadoSueldoInput.value = '';
    if (empleadoTarifaInput) empleadoTarifaInput.value = '';
    if (empleadoArsInput) empleadoArsInput.value = '';
    if (empleadoAfpInput) empleadoAfpInput.value = '';
    if (empleadoIsrInput) empleadoIsrInput.value = '';
    if (empleadoActivoInput) empleadoActivoInput.checked = true;
    setMensajeGenerico(empleadoMensaje, '');
  };

  const renderEmpleados = (lista = []) => {
    empleadosEmpresa = Array.isArray(lista) ? [...lista] : [];
    if (empleadosBody) {
      if (!lista.length) {
        empleadosBody.innerHTML = '<tr><td colspan="12">No hay empleados registrados.</td></tr>';
      } else {
        empleadosBody.innerHTML = lista
          .map((row) => {
            const tipo = row.tipo_pago === 'HORA' ? 'Hora' : row.tipo_pago === 'QUINCENAL' ? 'Quincenal' : 'Mensual';
            const estado = row.activo ? 'Activo' : 'Inactivo';
            let bruto = 0;
            if (row.tipo_pago === 'HORA') {
              bruto = 0;
            } else if (row.tipo_pago === 'QUINCENAL') {
              bruto = Number(((Number(row.sueldo_base) || 0) / 2).toFixed(2));
            } else {
              bruto = Number(row.sueldo_base || 0);
            }
            const ars = Number(row.ars_porcentaje || 0);
            const afp = Number(row.afp_porcentaje || 0);
            const isr = Number(row.isr_porcentaje || 0);
            const detalleNomina = nominaDetalleMap.get(Number(row.id)) || {};
            if (Number.isFinite(detalleNomina.base)) {
              bruto = Number(detalleNomina.base || 0);
            }
            const afpMonto = Number.isFinite(detalleNomina.afp_monto)
              ? Number(detalleNomina.afp_monto || 0)
              : Number(((bruto * afp) / 100).toFixed(2));
            const arsMonto = Number.isFinite(detalleNomina.ars_monto)
              ? Number(detalleNomina.ars_monto || 0)
              : Number(((bruto * ars) / 100).toFixed(2));
            const isrMonto = Number.isFinite(detalleNomina.isr_monto)
              ? Number(detalleNomina.isr_monto || 0)
              : Number(((bruto * isr) / 100).toFixed(2));
            const otrosDescuentos = Number(detalleNomina.deducciones_movimientos || 0);
            const sueldoNeto = Number.isFinite(detalleNomina.total)
              ? Number(detalleNomina.total || 0)
              : Number((bruto - afpMonto - arsMonto - isrMonto - otrosDescuentos).toFixed(2));
            return `
              <tr data-empresa-empleado-id="${row.id}">
                <td>${row.nombre || ''}</td>
                <td>${row.documento || ''}</td>
                <td>${row.telefono || ''}</td>
                <td>${row.cargo || ''}</td>
                <td>${tipo}</td>
                <td>${formatCurrency(bruto)}</td>
                <td>${formatCurrency(afpMonto)}</td>
                <td>${formatCurrency(arsMonto)}</td>
                <td>${formatCurrency(isrMonto)}</td>
                <td>${formatCurrency(otrosDescuentos)}</td>
                <td>
                  <div class="empresa-empleado-estado">
                    <span>${estado}</span>
                    <div class="empresa-empleado-actions">
                      <button type="button" class="kanm-button ghost" data-empresa-empleado-action="editar" data-id="${row.id}">
                        Editar
                      </button>
                      <button type="button" class="kanm-button ghost" data-empresa-empleado-action="eliminar" data-id="${row.id}">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </td>
                <td>${formatCurrency(sueldoNeto)}</td>
              </tr>
            `;
          })
          .join('');
      }
    }

    const options = lista
      .map((row) => `<option value="${row.id}">${row.nombre || 'Empleado'}</option>`)
      .join('');
    if (asistenciaEmpleadoSelect) {
      asistenciaEmpleadoSelect.innerHTML = `<option value=\"\">Selecciona empleado</option>${options}`;
    }
    if (movimientoEmpleadoSelect) {
      movimientoEmpleadoSelect.innerHTML = `<option value=\"\">Selecciona empleado</option>${options}`;
    }
  };

  const cargarEmpleados = async () => {
    if (!empleadosBody) return;
    try {
      empleadosBody.innerHTML = '<tr><td colspan="12">Cargando...</td></tr>';
      const resp = await fetchConAutorizacion('/api/empresa/nomina/empleados');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los empleados');
      }
      renderEmpleados(data.empleados || []);
    } catch (error) {
      console.error('Error cargando empleados:', error);
      if (empleadosBody) {
        empleadosBody.innerHTML = `<tr><td colspan="12">${error.message || 'No se pudieron cargar.'}</td></tr>`;
      }
    }
  };

  const guardarEmpleado = async () => {
    if (!empleadoNombreInput) return;
    const nombre = empleadoNombreInput.value.trim();
    const documento = empleadoDocumentoInput?.value?.trim() || '';
    const telefono = empleadoTelefonoInput?.value?.trim() || '';
    const cargo = empleadoCargoInput?.value?.trim() || '';
    const negocioId = empleadoSucursalSelect?.value ? Number(empleadoSucursalSelect.value) : null;
    const tipoPago = empleadoTipoSelect?.value || 'MENSUAL';
    const sueldoBase = parseMoneyValue(empleadoSueldoInput?.value);
    const tarifaHora = parseMoneyValue(empleadoTarifaInput?.value);
    const arsPorcentaje = parsePercentValue(empleadoArsInput?.value);
    const afpPorcentaje = parsePercentValue(empleadoAfpInput?.value);
    const isrPorcentaje = parsePercentValue(empleadoIsrInput?.value);
    const activo = empleadoActivoInput?.checked ? 1 : 0;

    if (!nombre) {
      setMensajeGenerico(empleadoMensaje, 'Completa el nombre del empleado.', 'warning');
      return;
    }
    if ([arsPorcentaje, afpPorcentaje, isrPorcentaje].some((valor) => valor < 0 || valor > 100)) {
      setMensajeGenerico(empleadoMensaje, 'Los descuentos deben estar entre 0% y 100%.', 'warning');
      return;
    }

    const payload = {
      nombre,
      documento,
      telefono,
      cargo,
      negocio_id: Number.isFinite(negocioId) ? negocioId : null,
      tipo_pago: tipoPago,
      sueldo_base: sueldoBase,
      tarifa_hora: tarifaHora,
      ars_porcentaje: arsPorcentaje,
      afp_porcentaje: afpPorcentaje,
      isr_porcentaje: isrPorcentaje,
      activo,
    };

    const id = Number(empleadoIdInput?.value);
    const esEdicion = Number.isFinite(id) && id > 0;
    try {
      setMensajeGenerico(empleadoMensaje, esEdicion ? 'Actualizando...' : 'Guardando...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/nomina/empleados${esEdicion ? `/${id}` : ''}`, {
        method: esEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar el empleado');
      }
      limpiarEmpleadoForm();
      await cargarEmpleados();
      await cargarNominaResumen();
      setMensajeGenerico(empleadoMensaje, 'Empleado guardado.', 'info');
    } catch (error) {
      console.error('Error guardando empleado:', error);
      setMensajeGenerico(empleadoMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  };

  const eliminarEmpleado = async (id) => {
    if (!id) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/nomina/empleados/${id}`, { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo eliminar');
      }
      await cargarEmpleados();
      await cargarNominaResumen();
    } catch (error) {
      console.error('Error eliminando empleado:', error);
      setMensajeGenerico(empleadoMensaje, error.message || 'No se pudo eliminar.', 'error');
    }
  };

  const registrarAsistencia = async () => {
    const empleadoId = Number(asistenciaEmpleadoSelect?.value);
    const fecha = asistenciaFechaInput?.value || '';
    const entrada = asistenciaEntradaInput?.value || '';
    const salida = asistenciaSalidaInput?.value || '';
    if (!Number.isFinite(empleadoId) || !fecha || !entrada || !salida) {
      setMensajeGenerico(asistenciaMensaje, 'Completa empleado, fecha y horas.', 'warning');
      return;
    }
    try {
      setMensajeGenerico(asistenciaMensaje, 'Registrando...', 'info');
      const resp = await fetchConAutorizacion('/api/empresa/nomina/asistencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleado_id: empleadoId, fecha, hora_entrada: entrada, hora_salida: salida }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo registrar');
      }
      asistenciaEntradaInput.value = '';
      asistenciaSalidaInput.value = '';
      setMensajeGenerico(asistenciaMensaje, 'Asistencia registrada.', 'info');
      await cargarNominaResumen();
    } catch (error) {
      console.error('Error registrando asistencia:', error);
      setMensajeGenerico(asistenciaMensaje, error.message || 'No se pudo registrar.', 'error');
    }
  };

  const registrarMovimiento = async () => {
    const empleadoId = Number(movimientoEmpleadoSelect?.value);
    const tipo = movimientoTipoSelect?.value || 'COMISION';
    const monto = parseMoneyValue(movimientoMontoInput?.value);
    const fecha = movimientoFechaInput?.value || '';
    const notas = movimientoNotasInput?.value?.trim() || '';
    if (!Number.isFinite(empleadoId) || !fecha || !monto) {
      setMensajeGenerico(movimientoMensaje, 'Completa empleado, monto y fecha.', 'warning');
      return;
    }
    try {
      setMensajeGenerico(movimientoMensaje, 'Registrando...', 'info');
      const resp = await fetchConAutorizacion('/api/empresa/nomina/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleado_id: empleadoId, tipo, monto, fecha, notas }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo registrar');
      }
      movimientoMontoInput.value = '';
      movimientoNotasInput.value = '';
      setMensajeGenerico(movimientoMensaje, 'Movimiento registrado.', 'info');
      await cargarNominaResumen();
    } catch (error) {
      console.error('Error registrando movimiento:', error);
      setMensajeGenerico(movimientoMensaje, error.message || 'No se pudo registrar.', 'error');
    }
  };

  const renderNominaResumen = (resumen = {}, detalle = []) => {
    if (nominaSueldosEl) nominaSueldosEl.textContent = formatCurrency(resumen.sueldos_base || 0);
    if (nominaComisionesEl) nominaComisionesEl.textContent = formatCurrency(resumen.comisiones || 0);
    if (nominaBonosEl) nominaBonosEl.textContent = formatCurrency(resumen.bonos || 0);
    if (nominaDeduccionesEl) nominaDeduccionesEl.textContent = formatCurrency(resumen.deducciones || 0);
    if (nominaTotalEl) nominaTotalEl.textContent = formatCurrency(resumen.total_pagar || 0);

    nominaDetalleMap = new Map(
      (detalle || []).map((row) => [
        Number(row.empleado_id),
        {
          base: Number(row.base || 0),
          total: Number(row.total || 0),
          ars_monto: Number(row.ars_monto || 0),
          afp_monto: Number(row.afp_monto || 0),
          isr_monto: Number(row.isr_monto || 0),
          deducciones_movimientos: Number(row.deducciones_movimientos || 0),
          deducciones_legales: Number(row.deducciones_legales || 0),
        },
      ])
    );
    if (empleadosEmpresa.length) {
      renderEmpleados(empleadosEmpresa);
    }

    if (!nominaBody) return;
    if (!detalle.length) {
      nominaBody.innerHTML = '<tr><td colspan="6">No hay datos en el periodo.</td></tr>';
      return;
    }
    nominaBody.innerHTML = detalle
      .map((row) => `
        <tr>
          <td>${row.nombre || ''}</td>
          <td>${formatCurrency(row.base || 0)}</td>
          <td>${formatCurrency(row.comisiones || 0)}</td>
          <td>${formatCurrency(row.bonos || 0)}</td>
          <td>${formatCurrency(row.deducciones || 0)}</td>
          <td>${formatCurrency(row.total || 0)}</td>
        </tr>
      `)
      .join('');
  };

  const cargarNominaResumen = async () => {
    if (!nominaDesdeInput || !nominaHastaInput) return;
    const desde = nominaDesdeInput.value || '';
    const hasta = nominaHastaInput.value || '';
    if (!desde || !hasta) return;
    try {
      setMensajeGenerico(nominaMensaje, 'Actualizando...', 'info');
      const resp = await fetchConAutorizacion(
        `/api/empresa/nomina/resumen?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar la nomina');
      }
      renderNominaResumen(data.resumen || {}, data.detalle || []);
      setMensajeGenerico(nominaMensaje, '', 'info');
    } catch (error) {
      console.error('Error al cargar nomina:', error);
      setMensajeGenerico(nominaMensaje, error.message || 'No se pudo cargar.', 'error');
    }
  };

  const renderContabilidadResumen = (resumen = {}) => {
    if (contaActivosEl) contaActivosEl.textContent = formatCurrency(resumen.activos || 0);
    if (contaPasivosEl) contaPasivosEl.textContent = formatCurrency(resumen.pasivos || 0);
    if (contaPatrimonioEl) contaPatrimonioEl.textContent = formatCurrency(resumen.patrimonio || 0);
    if (contaIngresosEl) contaIngresosEl.textContent = formatCurrency(resumen.ingresos || 0);
    if (contaCostosEl) contaCostosEl.textContent = formatCurrency(resumen.costos || 0);
    if (contaGastosEl) contaGastosEl.textContent = formatCurrency(resumen.gastos || 0);
    if (contaResultadoEl) contaResultadoEl.textContent = formatCurrency(resumen.resultado || 0);
  };

  const renderContabilidadResultados = (resultados = {}) => {
    if (!contaResultadosBody) return;
    const ingresos = resultados.ingresos || [];
    const costos = resultados.costos || [];
    const gastos = resultados.gastos || [];
    const totalIngresos = resultados.total_ingresos ?? ingresos.reduce((acc, item) => acc + (Number(item.saldo) || 0), 0);
    const totalCostos = resultados.total_costos ?? costos.reduce((acc, item) => acc + (Number(item.saldo) || 0), 0);
    const totalGastos = resultados.total_gastos ?? gastos.reduce((acc, item) => acc + (Number(item.saldo) || 0), 0);
    const utilidad = resultados.utilidad ?? Number((totalIngresos - totalCostos - totalGastos).toFixed(2));

    const rows = [];
    const pushGrupo = (label, items, total) => {
      rows.push(`<tr class="conta-group-row"><td>${label}</td><td></td><td>${formatCurrency(total)}</td></tr>`);
      (items || []).forEach((item) => {
        rows.push(`
          <tr>
            <td></td>
            <td>${item.codigo || ''} - ${item.nombre || ''}</td>
            <td>${formatCurrency(item.saldo || 0)}</td>
          </tr>
        `);
      });
    };

    pushGrupo('Ingresos', ingresos, totalIngresos);
    pushGrupo('Costos', costos, totalCostos);
    pushGrupo('Gastos', gastos, totalGastos);
    rows.push(`<tr class="conta-total-row"><td>Utilidad del periodo</td><td></td><td>${formatCurrency(utilidad)}</td></tr>`);

    contaResultadosBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="3">No hay datos.</td></tr>';
  };

  const renderContabilidadBalance = (balance = {}) => {
    if (!contaBalanceBody) return;
    const activos = balance.activos || [];
    const pasivos = balance.pasivos || [];
    const patrimonio = balance.patrimonio || [];
    const totalActivos =
      balance.total_activos ?? activos.reduce((acc, item) => acc + (Number(item.saldo) || 0), 0);
    const totalPasivos =
      balance.total_pasivos ?? pasivos.reduce((acc, item) => acc + (Number(item.saldo) || 0), 0);
    const totalPatrimonio =
      balance.total_patrimonio ?? patrimonio.reduce((acc, item) => acc + (Number(item.saldo) || 0), 0);
    const totalPasivoPatrimonio =
      balance.total_pasivo_patrimonio ?? Number((totalPasivos + totalPatrimonio).toFixed(2));

    const rows = [];
    const pushGrupo = (label, items, total) => {
      rows.push(`<tr class="conta-group-row"><td>${label}</td><td></td><td>${formatCurrency(total)}</td></tr>`);
      (items || []).forEach((item) => {
        rows.push(`
          <tr>
            <td></td>
            <td>${item.codigo || ''} - ${item.nombre || ''}</td>
            <td>${formatCurrency(item.saldo || 0)}</td>
          </tr>
        `);
      });
    };

    pushGrupo('Activos', activos, totalActivos);
    pushGrupo('Pasivos', pasivos, totalPasivos);
    pushGrupo('Patrimonio', patrimonio, totalPatrimonio);
    rows.push(
      `<tr class="conta-total-row"><td>Pasivo + Patrimonio</td><td></td><td>${formatCurrency(
        totalPasivoPatrimonio
      )}</td></tr>`
    );

    contaBalanceBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="3">No hay datos.</td></tr>';
  };

  const renderContabilidadCuentas = (cuentas = []) => {
    if (!contaCuentasBody) return;
    if (!cuentas.length) {
      contaCuentasBody.innerHTML = '<tr><td colspan="4">No hay cuentas registradas.</td></tr>';
      return;
    }
    contaCuentasBody.innerHTML = cuentas
      .map(
        (cuenta) => `
        <tr>
          <td>${cuenta.codigo || ''}</td>
          <td>${cuenta.nombre || ''}</td>
          <td>${cuenta.tipo || ''}</td>
          <td>${cuenta.alias || ''}</td>
        </tr>
      `
      )
      .join('');
  };

  const actualizarContaAsientosSucursalOptions = (lista = []) => {
    if (!contaAsientosSucursalSelect) return;
    const actual = contaAsientosSucursalSelect.value || '';
    const opciones = [
      { value: '', label: 'Todas' },
      { value: 'empresa', label: 'Empresa' },
    ];
    const sucursales = Array.isArray(lista) ? lista : [];
    sucursales.forEach((row) => {
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const nombre = row.sucursal_nombre || row.nombre || row.slug || `Sucursal ${id}`;
      opciones.push({ value: `s-${id}`, label: nombre });
    });
    contaAsientosSucursalSelect.innerHTML = opciones
      .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
      .join('');
    const valores = new Set(opciones.map((opt) => opt.value));
    if (valores.has(actual)) {
      contaAsientosSucursalSelect.value = actual;
    }
  };

  const obtenerEtiquetaAsientoSucursal = (row) => {
    if (row?.sucursal_nombre) return row.sucursal_nombre;
    if (row?.negocio_nombre) return row.negocio_nombre;
    if (row?.negocio_id) return `Sucursal ${row.negocio_id}`;
    return 'Empresa';
  };

  const filtrarContabilidadAsientos = () => {
    const filtro = contaAsientosSucursalSelect?.value || '';
    let lista = Array.isArray(contaAsientosLineas) ? [...contaAsientosLineas] : [];
    if (filtro === 'empresa') {
      lista = lista.filter((row) => !row.negocio_id);
    } else if (filtro.startsWith('s-')) {
      const id = Number(filtro.replace('s-', ''));
      if (Number.isFinite(id)) {
        lista = lista.filter((row) => Number(row.negocio_id) === id);
      }
    }
    renderContabilidadAsientos(lista);
  };

  const renderContabilidadAsientos = (lineas = []) => {
    if (!contaAsientosBody) return;
    if (!lineas.length) {
      contaAsientosBody.innerHTML = '<tr><td colspan="7">No hay asientos en el periodo.</td></tr>';
      return;
    }
    const grupos = new Map();
    lineas.forEach((row) => {
      const key = row.negocio_id ? `s-${row.negocio_id}` : 'empresa';
      if (!grupos.has(key)) {
        grupos.set(key, { label: obtenerEtiquetaAsientoSucursal(row), lineas: [] });
      }
      grupos.get(key).lineas.push(row);
    });

    const orden = [];
    if (grupos.has('empresa')) orden.push('empresa');
    (Array.isArray(sucursalesCache) ? sucursalesCache : []).forEach((row) => {
      const key = `s-${row.id}`;
      if (grupos.has(key) && !orden.includes(key)) {
        orden.push(key);
      }
    });
    grupos.forEach((_, key) => {
      if (!orden.includes(key)) orden.push(key);
    });

    const filas = [];
    orden.forEach((key) => {
      const grupo = grupos.get(key);
      if (!grupo) return;
      filas.push(`<tr class="empresa-conta-group"><td colspan="7">${grupo.label}</td></tr>`);
      grupo.lineas.forEach((row) => {
        const fecha = row.fecha ? row.fecha.slice(0, 10) : '';
        const referencia = row.referencia_tipo
          ? `${row.referencia_tipo}${row.referencia_id ? ` #${row.referencia_id}` : ''}`
          : '--';
        const sucursal = obtenerEtiquetaAsientoSucursal(row);
        filas.push(`
          <tr>
            <td>${fecha}</td>
            <td>#${row.asiento_id || ''}</td>
            <td>${row.cuenta_codigo || ''} - ${row.cuenta_nombre || ''}</td>
            <td>${formatCurrency(row.debe || 0)}</td>
            <td>${formatCurrency(row.haber || 0)}</td>
            <td>${referencia}</td>
            <td>${sucursal}</td>
          </tr>
        `);
      });
    });

    contaAsientosBody.innerHTML = filas.join('');
  };

  const renderContabilidadMayor = (lineas = []) => {
    if (!contaMayorBody) return;
    if (!lineas.length) {
      contaMayorBody.innerHTML = '<tr><td colspan="7">No hay movimientos para la cuenta.</td></tr>';
      return;
    }
    contaMayorBody.innerHTML = lineas
      .map((row) => {
        const fecha = row.fecha ? row.fecha.slice(0, 10) : '';
        const referencia = row.referencia_tipo
          ? `${row.referencia_tipo}${row.referencia_id ? ` #${row.referencia_id}` : ''}`
          : '--';
        return `
          <tr>
            <td>${fecha}</td>
            <td>#${row.asiento_id || ''}</td>
            <td>${formatCurrency(row.debe || 0)}</td>
            <td>${formatCurrency(row.haber || 0)}</td>
            <td>${formatCurrency(row.saldo || 0)}</td>
            <td>${referencia}</td>
            <td>${row.sucursal_nombre || row.negocio_nombre || ''}</td>
          </tr>
        `;
      })
      .join('');
  };

  const cargarMayor = async () => {
    if (!contaMayorSelect || !contaDesdeInput || !contaHastaInput) return;
    const cuentaId = Number(contaMayorSelect.value);
    if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
      if (contaMayorBody) {
        contaMayorBody.innerHTML = '<tr><td colspan="7">Selecciona una cuenta.</td></tr>';
      }
      return;
    }
    const desde = contaDesdeInput.value || '';
    const hasta = contaHastaInput.value || '';
    if (!desde || !hasta) return;
    try {
      setMensajeGenerico(contaMayorMensaje, 'Cargando mayor...', 'info');
      const resp = await fetchConAutorizacion(
        `/api/empresa/contabilidad/mayor?cuenta_id=${encodeURIComponent(cuentaId)}&from=${encodeURIComponent(
          desde
        )}&to=${encodeURIComponent(hasta)}`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el mayor');
      }
      renderContabilidadMayor(data.lineas || []);
      setMensajeGenerico(contaMayorMensaje, '', 'info');
    } catch (error) {
      console.error('Error al cargar mayor:', error);
      setMensajeGenerico(contaMayorMensaje, error.message || 'No se pudo cargar.', 'error');
    }
  };

  const cargarContabilidad = async () => {
    if (!contaDesdeInput || !contaHastaInput) return;
    const desde = contaDesdeInput.value || '';
    const hasta = contaHastaInput.value || '';
    if (!desde || !hasta) return;
    try {
      setMensajeGenerico(contaMensaje, 'Actualizando...', 'info');
      const repResp = await fetchConAutorizacion(
        `/api/empresa/contabilidad/reportes?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`
      );
      const reportes = await repResp.json().catch(() => ({}));
      if (!repResp.ok || reportes?.ok === false) {
        throw new Error(reportes?.error || 'No se pudo cargar los reportes');
      }
      const cuentasResp = await fetchConAutorizacion('/api/empresa/contabilidad/cuentas');
      const cuentasData = await cuentasResp.json().catch(() => ({}));
      if (!cuentasResp.ok || cuentasData?.ok === false) {
        throw new Error(cuentasData?.error || 'No se pudo cargar el plan de cuentas');
      }
      const asientosResp = await fetchConAutorizacion(
        `/api/empresa/contabilidad/asientos?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`
      );
      const asientosData = await asientosResp.json().catch(() => ({}));
      if (!asientosResp.ok || asientosData?.ok === false) {
        throw new Error(asientosData?.error || 'No se pudo cargar los asientos');
      }

      renderContabilidadResumen(reportes.resumen || {});
      renderContabilidadResultados(reportes.resultados || {});
      renderContabilidadBalance(reportes.balance || {});
      renderContabilidadCuentas(cuentasData.cuentas || []);
      contaAsientosLineas = Array.isArray(asientosData.lineas) ? asientosData.lineas : [];
      filtrarContabilidadAsientos();

      if (contaMayorSelect) {
        const actual = contaMayorSelect.value;
        const opciones = (cuentasData.cuentas || []).map(
          (cuenta) =>
            `<option value="${cuenta.id}">${cuenta.codigo || ''} - ${cuenta.nombre || ''}</option>`
        );
        contaMayorSelect.innerHTML = `<option value="">Selecciona cuenta</option>${opciones.join('')}`;
        if (actual && (cuentasData.cuentas || []).some((item) => String(item.id) === String(actual))) {
          contaMayorSelect.value = actual;
        } else if (cuentasData.cuentas && cuentasData.cuentas.length) {
          contaMayorSelect.value = String(cuentasData.cuentas[0].id);
        }
        if (contaMayorSelect.value) {
          await cargarMayor();
        }
      }
      setMensajeGenerico(contaMensaje, '', 'info');
    } catch (error) {
      console.error('Error al cargar contabilidad:', error);
      setMensajeGenerico(contaMensaje, error.message || 'No se pudo cargar.', 'error');
    }
  };

  const formatShortDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
  };

  const formatearEstadoGasto = (estado) => {
    const limpio = String(estado || 'PAGADO').toUpperCase();
    const map = {
      BORRADOR: { label: 'Borrador', className: 'empresa-gasto-badge--borrador' },
      PENDIENTE: { label: 'Pendiente', className: 'empresa-gasto-badge--pendiente' },
      APROBADO: { label: 'Aprobado', className: 'empresa-gasto-badge--aprobado' },
      PAGADO: { label: 'Pagado', className: 'empresa-gasto-badge--pagado' },
      ANULADO: { label: 'Anulado', className: 'empresa-gasto-badge--anulado' },
    };
    return map[limpio] || { label: limpio || 'Pendiente', className: 'empresa-gasto-badge--pendiente' };
  };

  const obtenerEtiquetaGastoSucursal = (row) => {
    if (row?.sucursal_nombre) return row.sucursal_nombre;
    if (row?.negocio_nombre) return row.negocio_nombre;
    if (row?.negocio_id) return `Sucursal ${row.negocio_id}`;
    return 'Empresa';
  };

  const agruparGastosPorSucursal = (lista = []) => {
    const grupos = new Map();
    lista.forEach((row) => {
      const key = row?.negocio_id ? `s-${row.negocio_id}` : 'empresa';
      if (!grupos.has(key)) {
        grupos.set(key, { label: obtenerEtiquetaGastoSucursal(row), items: [] });
      }
      grupos.get(key).items.push(row);
    });

    const orden = [];
    if (grupos.has('empresa')) orden.push('empresa');
    (Array.isArray(sucursalesCache) ? sucursalesCache : []).forEach((row) => {
      const key = `s-${row.id}`;
      if (grupos.has(key) && !orden.includes(key)) orden.push(key);
    });
    grupos.forEach((_, key) => {
      if (!orden.includes(key)) orden.push(key);
    });

    return orden.map((key) => grupos.get(key)).filter(Boolean);
  };

  const actualizarDatalistGastos = (lista = []) => {
    if (gastosCategoriasList) {
      const categorias = new Set();
      lista.forEach((row) => {
        if (row.categoria) categorias.add(row.categoria);
      });
      gastosCategoriasList.innerHTML = '';
      Array.from(categorias)
        .sort()
        .forEach((cat) => {
          const option = document.createElement('option');
          option.value = cat;
          gastosCategoriasList.appendChild(option);
        });
    }
    if (gastosProveedoresList) {
      const proveedores = new Set();
      lista.forEach((row) => {
        if (row.proveedor) proveedores.add(row.proveedor);
      });
      gastosProveedoresList.innerHTML = '';
      Array.from(proveedores)
        .sort()
        .forEach((prov) => {
          const option = document.createElement('option');
          option.value = prov;
          gastosProveedoresList.appendChild(option);
        });
    }
    if (gastosOrigenesList) {
      const origenes = new Set();
      lista.forEach((row) => {
        if (row.origen_detalle) origenes.add(row.origen_detalle);
      });
      gastosOrigenesList.innerHTML = '';
      Array.from(origenes)
        .sort()
        .forEach((ori) => {
          const option = document.createElement('option');
          option.value = ori;
          gastosOrigenesList.appendChild(option);
        });
    }
  };

  const renderGastosResumen = (resumen = {}) => {
    if (gastosTotalEl) gastosTotalEl.textContent = formatCurrency(resumen.total || 0);
    if (gastosPendientesEl) gastosPendientesEl.textContent = formatCurrency(resumen.total_pendiente || 0);
    if (gastosPagadosEl) gastosPagadosEl.textContent = formatCurrency(resumen.total_pagado || 0);
  };

  const setGastosViewMode = (mode = 'cards') => {
    gastosViewMode = mode === 'tabla' ? 'tabla' : 'cards';
    document.querySelectorAll('.empresa-gastos-view').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.gastosView !== gastosViewMode);
    });
    if (gastosViewToggle) {
      gastosViewToggle.querySelectorAll('[data-gastos-view]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.gastosView === gastosViewMode);
      });
    }
  };

  const renderGastosCards = (lista = []) => {
    if (!gastosCardsEl) return;
    if (!lista.length) {
      gastosCardsEl.innerHTML = '<div class="tabla-vacia">No hay gastos registrados.</div>';
      return;
    }

    const grupos = agruparGastosPorSucursal(lista);
    const bloques = grupos.map((grupo) => {
      const totalGrupo = grupo.items.reduce((acc, row) => acc + (Number(row.monto) || 0), 0);
      const cards = grupo.items
        .map((row) => {
          const estadoInfo = formatearEstadoGasto(row.estado);
          const fecha = formatShortDate(row.fecha);
          const monto = formatCurrency(row.monto || 0);
          const proveedor = row.proveedor || 'Sin proveedor';
          const metodo = row.metodo_pago || '---';
          const categoria = row.categoria || 'Sin categoria';
          const sucursal = obtenerEtiquetaGastoSucursal(row);
          const pagado = Number(row.monto_pagado || 0);
          const saldo = Math.max(0, Number(row.monto || 0) - pagado);
          return `
            <article class="empresa-gasto-card" data-gasto-id="${row.id}">
              <div class="empresa-gasto-card-header">
                <div>
                  <div class="empresa-gasto-card-title">${row.descripcion || 'Gasto'}</div>
                  <div class="empresa-gasto-card-meta">${fecha} · ${proveedor}</div>
                </div>
                <span class="empresa-gasto-badge ${estadoInfo.className}">${estadoInfo.label}</span>
              </div>
              <div class="empresa-gasto-card-monto">${monto}</div>
              <div class="empresa-gasto-card-meta">${categoria} · ${metodo} · ${sucursal}</div>
              <div class="empresa-gasto-card-footer">
                <span class="kanm-subtitle">${saldo > 0 ? `Pendiente ${formatCurrency(saldo)}` : 'Pagado'}</span>
                <div class="empresa-gasto-card-actions">
                  <button type="button" class="kanm-button ghost" data-gasto-action="ver" data-id="${row.id}">Ver</button>
                  <button type="button" class="kanm-button ghost" data-gasto-action="editar" data-id="${row.id}">Editar</button>
                  <button type="button" class="kanm-button ghost" data-gasto-action="aprobar" data-id="${row.id}">Aprobar</button>
                  <button type="button" class="kanm-button ghost" data-gasto-action="pagar" data-id="${row.id}">Pagar</button>
                  <button type="button" class="kanm-button ghost-danger" data-gasto-action="anular" data-id="${row.id}">Anular</button>
                </div>
              </div>
            </article>
          `;
        })
        .join('');

      return `
        <section class="empresa-gastos-group">
          <div class="empresa-gastos-group-header">
            <h4>${grupo.label}</h4>
            <span class="kanm-subtitle">${formatNumber(grupo.items.length)} gastos · ${formatCurrency(totalGrupo)}</span>
          </div>
          <div class="empresa-gastos-group-grid">${cards}</div>
        </section>
      `;
    });

    gastosCardsEl.innerHTML = bloques.join('');
  };

  const renderGastosTabla = (lista = []) => {
    if (!gastosTablaBody) return;
    if (!lista.length) {
      gastosTablaBody.innerHTML = '<tr><td colspan="10">No hay gastos registrados.</td></tr>';
      return;
    }

    const grupos = agruparGastosPorSucursal(lista);
    const filas = [];
    grupos.forEach((grupo) => {
      const totalGrupo = grupo.items.reduce((acc, row) => acc + (Number(row.monto) || 0), 0);
      filas.push(
        `<tr class="empresa-gasto-group-row"><td colspan="10">${grupo.label} · ${formatCurrency(totalGrupo)}</td></tr>`
      );
      grupo.items.forEach((row) => {
        const estadoInfo = formatearEstadoGasto(row.estado);
        const fecha = formatShortDate(row.fecha);
        const monto = formatCurrency(row.monto || 0);
        filas.push(`
          <tr data-gasto-id="${row.id}">
            <td><input type="checkbox" class="empresa-gastos-select" data-id="${row.id}" /></td>
            <td>${fecha}</td>
            <td>${row.descripcion || 'Gasto'}</td>
            <td>${row.proveedor || '--'}</td>
            <td>${row.categoria || '--'}</td>
            <td>${monto}</td>
            <td>${row.metodo_pago || '--'}</td>
            <td>${row.origen_detalle || row.origen_fondos || '--'}</td>
            <td><span class="empresa-gasto-badge ${estadoInfo.className}">${estadoInfo.label}</span></td>
            <td>
              <div class="acciones-inline">
                <button type="button" class="kanm-button ghost" data-gasto-action="ver" data-id="${row.id}">Ver</button>
                <button type="button" class="kanm-button ghost" data-gasto-action="editar" data-id="${row.id}">Editar</button>
                <button type="button" class="kanm-button ghost" data-gasto-action="pagar" data-id="${row.id}">Pagar</button>
                <button type="button" class="kanm-button ghost-danger" data-gasto-action="anular" data-id="${row.id}">Anular</button>
              </div>
            </td>
          </tr>
        `);
      });
    });

    gastosTablaBody.innerHTML = filas.join('');
  };

  const construirParamsGastos = () => {
    const params = new URLSearchParams();
    if (gastosDesdeInput?.value) params.set('from', gastosDesdeInput.value);
    if (gastosHastaInput?.value) params.set('to', gastosHastaInput.value);
    if (gastosBuscarInput?.value) params.set('q', gastosBuscarInput.value.trim());
    if (gastosEstadoSelect?.value) params.set('estado', gastosEstadoSelect.value);
    if (gastosCategoriaInput?.value) params.set('categoria', gastosCategoriaInput.value.trim());
    if (gastosTipoSelect?.value) params.set('tipo_gasto', gastosTipoSelect.value);
    if (gastosMetodoSelect?.value) params.set('metodo_pago', gastosMetodoSelect.value);
    if (gastosOrigenSelect?.value) params.set('origen_fondos', gastosOrigenSelect.value);
    if (gastosOrigenDetalleInput?.value) params.set('origen_detalle', gastosOrigenDetalleInput.value.trim());
    if (gastosProveedorInput?.value) params.set('proveedor', gastosProveedorInput.value.trim());
    if (gastosSucursalSelect?.value) params.set('negocio_id', gastosSucursalSelect.value);
    if (gastosOrdenSelect?.value) {
      params.set('order_by', gastosOrdenSelect.value);
      const dir = ['proveedor', 'categoria'].includes(gastosOrdenSelect.value) ? 'asc' : 'desc';
      params.set('dir', dir);
    }
    const min = parseMoneyValue(gastosMinInput?.value);
    if (min) params.set('monto_min', String(min));
    const max = parseMoneyValue(gastosMaxInput?.value);
    if (max) params.set('monto_max', String(max));
    return params;
  };

  const cargarGastos = async () => {
    if (!gastosDesdeInput || !gastosHastaInput) return;
    const desde = gastosDesdeInput.value || '';
    const hasta = gastosHastaInput.value || '';
    if (!desde || !hasta) return;
    try {
      setMensajeGenerico(gastosMensaje, 'Cargando gastos...', 'info');
      const params = construirParamsGastos();
      const resp = await fetchConAutorizacion(`/api/empresa/gastos?${params.toString()}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los gastos');
      }
      gastosEmpresa = Array.isArray(data.gastos) ? data.gastos : [];
      renderGastosResumen(data.resumen || {});
      renderGastosCards(gastosEmpresa);
      renderGastosTabla(gastosEmpresa);
      actualizarDatalistGastos(gastosEmpresa);
      if (gastosSelectAll) gastosSelectAll.checked = false;
      setMensajeGenerico(gastosMensaje, '', 'info');
    } catch (error) {
      console.error('Error al cargar gastos:', error);
      setMensajeGenerico(gastosMensaje, error.message || 'No se pudo cargar.', 'error');
    }
  };

  const limpiarGastoForm = () => {
    gastoForm?.reset();
    if (gastoIdInput) gastoIdInput.value = '';
    if (gastoFechaInput) gastoFechaInput.value = getLocalDateISO(new Date());
    if (gastoMonedaSelect) gastoMonedaSelect.value = 'DOP';
    if (gastoTipoSelect) gastoTipoSelect.value = 'OPERATIVO';
    if (gastoMetodoSelect) gastoMetodoSelect.value = 'EFECTIVO';
    if (gastoOrigenSelect) gastoOrigenSelect.value = 'caja';
    if (gastoFechaVencInput) gastoFechaVencInput.value = '';
    if (gastoItbisInput) gastoItbisInput.value = '';
    if (gastoCentroInput) gastoCentroInput.value = '';
    if (gastoTagsInput) gastoTagsInput.value = '';
    gastoModalAccion = 'borrador';
    setMensajeGenerico(gastoMensaje, '', 'info');
  };

  const cargarGastoEnForm = (gasto) => {
    if (!gasto) return;
    if (gastoIdInput) gastoIdInput.value = gasto.id || '';
    if (gastoSucursalSelect) gastoSucursalSelect.value = gasto.negocio_id || '';
    if (gastoFechaInput) gastoFechaInput.value = formatShortDate(gasto.fecha);
    if (gastoConceptoInput) gastoConceptoInput.value = gasto.descripcion || '';
    if (gastoCategoriaInput) gastoCategoriaInput.value = gasto.categoria || '';
    if (gastoMontoInput) gastoMontoInput.value = Number(gasto.monto || 0).toFixed(2);
    if (gastoMonedaSelect) gastoMonedaSelect.value = gasto.moneda || 'DOP';
    if (gastoTipoSelect) gastoTipoSelect.value = gasto.tipo_gasto || 'OPERATIVO';
    if (gastoItbisInput) gastoItbisInput.value = Number(gasto.itbis || 0).toFixed(2);
    if (gastoProveedorInput) gastoProveedorInput.value = gasto.proveedor || '';
    if (gastoReferenciaInput) gastoReferenciaInput.value = gasto.referencia || '';
    if (gastoMetodoSelect) gastoMetodoSelect.value = gasto.metodo_pago || 'EFECTIVO';
    if (gastoOrigenSelect) gastoOrigenSelect.value = gasto.origen_fondos || 'caja';
    if (gastoOrigenDetalleInput) gastoOrigenDetalleInput.value = gasto.origen_detalle || '';
    if (gastoFechaVencInput) gastoFechaVencInput.value = gasto.fecha_vencimiento || '';
    if (gastoTipoComprobanteSelect) gastoTipoComprobanteSelect.value = gasto.tipo_comprobante || '';
    if (gastoNcfInput) gastoNcfInput.value = gasto.comprobante_ncf || '';
    if (gastoCentroInput) gastoCentroInput.value = gasto.centro_costo || '';
    if (gastoTagsInput) gastoTagsInput.value = gasto.tags || '';
  };

  const abrirModalGasto = (gasto = null) => {
    if (!gastoModal) return;
    if (gasto) {
      if (gastoModalTitulo) gastoModalTitulo.textContent = 'Editar gasto';
      if (gastoModalSubtitulo) gastoModalSubtitulo.textContent = `Gasto #${gasto.id}`;
      cargarGastoEnForm(gasto);
    } else {
      if (gastoModalTitulo) gastoModalTitulo.textContent = 'Nuevo gasto';
      if (gastoModalSubtitulo) gastoModalSubtitulo.textContent = 'Registra un gasto con evidencia.';
      limpiarGastoForm();
    }
    gastoModal.hidden = false;
    requestAnimationFrame(() => {
      gastoModal.classList.add('is-visible');
    });
  };

  const cerrarModalGasto = () => {
    if (!gastoModal) return;
    gastoModal.classList.remove('is-visible');
    gastoModal.hidden = true;
    limpiarGastoForm();
  };

  const obtenerPayloadGasto = () => {
    const negocioIdRaw = Number(gastoSucursalSelect?.value);
    const negocioId = Number.isFinite(negocioIdRaw) && negocioIdRaw > 0 ? negocioIdRaw : null;
    const fecha = gastoFechaInput?.value || '';
    const concepto = gastoConceptoInput?.value?.trim() || '';
    const monto = parseMoneyValue(gastoMontoInput?.value);
    if (!fecha) {
      setMensajeGenerico(gastoMensaje, 'La fecha es obligatoria.', 'warning');
      return null;
    }
    if (!concepto) {
      setMensajeGenerico(gastoMensaje, 'El concepto es obligatorio.', 'warning');
      return null;
    }
    if (!monto || monto <= 0) {
      setMensajeGenerico(gastoMensaje, 'El monto debe ser mayor a 0.', 'warning');
      return null;
    }

    return {
      negocio_id: negocioId,
      fecha,
      descripcion: concepto,
      categoria: gastoCategoriaInput?.value?.trim() || '',
      monto,
      moneda: gastoMonedaSelect?.value || 'DOP',
      tipo_gasto: gastoTipoSelect?.value || 'OPERATIVO',
      itbis: parseMoneyValue(gastoItbisInput?.value),
      proveedor: gastoProveedorInput?.value?.trim() || '',
      referencia: gastoReferenciaInput?.value?.trim() || '',
      metodo_pago: gastoMetodoSelect?.value || 'EFECTIVO',
      origen_fondos: gastoOrigenSelect?.value || 'caja',
      origen_detalle: gastoOrigenDetalleInput?.value?.trim() || '',
      fecha_vencimiento: gastoFechaVencInput?.value || '',
      tipo_comprobante: gastoTipoComprobanteSelect?.value || '',
      comprobante_ncf: gastoNcfInput?.value?.trim() || '',
      centro_costo: gastoCentroInput?.value?.trim() || '',
      tags: gastoTagsInput?.value?.trim() || '',
    };
  };

  const guardarGasto = async () => {
    if (!gastoForm) return;
    const payload = obtenerPayloadGasto();
    if (!payload) return;

    const esEdicion = Number(gastoIdInput?.value) > 0;
    const accion = gastoModalAccion || 'borrador';
    if (!esEdicion) {
      if (accion === 'borrador') payload.estado = 'BORRADOR';
      if (accion === 'aprobar') payload.estado = 'APROBADO';
      if (accion === 'pagar') payload.estado = 'PAGADO';
      if (accion === 'pagar' && String(payload.metodo_pago || '').toUpperCase() === 'CREDITO') {
        setMensajeGenerico(gastoMensaje, 'No puedes pagar un gasto en credito desde aqui.', 'warning');
        return;
      }
    }

    try {
      setMensajeGenerico(gastoMensaje, esEdicion ? 'Actualizando gasto...' : 'Guardando gasto...', 'info');
      const endpoint = esEdicion ? `/api/empresa/gastos/${gastoIdInput.value}` : '/api/empresa/gastos';
      const resp = await fetchConAutorizacion(endpoint, {
        method: esEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar el gasto');
      }
      cerrarModalGasto();
      await cargarGastos();
      setMensajeGenerico(gastosMensaje, esEdicion ? 'Gasto actualizado.' : 'Gasto registrado.', 'info');
    } catch (error) {
      console.error('Error al guardar gasto:', error);
      setMensajeGenerico(gastoMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  };

  const abrirDetalleGasto = async (id) => {
    if (!gastoViewModal) return;
    if (!id) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/gastos/${id}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el gasto');
      }
      const gasto = data.gasto || {};
      const pagos = data.pagos || [];
      gastoSeleccionadoId = gasto.id;

      if (gastoViewTitulo) gastoViewTitulo.textContent = gasto.descripcion || 'Gasto';
      if (gastoViewSubtitulo) {
        const estadoInfo = formatearEstadoGasto(gasto.estado);
        const sucursal = gasto.sucursal_nombre || (gasto.negocio_id ? '' : 'Empresa');
        gastoViewSubtitulo.textContent = `${sucursal ? `${sucursal} Â· ` : ''}${estadoInfo.label}`;
      }

      if (gastoViewResumen) {
        const pagado = Number(gasto.monto_pagado || 0);
        const saldo = Math.max(0, Number(gasto.monto || 0) - pagado);
        gastoViewResumen.innerHTML = `
          <h4>${formatCurrency(gasto.monto || 0)}</h4>
          <div class="kanm-subtitle">Fecha: ${formatShortDate(gasto.fecha)}</div>
          <div class="kanm-subtitle">Proveedor: ${gasto.proveedor || '--'}</div>
          <div class="kanm-subtitle">Categoria: ${gasto.categoria || '--'}</div>
          <div class="kanm-subtitle">Metodo: ${gasto.metodo_pago || '--'}</div>
          <div class="kanm-subtitle">Origen: ${gasto.origen_detalle || gasto.origen_fondos || '--'}</div>
          <div class="kanm-subtitle">Pagado: ${formatCurrency(pagado)}</div>
          <div class="kanm-subtitle">Pendiente: ${formatCurrency(saldo)}</div>
        `;
      }

      if (gastoViewTimeline) {
        const eventos = [];
        if (gasto.created_at) eventos.push({ label: 'Creado', fecha: gasto.created_at });
        if (gasto.aprobado_at) eventos.push({ label: 'Aprobado', fecha: gasto.aprobado_at });
        if (gasto.fecha_pago) eventos.push({ label: 'Pagado', fecha: gasto.fecha_pago });
        if (gasto.anulado_at) eventos.push({ label: 'Anulado', fecha: gasto.anulado_at });
        if (!eventos.length) {
          gastoViewTimeline.innerHTML = '<li>Sin eventos registrados.</li>';
        } else {
          gastoViewTimeline.innerHTML = eventos
            .map((item) => `<li><strong>${item.label}</strong> Â· ${formatShortDate(item.fecha)}</li>`)
            .join('');
        }
      }

      if (gastoViewPagos) {
        if (!pagos.length) {
          gastoViewPagos.textContent = 'Sin pagos registrados.';
        } else {
          gastoViewPagos.innerHTML = pagos
            .map((pago) => {
              return `<div>${formatShortDate(pago.fecha)} Â· ${formatCurrency(pago.monto || 0)} Â· ${
                pago.metodo_pago || '--'
              }</div>`;
            })
            .join('');
        }
      }

      const estadoActual = String(gasto.estado || 'PAGADO').toUpperCase();
      if (gastoViewAprobarBtn) gastoViewAprobarBtn.disabled = ['APROBADO', 'PAGADO', 'ANULADO'].includes(estadoActual);
      if (gastoViewPagarBtn) gastoViewPagarBtn.disabled = estadoActual === 'PAGADO' || estadoActual === 'ANULADO';
      if (gastoViewAnularBtn) gastoViewAnularBtn.disabled = estadoActual === 'ANULADO';
      if (gastoViewEditarBtn) gastoViewEditarBtn.disabled = estadoActual === 'ANULADO';

      gastoViewModal.hidden = false;
      requestAnimationFrame(() => {
        gastoViewModal.classList.add('is-visible');
      });
    } catch (error) {
      console.error('Error al abrir gasto:', error);
      setMensajeGenerico(gastosMensaje, error.message || 'No se pudo cargar el gasto.', 'error');
    }
  };

  const cerrarDetalleGasto = () => {
    if (!gastoViewModal) return;
    gastoViewModal.classList.remove('is-visible');
    gastoViewModal.hidden = true;
    gastoSeleccionadoId = null;
  };

  const aprobarGasto = async (id) => {
    const gastoId = id || gastoSeleccionadoId;
    if (!gastoId) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/gastos/${gastoId}/aprobar`, { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo aprobar');
      }
      await cargarGastos();
      await abrirDetalleGasto(gastoId);
    } catch (error) {
      console.error('Error aprobando gasto:', error);
      setMensajeGenerico(gastosMensaje, error.message || 'No se pudo aprobar.', 'error');
    }
  };

  const abrirPagoModal = (id) => {
    if (!gastoPagoModal) return;
    gastoSeleccionadoId = id || gastoSeleccionadoId;
    if (gastoPagoFechaInput) gastoPagoFechaInput.value = getLocalDateISO(new Date());
    if (gastoPagoMontoInput) gastoPagoMontoInput.value = '';
    if (gastoPagoMetodoSelect) gastoPagoMetodoSelect.value = 'EFECTIVO';
    if (gastoPagoOrigenSelect) gastoPagoOrigenSelect.value = 'caja';
    if (gastoPagoOrigenDetalleInput) gastoPagoOrigenDetalleInput.value = '';
    if (gastoPagoReferenciaInput) gastoPagoReferenciaInput.value = '';
    if (gastoPagoNotasInput) gastoPagoNotasInput.value = '';
    setMensajeGenerico(gastoPagoMensaje, '', 'info');
    gastoPagoModal.hidden = false;
    requestAnimationFrame(() => {
      gastoPagoModal.classList.add('is-visible');
    });
  };

  const cerrarPagoModal = () => {
    if (!gastoPagoModal) return;
    gastoPagoModal.classList.remove('is-visible');
    gastoPagoModal.hidden = true;
  };

  const registrarPagoGasto = async () => {
    const gastoId = gastoSeleccionadoId;
    if (!gastoId) return;
    const fecha = gastoPagoFechaInput?.value || '';
    const monto = parseMoneyValue(gastoPagoMontoInput?.value);
    if (!fecha || !monto) {
      setMensajeGenerico(gastoPagoMensaje, 'Completa fecha y monto.', 'warning');
      return;
    }
    try {
      setMensajeGenerico(gastoPagoMensaje, 'Registrando pago...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/gastos/${gastoId}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_pago: fecha,
          monto,
          metodo_pago: gastoPagoMetodoSelect?.value || 'EFECTIVO',
          origen_fondos: gastoPagoOrigenSelect?.value || 'caja',
          origen_detalle: gastoPagoOrigenDetalleInput?.value?.trim() || '',
          referencia: gastoPagoReferenciaInput?.value?.trim() || '',
          notas: gastoPagoNotasInput?.value?.trim() || '',
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo registrar el pago');
      }
      cerrarPagoModal();
      await cargarGastos();
      await abrirDetalleGasto(gastoId);
    } catch (error) {
      console.error('Error registrando pago:', error);
      setMensajeGenerico(gastoPagoMensaje, error.message || 'No se pudo registrar.', 'error');
    }
  };

  const abrirAnularModal = (id) => {
    if (!gastoAnularModal) return;
    gastoSeleccionadoId = id || gastoSeleccionadoId;
    if (gastoAnularMotivoInput) gastoAnularMotivoInput.value = '';
    if (gastoAnularConfirmInput) gastoAnularConfirmInput.checked = false;
    setMensajeGenerico(gastoAnularMensaje, '', 'info');
    gastoAnularModal.hidden = false;
    requestAnimationFrame(() => {
      gastoAnularModal.classList.add('is-visible');
    });
  };

  const cerrarAnularModal = () => {
    if (!gastoAnularModal) return;
    gastoAnularModal.classList.remove('is-visible');
    gastoAnularModal.hidden = true;
  };

  const confirmarAnularGasto = async () => {
    const gastoId = gastoSeleccionadoId;
    const motivo = gastoAnularMotivoInput?.value?.trim() || '';
    if (!gastoId) return;
    if (!motivo) {
      setMensajeGenerico(gastoAnularMensaje, 'Debes indicar el motivo.', 'warning');
      return;
    }
    if (!gastoAnularConfirmInput?.checked) {
      setMensajeGenerico(gastoAnularMensaje, 'Confirma la anulacion.', 'warning');
      return;
    }
    try {
      setMensajeGenerico(gastoAnularMensaje, 'Anulando gasto...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/gastos/${gastoId}/anular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo anular');
      }
      cerrarAnularModal();
      cerrarDetalleGasto();
      await cargarGastos();
    } catch (error) {
      console.error('Error anulando gasto:', error);
      setMensajeGenerico(gastoAnularMensaje, error.message || 'No se pudo anular.', 'error');
    }
  };

  const accionMasivaGastos = async (accion) => {
    if (!gastosTablaBody) return;
    const ids = Array.from(document.querySelectorAll('.empresa-gastos-select:checked')).map((input) =>
      Number(input.dataset.id)
    );
    if (!ids.length) {
      setMensajeGenerico(gastosMensaje, 'Selecciona al menos un gasto.', 'warning');
      return;
    }
    try {
      const resp = await fetchConAutorizacion('/api/empresa/gastos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, ids }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo ejecutar la accion');
      }
      await cargarGastos();
    } catch (error) {
      console.error('Error accion masiva gastos:', error);
      setMensajeGenerico(gastosMensaje, error.message || 'No se pudo ejecutar la accion.', 'error');
    }
  };

  const aplicarRangoRapidoGastos = (tipo) => {
    if (!gastosDesdeInput || !gastosHastaInput) return;
    const hoy = new Date();
    const desde = new Date();
    if (tipo === 'hoy') {
      // mismo dia
    } else if (tipo === 'ayer') {
      desde.setDate(hoy.getDate() - 1);
      hoy.setDate(hoy.getDate() - 1);
    } else if (tipo === 'semana') {
      desde.setDate(hoy.getDate() - 6);
    } else if (tipo === 'mes') {
      desde.setDate(hoy.getDate() - 29);
    }
    gastosDesdeInput.value = getLocalDateISO(desde);
    gastosHastaInput.value = getLocalDateISO(hoy);
    cargarGastos();
  };

  const iniciarSesionImpersonada = (data = {}, redirectUrl = '/admin.html') => {
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
      impersonated_by_role: data.impersonated_by_role ?? data.impersonatedByRole ?? 'empresa',
      impersonatedByRole: data.impersonated_by_role ?? data.impersonatedByRole ?? 'empresa',
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
    window.location.href = redirectUrl || '/admin.html';
  };

  const obtenerRutaImpersonacion = (rol, tab = '') => {
    const base = rol === 'supervisor' ? '/supervisor.html' : '/admin.html';
    return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
  };

  const prepararImpersonacion = async (negocioId, options = {}) => {
    if (!negocioId) return;
    const tab = options?.tab || '';
    const current = sessionApi?.getUser?.() || window.APP_SESION;
    if (current) {
      try {
        localStorage.setItem(EMPRESA_BACKUP_KEY, JSON.stringify(current));
      } catch (error) {
        console.warn('No se pudo guardar backup de sesion empresa:', error);
      }
    }

    setMensaje('Entrando a sucursal...', 'info');
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/negocios/${negocioId}/impersonar`, {
        method: 'POST',
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo entrar a la sucursal');
      }
      const rolDestino = data?.rol || data?.role || data?.perfil || '';
      const redirectUrl = obtenerRutaImpersonacion(rolDestino, tab);
      iniciarSesionImpersonada(data || {}, redirectUrl);
    } catch (error) {
      console.error('Error al impersonar sucursal:', error);
      setMensaje(error.message || 'No se pudo entrar a la sucursal.', 'error');
    }
  };

  const setSupervisorMensaje = (texto = '', tipo = 'info') => {
    if (!supervisorMensaje) return;
    supervisorMensaje.textContent = texto;
    supervisorMensaje.dataset.type = texto ? tipo : '';
  };

  const abrirModalSupervisor = (sucursal = {}) => {
    if (!supervisorModal) return;
    supervisorModalState = {
      negocioId: sucursal.id,
      sucursalNombre: sucursal.sucursal_nombre || sucursal.nombre || sucursal.slug || '',
    };
    if (supervisorSubtitulo) {
      const etiqueta = supervisorModalState.sucursalNombre || 'Sucursal sin nombre';
      supervisorSubtitulo.textContent = `Sucursal: ${etiqueta}`;
    }
    if (supervisorNombreInput) supervisorNombreInput.value = '';
    if (supervisorUsuarioInput) supervisorUsuarioInput.value = '';
    if (supervisorPasswordInput) supervisorPasswordInput.value = '';
    setSupervisorMensaje('');
    supervisorModal.hidden = false;
    requestAnimationFrame(() => {
      supervisorModal.classList.add('is-visible');
    });
  };

  const cerrarModalSupervisor = () => {
    if (!supervisorModal) return;
    supervisorModal.classList.remove('is-visible');
    supervisorModal.hidden = true;
    supervisorModalState = null;
    setSupervisorMensaje('');
  };

  const guardarSupervisor = async () => {
    if (!supervisorModalState?.negocioId) return;
    const nombre = supervisorNombreInput?.value?.trim() || '';
    const usuario = supervisorUsuarioInput?.value?.trim() || '';
    const password = supervisorPasswordInput?.value?.trim() || '';

    if (!nombre || !usuario || !password) {
      setSupervisorMensaje('Completa nombre, usuario y contraseÃ±a.', 'warning');
      return;
    }

    try {
      setSupervisorMensaje('Creando supervisor...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/negocios/${supervisorModalState.negocioId}/supervisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, usuario, password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo crear el supervisor');
      }
      cerrarModalSupervisor();
      setMensaje('Supervisor creado correctamente.', 'info');
      await cargarAnalisisEmpresa();
    } catch (error) {
      console.error('Error al crear supervisor:', error);
      setSupervisorMensaje(error.message || 'No se pudo crear el supervisor.', 'error');
    }
  };

  const actualizarResumenSucursales = (lista = []) => {
    const scopePrevio =
      inventarioScope?.tipo === 'sucursal' && Number.isFinite(inventarioScope?.negocioId)
        ? `s-${inventarioScope.negocioId}`
        : 'empresa';
    const total = Array.isArray(lista) ? lista.length : 0;
    const listos = (lista || []).filter((row) => tieneSupervisorAsignado(row)).length;
    const pendientes = Math.max(total - listos, 0);

    if (totalSucursalesEl) totalSucursalesEl.textContent = formatNumber(total);
    if (supervisoresListosEl) supervisoresListosEl.textContent = formatNumber(listos);
    if (supervisoresPendientesEl) supervisoresPendientesEl.textContent = formatNumber(pendientes);

    if (
      quickSucursalSelect ||
      empleadoSucursalSelect ||
      gastoSucursalSelect ||
      gastosSucursalSelect ||
      clientesSucursalSelect ||
      clienteSucursalSelect ||
      facturasSucursalSelect ||
      inventarioScopeSelect
    ) {
      const valorPrevio = quickSucursalSelect?.value || '';
      if (!lista || !lista.length) {
        if (quickSucursalSelect) {
          quickSucursalSelect.innerHTML = '<option value="">No hay sucursales registradas</option>';
          quickSucursalSelect.disabled = true;
        }
        if (empleadoSucursalSelect) {
          empleadoSucursalSelect.innerHTML = '<option value="">Matriz / Todas</option>';
        }
        if (gastoSucursalSelect) {
          gastoSucursalSelect.innerHTML = '<option value="">Empresa (general)</option>';
        }
        if (gastosSucursalSelect) {
          gastosSucursalSelect.innerHTML = '<option value="">Matriz / Todas</option>';
        }
        if (clientesSucursalSelect) {
          clientesSucursalSelect.innerHTML = '<option value="">Matriz / Todas</option>';
        }
        if (clienteSucursalSelect) {
          clienteSucursalSelect.innerHTML = '<option value="">Empresa (global)</option>';
        }
        if (facturasSucursalSelect) {
          facturasSucursalSelect.innerHTML = '<option value="">Matriz / Todas</option>';
        }
        if (inventarioScopeSelect) {
          inventarioScopeSelect.innerHTML = '<option value="empresa">Empresa principal</option>';
          inventarioScope = { tipo: 'empresa', negocioId: null };
          actualizarInventarioScopeUI();
          if (scopePrevio !== 'empresa') {
            cargarInventario();
          }
        }
      } else {
        const opciones = lista.map((row) => {
          const nombreSucursal = row.sucursal_nombre || row.nombre || row.slug || `Sucursal ${row.id || ''}`.trim();
          return `<option value="${row.id}">${nombreSucursal}</option>`;
        });
        const opcionesInventario = lista.map((row) => {
          const nombreSucursal = row.sucursal_nombre || row.nombre || row.slug || `Sucursal ${row.id || ''}`.trim();
          return `<option value="s-${row.id}">Sucursal: ${nombreSucursal}</option>`;
        });
        const placeholder = '<option value="">Empresa (general)</option>';
        if (quickSucursalSelect) {
          quickSucursalSelect.innerHTML = `${placeholder}${opciones.join('')}`;
          quickSucursalSelect.disabled = false;
          if (valorPrevio && lista.some((row) => String(row.id) === String(valorPrevio))) {
            quickSucursalSelect.value = valorPrevio;
          } else if (lista.length === 1) {
            quickSucursalSelect.value = String(lista[0].id);
          }
        }

        const placeholderEmpresa = '<option value="">Matriz / Todas</option>';
        if (empleadoSucursalSelect) {
          empleadoSucursalSelect.innerHTML = `${placeholderEmpresa}${opciones.join('')}`;
        }
        if (gastoSucursalSelect) {
          gastoSucursalSelect.innerHTML = `${placeholder}${opciones.join('')}`;
        }
        if (gastosSucursalSelect) {
          gastosSucursalSelect.innerHTML = `${placeholderEmpresa}${opciones.join('')}`;
        }
        if (clientesSucursalSelect) {
          clientesSucursalSelect.innerHTML = `${placeholderEmpresa}${opciones.join('')}`;
        }
        if (clienteSucursalSelect) {
          clienteSucursalSelect.innerHTML = `${placeholder}${opciones.join('')}`;
        }
        if (facturasSucursalSelect) {
          facturasSucursalSelect.innerHTML = `${placeholderEmpresa}${opciones.join('')}`;
        }
        if (inventarioScopeSelect) {
          const previo = inventarioScopeSelect.value || 'empresa';
          inventarioScopeSelect.innerHTML = `<option value="empresa">Empresa principal</option>${opcionesInventario.join('')}`;
          if (previo && Array.from(inventarioScopeSelect.options).some((opt) => opt.value === previo)) {
            inventarioScopeSelect.value = previo;
          } else {
            inventarioScopeSelect.value = 'empresa';
          }
          const valor = inventarioScopeSelect.value || 'empresa';
          if (valor.startsWith('s-')) {
            inventarioScope = { tipo: 'sucursal', negocioId: Number(valor.replace('s-', '')) || null };
          } else {
            inventarioScope = { tipo: 'empresa', negocioId: null };
          }
          actualizarInventarioScopeUI();
          if (scopePrevio !== valor) {
            cargarInventario();
          }
        }
      }
    }

    if (!quickSupervisorSelect) return;

    if (!lista || !lista.length) {
      quickSupervisorSelect.innerHTML = '<option value="">No hay sucursales registradas</option>';
      quickSupervisorSelect.disabled = true;
      if (quickSupervisorBtn) quickSupervisorBtn.disabled = true;
      return;
    }

    const pendientesList = lista.filter((row) => !tieneSupervisorAsignado(row));
    if (!pendientesList.length) {
      quickSupervisorSelect.innerHTML = '<option value="">Todas las sucursales tienen supervisor</option>';
      quickSupervisorSelect.disabled = true;
      if (quickSupervisorBtn) quickSupervisorBtn.disabled = true;
      return;
    }

    quickSupervisorSelect.disabled = false;
    if (quickSupervisorBtn) quickSupervisorBtn.disabled = false;

    const options = pendientesList.map((row) => {
      const nombreSucursal = row.sucursal_nombre || row.nombre || row.slug || `Sucursal ${row.id || ''}`.trim();
      return `<option value="${row.id}">${nombreSucursal}</option>`;
    });

    quickSupervisorSelect.innerHTML = `<option value="">Selecciona sucursal</option>${options.join('')}`;
  };

  const renderSucursales = (lista = []) => {
    if (!tablaBody) return;
    sucursalesCache = Array.isArray(lista) ? [...lista] : [];
    actualizarResumenSucursales(sucursalesCache);
    actualizarContaAsientosSucursalOptions(sucursalesCache);
    if (!lista.length) {
      tablaBody.innerHTML = '<tr><td colspan="6">No hay sucursales registradas.</td></tr>';
      return;
    }
    tablaBody.innerHTML = lista
      .map((row) => {
        const ventas = formatCurrency(row.ventas_total || 0);
        const gastos = formatCurrency(row.gastos_total || 0);
        const ganancia = formatCurrency(row.ganancia_neta || 0);
        const ticket = formatCurrency(row.ticket_promedio || 0);
        const nombreSucursal = row.sucursal_nombre || row.nombre || row.slug || 'Sucursal';
        const supervisorNombre = row.supervisor_nombre || '';
        const supervisorUsuario = row.supervisor_usuario || '';
        const supervisorAsignado = tieneSupervisorAsignado(row);
        const supervisorLabel = supervisorAsignado
          ? `${supervisorNombre || supervisorUsuario}${supervisorNombre && supervisorUsuario ? ` (${supervisorUsuario})` : ''}`
          : 'Sin supervisor';
        const sucursalLabel = nombreSucursal ? `Sucursal: ${nombreSucursal}` : '';
        const acciones = supervisorAsignado
          ? `<button type="button" class="kanm-button ghost" data-empresa-action="entrar" data-negocio-id="${row.id}">Entrar</button>`
          : `<button type="button" class="kanm-button primary" data-empresa-action="crear-supervisor" data-negocio-id="${row.id}">Crear supervisor</button>`;
        return `
          <tr>
            <td>
              <div class="empresa-sucursal-nombre${supervisorAsignado ? '' : ' is-empty'}">${supervisorLabel}</div>
              ${sucursalLabel ? `<div class="empresa-sucursal-supervisor">${sucursalLabel}</div>` : ''}
            </td>
            <td>${ventas}</td>
            <td>${gastos}</td>
            <td>${ganancia}</td>
            <td>${ticket}</td>
            <td><div class="acciones-inline">${acciones}</div></td>
          </tr>
        `;
      })
      .join('');
  };

  const cargarAnalisisEmpresa = async () => {
    const desde = desdeInput?.value || '';
    const hasta = hastaInput?.value || '';
    if (!desde || !hasta) return;
    try {
      setMensaje('Actualizando analisis...', 'info');
      const resp = await fetchConAutorizacion(
        `/api/empresa/analytics/overview?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el analisis');
      }
      renderResumen(data.resumen || {});
      renderSucursales(data.sucursales || []);
      renderKpis(data.kpis || {});
      setMensaje('', 'info');
    } catch (error) {
      console.error('Error al cargar analisis empresa:', error);
      setMensaje(error.message || 'No se pudo cargar el analisis.', 'error');
    }
  };

  const formatDateShort = (value) => {
    if (!value) return '--';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return value;
    return fecha.toLocaleDateString('es-DO');
  };

  const setClientesViewMode = (view) => {
    const modo = view === 'tabla' ? 'tabla' : 'cards';
    clientesViewMode = modo;
    document.querySelectorAll('[data-clientes-view]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.clientesView !== modo);
    });
    if (clientesViewToggle) {
      clientesViewToggle.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.clientesView === modo);
      });
    }
  };

  const obtenerFiltrosClientes = () => {
    const params = new URLSearchParams();
    const q = clientesBuscarInput?.value?.trim();
    if (q) params.set('q', q);
    if (clientesSegmentoSelect?.value) params.set('segmento', clientesSegmentoSelect.value);
    if (clientesEstadoSelect?.value) params.set('estado', clientesEstadoSelect.value);
    if (clientesCreditoSelect?.value) params.set('credito', clientesCreditoSelect.value);
    if (clientesBalanceSelect?.value) params.set('balance', clientesBalanceSelect.value);
    if (clientesScopeSelect?.value) params.set('scope', clientesScopeSelect.value);
    if (clientesSucursalSelect?.value) params.set('negocio_id', clientesSucursalSelect.value);
    if (clientesOrdenSelect?.value) params.set('orden', clientesOrdenSelect.value);
    if (clientesVipCheck?.checked) params.set('vip', '1');
    return params.toString();
  };

  const renderResumenClientes = (resumen = {}) => {
    if (clientesTotalEl) clientesTotalEl.textContent = formatNumber(resumen.total || 0);
    if (clientesVipTotalEl) clientesVipTotalEl.textContent = formatNumber(resumen.vip || 0);
    if (clientesMoraTotalEl) clientesMoraTotalEl.textContent = formatNumber(resumen.en_mora || 0);
    if (clientesSaldoTotalEl) clientesSaldoTotalEl.textContent = formatCurrency(resumen.saldo_total || 0);
  };

  const renderClientesCards = (lista = []) => {
    if (!clientesCardsEl) return;
    if (!lista.length) {
      clientesCardsEl.innerHTML = '<div class="empresa-empty">No hay clientes registrados.</div>';
      return;
    }
    clientesCardsEl.innerHTML = lista
      .map((item) => {
        const badges = [];
        if (Number(item.vip || 0) === 1) badges.push('<span class="pill">VIP</span>');
        if (Number(item.credito_activo || 0) === 1) badges.push('<span class="pill pill-muted">Credito</span>');
        if (item.en_mora || item.estado === 'MORA') badges.push('<span class="pill pill-danger">Mora</span>');
        if (item.estado === 'INACTIVO' || item.estado === 'BLOQUEADO') {
          badges.push('<span class="pill pill-muted">Bloqueado</span>');
        }
        const telefono = item.telefono || item.whatsapp || '--';
        const saldo = formatCurrency(item.saldo || 0);
        const ultima = formatDateShort(item.ultima_compra);
        const tipo = item.tipo_cliente || 'PERSONA';
        return `
          <article class="empresa-cliente-card" data-cliente-id="${item.id}">
            <div class="empresa-cliente-card-header">
              <div>
                <h4>${item.nombre || '--'}</h4>
                <span class="empresa-cliente-sub">${tipo === 'EMPRESA' ? 'Empresa' : 'Persona'} Â· ${item.segmento || ''}</span>
              </div>
              <div class="empresa-cliente-badges">${badges.join('')}</div>
            </div>
            <div class="empresa-cliente-card-body">
              <div class="empresa-cliente-metric">
                <span>Saldo</span>
                <strong>${saldo}</strong>
              </div>
              <div class="empresa-cliente-metric">
                <span>Ultima compra</span>
                <strong>${ultima}</strong>
              </div>
              <div class="empresa-cliente-metric">
                <span>Telefono</span>
                <strong>${telefono}</strong>
              </div>
            </div>
            <div class="empresa-cliente-card-actions">
              <button type="button" class="kanm-button ghost" data-cliente-action="ver" data-id="${item.id}">Ver</button>
              <button type="button" class="kanm-button ghost" data-cliente-action="editar" data-id="${item.id}">Editar</button>
              <button type="button" class="kanm-button ghost" data-cliente-action="estado" data-id="${item.id}">Estado</button>
              <button type="button" class="kanm-button ghost" data-cliente-action="abonar" data-id="${item.id}">Abonar</button>
              <button type="button" class="kanm-button ghost" data-cliente-action="bloquear" data-id="${item.id}">${['ACTIVO', 'MORA'].includes(item.estado) ? 'Bloquear' : 'Activar'}</button>
            </div>
          </article>
        `;
      })
      .join('');
  };

  const renderClientesTabla = (lista = []) => {
    if (!clientesTablaBody) return;
    if (!lista.length) {
      clientesTablaBody.innerHTML = '<tr><td colspan="10">No hay clientes registrados.</td></tr>';
      return;
    }
    clientesTablaBody.innerHTML = lista
      .map((item) => {
        const saldo = formatCurrency(item.saldo || 0);
        const limite = formatCurrency(item.credito_limite || 0);
        const ultima = formatDateShort(item.ultima_compra);
        const total = formatCurrency(item.total_deuda || 0);
        const estado = item.estado || 'ACTIVO';
        const tipo = item.tipo_cliente || 'PERSONA';
        return `
          <tr>
            <td><input type="checkbox" class="empresa-cliente-select" data-cliente-id="${item.id}" /></td>
            <td>${item.nombre || '--'}</td>
            <td>${item.telefono || item.whatsapp || '--'}</td>
            <td>${tipo === 'EMPRESA' ? 'Empresa' : 'Persona'}</td>
            <td>${saldo}</td>
            <td>${limite}</td>
            <td>${ultima}</td>
            <td>${total}</td>
            <td>${estado}</td>
            <td>
              <div class="acciones-inline">
                <button type="button" class="kanm-button ghost" data-cliente-action="ver" data-id="${item.id}">Ver</button>
                <button type="button" class="kanm-button ghost" data-cliente-action="editar" data-id="${item.id}">Editar</button>
                <button type="button" class="kanm-button ghost" data-cliente-action="estado" data-id="${item.id}">Estado</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const renderClientes = () => {
    renderClientesCards(clientesEmpresa);
    renderClientesTabla(clientesEmpresa);
  };

  const cargarClientes = async () => {
    if (!clientesCardsEl || !clientesTablaBody) return;
    try {
      setMensajeGenerico(clientesMensaje, 'Cargando clientes...', 'info');
      const query = obtenerFiltrosClientes();
      const resp = await fetchConAutorizacion(`/api/empresa/clientes${query ? `?${query}` : ''}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los clientes');
      }
      clientesEmpresa = Array.isArray(data.clientes) ? data.clientes : [];
      renderResumenClientes(data.resumen || {});
      renderClientes();
      if (clientesSelectAll) clientesSelectAll.checked = false;
      setMensajeGenerico(clientesMensaje, '', 'info');
    } catch (error) {
      console.error('Error cargando clientes:', error);
      setMensajeGenerico(clientesMensaje, error.message || 'No se pudieron cargar.', 'error');
    }
  };

  const limpiarClienteForm = () => {
    if (clienteIdInput) clienteIdInput.value = '';
    if (clienteNombreInput) clienteNombreInput.value = '';
    if (clienteDocumentoInput) clienteDocumentoInput.value = '';
    if (clienteTipoDocumentoSelect) clienteTipoDocumentoSelect.value = '';
    if (clienteTipoSelect) clienteTipoSelect.value = 'PERSONA';
    if (clienteCodigoInput) clienteCodigoInput.value = '';
    if (clienteSegmentoSelect) clienteSegmentoSelect.value = 'CONSUMIDOR';
    if (clienteEstadoSelect) clienteEstadoSelect.value = 'ACTIVO';
    if (clienteSucursalSelect) clienteSucursalSelect.value = '';
    if (clienteVipInput) clienteVipInput.checked = false;
    if (clienteTelefonoInput) clienteTelefonoInput.value = '';
    if (clienteWhatsappInput) clienteWhatsappInput.value = '';
    if (clienteEmailInput) clienteEmailInput.value = '';
    if (clienteDireccionInput) clienteDireccionInput.value = '';
    if (clienteCumpleInput) clienteCumpleInput.value = '';
    if (clienteCreditoActivoInput) clienteCreditoActivoInput.checked = false;
    if (clienteCreditoLimiteInput) clienteCreditoLimiteInput.value = '';
    if (clienteCreditoDiasInput) clienteCreditoDiasInput.value = '';
    if (clienteCreditoBloqueoInput) clienteCreditoBloqueoInput.checked = false;
    if (clienteMetodoInput) clienteMetodoInput.value = '';
    if (clienteTagsInput) clienteTagsInput.value = '';
    if (clienteNotasInput) clienteNotasInput.value = '';
    if (clienteNotasInternasInput) clienteNotasInternasInput.value = '';
    setMensajeGenerico(clienteMensaje, '');
  };

  const abrirClienteModal = (cliente = null) => {
    clienteGuardarAbrirEstado = false;
    if (!clienteModal) return;
    if (!cliente) {
      limpiarClienteForm();
      if (clienteModalTitulo) clienteModalTitulo.textContent = 'Nuevo cliente';
      if (clienteModalSubtitulo) clienteModalSubtitulo.textContent = 'Registra datos y reglas de credito.';
      clienteModal.hidden = false;
      requestAnimationFrame(() => {
        clienteModal.classList.add('is-visible');
      });
      return;
    }
    if (clienteModalTitulo) clienteModalTitulo.textContent = 'Editar cliente';
    if (clienteModalSubtitulo) clienteModalSubtitulo.textContent = 'Actualiza datos del cliente.';
    if (clienteIdInput) clienteIdInput.value = cliente.id || '';
    if (clienteNombreInput) clienteNombreInput.value = cliente.nombre || '';
    if (clienteDocumentoInput) clienteDocumentoInput.value = cliente.documento || '';
    if (clienteTipoDocumentoSelect) clienteTipoDocumentoSelect.value = cliente.tipo_documento || '';
    if (clienteTipoSelect) clienteTipoSelect.value = cliente.tipo_cliente || 'PERSONA';
    if (clienteCodigoInput) clienteCodigoInput.value = cliente.codigo || '';
    if (clienteSegmentoSelect) clienteSegmentoSelect.value = cliente.segmento || 'CONSUMIDOR';
    if (clienteEstadoSelect) clienteEstadoSelect.value = cliente.estado || 'ACTIVO';
    if (clienteSucursalSelect) clienteSucursalSelect.value = cliente.negocio_id || '';
    if (clienteVipInput) clienteVipInput.checked = Number(cliente.vip || 0) === 1;
    if (clienteTelefonoInput) clienteTelefonoInput.value = cliente.telefono || '';
    if (clienteWhatsappInput) clienteWhatsappInput.value = cliente.whatsapp || '';
    if (clienteEmailInput) clienteEmailInput.value = cliente.email || '';
    if (clienteDireccionInput) clienteDireccionInput.value = cliente.direccion || '';
    if (clienteCumpleInput) clienteCumpleInput.value = cliente.fecha_cumple || '';
    if (clienteCreditoActivoInput) clienteCreditoActivoInput.checked = Number(cliente.credito_activo || 0) === 1;
    if (clienteCreditoLimiteInput) clienteCreditoLimiteInput.value = cliente.credito_limite || '';
    if (clienteCreditoDiasInput) clienteCreditoDiasInput.value = cliente.credito_dias || '';
    if (clienteCreditoBloqueoInput) clienteCreditoBloqueoInput.checked = Number(cliente.credito_bloqueo_exceso || 0) === 1;
    if (clienteMetodoInput) clienteMetodoInput.value = cliente.metodo_pago_preferido || '';
    if (clienteTagsInput) clienteTagsInput.value = cliente.tags || '';
    if (clienteNotasInput) clienteNotasInput.value = cliente.notas || '';
    if (clienteNotasInternasInput) clienteNotasInternasInput.value = cliente.notas_internas || '';
    setMensajeGenerico(clienteMensaje, '');
    clienteModal.hidden = false;
    requestAnimationFrame(() => {
      clienteModal.classList.add('is-visible');
    });
  };

  const cerrarClienteModal = () => {
    if (!clienteModal) return;
    clienteModal.classList.remove('is-visible');
    clienteModal.hidden = true;
  };

  const leerClienteForm = () => ({
    nombre: clienteNombreInput?.value?.trim() || '',
    documento: clienteDocumentoInput?.value?.trim() || '',
    tipo_documento: clienteTipoDocumentoSelect?.value || '',
    tipo_cliente: clienteTipoSelect?.value || 'PERSONA',
    codigo: clienteCodigoInput?.value?.trim() || '',
    segmento: clienteSegmentoSelect?.value || 'CONSUMIDOR',
    estado: clienteEstadoSelect?.value || 'ACTIVO',
    negocio_id: clienteSucursalSelect?.value || null,
    vip: clienteVipInput?.checked ? 1 : 0,
    telefono: clienteTelefonoInput?.value?.trim() || '',
    whatsapp: clienteWhatsappInput?.value?.trim() || '',
    email: clienteEmailInput?.value?.trim() || '',
    direccion: clienteDireccionInput?.value?.trim() || '',
    fecha_cumple: clienteCumpleInput?.value || '',
    credito_activo: clienteCreditoActivoInput?.checked ? 1 : 0,
    credito_limite: parseMoneyValue(clienteCreditoLimiteInput?.value || ''),
    credito_dias: Number(clienteCreditoDiasInput?.value || 0) || 0,
    credito_bloqueo_exceso: clienteCreditoBloqueoInput?.checked ? 1 : 0,
    metodo_pago_preferido: clienteMetodoInput?.value?.trim() || '',
    tags: clienteTagsInput?.value?.trim() || '',
    notas: clienteNotasInput?.value?.trim() || '',
    notas_internas: clienteNotasInternasInput?.value?.trim() || '',
  });

  const guardarCliente = async (forzarDuplicado = false) => {
    if (!clienteForm) return;
    const payload = leerClienteForm();
    if (!payload.nombre) {
      setMensajeGenerico(clienteMensaje, 'El nombre es obligatorio.', 'warning');
      return;
    }
    if (forzarDuplicado) {
      payload.forceDuplicate = 1;
    }

    const id = clienteIdInput?.value;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/empresa/clientes/${id}` : '/api/empresa/clientes';
    try {
      setMensajeGenerico(clienteMensaje, 'Guardando cliente...', 'info');
      const resp = await fetchConAutorizacion(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 409 && !forzarDuplicado) {
        const confirmar = window.confirm(
          `Ya existe un cliente similar: ${data?.duplicado?.nombre || 'Duplicado'}. Deseas guardar de todas formas?`
        );
        if (confirmar) {
          await guardarCliente(true);
        } else {
          setMensajeGenerico(clienteMensaje, 'Operacion cancelada.', 'info');
        }
        return;
      }
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar el cliente');
      }
      const clienteGuardado = data?.cliente || {};
      cerrarClienteModal();
      await cargarClientes();
      if (clienteGuardarAbrirEstado && clienteGuardado?.id) {
        abrirEstadoCuentaModal(clienteGuardado.id);
      }
    } catch (error) {
      console.error('Error guardando cliente:', error);
      setMensajeGenerico(clienteMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  };

  const renderClienteInfo = (cliente = {}, resumen = {}) => {
    if (!clienteViewInfo) return;
    const telefono = cliente.telefono || cliente.whatsapp || '--';
    const estado = cliente.estado || (Number(cliente.activo || 0) === 1 ? 'ACTIVO' : 'INACTIVO');
    clienteViewInfo.innerHTML = `
      <div class="empresa-cliente-info-grid">
        <div><span>Documento</span><strong>${cliente.documento || '--'}</strong></div>
        <div><span>Telefono</span><strong>${telefono}</strong></div>
        <div><span>Email</span><strong>${cliente.email || '--'}</strong></div>
        <div><span>Direccion</span><strong>${cliente.direccion || '--'}</strong></div>
        <div><span>Segmento</span><strong>${cliente.segmento || '--'}</strong></div>
        <div><span>Estado</span><strong>${estado}</strong></div>
      </div>
    `;
    if (clienteViewSubtitulo) {
      clienteViewSubtitulo.textContent = `${cliente.tipo_cliente || 'PERSONA'} Â· ${cliente.segmento || ''}`;
    }
    if (clienteViewBloquearBtn) {
      const activo = ['ACTIVO', 'MORA'].includes(estado);
      clienteViewBloquearBtn.textContent = activo ? 'Bloquear' : 'Activar';
    }

    const totalComprado = Number(resumen.total || 0);
    const compras = Number(resumen.compras_count || 0);
    const ticket = compras > 0 ? totalComprado / compras : 0;
    if (clienteKpiTotalEl) clienteKpiTotalEl.textContent = formatCurrency(totalComprado);
    if (clienteKpiComprasEl) clienteKpiComprasEl.textContent = formatNumber(compras);
    if (clienteKpiTicketEl) clienteKpiTicketEl.textContent = formatCurrency(ticket);
    if (clienteKpiSaldoEl) clienteKpiSaldoEl.textContent = formatCurrency(resumen.saldo || 0);
  };

  const abrirClienteDetalle = async (id, tab = 'resumen') => {
    if (!clienteViewModal) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${id}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el cliente');
      }
      clienteActual = data?.cliente || null;
      if (!clienteActual) {
        throw new Error('Cliente no encontrado.');
      }
      if (clienteViewNombre) clienteViewNombre.textContent = clienteActual.nombre || 'Cliente';
      renderClienteInfo(clienteActual, data?.resumen || {});
      clienteViewModal.hidden = false;
      requestAnimationFrame(() => {
        clienteViewModal.classList.add('is-visible');
      });
      cambiarTabClienteView(tab);
      await cargarClienteDeudas();
      await cargarClientePagos();
      await cargarClienteNotas();
    } catch (error) {
      console.error('Error al abrir cliente:', error);
      alert(error.message || 'No se pudo cargar el cliente.');
    }
  };

  const cerrarClienteDetalle = () => {
    if (!clienteViewModal) return;
    clienteViewModal.classList.remove('is-visible');
    clienteViewModal.hidden = true;
  };

  const cambiarTabClienteView = (tab) => {
    document.querySelectorAll('[data-cliente-view-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.clienteViewTab === tab);
    });
    document.querySelectorAll('[data-cliente-view-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.clienteViewPanel === tab);
    });
  };

  const renderClienteDeudas = () => {
    if (clienteComprasBody) {
      if (!clienteDeudas.length) {
        clienteComprasBody.innerHTML = '<tr><td colspan="6">No hay compras registradas.</td></tr>';
      } else {
        clienteComprasBody.innerHTML = clienteDeudas
          .map((deuda) => {
            const monto = formatCurrency(deuda.monto_total || 0);
            const saldo = formatCurrency(deuda.saldo || 0);
            return `
              <tr>
                <td>${formatDateShort(deuda.fecha)}</td>
                <td>${deuda.descripcion || '--'}</td>
                <td>${monto}</td>
                <td>${saldo}</td>
                <td>${deuda.sucursal_nombre || '--'}</td>
                <td>
                  <button type="button" class="kanm-button ghost" data-deuda-action="factura" data-deuda-id="${deuda.id}">
                    Ver factura
                  </button>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    }

    if (clienteCxcBody) {
      if (!clienteDeudas.length) {
        clienteCxcBody.innerHTML = '<tr><td colspan="7">No hay cuentas por cobrar.</td></tr>';
      } else {
        clienteCxcBody.innerHTML = clienteDeudas
          .map((deuda) => {
            const monto = formatCurrency(deuda.monto_total || 0);
            const pagado = formatCurrency(deuda.total_abonos || 0);
            const saldo = formatCurrency(deuda.saldo || 0);
            const estado = deuda.estado || 'pendiente';
            return `
              <tr>
                <td>${formatDateShort(deuda.fecha)}</td>
                <td>${deuda.descripcion || '--'}</td>
                <td>${monto}</td>
                <td>${pagado}</td>
                <td>${saldo}</td>
                <td>${estado}</td>
                <td>
                  <div class="acciones-inline">
                    <button type="button" class="kanm-button ghost" data-deuda-action="abonar" data-deuda-id="${deuda.id}">Abonar</button>
                    <button type="button" class="kanm-button ghost" data-deuda-action="factura" data-deuda-id="${deuda.id}">Factura</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    }
  };

  const cargarClienteDeudas = async () => {
    if (!clienteActual) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteActual.id}/deudas`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar las deudas');
      }
      clienteDeudas = Array.isArray(data.deudas) ? data.deudas : [];
      renderClienteDeudas();
    } catch (error) {
      console.error('Error cargando deudas:', error);
      if (clienteComprasBody) clienteComprasBody.innerHTML = '<tr><td colspan="6">No se pudieron cargar.</td></tr>';
      if (clienteCxcBody) clienteCxcBody.innerHTML = '<tr><td colspan="7">No se pudieron cargar.</td></tr>';
    }
  };

  const renderClientePagos = () => {
    if (!clientePagosBody) return;
    if (!clientePagos.length) {
      clientePagosBody.innerHTML = '<tr><td colspan="5">No hay pagos registrados.</td></tr>';
      return;
    }
    clientePagosBody.innerHTML = clientePagos
      .map((pago) => `
        <tr>
          <td>${formatDateShort(pago.fecha)}</td>
          <td>${formatCurrency(pago.monto || 0)}</td>
          <td>${pago.metodo_pago || '--'}</td>
          <td>#${pago.deuda_id || '--'}</td>
          <td>${pago.sucursal_nombre || '--'}</td>
        </tr>
      `)
      .join('');
  };

  const cargarClientePagos = async () => {
    if (!clienteActual) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteActual.id}/abonos`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los pagos');
      }
      clientePagos = Array.isArray(data.abonos) ? data.abonos : [];
      renderClientePagos();
    } catch (error) {
      console.error('Error cargando pagos:', error);
      if (clientePagosBody) clientePagosBody.innerHTML = '<tr><td colspan="5">No se pudieron cargar.</td></tr>';
    }
  };

  const renderClienteNotas = () => {
    if (!clienteNotasList) return;
    if (!clienteNotas.length) {
      clienteNotasList.innerHTML = '<p class="kanm-subtitle">Sin notas registradas.</p>';
      return;
    }
    clienteNotasList.innerHTML = clienteNotas
      .map((nota) => `
        <div class="empresa-cliente-nota">
          <span>${nota.nota}</span>
          <small>${formatDateShort(nota.created_at)}</small>
        </div>
      `)
      .join('');
  };

  const cargarClienteNotas = async () => {
    if (!clienteActual) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteActual.id}/notas`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar las notas');
      }
      clienteNotas = Array.isArray(data.notas) ? data.notas : [];
      renderClienteNotas();
    } catch (error) {
      console.error('Error cargando notas:', error);
      if (clienteNotasList) clienteNotasList.innerHTML = '<p class="kanm-subtitle">No se pudieron cargar.</p>';
    }
  };

  const actualizarEstadoCliente = async (clienteId, estado) => {
    if (!clienteId) return;
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo actualizar el estado');
      }
      await cargarClientes();
      if (clienteActual && Number(clienteActual.id) === Number(clienteId)) {
        await abrirClienteDetalle(clienteId);
      }
    } catch (error) {
      console.error('Error actualizando estado cliente:', error);
      alert(error.message || 'No se pudo actualizar el estado.');
    }
  };

  const abrirAbonoModal = (deudaId = null) => {
    if (!clienteAbonoModal || !clienteActual) return;
    clienteAbonoId = deudaId;
    if (clienteAbonoClienteId) clienteAbonoClienteId.value = clienteActual.id || '';
    if (clienteAbonoDeudaSelect) {
      const opciones = clienteDeudas
        .filter((deuda) => Number(deuda.saldo || 0) > 0)
        .map((deuda) => `<option value="${deuda.id}">#${deuda.id} Â· ${formatCurrency(deuda.saldo || 0)}</option>`);
      clienteAbonoDeudaSelect.innerHTML = `<option value="">Selecciona factura</option>${opciones.join('')}`;
      if (deudaId) {
        clienteAbonoDeudaSelect.value = String(deudaId);
      }
    }
    if (clienteAbonoFechaInput) clienteAbonoFechaInput.value = getLocalDateISO(new Date());
    if (clienteAbonoMontoInput) clienteAbonoMontoInput.value = '';
    if (clienteAbonoMetodoSelect) clienteAbonoMetodoSelect.value = 'EFECTIVO';
    if (clienteAbonoNotasInput) clienteAbonoNotasInput.value = '';
    setMensajeGenerico(clienteAbonoMensaje, '');
    clienteAbonoModal.hidden = false;
    requestAnimationFrame(() => {
      clienteAbonoModal.classList.add('is-visible');
    });
  };

  const cerrarAbonoModal = () => {
    if (!clienteAbonoModal) return;
    clienteAbonoModal.classList.remove('is-visible');
    clienteAbonoModal.hidden = true;
  };

  const guardarAbonoCliente = async () => {
    if (!clienteActual) return;
    const deudaId = Number(clienteAbonoDeudaSelect?.value);
    if (!Number.isFinite(deudaId) || deudaId <= 0) {
      setMensajeGenerico(clienteAbonoMensaje, 'Selecciona una factura.', 'warning');
      return;
    }
    const monto = parseMoneyValue(clienteAbonoMontoInput?.value || '');
    if (!Number.isFinite(monto) || monto <= 0) {
      setMensajeGenerico(clienteAbonoMensaje, 'Monto invalido.', 'warning');
      return;
    }
    const fecha = clienteAbonoFechaInput?.value || getLocalDateISO(new Date());
    const metodo = clienteAbonoMetodoSelect?.value || 'EFECTIVO';
    const notas = clienteAbonoNotasInput?.value?.trim() || '';

    try {
      setMensajeGenerico(clienteAbonoMensaje, 'Registrando pago...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteActual.id}/deudas/${deudaId}/abonos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, monto, metodo_pago: metodo, notas }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo registrar el abono');
      }
      cerrarAbonoModal();
      await cargarClienteDeudas();
      await cargarClientePagos();
      await cargarClientes();
    } catch (error) {
      console.error('Error registrando abono:', error);
      setMensajeGenerico(clienteAbonoMensaje, error.message || 'No se pudo registrar.', 'error');
    }
  };

  const abrirEstadoCuentaModal = (clienteId) => {
    if (!clienteEstadoModal) return;
    clienteEstadoId = clienteId || clienteActual?.id || null;
    if (!clienteEstadoId) return;
    if (clienteEstadoDesdeInput && !clienteEstadoDesdeInput.value) {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - 29);
      clienteEstadoDesdeInput.value = getLocalDateISO(inicio);
    }
    if (clienteEstadoHastaInput && !clienteEstadoHastaInput.value) {
      clienteEstadoHastaInput.value = getLocalDateISO(new Date());
    }
    clienteEstadoModal.hidden = false;
    requestAnimationFrame(() => {
      clienteEstadoModal.classList.add('is-visible');
    });
    cargarEstadoCuenta();
  };

  const cerrarEstadoCuentaModal = () => {
    if (!clienteEstadoModal) return;
    clienteEstadoModal.classList.remove('is-visible');
    clienteEstadoModal.hidden = true;
  };

  const cargarEstadoCuenta = async () => {
    if (!clienteEstadoId) return;
    const desde = clienteEstadoDesdeInput?.value || '';
    const hasta = clienteEstadoHastaInput?.value || '';
    try {
      const resp = await fetchConAutorizacion(
        `/api/empresa/clientes/${clienteEstadoId}/estado-cuenta?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el estado de cuenta');
      }
      const resumen = data?.resumen || {};
      if (clienteEstadoTotalEl) clienteEstadoTotalEl.textContent = formatCurrency(resumen.total || 0);
      if (clienteEstadoPagadoEl) clienteEstadoPagadoEl.textContent = formatCurrency(resumen.pagado || 0);
      if (clienteEstadoSaldoEl) clienteEstadoSaldoEl.textContent = formatCurrency(resumen.saldo || 0);
      if (clienteEstadoBody) {
        const rows = Array.isArray(data.deudas) ? data.deudas : [];
        if (!rows.length) {
          clienteEstadoBody.innerHTML = '<tr><td colspan="6">Sin movimientos en el rango.</td></tr>';
        } else {
          clienteEstadoBody.innerHTML = rows
            .map((row) => {
              const saldo = Math.max(Number(row.monto_total || 0) - Number(row.total_abonos || 0), 0);
              return `
                <tr>
                  <td>${formatDateShort(row.fecha)}</td>
                  <td>${row.descripcion || '--'}</td>
                  <td>${formatCurrency(row.monto_total || 0)}</td>
                  <td>${formatCurrency(row.total_abonos || 0)}</td>
                  <td>${formatCurrency(saldo)}</td>
                  <td>${row.sucursal_nombre || '--'}</td>
                </tr>
              `;
            })
            .join('');
        }
      }
    } catch (error) {
      console.error('Error cargando estado de cuenta:', error);
      if (clienteEstadoBody) {
        clienteEstadoBody.innerHTML = '<tr><td colspan="6">No se pudo cargar.</td></tr>';
      }
    }
  };

  const exportarClientes = () => {
    if (!clientesEmpresa.length) {
      alert('No hay clientes para exportar.');
      return;
    }
    const headers = ['Nombre', 'Documento', 'Telefono', 'Email', 'Segmento', 'Saldo'];
    const rows = clientesEmpresa.map((c) => [
      c.nombre || '',
      c.documento || '',
      c.telefono || '',
      c.email || '',
      c.segmento || '',
      c.saldo || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clientes_empresa.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderFacturaItems = () => {
    if (!clienteFacturaItemsBody) return;
    if (!clienteFacturaItems.length) {
      clienteFacturaItemsBody.innerHTML = '<tr><td colspan="5">No hay items agregados.</td></tr>';
      if (clienteFacturaSubtotalInput) clienteFacturaSubtotalInput.value = '';
      if (clienteFacturaItbisInput) clienteFacturaItbisInput.value = '';
      if (clienteFacturaTotalInput) clienteFacturaTotalInput.value = '';
      return;
    }
    let subtotal = 0;
    clienteFacturaItemsBody.innerHTML = clienteFacturaItems
      .map((item) => {
        const totalLinea = Number((item.cantidad * item.precio_unitario).toFixed(2));
        subtotal += totalLinea;
        const itemKey = item.key || item.producto_id || item.producto_empresa_id || '';
        return `
          <tr>
            <td>${item.nombre}</td>
            <td>${item.cantidad}</td>
            <td>${formatCurrency(item.precio_unitario)}</td>
            <td>${formatCurrency(totalLinea)}</td>
            <td>
              <button type="button" class="kanm-button ghost" data-factura-item="${itemKey}">Quitar</button>
            </td>
          </tr>
        `;
      })
      .join('');
    const itbis = Number((subtotal * (clienteFacturaImpuestoPorcentaje / 100)).toFixed(2));
    const total = Number((subtotal + itbis).toFixed(2));
    if (clienteFacturaSubtotalInput) clienteFacturaSubtotalInput.value = subtotal.toFixed(2);
    if (clienteFacturaItbisInput) clienteFacturaItbisInput.value = itbis.toFixed(2);
    if (clienteFacturaTotalInput) clienteFacturaTotalInput.value = total.toFixed(2);
  };

  const cargarProductosFactura = async (negocioId) => {
    if (!clienteFacturaProductoSelect) return;
    if (!negocioId) {
      clienteFacturaProductos = [];
      clienteFacturaProductoSelect.innerHTML = '<option value="">Selecciona producto</option>';
      clienteFacturaImpuestoPorcentaje = 0;
      if (clienteFacturaItbisLabel) clienteFacturaItbisLabel.textContent = 'ITBIS';
      renderFacturaItems();
      return;
    }
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/negocios/${negocioId}/productos`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar productos');
      }
      clienteFacturaProductos = Array.isArray(data.productos) ? data.productos : [];
      clienteFacturaImpuestoPorcentaje = Number(data.impuesto_porcentaje || 0) || 0;
      if (clienteFacturaItbisLabel) {
        const label =
          clienteFacturaImpuestoPorcentaje > 0
            ? `ITBIS ${clienteFacturaImpuestoPorcentaje}%`
            : 'ITBIS';
        clienteFacturaItbisLabel.textContent = label;
      }
    const opciones = clienteFacturaProductos
      .map((p) => {
        const selector = p.selector_id || `${p.origen === 'empresa' ? 'e' : 's'}-${p.id}`;
        const etiqueta = p.nombre || '';
        const stockIndefinido = Number(p.stock_indefinido || 0) === 1;
        const sinStock = !stockIndefinido && Number(p.stock || 0) <= 0;
        const etiquetaFinal = sinStock ? `${etiqueta} (Sin stock)` : etiqueta;
        const disabled = sinStock ? 'disabled' : '';
        return `<option value="${selector}" ${disabled}>${etiquetaFinal}</option>`;
      })
      .join('');
    clienteFacturaProductoSelect.innerHTML = `<option value="">Selecciona producto</option>${opciones}`;
      renderFacturaItems();
    } catch (error) {
      console.error('Error cargando productos factura:', error);
      clienteFacturaProductoSelect.innerHTML = '<option value="">No hay productos</option>';
      clienteFacturaImpuestoPorcentaje = 0;
      if (clienteFacturaItbisLabel) clienteFacturaItbisLabel.textContent = 'ITBIS';
      renderFacturaItems();
    }
  };

  const abrirFacturaModal = () => {
    if (!clienteFacturaModal || !clienteActual) return;
    clienteFacturaItems = [];
    renderFacturaItems();
    if (clienteFacturaClienteId) clienteFacturaClienteId.value = clienteActual.id || '';
    if (clienteFacturaFechaInput) clienteFacturaFechaInput.value = getLocalDateISO(new Date());
    if (clienteFacturaDescripcionInput) clienteFacturaDescripcionInput.value = '';
    if (clienteFacturaNotasInput) clienteFacturaNotasInput.value = '';
    clienteFacturaImpuestoPorcentaje = 0;
    if (clienteFacturaSubtotalInput) clienteFacturaSubtotalInput.value = '';
    if (clienteFacturaItbisInput) clienteFacturaItbisInput.value = '';
    if (clienteFacturaItbisLabel) clienteFacturaItbisLabel.textContent = 'ITBIS';
    setMensajeGenerico(clienteFacturaMensaje, '');
    const negocioIdBase = Number(clienteActual?.negocio_id) > 0 ? Number(clienteActual.negocio_id) : obtenerNegocioDefault();
    clienteFacturaNegocioId = Number.isFinite(negocioIdBase) && negocioIdBase > 0 ? negocioIdBase : null;
    if (clienteFacturaNegocioId) {
      cargarProductosFactura(clienteFacturaNegocioId);
    } else {
      setMensajeGenerico(clienteFacturaMensaje, 'No hay sucursal base para cargar productos.', 'warning');
    }
    clienteFacturaModal.hidden = false;
    requestAnimationFrame(() => {
      clienteFacturaModal.classList.add('is-visible');
    });
  };

  const cerrarFacturaModal = () => {
    if (!clienteFacturaModal) return;
    clienteFacturaItems = [];
    renderFacturaItems();
    clienteFacturaModal.classList.remove('is-visible');
    clienteFacturaModal.hidden = true;
  };

  const cerrarModalClienteActivo = () => {
    if (facturaEmpresaModal && !facturaEmpresaModal.hidden) {
      cerrarFacturaEmpresaModal();
      return;
    }
    if (clienteFacturaModal && !clienteFacturaModal.hidden) {
      cerrarFacturaModal();
      return;
    }
    if (clienteEstadoModal && !clienteEstadoModal.hidden) {
      cerrarEstadoCuentaModal();
      return;
    }
    if (clienteAbonoModal && !clienteAbonoModal.hidden) {
      cerrarAbonoModal();
      return;
    }
    if (clienteViewModal && !clienteViewModal.hidden) {
      cerrarClienteDetalle();
      return;
    }
    if (clienteModal && !clienteModal.hidden) {
      cerrarClienteModal();
    }
  };

  const configurarCierreOverlay = (overlay, cerrarFn) => {
    if (!overlay) return;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cerrarFn();
      }
    });
  };

  const agregarItemFactura = () => {
    if (!clienteFacturaProductoSelect || !clienteFacturaCantidadInput) return;
    const selectorId = clienteFacturaProductoSelect.value;
    const cantidad = Number(clienteFacturaCantidadInput.value);
    if (!selectorId) {
      setMensajeGenerico(clienteFacturaMensaje, 'Selecciona un producto.', 'warning');
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setMensajeGenerico(clienteFacturaMensaje, 'Cantidad invalida.', 'warning');
      return;
    }
    const producto = clienteFacturaProductos.find(
      (p) => (p.selector_id || `${p.origen === 'empresa' ? 'e' : 's'}-${p.id}`) === selectorId
    );
    if (!producto) {
      setMensajeGenerico(clienteFacturaMensaje, 'Producto no encontrado.', 'warning');
      return;
    }
    const existente = clienteFacturaItems.find((item) => item.key === selectorId);
    if (existente) {
      existente.cantidad = Number((existente.cantidad + cantidad).toFixed(2));
    } else {
      clienteFacturaItems.push({
        key: selectorId,
        producto_id: producto.origen === 'empresa' ? null : producto.id,
        producto_empresa_id: producto.origen === 'empresa' ? producto.empresa_producto_id || producto.id : null,
        origen: producto.origen || 'sucursal',
        nombre: producto.nombre || '--',
        cantidad,
        precio_unitario: Number(producto.precio) || 0,
      });
    }
    renderFacturaItems();
    if (clienteFacturaCantidadInput) clienteFacturaCantidadInput.value = '1';
    clienteFacturaProductoSelect.value = '';
    setMensajeGenerico(clienteFacturaMensaje, '');
  };

  const guardarFacturaCliente = async () => {
    if (!clienteActual) return;
    const negocioId = Number(clienteFacturaNegocioId);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      setMensajeGenerico(clienteFacturaMensaje, 'No hay sucursal base para la factura.', 'warning');
      return;
    }
    if (!clienteFacturaItems.length) {
      setMensajeGenerico(clienteFacturaMensaje, 'Agrega al menos un producto.', 'warning');
      return;
    }
    const fecha = clienteFacturaFechaInput?.value || getLocalDateISO(new Date());
    const descripcion = clienteFacturaDescripcionInput?.value?.trim() || '';
    const notas = clienteFacturaNotasInput?.value?.trim() || '';

    try {
      setMensajeGenerico(clienteFacturaMensaje, 'Guardando factura...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteActual.id}/deudas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negocio_id: negocioId,
          fecha,
          descripcion,
          notas,
          items: clienteFacturaItems,
          auto_pago: esClienteSucursal(clienteActual) ? 1 : 0,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar la factura');
      }
      cerrarFacturaModal();
      await cargarClienteDeudas();
      await cargarClientes();
    } catch (error) {
      console.error('Error guardando factura cliente:', error);
      setMensajeGenerico(clienteFacturaMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  };

  const renderFacturasResumen = (resumen = {}) => {
    if (facturasTotalEl) facturasTotalEl.textContent = formatCurrency(resumen.total || 0);
    if (facturasPagadoEl) facturasPagadoEl.textContent = formatCurrency(resumen.pagado || 0);
    if (facturasSaldoEl) facturasSaldoEl.textContent = formatCurrency(resumen.saldo || 0);
    if (facturasCountEl) facturasCountEl.textContent = formatNumber(resumen.count || 0);
  };

  const renderFacturasTabla = (lista = []) => {
    if (!facturasTablaBody) return;
    if (!lista.length) {
      facturasTablaBody.innerHTML = '<tr><td colspan="8">No hay facturas registradas.</td></tr>';
      return;
    }
    facturasTablaBody.innerHTML = lista
      .map((factura) => {
        const total = formatCurrency(factura.monto_total || 0);
        const pagado = formatCurrency(factura.total_abonos || 0);
        const saldoNum = Number(factura.saldo || 0);
        const saldo = formatCurrency(saldoNum);
        const estado = factura.estado || (saldoNum <= 0 ? 'PAGADO' : 'PENDIENTE');
        const estadoClass = estado === 'PAGADO' ? 'estado-pagado' : 'estado-pendiente';
        const mostrarAbono = saldoNum > 0 && !factura.es_interna;
        const botonAbonar = mostrarAbono
          ? `<button type="button" class="kanm-button ghost" data-factura-action="abonar" data-cliente-id="${factura.cliente_id}">
                  Abonar
                </button>`
          : '';
        return `
          <tr>
            <td>${formatDateShort(factura.fecha)}</td>
            <td>${factura.cliente_nombre || '--'}</td>
            <td>${factura.cliente_documento || '--'}</td>
            <td>${total}</td>
            <td>${pagado}</td>
            <td>${saldo}</td>
            <td><span class="kanm-badge ${estadoClass}">${estado.toLowerCase()}</span></td>
            <td>
              <div class="acciones-inline">
                <button type="button" class="kanm-button ghost" data-factura-action="ver" data-factura-id="${factura.id}">
                  Ver
                </button>
                ${botonAbonar}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const construirQueryFacturas = () => {
    const params = new URLSearchParams();
    const q = facturasBuscarInput?.value?.trim();
    if (q) params.set('q', q);
    if (facturasDesdeInput?.value) params.set('desde', facturasDesdeInput.value);
    if (facturasHastaInput?.value) params.set('hasta', facturasHastaInput.value);
    if (facturasEstadoSelect?.value) params.set('estado', facturasEstadoSelect.value);
    if (facturasSucursalSelect?.value) params.set('negocio_id', facturasSucursalSelect.value);
    if (facturasOrdenSelect?.value) params.set('orden', facturasOrdenSelect.value);
    return params.toString();
  };

  const cargarFacturas = async () => {
    if (!facturasTablaBody) return;
    try {
      setMensajeGenerico(facturasMensaje, 'Cargando facturas...', 'info');
      const query = construirQueryFacturas();
      const resp = await fetchConAutorizacion(`/api/empresa/facturas${query ? `?${query}` : ''}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar las facturas');
      }
      facturasEmpresa = Array.isArray(data.facturas) ? data.facturas : [];
      renderFacturasResumen(data.resumen || {});
      renderFacturasTabla(facturasEmpresa);
      setMensajeGenerico(facturasMensaje, '', 'info');
    } catch (error) {
      console.error('Error cargando facturas:', error);
      setMensajeGenerico(facturasMensaje, error.message || 'No se pudieron cargar.', 'error');
      if (facturasTablaBody) facturasTablaBody.innerHTML = '<tr><td colspan="8">No se pudieron cargar.</td></tr>';
    }
  };

  const cargarClientesFacturaEmpresa = async () => {
    if (!facturaEmpresaClienteSelect) return;
    try {
      const resp = await fetchConAutorizacion('/api/empresa/clientes?orden=nombre');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar los clientes');
      }
      facturaEmpresaClientes = Array.isArray(data.clientes) ? data.clientes : [];
      facturaEmpresaDestinos = new Map();
      const sucursalesComoClientes = new Set(
        facturaEmpresaClientes
          .filter((cliente) => esClienteSucursal(cliente))
          .map((cliente) => Number(cliente.negocio_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      );
      const opcionesClientes = facturaEmpresaClientes
        .map((cliente) => {
          const doc = cliente.documento ? ` Â· ${cliente.documento}` : '';
          const key = `c-${cliente.id}`;
          facturaEmpresaDestinos.set(key, {
            tipo: 'cliente',
            cliente_id: cliente.id,
            negocio_id: Number(cliente.negocio_id) || null,
            nombre: cliente.nombre || 'Cliente',
            tags: cliente.tags || '',
            tipo_cliente: cliente.tipo_cliente || '',
          });
          return `<option value="${key}">${cliente.nombre || 'Cliente'}${doc}</option>`;
        })
        .join('');
      const opcionesSucursales = (Array.isArray(sucursalesCache) ? sucursalesCache : [])
        .filter((sucursal) => !sucursalesComoClientes.has(Number(sucursal.id)))
        .map((sucursal) => {
          const key = `s-${sucursal.id}`;
          facturaEmpresaDestinos.set(key, {
            tipo: 'sucursal',
            negocio_id: Number(sucursal.id),
            nombre: sucursal.sucursal_nombre || sucursal.nombre || `Sucursal ${sucursal.id}`,
          });
          const etiqueta = sucursal.sucursal_nombre || sucursal.nombre || `Sucursal ${sucursal.id}`;
          return `<option value="${key}">Sucursal: ${etiqueta}</option>`;
        })
        .join('');
      facturaEmpresaClienteSelect.innerHTML = `<option value="">Selecciona cliente</option>${opcionesClientes}${opcionesSucursales}`;
    } catch (error) {
      console.error('Error cargando clientes para factura:', error);
      facturaEmpresaClienteSelect.innerHTML = '<option value="">No hay clientes</option>';
    }
  };

  const renderFacturaEmpresaItems = () => {
    if (!facturaEmpresaItemsBody) return;
    if (!facturaEmpresaItems.length) {
      facturaEmpresaItemsBody.innerHTML = '<tr><td colspan="5">No hay items agregados.</td></tr>';
      if (facturaEmpresaSubtotalInput) facturaEmpresaSubtotalInput.value = '';
      if (facturaEmpresaItbisInput) facturaEmpresaItbisInput.value = '';
      if (facturaEmpresaTotalInput) facturaEmpresaTotalInput.value = '';
      return;
    }
    let subtotal = 0;
    facturaEmpresaItemsBody.innerHTML = facturaEmpresaItems
      .map((item) => {
        const totalLinea = Number((item.cantidad * item.precio_unitario).toFixed(2));
        subtotal += totalLinea;
        const itemKey = item.key || item.producto_id || item.producto_empresa_id || '';
        return `
          <tr>
            <td>${item.nombre}</td>
            <td>${item.cantidad}</td>
            <td>${formatCurrency(item.precio_unitario)}</td>
            <td>${formatCurrency(totalLinea)}</td>
            <td>
              <button type="button" class="kanm-button ghost" data-factura-item="${itemKey}">Quitar</button>
            </td>
          </tr>
        `;
      })
      .join('');
    const itbis = Number((subtotal * (facturaEmpresaImpuestoPorcentaje / 100)).toFixed(2));
    const total = Number((subtotal + itbis).toFixed(2));
    if (facturaEmpresaSubtotalInput) facturaEmpresaSubtotalInput.value = subtotal.toFixed(2);
    if (facturaEmpresaItbisInput) facturaEmpresaItbisInput.value = itbis.toFixed(2);
    if (facturaEmpresaTotalInput) facturaEmpresaTotalInput.value = total.toFixed(2);
  };

  const actualizarDestinoFacturaEmpresa = () => {
    if (!facturaEmpresaClienteSelect) return;
    const key = facturaEmpresaClienteSelect.value;
    const destino = facturaEmpresaDestinos.get(key);
    if (destino?.tipo === 'sucursal') {
      facturaEmpresaNegocioId = Number(destino.negocio_id) || null;
    } else if (destino?.tipo === 'cliente') {
      const base = Number(destino.negocio_id) || obtenerNegocioDefault();
      facturaEmpresaNegocioId = Number.isFinite(base) && base > 0 ? base : null;
    } else {
      const base = obtenerNegocioDefault();
      facturaEmpresaNegocioId = Number.isFinite(base) && base > 0 ? base : null;
    }
    facturaEmpresaItems = [];
    renderFacturaEmpresaItems();
    if (facturaEmpresaNegocioId) {
      cargarProductosFacturaEmpresa(facturaEmpresaNegocioId);
    } else {
      setMensajeGenerico(facturaEmpresaMensaje, 'No hay sucursal base para cargar productos.', 'warning');
      facturaEmpresaProductos = [];
      renderFacturaEmpresaItems();
    }
  };

  const cargarProductosFacturaEmpresa = async (negocioId) => {
    if (!facturaEmpresaProductoSelect) return;
    if (!negocioId) {
      facturaEmpresaProductos = [];
      facturaEmpresaProductoSelect.innerHTML = '<option value="">Selecciona producto</option>';
      facturaEmpresaImpuestoPorcentaje = 0;
      if (facturaEmpresaItbisLabel) facturaEmpresaItbisLabel.textContent = 'ITBIS';
      renderFacturaEmpresaItems();
      return;
    }
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/negocios/${negocioId}/productos`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar productos');
      }
      facturaEmpresaProductos = Array.isArray(data.productos) ? data.productos : [];
      facturaEmpresaImpuestoPorcentaje = Number(data.impuesto_porcentaje || 0) || 0;
      if (facturaEmpresaItbisLabel) {
        const label =
          facturaEmpresaImpuestoPorcentaje > 0
            ? `ITBIS ${facturaEmpresaImpuestoPorcentaje}%`
            : 'ITBIS';
        facturaEmpresaItbisLabel.textContent = label;
      }
    const opciones = facturaEmpresaProductos
      .map((p) => {
        const selector = p.selector_id || `${p.origen === 'empresa' ? 'e' : 's'}-${p.id}`;
        const etiqueta = p.nombre || '';
        const stockIndefinido = Number(p.stock_indefinido || 0) === 1;
        const sinStock = !stockIndefinido && Number(p.stock || 0) <= 0;
        const etiquetaFinal = sinStock ? `${etiqueta} (Sin stock)` : etiqueta;
        const disabled = sinStock ? 'disabled' : '';
        return `<option value="${selector}" ${disabled}>${etiquetaFinal}</option>`;
      })
      .join('');
    facturaEmpresaProductoSelect.innerHTML = `<option value="">Selecciona producto</option>${opciones}`;
      renderFacturaEmpresaItems();
    } catch (error) {
      console.error('Error cargando productos factura empresa:', error);
      facturaEmpresaProductoSelect.innerHTML = '<option value="">No hay productos</option>';
      facturaEmpresaImpuestoPorcentaje = 0;
      if (facturaEmpresaItbisLabel) facturaEmpresaItbisLabel.textContent = 'ITBIS';
      renderFacturaEmpresaItems();
    }
  };

  const abrirFacturaEmpresaModal = () => {
    if (!facturaEmpresaModal) return;
    facturaEmpresaItems = [];
    facturaEmpresaProductos = [];
    renderFacturaEmpresaItems();
    if (facturaEmpresaFechaInput) facturaEmpresaFechaInput.value = getLocalDateISO(new Date());
    if (facturaEmpresaDescripcionInput) facturaEmpresaDescripcionInput.value = '';
    if (facturaEmpresaNotasInput) facturaEmpresaNotasInput.value = '';
    if (facturaEmpresaClienteSelect) facturaEmpresaClienteSelect.value = '';
    if (facturaEmpresaProductoSelect) facturaEmpresaProductoSelect.innerHTML = '<option value="">Selecciona producto</option>';
    facturaEmpresaImpuestoPorcentaje = 0;
    if (facturaEmpresaSubtotalInput) facturaEmpresaSubtotalInput.value = '';
    if (facturaEmpresaItbisInput) facturaEmpresaItbisInput.value = '';
    if (facturaEmpresaItbisLabel) facturaEmpresaItbisLabel.textContent = 'ITBIS';
    setMensajeGenerico(facturaEmpresaMensaje, '');
    facturaEmpresaNegocioId = null;
    if (facturaEmpresaClienteSelect) {
      const opciones = Array.from(facturaEmpresaClienteSelect.options || []);
      const primeraValida = opciones.find((opt) => opt.value);
      if (primeraValida && !facturaEmpresaClienteSelect.value) {
        facturaEmpresaClienteSelect.value = primeraValida.value;
      }
      actualizarDestinoFacturaEmpresa();
    }
    facturaEmpresaModal.hidden = false;
    requestAnimationFrame(() => {
      facturaEmpresaModal.classList.add('is-visible');
    });
  };

  const cerrarFacturaEmpresaModal = () => {
    if (!facturaEmpresaModal) return;
    facturaEmpresaItems = [];
    renderFacturaEmpresaItems();
    facturaEmpresaModal.classList.remove('is-visible');
    facturaEmpresaModal.hidden = true;
  };

  const agregarItemFacturaEmpresa = () => {
    if (!facturaEmpresaProductoSelect || !facturaEmpresaCantidadInput) return;
    const selectorId = facturaEmpresaProductoSelect.value;
    const cantidad = Number(facturaEmpresaCantidadInput.value);
    if (!selectorId) {
      setMensajeGenerico(facturaEmpresaMensaje, 'Selecciona un producto.', 'warning');
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setMensajeGenerico(facturaEmpresaMensaje, 'Cantidad invalida.', 'warning');
      return;
    }
    const producto = facturaEmpresaProductos.find(
      (p) => (p.selector_id || `${p.origen === 'empresa' ? 'e' : 's'}-${p.id}`) === selectorId
    );
    if (!producto) {
      setMensajeGenerico(facturaEmpresaMensaje, 'Producto no encontrado.', 'warning');
      return;
    }
    const existente = facturaEmpresaItems.find((item) => item.key === selectorId);
    if (existente) {
      existente.cantidad = Number((existente.cantidad + cantidad).toFixed(2));
    } else {
      facturaEmpresaItems.push({
        key: selectorId,
        producto_id: producto.origen === 'empresa' ? null : producto.id,
        producto_empresa_id: producto.origen === 'empresa' ? producto.empresa_producto_id || producto.id : null,
        origen: producto.origen || 'sucursal',
        nombre: producto.nombre || '--',
        cantidad,
        precio_unitario: Number(producto.precio) || 0,
      });
    }
    renderFacturaEmpresaItems();
    if (facturaEmpresaCantidadInput) facturaEmpresaCantidadInput.value = '1';
    facturaEmpresaProductoSelect.value = '';
    setMensajeGenerico(facturaEmpresaMensaje, '');
  };

  const guardarFacturaEmpresa = async () => {
    const destinoKey = facturaEmpresaClienteSelect?.value || '';
    if (!destinoKey) {
      setMensajeGenerico(facturaEmpresaMensaje, 'Selecciona un cliente o sucursal.', 'warning');
      return;
    }
    const destino = facturaEmpresaDestinos.get(destinoKey);
    if (!destino) {
      setMensajeGenerico(facturaEmpresaMensaje, 'Destino invalido.', 'warning');
      return;
    }
    const negocioId = Number(facturaEmpresaNegocioId);
    if (!Number.isFinite(negocioId) || negocioId <= 0) {
      setMensajeGenerico(facturaEmpresaMensaje, 'No hay sucursal base para la factura.', 'warning');
      return;
    }
    if (!facturaEmpresaItems.length) {
      setMensajeGenerico(facturaEmpresaMensaje, 'Agrega al menos un producto.', 'warning');
      return;
    }
    const fecha = facturaEmpresaFechaInput?.value || getLocalDateISO(new Date());
    const descripcion = facturaEmpresaDescripcionInput?.value?.trim() || '';
    const notas = facturaEmpresaNotasInput?.value?.trim() || '';

    try {
      let clienteId = Number(destino.cliente_id);
      let autoPago = false;
      if (destino.tipo === 'sucursal') {
        const respCliente = await fetchConAutorizacion('/api/empresa/clientes/desde-sucursal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ negocio_id: destino.negocio_id }),
        });
        const dataCliente = await respCliente.json().catch(() => ({}));
        if (!respCliente.ok || dataCliente?.ok === false) {
          throw new Error(dataCliente?.error || 'No se pudo preparar la sucursal');
        }
        clienteId = Number(dataCliente?.cliente?.id);
        autoPago = true;
      } else if (destino.tipo === 'cliente') {
        autoPago = esClienteSucursal(destino);
      }
      if (!Number.isFinite(clienteId) || clienteId <= 0) {
        throw new Error('Cliente invalido.');
      }

      setMensajeGenerico(facturaEmpresaMensaje, 'Guardando factura...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteId}/deudas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negocio_id: negocioId,
          fecha,
          descripcion,
          notas,
          items: facturaEmpresaItems,
          auto_pago: autoPago ? 1 : 0,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar la factura');
      }
      cerrarFacturaEmpresaModal();
      await cargarFacturas();
    } catch (error) {
      console.error('Error guardando factura empresa:', error);
      setMensajeGenerico(facturaEmpresaMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  };

  const obtenerClientesSeleccionados = () =>
    Array.from(document.querySelectorAll('.empresa-cliente-select:checked'))
      .map((input) => Number(input.dataset.clienteId))
      .filter((id) => Number.isFinite(id) && id > 0);

  tablaBody?.addEventListener('click', (event) => {
    const btnEntrar = event.target.closest('[data-empresa-action="entrar"]');
    const btnCrear = event.target.closest('[data-empresa-action="crear-supervisor"]');
    if (!btnEntrar && !btnCrear) return;

    const btn = btnEntrar || btnCrear;
    const id = Number(btn.dataset.negocioId);
    if (!Number.isFinite(id)) return;

    if (btnCrear) {
      const sucursal = (sucursalesCache || []).find((item) => Number(item.id) === id) || { id };
      abrirModalSupervisor(sucursal);
      return;
    }

    prepararImpersonacion(id);
  });

  empresaTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.empresaTab || 'panel';
      mostrarTabEmpresa(tab);
    });
  });

  empresaTabTargets.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.empresaTabTarget || 'panel';
      mostrarTabEmpresa(tab);
    });
  });

  productoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarProducto();
  });

  productoLimpiarBtn?.addEventListener('click', () => {
    limpiarProductoForm();
  });

  inventarioNuevoBtn?.addEventListener('click', () => {
    abrirInventarioModal();
  });

  inventarioScopeSelect?.addEventListener('change', () => {
    const valor = inventarioScopeSelect.value || 'empresa';
    if (valor.startsWith('s-')) {
      inventarioScope = { tipo: 'sucursal', negocioId: Number(valor.replace('s-', '')) || null };
    } else {
      inventarioScope = { tipo: 'empresa', negocioId: null };
    }
    actualizarInventarioScopeUI();
    cargarInventario();
  });

  inventarioMovNuevoBtn?.addEventListener('click', () => {
    if (!esInventarioEmpresa()) return;
    abrirInventarioMovimientoModal();
  });

  inventarioModalCancelarBtn?.addEventListener('click', () => {
    cerrarInventarioModal();
  });

  inventarioMovCancelarBtn?.addEventListener('click', () => {
    cerrarInventarioMovimientoModal();
  });

  inventarioFiltrarBtn?.addEventListener('click', () => {
    renderInventario(filtrarInventario(inventarioItems));
  });

  inventarioMovFiltrarBtn?.addEventListener('click', () => {
    cargarInventarioMovimientos();
  });

  inventarioLimpiarBtn?.addEventListener('click', () => {
    if (inventarioBuscarInput) inventarioBuscarInput.value = '';
    if (inventarioCategoriaInput) inventarioCategoriaInput.value = '';
    if (inventarioTipoSelect) inventarioTipoSelect.value = '';
    if (inventarioEstadoSelect) inventarioEstadoSelect.value = '';
    if (inventarioStockSelect) inventarioStockSelect.value = '';
    if (inventarioTagInput) inventarioTagInput.value = '';
    if (inventarioBodegaInput) inventarioBodegaInput.value = '';
    if (inventarioUbicacionInput) inventarioUbicacionInput.value = '';
    renderInventario(filtrarInventario(inventarioItems));
  });

  inventarioMetodoSelect?.addEventListener('change', async () => {
    if (!esInventarioEmpresa()) return;
    const metodo = inventarioMetodoSelect.value || 'PROMEDIO';
    try {
      await fetchConAutorizacion('/api/empresa/inventario/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodo_valoracion: metodo }),
      });
      inventarioMetodoValoracion = metodo;
      await cargarInventario();
    } catch (error) {
      console.error('Error guardando metodo de valoracion:', error);
      setMensajeGenerico(inventarioMensaje, 'No se pudo guardar el metodo.', 'error');
    }
  });

  inventarioBuscarInput?.addEventListener('input', () => {
    renderInventario(filtrarInventario(inventarioItems));
  });

  inventarioMovTipoForm?.addEventListener('change', () => {
    const esAjuste = inventarioMovTipoForm.value === 'AJUSTE';
    if (inventarioMovAjusteNegativoInput) {
      inventarioMovAjusteNegativoInput.checked = false;
      inventarioMovAjusteNegativoInput.disabled = !esAjuste;
      const grupo = inventarioMovAjusteNegativoInput.closest('.kanm-input-group');
      if (grupo) {
        grupo.style.display = esAjuste ? 'flex' : 'none';
      }
    }
  });

  inventarioMovProductoForm?.addEventListener('change', () => {
    const productoId = Number(inventarioMovProductoForm.value);
    const producto = inventarioItems.find((item) => Number(item.id) === productoId);
    if (!producto || !inventarioMovCostoInput) return;
    const costo =
      Number(producto.costo_valoracion || producto.costo_promedio_actual || producto.costo_base || 0) || 0;
    inventarioMovCostoInput.value = costo ? costo.toFixed(2) : '';
  });

  inventarioMovForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarInventarioMovimiento();
  });

  inventarioSelectAll?.addEventListener('change', () => {
    const checked = inventarioSelectAll.checked;
    document.querySelectorAll('.empresa-inventario-select').forEach((input) => {
      input.checked = checked;
    });
  });

  inventarioBulkActivarBtn?.addEventListener('click', () => {
    const ids = obtenerInventarioSeleccion();
    actualizarInventarioLote(ids, { activo: 1 });
  });

  inventarioBulkDesactivarBtn?.addEventListener('click', () => {
    const ids = obtenerInventarioSeleccion();
    actualizarInventarioLote(ids, { activo: 0 });
  });

  inventarioBulkPrecioBtn?.addEventListener('click', () => {
    const ids = obtenerInventarioSeleccion();
    if (!ids.length) {
      setMensajeGenerico(inventarioMensaje, 'Selecciona items para actualizar el precio.', 'warning');
      return;
    }
    const nuevoPrecioTexto = window.prompt('Nuevo precio sugerido para los seleccionados:', '');
    if (!nuevoPrecioTexto) return;
    const nuevoPrecio = parseMoneyValue(nuevoPrecioTexto);
    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) {
      setMensajeGenerico(inventarioMensaje, 'Precio invalido.', 'warning');
      return;
    }
    actualizarInventarioLote(ids, { precio_sugerido: nuevoPrecio });
  });

  productosBody?.addEventListener('click', (event) => {
    const btnEditar = event.target.closest('[data-empresa-producto-action="editar"]');
    const btnEliminar = event.target.closest('[data-empresa-producto-action="eliminar"]');
    if (!btnEditar && !btnEliminar) return;
    const id = Number((btnEditar || btnEliminar).dataset.id);
    if (!Number.isFinite(id)) return;

    if (btnEliminar) {
      if (!window.confirm('Eliminar este producto?')) return;
      const endpoint = obtenerInventarioEndpoint(id);
      if (!endpoint) {
        setMensajeGenerico(productoMensaje, 'Selecciona una sucursal valida.', 'warning');
        return;
      }
      fetchConAutorizacion(endpoint, { method: 'DELETE' })
        .then((resp) => resp.json().catch(() => ({})))
        .then((data) => {
          if (data?.ok === false) throw new Error(data?.error || 'No se pudo eliminar');
          return cargarInventario();
        })
        .catch((error) => {
          setMensajeGenerico(productoMensaje, error.message || 'No se pudo eliminar.', 'error');
        });
      return;
    }

    const producto = inventarioItems.find((item) => Number(item.id) === id);
    if (!producto) return;
    abrirInventarioModal(producto);
    setMensajeGenerico(productoMensaje, 'Editando item.', 'info');
    mostrarTabEmpresa('inventario');
  });

  productosBody?.addEventListener('change', (event) => {
    if (!event.target.classList.contains('empresa-inventario-select')) return;
    if (!inventarioSelectAll) return;
    const checks = Array.from(document.querySelectorAll('.empresa-inventario-select'));
    const total = checks.length;
    const marcados = checks.filter((input) => input.checked).length;
    inventarioSelectAll.checked = total > 0 && total === marcados;
  });

  empleadoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarEmpleado();
  });

  empleadoLimpiarBtn?.addEventListener('click', () => {
    limpiarEmpleadoForm();
  });

  empleadosBody?.addEventListener('click', (event) => {
    const btnEditar = event.target.closest('[data-empresa-empleado-action="editar"]');
    const btnEliminar = event.target.closest('[data-empresa-empleado-action="eliminar"]');
    const row = event.target.closest('tr[data-empresa-empleado-id]');
    if (!btnEditar && !btnEliminar && !row) return;
    const id = Number((btnEditar || btnEliminar)?.dataset.id || row?.dataset.empresaEmpleadoId);
    if (!Number.isFinite(id)) return;

    if (btnEliminar) {
      if (!window.confirm('Eliminar este empleado?')) return;
      eliminarEmpleado(id);
      return;
    }

    const empleado = empleadosEmpresa.find((item) => Number(item.id) === id);
    if (!empleado) return;
    if (empleadoIdInput) empleadoIdInput.value = empleado.id;
    if (empleadoNombreInput) empleadoNombreInput.value = empleado.nombre || '';
    if (empleadoDocumentoInput) empleadoDocumentoInput.value = empleado.documento || '';
    if (empleadoTelefonoInput) empleadoTelefonoInput.value = empleado.telefono || '';
    if (empleadoCargoInput) empleadoCargoInput.value = empleado.cargo || '';
    if (empleadoSucursalSelect) empleadoSucursalSelect.value = empleado.negocio_id || '';
    if (empleadoTipoSelect) empleadoTipoSelect.value = empleado.tipo_pago || 'MENSUAL';
    if (empleadoSueldoInput) empleadoSueldoInput.value = empleado.sueldo_base || '';
    if (empleadoTarifaInput) empleadoTarifaInput.value = empleado.tarifa_hora || '';
    if (empleadoArsInput) empleadoArsInput.value = empleado.ars_porcentaje ?? '';
    if (empleadoAfpInput) empleadoAfpInput.value = empleado.afp_porcentaje ?? '';
    if (empleadoIsrInput) empleadoIsrInput.value = empleado.isr_porcentaje ?? '';
    if (empleadoActivoInput) empleadoActivoInput.checked = !!empleado.activo;
    setMensajeGenerico(empleadoMensaje, 'Editando empleado.', 'info');
    mostrarTabEmpresa('nomina');
  });

  asistenciaForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    registrarAsistencia();
  });

  movimientoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    registrarMovimiento();
  });

  nominaActualizarBtn?.addEventListener('click', () => {
    cargarNominaResumen();
  });

  contaActualizarBtn?.addEventListener('click', () => {
    cargarContabilidad();
  });

  contaMayorBtn?.addEventListener('click', () => {
    cargarMayor();
  });

  contaMayorSelect?.addEventListener('change', () => {
    cargarMayor();
  });

  contaAsientosSucursalSelect?.addEventListener('change', () => {
    filtrarContabilidadAsientos();
  });

  gastosViewToggle?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-gastos-view]');
    if (!btn) return;
    setGastosViewMode(btn.dataset.gastosView);
  });

  document.querySelectorAll('[data-gastos-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      aplicarRangoRapidoGastos(btn.dataset.gastosRange);
    });
  });

  gastosFiltrarBtn?.addEventListener('click', () => {
    cargarGastos();
  });

  gastosLimpiarBtn?.addEventListener('click', () => {
    if (gastosBuscarInput) gastosBuscarInput.value = '';
    if (gastosEstadoSelect) gastosEstadoSelect.value = '';
    if (gastosCategoriaInput) gastosCategoriaInput.value = '';
    if (gastosTipoSelect) gastosTipoSelect.value = '';
    if (gastosMetodoSelect) gastosMetodoSelect.value = '';
    if (gastosOrigenSelect) gastosOrigenSelect.value = '';
    if (gastosOrigenDetalleInput) gastosOrigenDetalleInput.value = '';
    if (gastosProveedorInput) gastosProveedorInput.value = '';
    if (gastosMinInput) gastosMinInput.value = '';
    if (gastosMaxInput) gastosMaxInput.value = '';
    if (gastosSucursalSelect) gastosSucursalSelect.value = '';
    if (gastosOrdenSelect) gastosOrdenSelect.value = 'fecha';
    cargarGastos();
  });

  gastosNuevoBtn?.addEventListener('click', () => {
    abrirModalGasto();
  });

  gastosCardsEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-gasto-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!Number.isFinite(id)) return;
    const action = btn.dataset.gastoAction;
    if (action === 'ver') abrirDetalleGasto(id);
    if (action === 'editar') {
      const gasto = gastosEmpresa.find((item) => Number(item.id) === id);
      abrirModalGasto(gasto || null);
    }
    if (action === 'aprobar') aprobarGasto(id);
    if (action === 'pagar') abrirPagoModal(id);
    if (action === 'anular') abrirAnularModal(id);
  });

  gastosTablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-gasto-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!Number.isFinite(id)) return;
    const action = btn.dataset.gastoAction;
    if (action === 'ver') abrirDetalleGasto(id);
    if (action === 'editar') {
      const gasto = gastosEmpresa.find((item) => Number(item.id) === id);
      abrirModalGasto(gasto || null);
    }
    if (action === 'pagar') abrirPagoModal(id);
    if (action === 'anular') abrirAnularModal(id);
  });

  gastosSelectAll?.addEventListener('change', () => {
    const checked = gastosSelectAll.checked;
    document.querySelectorAll('.empresa-gastos-select').forEach((input) => {
      input.checked = checked;
    });
  });

  gastosBulkAprobarBtn?.addEventListener('click', () => {
    accionMasivaGastos('aprobar');
  });

  gastosBulkAnularBtn?.addEventListener('click', () => {
    accionMasivaGastos('anular');
  });

  gastoCancelarBtn?.addEventListener('click', () => {
    cerrarModalGasto();
  });

  document.querySelectorAll('[data-gasto-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      gastoModalAccion = btn.dataset.gastoSave || 'borrador';
      gastoForm?.requestSubmit();
    });
  });

  gastoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarGasto();
  });

  gastoViewCerrarBtn?.addEventListener('click', () => {
    cerrarDetalleGasto();
  });

  gastoViewEditarBtn?.addEventListener('click', () => {
    const gasto = gastosEmpresa.find((item) => Number(item.id) === Number(gastoSeleccionadoId));
    if (gasto) {
      cerrarDetalleGasto();
      abrirModalGasto(gasto);
    }
  });

  gastoViewAprobarBtn?.addEventListener('click', () => {
    aprobarGasto();
  });

  gastoViewPagarBtn?.addEventListener('click', () => {
    abrirPagoModal();
  });

  gastoViewAnularBtn?.addEventListener('click', () => {
    abrirAnularModal();
  });

  gastoPagoCancelarBtn?.addEventListener('click', () => {
    cerrarPagoModal();
  });

  gastoPagoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    registrarPagoGasto();
  });

  gastoAnularCancelarBtn?.addEventListener('click', () => {
    cerrarAnularModal();
  });

  gastoAnularConfirmarBtn?.addEventListener('click', () => {
    confirmarAnularGasto();
  });

  clientesNuevoBtn?.addEventListener('click', () => {
    abrirClienteModal();
  });

  clientesImportarBtn?.addEventListener('click', () => {
    alert('Importacion en desarrollo. Puedes cargar clientes manualmente por ahora.');
  });

  clientesExportarBtn?.addEventListener('click', () => {
    exportarClientes();
  });

  clientesFiltrarBtn?.addEventListener('click', () => {
    cargarClientes();
  });

  clientesLimpiarBtn?.addEventListener('click', () => {
    if (clientesBuscarInput) clientesBuscarInput.value = '';
    if (clientesSegmentoSelect) clientesSegmentoSelect.value = '';
    if (clientesEstadoSelect) clientesEstadoSelect.value = '';
    if (clientesCreditoSelect) clientesCreditoSelect.value = '';
    if (clientesBalanceSelect) clientesBalanceSelect.value = '';
    if (clientesScopeSelect) clientesScopeSelect.value = '';
    if (clientesSucursalSelect) clientesSucursalSelect.value = '';
    if (clientesOrdenSelect) clientesOrdenSelect.value = 'nombre';
    if (clientesVipCheck) clientesVipCheck.checked = false;
    cargarClientes();
  });

  clientesViewToggle?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-clientes-view]');
    if (!btn) return;
    setClientesViewMode(btn.dataset.clientesView);
  });

  clientesCardsEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cliente-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!Number.isFinite(id)) return;
    const action = btn.dataset.clienteAction;
    if (action === 'ver') return abrirClienteDetalle(id, 'resumen');
    if (action === 'editar') {
      const cliente = clientesEmpresa.find((item) => Number(item.id) === id);
      if (cliente) abrirClienteModal(cliente);
      return;
    }
    if (action === 'estado') return abrirEstadoCuentaModal(id);
    if (action === 'abonar') return abrirClienteDetalle(id, 'cxc');
    if (action === 'bloquear') {
      const cliente = clientesEmpresa.find((item) => Number(item.id) === id);
      const estado = ['ACTIVO', 'MORA'].includes(cliente?.estado) ? 'BLOQUEADO' : 'ACTIVO';
      return actualizarEstadoCliente(id, estado);
    }
  });

  clientesTablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cliente-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!Number.isFinite(id)) return;
    const action = btn.dataset.clienteAction;
    if (action === 'ver') return abrirClienteDetalle(id, 'resumen');
    if (action === 'editar') {
      const cliente = clientesEmpresa.find((item) => Number(item.id) === id);
      if (cliente) abrirClienteModal(cliente);
      return;
    }
    if (action === 'estado') return abrirEstadoCuentaModal(id);
  });

  clientesSelectAll?.addEventListener('change', (event) => {
    const checked = event.target.checked;
    document.querySelectorAll('.empresa-cliente-select').forEach((input) => {
      input.checked = checked;
    });
  });

  clientesBulkVipBtn?.addEventListener('click', async () => {
    const ids = obtenerClientesSeleccionados();
    if (!ids.length) return;
    await Promise.all(
      ids.map((id) =>
        fetchConAutorizacion(`/api/empresa/clientes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vip: 1 }),
        })
      )
    );
    cargarClientes();
  });

  clientesBulkActivarBtn?.addEventListener('click', async () => {
    const ids = obtenerClientesSeleccionados();
    if (!ids.length) return;
    await Promise.all(
      ids.map((id) =>
        fetchConAutorizacion(`/api/empresa/clientes/${id}/estado`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'ACTIVO' }),
        })
      )
    );
    cargarClientes();
  });

  clientesBulkBloquearBtn?.addEventListener('click', async () => {
    const ids = obtenerClientesSeleccionados();
    if (!ids.length) return;
    await Promise.all(
      ids.map((id) =>
        fetchConAutorizacion(`/api/empresa/clientes/${id}/estado`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'BLOQUEADO' }),
        })
      )
    );
    cargarClientes();
  });

  clienteForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarCliente();
  });

  clienteCancelarBtn?.addEventListener('click', () => {
    cerrarClienteModal();
  });

  clienteGuardarEstadoBtn?.addEventListener('click', () => {
    clienteGuardarAbrirEstado = true;
    clienteForm?.requestSubmit();
  });

  clienteViewCerrarBtn?.addEventListener('click', () => {
    cerrarClienteDetalle();
  });

  clienteViewEditarBtn?.addEventListener('click', () => {
    if (clienteActual) abrirClienteModal(clienteActual);
  });

  clienteViewAbonarBtn?.addEventListener('click', () => {
    abrirAbonoModal();
  });

  configurarCierreOverlay(inventarioModal, cerrarInventarioModal);
  configurarCierreOverlay(inventarioMovModal, cerrarInventarioMovimientoModal);
  configurarCierreOverlay(clienteModal, cerrarClienteModal);
  configurarCierreOverlay(clienteViewModal, cerrarClienteDetalle);
  configurarCierreOverlay(clienteAbonoModal, cerrarAbonoModal);
  configurarCierreOverlay(clienteEstadoModal, cerrarEstadoCuentaModal);
  configurarCierreOverlay(clienteFacturaModal, cerrarFacturaModal);
  configurarCierreOverlay(facturaEmpresaModal, cerrarFacturaEmpresaModal);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    cerrarModalClienteActivo();
  });

  clienteViewEstadoBtn?.addEventListener('click', () => {
    if (clienteActual?.id) abrirEstadoCuentaModal(clienteActual.id);
  });

  clienteViewBloquearBtn?.addEventListener('click', () => {
    if (!clienteActual?.id) return;
    const estado = ['ACTIVO', 'MORA'].includes(clienteActual.estado) ? 'BLOQUEADO' : 'ACTIVO';
    actualizarEstadoCliente(clienteActual.id, estado);
  });

  clienteNuevaFacturaBtn?.addEventListener('click', () => {
    abrirFacturaModal();
  });

  clienteFacturaCancelarBtn?.addEventListener('click', () => {
    cerrarFacturaModal();
  });

  clienteFacturaAgregarBtn?.addEventListener('click', () => {
    agregarItemFactura();
  });

  clienteFacturaItemsBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-factura-item]');
    if (!btn) return;
    const itemKey = String(btn.dataset.facturaItem || '');
    if (!itemKey) return;
    clienteFacturaItems = clienteFacturaItems.filter(
      (item) => String(item.key || item.producto_id || item.producto_empresa_id || '') !== itemKey
    );
    renderFacturaItems();
  });

  clienteFacturaForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarFacturaCliente();
  });

  facturasNuevoBtn?.addEventListener('click', async () => {
    await cargarClientesFacturaEmpresa();
    abrirFacturaEmpresaModal();
  });

  facturasFiltrarBtn?.addEventListener('click', () => {
    cargarFacturas();
  });

  facturasLimpiarBtn?.addEventListener('click', () => {
    if (facturasBuscarInput) facturasBuscarInput.value = '';
    if (facturasEstadoSelect) facturasEstadoSelect.value = '';
    if (facturasSucursalSelect) facturasSucursalSelect.value = '';
    if (facturasOrdenSelect) facturasOrdenSelect.value = 'fecha_desc';
    if (facturasDesdeInput || facturasHastaInput) {
      const hoy = new Date();
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - 29);
      if (facturasDesdeInput) facturasDesdeInput.value = getLocalDateISO(inicio);
      if (facturasHastaInput) facturasHastaInput.value = getLocalDateISO(hoy);
    }
    cargarFacturas();
  });

  facturasTablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-factura-action]');
    if (!btn) return;
    const action = btn.dataset.facturaAction;
    if (action === 'ver') {
      const deudaId = Number(btn.dataset.facturaId);
      if (Number.isFinite(deudaId)) {
        window.open(`/cliente-factura.html?deudaId=${deudaId}&scope=empresa`, '_blank');
      }
      return;
    }
    if (action === 'abonar') {
      const clienteId = Number(btn.dataset.clienteId);
      if (Number.isFinite(clienteId)) {
        abrirClienteDetalle(clienteId, 'cxc');
      }
    }
  });

  facturaEmpresaCancelarBtn?.addEventListener('click', () => {
    cerrarFacturaEmpresaModal();
  });

  facturaEmpresaClienteSelect?.addEventListener('change', () => {
    actualizarDestinoFacturaEmpresa();
  });

  facturaEmpresaAgregarBtn?.addEventListener('click', () => {
    agregarItemFacturaEmpresa();
  });

  facturaEmpresaItemsBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-factura-item]');
    if (!btn) return;
    const itemKey = String(btn.dataset.facturaItem || '');
    if (!itemKey) return;
    facturaEmpresaItems = facturaEmpresaItems.filter(
      (item) => String(item.key || item.producto_id || item.producto_empresa_id || '') !== itemKey
    );
    renderFacturaEmpresaItems();
  });

  facturaEmpresaForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarFacturaEmpresa();
  });

  document.querySelectorAll('[data-cliente-view-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.clienteViewTab || 'resumen';
      cambiarTabClienteView(tab);
    });
  });

  clienteComprasBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-deuda-action]');
    if (!btn) return;
    const deudaId = Number(btn.dataset.deudaId);
    if (!Number.isFinite(deudaId)) return;
    if (btn.dataset.deudaAction === 'factura') {
      window.open(`/cliente-factura.html?deudaId=${deudaId}&scope=empresa`, '_blank');
    }
  });

  clienteCxcBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-deuda-action]');
    if (!btn) return;
    const deudaId = Number(btn.dataset.deudaId);
    if (!Number.isFinite(deudaId)) return;
    if (btn.dataset.deudaAction === 'abonar') {
      abrirAbonoModal(deudaId);
      return;
    }
    if (btn.dataset.deudaAction === 'factura') {
      window.open(`/cliente-factura.html?deudaId=${deudaId}&scope=empresa`, '_blank');
    }
  });

  clienteNotaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!clienteActual?.id) return;
    const nota = clienteNotaTexto?.value?.trim();
    if (!nota) {
      setMensajeGenerico(clienteNotaMensaje, 'Escribe una nota.', 'warning');
      return;
    }
    try {
      setMensajeGenerico(clienteNotaMensaje, 'Guardando nota...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/clientes/${clienteActual.id}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar la nota');
      }
      if (clienteNotaTexto) clienteNotaTexto.value = '';
      setMensajeGenerico(clienteNotaMensaje, '');
      await cargarClienteNotas();
    } catch (error) {
      console.error('Error guardando nota:', error);
      setMensajeGenerico(clienteNotaMensaje, error.message || 'No se pudo guardar.', 'error');
    }
  });

  clienteAbonoCancelarBtn?.addEventListener('click', () => {
    cerrarAbonoModal();
  });

  clienteAbonoForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    guardarAbonoCliente();
  });

  clienteEstadoActualizarBtn?.addEventListener('click', () => {
    cargarEstadoCuenta();
  });

  clienteEstadoImprimirBtn?.addEventListener('click', () => {
    window.print();
  });

  clienteEstadoCerrarBtn?.addEventListener('click', () => {
    cerrarEstadoCuentaModal();
  });

  actualizarBtn?.addEventListener('click', () => {
    cargarAnalisisEmpresa();
  });

  supervisorCancelarBtn?.addEventListener('click', () => {
    cerrarModalSupervisor();
  });

  supervisorGuardarBtn?.addEventListener('click', () => {
    guardarSupervisor();
  });

  quickSupervisorBtn?.addEventListener('click', () => {
    if (!quickSupervisorSelect) return;
    const id = Number(quickSupervisorSelect.value);
    if (!Number.isFinite(id)) {
      setMensaje('Selecciona una sucursal para crear supervisor.', 'warning');
      return;
    }
    const sucursal = (sucursalesCache || []).find((item) => Number(item.id) === id) || { id };
    abrirModalSupervisor(sucursal);
  });

  iniciarFechas();
  cargarAnalisisEmpresa();
  actualizarInventarioScopeUI();
  cargarInventario();
  cargarEmpleados();
  cargarNominaResumen();
  cargarContabilidad();

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search || '');
    const tabQuery = params.get('tab');
    if (tabQuery) {
      mostrarTabEmpresa(tabQuery);
    }
  }
})();


