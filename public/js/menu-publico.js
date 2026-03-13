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
  orderCard: document.getElementById('menu-publico-order-card'),
  subtotal: document.getElementById('menu-publico-subtotal'),
  impuesto: document.getElementById('menu-publico-impuesto'),
  propina: document.getElementById('menu-publico-propina'),
  propinaRow: document.getElementById('menu-publico-propina-row'),
  total: document.getElementById('menu-publico-total'),
  submit: document.getElementById('menu-publico-submit'),
  formMessage: document.getElementById('menu-publico-form-message'),
  overlay: document.getElementById('menu-publico-overlay'),
  orderClose: document.getElementById('menu-publico-order-close'),
  back: document.getElementById('menu-publico-back'),
  cartToggle: document.getElementById('menu-publico-cart-toggle'),
  cartBadge: document.getElementById('menu-publico-cart-badge'),
  languageToggle: document.getElementById('menu-publico-language-toggle'),
  languageCode: document.getElementById('menu-publico-language-code'),
  languageMenu: document.getElementById('menu-publico-language-menu'),
  searchToggle: document.getElementById('menu-publico-search-toggle'),
  searchWrap: document.getElementById('menu-publico-search-wrap'),
};

const DEFAULT_LANGUAGE = 'es';
const LANGUAGE_STORAGE_KEY = 'kanm-menu-publico-language';
const TRANSLATION_CACHE_STORAGE_KEY = 'kanm-menu-publico-translations-v1';
const TRANSLATION_QUEUE_CONCURRENCY = 4;
const LANGUAGE_OPTIONS = [
  { code: 'es', nativeLabel: 'Español' },
  { code: 'en', nativeLabel: 'English' },
  { code: 'fr', nativeLabel: 'Français' },
  { code: 'de', nativeLabel: 'Deutsch' },
  { code: 'it', nativeLabel: 'Italiano' },
  { code: 'pt', nativeLabel: 'Português' },
  { code: 'ca', nativeLabel: 'Català' },
  { code: 'nl', nativeLabel: 'Nederlands' },
  { code: 'sv', nativeLabel: 'Svenska' },
  { code: 'no', nativeLabel: 'Norsk' },
  { code: 'da', nativeLabel: 'Dansk' },
  { code: 'fi', nativeLabel: 'Suomi' },
  { code: 'pl', nativeLabel: 'Polski' },
  { code: 'cs', nativeLabel: 'Čeština' },
  { code: 'sk', nativeLabel: 'Slovenčina' },
  { code: 'hu', nativeLabel: 'Magyar' },
  { code: 'ro', nativeLabel: 'Română' },
  { code: 'bg', nativeLabel: 'Български' },
  { code: 'el', nativeLabel: 'Ελληνικά' },
  { code: 'uk', nativeLabel: 'Українська' },
  { code: 'ru', nativeLabel: 'Русский' },
  { code: 'tr', nativeLabel: 'Türkçe' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'he', nativeLabel: 'עברית' },
  { code: 'fa', nativeLabel: 'فارسی' },
  { code: 'hi', nativeLabel: 'हिन्दी' },
  { code: 'bn', nativeLabel: 'বাংলা' },
  { code: 'ur', nativeLabel: 'اردو' },
  { code: 'th', nativeLabel: 'ไทย' },
  { code: 'vi', nativeLabel: 'Tiếng Việt' },
  { code: 'id', nativeLabel: 'Bahasa Indonesia' },
  { code: 'ms', nativeLabel: 'Bahasa Melayu' },
  { code: 'ko', nativeLabel: '한국어' },
  { code: 'ja', nativeLabel: '日本語' },
  { code: 'zh-CN', nativeLabel: '中文（简体）' },
  { code: 'zh-TW', nativeLabel: '中文（繁體）' },
];
const LANGUAGE_CODES = LANGUAGE_OPTIONS.map((language) => language.code);

