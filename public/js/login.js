const form = document.getElementById('login-form');
const usuarioInput = document.getElementById('usuario');
const passwordInput = document.getElementById('password');
const errorContainer = document.getElementById('login-error');

const roleRoutes = {
  mesera: '/mesera.html',
  cocina: '/cocina.html',
  bar: '/bar.html',
  caja: '/caja.html',
  vendedor: '/mostrador.html',
  delivery: '/delivery.html',
  admin: '/admin.html',
  supervisor: '/supervisor.html',
  empresa: '/empresa.html',
};

const showError = (message) => {
  if (errorContainer) {
    errorContainer.textContent = message;
  }
};

const clearError = () => {
  if (errorContainer) {
    errorContainer.textContent = '';
  }
};

const setLoadingState = (isLoading) => {
  if (!form) return;
  if (isLoading) {
    form.classList.add('is-loading');
  } else {
    form.classList.remove('is-loading');
  }
};

const parseJsonSafe = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const resolveLoginErrorMessage = (status, payload, rawBody) => {
  const payloadError =
    (payload && typeof payload.error === 'string' && payload.error.trim()) ||
    (payload && typeof payload.message === 'string' && payload.message.trim()) ||
    '';
  if (payloadError) return payloadError;

  if (status === 429) {
    return 'Demasiados intentos de inicio de sesion. Espera unos segundos e intenta nuevamente.';
  }
  if (status === 401 || status === 403) {
    return 'No tienes permiso para iniciar sesion con este usuario.';
  }
  if (status >= 500) {
    return 'El servidor reporto un error al iniciar sesion.';
  }

  const raw = (rawBody || '').toString().trim();
  if (raw && raw.length <= 180) {
    return raw;
  }
  return 'No fue posible iniciar sesion.';
};

const isLoginPayloadOk = (response, payload) => {
  if (!response.ok) return false;
  if (!payload || typeof payload !== 'object') return false;
  if (payload.ok === true || payload.success === true) return true;
  const tieneSesion = Boolean(payload.token) && Boolean(payload.rol || payload.id || payload.usuario);
  return tieneSesion;
};

const handleSuccess = (payload) => {
  const sessionApi = window.KANMSession;
  const sesion = {
    usuario: payload.usuario,
    nombre: payload.nombre,
    rol: payload.rol,
    id: payload.id ?? payload.usuarioId,
    usuarioId: payload.id ?? payload.usuarioId,
    negocioId: payload.negocioId,
    empresaId: payload.empresaId ?? payload.empresa_id,
    esSuperAdmin: payload.esSuperAdmin === true,
    forcePasswordChange: payload.forcePasswordChange === true || payload.force_password_change === true,
    impersonated: payload.impersonated === true,
    token: payload.token,
  };

  if (sessionApi && typeof sessionApi.setUser === 'function') {
    sessionApi.setUser(sesion);
  } else {
    try {
      sessionStorage.setItem('kanmUser', JSON.stringify(sesion));
      localStorage.setItem('sesionApp', JSON.stringify(sesion));
    } catch (storageError) {
      console.warn('No se pudo guardar la sesion en storage:', storageError);
    }
  }

  window.APP_SESION = sesion;

  if (sesion.forcePasswordChange) {
    window.location.href = '/force-password.html';
    return;
  }

  const redirectUrl = roleRoutes[sesion.rol];
  if (redirectUrl) {
    window.location.href = redirectUrl;
  } else {
    showError('Rol sin ruta configurada.');
  }
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const usuario = usuarioInput?.value.trim() ?? '';
  const password = passwordInput?.value.trim() ?? '';

  if (!usuario || !password) {
    showError('Por favor ingresa tu usuario y contrasena.');
    return;
  }

  clearError();
  setLoadingState(true);

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ usuario, password }),
    });

    const rawBody = await response.text();
    const data = parseJsonSafe(rawBody);
    const payload = data && typeof data === 'object' ? data : {};

    if (!isLoginPayloadOk(response, payload)) {
      showError(resolveLoginErrorMessage(response.status, payload, rawBody));
      return;
    }

    handleSuccess({
      usuario,
      rol: payload.rol,
      id: payload.id,
      nombre: payload.nombre,
      token: payload.token,
      negocioId: payload.negocio_id ?? payload.negocioId,
      empresaId: payload.empresa_id ?? payload.empresaId,
      esSuperAdmin: payload.es_super_admin ?? payload.esSuperAdmin,
      forcePasswordChange: payload.force_password_change ?? payload.forcePasswordChange,
    });
  } catch (error) {
    console.error('Error en el proceso de login:', error);
    showError('Ocurrio un problema al conectar con el servidor. Intenta nuevamente.');
  } finally {
    setLoadingState(false);
  }
});
