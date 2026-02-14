const activosContainer = document.getElementById('bar-pedidos-activos');
const finalizadosContainer = document.getElementById('bar-pedidos-finalizados');
const tabs = document.querySelectorAll('.kanm-tab');
const panelActivos = document.getElementById('panel-activos');
const panelFinalizados = document.getElementById('panel-finalizados');

const focusOverlay = document.getElementById('bar-focus-overlay');
const focusCuenta = document.getElementById('focus-cuenta');
const focusServicio = document.getElementById('focus-servicio');
const focusMeta = document.getElementById('focus-meta');
const focusNota = document.getElementById('focus-nota');
const focusItems = document.getElementById('focus-items');
const btnFocusCerrar = document.getElementById('focus-cerrar');
const btnFocusPreparar = document.getElementById('focus-preparar');
const btnFocusListo = document.getElementById('focus-listo');
const btnFocusCancelar = document.getElementById('focus-cancelar');

const REFRESH_INTERVAL = 5000;
let refreshTimer = null;
let cargando = false;
let cuentasActivas = [];
let cuentasFinalizadas = [];
let focoPedido = null;
let focoCuenta = null;
let sesionExpiradaNotificada = false;
const LOCAL_STORAGE_TRABAJO = 'kanm_bar_pedido_en_trabajo';
const scrollActivos = new Map();
const sessionApi = window.KANMSession;
const authApi = window.kanmAuth;

const obtenerUsuarioActual = () => sessionApi?.getUser?.() || null;

const obtenerAuthHeaders = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener los encabezados de autenticación', error);
    return {};
  }
};

const leerPedidoEnTrabajo = () => {
  try {
    const guardado = localStorage.getItem(LOCAL_STORAGE_TRABAJO);
    return guardado ? JSON.parse(guardado) : null;
  } catch (error) {
    console.warn('No se pudo leer el pedido en trabajo de localStorage', error);
    return null;
  }
};

const guardarPedidoEnTrabajo = (pedidoId, cuentaId) => {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_TRABAJO,
      JSON.stringify({ id: pedidoId, cuenta_id: cuentaId ?? null, desde: new Date().toISOString() })
    );
  } catch (error) {
    console.warn('No se pudo guardar el pedido en trabajo en localStorage', error);
  }
};

const limpiarPedidoEnTrabajo = () => {
  try {
    localStorage.removeItem(LOCAL_STORAGE_TRABAJO);
  } catch (error) {
    console.warn('No se pudo limpiar el pedido en trabajo de localStorage', error);
  }
};

const buscarCuentaPorPedido = (pedidoId) => {
  for (const cuenta of cuentasActivas) {
    if (cuenta.pedidos?.some((p) => p.id === pedidoId)) {
      return cuenta;
    }
  }
  return focoCuenta;
};

const buscarPedidoEnActivos = (pedidoId) => {
  for (const cuenta of cuentasActivas) {
    const pedido = (cuenta.pedidos || []).find((p) => p.id === pedidoId);
    if (pedido) {
      return { pedido, cuenta };
    }
  }
  return null;
};

const obtenerPedidoPropioEnPreparacion = () => {
  const usuario = obtenerUsuarioActual();
  if (!usuario) return null;

  for (const cuenta of cuentasActivas) {
    const pedido = (cuenta.pedidos || []).find((p) => {
      const estadoBar = p.estadoBar || p.estado;
      return estadoBar === 'preparando' && p.bartender_id === usuario.id;
    });
    if (pedido) {
      return { pedido, cuenta };
    }
  }
  return null;
};

const sincronizarPedidoEnTrabajo = () => {
  const enTrabajo = leerPedidoEnTrabajo();
  const enServidor = obtenerPedidoPropioEnPreparacion();

  if (!enTrabajo && !enServidor) return;

  if (enServidor && enServidor.pedido.id === enTrabajo?.id) {
    return;
  }

  if (enServidor) {
    guardarPedidoEnTrabajo(enServidor.pedido.id, enServidor.cuenta?.cuenta_id || enServidor.cuenta?.id);
  } else {
    limpiarPedidoEnTrabajo();
  }
};

