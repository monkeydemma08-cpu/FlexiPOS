## 2026-02-27
- Added DGII local RNC/Cedula cache (`dgii_rnc_cache`) with import logs and migration support.
- Added `scripts/dgii-rnc-refresh.js` plus npm script `dgii:rnc:refresh` for scheduled source sync (cron-ready).
- Added authenticated lookup endpoint `GET /api/dgii/rnc-cache/lookup` and Mostrador autocomplete by RNC/Cedula in factura flow.
- Added automatic client sync by documento (create/update in `clientes`) from Mostrador lookup and on account close.
- Extended DGII lookup + auto-sync flow to Caja (`public/js/caja.js`) to match Mostrador behavior.

## 2025-12-09
- Added `stock_indefinido` flag for products, migrations, API, and admin/mesera UI to handle unlimited stock without blocking sales or discounting quantities.
- Removed insumos module end-to-end and converted 606 purchases to manual line items without inventory linkage.
- Added Admin PRO modules: gastos CRUD with resumen/filtros and analytics overview dashboard (ventas vs gastos, rankings, alerts).
