from pathlib import Path
path = Path("public/bar.html")
text = path.read_text(encoding="utf-8")
reemplazos = {
    'KANM - Cocina': 'KANM - Bar',
    'js/cocina.js': 'js/bar.js',
    'data-role="cocina"': 'data-role="bar"',
    'Panel de cocina': 'Panel de bar',
    '>Cocina<': '>Bar<',
    'Pedidos en cocina': 'Pedidos en barra',
    'Gestiona y actualiza el estado de cada pedido.': 'Gestiona bebidas y cocteles en preparación.',
    'cocina-tabs': 'bar-tabs',
    'cocina-panel': 'bar-panel',
    'cocina-main': 'bar-main',
    'cocina-pedidos-activos': 'bar-pedidos-activos',
    'cocina-pedidos-finalizados': 'bar-pedidos-finalizados',
    'cocina-focus-overlay': 'bar-focus-overlay',
    'Pedidos activos': 'Pedidos en barra',
    'Pedidos pendientes y en preparación.': 'Bebidas pendientes y en preparación.',
}
for viejo, nuevo in reemplazos.items():
    text = text.replace(viejo, nuevo)
path.write_text(text, encoding="utf-8")
