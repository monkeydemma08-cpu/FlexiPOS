(function () {
  'use strict';
  if (window.__FACTURA_JS_LOADED__) return;
  window.__FACTURA_JS_LOADED__ = true;

  const params = new URLSearchParams(window.location.search);
  const pedidoId = params.get('id');

  const ncfSpan = document.getElementById('factura-ncf');
  const fechaSpan = document.getElementById('factura-fecha');
  const pedidoSpan = document.getElementById('factura-pedido');
  const clienteSpan = document.getElementById('factura-cliente');
  const documentoSpan = document.getElementById('factura-documento');
  const tipoSpan = document.getElementById('factura-tipo');
  const subtotalSpan = document.getElementById('factura-subtotal');
  const impuestoSpan = document.getElementById('factura-impuesto');
  const descuentoSpan = document.getElementById('factura-descuento');
  const propinaSpan = document.getElementById('factura-propina');
  const totalSpan = document.getElementById('factura-total');
  const itemsBody = document.getElementById('factura-items');
  const imprimirBtn = document.getElementById('factura-imprimir');
  const logoImg = document.getElementById('factura-logo-img');
  const logoTexto = document.getElementById('factura-logo-texto');
  const nombreNegocioSpan = document.getElementById('factura-negocio-nombre');
  const direccionSpan = document.getElementById('factura-direccion');
  const telefonoSpan = document.getElementById('factura-telefono');
  const pieSpan = document.getElementById('factura-pie');

  const DEFAULT_THEME = {
    colorPrimario: '#36c1b3',
    colorSecundario: '#91a2f4',
    colorTexto: '#1f2a2a',
    colorHeader: '#36c1b3',
    colorBotonPrimario: '#36c1b3',
    colorBotonSecundario: '#91a2f4',
    colorBotonPeligro: '#ff4b4b',
  };

  let temaNegocio = window.APP_TEMA_NEGOCIO || null;
  let configuracionFactura = null;

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(numero);
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
    if (!fecha) return '-';
    return new Intl.DateTimeFormat('es-DO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Santo_Domingo',
      hour12: true,
    }).format(fecha);
  };

  const agruparItemsFactura = (items = []) =>
    (items || []).map((item) => {
      const cantidad = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      const subtotalBruto = Number(item.subtotal_sin_descuento) || cantidad * precio;
      const descPct = Number(item.descuento_porcentaje) || 0;
      const descMonto = Number(item.descuento_monto) || 0;
      const descuentoTotal =
        Number(item.descuento_total) ||
        Math.min(subtotalBruto * (descPct / 100) + descMonto, subtotalBruto);
      const subtotal = item.total_linea ?? item.subtotal ?? subtotalBruto - descuentoTotal;
      return {
        nombre: item.nombre || `Producto ${item.producto_id || ''}`,
        producto_id: item.producto_id,
        precio_unitario: precio,
        descuento_porcentaje: descPct,
        descuento_monto: descMonto,
        descuento_total: descuentoTotal,
        cantidad,
        subtotal,
      };
    });

  const normalizarColor = (valor, fallback) => {
    const limpio = typeof valor === 'string' ? valor.trim() : '';
    return limpio || fallback;
  };

  const normalizarTipoComprobante = (valor) => {
    if (valor === undefined || valor === null) return '';
    const texto = String(valor).trim();
    if (!texto) return '';
    const lower = texto.toLowerCase();
    if (['sin comprobante', 'sin_comprobante', 'sin'].includes(lower)) {
      return 'Sin comprobante';
    }
    if (['b01', 'b02', 'b14'].includes(lower)) {
      return lower.toUpperCase();
    }
    return texto;
  };

  const obtenerNombreNegocio = () =>
    configuracionFactura?.nombre ||
    temaNegocio?.titulo ||
    temaNegocio?.titulo_sistema ||
    temaNegocio?.nombre ||
    temaNegocio?.slug ||
    '';

  const obtenerIniciales = (texto) => {
    if (!texto) return '';
    const partes = texto.trim().split(/\s+/);
    if (partes.length === 1) {
      return partes[0].slice(0, 2).toUpperCase();
    }
    return (partes[0][0] + partes[1][0]).toUpperCase();
  };

  const aplicarIdentidadFactura = () => {
    const nombreNegocio = obtenerNombreNegocio() || 'Factura';

    if (nombreNegocioSpan) {
      nombreNegocioSpan.textContent = nombreNegocio;
    }

    document.title = nombreNegocio ? `${nombreNegocio} - Factura` : 'Factura';

    const logoFuente = (configuracionFactura?.logo || '').trim() || temaNegocio?.logoUrl || temaNegocio?.logo_url || '';
    const tieneLogo = Boolean(logoFuente);

    if (logoImg) {
      if (tieneLogo) {
        logoImg.src = logoFuente;
        logoImg.style.display = 'block';
        logoImg.alt = `Logo de ${nombreNegocio}`;
      } else {
        logoImg.removeAttribute('src');
        logoImg.style.display = 'none';
      }
    }

    if (logoTexto) {
      const iniciales = obtenerIniciales(nombreNegocio);
      logoTexto.textContent = iniciales || nombreNegocio.slice(0, 2).toUpperCase();
      logoTexto.style.display = tieneLogo ? 'none' : 'flex';
    }
  };

  const aplicarTemaFactura = (tema) => {
    if (!tema) return;
    const root = document.documentElement;

    const colorPrimario = normalizarColor(tema.colorPrimario || tema.color_primario, DEFAULT_THEME.colorPrimario);
    const colorSecundario = normalizarColor(
      tema.colorSecundario || tema.color_secundario,
      DEFAULT_THEME.colorSecundario
    );
    const colorTexto = normalizarColor(tema.colorTexto || tema.color_texto, DEFAULT_THEME.colorTexto);
    const colorHeader = normalizarColor(
      tema.colorHeader || tema.color_header || colorPrimario,
      DEFAULT_THEME.colorHeader
    );
    const colorBotonPrimario = normalizarColor(
      tema.colorBotonPrimario || tema.color_boton_primario || colorPrimario,
      DEFAULT_THEME.colorBotonPrimario
    );
    const colorBotonSecundario = normalizarColor(
      tema.colorBotonSecundario || tema.color_boton_secundario || colorSecundario,
      DEFAULT_THEME.colorBotonSecundario
    );
    const colorBotonPeligro = normalizarColor(
      tema.colorBotonPeligro || tema.color_boton_peligro,
      DEFAULT_THEME.colorBotonPeligro
    );

    root.style.setProperty('--color-primario', colorPrimario);
    root.style.setProperty('--color-secundario', colorSecundario);
    root.style.setProperty('--color-texto', colorTexto);
    root.style.setProperty('--color-header', colorHeader);
    root.style.setProperty('--color-boton-primario', colorBotonPrimario);
    root.style.setProperty('--color-boton-secundario', colorBotonSecundario);
    root.style.setProperty('--color-boton-peligro', colorBotonPeligro);
    root.style.setProperty('--kanm-pink', colorBotonPrimario);
    root.style.setProperty('--kanm-pink-dark', colorBotonPrimario);
    root.style.setProperty('--kanm-pink-light', colorBotonPrimario);

    temaNegocio = {
      ...(temaNegocio || {}),
      ...tema,
      colorPrimario,
      colorSecundario,
      colorTexto,
      colorHeader,
      colorBotonPrimario,
      colorBotonSecundario,
      colorBotonPeligro,
    };

    aplicarIdentidadFactura();
  };

  const aplicarConfigFactura = (config) => {
    configuracionFactura = config || null;
    const direccion = configuracionFactura?.direccion || 'Republica Dominicana - ITBIS incluido';
    const telefono =
      configuracionFactura?.telefono ||
      (Array.isArray(configuracionFactura?.telefonos) ? configuracionFactura.telefonos.join(' | ') : '') ||
      '';
    const pie = configuracionFactura?.pie || 'Gracias por su compra.';

    if (direccionSpan) direccionSpan.textContent = direccion;
    if (telefonoSpan) telefonoSpan.textContent = telefono;
    if (pieSpan) pieSpan.textContent = pie;

    aplicarIdentidadFactura();
  };

  const renderFactura = (data) => {
    if (!data || !data.pedido) return;
    const { pedido, items } = data;

    if (ncfSpan) ncfSpan.textContent = pedido.ncf || '-';
    if (fechaSpan) fechaSpan.textContent = formatDateTime(pedido.fecha_cierre || pedido.fecha_factura);
    if (pedidoSpan) pedidoSpan.textContent = `#${pedido.id}`;
    if (clienteSpan) clienteSpan.textContent = pedido.cliente || 'Consumidor final';
    if (documentoSpan) documentoSpan.textContent = pedido.cliente_documento || '00000000000';
    if (tipoSpan) {
      const tipoTexto = normalizarTipoComprobante(pedido.tipo_comprobante || 'B02');
      const filaTipo = tipoSpan.closest('p');
      if (tipoTexto.toLowerCase() === 'sin comprobante') {
        if (filaTipo) filaTipo.style.display = 'none';
      } else {
        if (filaTipo) filaTipo.style.display = '';
        tipoSpan.textContent = tipoTexto || 'B02';
      }
    }

    if (subtotalSpan) subtotalSpan.textContent = formatCurrency(pedido.subtotal);
    if (impuestoSpan) impuestoSpan.textContent = formatCurrency(pedido.impuesto);
    if (descuentoSpan) descuentoSpan.textContent = `- ${formatCurrency(pedido.descuento_monto)}`;
    if (propinaSpan) propinaSpan.textContent = formatCurrency(pedido.propina_monto);
    if (totalSpan) totalSpan.textContent = formatCurrency(pedido.total_final);

    if (itemsBody) {
      itemsBody.innerHTML = '';
      const itemsAgregados = agruparItemsFactura(items || []);

      if (!itemsAgregados.length) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');
        celda.colSpan = 4;
        celda.textContent = 'No hay articulos registrados en esta factura.';
        fila.appendChild(celda);
        itemsBody.appendChild(fila);
        return;
      }

      itemsAgregados.forEach((item) => {
        const fila = document.createElement('tr');
        const cantidad = Number(item.cantidad || 0);
        const precio = Number(item.precio_unitario || 0);
        const subtotalBruto = precio * cantidad;
        const descPct = Number(item.descuento_porcentaje || 0);
        const descMonto = Number(item.descuento_monto || 0);
        const descuentoBase = Number(item.descuento_total || 0);
        const descuentoCalculado = Math.min(subtotalBruto * (descPct / 100) + descMonto, subtotalBruto);
        const descuentoTotal = descuentoBase > 0 ? Math.min(descuentoBase, subtotalBruto) : descuentoCalculado;
        const subtotalFinal = Math.max(subtotalBruto - descuentoTotal, 0);
        const precioFinal = cantidad > 0 ? subtotalFinal / cantidad : precio;
        const tieneDescuento = descuentoTotal > 0;
        const precioHtml = tieneDescuento
          ? `
            <div class="factura-price-block">
              <div class="factura-price-stack">
                <span class="factura-price-original">${formatCurrency(precio)}</span>
                <span class="factura-price-final">${formatCurrency(precioFinal)}</span>
              </div>
            </div>
          `
          : `
            <div class="factura-price-block">
              <span class="factura-price-final">${formatCurrency(precio)}</span>
            </div>
          `;
        const subtotalHtml = tieneDescuento
          ? `
            <div class="factura-price-block">
              <div class="factura-price-stack">
                <span class="factura-price-original">${formatCurrency(subtotalBruto)}</span>
                <span class="factura-price-final">${formatCurrency(subtotalFinal)}</span>
              </div>
            </div>
          `
          : `
            <div class="factura-price-block">
              <span class="factura-price-final">${formatCurrency(subtotalBruto)}</span>
            </div>
          `;
        fila.innerHTML = `
        <td class="factura-prod-cell"><span class="factura-prod-name">${item.nombre || `Producto ${item.producto_id || ''}`}</span></td>
        <td class="factura-qty-cell">${cantidad}</td>
        <td class="factura-price-cell">${precioHtml}</td>
        <td class="factura-subtotal-cell">${subtotalHtml}</td>
      `;
        itemsBody.appendChild(fila);
      });
    }
  };

  const authApi = window.kanmAuth;

  const obtenerAuthHeadersFactura = () => {
    try {
      return authApi?.getAuthHeaders?.() || {};
    } catch (error) {
      console.warn('No se pudieron obtener encabezados de autenticacion para factura:', error);
      return {};
    }
  };

  const obtenerTemaNegocio = async () => {
    if (temaNegocio) {
      aplicarTemaFactura(temaNegocio);
      return temaNegocio;
    }

    try {
      const resp = await fetch('/api/negocios/mi-tema', {
        headers: {
          ...obtenerAuthHeadersFactura(),
        },
      });

      if (!resp.ok) {
        return null;
      }

      const data = await resp.json().catch(() => null);
      const tema = data?.tema || data || null;
      if (tema) {
        aplicarTemaFactura(tema);
      }
      return tema;
    } catch (error) {
      console.warn('No se pudo cargar el tema del negocio para la factura:', error);
      return null;
    }
  };

  const cargarFactura = async () => {
    if (!pedidoId) {
      alert('No se encontro el identificador de la factura.');
      return;
    }

    try {
      const [facturaResp, configResp] = await Promise.all([
        fetch(`/api/pedidos/${pedidoId}/factura`, {
          headers: {
            ...obtenerAuthHeadersFactura(),
          },
        }),
        fetch('/api/configuracion/factura', {
          headers: {
            ...obtenerAuthHeadersFactura(),
          },
        }),
        obtenerTemaNegocio(),
      ]);

      if (!facturaResp.ok) {
        throw new Error('No se pudo obtener la factura.');
      }
      const facturaData = await facturaResp.json();
      renderFactura(facturaData);

      if (configResp.ok) {
        const configData = await configResp.json().catch(() => null);
        if (configData?.ok) {
          aplicarConfigFactura(configData.configuracion);
        } else {
          aplicarIdentidadFactura();
        }
      } else {
        aplicarIdentidadFactura();
      }
    } catch (error) {
      console.error('Error al cargar la factura:', error);
      alert('Ocurrio un error al cargar la factura. Intenta nuevamente.');
    }
  };

  imprimirBtn?.addEventListener('click', () => {
    window.print();
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (temaNegocio) {
      aplicarTemaFactura(temaNegocio);
    }
    cargarFactura();
  });
})();
