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

  const linea = (lbl, val, extraClass = '') =>
    `<div class="linea ${extraClass}"><span class="lbl">${lbl}</span><span class="val">${money(val)}</span></div>`;

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

    let totEfectivo = 0;
    let totTransfer = 0;
    let totTarjeta = 0;
    let totCredito = 0;
    let totGastos = 0;

    const bloques = lista
      .map((c) => {
        const efectivo = Number(c.ventas_efectivo) || 0;
        const transfer = Number(c.ventas_transferencia) || 0;
        const tarjeta = Number(c.ventas_tarjeta) || 0;
        const credito = Number(c.ventas_credito) || 0;
        const gastos = Number(c.gastos_total) || 0;
        const ventas = efectivo + transfer + tarjeta + credito;
        totEfectivo += efectivo;
        totTransfer += transfer;
        totTarjeta += tarjeta;
        totCredito += credito;
        totGastos += gastos;
        const origenTxt = String(c.origen_caja || 'caja').toUpperCase();
        const filas = [
          linea('Efectivo', efectivo),
          transfer ? linea('Transferencia', transfer) : '',
          tarjeta ? linea('Tarjeta', tarjeta) : '',
          credito ? linea('Crédito', credito) : '',
          linea('Total ventas', ventas, 'subtotal'),
          gastos ? linea('Gastos', gastos) : '',
        ].join('');
        return `
          <div class="cierre">
            <div class="fecha">${escapar(fechaDMY(c.fecha_operacion))} <span class="origen">· ${escapar(origenTxt)}</span></div>
            ${filas}
          </div>`;
      })
      .join('<hr class="sep" />');

    const totVentas = totEfectivo + totTransfer + totTarjeta + totCredito;
    const neto = Number((totVentas - totGastos).toFixed(2));

    ticketEl.innerHTML = `
      <h1>CUADRE DEL MES</h1>
      <p class="sub">${escapar(rango())}</p>
      <p class="sub">${lista.length} cuadre(s)</p>
      <hr class="sep-solid" />
      ${bloques}
      <hr class="sep-solid" />
      <div class="seccion">INGRESOS (VENTAS)</div>
      ${linea('Efectivo', totEfectivo)}
      ${totTransfer ? linea('Transferencia', totTransfer) : ''}
      ${totTarjeta ? linea('Tarjeta', totTarjeta) : ''}
      ${totCredito ? linea('Crédito', totCredito) : ''}
      ${linea('TOTAL VENTAS', totVentas, 'grande')}
      <hr class="sep" />
      <div class="seccion">GASTOS</div>
      ${linea('Total gastos', totGastos)}
      <hr class="sep" />
      ${linea('NETO (ventas − gastos)', neto, 'grande')}
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
