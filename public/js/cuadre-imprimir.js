const params = new URLSearchParams(window.location.search);
const cierreId = params.get('id');

const cierreIdSpan = document.getElementById('cuadre-id');
const fechaOperacionSpan = document.getElementById('cuadre-fecha-operacion');
const fechaCierreSpan = document.getElementById('cuadre-fecha-cierre');
const usuarioSpan = document.getElementById('cuadre-usuario');
const totalSistemaSpan = document.getElementById('cuadre-total-sistema');
const totalDeclaradoSpan = document.getElementById('cuadre-total-declarado');
const diferenciaSpan = document.getElementById('cuadre-diferencia');
const itemsBody = document.getElementById('cuadre-items');
const totalVentasSpan = document.getElementById('cuadre-total-ventas');
const totalVentasFooterSpan = document.getElementById('cuadre-total-ventas-footer');
const totalSalidasSpan = document.getElementById('cuadre-total-salidas');
const totalGastosSpan = document.getElementById('cuadre-total-gastos');
const totalSalidasLinea = document.getElementById('cuadre-total-salidas-linea');
const totalGastosLinea = document.getElementById('cuadre-total-gastos-linea');
const salidasPanel = document.getElementById('cuadre-salidas-panel');
const salidasBody = document.getElementById('cuadre-salidas-body');
const gastosPanel = document.getElementById('cuadre-gastos-panel');
const gastosBody = document.getElementById('cuadre-gastos-body');
const imprimirBtn = document.getElementById('cuadre-imprimir-btn');

const authApi = window.kanmAuth;

const obtenerAuthHeaders = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener headers de autenticacion:', error);
    return {};
  }
};

const formatCurrency = (value) => {
  const numero = Number(value) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(numero);
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return 'N/A';
  const numero = Number(value);
  if (Number.isNaN(numero)) return 'N/A';
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(numero);
};

const parseFecha = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'string') {
    const trimmed = valor.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      const fechaLocal = new Date(year, month - 1, day);
      return Number.isNaN(fechaLocal.getTime()) ? null : fechaLocal;
    }
    const base = trimmed.replace(' ', 'T');
    const conZona = /([zZ]|[+-]\d\d:?\d\d)$/.test(base) ? base : `${base}Z`;
    const fecha = new Date(conZona);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const base = valor;
  const fecha = new Date(base);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const formatDateTime = (valor) => {
  const fecha = parseFecha(valor);
  if (!fecha) return '--';
  return new Intl.DateTimeFormat('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Santo_Domingo',
  }).format(fecha);
};

const formatDate = (valor) => {
  const fecha = parseFecha(valor);
  if (!fecha) return '--';
  return new Intl.DateTimeFormat('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Santo_Domingo',
  }).format(fecha);
};

