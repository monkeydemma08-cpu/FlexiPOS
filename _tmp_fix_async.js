from pathlib import Path
path = Path('server.js')
text = path.read_text()
old = """app.get('/api/clientes', (req, res) => {\n  requireUsuarioSesion(req, res, (usuarioSesion) => {\n    const term = (req.query.search || '').trim();\n    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;\n    if (esUsuarioBar(usuarioSesion)) {\n      const barActivo = await moduloActivoParaNegocio('bar', negocioId);\n      if (!barActivo) {\n        return res.status(403).json({ error: 'El m\udcdulo de bar est\udcd desactivado para este negocio.' });\n      }\n    }\n    const areaSolicitada = normalizarAreaPreparacion(\n      req.body?.area_preparacion ?? req.body?.areaPreparacion ?? (esUsuarioBar(usuarioSesion) ? 'bar' : 'cocina')\n    );\n    const params = [negocioId];\n"""
new = """app.get('/api/clientes', (req, res) => {\n  requireUsuarioSesion(req, res, async (usuarioSesion) => {\n    const term = (req.query.search || '').trim();\n    const negocioId = usuarioSesion.negocio_id || NEGOCIO_ID_DEFAULT;\n    if (esUsuarioBar(usuarioSesion)) {\n      const barActivo = await moduloActivoParaNegocio('bar', negocioId);\n      if (!barActivo) {\n        return res.status(403).json({ error: 'El m\udcdulo de bar est\udcd desactivado para este negocio.' });\n      }\n    }\n    const params = [negocioId];\n"""
if old not in text:
    raise SystemExit('old block not found')
path.write_text(text.replace(old, new))
