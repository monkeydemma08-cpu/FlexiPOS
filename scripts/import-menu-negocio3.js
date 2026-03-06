require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse } = require('pdf-parse');
const { pool } = require('../db-mysql');
const runMigrations = require('../migrations/mysql-multi-negocio');
const {
  NEGOCIO_ID_PRUEBA,
  MESAS_PRUEBA,
  MENU_NEGOCIO_3,
} = require('./menu-negocio3-catalogo');

const negocioId = Number(process.argv[2] || process.env.NEGOCIO_ID_MENU || NEGOCIO_ID_PRUEBA) || NEGOCIO_ID_PRUEBA;

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const roundMoney = (value) => Number((Number(value) || 0).toFixed(2));

const resolvePdfPath = () => {
  const customPath = process.env.MENU_PDF_PATH ? path.resolve(process.env.MENU_PDF_PATH) : null;
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const downloadsDir = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');
  if (!downloadsDir || !fs.existsSync(downloadsDir)) {
    return null;
  }

  const candidate = fs
    .readdirSync(downloadsDir)
    .find((entry) => /empanadoteca/i.test(entry) && /\.pdf$/i.test(entry));
  return candidate ? path.join(downloadsDir, candidate) : null;
};

const readPdfSummary = async (pdfPath) => {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return { ok: false, reason: 'PDF no encontrado.' };
  }

  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = String(result?.text || '');
    return {
      ok: /Masa Venezolana/i.test(text) && /Masa Tradicional/i.test(text),
      pages: result?.total || 0,
      sample: text.slice(0, 800),
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
};

const flattenCatalog = () =>
  MENU_NEGOCIO_3.flatMap((categoria) =>
    categoria.productos.map((producto) => ({
      ...producto,
      categoria_nombre: categoria.nombre,
      area_preparacion: categoria.area_preparacion,
    }))
  );

