const campoMesa = document.getElementById('campo-mesa');
const selectServicio = document.getElementById('tipo-servicio');
const notaInput = document.getElementById('nota-pedido');
const listaProductos = document.getElementById('lista-productos');
const carritoContainer = document.getElementById('carrito');
const botonEnviar = document.getElementById('boton-enviar');
const botonEnviarCaja = document.getElementById('boton-enviar-caja');
const botonCancelarEdicion = document.getElementById('boton-cancelar-edicion');
const mensajeMesera = document.getElementById('mesera-mensaje');
const buscadorInput = document.getElementById('buscador-productos');
const contadorProductos = document.getElementById('contador-productos');
const resumenSubtotal = document.getElementById('resumen-subtotal');
const resumenImpuesto = document.getElementById('resumen-impuesto');
const resumenTotal = document.getElementById('resumen-total');
const identidadMesera = document.getElementById('mesera-identidad');
const tabsMesera = document.querySelectorAll('.mesera-tab-btn');
const panelesMesera = document.querySelectorAll('.mesera-tab-panel');
const footerMesera = document.getElementById('mesera-footer');
const mensajesPorEstado = {
  pendiente: document.getElementById('mesera-pendientes-mensaje'),
  preparando: document.getElementById('mesera-preparando-mensaje'),
  listo: document.getElementById('mesera-listos-mensaje'),
};
const listasPorEstado = {
  pendiente: document.getElementById('lista-pedidos-pendientes'),
  preparando: document.getElementById('lista-pedidos-preparando'),
  listo: document.getElementById('lista-pedidos-listos'),
};
const btnScrollTop = document.getElementById('mesera-scroll-top');
const btnScrollBottom = document.getElementById('mesera-scroll-bottom');

const REFRESCO_PEDIDOS_MS = 20000;
let temporizadorPedidos = null;

const estado = {
  productos: [],
  filtro: '',
  carrito: new Map(),
  cargando: false,
  impuestoPorcentaje: 0,
  pedidoEditandoId: null,
  cuentaReferenciaId: null,
  pedidosActivos: [],
  modoServicio: 'en_local',
};

const agruparCuentas = (...listas) => {
  const mapa = new Map();

  listas.forEach((lista = []) => {
    lista.forEach((cuenta) => {
      const cuentaId = cuenta.cuenta_id || cuenta.id;
      const existente = mapa.get(cuentaId) || {
        ...cuenta,
        cuenta_id: cuentaId,
        pedidos: [],
      };

      (cuenta.pedidos || []).forEach((pedido) => {
        existente.pedidos.push({
          ...pedido,
          cuenta_id: cuentaId,
          mesa: pedido.mesa ?? cuenta.mesa,
          cliente: pedido.cliente ?? cuenta.cliente,
          modo_servicio: pedido.modo_servicio ?? cuenta.modo_servicio,
          estado_cuenta: cuenta.estado_cuenta ?? cuenta.estado,
        });
      });

      mapa.set(cuentaId, existente);
    });
  });

  return Array.from(mapa.values());
};

const formatCurrency = (valor) => {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(numero);
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
  if (!fecha) return '—';
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: true,
    timeZone: 'America/Santo_Domingo',
  }).format(fecha);
};

const SYNC_STORAGE_KEY = 'kanm:last-update';

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
    console.warn('No fue posible notificar la actualización global:', error);
  }
};

const limpiarMensaje = () => {
  if (mensajeMesera) {
    mensajeMesera.textContent = '';
    mensajeMesera.dataset.type = '';
  }
};

const mostrarMensaje = (texto, tipo = 'info') => {
  if (mensajeMesera) {
    mensajeMesera.textContent = texto;
    mensajeMesera.dataset.type = texto ? tipo : '';
  }
};

const mostrarMensajeTab = (elemento, texto, tipo = 'info') => {
  if (!elemento) return;
  elemento.textContent = texto;
  elemento.dataset.type = texto ? tipo : '';
};

const obtenerUsuarioActual = () => {
  try {
    if (typeof getStoredUser === 'function') {
      return getStoredUser();
    }
  } catch (error) {
    console.warn('No fue posible leer el usuario en sesión:', error);
  }
  return null;
};

const authApi = window.kanmAuth;

const obtenerAuthHeadersMesera = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener encabezados de autenticación:', error);
    return {};
  }
};

