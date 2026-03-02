const activosContainer = document.getElementById('cocina-pedidos-activos');
const finalizadosContainer = document.getElementById('cocina-pedidos-finalizados');
const tabs = document.querySelectorAll('.kanm-tab');
const panelActivos = document.getElementById('panel-activos');
const panelFinalizados = document.getElementById('panel-finalizados');

const focusOverlay = document.getElementById('cocina-focus-overlay');
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
const COCINA_ALARMA_TONO_MS = 1400;
const COCINA_ALARMA_TITULO_MS = 900;
const COCINA_ALARMA_FRECUENCIA = 920;
const COCINA_NOTIFICACION_TAG = 'kanm-cocina-alarma';
const COCINA_CONFIG_CACHE_MS = 30000;
let refreshTimer = null;
let cargando = false;
let cuentasActivas = [];
let cuentasFinalizadas = [];
let focoPedido = null;
let focoCuenta = null;
let sesionExpiradaNotificada = false;
let audioContextAlarma = null;
let alarmaActiva = false;
let alarmaTimer = null;
let alarmaTituloTimer = null;
let alarmaNuevasOrdenes = 0;
let audioAlarmaDisponible = false;
let listenersDesbloqueoAudioRegistrados = false;
let monitoreoOrdenesInicializado = false;
let idsPendientesPrevios = new Set();
let alarmaParpadeoTitulo = false;
let alarmaBanner = null;
let alarmaTexto = null;
let wakeLockCocina = null;
let cocinaPermisoNotificacionSolicitado = false;
let cocinaUltimaNotificacionAt = 0;
let cocinaMultipedidosHabilitado = false;
let cocinaConfigUltimaCarga = 0;
let cocinaConfigCargaEnCurso = null;
const LOCAL_STORAGE_TRABAJO = 'kanm_cocina_pedido_en_trabajo';
const SYNC_STORAGE_KEY = 'kanm:last-update';
const EVENTOS_SYNC_RELEVANTES = new Set([
  'stock-actualizado',
  'pedido-actualizado',
  'pedido-cobrado',
  'cuenta-cobrada',
]);
let ultimaMarcaSyncProcesada = 0;
let recargaSyncProgramada = null;
const scrollActivos = new Map();
const sessionApi = window.KANMSession;
const authApi = window.kanmAuth;
const tituloOriginalPagina = document.title;

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
    console.warn('No fue posible notificar la actualizacion global:', error);
  }
};

const obtenerUsuarioActual = () => sessionApi?.getUser?.() || null;

const obtenerAuthHeaders = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener los encabezados de autenticacion', error);
    return {};
  }
};

const normalizarFlagCocina = (valor, predeterminado = false) => {
  if (valor === undefined || valor === null) return predeterminado;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor !== 0;
  if (typeof valor === 'string') {
    const limpio = valor.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes', 'si'].includes(limpio)) return true;
    if (['0', 'false', 'off', 'no'].includes(limpio)) return false;
    return predeterminado;
  }
  return Boolean(valor);
};

const cargarConfiguracionCocina = async (force = false) => {
  const ahora = Date.now();
  if (!force && cocinaConfigUltimaCarga && ahora - cocinaConfigUltimaCarga < COCINA_CONFIG_CACHE_MS) {
    return cocinaMultipedidosHabilitado;
  }
  if (cocinaConfigCargaEnCurso) {
    return cocinaConfigCargaEnCurso;
  }

  cocinaConfigCargaEnCurso = (async () => {
    try {
      const res = await fetch('/api/configuracion/inventario', {
        headers: {
          ...obtenerAuthHeaders(),
        },
      });

      if (manejarSesionVencida(res)) {
        return cocinaMultipedidosHabilitado;
      }

      if (!res.ok) {
        throw new Error('No se pudo obtener la configuracion de cocina.');
      }

      const data = await res.json().catch(() => ({}));
      if (data?.ok === false) {
        throw new Error(data.error || 'No se pudo obtener la configuracion de cocina.');
      }

      cocinaMultipedidosHabilitado = normalizarFlagCocina(
        data?.cocina_multipedidos ?? data?.cocinaMultipedidos,
        false
      );
      cocinaConfigUltimaCarga = Date.now();
      return cocinaMultipedidosHabilitado;
    } catch (error) {
      console.warn('No se pudo cargar la configuracion de cocina multipedidos:', error);
      return cocinaMultipedidosHabilitado;
    } finally {
      cocinaConfigCargaEnCurso = null;
    }
  })();

  return cocinaConfigCargaEnCurso;
};

