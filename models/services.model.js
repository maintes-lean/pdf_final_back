import db from "../config/db.js";

/* =========================================
GET SERVICIOS POR COTIZACION (lectura global)
========================================= */
export async function getServiciosByCotizacion(cotizacionId) {
  const [rows] = await db.query(
    `
    SELECT s.*
    FROM servicios s
    WHERE s.cotizacion_id = ?
    ORDER BY s.id ASC
    `,
    [cotizacionId]
  );

  return rows;
}

/* =========================================
GET SERVICIO BY ID (solo owner)
========================================= */
export async function getServicioById(id, userId) {
  const [rows] = await db.query(
    `
    SELECT s.*
    FROM servicios s
    WHERE s.id = ?
      AND s.created_by = ?
    `,
    [id, userId]
  );

  return rows[0] || null;
}

/* =========================================
CREATE SERVICIO
========================================= */
export async function createServicio(conn, data) {
  const {
    cotizacion_id,
    categoria,
    descripcion,
    observaciones,
    moneda,
    precio,
    adultos,
    menores,
    subtotal,
    userId
  } = data;

  const [check] = await conn.query(
    `
    SELECT id
    FROM cotizaciones
    WHERE id = ?
    `,
    [cotizacion_id]
  );

  if (check.length === 0) {
    throw new Error("Cotización no válida");
  }

  const [result] = await conn.query(
    `
    INSERT INTO servicios
    (
      cotizacion_id,
      categoria,
      descripcion,
      observaciones,
      moneda,
      precio,
      adultos,
      menores,
      subtotal,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      cotizacion_id,
      categoria,
      descripcion,
      observaciones,
      moneda,
      precio,
      adultos,
      menores,
      subtotal,
      userId
    ]
  );

  return result.insertId;
}

/* =========================================
UPDATE SERVICIO (solo owner)
========================================= */
export async function updateServicio(conn, id, data, userId) {
  const {
    categoria,
    descripcion,
    observaciones,
    moneda,
    precio,
    adultos,
    menores,
    subtotal
  } = data;

  const [result] = await conn.query(
    `
    UPDATE servicios
    SET
      categoria = ?,
      descripcion = ?,
      observaciones = ?,
      moneda = ?,
      precio = ?,
      adultos = ?,
      menores = ?,
      subtotal = ?
    WHERE id = ?
      AND created_by = ?
    `,
    [
      categoria,
      descripcion,
      observaciones,
      moneda,
      precio,
      adultos,
      menores,
      subtotal,
      id,
      userId
    ]
  );

  return result.affectedRows > 0;
}

/* =========================================
DELETE SERVICIO (solo owner)
========================================= */
export async function deleteServicio(conn, id, userId) {
  const [result] = await conn.query(
    `
    DELETE FROM servicios
    WHERE id = ?
      AND created_by = ?
    `,
    [id, userId]
  );

  return result.affectedRows > 0;
}

/* =========================================
TOTALES POR COTIZACION (lectura global)
========================================= */
export async function getTotalsByCotizacion(cotizacionId) {
  const [rows] = await db.query(
    `
    SELECT s.moneda, SUM(s.subtotal) AS total
    FROM servicios s
    WHERE s.cotizacion_id = ?
    GROUP BY s.moneda
    `,
    [cotizacionId]
  );

  return rows;
}