const tabs = document.querySelectorAll('.kanm-tab');
const paneles = {
  disponibles: document.getElementById('delivery-panel-disponibles'),
  asignados: document.getElementById('delivery-panel-asignados'),
  entregados: document.getElementById('delivery-panel-entregados'),
};
const listas = {
  disponibles: document.getElementById('delivery-list-disponibles'),
  asignados: document.getElementById('delivery-list-asignados'),
  entregados: document.getElementById('delivery-list-entregados'),
};
const mensajes = {
  disponibles: document.getElementById('delivery-msg-disponibles'),
  asignados: document.getElementById('delivery-msg-asignados'),
  entregados: document.getElementById('delivery-msg-entregados'),
};
const metricDisponibles = document.getElementById('delivery-metric-disponibles');
const metricAsignados = document.getElementById('delivery-metric-asignados');
const metricEntregados = document.getElementById('delivery-metric-entregados');

const REFRESH_INTERVAL = 15000;
let refreshTimer = null;
let cargando = false;

const authApi = window.kanmAuth;
const API_BASE_RAW = window.API_BASE || window.APP_API_BASE || '';
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : '';
const buildApiUrl = (path) => (API_BASE ? `${API_BASE}${path}` : path);

const getAuthHeadersDelivery = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    return {};
  }
};

const handleUnauthorizedDelivery = (response) => {
  if (response.status === 401 || response.status === 403) {
    authApi?.handleUnauthorized?.();
    return true;
  }
  return false;
};

const formatCurrency = (valor) => {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(numero);
};

const formatDateTime = (valor) => {
  if (!valor) return '—';
  const normalizado = typeof valor === 'string' && !valor.includes('Z') ? `${valor.replace(' ', 'T')}Z` : valor;
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

const normalizarEstado = (estado) => (estado || 'pendiente').toString().toLowerCase();

const actualizarMensaje = (elemento, texto, tipo = 'info') => {
  if (!elemento) return;
  elemento.textContent = texto;
  elemento.dataset.type = texto ? tipo : '';
};

const actualizarMetricas = ({ disponibles, asignados, entregados }) => {
  if (metricDisponibles) metricDisponibles.textContent = disponibles;
  if (metricAsignados) metricAsignados.textContent = asignados;
  if (metricEntregados) metricEntregados.textContent = entregados;
};

const crearBadgeEstado = (estado) => {
  const badge = document.createElement('span');
  const limpio = normalizarEstado(estado);
  badge.className = `kanm-badge estado-${limpio} estado-delivery`;
  const label = limpio.charAt(0).toUpperCase() + limpio.slice(1);
  badge.textContent = label;
  return badge;
};

const crearLinea = (label, value) => {
  const p = document.createElement('p');
  p.className = 'delivery-card-line';
  p.innerHTML = `<strong>${label}:</strong> ${value || '—'}`;
  return p;
};

const aceptarPedido = async (pedidoId) => {
  if (!pedidoId) return;
  try {
    const response = await fetch(buildApiUrl(`/api/delivery/pedidos/${pedidoId}/aceptar`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeadersDelivery(),
      },
    });

    if (handleUnauthorizedDelivery(response)) return;

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'No se pudo aceptar el pedido.');
    }
  } catch (error) {
    alert(error.message || 'No se pudo aceptar el pedido.');
  }
};

const entregarPedido = async (pedidoId) => {
  if (!pedidoId) return;
  try {
    const response = await fetch(buildApiUrl(`/api/delivery/pedidos/${pedidoId}/entregar`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeadersDelivery(),
      },
    });

    if (handleUnauthorizedDelivery(response)) return;

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'No se pudo marcar el pedido como entregado.');
    }
  } catch (error) {
    alert(error.message || 'No se pudo marcar el pedido como entregado.');
  }
};

