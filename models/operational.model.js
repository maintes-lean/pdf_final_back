import pool from "../config/db.js";

let operationalTablesReady = false;

export async function ensureOperationalTables() {
  if (operationalTablesReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS travel_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pendiente',
      priority VARCHAR(30) NOT NULL DEFAULT 'media',
      due_date DATE NULL,
      client_id INT NULL,
      viaje_id INT NULL,
      cotizacion_id INT NULL,
      assigned_to INT NULL,
      created_by INT NULL,
      completed_at DATETIME NULL,
      deleted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_travel_tasks_client_id (client_id),
      INDEX idx_travel_tasks_viaje_id (viaje_id),
      INDEX idx_travel_tasks_status (status),
      INDEX idx_travel_tasks_due_date (due_date),
      CONSTRAINT fk_travel_tasks_client FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE SET NULL,
      CONSTRAINT fk_travel_tasks_viaje FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE SET NULL,
      CONSTRAINT fk_travel_tasks_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
      CONSTRAINT fk_travel_tasks_assigned FOREIGN KEY (assigned_to) REFERENCES usuarios(id) ON DELETE SET NULL,
      CONSTRAINT fk_travel_tasks_created FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS travel_checklist_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      viaje_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(80) NULL,
      is_done TINYINT(1) NOT NULL DEFAULT 0,
      orden INT NOT NULL DEFAULT 0,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_checklist_viaje_id (viaje_id),
      CONSTRAINT fk_checklist_viaje FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE CASCADE,
      CONSTRAINT fk_checklist_created FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_approvals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cotizacion_id INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pendiente',
      approved_by_name VARCHAR(255) NULL,
      approved_by_contact VARCHAR(255) NULL,
      notes TEXT NULL,
      approved_at DATETIME NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_quote_approval (cotizacion_id),
      CONSTRAINT fk_quote_approvals_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
      CONSTRAINT fk_quote_approvals_created FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
      CONSTRAINT fk_quote_approvals_updated FOREIGN KEY (updated_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  operationalTablesReady = true;
}

export async function getOperationalDashboard() {
  await ensureOperationalTables();

  const [[clients]] = await pool.query(`SELECT COUNT(*) AS total FROM clientes`);
  const [[travels]] = await pool.query(`SELECT COUNT(*) AS total FROM viajes`);
  const [[quotes]] = await pool.query(`SELECT COUNT(*) AS total FROM cotizaciones`);
  const [[tasksOpen]] = await pool.query(`SELECT COUNT(*) AS total FROM travel_tasks WHERE deleted_at IS NULL AND status <> 'completada'`);
  const [[tasksDue]] = await pool.query(`SELECT COUNT(*) AS total FROM travel_tasks WHERE deleted_at IS NULL AND status <> 'completada' AND due_date IS NOT NULL AND due_date <= CURDATE()`);
  const [[pdfs]] = await pool.query(`SELECT COUNT(*) AS total FROM pdfs`);

  const [travelStatus] = await pool.query(`
    SELECT COALESCE(NULLIF(estado, ''), 'sin_estado') AS estado, COUNT(*) AS total
    FROM viajes
    GROUP BY COALESCE(NULLIF(estado, ''), 'sin_estado')
    ORDER BY total DESC
  `);

  const [recentTravels] = await pool.query(`
    SELECT v.id, v.nombre, v.destino, v.fecha_inicio, v.estado, c.nombre AS client_name, v.updated_at
    FROM viajes v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    ORDER BY v.updated_at DESC
    LIMIT 8
  `);

  const [nextTasks] = await pool.query(`
    SELECT t.*, c.nombre AS client_name, v.nombre AS travel_name, v.destino AS travel_destination
    FROM travel_tasks t
    LEFT JOIN clientes c ON c.id = t.client_id
    LEFT JOIN viajes v ON v.id = t.viaje_id
    WHERE t.deleted_at IS NULL AND t.status <> 'completada'
    ORDER BY ISNULL(t.due_date), t.due_date ASC, FIELD(t.priority, 'alta','media','baja'), t.updated_at DESC
    LIMIT 10
  `);

  return {
    totals: {
      clients: clients.total || 0,
      travels: travels.total || 0,
      quotes: quotes.total || 0,
      openTasks: tasksOpen.total || 0,
      dueTasks: tasksDue.total || 0,
      pdfs: pdfs.total || 0
    },
    travelStatus,
    recentTravels,
    nextTasks
  };
}

export async function globalSearch(q = '') {
  await ensureOperationalTables();
  const term = String(q || '').trim();
  if (!term) return [];
  const like = `%${term}%`;

  const [clients] = await pool.query(`
    SELECT 'cliente' AS type, id, nombre AS title, email AS subtitle, telefono AS extra, updated_at
    FROM clientes
    WHERE nombre LIKE ? OR email LIKE ? OR telefono LIKE ? OR notas LIKE ?
    LIMIT 10
  `, [like, like, like, like]);

  const [travels] = await pool.query(`
    SELECT 'viaje' AS type, v.id, COALESCE(v.nombre, v.destino, CONCAT('Viaje ', v.id)) AS title,
           c.nombre AS subtitle, CONCAT_WS(' | ', v.destino, v.estado) AS extra, v.updated_at,
           v.cliente_id AS client_id
    FROM viajes v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE v.nombre LIKE ? OR v.destino LIKE ? OR v.pasajero LIKE ? OR v.notas LIKE ? OR c.nombre LIKE ?
    LIMIT 10
  `, [like, like, like, like, like]);

  const [quotes] = await pool.query(`
    SELECT 'cotizacion' AS type, q.id, COALESCE(q.titulo, CONCAT('Cotización ', q.id)) AS title,
           COALESCE(v.nombre, v.destino) AS subtitle, c.nombre AS extra, q.updated_at,
           v.cliente_id AS client_id, q.viaje_id
    FROM cotizaciones q
    LEFT JOIN viajes v ON v.id = q.viaje_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE q.titulo LIKE ? OR q.condicion_legal LIKE ? OR v.nombre LIKE ? OR v.destino LIKE ? OR c.nombre LIKE ?
    LIMIT 10
  `, [like, like, like, like, like]);

  let docs = [];
  try {
    const [rows] = await pool.query(`
      SELECT 'documento' AS type, d.id, d.title, c.nombre AS subtitle, COALESCE(v.nombre, v.destino, q.titulo) AS extra, d.updated_at,
             d.client_id, d.viaje_id, d.cotizacion_id
      FROM internal_documents d
      LEFT JOIN clientes c ON c.id = d.client_id
      LEFT JOIN viajes v ON v.id = d.viaje_id
      LEFT JOIN cotizaciones q ON q.id = d.cotizacion_id
      WHERE d.deleted_at IS NULL AND (d.title LIKE ? OR COALESCE(d.content_text, '') LIKE ? OR COALESCE(d.content_html, '') LIKE ?)
      LIMIT 10
    `, [like, like, like]);
    docs = rows;
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE' && err?.code !== 'ER_BAD_FIELD_ERROR') {
      throw err;
    }
    console.warn('Búsqueda global: se omitió internal_documents porque la tabla/columnas aún no existen.');
  }

  const results = [...clients, ...travels, ...quotes, ...docs]
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 30);

  return results;
}

