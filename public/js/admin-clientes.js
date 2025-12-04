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

  let clientes = [];
  let clienteActual = null;

  const setMessage = (element, text, type = 'info') => {
    if (!element) return;
    element.textContent = text || '';
    element.dataset.type = text ? type : '';
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
  };

  const renderClientes = () => {
    if (!tablaBody) return;
    tablaBody.innerHTML = '';

    if (!clientes.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 6;
      celda.className = 'tabla-vacia';
      celda.textContent = 'No hay clientes registrados.';
      fila.appendChild(celda);
      tablaBody.appendChild(fila);
      return;
    }

    clientes.forEach((cli) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${cli.nombre || ''}</td>
        <td>${cli.documento || ''}</td>
        <td>${cli.telefono || ''}</td>
        <td>${cli.email || ''}</td>
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

  tablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-editar-cliente]');
    if (!btn) return;
    const id = Number(btn.dataset.editarCliente);
    const cli = clientes.find((c) => c.id === id);
    if (cli) {
      cargarEnFormulario(cli);
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

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarCliente();
  });

  cargarClientes();
})();
