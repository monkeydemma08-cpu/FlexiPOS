from pathlib import Path
path = Path("public/js/bar.js")
text = path.read_text()
text = text.replace('cocina', 'bar')
path.write_text(text)
