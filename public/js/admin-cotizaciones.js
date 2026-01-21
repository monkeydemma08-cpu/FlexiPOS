(() => {
  const seccionCotizaciones = document.getElementById('admin-section-cotizaciones');
  if (!seccionCotizaciones) return;

  const filtroDesde = document.getElementById('cotizaciones-desde');
  const filtroHasta = document.getElementById('cotizaciones-hasta');
  const filtroEstado = document.getElementById('cotizaciones-estado');
  const filtroBuscar = document.getElementById('cotizaciones-buscar');
  const botonFiltrar = document.getElementById('cotizaciones-filtrar');
  const botonNueva = document.getElementById('cotizaciones-nueva');
  const listaCotizaciones = document.getElementById('cotizaciones-lista');
  const mensajeListado = document.getElementById('cotizaciones-lista-mensaje');

  const formulario = document.getElementById('cotizacion-form');
  const inputId = document.getElementById('cotizacion-id');
  const codigoDisplay = document.getElementById('cotizacion-codigo');
  const estadoDisplay = document.getElementById('cotizacion-estado');
  const fechaDisplay = document.getElementById('cotizacion-fecha');
  const inputValidez = document.getElementById('cotizacion-validez');
  const inputCliente = document.getElementById('cotizacion-cliente-nombre');
  const inputDocumento = document.getElementById('cotizacion-cliente-documento');
  const inputContacto = document.getElementById('cotizacion-cliente-contacto');
  const inputClienteBuscar = document.getElementById('cotizacion-cliente-buscar');
  const datalistClientes = document.getElementById('cotizacion-clientes');
  const inputNotasCliente = document.getElementById('cotizacion-notas-cliente');
  const inputNotasInternas = document.getElementById('cotizacion-notas-internas');
  const itemsBody = document.getElementById('cotizacion-items-body');
  const botonAgregarItem = document.getElementById('cotizacion-item-agregar');
  const inputDescGlobalPct = document.getElementById('cotizacion-descuento-porcentaje');
  const inputDescGlobalMonto = document.getElementById('cotizacion-descuento-monto');
  const subtotalSpan = document.getElementById('cotizacion-subtotal');
  const descuentoSpan = document.getElementById('cotizacion-descuento-total');
  const impuestoSpan = document.getElementById('cotizacion-impuesto');
  const totalSpan = document.getElementById('cotizacion-total');
  const mensajeDetalle = document.getElementById('cotizacion-mensaje');
  const botonGuardar = document.getElementById('cotizacion-guardar');
  const botonEnviar = document.getElementById('cotizacion-enviar');
  const botonAceptar = document.getElementById('cotizacion-aceptar');
  const botonImprimir = document.getElementById('cotizacion-imprimir');
  const botonFacturar = document.getElementById('cotizacion-facturar');

  let cotizacionActual = null;
let cotizaciones = [];
  let productos = [];
  let clientesSugeridos = [];
  let impuestoPorcentaje = 0;
  const estadosTexto = {
    borrador: 'Borrador',
    enviada: 'Enviada',
    aceptada: 'Aceptada',
    rechazada: 'Rechazada',
    vencida: 'Vencida',
    facturada: 'Facturada',
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

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(numero);
  };

  const parseMoneyValue = (input, { fallback = 0, allowEmpty = true } = {}) => {
    const raw =
      input && typeof input === 'object' && 'value' in input ? input.value : input ?? '';
    const texto = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!texto) return allowEmpty ? fallback : NaN;
    const parsed = window.KANMMoney?.parse
      ? window.KANMMoney.parse(input)
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

  const refrescarSelectsProductos = () => {
    const opciones = construirOpcionesProducto();
    document.querySelectorAll('.cot-item-producto').forEach((select) => {
      const previo = select.value;
      select.innerHTML = opciones;
      if (previo) {
        select.value = previo;
      }
    });
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return '--';
    return new Intl.DateTimeFormat('es-DO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(fecha);
  };

  const setMessage = (element, text, type = 'info') => {
    if (!element) return;
    element.textContent = text || '';
    element.dataset.type = text ? type : '';
  };

  const obtenerEstadoTexto = (estado) => estadosTexto[estado] || 'Borrador';

  const setEstadoEtiqueta = (estado) => {
    if (!estadoDisplay) return;
    const estadoSeguro = estado || 'borrador';
    estadoDisplay.textContent = obtenerEstadoTexto(estadoSeguro);
    estadoDisplay.dataset.estado = estadoSeguro;
  };

  const obtenerFechaLocalISO = (dias = 0) => {
    const ahora = new Date();
    const fecha = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);
    const offset = fecha.getTimezoneOffset();
    const local = new Date(fecha.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  };

const cargarImpuesto = async () => {
    try {
      const resp = await fetchAutorizado('/api/configuracion/impuesto');
      if (!resp.ok) return;
      const data = await resp.json().catch(() => null);
      if (data?.ok) {
        impuestoPorcentaje = Number(data.valor) || 0;
      }
    } catch (error) {
      console.warn('No se pudo cargar el impuesto configurado', error);
    }
  };

const cargarProductos = async () => {
    try {
      const resp = await fetchAutorizado('/api/productos');
      if (!resp.ok) throw new Error('No se pudieron cargar los productos');
      productos = (await resp.json()) || [];
      refrescarSelectsProductos();
    } catch (error) {
      console.error('Error al cargar productos para cotización:', error);
      productos = [];
    }
  };

  const construirOpcionesProducto = () =>
    ['<option value="">Selecciona</option>']
      .concat(
        productos.map(
          (p) => `<option value="${p.id}">${p.nombre}</option>`
        )
      )
      .join('');

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

  const buscarClientes = async (termino = '') => {
    try {
      const resp = await fetchAutorizado(`/api/clientes?search=${encodeURIComponent(termino)}`);
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
    inputCliente.value = cliente.nombre || '';
    inputDocumento.value = cliente.documento || '';
    inputContacto.value = cliente.telefono || cliente.email || '';
  };

  const agregarItemFila = (item = {}) => {
    if (!itemsBody) return;
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td data-label="Producto">
        <select class="cot-item-producto">
          ${construirOpcionesProducto()}
        </select>
      </td>
      <td data-label="Descripción">
        <input type="text" class="cot-item-descripcion" placeholder="Descripción" />
      </td>
      <td data-label="Cantidad">
        <input type="number" class="cot-item-cantidad" min="0" step="0.01" value="${item.cantidad ?? 1}" />
      </td>
      <td data-label="Precio">
        <input
          type="text"
          class="cot-item-precio"
          inputmode="decimal"
          data-money
          value="${item.precio_unitario ?? ''}"
        />
      </td>
      <td data-label="Desc %">
        <input type="number" class="cot-item-desc-pct" min="0" step="0.01" value="${item.descuento_porcentaje ?? 0}" />
      </td>
      <td data-label="Desc $">
        <input
          type="text"
          class="cot-item-desc-monto"
          inputmode="decimal"
          data-money
          value="${item.descuento_monto ?? 0}"
        />
      </td>
      <td data-label="Total línea" class="cot-item-total">${formatCurrency(0)}</td>
      <td data-label="Acciones">
        <button type="button" class="kanm-button ghost cot-item-eliminar" title="Eliminar ítem">&times;</button>
      </td>
    `;

    const select = fila.querySelector('.cot-item-producto');
    const descInput = fila.querySelector('.cot-item-descripcion');
    const cantidadInput = fila.querySelector('.cot-item-cantidad');
    const precioInput = fila.querySelector('.cot-item-precio');
    const descPctInput = fila.querySelector('.cot-item-desc-pct');
    const descMontoInput = fila.querySelector('.cot-item-desc-monto');
    const totalCell = fila.querySelector('.cot-item-total');
    const eliminarBtn = fila.querySelector('.cot-item-eliminar');

    if (select && item.producto_id) {
      select.value = item.producto_id;
    }
    if (descInput) {
      descInput.value = item.descripcion || item.producto_nombre || '';
    }
    if (precioInput && item.precio_unitario !== undefined) {
      setMoneyInputValue(precioInput, item.precio_unitario ?? '');
    }
    if (descMontoInput && item.descuento_monto !== undefined) {
      setMoneyInputValue(descMontoInput, item.descuento_monto ?? 0);
    }

    const syncProducto = () => {
      const prodId = Number(select?.value) || null;
      const producto = productos.find((p) => p.id === prodId);
      if (producto) {
        if (!precioInput.value || parseMoneyValue(precioInput) === 0) {
          setMoneyInputValue(precioInput, producto.precio || 0);
        }
        if (!descInput.value) {
          descInput.value = producto.nombre || '';
        }
      }
      recalcularTotales();
    };

    [cantidadInput, precioInput, descPctInput, descMontoInput, descInput].forEach((input) => {
      input?.addEventListener('input', () => recalcularTotales());
    });
    select?.addEventListener('change', syncProducto);
    eliminarBtn?.addEventListener('click', () => {
      fila.remove();
      recalcularTotales();
    });

    itemsBody.appendChild(fila);
    recalcularTotales();
    if (!item.descripcion && item.producto_id) {
      syncProducto();
    }
    if (totalCell) totalCell.textContent = formatCurrency(item.total_linea || 0);
  };

  const leerItems = () => {
    const filas = Array.from(itemsBody?.querySelectorAll('tr') || []);
    return filas.map((fila) => {
      const prodSelect = fila.querySelector('.cot-item-producto');
      const descInput = fila.querySelector('.cot-item-descripcion');
      const cantidadInput = fila.querySelector('.cot-item-cantidad');
      const precioInput = fila.querySelector('.cot-item-precio');
      const descPctInput = fila.querySelector('.cot-item-desc-pct');
      const descMontoInput = fila.querySelector('.cot-item-desc-monto');

      return {
        producto_id: prodSelect?.value ? Number(prodSelect.value) : null,
        descripcion: descInput?.value?.trim() || '',
        cantidad: Number(cantidadInput?.value) || 0,
        precio_unitario: parseMoneyValue(precioInput),
        descuento_porcentaje: Number(descPctInput?.value) || 0,
        descuento_monto: parseMoneyValue(descMontoInput),
      };
    });
  };

  const calcularTotalesLocales = (items) => {
    let subtotalBase = 0;
    const itemsBase = [];

    items.forEach((item) => {
      if (!item || item.cantidad <= 0) return;
      const bruto = Math.max((Number(item.precio_unitario) || 0) * item.cantidad, 0);
      const descLinea = Math.min(
        bruto * ((Number(item.descuento_porcentaje) || 0) / 100) + (Number(item.descuento_monto) || 0),
        bruto
      );
      const base = Math.max(bruto - descLinea, 0);
      subtotalBase += base;
      itemsBase.push({ ...item, base_linea: base });
    });

    const descPct = Math.max(Number(inputDescGlobalPct?.value) || 0, 0);
    const descMonto = Math.max(parseMoneyValue(inputDescGlobalMonto), 0);
    const descuentoGlobal = Math.min(subtotalBase * (descPct / 100) + descMonto, subtotalBase);
    const subtotal = Math.max(subtotalBase - descuentoGlobal, 0);
    const impuesto = subtotal * Math.max(impuestoPorcentaje, 0) * 0.01;
    const total = subtotal + impuesto;

    const itemsCalculados = itemsBase.map((item) => {
      const propor = subtotalBase > 0 ? item.base_linea / subtotalBase : 0;
      const descAsignado = descuentoGlobal * propor;
      const subtotalLinea = Math.max(item.base_linea - descAsignado, 0);
      const impuestoLinea = subtotalLinea * Math.max(impuestoPorcentaje, 0) * 0.01;
      return {
        ...item,
        subtotal_linea: subtotalLinea,
        impuesto_linea: impuestoLinea,
        total_linea: subtotalLinea + impuestoLinea,
      };
    });

    return {
      subtotal_base: subtotalBase,
      subtotal,
      descuento_global: descuentoGlobal,
      descuento_porcentaje: descPct,
      impuesto,
      total,
      items: itemsCalculados,
    };
  };

  const actualizarTotalesUI = (totales) => {
    if (!totales) return;
    subtotalSpan.textContent = formatCurrency(totales.subtotal || 0);
    descuentoSpan.textContent = formatCurrency(totales.descuento_global || 0);
    impuestoSpan.textContent = formatCurrency(totales.impuesto || 0);
    totalSpan.textContent = formatCurrency(totales.total || 0);

    const filas = Array.from(itemsBody?.querySelectorAll('tr') || []);
    filas.forEach((fila, index) => {
      const totalCell = fila.querySelector('.cot-item-total');
      const itemCalc = totales.items?.[index];
      if (totalCell && itemCalc) {
        totalCell.textContent = formatCurrency(itemCalc.total_linea || 0);
      }
    });
  };

  const obtenerDatosCotizacion = (validar = true) => {
    const itemsLeidos = leerItems();
    const itemsValidos = itemsLeidos.filter((item) => item.cantidad > 0);
    if (validar && (!itemsValidos.length || itemsValidos.every((i) => i.cantidad <= 0))) {
      return { error: 'Agrega al menos un ítem con cantidad mayor a 0.' };
    }

    const items = validar ? itemsValidos : itemsLeidos;
    const totales = calcularTotalesLocales(items);
    if (totales.total < 0) {
      return { error: 'El total no puede ser negativo.' };
    }

    return {
      items,
      totales,
      datos: {
        cliente_nombre: inputCliente?.value?.trim() || '',
        cliente_documento: inputDocumento?.value?.trim() || '',
        cliente_contacto: inputContacto?.value?.trim() || '',
        fecha_validez: inputValidez?.value || null,
        notas_cliente: inputNotasCliente?.value || '',
        notas_internas: inputNotasInternas?.value || '',
      },
    };
  };

  const recalcularTotales = () => {
    const calculo = obtenerDatosCotizacion(false);
    if (calculo?.totales) {
      actualizarTotalesUI(calculo.totales);
    }
  };

  const limpiarFormulario = () => {
    cotizacionActual = null;
    inputId.value = '';
    codigoDisplay.textContent = 'Nueva';
    fechaDisplay.textContent = '--';
    inputValidez.value = obtenerFechaLocalISO(7);
    inputCliente.value = '';
    inputDocumento.value = '';
    inputContacto.value = '';
    inputClienteBuscar.value = '';
    clientesSugeridos = [];
    if (datalistClientes) datalistClientes.innerHTML = '';
    inputNotasCliente.value = '';
    inputNotasInternas.value = '';
    inputDescGlobalPct.value = '';
    setMoneyInputValue(inputDescGlobalMonto, '');
    setEstadoEtiqueta('borrador');
    itemsBody.innerHTML = '';
    agregarItemFila();
    setMessage(mensajeDetalle, '', 'info');
    recalcularTotales();
    actualizarBotonesEstado();
  };

  const renderListaCotizaciones = () => {
    if (!listaCotizaciones) return;
    listaCotizaciones.innerHTML = '';

    if (!cotizaciones.length) {
      const vacio = document.createElement('div');
      vacio.className = 'tabla-vacia';
      vacio.textContent = 'No hay cotizaciones registradas.';
      listaCotizaciones.appendChild(vacio);
      return;
    }

    cotizaciones.forEach((cot) => {
      const card = document.createElement('article');
      card.className = 'cotizacion-card';
      card.dataset.abrirCotizacion = cot.id;
      card.tabIndex = 0;
      const estadoTexto = obtenerEstadoTexto(cot.estado);
      card.innerHTML = `
        <div class="cotizacion-card-head">
          <div class="cotizacion-card-code">${cot.codigo || `#${cot.id}`}</div>
          <span class="cotizacion-estado-badge" data-estado="${cot.estado || 'borrador'}">${estadoTexto}</span>
        </div>
        <div class="cotizacion-card-info">
          <div>
            <span class="cotizacion-card-label">Cliente</span>
            <span class="cotizacion-card-value">${cot.cliente_nombre || 'Sin cliente'}</span>
          </div>
          <div>
            <span class="cotizacion-card-label">Fecha</span>
            <span class="cotizacion-card-value">${formatDate(cot.fecha_creacion)}</span>
          </div>
          <div>
            <span class="cotizacion-card-label">Total</span>
            <span class="cotizacion-card-value">${formatCurrency(cot.total)}</span>
          </div>
          <div>
            <span class="cotizacion-card-label">Estado</span>
            <span class="cotizacion-card-value">${estadoTexto}</span>
          </div>
        </div>
      `;
      listaCotizaciones.appendChild(card);
    });
  };

  const cargarCotizaciones = async () => {
    setMessage(mensajeListado, 'Cargando cotizaciones...', 'info');
    try {
      const params = new URLSearchParams();
      if (filtroDesde?.value) params.set('fecha_desde', filtroDesde.value);
      if (filtroHasta?.value) params.set('fecha_hasta', filtroHasta.value);
      if (filtroEstado?.value) params.set('estado', filtroEstado.value);
      if (filtroBuscar?.value) params.set('q', filtroBuscar.value.trim());

      const resp = await fetchAutorizado(`/api/cotizaciones?${params.toString()}`);
      if (!resp.ok) throw new Error('No se pudo obtener las cotizaciones');
      const data = await resp.json();
      cotizaciones = data?.cotizaciones || [];
      renderListaCotizaciones();
      setMessage(mensajeListado, '', 'info');
    } catch (error) {
      console.error('Error al cargar cotizaciones:', error);
      setMessage(mensajeListado, 'No fue posible cargar las cotizaciones.', 'error');
    }
  };

  const actualizarBotonesEstado = () => {
    const estado = cotizacionActual?.estado || 'borrador';
    const facturada = estado === 'facturada' || cotizacionActual?.pedido_id;
    botonGuardar.disabled = facturada;
    botonEnviar.disabled = facturada;
    botonAceptar.disabled = facturada;
    botonFacturar.disabled = estado !== 'aceptada' || facturada || !cotizacionActual?.id;
    botonImprimir.disabled = !cotizacionActual?.id;
  };

const cargarCotizacionDetalle = async (id) => {
  if (!id) return;
  setMessage(mensajeDetalle, 'Cargando cotización...', 'info');
  try {
    const resp = await fetchAutorizado(`/api/cotizaciones/${id}`);
    if (!resp.ok) throw new Error('No se pudo obtener la cotización');
    const data = await resp.json();
    const { cotizacion, items } = data || {};
    if (!cotizacion) throw new Error('Cotización no encontrada');

      cotizacionActual = cotizacion;
      inputId.value = cotizacion.id;
      codigoDisplay.textContent = cotizacion.codigo || `#${cotizacion.id}`;
      fechaDisplay.textContent = formatDate(cotizacion.fecha_creacion);
      inputValidez.value = cotizacion.fecha_validez ? cotizacion.fecha_validez.slice(0, 10) : '';
      inputCliente.value = cotizacion.cliente_nombre || '';
      inputDocumento.value = cotizacion.cliente_documento || '';
      inputContacto.value = cotizacion.cliente_contacto || '';
      inputNotasCliente.value = cotizacion.notas_cliente || '';
      inputNotasInternas.value = cotizacion.notas_internas || '';
      inputDescGlobalPct.value = cotizacion.descuento_porcentaje || 0;
      setMoneyInputValue(inputDescGlobalMonto, cotizacion.descuento_monto || 0);
      setEstadoEtiqueta(cotizacion.estado || 'borrador');
      itemsBody.innerHTML = '';
      (items || []).forEach((item) => agregarItemFila(item));
      if (!items || !items.length) {
        agregarItemFila();
      }
      actualizarBotonesEstado();
      recalcularTotales();
      setMessage(mensajeDetalle, '', 'info');
    } catch (error) {
      console.error('Error al cargar cotización:', error);
      setMessage(mensajeDetalle, error.message || 'No se pudo cargar la cotización.', 'error');
    }
  };

  const guardarCotizacion = async (estadoForzado = 'borrador') => {
    const datos = obtenerDatosCotizacion();
    if (datos.error) {
      setMessage(mensajeDetalle, datos.error, 'error');
      return;
    }

    setMessage(mensajeDetalle, 'Guardando cotización...', 'info');
    const payload = {
      ...datos.datos,
      estado: estadoForzado || cotizacionActual?.estado || 'borrador',
      items: datos.items,
      descuento_porcentaje: Number(inputDescGlobalPct?.value) || 0,
      descuento_monto: parseMoneyValue(inputDescGlobalMonto),
    };

    const esEdicion = Boolean(cotizacionActual?.id);
    const url = esEdicion ? `/api/cotizaciones/${cotizacionActual.id}` : '/api/cotizaciones';
    const method = esEdicion ? 'PUT' : 'POST';

    try {
      const resp = await fetchJsonAutorizado(url, {
        method,
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        throw new Error(data.error || 'No se pudo guardar la cotización');
      }
      cotizacionActual = data.cotizacion || cotizacionActual;
      setEstadoEtiqueta(cotizacionActual?.estado || payload.estado);
      actualizarBotonesEstado();
      setMessage(mensajeDetalle, 'Cotización guardada correctamente.', 'info');
      await cargarCotizaciones();
      if (cotizacionActual?.id) {
        await cargarCotizacionDetalle(cotizacionActual.id);
      }
    } catch (error) {
      console.error('Error al guardar cotización:', error);
      setMessage(mensajeDetalle, error.message || 'No se pudo guardar la cotización.', 'error');
    }
  };

  const cambiarEstado = async (nuevoEstado) => {
    if (!cotizacionActual?.id) {
      setMessage(mensajeDetalle, 'Selecciona una cotización para continuar.', 'warning');
      return;
    }
    setMessage(mensajeDetalle, 'Actualizando estado...', 'info');
    try {
      const resp = await fetchJsonAutorizado(`/api/cotizaciones/${cotizacionActual.id}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        throw new Error(data.error || 'No se pudo actualizar el estado');
      }
      cotizacionActual.estado = nuevoEstado;
      setEstadoEtiqueta(nuevoEstado);
      actualizarBotonesEstado();
      setMessage(mensajeDetalle, 'Estado actualizado.', 'info');
      await cargarCotizaciones();
    } catch (error) {
      console.error('Error al cambiar estado de cotización:', error);
      setMessage(mensajeDetalle, error.message || 'No se pudo cambiar el estado.', 'error');
    }
  };

  const facturarCotizacion = async () => {
    if (!cotizacionActual?.id) {
      setMessage(mensajeDetalle, 'Selecciona una cotización para facturar.', 'warning');
      return;
    }
    if (cotizacionActual.estado !== 'aceptada') {
      setMessage(mensajeDetalle, 'Solo puedes facturar cotizaciones aceptadas.', 'warning');
      return;
    }
    const confirmar = window.confirm('Se creará un pedido listo para cobrar a partir de esta cotización. ¿Continuar?');
    if (!confirmar) return;
    setMessage(mensajeDetalle, 'Facturando cotización...', 'info');
    try {
      const resp = await fetchAutorizado(`/api/cotizaciones/${cotizacionActual.id}/facturar`, { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        throw new Error(data.error || 'No se pudo facturar la cotización');
      }
      setMessage(
        mensajeDetalle,
        'Cotización facturada. Revisa el pedido generado para finalizar el cobro.',
        'info'
      );
      await cargarCotizaciones();
      await cargarCotizacionDetalle(cotizacionActual.id);
    } catch (error) {
      console.error('Error al facturar cotización:', error);
      setMessage(mensajeDetalle, error.message || 'No se pudo facturar la cotización.', 'error');
    }
  };

  const imprimirCotizacion = () => {
    if (!cotizacionActual?.id) return;
    const url = `/admin/cotizaciones/${cotizacionActual.id}/imprimir?id=${cotizacionActual.id}`;
    window.open(url, '_blank');
  };

  const init = async () => {
    await Promise.all([cargarProductos(), cargarImpuesto()]);
    limpiarFormulario();
    await cargarCotizaciones();
  };

  botonFiltrar?.addEventListener('click', (event) => {
    event.preventDefault();
    cargarCotizaciones();
  });

  botonNueva?.addEventListener('click', (event) => {
    event.preventDefault();
    limpiarFormulario();
  });

  botonAgregarItem?.addEventListener('click', (event) => {
    event.preventDefault();
    agregarItemFila();
  });

  botonGuardar?.addEventListener('click', (event) => {
    event.preventDefault();
    guardarCotizacion('borrador');
  });

  botonEnviar?.addEventListener('click', (event) => {
    event.preventDefault();
    guardarCotizacion('enviada');
  });

  botonAceptar?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!cotizacionActual?.id) {
      guardarCotizacion('aceptada');
    } else {
      cambiarEstado('aceptada');
    }
  });

  botonImprimir?.addEventListener('click', (event) => {
    event.preventDefault();
    imprimirCotizacion();
  });

  botonFacturar?.addEventListener('click', (event) => {
    event.preventDefault();
    facturarCotizacion();
  });

  inputClienteBuscar?.addEventListener('input', (event) => {
    const valor = event.target.value || '';
    const opcion = Array.from(datalistClientes?.options || []).find((opt) => opt.value === valor);
    if (opcion) {
      const cli = clientesSugeridos.find((c) => String(c.id) === opcion.dataset.id);
      if (cli) {
        aplicarClienteSeleccionado(cli);
      }
    } else if (valor.length >= 2) {
      buscarClientes(valor);
    }
  });

  inputClienteBuscar?.addEventListener('focus', () => {
    if (!clientesSugeridos.length) buscarClientes('');
  });

  inputDescGlobalPct?.addEventListener('input', recalcularTotales);
  inputDescGlobalMonto?.addEventListener('input', recalcularTotales);

  listaCotizaciones?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-abrir-cotizacion]');
    if (!trigger) return;
    event.preventDefault();
    const id = Number(trigger.dataset.abrirCotizacion);
    if (Number.isInteger(id)) {
      cargarCotizacionDetalle(id);
    }
  });

  listaCotizaciones?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const trigger = event.target.closest('[data-abrir-cotizacion]');
    if (!trigger) return;
    event.preventDefault();
    const id = Number(trigger.dataset.abrirCotizacion);
    if (Number.isInteger(id)) {
      cargarCotizacionDetalle(id);
    }
  });

  init();
})();

