const campoMesa = document.getElementById('mostrador-mesa');
const selectServicio = document.getElementById('mostrador-servicio');
const notaInput = document.getElementById('mostrador-nota');
const listaProductos = document.getElementById('mostrador-lista-productos');
const carritoContainer = document.getElementById('mostrador-carrito');
const botonCrearVenta = document.getElementById('mostrador-generar');
const botonCancelarVenta = document.getElementById('mostrador-cancelar');
const botonLimpiarCarrito = document.getElementById('mostrador-limpiar');
const mensajeMostrador = document.getElementById('mostrador-mensaje');
const buscadorInput = document.getElementById('mostrador-productos-buscar');
const contadorProductos = document.getElementById('mostrador-productos-contador');
const resumenSubtotal = document.getElementById('mostrador-resumen-subtotal');
const resumenImpuesto = document.getElementById('mostrador-resumen-impuesto');
const resumenTotal = document.getElementById('mostrador-resumen-total');
const identidadMostrador = document.getElementById('mostrador-identidad');

const cobroPlaceholder = document.getElementById('mostrador-cobro-placeholder');
const cobroForm = document.getElementById('mostrador-cobro-form');
const cobroMensaje = document.getElementById('mostrador-cobro-mensaje');
const infoContainer = document.getElementById('mostrador-detalle-info');
const itemsContainer = document.getElementById('mostrador-detalle-items');
const inputDescuento = document.getElementById('mostrador-descuento');
const inputPropina = document.getElementById('mostrador-propina');
const inputClienteBuscar = document.getElementById('mostrador-cliente-buscar');
const inputClienteNombre = document.getElementById('mostrador-cliente-nombre');
const inputClienteDocumento = document.getElementById('mostrador-cliente-documento');
const datalistClientes = document.getElementById('mostrador-clientes');
const selectTipoComprobante = document.getElementById('mostrador-tipo-comprobante');
const inputNcfManual = document.getElementById('mostrador-ncf-manual');
const inputComentarios = document.getElementById('mostrador-comentarios');
const botonRecalcular = document.getElementById('mostrador-recalcular');
const botonCobrar = document.getElementById('mostrador-cobrar');
const resumenCobroSubtotal = document.getElementById('mostrador-cobro-subtotal');
const resumenCobroImpuesto = document.getElementById('mostrador-cobro-impuesto');
const resumenCobroPropina = document.getElementById('mostrador-cobro-propina');
const resumenCobroDescuento = document.getElementById('mostrador-cobro-descuento');
const resumenCobroTotal = document.getElementById('mostrador-cobro-total');
const facturaAcciones = document.getElementById('mostrador-factura-acciones');
const facturaInfo = document.getElementById('mostrador-factura-info');
const botonImprimir = document.getElementById('mostrador-imprimir');

const inputPagoEfectivoEntregado = document.getElementById('mostrador-pago-efectivo-entregado');
const inputPagoTarjeta = document.getElementById('mostrador-pago-tarjeta');
const inputPagoTransferencia = document.getElementById('mostrador-pago-transferencia');
const pagoCambioDisplay = document.getElementById('mostrador-pago-cambio');
const selectMetodoPago = document.getElementById('mostrador-pago-metodo');
const camposPago = Array.from(document.querySelectorAll('#mostrador-cobro-form [data-metodo]'));

const SYNC_STORAGE_KEY = 'kanm:last-update';
const PROPINA_STORAGE_KEY = 'kanm:propina-legal';
const PROPINA_DEFAULT = 10;

const estado = {
  productos: [],
  filtro: '',
  carrito: new Map(),
  cargando: false,
  impuestoPorcentaje: 0,
  productosConImpuesto: false,
  impuestoIncluidoPorcentaje: 0,
  ventaActiva: false,
  ventaActual: null,
  detalleCuentaCargado: false,
  cargandoDetalleCuenta: false,
};

let calculo = {
  subtotal: 0,
  impuesto: 0,
  descuentoPorcentaje: 0,
  propinaPorcentaje: PROPINA_DEFAULT,
  descuentoGeneralMonto: 0,
  descuentoItemsMonto: 0,
  descuentoPorcentajeEfectivo: 0,
  descuentoMonto: 0,
  propinaMonto: 0,
  baseConDescuento: 0,
  baseSinDescuento: 0,
  total: 0,
};

let descuentosPorItem = [];
let itemsDetalleActual = [];

let clientesSugeridos = [];
let ultimoNombreAutocompletadoDgii = '';
let ultimoDocumentoConsultadoDgii = '';
let ultimoDocumentoSincronizadoCliente = '';
let consultaDgiiTimer = null;
let consultaDgiiController = null;
let secuenciasConfig = {
  permitir_b01: 1,
  permitir_b02: 1,
  permitir_b14: 1,
};

const esProductoStockIndefinido = (producto) => Number(producto?.stock_indefinido) === 1;
const obtenerStockDisponible = (producto) => {
  if (esProductoStockIndefinido(producto)) return Infinity;
  const valor = Number(producto?.stock);
  return Number.isFinite(valor) ? valor : 0;
};
const obtenerEtiquetaStock = (producto) =>
  esProductoStockIndefinido(producto) ? 'Indefinido' : obtenerStockDisponible(producto);

const formatCurrency = (valor) => {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(numero);
};

const parseMoneyValueMostrador = (input, { fallback = 0, allowEmpty = true } = {}) => {
  const raw =
    input && typeof input === 'object' && 'value' in input ? input.value : input ?? '';
  const texto = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!texto) return allowEmpty ? fallback : NaN;
  const parsed = window.KANMMoney?.parse
    ? window.KANMMoney.parse(texto)
    : Number(texto.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const setMoneyInputValueMostrador = (input, value) => {
  if (!input) return;
  if (window.KANMMoney?.setValue && input.matches?.('input[data-money]')) {
    window.KANMMoney.setValue(input, value);
    return;
  }
  input.value = value ?? '';
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
            registro.descuento_monto =
              Math.round(basePrecio * cantidadAplicada * (valorPorcentaje / 100) * 100) / 100;
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
    const aplicaCompleto =
      entrada.tipo === 'porcentaje' && cantidadTotal > 0 && cantidadAplicada >= cantidadTotal;
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

const formatDateTime = (valor) => {
  if (!valor) return '--';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '--';
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
    timeZone: 'America/Santo_Domingo',
  }).format(fecha);
};

