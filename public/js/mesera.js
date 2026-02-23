const campoMesa = document.getElementById('campo-mesa');
const selectServicio = document.getElementById('tipo-servicio');
const notaInput = document.getElementById('nota-pedido');
const deliveryClienteInput = document.getElementById('delivery-cliente');
const deliveryTelefonoInput = document.getElementById('delivery-telefono');
const deliveryDireccionInput = document.getElementById('delivery-direccion');
const deliveryReferenciaInput = document.getElementById('delivery-referencia');
const deliveryNotaInput = document.getElementById('delivery-nota');
const listaProductos = document.getElementById('lista-productos');
const carritoContainer = document.getElementById('carrito');
const botonEnviar = document.getElementById('boton-enviar');
const botonEnviarCaja = document.getElementById('boton-enviar-caja');
const botonDeliveryPrep = document.getElementById('boton-delivery-prep');
const botonDeliveryDirecto = document.getElementById('boton-delivery-directo');
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
const panelesCompartidos = document.querySelectorAll('[data-tab-shared]');
const gruposAcciones = document.querySelectorAll('[data-acciones]');
const footerMesera = document.getElementById('mesera-footer');
const badgeListosEl = document.getElementById('mesera-listos-badge');
const LISTOS_BADGE_KEY = 'kanm:mesera:listos-unread';
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
  tabActiva: 'tomar',
  listosUnread: 0,
};

const esProductoStockIndefinido = (producto) => Number(producto?.stock_indefinido) === 1;
const obtenerStockDisponible = (producto) => {
  if (esProductoStockIndefinido(producto)) return Infinity;
  const valor = Number(producto?.stock);
  return Number.isFinite(valor) ? valor : 0;
};
const obtenerEtiquetaStock = (producto) =>
  esProductoStockIndefinido(producto) ? 'Indefinido' : obtenerStockDisponible(producto);

let notificationSound;
let notificationSoundReady = false;
let notificationSoundUnlocking = null;
const areaNotificationState = new Map();
const AREA_STATE_STORAGE_KEY = 'kanm:area-notifications';
let areaNotificationInitialized = false;
let listosBadgeInitialized = false;

const cargarEstadoAreasDesdeStorage = () => {
  try {
    const raw = localStorage.getItem(AREA_STATE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([key, value]) => {
        areaNotificationState.set(key, value);
      });
      areaNotificationInitialized = areaNotificationState.size > 0;
    }
  } catch (err) {
    console.warn('No se pudo leer el estado de notificaciones de pedidos:', err);
  }
};

const cargarBadgeListosDesdeStorage = () => {
  try {
    const raw = localStorage.getItem(LISTOS_BADGE_KEY);
    const val = Number(raw || 0);
    estado.listosUnread = Number.isFinite(val) ? val : 0;
  } catch (err) {
    estado.listosUnread = 0;
  }
  listosBadgeInitialized = true;
};

const guardarBadgeListosEnStorage = () => {
  if (!listosBadgeInitialized) return;
  try {
    localStorage.setItem(LISTOS_BADGE_KEY, String(estado.listosUnread || 0));
  } catch (err) {
    /* ignore */
  }
};

const actualizarBadgeListos = () => {
  if (!badgeListosEl) return;
  const valor = Number(estado.listosUnread || 0);
  if (valor > 0) {
    badgeListosEl.textContent = valor > 99 ? '99+' : valor;
    badgeListosEl.hidden = false;
    badgeListosEl.style.display = 'inline-flex';
  } else {
    badgeListosEl.textContent = '';
    badgeListosEl.hidden = true;
    badgeListosEl.style.display = 'none';
  }
};

const reiniciarBadgeListos = () => {
  estado.listosUnread = 0;
  actualizarBadgeListos();
  guardarBadgeListosEnStorage();
};

const incrementarBadgeListos = (cantidad = 1) => {
  const inc = Number(cantidad) || 1;
  estado.listosUnread = Number(estado.listosUnread || 0) + inc;
  actualizarBadgeListos();
  guardarBadgeListosEnStorage();
};

