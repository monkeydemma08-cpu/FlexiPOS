const registroForm = document.getElementById('registro-form');
const negocioInput = document.getElementById('registro-negocio');
const tipoInput = document.getElementById('registro-tipo');
const adminNombreInput = document.getElementById('registro-admin-nombre');
const adminUsuarioInput = document.getElementById('registro-admin-usuario');
const adminPasswordInput = document.getElementById('registro-admin-password');
const usuariosInput = document.getElementById('registro-usuarios');
const telefonoInput = document.getElementById('registro-telefono');
const emailInput = document.getElementById('registro-email');
const ciudadInput = document.getElementById('registro-ciudad');
const cocinaInput = document.getElementById('registro-cocina');
const deliveryInput = document.getElementById('registro-delivery');
const barInput = document.getElementById('registro-bar');
const mensajeRegistro = document.getElementById('registro-mensaje');
const recomendacionBox = document.getElementById('registro-recomendacion');
const noticeBox = document.getElementById('registro-notice');
const btnRecomendar = document.getElementById('registro-recomendar');
const btnEnviar = document.getElementById('registro-enviar');
const modulosChecks = Array.from(document.querySelectorAll('input[data-modulo]'));

const moduloLabels = {
  pos: 'POS',
  inventario: 'Inventario',
  caja: 'Caja',
  mesera: 'Mesera',
  kds: 'KDS',
  bar: 'Bar',
  delivery: 'Delivery',
  compras: 'Compras',
  clientes: 'Clientes',
  gastos: 'Gastos',
  reportes: 'Reportes',
};

const setMensajeRegistro = (texto = '', tipo = '') => {
  if (!mensajeRegistro) return;
  mensajeRegistro.textContent = texto;
  mensajeRegistro.classList.remove('error', 'success');
  if (tipo) {
    mensajeRegistro.classList.add(tipo);
  }
};

const getSelectedModules = () =>
  modulosChecks
    .filter((check) => check.checked)
    .map((check) => check.value)
    .filter(Boolean);

const getAnswers = () => {
  const tipo = (tipoInput?.value || '').trim().toLowerCase();
  const usuarios = (usuariosInput?.value || '').trim().toLowerCase();
  const usaCocina = (cocinaInput?.value || '').toLowerCase() === 'si';
  const usaDelivery = (deliveryInput?.value || '').toLowerCase() === 'si';
  const usaBar = (barInput?.value || '').toLowerCase() === 'si';
  return {
    tipo,
    usuarios,
    usaCocina,
    usaDelivery,
    usaBar,
  };
};

const recommendModules = ({ tipo, usuarios, usaCocina, usaDelivery, usaBar }) => {
  const modulos = new Set(['pos', 'caja', 'inventario', 'reportes', 'clientes', 'compras', 'gastos']);

  if (usaCocina || tipo.includes('restaurante') || tipo.includes('cafeteria') || tipo.includes('food')) {
    modulos.add('mesera');
    modulos.add('kds');
  }

  if (usaBar || tipo.includes('bar')) {
    modulos.add('bar');
    modulos.add('kds');
  }

  if (usaDelivery) {
    modulos.add('delivery');
  }

  if (usuarios === '4-10' || usuarios === '11+' || usuarios === '10+') {
    modulos.add('mesera');
  }

  return Array.from(modulos);
};

const applyRecommendation = (keys = []) => {
  const selected = new Set(keys);
  modulosChecks.forEach((check) => {
    check.checked = selected.has(check.value);
  });
};

const renderRecommendation = (keys = []) => {
  if (!recomendacionBox) return;
  if (!keys.length) {
    recomendacionBox.textContent = 'Sin recomendacion por el momento.';
    return;
  }
  const labels = keys.map((key) => moduloLabels[key] || key);
  recomendacionBox.innerHTML = `
    <strong>Recomendacion de modulos para este perfil:</strong>
    <ul>${labels.map((item) => `<li>${item}</li>`).join('')}</ul>
    <div style="margin-top:8px;">Facturacion electronica no disponible en esta etapa.</div>
  `;
};

const formatDateTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
    timeZone: 'America/Santo_Domingo',
  }).format(date);
};

