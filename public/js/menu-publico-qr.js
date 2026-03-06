const dom = {
  subtitle: document.getElementById('menu-qr-subtitle'),
  feedback: document.getElementById('menu-qr-feedback'),
  grid: document.getElementById('menu-qr-grid'),
  reload: document.getElementById('menu-qr-recargar'),
  print: document.getElementById('menu-qr-imprimir'),
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getAuthHeaders = () => {
  if (window.kanmAuth?.getAuthHeaders) {
    return window.kanmAuth.getAuthHeaders();
  }
  try {
    const raw =
      window.sessionStorage?.getItem?.('kanmUser') ||
      window.localStorage?.getItem?.('kanmUser') ||
      window.localStorage?.getItem?.('sesionApp');
    const parsed = raw ? JSON.parse(raw) : null;
    const token = parsed?.token || null;
    return token
      ? {
          'x-session-token': token,
          Authorization: `Bearer ${token}`,
        }
      : {};
  } catch (error) {
    return {};
  }
};

const setMessage = (text = '', type = 'info') => {
  if (!dom.feedback) return;
  dom.feedback.textContent = text;
  dom.feedback.dataset.type = text ? type : '';
  dom.feedback.hidden = !text;
};

const renderEmpty = (text) => {
  if (!dom.grid) return;
  dom.grid.innerHTML = `<div class="menu-qr-empty">${escapeHtml(text)}</div>`;
};

const renderCards = (accesos = [], negocio = null) => {
  if (!dom.grid) return;
  if (!accesos.length) {
    renderEmpty('No hay accesos del menu publico para imprimir.');
    return;
  }

  dom.grid.innerHTML = accesos
    .map((acceso) => {
      const qrUrl = `/api/public/menu/${encodeURIComponent(acceso.token)}/qr.svg`;
      const menuUrl = acceso.url || `/menu/${encodeURIComponent(acceso.token)}`;
      return `
        <article class="menu-qr-card">
          <div class="menu-qr-code">
            <img src="${escapeHtml(qrUrl)}" alt="QR de ${escapeHtml(acceso.nombre || acceso.mesa || 'menu')}" />
            <span>Escanear para abrir menu</span>
          </div>
          <div class="menu-qr-meta">
            <h2>${escapeHtml(acceso.nombre || acceso.mesa || 'Menu publico')}</h2>
            <span class="menu-qr-tag">${escapeHtml(negocio || 'Negocio')}</span>
            <ul class="menu-qr-list">
              <li>
                <span class="menu-qr-label">Mesa</span>
                <span class="menu-qr-value">${escapeHtml(acceso.mesa || 'Para llevar')}</span>
              </li>
              <li>
                <span class="menu-qr-label">URL</span>
                <span class="menu-qr-value">${escapeHtml(menuUrl)}</span>
              </li>
              <li>
                <span class="menu-qr-label">Token</span>
                <span class="menu-qr-value">${escapeHtml(acceso.token)}</span>
              </li>
            </ul>
          </div>
        </article>
      `;
    })
    .join('');
};

const loadSheet = async () => {
  setMessage('Cargando accesos del menu publico...', 'info');
  try {
    const [themeResponse, accessResponse] = await Promise.all([
      fetch('/api/negocios/mi-tema', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      }),
      fetch('/api/menu-publico/accesos', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      }),
    ]);

    if ((themeResponse.status === 401 || themeResponse.status === 403) && window.kanmAuth?.handleUnauthorized) {
      window.kanmAuth.handleUnauthorized();
      return;
    }
    if ((accessResponse.status === 401 || accessResponse.status === 403) && window.kanmAuth?.handleUnauthorized) {
      window.kanmAuth.handleUnauthorized();
      return;
    }

    const themeData = await themeResponse.json().catch(() => ({}));
    const accessData = await accessResponse.json().catch(() => ({}));

    if (!accessResponse.ok || !accessData?.ok) {
      throw new Error(accessData?.error || 'No se pudieron cargar los accesos.');
    }

    const negocioNombre = themeData?.tema?.titulo || themeData?.tema?.nombre || 'Negocio';
    if (dom.subtitle) {
      dom.subtitle.textContent = `${negocioNombre} · ${accessData.accesos.length} accesos listos para imprimir.`;
    }
    renderCards(accessData.accesos || [], negocioNombre);
    setMessage('');
  } catch (error) {
    renderEmpty(error.message || 'No se pudo construir la hoja imprimible.');
    setMessage(error.message || 'No se pudo construir la hoja imprimible.', 'error');
  }
};

dom.reload?.addEventListener('click', () => {
  loadSheet();
});

dom.print?.addEventListener('click', () => {
  window.print();
});

loadSheet();
