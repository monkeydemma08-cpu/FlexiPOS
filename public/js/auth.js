const roleRoutes = {
  mesera: '/mesera.html',
  cocina: '/cocina.html',
  bar: '/bar.html',
  caja: '/caja.html',
  vendedor: '/mostrador.html',
  admin: '/admin.html',
  supervisor: '/supervisor.html',
  empresa: '/empresa.html',
};

const STORAGE_KEY = 'kanmUser';
const STORAGE_APP_KEY = 'sesionApp';
const FORCE_PASSWORD_PATH = '/force-password.html';
const DEFAULT_THEME = {
  colorPrimario: '#36c1b3',
  colorSecundario: '#91a2f4',
  colorTexto: '#1f2a2a',
  colorHeader: '#36c1b3',
  colorBotonPrimario: '#36c1b3',
  colorBotonSecundario: '#91a2f4',
  colorBotonPeligro: '#ff4b4b',
};

const redirectTo = (path) => {
  if (typeof window !== 'undefined' && path) {
    window.location.href = path;
  }
};

const isSuperAdminUser = (user) => Boolean(user?.esSuperAdmin || user?.es_super_admin);
const hasForcePasswordChange = (user) => Boolean(user?.forcePasswordChange || user?.force_password_change);
const isImpersonatedUser = (user) => Boolean(user?.impersonated);

const syncSessionStorage = (value) => {
  if (!value) return;
  try {
    sessionStorage.setItem(STORAGE_APP_KEY, value);
    sessionStorage.setItem(STORAGE_KEY, value);
  } catch (error) {
    console.warn('No se pudo sincronizar sessionStorage:', error);
  }
  try {
    localStorage.setItem(STORAGE_APP_KEY, value);
    localStorage.setItem(STORAGE_KEY, value);
  } catch (error) {
    console.warn('No se pudo sincronizar localStorage:', error);
  }
};

const migrateLegacySession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const readers = [
    () => {
      try {
        const value = sessionStorage.getItem(STORAGE_APP_KEY);
        if (value) syncSessionStorage(value);
        return value;
      } catch (error) {
        console.warn('No se pudo leer sessionStorage (sesionApp):', error);
        return null;
      }
    },
    () => {
      try {
        const value = sessionStorage.getItem(STORAGE_KEY);
        if (value) syncSessionStorage(value);
        return value;
      } catch (error) {
        console.warn('No se pudo leer sessionStorage (kanmUser):', error);
        return null;
      }
    },
    () => {
      try {
        const legacy = localStorage.getItem(STORAGE_APP_KEY);
        if (legacy) {
          syncSessionStorage(legacy);
          return legacy;
        }
      } catch (error) {
        console.warn('No se pudo migrar sesionApp desde localStorage:', error);
      }
      return null;
    },
    () => {
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          syncSessionStorage(legacy);
          return legacy;
        }
      } catch (error) {
        console.warn('No se pudo migrar la sesion desde localStorage:', error);
      }
      return null;
    },
  ];

  for (const reader of readers) {
    const value = reader();
    if (value) return value;
  }

  return null;
};

const roleLabels = {
  mesera: 'Mesera',
  cocina: 'Cocina',
  bar: 'Bar',
  caja: 'Caja',
  vendedor: 'Mostrador',
  admin: 'Admin',
  supervisor: 'Supervisor',
  empresa: 'Empresa',
};

const formatUserLabel = (user) => {
  if (!user) return '';
  const rol = roleLabels[user.rol] || user.rol || 'Usuario';
  const nombre = user.nombre || user.usuario || '';
  return nombre ? `${rol} / ${nombre}` : rol;
};

const applyUserBadge = (user) => {
  const label = formatUserLabel(user);
  if (!label) return;
  const pills = document.querySelectorAll('.tag-rol');
  pills.forEach((pill) => {
    pill.textContent = label;
    pill.title = label;
  });
};

const applyImpersonationBanner = (user) => {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('kanm-impersonation-banner');
  if (!isImpersonatedUser(user)) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  if (existing) return;

  const banner = document.createElement('div');
  banner.id = 'kanm-impersonation-banner';
  banner.className = 'kanm-impersonation-banner';
  banner.textContent = 'Estas operando como ADMIN MASTER.';
  document.body.prepend(banner);
};