const guardarEstadoAreasEnStorage = () => {
  try {
    const obj = {};
    areaNotificationState.forEach((value, key) => {
      obj[key] = value;
    });
    localStorage.setItem(AREA_STATE_STORAGE_KEY, JSON.stringify(obj));
  } catch (err) {
    console.warn('No se pudo guardar el estado de notificaciones de pedidos:', err);
  }
};

function deduplicatePedidos(pedidos) {
  if (!Array.isArray(pedidos)) return [];
  const seen = new Set();
  const result = [];
  pedidos.forEach((pedido) => {
    const key = pedido?.id ?? pedido?.pedido_id ?? pedido?.numero ?? null;
    if (key == null) {
      result.push(pedido);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    result.push(pedido);
  });
  return result;
}

const calcularEstadoAreaDesdeSet = (estadosSet) => {
  if (!estadosSet || estadosSet.size === 0) return null;
  if (estadosSet.has('cancelado')) return 'cancelado';
  if (estadosSet.has('preparando') || (estadosSet.has('pendiente') && estadosSet.has('listo'))) {
    return 'preparando';
  }
  if (estadosSet.size === 1 && estadosSet.has('pendiente')) return 'pendiente';
  if (estadosSet.size === 1 && estadosSet.has('listo')) return 'listo';
  return 'preparando';
};

const estadoAreaCuenta = (cuenta, area = 'cocina') => {
  const estados = new Set();
  (cuenta.pedidos || []).forEach((pedido) => {
    const valor = area === 'bar' ? pedido.estadoBar : pedido.estadoCocina;
    if (valor) {
      estados.add(valor);
    }
  });
  return calcularEstadoAreaDesdeSet(estados);
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

  const resultado = Array.from(mapa.values());
  resultado.forEach((cuenta) => {
    cuenta.estadoCocina = estadoAreaCuenta(cuenta, 'cocina');
    cuenta.estadoBar = estadoAreaCuenta(cuenta, 'bar');
  });
  return resultado;
};

const ensureNotificationSound = () => {
  if (!notificationSound) {
    notificationSound = new Audio('/sounds/notify.mp3');
    notificationSound.preload = 'auto';
  }
  return notificationSound;
};

const primeNotificationSound = () => {
  if (notificationSoundReady) return Promise.resolve(true);
  const audio = ensureNotificationSound();
  const intento = audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      notificationSoundReady = true;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      notificationSoundUnlocking = null;
    });
  notificationSoundUnlocking = intento;
  return intento;
};

const registerSoundUnlockOnInteraction = () => {
  const handler = () => {
    primeNotificationSound();
    ['click', 'touchstart', 'keydown'].forEach((evento) => {
      document.removeEventListener(evento, handler, true);
    });
  };
  ['click', 'touchstart', 'keydown'].forEach((evento) => {
    document.addEventListener(evento, handler, { capture: true });
  });
};

const playNotificationSound = () => {
  ensureNotificationSound();
  const intentarReproducir = () => {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {});
  };

  if (notificationSoundReady) {
    intentarReproducir();
    return;
  }

  const promesa = notificationSoundUnlocking || primeNotificationSound();
  Promise.resolve(promesa)
    .then(() => {
      intentarReproducir();
    })
    .catch(() => {
      intentarReproducir();
    });
};

const showToast = (message, timeoutMs = 4000) => {
  const contenedor = document.getElementById('toast-container');
  if (!contenedor) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  contenedor.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      toast.remove();
    }, 220);
  }, timeoutMs);
};

const speakNotification = (message) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'es-ES';
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('No se pudo reproducir la voz de la notificación:', error);
  }
};

const notifyAreaReady = (cuenta, areaLabel) => {
  playNotificationSound();
  if (navigator.vibrate) {
    navigator.vibrate([120, 60, 120]);
  }
  const mesaTexto = cuenta.mesa || cuenta.mesaNumero || cuenta.mesa_nombre || cuenta.mesa_id || '';
  const mensaje = mesaTexto ? `Mesa ${mesaTexto} - ${areaLabel} lista` : `${areaLabel} lista`;
  showToast(mensaje);
  speakNotification(mensaje);
};