const notificarActualizacionGlobal = (evento, payload = {}) => {
  if (!window.localStorage) return;
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

const setMensaje = (elemento, texto, tipo = 'info') => {
  if (!elemento) return;
  elemento.textContent = texto || '';
  elemento.dataset.type = texto ? tipo : '';
};

const limpiarMensajePedido = () => setMensaje(mensajeMostrador, '');
const mostrarMensajePedido = (texto, tipo = 'info') => setMensaje(mensajeMostrador, texto, tipo);
const limpiarMensajeCobro = () => setMensaje(cobroMensaje, '');
const mostrarMensajeCobro = (texto, tipo = 'info') => setMensaje(cobroMensaje, texto, tipo);

const obtenerUsuarioActual = () => {
  try {
    return window.KANMSession?.getUser?.() || null;
  } catch (error) {
    return null;
  }
};

const authApi = window.kanmAuth;

const obtenerAuthHeaders = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    return {};
  }
};

const fetchAutorizado = async (url, options = {}) => {
  const headers = { ...obtenerAuthHeaders(), ...(options.headers || {}) };
  const respuesta = await fetch(url, { ...options, headers });
  if (respuesta.status === 401 || respuesta.status === 403) {
    authApi?.handleUnauthorized?.();
    throw new Error('Sesion expirada. Inicia sesion nuevamente.');
  }
  return respuesta;
};

const normalizarOpcionesPrecioProducto = (producto = {}) => {
  const opciones = [];
  const baseValor = Number(producto.precio) || 0;
  opciones.push({ label: 'Base', valor: Number(baseValor.toFixed(2)) });

  const extras = Array.isArray(producto.precios) ? producto.precios : [];
  extras.forEach((extra, index) => {
    if (!extra) return;
    const valor = Number(extra.valor);
    if (!Number.isFinite(valor) || valor < 0) return;
    const label = (extra.label || '').toString().trim() || `Precio ${index + 1}`;
    opciones.push({ label, valor: Number(valor.toFixed(2)) });
  });

  return opciones;
};

const construirClaveCarrito = (productoId, precioLabel, precioValor) =>
  `${productoId}::${precioLabel || 'precio'}::${Number(precioValor).toFixed(2)}`;

const obtenerCantidadProductoEnCarrito = (productoId, excluirClave = null) => {
  let total = 0;
  estado.carrito.forEach((item, key) => {
    if (item.producto_id !== productoId) return;
    if (excluirClave && key === excluirClave) return;
    total += Number(item.cantidad) || 0;
  });
  return total;
};

const resolverPrecioSeleccionado = (producto, selectEl = null) => {
  const opciones = normalizarOpcionesPrecioProducto(producto);
  const base = opciones[0] || { label: 'Base', valor: 0 };

  if (!selectEl) {
    return base;
  }

  const seleccion = selectEl.selectedOptions?.[0];
  const valorSeleccionado = Number(seleccion?.value);
  if (!Number.isFinite(valorSeleccionado)) {
    return base;
  }

  const labelSeleccionado = (seleccion?.dataset?.label || seleccion?.textContent || '').trim();
  return {
    label: labelSeleccionado || base.label,
    valor: Number(valorSeleccionado.toFixed(2)),
  };
};

const obtenerProductosActivos = () =>
  estado.productos.filter((producto) => producto.activo !== 0);

const obtenerProductosFiltrados = () => {
  const activos = obtenerProductosActivos();
  if (!estado.filtro) return activos;
  const filtro = estado.filtro.toLowerCase();
  return activos.filter((producto) => producto.nombre.toLowerCase().includes(filtro));
};

const actualizarContador = () => {
  if (!contadorProductos) return;
  const total = obtenerProductosActivos().length;
  const filtrados = obtenerProductosFiltrados().length;
  if (!total) {
    contadorProductos.textContent = 'Sin productos registrados.';
    return;
  }
  if (estado.filtro) {
    contadorProductos.textContent = `${filtrados} de ${total} productos muestran "${estado.filtro}".`;
  } else {
    contadorProductos.textContent = `${total} productos disponibles.`;
  }
};