const TRANSLATIONS = {
  es: {
    actionBack: 'Volver',
    actionSearch: 'Buscar',
    actionCart: 'Ver pedido',
    actionCartWithCount: 'Ver pedido, {count}',
    actionLanguage: 'Cambiar idioma',
    actionClose: 'Cerrar',
    searchLabel: 'Buscar',
    searchPlaceholder: 'Buscar combos, bebidas, postres...',
    languageSpanish: 'Espanol',
    languageEnglish: 'Ingles',
    loadingMenu: 'Cargando menu...',
    loadingSubtitle: 'Espera un momento mientras sincronizamos disponibilidad y precios.',
    menuTitleDefault: 'Menu digital',
    publicMenu: 'Menu publico',
    pickupSubtitle: 'Recoge tu pedido en caja.',
    tableSubtitle: 'Pide desde {place}.',
    accessTable: 'Mesa',
    pickupBadge: 'Para llevar',
    orderKicker: 'Tu pedido',
    orderTitle: 'Envialo directo al negocio',
    fieldCustomerName: 'Tu nombre (opcional)',
    fieldCustomerNamePlaceholder: 'Ej. Ana o Silla 3',
    fieldService: 'Tipo de servicio',
    fieldNote: 'Nota para preparacion',
    fieldNotePlaceholder: 'Ej. Sin cebolla, extra queso, poco azucar...',
    serviceLocal: 'Consumir en el negocio',
    serviceTakeaway: 'Para llevar',
    totalSubtotal: 'Subtotal',
    totalTax: 'Impuesto',
    totalTip: 'Propina legal (10%)',
    totalEstimated: 'Total estimado',
    submitOrder: 'Enviar pedido',
    navMenu: 'Menu',
    searchEmpty: 'No encontramos productos con esa busqueda. Prueba con otro nombre o revisa las categorias.',
    productCountOne: '{count} producto',
    productCountOther: '{count} productos',
    orderItemsOne: '{count} en tu pedido',
    orderItemsOther: '{count} en tu pedido',
    productUnavailable: 'No disponible',
    discountBadge: '{count}% DTO',
    addProductAria: 'Agregar {name}',
    cartEmpty: 'Tu carrito esta vacio. Agrega productos del menu para enviar tu pedido.',
    removeItem: 'Quitar',
    updatedAt: 'Actualizado {time}',
    syncLoading: 'Sincronizando...',
    syncReset: 'Sesion reiniciada',
    syncOffline: 'Sin conexion',
    tokenMissing: 'No se encontro el token del menu publico.',
    loadFailed: 'No se pudo cargar el menu.',
    addOneProduct: 'Agrega al menos un producto al pedido.',
    cartHasUnavailable: 'Hay productos no disponibles en el carrito. Revisalo antes de enviar.',
    sendingOrder: 'Enviando pedido...',
    sendFailed: 'No se pudo enviar el pedido.',
    orderSent: 'Pedido enviado{orderSuffix}{accountSuffix}.',
    accountLabel: 'Cuenta',
    orderingLocked: 'Esta mesa fue reiniciada. Vuelve a escanear el QR para seguir pidiendo.',
    productNoLongerAvailable: 'Ese producto ya no esta disponible.',
  },
  en: {
    actionBack: 'Back',
    actionSearch: 'Search',
    actionCart: 'Open order',
    actionCartWithCount: 'Open order, {count}',
    actionLanguage: 'Change language',
    actionClose: 'Close',
    searchLabel: 'Search',
    searchPlaceholder: 'Search combos, drinks, desserts...',
    languageSpanish: 'Spanish',
    languageEnglish: 'English',
    loadingMenu: 'Loading menu...',
    loadingSubtitle: 'Please wait while we sync availability and pricing.',
    menuTitleDefault: 'Digital menu',
    publicMenu: 'Public menu',
    pickupSubtitle: 'Pick up your order at the counter.',
    tableSubtitle: 'Order from {place}.',
    accessTable: 'Table',
    pickupBadge: 'Takeout',
    orderKicker: 'Your order',
    orderTitle: 'Send it straight to the business',
    fieldCustomerName: 'Your name (optional)',
    fieldCustomerNamePlaceholder: 'Ex. Ana or Seat 3',
    fieldService: 'Service type',
    fieldNote: 'Preparation note',
    fieldNotePlaceholder: 'Ex. No onions, extra cheese, low sugar...',
    serviceLocal: 'Dine in',
    serviceTakeaway: 'Takeout',
    totalSubtotal: 'Subtotal',
    totalTax: 'Tax',
    totalTip: 'Legal tip (10%)',
    totalEstimated: 'Estimated total',
    submitOrder: 'Send order',
    navMenu: 'Menu',
    searchEmpty: 'We could not find products for that search. Try another name or browse the categories.',
    productCountOne: '{count} item',
    productCountOther: '{count} items',
    orderItemsOne: '{count} in your order',
    orderItemsOther: '{count} in your order',
    productUnavailable: 'Unavailable',
    discountBadge: '{count}% OFF',
    addProductAria: 'Add {name}',
    cartEmpty: 'Your cart is empty. Add menu items to send your order.',
    removeItem: 'Remove',
    updatedAt: 'Updated {time}',
    syncLoading: 'Syncing...',
    syncReset: 'Session reset',
    syncOffline: 'Offline',
    tokenMissing: 'The public menu token was not found.',
    loadFailed: 'The menu could not be loaded.',
    addOneProduct: 'Add at least one item to the order.',
    cartHasUnavailable: 'There are unavailable items in your cart. Review it before sending.',
    sendingOrder: 'Sending order...',
    sendFailed: 'The order could not be sent.',
    orderSent: 'Order sent{orderSuffix}{accountSuffix}.',
    accountLabel: 'Account',
    orderingLocked: 'This table was reset. Scan the QR again to keep ordering.',
    productNoLongerAvailable: 'That item is no longer available.',
  },
};

