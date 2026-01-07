# Admin PRO - Gastos y Analisis

## Gastos
- Total gastos: suma de `monto` en el rango seleccionado.
- Promedio diario: total gastos dividido entre dias del rango (o dias con gastos si no hay rango).
- Top categorias: categorias con mayor monto acumulado.
- Gasto recurrente: si `es_recurrente=1`, se exige `frecuencia` para clasificar.

## Analisis del negocio
- Ventas total: suma de `subtotal + impuesto - descuento_monto + propina_monto` en pedidos pagados.
- Cantidad de ventas: conteo de facturas (cuenta_id o id).
- Ticket promedio: ventas total / cantidad de ventas.
- Gastos total: suma de `monto` en la tabla `gastos`.
- Ganancia neta: ventas total - gastos total.
- Margen neto: ganancia neta / ventas total (si ventas total > 0).
- Serie diaria: ventas y gastos agregados por fecha.
- Rankings:
  - Top productos por cantidad e ingresos.
  - Bottom productos (incluye items sin ventas).
  - Top categorias de ventas y gastos.
  - Top dias de semana, dias del mes y horas.
- Comparacion: periodo anterior con la misma cantidad de dias.
- Alertas: reglas simples (gastos suben sin ventas, ticket cae, productos sin ventas, pareto).
