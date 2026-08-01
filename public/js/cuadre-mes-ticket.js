// =====================================================================
// Cuadre del mes — ticket térmico 88mm (solo lo esencial).
// Usa: GET /api/caja/cierres?desde&hasta&origen
// Query params: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&origen=todos|caja|mostrador
//               ?auto_print=1 (default: imprime al cargar)
// Muestra por cierre: Fecha operación, Total ventas, Efectivo esperado,
// Efectivo declarado (+ diferencia), y los totales del mes.
// =====================================================================
(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search || '');
  const desde = (params.get('desde') || '').trim();
  const hasta = (params.get('hasta') || desde).trim();
  const origen = (params.get('origen') || 'todos').toString().trim().toLowerCase();
  const autoPrint = params.get('auto_print') !== '0';

  const ticketEl = document.getElementById('ticket-mes');
  const btnImprimir = document.getElementById('btn-imprimir');
  const btnCerrar = document.getElementById('btn-cerrar');

  const money = (valor) => {
    const num = Number(valor) || 0;
    try {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency', currency: 'DOP', minimumFractionDigits: 2,
      }).format(num);
    } catch (_) {
      return `DOP ${num.toFixed(2)}`;
    }
  };

  // fecha_operacion viene como 'YYYY-MM-DD' -> DD/MM/YYYY (sin desfase de zona).
  const fechaDMY = (valor) => {
    const m = String(valor || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return String(valor || '--');
  };

  const escapar = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const getHeaders = () => {
    try {
      const h = window.kanmAuth?.getAuthHeaders?.();
      if (h && Object.keys(h).length) return h;
    } catch (_) {}
    return {};
  };

  const rango = () => {
    if (desde && hasta && desde !== hasta) return `${fechaDMY(desde)} — ${fechaDMY(hasta)}`;
    return fechaDMY(desde);
  };

  const render = (cierres) => {
    if (!Array.isArray(cierres) || !cierres.length) {
      ticketEl.innerHTML = `
        <h1>CUADRE DEL MES</h1>
        <p class="sub">${escapar(rango())}</p>
        <hr class="sep" />
        <p class="vacio">No hay cuadres registrados en este período.</p>`;
      return;
    }

    // Orden ascendente por fecha de operación para leer el mes de inicio a fin.
    const lista = [...cierres].sort((a, b) =>
      String(a.fecha_operacion || '').localeCompare(String(b.fecha_operacion || ''))
    );

    let totVentas = 0;
    let totEsperado = 0;
    let totDeclarado = 0;

    const bloques = lista
      .map((c) => {
        const ventas = Number(c.total_ventas) || 0;
        const esperado = Number(c.total_sistema) || 0; // efectivo esperado
        const declarado = Number(c.total_declarado) || 0;
        const dif = Number((declarado - esperado).toFixed(2));
        totVentas += ventas;
        totEsperado += esperado;
        totDeclarado += declarado;
        const origenTxt = String(c.origen_caja || 'caja').toUpperCase();
        return `
          <div class="cierre">
            <div class="fecha">${escapar(fechaDMY(c.fecha_operacion))} <span class="origen">· ${escapar(origenTxt)}</span></div>
            <div class="linea"><span class="lbl">Total ventas</span><span class="val">${money(ventas)}</span></div>
            <div class="linea"><span class="lbl">Efectivo esperado</span><span class="val">${money(esperado)}</span></div>
            <div class="linea"><span class="lbl">Efectivo declarado</span><span class="val">${money(declarado)}</span></div>
            <div class="linea ${dif === 0 ? 'dif-ok' : 'dif-mal'}"><span class="lbl">Diferencia</span><span class="val">${money(dif)}</span></div>
          </div>`;
      })
      .join('<hr class="sep" />');

    const difTotal = Number((totDeclarado - totEsperado).toFixed(2));

    ticketEl.innerHTML = `
      <h1>CUADRE DEL MES</h1>
      <p class="sub">${escapar(rango())}</p>
      <p class="sub">${lista.length} cuadre(s)</p>
      <hr class="sep-solid" />
      ${bloques}
      <hr class="sep-solid" />
      <div class="totales">
        <div class="linea grande"><span class="lbl">TOTAL VENTAS</span><span class="val">${money(totVentas)}</span></div>
        <div class="linea"><span class="lbl">Efectivo esperado</span><span class="val">${money(totEsperado)}</span></div>
        <div class="linea"><span class="lbl">Efectivo declarado</span><span class="val">${money(totDeclarado)}</span></div>
        <div class="linea ${difTotal === 0 ? 'dif-ok' : 'dif-mal'}"><span class="lbl">Diferencia total</span><span class="val">${money(difTotal)}</span></div>
      </div>
      <hr class="sep" />
      <p class="sub">Generado ${new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>`;
  };

  const cargar = async () => {
    if (!desde) {
      ticketEl.innerHTML = '<p class="vacio">Falta el período (desde/hasta).</p>';
      return;
    }
    try {
      const qs = new URLSearchParams({ desde, hasta, origen });
      const resp = await fetch(`/api/caja/cierres?${qs.toString()}`, { headers: getHeaders() });
      if (resp.status === 401 || resp.status === 403) {
        window.kanmAuth?.handleUnauthorized?.();
        ticketEl.innerHTML = '<p class="vacio">Sesión expirada. Inicia sesión nuevamente.</p>';
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || 'No se pudo cargar el cuadre del mes.');
      }
      render(data.cierres || []);
      if (autoPrint) {
        setTimeout(() => { try { window.print(); } catch (_) {} }, 350);
      }
    } catch (error) {
      ticketEl.innerHTML = `<p class="vacio">${escapar(error?.message || 'No se pudo cargar el cuadre del mes.')}</p>`;
    }
  };

  btnImprimir?.addEventListener('click', () => { try { window.print(); } catch (_) {} });
  btnCerrar?.addEventListener('click', () => { try { window.close(); } catch (_) {} });
  document.addEventListener('DOMContentLoaded', cargar);
})();
