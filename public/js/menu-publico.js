const dom = {
  titulo: document.getElementById('menu-publico-titulo'),
  subtitulo: document.getElementById('menu-publico-subtitulo'),
  badgeAcceso: document.getElementById('menu-publico-badge-acceso'),
  badgeSync: document.getElementById('menu-publico-badge-sync'),
  logo: document.getElementById('menu-publico-logo'),
  logoFallback: document.getElementById('menu-publico-logo-fallback'),
  search: document.getElementById('menu-publico-search'),
  nav: document.getElementById('menu-publico-categorias-nav'),
  estado: document.getElementById('menu-publico-estado'),
  categorias: document.getElementById('menu-publico-categorias'),
  form: document.getElementById('menu-publico-form'),
  cliente: document.getElementById('menu-publico-cliente'),
  servicio: document.getElementById('menu-publico-servicio'),
  nota: document.getElementById('menu-publico-nota'),
  cart: document.getElementById('menu-publico-cart'),
  orderCount: document.getElementById('menu-publico-order-count'),
  subtotal: document.getElementById('menu-publico-subtotal'),
  impuesto: document.getElementById('menu-publico-impuesto'),
  total: document.getElementById('menu-publico-total'),
  submit: document.getElementById('menu-publico-submit'),
  formMessage: document.getElementById('menu-publico-form-message'),
  mobileToggle: document.getElementById('menu-publico-mobile-toggle'),
  mobileCount: document.getElementById('menu-publico-mobile-count'),
  mobileTotal: document.getElementById('menu-publico-mobile-total'),
  overlay: document.getElementById('menu-publico-overlay'),
  orderClose: document.getElementById('menu-publico-order-close'),
};

const state = {
  token: '',
  data: null,
  search: '',
  cart: [],
  pollHandle: null,
  loading: false,
  submitting: false,
  drawerOpen: false,
};

const compactViewportQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 860px)')
    : null;

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatTime = (value) =>
  new Intl.DateTimeFormat('es-DO', {
    timeStyle: 'short',
    hour12: true,
    timeZone: 'America/Santo_Domingo',
  }).format(value instanceof Date ? value : new Date(value));

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const getTokenFromLocation = () => {
  const pathMatch = window.location.pathname.match(/^\/menu\/([^/]+)$/i);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  return token ? token.trim() : '';
};

const getCatalogProducts = () =>
  (state.data?.menu?.categorias || []).flatMap((categoria) =>
    (categoria.productos || []).map((producto) => ({
      ...producto,
      categoria_nombre: producto.categoria_nombre || categoria.nombre,
    }))
  );

const findProductById = (productId) =>
  getCatalogProducts().find((producto) => Number(producto.id) === Number(productId)) || null;

const isCompactViewport = () => Boolean(compactViewportQuery?.matches);

const setDrawerOpen = (open) => {
  const nextState = Boolean(open) && isCompactViewport();
  state.drawerOpen = nextState;
  document.body.classList.toggle('menu-publico-drawer-open', nextState);
  if (dom.overlay) {
    dom.overlay.hidden = !nextState;
  }
};

const syncDrawerViewport = () => {
  if (!isCompactViewport()) {
    setDrawerOpen(false);
  }
};

const calculateTotals = () => {
  const base = roundMoney(
    state.cart.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0)
  );
  const config = state.data?.impuesto || {};
  const productosConImpuesto = Number(config.productos_con_impuesto || config.productosConImpuesto || 0) === 1;
  const tasaNormal = Math.max(Number(config.valor) || 0, 0);
  const tasaIncluida = Math.max(
    Number(config.impuesto_incluido_valor || config.impuestoIncluidoValor || 0) || 0,
    0
  );

  if (productosConImpuesto) {
    if (tasaIncluida > 0) {
      const subtotal = roundMoney(base / (1 + tasaIncluida / 100));
      const impuesto = roundMoney(base - subtotal);
      return { subtotal, impuesto, total: roundMoney(base) };
    }
    return { subtotal: base, impuesto: 0, total: base };
  }

  const impuesto = roundMoney(base * (tasaNormal / 100));
  return {
    subtotal: base,
    impuesto,
    total: roundMoney(base + impuesto),
  };
};