const getStoredLanguage = () => {
  try {
    const stored = window.localStorage?.getItem?.(LANGUAGE_STORAGE_KEY);
    return LANGUAGE_CODES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch (_) {
    return DEFAULT_LANGUAGE;
  }
};

const loadStoredTranslationCache = () => {
  try {
    const raw = window.localStorage?.getItem?.(TRANSLATION_CACHE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

const translationRuntime = {
  cache: loadStoredTranslationCache(),
  queue: [],
  pending: new Map(),
  activeCount: 0,
  persistHandle: 0,
  rerenderHandle: 0,
};

const state = {
  token: '',
  data: null,
  renderSignature: '',
  search: '',
  cart: [],
  pollHandle: null,
  loading: false,
  submitting: false,
  drawerOpen: false,
  clientId: '',
  orderSession: '',
  orderingLocked: false,
  language: getStoredLanguage(),
  languageMenuOpen: false,
  lastSyncAt: null,
  syncBadgeKey: 'syncLoading',
  syncBadgeParams: {},
};

const compactViewportQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 860px)')
    : null;

const getClientId = () => {
  try {
    const storageKey = 'kanm-menu-publico-client';
    const existing = window.sessionStorage?.getItem?.(storageKey);
    if (existing) return existing;
    const nextValue =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `menu-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    window.sessionStorage?.setItem?.(storageKey, nextValue);
    return nextValue;
  } catch (_) {
    return `menu-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
};

const getActiveLanguage = () => (LANGUAGE_CODES.includes(state.language) ? state.language : DEFAULT_LANGUAGE);

const getTranslationValue = (language, key) =>
  key.split('.').reduce((acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined), TRANSLATIONS[language]);

const normalizeTranslatableText = (value) => String(value ?? '').trim();
const hasTranslatableContent = (value) => /\p{L}/u.test(normalizeTranslatableText(value));

const applyTemplateParams = (template, params = {}) =>
  String(template ?? '').replace(/\{(\w+)\}|\[\[(\w+)\]\]/g, (_, tokenA, tokenB) => {
    const token = tokenA || tokenB;
    return String(params[token] ?? '');
  });

const encodeTemplateTokens = (template) => String(template ?? '').replace(/\{(\w+)\}/g, (_, token) => `[[${token}]]`);

const scheduleTranslationCachePersist = () => {
  if (translationRuntime.persistHandle) return;
  translationRuntime.persistHandle = window.setTimeout(() => {
    translationRuntime.persistHandle = 0;
    try {
      window.localStorage?.setItem?.(TRANSLATION_CACHE_STORAGE_KEY, JSON.stringify(translationRuntime.cache));
    } catch (_) {
      // Ignore storage quota and private mode errors.
    }
  }, 250);
};

const scheduleTranslationRerender = () => {
  if (translationRuntime.rerenderHandle) {
    window.clearTimeout(translationRuntime.rerenderHandle);
  }
  translationRuntime.rerenderHandle = window.setTimeout(() => {
    translationRuntime.rerenderHandle = 0;
    renderAll();
    updateSyncBadge(state.syncBadgeKey, state.syncBadgeParams, true);
  }, 320);
};

const buildTranslationCacheKey = (language, text) => `${language}::${text}`;

const fetchTranslatedText = async (text, language) => {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', language);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetch(url.toString(), {
    cache: 'force-cache',
  });
  if (!response.ok) {
    throw new Error(`translate-${response.status}`);
  }
  const data = await response.json().catch(() => []);
  const translated = Array.isArray(data?.[0]) ? data[0].map((chunk) => String(chunk?.[0] ?? '')).join('') : '';
  return normalizeTranslatableText(translated || text);
};

const pumpTranslationQueue = () => {
  while (translationRuntime.activeCount < TRANSLATION_QUEUE_CONCURRENCY && translationRuntime.queue.length) {
    const task = translationRuntime.queue.shift();
    if (!task) return;

    translationRuntime.activeCount += 1;
    fetchTranslatedText(task.text, task.language)
      .then((translated) => {
        translationRuntime.cache[task.key] = translated || task.text;
        scheduleTranslationCachePersist();
        if (getActiveLanguage() === task.language) {
          scheduleTranslationRerender();
        }
      })
      .catch(() => {
        // Keep the original text when translation is unavailable.
      })
      .finally(() => {
        translationRuntime.pending.delete(task.key);
        translationRuntime.activeCount = Math.max(0, translationRuntime.activeCount - 1);
        pumpTranslationQueue();
      });
  }
};

const queueAutoTranslation = (text, language = getActiveLanguage()) => {
  const sourceText = normalizeTranslatableText(text);
  if (!sourceText || language === DEFAULT_LANGUAGE || !hasTranslatableContent(sourceText)) return;

  const key = buildTranslationCacheKey(language, sourceText);
  if (translationRuntime.cache[key] || translationRuntime.pending.has(key)) return;

  translationRuntime.pending.set(key, true);
  translationRuntime.queue.push({ key, language, text: sourceText });
  pumpTranslationQueue();
};

const getAutoTranslatedText = (text, language = getActiveLanguage()) => {
  const sourceText = normalizeTranslatableText(text);
  if (!sourceText || language === DEFAULT_LANGUAGE || !hasTranslatableContent(sourceText)) {
    return sourceText;
  }

  const key = buildTranslationCacheKey(language, sourceText);
  if (translationRuntime.cache[key]) {
    return translationRuntime.cache[key];
  }

  queueAutoTranslation(sourceText, language);
  return sourceText;
};

const localizeArbitraryText = (text, language = getActiveLanguage()) => {
  const sourceText = normalizeTranslatableText(text);
  if (!sourceText || language === DEFAULT_LANGUAGE) return sourceText;
  return getAutoTranslatedText(sourceText, language);
};

const resolveMessageText = (message, fallbackKey = '') => {
  const fallbackText = fallbackKey ? t(fallbackKey) : '';
  const normalized = normalizeTranslatableText(message);
  if (!normalized) return fallbackText;
  if (fallbackText && normalized === fallbackText) return fallbackText;
  return localizeArbitraryText(normalized);
};

const t = (key, params = {}) => {
  const language = getActiveLanguage();
  const manualTemplate = getTranslationValue(language, key);
  if (manualTemplate !== undefined) {
    return applyTemplateParams(manualTemplate, params);
  }

  const baseTemplate = getTranslationValue(DEFAULT_LANGUAGE, key) ?? key;
  if (language === DEFAULT_LANGUAGE) {
    return applyTemplateParams(baseTemplate, params);
  }

  return applyTemplateParams(getAutoTranslatedText(encodeTemplateTokens(baseTemplate), language), params);
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatTime = (value) =>
  new Intl.DateTimeFormat(getActiveLanguage() === 'en' ? 'en-US' : 'es-DO', {
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

const getInitials = (value, fallback = 'KM') => {
  const initials = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk.charAt(0).toUpperCase())
    .join('');
  return initials || fallback;
};

const normalizeHttpUrl = (value) => {
  const text = String(value ?? '').trim();
  if (!text || /^data:/i.test(text)) return '';
  try {
    const parsed = new URL(text);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch (_) {
    return '';
  }
};

const readJsonDataset = (value) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
};

const getLocalizedValue = (entity, baseKey) => {
  if (!entity || !baseKey) return '';
  const language = getActiveLanguage();
  const baseValue = normalizeTranslatableText(entity[baseKey]);
  if (language !== DEFAULT_LANGUAGE) {
    const baseLanguage = language.split('-')[0];
    const translations = entity.translations?.[language] || entity.translations?.[baseLanguage];
    const candidates = [
      translations?.[baseKey],
      entity[`${baseKey}_${language}`],
      entity[`${baseKey}_${baseLanguage}`],
      entity[`${baseKey}${language.toUpperCase()}`],
      entity[`${baseKey}${baseLanguage.toUpperCase()}`],
      entity[`${baseKey}${language.charAt(0).toUpperCase()}${language.slice(1)}`],
      entity[`${baseKey}${baseLanguage.charAt(0).toUpperCase()}${baseLanguage.slice(1)}`],
      language === 'en' ? entity[`${baseKey}_ingles`] : '',
    ];
    const localized = candidates.find((candidate) => String(candidate || '').trim());
    if (localized) return String(localized).trim();
    return getAutoTranslatedText(baseValue, language);
  }
  return baseValue;
};

const getLanguageOption = (code) => LANGUAGE_OPTIONS.find((language) => language.code === code) || LANGUAGE_OPTIONS[0];

const getLanguageDisplayName = (code, locale = getActiveLanguage()) => {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || getLanguageOption(code)?.nativeLabel || code;
  } catch (_) {
    return getLanguageOption(code)?.nativeLabel || code;
  }
};

const getBusinessTitle = () =>
  getLocalizedValue(state.data?.negocio || {}, 'titulo') ||
  getLocalizedValue(state.data?.negocio || {}, 'nombre') ||
  t('menuTitleDefault');

const getAccessName = () => {
  const acceso = state.data?.acceso || {};
  return String(acceso.mesa || getLocalizedValue(acceso, 'nombre') || t('publicMenu')).trim();
};

const getCategoryName = (categoria) => getLocalizedValue(categoria, 'nombre') || t('navMenu');
const getProductName = (producto) => getLocalizedValue(producto, 'nombre') || t('navMenu');
const getOrderingLockMessage = () => t('orderingLocked');
const getProductCountText = (count) => t(count === 1 ? 'productCountOne' : 'productCountOther', { count });
const getItemsInOrderText = (count) => t(count === 1 ? 'orderItemsOne' : 'orderItemsOther', { count });

const setBoxMessage = (element, text = '', type = 'info', meta = null) => {
  if (!element) return;
  element.textContent = text;
  element.dataset.type = text ? type : '';
  if (meta?.key) {
    element.dataset.i18nKey = meta.key;
    element.dataset.i18nParams = JSON.stringify(meta.params || {});
  } else {
    delete element.dataset.i18nKey;
    delete element.dataset.i18nParams;
  }
  element.hidden = !text;
};

const setTranslatedBoxMessage = (element, key = '', type = 'info', params = {}) => {
  if (!key) {
    setBoxMessage(element, '', type);
    return;
  }
  setBoxMessage(element, t(key, params), type, { key, params });
};

const refreshTranslatedBoxMessage = (element) => {
  const key = element?.dataset?.i18nKey;
  if (!key) return;
  const params = readJsonDataset(element.dataset.i18nParams);
  setBoxMessage(element, t(key, params), element.dataset.type || 'info', { key, params });
};

const renderLanguageMenu = () => {
  if (!dom.languageMenu) return;
  dom.languageMenu.innerHTML = LANGUAGE_OPTIONS.map((language) => {
    const localizedName = getLanguageDisplayName(language.code);
    const displayName =
      localizedName && localizedName.toLowerCase() !== language.nativeLabel.toLowerCase()
        ? `${language.nativeLabel} · ${localizedName}`
        : language.nativeLabel;
    return `
      <button
        type="button"
        class="menu-publico-language-option${language.code === getActiveLanguage() ? ' is-active' : ''}"
        data-language="${language.code}"
        aria-pressed="${language.code === getActiveLanguage() ? 'true' : 'false'}"
      >
        <strong>${escapeHtml(language.code.split('-')[0].toUpperCase())}</strong>
        <span>${escapeHtml(displayName)}</span>
      </button>
    `;
  }).join('');
  dom.languageMenu.hidden = !state.languageMenuOpen;
  if (dom.languageToggle) {
    dom.languageToggle.setAttribute('aria-expanded', state.languageMenuOpen ? 'true' : 'false');
  }
};

const applyStaticCopy = () => {
  document.documentElement.lang = getActiveLanguage();
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });
  if (dom.languageCode) {
    dom.languageCode.textContent = getActiveLanguage().split('-')[0].toUpperCase();
  }
  if (!state.data) {
    if (dom.titulo) dom.titulo.textContent = t('loadingMenu');
    if (dom.subtitulo) dom.subtitulo.textContent = t('loadingSubtitle');
    if (dom.badgeAcceso) dom.badgeAcceso.textContent = t('accessTable');
  }
  renderLanguageMenu();
  refreshTranslatedBoxMessage(dom.estado);
  refreshTranslatedBoxMessage(dom.formMessage);
};

const setLanguageMenuOpen = (open) => {
  state.languageMenuOpen = Boolean(open);
  renderLanguageMenu();
};

const setLanguage = (language, { persist = true } = {}) => {
  if (!LANGUAGE_CODES.includes(language) || language === state.language) {
    applyStaticCopy();
    return;
  }
  state.language = language;
  if (persist) {
    try {
      window.localStorage?.setItem?.(LANGUAGE_STORAGE_KEY, language);
    } catch (_) {
      // Ignore storage errors on private or locked browsers.
    }
  }
  setLanguageMenuOpen(false);
  applyStaticCopy();
  renderAll();
  updateSyncBadge(state.syncBadgeKey, state.syncBadgeParams, true);
};

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
      categoria_nombre: producto.categoria_nombre || getCategoryName(categoria),
    }))
  );

