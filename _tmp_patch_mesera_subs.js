from pathlib import Path
path = Path("public/mesera.html")
text = path.read_text(encoding="utf-8")
text = text.replace('Pedidos que se están preparando en cocina.', 'Pedidos en preparación (cocina / bar).')
text = text.replace('Pedidos finalizados en cocina y listos para servir o cobrar.', 'Pedidos listos para servir o cobrar.')
path.write_text(text, encoding="utf-8")