const crearCardPedido = (pedido, contexto) => {
  const card = document.createElement('article');
  card.className = 'kanm-card delivery-card';

  const header = document.createElement('div');
  header.className = 'delivery-card-header';

  const titulo = document.createElement('div');
  const cliente = pedido.cliente || pedido.mesa || 'Cliente sin nombre';
  titulo.innerHTML = `<h3>Pedido #${pedido.id}</h3><p class="kanm-subtitle">${cliente}</p>`;

  const badge = crearBadgeEstado(pedido.delivery_estado);
  header.appendChild(titulo);
  header.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'delivery-card-meta';
  const total = formatCurrency(pedido.total);
  const listo = formatDateTime(pedido.fecha_listo);
  meta.innerHTML = `<span>Listo: ${listo}</span><span>Total: ${total}</span>`;

  const info = document.createElement('div');
  info.className = 'delivery-card-info';
  info.appendChild(crearLinea('Teléfono', pedido.delivery_telefono));
  info.appendChild(crearLinea('Dirección', pedido.delivery_direccion));
  if (pedido.delivery_referencia) {
    info.appendChild(crearLinea('Referencia', pedido.delivery_referencia));
  }

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'delivery-card-items';
  const itemsTitulo = document.createElement('h4');
  itemsTitulo.textContent = 'Productos';
  itemsWrap.appendChild(itemsTitulo);
  const itemsList = document.createElement('ul');
  (pedido.items || []).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.nombre || `Producto ${item.producto_id}`} × ${item.cantidad}`;
    itemsList.appendChild(li);
  });
  if (!itemsList.children.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin productos registrados';
    itemsList.appendChild(li);
  }
  itemsWrap.appendChild(itemsList);

  const nota = pedido.delivery_notas || pedido.nota;
  if (nota) {
    const notaEl = document.createElement('div');
    notaEl.className = 'delivery-card-note';
    notaEl.textContent = `Nota: ${nota}`;
    itemsWrap.appendChild(notaEl);
  }

  const acciones = document.createElement('div');
  acciones.className = 'delivery-card-actions';

  if (contexto === 'disponibles') {
    const btnAceptar = document.createElement('button');
    btnAceptar.type = 'button';
    btnAceptar.className = 'kanm-button primary';
    btnAceptar.textContent = 'Aceptar entrega';
    btnAceptar.addEventListener('click', async () => {
      btnAceptar.disabled = true;
      await aceptarPedido(pedido.id);
      await cargarTodo();
      btnAceptar.disabled = false;
    });
    acciones.appendChild(btnAceptar);
  }

  if (contexto === 'asignados') {
    const btnEntregar = document.createElement('button');
    btnEntregar.type = 'button';
    btnEntregar.className = 'kanm-button primary';
    btnEntregar.textContent = 'Marcar entregado';
    btnEntregar.addEventListener('click', async () => {
      btnEntregar.disabled = true;
      await entregarPedido(pedido.id);
      await cargarTodo();
      btnEntregar.disabled = false;
    });
    acciones.appendChild(btnEntregar);
  }

  card.appendChild(header);
  card.appendChild(meta);
  card.appendChild(info);
  card.appendChild(itemsWrap);
  if (acciones.children.length) {
    card.appendChild(acciones);
  }

  return card;
};

const renderLista = (pedidos, contenedor, mensajeEl, contexto, mensajeVacio) => {
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    actualizarMensaje(mensajeEl, mensajeVacio, 'info');
    return;
  }
  actualizarMensaje(mensajeEl, '');
  const fragment = document.createDocumentFragment();
  pedidos.forEach((pedido) => {
    fragment.appendChild(crearCardPedido(pedido, contexto));
  });
  contenedor.appendChild(fragment);
};

const fetchPedidos = async ({ estado, mios }) => {
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (mios) params.set('mios', '1');
  const response = await fetch(buildApiUrl(`/api/delivery/pedidos?${params.toString()}`), {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeadersDelivery(),
    },
  });
  if (handleUnauthorizedDelivery(response)) return [];
  if (!response.ok) {
    throw new Error('No se pudo cargar la lista de pedidos.');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

const cargarTodo = async () => {
  if (cargando) return;
  cargando = true;
  try {
    const [disponibles, asignados, entregados] = await Promise.all([
      fetchPedidos({ estado: 'disponible', mios: false }),
      fetchPedidos({ estado: 'asignado', mios: true }),
      fetchPedidos({ estado: 'entregado', mios: true }),
    ]);

    renderLista(
      disponibles,
      listas.disponibles,
      mensajes.disponibles,
      'disponibles',
      'No hay pedidos disponibles para delivery.'
    );
    renderLista(
      asignados,
      listas.asignados,
      mensajes.asignados,
      'asignados',
      'No tienes pedidos en camino.'
    );
    renderLista(
      entregados,
      listas.entregados,
      mensajes.entregados,
      'entregados',
      'Aún no hay entregas registradas.'
    );

    actualizarMetricas({
      disponibles: disponibles.length,
      asignados: asignados.length,
      entregados: entregados.length,
    });
  } catch (error) {
    console.error('Error cargando pedidos delivery:', error);
    Object.values(mensajes).forEach((el) => actualizarMensaje(el, 'No se pudieron cargar los pedidos.', 'error'));
  } finally {
    cargando = false;
  }
};

const activarTab = (tabId) => {
  tabs.forEach((btn) => {
    const activo = btn.dataset.tab === tabId;
    btn.classList.toggle('active', activo);
    btn.setAttribute('aria-selected', activo ? 'true' : 'false');
  });

  Object.entries(paneles).forEach(([key, panel]) => {
    if (!panel) return;
    panel.classList.toggle('active', key === tabId);
    panel.hidden = key !== tabId;
  });
};

const iniciarRefresco = () => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    cargarTodo().catch(() => {});
  }, REFRESH_INTERVAL);
};

tabs.forEach((btn) => {
  btn.addEventListener('click', () => activarTab(btn.dataset.tab));
});

window.addEventListener('DOMContentLoaded', async () => {
  activarTab('disponibles');
  await cargarTodo();
  iniciarRefresco();
});

window.addEventListener('beforeunload', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
