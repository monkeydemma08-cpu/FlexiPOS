// Registro POSIUM — formulario con planes, opcionales, RNC y aceptacion legal.
const registroForm = document.getElementById('registro-form');
const negocioInput = document.getElementById('registro-negocio');
const tipoInput = document.getElementById('registro-tipo');
const rncInput = document.getElementById('registro-rnc');
const razonSocialInput = document.getElementById('registro-razon-social');
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
const facturaFiscalInput = document.getElementById('registro-factura-fiscal');
const menuQrCantidadInput = document.getElementById('registro-menu-qr-cantidad');
const aceptoTerminosInput = document.getElementById('acepto-terminos');
const aceptoPrivacidadInput = document.getElementById('acepto-privacidad');
const moduloFeCheckbox = document.getElementById('modulo-fe-checkbox');
const moduloFeHelp = document.getElementById('modulo-fe-help');
const moduloKdsCheckbox = document.getElementById('modulo-kds-checkbox');
const kdsMasterLabel = document.getElementById('kds-master-label');
const kdsMasterHelp = document.getElementById('kds-master-help');
const kdsChildrenBlock = document.getElementById('kds-children-block');
const moduloDeliveryCheckbox = document.getElementById('modulo-delivery-checkbox');
const moduloDeliveryLabel = document.getElementById('modulo-delivery-label');
const moduloDeliveryHelp = document.getElementById('modulo-delivery-help');
const kdsChildrenChecks = Array.from(document.querySelectorAll('input[data-kds-child]'));
const mensajeRegistro = document.getElementById('registro-mensaje');
const recomendacionBox = document.getElementById('registro-recomendacion');
const noticeBox = document.getElementById('registro-notice');
const btnRecomendar = document.getElementById('registro-recomendar');
const btnEnviar = document.getElementById('registro-enviar');
const modulosChecks = Array.from(document.querySelectorAll('input[data-modulo]'));
const planRadios = Array.from(document.querySelectorAll('input[name="plan"]'));
const planOptions = Array.from(document.querySelectorAll('.plan-option'));
const resumenPlanEl = document.getElementById('resumen-plan');
const resumenEcfLine = document.getElementById('resumen-ecf-line');
const resumenEcfEl = document.getElementById('resumen-ecf');
const resumenQrLine = document.getElementById('resumen-qr-line');
const resumenQrCountEl = document.getElementById('resumen-qr-count');
const resumenQrEl = document.getElementById('resumen-qr');
const resumenTotalMensualEl = document.getElementById('resumen-total-mensual');
const resumenActivacionEl = document.getElementById('resumen-activacion');
const resumenTotalInicialEl = document.getElementById('resumen-total-inicial');

const PLANES = {
  starter: {
    nombre: 'Plan Starter - POP',
    precio: 1200,
    fe_incluida: false,
    fe_extra: 700,
    kds_incluido: false,
    kds_disponible: false,
    delivery_incluido: false,
    delivery_extra: 150,
  },
  pro: {
    nombre: 'Plan Pro - Negocio',
    precio: 1500,
    fe_incluida: false,
    fe_extra: 700,
    kds_incluido: true,
    kds_disponible: true,
    delivery_incluido: true,
    delivery_extra: 0,
  },
  full: {
    nombre: 'Plan Full - Pro + KDS',
    precio: 2000,
    fe_incluida: true,
    fe_extra: 0,
    kds_incluido: true,
    kds_disponible: true,
    delivery_incluido: true,
    delivery_extra: 0,
  },
};

const ACTIVACION_INICIAL = 1800;
const QR_PRIMERO = 100;
const QR_TERCERO_EN_ADELANTE = 50;

const moduloLabels = {
  pos: 'POS',
  inventario: 'Inventario',
  caja: 'Caja',
  mesera: 'Mesera',
  cocina: 'Cocina',
  kds: 'KDS (sincronía)',
  bar: 'Bar',
  delivery: 'Delivery',
  compras: 'Compras',
  clientes: 'Clientes',
  gastos: 'Gastos',
  reportes: 'Reportes',
  facturacion_electronica: 'Facturación electrónica (e-CF)',
};

const formatCurrency = (n) => 'RD$' + Number(n || 0).toLocaleString('es-DO');

const setMensajeRegistro = (texto = '', tipo = '') => {
  if (!mensajeRegistro) return;
  mensajeRegistro.textContent = texto;
  mensajeRegistro.classList.remove('error', 'success');
  if (tipo) mensajeRegistro.classList.add(tipo);
};

const getPlanSeleccionado = () => {
  const radio = planRadios.find((r) => r.checked);
  return radio?.value || 'pro';
};