const navegadorSoportaNotificaciones = () => typeof window !== 'undefined' && 'Notification' in window;

const solicitarPermisoNotificacionesCocina = () => {
  if (!navegadorSoportaNotificaciones()) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
  if (cocinaPermisoNotificacionSolicitado) return;
  cocinaPermisoNotificacionSolicitado = true;
  try {
    const resultado = Notification.requestPermission();
    if (resultado && typeof resultado.then === 'function') {
      resultado.catch(() => {});
    }
  } catch (error) {
    /* ignore */
  }
};

const notificarAlarmaCocina = (cantidad = 1) => {
  if (!navegadorSoportaNotificaciones()) return;
  if (Notification.permission !== 'granted') return;

  const ahora = Date.now();
  if (ahora - cocinaUltimaNotificacionAt < 1200) return;
  cocinaUltimaNotificacionAt = ahora;

  const body =
    cantidad === 1
      ? 'Nueva orden pendiente en cocina.'
      : `${cantidad} nuevas ordenes pendientes en cocina.`;

  try {
    new Notification('Alarma de cocina', {
      body,
      tag: COCINA_NOTIFICACION_TAG,
      renotify: true,
      requireInteraction: true,
    });
  } catch (error) {
    /* ignore */
  }
};

const solicitarWakeLockCocina = async () => {
  if (!('wakeLock' in navigator) || !navigator.wakeLock?.request) return false;
  if (wakeLockCocina) return true;
  try {
    wakeLockCocina = await navigator.wakeLock.request('screen');
    wakeLockCocina.addEventListener('release', () => {
      wakeLockCocina = null;
    });
    return true;
  } catch (error) {
    return false;
  }
};

const liberarWakeLockCocina = async () => {
  if (!wakeLockCocina) return;
  try {
    await wakeLockCocina.release();
  } catch (error) {
    /* ignore */
  } finally {
    wakeLockCocina = null;
  }
};

const inicializarWakeLockCocina = () => {
  solicitarWakeLockCocina().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      solicitarWakeLockCocina().catch(() => {});
    }
  });
};

const obtenerAudioContextAlarma = () => {
  if (audioContextAlarma) return audioContextAlarma;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  audioContextAlarma = new AudioCtx();
  return audioContextAlarma;
};

const intentarHabilitarAudioAlarma = async () => {
  const ctx = obtenerAudioContextAlarma();
  if (!ctx) return false;
  if (ctx.state === 'running') {
    audioAlarmaDisponible = true;
    return true;
  }
  try {
    await ctx.resume();
    audioAlarmaDisponible = ctx.state === 'running';
    return audioAlarmaDisponible;
  } catch (error) {
    return false;
  }
};

const reproducirBeepAlarma = () => {
  const ctx = obtenerAudioContextAlarma();
  if (!ctx || ctx.state !== 'running') {
    return false;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = COCINA_ALARMA_FRECUENCIA;

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.24);

  audioAlarmaDisponible = true;
  return true;
};

const reproducirPatronAlarma = () => {
  const primerBeep = reproducirBeepAlarma();
  if (!primerBeep) return false;
  setTimeout(() => {
    if (!alarmaActiva) return;
    reproducirBeepAlarma();
  }, 220);
  return true;
};

const actualizarTituloAlarma = () => {
  if (!alarmaActiva) {
    document.title = tituloOriginalPagina;
    return;
  }

  alarmaParpadeoTitulo = !alarmaParpadeoTitulo;
  document.title = alarmaParpadeoTitulo ? 'ALERTA NUEVA ORDEN - Cocina' : tituloOriginalPagina;
};

const detenerAlarmaNuevaOrden = () => {
  alarmaNuevasOrdenes = 0;
  alarmaActiva = false;

  if (alarmaTimer) {
    clearInterval(alarmaTimer);
    alarmaTimer = null;
  }
  if (alarmaTituloTimer) {
    clearInterval(alarmaTituloTimer);
    alarmaTituloTimer = null;
  }

  alarmaParpadeoTitulo = false;
  document.title = tituloOriginalPagina;

  if (alarmaBanner) {
    alarmaBanner.classList.remove('is-active');
  }
  if (alarmaTexto) {
    alarmaTexto.textContent = '';
  }
};