const fetchAutorizadoMesera = async (url, options = {}) => {
  const headers = { ...obtenerAuthHeadersMesera(), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    authApi?.handleUnauthorized?.();
  }
  return response;
};

const aplicarModulosMesera = () => {
  const modulos = window.APP_MODULOS || {
    admin: true,
    mesera: true,
    cocina: true,
    bar: false,
    caja: true,
    historialCocina: true,
  };
  const btnEnviarCocina = document.querySelector('[data-accion="enviar-cocina"]') || botonEnviar;
  const sinPreparacion = modulos.cocina === false && modulos.bar === false;
  if (btnEnviarCocina && sinPreparacion) {
    btnEnviarCocina.style.display = 'none';
  }
};

const activarTab = (tabId = 'tomar') => {
  tabsMesera.forEach((boton) => {
    const activo = boton.dataset.tab === tabId;
    boton.classList.toggle('active', activo);
    boton.setAttribute('aria-pressed', activo);
  });

  panelesMesera.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tab === tabId);
  });

  if (footerMesera) {
    footerMesera.style.display = tabId === 'tomar' ? '' : 'none';
  }
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

const calcularResumen = () => {
  let subtotal = 0;
  estado.carrito.forEach((item) => {
    const producto = estado.productos.find((p) => p.id === item.producto_id);
    if (!producto) return;
    const precio = Number(producto.precio) || 0;
    subtotal += precio * item.cantidad;
  });
  const impuesto = subtotal * (estado.impuestoPorcentaje / 100);
  const total = subtotal + impuesto;
  return { subtotal, impuesto, total };
};

const actualizarResumenUI = () => {
  const { subtotal, impuesto, total } = calcularResumen();
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
    vacio.textContent = 'Aún no has agregado productos al pedido.';
    carritoContainer.appendChild(vacio);
    actualizarResumenUI();
    return;
  }

  const fragment = document.createDocumentFragment();

  estado.carrito.forEach((item, productoId) => {
    const producto = estado.productos.find((p) => p.id === productoId);
    if (!producto) {
      return;
    }

    const stockDisponible = Number(producto.stock) || 0;
    const precioUnitario = Number(producto.precio) || 0;
    const subtotalLinea = precioUnitario * item.cantidad;

    const card = document.createElement('article');
    card.className = 'carrito-item';

    const info = document.createElement('div');
    info.innerHTML = `
      <h3>${producto.nombre}</h3>
      <p class="producto-meta">Precio: ${formatCurrency(precioUnitario)} · Stock disponible: ${stockDisponible}</p>
      <p class="producto-meta subtotal-linea">Subtotal: ${formatCurrency(subtotalLinea)}</p>
    `;

    const controles = document.createElement('div');
    controles.className = 'carrito-controles';

    const botonMenos = crearBotonCantidad('−', () => ajustarCantidad(producto.id, item.cantidad - 1));
    const botonMas = crearBotonCantidad(
      '+',
      () => ajustarCantidad(producto.id, item.cantidad + 1),
      item.cantidad >= stockDisponible
    );

    const inputCantidad = document.createElement('input');
    inputCantidad.type = 'number';
    inputCantidad.min = '1';
    inputCantidad.value = item.cantidad;
    inputCantidad.addEventListener('change', (event) => {
      const valor = Number(event.target.value);
      ajustarCantidad(producto.id, valor);
    });

    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'kanm-button ghost';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.addEventListener('click', () => eliminarDelCarrito(producto.id));

    controles.appendChild(botonMenos);
    controles.appendChild(inputCantidad);
    controles.appendChild(botonMas);
    controles.appendChild(botonEliminar);

    card.appendChild(info);
    card.appendChild(controles);
    fragment.appendChild(card);
  });

  carritoContainer.appendChild(fragment);
  actualizarResumenUI();
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
      ? 'No hay productos que coincidan con tu búsqueda.'
      : 'No hay productos registrados.';
    listaProductos.appendChild(vacio);
    return;
  }

  const fragment = document.createDocumentFragment();

  productosFiltrados.forEach((producto) => {
    const card = document.createElement('article');
    card.className = 'producto-card';

    const contenido = document.createElement('div');
    const stockDisponible = Number(producto.stock) || 0;

    contenido.innerHTML = `
      <h3>${producto.nombre}</h3>
      <p class="producto-meta">
        Precio: ${formatCurrency(producto.precio)} · Stock: ${stockDisponible} · ${
          producto.categoria_nombre ? `Categoría: ${producto.categoria_nombre}` : 'Sin categoría'
        }
      </p>
    `;

    const acciones = document.createElement('div');
    acciones.className = 'producto-acciones';

    const botonAgregar = document.createElement('button');
    botonAgregar.type = 'button';
    botonAgregar.className = 'kanm-button';
    botonAgregar.textContent = stockDisponible > 0 ? 'Agregar' : 'Sin stock';
    botonAgregar.disabled = !producto.activo || stockDisponible <= 0;
    botonAgregar.addEventListener('click', () => agregarAlCarrito(producto));

    acciones.appendChild(botonAgregar);

    card.appendChild(contenido);
    card.appendChild(acciones);
    fragment.appendChild(card);
  });

  listaProductos.appendChild(fragment);
};