const manejarSesionVencida = (res) => {
  if (res.status === 401) {
    if (sesionExpiradaNotificada) return true;
    sesionExpiradaNotificada = true;
    alert('Tu sesión expiró. Ingresa nuevamente.');
    if (typeof window.logout === 'function') {
      window.logout();
    }
    return true;
  }
  return false;
};

const normalizarCuentas = (lista = []) => {
  if (!Array.isArray(lista)) return [];

  const cuentas = lista.map((cuenta) => ({
    ...cuenta,
    pedidos: [...(cuenta.pedidos || [])].sort(
      (a, b) => new Date(a.fecha_creacion || 0) - new Date(b.fecha_creacion || 0)
    ),
  }));

  cuentas.sort((a, b) => {
    const fechaA = new Date(a.pedidos?.[0]?.fecha_creacion || 0).getTime();
    const fechaB = new Date(b.pedidos?.[0]?.fecha_creacion || 0).getTime();
    return fechaA - fechaB;
  });

  return cuentas;
};

const formatoFecha = (valor) => {
  if (!valor) return '—';
  const normalizado = valor.includes('Z') ? valor : `${valor.replace(' ', 'T')}Z`;
  const fecha = new Date(normalizado);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Santo_Domingo',
  });
};

const cambiarTab = (tab) => {
  tabs.forEach((btn) => {
    const esActivo = btn.dataset.tab === tab;
    btn.classList.toggle('active', esActivo);
    btn.setAttribute('aria-selected', esActivo ? 'true' : 'false');
  });

  panelActivos?.classList.toggle('hidden', tab !== 'activos');
  panelFinalizados?.classList.toggle('hidden', tab !== 'finalizados');
};

const textoMesaCliente = (pedido) => {
  const partes = [];
  if (pedido.mesa) partes.push(pedido.mesa);
  if (pedido.cliente) partes.push(pedido.cliente);
  return partes.length ? partes.join(' • ') : 'Mesa/cliente no especificado';
};

const textoServicio = (pedido) => {
  if (pedido.modo_servicio === 'para_llevar') return 'Para llevar';
  if (pedido.modo_servicio === 'delivery') return 'Delivery';
  return 'Consumir en el negocio';
};

const estadoBarDeCuenta = (cuenta) => {
  const estados = new Set(
    (cuenta.pedidos || []).map((pedido) => pedido.estadoBar || pedido.estado).filter(Boolean)
  );

  if (estados.has('cancelado')) {
    return 'cancelado';
  }

  if (estados.size === 0) {
    return cuenta.estado || 'pendiente';
  }

  if (estados.has('preparando') || (estados.has('pendiente') && estados.has('listo'))) {
    return 'preparando';
  }

  if (estados.size === 1 && estados.has('pendiente')) {
    return 'pendiente';
  }

  if (estados.size === 1 && estados.has('listo')) {
    return 'listo';
  }

  return 'preparando';
};


const abrirFoco = (cuenta, pedido) => {
  if (!focusOverlay || !cuenta || !pedido) return;

  const usuario = obtenerUsuarioActual();
  const enCurso = obtenerPedidoPropioEnPreparacion();
  const enTrabajo = leerPedidoEnTrabajo();

  if (pedido.bartender_id && usuario && pedido.bartender_id !== usuario.id) {
    alert(`Este pedido está siendo preparado por ${pedido.bartender_nombre || 'otro bartender'}.`);
    return;
  }

  if (enCurso && enCurso.pedido.id !== pedido.id) {
    alert(
      `Ya estás trabajando en el pedido #${enCurso.pedido.id}. Marca listo o cancela antes de tomar otro.`
    );
    return;
  }

  if (enTrabajo && enTrabajo.id && enTrabajo.id !== pedido.id) {
    alert('Ya tienes un pedido en preparacion. Marca listo o cancela ese pedido antes de tomar otro.');
    return;
  }

  focoPedido = pedido;
  focoCuenta = cuenta;

  focusCuenta.textContent = `Cuenta #${cuenta.cuenta_id || cuenta.id || '—'}`;
  focusServicio.textContent = `${textoMesaCliente(cuenta)} • ${textoServicio(cuenta)}`;
  const bartenderLabel =
    pedido.bartender_nombre ||
    (usuario && pedido.bartender_id === usuario.id ? 'Tú' : pedido.bartender_id ? 'Otro bartender' : 'Sin asignar');
  focusMeta.textContent = `Entrada: ${formatoFecha(pedido.fecha_creacion)} · Salida: ${formatoFecha(
    pedido.fecha_listo || pedido.fecha_cierre
  )} · Bartender: ${bartenderLabel}`;

  if (pedido.nota) {
    focusNota.classList.remove('hidden');
    focusNota.textContent = `Nota: ${pedido.nota}`;
  } else {
    focusNota.classList.add('hidden');
    focusNota.textContent = '';
  }

  focusItems.innerHTML = '';
  const ul = listaProductos(pedido.items || []);
  focusItems.appendChild(ul);

  focusOverlay.classList.remove('hidden');
  focusOverlay.setAttribute('aria-hidden', 'false');
};

