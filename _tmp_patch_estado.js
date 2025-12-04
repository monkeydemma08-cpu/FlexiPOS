from pathlib import Path
path = Path('server.js')
text = path.read_text()
start = text.index("app.put('/api/pedidos/:id/estado'")
end = text.index("app.put('/api/pedidos/:id/cancelar'")
old = text[start:end]
new = """app.put('/api/pedidos/:id/estado', (req, res) => {
  requireUsuarioSesion(req, res, async (usuarioSesion) => {
    if (!esUsuarioCocina(usuarioSesion) && !esUsuarioBar(usuarioSesion) && !esUsuarioAdmin(usuarioSesion)) {
      return res.status(403).json({ error: 'Acceso restringido.' });
    }

    const pedidoId = Number(req.params.id);
    const estadoDeseado = (req.body?.estado || '').toString().trim().toLowerCase();
    const areaSolicitada = req.body?.area_preparacion ?? req.body?.areaPreparacion;

    const resultado = await actualizarEstadoPedido({
      pedidoId,
      estadoDeseado,
      usuarioSesion,
      areaSolicitada,
    });

    if (!resultado.ok) {
      const statusCode = resultado.status || 500;
      return res.status(statusCode).json({ error: resultado.error || 'No se pudo actualizar el pedido.' });
    }

    res.json({ ok: true, estado: resultado.estado });
  });
});

"""
path.write_text(text.replace(old, new))
