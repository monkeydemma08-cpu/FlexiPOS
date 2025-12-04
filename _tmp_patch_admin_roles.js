from pathlib import Path
path = Path("public/js/admin.js")
text = path.read_text()
text = text.replace("const ROLES_PERMITIDOS = ['mesera', 'cocina', 'caja'];","const ROLES_PERMITIDOS = ['mesera', 'cocina', 'bar', 'caja'];",1)
text = text.replace('Selecciona un rol vǭlido (mesera, cocina o caja).','Selecciona un rol válido (mesera, cocina, bar o caja).',1)
path.write_text(text)
