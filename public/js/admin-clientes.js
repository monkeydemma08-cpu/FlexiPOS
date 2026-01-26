(() => {
  const seccion = document.getElementById('admin-section-clientes');
  if (!seccion) return;

  const tablaBody = document.getElementById('clientes-tabla');
  const mensajeLista = document.getElementById('clientes-lista-mensaje');
  const inputBuscar = document.getElementById('clientes-buscar');
  const btnBuscar = document.getElementById('clientes-filtrar');

  const form = document.getElementById('cliente-form');
  const inputId = document.getElementById('cliente-id');
  const inputNombre = document.getElementById('cliente-nombre');
  const inputDocumento = document.getElementById('cliente-documento');
  const selectTipoDocumento = document.getElementById('cliente-tipo-documento');
  const inputTelefono = document.getElementById('cliente-telefono');
  const inputEmail = document.getElementById('cliente-email');
  const inputDireccion = document.getElementById('cliente-direccion');
  const inputNotas = document.getElementById('cliente-notas');
  const inputActivo = document.getElementById('cliente-activo');
  const btnNuevo = document.getElementById('cliente-nuevo');
  const mensajeForm = document.getElementById('cliente-mensaje');

  const resumenDeudasTotal = document.getElementById('clientes-deudas-total');
  const resumenDeudasPagado = document.getElementById('clientes-deudas-pagado');
  const resumenDeudasSaldo = document.getElementById('clientes-deudas-saldo');
  const mensajeDeudas = document.getElementById('cliente-deudas-mensaje');
  const tablaDeudas = document.getElementById('cliente-deudas-tabla');
  const deudaForm = document.getElementById('cliente-deuda-form');
  const inputDeudaId = document.getElementById('deuda-id');
  const inputDeudaDescripcion = document.getElementById('deuda-descripcion');
  const inputDeudaFecha = document.getElementById('deuda-fecha');
  const inputDeudaMonto = document.getElementById('deuda-monto');
  const inputDeudaNotas = document.getElementById('deuda-notas');
  const btnDeudaNueva = document.getElementById('deuda-nueva');
  const mensajeDeuda = document.getElementById('deuda-mensaje');

  const abonoForm = document.getElementById('deuda-abono-form');
  const inputAbonoFecha = document.getElementById('abono-fecha');
  const inputAbonoMonto = document.getElementById('abono-monto');
  const selectAbonoMetodo = document.getElementById('abono-metodo');
  const inputAbonoNotas = document.getElementById('abono-notas');
  const mensajeAbono = document.getElementById('deuda-abono-mensaje');
  const tablaAbonos = document.getElementById('deuda-abonos-tabla');
  const deudaSeleccionadaLabel = document.getElementById('deuda-seleccionada');

  let clientes = [];
  let clienteActual = null;
  let deudas = [];
  let deudaActual = null;
  let abonos = [];

  const setMessage = (element, text, type = 'info') => {
    if (!element) return;
    element.textContent = text || '';
    element.dataset.type = text ? type : '';
  };

  const formatCurrency = (valor) => {
    const numero = Number(valor) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(numero);
  };

  const parseMoneyValue = (input, { fallback = 0, allowEmpty = true } = {}) => {
    const raw =
      input && typeof input === 'object' && 'value' in input ? input.value : input ?? '';
    const texto = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!texto) return allowEmpty ? fallback : NaN;
    const parsed = window.KANMMoney?.parse
      ? window.KANMMoney.parse(texto)
      : Number(texto.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const setMoneyInputValue = (input, value) => {
    if (!input) return;
    if (window.KANMMoney?.setValue && input.matches?.('input[data-money]')) {
      window.KANMMoney.setValue(input, value);
      return;
    }
    input.value = value ?? '';
  };

  const getLocalDateISO = (date = new Date()) => {
    const tzOffset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - tzOffset * 60000);
    return local.toISOString().slice(0, 10);
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return value;
    return fecha.toLocaleDateString('es-DO');
  };

  const obtenerTotalesDeuda = (deuda) => {
    const total = Number(deuda?.monto_total ?? deuda?.monto ?? 0) || 0;
    const pagado = Number(deuda?.pagado ?? deuda?.total_abonos ?? 0) || 0;
    const saldo = Math.max(total - pagado, 0);
    return { total, pagado, saldo };
  };

  const obtenerEstadoDeuda = (deuda) => {
    const { pagado, saldo } = obtenerTotalesDeuda(deuda);
    if (saldo <= 0) return 'saldada';
    if (pagado > 0) return 'parcial';
    return 'pendiente';
  };

  const obtenerResumenDeudas = (lista = []) =>
    lista.reduce(
      (acc, deuda) => {
        const { total, pagado } = obtenerTotalesDeuda(deuda);
        acc.total += total;
        acc.pagado += pagado;
        return acc;
      },
      { total: 0, pagado: 0 }
    );

  const normalizarResumenDeudas = (resumen) => {
    if (!resumen || typeof resumen !== 'object') return null;
    return {
      total: Number(resumen.total_deuda ?? resumen.total ?? 0) || 0,
      pagado: Number(resumen.total_abonos ?? resumen.pagado ?? 0) || 0,
      saldo: Number(resumen.saldo_pendiente ?? resumen.saldo ?? 0) || 0,
    };
  };

  const renderResumenDeudas = (resumen = null) => {
    let datos = normalizarResumenDeudas(resumen);
    if (!datos) {
      const acumulado = obtenerResumenDeudas(deudas);
      datos = {
        total: acumulado.total,
        pagado: acumulado.pagado,
        saldo: Math.max(acumulado.total - acumulado.pagado, 0),
      };
    }

    if (resumenDeudasTotal) resumenDeudasTotal.textContent = formatCurrency(datos.total);
    if (resumenDeudasPagado) resumenDeudasPagado.textContent = formatCurrency(datos.pagado);
    if (resumenDeudasSaldo) {
      resumenDeudasSaldo.textContent = formatCurrency(datos.saldo);
      resumenDeudasSaldo.classList.toggle('deuda-saldo', datos.saldo > 0);
    }
  };

  const setFormEnabled = (formElement, enabled) => {
    if (!formElement) return;
    const controles = Array.from(formElement.elements || []);
    controles.forEach((control) => {
      if (!control) return;
      control.disabled = !enabled;
    });
  };

  const limpiarDeudaForm = (mantenerFecha = false) => {
    if (inputDeudaId) inputDeudaId.value = '';
    if (inputDeudaDescripcion) inputDeudaDescripcion.value = '';
    if (inputDeudaNotas) inputDeudaNotas.value = '';
    if (inputDeudaFecha && !mantenerFecha) inputDeudaFecha.value = getLocalDateISO();
    if (inputDeudaMonto) setMoneyInputValue(inputDeudaMonto, '');
    setMessage(mensajeDeuda, '');
  };

  const limpiarAbonoForm = (mantenerFecha = false) => {
    if (inputAbonoNotas) inputAbonoNotas.value = '';
    if (selectAbonoMetodo) selectAbonoMetodo.value = '';
    if (inputAbonoFecha && !mantenerFecha) inputAbonoFecha.value = getLocalDateISO();
    if (inputAbonoMonto) setMoneyInputValue(inputAbonoMonto, '');
    setMessage(mensajeAbono, '');
  };

  const resetDeudasUI = (mensaje) => {
    deudas = [];
    deudaActual = null;
    abonos = [];
    renderDeudas();
    renderAbonos();
    renderResumenDeudas();
    if (deudaSeleccionadaLabel) {
      deudaSeleccionadaLabel.textContent =
        'Selecciona una deuda para registrar abonos.';
    }
    setMessage(mensajeDeudas, mensaje || 'Selecciona un cliente para ver sus cuentas por cobrar.', 'info');
    limpiarDeudaForm();
    limpiarAbonoForm();
    setFormEnabled(deudaForm, false);
    setFormEnabled(abonoForm, false);
  };

  const renderClientes = () => {
    if (!tablaBody) return;
    tablaBody.innerHTML = '';

    if (!clientes.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.className = 'tabla-vacia';
      celda.textContent = 'No hay clientes registrados.';
      fila.appendChild(celda);
      tablaBody.appendChild(fila);
      return;
    }

    clientes.forEach((cli) => {
      const fila = document.createElement('tr');
      const saldo = Number(cli.saldo_pendiente ?? 0) || 0;
      fila.innerHTML = `
        <td>${cli.nombre || ''}</td>
        <td>${cli.documento || ''}</td>
        <td>${cli.telefono || ''}</td>
        <td>${cli.email || ''}</td>
        <td>${formatCurrency(saldo)}</td>
        <td>${cli.activo ? 'Activo' : 'Inactivo'}</td>
        <td><button type="button" class="kanm-button ghost" data-editar-cliente="${cli.id}">Editar</button></td>
      `;
      tablaBody.appendChild(fila);
    });
  };

  const getAuthHeaders = () => {
    try {
      return window.kanmAuth?.getAuthHeaders?.() || {};
    } catch (error) {
      console.warn('No se pudieron obtener encabezados de autenticación:', error);
      return {};
    }
  };

  const fetchAutorizado = (url, opts = {}) =>
    fetch(url, { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } });

  const fetchJsonAutorizado = (url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(opts.headers || {}),
      },
    });

  const cargarClientes = async () => {
    setMessage(mensajeLista, 'Cargando clientes...', 'info');
    try {
      const term = inputBuscar?.value?.trim() || '';
      const resp = await fetchAutorizado(`/api/clientes?search=${encodeURIComponent(term)}`);
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudo cargar clientes');
      clientes = data?.clientes || [];
      renderClientes();
      setMessage(mensajeLista, '');
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setMessage(mensajeLista, 'No fue posible obtener los clientes.', 'error');
    }
  };

  const renderDeudas = () => {
    if (!tablaDeudas) return;
    tablaDeudas.innerHTML = '';

    if (!deudas.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.className = 'tabla-vacia';
      celda.textContent = 'No hay deudas registradas.';
      fila.appendChild(celda);
      tablaDeudas.appendChild(fila);
      return;
    }

    const estadoTexto = {
      pendiente: 'Pendiente',
      parcial: 'Parcial',
      saldada: 'Saldada',
    };

    const estadoClase = {
      pendiente: 'estado-pendiente',
      parcial: 'estado-parcial',
      saldada: 'estado-pagado',
    };

    deudas.forEach((deuda) => {
      const { total, pagado, saldo } = obtenerTotalesDeuda(deuda);
      const estado = deuda.estado || obtenerEstadoDeuda(deuda);
      const fila = document.createElement('tr');
      if (deudaActual?.id === deuda.id) {
        fila.classList.add('deuda-row--selected');
      }
      fila.innerHTML = `
        <td>${formatDate(deuda.fecha)}</td>
        <td>${deuda.descripcion || deuda.concepto || '--'}</td>
        <td>${formatCurrency(total)}</td>
        <td>${formatCurrency(pagado)}</td>
        <td>${formatCurrency(saldo)}</td>
        <td><span class="kanm-badge ${estadoClase[estado] || 'estado-pendiente'}">${
          estadoTexto[estado] || 'Pendiente'
        }</span></td>
        <td>
          <button type="button" class="kanm-button ghost" data-deuda-abonos="${deuda.id}">Abonos</button>
          <button type="button" class="kanm-button ghost" data-deuda-editar="${deuda.id}">Editar</button>
        </td>
      `;
      tablaDeudas.appendChild(fila);
    });
  };

  const renderAbonos = () => {
    if (!tablaAbonos) return;
    tablaAbonos.innerHTML = '';

    if (!abonos.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 4;
      celda.className = 'tabla-vacia';
      celda.textContent = deudaActual ? 'Sin abonos registrados.' : 'Selecciona una deuda para ver abonos.';
      fila.appendChild(celda);
      tablaAbonos.appendChild(fila);
      return;
    }

    abonos.forEach((abono) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${formatDate(abono.fecha)}</td>
        <td>${formatCurrency(abono.monto)}</td>
        <td>${abono.metodo_pago || abono.metodo || '--'}</td>
        <td>${abono.notas || '--'}</td>
      `;
      tablaAbonos.appendChild(fila);
    });
  };

  const actualizarPanelAbonos = () => {
    if (deudaSeleccionadaLabel) {
      if (deudaActual) {
        const { saldo } = obtenerTotalesDeuda(deudaActual);
        const detalle = deudaActual.descripcion || `Deuda #${deudaActual.id}`;
        deudaSeleccionadaLabel.textContent = `${detalle} · Saldo ${formatCurrency(saldo)}`;
      } else {
        deudaSeleccionadaLabel.textContent = 'Selecciona una deuda para registrar abonos.';
      }
    }
    setFormEnabled(abonoForm, Boolean(deudaActual?.id));
  };

  const cargarDeudas = async ({ mantenerSeleccion = false, seleccionarId = null, mantenerEdicionId = null } = {}) => {
    if (!clienteActual?.id) {
      resetDeudasUI();
      return;
    }

    setMessage(mensajeDeudas, 'Cargando deudas...', 'info');
    try {
      const resp = await fetchAutorizado(`/api/clientes/${clienteActual.id}/deudas`);
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudieron cargar las deudas');
      deudas = Array.isArray(data.deudas) ? data.deudas : [];
      renderResumenDeudas(data.resumen);
      const objetivo = seleccionarId ?? (mantenerSeleccion ? deudaActual?.id : null);
      deudaActual = objetivo ? deudas.find((d) => d.id === objetivo) || null : null;
      renderDeudas();
      actualizarPanelAbonos();
      if (deudaActual) {
        await cargarAbonos();
      } else {
        abonos = [];
        renderAbonos();
        setMessage(mensajeAbono, '');
      }
      if (mantenerEdicionId) {
        const deudaEditar = deudas.find((d) => d.id === mantenerEdicionId);
        if (deudaEditar) {
          cargarDeudaEnFormulario(deudaEditar);
        }
      }
      setMessage(mensajeDeudas, '');
      setFormEnabled(deudaForm, true);
    } catch (error) {
      console.error('Error al cargar deudas:', error);
      setMessage(mensajeDeudas, 'No fue posible obtener las deudas.', 'error');
    }
  };

  const cargarAbonos = async () => {
    if (!clienteActual?.id || !deudaActual?.id) {
      abonos = [];
      renderAbonos();
      return;
    }

    setMessage(mensajeAbono, 'Cargando abonos...', 'info');
    try {
      const resp = await fetchAutorizado(
        `/api/clientes/${clienteActual.id}/deudas/${deudaActual.id}/abonos`
      );
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudieron cargar los abonos');
      abonos = Array.isArray(data.abonos) ? data.abonos : [];
      renderAbonos();
      setMessage(mensajeAbono, '');
    } catch (error) {
      console.error('Error al cargar abonos:', error);
      setMessage(mensajeAbono, 'No fue posible obtener los abonos.', 'error');
    }
  };

  const cargarEnFormulario = (cli) => {
    if (!cli) return;
    clienteActual = cli;
    inputId.value = cli.id || '';
    inputNombre.value = cli.nombre || '';
    inputDocumento.value = cli.documento || '';
    selectTipoDocumento.value = cli.tipo_documento || '';
    inputTelefono.value = cli.telefono || '';
    inputEmail.value = cli.email || '';
    inputDireccion.value = cli.direccion || '';
    inputNotas.value = cli.notas || '';
    inputActivo.checked = cli.activo !== 0;
    setMessage(mensajeForm, '');
    setFormEnabled(deudaForm, true);
    limpiarDeudaForm();
    limpiarAbonoForm();
    cargarDeudas();
  };

  const obtenerPayload = () => ({
    nombre: inputNombre.value.trim(),
    documento: inputDocumento.value.trim() || null,
    tipo_documento: selectTipoDocumento.value || null,
    telefono: inputTelefono.value.trim() || null,
    email: inputEmail.value.trim() || null,
    direccion: inputDireccion.value.trim() || null,
    notas: inputNotas.value.trim() || null,
    activo: inputActivo.checked ? 1 : 0,
  });

  const guardarCliente = async () => {
    const payload = obtenerPayload();
    if (!payload.nombre) {
      setMessage(mensajeForm, 'El nombre es obligatorio.', 'error');
      return;
    }

    setMessage(mensajeForm, 'Guardando cliente...', 'info');
    const esEdicion = Boolean(clienteActual?.id);
    const url = esEdicion ? `/api/clientes/${clienteActual.id}` : '/api/clientes';
    const method = esEdicion ? 'PUT' : 'POST';

    try {
      const resp = await fetchJsonAutorizado(url, { method, body: JSON.stringify(payload) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo guardar el cliente');
      }
      const clienteGuardado = data.cliente || { ...payload, id: clienteActual?.id };
      setMessage(mensajeForm, 'Cliente guardado correctamente.', 'info');
      clienteActual = clienteGuardado;
      await cargarClientes();
      if (clienteGuardado.id) {
        const encontrado = clientes.find((c) => c.id === clienteGuardado.id);
        cargarEnFormulario(encontrado || clienteGuardado);
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error);
      setMessage(mensajeForm, error.message || 'No se pudo guardar el cliente.', 'error');
    }
  };

  const cargarDeudaEnFormulario = (deuda, mantenerFecha = false) => {
    if (!deuda) return;
    if (inputDeudaId) inputDeudaId.value = deuda.id || '';
    if (inputDeudaDescripcion) inputDeudaDescripcion.value = deuda.descripcion || deuda.concepto || '';
    if (inputDeudaNotas) inputDeudaNotas.value = deuda.notas || '';
    if (inputDeudaFecha && !mantenerFecha) {
      inputDeudaFecha.value = deuda.fecha || getLocalDateISO();
    }
    if (inputDeudaMonto) {
      setMoneyInputValue(inputDeudaMonto, deuda.monto_total ?? deuda.monto ?? 0);
    }
    setMessage(mensajeDeuda, '');
  };

  const guardarDeuda = async () => {
    if (!clienteActual?.id) {
      setMessage(mensajeDeuda, 'Selecciona un cliente primero.', 'error');
      return;
    }

    const monto = parseMoneyValue(inputDeudaMonto, { allowEmpty: false });
    if (!Number.isFinite(monto) || monto <= 0) {
      setMessage(mensajeDeuda, 'Ingresa un monto válido.', 'error');
      return;
    }

    const payload = {
      descripcion: inputDeudaDescripcion?.value?.trim() || null,
      fecha: inputDeudaFecha?.value || null,
      monto,
      notas: inputDeudaNotas?.value?.trim() || null,
    };

    const deudaId = inputDeudaId?.value ? Number(inputDeudaId.value) : null;
    const esEdicion = Boolean(deudaId);
    const url = esEdicion
      ? `/api/clientes/${clienteActual.id}/deudas/${deudaId}`
      : `/api/clientes/${clienteActual.id}/deudas`;
    const method = esEdicion ? 'PUT' : 'POST';

    setMessage(mensajeDeuda, 'Guardando deuda...', 'info');

    try {
      const resp = await fetchJsonAutorizado(url, { method, body: JSON.stringify(payload) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo guardar la deuda');
      }

      const nuevaId = data?.deuda?.id || deudaId;
      await cargarDeudas({
        mantenerSeleccion: true,
        seleccionarId: nuevaId || null,
        mantenerEdicionId: esEdicion ? nuevaId : null,
      });
      await cargarClientes();

      if (!esEdicion) {
        limpiarDeudaForm();
      }

      setMessage(mensajeDeuda, 'Deuda guardada correctamente.', 'info');
    } catch (error) {
      console.error('Error al guardar deuda:', error);
      setMessage(mensajeDeuda, error.message || 'No se pudo guardar la deuda.', 'error');
    }
  };

  const guardarAbono = async () => {
    if (!clienteActual?.id || !deudaActual?.id) {
      setMessage(mensajeAbono, 'Selecciona una deuda primero.', 'error');
      return;
    }

    const monto = parseMoneyValue(inputAbonoMonto, { allowEmpty: false });
    if (!Number.isFinite(monto) || monto <= 0) {
      setMessage(mensajeAbono, 'Ingresa un monto válido.', 'error');
      return;
    }

    const payload = {
      fecha: inputAbonoFecha?.value || null,
      monto,
      metodo_pago: selectAbonoMetodo?.value || null,
      notas: inputAbonoNotas?.value?.trim() || null,
    };

    setMessage(mensajeAbono, 'Registrando abono...', 'info');

    try {
      const resp = await fetchJsonAutorizado(
        `/api/clientes/${clienteActual.id}/deudas/${deudaActual.id}/abonos`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo registrar el abono');
      }

      const deudaId = deudaActual.id;
      await cargarDeudas({ mantenerSeleccion: true, seleccionarId: deudaId });
      await cargarClientes();
      limpiarAbonoForm();
      setMessage(mensajeAbono, 'Abono registrado correctamente.', 'info');
    } catch (error) {
      console.error('Error al registrar abono:', error);
      setMessage(mensajeAbono, error.message || 'No se pudo registrar el abono.', 'error');
    }
  };

  const limpiarFormulario = () => {
    clienteActual = null;
    inputId.value = '';
    inputNombre.value = '';
    inputDocumento.value = '';
    selectTipoDocumento.value = '';
    inputTelefono.value = '';
    inputEmail.value = '';
    inputDireccion.value = '';
    inputNotas.value = '';
    inputActivo.checked = true;
    setMessage(mensajeForm, '');
    resetDeudasUI();
  };

  tablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-editar-cliente]');
    if (!btn) return;
    const id = Number(btn.dataset.editarCliente);
    const cli = clientes.find((c) => c.id === id);
    if (cli) {
      cargarEnFormulario(cli);
    }
  });

  tablaDeudas?.addEventListener('click', (event) => {
    const btnAbonos = event.target.closest('[data-deuda-abonos]');
    const btnEditar = event.target.closest('[data-deuda-editar]');

    if (!btnAbonos && !btnEditar) return;

    if (btnEditar) {
      const id = Number(btnEditar.dataset.deudaEditar);
      const deuda = deudas.find((d) => d.id === id);
      if (deuda) {
        cargarDeudaEnFormulario(deuda);
        deudaActual = deuda;
        renderDeudas();
        actualizarPanelAbonos();
        cargarAbonos();
      }
      return;
    }

    if (btnAbonos) {
      const id = Number(btnAbonos.dataset.deudaAbonos);
      const deuda = deudas.find((d) => d.id === id);
      if (deuda) {
        deudaActual = deuda;
        renderDeudas();
        actualizarPanelAbonos();
        cargarAbonos();
      }
    }
  });

  btnBuscar?.addEventListener('click', (e) => {
    e.preventDefault();
    cargarClientes();
  });

  inputBuscar?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cargarClientes();
    }
  });

  btnNuevo?.addEventListener('click', (e) => {
    e.preventDefault();
    limpiarFormulario();
  });

  btnDeudaNueva?.addEventListener('click', (e) => {
    e.preventDefault();
    limpiarDeudaForm();
    if (inputDeudaId) inputDeudaId.value = '';
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarCliente();
  });

  deudaForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarDeuda();
  });

  abonoForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarAbono();
  });

  resetDeudasUI();
  cargarClientes();
})();