const buildMenuRenderSignature = (data) =>
  {
    const normalizeMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
    return JSON.stringify({
      negocio: {
        id: data?.negocio?.id ?? null,
        nombre: data?.negocio?.nombre ?? '',
        titulo: data?.negocio?.titulo ?? '',
        logoUrl: data?.negocio?.logoUrl ?? '',
        colorPrimario: data?.negocio?.colorPrimario ?? '',
        colorSecundario: data?.negocio?.colorSecundario ?? '',
        colorTexto: data?.negocio?.colorTexto ?? '',
        translations: data?.negocio?.translations ?? null,
      },
      acceso: {
        tipo: data?.acceso?.tipo ?? '',
        mesa: data?.acceso?.mesa ?? '',
        nombre: data?.acceso?.nombre ?? '',
        translations: data?.acceso?.translations ?? null,
      },
      configuracion: {
        modos_servicio: Array.isArray(data?.configuracion?.modos_servicio) ? data.configuracion.modos_servicio : [],
      },
      impuesto: {
        valor: Number(data?.impuesto?.valor) || 0,
        productos_con_impuesto:
          Number(data?.impuesto?.productos_con_impuesto || data?.impuesto?.productosConImpuesto) || 0,
        impuesto_incluido_valor:
          Number(data?.impuesto?.impuesto_incluido_valor || data?.impuesto?.impuestoIncluidoValor) || 0,
      },
      menu: (data?.menu?.categorias || []).map((categoria) => ({
        id: categoria?.id ?? null,
        nombre: categoria?.nombre ?? '',
        translations: categoria?.translations ?? null,
        productos: (categoria?.productos || []).map((producto) => ({
          id: producto?.id ?? null,
          nombre: producto?.nombre ?? '',
          categoria_nombre: producto?.categoria_nombre ?? '',
          disponible: Boolean(producto?.disponible),
          precio: normalizeMoney(producto?.precio),
          image_url: producto?.image_url ?? '',
          translations: producto?.translations ?? null,
          precios: Array.isArray(producto?.precios)
            ? producto.precios.map((precio) => ({
                id: precio?.id ?? null,
                nombre: precio?.nombre ?? '',
                valor: normalizeMoney(precio?.valor),
              }))
            : [],
        })),
      })),
    });
  };

