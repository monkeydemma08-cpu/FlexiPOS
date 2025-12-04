from pathlib import Path
path = Path('server.js')
text = path.read_text()
marker = "app.get('/api/cocina/pedidos-finalizados'"
idx = text.index(marker)
end_block = text.index('\n\n', text.index(marker)) + 2
cocina_block = text[idx:end_block]
new_block = cocina_block + """
app.get('/api/bar/pedidos', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const barActivo = await moduloActivoParaNegocio('bar', negocioId);
    if (!barActivo) {
      return res.status(403).json({ error: 'El modulo de bar esta desactivado para este negocio.' });
    }

    try {
      const cuentas = await obtenerCuentasPorEstados(
        ['pendiente', 'preparando'],
        negocioId,
        { area_preparacion: 'bar' }
      );
      res.json(cuentas);
    } catch (error) {
      console.error('Error al obtener pedidos de bar:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos de bar.' });
    }
  });
});

app.get('/api/bar/pedidos-finalizados', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;
    const barActivo = await moduloActivoParaNegocio('bar', negocioId);
    if (!barActivo) {
      return res.status(403).json({ error: 'El modulo de bar esta desactivado para este negocio.' });
    }

    try {
      const cuentas = await obtenerCuentasPorEstados(
        ['listo', 'pagado', 'cancelado'],
        negocioId,
        { area_preparacion: 'bar' }
      );
      res.json(cuentas);
    } catch (error) {
      console.error('Error al obtener pedidos finalizados de bar:', error);
      res.status(500).json({ error: 'No se pudieron obtener los pedidos de bar.' });
    }
  });
});

app.post('/api/bar/marcar-en-preparacion', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.body?.pedido_id ?? req.body?.pedidoId);
    const resultado = await actualizarEstadoPedido({
      pedidoId,
      estadoDeseado: 'preparando',
      usuarioSesion,
      areaSolicitada: 'bar',
    });

    if (!resultado.ok) {
      const statusCode = resultado.status || 500;
      return res.status(statusCode).json({ error: resultado.error || 'No se pudo actualizar el pedido.' });
    }

    res.json({ ok: true, estado: resultado.estado });
  });
});

app.post('/api/bar/marcar-listo', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.body?.pedido_id ?? req.body?.pedidoId);
    const resultado = await actualizarEstadoPedido({
      pedidoId,
      estadoDeseado: 'listo',
      usuarioSesion,
      areaSolicitada: 'bar',
    });

    if (!resultado.ok) {
      const statusCode = resultado.status || 500;
      return res.status(statusCode).json({ error: resultado.error || 'No se pudo actualizar el pedido.' });
    }

    res.json({ ok: true, estado: resultado.estado });
  });
});

"""
text = text[:idx] + new_block + text[end_block:]
path.write_text(text)