const getStoredUser = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = migrateLegacySession();

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      const normalizado = {
        ...parsed,
        usuarioId: parsed.usuarioId ?? parsed.id,
        negocioId: parsed.negocioId ?? parsed.negocio_id,
        esSuperAdmin: isSuperAdminUser(parsed),
        forcePasswordChange: hasForcePasswordChange(parsed),
        impersonated: isImpersonatedUser(parsed),
      };
      window.APP_SESION = normalizado;
      return normalizado;
    }
  } catch (error) {
    console.error('Error al parsear la sesion almacenada:', error);
  }

  return null;
};

const setStoredUser = (user) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (user) {
      window.APP_SESION = user;
      const serialized = JSON.stringify(user);
      sessionStorage.setItem(STORAGE_APP_KEY, serialized);
      sessionStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(STORAGE_APP_KEY, serialized);
      localStorage.setItem(STORAGE_KEY, serialized);
    } else {
      window.APP_SESION = null;
      sessionStorage.removeItem(STORAGE_APP_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_APP_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn('No se pudo guardar la sesion en sessionStorage:', error);
  }
};

const clearStoredUser = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(STORAGE_APP_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo limpiar la sesion de sessionStorage:', error);
  }

  try {
    localStorage.removeItem(STORAGE_APP_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Ignorar errores al limpiar valores antiguos
  }

  window.APP_SESION = null;
};

// Devuelve los encabezados de autenticacion a partir de la sesion guardada
const getAuthHeaders = () => {
  const usuario = getStoredUser();

  if (usuario?.token) {
    return {
      'x-session-token': usuario.token,
      Authorization: `Bearer ${usuario.token}`,
    };
  }

  return {};
};

const handleUnauthorized = () => {
  clearStoredUser();
  redirectTo('/');
};

const applyTemaNegocio = (tema) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const colorPrimario = tema?.colorPrimario || tema?.color_primario || DEFAULT_THEME.colorPrimario;
  const colorSecundario = tema?.colorSecundario || tema?.color_secundario || DEFAULT_THEME.colorSecundario;
  const colorTexto = tema?.colorTexto || tema?.color_texto || DEFAULT_THEME.colorTexto;
  const colorHeader =
    tema?.colorHeader || tema?.color_header || colorPrimario || colorSecundario || DEFAULT_THEME.colorHeader;
  const colorBotonPrimario =
    tema?.colorBotonPrimario || tema?.color_boton_primario || colorPrimario || DEFAULT_THEME.colorBotonPrimario;
  const colorBotonSecundario =
    tema?.colorBotonSecundario || tema?.color_boton_secundario || colorSecundario || DEFAULT_THEME.colorBotonSecundario;
  const colorBotonPeligro = tema?.colorBotonPeligro || tema?.color_boton_peligro || DEFAULT_THEME.colorBotonPeligro;
  const titulo = tema?.titulo || tema?.titulo_sistema || tema?.nombre || tema?.slug || '';
  const logoUrl = tema?.logoUrl || tema?.logo_url || '';
  const configModulos =
    tema?.configModulos ||
    tema?.config_modulos ||
    window.APP_MODULOS || {
      admin: true,
      mesera: true,
      cocina: true,
      bar: false,
      caja: true,
      mostrador: true,
      historialCocina: true,
    };

  root.style.setProperty('--color-primario', colorPrimario);
  root.style.setProperty('--color-secundario', colorSecundario);
  root.style.setProperty('--color-texto', colorTexto);
  root.style.setProperty('--color-header', colorHeader);
  root.style.setProperty('--color-boton-texto', colorTexto);
  root.style.setProperty('--color-boton-primario', colorBotonPrimario);
  root.style.setProperty('--color-boton-secundario', colorBotonSecundario);
  root.style.setProperty('--color-boton-peligro', colorBotonPeligro);
  root.style.setProperty('--kanm-pink', colorBotonPrimario);
  root.style.setProperty('--kanm-pink-dark', colorBotonPrimario);
  root.style.setProperty('--kanm-pink-light', colorBotonPrimario);

  if (titulo) {
    document.title = titulo;
  }

  const tituloEls = document.querySelectorAll('[data-negocio-titulo]');
  tituloEls.forEach((el) => {
    if (titulo) {
      el.textContent = titulo;
    }
  });

  const headerNombrePrincipal = document.getElementById('kanm-header-negocio-nombre-principal');
  if (headerNombrePrincipal) {
    headerNombrePrincipal.textContent = titulo || '';
  }
  const headerSubtitulo = document.getElementById('kanm-header-negocio-subtitulo');
  if (headerSubtitulo && !headerSubtitulo.textContent) {
    headerSubtitulo.textContent = 'Panel de administracion';
  }

  const logoEl = document.getElementById('kanm-header-logo');
  const logoFallback = document.getElementById('kanm-header-logo-fallback');

  let iniciales = '';
  if (titulo) {
    const partes = titulo.trim().split(/\s+/);
    if (partes.length === 1) {
      iniciales = partes[0].slice(0, 2).toUpperCase();
    } else {
      iniciales = (partes[0][0] + partes[1][0]).toUpperCase();
    }
  }

  const hasLogo = !!(logoUrl && logoUrl.trim() !== '');

  if (logoEl && logoFallback) {
    logoEl.alt = '';
    if (hasLogo) {
      logoEl.src = logoUrl;
      logoEl.style.display = 'block';
      logoFallback.style.display = 'none';
      logoFallback.textContent = '';

      logoEl.onerror = () => {
        logoEl.style.display = 'none';
        logoFallback.style.display = 'flex';
        logoFallback.textContent = '';
      };
    } else {
      logoEl.src = '';
      logoEl.style.display = 'none';
      logoFallback.style.display = 'flex';
      logoFallback.textContent = iniciales || '';
    }
  }

  window.APP_MODULOS =
    configModulos || {
      admin: true,
      mesera: true,
      cocina: true,
      bar: false,
      caja: true,
      mostrador: true,
      historialCocina: true,
    };

  window.APP_TEMA_NEGOCIO =
    tema ||
    {
      colorPrimario,
      colorSecundario,
      colorTexto,
      colorHeader,
      colorBotonPrimario,
      colorBotonSecundario,
      colorBotonPeligro,
      titulo,
      logoUrl,
      configModulos: window.APP_MODULOS,
    };
};

