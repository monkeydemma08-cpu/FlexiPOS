# Integracion EF2 en KANM

## Estado actual

La integracion directa de certificacion `DGII Paso 2` quedo desligada del flujo activo del programa.

- La ruta `'/api/dgii/paso2'` ahora solo se monta si `ENABLE_DGII_PASO2=true`.
- El tab de administracion `DGII Paso 2` se retiro de la navegacion normal.
- El codigo existente de DGII Paso 2 se conserva por seguridad y rollback, pero ya no debe considerarse la via principal.

## Decision tecnica

La nueva ruta recomendada es integrar contra EF2 como proveedor de facturacion electronica.

Eso cambia la arquitectura:

- KANM deja de firmar XML y hablar con DGII de forma directa para la emision diaria.
- KANM envia un payload JSON a EF2.
- EF2 se encarga de firma, envio, respuesta fiscal, PDF, XML y QR.

## Cliente base incluido

Se agrego [`ef2.client.js`](/c:/Users/Usuario/OneDrive/Documents/KANM/ef2.client.js), que deja lista la capa base para:

- normalizar `baseUrl`
- autenticarse con `POST /auth/login.php`
- reutilizar token Bearer
- emitir con `POST /procesar_factura.php`
- normalizar respuesta de EF2

## Variables recomendadas

No se forzaron variables nuevas en `.env` todavia, pero la integracion debe asumir estas claves:

- `EF2_BASE_URL`
- `EF2_USERNAME`
- `EF2_PASSWORD`

Valor por defecto recomendado para base URL:

- `https://master.ef2.do/api2`

## Flujo recomendado

1. Guardar configuracion EF2 por negocio.
2. Autenticar en EF2 y cachear token corto.
3. Transformar la factura interna de KANM al payload EF2.
4. Emitir factura y guardar en base de datos:
   - `provider = 'ef2'`
   - `provider_status`
   - `provider_reference`
   - `encf`
   - `qr_url`
   - `pdf_url`
   - `xml_url`
   - `raw_response`
5. Mostrar resultado fiscal dentro del flujo de venta/factura existente.

## Siguiente implementacion sugerida

### Fase 1

- Crear configuracion EF2 por negocio en admin.
- Probar login y persistir token.

### Fase 2

- Mapear una factura de consumo `32` desde KANM hacia EF2.
- Guardar `eNCF`, PDF, XML y QR.

### Fase 3

- Extender a `31`, `33`, `34`, `41`, `43`, `44`, `45`, `46`, `47`.
- Manejar notas y anulaciones segun soporte real del API.

## Criterio de limpieza futura

Cuando EF2 ya este emitiendo desde el flujo normal, entonces si conviene:

- eliminar `dgii-paso2.routes.js`
- eliminar `dgii-paso2.xml.js`
- retirar handlers y UI residual en `public/js/admin.js`
- remover la seccion oculta de `public/admin.html`
- evaluar si se conservan o migran tablas historicas de prueba