const calcularResumenCarrito = () => {
  let subtotalBase = 0;
  estado.carrito.forEach((item) => {
    const precio = Number(item.precio_unitario) || 0;
    subtotalBase += precio * item.cantidad;
  });
  if (estado.productosConImpuesto) {
    const tasaIncluida = Math.max(Number(estado.impuestoIncluidoPorcentaje) || 0, 0);
    if (tasaIncluida > 0) {
      const subtotalNeto = subtotalBase / (1 + tasaIncluida / 100);
      const impuestoEstimado = subtotalBase - subtotalNeto;
      return {
        subtotal: Number(subtotalNeto.toFixed(2)),
        impuesto: Number(impuestoEstimado.toFixed(2)),
        total: Number(subtotalBase.toFixed(2)),
      };
    }
    return {
      subtotal: Number(subtotalBase.toFixed(2)),
      impuesto: 0,
      total: Number(subtotalBase.toFixed(2)),
    };
  }
  const impuesto = subtotalBase * (estado.impuestoPorcentaje / 100);
  const total = subtotalBase + impuesto;
  return {
    subtotal: Number(subtotalBase.toFixed(2)),
    impuesto: Number(impuesto.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
};

const actualizarResumenCarrito = () => {
  const { subtotal, impuesto, total } = calcularResumenCarrito();
  if (resumenSubtotal) resumenSubtotal.textContent = formatCurrency(subtotal);
  if (resumenImpuesto) resumenImpuesto.textContent = formatCurrency(impuesto);
  if (resumenTotal) resumenTotal.textContent = formatCurrency(total);
};

const crearBotonCantidad = (texto, accion, disabled = false) => {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'kanm-button secondary';
  boton.textContent = texto;
  boton.disabled = disabled;
  boton.addEventListener('click', accion);
  return boton;
};

const actualizarCarritoUI = () => {
  if (!carritoContainer) return;

  carritoContainer.innerHTML = '';

  if (estado.carrito.size === 0) {
    const vacio = document.createElement('div');
    vacio.className = 'kanm-empty-message';
    vacio.textContent = 'Aun no has agregado productos al pedido.';
    carritoContainer.appendChild(vacio);
    actualizarResumenCarrito();
    return;
  }

  const fragment = document.createDocumentFragment();

  estado.carrito.forEach((item, itemKey) => {
    const producto = estado.productos.find((p) => p.id === item.producto_id);
    if (!producto) {
      return;
    }

    const stockDisponible = obtenerStockDisponible(producto);
    const stockIndefinido = esProductoStockIndefinido(producto);
    const totalEnCarrito = obtenerCantidadProductoEnCarrito(producto.id);
    const precioUnitario = Number(item.precio_unitario) || 0;
    const subtotalLinea = precioUnitario * item.cantidad;
    const opcionesPrecio = normalizarOpcionesPrecioProducto(producto);
    const mostrarEtiquetaPrecio = opcionesPrecio.length > 1;
    const etiquetaPrecio = mostrarEtiquetaPrecio && item.precio_label ? ` (${item.precio_label})` : '';

    const card = document.createElement('article');
    card.className = 'carrito-item';

    const info = document.createElement('div');
    const titulo = document.createElement('h3');
    titulo.textContent = producto.nombre;
    const meta = document.createElement('p');
    meta.className = 'producto-meta';
    meta.textContent = `Precio: ${formatCurrency(precioUnitario)}${etiquetaPrecio} | Stock disponible: ${obtenerEtiquetaStock(producto)}`;
    const subtotal = document.createElement('p');
    subtotal.className = 'producto-meta subtotal-linea';
    subtotal.textContent = `Subtotal: ${formatCurrency(subtotalLinea)}`;
    info.appendChild(titulo);
    info.appendChild(meta);
    info.appendChild(subtotal);

    const controles = document.createElement('div');
    controles.className = 'carrito-controles';

    const botonMenos = crearBotonCantidad(
      '-',
      () => ajustarCantidad(itemKey, item.cantidad - 1),
      estado.ventaActiva
    );
    const botonMas = crearBotonCantidad(
      '+',
      () => ajustarCantidad(itemKey, item.cantidad + 1),
      estado.ventaActiva || (!stockIndefinido && totalEnCarrito >= stockDisponible)
    );

    const inputCantidad = document.createElement('input');
    inputCantidad.type = 'number';
    inputCantidad.min = '1';
    inputCantidad.value = item.cantidad;
    inputCantidad.disabled = estado.ventaActiva;
    inputCantidad.addEventListener('change', (event) => {
      const valor = Number(event.target.value);
      ajustarCantidad(itemKey, valor);
    });

    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'kanm-button ghost';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.disabled = estado.ventaActiva;
    botonEliminar.addEventListener('click', () => eliminarDelCarrito(itemKey));

    controles.appendChild(botonMenos);
    controles.appendChild(inputCantidad);
    controles.appendChild(botonMas);
    controles.appendChild(botonEliminar);

    card.appendChild(info);
    card.appendChild(controles);
    fragment.appendChild(card);
  });

  carritoContainer.appendChild(fragment);
  actualizarResumenCarrito();
};

const renderProductos = () => {
  if (!listaProductos) return;

  const productosFiltrados = obtenerProductosFiltrados();
  actualizarContador();

  listaProductos.innerHTML = '';

  if (!productosFiltrados.length) {
    const vacio = document.createElement('div');
    vacio.className = 'kanm-empty-message';
    vacio.textContent = obtenerProductosActivos().length
      ? 'No hay productos que coincidan con tu busqueda.'
      : 'No hay productos registrados.';
    listaProductos.appendChild(vacio);
    return;
  }

  const fragment = document.createDocumentFragment();

  productosFiltrados.forEach((producto) => {
    const card = document.createElement('article');
    card.className = 'producto-card';

    const contenido = document.createElement('div');
    const stockDisponible = obtenerStockDisponible(producto);
    const stockTexto = obtenerEtiquetaStock(producto);
    const stockIndefinido = esProductoStockIndefinido(producto);
    const opcionesPrecio = normalizarOpcionesPrecioProducto(producto);
    let selectorPrecio = null;

    contenido.innerHTML = `
      <h3>${producto.nombre}</h3>
      <p class="producto-meta">
        Precio: ${formatCurrency(producto.precio)} | Stock: ${stockTexto} | ${
          producto.categoria_nombre ? `Categoria: ${producto.categoria_nombre}` : 'Sin categoria'
        }
      </p>
    `;

    if (opcionesPrecio.length > 1) {
      const selectorWrap = document.createElement('div');
      selectorWrap.className = 'producto-precio-selector';

      const etiqueta = document.createElement('span');
      etiqueta.className = 'producto-precio-label';
      etiqueta.textContent = 'Precio a usar';

      selectorPrecio = document.createElement('select');
      selectorPrecio.className = 'kanm-input producto-precio-select';
      selectorPrecio.setAttribute('aria-label', 'Precio a usar');
      opcionesPrecio.forEach((opcion) => {
        const option = document.createElement('option');
        option.value = opcion.valor;
        option.dataset.label = opcion.label;
        option.textContent = `${opcion.label} - ${formatCurrency(opcion.valor)}`;
        selectorPrecio.appendChild(option);
      });

      selectorWrap.appendChild(etiqueta);
      selectorWrap.appendChild(selectorPrecio);
      contenido.appendChild(selectorWrap);
    }

    const acciones = document.createElement('div');
    acciones.className = 'producto-acciones';

    const botonAgregar = document.createElement('button');
    botonAgregar.type = 'button';
    botonAgregar.className = 'kanm-button';
    botonAgregar.textContent = stockIndefinido || stockDisponible > 0 ? 'Agregar' : 'Sin stock';
    botonAgregar.disabled =
      estado.ventaActiva || !producto.activo || (!stockIndefinido && stockDisponible <= 0);
    botonAgregar.addEventListener('click', () => agregarAlCarrito(producto, selectorPrecio));

    acciones.appendChild(botonAgregar);

    card.appendChild(contenido);
    card.appendChild(acciones);
    fragment.appendChild(card);
  });

  listaProductos.appendChild(fragment);
};

const agregarAlCarrito = (producto, selectPrecio = null) => {
  limpiarMensajePedido();

  if (estado.ventaActiva) {
    mostrarMensajePedido('Finaliza o cancela la venta actual antes de agregar mas productos.', 'warning');
    return;
  }

  if (!producto || !producto.id) {
    mostrarMensajePedido('Producto invalido.', 'error');
    return;
  }

  const stockDisponible = obtenerStockDisponible(producto);
  const stockIndefinido = esProductoStockIndefinido(producto);
  if (!stockIndefinido && stockDisponible <= 0) {
    mostrarMensajePedido('Este producto no tiene stock disponible.', 'error');
    return;
  }

  const seleccion = resolverPrecioSeleccionado(producto, selectPrecio);
  const itemKey = construirClaveCarrito(producto.id, seleccion.label, seleccion.valor);
  const totalEnCarrito = obtenerCantidadProductoEnCarrito(producto.id);
  const itemActual = estado.carrito.get(itemKey) || { cantidad: 0 };
  const nuevaCantidad = itemActual.cantidad + 1;
  const totalNuevo = totalEnCarrito + 1;

  if (!stockIndefinido && totalNuevo > stockDisponible) {
    mostrarMensajePedido('No puedes agregar mas unidades que el stock disponible.', 'error');
    return;
  }

  estado.carrito.set(itemKey, {
    producto_id: producto.id,
    cantidad: nuevaCantidad,
    precio_unitario: seleccion.valor,
    precio_label: seleccion.label,
  });
  actualizarCarritoUI();
};

const eliminarDelCarrito = (itemKey) => {
  if (estado.ventaActiva) {
    mostrarMensajePedido('Finaliza o cancela la venta actual antes de editar.', 'warning');
    return;
  }
  estado.carrito.delete(itemKey);
  actualizarCarritoUI();
};

const ajustarCantidad = (itemKey, cantidadDeseada) => {
  limpiarMensajePedido();

  if (estado.ventaActiva) {
    mostrarMensajePedido('Finaliza o cancela la venta actual antes de editar.', 'warning');
    return false;
  }

  if (!estado.carrito.has(itemKey)) {
    return false;
  }

  const cantidad = Number(cantidadDeseada);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    mostrarMensajePedido('La cantidad debe ser mayor a cero.', 'error');
    actualizarCarritoUI();
    return false;
  }

  const itemActual = estado.carrito.get(itemKey);
  const productoId = itemActual?.producto_id;
  const producto = estado.productos.find((p) => p.id === productoId);
  if (!producto) {
    mostrarMensajePedido('No se pudo encontrar el producto seleccionado.', 'error');
    actualizarCarritoUI();
    return false;
  }

  const stockDisponible = obtenerStockDisponible(producto);
  const stockIndefinido = esProductoStockIndefinido(producto);
  const totalOtros = obtenerCantidadProductoEnCarrito(productoId, itemKey);
  const totalNuevo = totalOtros + cantidad;
  if (!stockIndefinido && totalNuevo > stockDisponible) {
    mostrarMensajePedido('No puedes solicitar mas unidades que el stock disponible.', 'error');
    actualizarCarritoUI();
    return false;
  }

  estado.carrito.set(itemKey, { ...itemActual, cantidad });
  actualizarCarritoUI();
  return true;
};

const validarPedido = () => {
  if (notaInput && notaInput.value.length > 200) {
    mostrarMensajePedido('La nota no puede superar 200 caracteres.', 'error');
    return false;
  }

  if (estado.carrito.size === 0) {
    mostrarMensajePedido('Agrega al menos un producto para crear la venta.', 'error');
    return false;
  }

  const cantidadesPorProducto = new Map();

  for (const item of estado.carrito.values()) {
    if (!item || !item.producto_id) {
      mostrarMensajePedido('Hay un producto invalido en el carrito.', 'error');
      return false;
    }

    if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
      mostrarMensajePedido('Todas las cantidades deben ser mayores a cero.', 'error');
      return false;
    }

    const producto = estado.productos.find((p) => p.id === item.producto_id);
    if (!producto) {
      mostrarMensajePedido('Hay un producto invalido en el carrito.', 'error');
      return false;
    }
    const registro = cantidadesPorProducto.get(item.producto_id) || { total: 0, producto };
    registro.total += item.cantidad;
    cantidadesPorProducto.set(item.producto_id, registro);
  }

  for (const registro of cantidadesPorProducto.values()) {
    const stockIndefinido = esProductoStockIndefinido(registro.producto);
    const stockDisponible = obtenerStockDisponible(registro.producto);
    if (!stockIndefinido && registro.total > stockDisponible) {
      mostrarMensajePedido('Hay productos cuya cantidad supera el stock disponible.', 'error');
      return false;
    }
  }

  return true;
};