const checkAreaNotifications = (cuenta) => {
  if (!cuenta) return;
  const cuentaId = cuenta.cuenta_id || cuenta.id;
  if (!cuentaId) return;

  const areas = [
    { clave: 'cocina', estado: cuenta.estadoCocina, label: 'Cocina' },
    { clave: 'bar', estado: cuenta.estadoBar, label: 'Bar' },
  ];

  areas.forEach(({ clave, estado, label }) => {
    const estadoNormalizado = estado ? estado.toString().toLowerCase() : null;
    const key = `${cuentaId}-${clave}`;

    if (!estadoNormalizado || estadoNormalizado === 'sin_productos') {
      areaNotificationState.set(key, estadoNormalizado);
      return;
    }

    const previo = areaNotificationState.get(key);
    areaNotificationState.set(key, estadoNormalizado);

    if (!areaNotificationInitialized) {
      return; // Evita notificaciones duplicadas al refrescar o entrar por primera vez
    }

    if (estadoNormalizado === 'listo' && previo !== 'listo') {
      notifyAreaReady(cuenta, label);
      if (estado.tabActiva !== 'listos') {
        incrementarBadgeListos(1);
      }
    }
  });
};

const formatCurrency = (valor) => {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(numero);
};

const obtenerDatosDelivery = () => ({
  cliente: deliveryClienteInput?.value?.trim() || '',
  telefono: deliveryTelefonoInput?.value?.trim() || '',
  direccion: deliveryDireccionInput?.value?.trim() || '',
  referencia: deliveryReferenciaInput?.value?.trim() || '',
  nota: deliveryNotaInput?.value?.trim() || '',
});

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

const obtenerTextoServicio = (modoServicio) => {
  const modo = (modoServicio || '').toString().toLowerCase();
  if (modo === 'para_llevar') return 'Para llevar';
  if (modo === 'delivery') return 'Delivery';
  return 'Consumir en el negocio';
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
    delivery: true,
    historialCocina: true,
  };
  const btnEnviarCocina = document.querySelector('[data-accion="enviar-cocina"]') || botonEnviar;
  const sinPreparacion = modulos.cocina === false && modulos.bar === false;
  if (btnEnviarCocina && sinPreparacion) {
    btnEnviarCocina.style.display = 'none';
  }

  const deliveryTab = document.querySelector('.mesera-tab-btn[data-tab="delivery"]');
  const deliveryPanel = document.querySelector('.mesera-tab-panel[data-tab="delivery"]');
  const deliveryAcciones = document.querySelector('[data-acciones="delivery"]');
  if (deliveryTab && modulos.delivery === false) {
    deliveryTab.style.display = 'none';
    deliveryTab.setAttribute('aria-hidden', 'true');
    if (estado.tabActiva === 'delivery') {
      estado.tabActiva = 'tomar';
    }
  } else if (deliveryTab) {
    deliveryTab.style.display = '';
    deliveryTab.removeAttribute('aria-hidden');
  }

  if (deliveryPanel && modulos.delivery === false) {
    deliveryPanel.classList.remove('active');
    deliveryPanel.hidden = true;
  } else if (deliveryPanel) {
    deliveryPanel.hidden = false;
  }

  if (deliveryAcciones && modulos.delivery === false) {
    deliveryAcciones.hidden = true;
  }

  if (selectServicio && modulos.delivery === false) {
    const optionDelivery = selectServicio.querySelector('option[value="delivery"]');
    optionDelivery?.remove();
  }
};

