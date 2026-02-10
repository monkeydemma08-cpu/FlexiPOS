(() => {
  const authApi = window.kanmAuth;
  const sessionApi = window.KANMSession;
  const inventarioWrapper = document.getElementById('supervisor-inventario');

  if (!inventarioWrapper) return;

  const inventarioTotal = document.getElementById('supervisor-inventario-total');
  const inventarioCritico = document.getElementById('supervisor-inventario-critico');
  const inventarioBajo = document.getElementById('supervisor-inventario-bajo');
  const inventarioValor = document.getElementById('supervisor-inventario-valor');
  const inventarioBuscar = document.getElementById('supervisor-inventario-buscar');
  const inventarioCategoria = document.getElementById('supervisor-inventario-categoria');
  const inventarioTipo = document.getElementById('supervisor-inventario-tipo');
  const inventarioEstado = document.getElementById('supervisor-inventario-estado');
  const inventarioStock = document.getElementById('supervisor-inventario-stock');
  const inventarioFiltrarBtn = document.getElementById('supervisor-inventario-filtrar');
  const inventarioLimpiarBtn = document.getElementById('supervisor-inventario-limpiar');
  const inventarioBody = document.getElementById('supervisor-inventario-body');
  const inventarioMensaje = document.getElementById('supervisor-inventario-mensaje');

  const SUPERVISOR_STOCK_BAJO = 5;
  let inventarioItems = [];

  const obtenerUsuario = () => sessionApi?.getUser?.() || null;

  const obtenerAuthHeaders = () => {
    try {
      return authApi?.getAuthHeaders?.() || {};
    } catch (error) {
      return {};
    }
  };

  const fetchConAutorizacion = async (url, options = {}) => {
    const headers = { ...(options.headers || {}), ...obtenerAuthHeaders() };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      authApi?.handleUnauthorized?.();
    }
    return response;
  };

  const setMensaje = (el, texto = '', tipo = 'info') => {
    if (!el) return;
    el.textContent = texto;
    el.dataset.type = texto ? tipo : '';
  };

  const formatCurrency = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return 'DOP 0.00';
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(number);
  };

  const formatNumber = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return '--';
    return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(number);
  };

  const esProductoStockIndefinido = (producto) => Number(producto?.stock_indefinido) === 1;
  const esProductoInsumo = (producto) =>
    String(producto?.tipo_producto || 'FINAL').toUpperCase() === 'INSUMO';
  const esProductoVendible = (producto) => {
    if (!producto) return false;
    return !esProductoInsumo(producto) || Number(producto.insumo_vendible) === 1;
  };

  const obtenerCostoProducto = (producto) => {
    const candidatos = [
      producto?.costo_unitario_real,
      producto?.costo_promedio_actual,
      producto?.costo_base_sin_itbis,
      producto?.ultimo_costo_sin_itbis,
    ];
    for (const valor of candidatos) {
      if (valor === null || valor === undefined || valor === '') continue;
      const numero = Number(valor);
      if (Number.isFinite(numero)) return numero;
    }
    return 0;
  };

  const obtenerMinimo = (producto) => {
    const min = Number(producto?.stock_minimo ?? producto?.stockMinimo);
    if (Number.isFinite(min) && min > 0) return min;
    return SUPERVISOR_STOCK_BAJO;
  };

  const obtenerEstadoStock = (producto) => {
    if (esProductoStockIndefinido(producto)) return 'indefinido';
    const stock = Number(producto?.stock ?? 0);
    const minimo = obtenerMinimo(producto);
    if (!Number.isFinite(stock) || stock <= 0) return 'critico';
    if (stock <= minimo) return 'bajo';
    return 'disponible';
  };

  const actualizarKpis = (lista = []) => {
    const items = Array.isArray(lista) ? lista : [];
    let critico = 0;
    let bajo = 0;
    let valor = 0;

    items.forEach((producto) => {
      const estado = obtenerEstadoStock(producto);
      if (estado === 'critico') critico += 1;
      if (estado === 'bajo') bajo += 1;
      if (!esProductoStockIndefinido(producto)) {
        const stock = Number(producto?.stock ?? 0);
        if (Number.isFinite(stock) && stock > 0) {
          valor += stock * obtenerCostoProducto(producto);
        }
      }
    });

    if (inventarioTotal) inventarioTotal.textContent = formatNumber(items.length);
    if (inventarioCritico) inventarioCritico.textContent = formatNumber(critico);
    if (inventarioBajo) inventarioBajo.textContent = formatNumber(bajo);
    if (inventarioValor) inventarioValor.textContent = formatCurrency(valor);
  };

  const renderInventario = (lista = []) => {
    if (!inventarioBody) return;
    inventarioBody.innerHTML = '';

    if (!Array.isArray(lista) || lista.length === 0) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.textContent = 'No hay items en inventario.';
      fila.appendChild(celda);
      inventarioBody.appendChild(fila);
      actualizarKpis([]);
      return;
    }

    lista.forEach((producto) => {
      const fila = document.createElement('tr');
      const stockIndefinido = esProductoStockIndefinido(producto);
      const stockValor = Number(producto?.stock ?? 0);
      const stockTexto = stockIndefinido
        ? 'Indefinido'
        : formatNumber(Number.isFinite(stockValor) ? stockValor : 0);
      const minimo = stockIndefinido ? '—' : obtenerMinimo(producto);
      const costo = obtenerCostoProducto(producto);
      const precio = Number(producto?.precio ?? 0);
      const activo = Number(producto?.activo) === 1;

      fila.innerHTML = `
        <td>${producto?.nombre ?? ''}</td>
        <td>${producto?.categoria_nombre ?? 'Sin asignar'}</td>
        <td>${stockTexto}</td>
        <td>${minimo}</td>
        <td>${formatCurrency(costo)}</td>
        <td>${formatCurrency(precio)}</td>
        <td><span class="estado-pill ${activo ? '' : 'estado-inactivo'}">${
          activo ? 'Activo' : 'Inactivo'
        }</span></td>
      `;
      inventarioBody.appendChild(fila);
    });

    actualizarKpis(lista);
  };

  const filtrarInventario = () => {
    const termino = (inventarioBuscar?.value || '').trim().toLowerCase();
    const categoria = (inventarioCategoria?.value || '').trim().toLowerCase();
    const tipo = inventarioTipo?.value || '';
    const estado = inventarioEstado?.value || '';
    const stockFiltro = inventarioStock?.value || '';

    const filtrada = (inventarioItems || []).filter((producto) => {
      const nombre = String(producto?.nombre || '').toLowerCase();
      const categoriaNombre = String(producto?.categoria_nombre || '').toLowerCase();

      if (termino && !nombre.includes(termino) && !categoriaNombre.includes(termino)) {
        return false;
      }
      if (categoria && !categoriaNombre.includes(categoria)) {
        return false;
      }
      if (tipo === 'vendible' && !esProductoVendible(producto)) return false;
      if (tipo === 'insumo' && !esProductoInsumo(producto)) return false;
      if (estado === 'activo' && Number(producto?.activo) !== 1) return false;
      if (estado === 'inactivo' && Number(producto?.activo) === 1) return false;

      if (stockFiltro) {
        const estadoStock = obtenerEstadoStock(producto);
        if (estadoStock !== stockFiltro) return false;
      }
      return true;
    });

    renderInventario(filtrada);
  };

  const cargarInventario = async () => {
    try {
      setMensaje(inventarioMensaje, 'Cargando inventario...', 'info');
      const respuesta = await fetchConAutorizacion('/api/productos');
      if (!respuesta.ok) {
        throw new Error('No se pudieron obtener los productos');
      }
      const data = await respuesta.json();
      inventarioItems = Array.isArray(data) ? data : [];
      filtrarInventario();
      setMensaje(inventarioMensaje, '', 'info');
    } catch (error) {
      console.error('Error al cargar inventario supervisor:', error);
      setMensaje(inventarioMensaje, 'Error al cargar el inventario.', 'error');
    }
  };

  const limpiarFiltros = () => {
    if (inventarioBuscar) inventarioBuscar.value = '';
    if (inventarioCategoria) inventarioCategoria.value = '';
    if (inventarioTipo) inventarioTipo.value = '';
    if (inventarioEstado) inventarioEstado.value = '';
    if (inventarioStock) inventarioStock.value = '';
    filtrarInventario();
  };

  const initSupervisorInventario = () => {
    const usuario = obtenerUsuario();
    if (usuario?.rol && usuario.rol !== 'supervisor') {
      return;
    }

    inventarioBuscar?.addEventListener('input', filtrarInventario);
    inventarioCategoria?.addEventListener('input', filtrarInventario);
    inventarioTipo?.addEventListener('change', filtrarInventario);
    inventarioEstado?.addEventListener('change', filtrarInventario);
    inventarioStock?.addEventListener('change', filtrarInventario);
    inventarioFiltrarBtn?.addEventListener('click', filtrarInventario);
    inventarioLimpiarBtn?.addEventListener('click', limpiarFiltros);

    cargarInventario();
  };

  document.addEventListener('DOMContentLoaded', initSupervisorInventario);
})();

