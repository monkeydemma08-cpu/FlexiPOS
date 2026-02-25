const params = new URLSearchParams(window.location.search);
const cierreId = params.get('id');
const modo = String(params.get('modo') || '').trim().toLowerCase();
const desdeParam = params.get('desde');
const hastaParam = params.get('hasta');
const esModoMensual = modo === 'mes' || (!cierreId && Boolean(desdeParam && hastaParam));

const tituloSpan = document.getElementById('cuadre-titulo');
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
const cierresMesPanel = document.getElementById('cuadre-cierres-mes-panel');
const cierresMesBody = document.getElementById('cuadre-cierres-mes-body');
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
  const esMensual = data?.tipo === 'mes';
  const cierre = data.cierre || {};
  const rango = data.rango || {};
  const productos = Array.isArray(data.productos) ? data.productos : [];
  const cierresMes = Array.isArray(data.cierres) ? data.cierres : [];
  const totales = data.totales || {};
  const salidas = Array.isArray(data.salidas) ? data.salidas : [];
  const gastos = Array.isArray(data.gastos) ? data.gastos : [];

  if (tituloSpan) {
    tituloSpan.textContent = esMensual ? 'Detalle de cuadre de caja del mes' : 'Detalle de cuadre de caja';
  }

  if (cierreIdSpan) {
    if (esMensual) {
      const periodo = rango?.desde && rango?.hasta ? `${rango.desde} a ${rango.hasta}` : '--';
      cierreIdSpan.textContent = periodo;
    } else {
      cierreIdSpan.textContent = cierre.id ? `#${cierre.id}` : '--';
    }
  }
  if (fechaOperacionSpan) {
    if (esMensual) {
      fechaOperacionSpan.textContent = `Periodo: ${formatDate(rango.desde)} - ${formatDate(rango.hasta)}`;
    } else {
      fechaOperacionSpan.textContent = `Fecha operacion: ${formatDate(cierre.fecha_operacion || data.fecha_operacion)}`;
    }
  }
  if (fechaCierreSpan) {
    fechaCierreSpan.textContent = formatDateTime(cierre.fecha_cierre);
  }
  if (usuarioSpan) {
    if (esMensual) {
      const cantidadDesdeCierre = Number(cierre.cantidad_cierres);
      const cantidadDesdeLista = cierresMes.length;
      const cantidadCierres =
        Number.isFinite(cantidadDesdeCierre) && cantidadDesdeCierre > 0
          ? cantidadDesdeCierre
          : cantidadDesdeLista;
      usuarioSpan.textContent = `Usuario: ${cierre.usuario || 'Consolidado'} (${cantidadCierres} cierres)`;
    } else {
      const rol = cierre.usuario_rol ? ` (${cierre.usuario_rol})` : '';
      usuarioSpan.textContent = `Usuario: ${cierre.usuario || '--'}${rol}`;
    }
  }
  if (totalSistemaSpan) totalSistemaSpan.textContent = formatCurrency(cierre.total_sistema);
  if (totalDeclaradoSpan) totalDeclaradoSpan.textContent = formatCurrency(cierre.total_declarado);
  if (diferenciaSpan) diferenciaSpan.textContent = formatCurrency(cierre.diferencia);

  if (cierresMesPanel && cierresMesBody) {
    cierresMesBody.innerHTML = '';
    if (esMensual && cierresMes.length) {
      cierresMesPanel.hidden = false;
      cierresMes.forEach((cierreMes) => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
          <td>#${cierreMes.id ?? '--'}</td>
          <td>${formatDate(cierreMes.fecha_operacion)}</td>
          <td>${formatDateTime(cierreMes.fecha_cierre)}</td>
          <td>${cierreMes.usuario || 'N/D'}</td>
          <td class="text-right">${formatCurrency(cierreMes.total_sistema)}</td>
          <td class="text-right">${formatCurrency(cierreMes.total_declarado)}</td>
          <td class="text-right">${formatCurrency(cierreMes.diferencia)}</td>
        `;
        cierresMesBody.appendChild(fila);
      });
    } else {
      cierresMesPanel.hidden = true;
    }
  }

  if (itemsBody) {
    itemsBody.innerHTML = '';
    if (!productos.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.textContent = esMensual
        ? 'No hay productos para el periodo seleccionado.'
        : 'No hay productos para este cierre.';
      fila.appendChild(celda);
      itemsBody.appendChild(fila);
    } else {
      productos.forEach((item) => {
        const fila = document.createElement('tr');
        const invInicial = item.stock_indefinido ? 'N/A' : formatNumber(item.inv_inicial);
        const compra = item.stock_indefinido ? 'N/A' : formatNumber(item.compra);
        const invFinal = item.stock_indefinido ? 'N/A' : formatNumber(item.inv_final);
        const venta = formatNumber(item.venta);
        const preciosConfigurados = Array.isArray(item.precios_configurados)
          ? item.precios_configurados
          : [];
        const preciosVendidos = Array.isArray(item.precios_vendidos) ? item.precios_vendidos : [];
        const ventasPorPrecio = new Map();

        preciosVendidos.forEach((ventaItem) => {
          const valor = Number(ventaItem?.precio_unitario);
          if (!Number.isFinite(valor)) return;
          const key = Number(valor.toFixed(2)).toFixed(2);
          const cantidad = Number(ventaItem?.cantidad) || 0;
          ventasPorPrecio.set(key, (ventasPorPrecio.get(key) || 0) + cantidad);
        });

        const precioLineas = [];
        const preciosConfiguradosKeys = new Set();
        preciosConfigurados.forEach((precioItem) => {
          if (!precioItem) return;
          const valor = Number(precioItem.valor);
          if (!Number.isFinite(valor)) return;
          const key = Number(valor.toFixed(2)).toFixed(2);
          preciosConfiguradosKeys.add(key);
          const cantidad = ventasPorPrecio.get(key) || 0;
          const etiqueta = (precioItem.label || '').toString().trim();
          const baseTexto = etiqueta ? `${etiqueta}: ${formatCurrency(valor)}` : `${formatCurrency(valor)}`;
          if (cantidad > 0) {
            precioLineas.push(`${baseTexto} (x${cantidad})`);
          } else {
            precioLineas.push(baseTexto);
          }
        });

        const extrasVendidos = [];
        preciosVendidos.forEach((ventaItem) => {
          const valor = Number(ventaItem?.precio_unitario);
          if (!Number.isFinite(valor)) return;
          const key = Number(valor.toFixed(2)).toFixed(2);
          if (preciosConfiguradosKeys.has(key)) return;
          const cantidad = Number(ventaItem?.cantidad) || 0;
          if (!cantidad) return;
          extrasVendidos.push({ valor, cantidad });
        });
        extrasVendidos.sort((a, b) => a.valor - b.valor);
        extrasVendidos.forEach((extra) => {
          precioLineas.push(`${formatCurrency(extra.valor)} (x${extra.cantidad})`);
        });

        if (!precioLineas.length) {
          const precioBase = Number(item.precio_unitario || item.precio || 0);
          precioLineas.push(formatCurrency(precioBase));
        }

        const precio = precioLineas.join('<br>');
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
  if (totalSalidasLinea) totalSalidasLinea.hidden = !Number(totalSalidas);

  const totalGastos = totales.total_gastos || 0;
  if (totalGastosSpan) totalGastosSpan.textContent = formatCurrency(totalGastos);
  if (totalGastosLinea) totalGastosLinea.hidden = !Number(totalGastos);

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
  let endpoint = null;
  if (esModoMensual) {
    if (!desdeParam || !hastaParam) {
      alert('No se encontro el rango del mes solicitado.');
      return;
    }
    const parametros = new URLSearchParams({ desde: desdeParam, hasta: hastaParam });
    endpoint = `/api/caja/cierres/hoja-detalle-mes?${parametros.toString()}`;
  } else if (cierreId) {
    endpoint = `/api/caja/cierres/${encodeURIComponent(cierreId)}/hoja-detalle`;
  }

  if (!endpoint) {
    alert('No se encontro el cierre solicitado.');
    return;
  }

  try {
    const respuesta = await fetch(endpoint, {
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