const getSelectedModules = () =>
  modulosChecks.filter((c) => c.checked && !c.disabled).map((c) => c.value).filter(Boolean);

const getAnswers = () => {
  const tipo = (tipoInput?.value || '').trim().toLowerCase();
  const usuarios = (usuariosInput?.value || '').trim().toLowerCase();
  const usaCocina = (cocinaInput?.value || '').toLowerCase() === 'si';
  const usaDelivery = (deliveryInput?.value || '').toLowerCase() === 'si';
  const usaBar = (barInput?.value || '').toLowerCase() === 'si';
  const requiereFE = (facturaFiscalInput?.value || '').toLowerCase() === 'si';
  return { tipo, usuarios, usaCocina, usaDelivery, usaBar, requiereFE };
};

const recommendModules = ({ tipo, usuarios, usaCocina, usaDelivery, usaBar, requiereFE }) => {
  const set = new Set(['inventario', 'compras', 'clientes', 'gastos', 'reportes']);
  if (usaCocina || tipo.includes('restaurante') || tipo.includes('cafeteria') || tipo.includes('food')) {
    set.add('kds');
    set.add('cocina');
    set.add('mesera');
    set.add('caja');
  }
  if (usaBar || tipo.includes('bar')) {
    set.add('kds');
    set.add('bar');
    set.add('caja');
  }
  if (usaDelivery) set.add('delivery');
  if (usuarios === '4-10' || usuarios === '11+') {
    set.add('kds');
    set.add('mesera');
  }
  if (requiereFE) set.add('facturacion_electronica');
  return Array.from(set);
};

const recommendPlan = ({ tipo, usaCocina, usaDelivery, usaBar, usuarios, requiereFE }) => {
  const muchosUsuarios = usuarios === '11+' || usuarios === '4-10';
  if (usaCocina || tipo.includes('restaurante')) return 'full';
  if (requiereFE || muchosUsuarios || tipo.includes('cafeteria') || tipo.includes('bar') || usaBar || usaDelivery) {
    return 'pro';
  }
  return 'starter';
};

const applyRecommendation = (modulosKeys = []) => {
  const planActual = getPlanSeleccionado();
  const planActualInfo = PLANES[planActual] || PLANES.pro;
  const set = new Set(modulosKeys);
  modulosChecks.forEach((c) => {
    // Si el modulo recomendado es KDS o dependiente y el plan no lo permite, no marcar
    if ((c.value === 'kds' || c.dataset.kdsChild === '') && !planActualInfo.kds_disponible) {
      c.checked = false;
      return;
    }
    c.checked = set.has(c.value);
  });
  refreshKdsChildrenVisibility();
};

const seleccionarPlanRadio = (planKey) => {
  const radio = planRadios.find((r) => r.value === planKey);
  if (radio) radio.checked = true;
  refreshPlanSelectedUi();
  applyPlanRulesToModules();
  recomputeResumen();
};

const refreshPlanSelectedUi = () => {
  planOptions.forEach((opt) => {
    const radio = opt.querySelector('input[type="radio"]');
    if (radio?.checked) opt.classList.add('selected');
    else opt.classList.remove('selected');
  });
};

// Aplica las reglas del plan a los modulos:
//   - Starter: KDS y dependientes deshabilitados, delivery con costo extra.
//   - Pro: KDS disponible (no incluido), delivery incluido.
//   - Full: KDS incluido (auto-marcado), delivery incluido, FE incluida.
const applyPlanRulesToModules = () => {
  const planKey = getPlanSeleccionado();
  const plan = PLANES[planKey] || PLANES.pro;

  // KDS master toggle
  if (moduloKdsCheckbox && kdsMasterLabel) {
    if (!plan.kds_disponible) {
      moduloKdsCheckbox.checked = false;
      moduloKdsCheckbox.disabled = true;
      kdsMasterLabel.classList.add('disabled');
      if (kdsMasterHelp) kdsMasterHelp.textContent = 'No disponible en este plan. Selecciona Plan Pro o Full.';
    } else if (plan.kds_incluido) {
      // KDS viene incluido en Pro y Full: checked + disabled (no se puede desmarcar).
      moduloKdsCheckbox.checked = true;
      moduloKdsCheckbox.disabled = true;
      kdsMasterLabel.classList.add('disabled');
      if (kdsMasterHelp) kdsMasterHelp.textContent = 'Incluido en este plan.';
    } else {
      moduloKdsCheckbox.disabled = false;
      kdsMasterLabel.classList.remove('disabled');
      if (kdsMasterHelp) kdsMasterHelp.textContent = 'Activable: incluye cocina, mesera, bar y caja sincronizados.';
    }
  }

  // Children: si KDS no esta activo, desmarcar y ocultar
  refreshKdsChildrenVisibility();

  // Delivery: activar/desactivar y mostrar costo
  if (moduloDeliveryCheckbox && moduloDeliveryHelp) {
    if (plan.delivery_incluido) {
      moduloDeliveryCheckbox.checked = true;
      moduloDeliveryCheckbox.disabled = true;
      moduloDeliveryLabel?.classList.add('disabled');
      moduloDeliveryHelp.textContent = '(Incluido en este plan)';
    } else {
      moduloDeliveryCheckbox.disabled = false;
      moduloDeliveryLabel?.classList.remove('disabled');
      moduloDeliveryHelp.textContent = `(Opcional: + RD$${plan.delivery_extra}/mes)`;
    }
  }

  // FE: ajustar texto de ayuda
  if (moduloFeCheckbox && moduloFeHelp) {
    if (plan.fe_incluida) {
      moduloFeCheckbox.checked = true;
      moduloFeHelp.textContent = '(Incluida en este plan)';
    } else {
      moduloFeHelp.textContent = `(Opcional: + RD$${plan.fe_extra}/mes)`;
    }
  }
};

