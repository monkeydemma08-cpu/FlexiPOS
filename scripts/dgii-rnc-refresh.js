require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const readline = require('readline');
const crypto = require('crypto');
const { query } = require('../db-mysql');

const DEFAULT_BATCH_SIZE = 300;
const MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT = 'KANM-DGII-RNC-Importer/1.0';

const HEADER_ALIASES = {
  documento: [
    'rnc',
    'cedula',
    'rnc cedula',
    'rnc o cedula',
    'documento',
    'numero documento',
    'num documento',
    'numero identificacion',
    'identificacion',
    'id fiscal',
  ],
  nombre: [
    'razon social',
    'nombre',
    'nombre razon social',
    'denominacion',
    'contribuyente',
    'nombre contribuyente',
  ],
  nombreComercial: ['nombre comercial', 'comercial', 'fantasia'],
  estado: ['estado', 'estatus', 'situacion'],
  actividad: ['actividad economica', 'actividad', 'actividad principal', 'sector'],
  tipo: ['tipo', 'tipo documento', 'tipo persona', 'tipo contribuyente'],
};

const parsedArgs = (() => {
  const args = process.argv.slice(2);
  const config = {};
  for (const raw of args) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=');
    config[key] = value === undefined ? '1' : value;
  }
  return config;
})();

const normalizeSpaces = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeText = (value, maxLen = null) => {
  const clean = normalizeSpaces(value);
  if (!clean) return null;
  if (maxLen && clean.length > maxLen) {
    return clean.slice(0, maxLen);
  }
  return clean;
};

const normalizeDocument = (value) => String(value || '').replace(/\D+/g, '').trim();

const normalizeHeaderKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const countOccurrences = (line, token) => {
  if (!line || !token) return 0;
  let count = 0;
  for (const char of line) {
    if (char === token) count += 1;
  }
  return count;
};

const detectDelimiter = (line) => {
  const candidates = ['|', ';', '\t', ','];
  let winner = '|';
  let winnerCount = -1;
  for (const token of candidates) {
    const count = countOccurrences(line, token);
    if (count > winnerCount) {
      winner = token;
      winnerCount = count;
    }
  }
  return winnerCount > 0 ? winner : '|';
};

const splitDelimitedLine = (line, delimiter) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values.map((entry) => normalizeSpaces(entry));
};

const findHeaderIndex = (headers, aliases = []) => {
  if (!Array.isArray(headers) || headers.length === 0) return -1;
  const normalizedAliases = aliases.map((alias) => normalizeHeaderKey(alias)).filter(Boolean);
  return headers.findIndex((header) => {
    if (!header) return false;
    return normalizedAliases.some((alias) => header === alias || header.includes(alias));
  });
};

const inferTipoDocumento = (documento, tipoRaw = null) => {
  const tipo = normalizeHeaderKey(tipoRaw);
  if (tipo.includes('cedula')) return 'CEDULA';
  if (tipo.includes('rnc')) return 'RNC';
  if ((documento || '').length === 11) return 'CEDULA';
  if ((documento || '').length === 9) return 'RNC';
  return 'OTRO';
};

const resolveHeaderMapping = (cells = []) => {
  const normalized = cells.map((cell) => normalizeHeaderKey(cell));
  const documentoIdx = findHeaderIndex(normalized, HEADER_ALIASES.documento);
  const nombreIdx = findHeaderIndex(normalized, HEADER_ALIASES.nombre);
  const looksLikeHeader = documentoIdx >= 0 && nombreIdx >= 0;

  const mapping = {
    documento: documentoIdx >= 0 ? documentoIdx : 0,
    nombre: nombreIdx >= 0 ? nombreIdx : 1,
    nombreComercial: findHeaderIndex(normalized, HEADER_ALIASES.nombreComercial),
    estado: findHeaderIndex(normalized, HEADER_ALIASES.estado),
    actividad: findHeaderIndex(normalized, HEADER_ALIASES.actividad),
    tipo: findHeaderIndex(normalized, HEADER_ALIASES.tipo),
  };

  return { looksLikeHeader, mapping };
};

const resolveRow = (cells = [], mapping = {}) => {
  if (!Array.isArray(cells) || cells.length === 0) return null;

  let documentoRaw = cells[mapping.documento] || '';
  if (!documentoRaw) {
    const candidate = cells.find((cell) => {
      const normalized = normalizeDocument(cell);
      return normalized.length >= 9 && normalized.length <= 20;
    });
    documentoRaw = candidate || '';
  }

  const documento = normalizeDocument(documentoRaw);
  if (!documento || documento.length < 9 || documento.length > 20) return null;

  const nombre =
    normalizeText(cells[mapping.nombre], 255) ||
    normalizeText(cells.find((cell, index) => index !== mapping.documento), 255);
  if (!nombre) return null;

  const tipoDocumento = inferTipoDocumento(documento, cells[mapping.tipo] || null);
  return {
    documento,
    documentoFormateado: normalizeText(documentoRaw, 25),
    tipoDocumento,
    nombre,
    nombreComercial: normalizeText(cells[mapping.nombreComercial], 255),
    estado: normalizeText(cells[mapping.estado], 120),
    actividadEconomica: normalizeText(cells[mapping.actividad], 255),
  };
};

