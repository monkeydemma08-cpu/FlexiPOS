// =====================================================================
// Resumen de gastos — ticket térmico 88mm
// Usa: /api/admin/gastos/ticket
// Query params (mismos filtros que el listado de gastos):
//   ?from=YYYY-MM-DD  ?to=YYYY-MM-DD  ?categoria=  ?tipo_gasto=
//   ?metodo_pago=  ?q=   ?auto_print=1 (default 1 — imprime al cargar)
// =====================================================================
(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search || '');
  const autoPrint = params.get('auto_print') !== '0';

  const ticketEl = document.getElementById('ticket-gastos');
  const btnImprimir = document.getElementById('btn-imprimir');
  const btnCerrar = document.getElementById('btn-cerrar');

  const formatearMoneda = (valor) => {
    const num = Number(valor) || 0;
    try {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        minimumFractionDigits: 2,
      }).format(num);
    } catch (_) {
      return `DOP ${num.toFixed(2)}`;
    }
  };

  const formatearFecha = (valor) => {
    if (!valor) return '--';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleDateString('es-DO', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formatearFechaHora = (valor) => {
    if (!valor) return '--';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('es-DO', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const escapar = (txt) =>
    String(txt ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const obtenerHeadersAuth = () => {
    try {
      return window.kanmAuth?.getAuthHeaders?.() || {};
    } catch (_) {
      return {};
    }
  };

  const renderError = (mensaje) => {
    ticketEl.innerHTML = `<div id="mensaje-error">${escapar(mensaje)}</div>`;
  };

  const etiquetaTipoGasto = (tipo) => {
    const mapa = { OPERATIVO: 'Operativo', CAPITAL: 'Capital', PERSONAL: 'Personal' };
    return mapa[String(tipo || '').toUpperCase()] || tipo;
  };

  const renderTicket = (data) => {
    const negocio = data?.negocio || {};
    const periodo = data?.periodo || {};
    const filtros = data?.filtros || {};
    const resumen = data?.resumen || {};
    const porCategoria = Array.isArray(data?.por_categoria) ? data.por_categoria : [];
    const porMetodo = Array.isArray(data?.por_metodo) ? data.por_metodo : [];
    const gastos = Array.isArray(data?.gastos) ? data.gastos : [];

    const nombreNegocio = negocio.nombre || negocio.titulo_sistema || 'Negocio';
    const rnc = negocio.rnc ? `RNC: ${negocio.rnc}` : '';
    const telefono = negocio.telefono || '';
    const direccion = negocio.direccion || '';

    const periodoTexto =
      periodo.desde && periodo.hasta
        ? `${formatearFecha(periodo.desde)} — ${formatearFecha(periodo.hasta)}`
        : periodo.desde
          ? `Desde ${formatearFecha(periodo.desde)}`
          : periodo.hasta
            ? `Hasta ${formatearFecha(periodo.hasta)}`
            : 'Todo el histórico';

    // Filtros aplicados (solo los que tengan valor).
    const filtrosLineas = [];
    if (filtros.categoria) filtrosLineas.push(['Categoría', filtros.categoria]);
    if (filtros.tipo_gasto) filtrosLineas.push(['Tipo', etiquetaTipoGasto(filtros.tipo_gasto)]);
    if (filtros.metodo_pago) filtrosLineas.push(['Método', filtros.metodo_pago]);
    if (filtros.q) filtrosLineas.push(['Búsqueda', filtros.q]);
    const filtrosHtml = filtrosLineas
      .map(([k, v]) => `<div class="fila fila--small"><span>${escapar(k)}</span><span>${escapar(v)}</span></div>`)
      .join('');

    const total = Number(resumen.total) || 0;
    const cantidad = Number(resumen.cantidad) || 0;
    const dias = Number(resumen.dias) || 0;
    const promedio = Number(resumen.promedio_diario) || 0;

    const categoriaHtml = porCategoria.length
      ? porCategoria
          .map(
            (c) =>
              `<div class="fila"><span>${escapar(c.categoria)} (${Number(c.cantidad) || 0})</span><span>${escapar(
                formatearMoneda(c.total)
              )}</span></div>`
          )
          .join('')
      : '<div class="fila fila--small" style="justify-content:center;">Sin datos.</div>';

    const metodoHtml = porMetodo.length
      ? porMetodo
          .map(
            (m) =>
              `<div class="fila"><span>${escapar(m.metodo_pago)} (${Number(m.cantidad) || 0})</span><span>${escapar(
                formatearMoneda(m.total)
              )}</span></div>`
          )
          .join('')
      : '';

    const detalleHtml = gastos.length
      ? gastos
          .map((g) => {
            const monto = Number(g.monto) || 0;
            const titulo = (g.descripcion || g.proveedor || g.categoria || 'Gasto').toString().trim();
            const meta = [formatearFecha(g.fecha), g.categoria, g.metodo_pago]
              .filter((x) => x && String(x).trim())
              .join(' · ');
            return `
              <div class="gasto-item">
                <div class="fila">
                  <span>${escapar(titulo || 'Gasto')}</span>
                  <span class="gasto-monto">${escapar(formatearMoneda(monto))}</span>
                </div>
                <div class="gasto-fecha">${escapar(meta)}</div>
              </div>
            `;
          })
          .join('')
      : '<div class="fila fila--small" style="justify-content:center;">Sin gastos en el período.</div>';

    ticketEl.innerHTML = `
      <h1>${escapar(nombreNegocio)}</h1>
      ${rnc ? `<div class="meta-negocio">${escapar(rnc)}</div>` : ''}
      ${telefono ? `<div class="meta-negocio">Tel: ${escapar(telefono)}</div>` : ''}
      ${direccion ? `<div class="meta-negocio">${escapar(direccion)}</div>` : ''}
      <hr>
      <h2>Resumen de gastos</h2>
      <div class="meta-negocio">${escapar(periodoTexto)}</div>
      ${filtrosHtml ? `<hr><div class="seccion-titulo">Filtros</div>${filtrosHtml}` : ''}
      <hr>
      <div class="seccion-titulo">Resumen</div>
      <div class="fila"><span>Cantidad de gastos</span><span>${cantidad}</span></div>
      <div class="fila"><span>Días con gasto</span><span>${dias}</span></div>
      <div class="fila"><span>Promedio diario</span><span>${escapar(formatearMoneda(promedio))}</span></div>
      <hr>
      <div class="seccion-titulo">Por categoría</div>
      ${categoriaHtml}
      ${
        metodoHtml
          ? `<hr><div class="seccion-titulo">Por método de pago</div>${metodoHtml}`
          : ''
      }
      <hr>
      <div class="seccion-titulo">Detalle</div>
      ${detalleHtml}
      <div class="fila fila--total">
        <span>Total gastos</span>
        <span>${escapar(formatearMoneda(total))}</span>
      </div>
      <hr>
      <div class="pie">Generado: ${escapar(formatearFechaHora(new Date()))}</div>
      <div class="pie">--- Fin del resumen ---</div>
    `;
  };

  const cargarTicket = async () => {
    try {
      // Reenviamos exactamente los filtros que vengan en la URL.
      const consulta = new URLSearchParams();
      ['from', 'to', 'categoria', 'tipo_gasto', 'metodo_pago', 'q'].forEach((k) => {
        const v = params.get(k);
        if (v) consulta.set(k, v);
      });
      const url = `/api/admin/gastos/ticket?${consulta.toString()}`;
      const resp = await fetch(url, {
        cache: 'no-store',
        headers: { ...obtenerHeadersAuth() },
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        renderError(data?.error || 'No se pudo cargar el resumen de gastos.');
        return;
      }
      renderTicket(data);

      if (autoPrint) {
        setTimeout(() => {
          try { window.print(); } catch (_) {}
        }, 350);
      }
    } catch (error) {
      console.error('Error al cargar resumen de gastos:', error);
      renderError('Error al cargar el resumen. Intenta nuevamente.');
    }
  };

  btnImprimir?.addEventListener('click', () => {
    try { window.print(); } catch (_) {}
  });
  btnCerrar?.addEventListener('click', () => {
    try { window.close(); } catch (_) {
      window.location.href = '/admin.html';
    }
  });

  document.addEventListener('DOMContentLoaded', cargarTicket);
  if (document.readyState !== 'loading') {
    cargarTicket();
  }
})();
