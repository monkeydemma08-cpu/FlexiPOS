(() => {
  const authApi = window.kanmAuth;
  const params = new URLSearchParams(window.location.search || '');
  const compraId = Number(params.get('id'));

  const dom = {
    titulo: document.getElementById('abastecimiento-print-titulo'),
    generado: document.getElementById('abastecimiento-print-generado'),
    fecha: document.getElementById('abastecimiento-print-fecha'),
    proveedor: document.getElementById('abastecimiento-print-proveedor'),
    origen: document.getElementById('abastecimiento-print-origen'),
    metodo: document.getElementById('abastecimiento-print-metodo'),
    creadoPor: document.getElementById('abastecimiento-print-creado-por'),
    observaciones: document.getElementById('abastecimiento-print-observaciones'),
    detallesBody: document.getElementById('abastecimiento-print-detalles-body'),
    subtotal: document.getElementById('abastecimiento-print-subtotal'),
    itbis: document.getElementById('abastecimiento-print-itbis'),
    total: document.getElementById('abastecimiento-print-total'),
    cxpPanel: document.getElementById('abastecimiento-print-cxp-panel'),
    cxpEstado: document.getElementById('abastecimiento-print-cxp-estado'),
    cxpTotal: document.getElementById('abastecimiento-print-cxp-total'),
    cxpPagado: document.getElementById('abastecimiento-print-cxp-pagado'),
    cxpSaldo: document.getElementById('abastecimiento-print-cxp-saldo'),
    abonosPanel: document.getElementById('abastecimiento-print-abonos-panel'),
    abonosBody: document.getElementById('abastecimiento-print-abonos-body'),
    imprimirBtn: document.getElementById('abastecimiento-imprimir-btn'),
    descargarPdfBtn: document.getElementById('abastecimiento-descargar-pdf-btn'),
  };

  const obtenerAuthHeaders = () => {
    try {
      return authApi?.getAuthHeaders?.() || {};
    } catch (error) {
      console.warn('No se pudieron obtener headers de autenticacion:', error);
      return {};
    }
  };

  const parseFecha = (valor) => {
    if (!valor) return null;
    if (typeof valor === 'string') {
      const limpio = valor.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
        const [anio, mes, dia] = limpio.split('-').map(Number);
        const fechaLocal = new Date(anio, mes - 1, dia);
        return Number.isNaN(fechaLocal.getTime()) ? null : fechaLocal;
      }
      const base = limpio.replace(' ', 'T');
      const conZona = /([zZ]|[+-]\d\d:?\d\d)$/.test(base) ? base : `${base}Z`;
      const fecha = new Date(conZona);
      return Number.isNaN(fecha.getTime()) ? null : fecha;
    }
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
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

  const formatDateTime = (valor) => {
    const fecha = parseFecha(valor);
    if (!fecha) return '--';
    return new Intl.DateTimeFormat('es-DO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Santo_Domingo',
    }).format(fecha);
  };

  const formatNumber = (valor) => {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return '0';
    return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(numero);
  };

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(numero);
  };

  const origenFondosLabel = (valor) => {
    const origen = String(valor || '').trim().toLowerCase();
    if (origen === 'caja') return 'Caja';
    if (origen === 'aporte_externo') return 'Empresa';
    if (origen === 'negocio') return 'Negocio';
    return origen ? origen : '--';
  };

  const estadoCuenta = (cuenta) => {
    const saldo = Number(cuenta?.saldo) || 0;
    const estado = String(cuenta?.estado || '').toUpperCase();
    if (saldo <= 0.001) return 'PAGADO';
    if (estado === 'APROBADO') return 'APROBADO';
    if (estado === 'BORRADOR') return 'BORRADOR';
    return 'PENDIENTE';
  };

  const estadoClase = (estado) => {
    const limpio = String(estado || '').toLowerCase();
    if (limpio === 'pagado') return 'estado-pagado';
    if (limpio === 'aprobado') return 'estado-aprobado';
    if (limpio === 'borrador') return 'estado-borrador';
    return 'estado-pendiente';
  };

  const limpiarTablaConMensaje = (tbody, mensaje, colSpan) => {
    if (!tbody) return;
    tbody.innerHTML = '';
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = colSpan;
    celda.className = 'abastecimiento-print__empty';
    celda.textContent = mensaje;
    fila.appendChild(celda);
    tbody.appendChild(fila);
  };

  const renderDetalles = (detalles = []) => {
    if (!dom.detallesBody) return;
    dom.detallesBody.innerHTML = '';

    if (!Array.isArray(detalles) || detalles.length === 0) {
      limpiarTablaConMensaje(dom.detallesBody, 'No hay productos registrados en esta compra.', 4);
      return;
    }

    const fragment = document.createDocumentFragment();
    detalles.forEach((detalle) => {
      const fila = document.createElement('tr');
      const cProducto = document.createElement('td');
      const cCantidad = document.createElement('td');
      const cCosto = document.createElement('td');
      const cTotal = document.createElement('td');

      const costoBase = Number(detalle?.costo_unitario_sin_itbis);
      const costoMostrar =
        Number.isFinite(costoBase) && costoBase > 0 ? costoBase : Number(detalle?.costo_unitario) || 0;

      cProducto.textContent = detalle?.producto_nombre || `Producto ${detalle?.producto_id || '--'}`;
      cCantidad.textContent = formatNumber(detalle?.cantidad);
      cCantidad.className = 'text-right';
      cCosto.textContent = formatCurrency(costoMostrar);
      cCosto.className = 'text-right';
      cTotal.textContent = formatCurrency(detalle?.total_linea || 0);
      cTotal.className = 'text-right';

      fila.appendChild(cProducto);
      fila.appendChild(cCantidad);
      fila.appendChild(cCosto);
      fila.appendChild(cTotal);
      fragment.appendChild(fila);
    });

    dom.detallesBody.appendChild(fragment);
  };

  const renderCuentaPorPagar = (cuenta, pagos = []) => {
    if (!dom.cxpPanel || !dom.abonosPanel || !dom.abonosBody) return;

    if (!cuenta) {
      dom.cxpPanel.hidden = true;
      dom.abonosPanel.hidden = true;
      dom.abonosBody.innerHTML = '';
      return;
    }

    dom.cxpPanel.hidden = false;
    const estado = estadoCuenta(cuenta);
    if (dom.cxpEstado) {
      dom.cxpEstado.innerHTML = '';
      const badge = document.createElement('span');
      badge.className = `abastecimiento-print__estado ${estadoClase(estado)}`;
      badge.textContent = estado;
      dom.cxpEstado.appendChild(badge);
    }
    if (dom.cxpTotal) dom.cxpTotal.textContent = formatCurrency(cuenta?.monto || 0);
    if (dom.cxpPagado) dom.cxpPagado.textContent = formatCurrency(cuenta?.monto_pagado || 0);
    if (dom.cxpSaldo) dom.cxpSaldo.textContent = formatCurrency(cuenta?.saldo || 0);

    dom.abonosBody.innerHTML = '';
    if (!Array.isArray(pagos) || pagos.length === 0) {
      dom.abonosPanel.hidden = true;
      return;
    }

    dom.abonosPanel.hidden = false;
    const fragment = document.createDocumentFragment();
    pagos.forEach((pago) => {
      const fila = document.createElement('tr');

      const cFecha = document.createElement('td');
      cFecha.textContent = formatDate(pago?.fecha);
      const cMetodo = document.createElement('td');
      cMetodo.textContent = pago?.metodo_pago || '--';
      const cReferencia = document.createElement('td');
      cReferencia.textContent = pago?.referencia || '--';
      const cNotas = document.createElement('td');
      cNotas.textContent = pago?.notas || '--';
      const cMonto = document.createElement('td');
      cMonto.className = 'text-right';
      cMonto.textContent = formatCurrency(pago?.monto || 0);

      fila.appendChild(cFecha);
      fila.appendChild(cMetodo);
      fila.appendChild(cReferencia);
      fila.appendChild(cNotas);
      fila.appendChild(cMonto);
      fragment.appendChild(fila);
    });
    dom.abonosBody.appendChild(fragment);
  };

  const nombrePdf = () => {
    const id = Number.isInteger(compraId) && compraId > 0 ? compraId : 'compra';
    return `abastecimiento_compra_${id}`;
  };

  const abrirDialogoGuardarPdf = () => {
    const tituloOriginal = document.title;
    document.title = nombrePdf();
    window.print();
    window.setTimeout(() => {
      document.title = tituloOriginal;
    }, 600);
  };

  const cargarReporte = async () => {
    if (!Number.isInteger(compraId) || compraId <= 0) {
      alert('No se encontro la compra de abastecimiento.');
      return;
    }

    try {
      const respuesta = await fetch(`/api/inventario/compras/${encodeURIComponent(compraId)}/reporte`, {
        headers: {
          ...obtenerAuthHeaders(),
        },
      });

      if (respuesta.status === 401 || respuesta.status === 403) {
        authApi?.handleUnauthorized?.();
        return;
      }

      if (!respuesta.ok) {
        throw new Error('No se pudo cargar el reporte de abastecimiento.');
      }

      const data = await respuesta.json();
      if (!data?.ok) {
        throw new Error(data?.error || 'No se pudo cargar el reporte de abastecimiento.');
      }

      const compra = data?.compra || {};
      const subtotalBase =
        compra?.subtotal === undefined || compra?.subtotal === null || compra?.subtotal === ''
          ? Number(compra?.total || 0)
          : Number(compra?.subtotal || 0);
      const itbis = Number(compra?.itbis || 0);
      const total = Number(compra?.total ?? subtotalBase + itbis) || 0;

      if (dom.titulo) dom.titulo.textContent = `Compra de abastecimiento #${compra?.id || compraId}`;
      if (dom.generado) dom.generado.textContent = `Generado: ${formatDateTime(data?.generado_en)}`;
      if (dom.fecha) dom.fecha.textContent = `Fecha compra: ${formatDate(compra?.fecha)}`;
      if (dom.proveedor) dom.proveedor.textContent = `Proveedor: ${compra?.proveedor || '--'}`;
      if (dom.origen) dom.origen.textContent = origenFondosLabel(compra?.origen_fondos);
      if (dom.metodo) dom.metodo.textContent = compra?.metodo_pago || '--';
      if (dom.creadoPor) dom.creadoPor.textContent = compra?.creado_por || '--';
      if (dom.observaciones) dom.observaciones.textContent = compra?.observaciones || '--';

      if (dom.subtotal) dom.subtotal.textContent = formatCurrency(subtotalBase);
      if (dom.itbis) dom.itbis.textContent = formatCurrency(itbis);
      if (dom.total) dom.total.textContent = formatCurrency(total);

      renderDetalles(data?.detalles || []);
      renderCuentaPorPagar(data?.cuenta_por_pagar || null, data?.pagos || []);
    } catch (error) {
      console.error('Error cargando reporte de abastecimiento:', error);
      alert(error.message || 'No se pudo cargar el reporte de abastecimiento.');
    }
  };

  dom.imprimirBtn?.addEventListener('click', () => window.print());
  dom.descargarPdfBtn?.addEventListener('click', () => abrirDialogoGuardarPdf());

  document.addEventListener('DOMContentLoaded', cargarReporte);
})();
