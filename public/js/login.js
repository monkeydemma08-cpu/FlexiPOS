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
  admin: '/admin.html',
  supervisor: '/admin.html',
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

    let data;

    try {
      data = await response.json();
    } catch (parseError) {
      showError('Respuesta inesperada del servidor.');
      return;
    }

    if (!response.ok || !data.ok) {
      showError(data?.error || 'No fue posible iniciar sesion.');
      return;
    }

    handleSuccess({
      usuario,
      rol: data.rol,
      id: data.id,
      nombre: data.nombre,
      token: data.token,
      negocioId: data.negocio_id ?? data.negocioId,
      empresaId: data.empresa_id ?? data.empresaId,
      esSuperAdmin: data.es_super_admin ?? data.esSuperAdmin,
      forcePasswordChange: data.force_password_change ?? data.forcePasswordChange,
    });
  } catch (error) {
    console.error('Error en el proceso de login:', error);
    showError('Ocurrio un problema al conectar con el servidor. Intenta nuevamente.');
  } finally {
    setLoadingState(false);
  }
});
