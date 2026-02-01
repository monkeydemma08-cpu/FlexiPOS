(() => {
  const authApi = window.kanmAuth;
  const sessionApi = window.KANMSession;
  const EMPRESA_BACKUP_KEY = 'kanmEmpresaBackup';

  const kpiVentas = document.getElementById('empresa-kpi-ventas');
  const kpiVentasCount = document.getElementById('empresa-kpi-ventas-count');
  const kpiGastos = document.getElementById('empresa-kpi-gastos');
  const kpiGanancia = document.getElementById('empresa-kpi-ganancia');
  const kpiTicket = document.getElementById('empresa-kpi-ticket');

  const desdeInput = document.getElementById('empresa-desde');
  const hastaInput = document.getElementById('empresa-hasta');
  const actualizarBtn = document.getElementById('empresa-actualizar');
  const mensajeEl = document.getElementById('empresa-mensaje');
  const tablaBody = document.getElementById('empresa-sucursales-body');

  const supervisorModal = document.getElementById('empresa-supervisor-modal');
  const supervisorSubtitulo = document.getElementById('empresa-supervisor-subtitulo');
  const supervisorNombreInput = document.getElementById('empresa-supervisor-nombre');
  const supervisorUsuarioInput = document.getElementById('empresa-supervisor-usuario');
  const supervisorPasswordInput = document.getElementById('empresa-supervisor-password');
  const supervisorCancelarBtn = document.getElementById('empresa-supervisor-cancelar');
  const supervisorGuardarBtn = document.getElementById('empresa-supervisor-guardar');
  const supervisorMensaje = document.getElementById('empresa-supervisor-mensaje');
  let supervisorModalState = null;
  let sucursalesCache = [];

  const obtenerAuthHeaders = () => {
    try {
      return authApi?.getAuthHeaders?.() || {};
    } catch (error) {
      return {};
    }
  };

  const fetchConAutorizacion = async (url, options = {}) => {
    const headers = { ...obtenerAuthHeaders(), ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      authApi?.handleUnauthorized?.();
    }
    return response;
  };

  const formatCurrency = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return 'RD$0.00';
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(number);
  };

  const formatNumber = (value) => {
    const number = Number(value);
    if (Number.isNaN(number)) return '0';
    return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(number);
  };

  const setMensaje = (texto = '', tipo = 'info') => {
    if (!mensajeEl) return;
    mensajeEl.textContent = texto;
    mensajeEl.dataset.type = texto ? tipo : '';
  };

  const getLocalDateISO = (value = new Date()) => {
    const base = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(base.getTime())) return '';
    const offset = base.getTimezoneOffset();
    const local = new Date(base.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  };

  const iniciarFechas = () => {
    const hoy = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 29);
    if (desdeInput && !desdeInput.value) desdeInput.value = getLocalDateISO(inicio);
    if (hastaInput && !hastaInput.value) hastaInput.value = getLocalDateISO(hoy);
  };

  const renderResumen = (resumen = {}) => {
    if (kpiVentas) kpiVentas.textContent = formatCurrency(resumen.ventas_total || 0);
    if (kpiGastos) kpiGastos.textContent = formatCurrency(resumen.gastos_total || 0);
    if (kpiGanancia) kpiGanancia.textContent = formatCurrency(resumen.ganancia_neta || 0);
    if (kpiTicket) kpiTicket.textContent = formatCurrency(resumen.ticket_promedio || 0);
    if (kpiVentasCount) {
      const count = Number(resumen.ventas_count || 0);
      kpiVentasCount.textContent = `${formatNumber(count)} ventas`;
    }
  };

  const iniciarSesionImpersonada = (data = {}) => {
    const usuarioId = data.usuario_id ?? data.id ?? null;
    const sesion = {
      usuario: data.usuario,
      nombre: data.nombre,
      rol: data.rol || 'admin',
      id: usuarioId,
      usuarioId,
      negocioId: data.negocio_id ?? data.negocioId,
      esSuperAdmin: false,
      forcePasswordChange: data.force_password_change === true,
      impersonated: true,
      impersonated_by_role: data.impersonated_by_role ?? data.impersonatedByRole ?? 'empresa',
      impersonatedByRole: data.impersonated_by_role ?? data.impersonatedByRole ?? 'empresa',
      token: data.token,
    };

    if (sessionApi && typeof sessionApi.setUser === 'function') {
      sessionApi.setUser(sesion);
    } else {
      try {
        sessionStorage.setItem('kanmUser', JSON.stringify(sesion));
        localStorage.setItem('sesionApp', JSON.stringify(sesion));
      } catch (error) {
        console.warn('No se pudo guardar sesion impersonada:', error);
      }
    }

    window.APP_SESION = sesion;
    window.location.href = '/admin.html';
  };

  const prepararImpersonacion = async (negocioId) => {
    if (!negocioId) return;
    const current = sessionApi?.getUser?.() || window.APP_SESION;
    if (current) {
      try {
        localStorage.setItem(EMPRESA_BACKUP_KEY, JSON.stringify(current));
      } catch (error) {
        console.warn('No se pudo guardar backup de sesion empresa:', error);
      }
    }

    setMensaje('Entrando a sucursal...', 'info');
    try {
      const resp = await fetchConAutorizacion(`/api/empresa/negocios/${negocioId}/impersonar`, {
        method: 'POST',
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo entrar a la sucursal');
      }
      iniciarSesionImpersonada(data || {});
    } catch (error) {
      console.error('Error al impersonar sucursal:', error);
      setMensaje(error.message || 'No se pudo entrar a la sucursal.', 'error');
    }
  };

  const setSupervisorMensaje = (texto = '', tipo = 'info') => {
    if (!supervisorMensaje) return;
    supervisorMensaje.textContent = texto;
    supervisorMensaje.dataset.type = texto ? tipo : '';
  };

  const abrirModalSupervisor = (sucursal = {}) => {
    if (!supervisorModal) return;
    supervisorModalState = {
      negocioId: sucursal.id,
      sucursalNombre: sucursal.sucursal_nombre || sucursal.nombre || sucursal.slug || '',
    };
    if (supervisorSubtitulo) {
      const etiqueta = supervisorModalState.sucursalNombre || 'Sucursal sin nombre';
      supervisorSubtitulo.textContent = `Sucursal: ${etiqueta}`;
    }
    if (supervisorNombreInput) supervisorNombreInput.value = '';
    if (supervisorUsuarioInput) supervisorUsuarioInput.value = '';
    if (supervisorPasswordInput) supervisorPasswordInput.value = '';
    setSupervisorMensaje('');
    supervisorModal.hidden = false;
    requestAnimationFrame(() => {
      supervisorModal.classList.add('is-visible');
    });
  };

  const cerrarModalSupervisor = () => {
    if (!supervisorModal) return;
    supervisorModal.classList.remove('is-visible');
    supervisorModal.hidden = true;
    supervisorModalState = null;
    setSupervisorMensaje('');
  };

  const guardarSupervisor = async () => {
    if (!supervisorModalState?.negocioId) return;
    const nombre = supervisorNombreInput?.value?.trim() || '';
    const usuario = supervisorUsuarioInput?.value?.trim() || '';
    const password = supervisorPasswordInput?.value?.trim() || '';

    if (!nombre || !usuario || !password) {
      setSupervisorMensaje('Completa nombre, usuario y contraseña.', 'warning');
      return;
    }

    try {
      setSupervisorMensaje('Creando supervisor...', 'info');
      const resp = await fetchConAutorizacion(`/api/empresa/negocios/${supervisorModalState.negocioId}/supervisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, usuario, password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo crear el supervisor');
      }
      cerrarModalSupervisor();
      setMensaje('Supervisor creado correctamente.', 'info');
      await cargarAnalisisEmpresa();
    } catch (error) {
      console.error('Error al crear supervisor:', error);
      setSupervisorMensaje(error.message || 'No se pudo crear el supervisor.', 'error');
    }
  };

  const renderSucursales = (lista = []) => {
    if (!tablaBody) return;
    sucursalesCache = Array.isArray(lista) ? [...lista] : [];
    if (!lista.length) {
      tablaBody.innerHTML = '<tr><td colspan="6">No hay sucursales registradas.</td></tr>';
      return;
    }
    tablaBody.innerHTML = lista
      .map((row) => {
        const ventas = formatCurrency(row.ventas_total || 0);
        const gastos = formatCurrency(row.gastos_total || 0);
        const ganancia = formatCurrency(row.ganancia_neta || 0);
        const ticket = formatCurrency(row.ticket_promedio || 0);
        const nombreSucursal = row.sucursal_nombre || row.nombre || row.slug || 'Sucursal';
        const supervisorNombre = row.supervisor_nombre || '';
        const supervisorUsuario = row.supervisor_usuario || '';
        const tieneSupervisor = Boolean(row.supervisor_id || supervisorNombre || supervisorUsuario);
        const supervisorLabel = tieneSupervisor
          ? `${supervisorNombre || supervisorUsuario}${supervisorNombre && supervisorUsuario ? ` (${supervisorUsuario})` : ''}`
          : 'Sin supervisor';
        const sucursalLabel = nombreSucursal ? `Sucursal: ${nombreSucursal}` : '';
        const acciones = tieneSupervisor
          ? `<button type="button" class="kanm-button ghost" data-empresa-action="entrar" data-negocio-id="${row.id}">Entrar</button>`
          : `<button type="button" class="kanm-button primary" data-empresa-action="crear-supervisor" data-negocio-id="${row.id}">Crear supervisor</button>`;
        return `
          <tr>
            <td>
              <div class="empresa-sucursal-nombre${tieneSupervisor ? '' : ' is-empty'}">${supervisorLabel}</div>
              ${sucursalLabel ? `<div class="empresa-sucursal-supervisor">${sucursalLabel}</div>` : ''}
            </td>
            <td>${ventas}</td>
            <td>${gastos}</td>
            <td>${ganancia}</td>
            <td>${ticket}</td>
            <td><div class="acciones-inline">${acciones}</div></td>
          </tr>
        `;
      })
      .join('');
  };

  const cargarAnalisisEmpresa = async () => {
    const desde = desdeInput?.value || '';
    const hasta = hastaInput?.value || '';
    if (!desde || !hasta) return;
    try {
      setMensaje('Actualizando analisis...', 'info');
      const resp = await fetchConAutorizacion(
        `/api/empresa/analytics/overview?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar el analisis');
      }
      renderResumen(data.resumen || {});
      renderSucursales(data.sucursales || []);
      setMensaje('', 'info');
    } catch (error) {
      console.error('Error al cargar analisis empresa:', error);
      setMensaje(error.message || 'No se pudo cargar el analisis.', 'error');
    }
  };

  tablaBody?.addEventListener('click', (event) => {
    const btnEntrar = event.target.closest('[data-empresa-action="entrar"]');
    const btnCrear = event.target.closest('[data-empresa-action="crear-supervisor"]');
    if (!btnEntrar && !btnCrear) return;

    const btn = btnEntrar || btnCrear;
    const id = Number(btn.dataset.negocioId);
    if (!Number.isFinite(id)) return;

    if (btnCrear) {
      const sucursal = (sucursalesCache || []).find((item) => Number(item.id) === id) || { id };
      abrirModalSupervisor(sucursal);
      return;
    }

    prepararImpersonacion(id);
  });

  actualizarBtn?.addEventListener('click', () => {
    cargarAnalisisEmpresa();
  });

  supervisorCancelarBtn?.addEventListener('click', () => {
    cerrarModalSupervisor();
  });

  supervisorGuardarBtn?.addEventListener('click', () => {
    guardarSupervisor();
  });

  iniciarFechas();
  cargarAnalisisEmpresa();
})();
