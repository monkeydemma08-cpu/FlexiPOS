(() => {
  const params = new URLSearchParams(window.location.search);
  const facturaId = params.get('id');

  const dom = {
    numero: document.getElementById('pf-numero'),
    fecha: document.getElementById('pf-fecha'),
    periodo: document.getElementById('pf-periodo'),
    estado: document.getElementById('pf-estado'),
    emisorNombre: document.getElementById('pf-emisor-nombre'),
    emisorLogo: document.getElementById('pf-emisor-logo'),
    emisorRnc: document.getElementById('pf-emisor-rnc'),
    emisorDireccion: document.getElementById('pf-emisor-direccion'),
    emisorContacto: document.getElementById('pf-emisor-contacto'),
    clienteNombre: document.getElementById('pf-cliente-nombre'),
    clienteRnc: document.getElementById('pf-cliente-rnc'),
    clienteDireccion: document.getElementById('pf-cliente-direccion'),
    clienteContacto: document.getElementById('pf-cliente-contacto'),
    itemsBody: document.getElementById('pf-items'),
    subtotal: document.getElementById('pf-subtotal'),
    itbis: document.getElementById('pf-itbis'),
    descuento: document.getElementById('pf-descuento'),
    total: document.getElementById('pf-total'),
    terminos: document.getElementById('pf-terminos'),
    metodo: document.getElementById('pf-metodo'),
    nota: document.getElementById('pf-nota'),
    imprimirBtn: document.getElementById('pf-imprimir'),
  };

  const getAuthHeaders = () => {
    try {
      return window.kanmAuth?.getAuthHeaders?.() || {};
    } catch (error) {
      return {};
    }
  };

  const getCurrencyCode = (moneda) => {
    if (!moneda) return 'DOP';
    const upper = String(moneda).toUpperCase();
    if (upper.includes('USD')) return 'USD';
    if (upper.includes('DOP') || upper.includes('RD')) return 'DOP';
    return 'DOP';
  };

  const formatCurrency = (value, moneda) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: getCurrencyCode(moneda),
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-DO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const renderFactura = (factura) => {
    if (!factura) return;
    const moneda = factura.moneda || 'RD$';

    if (dom.numero) dom.numero.textContent = factura.numero_factura || factura.id || '-';
    if (dom.fecha) dom.fecha.textContent = formatDate(factura.fecha_emision);
    if (dom.periodo) dom.periodo.textContent = factura.periodo || '-';
    if (dom.estado) dom.estado.textContent = (factura.estado || 'pendiente').toUpperCase();

    const emisor = factura.emisor || {};
    if (dom.emisorNombre) dom.emisorNombre.textContent = emisor.nombre || 'POSIUM';
    if (dom.emisorLogo && emisor.logo) {
      dom.emisorLogo.src = emisor.logo;
      dom.emisorLogo.style.display = 'block';
    }
    if (dom.emisorRnc) dom.emisorRnc.textContent = emisor.rnc ? `RNC: ${emisor.rnc}` : '';
    if (dom.emisorDireccion) dom.emisorDireccion.textContent = emisor.direccion || '';
    if (dom.emisorContacto) {
      const contacto = [emisor.telefono, emisor.email].filter(Boolean).join(' | ');
      dom.emisorContacto.textContent = contacto;
    }

    const cliente = factura.cliente || {};
    if (dom.clienteNombre) dom.clienteNombre.textContent = cliente.nombre || '';
    if (dom.clienteRnc) dom.clienteRnc.textContent = cliente.rnc ? `RNC: ${cliente.rnc}` : '';
    if (dom.clienteDireccion) dom.clienteDireccion.textContent = cliente.direccion || '';
    if (dom.clienteContacto) {
      const contacto = [cliente.telefono, cliente.email, cliente.contacto].filter(Boolean).join(' | ');
      dom.clienteContacto.textContent = contacto;
    }

    const items = Array.isArray(factura.items) ? factura.items : [];
    if (dom.itemsBody) {
      if (!items.length) {
        dom.itemsBody.innerHTML = '<tr><td colspan="4">No hay items registrados.</td></tr>';
      } else {
        dom.itemsBody.innerHTML = items
          .map((item) => {
            const subtotal = item.subtotal ?? (Number(item.cantidad) * Number(item.precio_unitario) || 0);
            return `
              <tr>
                <td>${item.descripcion || ''}</td>
                <td>${item.cantidad || 0}</td>
                <td>${formatCurrency(item.precio_unitario || 0, moneda)}</td>
                <td>${formatCurrency(subtotal, moneda)}</td>
              </tr>
            `;
          })
          .join('');
      }
    }

    if (dom.subtotal) dom.subtotal.textContent = formatCurrency(factura.subtotal || 0, moneda);
    if (dom.itbis) dom.itbis.textContent = formatCurrency(factura.itbis || 0, moneda);
    if (dom.descuento) dom.descuento.textContent = formatCurrency(factura.descuento || 0, moneda);
    if (dom.total) dom.total.textContent = formatCurrency(factura.total || 0, moneda);

    if (dom.terminos) dom.terminos.textContent = factura.terminos_pago || '';
    if (dom.metodo) dom.metodo.textContent = factura.metodo_pago || '';
    if (dom.nota) dom.nota.textContent = emisor.nota || '';
  };

  const cargarFactura = async () => {
    if (!facturaId) {
      alert('No se encontro la factura.');
      return;
    }

    try {
      const resp = await fetch(`/api/admin/posium-facturas/${facturaId}`, {
        headers: {
          ...getAuthHeaders(),
        },
      });
      const data = await resp.json();
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo obtener la factura');
      }
      renderFactura(data.factura || {});
    } catch (error) {
      console.error('Error cargando factura POSIUM:', error);
      alert('No se pudo cargar la factura.');
    }
  };

  dom.imprimirBtn?.addEventListener('click', () => window.print());

  cargarFactura();
})();