const renderDetalle = (data) => {
  if (!data) return;
  const cierre = data.cierre || {};
  const productos = Array.isArray(data.productos) ? data.productos : [];
  const totales = data.totales || {};
  const salidas = Array.isArray(data.salidas) ? data.salidas : [];
  const gastos = Array.isArray(data.gastos) ? data.gastos : [];

  if (cierreIdSpan) cierreIdSpan.textContent = cierre.id ? `#${cierre.id}` : '--';
  if (fechaOperacionSpan) {
    fechaOperacionSpan.textContent = `Fecha operacion: ${formatDate(cierre.fecha_operacion || data.fecha_operacion)}`;
  }
  if (fechaCierreSpan) {
    fechaCierreSpan.textContent = formatDateTime(cierre.fecha_cierre);
  }
  if (usuarioSpan) {
    const rol = cierre.usuario_rol ? ` (${cierre.usuario_rol})` : '';
    usuarioSpan.textContent = `Usuario: ${cierre.usuario || '--'}${rol}`;
  }
  if (totalSistemaSpan) totalSistemaSpan.textContent = formatCurrency(cierre.total_sistema);
  if (totalDeclaradoSpan) totalDeclaradoSpan.textContent = formatCurrency(cierre.total_declarado);
  if (diferenciaSpan) diferenciaSpan.textContent = formatCurrency(cierre.diferencia);

  if (itemsBody) {
    itemsBody.innerHTML = '';
    if (!productos.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.textContent = 'No hay productos para este cierre.';
      fila.appendChild(celda);
      itemsBody.appendChild(fila);
    } else {
      productos.forEach((item) => {
        const fila = document.createElement('tr');
        const invInicial = item.stock_indefinido ? 'N/A' : formatNumber(item.inv_inicial);
        const compra = item.stock_indefinido ? 'N/A' : formatNumber(item.compra);
        const invFinal = item.stock_indefinido ? 'N/A' : formatNumber(item.inv_final);
        const venta = formatNumber(item.venta);
        const precio = formatCurrency(item.precio_unitario || item.precio || 0);
        const valorVenta = formatCurrency(item.valor_venta || 0);

        fila.innerHTML = `
          <td>${item.nombre || `Producto ${item.producto_id || ''}`}</td>
          <td class="text-right">${invInicial}</td>
          <td class="text-right">${compra}</td>
          <td class="text-right">${invFinal}</td>
          <td class="text-right">${venta}</td>
          <td class="text-right">${precio}</td>
          <td class="text-right">${valorVenta}</td>
        `;
        itemsBody.appendChild(fila);
      });
    }
  }

  const totalVentas = totales.total_venta || 0;
  if (totalVentasSpan) totalVentasSpan.textContent = formatCurrency(totalVentas);
  if (totalVentasFooterSpan) totalVentasFooterSpan.textContent = formatCurrency(totalVentas);

  const totalSalidas = totales.total_salidas || 0;
  if (totalSalidasSpan) totalSalidasSpan.textContent = formatCurrency(totalSalidas);
  if (totalSalidasLinea && !totalSalidas) totalSalidasLinea.hidden = true;

  const totalGastos = totales.total_gastos || 0;
  if (totalGastosSpan) totalGastosSpan.textContent = formatCurrency(totalGastos);
  if (totalGastosLinea && !totalGastos) totalGastosLinea.hidden = true;

  if (salidasPanel && salidasBody) {
    salidasBody.innerHTML = '';
    if (salidas.length) {
      salidasPanel.hidden = false;
      salidas.forEach((salida) => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
          <td>${formatDateTime(salida.fecha)}</td>
          <td>${salida.descripcion || 'Salida'}</td>
          <td class="text-right">${formatCurrency(salida.monto)}</td>
          <td>${salida.metodo || 'efectivo'}</td>
        `;
        salidasBody.appendChild(fila);
      });
    } else {
      salidasPanel.hidden = true;
    }
  }

  if (gastosPanel && gastosBody) {
    gastosBody.innerHTML = '';
    if (gastos.length) {
      gastosPanel.hidden = false;
      gastos.forEach((gasto) => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
          <td>${formatDate(gasto.fecha)}</td>
          <td>${gasto.descripcion || gasto.proveedor || 'Gasto'}</td>
          <td>${gasto.categoria || 'Sin categoria'}</td>
          <td class="text-right">${formatCurrency(gasto.monto)}</td>
        `;
        gastosBody.appendChild(fila);
      });
    } else {
      gastosPanel.hidden = true;
    }
  }
};

const cargarDetalle = async () => {
  if (!cierreId) {
    alert('No se encontro el cierre solicitado.');
    return;
  }

  try {
    const respuesta = await fetch(`/api/caja/cierres/${cierreId}/hoja-detalle`, {
      headers: {
        ...obtenerAuthHeaders(),
      },
    });

    if (respuesta.status === 401 || respuesta.status === 403) {
      authApi?.handleUnauthorized?.();
      return;
    }

    if (!respuesta.ok) {
      throw new Error('No se pudo obtener el detalle del cierre.');
    }
    const data = await respuesta.json();
    if (!data?.ok) {
      throw new Error(data?.error || 'No se pudo obtener el detalle del cierre.');
    }
    renderDetalle(data);
  } catch (error) {
    console.error('Error al cargar detalle de cierre:', error);
    alert('Ocurrio un error al cargar el detalle. Intenta nuevamente.');
  }
};

imprimirBtn?.addEventListener('click', () => window.print());
document.addEventListener('DOMContentLoaded', cargarDetalle);