const actualizarBannerAlarma = () => {
  if (!alarmaBanner || !alarmaTexto) return;

  if (!alarmaActiva || alarmaNuevasOrdenes <= 0) {
    alarmaBanner.classList.remove('is-active');
    alarmaTexto.textContent = '';
    return;
  }

  const ordenes = alarmaNuevasOrdenes === 1 ? 'Nueva orden en cocina.' : `${alarmaNuevasOrdenes} nuevas ordenes en cocina.`;
  const ayudaAudio = audioAlarmaDisponible ? '' : ' Verifica permisos de sonido/notificaciones del navegador.';
  alarmaTexto.textContent = `${ordenes} Presiona OK para detener la alarma.${ayudaAudio}`;
  alarmaBanner.classList.add('is-active');
};

const iniciarAlarmaNuevaOrden = async (cantidad = 1) => {
  const incremento = Number(cantidad);
  alarmaNuevasOrdenes += Number.isFinite(incremento) && incremento > 0 ? incremento : 1;

  if (!alarmaActiva) {
    alarmaActiva = true;
    if (navigator.vibrate) {
      navigator.vibrate([150, 80, 150]);
    }
  }

  actualizarBannerAlarma();
  actualizarTituloAlarma();
  solicitarPermisoNotificacionesCocina();
  notificarAlarmaCocina(alarmaNuevasOrdenes);
  solicitarWakeLockCocina().catch(() => {});

  await intentarHabilitarAudioAlarma();
  reproducirPatronAlarma();

  if (!alarmaTimer) {
    alarmaTimer = setInterval(() => {
      if (!alarmaActiva) return;
      const reprodujo = reproducirPatronAlarma();
      if (!reprodujo) {
        intentarHabilitarAudioAlarma().then((ok) => {
          if (ok) {
            actualizarBannerAlarma();
          }
        });
      }
    }, COCINA_ALARMA_TONO_MS);
  }

  if (!alarmaTituloTimer) {
    alarmaTituloTimer = setInterval(() => {
      actualizarTituloAlarma();
    }, COCINA_ALARMA_TITULO_MS);
  }
};

const registrarDesbloqueoAudioAlarma = () => {
  if (listenersDesbloqueoAudioRegistrados) return;
  listenersDesbloqueoAudioRegistrados = true;
  solicitarPermisoNotificacionesCocina();

  const eventos = ['click', 'touchstart', 'keydown'];
  const handler = () => {
    intentarHabilitarAudioAlarma().then((ok) => {
      if (!ok) return;
      eventos.forEach((evento) => {
        document.removeEventListener(evento, handler, true);
      });
      listenersDesbloqueoAudioRegistrados = false;
      actualizarBannerAlarma();
      if (alarmaActiva) {
        reproducirPatronAlarma();
      }
    });
  };

  eventos.forEach((evento) => {
    document.addEventListener(evento, handler, { capture: true });
  });
};

const crearBannerAlarma = () => {
  if (alarmaBanner) return alarmaBanner;
  const main = document.querySelector('.cocina-main');
  if (!main) return null;

  const banner = document.createElement('div');
  banner.className = 'cocina-alarma-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');

  const texto = document.createElement('span');
  texto.className = 'cocina-alarma-banner__texto';
  banner.appendChild(texto);

  const botonOk = document.createElement('button');
  botonOk.type = 'button';
  botonOk.className = 'kanm-button primary cocina-alarma-banner__ok';
  botonOk.textContent = 'OK';
  botonOk.addEventListener('click', () => {
    detenerAlarmaNuevaOrden();
  });
  banner.appendChild(botonOk);

  main.insertBefore(banner, main.firstChild);
  alarmaBanner = banner;
  alarmaTexto = texto;
  return banner;
};

