const params = new URLSearchParams(window.location.search);
const cotizacionId = params.get('id');

const codigoSpan = document.getElementById('cotizacion-codigo');
const fechaSpan = document.getElementById('cotizacion-fecha');
const validezSpan = document.getElementById('cotizacion-validez');
const estadoSpan = document.getElementById('cotizacion-estado');
const clienteSpan = document.getElementById('cotizacion-cliente');
const documentoSpan = document.getElementById('cotizacion-documento');
const contactoSpan = document.getElementById('cotizacion-contacto');
const subtotalSpan = document.getElementById('cotizacion-subtotal');
const descuentoSpan = document.getElementById('cotizacion-descuento');
const impuestoSpan = document.getElementById('cotizacion-impuesto');
const totalSpan = document.getElementById('cotizacion-total');
const notasClienteSpan = document.getElementById('cotizacion-notas-cliente');
const itemsBody = document.getElementById('cotizacion-items');
const imprimirBtn = document.getElementById('cotizacion-imprimir-btn');
const logoImg = document.getElementById('cotizacion-logo-img');
const logoTexto = document.getElementById('cotizacion-logo-texto');
const direccionSpan = document.getElementById('cotizacion-direccion');
const telefonoSpan = document.getElementById('cotizacion-telefono');
const pieSpan = document.getElementById('cotizacion-pie');
const rncSpan = document.getElementById('cotizacion-rnc');

const authApi = window.kanmAuth;

const obtenerAuthHeadersCotizacion = () => {
  try {
    return authApi?.getAuthHeaders?.() || {};
  } catch (error) {
    console.warn('No se pudieron obtener encabezados de autenticacion para cotizacion:', error);
    return {};
  }
};

const formatCurrency = (valor) => {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(
    numero
  );
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
  if (!fecha) return '--';
  return new Intl.DateTimeFormat('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santo_Domingo',
    hour12: false,
  }).format(fecha);
};

const formatDateOnly = (valor) => {
  const fecha = parseFechaLocal(valor);
  if (!fecha) return '--';
  return new Intl.DateTimeFormat('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Santo_Domingo',
  }).format(fecha);
};

const aplicarConfig = (config) => {
  if (!config) return;
  const { logo, direccion, telefono, pie, rnc, nombre } = config;
  if (logoImg) {
    if (logo) {
      logoImg.src = logo;
      logoImg.style.display = 'block';
      if (logoTexto) logoTexto.style.display = 'none';
    } else {
      logoImg.removeAttribute('src');
      logoImg.style.display = 'none';
      if (logoTexto) {
        const iniciales =
          nombre && typeof nombre === 'string'
            ? nombre
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0] || '')
                .join('')
                .toUpperCase()
            : 'CT';
        logoTexto.textContent = iniciales || 'CT';
        logoTexto.style.display = 'flex';
      }
    }
  }
  if (logoTexto && nombre) {
    logoTexto.textContent = nombre;
  }
  if (direccionSpan) direccionSpan.textContent = direccion || 'Republica Dominicana - ITBIS incluido';
  if (telefonoSpan) telefonoSpan.textContent = telefono || '';
  if (rncSpan) rncSpan.textContent = rnc ? `RNC: ${rnc}` : '';
  if (pieSpan) pieSpan.textContent = pie || 'Documento de cotizacion, no es un comprobante fiscal.';
};

