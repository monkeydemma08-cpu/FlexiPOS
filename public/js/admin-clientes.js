(() => {
  const seccion = document.getElementById('admin-section-clientes');
  if (!seccion) return;

  const tablaBody = document.getElementById('clientes-tabla');
  const mensajeLista = document.getElementById('clientes-lista-mensaje');
  const inputBuscar = document.getElementById('clientes-buscar');
  const btnBuscar = document.getElementById('clientes-filtrar');
  const selectEstado = document.getElementById('clientes-estado');
  const selectSaldo = document.getElementById('clientes-saldo');
  const btnLimpiar = document.getElementById('clientes-limpiar');

  const resumenClientesTotal = document.getElementById('admin-clientes-total');
  const resumenClientesActivos = document.getElementById('admin-clientes-activos');
  const resumenClientesSaldo = document.getElementById('admin-clientes-saldo-total');

  const resumenClienteNombre = document.getElementById('admin-cliente-resumen-nombre');
  const resumenClienteDocumento = document.getElementById('admin-cliente-resumen-documento');
  const resumenClienteTelefono = document.getElementById('admin-cliente-resumen-telefono');
  const resumenClienteEmail = document.getElementById('admin-cliente-resumen-email');
  const resumenClienteEstado = document.getElementById('admin-cliente-estado-badge');

  const form = document.getElementById('cliente-form');
  const inputId = document.getElementById('cliente-id');
  const inputNombre = document.getElementById('cliente-nombre');
  const inputDocumento = document.getElementById('cliente-documento');
  const selectTipoDocumento = document.getElementById('cliente-tipo-documento');
  const inputTelefono = document.getElementById('cliente-telefono');
  const inputEmail = document.getElementById('cliente-email');
  const inputDireccion = document.getElementById('cliente-direccion');
  const inputNotas = document.getElementById('cliente-notas');
  const inputActivo = document.getElementById('cliente-activo');
  const btnNuevo = document.getElementById('cliente-nuevo');
  const btnFacturaNueva = document.getElementById('cliente-factura-nueva');
  const mensajeForm = document.getElementById('cliente-mensaje');

  // --- Fase 2: rutas, crédito, historial, exportar ---
  const selectRuta = document.getElementById('cliente-ruta');
  const inputWhatsapp = document.getElementById('cliente-whatsapp');
  const chkCreditoActivo = document.getElementById('cliente-credito-activo');
  const inputCreditoLimite = document.getElementById('cliente-credito-limite');
  const inputCreditoDias = document.getElementById('cliente-credito-dias');
  const chkCreditoBloqueo = document.getElementById('cliente-credito-bloqueo');
  const creditoDetalle = document.getElementById('cliente-credito-detalle');
  const selectRutaFiltro = document.getElementById('clientes-ruta-filtro');
  const btnGestionarRutas = document.getElementById('clientes-gestionar-rutas');
  const btnExportar = document.getElementById('clientes-exportar');
  const rutasModal = document.getElementById('rutas-modal');
  const rutasModalCerrar = document.getElementById('rutas-modal-cerrar');
  const rutasModalTabla = document.getElementById('rutas-modal-tabla');
  const rutasModalMensaje = document.getElementById('rutas-modal-mensaje');
  const inputRutaNueva = document.getElementById('ruta-nueva-nombre');
  const btnRutaAgregar = document.getElementById('ruta-agregar');
  const historialTotal = document.getElementById('cliente-historial-total');
  const historialTabla = document.getElementById('cliente-historial-tabla');
  let rutas = [];

  const escapeHtml = (str) =>
    String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const resumenDeudasTotal = document.getElementById('clientes-deudas-total');
  const resumenDeudasPagado = document.getElementById('clientes-deudas-pagado');
  const resumenDeudasSaldo = document.getElementById('clientes-deudas-saldo');
  const mensajeDeudas = document.getElementById('cliente-deudas-mensaje');
  const tablaDeudas = document.getElementById('cliente-deudas-tabla');
  const deudaForm = document.getElementById('cliente-deuda-form');
  const inputDeudaId = document.getElementById('deuda-id');
  const inputDeudaDescripcion = document.getElementById('deuda-descripcion');
  const inputDeudaFecha = document.getElementById('deuda-fecha');
  const selectDeudaTipoComprobante = document.getElementById('deuda-tipo-comprobante');
  const inputDeudaNcf = document.getElementById('deuda-ncf');
  const inputDeudaMonto = document.getElementById('deuda-monto');
  const inputDeudaNotas = document.getElementById('deuda-notas');
  const btnDeudaNueva = document.getElementById('deuda-nueva');
  const mensajeDeuda = document.getElementById('deuda-mensaje');
  const selectDeudaProducto = document.getElementById('deuda-producto-select');
  const inputDeudaCantidad = document.getElementById('deuda-producto-cantidad');
  const btnDeudaProductoAgregar = document.getElementById('deuda-producto-agregar');
  const tablaDeudaProductos = document.getElementById('deuda-productos-tabla');

  const abonoForm = document.getElementById('deuda-abono-form');
  const inputAbonoFecha = document.getElementById('abono-fecha');
  const inputAbonoMonto = document.getElementById('abono-monto');
  const selectAbonoMetodo = document.getElementById('abono-metodo');
  const inputAbonoNotas = document.getElementById('abono-notas');
  const mensajeAbono = document.getElementById('deuda-abono-mensaje');
  const tablaAbonos = document.getElementById('deuda-abonos-tabla');
  const deudaSeleccionadaLabel = document.getElementById('deuda-seleccionada');

  let clientes = [];
  let clienteActual = null;
  let deudas = [];
  let deudaActual = null;
  let abonos = [];
  let productos = [];
  let productosMap = new Map();
  let deudaItems = [];

  const setMessage = (element, text, type = 'info') => {
    if (!element) return;
    element.textContent = text || '';
    element.dataset.type = text ? type : '';
  };

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(numero);
  };

  const aplicarFiltrosClientes = (lista = []) => {
    let resultado = Array.isArray(lista) ? [...lista] : [];
    const estado = selectEstado?.value || '';
    if (estado === 'activos') {
      resultado = resultado.filter((cli) => Number(cli?.activo ?? 1) !== 0);
    }
    if (estado === 'inactivos') {
      resultado = resultado.filter((cli) => Number(cli?.activo ?? 1) === 0);
    }
    const saldo = selectSaldo?.value || '';
    if (saldo === 'pendiente') {
      resultado = resultado.filter((cli) => Number(cli?.saldo_pendiente ?? 0) > 0);
    }
    if (saldo === 'cero') {
      resultado = resultado.filter((cli) => Number(cli?.saldo_pendiente ?? 0) <= 0);
    }
    const rutaSel = selectRutaFiltro?.value || '';
    if (rutaSel === 'sin') {
      resultado = resultado.filter((cli) => !cli?.ruta_id);
    } else if (rutaSel) {
      resultado = resultado.filter((cli) => Number(cli?.ruta_id) === Number(rutaSel));
    }
    return resultado;
  };

  const renderResumenClientes = (lista = []) => {
    if (!resumenClientesTotal && !resumenClientesActivos && !resumenClientesSaldo) {
      return;
    }
    const total = lista.length;
    const activos = lista.filter((cli) => Number(cli?.activo ?? 1) !== 0).length;
    const saldoTotal = lista.reduce((acc, cli) => acc + (Number(cli?.saldo_pendiente ?? 0) || 0), 0);
    if (resumenClientesTotal) resumenClientesTotal.textContent = total;
    if (resumenClientesActivos) resumenClientesActivos.textContent = activos;
    if (resumenClientesSaldo) resumenClientesSaldo.textContent = formatCurrency(saldoTotal);
  };

  const actualizarResumenCliente = (cliente = null) => {
    if (resumenClienteNombre) resumenClienteNombre.textContent = cliente?.nombre || '--';
    if (resumenClienteDocumento) resumenClienteDocumento.textContent = cliente?.documento || '--';
    if (resumenClienteTelefono) resumenClienteTelefono.textContent = cliente?.telefono || '--';
    if (resumenClienteEmail) resumenClienteEmail.textContent = cliente?.email || '--';
    if (resumenClienteEstado) {
      if (!cliente) {
        resumenClienteEstado.textContent = 'Sin selección';
        resumenClienteEstado.dataset.status = 'none';
      } else {
        const activo = Number(cliente?.activo ?? 1) !== 0;
        resumenClienteEstado.textContent = activo ? 'Activo' : 'Inactivo';
        resumenClienteEstado.dataset.status = activo ? 'activo' : 'inactivo';
      }
    }
  };

  const parseMoneyValue = (input, { fallback = 0, allowEmpty = true } = {}) => {
    const raw =
      input && typeof input === 'object' && 'value' in input ? input.value : input ?? '';
    const texto = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!texto) return allowEmpty ? fallback : NaN;
    const parsed = window.KANMMoney?.parse
      ? window.KANMMoney.parse(texto)
      : Number(texto.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const setMoneyInputValue = (input, value) => {
    if (!input) return;
    if (window.KANMMoney?.setValue && input.matches?.('input[data-money]')) {
      window.KANMMoney.setValue(input, value);
      return;
    }
    input.value = value ?? '';
  };

  const getLocalDateISO = (date = new Date()) => {
    const tzOffset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - tzOffset * 60000);
    return local.toISOString().slice(0, 10);
  };

  const normalizarTipoComprobante = (value, fallback = 'Sin comprobante') => {
    if (value === undefined || value === null) return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    const lower = text.toLowerCase();
    if (['sin comprobante', 'sin_comprobante', 'sin'].includes(lower)) {
      return 'Sin comprobante';
    }
    if (['b01', 'b02', 'b14'].includes(lower)) {
      return lower.toUpperCase();
    }
    return fallback;
  };

  const esSinComprobante = (value) =>
    normalizarTipoComprobante(value, 'Sin comprobante') === 'Sin comprobante';

  const actualizarEstadoComprobanteDeuda = (bloquearTipo = false) => {
    const tipo = normalizarTipoComprobante(selectDeudaTipoComprobante?.value, 'Sin comprobante');
    if (selectDeudaTipoComprobante) {
      const opciones = Array.from(selectDeudaTipoComprobante.options || []);
      const existe = opciones.some((option) => option.value === tipo);
      selectDeudaTipoComprobante.value = existe ? tipo : 'Sin comprobante';
      selectDeudaTipoComprobante.disabled = bloquearTipo;
    }
    if (inputDeudaNcf) {
      if (esSinComprobante(tipo) && !bloquearTipo) {
        inputDeudaNcf.value = '';
      }
      inputDeudaNcf.readOnly = true;
      inputDeudaNcf.placeholder = esSinComprobante(tipo)
        ? 'Sin comprobante'
        : 'Se genera automaticamente al guardar';
    }
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return value;
    return fecha.toLocaleDateString('es-DO');
  };

  const construirOpcionesProductos = () =>
    ['<option value="">Selecciona producto</option>']
      .concat(productos.map((p) => `<option value="${p.id}">${p.nombre}</option>`))
      .join('');

  const refrescarSelectDeudaProductos = () => {
    if (!selectDeudaProducto) return;
    selectDeudaProducto.innerHTML = construirOpcionesProductos();
  };

  const cargarProductos = async () => {
    try {
      const resp = await fetchAutorizado('/api/productos?solo_venta=1');
      if (!resp.ok) throw new Error('No se pudieron cargar los productos');
      productos = ((await resp.json()) || []).filter((p) => Number(p?.activo ?? 1) !== 0);
      productosMap = new Map(productos.map((p) => [Number(p.id), p]));
      refrescarSelectDeudaProductos();
    } catch (error) {
      console.error('Error al cargar productos:', error);
      productos = [];
      productosMap = new Map();
      refrescarSelectDeudaProductos();
    }
  };

  const calcularTotalDeudaItems = (items = deudaItems) =>
    items.reduce((acc, item) => {
      const cantidad = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      return acc + precio * cantidad;
    }, 0);

  const obtenerResumenDeudaItems = (items = deudaItems) => {
    if (!items.length) return null;
    const partes = items
      .map((item) => {
        const cantidad = Number(item.cantidad) || 0;
        if (!cantidad) return null;
        const cantidadTexto = Number.isInteger(cantidad) ? cantidad : cantidad.toFixed(2);
        return `${cantidadTexto}x ${item.nombre}`;
      })
      .filter(Boolean);
    if (!partes.length) return null;
    const resumen = partes.slice(0, 3).join(', ');
    return partes.length > 3 ? `${resumen} y ${partes.length - 3} más` : resumen;
  };

  const actualizarMontoDeuda = () => {
    if (!inputDeudaMonto) return;
    if (deudaItems.length) {
      const total = Number(calcularTotalDeudaItems().toFixed(2));
      setMoneyInputValue(inputDeudaMonto, total);
      inputDeudaMonto.readOnly = true;
      inputDeudaMonto.dataset.auto = '1';
      return;
    }
    if (inputDeudaMonto.dataset.auto === '1') {
      setMoneyInputValue(inputDeudaMonto, '');
      inputDeudaMonto.dataset.auto = '';
    }
    inputDeudaMonto.readOnly = false;
  };

  const renderDeudaItems = () => {
    if (!tablaDeudaProductos) return;
    tablaDeudaProductos.innerHTML = '';

    if (!deudaItems.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 5;
      celda.className = 'tabla-vacia';
      celda.textContent = 'No hay productos agregados.';
      fila.appendChild(celda);
      tablaDeudaProductos.appendChild(fila);
      actualizarMontoDeuda();
      return;
    }

    deudaItems.forEach((item) => {
      const fila = document.createElement('tr');
      const totalLinea = (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0);
      fila.innerHTML = `
        <td>${item.nombre || '--'}</td>
        <td class="text-right">
          <input
            type="number"
            min="0.01"
            step="0.01"
            class="deuda-item-cantidad"
            data-deuda-item="${item.producto_id}"
            value="${item.cantidad}"
          />
        </td>
        <td class="text-right">
          <input
            type="number"
            min="0"
            step="0.01"
            class="deuda-item-precio"
            data-deuda-item-precio="${item.producto_id}"
            value="${Number(item.precio_unitario || 0).toFixed(2)}"
          />
        </td>
        <td class="text-right">${formatCurrency(totalLinea)}</td>
        <td>
          <button type="button" class="kanm-button ghost" data-deuda-item-remove="${item.producto_id}">
            Quitar
          </button>
        </td>
      `;
      tablaDeudaProductos.appendChild(fila);
    });

    actualizarMontoDeuda();
  };

  const limpiarDeudaItems = () => {
    deudaItems = [];
    renderDeudaItems();
  };

  const cargarDetalleDeuda = async (deudaId) => {
    if (!clienteActual?.id || !deudaId) {
      limpiarDeudaItems();
      return;
    }

    try {
      const resp = await fetchAutorizado(
        `/api/clientes/${clienteActual.id}/deudas/${deudaId}/detalle`
      );
      const data = await resp.json();
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || 'No se pudo cargar el detalle de la factura');
      }
      const items = Array.isArray(data.items) ? data.items : [];
      deudaItems = items.map((item) => ({
        producto_id: Number(item.producto_id),
        nombre: item.nombre || item.producto_nombre || '--',
        cantidad: Number(item.cantidad) || 0,
        precio_unitario: Number(item.precio_unitario) || 0,
      }));
      renderDeudaItems();
    } catch (error) {
      console.error('Error al cargar detalle de factura:', error);
      limpiarDeudaItems();
    }
  };

  const agregarProductoDeuda = () => {
    if (!selectDeudaProducto) return;
    const productoId = Number(selectDeudaProducto.value);
    const cantidad = Number(inputDeudaCantidad?.value);

    if (!Number.isFinite(productoId) || productoId <= 0) {
      setMessage(mensajeDeuda, 'Selecciona un producto válido.', 'error');
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setMessage(mensajeDeuda, 'Ingresa una cantidad válida.', 'error');
      return;
    }

    const producto = productosMap.get(productoId);
    if (!producto) {
      setMessage(mensajeDeuda, 'Producto no encontrado.', 'error');
      return;
    }

    const existente = deudaItems.find((item) => item.producto_id === productoId);
    if (existente) {
      existente.cantidad = Number((Number(existente.cantidad) + cantidad).toFixed(2));
    } else {
      deudaItems.push({
        producto_id: productoId,
        nombre: producto.nombre || '--',
        cantidad,
        precio_unitario: Number(producto.precio) || 0,
      });
    }

    renderDeudaItems();
    setMessage(mensajeDeuda, '');
    if (inputDeudaCantidad) inputDeudaCantidad.value = '1';
    selectDeudaProducto.value = '';
  };

  const obtenerTotalesDeuda = (deuda) => {
    const total = Number(deuda?.monto_total ?? deuda?.monto ?? 0) || 0;
    const pagado = Number(deuda?.pagado ?? deuda?.total_abonos ?? 0) || 0;
    const saldo = Math.max(total - pagado, 0);
    return { total, pagado, saldo };
  };

  const obtenerEstadoDeuda = (deuda) => {
    const { pagado, saldo } = obtenerTotalesDeuda(deuda);
    if (saldo <= 0) return 'saldada';
    if (pagado > 0) return 'parcial';
    return 'pendiente';
  };

  const obtenerResumenDeudas = (lista = []) =>
    lista.reduce(
      (acc, deuda) => {
        const { total, pagado } = obtenerTotalesDeuda(deuda);
        acc.total += total;
        acc.pagado += pagado;
        return acc;
      },
      { total: 0, pagado: 0 }
    );

  const normalizarResumenDeudas = (resumen) => {
    if (!resumen || typeof resumen !== 'object') return null;
    return {
      total: Number(resumen.total_deuda ?? resumen.total ?? 0) || 0,
      pagado: Number(resumen.total_abonos ?? resumen.pagado ?? 0) || 0,
      saldo: Number(resumen.saldo_pendiente ?? resumen.saldo ?? 0) || 0,
    };
  };

  const renderResumenDeudas = (resumen = null) => {
    let datos = normalizarResumenDeudas(resumen);
    if (!datos) {
      const acumulado = obtenerResumenDeudas(deudas);
      datos = {
        total: acumulado.total,
        pagado: acumulado.pagado,
        saldo: Math.max(acumulado.total - acumulado.pagado, 0),
      };
    }

    if (resumenDeudasTotal) resumenDeudasTotal.textContent = formatCurrency(datos.total);
    if (resumenDeudasPagado) resumenDeudasPagado.textContent = formatCurrency(datos.pagado);
    if (resumenDeudasSaldo) {
      resumenDeudasSaldo.textContent = formatCurrency(datos.saldo);
      resumenDeudasSaldo.classList.toggle('deuda-saldo', datos.saldo > 0);
    }
  };

  const setFormEnabled = (formElement, enabled) => {
    if (!formElement) return;
    const controles = Array.from(formElement.elements || []);
    controles.forEach((control) => {
      if (!control) return;
      control.disabled = !enabled;
    });
  };

  const limpiarDeudaForm = (mantenerFecha = false) => {
    if (inputDeudaId) inputDeudaId.value = '';
    if (inputDeudaDescripcion) inputDeudaDescripcion.value = '';
    if (inputDeudaNotas) inputDeudaNotas.value = '';
    if (inputDeudaFecha && !mantenerFecha) inputDeudaFecha.value = getLocalDateISO();
    if (selectDeudaTipoComprobante) selectDeudaTipoComprobante.value = 'Sin comprobante';
    if (inputDeudaNcf) inputDeudaNcf.value = '';
    if (selectDeudaProducto) selectDeudaProducto.value = '';
    if (inputDeudaCantidad) inputDeudaCantidad.value = '1';
    limpiarDeudaItems();
    if (inputDeudaMonto) {
      setMoneyInputValue(inputDeudaMonto, '');
      inputDeudaMonto.dataset.auto = '';
      inputDeudaMonto.readOnly = false;
    }
    actualizarEstadoComprobanteDeuda(false);
    setMessage(mensajeDeuda, '');
  };

  const limpiarAbonoForm = (mantenerFecha = false) => {
    if (inputAbonoNotas) inputAbonoNotas.value = '';
    if (selectAbonoMetodo) selectAbonoMetodo.value = '';
    if (inputAbonoFecha && !mantenerFecha) inputAbonoFecha.value = getLocalDateISO();
    if (inputAbonoMonto) setMoneyInputValue(inputAbonoMonto, '');
    setMessage(mensajeAbono, '');
  };

  const resetDeudasUI = (mensaje) => {
    deudas = [];
    deudaActual = null;
    abonos = [];
    renderDeudas();
    renderAbonos();
    renderResumenDeudas();
    if (deudaSeleccionadaLabel) {
      deudaSeleccionadaLabel.textContent =
        'Selecciona una factura para registrar abonos.';
    }
    setMessage(mensajeDeudas, mensaje || 'Selecciona un cliente para ver sus facturas y cuentas por cobrar.', 'info');
    limpiarDeudaForm();
    limpiarAbonoForm();
    setFormEnabled(deudaForm, false);
    setFormEnabled(abonoForm, false);
  };

  const renderClientes = () => {
    if (!tablaBody) return;
    tablaBody.innerHTML = '';

    const lista = aplicarFiltrosClientes(clientes);
    renderResumenClientes(lista);

    if (!lista.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.className = 'tabla-vacia';
      celda.textContent = clientes.length ? 'No hay clientes para los filtros seleccionados.' : 'No hay clientes registrados.';
      fila.appendChild(celda);
      tablaBody.appendChild(fila);
      return;
    }

    lista.forEach((cli) => {
      const fila = document.createElement('tr');
      if (clienteActual?.id === cli.id) {
        fila.classList.add('cliente-row--selected');
      }
      const saldo = Number(cli.saldo_pendiente ?? 0) || 0;
      const nombreHtml = `${cli.nombre || ''}${Number(cli.credito_activo) ? ' <span class="cliente-badge cliente-badge--credito" title="Cliente con crédito">Crédito</span>' : ''}`;
      const rutaHtml = cli.ruta_nombre
        ? `<span class="cliente-ruta-chip">${cli.ruta_nombre}</span>`
        : '<span class="kanm-subtitle">—</span>';
      fila.innerHTML = `
        <td>${nombreHtml}</td>
        <td>${cli.documento || ''}</td>
        <td>${cli.telefono || ''}</td>
        <td>${rutaHtml}</td>
        <td>${formatCurrency(saldo)}</td>
        <td>${cli.activo ? 'Activo' : 'Inactivo'}</td>
        <td><button type="button" class="kanm-button ghost" data-editar-cliente="${cli.id}">Editar</button></td>
      `;
      tablaBody.appendChild(fila);
    });
  };

  const getAuthHeaders = () => {
    try {
      return window.kanmAuth?.getAuthHeaders?.() || {};
    } catch (error) {
      console.warn('No se pudieron obtener encabezados de autenticación:', error);
      return {};
    }
  };

  const fetchAutorizado = (url, opts = {}) =>
    fetch(url, { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } });

  const fetchJsonAutorizado = (url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(opts.headers || {}),
      },
    });

  const cargarClientes = async () => {
    setMessage(mensajeLista, 'Cargando clientes...', 'info');
    try {
      const term = inputBuscar?.value?.trim() || '';
      // Traemos TODOS (activos e inactivos) con los campos ricos; el filtrado
      // fino (estado/saldo/ruta) se hace en el cliente con aplicarFiltrosClientes.
      const resp = await fetchAutorizado(
        `/api/clientes?search=${encodeURIComponent(term)}&estado=todos&limit=1000`
      );
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudo cargar clientes');
      clientes = data?.clientes || [];
      renderClientes();
      setMessage(mensajeLista, '');
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setMessage(mensajeLista, 'No fue posible obtener los clientes.', 'error');
    }
  };

  const renderDeudas = () => {
    if (!tablaDeudas) return;
    tablaDeudas.innerHTML = '';

    if (!deudas.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.className = 'tabla-vacia';
      celda.textContent = 'No hay facturas registradas.';
      fila.appendChild(celda);
      tablaDeudas.appendChild(fila);
      return;
    }

    const estadoTexto = {
      pendiente: 'Pendiente',
      parcial: 'Parcial',
      saldada: 'Saldada',
    };

    const estadoClase = {
      pendiente: 'estado-pendiente',
      parcial: 'estado-parcial',
      saldada: 'estado-pagado',
    };

    deudas.forEach((deuda) => {
      const { total, pagado, saldo } = obtenerTotalesDeuda(deuda);
      const estado = deuda.estado || obtenerEstadoDeuda(deuda);
      const fila = document.createElement('tr');
      if (deudaActual?.id === deuda.id) {
        fila.classList.add('deuda-row--selected');
      }
      const descripcion = [
        deuda.descripcion || deuda.concepto || '--',
        deuda.ncf
          ? `NCF ${deuda.ncf}`
          : deuda.tipo_comprobante && !esSinComprobante(deuda.tipo_comprobante)
          ? deuda.tipo_comprobante
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
      fila.innerHTML = `
        <td>${formatDate(deuda.fecha)}</td>
        <td>${descripcion}</td>
        <td>${formatCurrency(total)}</td>
        <td>${formatCurrency(pagado)}</td>
        <td>${formatCurrency(saldo)}</td>
        <td><span class="kanm-badge ${estadoClase[estado] || 'estado-pendiente'}">${
          estadoTexto[estado] || 'Pendiente'
        }</span></td>
        <td>
          <div class="acciones-inline">
            <button type="button" class="kanm-button ghost" data-deuda-ver="${deuda.id}">Ver</button>
            <button type="button" class="kanm-button ghost" data-deuda-abonos="${deuda.id}">Abonar</button>
            <button type="button" class="kanm-button ghost" data-deuda-editar="${deuda.id}">Editar</button>
          </div>
        </td>
      `;
      tablaDeudas.appendChild(fila);
    });
  };

  const renderAbonos = () => {
    if (!tablaAbonos) return;
    tablaAbonos.innerHTML = '';

    if (!abonos.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 4;
      celda.className = 'tabla-vacia';
      celda.textContent = deudaActual ? 'Sin abonos registrados.' : 'Selecciona una factura para ver abonos.';
      fila.appendChild(celda);
      tablaAbonos.appendChild(fila);
      return;
    }

    abonos.forEach((abono) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${formatDate(abono.fecha)}</td>
        <td>${formatCurrency(abono.monto)}</td>
        <td>${abono.metodo_pago || abono.metodo || '--'}</td>
        <td>${abono.notas || '--'}</td>
      `;
      tablaAbonos.appendChild(fila);
    });
  };

  const actualizarPanelAbonos = () => {
    if (deudaSeleccionadaLabel) {
      if (deudaActual) {
        const { saldo } = obtenerTotalesDeuda(deudaActual);
        const detalle = deudaActual.descripcion || `Factura #${deudaActual.id}`;
        deudaSeleccionadaLabel.textContent = `${detalle} · Saldo ${formatCurrency(saldo)}`;
      } else {
        deudaSeleccionadaLabel.textContent = 'Selecciona una factura para registrar abonos.';
      }
    }
    setFormEnabled(abonoForm, Boolean(deudaActual?.id));
  };

  const cargarDeudas = async ({ mantenerSeleccion = false, seleccionarId = null, mantenerEdicionId = null } = {}) => {
    if (!clienteActual?.id) {
      resetDeudasUI();
      return;
    }

    setMessage(mensajeDeudas, 'Cargando facturas...', 'info');
    try {
      const resp = await fetchAutorizado(`/api/clientes/${clienteActual.id}/deudas`);
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudieron cargar las facturas');
      deudas = Array.isArray(data.deudas) ? data.deudas : [];
      renderResumenDeudas(data.resumen);
      const objetivo = seleccionarId ?? (mantenerSeleccion ? deudaActual?.id : null);
      deudaActual = objetivo ? deudas.find((d) => d.id === objetivo) || null : null;
      renderDeudas();
      actualizarPanelAbonos();
      if (deudaActual) {
        await cargarAbonos();
      } else {
        abonos = [];
        renderAbonos();
        setMessage(mensajeAbono, '');
      }
      if (mantenerEdicionId) {
        const deudaEditar = deudas.find((d) => d.id === mantenerEdicionId);
        if (deudaEditar) {
          cargarDeudaEnFormulario(deudaEditar);
        }
      }
      setMessage(mensajeDeudas, '');
      setFormEnabled(deudaForm, true);
      actualizarEstadoComprobanteDeuda(Boolean((inputDeudaNcf?.value || '').trim()));
    } catch (error) {
      console.error('Error al cargar facturas:', error);
      setMessage(mensajeDeudas, 'No fue posible obtener las facturas.', 'error');
    }
  };

  const cargarAbonos = async () => {
    if (!clienteActual?.id || !deudaActual?.id) {
      abonos = [];
      renderAbonos();
      return;
    }

    setMessage(mensajeAbono, 'Cargando abonos...', 'info');
    try {
      const resp = await fetchAutorizado(
        `/api/clientes/${clienteActual.id}/deudas/${deudaActual.id}/abonos`
      );
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudieron cargar los abonos');
      abonos = Array.isArray(data.abonos) ? data.abonos : [];
      renderAbonos();
      setMessage(mensajeAbono, '');
    } catch (error) {
      console.error('Error al cargar abonos:', error);
      setMessage(mensajeAbono, 'No fue posible obtener los abonos.', 'error');
    }
  };

  const cargarEnFormulario = (cli) => {
    if (!cli) return;
    clienteActual = cli;
    inputId.value = cli.id || '';
    inputNombre.value = cli.nombre || '';
    inputDocumento.value = cli.documento || '';
    selectTipoDocumento.value = cli.tipo_documento || '';
    inputTelefono.value = cli.telefono || '';
    inputEmail.value = cli.email || '';
    inputDireccion.value = cli.direccion || '';
    inputNotas.value = cli.notas || '';
    inputActivo.checked = cli.activo !== 0;
    if (selectRuta) selectRuta.value = cli.ruta_id ? String(cli.ruta_id) : '';
    if (inputWhatsapp) inputWhatsapp.value = cli.whatsapp || '';
    if (chkCreditoActivo) chkCreditoActivo.checked = Number(cli.credito_activo) === 1;
    if (inputCreditoLimite) inputCreditoLimite.value = Number(cli.credito_limite) || '';
    if (inputCreditoDias) inputCreditoDias.value = Number(cli.credito_dias) || '';
    if (chkCreditoBloqueo) chkCreditoBloqueo.checked = Number(cli.credito_bloqueo_exceso) === 1;
    actualizarVisibilidadCredito();
    setMessage(mensajeForm, '');
    actualizarResumenCliente(cli);
    renderClientes();
    setFormEnabled(deudaForm, true);
    limpiarDeudaForm();
    limpiarAbonoForm();
    cargarDeudas();
    cargarHistorialCompras(cli.id);
    // Cargar historial POS + estado de cuenta del cliente seleccionado.
    // Estas funciones son no-op si los elementos del DOM no existen.
    if (typeof cargarHistorialPosCliente === 'function') {
      cargarHistorialPosCliente(cli.id, true);
    }
  };

  const obtenerPayload = () => ({
    nombre: inputNombre.value.trim(),
    documento: inputDocumento.value.trim() || null,
    tipo_documento: selectTipoDocumento.value || null,
    telefono: inputTelefono.value.trim() || null,
    email: inputEmail.value.trim() || null,
    direccion: inputDireccion.value.trim() || null,
    notas: inputNotas.value.trim() || null,
    activo: inputActivo.checked ? 1 : 0,
    ruta_id: selectRuta?.value ? Number(selectRuta.value) : null,
    whatsapp: inputWhatsapp?.value.trim() || null,
    credito_activo: chkCreditoActivo?.checked ? 1 : 0,
    credito_limite: Number(inputCreditoLimite?.value) || 0,
    credito_dias: parseInt(inputCreditoDias?.value, 10) || 0,
    credito_bloqueo_exceso: chkCreditoBloqueo?.checked ? 1 : 0,
  });

  const actualizarVisibilidadCredito = () => {
    if (creditoDetalle) creditoDetalle.style.display = chkCreditoActivo?.checked ? '' : 'none';
  };

  const guardarCliente = async () => {
    const payload = obtenerPayload();
    if (!payload.nombre) {
      setMessage(mensajeForm, 'El nombre es obligatorio.', 'error');
      return;
    }

    setMessage(mensajeForm, 'Guardando cliente...', 'info');
    const esEdicion = Boolean(clienteActual?.id);
    const url = esEdicion ? `/api/clientes/${clienteActual.id}` : '/api/clientes';
    const method = esEdicion ? 'PUT' : 'POST';

    try {
      const resp = await fetchJsonAutorizado(url, { method, body: JSON.stringify(payload) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo guardar el cliente');
      }
      const clienteGuardado = data.cliente || { ...payload, id: clienteActual?.id };
      setMessage(mensajeForm, 'Cliente guardado correctamente.', 'info');
      clienteActual = clienteGuardado;
      await cargarClientes();
      if (clienteGuardado.id) {
        const encontrado = clientes.find((c) => c.id === clienteGuardado.id);
        cargarEnFormulario(encontrado || clienteGuardado);
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error);
      setMessage(mensajeForm, error.message || 'No se pudo guardar el cliente.', 'error');
    }
  };

  const cargarDeudaEnFormulario = (deuda, mantenerFecha = false) => {
    if (!deuda) return;
    if (inputDeudaId) inputDeudaId.value = deuda.id || '';
    if (inputDeudaDescripcion) inputDeudaDescripcion.value = deuda.descripcion || deuda.concepto || '';
    if (inputDeudaNotas) inputDeudaNotas.value = deuda.notas || '';
    if (inputDeudaFecha && !mantenerFecha) {
      inputDeudaFecha.value = deuda.fecha || getLocalDateISO();
    }
    if (inputDeudaMonto) {
      setMoneyInputValue(inputDeudaMonto, deuda.monto_total ?? deuda.monto ?? 0);
      inputDeudaMonto.dataset.auto = '';
    }
    if (selectDeudaTipoComprobante) {
      selectDeudaTipoComprobante.value = normalizarTipoComprobante(
        deuda.tipo_comprobante || deuda.ncf?.slice?.(0, 3),
        deuda.ncf ? 'B02' : 'Sin comprobante'
      );
    }
    if (inputDeudaNcf) inputDeudaNcf.value = deuda.ncf || '';
    actualizarEstadoComprobanteDeuda(Boolean(deuda.ncf));
    cargarDetalleDeuda(deuda.id);
    setMessage(mensajeDeuda, '');
  };

  const guardarDeuda = async () => {
    if (!clienteActual?.id) {
      setMessage(mensajeDeuda, 'Selecciona un cliente primero.', 'error');
      return;
    }

    const tieneItems = deudaItems.length > 0;
    if (tieneItems) {
      const invalido = deudaItems.find(
        (item) => !Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0
      );
      if (invalido) {
        setMessage(mensajeDeuda, 'Todas las cantidades deben ser mayores a cero.', 'error');
        return;
      }
    }

    const monto = tieneItems
      ? Number(calcularTotalDeudaItems().toFixed(2))
      : parseMoneyValue(inputDeudaMonto, { allowEmpty: false });
    if (!Number.isFinite(monto) || monto <= 0) {
      setMessage(mensajeDeuda, 'Ingresa un monto válido.', 'error');
      return;
    }

    const descripcionManual = inputDeudaDescripcion?.value?.trim() || null;
    const descripcionFinal = descripcionManual || (tieneItems ? obtenerResumenDeudaItems() : null);
    const tipoComprobante = normalizarTipoComprobante(selectDeudaTipoComprobante?.value, 'Sin comprobante');
    const ncf = inputDeudaNcf?.value?.trim() || null;
    const payload = {
      descripcion: descripcionFinal,
      fecha: inputDeudaFecha?.value || null,
      monto,
      tipo_comprobante: tipoComprobante,
      generar_ncf: !esSinComprobante(tipoComprobante),
      ncf,
      notas: inputDeudaNotas?.value?.trim() || null,
      items: tieneItems
        ? deudaItems.map((item) => ({
            producto_id: item.producto_id,
            cantidad: Number(item.cantidad),
            precio_unitario: Number(item.precio_unitario),
          }))
        : undefined,
    };

    const deudaId = inputDeudaId?.value ? Number(inputDeudaId.value) : null;
    const esEdicion = Boolean(deudaId);
    const url = esEdicion
      ? `/api/clientes/${clienteActual.id}/deudas/${deudaId}`
      : `/api/clientes/${clienteActual.id}/deudas`;
    const method = esEdicion ? 'PUT' : 'POST';

    setMessage(mensajeDeuda, 'Guardando factura...', 'info');

    try {
      const resp = await fetchJsonAutorizado(url, { method, body: JSON.stringify(payload) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo guardar la factura');
      }

      const nuevaId = data?.deuda?.id || deudaId;
      await cargarDeudas({
        mantenerSeleccion: true,
        seleccionarId: nuevaId || null,
        mantenerEdicionId: esEdicion ? nuevaId : null,
      });
      await cargarClientes();

      if (!esEdicion) {
        limpiarDeudaForm();
      }

      setMessage(mensajeDeuda, 'Factura guardada correctamente.', 'info');
    } catch (error) {
      console.error('Error al guardar factura:', error);
      setMessage(mensajeDeuda, error.message || 'No se pudo guardar la factura.', 'error');
    }
  };

  const guardarAbono = async () => {
    if (!clienteActual?.id || !deudaActual?.id) {
      setMessage(mensajeAbono, 'Selecciona una factura primero.', 'error');
      return;
    }

    const monto = parseMoneyValue(inputAbonoMonto, { allowEmpty: false });
    if (!Number.isFinite(monto) || monto <= 0) {
      setMessage(mensajeAbono, 'Ingresa un monto válido.', 'error');
      return;
    }

    const payload = {
      fecha: inputAbonoFecha?.value || null,
      monto,
      metodo_pago: selectAbonoMetodo?.value || null,
      notas: inputAbonoNotas?.value?.trim() || null,
    };

    setMessage(mensajeAbono, 'Registrando abono...', 'info');

    try {
      const resp = await fetchJsonAutorizado(
        `/api/clientes/${clienteActual.id}/deudas/${deudaActual.id}/abonos`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo registrar el abono');
      }

      const deudaId = deudaActual.id;
      await cargarDeudas({ mantenerSeleccion: true, seleccionarId: deudaId });
      await cargarClientes();
      limpiarAbonoForm();
      setMessage(mensajeAbono, 'Abono registrado correctamente.', 'info');
    } catch (error) {
      console.error('Error al registrar abono:', error);
      setMessage(mensajeAbono, error.message || 'No se pudo registrar el abono.', 'error');
    }
  };

  const limpiarFormulario = () => {
    clienteActual = null;
    inputId.value = '';
    inputNombre.value = '';
    inputDocumento.value = '';
    selectTipoDocumento.value = '';
    inputTelefono.value = '';
    inputEmail.value = '';
    inputDireccion.value = '';
    inputNotas.value = '';
    inputActivo.checked = true;
    if (selectRuta) selectRuta.value = '';
    if (inputWhatsapp) inputWhatsapp.value = '';
    if (chkCreditoActivo) chkCreditoActivo.checked = false;
    if (inputCreditoLimite) inputCreditoLimite.value = '';
    if (inputCreditoDias) inputCreditoDias.value = '';
    if (chkCreditoBloqueo) chkCreditoBloqueo.checked = false;
    actualizarVisibilidadCredito();
    if (historialTabla) historialTabla.innerHTML = '';
    if (historialTotal) historialTotal.textContent = 'Selecciona un cliente para ver qué ha comprado.';
    setMessage(mensajeForm, '');
    actualizarResumenCliente(null);
    resetDeudasUI();
    renderClientes();
  };

  // =========================================================================
  // Fase 2: rutas, historial de compras y exportación
  // =========================================================================
  const cargarRutas = async () => {
    try {
      const resp = await fetchAutorizado('/api/rutas');
      const data = await resp.json().catch(() => ({}));
      rutas = Array.isArray(data?.rutas) ? data.rutas : [];
    } catch (error) {
      console.warn('No se pudieron cargar las rutas:', error);
      rutas = [];
    }
    poblarSelectsRutas();
    renderRutasModal();
  };

  const poblarSelectsRutas = () => {
    const opciones = rutas
      .map((r) => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`)
      .join('');
    if (selectRuta) {
      const actual = selectRuta.value;
      selectRuta.innerHTML = `<option value="">Sin ruta</option>${opciones}`;
      selectRuta.value = actual;
    }
    if (selectRutaFiltro) {
      const actual = selectRutaFiltro.value;
      selectRutaFiltro.innerHTML = `<option value="">Todas</option><option value="sin">Sin ruta</option>${opciones}`;
      selectRutaFiltro.value = actual;
    }
  };

  const renderRutasModal = () => {
    if (!rutasModalTabla) return;
    if (!rutas.length) {
      rutasModalTabla.innerHTML = '<tr><td colspan="3" class="tabla-vacia">Aún no hay rutas. Crea la primera arriba.</td></tr>';
      return;
    }
    rutasModalTabla.innerHTML = rutas
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.nombre)}</td>
          <td class="text-right">${Number(r.clientes_count) || 0}</td>
          <td class="text-right">
            <button type="button" class="kanm-button ghost sm danger" data-ruta-eliminar="${r.id}" data-nombre="${escapeHtml(r.nombre)}">Eliminar</button>
          </td>
        </tr>`
      )
      .join('');
  };

  const agregarRuta = async () => {
    const nombre = (inputRutaNueva?.value || '').trim();
    if (!nombre) {
      setMessage(rutasModalMensaje, 'Escribe un nombre para la ruta.', 'error');
      return;
    }
    try {
      const resp = await fetchJsonAutorizado('/api/rutas', {
        method: 'POST',
        body: JSON.stringify({ nombre }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data.error || 'No se pudo crear la ruta');
      if (inputRutaNueva) inputRutaNueva.value = '';
      setMessage(rutasModalMensaje, 'Ruta creada.', 'success');
      await cargarRutas();
    } catch (error) {
      setMessage(rutasModalMensaje, error.message || 'No se pudo crear la ruta.', 'error');
    }
  };

  const eliminarRuta = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar la ruta "${nombre}"? Los clientes de esa ruta quedarán sin ruta (no se borran).`)) return;
    try {
      const resp = await fetchAutorizado(`/api/rutas/${id}`, { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data.error || 'No se pudo eliminar la ruta');
      setMessage(rutasModalMensaje, 'Ruta eliminada.', 'success');
      await cargarRutas();
      await cargarClientes();
    } catch (error) {
      setMessage(rutasModalMensaje, error.message || 'No se pudo eliminar la ruta.', 'error');
    }
  };

  const cargarHistorialCompras = async (clienteId) => {
    if (!historialTabla) return;
    historialTabla.innerHTML = '<tr><td colspan="3" class="kanm-subtitle">Cargando…</td></tr>';
    try {
      const resp = await fetchAutorizado(`/api/clientes/${clienteId}/historial-compras`);
      const data = await resp.json().catch(() => ({}));
      const productos = Array.isArray(data?.productos) ? data.productos : [];
      if (historialTotal) {
        historialTotal.textContent = productos.length
          ? `Total comprado: ${formatCurrency(data.total_comprado || 0)} · ${productos.length} producto(s)`
          : 'Este cliente aún no tiene compras registradas.';
      }
      historialTabla.innerHTML = productos.length
        ? productos
            .map(
              (p) => `
            <tr>
              <td>${escapeHtml(p.producto)}</td>
              <td class="text-right">${Number(p.cantidad) || 0}</td>
              <td class="text-right">${formatCurrency(p.total)}</td>
            </tr>`
            )
            .join('')
        : '<tr><td colspan="3" class="tabla-vacia">Sin compras.</td></tr>';
    } catch (error) {
      console.warn('Error al cargar historial de compras:', error);
      historialTabla.innerHTML = '<tr><td colspan="3" class="tabla-vacia">No se pudo cargar el historial.</td></tr>';
    }
  };

  const exportarClientes = () => {
    const lista = aplicarFiltrosClientes(clientes);
    if (!lista.length) {
      setMessage(mensajeLista, 'No hay clientes para exportar con los filtros actuales.', 'warning');
      return;
    }
    const encabezados = ['Nombre', 'Documento', 'Teléfono', 'Email', 'Ruta', 'Crédito', 'Límite crédito', 'Saldo pendiente', 'Estado'];
    const escaparCsv = (v) => {
      const s = String(v == null ? '' : v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const filas = lista.map((c) =>
      [
        c.nombre || '',
        c.documento || '',
        c.telefono || '',
        c.email || '',
        c.ruta_nombre || '',
        Number(c.credito_activo) ? 'Sí' : 'No',
        Number(c.credito_limite) || 0,
        Number(c.saldo_pendiente) || 0,
        c.activo ? 'Activo' : 'Inactivo',
      ]
        .map(escaparCsv)
        .join(',')
    );
    const csv = '﻿' + [encabezados.join(','), ...filas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage(mensajeLista, `Exportados ${lista.length} cliente(s).`, 'success');
  };

  // Eventos Fase 2
  chkCreditoActivo?.addEventListener('change', actualizarVisibilidadCredito);
  selectRutaFiltro?.addEventListener('change', renderClientes);
  btnExportar?.addEventListener('click', (e) => {
    e.preventDefault();
    exportarClientes();
  });
  btnGestionarRutas?.addEventListener('click', (e) => {
    e.preventDefault();
    if (rutasModal) rutasModal.hidden = false;
    setMessage(rutasModalMensaje, '');
    renderRutasModal();
  });
  rutasModalCerrar?.addEventListener('click', () => {
    if (rutasModal) rutasModal.hidden = true;
  });
  rutasModal?.addEventListener('click', (e) => {
    if (e.target === rutasModal) rutasModal.hidden = true;
  });
  btnRutaAgregar?.addEventListener('click', (e) => {
    e.preventDefault();
    agregarRuta();
  });
  inputRutaNueva?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarRuta();
    }
  });
  rutasModalTabla?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ruta-eliminar]');
    if (btn) eliminarRuta(Number(btn.dataset.rutaEliminar), btn.dataset.nombre || 'esta ruta');
  });

  tablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-editar-cliente]');
    if (!btn) return;
    const id = Number(btn.dataset.editarCliente);
    const cli = clientes.find((c) => c.id === id);
    if (cli) {
      cargarEnFormulario(cli);
    }
  });

  tablaDeudas?.addEventListener('click', (event) => {
    const btnVer = event.target.closest('[data-deuda-ver]');
    const btnAbonos = event.target.closest('[data-deuda-abonos]');
    const btnEditar = event.target.closest('[data-deuda-editar]');

    if (!btnVer && !btnAbonos && !btnEditar) return;

    if (btnVer) {
      const id = Number(btnVer.dataset.deudaVer);
      if (Number.isFinite(id)) {
        window.open(`/cliente-factura.html?deudaId=${id}&scope=admin`, '_blank');
      }
      return;
    }

    if (btnEditar) {
      const id = Number(btnEditar.dataset.deudaEditar);
      const deuda = deudas.find((d) => d.id === id);
      if (deuda) {
        cargarDeudaEnFormulario(deuda);
        deudaActual = deuda;
        renderDeudas();
        actualizarPanelAbonos();
        cargarAbonos();
      }
      return;
    }

    if (btnAbonos) {
      const id = Number(btnAbonos.dataset.deudaAbonos);
      const deuda = deudas.find((d) => d.id === id);
      if (deuda) {
        deudaActual = deuda;
        renderDeudas();
        actualizarPanelAbonos();
        cargarAbonos();
      }
    }
  });

  btnDeudaProductoAgregar?.addEventListener('click', (e) => {
    e.preventDefault();
    agregarProductoDeuda();
  });

  inputDeudaCantidad?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarProductoDeuda();
    }
  });

  tablaDeudaProductos?.addEventListener('click', (event) => {
    const btnRemove = event.target.closest('[data-deuda-item-remove]');
    if (!btnRemove) return;
    const productoId = Number(btnRemove.dataset.deudaItemRemove);
    deudaItems = deudaItems.filter((item) => item.producto_id !== productoId);
    renderDeudaItems();
  });

  tablaDeudaProductos?.addEventListener('change', (event) => {
    const inputCantidad = event.target.closest('[data-deuda-item]');
    if (inputCantidad) {
      const productoId = Number(inputCantidad.dataset.deudaItem);
      const cantidad = Number(inputCantidad.value);
      const item = deudaItems.find((dato) => dato.producto_id === productoId);
      if (!item) return;
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        deudaItems = deudaItems.filter((dato) => dato.producto_id !== productoId);
      } else {
        item.cantidad = cantidad;
      }
      renderDeudaItems();
      return;
    }

    const inputPrecio = event.target.closest('[data-deuda-item-precio]');
    if (!inputPrecio) return;
    const productoId = Number(inputPrecio.dataset.deudaItemPrecio);
    const precio = Number(inputPrecio.value);
    const item = deudaItems.find((dato) => dato.producto_id === productoId);
    if (!item) return;
    if (!Number.isFinite(precio) || precio < 0) {
      inputPrecio.value = Number(item.precio_unitario || 0).toFixed(2);
      setMessage(mensajeDeuda, 'Ingresa un precio valido.', 'warning');
      return;
    }
    item.precio_unitario = Number(precio.toFixed(2));
    setMessage(mensajeDeuda, '');
    renderDeudaItems();
  });

  btnBuscar?.addEventListener('click', (e) => {
    e.preventDefault();
    cargarClientes();
  });

  btnLimpiar?.addEventListener('click', (e) => {
    e.preventDefault();
    if (inputBuscar) inputBuscar.value = '';
    if (selectEstado) selectEstado.value = '';
    if (selectSaldo) selectSaldo.value = '';
    cargarClientes();
  });

  selectEstado?.addEventListener('change', () => {
    renderClientes();
  });

  selectSaldo?.addEventListener('change', () => {
    renderClientes();
  });

  inputBuscar?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cargarClientes();
    }
  });

  btnNuevo?.addEventListener('click', (e) => {
    e.preventDefault();
    limpiarFormulario();
  });

  btnDeudaNueva?.addEventListener('click', (e) => {
    e.preventDefault();
    limpiarDeudaForm();
    if (inputDeudaId) inputDeudaId.value = '';
  });

  btnFacturaNueva?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!clienteActual?.id) {
      setMessage(mensajeDeuda, 'Selecciona un cliente primero.', 'warning');
      return;
    }
    limpiarDeudaForm();
    if (inputDeudaId) inputDeudaId.value = '';
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarCliente();
  });

  deudaForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarDeuda();
  });

  selectDeudaTipoComprobante?.addEventListener('change', () => {
    actualizarEstadoComprobanteDeuda(Boolean((inputDeudaNcf?.value || '').trim()));
  });

  abonoForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarAbono();
  });

  // ===========================================================================
  // HISTORIAL DE FACTURAS POS + ESTADO DE CUENTA del cliente
  // ===========================================================================
  const posCard = document.getElementById('cliente-historial-pos-card');
  const posTotalFacturado = document.getElementById('cliente-pos-total-facturado');
  const posTotalPagado = document.getElementById('cliente-pos-total-pagado');
  const posSaldoPendiente = document.getElementById('cliente-pos-saldo-pendiente');
  const posNumFacturas = document.getElementById('cliente-pos-num-facturas');
  const posUltimaCompra = document.getElementById('cliente-pos-ultima-compra');
  const posMensaje = document.getElementById('cliente-pos-mensaje');
  const posTabla = document.getElementById('cliente-pos-facturas-tabla');
  const posBtnMas = document.getElementById('cliente-pos-mas');
  const posPaginacionInfo = document.getElementById('cliente-pos-paginacion-info');

  let posClienteIdActual = null;
  let posOffset = 0;
  let posTotal = 0;
  const POS_PAGE_SIZE = 25;

  const fmtFechaCorta = (valor) => {
    if (!valor) return '—';
    try {
      const d = new Date(valor);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('es-DO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'America/Santo_Domingo',
      });
    } catch (_) {
      return '—';
    }
  };

  const obtenerMetodoPagoTexto = (factura) => {
    const efectivo = Number(factura.pago_efectivo) || 0;
    const tarjeta = Number(factura.pago_tarjeta) || 0;
    const transferencia = Number(factura.pago_transferencia) || 0;
    const metodos = [];
    if (efectivo > 0) metodos.push('Efectivo');
    if (tarjeta > 0) metodos.push('Tarjeta');
    if (transferencia > 0) metodos.push('Transf.');
    return metodos.join(' + ') || '—';
  };

  async function cargarEstadoCuentaPosCliente(clienteId) {
    if (!clienteId) return;
    try {
      const resp = await fetchAutorizado(`/api/clientes/${clienteId}/estado-cuenta`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el estado de cuenta');
      }
      const r = data?.resumen || {};
      if (posTotalFacturado) posTotalFacturado.textContent = formatCurrency(r.total_facturado || 0);
      if (posTotalPagado) posTotalPagado.textContent = formatCurrency(r.total_pagado || 0);
      if (posSaldoPendiente) posSaldoPendiente.textContent = formatCurrency(r.saldo_pendiente || 0);
      if (posNumFacturas) posNumFacturas.textContent = String(r.total_facturas || 0);
      if (posUltimaCompra) posUltimaCompra.textContent = fmtFechaCorta(r.ultima_compra);
    } catch (error) {
      console.warn('Error cargando estado de cuenta POS:', error);
    }
  }

  async function cargarHistorialPosCliente(clienteId, reset = false) {
    if (!posCard || !posTabla) return;
    if (!clienteId) {
      posCard.hidden = true;
      return;
    }
    posCard.hidden = false;
    if (reset) {
      posClienteIdActual = clienteId;
      posOffset = 0;
      posTotal = 0;
      posTabla.innerHTML = '<tr><td colspan="7" class="kanm-subtitle">Cargando...</td></tr>';
      if (posMensaje) posMensaje.textContent = '';
      cargarEstadoCuentaPosCliente(clienteId);
    }
    try {
      const url = `/api/clientes/${clienteId}/facturas?limit=${POS_PAGE_SIZE}&offset=${posOffset}`;
      const resp = await fetchAutorizado(url);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el historial');
      }
      const facturas = data?.facturas || [];
      posTotal = data?.total || 0;
      if (reset) posTabla.innerHTML = '';
      if (!facturas.length && posOffset === 0) {
        posTabla.innerHTML =
          '<tr><td colspan="7" class="kanm-subtitle">Este cliente no tiene facturas POSIUM aún.</td></tr>';
        if (posPaginacionInfo) posPaginacionInfo.textContent = '';
        if (posBtnMas) posBtnMas.hidden = true;
        return;
      }
      const html = facturas.map((f) => {
        const ncf = f.ecf_encf || f.ncf || '—';
        const tipo = f.ecf_tipo || f.tipo_comprobante || '—';
        const total = formatCurrency(f.total || 0);
        const fecha = fmtFechaCorta(f.fecha_cierre || f.fecha_factura);
        const metodo = obtenerMetodoPagoTexto(f);
        const ecfEstado = f.ecf_estado || (f.ecf_encf ? 'PENDIENTE' : '—');
        const ecfClass = ecfEstado === 'ACEPTADO'
          ? 'estado-pagado'
          : ecfEstado === 'RECHAZADO'
          ? 'estado-pendiente'
          : ecfEstado === '—'
          ? ''
          : 'estado-parcial';
        return `
          <tr>
            <td>${fecha}</td>
            <td><code>${ncf}</code></td>
            <td>${tipo}</td>
            <td><strong>${total}</strong></td>
            <td>${metodo}</td>
            <td>${ecfEstado !== '—' ? `<span class="kanm-badge ${ecfClass}">${ecfEstado}</span>` : '—'}</td>
            <td>
              <a class="kanm-button ghost kanm-button--sm" href="/factura.html?id=${f.id}" target="_blank">Ver factura</a>
            </td>
          </tr>
        `;
      }).join('');
      posTabla.insertAdjacentHTML('beforeend', html);
      posOffset += facturas.length;
      if (posPaginacionInfo) {
        posPaginacionInfo.textContent = `Mostrando ${posOffset} de ${posTotal} facturas`;
      }
      if (posBtnMas) {
        posBtnMas.hidden = posOffset >= posTotal;
      }
    } catch (error) {
      console.error('Error cargando historial POS:', error);
      if (posMensaje) {
        posMensaje.textContent = error.message || 'No se pudo cargar el historial.';
        posMensaje.className = 'kanm-message error';
      }
    }
  }

  posBtnMas?.addEventListener('click', () => {
    if (posClienteIdActual) cargarHistorialPosCliente(posClienteIdActual, false);
  });

  // ===========================================================================
  // BÚSQUEDA RÁPIDA DE FACTURA POR NCF / e-NCF
  // ===========================================================================
  const buscarFacturaInput = document.getElementById('buscar-factura-ncf');
  const buscarFacturaBtn = document.getElementById('buscar-factura-btn');
  const buscarFacturaResultados = document.getElementById('buscar-factura-resultados');

  async function buscarFacturaPorNcf() {
    if (!buscarFacturaInput || !buscarFacturaResultados) return;
    const q = (buscarFacturaInput.value || '').trim();
    if (q.length < 3) {
      buscarFacturaResultados.textContent = 'Ingresa al menos 3 caracteres del NCF / e-NCF.';
      buscarFacturaResultados.className = 'kanm-message error';
      return;
    }
    buscarFacturaResultados.textContent = 'Buscando...';
    buscarFacturaResultados.className = 'kanm-message';
    try {
      const resp = await fetchAutorizado(`/api/admin/facturas/buscar?q=${encodeURIComponent(q)}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'Error al buscar');
      }
      const filas = data?.resultados || [];
      if (!filas.length) {
        buscarFacturaResultados.innerHTML = '<em>No se encontraron facturas con ese NCF.</em>';
        return;
      }
      const html = filas
        .map((f) => {
          const ncf = f.ecf_encf || f.ncf || '—';
          const fecha = fmtFechaCorta(f.fecha_cierre || f.fecha_factura);
          const total = formatCurrency(f.total || 0);
          const cliente = f.cliente || '—';
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed rgba(0,0,0,0.1);">
              <div>
                <strong>${ncf}</strong> · ${fecha} · ${cliente} · ${total}
              </div>
              <a class="kanm-button ghost kanm-button--sm" href="/factura.html?id=${f.id}" target="_blank">Ver</a>
            </div>
          `;
        })
        .join('');
      buscarFacturaResultados.innerHTML = `<div><strong>${filas.length} resultado(s):</strong></div>${html}`;
    } catch (error) {
      buscarFacturaResultados.textContent = error.message || 'No se pudo buscar.';
      buscarFacturaResultados.className = 'kanm-message error';
    }
  }
  buscarFacturaBtn?.addEventListener('click', buscarFacturaPorNcf);
  buscarFacturaInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarFacturaPorNcf();
    }
  });

  // ===========================================================================
  // TOP CLIENTES
  // ===========================================================================
  const topClientesSelect = document.getElementById('top-clientes-periodo');
  const topClientesBtn = document.getElementById('top-clientes-refrescar');
  const topClientesTabla = document.getElementById('top-clientes-tabla');

  async function cargarTopClientes() {
    if (!topClientesTabla) return;
    const periodo = topClientesSelect?.value || 'mes';
    topClientesTabla.innerHTML =
      '<tr><td colspan="6" class="kanm-subtitle">Calculando...</td></tr>';
    try {
      const resp = await fetchAutorizado(
        `/api/admin/clientes/top?periodo=${encodeURIComponent(periodo)}&limit=10`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo obtener el top');
      }
      const lista = data?.clientes || [];
      if (!lista.length) {
        topClientesTabla.innerHTML =
          '<tr><td colspan="6" class="kanm-subtitle">No hay datos para el período seleccionado.</td></tr>';
        return;
      }
      topClientesTabla.innerHTML = lista
        .map((c, i) => {
          const linkCliente = c.cliente_id
            ? `<a href="#" data-editar-cliente="${c.cliente_id}">${c.nombre}</a>`
            : (c.nombre || '—');
          return `
            <tr>
              <td><strong>#${i + 1}</strong></td>
              <td>${linkCliente}</td>
              <td><code>${c.documento || '—'}</code></td>
              <td>${c.num_facturas}</td>
              <td><strong>${formatCurrency(c.total_facturado || 0)}</strong></td>
              <td>${fmtFechaCorta(c.ultima_compra)}</td>
            </tr>
          `;
        })
        .join('');
    } catch (error) {
      topClientesTabla.innerHTML = `<tr><td colspan="6" class="kanm-message error">${error.message || 'Error al cargar.'}</td></tr>`;
    }
  }
  topClientesBtn?.addEventListener('click', cargarTopClientes);

  resetDeudasUI();
  actualizarResumenCliente(null);
  actualizarVisibilidadCredito();
  cargarRutas();
  cargarClientes();
  cargarProductos();
})();