const construirPayloadPedido = () => {
  const mesa = campoMesa?.value.trim();
  const items = Array.from(estado.carrito.values()).map((item) => {
    const precioUnitario = Number(item.precio_unitario);
    return {
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: Number.isFinite(precioUnitario) ? precioUnitario : 0,
    };
  });
  const modoServicioSeleccionado = selectServicio?.value || 'en_local';
  const nota = notaInput?.value?.trim() || '';

  return {
    mesa: mesa || null,
    cliente: null,
    items,
    modo_servicio: modoServicioSeleccionado,
    destino: 'caja',
    origen_caja: 'mostrador',
    nota,
  };
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

const obtenerTotalesBaseVenta = () => {
  if (!estado.ventaActual) {
    return { subtotal: 0, impuesto: 0 };
  }
  const pedidos = Array.isArray(estado.ventaActual.pedidos) ? estado.ventaActual.pedidos : [];
  if (pedidos.length) {
    const subtotal = pedidos.reduce((acc, p) => acc + (Number(p.subtotal) || 0), 0);
    const impuesto = pedidos.reduce((acc, p) => acc + (Number(p.impuesto) || 0), 0);
    return { subtotal, impuesto };
  }
  return {
    subtotal: Number(estado.ventaActual.subtotal) || 0,
    impuesto: Number(estado.ventaActual.impuesto) || 0,
  };
};

const calcularTotalesCobro = () => {
  if (!estado.ventaActual) {
    calculo = {
      subtotal: 0,
      impuesto: 0,
      descuentoPorcentaje: 0,
      propinaPorcentaje: PROPINA_DEFAULT,
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

  const totalesBase = obtenerTotalesBaseVenta();
  const subtotal = Number(totalesBase.subtotal) || 0;
  const impuestoBase = Number(totalesBase.impuesto) || 0;
  const base = subtotal + impuestoBase;
  const descuentoPorcentaje = Math.max(Number(inputDescuento?.value) || 0, 0);
  const propinaPorcentaje = Math.max(Number(inputPropina?.value) || 0, 0);

  const descuentoItemsBruto = descuentosPorItem.reduce(
    (acc, item) => acc + (Number(item.montoCalculado) || 0),
    0
  );
  const descuentoItemsMonto = Math.min(descuentoItemsBruto, subtotal);
  const subtotalConDescuento = Math.max(subtotal - descuentoItemsMonto, 0);
  const impuestoAjustado = subtotal > 0 ? impuestoBase * (subtotalConDescuento / subtotal) : impuestoBase;
  const baseConItems = subtotalConDescuento + impuestoAjustado;
  const descuentoGeneralMonto = Math.min(baseConItems * (descuentoPorcentaje / 100), baseConItems);
  const baseConDescuento = Math.max(baseConItems - descuentoGeneralMonto, 0);
  const factorDescuentoGeneral = baseConItems > 0 ? baseConDescuento / baseConItems : 1;
  const subtotalConDescuentoFinal = subtotalConDescuento * factorDescuentoGeneral;
  const propinaMonto = subtotalConDescuentoFinal * (propinaPorcentaje / 100);
  const total = baseConDescuento + propinaMonto;
  const descuentoTotal = Math.min(descuentoItemsMonto + descuentoGeneralMonto, base);
  const descuentoPorcentajeEfectivo = base > 0 ? ((base - baseConDescuento) / base) * 100 : 0;

  calculo = {
    subtotal,
    impuesto: impuestoAjustado,
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

const actualizarResumenCobro = () => {
  calcularTotalesCobro();
  if (resumenCobroSubtotal) resumenCobroSubtotal.textContent = formatCurrency(calculo.subtotal);
  if (resumenCobroImpuesto) resumenCobroImpuesto.textContent = formatCurrency(calculo.impuesto);
  if (resumenCobroPropina) resumenCobroPropina.textContent = formatCurrency(calculo.propinaMonto);
  if (resumenCobroDescuento)
    resumenCobroDescuento.textContent = `- ${formatCurrency(calculo.descuentoMonto)}`;
  if (resumenCobroTotal) resumenCobroTotal.textContent = formatCurrency(calculo.total);
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
    const recibido = Math.max(parseMoneyValueMostrador(inputPagoEfectivoEntregado), 0);
    return { efectivo: total, efectivoEntregado: recibido || total, tarjeta: 0, transferencia: 0, metodo };
  }

  const tarjeta = Math.max(parseMoneyValueMostrador(inputPagoTarjeta), 0);
  const transferencia = Math.max(parseMoneyValueMostrador(inputPagoTransferencia), 0);
  const efectivoEntregado = Math.max(parseMoneyValueMostrador(inputPagoEfectivoEntregado), 0);
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
  if (inputPagoEfectivoEntregado) setMoneyInputValueMostrador(inputPagoEfectivoEntregado, Number(total) || 0);
  if (inputPagoTarjeta) setMoneyInputValueMostrador(inputPagoTarjeta, 0);
  if (inputPagoTransferencia) setMoneyInputValueMostrador(inputPagoTransferencia, 0);
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
      if (inputPagoEfectivoEntregado) setMoneyInputValueMostrador(inputPagoEfectivoEntregado, calculo.total);
      if (inputPagoTarjeta) setMoneyInputValueMostrador(inputPagoTarjeta, 0);
      if (inputPagoTransferencia) setMoneyInputValueMostrador(inputPagoTransferencia, 0);
    } else if (metodo === 'tarjeta') {
      if (inputPagoTarjeta) setMoneyInputValueMostrador(inputPagoTarjeta, calculo.total);
      if (inputPagoEfectivoEntregado) setMoneyInputValueMostrador(inputPagoEfectivoEntregado, 0);
      if (inputPagoTransferencia) setMoneyInputValueMostrador(inputPagoTransferencia, 0);
    } else if (metodo === 'transferencia') {
      if (inputPagoTransferencia) setMoneyInputValueMostrador(inputPagoTransferencia, calculo.total);
      if (inputPagoEfectivoEntregado) setMoneyInputValueMostrador(inputPagoEfectivoEntregado, 0);
      if (inputPagoTarjeta) setMoneyInputValueMostrador(inputPagoTarjeta, 0);
    }
  }

  recalcularCambio();
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

const resolverConfigSecuencias = (tema = {}) => ({
  permitir_b01: normalizarFlagUI(tema?.permitir_b01 ?? tema?.permitirB01, 1),
  permitir_b02: normalizarFlagUI(tema?.permitir_b02 ?? tema?.permitirB02, 1),
  permitir_b14: normalizarFlagUI(tema?.permitir_b14 ?? tema?.permitirB14, 1),
});

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
  return texto.toUpperCase();
};

const esSinComprobante = (valor) =>
  normalizarTipoComprobante(valor).toLowerCase() === 'sin comprobante';

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

    const respuesta = await fetchAutorizado('/api/negocios/mi-tema');
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

    const resp = await fetchAutorizado(`/api/dgii/rnc-cache/lookup?${params.toString()}`, {
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
    console.warn('No se pudo autocompletar desde DGII local:', error?.message || error);
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
    const resp = await fetchAutorizado(`/api/clientes?search=${encodeURIComponent(term)}`);
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
  if (inputClienteNombre) inputClienteNombre.value = cliente.nombre || '';
  if (inputClienteDocumento) inputClienteDocumento.value = cliente.documento || '';
};

const setVentaActiva = (activa) => {
  estado.ventaActiva = activa;
  if (botonCrearVenta) botonCrearVenta.disabled = activa || estado.cargando;
  if (botonCancelarVenta) botonCancelarVenta.hidden = !activa;
  if (botonLimpiarCarrito) botonLimpiarCarrito.disabled = activa;
  if (campoMesa) campoMesa.disabled = activa;
  if (selectServicio) selectServicio.disabled = activa;
  if (notaInput) notaInput.disabled = activa;
  if (buscadorInput) buscadorInput.disabled = activa;
  renderProductos();
  actualizarCarritoUI();
};

const limpiarFormularioCobro = () => {
  if (infoContainer) infoContainer.innerHTML = '';
  if (itemsContainer) itemsContainer.innerHTML = '';
  if (inputClienteNombre) inputClienteNombre.value = '';
  if (inputClienteDocumento) inputClienteDocumento.value = '';
  if (inputClienteBuscar) inputClienteBuscar.value = '';
  reiniciarLookupDgii();
  if (inputDescuento) inputDescuento.value = '0';
  aplicarPropinaPreferida({ force: true });
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
  limpiarDescuentosItems();
  itemsDetalleActual = [];
  calculo = {
    subtotal: 0,
    impuesto: 0,
    descuentoPorcentaje: 0,
    propinaPorcentaje: PROPINA_DEFAULT,
    descuentoGeneralMonto: 0,
    descuentoItemsMonto: 0,
    descuentoPorcentajeEfectivo: 0,
    descuentoMonto: 0,
    propinaMonto: 0,
    baseConDescuento: 0,
    baseSinDescuento: 0,
    total: 0,
  };
  actualizarResumenCobro();
};

const normalizarItemCobro = (item, index = 0) => {
  const cantidad = normalizarNumero(item?.cantidad, 0);
  const precioUnitario = normalizarNumero(item?.precio_unitario ?? item?.precio, 0);
  const subtotalBase = normalizarNumero(
    item?.total_linea ?? item?.subtotal_sin_descuento,
    cantidad * precioUnitario
  );
  return {
    ...item,
    key: obtenerKeyItem(item, index),
    nombre: item?.nombre || `Producto ${item?.producto_id || ''}`,
    cantidad,
    precioUnitario,
    subtotalBase,
    detalles: Array.isArray(item?.detalles) ? item.detalles : [],
  };
};

const obtenerItemsDetalleVenta = () => {
  if (!estado.ventaActual) return [];
  const itemsAgrupados = Array.isArray(estado.ventaActual.items_agregados)
    ? estado.ventaActual.items_agregados
    : [];
  if (itemsAgrupados.length) return itemsAgrupados;
  return Array.isArray(estado.ventaActual.items) ? estado.ventaActual.items : [];
};

const renderDetalleItems = () => {
  if (!itemsContainer) return;
  itemsContainer.innerHTML = '';

  const items = obtenerItemsDetalleVenta();
  const tieneDetalleCompleto =
    estado.detalleCuentaCargado &&
    Array.isArray(estado.ventaActual?.items_agregados) &&
    estado.ventaActual.items_agregados.length > 0;

  itemsDetalleActual = items;

  if (!items.length) {
    itemsContainer.innerHTML = estado.cargandoDetalleCuenta
      ? '<p class="caja-empty">Cargando productos...</p>'
      : '<p class="caja-empty">No hay productos registrados.</p>';
    return;
  }

  const lista = document.createElement('ul');
  lista.className = 'caja-items-lista';

  if (!tieneDetalleCompleto) {
    items.forEach((item, index) => {
      const normalizado = normalizarItemCobro(item, index);
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="caja-item-line">
          <div class="caja-item-main">
            <div class="caja-item-nombre">${normalizado.nombre || 'Producto'}</div>
            <div class="caja-item-meta">${normalizado.cantidad} x ${formatCurrency(
              normalizado.precioUnitario
            )}</div>
          </div>
          <div class="caja-item-neto">${formatCurrency(normalizado.subtotalBase)}</div>
        </div>
      `;
      lista.appendChild(li);
    });

    itemsContainer.appendChild(lista);
    return;
  }

  items.forEach((item, itemIndex) => {
    const normalizado = normalizarItemCobro(item, itemIndex);
    const li = document.createElement('li');
    const key = normalizado.key;
    const cantidad = normalizado.cantidad;
    const precioLinea = normalizado.precioUnitario;
    const subtotal = normalizarNumero(item?.total_linea ?? item?.subtotal_sin_descuento, cantidad * precioLinea);
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
    const nombreItem = normalizado.nombre || `Producto ${item?.producto_id || ''}`;
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
            <div class="caja-item-meta">${cantidad} x ${formatCurrency(precioLinea)} = ${formatCurrency(
              subtotal
            )}</div>
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
            data-producto="${item?.producto_id}"
            data-precio="${item?.precio_unitario}"
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
};

const cargarDetalleCuenta = async () => {
  if (!estado.ventaActual) return;
  const cuentaId = Number(estado.ventaActual.cuenta_id || estado.ventaActual.id);
  if (!Number.isFinite(cuentaId) || cuentaId <= 0) return;
  if (estado.cargandoDetalleCuenta || estado.detalleCuentaCargado) return;

  estado.cargandoDetalleCuenta = true;
  if (itemsContainer && !itemsContainer.innerHTML) {
    itemsContainer.innerHTML = '<p class="caja-empty">Cargando productos...</p>';
  }

  try {
    const respuesta = await fetchAutorizado(`/api/cuentas/${cuentaId}/detalle`);
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data?.ok || !data.cuenta) {
      throw new Error(data?.error || 'No se pudo obtener el detalle de la cuenta.');
    }

    estado.ventaActual = {
      ...estado.ventaActual,
      ...data.cuenta,
    };
    estado.detalleCuentaCargado = true;
    renderDetalleItems();
    actualizarResumenCobro();
  } catch (error) {
    console.error('Error al cargar detalle de la cuenta:', error);
    mostrarMensajeCobro(
      error.message || 'No se pudo cargar el detalle de la cuenta. Intenta nuevamente.',
      'error'
    );
    renderDetalleItems();
  } finally {
    estado.cargandoDetalleCuenta = false;
  }
};

const mostrarDetalleVenta = () => {
  if (!estado.ventaActual) {
    if (cobroPlaceholder) {
      cobroPlaceholder.hidden = false;
      cobroPlaceholder.textContent = 'Crea una venta para ver el detalle y cobrar.';
    }
    if (cobroForm) cobroForm.hidden = true;
    limpiarFormularioCobro();
    return;
  }

  if (cobroPlaceholder) cobroPlaceholder.hidden = true;
  if (cobroForm) cobroForm.hidden = false;

  const pedidosCuenta = Array.isArray(estado.ventaActual.pedidos) ? estado.ventaActual.pedidos : [];
  const encabezado = pedidosCuenta[0];

  if (infoContainer) {
    const mesaCliente = [];
    if (estado.ventaActual.mesa) mesaCliente.push(estado.ventaActual.mesa);
    if (estado.ventaActual.cliente) mesaCliente.push(estado.ventaActual.cliente);
    infoContainer.innerHTML = `
      <div class="caja-detalle-linea">
        <span class="caja-detalle-etiqueta">Cuenta</span>
        <span>#${estado.ventaActual.cuenta_id}</span>
      </div>
      <div class="caja-detalle-linea">
        <span class="caja-detalle-etiqueta">Mesa / Cliente</span>
        <span>${mesaCliente.length ? mesaCliente.join(' - ') : 'Sin asignar'}</span>
      </div>
      <div class="caja-detalle-linea">
        <span class="caja-detalle-etiqueta">Creado</span>
        <span>${formatDateTime(encabezado?.fecha_creacion || estado.ventaActual.fecha_listo)}</span>
      </div>
    `;
  }

  renderDetalleItems();
  cargarDetalleCuenta();

  limpiarMensajeCobro();
  aplicarPropinaPreferida({ force: true });
  seleccionarTipoComprobantePermitido('B02');
  actualizarResumenCobro();
  resetPagosFormulario(calculo.total);
};

const limpiarVenta = () => {
  estado.ventaActiva = false;
  estado.ventaActual = null;
  estado.detalleCuentaCargado = false;
  estado.cargandoDetalleCuenta = false;
  limpiarDescuentosItems();
  itemsDetalleActual = [];
  estado.carrito.clear();
  if (campoMesa) campoMesa.value = '';
  if (notaInput) notaInput.value = '';
  actualizarCarritoUI();
  setVentaActiva(false);
  limpiarFormularioCobro();
  mostrarDetalleVenta();
};

const crearVenta = async () => {
  if (estado.cargando || estado.ventaActiva) return;
  limpiarMensajePedido();

  if (!validarPedido()) {
    return;
  }

  const payload = construirPayloadPedido();

  try {
    estado.cargando = true;
    if (botonCrearVenta) {
      botonCrearVenta.disabled = true;
      botonCrearVenta.classList.add('is-loading');
    }

    const respuesta = await fetchAutorizado('/api/pedidos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok || !data?.ok) {
      mostrarMensajePedido(data?.error || 'No se pudo procesar la venta.', 'error');
      return;
    }

    if (Array.isArray(data?.advertencias) && data.advertencias.length) {
      mostrarMensajePedido(data.advertencias.join(' '), 'warning');
    }

    estado.ventaActiva = true;
    estado.ventaActual = data.pedido || null;
    estado.detalleCuentaCargado = false;
    estado.cargandoDetalleCuenta = false;
    limpiarDescuentosItems();
    itemsDetalleActual = [];
    setVentaActiva(true);
    mostrarDetalleVenta();
    notificarActualizacionGlobal('stock-actualizado', { tipo: 'creado', pedidoId: data.pedido?.id });
    mostrarMensajePedido('Venta creada. Completa el cobro en el panel derecho.', 'info');
    await cargarProductos(false);
  } catch (error) {
    console.error('Error al crear la venta:', error);
    mostrarMensajePedido('Ocurrio un error al crear la venta.', 'error');
  } finally {
    estado.cargando = false;
    if (botonCrearVenta) {
      botonCrearVenta.classList.remove('is-loading');
      botonCrearVenta.disabled = estado.ventaActiva;
    }
  }
};

const cancelarVenta = async () => {
  if (!estado.ventaActual || estado.cargando) return;
  limpiarMensajePedido();
  try {
    estado.cargando = true;
    if (botonCancelarVenta) botonCancelarVenta.disabled = true;
    const respuesta = await fetchAutorizado(`/api/pedidos/${estado.ventaActual.id}/cancelar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(data?.error || 'No se pudo cancelar la venta.');
    }
    notificarActualizacionGlobal('stock-actualizado', { tipo: 'cancelado', pedidoId: estado.ventaActual.id });
    limpiarVenta();
    await cargarProductos(false);
    mostrarMensajePedido('Venta cancelada correctamente.', 'info');
  } catch (error) {
    console.error('Error al cancelar la venta:', error);
    mostrarMensajePedido(error.message || 'No se pudo cancelar la venta.', 'error');
  } finally {
    estado.cargando = false;
    if (botonCancelarVenta) botonCancelarVenta.disabled = false;
  }
};

const confirmarPago = async () => {
  if (!estado.ventaActual) {
    mostrarMensajeCobro('Crea una venta antes de cobrar.', 'error');
    return;
  }

  actualizarResumenCobro();
  const pagos = recalcularCambio();

  const total = calculo.total;
  const toleranciaMinima = 0.05;
  const toleranciaExcesoNoEfectivo = 5;

  if (pagos.metodo === 'tarjeta') {
    if (pagos.tarjeta < total - toleranciaMinima) {
      mostrarMensajeCobro('El monto en tarjeta no cubre el total a cobrar.', 'error');
      return;
    }
  } else if (pagos.metodo === 'transferencia') {
    if (pagos.transferencia < total - toleranciaMinima) {
      mostrarMensajeCobro('El monto en transferencia no cubre el total a cobrar.', 'error');
      return;
    }
  } else if (pagos.metodo === 'combinado') {
    const totalPagado = pagos.efectivoEntregado + pagos.tarjeta + pagos.transferencia;
    if (totalPagado < total - toleranciaMinima) {
      mostrarMensajeCobro('La suma de los metodos de pago no cubre el total.', 'error');
      return;
    }
    if (totalPagado > total + toleranciaExcesoNoEfectivo) {
      mostrarMensajeCobro('Los montos ingresados exceden el total permitido.', 'error');
      return;
    }
  }

  try {
    mostrarMensajeCobro('Procesando pago...', 'info');
    if (botonCobrar) {
      botonCobrar.disabled = true;
      botonCobrar.classList.add('is-loading');
    }

    const tipoComprobante = normalizarTipoComprobante(selectTipoComprobante?.value || '');
    const sinComprobante = esSinComprobante(tipoComprobante);
    const ncfManual = sinComprobante ? null : inputNcfManual?.value;
    const usuario = obtenerUsuarioActual();
    const detalleDescuentosPayload = expandirDescuentosPorDetalle();

    const respuesta = await fetchAutorizado(`/api/cuentas/${estado.ventaActual.cuenta_id}/cerrar`, {
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
        usuario_rol: usuario?.rol,
        origen_caja: 'mostrador',
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
      throw new Error(data.error || 'No se pudo cerrar la venta.');
    }

    mostrarMensajeCobro('Pago registrado correctamente.', 'info');
    const facturaGenerada = data.factura;
    if (facturaGenerada?.id) {
      const facturaId = Number(facturaGenerada.id);
      if (Number.isFinite(facturaId)) {
        window.open(`/factura.html?id=${facturaId}`, '_blank');
      }
    } else if (estado.ventaActual?.id) {
      window.open(`/factura.html?id=${estado.ventaActual.id}`, '_blank');
    }

    notificarActualizacionGlobal('cuenta-cobrada', {
      cuentaId: estado.ventaActual.cuenta_id,
    });
    limpiarVenta();
    await cargarProductos(false);
    mostrarMensajePedido('Pago registrado correctamente.', 'info');
  } catch (error) {
    console.error('Error al cerrar la venta:', error);
    mostrarMensajeCobro(error.message || 'No se pudo confirmar el pago.', 'error');
    if (botonCobrar) {
      botonCobrar.disabled = false;
      botonCobrar.classList.remove('is-loading');
    }
  }
};

const cargarProductos = async (mostrarCarga = true) => {
  try {
    if (mostrarCarga && listaProductos) {
      listaProductos.innerHTML = '<div class="kanm-empty-message">Cargando menu...</div>';
    }

    const respuesta = await fetchAutorizado('/api/productos');
    if (!respuesta.ok) {
      throw new Error('No se pudieron obtener los productos');
    }
    const data = await respuesta.json();
    estado.productos = Array.isArray(data) ? data : [];

    actualizarCarritoUI();
    renderProductos();
  } catch (error) {
    console.error('Error al cargar productos:', error);
    if (mostrarCarga && listaProductos) {
      listaProductos.innerHTML = '';
      const errorMensaje = document.createElement('div');
      errorMensaje.className = 'kanm-empty-message';
      errorMensaje.textContent = 'Error al cargar los productos. Intenta nuevamente mas tarde.';
      listaProductos.appendChild(errorMensaje);
    }
  }
};

const cargarImpuesto = async () => {
  try {
    const respuesta = await fetchAutorizado('/api/configuracion/impuesto');
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener la configuracion de impuesto');
    }
    const data = await respuesta.json();
    if (data.ok) {
      const valor = Number(data.valor);
      const productosConImpuesto =
        data.productos_con_impuesto === true || Number(data.productos_con_impuesto) === 1;
      const impuestoIncluido = Number(data.impuesto_incluido_valor);
      estado.impuestoPorcentaje = Number.isNaN(valor) ? 0 : valor;
      estado.productosConImpuesto = productosConImpuesto;
      estado.impuestoIncluidoPorcentaje = Number.isNaN(impuestoIncluido) ? 0 : impuestoIncluido;
    }
  } catch (error) {
    console.error('Error al obtener impuesto:', error);
    estado.impuestoPorcentaje = 0;
    estado.productosConImpuesto = false;
    estado.impuestoIncluidoPorcentaje = 0;
  } finally {
    actualizarResumenCarrito();
  }
};

const inicializarEventos = () => {
  buscadorInput?.addEventListener('input', (event) => {
    estado.filtro = event.target.value.trim();
    renderProductos();
  });

  botonLimpiarCarrito?.addEventListener('click', () => {
    if (estado.ventaActiva) {
      mostrarMensajePedido('Finaliza o cancela la venta actual antes de limpiar.', 'warning');
      return;
    }
    estado.carrito.clear();
    actualizarCarritoUI();
  });

  botonCrearVenta?.addEventListener('click', crearVenta);
  botonCancelarVenta?.addEventListener('click', cancelarVenta);

  botonRecalcular?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!estado.ventaActual) {
      mostrarMensajeCobro('Crea una venta antes de recalcular.', 'error');
      return;
    }
    limpiarMensajeCobro();
    actualizarResumenCobro();
  });

  cobroForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    confirmarPago();
  });

  inputDescuento?.addEventListener('change', () => {
    if (!estado.ventaActual) return;
    limpiarMensajeCobro();
    actualizarResumenCobro();
  });

  inputPropina?.addEventListener('change', () => {
    if (!estado.ventaActual) return;
    if (inputPropina) {
      inputPropina.dataset.dirty = 'true';
      guardarPropinaPreferida(inputPropina.value);
    }
    limpiarMensajeCobro();
    actualizarResumenCobro();
  });

  selectTipoComprobante?.addEventListener('change', (event) => {
    actualizarEstadoNcfManual(event.target.value);
  });

  selectMetodoPago?.addEventListener('change', toggleCamposPago);
  inputPagoEfectivoEntregado?.addEventListener('input', recalcularCambio);
  inputPagoTarjeta?.addEventListener('input', recalcularCambio);
  inputPagoTransferencia?.addEventListener('input', recalcularCambio);

  itemsContainer?.addEventListener('change', (event) => {
    const toggle = event.target.closest('.caja-item-descuento-toggle');
    if (toggle) {
      const key = toggle.dataset.itemKey;
      const panel = itemsContainer.querySelector(`[data-panel-key="${key}"]`);
      if (panel) panel.hidden = !toggle.checked;
      if (!toggle.checked) {
        eliminarDescuentoItem(key);
        actualizarResumenCobro();
        renderDetalleItems();
      } else {
        limpiarMensajeCobro();
      }
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
    const item = itemsDetalleActual?.[itemIndex];
    let cantidad = Math.max(Number(cantidadInput?.value) || 0, 0);
    cantidad = Math.min(cantidad, cantidadMax);

    if (!cantidad || cantidad <= 0) {
      mostrarMensajeCobro('Ingresa una cantidad valida para aplicar el descuento.', 'error');
      return;
    }

    const tipo = (tipoSelect?.value || 'porcentaje') === 'monto' ? 'monto' : 'porcentaje';
    const valor = Math.max(Number(valorInput?.value) || 0, 0);

    if (!valor || valor <= 0) {
      mostrarMensajeCobro('Ingresa un valor de descuento mayor a 0.', 'error');
      return;
    }

    const maximoPermitido = precioUnitario * cantidad;
    let montoCalculado =
      tipo === 'porcentaje' ? precioUnitario * cantidad * (valor / 100) : valor * cantidad;

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

    limpiarMensajeCobro();
    actualizarResumenCobro();
    renderDetalleItems();
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
};

window.addEventListener('DOMContentLoaded', async () => {
  const usuario = obtenerUsuarioActual();
  if (identidadMostrador && usuario?.nombre) {
    identidadMostrador.textContent = `Mostrador: ${usuario.nombre}`;
  }

  aplicarPropinaPreferida({ force: true });
  await Promise.all([cargarProductos(), cargarImpuesto(), cargarConfigSecuencias()]);
  actualizarCarritoUI();
  inicializarEventos();
  mostrarDetalleVenta();
});
