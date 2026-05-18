import pool from "../config/db.js";

let tableReady = false;

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM ${tableName} LIKE ?`,
    [columnName]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(tableName, columnName, definition) {
  const exists = await columnExists(tableName, columnName);
  if (!exists) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export async function ensureInternalDocumentsTable() {
  if (tableReady) return;

  /*
    IMPORTANTE:
    En algunas instalaciones de prueba ya existía una tabla internal_documents
    creada con una estructura vieja: content en vez de content_html/content_text.
    Por eso esta función no solo crea la tabla; también migra columnas faltantes.
  */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content_html LONGTEXT NULL,
      content_text LONGTEXT NULL,
      template_type VARCHAR(80) NULL DEFAULT 'blank',
      client_id INT NULL,
      viaje_id INT NULL,
      cotizacion_id INT NULL,
      is_template TINYINT(1) NOT NULL DEFAULT 0,
      favorite TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT NULL,
      updated_by INT NULL,
      deleted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await addColumnIfMissing("internal_documents", "title", "VARCHAR(255) NOT NULL DEFAULT 'Documento sin título'");
  await addColumnIfMissing("internal_documents", "content_html", "LONGTEXT NULL");
  await addColumnIfMissing("internal_documents", "content_text", "LONGTEXT NULL");
  await addColumnIfMissing("internal_documents", "template_type", "VARCHAR(80) NULL DEFAULT 'blank'");
  await addColumnIfMissing("internal_documents", "client_id", "INT NULL");
  await addColumnIfMissing("internal_documents", "viaje_id", "INT NULL");
  await addColumnIfMissing("internal_documents", "cotizacion_id", "INT NULL");
  await addColumnIfMissing("internal_documents", "is_template", "TINYINT(1) NOT NULL DEFAULT 0");
  await addColumnIfMissing("internal_documents", "favorite", "TINYINT(1) NOT NULL DEFAULT 0");
  await addColumnIfMissing("internal_documents", "created_by", "INT NULL");
  await addColumnIfMissing("internal_documents", "updated_by", "INT NULL");
  await addColumnIfMissing("internal_documents", "deleted_at", "DATETIME NULL");
  await addColumnIfMissing("internal_documents", "created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing("internal_documents", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  const hasOldContent = await columnExists("internal_documents", "content");
  if (hasOldContent) {
    await pool.query(`
      UPDATE internal_documents
      SET
        content_html = COALESCE(NULLIF(content_html, ''), content),
        content_text = COALESCE(NULLIF(content_text, ''), content)
      WHERE content IS NOT NULL
    `);
  }

  // Índices defensivos. Si ya existen, MySQL devuelve error; lo ignoramos.
  const indexQueries = [
    "CREATE INDEX idx_internal_documents_client_id ON internal_documents (client_id)",
    "CREATE INDEX idx_internal_documents_viaje_id ON internal_documents (viaje_id)",
    "CREATE INDEX idx_internal_documents_cotizacion_id ON internal_documents (cotizacion_id)",
    "CREATE INDEX idx_internal_documents_deleted_at ON internal_documents (deleted_at)"
  ];

  for (const sql of indexQueries) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (err?.code !== "ER_DUP_KEYNAME") {
        console.warn("No se pudo crear índice de internal_documents:", err.message);
      }
    }
  }

  tableReady = true;
}

function normalizeDocument(row) {
  if (!row) return null;
  return {
    ...row,
    is_template: Number(row.is_template || 0),
    favorite: Number(row.favorite || 0)
  };
}

export async function listInternalDocuments(filters = {}) {
  await ensureInternalDocumentsTable();

  const where = ["d.deleted_at IS NULL"];
  const params = [];

  if (filters.client_id) {
    where.push("d.client_id = ?");
    params.push(Number(filters.client_id));
  }

  if (filters.viaje_id) {
    where.push("d.viaje_id = ?");
    params.push(Number(filters.viaje_id));
  }

  if (filters.cotizacion_id) {
    where.push("d.cotizacion_id = ?");
    params.push(Number(filters.cotizacion_id));
  }

  if (filters.is_template !== undefined && filters.is_template !== "") {
    where.push("d.is_template = ?");
    params.push(Number(filters.is_template));
  }

  if (filters.search) {
    where.push("(d.title LIKE ? OR d.content_text LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const [rows] = await pool.query(
    `
      SELECT
        d.id,
        d.title,
        d.template_type,
        d.client_id,
        c.nombre AS client_name,
        d.viaje_id,
        v.nombre AS travel_name,
        v.destino AS travel_destination,
        d.cotizacion_id,
        q.titulo AS quote_title,
        d.is_template,
        d.favorite,
        d.created_at,
        d.updated_at
      FROM internal_documents d
      LEFT JOIN clientes c ON c.id = d.client_id
      LEFT JOIN viajes v ON v.id = d.viaje_id
      LEFT JOIN cotizaciones q ON q.id = d.cotizacion_id
      WHERE ${where.join(" AND ")}
      ORDER BY d.favorite DESC, d.updated_at DESC, d.id DESC
    `,
    params
  );

  return rows.map(normalizeDocument);
}

export async function getInternalDocumentById(id) {
  await ensureInternalDocumentsTable();

  const [rows] = await pool.query(
    `
      SELECT
        d.*,
        c.nombre AS client_name,
        v.nombre AS travel_name,
        v.destino AS travel_destination,
        q.titulo AS quote_title
      FROM internal_documents d
      LEFT JOIN clientes c ON c.id = d.client_id
      LEFT JOIN viajes v ON v.id = d.viaje_id
      LEFT JOIN cotizaciones q ON q.id = d.cotizacion_id
      WHERE d.id = ? AND d.deleted_at IS NULL
      LIMIT 1
    `,
    [Number(id)]
  );

  return normalizeDocument(rows[0]);
}

export async function createInternalDocument(payload = {}) {
  await ensureInternalDocumentsTable();

  const [result] = await pool.query(
    `
      INSERT INTO internal_documents
        (title, content_html, content_text, template_type, client_id, viaje_id, cotizacion_id, is_template, favorite, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.title || "Documento sin título",
      payload.content_html || "",
      payload.content_text || "",
      payload.template_type || "blank",
      payload.client_id || null,
      payload.viaje_id || null,
      payload.cotizacion_id || null,
      Number(payload.is_template || 0),
      Number(payload.favorite || 0),
      payload.user_id || null,
      payload.user_id || null
    ]
  );

  return getInternalDocumentById(result.insertId);
}

