(() => {
  const modal = document.getElementById('kanm-facturacion-modal');
  const historialModal = document.getElementById('kanm-facturacion-historial-modal');
  if (!modal || !historialModal) return;

  const dom = {
    modal,
    modalCerrar: document.getElementById('kanm-facturacion-btn-cerrar'),
    modalTitulo: document.getElementById('kanm-facturacion-modal-titulo'),
    form: document.getElementById('kanm-facturacion-form'),
    negocioId: document.getElementById('kanm-facturacion-negocio-id'),
    negocioNombre: document.getElementById('kanm-facturacion-negocio-nombre'),
    mensaje: document.getElementById('facturacion-mensaje'),
    guardarConfigBtn: document.getElementById('facturacion-guardar-config'),
    generarBtn: document.getElementById('facturacion-generar'),
    historialModal,
    historialCerrar: document.getElementById('kanm-facturacion-historial-cerrar'),
    historialTitulo: document.getElementById('facturacion-historial-titulo'),
    historialMensaje: document.getElementById('facturacion-historial-mensaje'),
    historialBody: document.getElementById('facturacion-historial-body'),
    historialRecargar: document.getElementById('facturacion-historial-recargar'),
  };

  const CONFIG_FIELDS = {
    cliente_nombre: 'facturacion-cliente-nombre',
    cliente_rnc: 'facturacion-cliente-rnc',
    cliente_direccion: 'facturacion-cliente-direccion',
    cliente_telefono: 'facturacion-cliente-telefono',
    cliente_email: 'facturacion-cliente-email',
    cliente_contacto: 'facturacion-cliente-contacto',
    emisor_nombre: 'facturacion-emisor-nombre',
    emisor_rnc: 'facturacion-emisor-rnc',
    emisor_direccion: 'facturacion-emisor-direccion',
    emisor_telefono: 'facturacion-emisor-telefono',
    emisor_email: 'facturacion-emisor-email',
    emisor_logo: 'facturacion-emisor-logo',
    emisor_nota: 'facturacion-emisor-nota',
    plan_nombre: 'facturacion-plan-nombre',
    precio_base: 'facturacion-precio-base',
    moneda: 'facturacion-moneda',
    impuesto_tipo: 'facturacion-impuesto-tipo',
    impuesto_valor: 'facturacion-impuesto-valor',
    periodo_default: 'facturacion-periodo-default',
    terminos_pago: 'facturacion-terminos',
    metodo_pago: 'facturacion-metodo',
    notas_internas: 'facturacion-notas',
  };

  const FACTURA_FIELDS = {
    fecha_emision: 'factura-fecha-emision',
    periodo: 'factura-periodo',
    estado: 'factura-estado',
    descripcion: 'factura-descripcion',
    cantidad: 'factura-cantidad',
    precio_unitario: 'factura-precio-unitario',
    descuento: 'factura-descuento',
  };

  const RESUMEN_FIELDS = {
    subtotal: document.getElementById('facturacion-resumen-subtotal'),
    itbis: document.getElementById('facturacion-resumen-itbis'),
    descuento: document.getElementById('facturacion-resumen-descuento'),
    total: document.getElementById('facturacion-resumen-total'),
  };

  let descripcionAuto = true;
  let negocioActualId = null;
  let negocioActualNombre = '';

  const setModalVisible = (el, visible) => {
    if (!el) return;
    el.classList.toggle('oculto', !visible);
  };

  const setMessageLocal = (el, text, type = 'info') => {
    if (!el) return;
    if (typeof setMessage === 'function') {
      setMessage(el, text, type);
    } else {
      el.textContent = text || '';
    }
  };

  const parseNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const getCurrencyCode = (moneda) => {
    if (!moneda) return 'DOP';
    const upper = String(moneda).toUpperCase();
    if (upper.includes('USD')) return 'USD';
    if (upper.includes('DOP') || upper.includes('RD')) return 'DOP';
    return 'DOP';
  };

  const formatCurrency = (value, moneda) => {
    const currency = getCurrencyCode(moneda);
    const num = Number(value) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-DO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const getAuthHeaders = () => {
    try {
      return window.kanmAuth?.getAuthHeaders?.() || {};
    } catch (error) {
      return {};
    }
  };

  const fetchJson = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    };
    const resp = await fetch(url, { ...options, headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      const message = data?.error || 'Solicitud no completada';
      throw new Error(message);
    }
    return data;
  };

  const setFieldValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value ?? '';
  };

  const getFieldValue = (id) => {
    const el = document.getElementById(id);
    if (!el) return '';
    return el.value ?? '';
  };

  const llenarConfig = (config = {}) => {
    Object.entries(CONFIG_FIELDS).forEach(([key, id]) => {
      if (config[key] !== undefined && config[key] !== null) {
        setFieldValue(id, config[key]);
      }
    });
  };

  const leerConfig = () => {
    const config = {};
    Object.entries(CONFIG_FIELDS).forEach(([key, id]) => {
      const value = getFieldValue(id);
      config[key] = value;
    });
    config.precio_base = parseNumber(config.precio_base, 0);
    config.impuesto_valor = parseNumber(config.impuesto_valor, 0);
    return config;
  };

  const llenarFactura = (config = {}) => {
    const hoy = new Date().toISOString().slice(0, 10);
    setFieldValue(FACTURA_FIELDS.fecha_emision, hoy);
    setFieldValue(FACTURA_FIELDS.periodo, config.periodo_default || '');
    setFieldValue(FACTURA_FIELDS.estado, 'pendiente');
    setFieldValue(FACTURA_FIELDS.cantidad, 1);
    setFieldValue(FACTURA_FIELDS.precio_unitario, config.precio_base ?? 0);
    setFieldValue(FACTURA_FIELDS.descuento, 0);

    const descripcion = [config.plan_nombre || 'Suscripcion POSIUM', config.periodo_default]
      .filter(Boolean)
      .join(' - ');
    setFieldValue(FACTURA_FIELDS.descripcion, descripcion);
    descripcionAuto = true;
  };

  const leerFactura = () => {
    const factura = {};
    Object.entries(FACTURA_FIELDS).forEach(([key, id]) => {
      factura[key] = getFieldValue(id);
    });
    factura.cantidad = parseNumber(factura.cantidad, 1);
    factura.precio_unitario = parseNumber(factura.precio_unitario, 0);
    factura.descuento = parseNumber(factura.descuento, 0);
    return factura;
  };

  const actualizarDescripcion = () => {
    const descripcionActual = getFieldValue(FACTURA_FIELDS.descripcion);
    if (!descripcionAuto && descripcionActual) return;
    const plan = getFieldValue(CONFIG_FIELDS.plan_nombre) || 'Suscripcion POSIUM';
    const periodo = getFieldValue(FACTURA_FIELDS.periodo) || getFieldValue(CONFIG_FIELDS.periodo_default) || '';
    const descripcion = [plan, periodo].filter(Boolean).join(' - ');
    setFieldValue(FACTURA_FIELDS.descripcion, descripcion);
    descripcionAuto = true;
  };

  const actualizarResumen = () => {
    const config = leerConfig();
    const factura = leerFactura();
    const subtotal = factura.cantidad * factura.precio_unitario;
    const impuestoValor = parseNumber(config.impuesto_valor, 0);
    const impuestoTipo = (config.impuesto_tipo || '').toLowerCase();
    const itbis = impuestoTipo === 'fijo' ? impuestoValor : (subtotal * impuestoValor) / 100;
    const descuento = Math.max(0, factura.descuento || 0);
    const total = subtotal + itbis - descuento;

    const moneda = config.moneda || 'RD$';
    if (RESUMEN_FIELDS.subtotal) RESUMEN_FIELDS.subtotal.textContent = formatCurrency(subtotal, moneda);
    if (RESUMEN_FIELDS.itbis) RESUMEN_FIELDS.itbis.textContent = formatCurrency(itbis, moneda);
    if (RESUMEN_FIELDS.descuento) RESUMEN_FIELDS.descuento.textContent = formatCurrency(descuento, moneda);
    if (RESUMEN_FIELDS.total) RESUMEN_FIELDS.total.textContent = formatCurrency(total, moneda);
  };

  const abrirModal = async (negocioId) => {
    if (!negocioId) return;
    negocioActualId = negocioId;
    descripcionAuto = true;
    setMessageLocal(dom.mensaje, '', 'info');
    setModalVisible(dom.modal, true);
    if (dom.form) dom.form.reset();

    try {
      setMessageLocal(dom.mensaje, 'Cargando configuracion...', 'info');
      const data = await fetchJson(`/api/admin/negocios/${negocioId}/facturacion-config`);
      const config = data?.config || {};
      negocioActualNombre = data?.negocio?.nombre || '';
      if (dom.modalTitulo) {
        dom.modalTitulo.textContent = negocioActualNombre
          ? `Facturacion POSIUM - ${negocioActualNombre}`
          : 'Facturacion POSIUM';
      }
      if (dom.negocioNombre) {
        dom.negocioNombre.textContent = negocioActualNombre ? `Negocio: ${negocioActualNombre}` : '';
      }
      if (dom.negocioId) dom.negocioId.value = negocioId;
      llenarConfig(config);
      llenarFactura(config);
      actualizarResumen();
      setMessageLocal(dom.mensaje, '', 'info');
    } catch (error) {
      console.error('Error cargando configuracion POSIUM:', error);
      setMessageLocal(dom.mensaje, error.message || 'No se pudo cargar la configuracion.', 'error');
    }
  };

  const cerrarModal = () => {
    setModalVisible(dom.modal, false);
    setMessageLocal(dom.mensaje, '', 'info');
  };

  const guardarConfig = async () => {
    if (!negocioActualId) return;
    try {
      setMessageLocal(dom.mensaje, 'Guardando configuracion...', 'info');
      const config = leerConfig();
      await fetchJson(`/api/admin/negocios/${negocioActualId}/facturacion-config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setMessageLocal(dom.mensaje, 'Configuracion guardada.', 'info');
    } catch (error) {
      console.error('Error guardando configuracion POSIUM:', error);
      setMessageLocal(dom.mensaje, error.message || 'No se pudo guardar la configuracion.', 'error');
    }
  };

  const generarFactura = async () => {
    if (!negocioActualId) return;
    try {
      setMessageLocal(dom.mensaje, 'Generando factura...', 'info');
      const config = leerConfig();
      const factura = leerFactura();
      const payload = {
        config,
        factura,
        actualizar_config: true,
      };
      const data = await fetchJson(`/api/admin/negocios/${negocioActualId}/facturas`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const facturaId = data?.factura?.id;
      setMessageLocal(dom.mensaje, 'Factura generada.', 'info');
      if (facturaId) {
        window.open(`/posium-factura.html?id=${facturaId}`, '_blank');
      }
      await cargarHistorial(negocioActualId);
    } catch (error) {
      console.error('Error generando factura POSIUM:', error);
      setMessageLocal(dom.mensaje, error.message || 'No se pudo generar la factura.', 'error');
    }
  };

  const abrirHistorial = async (negocioId) => {
    if (!negocioId) return;
    negocioActualId = negocioId;
    if (dom.historialTitulo) {
      const cache = typeof KANM_NEGOCIOS_CACHE !== 'undefined' ? KANM_NEGOCIOS_CACHE : [];
      const negocio = (cache || []).find(
        (item) => String(item.id) === String(negocioId)
      );
      const nombre = negocio?.nombre || negocio?.titulo_sistema || '';
      dom.historialTitulo.textContent = nombre ? `Negocio: ${nombre}` : '';
    }
    setModalVisible(dom.historialModal, true);
    await cargarHistorial(negocioId);
  };

  const cerrarHistorial = () => {
    setModalVisible(dom.historialModal, false);
    setMessageLocal(dom.historialMensaje, '', 'info');
  };

  const cargarHistorial = async (negocioId) => {
    if (!dom.historialBody) return;
    try {
      setMessageLocal(dom.historialMensaje, 'Cargando historial...', 'info');
      const data = await fetchJson(`/api/admin/negocios/${negocioId}/facturas`);
      const items = data?.items || [];
      dom.historialBody.innerHTML = '';
      if (!items.length) {
        dom.historialBody.innerHTML = '<tr><td colspan="6">No hay facturas registradas.</td></tr>';
        setMessageLocal(dom.historialMensaje, '', 'info');
        return;
      }
      dom.historialBody.innerHTML = items
        .map((item) => {
          const estado = item.estado || 'pendiente';
          const moneda = item.moneda || getFieldValue(CONFIG_FIELDS.moneda) || 'RD$';
          return `
            <tr>
              <td>${item.numero_factura || item.id}</td>
              <td>${formatDate(item.fecha_emision)}</td>
              <td>${item.periodo || ''}</td>
              <td>${formatCurrency(item.total || 0, moneda)}</td>
              <td>${estado}</td>
              <td>
                <button type="button" class="kanm-button ghost" data-factura-id="${item.id}">Ver</button>
              </td>
            </tr>
          `;
        })
        .join('');
      setMessageLocal(dom.historialMensaje, '', 'info');
    } catch (error) {
      console.error('Error cargando historial POSIUM:', error);
      setMessageLocal(dom.historialMensaje, error.message || 'No se pudo cargar el historial.', 'error');
    }
  };

  dom.modalCerrar?.addEventListener('click', cerrarModal);
  dom.historialCerrar?.addEventListener('click', cerrarHistorial);
  dom.historialRecargar?.addEventListener('click', () => {
    if (negocioActualId) cargarHistorial(negocioActualId);
  });

  dom.guardarConfigBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    guardarConfig();
  });

  dom.generarBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    generarFactura();
  });

  dom.historialBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-factura-id]');
    if (!btn) return;
    const facturaId = btn.dataset.facturaId;
    if (facturaId) {
      window.open(`/posium-factura.html?id=${facturaId}`, '_blank');
    }
  });

  Object.values(CONFIG_FIELDS).forEach((id) => {
    const el = document.getElementById(id);
    const handler = () => {
      if (id === CONFIG_FIELDS.plan_nombre || id === CONFIG_FIELDS.periodo_default) {
        if (id === CONFIG_FIELDS.periodo_default && !getFieldValue(FACTURA_FIELDS.periodo)) {
          setFieldValue(FACTURA_FIELDS.periodo, getFieldValue(CONFIG_FIELDS.periodo_default));
        }
        actualizarDescripcion();
      }
      actualizarResumen();
    };
    el?.addEventListener('input', handler);
    el?.addEventListener('change', handler);
  });

  Object.values(FACTURA_FIELDS).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      if (id === FACTURA_FIELDS.descripcion) {
        descripcionAuto = false;
      }
      if (id === FACTURA_FIELDS.periodo) {
        actualizarDescripcion();
      }
      actualizarResumen();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  window.kanmFacturacionPosium = {
    abrirModal,
    abrirHistorial,
  };
})();