const resetTemaNegocio = () => {
  applyTemaNegocio(null);
};

const MONEY_INPUT_SELECTOR = 'input[data-money]';
const MONEY_DECIMALS = 2;
const MONEY_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: MONEY_DECIMALS,
  maximumFractionDigits: MONEY_DECIMALS,
});

const limpiarValorMoney = (valor, allowNegative = false) => {
  const raw = valor === null || valor === undefined ? '' : String(valor);
  const negativo = allowNegative && raw.trim().startsWith('-');
  const limpio = raw.replace(/[^0-9.]/g, '');
  const tienePunto = limpio.includes('.');
  const partes = limpio.split('.');
  let entero = (partes[0] || '').replace(/^0+(?=\d)/, '');
  if (!entero) entero = '0';
  const decimales = (partes.slice(1).join('') || '').slice(0, MONEY_DECIMALS);
  const enteroFormateado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let texto = enteroFormateado;
  if (tienePunto || decimales) {
    texto += `.${decimales}`;
  }
  if (negativo && texto !== '0') {
    texto = `-${texto}`;
  }
  const bruto = `${negativo ? '-' : ''}${entero}${decimales ? `.${decimales}` : tienePunto ? '.' : ''}`;
  return { texto, bruto };
};

const parseMoneyValue = (valor) => {
  if (valor && typeof valor === 'object' && 'dataset' in valor) {
    const raw = valor.dataset?.moneyRaw;
    if (raw !== undefined && raw !== null && raw !== '') {
      return parseMoneyValue(raw);
    }
    return parseMoneyValue(valor.value ?? '');
  }

  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (!texto.trim()) return 0;
  const limpio = texto.replace(/[^0-9.-]/g, '');
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : 0;
};

const buscarPosicionPorDigitos = (texto, digitos) => {
  if (digitos <= 0) return 0;
  let cuenta = 0;
  for (let i = 0; i < texto.length; i += 1) {
    if (texto[i] >= '0' && texto[i] <= '9') {
      cuenta += 1;
      if (cuenta >= digitos) return i + 1;
    }
  }
  return texto.length;
};

const formatearMoneyInput = (input, { padDecimals = false } = {}) => {
  if (!input) return;
  const allowNegative = input.dataset.moneyAllowNegative === 'true';
  const rawValue = input.value ?? '';
  if (!rawValue) {
    input.dataset.moneyRaw = '';
    return;
  }

  if (padDecimals) {
    const numero = parseMoneyValue(rawValue);
    if (!Number.isFinite(numero) || numero === 0) {
      input.value = '';
      input.dataset.moneyRaw = '';
      return;
    }
    const formateado = MONEY_FORMATTER.format(numero);
    input.value = formateado;
    input.dataset.moneyRaw = numero.toFixed(MONEY_DECIMALS);
    return;
  }

  const { texto, bruto } = limpiarValorMoney(rawValue, allowNegative);
  const selectionStart = input.selectionStart;
  const tieneFoco = document.activeElement === input;
  const digitosAntes =
    tieneFoco && selectionStart !== null
      ? rawValue.slice(0, selectionStart).replace(/[^0-9]/g, '').length
      : null;

  input.value = texto;
  input.dataset.moneyRaw = bruto;

  if (tieneFoco && selectionStart !== null) {
    const nuevaPos = buscarPosicionPorDigitos(texto, digitosAntes || 0);
    input.setSelectionRange(nuevaPos, nuevaPos);
  }
};

