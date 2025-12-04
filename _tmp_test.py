from pathlib import Path
text = Path('server.js').read_text()
start = text.index("app.get('/api/cocina/pedidos-finalizados'")
end = text.index('// Gesti')
print(text[start:end])
