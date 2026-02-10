(() => {
  const authApi = window.kanmAuth;
  const params = new URLSearchParams(window.location.search || '');
  const deudaId = params.get('deudaId');

  const dom = {
    emisorNombre: document.getElementById('cliente-factura-emisor-nombre'),
    emisorRnc: document.getElementById('cliente-factura-emisor-rnc'),
    emisorDireccion: document.getElementById('cliente-factura-emisor-direccion'),
    emisorTelefono: document.getElementById('cliente-factura-emisor-telefono'),
    numero: document.getElementById('cliente-factura-numero'),
    fecha: document.getElementById('cliente-factura-fecha'),
    condicion: document.getElementById('cliente-factura-condicion'),
    clienteNombre: document.getElementById('cliente-factura-cliente-nombre'),
    clienteDocumento: document.getElementById('cliente-factura-cliente-documento'),
    clienteDireccion: document.getElementById('cliente-factura-cliente-direccion'),
    clienteTelefono: document.getElementById('cliente-factura-cliente-telefono'),
    itemsBody: document.getElementById('cliente-factura-items-body'),
    subtotal: document.getElementById('cliente-factura-subtotal'),
    itbis: document.getElementById('cliente-factura-itbis'),
    itbisLabel: document.getElementById('cliente-factura-itbis-label'),
    total: document.getElementById('cliente-factura-total'),
    notas: document.getElementById('cliente-factura-notas'),
    imprimir: document.getElementById('cliente-factura-imprimir'),
  };

  const formatCurrency = (value) => {
    const number = Number(value) || 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
    }).format(number);
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return value;
    return fecha.toLocaleDateString('es-DO');
  };

  const renderFactura = (data) => {
    const factura = data?.factura || {};
    const emisor = factura.emisor || {};
    const cliente = factura.cliente || {};
    const items = Array.isArray(factura.items) ? factura.items : [];

    if (dom.emisorNombre) dom.emisorNombre.textContent = emisor.nombre || 'Factura';
    if (dom.emisorRnc) dom.emisorRnc.textContent = emisor.rnc ? `RNC: ${emisor.rnc}` : '';
    if (dom.emisorDireccion) dom.emisorDireccion.textContent = emisor.direccion || '';
    if (dom.emisorTelefono) {
      const telefono = Array.isArray(emisor.telefonos) ? emisor.telefonos.join(' · ') : '';
      dom.emisorTelefono.textContent = telefono;
    }

    if (dom.numero) dom.numero.textContent = factura.numero || '-';
    if (dom.fecha) dom.fecha.textContent = formatDate(factura.fecha);
    if (dom.condicion) dom.condicion.textContent = factura.condicion || 'CREDITO';

    if (dom.clienteNombre) dom.clienteNombre.textContent = cliente.nombre || '--';
    if (dom.clienteDocumento) dom.clienteDocumento.textContent = cliente.documento || '--';
    if (dom.clienteDireccion) dom.clienteDireccion.textContent = cliente.direccion || '--';
    if (dom.clienteTelefono) dom.clienteTelefono.textContent = cliente.telefono || '--';

    if (dom.itemsBody) {
      if (!items.length) {
        dom.itemsBody.innerHTML = '<tr><td colspan="5">No hay items registrados.</td></tr>';
      } else {
        dom.itemsBody.innerHTML = items
          .map((item) => `
            <tr>
              <td>${item.producto_id || '--'}</td>
              <td>${item.nombre_producto || '--'}</td>
              <td class="text-right">${item.cantidad || 0}</td>
              <td class="text-right">${formatCurrency(item.precio_unitario || 0)}</td>
              <td class="text-right">${formatCurrency(item.total_linea || 0)}</td>
            </tr>
          `)
          .join('');
      }
    }

    if (dom.subtotal) dom.subtotal.textContent = formatCurrency(factura.subtotal || 0);
    if (dom.itbis) dom.itbis.textContent = formatCurrency(factura.itbis || 0);
    if (dom.itbisLabel) {
      const porcentaje = Number(factura.itbis_porcentaje || 0);
      dom.itbisLabel.textContent = `ITBIS ${porcentaje}%:`;
    }
    if (dom.total) dom.total.textContent = formatCurrency(factura.total || 0);
    if (dom.notas) dom.notas.textContent = factura.notas || '';
  };

  const cargarFactura = async () => {
    if (!deudaId) {
      alert('No se encontro la factura.');
      return;
    }
    try {
      const headers = authApi?.getAuthHeaders?.() || {};
      const resp = await fetch(`/api/empresa/clientes/deudas/${deudaId}/factura`, { headers });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo cargar la factura');
      }
      renderFactura(data);
    } catch (error) {
      console.error('Error cargando factura cliente:', error);
      alert(error.message || 'No se pudo cargar la factura.');
    }
  };

  dom.imprimir?.addEventListener('click', () => {
    window.print();
  });

  cargarFactura();
})();
