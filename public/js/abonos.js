/* =========================================================================
 * Módulo "Abonos" para caja y mostrador.
 *
 * Muestra los clientes que DEBEN (solo esos) y permite registrar un abono sin
 * entrar a admin. El abono entra al cuadre de caja del día vía el backend
 * (POST /api/caja/abonos con origen_caja). El efectivo suma al efectivo
 * esperado del cuadre de ESE turno.
 *
 * Es autocontenido: se engancha al sistema de pestañas existente (solo muestra/
 * oculta #panel-abonos) sin tocar la lógica del cuadre. Tras registrar un abono
 * dispara el evento 'posium:cuadre-refrescar' para que el cuadre se actualice.
 * ========================================================================= */
(function () {
  'use strict';

  const panel = document.getElementById('panel-abonos');
  if (!panel) return; // la página no incluye el módulo

  const ORIGEN = panel.dataset.origen || 'caja';
  const auth = window.kanmAuth;

  const buscador = document.getElementById('abonos-buscar');
  const listaEl = document.getElementById('abonos-lista');
  const mensajeEl = document.getElementById('abonos-mensaje');

  // ---- utilidades ----
  const getHeaders = () => {
    try {
      const h = auth?.getAuthHeaders?.();
      if (h && Object.keys(h).length) return h;
    } catch (_) {}
    return {};
  };

  const fetchAutorizado = async (url, options = {}) => {
    const headers = { ...getHeaders(), ...(options.headers || {}) };
    const resp = await fetch(url, { ...options, headers });
    if (resp.status === 401 || resp.status === 403) {
      auth?.handleUnauthorized?.();
      throw new Error('Sesión expirada. Inicia sesión nuevamente.');
    }
    return resp;
  };

  const formatCurrency = (valor) => {
    const n = Number(valor) || 0;
    return `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const setMensaje = (el, texto, tipo = 'info') => {
    if (!el) return;
    el.textContent = texto || '';
    el.dataset.type = texto ? tipo : '';
    el.classList.toggle('kanm-message-error', tipo === 'error');
    el.classList.toggle('kanm-message-success', tipo === 'success');
  };

  const parseMonto = (valor) => {
    const limpio = String(valor == null ? '' : valor).replace(/[^0-9.]/g, '');
    const n = Number(limpio);
    return Number.isFinite(n) ? n : 0;
  };

  // ---- modal (creado dinámicamente para no duplicar HTML entre páginas) ----
  let clienteActual = null;
  let cargando = false;

  const modal = document.createElement('div');
  modal.className = 'abono-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="abono-modal-box kanm-card" role="dialog" aria-modal="true" aria-labelledby="abono-modal-titulo">
      <button type="button" class="abono-modal-cerrar" data-abono-cerrar aria-label="Cerrar">&times;</button>
      <h3 id="abono-modal-titulo" class="abono-modal-titulo">Registrar abono</h3>
      <p class="abono-modal-sub">
        Cliente: <strong data-abono-cliente>—</strong><br />
        Saldo pendiente: <strong data-abono-saldo class="abono-saldo-valor">—</strong>
      </p>
      <div class="abono-modal-mensaje kanm-message" data-abono-mensaje></div>
      <div class="abono-field">
        <label for="abono-monto">Monto del abono</label>
        <input type="text" id="abono-monto" inputmode="decimal" placeholder="0.00" autocomplete="off" />
        <button type="button" class="abono-todo" data-abono-todo>Abonar todo el saldo</button>
      </div>
      <div class="abono-field">
        <label for="abono-metodo">Método de pago</label>
        <select id="abono-metodo">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
        </select>
      </div>
      <div class="abono-field">
        <label for="abono-notas">Notas (opcional)</label>
        <input type="text" id="abono-notas" placeholder="Referencia, comentario…" autocomplete="off" />
      </div>
      <div class="abono-modal-acciones">
        <button type="button" class="kanm-button ghost" data-abono-cancelar>Cancelar</button>
        <button type="button" class="kanm-button" data-abono-confirmar>Registrar abono</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalCliente = modal.querySelector('[data-abono-cliente]');
  const modalSaldo = modal.querySelector('[data-abono-saldo]');
  const modalMensaje = modal.querySelector('[data-abono-mensaje]');
  const inputMonto = modal.querySelector('#abono-monto');
  const selectMetodo = modal.querySelector('#abono-metodo');
  const inputNotas = modal.querySelector('#abono-notas');
  const btnConfirmar = modal.querySelector('[data-abono-confirmar]');

  const abrirModal = (cliente) => {
    clienteActual = cliente;
    if (modalCliente) modalCliente.textContent = cliente.nombre || 'Cliente';
    if (modalSaldo) modalSaldo.textContent = formatCurrency(cliente.saldo_pendiente);
    if (inputMonto) inputMonto.value = '';
    if (selectMetodo) selectMetodo.value = 'efectivo';
    if (inputNotas) inputNotas.value = '';
    setMensaje(modalMensaje, '');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-visible'));
    setTimeout(() => inputMonto?.focus(), 60);
  };

  const cerrarModal = () => {
    modal.classList.remove('is-visible');
    setTimeout(() => {
      modal.hidden = true;
    }, 160);
    clienteActual = null;
  };

  const confirmarAbono = async () => {
    if (!clienteActual || cargando) return;
    const monto = parseMonto(inputMonto?.value);
    const saldo = Number(clienteActual.saldo_pendiente) || 0;
    if (!monto || monto <= 0) {
      setMensaje(modalMensaje, 'Ingresa un monto válido.', 'error');
      return;
    }
    if (monto > saldo + 0.5) {
      setMensaje(modalMensaje, `El abono supera el saldo pendiente (${formatCurrency(saldo)}).`, 'error');
      return;
    }
    cargando = true;
    btnConfirmar?.classList.add('is-loading');
    if (btnConfirmar) btnConfirmar.disabled = true;
    try {
      const resp = await fetchAutorizado('/api/caja/abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteActual.cliente_id,
          monto,
          metodo_pago: selectMetodo?.value || 'efectivo',
          notas: inputNotas?.value?.trim() || null,
          origen_caja: ORIGEN,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar el abono.');
      cerrarModal();
      setMensaje(
        mensajeEl,
        `Abono de ${formatCurrency(data.aplicado)} registrado a ${data.cliente?.nombre || 'cliente'}. Ya entró al cuadre de hoy.`,
        'success'
      );
      await cargarDeudores(false);
      // Refresca el cuadre (lo escucha caja.js / mostrador-cuadre.js).
      window.dispatchEvent(new CustomEvent('posium:cuadre-refrescar'));
    } catch (error) {
      setMensaje(modalMensaje, error?.message || 'No se pudo registrar el abono.', 'error');
    } finally {
      cargando = false;
      btnConfirmar?.classList.remove('is-loading');
      if (btnConfirmar) btnConfirmar.disabled = false;
    }
  };

  modal.querySelector('[data-abono-confirmar]')?.addEventListener('click', confirmarAbono);
  modal.querySelector('[data-abono-cancelar]')?.addEventListener('click', cerrarModal);
  modal.querySelector('[data-abono-cerrar]')?.addEventListener('click', cerrarModal);
  modal.querySelector('[data-abono-todo]')?.addEventListener('click', () => {
    if (clienteActual && inputMonto) {
      inputMonto.value = (Number(clienteActual.saldo_pendiente) || 0).toFixed(2);
    }
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal();
  });
  inputMonto?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarAbono();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) cerrarModal();
  });

  // ---- lista de deudores ----
  let deudores = [];

  const renderDeudores = () => {
    if (!listaEl) return;
    listaEl.innerHTML = '';
    if (!deudores.length) {
      const vacio = document.createElement('div');
      vacio.className = 'abonos-empty';
      vacio.textContent = '🎉 No hay clientes con saldo pendiente.';
      listaEl.appendChild(vacio);
      return;
    }
    const frag = document.createDocumentFragment();
    deudores.forEach((d) => {
      const row = document.createElement('div');
      row.className = 'abono-row';
      row.innerHTML = `
        <div class="abono-row-info">
          <span class="abono-row-nombre">${escapeHtml(d.nombre || 'Cliente')}</span>
          ${d.telefono ? `<span class="abono-row-tel">${escapeHtml(d.telefono)}</span>` : ''}
        </div>
        <div class="abono-row-saldo">
          <span class="abono-row-label">Debe</span>
          <span class="abono-row-monto">${formatCurrency(d.saldo_pendiente)}</span>
        </div>
        <button type="button" class="kanm-button abono-row-btn">Abonar</button>
      `;
      row.querySelector('.abono-row-btn')?.addEventListener('click', () => abrirModal(d));
      frag.appendChild(row);
    });
    listaEl.appendChild(frag);
  };

  const cargarDeudores = async (mostrarCarga = true) => {
    if (!listaEl) return;
    const term = (buscador?.value || '').trim();
    if (mostrarCarga) {
      listaEl.innerHTML = '<div class="abonos-empty">Cargando…</div>';
    }
    try {
      const q = term ? `?q=${encodeURIComponent(term)}` : '';
      const resp = await fetchAutorizado(`/api/caja/deudores${q}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudieron cargar los deudores.');
      deudores = data.deudores || [];
      renderDeudores();
      if (deudores.length) setMensaje(mensajeEl, '');
    } catch (error) {
      setMensaje(mensajeEl, error?.message || 'Error al cargar los deudores.', 'error');
      listaEl.innerHTML = '';
    }
  };

  // ---- enganche a las pestañas ----
  // La lógica de pestañas existente (caja.js / mostrador-cuadre.js) ya oculta los
  // demás paneles y marca el botón activo cuando se hace clic en "Abonos" (porque
  // itera todos los .kanm-tab). Aquí solo mostramos/ocultamos #panel-abonos.
  const tabs = Array.from(document.querySelectorAll('.caja-tabs .kanm-tab'));
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const esAbonos = btn.dataset.tab === 'abonos';
      panel.classList.toggle('hidden', !esAbonos);
      if (esAbonos) cargarDeudores(true);
    });
  });

  let buscarTimer = null;
  buscador?.addEventListener('input', () => {
    clearTimeout(buscarTimer);
    buscarTimer = setTimeout(() => cargarDeudores(false), 300);
  });
})();
