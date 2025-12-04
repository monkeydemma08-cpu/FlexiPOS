const roleRoutes = {
  mesera: '/mesera.html',
  cocina: '/cocina.html',
  bar: '/bar.html',
  caja: '/caja.html',
  admin: '/admin.html',
};

const STORAGE_KEY = 'kanmUser';
const STORAGE_APP_KEY = 'sesionApp';
const DEFAULT_THEME = {
  colorPrimario: '#ff6699',
  colorSecundario: '#ff99bb',
  colorTexto: '#222222',
  colorHeader: '#ff6699',
  colorBotonPrimario: '#ff6699',
  colorBotonSecundario: '#ff99bb',
  colorBotonPeligro: '#ff4b4b',
};

const redirectTo = (path) => {
  if (typeof window !== 'undefined' && path) {
    window.location.href = path;
  }
};

const isSuperAdminUser = (user) => Boolean(user?.esSuperAdmin || user?.es_super_admin);

const migrateLegacySession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const readers = [
    () => {
      try {
        return sessionStorage.getItem(STORAGE_APP_KEY);
      } catch (error) {
        console.warn('No se pudo leer sessionStorage (sesionApp):', error);
        return null;
      }
    },
    () => {
      try {
        return sessionStorage.getItem(STORAGE_KEY);
      } catch (error) {
        console.warn('No se pudo leer sessionStorage (kanmUser):', error);
        return null;
      }
    },
    () => {
      try {
        const legacy = localStorage.getItem(STORAGE_APP_KEY);
        if (legacy) {
          sessionStorage.setItem(STORAGE_APP_KEY, legacy);
          localStorage.removeItem(STORAGE_APP_KEY);
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
          sessionStorage.setItem(STORAGE_APP_KEY, legacy);
          localStorage.removeItem(STORAGE_KEY);
          return legacy;
        }
      } catch (error) {
        console.warn('No se pudo migrar la sesión desde localStorage:', error);
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
  admin: 'Admin',
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
      };
      window.APP_SESION = normalizado;
      return normalizado;
    }
  } catch (error) {
    console.error('Error al parsear la sesión almacenada:', error);
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
    console.warn('No se pudo guardar la sesión en sessionStorage:', error);
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
    console.warn('No se pudo limpiar la sesión de sessionStorage:', error);
  }

  try {
    localStorage.removeItem(STORAGE_APP_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Ignorar errores al limpiar valores antiguos
  }

  window.APP_SESION = null;
};

// Devuelve los encabezados de autenticación a partir de la sesión guardada
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
    headerSubtitulo.textContent = 'Panel de administración';
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

  const allowBySuper = isSuperAdminUser(user);
  const allowByRole = requiredRoles.includes(user.rol);

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
  cargarTemaNegocio();
});

function logout() {
  const usuario = getStoredUser();
  const token = usuario?.token;

  if (token) {
    fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token,
      },
      body: JSON.stringify({ token }),
    }).catch(() => {
      /* silencio errores de red en logout */
    });
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
// Helpers de autenticación reutilizables en los módulos
window.kanmAuth = {
  getAuthHeaders,
  handleUnauthorized,
  isSuperAdmin: () => isSuperAdminUser(getStoredUser()),
};