const setBoxMessage = (element, text = '', type = 'info') => {
  if (!element) return;
  element.textContent = text;
  element.dataset.type = text ? type : '';
  element.hidden = !text;
};

const setSubmitDisabled = (disabled) => {
  if (dom.submit) {
    dom.submit.disabled = Boolean(disabled);
  }
};

const applyTheme = () => {
  const tema = state.data?.negocio || {};
  const root = document.documentElement;
  if (tema.colorPrimario) {
    root.style.setProperty('--menu-brand', tema.colorPrimario);
  }
  if (tema.colorSecundario) {
    root.style.setProperty('--menu-accent', tema.colorSecundario);
  }
  if (tema.colorTexto) {
    root.style.setProperty('--menu-ink', tema.colorTexto);
  }
};

const renderLogo = () => {
  const negocio = state.data?.negocio || {};
  const logoUrl = String(negocio.logoUrl || '').trim();
  const initials = String(negocio.nombre || negocio.titulo || 'KM')
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);

  if (dom.logoFallback) {
    dom.logoFallback.textContent = initials || 'KM';
  }

  if (!dom.logo) return;
  if (logoUrl) {
    dom.logo.src = logoUrl;
    dom.logo.hidden = false;
    if (dom.logoFallback) dom.logoFallback.hidden = true;
    dom.logo.onerror = () => {
      dom.logo.hidden = true;
      if (dom.logoFallback) dom.logoFallback.hidden = false;
    };
    return;
  }

  dom.logo.removeAttribute('src');
  dom.logo.hidden = true;
  if (dom.logoFallback) dom.logoFallback.hidden = false;
};

const renderServiceOptions = () => {
  if (!dom.servicio) return;
  const currentValue = dom.servicio.value;
  const modos = Array.isArray(state.data?.configuracion?.modos_servicio)
    ? state.data.configuracion.modos_servicio
    : ['en_local', 'para_llevar'];
  const options = modos.map((modo) => {
    const label = modo === 'para_llevar' ? 'Para llevar' : 'Consumir en el negocio';
    return `<option value="${modo}">${label}</option>`;
  });
  dom.servicio.innerHTML = options.join('');
  if (modos.includes(currentValue)) {
    dom.servicio.value = currentValue;
  } else {
    dom.servicio.value = modos[0] || 'en_local';
  }
};

const renderHero = () => {
  const acceso = state.data?.acceso || {};
  const negocio = state.data?.negocio || {};
  const titulo = negocio.titulo || negocio.nombre || 'Menu digital';
  const mesaTexto = acceso.mesa || acceso.nombre || 'Menu publico';
  if (dom.titulo) dom.titulo.textContent = titulo;
  if (dom.subtitulo) {
    dom.subtitulo.textContent =
      acceso.tipo === 'pickup'
        ? 'Haz tu pedido y recogelo listo en caja.'
        : `Escanea, pide y todo se acumula en la cuenta de ${mesaTexto}.`;
  }
  if (dom.badgeAcceso) {
    dom.badgeAcceso.textContent = acceso.tipo === 'pickup' ? acceso.nombre || 'Para llevar' : mesaTexto;
  }
  document.title = `${titulo} - ${mesaTexto}`;
  renderLogo();
  renderServiceOptions();
};

const syncCartWithCatalog = () => {
  state.cart = state.cart
    .map((item) => {
      const product = findProductById(item.productId);
      if (!product) return null;

      return {
        ...item,
        name: product.nombre,
        categoryName: product.categoria_nombre,
        available: Boolean(product.disponible),
        price: roundMoney(product.precio),
      };
    })
    .filter(Boolean);
};

const buildCartKey = (productId) => `${Number(productId)}`;

const addToCart = (productId) => {
  const product = findProductById(productId);
  if (!product || !product.disponible) {
    setBoxMessage(dom.formMessage, 'Ese producto ya no esta disponible.', 'error');
    return;
  }

  const key = buildCartKey(product.id);
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      key,
      productId: Number(product.id),
      name: product.nombre,
      categoryName: product.categoria_nombre,
      available: Boolean(product.disponible),
      price: roundMoney(product.precio),
      quantity: 1,
    });
  }

  setBoxMessage(dom.formMessage, '');
  renderAll();
};