export async function getClientTimeline(clientId) {
  await ensureOperationalTables();
  const id = Number(clientId);
  if (!id) return [];
  const items = [];

  const [travels] = await pool.query(`
    SELECT id, COALESCE(nombre, destino, CONCAT('Viaje ', id)) AS title, destino, estado, created_at, updated_at
    FROM viajes WHERE cliente_id = ?
  `, [id]);
  travels.forEach(v => items.push({ type: 'viaje', title: v.title, description: `${v.destino || ''} ${v.estado ? '· ' + v.estado : ''}`.trim(), date: v.created_at, ref_id: v.id }));

  const [quotes] = await pool.query(`
    SELECT q.id, COALESCE(q.titulo, CONCAT('Cotización ', q.id)) AS title, q.estado, q.created_at, q.updated_at, q.viaje_id
    FROM cotizaciones q
    JOIN viajes v ON v.id = q.viaje_id
    WHERE v.cliente_id = ?
  `, [id]);
  quotes.forEach(q => items.push({ type: 'cotizacion', title: q.title, description: q.estado || '', date: q.created_at, ref_id: q.id, viaje_id: q.viaje_id }));

  const [pdfs] = await pool.query(`
    SELECT p.id, p.nombre, p.tipo, p.created_at, q.viaje_id
    FROM pdfs p
    JOIN cotizaciones q ON q.id = p.cotizacion_id
    JOIN viajes v ON v.id = q.viaje_id
    WHERE v.cliente_id = ?
  `, [id]);
  pdfs.forEach(p => items.push({ type: 'pdf', title: p.nombre || 'PDF generado', description: p.tipo || '', date: p.created_at, ref_id: p.id, viaje_id: p.viaje_id }));

  try {
    const [documents] = await pool.query(`
      SELECT id, title, template_type, created_at, updated_at, viaje_id, cotizacion_id
      FROM internal_documents
      WHERE deleted_at IS NULL AND client_id = ?
    `, [id]);
    documents.forEach(d => items.push({ type: 'documento', title: d.title, description: d.template_type || '', date: d.updated_at || d.created_at, ref_id: d.id, viaje_id: d.viaje_id, cotizacion_id: d.cotizacion_id }));
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE' && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
    console.warn('Timeline: se omitió internal_documents porque la tabla/columnas aún no existen.');
  }

  try {
    const [tasks] = await pool.query(`
      SELECT id, title, status, priority, due_date, created_at, viaje_id, cotizacion_id
      FROM travel_tasks
      WHERE deleted_at IS NULL AND client_id = ?
    `, [id]);
    tasks.forEach(t => items.push({ type: 'tarea', title: t.title, description: `${t.status} · ${t.priority}${t.due_date ? ' · vence ' + t.due_date : ''}`, date: t.due_date || t.created_at, ref_id: t.id, viaje_id: t.viaje_id, cotizacion_id: t.cotizacion_id }));
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE' && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
    console.warn('Timeline: se omitió travel_tasks porque la tabla/columnas aún no existen.');
  }

  return items
    .filter(i => i.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 80);
}

