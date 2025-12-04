from pathlib import Path
path = Path("public/js/login.js")
text = path.read_text()
text = text.replace("  cocina: '/cocina.html',\n  caja: '/caja.html',","  cocina: '/cocina.html',\n  bar: '/bar.html',\n  caja: '/caja.html',",1)
path.write_text(text)
