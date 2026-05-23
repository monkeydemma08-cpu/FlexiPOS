// =====================================================================
// Cuadre de cierre — ticket térmico 88mm
// Usa: /api/caja/cierres/:id/ticket
// Query params:  ?cierre_id=NN  o  ?id=NN  (ambos aceptados)
//                ?origen=caja  (opcional, default caja)
//                ?auto_print=1 (opcional, default 1 — imprime al cargar)
// =====================================================================
(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search || '');
  const cierreId = Number(params.get('cierre_id') || params.get('id') || 0);
  const origen = (params.get('origen') || 'caja').toString().trim().toLowerCase();
  const autoPrint = params.get('auto_print') !== '0';

  const ticketEl = document.getElementById('ticket-cuadre');
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

  const renderTicket = (data) => {
    const negocio = data?.negocio || {};
    const cierre = data?.cierre || {};
    const pedidos = Array.isArray(data?.pedidos) ? data.pedidos : [];
    const totalesMetodo = data?.totales_metodo || {};

    const nombreNegocio = negocio.nombre || 'Negocio';
    const rnc = negocio.rnc ? `RNC: ${negocio.rnc}` : '';
    const direccion = negocio.direccion || '';
    const telefono = negocio.telefono || '';

    const fechaOperacion = formatearFecha(cierre.fecha_operacion);
    const fechaCierre = formatearFechaHora(cierre.fecha_cierre);
    const usuario = cierre.usuario || '--';
    const observaciones = cierre.observaciones ? String(cierre.observaciones).trim() : '';

    const fondoInicial = Number(cierre.fondo_inicial) || 0;
    const totalSistema = Number(cierre.total_sistema) || 0;
    const totalDeclarado = Number(cierre.total_declarado) || 0;
    const diferencia = Number(cierre.diferencia) || 0;
    const totalVentas = Number(cierre.total_ventas) || 0;
    const ventasCount = pedidos.length;
    const origenTexto = cierre.origen_caja || origen;

    const filasPedidos = pedidos.length
      ? pedidos
          .map((p, idx) => {
            const fecha = formatearFechaHora(p.fecha_hora || p.fecha_cierre || p.fecha_listo);
            const cliente = p.cliente || p.mesa || '';
            const ncf = p.ncf || '';
            const metodo = (p.metodo_pago || '').toString().toUpperCase();
            const total = Number(p.total) || 0;
            const numero = p.numero_cuenta_negocio || p.cuenta_id || p.id;
            return `
              <div class="venta-item">
                <div class="fila">
                  <span>#${escapar(numero)}${ncf ? ` · ${escapar(ncf)}` : ''}</span>
                  <span class="venta-monto">${escapar(formatearMoneda(total))}</span>
                </div>
                <div class="venta-fecha">${escapar(fecha)}${metodo ? ` · ${escapar(metodo)}` : ''}</div>
                ${cliente ? `<div class="venta-cliente">${escapar(cliente)}</div>` : ''}
              </div>
            `;
          })
          .join('')
      : '<div class="fila fila--small" style="text-align:center;justify-content:center;">Sin ventas registradas en este cierre.</div>';

    const metodosKeys = [
      { key: 'efectivo', label: 'Efectivo' },
      { key: 'tarjeta', label: 'Tarjeta' },
      { key: 'transferencia', label: 'Transferencia' },
      { key: 'credito', label: 'Crédito' },
    ];
    const metodosHtml = metodosKeys
      .map((m) => {
        const v = Number(totalesMetodo[m.key]) || 0;
        if (v <= 0) return '';
        return `<div class="fila"><span>${escapar(m.label)}</span><span>${escapar(formatearMoneda(v))}</span></div>`;
      })
      .filter(Boolean)
      .join('');

    ticketEl.innerHTML = `
      <h1>${escapar(nombreNegocio)}</h1>
      ${rnc ? `<div class="meta-negocio">${escapar(rnc)}</div>` : ''}
      ${telefono ? `<div class="meta-negocio">Tel: ${escapar(telefono)}</div>` : ''}
      ${direccion ? `<div class="meta-negocio">${escapar(direccion)}</div>` : ''}
      <hr>
      <h2>Cierre de cuadre #${escapar(cierre.id)}</h2>
      <div class="meta-negocio">Origen: ${escapar(origenTexto.toUpperCase())}</div>
      <hr>
      <div class="fila"><span>Fecha operación</span><span>${escapar(fechaOperacion)}</span></div>
      <div class="fila"><span>Cierre</span><span>${escapar(fechaCierre)}</span></div>
      <div class="fila"><span>Usuario</span><span>${escapar(usuario)}</span></div>
      <div class="fila"><span>Ventas</span><span>${ventasCount}</span></div>
      <hr>
      <div class="seccion-titulo">Detalle de ventas</div>
      ${filasPedidos}
      <hr>
      ${
        metodosHtml
          ? `<div class="seccion-titulo">Por método de pago</div><div class="metodos-pago">${metodosHtml}</div><hr>`
          : ''
      }
      <div class="seccion-titulo">Resumen</div>
      <div class="fila"><span>Fondo inicial</span><span>${escapar(formatearMoneda(fondoInicial))}</span></div>
      <div class="fila"><span>Total ventas</span><span>${escapar(formatearMoneda(totalVentas))}</span></div>
      <div class="fila"><span>Efectivo esperado</span><span>${escapar(formatearMoneda(totalSistema))}</span></div>
      <div class="fila"><span>Total declarado</span><span>${escapar(formatearMoneda(totalDeclarado))}</span></div>
      <div class="fila fila--total">
        <span>Diferencia</span>
        <span>${escapar(formatearMoneda(diferencia))}</span>
      </div>
      ${observaciones ? `<hr><div class="seccion-titulo">Observaciones</div><div style="font-size:10px;">${escapar(observaciones)}</div>` : ''}
      <hr>
      <div class="pie">Generado: ${escapar(formatearFechaHora(new Date()))}</div>
      <div class="pie">--- Fin del cierre ---</div>
    `;
  };

  const cargarTicket = async () => {
    if (!Number.isFinite(cierreId) || cierreId <= 0) {
      renderError('No se especificó un ID de cierre válido.');
      return;
    }
    try {
      const url = `/api/caja/cierres/${cierreId}/ticket?origen=${encodeURIComponent(origen)}`;
      const resp = await fetch(url, {
        cache: 'no-store',
        headers: { ...obtenerHeadersAuth() },
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        renderError(data?.error || 'No se pudo cargar el cierre.');
        return;
      }
      renderTicket(data);

      // Auto-print: dar un pequeño tiempo para que el navegador renderice.
      if (autoPrint) {
        setTimeout(() => {
          try { window.print(); } catch (_) {}
        }, 350);
      }
    } catch (error) {
      console.error('Error al cargar cierre:', error);
      renderError('Error al cargar el cierre. Intenta nuevamente.');
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
