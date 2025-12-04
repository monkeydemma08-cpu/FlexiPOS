import re
from pathlib import Path
path = Path("public/js/mesera.js")
text = path.read_text()
pattern = r"const mensajeExito = esEdicion[\s\S]*?: 'Pedido enviado a [^\n]*';"
replacement = "const mensajeExito = esEdicion\n      ? 'Nueva orden agregada a la cuenta correctamente.'\n      : destino === 'caja'\n        ? 'Pedido enviado a caja correctamente.'\n        : 'Pedido enviado a preparacion correctamente.';"
text_new, count = re.subn(pattern, replacement, text, count=1)
if count == 0:
    raise SystemExit('mensajeExito not replaced')
path.write_text(text_new)