const agregarAlCarrito = (producto) => {
  limpiarMensaje();

  if (!producto || !producto.id) {
    mostrarMensaje('Producto inválido.', 'error');
    return;
  }

  const stockDisponible = Number(producto.stock) || 0;
  if (stockDisponible <= 0) {
    mostrarMensaje('Este producto no tiene stock disponible.', 'error');
    return;
  }

  const itemActual = estado.carrito.get(producto.id) || { cantidad: 0 };
  const nuevaCantidad = itemActual.cantidad + 1;

  if (nuevaCantidad > stockDisponible) {
    mostrarMensaje('No puedes agregar más unidades que el stock disponible.', 'error');
    return;
  }

  estado.carrito.set(producto.id, {
    producto_id: producto.id,
    cantidad: nuevaCantidad,
  });
  actualizarCarritoUI();
};

const eliminarDelCarrito = (productoId) => {
  estado.carrito.delete(productoId);
  actualizarCarritoUI();
};

const ajustarCantidad = (productoId, cantidadDeseada) => {
  limpiarMensaje();

  if (!estado.carrito.has(productoId)) {
    return false;
  }

  const cantidad = Number(cantidadDeseada);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    mostrarMensaje('La cantidad debe ser mayor a cero.', 'error');
    actualizarCarritoUI();
    return false;
  }

  const producto = estado.productos.find((p) => p.id === productoId);
  if (!producto) {
    mostrarMensaje('No se pudo encontrar el producto seleccionado.', 'error');
    actualizarCarritoUI();
    return false;
  }

  const stockDisponible = Number(producto.stock) || 0;
  if (cantidad > stockDisponible) {
    mostrarMensaje('No puedes solicitar más unidades que el stock disponible.', 'error');
    actualizarCarritoUI();
    return false;
  }

  estado.carrito.set(productoId, {
    producto_id: productoId,
    cantidad,
  });
  actualizarCarritoUI();
  return true;
};

const obtenerPayloadPedido = (destino = 'cocina') => {
  const mesa = campoMesa?.value.trim();
  const items = Array.from(estado.carrito.values());
  const modoServicioSeleccionado = selectServicio?.value || 'en_local';
  const nota = notaInput?.value?.trim() || '';

  return {
    mesa: mesa || null,
    cliente: null,
    items,
    modo_servicio: modoServicioSeleccionado,
    destino,
    cuenta_id: estado.cuentaReferenciaId || null,
    nota,
  };
};

const validarPedido = () => {
  if (notaInput && notaInput.value.length > 200) {
    mostrarMensaje('La nota no puede superar 200 caracteres.', 'error');
    return false;
  }

  if (estado.carrito.size === 0) {
    mostrarMensaje('Agrega al menos un producto para enviar el pedido.', 'error');
    return false;
  }

  for (const item of estado.carrito.values()) {
    if (!item || !item.producto_id) {
      mostrarMensaje('Hay un producto inválido en el carrito.', 'error');
      return false;
    }

    if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
      mostrarMensaje('Todas las cantidades deben ser mayores a cero.', 'error');
      return false;
    }

    const producto = estado.productos.find((p) => p.id === item.producto_id);
    const stockDisponible = Number(producto?.stock) || 0;
    if (item.cantidad > stockDisponible) {
      mostrarMensaje('Hay productos cuya cantidad supera el stock disponible.', 'error');
      return false;
    }
  }

  return true;
};