const updateCartQuantity = (key, delta) => {
  const item = state.cart.find((candidate) => candidate.key === key);
  if (!item) return;
  item.quantity += Number(delta) || 0;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((candidate) => candidate.key !== key);
  }
  renderAll();
};

const removeCartItem = (key) => {
  state.cart = state.cart.filter((candidate) => candidate.key !== key);
  renderAll();
};

const getFilteredCategories = () => {
  const query = normalizeText(state.search);
  const categorias = state.data?.menu?.categorias || [];
  if (!query) return categorias;

  return categorias
    .map((categoria) => ({
      ...categoria,
      productos: (categoria.productos || []).filter((producto) => {
        const hayMatchProducto = normalizeText(producto.nombre).includes(query);
        const hayMatchCategoria = normalizeText(categoria.nombre).includes(query);
        return hayMatchProducto || hayMatchCategoria;
      }),
    }))
    .filter((categoria) => (categoria.productos || []).length > 0);
};

const renderNav = (categorias) => {
  if (!dom.nav) return;
  if (!categorias.length) {
    dom.nav.innerHTML = '';
    return;
  }
  dom.nav.innerHTML = categorias
    .map(
      (categoria) =>
        `<button type="button" data-target="categoria-${escapeHtml(slugify(categoria.nombre || categoria.id))}">
          ${escapeHtml(categoria.nombre || 'Menu')}
        </button>`
    )
    .join('');
};

const renderCatalog = () => {
  if (!dom.categorias) return;
  if (!state.data) {
    dom.categorias.innerHTML = `<div class="menu-publico-empty-state">Cargando menu...</div>`;
    return;
  }

  const categorias = getFilteredCategories();
  const cantidadesEnCarrito = new Map(
    state.cart.map((item) => [Number(item.productId), Number(item.quantity) || 0])
  );
  renderNav(categorias);

  if (!categorias.length) {
    dom.categorias.innerHTML = `
      <div class="menu-publico-empty-state">
        No encontramos productos con esa busqueda. Prueba con otro nombre o revisa las categorias.
      </div>
    `;
    return;
  }

  dom.categorias.innerHTML = categorias
    .map((categoria, index) => {
      const categoryId = `categoria-${slugify(categoria.nombre || categoria.id || index)}`;
      return `
        <section class="menu-publico-category" id="${escapeHtml(categoryId)}" style="animation-delay:${index * 45}ms">
          <div class="menu-publico-category-head">
            <h2 class="menu-publico-category-title">${escapeHtml(categoria.nombre || 'Menu')}</h2>
            <span class="menu-publico-category-count">${(categoria.productos || []).length} items</span>
          </div>
          <div class="menu-publico-category-grid">
            ${(categoria.productos || [])
              .map((producto) => {
                const quantityInCart = cantidadesEnCarrito.get(Number(producto.id)) || 0;
                const priceText = formatCurrency(producto.precio);
                const priceHelper = producto.disponible
                  ? 'Disponible ahora mismo.'
                  : 'No disponible por el momento.';

                return `
                  <article class="menu-publico-item${producto.disponible ? '' : ' is-unavailable'}">
                    <div class="menu-publico-item-head">
                      <div>
                        <h3>${escapeHtml(producto.nombre)}</h3>
                        <p class="menu-publico-item-price">${escapeHtml(priceText)}</p>
                        <p class="menu-publico-item-subtext">${escapeHtml(priceHelper)}</p>
                      </div>
                      <span class="menu-publico-item-badge">${producto.disponible ? 'Disponible' : 'No disponible'}</span>
                    </div>
                    <div class="menu-publico-item-footer">
                      <div class="menu-publico-item-footer-copy">
                        <div class="menu-publico-item-subtext">Precio original</div>
                        ${
                          quantityInCart > 0
                            ? `<span class="menu-publico-item-cart-hint">En tu pedido: ${quantityInCart}</span>`
                            : ''
                        }
                      </div>
                      <button
                        type="button"
                        class="menu-publico-item-button"
                        data-action="add"
                        data-product-id="${producto.id}"
                        ${producto.disponible ? '' : 'disabled'}
                      >
                        ${quantityInCart > 0 ? 'Agregar otro' : 'Agregar'}
                      </button>
                    </div>
                  </article>
                `;
              })
              .join('')}
          </div>
        </section>
      `;
    })
    .join('');
};