const refreshKdsChildrenVisibility = () => {
  const kdsActivo = !!moduloKdsCheckbox?.checked && !moduloKdsCheckbox?.disabled;
  if (kdsChildrenBlock) kdsChildrenBlock.hidden = !kdsActivo;
  // Si KDS no esta activo, desmarcar todos los hijos
  if (!kdsActivo) {
    kdsChildrenChecks.forEach((c) => {
      c.checked = false;
    });
  }
};

const calcularCostoMenuQr = (cantidad) => {
  const n = Math.max(Number(cantidad) || 0, 0);
  if (n === 0) return 0;
  if (n <= 2) return n * QR_PRIMERO;
  return 2 * QR_PRIMERO + (n - 2) * QR_TERCERO_EN_ADELANTE;
};

const recomputeResumen = () => {
  const planKey = getPlanSeleccionado();
  const plan = PLANES[planKey] || PLANES.pro;

  const ecfMarcado = !!moduloFeCheckbox?.checked;
  const ecfActivo = plan.fe_incluida || ecfMarcado;
  const ecfExtra = plan.fe_incluida || !ecfMarcado ? 0 : plan.fe_extra;

  const deliveryMarcado = !!moduloDeliveryCheckbox?.checked;
  const deliveryActivo = plan.delivery_incluido || deliveryMarcado;
  const deliveryExtra = plan.delivery_incluido || !deliveryMarcado ? 0 : plan.delivery_extra;

  const qrCantidadInput = Math.max(Number(menuQrCantidadInput?.value) || 0, 0);
  const qrFacturable = planKey === 'full' && qrCantidadInput > 0 ? qrCantidadInput - 1 : qrCantidadInput;
  const qrCosto = calcularCostoMenuQr(qrFacturable);

  const totalMensual = plan.precio + ecfExtra + deliveryExtra;
  const totalActivacion = ACTIVACION_INICIAL + qrCosto;

  if (resumenPlanEl) resumenPlanEl.textContent = formatCurrency(plan.precio);

  if (resumenEcfLine) resumenEcfLine.hidden = !ecfActivo;
  if (resumenEcfEl) {
    resumenEcfEl.textContent = plan.fe_incluida
      ? 'Incluida en plan'
      : ecfMarcado
      ? `+ ${formatCurrency(ecfExtra)}`
      : 'No activa';
  }

  // Actualizar/mostrar linea de delivery: solo aparece si delivery activo
  let resumenDeliveryLine = document.getElementById('resumen-delivery-line');
  if (!resumenDeliveryLine && resumenEcfLine?.parentElement) {
    resumenDeliveryLine = document.createElement('div');
    resumenDeliveryLine.id = 'resumen-delivery-line';
    resumenDeliveryLine.className = 'resumen-line';
    resumenDeliveryLine.innerHTML = '<span>Delivery</span><span id="resumen-delivery">--</span>';
    resumenEcfLine.parentElement.insertBefore(resumenDeliveryLine, resumenEcfLine.nextSibling);
  }
  const resumenDeliveryEl = document.getElementById('resumen-delivery');
  if (resumenDeliveryLine && resumenDeliveryEl) {
    resumenDeliveryLine.hidden = !deliveryActivo;
    resumenDeliveryEl.textContent = plan.delivery_incluido
      ? 'Incluido en plan'
      : deliveryMarcado
      ? `+ ${formatCurrency(deliveryExtra)}`
      : 'No activo';
  }

  if (resumenQrLine) resumenQrLine.hidden = qrCantidadInput === 0;
  if (resumenQrCountEl) resumenQrCountEl.textContent = qrCantidadInput;
  if (resumenQrEl) {
    resumenQrEl.textContent =
      planKey === 'full' && qrCantidadInput > 0 && qrCosto === 0
        ? '1 incluido (gratis)'
        : formatCurrency(qrCosto);
  }
  if (resumenTotalMensualEl) resumenTotalMensualEl.textContent = formatCurrency(totalMensual);
  if (resumenActivacionEl) resumenActivacionEl.textContent = formatCurrency(ACTIVACION_INICIAL);
  if (resumenTotalInicialEl) resumenTotalInicialEl.textContent = formatCurrency(totalMensual + totalActivacion);
};