const cerrarFoco = () => {
  focoPedido = null;
  focoCuenta = null;
  if (focusOverlay) {
    focusOverlay.classList.add('hidden');
    focusOverlay.setAttribute('aria-hidden', 'true');
  }
};

const cargarPedidosActivos = async () => {
  const res = await fetch('/api/bar/pedidos', {
    headers: {
      ...obtenerAuthHeaders(),
    },
  });
  if (manejarSesionVencida(res)) return [];
  if (!res.ok) {
    throw new Error('No se pudieron obtener los pedidos activos');
  }
  const data = await res.json();
  return normalizarCuentas(data);
};

const cargarPedidosFinalizados = async () => {
  const res = await fetch('/api/bar/pedidos-finalizados', {
    headers: {
      ...obtenerAuthHeaders(),
    },
  });
  if (manejarSesionVencida(res)) return [];
  if (!res.ok) {
    throw new Error('No se pudieron obtener los pedidos finalizados');
  }
  const data = await res.json();
  const cuentas = normalizarCuentas(data);

  cuentas.sort((a, b) => {
    const fechaA = new Date(
      a.pedidos?.[0]?.fecha_listo || a.pedidos?.[0]?.fecha_cierre || a.pedidos?.[0]?.fecha_creacion || 0
    ).getTime();
    const fechaB = new Date(
      b.pedidos?.[0]?.fecha_listo || b.pedidos?.[0]?.fecha_cierre || b.pedidos?.[0]?.fecha_creacion || 0
    ).getTime();
    return fechaA - fechaB;
  });

  return cuentas;
};