export async function updateInternalDocument(id, payload = {}) {
  await ensureInternalDocumentsTable();

  await pool.query(
    `
      UPDATE internal_documents
      SET
        title = COALESCE(?, title),
        content_html = COALESCE(?, content_html),
        content_text = COALESCE(?, content_text),
        template_type = COALESCE(?, template_type),
        client_id = ?,
        viaje_id = ?,
        cotizacion_id = ?,
        is_template = COALESCE(?, is_template),
        favorite = COALESCE(?, favorite),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `,
    [
      payload.title ?? null,
      payload.content_html ?? null,
      payload.content_text ?? null,
      payload.template_type ?? null,
      payload.client_id || null,
      payload.viaje_id || null,
      payload.cotizacion_id || null,
      payload.is_template !== undefined ? Number(payload.is_template) : null,
      payload.favorite !== undefined ? Number(payload.favorite) : null,
      payload.user_id || null,
      Number(id)
    ]
  );

  return getInternalDocumentById(id);
}

export async function duplicateInternalDocument(id, userId = null) {
  const source = await getInternalDocumentById(id);
  if (!source) return null;

  return createInternalDocument({
    title: `${source.title} - copia`,
    content_html: source.content_html || "",
    content_text: source.content_text || "",
    template_type: source.template_type || "blank",
    client_id: source.client_id || null,
    viaje_id: source.viaje_id || null,
    cotizacion_id: source.cotizacion_id || null,
    is_template: source.is_template || 0,
    favorite: 0,
    user_id: userId
  });
}

export async function softDeleteInternalDocument(id, userId = null) {
  await ensureInternalDocumentsTable();

  const [result] = await pool.query(
    `
      UPDATE internal_documents
      SET deleted_at = NOW(), updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `,
    [userId || null, Number(id)]
  );

  return result.affectedRows > 0;
}