const setMoneyInputValue = (input, value) => {
  if (!input) return;
  const numero = parseMoneyValue(value);
  if (!Number.isFinite(numero) || numero === 0) {
    input.value = '';
    input.dataset.moneyRaw = '';
    return;
  }
  input.value = MONEY_FORMATTER.format(numero);
  input.dataset.moneyRaw = numero.toFixed(MONEY_DECIMALS);
};

const inicializarMoneyInputs = () => {
  document.querySelectorAll(MONEY_INPUT_SELECTOR).forEach((input) => {
    formatearMoneyInput(input, { padDecimals: true });
  });
};

if (!window.KANMMoney) {
  window.KANMMoney = {
    parse: parseMoneyValue,
    formatInput: formatearMoneyInput,
    setValue: setMoneyInputValue,
  };
}

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (!input.matches(MONEY_INPUT_SELECTOR)) return;
  formatearMoneyInput(input);
});

document.addEventListener(
  'blur',
  (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.matches(MONEY_INPUT_SELECTOR)) return;
    formatearMoneyInput(input, { padDecimals: true });
  },
  true
);

const cargarTemaNegocio = async () => {
  const user = getStoredUser();
  if (!user?.token) return;
  try {
    const response = await fetch('/api/negocios/mi-tema', {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      return;
    }

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    if (data?.ok && data?.tema) {
      applyTemaNegocio(data.tema);
    } else if (data?.colorPrimario || data?.colorSecundario) {
      applyTemaNegocio(data);
    }
  } catch (error) {
    console.warn('No se pudo cargar el tema del negocio:', error);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const requiredRaw = document.body?.dataset?.role || 'public';
  const requiredRoles = (requiredRaw || 'public')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const isPublic = requiredRoles.includes('public') || requiredRoles.length === 0;

  inicializarMoneyInputs();

  if (isPublic) {
    migrateLegacySession();
    return;
  }

  const user = getStoredUser();

  if (!user) {
    redirectTo('/');
    return;
  }

  if (!user.rol) {
    handleUnauthorized();
    return;
  }

  const forceChange = hasForcePasswordChange(user);
  const isForcePage = window.location.pathname === FORCE_PASSWORD_PATH;

  if (forceChange && !isForcePage) {
    redirectTo(FORCE_PASSWORD_PATH);
    return;
  }

  if (!forceChange && isForcePage) {
    const destination = roleRoutes[user.rol];
    if (destination) {
      redirectTo(destination);
    } else {
      handleUnauthorized();
    }
    return;
  }

  const allowBySuper = isSuperAdminUser(user);
  const allowByRole =
    requiredRoles.includes(user.rol) ||
    (user.rol === 'admin' && requiredRoles.includes('empresa')) ||
    (user.rol === 'empresa' && requiredRoles.includes('admin'));

  if (!allowByRole && !allowBySuper) {
    const destination = roleRoutes[user.rol];

    if (destination) {
      redirectTo(destination);
    } else {
      handleUnauthorized();
    }
    return;
  }

  applyUserBadge(user);
  applyImpersonationBanner(user);
  cargarTemaNegocio();
});

function logout() {
  const usuario = getStoredUser();
  const token = usuario?.token;
  const usuarioId = usuario?.usuarioId ?? usuario?.id;

  if (token) {
    const payload = JSON.stringify({ token, usuario_id: usuarioId });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/logout', blob);
    } else {
      fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        keepalive: true,
      }).catch(() => {
        /* silencio errores de red en logout */
      });
    }
  }

  clearStoredUser();
  resetTemaNegocio();
  redirectTo('/');
}

window.logout = logout;
window.APP_SESION = window.APP_SESION || getStoredUser();
window.KANMSession = {
  getUser: getStoredUser,
  setUser: setStoredUser,
  clearUser: clearStoredUser,
};
// Helpers de autenticacion reutilizables en los modulos
window.kanmAuth = {
  getAuthHeaders,
  handleUnauthorized,
  isSuperAdmin: () => isSuperAdminUser(getStoredUser()),
};
