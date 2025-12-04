from pathlib import Path
path = Path('server.js')
text = path.read_text()
start = text.index('if (row.password')
snippet = text[start:start+330]
old_block = "  cerrarSesionesExpiradas(row.id, () => {\n    cerrarSesionesActivasDeUsuario(row.id, () => {\n      const token = generarTokenSesion();\n      const negocioId = row.negocio_id || NEGOCIO_ID_DEFAULT;\n"
new_block = "  const negocioId = row.negocio_id || NEGOCIO_ID_DEFAULT;\n  const configModulosLogin = await obtenerConfigModulosNegocio(negocioId);\n  if (row.rol === 'bar' && configModulosLogin.bar === false) {\n    return res.status(403).json({ ok: false, error: 'El modulo de Bar esta desactivado para este negocio.' });\n  }\n\n  cerrarSesionesExpiradas(row.id, () => {\n    cerrarSesionesActivasDeUsuario(row.id, () => {\n      const token = generarTokenSesion();\n      const esSuperAdminUsuario = !!row.es_super_admin;\n"
if old_block not in snippet:
    raise SystemExit('block not found')
new_snippet = snippet.replace(old_block, new_block)
text = text[:start] + new_snippet + text[start+len(snippet):]
path.write_text(text)