const renderCart = () => {
  if (!dom.cart) return;

  if (!state.cart.length) {
    dom.cart.innerHTML = `
      <div class="menu-publico-cart-empty">
        Tu carrito esta vacio. Agrega productos del menu para enviar tu pedido.
      </div>
    `;
  } else {
    dom.cart.innerHTML = state.cart
      .map((item) => {
        const totalLinea = roundMoney((Number(item.price) || 0) * (Number(item.quantity) || 0));
        return `
          <article class="menu-publico-cart-item${item.available ? '' : ' is-unavailable'}">
            <div class="menu-publico-cart-top">
              <div>
                <p class="menu-publico-cart-name">${escapeHtml(item.name)}</p>
                <p class="menu-publico-cart-meta">${escapeHtml(formatCurrency(item.price))}${item.available ? '' : ' - No disponible'}</p>
              </div>
              <strong class="menu-publico-cart-total">${escapeHtml(formatCurrency(totalLinea))}</strong>
            </div>
            <div class="menu-publico-cart-bottom">
              <div class="menu-publico-qty">
                <button type="button" data-action="qty" data-delta="-1" data-key="${escapeHtml(item.key)}">-</button>
                <span>${item.quantity}</span>
                <button type="button" data-action="qty" data-delta="1" data-key="${escapeHtml(item.key)}">+</button>
              </div>
              <button type="button" class="menu-publico-cart-action" data-action="remove" data-key="${escapeHtml(item.key)}">
                Quitar
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  const totals = calculateTotals();
  const totalItems = state.cart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  if (dom.orderCount) {
    dom.orderCount.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  }
  if (dom.mobileCount) {
    dom.mobileCount.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  }
  if (dom.subtotal) dom.subtotal.textContent = formatCurrency(totals.subtotal);
  if (dom.impuesto) dom.impuesto.textContent = formatCurrency(totals.impuesto);
  if (dom.total) dom.total.textContent = formatCurrency(totals.total);
  if (dom.mobileTotal) dom.mobileTotal.textContent = formatCurrency(totals.total);
  if (dom.mobileToggle) {
    dom.mobileToggle.classList.toggle('has-items', state.cart.length > 0);
  }

  const hasUnavailable = state.cart.some((item) => !item.available);
  setSubmitDisabled(state.submitting || state.loading || !state.cart.length || hasUnavailable);
};

const updateSyncBadge = (text, fallbackTime = true) => {
  if (!dom.badgeSync) return;
  if (text) {
    dom.badgeSync.textContent = text;
    return;
  }
  if (!fallbackTime) return;
  dom.badgeSync.textContent = `Actualizado ${formatTime(new Date())}`;
};

const renderAll = () => {
  applyTheme();
  renderHero();
  renderCatalog();
  renderCart();
};

const loadMenu = async ({ silent = false } = {}) => {
  if (!state.token) {
    setBoxMessage(dom.estado, 'No se encontro el token del menu publico.', 'error');
    setSubmitDisabled(true);
    return;
  }

  state.loading = !silent;
  if (!silent) {
    setBoxMessage(dom.estado, 'Cargando menu...', 'info');
    updateSyncBadge('Sincronizando...');
  }
  renderCart();

  try {
    const response = await fetch(`/api/public/menu/${encodeURIComponent(state.token)}?ts=${Date.now()}`, {
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo cargar el menu.');
    }

    state.data = data;
    syncCartWithCatalog();
    renderAll();
    setBoxMessage(dom.estado, '');
    updateSyncBadge('', true);
  } catch (error) {
    if (!state.data) {
      if (dom.categorias) {
        dom.categorias.innerHTML = `<div class="menu-publico-empty-state">${escapeHtml(
          error.message || 'No se pudo cargar el menu.'
        )}</div>`;
      }
      setSubmitDisabled(true);
    }
    setBoxMessage(dom.estado, error.message || 'No se pudo cargar el menu.', 'error');
    updateSyncBadge('Sin conexion');
  } finally {
    state.loading = false;
    renderCart();
  }
};

const submitOrder = async (event) => {
  event.preventDefault();
  if (state.submitting) return;
  if (!state.cart.length) {
    setBoxMessage(dom.formMessage, 'Agrega al menos un producto al pedido.', 'error');
    return;
  }
  if (state.cart.some((item) => !item.available)) {
    setBoxMessage(dom.formMessage, 'Hay productos no disponibles en el carrito. Revisalo antes de enviar.', 'error');
    return;
  }

  state.submitting = true;
  setSubmitDisabled(true);
  setBoxMessage(dom.formMessage, 'Enviando pedido...', 'info');

  try {
    const response = await fetch(`/api/public/menu/${encodeURIComponent(state.token)}/pedidos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cliente: dom.cliente?.value?.trim() || null,
        modo_servicio: dom.servicio?.value || 'en_local',
        nota: dom.nota?.value?.trim() || null,
        items: state.cart.map((item) => ({
          producto_id: item.productId,
          cantidad: item.quantity,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo enviar el pedido.');
    }

    const pedidoId = Number(data?.pedido?.id) || null;
    const cuentaId = Number(data?.pedido?.cuenta_id) || null;
    state.cart = [];
    if (dom.nota) dom.nota.value = '';
    renderAll();
    setBoxMessage(
      dom.formMessage,
      `Pedido enviado${pedidoId ? ` #${pedidoId}` : ''}${cuentaId ? ` - Cuenta #${cuentaId}` : ''}.`,
      'success'
    );
    await loadMenu({ silent: true });
  } catch (error) {
    setBoxMessage(dom.formMessage, error.message || 'No se pudo enviar el pedido.', 'error');
  } finally {
    state.submitting = false;
    renderCart();
  }
};

const handleCatalogClick = (event) => {
  const addButton = event.target.closest('[data-action="add"]');
  if (!addButton) return;

  const productId = Number(addButton.dataset.productId);
  addToCart(productId);
};

const handleCartClick = (event) => {
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const key = action.dataset.key;
  if (action.dataset.action === 'qty') {
    updateCartQuantity(key, Number(action.dataset.delta) || 0);
    return;
  }
  if (action.dataset.action === 'remove') {
    removeCartItem(key);
  }
};

const handleNavClick = (event) => {
  const button = event.target.closest('button[data-target]');
  if (!button) return;
  const target = document.getElementById(button.dataset.target);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const init = async () => {
  state.token = getTokenFromLocation();
  if (!state.token) {
    setBoxMessage(dom.estado, 'No se encontro el token del menu publico.', 'error');
    setSubmitDisabled(true);
    return;
  }

  syncDrawerViewport();

  dom.search?.addEventListener('input', (event) => {
    state.search = event.target.value || '';
    renderCatalog();
  });
  dom.categorias?.addEventListener('click', handleCatalogClick);
  dom.cart?.addEventListener('click', handleCartClick);
  dom.nav?.addEventListener('click', handleNavClick);
  dom.form?.addEventListener('submit', submitOrder);
  dom.mobileToggle?.addEventListener('click', () => {
    setDrawerOpen(!state.drawerOpen);
  });
  dom.overlay?.addEventListener('click', () => {
    setDrawerOpen(false);
  });
  dom.orderClose?.addEventListener('click', () => {
    setDrawerOpen(false);
  });
  compactViewportQuery?.addEventListener?.('change', syncDrawerViewport);

  await loadMenu();
  state.pollHandle = window.setInterval(() => {
    loadMenu({ silent: true });
  }, 30000);
};

window.addEventListener('beforeunload', () => {
  if (state.pollHandle) {
    window.clearInterval(state.pollHandle);
  }
  compactViewportQuery?.removeEventListener?.('change', syncDrawerViewport);
});

init();
