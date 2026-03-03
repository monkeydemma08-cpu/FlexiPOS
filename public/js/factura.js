(function () {
  'use strict';
  if (window.__FACTURA_JS_LOADED__) return;
  window.__FACTURA_JS_LOADED__ = true;

  const params = new URLSearchParams(window.location.search);
  const pedidoId = params.get('id');
  const parsePreviewMoney = (key) => {
    const raw = params.get(key);
    if (raw === null || raw === undefined || raw === '') return null;
    const numero = Number(raw);
    return Number.isFinite(numero) ? numero : null;
  };
  const vistaPreviaFactura = {
    activa: params.get('preview') === '1',
    subtotal: parsePreviewMoney('preview_subtotal'),
    impuesto: parsePreviewMoney('preview_impuesto'),
    descuento: parsePreviewMoney('preview_descuento'),
    propina: parsePreviewMoney('preview_propina'),
    total: parsePreviewMoney('preview_total'),
  };

  const ncfSpan = document.getElementById('factura-ncf');
  const fechaSpan = document.getElementById('factura-fecha');
  const pedidoSpan = document.getElementById('factura-pedido');
  const clienteSpan = document.getElementById('factura-cliente');
  const documentoSpan = document.getElementById('factura-documento');
  const metodoPagoSpan = document.getElementById('factura-metodo-pago');
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
    colorPrimario: '#255bc7',
    colorSecundario: '#7b8fb8',
    colorTexto: '#24344a',
    colorHeader: '#255bc7',
    colorBotonPrimario: '#255bc7',
    colorBotonSecundario: '#7b8fb8',
    colorBotonPeligro: '#ff4b4b',
  };

  let temaNegocio = window.APP_TEMA_NEGOCIO || null;
  let configuracionFactura = null;

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(numero);
  };

  const limpiarTextoFactura = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();

  const escaparHtml = (texto) =>
    String(texto ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

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

  const normalizarMetodoPagoFactura = (pedido) => {
    const efectivo = Number(pedido?.pago_efectivo) || 0;
    const tarjeta = Number(pedido?.pago_tarjeta) || 0;
    const transferencia = Number(pedido?.pago_transferencia) || 0;
    const metodos = [];

    if (efectivo > 0.009) metodos.push('Efectivo');
    if (tarjeta > 0.009) metodos.push('Tarjeta');
    if (transferencia > 0.009) metodos.push('Transferencia');

    if (!metodos.length) return 'Sin registrar';
    if (metodos.length === 1) return metodos[0];
    return `Mixto (${metodos.join(' + ')})`;
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
    if (pedidoSpan) {
      pedidoSpan.textContent = vistaPreviaFactura.activa ? `#${pedido.id} (Vista previa)` : `#${pedido.id}`;
    }
    if (clienteSpan) clienteSpan.textContent = pedido.cliente || 'Consumidor final';
    if (documentoSpan) documentoSpan.textContent = pedido.cliente_documento || '00000000000';
    if (metodoPagoSpan) {
      metodoPagoSpan.textContent = normalizarMetodoPagoFactura(pedido);
    }

    const itemsAgregados = agruparItemsFactura(items || []);
    const descuentoGeneral = Number(pedido.descuento_monto) || 0;
    const descuentoItems = itemsAgregados.reduce(
      (acc, item) => acc + (Number(item.descuento_total) || 0),
      0
    );

    const subtotalMostrar =
      vistaPreviaFactura.activa && Number.isFinite(vistaPreviaFactura.subtotal)
        ? vistaPreviaFactura.subtotal
        : Number(pedido.subtotal) || 0;
    const impuestoMostrar =
      vistaPreviaFactura.activa && Number.isFinite(vistaPreviaFactura.impuesto)
        ? vistaPreviaFactura.impuesto
        : Number(pedido.impuesto) || 0;
    const descuentoGeneralMostrar =
      vistaPreviaFactura.activa && Number.isFinite(vistaPreviaFactura.descuento)
        ? vistaPreviaFactura.descuento
        : descuentoGeneral;
    const propinaMostrar =
      vistaPreviaFactura.activa && Number.isFinite(vistaPreviaFactura.propina)
        ? vistaPreviaFactura.propina
        : Number(pedido.propina_monto) || 0;
    const totalMostrar =
      vistaPreviaFactura.activa && Number.isFinite(vistaPreviaFactura.total)
        ? vistaPreviaFactura.total
        : Number(pedido.total_final ?? pedido.total) || 0;

    if (subtotalSpan) subtotalSpan.textContent = formatCurrency(subtotalMostrar);
    if (impuestoSpan) impuestoSpan.textContent = formatCurrency(impuestoMostrar);
    if (descuentoSpan) {
      if (descuentoGeneralMostrar > 0) {
        descuentoSpan.textContent = `- ${formatCurrency(descuentoGeneralMostrar)}`;
      } else if (descuentoItems > 0) {
        descuentoSpan.textContent = `- ${formatCurrency(descuentoItems)} (productos, incluido)`;
      } else {
        descuentoSpan.textContent = `- ${formatCurrency(0)}`;
      }
    }
    if (propinaSpan) propinaSpan.textContent = formatCurrency(propinaMostrar);
    if (totalSpan) totalSpan.textContent = formatCurrency(totalMostrar);

    if (itemsBody) {
      itemsBody.innerHTML = '';

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
        const tieneDescuento = descuentoTotal > 0.009;
        const precioOriginal = formatCurrency(precio);
        const subtotalOriginal = formatCurrency(subtotalBruto);
        const precioHtml = `
          <div class="factura-price-block">
            ${tieneDescuento ? `<span class="factura-price-old">${precioOriginal}</span>` : ''}
            <span class="factura-price-final">${formatCurrency(precioFinal)}</span>
          </div>
        `;
        const subtotalHtml = `
          <div class="factura-price-block">
            ${tieneDescuento ? `<span class="factura-price-old">${subtotalOriginal}</span>` : ''}
            <span class="factura-price-final">${formatCurrency(subtotalFinal)}</span>
          </div>
        `;
        const nombreCompleto = limpiarTextoFactura(item.nombre || `Producto ${item.producto_id || ''}`);
        const nombreSeguro = escaparHtml(nombreCompleto || '--');
        const tituloSeguro = escaparHtml(nombreCompleto);
        fila.innerHTML = `
        <td class="factura-prod-cell"><span class="factura-prod-name" title="${tituloSeguro}">${nombreSeguro}</span></td>
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