const activarTab = (tabId = 'tomar') => {
  estado.tabActiva = tabId;
  tabsMesera.forEach((boton) => {
    const activo = boton.dataset.tab === tabId;
    boton.classList.toggle('active', activo);
    boton.setAttribute('aria-pressed', activo);
  });

  panelesMesera.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tab === tabId);
  });

  panelesCompartidos.forEach((panel) => {
    const tabs = (panel.dataset.tabShared || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    panel.hidden = !tabs.includes(tabId);
  });

  gruposAcciones.forEach((grupo) => {
    const destino = (grupo.dataset.acciones || '').trim();
    if (!destino) return;
    grupo.hidden = destino !== tabId;
  });

  if (footerMesera) {
    const visible = Array.from(panelesCompartidos).some((panel) => !panel.hidden && panel.contains(footerMesera));
    footerMesera.style.display = visible ? '' : 'none';
  }

  if (tabId === 'listos') {
    reiniciarBadgeListos();
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
    const precio = Number(item.precio_unitario) || 0;
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

    const botonMenos = crearBotonCantidad('-', () => ajustarCantidad(itemKey, item.cantidad - 1));
    const botonMas = crearBotonCantidad(
      '+',
      () => ajustarCantidad(itemKey, item.cantidad + 1),
      !stockIndefinido && totalEnCarrito >= stockDisponible
    );

    const inputCantidad = document.createElement('input');
    inputCantidad.type = 'number';
    inputCantidad.min = '1';
    inputCantidad.value = item.cantidad;
    inputCantidad.addEventListener('change', (event) => {
      const valor = Number(event.target.value);
      ajustarCantidad(itemKey, valor);
    });

    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'kanm-button ghost';
    botonEliminar.textContent = 'Eliminar';
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
    const stockDisponible = obtenerStockDisponible(producto);
    const stockTexto = obtenerEtiquetaStock(producto);
    const stockIndefinido = esProductoStockIndefinido(producto);
    const opcionesPrecio = normalizarOpcionesPrecioProducto(producto);
    let selectorPrecio = null;

    contenido.innerHTML = `
      <h3>${producto.nombre}</h3>
      <p class="producto-meta">
        Precio: ${formatCurrency(producto.precio)} · Stock: ${stockTexto} · ${
          producto.categoria_nombre ? `Categoría: ${producto.categoria_nombre}` : 'Sin categoría'
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
    botonAgregar.disabled = !producto.activo || (!stockIndefinido && stockDisponible <= 0);
    botonAgregar.addEventListener('click', () => agregarAlCarrito(producto, selectorPrecio));

    acciones.appendChild(botonAgregar);

    card.appendChild(contenido);
    card.appendChild(acciones);
    fragment.appendChild(card);
  });

  listaProductos.appendChild(fragment);
};

const agregarAlCarrito = (producto, selectPrecio = null) => {
  limpiarMensaje();

  if (!producto || !producto.id) {
    mostrarMensaje('Producto invalido.', 'error');
    return;
  }

  const stockDisponible = obtenerStockDisponible(producto);
  const stockIndefinido = esProductoStockIndefinido(producto);
  if (!stockIndefinido && stockDisponible <= 0) {
    mostrarMensaje('Este producto no tiene stock disponible.', 'error');
    return;
  }

  const seleccion = resolverPrecioSeleccionado(producto, selectPrecio);
  const itemKey = construirClaveCarrito(producto.id, seleccion.label, seleccion.valor);
  const totalEnCarrito = obtenerCantidadProductoEnCarrito(producto.id);
  const itemActual = estado.carrito.get(itemKey) || { cantidad: 0 };
  const nuevaCantidad = itemActual.cantidad + 1;
  const totalNuevo = totalEnCarrito + 1;

  if (!stockIndefinido && totalNuevo > stockDisponible) {
    mostrarMensaje('No puedes agregar mas unidades que el stock disponible.', 'error');
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
  estado.carrito.delete(itemKey);
  actualizarCarritoUI();
};

const ajustarCantidad = (itemKey, cantidadDeseada) => {
  limpiarMensaje();

  if (!estado.carrito.has(itemKey)) {
    return false;
  }

  const cantidad = Number(cantidadDeseada);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    mostrarMensaje('La cantidad debe ser mayor a cero.', 'error');
    actualizarCarritoUI();
    return false;
  }

  const itemActual = estado.carrito.get(itemKey);
  const productoId = itemActual?.producto_id;
  const producto = estado.productos.find((p) => p.id === productoId);
  if (!producto) {
    mostrarMensaje('No se pudo encontrar el producto seleccionado.', 'error');
    actualizarCarritoUI();
    return false;
  }

  const stockDisponible = obtenerStockDisponible(producto);
  const stockIndefinido = esProductoStockIndefinido(producto);
  const totalOtros = obtenerCantidadProductoEnCarrito(productoId, itemKey);
  const totalNuevo = totalOtros + cantidad;
  if (!stockIndefinido && totalNuevo > stockDisponible) {
    mostrarMensaje('No puedes solicitar mas unidades que el stock disponible.', 'error');
    actualizarCarritoUI();
    return false;
  }

  estado.carrito.set(itemKey, { ...itemActual, cantidad });
  actualizarCarritoUI();
  return true;
};

const obtenerPayloadPedido = (destino = 'cocina') => {
  const esDelivery = estado.tabActiva === 'delivery';
  const mesa = esDelivery ? null : campoMesa?.value.trim();
  const items = Array.from(estado.carrito.values()).map((item) => {
    const precioUnitario = Number(item.precio_unitario);
    return {
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: Number.isFinite(precioUnitario) ? precioUnitario : 0,
    };
  });
  const modoServicioSeleccionado = esDelivery ? 'delivery' : selectServicio?.value || 'en_local';
  const nota = esDelivery ? '' : notaInput?.value?.trim() || '';
  const destinoNormalizado =
    destino === 'delivery-directo' || destino === 'delivery-prep' ? 'delivery' : destino;

  const payload = {
    mesa: mesa || null,
    cliente: esDelivery ? obtenerDatosDelivery().cliente || null : null,
    items,
    modo_servicio: modoServicioSeleccionado,
    destino: destinoNormalizado,
    cuenta_id: estado.cuentaReferenciaId || null,
    nota,
  };

  if (esDelivery) {
    const datos = obtenerDatosDelivery();
    payload.delivery_telefono = datos.telefono || null;
    payload.delivery_direccion = datos.direccion || null;
    payload.delivery_referencia = datos.referencia || null;
    payload.delivery_notas = datos.nota || null;
    payload.omitir_preparacion = destino === 'delivery-directo' ? 1 : 0;
  }

  return payload;
};

const validarPedido = () => {
  if (estado.tabActiva === 'delivery') {
    const datos = obtenerDatosDelivery();
    if (deliveryNotaInput && deliveryNotaInput.value.length > 200) {
      mostrarMensaje('La nota de entrega no puede superar 200 caracteres.', 'error');
      return false;
    }
    if (!datos.cliente) {
      mostrarMensaje('Ingresa el nombre del cliente para delivery.', 'error');
      return false;
    }
    if (!datos.telefono) {
      mostrarMensaje('Ingresa el teléfono de contacto para delivery.', 'error');
      return false;
    }
    if (!datos.direccion) {
      mostrarMensaje('Ingresa la dirección de entrega.', 'error');
      return false;
    }
  } else if (notaInput && notaInput.value.length > 200) {
    mostrarMensaje('La nota no puede superar 200 caracteres.', 'error');
    return false;
  }

  if (estado.carrito.size === 0) {
    mostrarMensaje('Agrega al menos un producto para enviar el pedido.', 'error');
    return false;
  }

  const cantidadesPorProducto = new Map();

  for (const item of estado.carrito.values()) {
    if (!item || !item.producto_id) {
      mostrarMensaje('Hay un producto invalido en el carrito.', 'error');
      return false;
    }

    if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
      mostrarMensaje('Todas las cantidades deben ser mayores a cero.', 'error');
      return false;
    }

    const producto = estado.productos.find((p) => p.id === item.producto_id);
    if (!producto) {
      mostrarMensaje('Hay un producto invalido en el carrito.', 'error');
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
  if (deliveryClienteInput) deliveryClienteInput.value = '';
  if (deliveryTelefonoInput) deliveryTelefonoInput.value = '';
  if (deliveryDireccionInput) deliveryDireccionInput.value = '';
  if (deliveryReferenciaInput) deliveryReferenciaInput.value = '';
  if (deliveryNotaInput) deliveryNotaInput.value = '';
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

const crearBadgeArea = (titulo, estadoArea) => {
  const span = document.createElement('span');
  const estadoTexto = estadoArea ? estadoArea.charAt(0).toUpperCase() + estadoArea.slice(1) : 'Sin productos';
  span.className = `kanm-badge ghost${estadoArea ? ` estado-${estadoArea}` : ''}`;
  span.textContent = `${titulo}: ${estadoTexto}`;
  return span;
};

const obtenerFlagsListo = (cuenta) => {
  const estadoCocina = cuenta.estadoCocina;
  const estadoBar = cuenta.estadoBar;
  const cocinaListo = cuenta.cocinaListo ?? (estadoCocina === 'listo' || estadoCocina == null);
  const barListo = cuenta.barListo ?? (estadoBar === 'listo' || estadoBar == null);
  return { cocinaListo: Boolean(cocinaListo), barListo: Boolean(barListo) };
};

const obtenerBadgeCuenta = (cuenta) => {
  const { cocinaListo, barListo } = obtenerFlagsListo(cuenta);
  const puedeCobrar = Boolean(cuenta.puedeCobrar ?? (cocinaListo && barListo));
  const estadoCuentaMesera = cuenta.estadoCuentaMesera;

  if (puedeCobrar || estadoCuentaMesera === 'listo') {
    return { texto: 'Listo', clase: 'estado-listo' };
  }

  if (estadoCuentaMesera === 'preparando' && (cocinaListo || barListo)) {
    return { texto: 'Listo parcial', clase: 'ghost estado-parcial' };
  }

  const base = (estadoCuentaMesera || cuenta.estado_cuenta || cuenta.estado || 'pendiente').toString();
  const texto = base.charAt(0).toUpperCase() + base.slice(1);
  return { texto, clase: `estado-${base}` };
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

  const servicioTexto = obtenerTextoServicio(cuenta.modo_servicio);
  const cuentaTexto = `Cuenta #${cuenta.cuenta_id}`;
  info.innerHTML = `
      <h3>${cuentaTexto}</h3>
      <p class="kanm-subtitle">${mesaCliente.length ? mesaCliente.join(' · ') : 'Sin mesa asignada'}</p>
      <p class="pedido-meta">Servicio: ${servicioTexto}</p>
    `;

  const badge = document.createElement('span');
  const badgeInfo = obtenerBadgeCuenta(cuenta);
  badge.className = `kanm-badge ${badgeInfo.clase}`;
  badge.textContent = badgeInfo.texto;

  const estadoCocina = cuenta.estadoCocina ?? estadoAreaCuenta(cuenta, 'cocina');
  const estadoBar = cuenta.estadoBar ?? estadoAreaCuenta(cuenta, 'bar');
  const badgeAreas = document.createElement('div');
  badgeAreas.className = 'pedido-area-badges';
  badgeAreas.appendChild(crearBadgeArea('Cocina', estadoCocina));
  badgeAreas.appendChild(crearBadgeArea('Bar', estadoBar));

  header.appendChild(info);
  header.appendChild(badgeAreas);
  header.appendChild(badge);

  const pedidosContainer = document.createElement('div');
  pedidosContainer.className = 'cuenta-pedidos';

  const pedidosOrdenados = deduplicatePedidos(cuenta.pedidos || []).slice().sort((a, b) => {
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
  const cuentasFiltradas = estado.pedidosActivos.filter((cuenta) =>
    estadosFiltro.includes(cuenta.estadoCuentaMesera)
  );

  if (!cuentasFiltradas.length) {
    mostrarMensajeTab(mensajeEl, mensajeVacio, 'info');
    return;
  }

  mostrarMensajeTab(mensajeEl, '');
  const fragment = document.createDocumentFragment();

  const preferirRecientes = estadosFiltro.includes('listo');
  const obtenerMarcaTiempo = (cuenta, usarMaximo) => {
    const tiempos = (cuenta.pedidos || []).map((p) =>
      p.fecha_creacion ? new Date(p.fecha_creacion).getTime() : 0
    );
    if (!tiempos.length) return 0;
    return usarMaximo ? Math.max(...tiempos) : Math.min(...tiempos);
  };

  const cuentasOrdenadas = cuentasFiltradas.slice().sort((a, b) => {
    const tiempoA = obtenerMarcaTiempo(a, preferirRecientes);
    const tiempoB = obtenerMarcaTiempo(b, preferirRecientes);
    return preferirRecientes ? tiempoB - tiempoA : tiempoA - tiempoB;
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

    const pedidosParaDetalle = deduplicatePedidos(
      cuentasAgrupadas.flatMap((cuenta) => cuenta.pedidos || [])
    );

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
      const pedidosOrdenados = deduplicatePedidos(cuenta.pedidos || []).slice().sort((a, b) => {
        const fechaA = new Date(a.fecha_creacion || 0).getTime();
        const fechaB = new Date(b.fecha_creacion || 0).getTime();
        return fechaA - fechaB;
      });

      cuenta.pedidos = pedidosOrdenados.map((pedido) => ({
        ...pedido,
        items: detallesPorId.get(pedido.id) || [],
      }));
    });

    cuentasAgrupadas.forEach((cuenta) => checkAreaNotifications(cuenta));

    guardarEstadoAreasEnStorage();

    const cuentasListas = cuentasAgrupadas.filter(
      (cuenta) => cuenta.estadoCuentaMesera === 'listo'
    );
    if (!areaNotificationInitialized && estado.tabActiva !== 'listos' && cuentasListas.length) {
      incrementarBadgeListos(cuentasListas.length);
    }

    areaNotificationInitialized = true;

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
  let botonActivo = botonEnviar;
  if (destino === 'caja') botonActivo = botonEnviarCaja;
  if (destino === 'delivery-prep') botonActivo = botonDeliveryPrep;
  if (destino === 'delivery-directo') botonActivo = botonDeliveryDirecto;

  try {
    estado.cargando = true;
    [botonEnviar, botonEnviarCaja, botonDeliveryPrep, botonDeliveryDirecto]
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

    if (Array.isArray(data?.advertencias) && data.advertencias.length) {
      mostrarMensaje(data.advertencias.join(' '), 'warning');
    }

    const mensajeExito = esEdicion
      ? 'Nueva orden agregada a la cuenta correctamente.'
      : destino === 'caja'
        ? 'Pedido enviado a caja correctamente.'
        : destino === 'delivery-prep'
          ? 'Pedido enviado a preparación y delivery correctamente.'
          : destino === 'delivery-directo'
            ? 'Pedido enviado directo a delivery correctamente.'
            : 'Pedido enviado a preparación correctamente.';
    mostrarMensaje(mensajeExito, 'info');
    notificarActualizacionGlobal('stock-actualizado', { tipo: esEdicion ? 'actualizado' : 'creado' });
    estado.carrito.clear();
    if (notaInput) notaInput.value = '';
    if (deliveryClienteInput) deliveryClienteInput.value = '';
    if (deliveryTelefonoInput) deliveryTelefonoInput.value = '';
    if (deliveryDireccionInput) deliveryDireccionInput.value = '';
    if (deliveryReferenciaInput) deliveryReferenciaInput.value = '';
    if (deliveryNotaInput) deliveryNotaInput.value = '';
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
    [botonEnviar, botonEnviarCaja, botonDeliveryPrep, botonDeliveryDirecto]
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
  botonDeliveryPrep?.addEventListener('click', () => enviarPedido('delivery-prep'));
  botonDeliveryDirecto?.addEventListener('click', () => enviarPedido('delivery-directo'));
  botonCancelarEdicion?.addEventListener('click', () => {
    cancelarEdicion();
  });

  tabsMesera.forEach((btn) => {
    btn.addEventListener('click', () => activarTab(btn.dataset.tab));
  });
};

window.addEventListener('DOMContentLoaded', async () => {
  aplicarModulosMesera();
  cargarEstadoAreasDesdeStorage();
  cargarBadgeListosDesdeStorage();
  actualizarBadgeListos();
  registerSoundUnlockOnInteraction();
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
