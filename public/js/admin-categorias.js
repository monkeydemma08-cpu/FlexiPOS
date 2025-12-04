(() => {
  const seccion = document.getElementById('admin-section-categorias');
  if (!seccion) return;

  const tablaBody = document.getElementById('categorias-tabla');
  const mensajeLista = document.getElementById('categorias-lista-mensaje');
  const inputBuscar = document.getElementById('categorias-buscar');
  const btnBuscar = document.getElementById('categorias-filtrar');

  const form = document.getElementById('categoria-form');
  const inputId = document.getElementById('categoria-id');
  const inputNombre = document.getElementById('categoria-nombre');
  const selectArea = document.getElementById('categoria-area');
  const inputActivo = document.getElementById('categoria-activo');
  const btnNuevo = document.getElementById('categoria-nuevo');
  const mensajeForm = document.getElementById('categoria-mensaje');

  let categorias = [];
  let categoriaActual = null;

  const setMessage = (element, text, type = 'info') => {
    if (!element) return;
    element.textContent = text || '';
    element.dataset.type = text ? type : '';
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

  const renderCategorias = () => {
    if (!tablaBody) return;
    tablaBody.innerHTML = '';

    const labelArea = (area = 'ninguna') => {
      if (area === 'cocina') return 'Cocina';
      if (area === 'bar') return 'Bar';
      return 'Ninguna';
    };

    if (!categorias.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 4;
      celda.className = 'tabla-vacia';
      celda.textContent = 'No hay categorías registradas.';
      fila.appendChild(celda);
      tablaBody.appendChild(fila);
      return;
    }

    categorias.forEach((cat) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${cat.nombre || ''}</td>
        <td>${labelArea(cat.area_preparacion || cat.area)}</td>
        <td>${cat.activo ? 'Activa' : 'Inactiva'}</td>
        <td><button type="button" class="kanm-button ghost" data-editar-categoria="${cat.id}">Editar</button></td>
      `;
      tablaBody.appendChild(fila);
    });
  };

  const actualizarSelectCategoriasGlobal = () => {
    if (typeof window.KANMActualizarCategorias === 'function') {
      window.KANMActualizarCategorias(categorias);
    }
  };

  const cargarCategorias = async () => {
    setMessage(mensajeLista, 'Cargando categorías...', 'info');
    try {
      const term = inputBuscar?.value?.trim() || '';
      const resp = await fetchAutorizado(`/api/categorias?search=${encodeURIComponent(term)}`);
      const data = await resp.json();
      if (!resp.ok || data?.error) throw new Error(data?.error || 'No se pudo cargar categorías');
      categorias = data?.categorias || [];
      renderCategorias();
      actualizarSelectCategoriasGlobal();
      setMessage(mensajeLista, '');
    } catch (error) {
      console.error('Error al cargar categorías:', error);
      setMessage(mensajeLista, 'No fue posible obtener las categorías.', 'error');
    }
  };

  const limpiarFormulario = () => {
    categoriaActual = null;
    inputId.value = '';
    inputNombre.value = '';
    if (selectArea) selectArea.value = 'ninguna';
    inputActivo.checked = true;
    setMessage(mensajeForm, '');
  };

  const cargarEnFormulario = (cat) => {
    if (!cat) return;
    categoriaActual = cat;
    inputId.value = cat.id || '';
    inputNombre.value = cat.nombre || '';
    if (selectArea) selectArea.value = cat.area_preparacion || cat.area || 'ninguna';
    inputActivo.checked = cat.activo !== 0;
    setMessage(mensajeForm, '');
  };

  const guardarCategoria = async () => {
    const nombre = inputNombre.value.trim();
    const activo = inputActivo.checked;
    const area_preparacion = selectArea?.value || 'ninguna';
    if (!nombre) {
      setMessage(mensajeForm, 'El nombre es obligatorio.', 'error');
      return;
    }

    setMessage(mensajeForm, 'Guardando categoría...', 'info');
    const esEdicion = Boolean(categoriaActual?.id);
    const url = esEdicion ? `/api/categorias/${categoriaActual.id}` : '/api/categorias';
    const method = esEdicion ? 'PUT' : 'POST';

    try {
      const resp = await fetchJsonAutorizado(url, {
        method,
        body: JSON.stringify({ nombre, activo, area_preparacion }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error || data?.ok === false) {
        throw new Error(data.error || 'No se pudo guardar la categoría');
      }
      const categoriaGuardada = data.categoria || { id: categoriaActual?.id, nombre, activo: activo ? 1 : 0, area_preparacion };
      setMessage(mensajeForm, 'Categoría guardada correctamente.', 'info');
      if (esEdicion) {
        categoriaActual = categoriaGuardada;
      } else {
        categoriaActual = null;
        limpiarFormulario();
      }
      await cargarCategorias();
      if (esEdicion) {
        const encontrada = categorias.find((c) => c.id === categoriaGuardada.id);
        if (encontrada) cargarEnFormulario(encontrada);
      }
    } catch (error) {
      console.error('Error al guardar categoría:', error);
      setMessage(mensajeForm, error.message || 'No se pudo guardar la categoría.', 'error');
    }
  };

  tablaBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-editar-categoria]');
    if (!btn) return;
    const id = Number(btn.dataset.editarCategoria);
    const cat = categorias.find((c) => c.id === id);
    if (cat) cargarEnFormulario(cat);
  });

  btnBuscar?.addEventListener('click', (e) => {
    e.preventDefault();
    cargarCategorias();
  });

  inputBuscar?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cargarCategorias();
    }
  });

  btnNuevo?.addEventListener('click', (e) => {
    e.preventDefault();
    limpiarFormulario();
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarCategoria();
  });

  cargarCategorias();
})();