const obtenerIdsPendientes = (cuentas = []) => {
  const ids = new Set();
  cuentas.forEach((cuenta) => {
    (cuenta.pedidos || []).forEach((pedido) => {
      const estadoCocina = (pedido.estadoCocina || pedido.estado || '').toString().toLowerCase();
      if (estadoCocina !== 'pendiente') return;
      if (pedido.id == null) return;
      ids.add(String(pedido.id));
    });
  });
  return ids;
};

const detectarNuevasOrdenesPendientes = (cuentas = []) => {
  const idsActuales = obtenerIdsPendientes(cuentas);

  if (!monitoreoOrdenesInicializado) {
    idsPendientesPrevios = idsActuales;
    monitoreoOrdenesInicializado = true;
    return;
  }

  let nuevas = 0;
  idsActuales.forEach((id) => {
    if (!idsPendientesPrevios.has(id)) {
      nuevas += 1;
    }
  });

  idsPendientesPrevios = idsActuales;

  if (nuevas > 0) {
    iniciarAlarmaNuevaOrden(nuevas).then(() => {
      actualizarBannerAlarma();
    });
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
      const estadoCocina = p.estadoCocina || p.estado;
      return estadoCocina === 'preparando' && p.cocinero_id === usuario.id;
    });
    if (pedido) {
      return { pedido, cuenta };
    }
  }
  return null;
};

const sincronizarPedidoEnTrabajo = () => {
  if (cocinaMultipedidosHabilitado) {
    if (leerPedidoEnTrabajo()) {
      limpiarPedidoEnTrabajo();
    }
    return;
  }

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
    detenerAlarmaNuevaOrden();
    alert('Tu sesion expiró. Ingresa nuevamente.');
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
  return partes.length ? partes.join('  ') : 'Mesa/cliente no especificado';
};

const textoServicio = (pedido) => {
  if (pedido.modo_servicio === 'para_llevar') return 'Para llevar';
  if (pedido.modo_servicio === 'delivery') return 'Delivery';
  return 'Consumir en el negocio';
};