const ensurePublicAccess = async (connection, mesa) => {
  const [rows] = await connection.execute(
    `SELECT id, token
       FROM menu_publico_accesos
      WHERE negocio_id = ? AND tipo = 'mesa' AND mesa = ?
      LIMIT 1`,
    [negocioId, mesa]
  );

  if (rows.length) {
    await connection.execute(
      `UPDATE menu_publico_accesos
          SET nombre = ?, activo = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND negocio_id = ?`,
      [mesa, rows[0].id, negocioId]
    );
    return rows[0].token;
  }

  while (true) {
    const token = crypto.randomBytes(18).toString('hex');
    try {
      await connection.execute(
        `INSERT INTO menu_publico_accesos (negocio_id, token, nombre, mesa, tipo, activo)
         VALUES (?, ?, ?, ?, 'mesa', 1)`,
        [negocioId, token, mesa, mesa]
      );
      return token;
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
  }
};

const main = async () => {
  await runMigrations();

  const pdfPath = resolvePdfPath();
  const pdfSummary = await readPdfSummary(pdfPath);

  const connection = await pool.getConnection();
  try {
    const [negocioRows] = await connection.execute(
      'SELECT id, nombre, slug, activo FROM negocios WHERE id = ? LIMIT 1',
      [negocioId]
    );
    if (!negocioRows.length) {
      throw new Error(`Negocio ${negocioId} no existe.`);
    }

    const negocio = negocioRows[0];
    const catalogoPlano = flattenCatalog();
    const importedCategoryKeys = new Set(MENU_NEGOCIO_3.map((categoria) => normalizeKey(categoria.nombre)));
    const importedProductKeys = new Set(catalogoPlano.map((producto) => normalizeKey(producto.nombre)));
    const categoriasMap = new Map();
    const resumen = {
      negocio,
      pdf: {
        path: pdfPath,
        validado: pdfSummary.ok,
        paginas: pdfSummary.pages || 0,
      },
      categorias_creadas: 0,
      categorias_actualizadas: 0,
      productos_creados: 0,
      productos_actualizados: 0,
      productos_desactivados: 0,
      qr: [],
    };

    await connection.beginTransaction();

    for (const categoria of MENU_NEGOCIO_3) {
      const [rows] = await connection.execute(
        'SELECT id, nombre FROM categorias WHERE negocio_id = ? AND LOWER(nombre) = LOWER(?) LIMIT 1',
        [negocioId, categoria.nombre]
      );

      if (rows.length) {
        await connection.execute(
          `UPDATE categorias
              SET nombre = ?, area_preparacion = ?, activo = 1, actualizado_en = CURRENT_TIMESTAMP
            WHERE id = ? AND negocio_id = ?`,
          [categoria.nombre, categoria.area_preparacion, rows[0].id, negocioId]
        );
        categoriasMap.set(categoria.nombre, rows[0].id);
        resumen.categorias_actualizadas += 1;
        continue;
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO categorias (nombre, activo, area_preparacion, actualizado_en, negocio_id)
         VALUES (?, 1, ?, CURRENT_TIMESTAMP, ?)`,
        [categoria.nombre, categoria.area_preparacion, negocioId]
      );
      categoriasMap.set(categoria.nombre, insertResult.insertId);
      resumen.categorias_creadas += 1;
    }

    for (const producto of catalogoPlano) {
      const categoriaId = categoriasMap.get(producto.categoria_nombre);
      const [rows] = await connection.execute(
        `SELECT id, stock_indefinido
           FROM productos
          WHERE negocio_id = ? AND LOWER(nombre) = LOWER(?)
          LIMIT 1`,
        [negocioId, producto.nombre]
      );

      if (rows.length) {
        await connection.execute(
          `UPDATE productos
              SET nombre = ?, categoria_id = ?, precio = ?, precios = NULL, activo = 1
            WHERE id = ? AND negocio_id = ?`,
          [producto.nombre, categoriaId, roundMoney(producto.precio), rows[0].id, negocioId]
        );
        resumen.productos_actualizados += 1;
        continue;
      }

      await connection.execute(
        `INSERT INTO productos (
           nombre, precio, precios, costo_base_sin_itbis, costo_promedio_actual, ultimo_costo_sin_itbis,
           actualiza_costo_con_compras, costo_unitario_real, costo_unitario_real_incluye_itbis,
           tipo_producto, insumo_vendible, unidad_base, contenido_por_unidad,
           stock, stock_indefinido, categoria_id, activo, negocio_id
         ) VALUES (?, ?, NULL, 0, 0, 0, 1, 0, 0, 'FINAL', 0, 'UND', 1, NULL, 1, ?, 1, ?)`,
        [producto.nombre, roundMoney(producto.precio), categoriaId, negocioId]
      );
      resumen.productos_creados += 1;
    }

    const importedProductList = Array.from(importedProductKeys.values());
    if (importedProductList.length) {
      const placeholders = importedProductList.map(() => '?').join(', ');
      const [updateResult] = await connection.execute(
        `UPDATE productos
            SET activo = 0
          WHERE negocio_id = ?
            AND COALESCE(tipo_producto, 'FINAL') = 'FINAL'
            AND LOWER(nombre) NOT IN (${placeholders})`,
        [negocioId, ...importedProductList]
      );
      resumen.productos_desactivados = Number(updateResult.affectedRows) || 0;
    }

    const importedCategoryList = Array.from(importedCategoryKeys.values());
    if (importedCategoryList.length) {
      const placeholders = importedCategoryList.map(() => '?').join(', ');
      await connection.execute(
        `UPDATE categorias
            SET activo = 0, actualizado_en = CURRENT_TIMESTAMP
          WHERE negocio_id = ?
            AND LOWER(nombre) NOT IN (${placeholders})`,
        [negocioId, ...importedCategoryList]
      );
    }

    for (const mesa of MESAS_PRUEBA) {
      const token = await ensurePublicAccess(connection, mesa);
      resumen.qr.push({
        mesa,
        token,
        url: `/menu/${token}`,
      });
    }

    await connection.commit();
    console.log(JSON.stringify(resumen, null, 2));
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
