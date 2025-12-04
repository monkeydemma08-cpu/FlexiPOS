from pathlib import Path
text = Path('public/js/admin-categorias.js').read_text()
start = text.index('fila.innerHTML')
print(text[start:start+260])
