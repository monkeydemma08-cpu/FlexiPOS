(() => {
  const form = document.getElementById('force-password-form');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('password-confirm');
  const errorContainer = document.getElementById('force-error');

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

  const getAuthHeaders = () => {
    try {
      return window.kanmAuth?.getAuthHeaders?.() || {};
    } catch (error) {
      return {};
    }
  };

  const updateStoredUser = (updates) => {
    const sessionApi = window.KANMSession;
    if (!sessionApi?.getUser || !sessionApi?.setUser) return;
    const current = sessionApi.getUser();
    if (!current) return;
    sessionApi.setUser({
      ...current,
      ...updates,
      forcePasswordChange: false,
      force_password_change: false,
    });
  };

  const redirectToRole = () => {
    const sessionApi = window.KANMSession;
    const current = sessionApi?.getUser?.();
    const rol = current?.rol;
    const destination = roleRoutes[rol];
    if (destination) {
      window.location.href = destination;
    } else {
      window.location.href = '/';
    }
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const password = passwordInput?.value.trim() ?? '';
    const confirm = confirmInput?.value.trim() ?? '';

    if (!password || password.length < 8) {
      showError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirm) {
      showError('Las contrasenas no coinciden.');
      return;
    }

    clearError();

    try {
      const response = await fetch('/api/usuarios/mi-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        showError(data?.error || 'No se pudo actualizar la contrasena.');
        return;
      }

      updateStoredUser({});
      redirectToRole();
    } catch (error) {
      console.error('Error actualizando contrasena:', error);
      showError('No se pudo actualizar la contrasena. Intenta nuevamente.');
    }
  });
})();