const estadoCocinaDeCuenta = (cuenta) => {
  const estados = new Set(
    (cuenta.pedidos || []).map((pedido) => pedido.estadoCocina || pedido.estado).filter(Boolean)
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

const normalizarEstadoItem = (estado) => {
  const valor = (estado || '').toString().trim().toLowerCase();
  if (valor === 'listo' || valor === 'preparando' || valor === 'pendiente') {
    return valor;
  }
  return 'pendiente';
};

const etiquetaEstadoItem = (estado) => {
  if (estado === 'listo') return 'Listo';
  if (estado === 'preparando') return 'Preparando';
  return 'Pendiente';
};

const formatearCantidadItem = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '0';
  if (Math.abs(numero - Math.round(numero)) < 0.0001) {
    return String(Math.round(numero));
  }
  return Number(numero.toFixed(2)).toString();
};

const marcarDetalleListo = async (pedidoId, detalleId, cantidad, boton) => {
  if (!Number.isFinite(Number(pedidoId)) || !Number.isFinite(Number(detalleId))) {
    return;
  }

  const cantidadAplicar = Number(cantidad);
  if (!Number.isFinite(cantidadAplicar) || cantidadAplicar <= 0) {
    return;
  }

  if (boton) {
    boton.disabled = true;
    boton.classList.add('is-loading');
  }

  try {
    const res = await fetch(`/api/pedidos/${pedidoId}/detalles/${detalleId}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...obtenerAuthHeaders() },
      body: JSON.stringify({ estado: 'listo', area_preparacion: 'cocina', cantidad: cantidadAplicar }),
    });

    if (manejarSesionVencida(res)) {
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo marcar el producto como listo.');
    }

    const cuenta = focoCuenta || buscarCuentaPorPedido(pedidoId);
    const cuentaId = cuenta?.cuenta_id || cuenta?.id || null;
    if (!cocinaMultipedidosHabilitado) {
      if (data.estadoCocina === 'listo') {
        if (leerPedidoEnTrabajo()?.id === pedidoId) {
          limpiarPedidoEnTrabajo();
        }
      } else {
        guardarPedidoEnTrabajo(pedidoId, cuentaId);
      }
    }

    await cargarPedidos(false);
    notificarActualizacionGlobal('pedido-actualizado', {
      pedidoId: Number(pedidoId),
      detalleId: Number(detalleId),
      estado: data.estadoCocina || 'preparando',
    });

    const actualizado = buscarPedidoEnActivos(pedidoId);
    if (actualizado) {
      abrirFoco(actualizado.cuenta, actualizado.pedido);
    } else {
      cerrarFoco();
    }
  } catch (error) {
    console.error('Error al marcar producto como listo:', error);
    alert(error.message || 'No se pudo marcar el producto como listo.');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
  }
};

const listaProductosFoco = (pedido) => {
  const ul = document.createElement('ul');
  ul.className = 'kanm-pedido-items cocina-focus-item-list';
  const items = Array.isArray(pedido?.items) ? pedido.items : [];
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin productos registrados';
    ul.appendChild(li);
    return ul;
  }

  const estadoPedido = pedido?.estadoCocina || pedido?.estado;
  const permiteAccion = estadoPedido === 'pendiente' || estadoPedido === 'preparando';
  let filasPendientes = 0;

  const crearFilaProducto = ({
    nombreProducto,
    cantidadPendiente,
    cantidadTotal,
    cantidadLista,
    detalleId = null,
  }) => {
    const li = document.createElement('li');
    li.className = 'cocina-focus-item-row';
    li.classList.add('is-pendiente');

    const main = document.createElement('div');
    main.className = 'cocina-focus-item-main';

    const titulo = document.createElement('span');
    titulo.className = 'cocina-focus-item-title';
    titulo.textContent = `${nombreProducto} x ${formatearCantidadItem(cantidadPendiente)}`;
    main.appendChild(titulo);

    if (cantidadTotal > 1) {
      const subinfo = document.createElement('span');
      subinfo.className = 'cocina-focus-item-subinfo';
      subinfo.textContent = `Pendientes: ${formatearCantidadItem(cantidadPendiente)} de ${formatearCantidadItem(cantidadTotal)}`;
      main.appendChild(subinfo);
    }

    const acciones = document.createElement('div');
    acciones.className = 'cocina-focus-item-actions';

    const badge = document.createElement('span');
    badge.className = 'cocina-item-estado';
    badge.dataset.estado = cantidadLista > 0 ? 'preparando' : 'pendiente';
    badge.textContent =
      cantidadTotal > 1
        ? `${etiquetaEstadoItem(cantidadLista > 0 ? 'preparando' : 'pendiente')} ${formatearCantidadItem(cantidadPendiente)}/${formatearCantidadItem(cantidadTotal)}`
        : etiquetaEstadoItem(cantidadLista > 0 ? 'preparando' : 'pendiente');
    acciones.appendChild(badge);

    if (permiteAccion && cantidadPendiente > 0 && detalleId) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kanm-button secondary cocina-item-action';
      btn.textContent = cantidadPendiente > 1 ? 'Marcar 1 listo' : 'Marcar listo';
      btn.addEventListener('click', () => marcarDetalleListo(pedido.id, detalleId, 1, btn));
      acciones.appendChild(btn);

      if (cantidadPendiente > 1) {
        const btnTodo = document.createElement('button');
        btnTodo.type = 'button';
        btnTodo.className = 'kanm-button ghost cocina-item-action';
        btnTodo.textContent = 'Marcar todo';
        btnTodo.addEventListener('click', () =>
          marcarDetalleListo(pedido.id, detalleId, cantidadPendiente, btnTodo)
        );
        acciones.appendChild(btnTodo);
      }
    }

    li.appendChild(main);
    li.appendChild(acciones);
    ul.appendChild(li);
    filasPendientes += 1;
  };

  items.forEach((item) => {
    const nombreProducto = item.nombre || ('Producto ' + item.producto_id);

    const cantidadTotal = Math.max(Number(item.cantidad) || 0, 0);
    let cantidadLista = Number(item.cantidad_lista);
    if (!Number.isFinite(cantidadLista) || cantidadLista < 0) {
      cantidadLista = 0;
    }
    if (normalizarEstadoItem(item.estado_preparacion) === 'listo' && cantidadTotal > 0 && cantidadLista <= 0) {
      cantidadLista = cantidadTotal;
    }
    cantidadLista = Math.min(Math.max(cantidadLista, 0), cantidadTotal);
    const cantidadPendiente = Math.max(cantidadTotal - cantidadLista, 0);

    if (cantidadPendiente > 0) {
      crearFilaProducto({
        nombreProducto,
        cantidadPendiente,
        cantidadTotal,
        cantidadLista,
        detalleId: item.detalle_id,
      });
    }
  });

  if (!filasPendientes) {
    const li = document.createElement('li');
    li.textContent = 'No hay productos pendientes en este pedido.';
    ul.appendChild(li);
  }

  return ul;
};

const abrirFoco = (cuenta, pedido) => {
  if (!focusOverlay || !cuenta || !pedido) return;

  const usuario = obtenerUsuarioActual();
  const enCurso = cocinaMultipedidosHabilitado ? null : obtenerPedidoPropioEnPreparacion();
  const enTrabajo = cocinaMultipedidosHabilitado ? null : leerPedidoEnTrabajo();

  if (pedido.cocinero_id && usuario && pedido.cocinero_id !== usuario.id) {
    alert(`Este pedido está siendo preparado por ${pedido.cocinero_nombre || 'otro cocinero'}.`);
    return;
  }

  if (!cocinaMultipedidosHabilitado && enCurso && enCurso.pedido.id !== pedido.id) {
    alert(
      `Ya estás trabajando en el pedido #${enCurso.pedido.id}. Marca listo o cancela antes de tomar otro.`
    );
    return;
  }

  if (!cocinaMultipedidosHabilitado && enTrabajo && enTrabajo.id && enTrabajo.id !== pedido.id) {
    alert('Ya tienes un pedido en preparacion. Marca listo o cancela ese pedido antes de tomar otro.');
    return;
  }

  focoPedido = pedido;
  focoCuenta = cuenta;

  focusCuenta.textContent = `Cuenta #${cuenta.cuenta_id || cuenta.id || '—'}`;
  focusServicio.textContent = `${textoMesaCliente(cuenta)}  ${textoServicio(cuenta)}`;
  const cocineroLabel =
    pedido.cocinero_nombre ||
    (usuario && pedido.cocinero_id === usuario.id ? 'Tú' : pedido.cocinero_id ? 'Otro cocinero' : 'Sin asignar');
  focusMeta.textContent = `Entrada: ${formatoFecha(pedido.fecha_creacion)} · Salida: ${formatoFecha(
    pedido.fecha_listo || pedido.fecha_cierre
  )} · Cocinero: ${cocineroLabel}`;

  if (pedido.nota) {
    focusNota.classList.remove('hidden');
    focusNota.textContent = `Nota: ${pedido.nota}`;
  } else {
    focusNota.classList.add('hidden');
    focusNota.textContent = '';
  }

  focusItems.innerHTML = '';
  const ul = listaProductosFoco(pedido);
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
  const res = await fetch('/api/cocina/pedidos-activos', {
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
  const res = await fetch('/api/cocina/pedidos-finalizados', {
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

const normalizarCantidadesPreparacionItem = (item = {}) => {
  const total = Math.max(Number(item.cantidad) || 0, 0);

  let lista = Number(item.cantidad_lista);
  if (!Number.isFinite(lista) || lista < 0) {
    lista = 0;
  }

  if (normalizarEstadoItem(item.estado_preparacion) === 'listo' && total > 0 && lista <= 0) {
    lista = total;
  }
  lista = Math.min(Math.max(lista, 0), total);

  let pendiente = Number(item.cantidad_pendiente);
  if (!Number.isFinite(pendiente) || pendiente < 0) {
    pendiente = total - lista;
  }
  pendiente = Math.min(Math.max(pendiente, 0), total);

  if (Math.abs(total - (lista + pendiente)) > 0.0001) {
    pendiente = Math.max(total - lista, 0);
  }

  return {
    total: Number(total.toFixed(4)),
    lista: Number(lista.toFixed(4)),
    pendiente: Number(pendiente.toFixed(4)),
  };
};

const listaProductos = (items = [], opciones = {}) => {
  const soloPendientes = opciones?.soloPendientes === true;
  const ul = document.createElement('ul');
  ul.className = 'kanm-pedido-items';
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin productos registrados';
    ul.appendChild(li);
    return ul;
  }

  let agregados = 0;
  items.forEach((item) => {
    const cantidades = normalizarCantidadesPreparacionItem(item);
    const cantidadMostrar = soloPendientes ? cantidades.pendiente : cantidades.total;
    if (!(cantidadMostrar > 0)) {
      return;
    }

    const li = document.createElement('li');
    li.textContent = `${item.nombre || `Producto ${item.producto_id}`} × ${formatearCantidadItem(cantidadMostrar)}`;
    ul.appendChild(li);
    agregados += 1;
  });

  if (agregados === 0) {
    const li = document.createElement('li');
    li.textContent = soloPendientes
      ? 'No hay productos pendientes en este pedido.'
      : 'Sin productos registrados';
    ul.appendChild(li);
  }

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
  const enCurso = cocinaMultipedidosHabilitado ? null : obtenerPedidoPropioEnPreparacion();
  const estadoCocina = pedido.estadoCocina || pedido.estado;
  const bloqueadoPorOtro = pedido.cocinero_id && usuario && pedido.cocinero_id !== usuario.id;
  const bloqueadoPorTrabajo = !cocinaMultipedidosHabilitado && enCurso && enCurso.pedido.id !== pedido.id;
  const bloqueoMensaje = bloqueadoPorOtro
    ? `Pedido asignado a ${pedido.cocinero_nombre || 'otro cocinero'}.`
    : bloqueadoPorTrabajo
      ? `Ya trabajas en el pedido #${enCurso.pedido.id}.`
      : '';
  const accionesBloqueadas = bloqueadoPorOtro || bloqueadoPorTrabajo;

  if (estadoCocina === 'pendiente') {
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
  } else if (estadoCocina === 'preparando') {
    const btnListo = document.createElement('button');
    btnListo.type = 'button';
    btnListo.className = 'kanm-button primary';
    btnListo.textContent = 'Marcar listo';
    btnListo.disabled = accionesBloqueadas;
    if (bloqueoMensaje) btnListo.title = bloqueoMensaje;
    btnListo.addEventListener('click', () => abrirFoco(cuenta, pedido));
    acciones.appendChild(btnListo);
  }

  if (estadoCocina === 'pendiente' || estadoCocina === 'preparando') {
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

  const estadoCocina = pedido.estadoCocina || pedido.estado;
  const badge = document.createElement('span');
  badge.className = `kanm-badge estado-${estadoCocina}`;
  badge.textContent = estadoCocina.charAt(0).toUpperCase() + estadoCocina.slice(1);
  header.appendChild(badge);

  const tiempos = document.createElement('p');
  tiempos.className = 'pedido-info';
  tiempos.textContent = `Entrada: ${formatoFecha(pedido.fecha_creacion)} · Salida: ${formatoFecha(
    pedido.fecha_listo || pedido.fecha_cierre
  )}`;

  const cocineroInfo = document.createElement('p');
  cocineroInfo.className = 'pedido-info';
  cocineroInfo.textContent = `Cocinero: ${pedido.cocinero_nombre || 'Sin asignar'}`;

  subcard.appendChild(header);
  subcard.appendChild(tiempos);
  subcard.appendChild(cocineroInfo);

  if (pedido.nota) {
    const nota = document.createElement('div');
    nota.className = 'pedido-note';
    nota.textContent = `Nota: ${pedido.nota}`;
    subcard.appendChild(nota);
  }
  subcard.appendChild(listaProductos(pedido.items, { soloPendientes: conAcciones }));

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
    card.className = 'cocina-sticky';

    const header = document.createElement('div');
    header.className = 'cocina-sticky__header';

    const titulo = document.createElement('h3');
    titulo.textContent = `Cuenta #${cuenta.cuenta_id || cuenta.id || '—'}`;
    header.appendChild(titulo);

    const estadoCuenta = estadoCocinaDeCuenta(cuenta);
    const badge = document.createElement('span');
    badge.className = `kanm-badge estado-${estadoCuenta}`;
    badge.textContent = estadoCuenta.charAt(0).toUpperCase() + estadoCuenta.slice(1);
    header.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'cocina-sticky__meta';
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
    mensajeVacio(finalizadosContainer, 'An no hay pedidos finalizados hoy.');
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

    const estadoCuenta = estadoCocinaDeCuenta(cuenta);
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
    await cargarConfiguracionCocina();

    const [activos, finalizados] = await Promise.all([
      cargarPedidosActivos(),
      cargarPedidosFinalizados(),
    ]);
    cuentasActivas = activos;
    cuentasFinalizadas = finalizados;
    detectarNuevasOrdenesPendientes(cuentasActivas);
    sincronizarPedidoEnTrabajo();
    renderActivos(cuentasActivas);
    renderFinalizados(cuentasFinalizadas);
  } catch (error) {
    console.error('Error al cargar los pedidos de cocina:', error);
    if (mostrarCarga || (!cuentasActivas.length && !cuentasFinalizadas.length)) {
      mensajeVacio(activosContainer, 'Error al cargar los pedidos de cocina. Intenta nuevamente.');
      mensajeVacio(finalizadosContainer, 'Error al cargar los pedidos de cocina. Intenta nuevamente.');
    }
  } finally {
    cargando = false;
  }
};

const programarRecargaPorSync = () => {
  if (recargaSyncProgramada) return;
  recargaSyncProgramada = setTimeout(() => {
    recargaSyncProgramada = null;
    cargarPedidos(false).catch((error) => {
      console.error('Error al recargar cocina tras sincronizacion global:', error);
    });
  }, 120);
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

    if (!EVENTOS_SYNC_RELEVANTES.has((data.evento || '').toString())) {
      return;
    }

    programarRecargaPorSync();
  } catch (error) {
    console.warn('No se pudo procesar la sincronizacion global en cocina:', error);
  }
};

const cambiarEstado = async (pedidoId, estado, boton) => {
  const usuario = obtenerUsuarioActual();
  const enCurso = cocinaMultipedidosHabilitado ? null : obtenerPedidoPropioEnPreparacion();
  const datosPedido = buscarPedidoEnActivos(pedidoId)?.pedido;

  if (!cocinaMultipedidosHabilitado && estado === 'preparando' && enCurso && enCurso.pedido.id !== pedidoId) {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
    alert(`Ya estas preparando el pedido #${enCurso.pedido.id}. Marca listo o cancela antes de tomar otro.`);
    return;
  }

  if (datosPedido && usuario && datosPedido.cocinero_id && datosPedido.cocinero_id !== usuario.id) {
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('is-loading');
    }
    alert(`Este pedido está asignado a ${datosPedido.cocinero_nombre || 'otro cocinero'}.`);
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
      : `/api/pedidos/${pedidoId}/estado`;

    const opciones = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...obtenerAuthHeaders() },
    };

    if (!esCancelacion) {
      opciones.body = JSON.stringify({ estado });
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

    if (!cocinaMultipedidosHabilitado && estado === 'preparando') {
      const cuenta = focoCuenta || buscarCuentaPorPedido(pedidoId);
      const cuentaId = cuenta?.cuenta_id || cuenta?.id || null;
      guardarPedidoEnTrabajo(pedidoId, cuentaId);
    }

    if (
      !cocinaMultipedidosHabilitado &&
      (estado === 'listo' || estado === 'cancelado') &&
      leerPedidoEnTrabajo()?.id === pedidoId
    ) {
      limpiarPedidoEnTrabajo();
    }

    notificarActualizacionGlobal('pedido-actualizado', {
      pedidoId: Number(pedidoId),
      estado,
    });
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
  crearBannerAlarma();
  registrarDesbloqueoAudioAlarma();
  inicializarWakeLockCocina();

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

  try {
    const ultimaSync = localStorage.getItem(SYNC_STORAGE_KEY);
    if (ultimaSync) {
      procesarSyncGlobal(ultimaSync);
    }
  } catch (error) {
    console.warn('No se pudo leer el estado de sincronizacion global en cocina', error);
  }
});

window.addEventListener('beforeunload', () => {
  detenerAlarmaNuevaOrden();
  liberarWakeLockCocina().catch(() => {});
  if (refreshTimer) clearInterval(refreshTimer);
  if (recargaSyncProgramada) {
    clearTimeout(recargaSyncProgramada);
    recargaSyncProgramada = null;
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === SYNC_STORAGE_KEY) {
    procesarSyncGlobal(event.newValue);
  }
});

// Se mantiene el guardado en localStorage solo para el modo de un pedido en preparacion por cocinero.