const findProductById = (productId) =>
  getCatalogProducts().find((producto) => Number(producto.id) === Number(productId)) || null;

const isCompactViewport = () => Boolean(compactViewportQuery?.matches);
const isSearchOpen = () => document.body.classList.contains('menu-publico-search-open');

const setSearchOpen = (open) => {
  const nextState = Boolean(open) && isCompactViewport();
  document.body.classList.toggle('menu-publico-search-open', nextState);
};

const setDrawerOpen = (open) => {
  const nextState = Boolean(open) && isCompactViewport();
  state.drawerOpen = nextState;
  document.body.classList.toggle('menu-publico-drawer-open', nextState);
  if (dom.overlay) {
    dom.overlay.hidden = !nextState;
  }
  if (nextState) {
    setLanguageMenuOpen(false);
  }
};

const syncDrawerViewport = () => {
  if (!isCompactViewport()) {
    setDrawerOpen(false);
    setSearchOpen(false);
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
      const propina = (dom.servicio?.value || 'en_local') === 'en_local' ? roundMoney(subtotal * 0.1) : 0;
      return { subtotal, impuesto, propina, total: roundMoney(base + propina) };
    }
    const propina = (dom.servicio?.value || 'en_local') === 'en_local' ? roundMoney(base * 0.1) : 0;
    return { subtotal: base, impuesto: 0, propina, total: roundMoney(base + propina) };
  }

  const impuesto = roundMoney(base * (tasaNormal / 100));
  const propina = (dom.servicio?.value || 'en_local') === 'en_local' ? roundMoney(base * 0.1) : 0;
  return {
    subtotal: base,
    impuesto,
    propina,
    total: roundMoney(base + impuesto + propina),
  };
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
  const initials = String(getBusinessTitle() || 'KM')
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
    const label = modo === 'para_llevar' ? t('serviceTakeaway') : t('serviceLocal');
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
  const titulo = getBusinessTitle();
  const mesaTexto = getAccessName();
  if (dom.titulo) dom.titulo.textContent = titulo;
  if (dom.subtitulo) {
    dom.subtitulo.textContent =
      acceso.tipo === 'pickup'
        ? t('pickupSubtitle')
        : t('tableSubtitle', { place: mesaTexto });
  }
  if (dom.badgeAcceso) {
    dom.badgeAcceso.textContent =
      acceso.tipo === 'pickup' ? getLocalizedValue(acceso, 'nombre') || t('pickupBadge') : mesaTexto;
  }
  document.title = `${titulo} - ${mesaTexto}`;
  renderLogo();
  renderServiceOptions();
};

const getComparePrice = (producto) => {
  const precioActual = Number(producto?.precio) || 0;
  const lista = Array.isArray(producto?.precios) ? producto.precios : [];
  return lista.reduce((max, item) => {
    const valor = Number(item?.valor) || 0;
    return valor > precioActual && valor > max ? valor : max;
  }, 0);
};

