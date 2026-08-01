/* =========================================================================
 * Turno de caja ("Iniciar operaciones") — caja y mostrador.
 *
 * Muestra un banner con el estado del turno (abierto/cerrado). Si está cerrado,
 * ofrece "Iniciar operaciones" (pide el fondo inicial). El turno lo cierra el
 * cuadre de caja. Es autocontenido: se engancha por el contenedor
 * #turno-caja-banner (con data-origen="caja"|"mostrador"). Al abrir, pre-carga
 * el fondo en el formulario de cuadre (#cuadre-fondo-inicial).
 * ========================================================================= */
(function () {
  'use strict';

  const banner = document.getElementById('turno-caja-banner');
  if (!banner) return;

  const ORIGEN = banner.dataset.origen || 'caja';
  const auth = window.kanmAuth;

  const getHeaders = () => {
    try {
      const h = auth?.getAuthHeaders?.();
      if (h && Object.keys(h).length) return h;
    } catch (_) {}
    return {};
  };
  const fetchAut = async (url, opts = {}) => {
    const resp = await fetch(url, { ...opts, headers: { ...getHeaders(), ...(opts.headers || {}) } });
    if (resp.status === 401 || resp.status === 403) {
      auth?.handleUnauthorized?.();
      throw new Error('Sesión expirada.');
    }
    return resp;
  };
  const fmt = (v) => `RD$${(Number(v) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHora = (iso) => {
    try {
      return new Date(iso).toLocaleString('es-DO', {
        timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    } catch (_) { return ''; }
  };
  const parseMonto = (valor) => {
    const n = Number(String(valor == null ? '' : valor).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  // ---- estilos (autocontenidos) ----
  const style = document.createElement('style');
  style.textContent = `
    .turno-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;
      padding:14px 18px;border-radius:16px;margin-bottom:16px;border:1px solid var(--kanm-gray-200,#e6ebf4);background:#fff;}
    .turno-banner .turno-info{display:flex;align-items:center;gap:12px;}
    .turno-banner .turno-dot{width:12px;height:12px;border-radius:999px;flex:none;}
    .turno-banner strong{display:block;color:var(--color-texto,#24344a);}
    .turno-banner .turno-sub{font-size:.82rem;color:var(--kanm-gray-600,#5d6779);}
    .turno-banner .turno-hint{font-size:.82rem;color:var(--kanm-gray-600,#5d6779);}
    .turno-abierto{background:color-mix(in srgb,var(--kanm-success,#3cb179) 8%,#fff);border-color:color-mix(in srgb,var(--kanm-success,#3cb179) 30%,transparent);}
    .turno-abierto .turno-dot{background:var(--kanm-success,#3cb179);box-shadow:0 0 0 4px color-mix(in srgb,var(--kanm-success,#3cb179) 20%,transparent);}
    .turno-cerrado{background:color-mix(in srgb,var(--kanm-warning,#f7b733) 10%,#fff);border-color:color-mix(in srgb,var(--kanm-warning,#f7b733) 35%,transparent);}
    .turno-cerrado .turno-dot{background:var(--kanm-warning,#f7b733);}
    .turno-btn{flex:none;padding:9px 18px !important;font-size:.9rem !important;}
    .turno-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px;
      background:color-mix(in srgb,#1f2d45 55%,transparent);opacity:0;transition:opacity .16s ease;}
    .turno-modal.is-visible{opacity:1;} .turno-modal[hidden]{display:none;}
    .turno-modal-box{width:100%;max-width:400px;background:#fff;border-radius:20px;padding:24px;position:relative;
      box-shadow:0 16px 40px color-mix(in srgb,var(--color-primario,#255bc7) 15%,transparent);}
    .turno-modal-box h3{margin:0 0 4px;font-size:1.15rem;color:var(--color-texto,#24344a);}
    .turno-modal-box p{margin:0 0 16px;font-size:.86rem;color:var(--kanm-gray-600,#5d6779);}
    .turno-modal-box label{display:block;font-size:.82rem;font-weight:600;margin-bottom:6px;color:var(--color-texto,#24344a);}
    .turno-modal-box input{width:100%;padding:11px 13px;border:1px solid var(--kanm-gray-200,#e6ebf4);border-radius:12px;font:inherit;}
    .turno-modal-box input:focus{outline:none;border-color:var(--color-primario,#255bc7);box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primario,#255bc7) 18%,transparent);}
    .turno-modal-acciones{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}
    .turno-modal-mensaje{font-size:.82rem;color:var(--kanm-error,#d93050);min-height:0;}
    .turno-modal-mensaje:empty{display:none;}
  `;
  document.head.appendChild(style);

  // ---- modal de apertura ----
  const modal = document.createElement('div');
  modal.className = 'turno-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="turno-modal-box" role="dialog" aria-modal="true">
      <h3>Iniciar operaciones</h3>
      <p>Abre el turno de esta caja e ingresa el fondo con el que arranca.</p>
      <label for="turno-fondo">Fondo inicial de caja</label>
      <input type="text" id="turno-fondo" inputmode="decimal" placeholder="0.00" autocomplete="off" />
      <div class="turno-modal-mensaje" data-turno-msg></div>
      <div class="turno-modal-acciones">
        <button type="button" class="kanm-button ghost" data-turno-cancelar>Cancelar</button>
        <button type="button" class="kanm-button" data-turno-confirmar>Abrir turno</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const inputFondo = modal.querySelector('#turno-fondo');
  const msgEl = modal.querySelector('[data-turno-msg]');
  const btnConfirmar = modal.querySelector('[data-turno-confirmar]');
  let cargando = false;

  const abrirModal = () => {
    inputFondo.value = '';
    msgEl.textContent = '';
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-visible'));
    setTimeout(() => inputFondo.focus(), 60);
  };
  const cerrarModal = () => {
    modal.classList.remove('is-visible');
    setTimeout(() => { modal.hidden = true; }, 160);
  };

  const confirmarAbrir = async () => {
    if (cargando) return;
    const fondo = parseMonto(inputFondo.value);
    cargando = true;
    btnConfirmar.disabled = true;
    btnConfirmar.classList.add('is-loading');
    try {
      const resp = await fetchAut('/api/caja/turnos/abrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origen_caja: ORIGEN, fondo_inicial: fondo }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo iniciar operaciones.');
      cerrarModal();
      await cargarEstado();
    } catch (error) {
      msgEl.textContent = error?.message || 'No se pudo iniciar operaciones.';
    } finally {
      cargando = false;
      btnConfirmar.disabled = false;
      btnConfirmar.classList.remove('is-loading');
    }
  };

  modal.querySelector('[data-turno-confirmar]')?.addEventListener('click', confirmarAbrir);
  modal.querySelector('[data-turno-cancelar]')?.addEventListener('click', cerrarModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); });
  inputFondo?.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarAbrir(); });

  // ---- banner ----
  let estado = { abierto: false, turno: null };

  const precargarFondoCuadre = (fondo) => {
    const fondoInput = document.getElementById('cuadre-fondo-inicial');
    if (fondoInput && !String(fondoInput.value || '').trim()) {
      fondoInput.value = Number(fondo) || 0;
      fondoInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const render = () => {
    if (estado.abierto && estado.turno) {
      const t = estado.turno;
      banner.className = 'turno-banner turno-abierto';
      banner.innerHTML = `
        <div class="turno-info">
          <span class="turno-dot"></span>
          <div>
            <strong>Caja abierta</strong>
            <span class="turno-sub">Desde ${fmtHora(t.fecha_apertura)} · Fondo ${fmt(t.fondo_inicial)}${t.auto_abierto ? ' · (apertura automática)' : ''}</span>
          </div>
        </div>
        <span class="turno-hint">Registra el cuadre de caja para cerrar el turno.</span>`;
      precargarFondoCuadre(t.fondo_inicial);
    } else {
      banner.className = 'turno-banner turno-cerrado';
      banner.innerHTML = `
        <div class="turno-info">
          <span class="turno-dot"></span>
          <div>
            <strong>Caja cerrada</strong>
            <span class="turno-sub">Inicia operaciones para abrir el turno del día.</span>
          </div>
        </div>
        <button type="button" class="kanm-button turno-btn" data-turno-abrir>Iniciar operaciones</button>`;
      banner.querySelector('[data-turno-abrir]')?.addEventListener('click', abrirModal);
    }
  };

  async function cargarEstado() {
    try {
      const resp = await fetchAut(`/api/caja/turnos/estado?origen=${encodeURIComponent(ORIGEN)}`);
      const data = await resp.json().catch(() => ({}));
      if (data.ok) {
        estado = { abierto: !!data.abierto, turno: data.turno || null };
        render();
      }
    } catch (_) {}
  }

  render();
  cargarEstado();

  // Refrescar al entrar a la pestaña de cuadre y tras registrar un cuadre.
  document.querySelectorAll('.caja-tabs .kanm-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'cuadre') cargarEstado();
    });
  });
  window.addEventListener('posium:turno-cambiado', cargarEstado);
})();
