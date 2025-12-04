from pathlib import Path
path = Path("public/js/bar.js")
text = path.read_text()
text = text.replace('/api/bar/pedidos-activos', '/api/bar/pedidos')
text = text.replace('/api/bar/pedidos-finalizados', '/api/bar/pedidos-finalizados')
path.write_text(text)