const getDiscountPercent = (price, comparePrice) => {
  const current = Number(price) || 0;
  const compare = Number(comparePrice) || 0;
  if (!(compare > current && current > 0)) return 0;
  return Math.max(1, Math.round(((compare - current) / compare) * 100));
};

const syncCartWithCatalog = () => {
  state.cart = state.cart
    .map((item) => {
      const product = findProductById(item.productId);
      if (!product) return null;

      return {
        ...item,
        name: getProductName(product),
        categoryName: getLocalizedValue(product, 'categoria_nombre') || item.categoryName,
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
    setTranslatedBoxMessage(dom.formMessage, 'productNoLongerAvailable', 'error');
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
      name: getProductName(product),
      categoryName: getLocalizedValue(product, 'categoria_nombre'),
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
        const hayMatchProducto = [getProductName(producto), producto.nombre]
          .some((value) => normalizeText(value).includes(query));
        const hayMatchCategoria = [getCategoryName(categoria), categoria.nombre]
          .some((value) => normalizeText(value).includes(query));
        return hayMatchProducto || hayMatchCategoria;
      }),
    }))
    .filter((categoria) => (categoria.productos || []).length > 0);
};

const renderNav = (categorias) => {
  if (!dom.nav) return;
  const buttons = [
    `<button type="button" class="menu-publico-nav-chip is-home" data-target="menu-publico-top">
      <span class="menu-publico-nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 7h5M4 12h8M4 17h6M15 6h.01M18 12h.01M15 18h.01" />
        </svg>
      </span>
      <span>${escapeHtml(t('navMenu'))}</span>
    </button>`,
  ];

  if (categorias.length) {
    buttons.push(
      ...categorias.map(
        (categoria) =>
          `<button type="button" class="menu-publico-nav-chip" data-target="categoria-${escapeHtml(
            slugify(getCategoryName(categoria) || categoria.id)
          )}">
            ${escapeHtml(getCategoryName(categoria))}
          </button>`
      )
    );
  }

  dom.nav.innerHTML = buttons.join('');
};

const hydrateCatalogImages = () => {
  dom.categorias?.querySelectorAll('.menu-publico-item-image').forEach((image) => {
    if (image.dataset.bound === '1') return;
    image.dataset.bound = '1';
    const media = image.closest('.menu-publico-item-media');
    const fallback = media?.querySelector('.menu-publico-item-media-fallback');
    const showFallback = () => {
      image.hidden = true;
      if (fallback) fallback.hidden = false;
      media?.classList.remove('has-image');
    };
    const showImage = () => {
      image.hidden = false;
      if (fallback) fallback.hidden = true;
      media?.classList.add('has-image');
    };
    image.addEventListener('error', showFallback);
    image.addEventListener('load', showImage);
    if (image.complete) {
      if (image.naturalWidth > 0) {
        showImage();
      } else {
        showFallback();
      }
    }
  });
};

