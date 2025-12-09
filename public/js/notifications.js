// Notificaciones globales de chat (Socket.IO)
(function () {
  const isChatPage = window.location.pathname.includes('chat.html');
  const user = typeof getStoredUser === 'function' ? getStoredUser() : null;
  if (!user || !user.token) return;

  const socket = io({
    auth: { token: user.token },
  });

  const getAuthHeadersSafe = () => {
    if (typeof getAuthHeaders === 'function') return getAuthHeaders();
    if (window.kanmAuth && typeof window.kanmAuth.getAuthHeaders === 'function') {
      return window.kanmAuth.getAuthHeaders();
    }
    return {};
  };

  const BADGE_KEY = 'chatUnreadCount';
  const badgeEl = document.getElementById('chat-unread-badge');
  const toastContainerId = 'kanm-toast-container';
  let unreadCount = 0;

  const ensureToastContainer = () => {
    let container = document.getElementById(toastContainerId);
    if (!container) {
      container = document.createElement('div');
      container.id = toastContainerId;
      container.className = 'kanm-toast-container';
      document.body.appendChild(container);
    }
    return container;
  };

  const loadStoredUnread = () => {
    try {
      const stored = Number(localStorage.getItem(BADGE_KEY) || 0);
      unreadCount = Number.isFinite(stored) ? stored : 0;
    } catch (err) {
      unreadCount = 0;
    }
  };

  const updateBadge = () => {
    if (!badgeEl) return;
    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.textContent = '';
      badgeEl.style.display = 'none';
    }
  };

  const saveUnread = () => {
    try {
      localStorage.setItem(BADGE_KEY, String(unreadCount));
    } catch (err) {
      /* ignore */
    }
  };

  loadStoredUnread();
  updateBadge();

  // --- Notificaciones de pedidos listos para rol mesera (fuera de mesera.html) ---
  const isMesera = (user.rol || user.role) === 'mesera';
  const isMeseraPage = window.location.pathname.includes('mesera.html');
  const AREA_STATE_STORAGE_KEY = 'kanm:area-notifications';
  const areaNotificationState = new Map();
  let areaNotificationInitialized = false;
  let pedidosInterval = null;

  const cargarEstadoAreasDesdeStorage = () => {
    try {
      const raw = localStorage.getItem(AREA_STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([key, value]) => areaNotificationState.set(key, value));
        areaNotificationInitialized = areaNotificationState.size > 0;
      }
    } catch (err) {
      console.warn('No se pudo leer el estado de pedidos listos almacenado:', err);
    }
  };

  const guardarEstadoAreasEnStorage = () => {
    try {
      const obj = {};
      areaNotificationState.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem(AREA_STATE_STORAGE_KEY, JSON.stringify(obj));
    } catch (err) {
      console.warn('No se pudo guardar el estado de pedidos listos:', err);
    }
  };

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
      if (valor) estados.add(valor);
    });
    return calcularEstadoAreaDesdeSet(estados);
  };

  const deduplicatePedidos = (pedidos) => {
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
  };

  const agruparCuentasPedidos = (...listas) => {
    const mapa = new Map();
    listas.forEach((lista = []) => {
      lista.forEach((cuenta) => {
        const cuentaId = cuenta.cuenta_id || cuenta.id;
        const existente = mapa.get(cuentaId) || { ...cuenta, cuenta_id: cuentaId, pedidos: [] };
        (cuenta.pedidos || []).forEach((pedido) => {
          existente.pedidos.push({
            ...pedido,
            cuenta_id: cuentaId,
            mesa: pedido.mesa ?? cuenta.mesa,
            modo_servicio: pedido.modo_servicio ?? cuenta.modo_servicio,
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

  const showOrderToast = (cuenta, label) => {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'kanm-toast kanm-toast-order';

    const mesaTexto =
      cuenta.mesa || cuenta.mesaNumero || cuenta.mesa_nombre || cuenta.mesa_id || cuenta.cliente || '';
    const titulo = document.createElement('div');
    titulo.className = 'kanm-toast-title';
    titulo.textContent = mesaTexto ? `Mesa ${mesaTexto} - ${label} lista` : `${label} lista`;

    const accion = document.createElement('a');
    accion.href = '/mesera.html';
    accion.className = 'kanm-toast-action';
    accion.textContent = 'Ver pedidos';

    toast.appendChild(titulo);
    toast.appendChild(accion);
    toast.addEventListener('click', () => (window.location.href = '/mesera.html'));

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, 5500);
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

      if (!areaNotificationInitialized) return;
      if (estadoNormalizado === 'listo' && previo !== 'listo') {
        showOrderToast(cuenta, label);
      }
    });
  };

  const fetchPedidos = async (estado) => {
    try {
      const resp = await fetch(`/api/pedidos?estado=${estado}`, {
        headers: { 'Content-Type': 'application/json', ...getAuthHeadersSafe() },
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('No se pudieron obtener pedidos para notificaciones:', err);
      return [];
    }
  };

  const revisarPedidosListos = async () => {
    try {
      const [pend, prep, listo] = await Promise.all([
        fetchPedidos('pendiente'),
        fetchPedidos('preparando'),
        fetchPedidos('listo'),
      ]);
      const cuentas = agruparCuentasPedidos(pend, prep, listo);
      cuentas.forEach((cuenta) => checkAreaNotifications(cuenta));
      guardarEstadoAreasEnStorage();
      areaNotificationInitialized = true;
    } catch (err) {
      console.warn('No se pudieron revisar pedidos listos (notificaciones):', err);
    }
  };

  const iniciarNotificacionesPedidosMesera = () => {
    if (!isMesera || isMeseraPage) return;
    cargarEstadoAreasDesdeStorage();
    revisarPedidosListos();
    pedidosInterval = setInterval(revisarPedidosListos, 25000);
  };

  iniciarNotificacionesPedidosMesera();

  const truncate = (text, max = 80) => {
    if (!text) return '';
    const t = String(text);
    return t.length > max ? `${t.slice(0, max)}…` : t;
  };

  const showToast = (payload, destacado = false) => {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = destacado ? 'kanm-toast kanm-toast-mention' : 'kanm-toast';

    const titulo = document.createElement('div');
    titulo.className = 'kanm-toast-title';
    titulo.textContent = `Nuevo mensaje en ${payload.room_nombre || 'chat'}`;

    const cuerpo = document.createElement('div');
    cuerpo.className = 'kanm-toast-body';
    cuerpo.textContent = `${payload.usuario_nombre || 'Alguien'}: ${truncate(payload.contenido, 90)}`;

    const accion = document.createElement('a');
    accion.href = '/chat.html';
    accion.className = 'kanm-toast-action';
    accion.textContent = 'Ver chat';

    toast.appendChild(titulo);
    toast.appendChild(cuerpo);
    toast.appendChild(accion);

    toast.addEventListener('click', () => {
      window.location.href = '/chat.html';
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, 6500);
  };

  const joinAllRooms = async () => {
    try {
      const resp = await fetch('/api/chat/rooms', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeadersSafe(),
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const rooms = data?.rooms || [];
      rooms.forEach((room) => {
        socket.emit('joinRoom', { room_id: room.id });
      });
    } catch (error) {
      console.warn('No se pudieron unir todas las salas para notificaciones', error);
    }
  };

  socket.on('connect', () => {
    if (!isChatPage) {
      joinAllRooms();
    }
  });

  socket.on('message:new', (msg) => {
    if (!msg) return;
    if (Number(msg.usuario_id) === Number(user.id || user.usuarioId)) {
      return; // ignora lo propio
    }
    if (Number(msg.negocio_id) !== Number(user.negocio_id || user.negocioId)) {
      return; // ignora otros negocios
    }
    if (isChatPage) {
      return; // chat.js se encarga
    }

    unreadCount += 1;
    saveUnread();
    updateBadge();

    const fueMencionado = Array.isArray(msg.menciones)
      ? msg.menciones.some((m) => Number(m.usuario_id) === Number(user.id || user.usuarioId))
      : false;

    showToast(
      {
        room_nombre: msg.room_nombre,
        usuario_nombre: msg.usuario_nombre || msg.usuario_usuario,
        contenido: msg.contenido,
      },
      fueMencionado
    );
  });
})();