const listaProductos = (items = []) => {
  const ul = document.createElement('ul');
  ul.className = 'kanm-pedido-items';
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin productos registrados';
    ul.appendChild(li);
    return ul;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.nombre || `Producto ${item.producto_id}`} × ${item.cantidad}`;
    ul.appendChild(li);
  });
  return ul;
};

const mensajeVacio = (contenedor, texto) => {
  if (!contenedor) return;
  contenedor.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'kanm-empty-message';
  p.textContent = texto;
  contenedor.appendChild(p);
};

const crearAccionesPedido = (cuenta, pedido) => {
  const acciones = document.createElement('div');
  acciones.className = 'kanm-pedido-acciones';

  const usuario = obtenerUsuarioActual();
  const enCurso = obtenerPedidoPropioEnPreparacion();
  const estadoBar = pedido.estadoBar || pedido.estado;
  const bloqueadoPorOtro = pedido.bartender_id && usuario && pedido.bartender_id !== usuario.id;
  const bloqueadoPorTrabajo = enCurso && enCurso.pedido.id !== pedido.id;
  const bloqueoMensaje = bloqueadoPorOtro
    ? `Pedido asignado a ${pedido.bartender_nombre || 'otro bartender'}.`
    : bloqueadoPorTrabajo
      ? `Ya trabajas en el pedido #${enCurso.pedido.id}.`
      : '';
  const accionesBloqueadas = bloqueadoPorOtro || bloqueadoPorTrabajo;

  if (estadoBar === 'pendiente') {
    const btnPreparar = document.createElement('button');
    btnPreparar.type = 'button';
    btnPreparar.className = 'kanm-button secondary';
    btnPreparar.textContent = 'Marcar preparando';
    btnPreparar.disabled = accionesBloqueadas;
    if (bloqueoMensaje) btnPreparar.title = bloqueoMensaje;
    btnPreparar.addEventListener('click', () => abrirFoco(cuenta, pedido));
    acciones.appendChild(btnPreparar);

    const btnListo = document.createElement('button');
    btnListo.type = 'button';
    btnListo.className = 'kanm-button primary';
    btnListo.textContent = 'Marcar listo';
    btnListo.disabled = accionesBloqueadas;
    if (bloqueoMensaje) btnListo.title = bloqueoMensaje;
    btnListo.addEventListener('click', () => abrirFoco(cuenta, pedido));
    acciones.appendChild(btnListo);
  } else if (estadoBar === 'preparando') {
    const btnListo = document.createElement('button');
    btnListo.type = 'button';
    btnListo.className = 'kanm-button primary';
    btnListo.textContent = 'Marcar listo';
    btnListo.disabled = accionesBloqueadas;
    if (bloqueoMensaje) btnListo.title = bloqueoMensaje;
    btnListo.addEventListener('click', () => abrirFoco(cuenta, pedido));
    acciones.appendChild(btnListo);
  }

  if (estadoBar === 'pendiente' || estadoBar === 'preparando') {
    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'kanm-button ghost-danger';
    btnCancelar.textContent = 'Cancelar pedido';
    btnCancelar.disabled = accionesBloqueadas;
    if (bloqueoMensaje) btnCancelar.title = bloqueoMensaje;
    btnCancelar.addEventListener('click', () => abrirFoco(cuenta, pedido));
    acciones.appendChild(btnCancelar);
  }

  if (bloqueoMensaje) {
    const aviso = document.createElement('p');
    aviso.className = 'kanm-helper-text';
    aviso.textContent = bloqueoMensaje;
    acciones.appendChild(aviso);
  }

  return acciones;
};

const crearPedidoSubcard = (cuenta, pedido, indice, conAcciones = false) => {
  const subcard = document.createElement('div');
  subcard.className = 'pedido-subcard';

  const header = document.createElement('div');
  header.className = 'pedido-subcard-header';

  const label = document.createElement('span');
  label.className = 'estado-pill';
  label.textContent = `Pedido #${indice}`;
  header.appendChild(label);

  const estadoBar = pedido.estadoBar || pedido.estado;
  const badge = document.createElement('span');
  badge.className = `kanm-badge estado-${estadoBar}`;
  badge.textContent = estadoBar.charAt(0).toUpperCase() + estadoBar.slice(1);
  header.appendChild(badge);

  const tiempos = document.createElement('p');
  tiempos.className = 'pedido-info';
  tiempos.textContent = `Entrada: ${formatoFecha(pedido.fecha_creacion)} · Salida: ${formatoFecha(
    pedido.fecha_listo || pedido.fecha_cierre
  )}`;

  const bartenderInfo = document.createElement('p');
  bartenderInfo.className = 'pedido-info';
  bartenderInfo.textContent = `Bartender: ${pedido.bartender_nombre || 'Sin asignar'}`;

  subcard.appendChild(header);
  subcard.appendChild(tiempos);
  subcard.appendChild(bartenderInfo);

  if (pedido.nota) {
    const nota = document.createElement('div');
    nota.className = 'pedido-note';
    nota.textContent = `Nota: ${pedido.nota}`;
    subcard.appendChild(nota);
  }
  subcard.appendChild(listaProductos(pedido.items));

  if (conAcciones) {
    subcard.appendChild(crearAccionesPedido(cuenta, pedido));
  }

  return subcard;
};