const resolveInputSource = () => {
  const cliUrl = normalizeText(parsedArgs.url || null);
  const cliFile = normalizeText(parsedArgs.file || null);
  const envUrl = normalizeText(process.env.DGII_RNC_SOURCE_URL || null);
  const envFile = normalizeText(process.env.DGII_RNC_SOURCE_FILE || null);
  const sourceUrl = cliUrl || envUrl;
  const sourceFile = cliFile || envFile;

  if (sourceUrl) return { type: 'url', value: sourceUrl };
  if (sourceFile) return { type: 'file', value: sourceFile };

  throw new Error(
    'Define DGII_RNC_SOURCE_URL o DGII_RNC_SOURCE_FILE (tambien puedes usar --url o --file).'
  );
};

const createTempFilePath = () =>
  path.join(os.tmpdir(), `kanm-dgii-rnc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.txt`);

const downloadToFile = async (inputUrl, destination, redirectCount = 0) => {
  const url = new URL(inputUrl);
  const client = url.protocol === 'http:' ? http : https;

  await new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': process.env.DGII_RNC_USER_AGENT || DEFAULT_USER_AGENT,
          Accept: 'text/plain,text/csv,application/octet-stream,*/*',
        },
      },
      (response) => {
        const status = Number(response.statusCode) || 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error(`Demasiadas redirecciones al descargar ${inputUrl}`));
            return;
          }
          const redirectedUrl = new URL(location, inputUrl).toString();
          downloadToFile(redirectedUrl, destination, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Descarga fallida (${status}) para ${inputUrl}`));
          return;
        }

        const writer = fs.createWriteStream(destination);
        response.pipe(writer);
        writer.on('finish', () => resolve());
        writer.on('error', (error) => reject(error));
      }
    );

    request.on('error', (error) => reject(error));
    request.end();
  });
};

const ensureTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS dgii_rnc_cache (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      documento VARCHAR(20) NOT NULL,
      documento_formateado VARCHAR(25) NULL,
      tipo_documento VARCHAR(12) NOT NULL DEFAULT 'OTRO',
      nombre_o_razon_social VARCHAR(255) NOT NULL,
      nombre_comercial VARCHAR(255) NULL,
      estado VARCHAR(120) NULL,
      actividad_economica VARCHAR(255) NULL,
      fuente VARCHAR(60) NOT NULL DEFAULT 'DGII',
      fecha_fuente DATE NULL,
      lote_importacion VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_dgii_rnc_cache_documento (documento),
      KEY idx_dgii_rnc_cache_documento_formateado (documento_formateado),
      KEY idx_dgii_rnc_cache_tipo_documento (tipo_documento),
      KEY idx_dgii_rnc_cache_nombre (nombre_o_razon_social)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dgii_rnc_cache_imports (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      lote_importacion VARCHAR(64) NOT NULL,
      fuente VARCHAR(60) NOT NULL DEFAULT 'DGII',
      origen VARCHAR(255) NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'iniciado',
      lineas_total INT NOT NULL DEFAULT 0,
      registros_validos INT NOT NULL DEFAULT 0,
      descartados INT NOT NULL DEFAULT 0,
      mensaje TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      UNIQUE KEY uk_dgii_rnc_cache_imports_lote (lote_importacion),
      KEY idx_dgii_rnc_cache_imports_estado (estado),
      KEY idx_dgii_rnc_cache_imports_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};

const upsertBatch = async (batch, { loteImportacion, fuente, fechaFuente }) => {
  if (!Array.isArray(batch) || batch.length === 0) return;

  const placeholders = [];
  const params = [];
  for (const item of batch) {
    placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    params.push(
      item.documento,
      item.documentoFormateado,
      item.tipoDocumento,
      item.nombre,
      item.nombreComercial,
      item.estado,
      item.actividadEconomica,
      fuente,
      fechaFuente,
      loteImportacion
    );
  }

  await query(
    `
      INSERT INTO dgii_rnc_cache (
        documento, documento_formateado, tipo_documento, nombre_o_razon_social,
        nombre_comercial, estado, actividad_economica, fuente, fecha_fuente, lote_importacion
      )
      VALUES ${placeholders.join(', ')}
      ON DUPLICATE KEY UPDATE
        documento_formateado = VALUES(documento_formateado),
        tipo_documento = VALUES(tipo_documento),
        nombre_o_razon_social = VALUES(nombre_o_razon_social),
        nombre_comercial = VALUES(nombre_comercial),
        estado = VALUES(estado),
        actividad_economica = VALUES(actividad_economica),
        fuente = VALUES(fuente),
        fecha_fuente = VALUES(fecha_fuente),
        lote_importacion = VALUES(lote_importacion),
        updated_at = CURRENT_TIMESTAMP
    `,
    params
  );
};

const runImport = async (sourceFile, options = {}) => {
  const encoding = normalizeText(process.env.DGII_RNC_SOURCE_ENCODING || null) || 'latin1';
  const batchSize = Math.max(Number(process.env.DGII_RNC_BATCH_SIZE) || DEFAULT_BATCH_SIZE, 50);

  const stream = fs.createReadStream(sourceFile, { encoding });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let delimiter = null;
  let mapping = null;
  let lineNumber = 0;
  let validCount = 0;
  let skippedCount = 0;
  let batch = [];

  for await (let line of rl) {
    lineNumber += 1;
    if (lineNumber === 1) {
      line = line.replace(/^\uFEFF/, '');
    }
    if (!line || !line.trim()) continue;

    if (!delimiter) {
      delimiter = detectDelimiter(line);
    }

    const cells = splitDelimitedLine(line, delimiter);
    if (!mapping) {
      const headerData = resolveHeaderMapping(cells);
      mapping = headerData.mapping;
      if (headerData.looksLikeHeader) {
        continue;
      }
    }

    const row = resolveRow(cells, mapping);
    if (!row) {
      skippedCount += 1;
      continue;
    }

    validCount += 1;
    batch.push(row);

    if (batch.length >= batchSize) {
      await upsertBatch(batch, options);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await upsertBatch(batch, options);
  }

  return {
    lineasTotal: lineNumber,
    registrosValidos: validCount,
    descartados: skippedCount,
  };
};

const maybePruneOldRows = async (loteImportacion, fuente) => {
  const pruneEnabled =
    String(parsedArgs.prune || process.env.DGII_RNC_PRUNE || '0')
      .trim()
      .toLowerCase() === '1';
  if (!pruneEnabled) return 0;

  const result = await query(
    `
      DELETE FROM dgii_rnc_cache
      WHERE fuente = ?
        AND (lote_importacion IS NULL OR lote_importacion <> ?)
    `,
    [fuente, loteImportacion]
  );

  return Number(result?.affectedRows) || 0;
};

const createImportLog = async ({ loteImportacion, fuente, origen }) => {
  await query(
    `
      INSERT INTO dgii_rnc_cache_imports (lote_importacion, fuente, origen, estado)
      VALUES (?, ?, ?, 'iniciado')
    `,
    [loteImportacion, fuente, origen]
  );
};

const finishImportLog = async ({ loteImportacion, estado, metrics, mensaje }) => {
  await query(
    `
      UPDATE dgii_rnc_cache_imports
         SET estado = ?,
             lineas_total = ?,
             registros_validos = ?,
             descartados = ?,
             mensaje = ?,
             finished_at = CURRENT_TIMESTAMP
       WHERE lote_importacion = ?
    `,
    [
      estado,
      Number(metrics?.lineasTotal) || 0,
      Number(metrics?.registrosValidos) || 0,
      Number(metrics?.descartados) || 0,
      mensaje || null,
      loteImportacion,
    ]
  );
};

const main = async () => {
  const inputSource = resolveInputSource();
  const fuente = normalizeText(process.env.DGII_RNC_SOURCE_NAME || null) || 'DGII';
  const fechaFuente = normalizeText(process.env.DGII_RNC_SOURCE_DATE || null);
  const loteImportacion = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  let metrics = { lineasTotal: 0, registrosValidos: 0, descartados: 0 };
  let deleteCount = 0;
  let localFile = '';
  let downloaded = false;

  await ensureTables();
  await createImportLog({
    loteImportacion,
    fuente,
    origen: inputSource.value,
  });

  try {
    if (inputSource.type === 'url') {
      localFile = createTempFilePath();
      downloaded = true;
      console.log(`[DGII-RNC] Descargando archivo desde ${inputSource.value}`);
      await downloadToFile(inputSource.value, localFile);
    } else {
      localFile = path.resolve(inputSource.value);
      const exists = fs.existsSync(localFile);
      if (!exists) {
        throw new Error(`No existe el archivo fuente: ${localFile}`);
      }
    }

    if (localFile.toLowerCase().endsWith('.zip')) {
      throw new Error('El archivo fuente es .zip. Usa CSV/TXT directo o descomprime antes de importar.');
    }

    console.log(`[DGII-RNC] Importando desde ${localFile}`);
    metrics = await runImport(localFile, { loteImportacion, fuente, fechaFuente });
    deleteCount = await maybePruneOldRows(loteImportacion, fuente);

    await finishImportLog({
      loteImportacion,
      estado: 'completado',
      metrics,
      mensaje: `Importacion completada. Filas limpiadas: ${deleteCount}`,
    });

    console.log(
      `[DGII-RNC] OK lote=${loteImportacion} lineas=${metrics.lineasTotal} validos=${metrics.registrosValidos} descartados=${metrics.descartados} purgados=${deleteCount}`
    );
  } catch (error) {
    await finishImportLog({
      loteImportacion,
      estado: 'fallido',
      metrics,
      mensaje: error?.message || String(error),
    });
    throw error;
  } finally {
    if (downloaded && localFile) {
      await fsp.unlink(localFile).catch(() => {});
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[DGII-RNC] Error:', error?.message || error);
    process.exit(1);
  });