const renderCotizacion = (data) => {
  if (!data || !data.cotizacion) return;
  const { cotizacion, items } = data;

  if (codigoSpan) codigoSpan.textContent = cotizacion.codigo || `#${cotizacion.id}`;
  if (fechaSpan) fechaSpan.textContent = formatDateTime(cotizacion.fecha_creacion);
  if (validezSpan) validezSpan.textContent = cotizacion.fecha_validez ? formatDateOnly(cotizacion.fecha_validez) : '--';
  if (estadoSpan) {
    const estadoValor = cotizacion.estado || 'borrador';
    estadoSpan.textContent = estadoValor;
    estadoSpan.dataset.estado = estadoValor;
  }
  if (clienteSpan) clienteSpan.textContent = cotizacion.cliente_nombre || 'Consumidor final';
  if (documentoSpan) documentoSpan.textContent = cotizacion.cliente_documento || '00000000000';
  if (contactoSpan) contactoSpan.textContent = cotizacion.cliente_contacto || '--';

  if (subtotalSpan) subtotalSpan.textContent = formatCurrency(cotizacion.subtotal);
  if (descuentoSpan) descuentoSpan.textContent = formatCurrency(cotizacion.descuento_monto || 0);
  if (impuestoSpan) impuestoSpan.textContent = formatCurrency(cotizacion.impuesto);
  if (totalSpan) totalSpan.textContent = formatCurrency(cotizacion.total);

  if (notasClienteSpan) notasClienteSpan.textContent = cotizacion.notas_cliente || 'Sin notas para el cliente.';
  if (itemsBody) {
    itemsBody.innerHTML = '';
    if (!items || !items.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 4;
      celda.textContent = 'No hay articulos en esta cotizacion.';
      fila.appendChild(celda);
      itemsBody.appendChild(fila);
      return;
    }

    items.forEach((item) => {
      const fila = document.createElement('tr');
      const cantidad = Number(item.cantidad || 0);
      const precio = Number(item.precio_unitario || 0);
      const subtotalBruto = Number(item.subtotal_sin_descuento) || cantidad * precio;
      const descPct = Number(item.descuento_porcentaje || 0);
      const descMonto = Number(item.descuento_monto || 0);
      const descuentoTotal =
        Number(item.descuento_total) ||
        Math.min(subtotalBruto * (descPct / 100) + descMonto, subtotalBruto);
      const totalLinea = item.total_linea || item.subtotal_linea || subtotalBruto - descuentoTotal;
      const partes = [];
      if (descPct > 0) partes.push(`${descPct}%`);
      if (descMonto > 0) partes.push(formatCurrency(descMonto));
      const unidadesDesc = Number(item.cantidad_descuento);
      const textoUnidades =
        unidadesDesc > 0 && unidadesDesc < cantidad
          ? ` aplicado a ${unidadesDesc} de ${cantidad} unidades`
          : '';
      const descInfo =
        descuentoTotal > 0
          ? `Descuento aplicado${textoUnidades}: -${formatCurrency(descuentoTotal)}${
              partes.length ? ` (${partes.join(' + ')})` : ''
            }`
          : '';

      fila.innerHTML = `
        <td>${cantidad}</td>
        <td>${item.descripcion || item.producto_nombre || `Producto ${item.producto_id || ''}`}${
        descInfo ? `<div class="factura-desc">${descInfo}</div>` : ''
      }</td>
        <td>${formatCurrency(precio)}</td>
        <td>${formatCurrency(totalLinea)}</td>
      `;
      itemsBody.appendChild(fila);
    });
  }
};

const cargarCotizacion = async () => {
  if (!cotizacionId) {
    alert('No se encontro la cotizacion solicitada.');
    return;
  }

  try {
    const [cotResp, configResp] = await Promise.all([
      fetch(`/api/cotizaciones/${cotizacionId}`, {
        headers: {
          ...obtenerAuthHeadersCotizacion(),
        },
      }),
      fetch('/api/configuracion/factura', {
        headers: {
          ...obtenerAuthHeadersCotizacion(),
        },
      }),
    ]);

    if (!cotResp.ok) {
      throw new Error('No se pudo obtener la cotizacion.');
    }
    const data = await cotResp.json();
    renderCotizacion(data);

    if (configResp.ok) {
      const configData = await configResp.json().catch(() => null);
      if (configData?.ok) {
        aplicarConfig(configData.configuracion);
      }
    }
  } catch (error) {
    console.error('Error al cargar la cotizacion:', error);
    alert('Ocurrio un error al cargar la cotizacion. Intenta nuevamente.');
  }
};

imprimirBtn?.addEventListener('click', () => window.print());
document.addEventListener('DOMContentLoaded', cargarCotizacion);