const renderCatalog = () => {
  if (!dom.categorias) return;
  if (!state.data) {
    dom.categorias.innerHTML = `<div class="menu-publico-empty-state">${escapeHtml(t('loadingMenu'))}</div>`;
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
        ${escapeHtml(t('searchEmpty'))}
      </div>
    `;
    return;
  }

  dom.categorias.innerHTML = categorias
    .map((categoria, index) => {
      const categoryName = getCategoryName(categoria);
      const categoryId = `categoria-${slugify(categoryName || categoria.id || index)}`;
      return `
        <section class="menu-publico-category" id="${escapeHtml(categoryId)}" style="animation-delay:${index * 45}ms">
          <div class="menu-publico-category-head">
            <h2 class="menu-publico-category-title">${escapeHtml(categoryName)}</h2>
            <span class="menu-publico-category-count">${escapeHtml(
              getProductCountText((categoria.productos || []).length)
            )}</span>
          </div>
          <div class="menu-publico-category-grid">
            ${(categoria.productos || [])
              .map((producto) => {
                const productName = getProductName(producto);
                const quantityInCart = cantidadesEnCarrito.get(Number(producto.id)) || 0;
                const priceText = formatCurrency(producto.precio);
                const imageUrl = normalizeHttpUrl(producto.image_url);
                const initials = getInitials(productName, 'KM');
                const comparePrice = getComparePrice(producto);
                const discountPercent = getDiscountPercent(producto.precio, comparePrice);
                const hasDiscount = discountPercent > 0;
                const comparePriceText = hasDiscount ? formatCurrency(comparePrice) : '';
                const statusChip = !producto.disponible
                  ? `<span class="menu-publico-item-cart-chip is-off">${escapeHtml(t('productUnavailable'))}</span>`
                  : quantityInCart > 0
                  ? `<span class="menu-publico-item-cart-chip">${escapeHtml(getItemsInOrderText(quantityInCart))}</span>`
                  : '';

                return `
                  <article class="menu-publico-item${producto.disponible ? '' : ' is-unavailable'}">
                    <div class="menu-publico-item-media${imageUrl ? ' has-image' : ''}">
                      ${
                        imageUrl
                          ? `<img
                              class="menu-publico-item-image"
                              src="${escapeHtml(imageUrl)}"
                              alt="${escapeHtml(productName)}"
                              loading="lazy"
                              decoding="async"
                            />`
                          : ''
                      }
                      <div class="menu-publico-item-media-fallback"${imageUrl ? ' hidden' : ''}>${escapeHtml(initials)}</div>
                      ${
                        hasDiscount
                          ? `<span class="menu-publico-item-discount">${escapeHtml(
                              t('discountBadge', { count: discountPercent })
                            )}</span>`
                          : ''
                      }
                      <span class="menu-publico-item-favorite" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 20.5 5.6 14.3a4.5 4.5 0 0 1 6.4-6.3l.1.1.1-.1a4.5 4.5 0 0 1 6.3 6.4Z" />
                        </svg>
                      </span>
                      <button
                        type="button"
                        class="menu-publico-item-button"
                        data-action="add"
                        data-product-id="${producto.id}"
                        ${producto.disponible && !state.orderingLocked ? '' : 'disabled'}
                        aria-label="${escapeHtml(t('addProductAria', { name: productName }))}"
                      >
                        +
                      </button>
                    </div>
                    <div class="menu-publico-item-copy">
                      <h3>${escapeHtml(productName)}</h3>
                      ${statusChip}
                      <div class="menu-publico-item-price-line">
                        <p class="menu-publico-item-price">${escapeHtml(priceText)}</p>
                        ${hasDiscount ? `<p class="menu-publico-item-price-old">${escapeHtml(comparePriceText)}</p>` : ''}
                      </div>
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
  hydrateCatalogImages();
};

const renderCart = () => {
  if (!dom.cart) return;

  if (!state.cart.length) {
    dom.cart.innerHTML = `
      <div class="menu-publico-cart-empty">
        ${escapeHtml(t('cartEmpty'))}
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
                <p class="menu-publico-cart-meta">${escapeHtml(formatCurrency(item.price))}${
                  item.available ? '' : ` - ${escapeHtml(t('productUnavailable'))}`
                }</p>
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
                ${escapeHtml(t('removeItem'))}
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
    dom.orderCount.textContent = getProductCountText(totalItems);
  }
  if (dom.subtotal) dom.subtotal.textContent = formatCurrency(totals.subtotal);
  if (dom.impuesto) dom.impuesto.textContent = formatCurrency(totals.impuesto);
  if (dom.propina) dom.propina.textContent = formatCurrency(totals.propina || 0);
  if (dom.propinaRow) dom.propinaRow.hidden = !(Number(totals.propina) > 0);
  if (dom.total) dom.total.textContent = formatCurrency(totals.total);
  if (dom.cartBadge) {
    dom.cartBadge.hidden = totalItems <= 0;
    dom.cartBadge.textContent = String(totalItems);
  }
  if (dom.cartToggle) {
    dom.cartToggle.classList.toggle('has-items', totalItems > 0);
    const cartLabel = totalItems > 0 ? t('actionCartWithCount', { count: getProductCountText(totalItems) }) : t('actionCart');
    dom.cartToggle.setAttribute('aria-label', cartLabel);
  }

  const hasUnavailable = state.cart.some((item) => !item.available);
  setSubmitDisabled(state.submitting || state.loading || state.orderingLocked || !state.cart.length || hasUnavailable);
};

const updateSyncBadge = (key = '', params = {}, fallbackTime = true) => {
  if (!dom.badgeSync) return;
  state.syncBadgeKey = key;
  state.syncBadgeParams = params;
  if (key) {
    dom.badgeSync.textContent = t(key, params);
    return;
  }
  if (!fallbackTime) return;
  const syncTime = state.lastSyncAt || new Date();
  dom.badgeSync.textContent = t('updatedAt', { time: formatTime(syncTime) });
};

const lockOrdering = (message = '') => {
  const nextMessage = message ? localizeArbitraryText(message) : getOrderingLockMessage();
  state.orderingLocked = true;
  if (state.pollHandle) {
    window.clearInterval(state.pollHandle);
    state.pollHandle = null;
  }
  setDrawerOpen(false);
  if (message) {
    setBoxMessage(dom.estado, nextMessage, 'error');
    setBoxMessage(dom.formMessage, nextMessage, 'error');
  } else {
    setTranslatedBoxMessage(dom.estado, 'orderingLocked', 'error');
    setTranslatedBoxMessage(dom.formMessage, 'orderingLocked', 'error');
  }
  updateSyncBadge('syncReset');
  renderCatalog();
  renderCart();
};

const renderAll = () => {
  applyStaticCopy();
  if (state.data) {
    syncCartWithCatalog();
  }
  applyTheme();
  renderHero();
  renderCatalog();
  renderCart();
};

const buildOrderSuccessMessage = (orderId, accountId) =>
  t('orderSent', {
    orderSuffix: orderId ? ` #${orderId}` : '',
    accountSuffix: accountId ? ` - ${t('accountLabel')} #${accountId}` : '',
  });

const loadMenu = async ({ silent = false } = {}) => {
  if (!state.token) {
    setTranslatedBoxMessage(dom.estado, 'tokenMissing', 'error');
    setSubmitDisabled(true);
    return;
  }

  state.loading = !silent;
  if (!silent) {
    setTranslatedBoxMessage(dom.estado, 'loadingMenu', 'info');
    updateSyncBadge('syncLoading');
    renderCart();
  }

  try {
    const response = await fetch(`/api/public/menu/${encodeURIComponent(state.token)}?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: state.clientId
        ? {
            'x-menu-publico-client': state.clientId,
          }
        : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error ? localizeArbitraryText(data.error) : t('loadFailed'));
    }

    const nextOrderSession = String(data?.acceso?.sesion_pedidos || '').trim();
    const nextRenderSignature = buildMenuRenderSignature(data);
    if (silent && state.orderSession && nextOrderSession && state.orderSession !== nextOrderSession) {
      state.data = data;
      state.renderSignature = nextRenderSignature;
      syncCartWithCatalog();
      state.orderSession = nextOrderSession;
      renderAll();
      lockOrdering();
      return;
    }

    if (silent && state.renderSignature && state.renderSignature === nextRenderSignature) {
      state.data = data;
      state.orderSession = nextOrderSession;
      state.lastSyncAt = new Date();
      updateSyncBadge('', true);
      return;
    }

    state.data = data;
    state.orderSession = nextOrderSession;
    state.renderSignature = nextRenderSignature;
    syncCartWithCatalog();
    state.lastSyncAt = new Date();
    renderAll();
    setBoxMessage(dom.estado, '');
    updateSyncBadge('', true);
  } catch (error) {
    if (!state.data) {
      if (dom.categorias) {
        dom.categorias.innerHTML = `<div class="menu-publico-empty-state">${escapeHtml(
          resolveMessageText(error.message, 'loadFailed')
        )}</div>`;
      }
      setSubmitDisabled(true);
    }
    setBoxMessage(dom.estado, resolveMessageText(error.message, 'loadFailed'), 'error');
    updateSyncBadge('syncOffline');
  } finally {
    state.loading = false;
    if (!silent) {
      renderCart();
    }
  }
};

const submitOrder = async (event) => {
  event.preventDefault();
  if (state.submitting) return;
  if (!state.cart.length) {
    setTranslatedBoxMessage(dom.formMessage, 'addOneProduct', 'error');
    return;
  }
  if (state.orderingLocked) {
    setTranslatedBoxMessage(dom.formMessage, 'orderingLocked', 'error');
    return;
  }
  if (state.cart.some((item) => !item.available)) {
    setTranslatedBoxMessage(dom.formMessage, 'cartHasUnavailable', 'error');
    return;
  }

  state.submitting = true;
  setSubmitDisabled(true);
  setTranslatedBoxMessage(dom.formMessage, 'sendingOrder', 'info');

  try {
    const response = await fetch(`/api/public/menu/${encodeURIComponent(state.token)}/pedidos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.clientId
          ? {
              'x-menu-publico-client': state.clientId,
            }
          : {}),
        ...(state.orderSession
          ? {
              'x-menu-publico-session': state.orderSession,
            }
          : {}),
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
      if (response.status === 409) {
        lockOrdering(data?.error || '');
      }
      throw new Error(data?.error ? localizeArbitraryText(data.error) : t('sendFailed'));
    }

    const pedidoId = Number(data?.pedido?.id) || null;
    const cuentaId = Number(data?.pedido?.cuenta_id) || null;
    state.cart = [];
    if (dom.nota) dom.nota.value = '';
    renderAll();
    setBoxMessage(dom.formMessage, buildOrderSuccessMessage(pedidoId, cuentaId), 'success');
    await loadMenu({ silent: true });
  } catch (error) {
    setBoxMessage(dom.formMessage, resolveMessageText(error.message, 'sendFailed'), 'error');
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
  if (isCompactViewport()) {
    setSearchOpen(false);
  }
};

const openCartView = () => {
  setLanguageMenuOpen(false);
  if (isCompactViewport()) {
    setDrawerOpen(!state.drawerOpen);
    return;
  }
  dom.orderCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  dom.orderCard?.focus?.({ preventScroll: true });
};

const handleLanguageMenuClick = (event) => {
  const option = event.target.closest('[data-language]');
  if (!option) return;
  setLanguage(option.dataset.language);
};

const handleDocumentClick = (event) => {
  if (!event.target.closest('.menu-publico-language-picker')) {
    setLanguageMenuOpen(false);
  }
};

const handleGlobalKeydown = (event) => {
  if (event.key !== 'Escape') return;
  setLanguageMenuOpen(false);
  if (isSearchOpen()) {
    setSearchOpen(false);
    dom.search?.blur();
  }
  if (state.drawerOpen) {
    setDrawerOpen(false);
  }
};

const init = async () => {
  state.token = getTokenFromLocation();
  state.clientId = getClientId();
  renderAll();
  updateSyncBadge(state.syncBadgeKey, state.syncBadgeParams, true);
  if (!state.token) {
    setTranslatedBoxMessage(dom.estado, 'tokenMissing', 'error');
    setSubmitDisabled(true);
    return;
  }

  syncDrawerViewport();

  dom.search?.addEventListener('input', (event) => {
    state.search = event.target.value || '';
    if (state.search && isCompactViewport()) {
      setSearchOpen(true);
    }
    renderCatalog();
  });
  dom.search?.addEventListener('focus', () => {
    if (isCompactViewport()) {
      setSearchOpen(true);
    }
  });
  dom.servicio?.addEventListener('change', () => {
    renderCart();
  });
  dom.categorias?.addEventListener('click', handleCatalogClick);
  dom.cart?.addEventListener('click', handleCartClick);
  dom.nav?.addEventListener('click', handleNavClick);
  dom.form?.addEventListener('submit', submitOrder);
  dom.back?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  dom.searchToggle?.addEventListener('click', () => {
    setLanguageMenuOpen(false);
    if (!isCompactViewport()) {
      dom.search?.focus();
      return;
    }
    const nextState = !isSearchOpen();
    setSearchOpen(nextState);
    if (nextState) {
      dom.search?.focus();
    } else {
      dom.search?.blur();
    }
  });
  dom.cartToggle?.addEventListener('click', openCartView);
  dom.languageToggle?.addEventListener('click', () => {
    setLanguageMenuOpen(!state.languageMenuOpen);
  });
  dom.languageMenu?.addEventListener('click', handleLanguageMenuClick);
  dom.overlay?.addEventListener('click', () => {
    setDrawerOpen(false);
  });
  dom.orderClose?.addEventListener('click', () => {
    setDrawerOpen(false);
  });
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleGlobalKeydown);
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
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleGlobalKeydown);
  compactViewportQuery?.removeEventListener?.('change', syncDrawerViewport);
});

init();