const cancelarEdicion = () => {
  estado.pedidoEditandoId = null;
  estado.cuentaReferenciaId = null;
  estado.carrito.clear();
  if (botonEnviar) botonEnviar.textContent = 'Enviar a preparar orden';
  if (botonCancelarEdicion) botonCancelarEdicion.hidden = true;
  if (selectServicio) selectServicio.value = 'en_local';
  if (notaInput) notaInput.value = '';
  actualizarCarritoUI();
  mostrarMensaje('Edición cancelada.', 'info');
};

const iniciarEdicion = (pedido) => {
  limpiarMensaje();
  estado.carrito.clear();
  estado.pedidoEditandoId = pedido.id;
  estado.cuentaReferenciaId = pedido.cuenta_id || pedido.id;
  if (campoMesa) {
    campoMesa.value = pedido.mesa || '';
  }
  if (selectServicio) {
    selectServicio.value = pedido.modo_servicio || 'en_local';
  }
  if (notaInput) {
    notaInput.value = '';
  }
  if (botonEnviar) botonEnviar.textContent = 'Agregar nueva orden a la cuenta';
  if (botonCancelarEdicion) botonCancelarEdicion.hidden = false;

  mostrarMensaje(
    `Agrega una nueva orden para la cuenta #${estado.cuentaReferenciaId} (pedido #${pedido.id}).`,
    'info'
  );
  actualizarCarritoUI();
};

const cancelarPedido = async (pedidoId) => {
  try {
    if (!window.confirm('¿Quieres cancelar este pedido pendiente?')) {
      return;
    }

    mostrarMensajeTab(mensajesPorEstado.pendiente, 'Cancelando pedido...', 'info');
    const respuesta = await fetchAutorizadoMesera(`/api/pedidos/${pedidoId}/cancelar`, {
      method: 'PUT',
    });

    const data = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      throw new Error(data.error || 'No se pudo cancelar el pedido.');
    }

    if (estado.pedidoEditandoId === pedidoId) {
      cancelarEdicion();
    }

    mostrarMensaje('Pedido cancelado correctamente.', 'info');
    notificarActualizacionGlobal('stock-actualizado', { tipo: 'cancelado', pedidoId });
    await Promise.all([cargarProductos(false), cargarPedidosActivos(false)]);
  } catch (error) {
    console.error('Error al cancelar pedido:', error);
    mostrarMensajeTab(
      mensajesPorEstado.pendiente,
      error.message || 'No se pudo cancelar el pedido.',
      'error'
    );
  }
};

