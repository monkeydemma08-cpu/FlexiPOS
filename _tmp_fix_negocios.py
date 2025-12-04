from pathlib import Path
replacements = {
    'for="negocio-titulo"': 'for="kanm-negocios-nombre"',
    'id="negocio-titulo"': 'id="kanm-negocios-nombre"',
    'for="negocio-slug"': 'for="kanm-negocios-slug"',
    'id="negocio-slug"': 'id="kanm-negocios-slug"',
    'id="negocio-slug-group"': 'id="kanm-negocios-slug-group"',
    'for="negocio-color-primario"': 'for="kanm-negocios-color-primario"',
    'id="negocio-color-primario"': 'id="kanm-negocios-color-primario"',
    'for="negocio-color-secundario"': 'for="kanm-negocios-color-secundario"',
    'id="negocio-color-secundario"': 'id="kanm-negocios-color-secundario"',
    'for="negocio-logo"': 'for="kanm-negocios-logo-url"',
    'id="negocio-logo"': 'id="kanm-negocios-logo-url"',
    'id="negocio-form-mensaje"': 'id="kanm-negocios-form-mensaje"',
    'id="negocio-guardar"': 'id="kanm-negocios-btn-guardar"',
}
path = Path('public/admin.html')
text = path.read_text(encoding='utf-8')
for old, new in replacements.items():
    text = text.replace(old, new)
text = text.replace('T??tulo / Nombre pgblico', 'Título / Nombre público')
text = text.replace('Ej. Mi Cafeter??a', 'Ej. Mi Cafetería')
path.write_text(text, encoding='utf-8')
print('done')
