const resumenCantidadElement = document.getElementById('resumen-cantidad');
const resumenTotalElement = document.getElementById('resumen-total');
const tablaContainer = document.getElementById('historial-tabla');
const mensajeContainer = document.getElementById('historial-mensaje');
const filtroFechaSelect = document.getElementById('historial-fecha');
const rangoFechasContainer = document.getElementById('historial-rango-fechas');
const fechaDesdeInput = document.getElementById('historial-desde');
const fechaHastaInput = document.getElementById('historial-hasta');
const buscarInput = document.getElementById('historial-buscar');
const filtrarBtn = document.getElementById('historial-filtrar');

const modalOverlay = document.getElementById('historial-eliminar-modal');
const modalTitulo = document.getElementById('historial-eliminar-titulo');
const modalDescripcion = document.getElementById('historial-eliminar-descripcion');
const modalPasswordInput = document.getElementById('historial-eliminar-password');
const modalCancelarBtn = document.getElementById('historial-eliminar-cancelar');
const modalConfirmarBtn = document.getElementById('historial-eliminar-confirmar');
const modalMensaje = document.getElementById('historial-eliminar-mensaje');

const sessionApi = window.KANMSession;
let usuarioActual = null;

try {
  if (sessionApi && typeof sessionApi.getUser === 'function') {
    usuarioActual = sessionApi.getUser();
  } else {
    const fallback =
      sessionStorage.getItem('kanmUser') || localStorage.getItem('kanmUser');
    if (fallback) {
      const parsed = JSON.parse(fallback);
      if (parsed && typeof parsed === 'object') {
        usuarioActual = parsed;
      }
    }
  }
} catch (error) {
  console.warn('No fue posible obtener la sesión activa para historial:', error);
}

let modalEstado = null;

const estado = {
  pedidos: [],
  filtrados: [],
};

const expandirPedidosAgrupados = (grupos = []) =>
  grupos.flatMap((cuenta) =>
    (cuenta.pedidos || []).map((pedido) => ({
      ...pedido,
      cuenta_id: cuenta.cuenta_id,
      mesa: pedido.mesa ?? cuenta.mesa,
      cliente: pedido.cliente ?? cuenta.cliente,
      modo_servicio: pedido.modo_servicio ?? cuenta.modo_servicio,
      estado_cuenta: cuenta.estado_cuenta,
    }))
  );

const REFRESH_INTERVAL = 15000;
let refreshTimer = null;
let cargandoHistorial = false;
const SYNC_STORAGE_KEY = 'kanm:last-update';
let ultimaMarcaSyncProcesada = 0;

const formatearMoneda = (valor) => {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(numero);
};

const formatearFecha = (fechaTexto) => {
  if (!fechaTexto) {
    return '—';
  }

  const fecha = new Date(fechaTexto);

  if (Number.isNaN(fecha.getTime())) {
    return '—';
  }

  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');

  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
};

const mostrarMensaje = (mensaje, tipo = 'info') => {
  if (!mensajeContainer) return;
  mensajeContainer.textContent = mensaje;
  mensajeContainer.dataset.type = mensaje ? tipo : '';
};

const setModalMensaje = (mensaje, tipo = 'info') => {
  if (!modalMensaje) return;
  modalMensaje.textContent = mensaje || '';
  modalMensaje.dataset.type = mensaje ? tipo : '';
};

const cerrarModalEliminar = () => {
  if (!modalOverlay) return;
  modalOverlay.classList.remove('is-visible');
  modalOverlay.hidden = true;
  modalEstado = null;
  if (modalPasswordInput) {
    modalPasswordInput.value = '';
  }
  setModalMensaje('');
};

const abrirModalEliminar = ({ pedidoId, descripcion }) => {
  if (!modalOverlay || !modalTitulo || !modalDescripcion) {
    return;
  }

  modalEstado = { pedidoId };
  modalTitulo.textContent = 'Eliminar pedido';
  modalDescripcion.textContent =
    descripcion || 'Esta acción es irreversible. Confirma que deseas eliminar el pedido seleccionado.';

  if (modalPasswordInput) {
    modalPasswordInput.value = '';
  }
  setModalMensaje('');

  modalOverlay.hidden = false;
  requestAnimationFrame(() => {
    modalOverlay.classList.add('is-visible');
    setTimeout(() => {
      modalPasswordInput?.focus();
    }, 60);
  });
};

