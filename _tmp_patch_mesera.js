from pathlib import Path
path = Path("public/js/mesera.js")
text = path.read_text(encoding="utf-8")
text = text.replace("        ? 'Pedido enviado a caja correctamente.'\n        : 'Pedido enviado a cocina correctamente.';","        ? 'Pedido enviado a caja correctamente.'\n        : 'Pedido enviado a preparación correctamente.';")
path.write_text(text, encoding="utf-8")
