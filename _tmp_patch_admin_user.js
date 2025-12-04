from pathlib import Path
path = Path("public/admin.html")
text = path.read_text(encoding="utf-8")
text = text.replace('<option value="mesera">Mesera</option>\n                  <option value="cocina">Cocina</option>\n                  <option value="caja">Caja</option>', '<option value="mesera">Mesera</option>\n                  <option value="cocina">Cocina</option>\n                  <option value="bar">Bar</option>\n                  <option value="caja">Caja</option>')
path.write_text(text, encoding="utf-8")