const eliminarPedido = async () => {
  if (!modalEstado || !modalEstado.pedidoId) {
    return;
  }

  const password = modalPasswordInput?.value?.trim();
  if (!password) {
    setModalMensaje('Ingresa la contraseña de administrador para continuar.', 'warning');
    return;
  }

  const pedidoId = modalEstado.pedidoId;

  const payload = {
    password,
    usuario: usuarioActual?.usuario || 'admin',
    rol: usuarioActual?.rol || 'admin',
    forzar: true,
  };

  if (modalConfirmarBtn) {
    modalConfirmarBtn.disabled = true;
    modalConfirmarBtn.classList.add('is-loading');
  }

  try {
    const respuesta = await fetch(`/api/admin/eliminar/pedido/${pedidoId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await respuesta.json();
    } catch (error) {
      data = {};
    }

    if (!respuesta.ok || (data && data.ok === false)) {
      const mensajeError = data?.error || 'No fue posible eliminar el pedido.';
      setModalMensaje(mensajeError, 'error');
      return;
    }

    cerrarModalEliminar();
    estado.pedidos = estado.pedidos.filter((pedido) => pedido.id !== pedidoId);
    aplicarFiltros();
    mostrarMensaje('Registro eliminado correctamente.', 'info');
  } catch (error) {
    console.error('Error al eliminar pedido desde historial:', error);
    setModalMensaje('Ocurrió un error al eliminar el pedido.', 'error');
  } finally {
    if (modalConfirmarBtn) {
      modalConfirmarBtn.disabled = false;
      modalConfirmarBtn.classList.remove('is-loading');
    }
  }
};

const calcularTotalFinal = (pedido) => {
  const base = Number(pedido.total) || 0;
  const propina = Number(pedido.propina_monto) || 0;
  const descuento = Number(pedido.descuento_monto) || 0;
  return base + propina - descuento;
};

const renderResumen = (pedidos) => {
  const cantidad = pedidos.length;
  const totalVendido = pedidos.reduce(
    (acumulado, pedido) => acumulado + calcularTotalFinal(pedido),
    0
  );

  if (resumenCantidadElement) {
    resumenCantidadElement.textContent = cantidad.toString();
  }

  if (resumenTotalElement) {
    resumenTotalElement.textContent = formatearMoneda(totalVendido);
  }
};

const renderTabla = (pedidos) => {
  if (!tablaContainer) return;

  if (!pedidos.length) {
    tablaContainer.innerHTML = '';
    mostrarMensaje('No hay pedidos pagados con los filtros seleccionados.', 'info');
    return;
  }

  const filas = pedidos
    .map((pedido) => {
      const fechaReferencia = pedido.fecha_cierre || pedido.fecha_creacion;
      const fechaFormateada = formatearFecha(fechaReferencia);
      let mesaCliente = '—';

      if (pedido.mesa && pedido.cliente) {
        mesaCliente = `${pedido.mesa} · ${pedido.cliente}`;
      } else if (pedido.mesa || pedido.cliente) {
        mesaCliente = pedido.mesa || pedido.cliente;
      }

      const propina = Number(pedido.propina_monto) || 0;
      const descuento = Number(pedido.descuento_monto) || 0;
      const totalFinal = calcularTotalFinal(pedido);

      return `
        <tr>
          <td>${pedido.id}</td>
          <td>${fechaFormateada}</td>
          <td>${mesaCliente}</td>
          <td>${formatearMoneda(pedido.subtotal)}</td>
          <td>${formatearMoneda(pedido.impuesto)}</td>
          <td>${formatearMoneda(propina)}</td>
          <td>− ${formatearMoneda(descuento)}</td>
          <td>${formatearMoneda(totalFinal)}</td>
          <td>
            <div class="tabla-acciones">
              <button type="button" class="kanm-button ghost historial-factura" data-id="${
                pedido.id
              }">Factura</button>
            </div>
          </td>
          <td>
            <div class="tabla-acciones">
              <button type="button" class="kanm-button ghost-danger historial-eliminar" data-id="${
                pedido.id
              }">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tablaContainer.innerHTML = filas;
  mostrarMensaje('');
};

const obtenerRangoFechas = () => {
  const modo = filtroFechaSelect?.value || 'hoy';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (modo === 'hoy') {
    const fin = new Date(hoy);
    fin.setHours(23, 59, 59, 999);
    return { inicio: hoy, fin };
  }

  if (modo === 'ayer') {
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() - 1);
    const fin = new Date(inicio);
    fin.setHours(23, 59, 59, 999);
    return { inicio, fin };
  }

  if (modo === 'rango') {
    const desde = fechaDesdeInput?.value;
    const hasta = fechaHastaInput?.value;

    if (!desde || !hasta) {
      mostrarMensaje('Selecciona una fecha de inicio y fin para el rango personalizado.', 'error');
      return null;
    }

    const inicio = new Date(desde);
    const fin = new Date(hasta);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      mostrarMensaje('Las fechas proporcionadas no son válidas.', 'error');
      return null;
    }

    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);

    if (inicio > fin) {
      mostrarMensaje('La fecha inicial no puede ser posterior a la fecha final.', 'error');
      return null;
    }

    return { inicio, fin };
  }

  return null;
};

