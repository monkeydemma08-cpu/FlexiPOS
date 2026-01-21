(() => {
  const ORIGEN_CAJA = 'mostrador';
  const REFRESH_INTERVAL = 15000;
  const SYNC_STORAGE_KEY = 'kanm:last-update';
  const FONDO_STORAGE_PREFIX = 'kanm:mostrador:fondo-inicial:';

  const cuadreFechaInput = document.getElementById('cuadre-fecha');
  const cuadreTotalSistemaDisplay = document.getElementById('cuadre-total-sistema');
  const cuadreCantidadPedidosDisplay = document.getElementById('cuadre-cantidad-pedidos');
  const cuadreTotalEfectivoDisplay = document.getElementById('cuadre-total-efectivo');
  const cuadreTotalTarjetaDisplay = document.getElementById('cuadre-total-tarjeta');
  const cuadreTotalTransferenciaDisplay = document.getElementById('cuadre-total-transferencia');
  const cuadreTotalGeneralDisplay = document.getElementById('cuadre-total-general');
  const cuadreFondoInicialDisplay = document.getElementById('cuadre-fondo-display');
  const cuadreSalidasDisplay = document.getElementById('cuadre-salidas-display');
  const cuadreEfectivoEsperadoDisplay = document.getElementById('cuadre-efectivo-esperado');
  const cuadreDeclaradoInput = document.getElementById('cuadre-total-declarado');
  const cuadreDiferenciaDisplay = document.getElementById('cuadre-diferencia');
  const cuadreUsuarioInput = document.getElementById('cuadre-usuario');
  const cuadreObservacionesInput = document.getElementById('cuadre-observaciones');
  const cuadreMensaje = document.getElementById('cuadre-mensaje');
  const cuadreRegistrarBtn = document.getElementById('cuadre-registrar');
  const cuadreDetalleWrapper = document.getElementById('cuadre-detalle-wrapper');
  const cuadreDetalleBody = document.getElementById('cuadre-detalle-body');
  const cuadreDetalleBtn = document.getElementById('cuadre-ver-detalle');
  const cuadreFondoInicialInput = document.getElementById('cuadre-fondo-inicial');

  const salidasMensaje = document.getElementById('salidas-mensaje');
  const salidasListaBody = document.getElementById('salida-lista');
  const salidaDescripcionInput = document.getElementById('salida-descripcion');
  const salidaMontoInput = document.getElementById('salida-monto');
  const salidaAgregarBtn = document.getElementById('salida-agregar');

  const tabsMostrador = Array.from(document.querySelectorAll('.caja-tabs .kanm-tab'));
  const panelVenta = document.getElementById('panel-venta');
  const panelCuadre = document.getElementById('panel-cuadre');

  if (!cuadreFechaInput) {
    return;
  }

  let resumenCuadre = {
    fecha: '',
    totalSistema: 0,
    totalGeneral: 0,
    totalEfectivo: 0,
    totalTarjeta: 0,
    totalTransferencia: 0,
    totalDescuentos: 0,
    cantidadPedidos: 0,
    pedidos: [],
  };

  let salidasDia = [];
  let totalSalidas = 0;

  const detalleCuadreCache = new Map();
  let detalleCuadreIdActivo = null;
  let detalleCuadreFilaActiva = null;

  let refreshTimer = null;
  let recargandoEstado = false;
  let ultimaMarcaSyncProcesada = 0;

  const obtenerUsuarioActual = () => {
    try {
      return window.KANMSession?.getUser?.() || null;
    } catch (error) {
      return null;
    }
  };

  const authApi = window.kanmAuth;

  const obtenerTokenDesdeStorage = () => {
    try {
      const raw =
        window.sessionStorage?.getItem?.('kanmUser') ||
        window.localStorage?.getItem?.('kanmUser') ||
        '';
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.token || null;
    } catch (error) {
      return null;
    }
  };

  const obtenerAuthHeaders = () => {
    try {
      const headers = authApi?.getAuthHeaders?.();
      if (headers && Object.keys(headers).length) {
        return headers;
      }
    } catch (error) {
      console.warn('No se pudieron obtener encabezados de autenticacion desde kanmAuth:', error);
    }

    const token = obtenerTokenDesdeStorage();
    if (token) {
      return {
        'x-session-token': token,
        Authorization: `Bearer ${token}`,
      };
    }

    return {};
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
  const leerRespuestaJson = async (respuesta) => {
    const contentType = respuesta.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await respuesta.json().catch(() => null);
      return { data, esJson: true, contentType };
    }
    const texto = await respuesta.text().catch(() => '');
    return { data: texto, esJson: false, contentType };
  };

  const construirErrorNoJson = (respuesta, contenido, contentType) => {
    let mensaje = 'Respuesta inesperada del servidor.';
    if (respuesta.status === 404) {
      mensaje = 'Ruta no existe o servicio no disponible.';
    } else if (respuesta.status >= 500) {
      mensaje = 'Error del servidor. Intenta nuevamente.';
    }
    console.error('Respuesta no JSON en mostrador:', {
      status: respuesta.status,
      contentType,
      body: contenido,
    });
    return new Error(mensaje);
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

      const eventosRelevantes = [
        'cuenta-cobrada',
        'pedido-cobrado',
        'pedido-actualizado',
        'cierre-registrado',
        'nota-credito-creada',
      ];

      if (!data.evento || eventosRelevantes.includes(data.evento)) {
        recargarEstadoMostrador(false).catch((error) => {
          console.error('Error al refrescar el cuadre tras sincronizacion:', error);
        });
      }
    } catch (error) {
      console.warn('No fue posible interpretar la sincronizacion global en mostrador:', error);
    }
  };

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

  const formatCurrencySigned = (valor) => {
    const numero = Number(valor) || 0;
    if (numero === 0) {
      return formatCurrency(0);
    }
    const simbolo = numero > 0 ? '+ ' : '- ';
    return `${simbolo}${formatCurrency(Math.abs(numero))}`;
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
    if (!fecha) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: true,
      timeZone: 'America/Santo_Domingo',
    }).format(fecha);
  };

  const setCampoCuadre = (id, valor, { currency = true } = {}) => {
    const val = currency ? formatCurrency(valor) : valor;
    document.querySelectorAll(`#${id}`).forEach((el) => {
      if ('value' in el) {
        el.value = val;
      } else {
        el.textContent = val;
      }
    });
  };

  const setCampoCuadreTexto = (id, texto = '') => {
    document.querySelectorAll(`#${id}`).forEach((el) => {
      if ('value' in el) {
        el.value = texto;
      } else {
        el.textContent = texto;
      }
    });
  };

  const obtenerFechaLocalHoy = () => {
    const ahora = new Date();
    const tzOffset = ahora.getTimezoneOffset();
    const local = new Date(ahora.getTime() - tzOffset * 60000);
    return local.toISOString().slice(0, 10);
  };

  const mostrarTab = (tab) => {
    if (!tabsMostrador.length) return;

    tabsMostrador.forEach((btn) => {
      const activo = btn.dataset.tab === tab;
      btn.classList.toggle('active', activo);
      btn.setAttribute('aria-selected', activo ? 'true' : 'false');
    });

    if (panelVenta) {
      panelVenta.classList.toggle('hidden', tab !== 'venta');
    }
    if (panelCuadre) {
      panelCuadre.classList.toggle('hidden', tab !== 'cuadre');
    }
  };

  const setSalidasMensaje = (texto, tipo = 'info') => {
    if (!salidasMensaje) return;
    salidasMensaje.textContent = texto || '';
    salidasMensaje.dataset.type = texto ? tipo : '';
  };
  const renderSalidas = () => {
    if (!salidasListaBody) return;

    salidasListaBody.innerHTML = '';

    if (!salidasDia.length) {
      const fila = document.createElement('div');
      fila.className = 'salida-empty';
      fila.textContent = 'No hay salidas registradas para esta fecha.';
      salidasListaBody.appendChild(fila);
      setSalidasMensaje('');
      return;
    }

    const fragment = document.createDocumentFragment();
    salidasDia.forEach((salida) => {
      const row = document.createElement('div');
      row.className = 'salida-row';
      const fecha = formatDateTime(salida.created_at || salida.fecha);
      row.innerHTML = `
        <span class="salida-fecha">${fecha}</span>
        <span class="salida-desc">${salida.descripcion || 'Sin descripcion'}</span>
        <span class="salida-monto">${formatCurrency(salida.monto)}</span>
      `;
      fragment.appendChild(row);
    });

    salidasListaBody.appendChild(fragment);
    setSalidasMensaje('');
  };

  const cargarSalidas = async (fecha, mostrarCarga = false) => {
    const fechaConsulta = fecha || cuadreFechaInput?.value || resumenCuadre.fecha || obtenerFechaLocalHoy();

    try {
      if (mostrarCarga) setSalidasMensaje('Cargando salidas...', 'info');

      const params = new URLSearchParams({
        fecha: fechaConsulta,
        origen: ORIGEN_CAJA,
      });

      const respuesta = await fetchAutorizado(`/api/caja/salidas?${params.toString()}`);
      const { data, esJson, contentType } = await leerRespuestaJson(respuesta);

      if (!esJson) {
        throw construirErrorNoJson(respuesta, data, contentType);
      }

      if (!respuesta.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudieron cargar las salidas de caja.');
      }

      if (!data.ok && data.total === undefined && !Array.isArray(data.salidas)) {
        throw new Error(data.error || 'No se pudieron cargar las salidas de caja.');
      }

      totalSalidas = Number(data.total || data.total_salidas || 0);
      salidasDia = Array.isArray(data.salidas) ? data.salidas : [];

      if (cuadreSalidasDisplay) {
        cuadreSalidasDisplay.textContent = formatCurrency(totalSalidas);
      }

      renderSalidas();
      actualizarEfectivoEsperado();
      actualizarDiferenciaCuadre();
    } catch (error) {
      console.error('Error al cargar salidas:', error);
      setSalidasMensaje('No se pudieron cargar las salidas de caja.', 'error');
    }
  };

  const registrarSalida = async () => {
    const descripcion = salidaDescripcionInput?.value?.trim() || '';
    const monto = parseMoneyValue(salidaMontoInput, { allowEmpty: false });
    const fecha = cuadreFechaInput?.value || resumenCuadre.fecha || obtenerFechaLocalHoy();

    if (!descripcion) {
      setSalidasMensaje('Ingresa una descripcion para la salida.', 'error');
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      setSalidasMensaje('Ingresa un monto valido mayor a 0.', 'error');
      return;
    }

    try {
      if (salidaAgregarBtn) salidaAgregarBtn.disabled = true;
      setSalidasMensaje('Registrando salida...', 'info');

      const respuesta = await fetchAutorizado('/api/caja/salidas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ descripcion, monto, fecha, origen_caja: ORIGEN_CAJA }),
      });

      const { data, esJson, contentType } = await leerRespuestaJson(respuesta);

      if (!esJson) {
        throw construirErrorNoJson(respuesta, data, contentType);
      }

      if (!respuesta.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo registrar la salida.');
      }

      if (salidaDescripcionInput) salidaDescripcionInput.value = '';
      if (salidaMontoInput) setMoneyInputValue(salidaMontoInput, '');

      await cargarSalidas(fecha, false);
      await cargarResumenCuadre(false);
      setSalidasMensaje('Salida registrada correctamente.', 'info');
    } catch (error) {
      console.error('Error al registrar salida:', error);
      setSalidasMensaje(error.message || 'No se pudo registrar la salida.', 'error');
    } finally {
      if (salidaAgregarBtn) salidaAgregarBtn.disabled = false;
    }
  };
  const obtenerFechaFondoInicial = (fecha) => {
    if (fecha) return fecha;
    if (cuadreFechaInput?.value) return cuadreFechaInput.value;
    if (resumenCuadre?.fecha) return resumenCuadre.fecha;
    return obtenerFechaLocalHoy();
  };

  const obtenerKeyFondoInicial = (fecha) => `${FONDO_STORAGE_PREFIX}${obtenerFechaFondoInicial(fecha)}`;

  const leerFondoInicialPersistido = (fecha) => {
    if (!window.localStorage) return null;
    try {
      const raw = localStorage.getItem(obtenerKeyFondoInicial(fecha));
      if (raw === null || raw === undefined || raw === '') return null;
      const valor = Number(raw);
      if (!Number.isFinite(valor) || valor < 0) return null;
      return valor;
    } catch (error) {
      return null;
    }
  };

  const guardarFondoInicialPersistido = (fecha) => {
    if (!window.localStorage || !cuadreFondoInicialInput) return;
    try {
      const raw = cuadreFondoInicialInput.value;
      const key = obtenerKeyFondoInicial(fecha);
      if (raw === null || raw === undefined || raw === '') {
        localStorage.removeItem(key);
        return;
      }
      const valor = parseMoneyValue(cuadreFondoInicialInput, { allowEmpty: false });
      if (!Number.isFinite(valor) || valor < 0) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, String(valor));
    } catch (error) {
      return;
    }
  };

  const aplicarFondoInicialPersistido = (fecha, { force = false } = {}) => {
    if (!cuadreFondoInicialInput) return;
    if (!force && cuadreFondoInicialInput.dataset.dirty) return;
    const valor = leerFondoInicialPersistido(fecha);
    if (valor === null) {
      if (force) {
        setMoneyInputValue(cuadreFondoInicialInput, '');
        delete cuadreFondoInicialInput.dataset.dirty;
      }
      return;
    }
    setMoneyInputValue(cuadreFondoInicialInput, valor);
    delete cuadreFondoInicialInput.dataset.dirty;
  };

  const obtenerFondoInicial = () => {
    const valor = parseMoneyValue(cuadreFondoInicialInput, { allowEmpty: false });
    if (Number.isNaN(valor) || valor < 0) return 0;
    return valor;
  };

  const obtenerSalidasEfectivo = () => totalSalidas;

  const calcularEfectivoEsperado = () => {
    const fondo = obtenerFondoInicial();
    const salidas = totalSalidas;
    const ventasEfectivo = Number(resumenCuadre.totalEfectivo) || 0;
    const esperado = fondo + ventasEfectivo - salidas;
    return Number.isFinite(esperado) ? esperado : 0;
  };

  const actualizarEfectivoEsperado = () => {
    const esperado = calcularEfectivoEsperado();
    resumenCuadre.totalSistema = esperado;

    setCampoCuadre('cuadre-total-sistema', esperado);
    setCampoCuadre('cuadre-fondo-display', obtenerFondoInicial());
    setCampoCuadre('cuadre-salidas-display', obtenerSalidasEfectivo());
    setCampoCuadre('cuadre-efectivo-esperado', esperado);
  };

  const obtenerMetodoPagoLabel = (pedido = {}) => {
    const efectivoRegistrado = Number(pedido.pago_efectivo) || 0;
    const cambioRegistrado = Number(pedido.pago_cambio) || 0;
    const efectivoAplicado = Math.max(efectivoRegistrado - cambioRegistrado, 0);
    const tarjeta = Number(pedido.pago_tarjeta) || 0;
    const transferencia = Number(pedido.pago_transferencia) || 0;

    const partes = [];
    if (efectivoAplicado > 0) partes.push('Efectivo');
    if (tarjeta > 0) partes.push('Tarjeta');
    if (transferencia > 0) partes.push('Transferencia/Deposito');

    return partes.length ? partes.join(' + ') : 'Sin registrar';
  };

  const limpiarDetalleCuadreExpandido = () => {
    if (detalleCuadreFilaActiva) {
      detalleCuadreFilaActiva.classList.remove('is-expanded');
      detalleCuadreFilaActiva.setAttribute('aria-expanded', 'false');
    }
    detalleCuadreFilaActiva = null;
    detalleCuadreIdActivo = null;
    const existente = cuadreDetalleBody?.querySelector('tr.cuadre-detalle-expand');
    if (existente) existente.remove();
  };

  const construirDetalleCuadreProductos = (cuenta) => {
    const items = Array.isArray(cuenta?.items_agregados) ? cuenta.items_agregados : [];
    if (!items.length) {
      return `
        <div class="cuadre-detalle-panel">
          <div class="cuadre-detalle-empty">No hay productos registrados para esta venta.</div>
        </div>
      `;
    }

    const filas = items
      .map((item) => {
        const nombre = item.nombre || 'Producto';
        const cantidad = Number(item.cantidad) || 0;
        const precio = Number(item.precio_unitario) || 0;
        const totalLinea = Number(item.total_linea) || 0;
        const descuento = Number(item.descuento_monto) || 0;
        const detalle = `${cantidad} x ${formatCurrency(precio)} = ${formatCurrency(totalLinea)}`;
        const textoDescuento = descuento > 0 ? ` (Desc. ${formatCurrency(descuento)})` : '';
        return `
          <div class="cuadre-detalle-item">
            <span class="cuadre-detalle-nombre">${nombre}</span>
            <span class="cuadre-detalle-meta">${detalle}${textoDescuento}</span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="cuadre-detalle-panel">
        <div class="cuadre-detalle-title">Productos vendidos</div>
        <div class="cuadre-detalle-items">${filas}</div>
      </div>
    `;
  };

  const obtenerDetalleCuadre = async (cuadreId) => {
    const respuesta = await fetchAutorizado(`/api/caja/cuadre/${cuadreId}/detalle?origen=${ORIGEN_CAJA}`);
    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el detalle de la venta.');
    }
    const data = await respuesta.json();
    if (!data?.ok || !data.cuenta) {
      throw new Error(data?.error || 'No se pudo obtener el detalle de la venta.');
    }
    return data.cuenta;
  };

  const mostrarDetalleCuadre = async (fila, cuadreId) => {
    if (!cuadreDetalleBody) return;
    if (detalleCuadreIdActivo === cuadreId) {
      limpiarDetalleCuadreExpandido();
      return;
    }

    limpiarDetalleCuadreExpandido();
    detalleCuadreIdActivo = cuadreId;
    detalleCuadreFilaActiva = fila;
    fila.classList.add('is-expanded');
    fila.setAttribute('aria-expanded', 'true');

    const filaDetalle = document.createElement('tr');
    filaDetalle.className = 'cuadre-detalle-expand';
    const celda = document.createElement('td');
    celda.colSpan = 5;
    celda.textContent = 'Cargando productos...';
    filaDetalle.appendChild(celda);
    fila.parentNode?.insertBefore(filaDetalle, fila.nextSibling);

    try {
      let cuenta = detalleCuadreCache.get(cuadreId);
      if (!cuenta) {
        cuenta = await obtenerDetalleCuadre(cuadreId);
        detalleCuadreCache.set(cuadreId, cuenta);
      }
      celda.innerHTML = construirDetalleCuadreProductos(cuenta);
    } catch (error) {
      celda.textContent = error?.message || 'No se pudo cargar el detalle de productos. Intenta nuevamente.';
    }
  };
  const setCuadreMensaje = (texto, tipo = 'info') => {
    if (!cuadreMensaje) return;
    cuadreMensaje.textContent = texto || '';
    cuadreMensaje.dataset.type = texto ? tipo : '';
  };

  const resetFormularioCuadre = () => {
    if (cuadreDeclaradoInput) setMoneyInputValue(cuadreDeclaradoInput, '');

    if (cuadreFondoInicialInput) {
      setMoneyInputValue(cuadreFondoInicialInput, '');
      delete cuadreFondoInicialInput.dataset.dirty;
    }

    const usuarioActual = obtenerUsuarioActual();
    if (cuadreUsuarioInput) {
      cuadreUsuarioInput.value = usuarioActual?.nombre || usuarioActual?.usuario || '';
    }

    if (cuadreObservacionesInput) cuadreObservacionesInput.value = '';
    if (cuadreDiferenciaDisplay) {
      cuadreDiferenciaDisplay.textContent = formatCurrencySigned(0);
      cuadreDiferenciaDisplay.dataset.sign = 'neutral';
    }

    actualizarEfectivoEsperado();
  };

  const actualizarDiferenciaCuadre = () => {
    if (!cuadreDiferenciaDisplay) return;

    const valorEntrada = cuadreDeclaradoInput?.value;
    if (valorEntrada === '' || valorEntrada === null || valorEntrada === undefined) {
      cuadreDiferenciaDisplay.textContent = formatCurrencySigned(0);
      cuadreDiferenciaDisplay.dataset.sign = 'neutral';
      return;
    }

    const declarado = parseMoneyValue(cuadreDeclaradoInput, { allowEmpty: false });
    if (Number.isNaN(declarado)) {
      cuadreDiferenciaDisplay.textContent = formatCurrencySigned(0);
      cuadreDiferenciaDisplay.dataset.sign = 'neutral';
      return;
    }

    const esperado = calcularEfectivoEsperado();
    const diferencia = declarado - esperado;
    cuadreDiferenciaDisplay.textContent = formatCurrencySigned(diferencia);
    cuadreDiferenciaDisplay.dataset.sign =
      diferencia > 0 ? 'positivo' : diferencia < 0 ? 'negativo' : 'neutral';
  };

  const renderDetalleCuadreActual = () => {
    if (!cuadreDetalleBody || !cuadreDetalleWrapper) return;

    cuadreDetalleBody.innerHTML = '';
    detalleCuadreIdActivo = null;
    detalleCuadreFilaActiva = null;

    if (!resumenCuadre.pedidos || !resumenCuadre.pedidos.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 5;
      celda.textContent = 'No hay pedidos pendientes de cuadre en este turno.';
      fila.appendChild(celda);
      cuadreDetalleBody.appendChild(fila);
      return;
    }

    const fragment = document.createDocumentFragment();

    resumenCuadre.pedidos.forEach((pedido) => {
      const fila = document.createElement('tr');
      const total =
        (Number(pedido.subtotal) || 0) +
        (Number(pedido.impuesto) || 0) -
        (Number(pedido.descuento_monto) || 0) +
        (Number(pedido.propina_monto) || 0);

      const mesaCliente = pedido.mesa && pedido.cliente
        ? `${pedido.mesa} - ${pedido.cliente}`
        : pedido.mesa || pedido.cliente || 'N/D';

      const metodoLabel = obtenerMetodoPagoLabel(pedido);

      fila.dataset.cuadreId = pedido.id;
      fila.style.cursor = 'pointer';
      fila.setAttribute('aria-expanded', 'false');
      fila.setAttribute('title', 'Haz clic para ver productos');
      fila.innerHTML = `
        <td>#${pedido.id}</td>
        <td>${mesaCliente}</td>
        <td>${formatDateTime(pedido.fecha_cierre || pedido.pedidos?.[0]?.fecha_cierre)}</td>
        <td>${metodoLabel}</td>
        <td>${formatCurrency(total)}</td>
      `;

      fragment.appendChild(fila);
    });

    cuadreDetalleBody.appendChild(fragment);
  };
  const cargarResumenCuadre = async (mostrarCarga = true) => {
    if (!cuadreFechaInput) return;

    const fechaSeleccionada = cuadreFechaInput.value || resumenCuadre.fecha || obtenerFechaLocalHoy();
    const params = new URLSearchParams({
      fecha: fechaSeleccionada,
      detalle: '1',
      turno: '1',
      origen: ORIGEN_CAJA,
    });

    try {
      if (mostrarCarga) {
        setCuadreMensaje('Cargando resumen del dia...', 'info');
      }

      const respuesta = await fetchAutorizado(`/api/caja/resumen-dia?${params.toString()}`);
      if (!respuesta.ok) {
        throw new Error('No se pudo obtener el resumen diario.');
      }

      const data = await respuesta.json();
      if (!data.ok) {
        throw new Error(data.error || 'No se pudo obtener el resumen diario.');
      }

      const fechaAnterior = resumenCuadre.fecha;
      const fecha = data.fecha || fechaSeleccionada;

      resumenCuadre = {
        fecha,
        totalSistema: Number(data.total_sistema) || 0,
        totalGeneral: Number(data.total_general) || 0,
        totalEfectivo: Number(data.total_efectivo) || 0,
        totalTarjeta: Number(data.total_tarjeta) || 0,
        totalTransferencia: Number(data.total_transferencia) || 0,
        totalDescuentos: Number(data.total_descuentos) || 0,
        cantidadPedidos: Number(data.cantidad_pedidos) || 0,
        pedidos: Array.isArray(data.pedidos) ? data.pedidos : [],
      };

      totalSalidas = Number(data.total_salidas) || 0;
      salidasDia = Array.isArray(data.salidas) ? data.salidas : salidasDia;

      if (fecha !== fechaAnterior) {
        detalleCuadreCache.clear();
        limpiarDetalleCuadreExpandido();
      }

      cuadreFechaInput.value = fecha;
      aplicarFondoInicialPersistido(fecha, { force: fecha !== fechaAnterior });

      setCampoCuadre('cuadre-total-sistema', resumenCuadre.totalSistema);
      setCampoCuadre('cuadre-total-efectivo', resumenCuadre.totalEfectivo);
      setCampoCuadre('cuadre-total-tarjeta', resumenCuadre.totalTarjeta);
      setCampoCuadre('cuadre-total-transferencia', resumenCuadre.totalTransferencia);
      setCampoCuadre('cuadre-salidas-display', totalSalidas);
      setCampoCuadre('cuadre-total-general', resumenCuadre.totalGeneral || resumenCuadre.totalSistema || 0);
      setCampoCuadre('cuadre-total-descuentos', Number(data.total_descuentos) || 0);
      setCampoCuadreTexto('cuadre-cantidad-pedidos', resumenCuadre.cantidadPedidos.toString());

      renderSalidas();
      actualizarEfectivoEsperado();
      actualizarDiferenciaCuadre();

      if (mostrarCarga || (cuadreMensaje && cuadreMensaje.dataset.type === 'error')) {
        setCuadreMensaje('', 'info');
      }

      renderDetalleCuadreActual();
    } catch (error) {
      console.error('Error al cargar el resumen del cuadre:', error);
      setCuadreMensaje(
        error.message || 'No se pudo cargar el resumen de ventas del dia. Intenta nuevamente.',
        'error'
      );

      resumenCuadre = {
        fecha: fechaSeleccionada,
        totalSistema: 0,
        totalGeneral: 0,
        totalEfectivo: 0,
        totalTarjeta: 0,
        totalTransferencia: 0,
        totalDescuentos: 0,
        cantidadPedidos: 0,
        pedidos: [],
      };

      totalSalidas = 0;
      salidasDia = [];

      setCampoCuadre('cuadre-total-sistema', 0);
      setCampoCuadre('cuadre-total-efectivo', 0);
      setCampoCuadre('cuadre-total-tarjeta', 0);
      setCampoCuadre('cuadre-total-transferencia', 0);
      setCampoCuadre('cuadre-salidas-display', 0);
      setCampoCuadre('cuadre-total-general', 0);
      setCampoCuadre('cuadre-total-descuentos', 0);
      setCampoCuadreTexto('cuadre-cantidad-pedidos', '0');

      actualizarEfectivoEsperado();
      actualizarDiferenciaCuadre();
      renderDetalleCuadreActual();
    }
  };
  const recargarEstadoMostrador = async (mostrarCarga = true) => {
    if (recargandoEstado) return;
    recargandoEstado = true;

    try {
      await cargarResumenCuadre(mostrarCarga);
    } finally {
      recargandoEstado = false;
    }
  };

  const iniciarActualizacionPeriodica = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(() => {
      recargarEstadoMostrador(false).catch((error) => {
        console.error('Error al actualizar el cuadre automaticamente:', error);
      });
    }, REFRESH_INTERVAL);
  };

  const registrarCuadre = async () => {
    if (!cuadreRegistrarBtn) return;

    const usuarioActual = obtenerUsuarioActual();
    const nombre = usuarioActual?.nombre || usuarioActual?.usuario || cuadreUsuarioInput?.value?.trim();
    if (!nombre) {
      setCuadreMensaje('No se pudo identificar al usuario que realiza el cuadre.', 'error');
      return;
    }

    const montoDeclarado = parseMoneyValue(cuadreDeclaradoInput, { allowEmpty: false });
    if (!Number.isFinite(montoDeclarado) || montoDeclarado < 0) {
      setCuadreMensaje('Ingresa un monto contado valido mayor o igual a 0.', 'error');
      return;
    }

    const fechaOperacion = cuadreFechaInput?.value || resumenCuadre.fecha || obtenerFechaLocalHoy();

    const payload = {
      fecha_operacion: fechaOperacion,
      usuario: nombre,
      total_declarado: montoDeclarado,
      observaciones: cuadreObservacionesInput?.value,
      fondo_inicial: obtenerFondoInicial(),
      origen_caja: ORIGEN_CAJA,
    };

    try {
      const sessionApi = window.KANMSession;
      const usuario =
        (sessionApi && typeof sessionApi.getUser === 'function' && sessionApi.getUser()) ||
        JSON.parse(sessionStorage.getItem('kanmUser') || 'null') ||
        null;

      if (usuario?.rol) {
        payload.usuario_rol = usuario.rol;
      }
      if (usuario?.id) {
        payload.usuario_id = usuario.id;
      }
    } catch (error) {
      console.warn('No fue posible leer el rol del usuario para el cuadre:', error);
    }

    try {
      setCuadreMensaje('Registrando cuadre...', 'info');
      cuadreRegistrarBtn.disabled = true;
      cuadreRegistrarBtn.classList.add('is-loading');

      const respuesta = await fetchAutorizado('/api/caja/cierres', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await respuesta.json().catch(() => ({ ok: false }));
      if (!respuesta.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo registrar el cuadre de caja.');
      }

      setCuadreMensaje('Cuadre registrado correctamente.', 'info');
      resetFormularioCuadre();

      await recargarEstadoMostrador(false);
      notificarActualizacionGlobal('cierre-registrado', { cierreId: data.cierre?.id });

      if (data.cierre) {
        document.dispatchEvent(
          new CustomEvent('kanm:cuadre-registrado', { detail: { cierre: data.cierre } })
        );
      } else {
        document.dispatchEvent(new CustomEvent('kanm:cuadre-registrado'));
      }
    } catch (error) {
      console.error('Error al registrar el cuadre de caja:', error);
      setCuadreMensaje(error.message || 'No se pudo registrar el cuadre de caja.', 'error');
    } finally {
      cuadreRegistrarBtn.disabled = false;
      cuadreRegistrarBtn.classList.remove('is-loading');
    }
  };

  const inicializarCuadre = () => {
    if (!cuadreFechaInput) return;

    const usuario = obtenerUsuarioActual();
    if (cuadreUsuarioInput) {
      cuadreUsuarioInput.value = usuario?.nombre || usuario?.usuario || '';
      cuadreUsuarioInput.readOnly = true;
    }

    if (!cuadreFechaInput.value) {
      cuadreFechaInput.value = resumenCuadre.fecha || obtenerFechaLocalHoy();
    }

    cuadreFondoInicialInput?.addEventListener('input', () => {
      cuadreFondoInicialInput.dataset.dirty = 'true';
      setCuadreMensaje('');
      actualizarEfectivoEsperado();
      actualizarDiferenciaCuadre();
      guardarFondoInicialPersistido();
    });

    cuadreFechaInput.addEventListener('change', () => {
      cargarResumenCuadre();
    });

    cuadreDeclaradoInput?.addEventListener('input', () => {
      setCuadreMensaje('');
      actualizarDiferenciaCuadre();
    });

    cuadreRegistrarBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      registrarCuadre();
    });

    salidaAgregarBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      registrarSalida();
    });

    cuadreDetalleBtn?.addEventListener('click', () => {
      if (!cuadreDetalleWrapper) return;
      cuadreDetalleWrapper.hidden = !cuadreDetalleWrapper.hidden;
      if (!cuadreDetalleWrapper.hidden) {
        renderDetalleCuadreActual();
      }
    });

    cuadreDetalleBody?.addEventListener('click', (event) => {
      const fila = event.target.closest('tr');
      if (!fila || fila.classList.contains('cuadre-detalle-expand')) return;
      const cuadreId = Number(fila.dataset.cuadreId);
      if (!Number.isFinite(cuadreId) || cuadreId <= 0) return;
      mostrarDetalleCuadre(fila, cuadreId);
    });

    actualizarDiferenciaCuadre();
  };

  const inicializarTabs = () => {
    if (!tabsMostrador.length) return;

    tabsMostrador.forEach((btn) => {
      btn.addEventListener('click', () => {
        mostrarTab(btn.dataset.tab || 'venta');
      });
    });

    mostrarTab('venta');
  };

  window.addEventListener('DOMContentLoaded', () => {
    inicializarTabs();
    recargarEstadoMostrador(true);
    inicializarCuadre();
    iniciarActualizacionPeriodica();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === SYNC_STORAGE_KEY) {
      procesarSyncGlobal(event.newValue);
    }
  });
})();