const renderActivos = (cuentas) => {
  if (!activosContainer) return;
  const prevScroll = new Map();
  activosContainer.querySelectorAll('.cuenta-pedidos[data-cuenta-id]').forEach((el) => {
    prevScroll.set(el.dataset.cuentaId, el.scrollTop);
  });
  activosContainer.innerHTML = '';
  if (!cuentas.length) {
    mensajeVacio(activosContainer, 'No hay pedidos pendientes ni en preparacion.');
    return;
  }

  const frag = document.createDocumentFragment();

  cuentas.forEach((cuenta) => {
    const card = document.createElement('article');
    card.className = 'bar-sticky kanm-bar-pedido-card';

    const header = document.createElement('div');
    header.className = 'bar-sticky__header';

    const titulo = document.createElement('h3');
    titulo.textContent = `Cuenta #${cuenta.cuenta_id || cuenta.id || '—'}`;
    header.appendChild(titulo);

    const estadoCuenta = estadoBarDeCuenta(cuenta);
    const badge = document.createElement('span');
    badge.className = `kanm-badge estado-${estadoCuenta}`;
    badge.textContent = estadoCuenta.charAt(0).toUpperCase() + estadoCuenta.slice(1);
    header.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'bar-sticky__meta';
    meta.innerHTML = `
      <p>${textoMesaCliente(cuenta)}</p>
      <p>Servicio: ${textoServicio(cuenta)}</p>
    `;

    const pedidosWrapper = document.createElement('div');
    pedidosWrapper.className = 'cuenta-pedidos';
    pedidosWrapper.dataset.cuentaId = cuenta.cuenta_id || cuenta.id;

    (cuenta.pedidos || []).forEach((pedido, idx) => {
      const subcard = crearPedidoSubcard(cuenta, pedido, idx + 1, true);
      pedidosWrapper.appendChild(subcard);
    });

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(pedidosWrapper);
    frag.appendChild(card);
  });

  activosContainer.appendChild(frag);
  activosContainer.querySelectorAll('.cuenta-pedidos[data-cuenta-id]').forEach((el) => {
    const pos = prevScroll.get(el.dataset.cuentaId);
    if (typeof pos === 'number') {
      el.scrollTop = pos;
    }
  });
};

const renderFinalizados = (cuentas) => {
  if (!finalizadosContainer) return;
  finalizadosContainer.innerHTML = '';
  if (!cuentas.length) {
    mensajeVacio(finalizadosContainer, 'Aún no hay pedidos finalizados hoy.');
    return;
  }

  const frag = document.createDocumentFragment();

  cuentas.forEach((cuenta) => {
    const card = document.createElement('article');
    card.className = 'kanm-card kanm-pedido-card';

    const header = document.createElement('div');
    header.className = 'kanm-pedido-header';

    const titulo = document.createElement('h3');
    titulo.textContent = `Cuenta #${cuenta.cuenta_id || cuenta.id || '—'}`;
    header.appendChild(titulo);

    const estadoCuenta = estadoBarDeCuenta(cuenta);
    const badge = document.createElement('span');
    badge.className = `kanm-badge estado-${estadoCuenta}`;
    badge.textContent = estadoCuenta.charAt(0).toUpperCase() + estadoCuenta.slice(1);
    header.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'kanm-pedido-meta';

    const mesa = document.createElement('p');
    mesa.textContent = textoMesaCliente(cuenta);
    meta.appendChild(mesa);

    const servicio = document.createElement('p');
    servicio.textContent = `Servicio: ${textoServicio(cuenta)}`;
    meta.appendChild(servicio);

    const pedidosWrapper = document.createElement('div');
    pedidosWrapper.className = 'cuenta-pedidos';

    (cuenta.pedidos || []).forEach((pedido, idx) => {
      const subcard = crearPedidoSubcard(cuenta, pedido, idx + 1, false);
      pedidosWrapper.appendChild(subcard);
    });

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(pedidosWrapper);
    frag.appendChild(card);
  });

  finalizadosContainer.appendChild(frag);
};

