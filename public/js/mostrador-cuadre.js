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
    efectivoEsperado: 0,
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
      ? window.KANMMoney.parse(texto)
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

  const panelCuentas = document.getElementById('panel-cuentas');
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
    if (panelCuentas) {
      panelCuentas.classList.toggle('hidden', tab !== 'cuentas');
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
    resumenCuadre.efectivoEsperado = esperado;

    setCampoCuadre('cuadre-total-sistema', resumenCuadre.totalGeneral || resumenCuadre.totalSistema || 0);
    setCampoCuadre('cuadre-fondo-display', obtenerFondoInicial());
    setCampoCuadre('cuadre-salidas-display', obtenerSalidasEfectivo());
    setCampoCuadre('cuadre-efectivo-esperado', esperado);
  };

  const obtenerEfectivoAplicadoCuadre = (pedido = {}) => {
    const efectivoRegistrado = Number(pedido.pago_efectivo) || 0;
    if (efectivoRegistrado > 0) return efectivoRegistrado;

    const efectivoEntregado = Number(pedido.pago_efectivo_entregado) || 0;
    const cambioRegistrado = Number(pedido.pago_cambio) || 0;
    const efectivoInferido = Math.max(efectivoEntregado - cambioRegistrado, 0);
    if (efectivoInferido > 0) return efectivoInferido;

    const tarjeta = Number(pedido.pago_tarjeta) || 0;
    const transferencia = Number(pedido.pago_transferencia) || 0;
    const totalPedido = Math.max(
      (Number(pedido.subtotal) || 0) +
        (Number(pedido.impuesto) || 0) -
        (Number(pedido.descuento_monto) || 0) +
        (Number(pedido.propina_monto) || 0),
      0
    );
    if (tarjeta <= 0 && transferencia <= 0 && totalPedido > 0) {
      return totalPedido;
    }

    return 0;
  };

  const obtenerMetodoPagoLabel = (pedido = {}) => {
    const efectivoAplicado = obtenerEfectivoAplicadoCuadre(pedido);
    const tarjeta = Number(pedido.pago_tarjeta) || 0;
    const transferencia = Number(pedido.pago_transferencia) || 0;

    const partes = [];
    if (efectivoAplicado > 0) partes.push('Efectivo');
    if (tarjeta > 0) partes.push('Tarjeta');
    if (transferencia > 0) partes.push('Transferencia/Deposito');

    return partes.length ? partes.join(' + ') : 'Sin registrar';
  };

  // Métodos de pago editables en el cuadre (igual que caja).
  const METODOS_PAGO_CUADRE = [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'tarjeta', label: 'Tarjeta' },
    { value: 'transferencia', label: 'Transferencia/Deposito' },
  ];

  // Detecta el método "primario" del pedido para preseleccionar el select.
  const obtenerMetodoPagoValorCuadre = (pedido = {}) => {
    const efectivoAplicado = obtenerEfectivoAplicadoCuadre(pedido);
    const tarjeta = Number(pedido.pago_tarjeta) || 0;
    const transferencia = Number(pedido.pago_transferencia) || 0;
    const activos = [
      efectivoAplicado > 0 ? 'efectivo' : null,
      tarjeta > 0 ? 'tarjeta' : null,
      transferencia > 0 ? 'transferencia' : null,
    ].filter(Boolean);
    if (!activos.length) return 'sin_registrar';
    if (activos.length > 1) return 'mixto';
    return activos[0];
  };

  // Actualiza el método de pago de una cuenta cobrada (replica de caja.js).
  // Llama al endpoint PUT /api/caja/cuadre/:id/metodo-pago con origen=mostrador.
  const actualizarMetodoPagoCuadre = async (cuentaId, metodo, control = null) => {
    const cuentaNum = Number(cuentaId);
    if (!Number.isFinite(cuentaNum) || cuentaNum <= 0) {
      setCuadreMensaje('Cuenta invalida para actualizar metodo de pago.', 'error');
      return;
    }
    const metodoNormalizado = (metodo || '').toString().trim().toLowerCase();
    if (!METODOS_PAGO_CUADRE.some((item) => item.value === metodoNormalizado)) {
      setCuadreMensaje('Selecciona un metodo de pago valido.', 'error');
      return;
    }
    const metodoAnterior = control?.dataset?.metodoActual || '';
    if (control) control.disabled = true;
    try {
      setCuadreMensaje('Actualizando metodo de pago...', 'info');
      const respuesta = await fetchAutorizado(`/api/caja/cuadre/${cuentaNum}/metodo-pago`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo_pago: metodoNormalizado,
          turno: '1',
          origen_caja: ORIGEN_CAJA,
        }),
      });
      const data = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo actualizar el metodo de pago.');
      }
      if (control) control.dataset.metodoActual = metodoNormalizado;
      await cargarResumenCuadre(false);
      setCuadreMensaje('Metodo de pago actualizado correctamente.', 'info');
    } catch (error) {
      if (control) {
        control.value =
          metodoAnterior && metodoAnterior !== 'mixto' && metodoAnterior !== 'sin_registrar'
            ? metodoAnterior
            : '';
      }
      setCuadreMensaje(error?.message || 'No se pudo actualizar el metodo de pago.', 'error');
    } finally {
      if (control) control.disabled = false;
    }
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

      // Select editable de método de pago (mismo patrón que caja).
      const metodoLabel = obtenerMetodoPagoLabel(pedido);
      const metodoValor = obtenerMetodoPagoValorCuadre(pedido);
      const opcionActual =
        metodoValor === 'mixto'
          ? '<option value="" selected disabled>Mixto</option>'
          : metodoValor === 'sin_registrar'
            ? '<option value="" selected disabled>Sin registrar</option>'
            : '';
      const opcionesMetodo = METODOS_PAGO_CUADRE.map(
        (metodo) =>
          `<option value="${metodo.value}" ${metodo.value === metodoValor ? 'selected' : ''}>${metodo.label}</option>`
      ).join('');
      const metodoControl = `
        <div class="cuadre-metodo-cell">
          <select
            class="cuadre-metodo-select"
            data-cambiar-metodo="1"
            data-cuenta-id="${pedido.id}"
            data-metodo-actual="${metodoValor}"
            aria-label="Metodo de pago para cuenta #${pedido.numero_cuenta_negocio || pedido.cuenta_id || pedido.id}"
            title="Metodo de pago actual: ${metodoLabel}"
          >
            ${opcionActual}
            ${opcionesMetodo}
          </select>
        </div>
      `;

      // Pedido principal para Ver/Editar factura: tomamos el primer pedido de
      // la cuenta. La factura impresa consolida items de toda la cuenta y la
      // edicion opera a nivel cuenta (igual que caja).
      const facturaPedidoIdRaw = Number(
        pedido.pedidos?.find((p) => Number(p?.id) > 0)?.id || pedido.id
      );
      const facturaPedidoId = Number.isFinite(facturaPedidoIdRaw) && facturaPedidoIdRaw > 0
        ? facturaPedidoIdRaw
        : null;
      // Detectar si es e-CF (no editable, solo verla)
      const pedidoRelacionado =
        pedido.pedidos?.find((p) => Number(p?.id) === facturaPedidoId) || pedido.pedidos?.[0] || pedido;
      const tipoComp = String(pedidoRelacionado?.tipo_comprobante || pedido.tipo_comprobante || '').toUpperCase();
      const esPedidoEcf =
        !!pedidoRelacionado?.ecf_tipo ||
        !!pedidoRelacionado?.ecf_encf ||
        /^E\d{2}$/.test(tipoComp);
      // Los e-CF normalmente NO se editan. Excepcion: si el negocio tiene la
      // facturacion electronica DESACTIVADA, esos e-CF son residuales y se
      // permiten convertir a "Sin comprobante" desde el editor.
      const feHabilitada = resumenCuadre.feHabilitada === true;
      const bloquearEdicion = esPedidoEcf && feHabilitada;
      const tituloEditar = esPedidoEcf
        ? 'Convertir factura electronica residual a Sin comprobante'
        : 'Editar factura (requiere password admin)';
      const accionesEditEliminar = bloquearEdicion
        ? ''
        : `<button type="button" class="kanm-button ghost" data-editar-factura="1" data-pedido-id="${facturaPedidoId}" style="margin-left:6px;" title="${tituloEditar}">Editar</button>
           <button type="button" class="kanm-button ghost" data-eliminar-factura="1" data-pedido-id="${facturaPedidoId}" style="margin-left:6px;color:#c0392b;" title="Eliminar/anular factura (requiere password admin)">Eliminar</button>`;
      const facturaBtnsHtml = facturaPedidoId
        ? `
            <button type="button" class="kanm-button ghost" data-ver-factura="1" data-pedido-id="${facturaPedidoId}" title="Ver factura">Ver factura</button>
            ${accionesEditEliminar}
          `
        : '<span class="kanm-subtitle">—</span>';

      fila.dataset.cuadreId = pedido.id;
      fila.style.cursor = 'pointer';
      fila.setAttribute('aria-expanded', 'false');
      fila.setAttribute('title', 'Haz clic para ver productos');
      fila.innerHTML = `
        <td>#${pedido.id}</td>
        <td>${mesaCliente}</td>
        <td>${formatDateTime(pedido.fecha_cierre || pedido.pedidos?.[0]?.fecha_cierre)}</td>
        <td>${metodoControl}</td>
        <td>${formatCurrency(total)}</td>
        <td style="white-space:nowrap;">${facturaBtnsHtml}</td>
      `;

      fragment.appendChild(fila);
    });

    // Prevenir que el click en el select expanda/colapse la fila.
    fragment.querySelectorAll('[data-cambiar-metodo]').forEach((control) => {
      ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach((eventName) => {
        control.addEventListener(eventName, (event) => {
          event.stopPropagation();
        });
      });
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
        totalSistema: Number(data.total_general) || 0,
        totalGeneral: Number(data.total_general) || 0,
        efectivoEsperado: 0,
        totalEfectivo: Number(data.total_efectivo) || 0,
        totalTarjeta: Number(data.total_tarjeta) || 0,
        totalTransferencia: Number(data.total_transferencia) || 0,
        totalDescuentos: Number(data.total_descuentos) || 0,
        cantidadPedidos: Number(data.cantidad_pedidos) || 0,
        pedidos: Array.isArray(data.pedidos) ? data.pedidos : [],
        feHabilitada: Number(data.fe_habilitada) === 1,
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
        efectivoEsperado: 0,
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

      setCuadreMensaje('Cuadre registrado correctamente. Abriendo ticket para imprimir...', 'info');
      resetFormularioCuadre();

      await recargarEstadoMostrador(false);
      notificarActualizacionGlobal('cierre-registrado', { cierreId: data.cierre?.id });

      // Abrir automáticamente el ticket 88mm para imprimir el cierre recién creado.
      const cierreIdNuevo = Number(data?.cierre?.id);
      if (Number.isFinite(cierreIdNuevo) && cierreIdNuevo > 0) {
        try {
          const ticketUrl = `/cuadre-cierre-ticket.html?cierre_id=${encodeURIComponent(cierreIdNuevo)}&origen=mostrador`;
          window.open(ticketUrl, '_blank', 'noopener');
        } catch (printErr) {
          console.warn('No se pudo abrir el ticket del cuadre:', printErr);
        }
      }

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
      // Boton Ver factura: abre la factura en nueva pestana.
      const botonVerFactura = event.target.closest('[data-ver-factura]');
      if (botonVerFactura) {
        event.preventDefault();
        event.stopPropagation();
        const pedidoId = Number(botonVerFactura.dataset.pedidoId);
        if (Number.isFinite(pedidoId) && pedidoId > 0) {
          const ts = Date.now();
          window.open(`/factura.html?id=${pedidoId}&_=${ts}`, `factura_${pedidoId}_${ts}`);
        }
        return;
      }
      // Boton Editar factura: abre el modal de edicion.
      const botonEditarFactura = event.target.closest('[data-editar-factura]');
      if (botonEditarFactura) {
        event.preventDefault();
        event.stopPropagation();
        const pedidoId = Number(botonEditarFactura.dataset.pedidoId);
        if (Number.isFinite(pedidoId) && pedidoId > 0) {
          try {
            abrirModalEditarFacturaMostrador(pedidoId);
          } catch (err) {
            console.error('[mostrador] Error abriendo modal editar factura:', err);
            alert('Error al abrir el editor: ' + (err?.message || err));
          }
        }
        return;
      }
      // Boton Eliminar factura: pide password admin y anula la factura.
      const botonEliminarFactura = event.target.closest('[data-eliminar-factura]');
      if (botonEliminarFactura) {
        event.preventDefault();
        event.stopPropagation();
        const pedidoId = Number(botonEliminarFactura.dataset.pedidoId);
        if (Number.isFinite(pedidoId) && pedidoId > 0) {
          abrirModalEliminarFacturaMostrador(pedidoId);
        }
        return;
      }
      const fila = event.target.closest('tr');
      if (!fila || fila.classList.contains('cuadre-detalle-expand')) return;
      const cuadreId = Number(fila.dataset.cuadreId);
      if (!Number.isFinite(cuadreId) || cuadreId <= 0) return;
      mostrarDetalleCuadre(fila, cuadreId);
    });

    // Cambio de método de pago desde la tabla (igual que caja).
    cuadreDetalleBody?.addEventListener('change', (event) => {
      const select = event.target?.closest?.('[data-cambiar-metodo]');
      if (!select) return;
      event.stopPropagation();
      const cuentaId = Number(select.dataset.cuentaId);
      const metodo = String(select.value || '').trim().toLowerCase();
      if (!metodo) return;
      actualizarMetodoPagoCuadre(cuentaId, metodo, select);
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
    inicializarModalEditarFactura();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === SYNC_STORAGE_KEY) {
      procesarSyncGlobal(event.newValue);
    }
  });

  // ============================================================
  // Modal Editar factura (cuadre mostrador)
  // ============================================================
  let editModalEl = null;
  let editPedidoIdInput = null;
  let editClienteInput = null;
  let editDocumentoInput = null;
  let editTipoSelect = null;
  let editItemsBody = null;
  let editMetodoPagoSelect = null;
  let editPagosCombinadoWrap = null;
  let editPagoEfectivoInput = null;
  let editPagoTarjetaInput = null;
  let editPagoTransferenciaInput = null;
  let editPagoTotalDisplay = null;
  let editPagoAviso = null;
  let editPasswordInput = null;
  let editMensaje = null;
  let editGuardarBtn = null;
  let editPedidoActualTotal = 0;

  const fmtCurrencyMostradorEdit = (n) => {
    try {
      return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(Number(n) || 0);
    } catch (_) {
      return `RD$${(Number(n) || 0).toFixed(2)}`;
    }
  };

  const setEditMensajeMostrador = (txt, tipo = 'info') => {
    if (!editMensaje) return;
    editMensaje.textContent = txt || '';
    editMensaje.classList.remove('kanm-message-error', 'kanm-message-success');
    if (tipo === 'error') editMensaje.classList.add('kanm-message-error');
    if (tipo === 'success') editMensaje.classList.add('kanm-message-success');
  };

  const renderEditItemsMostrador = (items = []) => {
    if (!editItemsBody) return;
    if (!items.length) {
      editItemsBody.innerHTML = '<tr><td colspan="5" class="kanm-subtitle">Sin items.</td></tr>';
      return;
    }
    editItemsBody.innerHTML = items
      .map((it, idx) => {
        const baseName = it.nombre || `Producto ${it.producto_id || ''}`;
        const sabor = it.sabor || '';
        const nombre = sabor ? `${baseName} (${sabor})` : baseName;
        const cantidad = Number(it.cantidad) || 0;
        const precio = Number(it.precio_unitario) || 0;
        const sub = (cantidad * precio).toFixed(2);
        const saborAttr = sabor ? ` data-sabor="${String(sabor).replace(/"/g, '&quot;')}"` : '';
        return `
          <tr data-edit-item-row="${idx}" data-producto-id="${it.producto_id || ''}"${saborAttr}>
            <td>${nombre}</td>
            <td><input type="number" class="kanm-input" data-edit-cant min="0.01" step="0.01" value="${cantidad}" /></td>
            <td><input type="number" class="kanm-input" data-edit-precio min="0" step="0.01" value="${precio.toFixed(2)}" /></td>
            <td><span data-edit-sub>RD$${sub}</span></td>
            <td><button type="button" class="kanm-button ghost" data-edit-elim title="Quitar">✕</button></td>
          </tr>
        `;
      })
      .join('');
  };

  const recalcSubtotalesEditMostrador = () => {
    editItemsBody?.querySelectorAll('tr[data-edit-item-row]').forEach((tr) => {
      const c = Number(tr.querySelector('[data-edit-cant]')?.value) || 0;
      const p = Number(tr.querySelector('[data-edit-precio]')?.value) || 0;
      const out = tr.querySelector('[data-edit-sub]');
      if (out) out.textContent = `RD$${(c * p).toFixed(2)}`;
    });
  };

  const recalcTotalPagosCombinado = () => {
    const efe = Number(editPagoEfectivoInput?.value) || 0;
    const tar = Number(editPagoTarjetaInput?.value) || 0;
    const tra = Number(editPagoTransferenciaInput?.value) || 0;
    const total = efe + tar + tra;
    if (editPagoTotalDisplay) editPagoTotalDisplay.textContent = fmtCurrencyMostradorEdit(total);
    if (editPagoAviso) {
      const diff = Math.abs(total - editPedidoActualTotal);
      if (diff <= 0.05) {
        editPagoAviso.textContent = '✓ La suma coincide con el total de la factura.';
        editPagoAviso.style.color = '#0a7';
      } else if (total < editPedidoActualTotal) {
        editPagoAviso.textContent = `Falta ${fmtCurrencyMostradorEdit(editPedidoActualTotal - total)} para completar el total.`;
        editPagoAviso.style.color = '#c00';
      } else {
        editPagoAviso.textContent = `Excede el total por ${fmtCurrencyMostradorEdit(total - editPedidoActualTotal)}.`;
        editPagoAviso.style.color = '#c00';
      }
    }
  };

  const toggleCombinadoVisible = () => {
    const visible = editMetodoPagoSelect?.value === 'combinado';
    if (editPagosCombinadoWrap) editPagosCombinadoWrap.hidden = !visible;
    if (visible) recalcTotalPagosCombinado();
  };

  function abrirModalEditarFacturaMostrador(pedidoId) {
    if (!editModalEl) {
      alert('Modal de edicion no esta inicializado. ¿Esta cargado el HTML?');
      return;
    }
    setEditMensajeMostrador('Cargando factura…');
    editModalEl.hidden = false;
    // El overlay usa opacity/pointer-events; hace falta la clase is-visible para mostrarlo.
    requestAnimationFrame(() => editModalEl.classList.add('is-visible'));
    if (editPedidoIdInput) editPedidoIdInput.value = String(pedidoId);
    if (editPasswordInput) editPasswordInput.value = '';
    if (editItemsBody) editItemsBody.innerHTML = '<tr><td colspan="5" class="kanm-subtitle">Cargando…</td></tr>';

    fetch(`/api/pedidos/${pedidoId}/factura`, { headers: { ...obtenerAuthHeaders() } })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!data?.ok && !data?.pedido) throw new Error(data?.error || 'No se pudo cargar la factura.');
        const pedido = data.pedido || {};
        const items = Array.isArray(data.items) ? data.items : [];
        const tipoAct = String(pedido.tipo_comprobante || '').toUpperCase();
        const esEcf = !!pedido.ecf_tipo || !!pedido.ecf_encf || /^E\d{2}$/.test(tipoAct);
        const feOn = resumenCuadre.feHabilitada === true;
        if (esEcf && feOn) {
          // FE activa: las facturas electronicas reales NO se editan. Limpiar el
          // "Cargando…" y dejar un estado claro en vez de un spinner infinito.
          if (editItemsBody) {
            editItemsBody.innerHTML =
              '<tr><td colspan="5" class="kanm-subtitle">Factura electrónica (e-CF): no se puede editar. Para corregirla, emite una Nota de Crédito.</td></tr>';
          }
          if (editGuardarBtn) editGuardarBtn.disabled = true;
          setEditMensajeMostrador('Esta factura es electronica (e-CF). No se puede editar — emite Nota de Credito.', 'error');
          return;
        }
        if (editClienteInput) editClienteInput.value = pedido.cliente || '';
        if (editDocumentoInput) editDocumentoInput.value = pedido.cliente_documento || '';
        if (editTipoSelect) {
          const ops = ['B01', 'B02', 'B14', 'Sin comprobante'];
          // Si es un e-CF residual (FE off), el destino natural es "Sin comprobante".
          editTipoSelect.value = esEcf
            ? 'Sin comprobante'
            : ops.includes(pedido.tipo_comprobante)
              ? pedido.tipo_comprobante
              : 'B02';
        }
        editPedidoActualTotal = Number(pedido.total) || 0;
        // Determinar metodo de pago actual segun campos pago_*
        const pagEfe = Number(pedido.pago_efectivo) || 0;
        const pagTar = Number(pedido.pago_tarjeta) || 0;
        const pagTra = Number(pedido.pago_transferencia) || 0;
        let metodoActual = 'efectivo';
        const usados = [pagEfe > 0.01, pagTar > 0.01, pagTra > 0.01].filter(Boolean).length;
        if (usados > 1) metodoActual = 'combinado';
        else if (pagTar > 0.01) metodoActual = 'tarjeta';
        else if (pagTra > 0.01) metodoActual = 'transferencia';
        else metodoActual = 'efectivo';
        if (editMetodoPagoSelect) editMetodoPagoSelect.value = metodoActual;
        if (editPagoEfectivoInput) editPagoEfectivoInput.value = pagEfe.toFixed(2);
        if (editPagoTarjetaInput) editPagoTarjetaInput.value = pagTar.toFixed(2);
        if (editPagoTransferenciaInput) editPagoTransferenciaInput.value = pagTra.toFixed(2);
        toggleCombinadoVisible();
        renderEditItemsMostrador(items);
        if (esEcf) {
          setEditMensajeMostrador(
            'Esta factura quedó como e-CF pero el negocio no tiene facturación electrónica activa. Al guardar se convertirá al tipo que elijas (por defecto "Sin comprobante") y se limpiarán sus datos electrónicos.',
            'info'
          );
        } else {
          setEditMensajeMostrador('');
        }
      })
      .catch((err) => setEditMensajeMostrador(err.message || 'Error cargando factura.', 'error'));
  }

  function cerrarModalEditarFacturaMostrador() {
    if (editModalEl) {
      editModalEl.classList.remove('is-visible');
      editModalEl.hidden = true;
    }
    setEditMensajeMostrador('');
  }

  // ---- Eliminar / anular factura ----
  const setMsgEliminarMostrador = (texto, tipo) => {
    const msg = document.getElementById('mostrador-eliminar-factura-mensaje');
    if (!msg) return;
    msg.textContent = texto || '';
    msg.className = 'kanm-message';
    if (tipo === 'error') msg.classList.add('kanm-message-error');
    else if (tipo === 'success') msg.classList.add('kanm-message-success');
  };

  function abrirModalEliminarFacturaMostrador(pedidoId) {
    const modal = document.getElementById('mostrador-eliminar-factura-modal');
    if (!modal) {
      alert('Modal de eliminar no esta inicializado. Recarga con Ctrl+Shift+R.');
      return;
    }
    const idInput = document.getElementById('mostrador-eliminar-factura-pedido-id');
    const passInput = document.getElementById('mostrador-eliminar-factura-password');
    if (idInput) idInput.value = String(pedidoId);
    if (passInput) passInput.value = '';
    setMsgEliminarMostrador('');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-visible'));
    passInput?.focus();
  }

  function cerrarModalEliminarFacturaMostrador() {
    const modal = document.getElementById('mostrador-eliminar-factura-modal');
    if (modal) {
      modal.classList.remove('is-visible');
      modal.hidden = true;
    }
  }

  async function confirmarEliminarFacturaMostrador() {
    const idInput = document.getElementById('mostrador-eliminar-factura-pedido-id');
    const passInput = document.getElementById('mostrador-eliminar-factura-password');
    const btn = document.getElementById('mostrador-eliminar-factura-confirmar');
    const pedidoId = Number(idInput?.value);
    const password = (passInput?.value || '').trim();
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) return;
    if (!password) {
      setMsgEliminarMostrador('Ingresa la contraseña del administrador.', 'error');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
    setMsgEliminarMostrador('Eliminando…');
    try {
      const resp = await fetch(`/api/caja/facturas/${pedidoId}/eliminar-con-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...obtenerAuthHeaders() },
        body: JSON.stringify({ admin_password: password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error || 'No se pudo eliminar.');
      setMsgEliminarMostrador('Factura eliminada correctamente.', 'success');
      if (typeof cargarResumenCuadre === 'function') {
        try { await cargarResumenCuadre(false); } catch (_) {}
      }
      setTimeout(cerrarModalEliminarFacturaMostrador, 800);
    } catch (err) {
      setMsgEliminarMostrador(err.message || 'Error al eliminar.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Eliminar factura'; }
    }
  }

  async function guardarEdicionFacturaMostrador() {
    if (!editModalEl) return;
    const pedidoId = Number(editPedidoIdInput?.value);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      setEditMensajeMostrador('Pedido invalido.', 'error');
      return;
    }
    const password = (editPasswordInput?.value || '').trim();
    if (!password) {
      setEditMensajeMostrador('Ingresa la contrasena del administrador.', 'error');
      return;
    }
    // Items
    const items = [];
    editItemsBody?.querySelectorAll('tr[data-edit-item-row]').forEach((tr) => {
      const c = Number(tr.querySelector('[data-edit-cant]')?.value);
      const p = Number(tr.querySelector('[data-edit-precio]')?.value);
      const productoId = Number(tr.dataset.productoId) || null;
      const sabor = tr.dataset.sabor || null;
      if (Number.isFinite(c) && c > 0 && Number.isFinite(p) && p >= 0) {
        items.push({ producto_id: productoId, cantidad: c, precio_unitario: p, sabor });
      }
    });
    if (!items.length) {
      setEditMensajeMostrador('Debe haber al menos un item valido.', 'error');
      return;
    }
    // Pago
    const metodoPago = editMetodoPagoSelect?.value || 'efectivo';
    let pagos = null;
    if (metodoPago === 'combinado') {
      const efe = Number(editPagoEfectivoInput?.value) || 0;
      const tar = Number(editPagoTarjetaInput?.value) || 0;
      const tra = Number(editPagoTransferenciaInput?.value) || 0;
      pagos = { efectivo: efe, tarjeta: tar, transferencia: tra };
    }
    const payload = {
      admin_password: password,
      cliente: editClienteInput?.value?.trim() || '',
      cliente_documento: editDocumentoInput?.value?.trim() || '',
      tipo_comprobante: editTipoSelect?.value || 'B02',
      items,
      metodo_pago: metodoPago,
      pagos,
    };
    if (editGuardarBtn) {
      editGuardarBtn.disabled = true;
      editGuardarBtn.textContent = 'Guardando…';
    }
    setEditMensajeMostrador('Guardando cambios…');
    try {
      const resp = await fetch(`/api/caja/facturas/${pedidoId}/editar-con-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...obtenerAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo guardar.');
      }
      setEditMensajeMostrador('Factura actualizada correctamente.', 'success');
      if (typeof cargarResumenCuadre === 'function') {
        try { await cargarResumenCuadre(false); } catch (_) {}
      }
      setTimeout(cerrarModalEditarFacturaMostrador, 900);
    } catch (err) {
      setEditMensajeMostrador(err.message || 'Error al guardar.', 'error');
    } finally {
      if (editGuardarBtn) {
        editGuardarBtn.disabled = false;
        editGuardarBtn.textContent = 'Guardar cambios';
      }
    }
  }

  function inicializarModalEditarFactura() {
    editModalEl = document.getElementById('mostrador-editar-factura-modal');
    if (!editModalEl) {
      console.warn('[mostrador] Modal editar factura NO encontrado en DOM. ¿HTML viejo? Recarga con Ctrl+Shift+R.');
      return;
    }
    editPedidoIdInput = document.getElementById('mostrador-editar-factura-pedido-id');
    editClienteInput = document.getElementById('mostrador-editar-factura-cliente');
    editDocumentoInput = document.getElementById('mostrador-editar-factura-documento');
    editTipoSelect = document.getElementById('mostrador-editar-factura-tipo');
    editItemsBody = document.getElementById('mostrador-editar-factura-items-body');
    editMetodoPagoSelect = document.getElementById('mostrador-editar-factura-metodo-pago');
    editPagosCombinadoWrap = document.getElementById('mostrador-editar-factura-pagos-combinado');
    editPagoEfectivoInput = document.getElementById('mostrador-editar-factura-pago-efectivo');
    editPagoTarjetaInput = document.getElementById('mostrador-editar-factura-pago-tarjeta');
    editPagoTransferenciaInput = document.getElementById('mostrador-editar-factura-pago-transferencia');
    editPagoTotalDisplay = document.getElementById('mostrador-editar-factura-pago-total');
    editPagoAviso = document.getElementById('mostrador-editar-factura-pago-aviso');
    editPasswordInput = document.getElementById('mostrador-editar-factura-admin-password');
    editMensaje = document.getElementById('mostrador-editar-factura-mensaje');
    editGuardarBtn = document.getElementById('mostrador-editar-factura-guardar');

    document.getElementById('mostrador-editar-factura-cerrar')?.addEventListener('click', cerrarModalEditarFacturaMostrador);
    document.getElementById('mostrador-editar-factura-cancelar')?.addEventListener('click', cerrarModalEditarFacturaMostrador);
    editModalEl.addEventListener('click', (e) => { if (e.target === editModalEl) cerrarModalEditarFacturaMostrador(); });
    editGuardarBtn?.addEventListener('click', guardarEdicionFacturaMostrador);

    // Modal eliminar factura.
    const elimModalEl = document.getElementById('mostrador-eliminar-factura-modal');
    document.getElementById('mostrador-eliminar-factura-cerrar')?.addEventListener('click', cerrarModalEliminarFacturaMostrador);
    document.getElementById('mostrador-eliminar-factura-cancelar')?.addEventListener('click', cerrarModalEliminarFacturaMostrador);
    document.getElementById('mostrador-eliminar-factura-confirmar')?.addEventListener('click', confirmarEliminarFacturaMostrador);
    elimModalEl?.addEventListener('click', (e) => { if (e.target === elimModalEl) cerrarModalEliminarFacturaMostrador(); });

    editItemsBody?.addEventListener('input', (e) => {
      if (e.target.matches('[data-edit-cant]') || e.target.matches('[data-edit-precio]')) {
        recalcSubtotalesEditMostrador();
      }
    });
    editItemsBody?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-edit-elim]');
      if (!b) return;
      b.closest('tr')?.remove();
      recalcSubtotalesEditMostrador();
    });
    editMetodoPagoSelect?.addEventListener('change', toggleCombinadoVisible);
    [editPagoEfectivoInput, editPagoTarjetaInput, editPagoTransferenciaInput].forEach((inp) => {
      inp?.addEventListener('input', recalcTotalPagosCombinado);
    });
  }
})();