const aplicarFiltros = () => {
  if (!Array.isArray(estado.pedidos)) {
    return;
  }

  let resultado = [...estado.pedidos];

  const rango = obtenerRangoFechas();
  if (filtroFechaSelect?.value === 'rango' && !rango) {
    tablaContainer.innerHTML = '';
    renderResumen([]);
    return;
  }

  if (rango) {
    resultado = resultado.filter((pedido) => {
      const fechaReferencia = new Date(pedido.fecha_cierre || pedido.fecha_creacion || 0);
      return fechaReferencia >= rango.inicio && fechaReferencia <= rango.fin;
    });
  }

  const termino = buscarInput?.value.trim().toLowerCase();
  if (termino) {
    resultado = resultado.filter((pedido) => {
      const texto = `${pedido.mesa || ''} ${pedido.cliente || ''}`.toLowerCase();
      return texto.includes(termino);
    });
  }

  resultado.sort((a, b) => {
    const fechaA = new Date(a.fecha_cierre || a.fecha_creacion || 0).getTime();
    const fechaB = new Date(b.fecha_cierre || b.fecha_creacion || 0).getTime();
    return fechaB - fechaA;
  });

  estado.filtrados = resultado;
  renderResumen(resultado);
  renderTabla(resultado);
};

const toggleRangoFechas = () => {
  if (!rangoFechasContainer) return;
  if (filtroFechaSelect?.value === 'rango') {
    rangoFechasContainer.hidden = false;
  } else {
    rangoFechasContainer.hidden = true;
    if (fechaDesdeInput) fechaDesdeInput.value = '';
    if (fechaHastaInput) fechaHastaInput.value = '';
  }
};

const cargarHistorial = async (mostrarCarga = true) => {
  if (cargandoHistorial) {
    return;
  }

  cargandoHistorial = true;

  try {
    if (mostrarCarga) {
      mostrarMensaje('Cargando historial...', 'info');
    }

    const respuesta = await fetch('/api/pedidos?estado=pagado');

    if (!respuesta.ok) {
      throw new Error('Respuesta no válida del servidor');
    }

    const pedidosAgrupados = await respuesta.json();

    const pedidos = expandirPedidosAgrupados(pedidosAgrupados);

    if (!Array.isArray(pedidos)) {
      throw new Error('Formato de datos inesperado');
    }

    estado.pedidos = pedidos;
    aplicarFiltros();
    mostrarMensaje('', 'info');
  } catch (error) {
    console.error('Error al cargar el historial de ventas:', error);
    estado.pedidos = [];
    renderResumen([]);
    if (tablaContainer) {
      tablaContainer.innerHTML = '';
    }
    mostrarMensaje('Ocurrió un error al cargar el historial. Intenta nuevamente más tarde.', 'error');
  } finally {
    cargandoHistorial = false;
  }
};

const inicializarFiltros = () => {
  filtroFechaSelect?.addEventListener('change', () => {
    toggleRangoFechas();
    aplicarFiltros();
  });

  buscarInput?.addEventListener('input', () => {
    aplicarFiltros();
  });

  filtrarBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    aplicarFiltros();
  });

  tablaContainer?.addEventListener('click', (event) => {
    const botonEliminar = event.target.closest('.historial-eliminar');
    if (botonEliminar) {
      event.preventDefault();
      const idEliminar = Number(botonEliminar.dataset.id);
      if (Number.isInteger(idEliminar) && idEliminar > 0) {
        abrirModalEliminar({
          pedidoId: idEliminar,
          descripcion: `Se eliminará el pedido #${idEliminar} del historial y reportes asociados.`,
        });
      }
      return;
    }

    const botonFactura = event.target.closest('.historial-factura');
    if (!botonFactura) return;
    const id = botonFactura.dataset.id;
    if (id) {
      window.open(`/factura.html?id=${id}`, '_blank');
    }
  });
};

modalCancelarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  cerrarModalEliminar();
});

modalOverlay?.addEventListener('click', (event) => {
  if (event.target === modalOverlay) {
    cerrarModalEliminar();
  }
});

modalConfirmarBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  eliminarPedido();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalOverlay && !modalOverlay.hidden) {
    cerrarModalEliminar();
  }
});

const iniciarActualizacionPeriodicaHistorial = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    cargarHistorial(false);
  }, REFRESH_INTERVAL);
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

    if (
      ['pedido-cobrado', 'pedido-actualizado', 'nota-credito-creada', 'cierre-registrado'].includes(
        data.evento
      )
    ) {
      cargarHistorial(false).catch((error) => {
        console.error('Error al refrescar el historial tras sincronización:', error);
      });
    }
  } catch (error) {
    console.warn('No fue posible actualizar el historial con la sincronización recibida:', error);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  toggleRangoFechas();
  inicializarFiltros();
  cargarHistorial(true);
  iniciarActualizacionPeriodicaHistorial();
});

window.addEventListener('beforeunload', () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === SYNC_STORAGE_KEY) {
    procesarSyncGlobal(event.newValue);
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    cargarHistorial(false).catch((error) => {
      console.error('Error al refrescar el historial al volver a la pestaña:', error);
    });
  }
});