btnRecomendar?.addEventListener('click', () => {
  const recomendados = recommendModules(getAnswers());
  applyRecommendation(recomendados);
  renderRecommendation(recomendados);
  setMensajeRegistro('Modulos recomendados aplicados al formulario.', 'success');
});

registroForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMensajeRegistro('', '');
  if (noticeBox) {
    noticeBox.classList.remove('visible');
    noticeBox.textContent = '';
  }

  const negocioNombre = negocioInput?.value?.trim() || '';
  const adminNombre = adminNombreInput?.value?.trim() || '';
  const adminUsuario = adminUsuarioInput?.value?.trim() || '';
  const adminPassword = adminPasswordInput?.value || '';

  if (!negocioNombre || !adminNombre || !adminUsuario || !adminPassword) {
    setMensajeRegistro('Completa negocio, admin, usuario y password.', 'error');
    return;
  }

  if (adminPassword.length < 6) {
    setMensajeRegistro('La password debe tener al menos 6 caracteres.', 'error');
    return;
  }

  const answers = getAnswers();
  const modulos = getSelectedModules();
  const recomendados = recommendModules(answers);
  if (!modulos.length) {
    applyRecommendation(recomendados);
    renderRecommendation(recomendados);
  }

  const payload = {
    negocio_nombre: negocioNombre,
    negocio_tipo: tipoInput?.value || '',
    admin_nombre: adminNombre,
    admin_usuario: adminUsuario,
    admin_password: adminPassword,
    telefono: telefonoInput?.value?.trim() || '',
    email: emailInput?.value?.trim() || '',
    ciudad: ciudadInput?.value?.trim() || '',
    cantidad_usuarios: usuariosInput?.value || '',
    usa_cocina: answers.usaCocina,
    usa_delivery: answers.usaDelivery,
    usa_bar: answers.usaBar,
    modulo_kds: modulos.includes('kds'),
    modulos_solicitados: modulos.length ? modulos : recomendados,
  };

  if (btnEnviar) btnEnviar.disabled = true;

  try {
    const response = await fetch('/api/public/registro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'No se pudo completar el registro.');
    }

    const solicitud = data?.solicitud || {};
    const limitePago = formatDateTime(solicitud?.estado_pago_limite);
    const codigo = solicitud?.codigo || '--';
    const usuarioListo = data?.acceso?.usuario || solicitud?.admin_usuario || adminUsuario;
    const loginUrl = data?.acceso?.login_url || '/login.html';
    const correoInternoEnviado = solicitud?.correo_enviado === true;
    const correoInternoError = solicitud?.correo_error || '';
    const modulosTexto =
      Array.isArray(solicitud?.modulos_solicitados_labels) && solicitud.modulos_solicitados_labels.length
        ? solicitud.modulos_solicitados_labels.join(', ')
        : '--';

    setMensajeRegistro('Registro completado correctamente.', 'success');
    renderRecommendation(solicitud?.modulos_recomendados || recomendados);

    if (noticeBox) {
      noticeBox.classList.add('visible');
      noticeBox.innerHTML = `
        <strong>Solicitud registrada: ${codigo}</strong><br />
        Tu usuario admin esta listo para usarse: <strong>${usuarioListo}</strong>.<br />
        Inicia sesion en <strong>${loginUrl}</strong> con la password que acabas de crear.<br />
        Tienes 24 horas para realizar el pago.<br />
        Fecha limite: <strong>${limitePago}</strong><br />
        Modulos solicitados: ${modulosTexto}<br />
        Envia la foto del comprobante por WhatsApp (+1 809-967-2501) o por correo a
        <strong>posiumtech@gmail.com</strong>.<br />
        Estado de notificacion interna: <strong>${correoInternoEnviado ? 'enviada' : 'pendiente'}</strong>${
          !correoInternoEnviado && correoInternoError ? `<br /><small>Detalle: ${correoInternoError}</small>` : ''
        }
      `;
    }

    if (adminPasswordInput) adminPasswordInput.value = '';
  } catch (error) {
    console.error('Error registrando solicitud:', error);
    setMensajeRegistro(error.message || 'No se pudo completar el registro.', 'error');
  } finally {
    if (btnEnviar) btnEnviar.disabled = false;
  }
});