const cargarPedidos = async (mostrarCarga = true) => {
  if (cargando) return;
  cargando = true;
  if (mostrarCarga) {
    mensajeVacio(activosContainer, 'Cargando pedidos...');
    mensajeVacio(finalizadosContainer, 'Cargando pedidos finalizados...');
  }

  try {
    const [activos, finalizados] = await Promise.all([
      cargarPedidosActivos(),
      cargarPedidosFinalizados(),
    ]);
    cuentasActivas = activos;
    cuentasFinalizadas = finalizados;
    sincronizarPedidoEnTrabajo();
    renderActivos(cuentasActivas);
    renderFinalizados(cuentasFinalizadas);
  } catch (error) {
    console.error('Error al cargar los pedidos de bar:', error);
    mensajeVacio(activosContainer, 'Error al cargar los pedidos de bar. Intenta nuevamente.');
    mensajeVacio(finalizadosContainer, 'Error al cargar los pedidos de bar. Intenta nuevamente.');
  }

  cargando = false;
};

const cambiarEstado = async (pedidoId, estado, boton) => {
  const usuario = obtenerUsuarioActual();
  const enCurso = obtenerPedidoPropioEnPreparacion();
  const datosPedido = buscarPedidoEnActivos(pedidoId)?.pedido;

  if (estado === 'preparando' && enCurso && enCurso.pedido.id !== pedidoId) {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
    alert(`Ya estás preparando el pedido #${enCurso.pedido.id}. Marca listo o cancela antes de tomar otro.`);
    return;
  }

  if (datosPedido && usuario && datosPedido.bartender_id && datosPedido.bartender_id !== usuario.id) {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
    alert(`Este pedido está asignado a ${datosPedido.bartender_nombre || 'otro bartender'}.`);
    return;
  }

  if (boton) {
    boton.disabled = true;
    boton.classList.add('is-loading');
  }

  try {
    const esCancelacion = estado === 'cancelado';
    const url = esCancelacion
      ? `/api/pedidos/${pedidoId}/cancelar`
      : estado === 'preparando'
        ? '/api/bar/marcar-en-preparacion'
        : '/api/bar/marcar-listo';

    const opciones = {
      method: esCancelacion ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...obtenerAuthHeaders() },
    };

    if (!esCancelacion) {
      opciones.body = JSON.stringify({ pedido_id: pedidoId });
    }

    const res = await fetch(url, opciones);

    if (manejarSesionVencida(res)) {
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo actualizar el pedido. Intenta de nuevo.');
    }

    await cargarPedidos(false);
    cerrarFoco();

    if (estado === 'preparando') {
      const cuenta = focoCuenta || buscarCuentaPorPedido(pedidoId);
      const cuentaId = cuenta?.cuenta_id || cuenta?.id || null;
      guardarPedidoEnTrabajo(pedidoId, cuentaId);
    }

    if ((estado === 'listo' || estado === 'cancelado') && leerPedidoEnTrabajo()?.id === pedidoId) {
      limpiarPedidoEnTrabajo();
    }
  } catch (error) {
    console.error('Error al actualizar pedido:', error);
    alert(error.message || 'No se pudo actualizar el pedido. Intenta de nuevo.');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
  }
};

const iniciarAutoRefresco = () => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => cargarPedidos(false), REFRESH_INTERVAL);
};

document.addEventListener('DOMContentLoaded', () => {
  tabs.forEach((btn) =>
    btn.addEventListener('click', () => cambiarTab(btn.dataset.tab || 'activos'))
  );

  btnFocusCerrar?.addEventListener('click', cerrarFoco);
  btnFocusPreparar?.addEventListener('click', () => {
    if (!focoPedido) return;
    cambiarEstado(focoPedido.id, 'preparando');
  });
  btnFocusListo?.addEventListener('click', () => {
    if (!focoPedido) return;
    cambiarEstado(focoPedido.id, 'listo');
  });
  btnFocusCancelar?.addEventListener('click', () => {
    if (!focoPedido) return;
    const confirmar = window.confirm('¿Seguro que quieres cancelar este pedido?');
    if (confirmar) {
      cambiarEstado(focoPedido.id, 'cancelado');
    }
  });

  cargarPedidos();
  iniciarAutoRefresco();
});

window.addEventListener('beforeunload', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});

// El backend valida que cada bartender solo tenga un pedido en preparacion.
// Se mantiene el guardado en localStorage para recordar visualmente el pedido en curso en este navegador.