export async function listTasks(filters = {}) {
  await ensureOperationalTables();
  const where = ['t.deleted_at IS NULL'];
  const params = [];
  if (filters.client_id) { where.push('t.client_id = ?'); params.push(Number(filters.client_id)); }
  if (filters.viaje_id) { where.push('t.viaje_id = ?'); params.push(Number(filters.viaje_id)); }
  if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }

  const [rows] = await pool.query(`
    SELECT t.*, c.nombre AS client_name, v.nombre AS travel_name, v.destino AS travel_destination, q.titulo AS quote_title
    FROM travel_tasks t
    LEFT JOIN clientes c ON c.id = t.client_id
    LEFT JOIN viajes v ON v.id = t.viaje_id
    LEFT JOIN cotizaciones q ON q.id = t.cotizacion_id
    WHERE ${where.join(' AND ')}
    ORDER BY FIELD(t.status, 'pendiente','en_proceso','completada'), ISNULL(t.due_date), t.due_date ASC, t.updated_at DESC
  `, params);
  return rows;
}

export async function createTask(payload = {}) {
  await ensureOperationalTables();
  const [result] = await pool.query(`
    INSERT INTO travel_tasks (title, description, status, priority, due_date, client_id, viaje_id, cotizacion_id, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.title || 'Nueva tarea',
    payload.description || null,
    payload.status || 'pendiente',
    payload.priority || 'media',
    payload.due_date || null,
    payload.client_id || null,
    payload.viaje_id || null,
    payload.cotizacion_id || null,
    payload.assigned_to || null,
    payload.user_id || null
  ]);
  return getTaskById(result.insertId);
}

export async function getTaskById(id) {
  await ensureOperationalTables();
  const [rows] = await pool.query(`SELECT * FROM travel_tasks WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(id)]);
  return rows[0] || null;
}

export async function updateTask(id, payload = {}) {
  await ensureOperationalTables();
  await pool.query(`
    UPDATE travel_tasks
    SET title = COALESCE(?, title), description = ?, status = COALESCE(?, status), priority = COALESCE(?, priority), due_date = ?,
        client_id = ?, viaje_id = ?, cotizacion_id = ?, assigned_to = ?,
        completed_at = CASE WHEN ? = 'completada' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND deleted_at IS NULL
  `, [
    payload.title ?? null,
    payload.description ?? null,
    payload.status ?? null,
    payload.priority ?? null,
    payload.due_date || null,
    payload.client_id || null,
    payload.viaje_id || null,
    payload.cotizacion_id || null,
    payload.assigned_to || null,
    payload.status || null,
    Number(id)
  ]);
  return getTaskById(id);
}