const renderRecommendation = (modulosKeys = [], planRecomendado = '') => {
  if (!recomendacionBox) return;
  if (!modulosKeys.length) {
    recomendacionBox.textContent = 'Sin recomendación por el momento.';
    return;
  }
  const labels = modulosKeys.map((k) => moduloLabels[k] || k);
  const planTexto = planRecomendado && PLANES[planRecomendado] ? PLANES[planRecomendado].nombre : '';
  recomendacionBox.innerHTML = `
    <strong>Plan recomendado:</strong> ${planTexto || '--'}<br />
    <strong>Módulos sugeridos (además de admin + mostrador que vienen por defecto):</strong>
    <ul>${labels.map((item) => `<li>${item}</li>`).join('')}</ul>
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

// === Listeners ===
planRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    refreshPlanSelectedUi();
    applyPlanRulesToModules();
    recomputeResumen();
  });
});

moduloKdsCheckbox?.addEventListener('change', () => {
  refreshKdsChildrenVisibility();
  // Si activan KDS, marcar caja por defecto (la mayoria los necesita)
  if (moduloKdsCheckbox.checked) {
    const cajaCheck = kdsChildrenChecks.find((c) => c.value === 'caja');
    if (cajaCheck) cajaCheck.checked = true;
  }
  recomputeResumen();
});

[facturaFiscalInput, menuQrCantidadInput, moduloFeCheckbox, moduloDeliveryCheckbox].forEach((el) => {
  el?.addEventListener('change', () => {
    if (el === facturaFiscalInput && facturaFiscalInput.value === 'si' && moduloFeCheckbox && !moduloFeCheckbox.disabled) {
      moduloFeCheckbox.checked = true;
    }
    recomputeResumen();
  });
  el?.addEventListener('input', recomputeResumen);
});

btnRecomendar?.addEventListener('click', () => {
  const ans = getAnswers();
  const planRecomendado = recommendPlan(ans);
  // Cambiar a plan recomendado primero
  seleccionarPlanRadio(planRecomendado);
  // Luego aplicar modulos (algunos pueden quedar deshabilitados por el plan)
  const modulosRec = recommendModules(ans);
  applyRecommendation(modulosRec);
  // Si activamos KDS, mostrar children
  refreshKdsChildrenVisibility();
  renderRecommendation(modulosRec, planRecomendado);
  recomputeResumen();
  setMensajeRegistro('Plan y módulos recomendados aplicados.', 'success');
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
  const correo = emailInput?.value?.trim() || '';
  const telefono = telefonoInput?.value?.trim() || '';

  if (!negocioNombre || !tipoInput?.value || !adminNombre || !adminUsuario || !adminPassword || !telefono || !correo) {
    setMensajeRegistro('Completa los campos obligatorios marcados con *.', 'error');
    return;
  }
  if (adminPassword.length < 6) {
    setMensajeRegistro('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    setMensajeRegistro('Ingresa un correo válido.', 'error');
    return;
  }
  if (!aceptoTerminosInput?.checked || !aceptoPrivacidadInput?.checked) {
    setMensajeRegistro('Debes aceptar los Términos y la Política de Privacidad para continuar.', 'error');
    return;
  }

  const planSeleccionado = getPlanSeleccionado();
  const planInfo = PLANES[planSeleccionado] || PLANES.pro;
  const answers = getAnswers();
  const modulosUI = getSelectedModules();
  const modulosRec = recommendModules(answers);
  const modulosFinal = modulosUI.length ? modulosUI : modulosRec;

  // Validacion: starter no permite KDS
  if (!planInfo.kds_disponible && (modulosFinal.includes('kds') || modulosFinal.some((m) => ['cocina', 'mesera', 'bar'].includes(m)))) {
    setMensajeRegistro('El Plan Starter no incluye KDS. Selecciona Plan Pro o Plan Full para activar la sincronía de cocina, mesera, bar y caja.', 'error');
    return;
  }

  // Garantizar que si plan es full, FE este marcada
  if (planSeleccionado === 'full' && !modulosFinal.includes('facturacion_electronica')) {
    modulosFinal.push('facturacion_electronica');
  }
  // Garantizar que si plan es full, KDS este marcado
  if (planInfo.kds_incluido && !modulosFinal.includes('kds')) {
    modulosFinal.push('kds');
  }
  // Garantizar que si plan incluye delivery, este marcado
  if (planInfo.delivery_incluido && !modulosFinal.includes('delivery')) {
    modulosFinal.push('delivery');
  }

  const ecfSolicitado = modulosFinal.includes('facturacion_electronica') || planSeleccionado === 'full';
  const deliverySolicitado = modulosFinal.includes('delivery');
  const menuQrCantidad = Math.max(Number(menuQrCantidadInput?.value) || 0, 0);

  const payload = {
    negocio_nombre: negocioNombre,
    negocio_tipo: tipoInput?.value || '',
    rnc: rncInput?.value?.trim() || '',
    razon_social: razonSocialInput?.value?.trim() || '',
    admin_nombre: adminNombre,
    admin_usuario: adminUsuario,
    admin_password: adminPassword,
    telefono,
    email: correo,
    ciudad: ciudadInput?.value?.trim() || '',
    cantidad_usuarios: usuariosInput?.value || '',
    usa_cocina: answers.usaCocina,
    usa_delivery: answers.usaDelivery,
    usa_bar: answers.usaBar,
    requiere_facturacion_electronica: answers.requiereFE,
    plan: planSeleccionado,
    ecf_solicitado: ecfSolicitado,
    delivery_solicitado: deliverySolicitado,
    menu_qr_cantidad: menuQrCantidad,
    menu_qr_solicitado: menuQrCantidad > 0,
    modulo_kds: modulosFinal.includes('kds'),
    modulos_solicitados: modulosFinal,
    terminos_aceptados: true,
    privacidad_aceptada: true,
  };

  if (btnEnviar) btnEnviar.disabled = true;

  try {
    const response = await fetch('/api/public/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'No se pudo completar el registro.');
    }

    const solicitud = data?.solicitud || {};
    const resumen = data?.resumen || solicitud?.resumen_costos || {};
    const limitePago = formatDateTime(solicitud?.estado_pago_limite);
    const codigo = solicitud?.codigo || '--';
    const usuarioListo = data?.acceso?.usuario || solicitud?.admin_usuario || adminUsuario;
    const loginUrl = data?.acceso?.login_url || '/login.html';
    const correoInternoEnviado = solicitud?.correo_enviado === true;
    const correoClienteEnviado = solicitud?.correo_cliente_enviado === true;
    const planNombre = resumen?.plan_nombre || PLANES[planSeleccionado]?.nombre || planSeleccionado;
    const totalMensual = resumen?.total_mensual ?? PLANES[planSeleccionado]?.precio ?? 0;
    const totalActivacion = resumen?.total_activacion_unica ?? ACTIVACION_INICIAL;

    setMensajeRegistro('Registro completado correctamente.', 'success');
    renderRecommendation(solicitud?.modulos_recomendados || modulosRec, planSeleccionado);

    if (noticeBox) {
      noticeBox.classList.add('visible');
      noticeBox.innerHTML = `
        <strong>Solicitud registrada: ${codigo}</strong><br />
        Plan: <strong>${planNombre}</strong><br />
        Tu usuario admin está listo: <strong>${usuarioListo}</strong>.<br />
        Inicia sesión en <a href="${loginUrl}">${loginUrl}</a> con la contraseña que creaste.<br />
        Total mensual: <strong>${formatCurrency(totalMensual)}</strong><br />
        Pago de activación (incluye ${formatCurrency(ACTIVACION_INICIAL)} + Menús QR): <strong>${formatCurrency(totalActivacion)}</strong><br />
        Tienes 24 horas para realizar el pago. Fecha límite: <strong>${limitePago}</strong><br />
        Envía el comprobante por WhatsApp (+1 809-967-2501) o por correo a <strong>posiumtech@gmail.com</strong>.<br />
        ${correoClienteEnviado ? 'Hemos enviado un correo de confirmación a <strong>' + correo + '</strong>.<br />' : ''}
        Notificación al super admin: <strong>${correoInternoEnviado ? 'enviada' : 'pendiente'}</strong>
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

// Inicializar UI
refreshPlanSelectedUi();
applyPlanRulesToModules();
recomputeResumen();
