# Cache local DGII (RNC/Cedula)

Este proyecto incluye importacion local para consulta rapida de contribuyentes DGII.

## Que hace

1. Descarga (o lee localmente) un CSV/TXT de DGII.
2. Lo importa por lotes en `dgii_rnc_cache`.
3. Expone lookup en `GET /api/dgii/rnc-cache/lookup?documento=...`.
4. En Mostrador y Caja, al escribir RNC/Cedula (9 u 11 digitos), autocompleta nombre del cliente.
5. Al salir del campo (blur), sincroniza automaticamente el cliente en tabla `clientes` (crea o actualiza).
6. Al cerrar el cobro, vuelve a intentar sincronizar para asegurar persistencia.

## Variables de entorno

Configura una de estas fuentes:

- `DGII_RNC_SOURCE_URL` URL directa al TXT/CSV de DGII.
- `DGII_RNC_SOURCE_FILE` ruta local del archivo TXT/CSV.

Opcionales:

- `DGII_RNC_SOURCE_NAME=DGII`
- `DGII_RNC_SOURCE_DATE=YYYY-MM-DD`
- `DGII_RNC_SOURCE_ENCODING=latin1` (usa `utf8` si tu archivo esta en UTF-8)
- `DGII_RNC_BATCH_SIZE=300`
- `DGII_RNC_PRUNE=1` para borrar filas que no vengan en el lote actual.
- `DGII_RNC_USER_AGENT=KANM-DGII-RNC-Importer/1.0`

## Ejecucion manual

```bash
npm run dgii:rnc:refresh
```

Tambien puedes forzar fuente por linea de comandos:

```bash
node scripts/dgii-rnc-refresh.js --url="https://tu-fuente/archivo.txt"
node scripts/dgii-rnc-refresh.js --file="C:\\datos\\dgii_rnc.txt"
```

## Cron (Linux)

Ejemplo cada madrugada a las 02:15:

```cron
15 2 * * * cd /ruta/a/KANM && /usr/bin/npm run dgii:rnc:refresh >> /var/log/kanm-dgii-rnc.log 2>&1
```

## Verificacion rapida

1. Ejecuta `npm run dgii:rnc:refresh`.
2. Prueba endpoint:
   - `GET /api/dgii/rnc-cache/lookup?documento=101000001`
3. En Mostrador o Caja, escribe RNC/Cedula y valida autocompletado.
