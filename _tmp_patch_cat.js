from pathlib import Path
path = Path("public/js/admin-categorias.js")
text = path.read_text()
text = text.replace("  const nombre = inputNombre.value.trim();\n  const activo = inputActivo.checked;","  const nombre = inputNombre.value.trim();\n  const activo = inputActivo.checked;\n  const area_preparacion = selectArea?.value || 'ninguna';",1)
text = text.replace("        body: JSON.stringify({ nombre, activo }),","        body: JSON.stringify({ nombre, activo, area_preparacion }),",1)
text = text.replace("      const categoriaGuardada = data.categoria || { id: categoriaActual?.id, nombre, activo: activo ? 1 : 0 };","      const categoriaGuardada = data.categoria || { id: categoriaActual?.id, nombre, activo: activo ? 1 : 0, area_preparacion };",1)
path.write_text(text)