const crearCardCuenta = (cuenta) => {
  const card = document.createElement('article');
  card.className = 'kanm-card pedido-activo-card';

  const header = document.createElement('div');
  header.className = 'pedido-activo-header';

  const info = document.createElement('div');
  const mesaCliente = [];
  if (cuenta.mesa) mesaCliente.push(cuenta.mesa);
  if (cuenta.cliente) mesaCliente.push(cuenta.cliente);

  const servicioTexto = cuenta.modo_servicio === 'para_llevar' ? 'Para llevar' : 'Consumir en el negocio';
  const cuentaTexto = `Cuenta #${cuenta.cuenta_id}`;
  info.innerHTML = `
      <h3>${cuentaTexto}</h3>
      <p class="kanm-subtitle">${mesaCliente.length ? mesaCliente.join(' · ') : 'Sin mesa asignada'}</p>
      <p class="pedido-meta">Servicio: ${servicioTexto}</p>
    `;

  const badge = document.createElement('span');
  badge.className = `kanm-badge estado-${cuenta.estado_cuenta || cuenta.estado || 'pendiente'}`;
  const textoEstado = (cuenta.estado_cuenta || cuenta.estado || 'pendiente')
    .charAt(0)
    .toUpperCase() + (cuenta.estado_cuenta || cuenta.estado || 'pendiente').slice(1);
  badge.textContent = textoEstado;

  header.appendChild(info);
  header.appendChild(badge);

  const pedidosContainer = document.createElement('div');
  pedidosContainer.className = 'cuenta-pedidos';

  const pedidosOrdenados = (cuenta.pedidos || []).slice().sort((a, b) => {
    const fechaA = new Date(a.fecha_creacion || 0).getTime();
    const fechaB = new Date(b.fecha_creacion || 0).getTime();
    return fechaA - fechaB;
  });

  pedidosOrdenados.forEach((pedido, index) => {
    const pedidoWrapper = document.createElement('div');
    pedidoWrapper.className = 'pedido-subcard';

    const tituloPedido = document.createElement('div');
    tituloPedido.className = 'pedido-subcard-header';

    const badgePedido = document.createElement('span');
    badgePedido.className = 'kanm-badge ghost';
    badgePedido.textContent = `Pedido #${index + 1}`;

    const badgeEstado = document.createElement('span');
    badgeEstado.className = `kanm-badge estado-${pedido.estado}`;
    badgeEstado.textContent = pedido.estado?.charAt(0).toUpperCase() + pedido.estado?.slice(1);

    tituloPedido.appendChild(badgePedido);
    tituloPedido.appendChild(badgeEstado);

    const meta = document.createElement('p');
    const salida = pedido.fecha_listo || pedido.fecha_cierre || pedido.fecha_cancelacion;
    meta.className = 'pedido-meta';
    meta.textContent = `Entrada: ${formatDateTime(pedido.fecha_creacion)} · Salida: ${formatDateTime(salida)}`;

    if (pedido.nota) {
      const nota = document.createElement('div');
      nota.className = 'pedido-note';
      nota.textContent = `Nota: ${pedido.nota}`;
      pedidoWrapper.appendChild(nota);
    }

    const lista = document.createElement('ul');
    lista.className = 'kanm-pedido-items';

    if (pedido.items && pedido.items.length) {
      pedido.items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.nombre || `Producto ${item.producto_id}`} × ${item.cantidad}`;
        lista.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'Sin productos registrados';
      lista.appendChild(li);
    }

    const accionesPedido = document.createElement('div');
    accionesPedido.className = 'pedido-activo-acciones';

    if (pedido.estado === 'pendiente') {
      const botonCancelarPedido = document.createElement('button');
      botonCancelarPedido.type = 'button';
      botonCancelarPedido.className = 'kanm-button ghost';
      botonCancelarPedido.textContent = 'Cancelar pedido';
      botonCancelarPedido.addEventListener('click', () => cancelarPedido(pedido.id));
      accionesPedido.appendChild(botonCancelarPedido);
    }

    pedidoWrapper.appendChild(tituloPedido);
    pedidoWrapper.appendChild(meta);
    pedidoWrapper.appendChild(lista);
    if (accionesPedido.children.length) {
      pedidoWrapper.appendChild(accionesPedido);
    }

    pedidosContainer.appendChild(pedidoWrapper);
  });

  const accionesCuenta = document.createElement('div');
  accionesCuenta.className = 'pedido-activo-acciones cuenta-acciones';

  const botonEditar = document.createElement('button');
  botonEditar.type = 'button';
  botonEditar.className = 'kanm-button secondary';
  botonEditar.textContent = 'Agregar nueva orden a la cuenta';
  botonEditar.addEventListener('click', () => {
    iniciarEdicion({
      id: cuenta.cuenta_id,
      cuenta_id: cuenta.cuenta_id,
      mesa: cuenta.mesa,
      cliente: cuenta.cliente,
      modo_servicio: cuenta.modo_servicio,
    });
    activarTab('tomar');
  });

  accionesCuenta.appendChild(botonEditar);

  card.appendChild(header);
  card.appendChild(pedidosContainer);
  card.appendChild(accionesCuenta);

  return card;
};

const renderPedidosPorEstado = (estadosFiltro, contenedor, mensajeEl, mensajeVacio) => {
  if (!contenedor) return;

  contenedor.innerHTML = '';
  const cuentasFiltradas = estado.pedidosActivos
    .map((cuenta) => ({
      ...cuenta,
      pedidos: (cuenta.pedidos || []).filter((pedido) => estadosFiltro.includes(pedido.estado)),
    }))
    .filter((cuenta) => cuenta.pedidos?.length);

  if (!cuentasFiltradas.length) {
    mostrarMensajeTab(mensajeEl, mensajeVacio, 'info');
    return;
  }

  mostrarMensajeTab(mensajeEl, '');
  const fragment = document.createDocumentFragment();

  const cuentasOrdenadas = cuentasFiltradas.slice().sort((a, b) => {
    const primeroA = (a.pedidos?.[0]?.fecha_creacion && new Date(a.pedidos[0].fecha_creacion)) || 0;
    const primeroB = (b.pedidos?.[0]?.fecha_creacion && new Date(b.pedidos[0].fecha_creacion)) || 0;
    return primeroA - primeroB;
  });

  cuentasOrdenadas.forEach((cuenta) => {
    fragment.appendChild(crearCardCuenta(cuenta));
  });

  contenedor.appendChild(fragment);
};


const cargarPedidosActivos = async (mostrarCarga = true) => {
  if (mostrarCarga) {
    mostrarMensajeTab(mensajesPorEstado.pendiente, 'Cargando pedidos en curso...', 'info');
  }

  try {
    const [pendientesResp, preparandoResp, listosResp] = await Promise.all([
      fetchAutorizadoMesera('/api/pedidos?estado=pendiente'),
      fetchAutorizadoMesera('/api/pedidos?estado=preparando'),
      fetchAutorizadoMesera('/api/pedidos?estado=listo'),
    ]);

    if (!pendientesResp.ok || !preparandoResp.ok || !listosResp.ok) {
      throw new Error('No se pudieron obtener los pedidos activos.');
    }

    const agrupadosPendientes = await pendientesResp.json();
    const agrupadosPreparando = await preparandoResp.json();
    const agrupadosListos = await listosResp.json();

    const cuentasAgrupadas = agruparCuentas(
      agrupadosPendientes,
      agrupadosPreparando,
      agrupadosListos
    );

    const pedidosParaDetalle = cuentasAgrupadas.flatMap((cuenta) => cuenta.pedidos || []);

    const detallesPorId = new Map(
      await Promise.all(
        pedidosParaDetalle.map(async (pedido) => {
          try {
            const detalleResp = await fetchAutorizadoMesera(`/api/pedidos/${pedido.id}`);
            if (!detalleResp.ok) throw new Error();
            const detalle = await detalleResp.json();
            return [pedido.id, detalle.items || []];
          } catch (error) {
            console.error(`Error al obtener detalle del pedido ${pedido.id}:`, error);
            return [pedido.id, []];
          }
        })
      )
    );

    cuentasAgrupadas.forEach((cuenta) => {
      const pedidosOrdenados = (cuenta.pedidos || []).slice().sort((a, b) => {
        const fechaA = new Date(a.fecha_creacion || 0).getTime();
        const fechaB = new Date(b.fecha_creacion || 0).getTime();
        return fechaA - fechaB;
      });

      cuenta.pedidos = pedidosOrdenados.map((pedido) => ({
        ...pedido,
        items: detallesPorId.get(pedido.id) || [],
      }));
    });

    estado.pedidosActivos = cuentasAgrupadas;
    renderPedidosPorEstado(['pendiente'], listasPorEstado.pendiente, mensajesPorEstado.pendiente, 'No hay pedidos pendientes.');
    renderPedidosPorEstado(
      ['preparando'],
      listasPorEstado.preparando,
      mensajesPorEstado.preparando,
      'No hay pedidos en preparación.'
    );
    renderPedidosPorEstado(['listo'], listasPorEstado.listo, mensajesPorEstado.listo, 'No hay pedidos listos.');
  } catch (error) {
    console.error('Error al cargar pedidos activos:', error);
    ['pendiente', 'preparando', 'listo'].forEach((clave) => {
      mostrarMensajeTab(mensajesPorEstado[clave], 'Error al cargar los pedidos en curso.', 'error');
      const cont = listasPorEstado[clave];
      if (cont) cont.innerHTML = '';
    });
    estado.pedidosActivos = [];
  }
};

const iniciarRefrescoPedidos = () => {
  detenerRefrescoPedidos();
  temporizadorPedidos = setInterval(() => {
    Promise.all([cargarPedidosActivos(false), cargarProductos(false)]).catch(() => {});
  }, REFRESCO_PEDIDOS_MS);
};

const detenerRefrescoPedidos = () => {
  if (temporizadorPedidos) {
    clearInterval(temporizadorPedidos);
    temporizadorPedidos = null;
  }
};

const scrollSuave = (y) => {
  window.scrollTo({ top: y, behavior: 'smooth' });
};

const scrollArriba = () => scrollSuave(0);

const scrollAbajo = () => {
  const carrito = document.getElementById('carrito');
  const footer = document.getElementById('mesera-footer');
  const destino = carrito || footer || document.body;
  const rect = destino.getBoundingClientRect();
  const y = window.scrollY + rect.top - 10;
  scrollSuave(y);
};

const enviarPedido = async (destino = 'cocina') => {
  if (estado.cargando) return;

  limpiarMensaje();

  if (!validarPedido()) {
    return;
  }

  const payload = obtenerPayloadPedido(destino);
  const esEdicion = Boolean(estado.pedidoEditandoId);
  const url = '/api/pedidos';
  const metodo = 'POST';
  const botonActivo = destino === 'caja' ? botonEnviarCaja : botonEnviar;

  try {
    estado.cargando = true;
    [botonEnviar, botonEnviarCaja]
      .filter(Boolean)
      .forEach((btn) => {
        btn.disabled = true;
        if (btn === botonActivo) {
          btn.classList.add('is-loading');
        }
      });

    const respuesta = await fetchAutorizadoMesera(url, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      const mensaje = data?.error || 'No se pudo procesar el pedido. Intenta nuevamente.';
      mostrarMensaje(mensaje, 'error');
      return;
    }

    const mensajeExito = esEdicion
      ? 'Nueva orden agregada a la cuenta correctamente.'
      : destino === 'caja'
        ? 'Pedido enviado a caja correctamente.'
        : 'Pedido enviado a preparacion correctamente.';
    mostrarMensaje(mensajeExito, 'info');
    notificarActualizacionGlobal('stock-actualizado', { tipo: esEdicion ? 'actualizado' : 'creado' });
    estado.carrito.clear();
    if (notaInput) notaInput.value = '';
    actualizarCarritoUI();
    if (esEdicion) {
      cancelarEdicion();
    }
    await Promise.all([cargarProductos(false), cargarPedidosActivos(false)]);
  } catch (error) {
    console.error('Error al enviar el pedido:', error);
    mostrarMensaje('Ocurrió un error al enviar el pedido. Intenta más tarde.', 'error');
  } finally {
    estado.cargando = false;
    [botonEnviar, botonEnviarCaja]
      .filter(Boolean)
      .forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove('is-loading');
      });
  }
};

const cargarProductos = async (mostrarCarga = true) => {
  try {
    if (mostrarCarga && listaProductos) {
      listaProductos.innerHTML = '<div class="kanm-empty-message">Cargando menú...</div>';
    }

    const respuesta = await fetchAutorizadoMesera('/api/productos');
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
      errorMensaje.textContent = 'Error al cargar los productos. Intenta nuevamente más tarde.';
      listaProductos.appendChild(errorMensaje);
    }
  }
};

const cargarImpuesto = async () => {
  try {
    const respuesta = await fetchAutorizadoMesera('/api/configuracion/impuesto');
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener la configuración de impuesto');
    }
    const data = await respuesta.json();
    if (data.ok) {
      const valor = Number(data.valor);
      estado.impuestoPorcentaje = Number.isNaN(valor) ? 0 : valor;
    }
  } catch (error) {
    console.error('Error al obtener impuesto:', error);
    estado.impuestoPorcentaje = 0;
  } finally {
    actualizarResumenUI();
  }
};

const inicializarEventos = () => {
  buscadorInput?.addEventListener('input', (event) => {
    estado.filtro = event.target.value.trim();
    renderProductos();
  });

  botonEnviar?.addEventListener('click', () => enviarPedido('cocina'));
  botonEnviarCaja?.addEventListener('click', () => enviarPedido('caja'));
  btnScrollTop?.addEventListener('click', scrollArriba);
  btnScrollBottom?.addEventListener('click', scrollAbajo);

  botonCancelarEdicion?.addEventListener('click', () => {
    cancelarEdicion();
  });

  tabsMesera.forEach((btn) => {
    btn.addEventListener('click', () => activarTab(btn.dataset.tab));
  });
};

window.addEventListener('DOMContentLoaded', async () => {
  aplicarModulosMesera();
  const usuario = obtenerUsuarioActual();
  if (identidadMesera && usuario?.nombre) {
    identidadMesera.textContent = `Mesera: ${usuario.nombre}`;
  }

  activarTab('tomar');

  await Promise.all([cargarProductos(), cargarImpuesto(), cargarPedidosActivos()]);
  actualizarCarritoUI();
  inicializarEventos();
  iniciarRefrescoPedidos();
});

window.addEventListener('beforeunload', detenerRefrescoPedidos);