export async function deleteTask(id) {
  await ensureOperationalTables();
  const [result] = await pool.query(`UPDATE travel_tasks SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [Number(id)]);
  return result.affectedRows > 0;
}

const DEFAULT_CHECKLIST = [
  ['documentacion', 'Documentación del cliente cargada'],
  ['cotizacion', 'Cotización creada'],
  ['servicios', 'Servicios cargados'],
  ['operacion', 'Operadores revisados'],
  ['voucher', 'Vouchers y pasajes cargados'],
  ['itinerario', 'Itinerario final cargado o creado'],
  ['pdf', 'PDF generado y revisado'],
  ['seguimiento', 'Cliente contactado / seguimiento realizado']
];

export async function ensureChecklistForTravel(viajeId, userId = null) {
  await ensureOperationalTables();
  const id = Number(viajeId);
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM travel_checklist_items WHERE viaje_id = ?`, [id]);
  if (!count.total) {
    for (let i = 0; i < DEFAULT_CHECKLIST.length; i++) {
      const [category, title] = DEFAULT_CHECKLIST[i];
      await pool.query(`
        INSERT INTO travel_checklist_items (viaje_id, title, category, orden, created_by)
        VALUES (?, ?, ?, ?, ?)
      `, [id, title, category, i + 1, userId || null]);
    }
  }
}

export async function getChecklist(viajeId, userId = null) {
  await ensureChecklistForTravel(viajeId, userId);
  const [rows] = await pool.query(`
    SELECT * FROM travel_checklist_items
    WHERE viaje_id = ?
    ORDER BY is_done ASC, orden ASC, id ASC
  `, [Number(viajeId)]);
  return rows;
}

export async function addChecklistItem(payload = {}) {
  await ensureOperationalTables();
  const [result] = await pool.query(`
    INSERT INTO travel_checklist_items (viaje_id, title, category, orden, created_by)
    VALUES (?, ?, ?, COALESCE(?, 99), ?)
  `, [payload.viaje_id, payload.title || 'Nuevo ítem', payload.category || null, payload.orden || 99, payload.user_id || null]);
  const [rows] = await pool.query(`SELECT * FROM travel_checklist_items WHERE id = ?`, [result.insertId]);
  return rows[0];
}

export async function toggleChecklistItem(id) {
  await ensureOperationalTables();
  await pool.query(`UPDATE travel_checklist_items SET is_done = IF(is_done = 1, 0, 1) WHERE id = ?`, [Number(id)]);
  const [rows] = await pool.query(`SELECT * FROM travel_checklist_items WHERE id = ?`, [Number(id)]);
  return rows[0];
}

export async function upsertQuoteApproval(cotizacionId, payload = {}) {
  await ensureOperationalTables();
  const status = payload.status || 'pendiente';
  await pool.query(`
    INSERT INTO quote_approvals (cotizacion_id, status, approved_by_name, approved_by_contact, notes, approved_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'aprobada' THEN NOW() ELSE NULL END, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      approved_by_name = VALUES(approved_by_name),
      approved_by_contact = VALUES(approved_by_contact),
      notes = VALUES(notes),
      approved_at = CASE WHEN VALUES(status) = 'aprobada' THEN COALESCE(approved_at, NOW()) ELSE NULL END,
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP
  `, [
    Number(cotizacionId), status, payload.approved_by_name || null, payload.approved_by_contact || null,
    payload.notes || null, status, payload.user_id || null, payload.user_id || null
  ]);
  return getQuoteApproval(cotizacionId);
}

export async function getQuoteApproval(cotizacionId) {
  await ensureOperationalTables();
  const [rows] = await pool.query(`SELECT * FROM quote_approvals WHERE cotizacion_id = ? LIMIT 1`, [Number(cotizacionId)]);
  return rows[0] || { cotizacion_id: Number(cotizacionId), status: 'pendiente' };
}
