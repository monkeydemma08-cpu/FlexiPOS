(() => {
  const authApi = window.kanmAuth;
  const dom = {
    generado: document.getElementById('cxp-print-generado'),
    periodo: document.getElementById('cxp-print-periodo'),
    filtros: document.getElementById('cxp-print-filtros'),
    totalCuentas: document.getElementById('cxp-print-total-cuentas'),
    pendientes: document.getElementById('cxp-print-pendientes'),
    pagadas: document.getElementById('cxp-print-pagadas'),
    totalMonto: document.getElementById('cxp-print-total-monto'),
    totalPagado: document.getElementById('cxp-print-total-pagado'),
    totalSaldo: document.getElementById('cxp-print-total-saldo'),
    cuentasBody: document.getElementById('cxp-print-cuentas-body'),
    abonosPanel: document.getElementById('cxp-print-abonos-panel'),
    abonosBody: document.getElementById('cxp-print-abonos-body'),
    imprimirBtn: document.getElementById('cxp-imprimir-btn'),
    descargarPdfBtn: document.getElementById('cxp-descargar-pdf-btn'),
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

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(numero);
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

  const crearCeldaTexto = (texto = '', className = '') => {
    const celda = document.createElement('td');
    if (className) celda.className = className;
    celda.textContent = texto;
    return celda;
  };

  const limpiarTablaConMensaje = (tbody, mensaje, colSpan) => {
    if (!tbody) return;
    tbody.innerHTML = '';
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = colSpan;
    celda.className = 'cxp-print__empty';
    celda.textContent = mensaje;
    fila.appendChild(celda);
    tbody.appendChild(fila);
  };

  const renderResumen = (resumen = {}) => {
    if (dom.totalCuentas) dom.totalCuentas.textContent = String(Number(resumen.total_cuentas) || 0);
    if (dom.pendientes) dom.pendientes.textContent = String(Number(resumen.cuentas_pendientes) || 0);
    if (dom.pagadas) dom.pagadas.textContent = String(Number(resumen.cuentas_pagadas) || 0);
    if (dom.totalMonto) dom.totalMonto.textContent = formatCurrency(resumen.total_monto || 0);
    if (dom.totalPagado) dom.totalPagado.textContent = formatCurrency(resumen.total_pagado || 0);
    if (dom.totalSaldo) dom.totalSaldo.textContent = formatCurrency(resumen.total_saldo || 0);
  };

  const renderCuentas = (cuentas = []) => {
    if (!dom.cuentasBody) return;
    dom.cuentasBody.innerHTML = '';

    if (!Array.isArray(cuentas) || cuentas.length === 0) {
      limpiarTablaConMensaje(dom.cuentasBody, 'No hay cuentas por pagar en el periodo seleccionado.', 9);
      return;
    }

    const fragment = document.createDocumentFragment();
    cuentas.forEach((cuenta) => {
      const fila = document.createElement('tr');
      const referencia = cuenta?.referencia || `Gasto #${cuenta?.id || '--'}`;
      const proveedor = cuenta?.proveedor || '--';
      const metodo = cuenta?.metodo_pago || '--';
      const estado = estadoCuenta(cuenta);

      fila.appendChild(crearCeldaTexto(`#${cuenta?.id || '--'}`));
      fila.appendChild(crearCeldaTexto(formatDate(cuenta?.fecha)));
      fila.appendChild(crearCeldaTexto(referencia));
      fila.appendChild(crearCeldaTexto(proveedor));
      fila.appendChild(crearCeldaTexto(metodo));
      fila.appendChild(crearCeldaTexto(formatCurrency(cuenta?.monto || 0), 'text-right'));
      fila.appendChild(crearCeldaTexto(formatCurrency(cuenta?.monto_pagado || 0), 'text-right'));
      fila.appendChild(crearCeldaTexto(formatCurrency(cuenta?.saldo || 0), 'text-right'));

      const celdaEstado = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `cxp-print__estado ${estadoClase(estado)}`;
      badge.textContent = estado;
      celdaEstado.appendChild(badge);
      fila.appendChild(celdaEstado);

      fragment.appendChild(fila);
    });

    dom.cuentasBody.appendChild(fragment);
  };

  const renderAbonos = (cuentas = []) => {
    if (!dom.abonosBody || !dom.abonosPanel) return;
    dom.abonosBody.innerHTML = '';

    const abonos = [];
    (cuentas || []).forEach((cuenta) => {
      const pagos = Array.isArray(cuenta?.pagos) ? cuenta.pagos : [];
      pagos.forEach((pago) => {
        abonos.push({
          cuenta_id: cuenta?.id,
          referencia: cuenta?.referencia || `Gasto #${cuenta?.id || '--'}`,
          fecha: pago?.fecha,
          metodo_pago: pago?.metodo_pago,
          referencia_pago: pago?.referencia,
          notas: pago?.notas,
          monto: pago?.monto,
        });
      });
    });

    if (!abonos.length) {
      dom.abonosPanel.hidden = true;
      return;
    }

    dom.abonosPanel.hidden = false;
    const fragment = document.createDocumentFragment();
    abonos.forEach((abono) => {
      const fila = document.createElement('tr');
      fila.appendChild(crearCeldaTexto(`#${abono.cuenta_id || '--'} | ${abono.referencia}`));
      fila.appendChild(crearCeldaTexto(formatDate(abono.fecha)));
      fila.appendChild(crearCeldaTexto(abono.metodo_pago || '--'));
      fila.appendChild(crearCeldaTexto(abono.referencia_pago || '--'));
      fila.appendChild(crearCeldaTexto(abono.notas || '--'));
      fila.appendChild(crearCeldaTexto(formatCurrency(abono.monto || 0), 'text-right'));
      fragment.appendChild(fila);
    });
    dom.abonosBody.appendChild(fragment);
  };

  const construirEtiquetaFiltros = (filtros = {}) => {
    const estado = filtros?.estado ? String(filtros.estado).toUpperCase() : 'TODOS';
    const busqueda = filtros?.q ? ` | Busqueda: "${String(filtros.q)}"` : '';
    return `Estado: ${estado}${busqueda}`;
  };

  const nombrePdf = () => {
    const fecha = new Date();
    const y = String(fecha.getFullYear());
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `reporte_cuentas_por_pagar_${y}-${m}-${d}`;
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
    try {
      const respuesta = await fetch('/api/admin/cuentas-por-pagar/reporte', {
        headers: {
          ...obtenerAuthHeaders(),
        },
      });

      if (respuesta.status === 401 || respuesta.status === 403) {
        authApi?.handleUnauthorized?.();
        return;
      }

      if (!respuesta.ok) {
        throw new Error('No se pudo cargar el reporte de cuentas por pagar.');
      }

      const data = await respuesta.json();
      if (!data?.ok) {
        throw new Error(data?.error || 'No se pudo cargar el reporte de cuentas por pagar.');
      }

      const filtros = data.filtros || {};
      const periodoDesde = filtros?.from ? formatDate(filtros.from) : 'Inicio';
      const periodoHasta = filtros?.to ? formatDate(filtros.to) : 'Hoy';

      if (dom.generado) dom.generado.textContent = `Generado: ${formatDateTime(data?.generado_en)}`;
      if (dom.periodo) dom.periodo.textContent = `Periodo: ${periodoDesde} - ${periodoHasta}`;
      if (dom.filtros) dom.filtros.textContent = `Filtros: ${construirEtiquetaFiltros(filtros)}`;

      renderResumen(data?.resumen || {});
      renderCuentas(data?.cuentas || []);
      renderAbonos(data?.cuentas || []);
    } catch (error) {
      console.error('Error cargando reporte CxP:', error);
      alert(error.message || 'No se pudo cargar el reporte de cuentas por pagar.');
    }
  };

  dom.imprimirBtn?.addEventListener('click', () => window.print());
  dom.descargarPdfBtn?.addEventListener('click', () => abrirDialogoGuardarPdf());

  document.addEventListener('DOMContentLoaded', cargarReporte);
})();
