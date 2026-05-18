import crypto from "crypto";
import pool from "../config/db.js";

let ready = false;

export async function ensureAdvancedTables() {
  if (ready) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS communication_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      channel VARCHAR(30) NOT NULL,
      direction VARCHAR(30) NOT NULL DEFAULT 'outbound',
      recipient VARCHAR(255) NULL,
      subject VARCHAR(255) NULL,
      message TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'preparado',
      provider_response TEXT NULL,
      client_id INT NULL,
      viaje_id INT NULL,
      cotizacion_id INT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_comm_client (client_id),
      INDEX idx_comm_viaje (viaje_id),
      INDEX idx_comm_quote (cotizacion_id),
      CONSTRAINT fk_comm_client FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE SET NULL,
      CONSTRAINT fk_comm_viaje FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE SET NULL,
      CONSTRAINT fk_comm_quote FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
      CONSTRAINT fk_comm_user FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_public_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cotizacion_id INT NOT NULL,
      token VARCHAR(120) NOT NULL UNIQUE,
      status VARCHAR(40) NOT NULL DEFAULT 'activo',
      expires_at DATETIME NULL,
      client_name VARCHAR(255) NULL,
      client_email VARCHAR(255) NULL,
      approved_status VARCHAR(40) NOT NULL DEFAULT 'pendiente',
      approved_by_name VARCHAR(255) NULL,
      approved_by_contact VARCHAR(255) NULL,
      approval_notes TEXT NULL,
      approved_at DATETIME NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_public_quote (cotizacion_id),
      CONSTRAINT fk_public_quote FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
      CONSTRAINT fk_public_created FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminder_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      trigger_type VARCHAR(80) NOT NULL DEFAULT 'manual',
      days_offset INT NOT NULL DEFAULT 0,
      task_title VARCHAR(255) NOT NULL,
      task_description TEXT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_reminder_created FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminder_generated_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rule_id INT NOT NULL,
      viaje_id INT NULL,
      cotizacion_id INT NULL,
      generated_task_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_rule_context (rule_id, viaje_id, cotizacion_id),
      CONSTRAINT fk_rem_log_rule FOREIGN KEY (rule_id) REFERENCES reminder_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const [[rules]] = await pool.query(`SELECT COUNT(*) AS total FROM reminder_rules`);
  if (!rules.total) {
    await pool.query(`
      INSERT INTO reminder_rules (title, trigger_type, days_offset, task_title, task_description)
      VALUES
      ('Pedir documentación antes del viaje', 'before_fecha_inicio', -30, 'Pedir documentación pendiente', 'Revisar DNI, pasaportes, visas y autorizaciones del cliente.'),
      ('Check-in previo al vuelo', 'before_fecha_inicio', -2, 'Recordar web check-in', 'Recordar al cliente realizar web check-in y revisar horarios.'),
      ('Seguimiento post-viaje', 'after_fecha_fin', 2, 'Pedir reseña / seguimiento post-viaje', 'Contactar al cliente para consultar cómo salió el viaje y ofrecer nuevo presupuesto.')
    `);
  }

  ready = true;
}

export async function logCommunication(payload = {}) {
  await ensureAdvancedTables();
  const [result] = await pool.query(`
    INSERT INTO communication_logs (channel, direction, recipient, subject, message, status, provider_response, client_id, viaje_id, cotizacion_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.channel || 'email',
    payload.direction || 'outbound',
    payload.recipient || null,
    payload.subject || null,
    payload.message || null,
    payload.status || 'preparado',
    payload.provider_response || null,
    payload.client_id || null,
    payload.viaje_id || null,
    payload.cotizacion_id || null,
    payload.user_id || null
  ]);
  const [rows] = await pool.query(`SELECT * FROM communication_logs WHERE id = ?`, [result.insertId]);
  return rows[0];
}

export async function listCommunicationLogs(filters = {}) {
  await ensureAdvancedTables();
  const where = ['1=1'];
  const params = [];
  if (filters.client_id) { where.push('client_id = ?'); params.push(Number(filters.client_id)); }
  if (filters.viaje_id) { where.push('viaje_id = ?'); params.push(Number(filters.viaje_id)); }
  if (filters.cotizacion_id) { where.push('cotizacion_id = ?'); params.push(Number(filters.cotizacion_id)); }
  const [rows] = await pool.query(`SELECT * FROM communication_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 80`, params);
  return rows;
}

export async function createPublicQuoteToken(cotizacionId, payload = {}) {
  await ensureAdvancedTables();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = payload.expires_at || null;
  await pool.query(`
    INSERT INTO quote_public_tokens (cotizacion_id, token, expires_at, client_name, client_email, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [Number(cotizacionId), token, expiresAt, payload.client_name || null, payload.client_email || null, payload.user_id || null]);
  return getPublicQuoteToken(token);
}

export async function getTokensByQuote(cotizacionId) {
  await ensureAdvancedTables();
  const [rows] = await pool.query(`SELECT * FROM quote_public_tokens WHERE cotizacion_id = ? ORDER BY created_at DESC`, [Number(cotizacionId)]);
  return rows;
}

export async function getPublicQuoteToken(token) {
  await ensureAdvancedTables();
  const [rows] = await pool.query(`SELECT * FROM quote_public_tokens WHERE token = ? LIMIT 1`, [token]);
  return rows[0] || null;
}

export async function getPublicQuoteData(token) {
  await ensureAdvancedTables();
  const tokenRow = await getPublicQuoteToken(token);
  if (!tokenRow || tokenRow.status !== 'activo') return null;
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) return { expired: true };

  const [rows] = await pool.query(`
    SELECT q.*, v.nombre AS viaje_nombre, v.destino, v.fecha_inicio, v.fecha_fin, c.nombre AS cliente_nombre, c.email AS cliente_email, c.telefono AS cliente_telefono
    FROM cotizaciones q
    LEFT JOIN viajes v ON v.id = q.viaje_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE q.id = ?
    LIMIT 1
  `, [tokenRow.cotizacion_id]);

  const quote = rows[0];
  const [services] = await pool.query(`SELECT * FROM servicios WHERE cotizacion_id = ? ORDER BY id ASC`, [tokenRow.cotizacion_id]);
  const [pdfs] = await pool.query(`SELECT * FROM pdfs WHERE cotizacion_id = ? ORDER BY created_at DESC LIMIT 5`, [tokenRow.cotizacion_id]);

  return { token: tokenRow, quote, services, pdfs };
}

export async function savePublicApproval(token, payload = {}) {
  await ensureAdvancedTables();
  const tokenRow = await getPublicQuoteToken(token);
  if (!tokenRow || tokenRow.status !== 'activo') return null;
  const status = payload.status === 'rechazada' ? 'rechazada' : 'aprobada';
  await pool.query(`
    UPDATE quote_public_tokens
    SET approved_status = ?, approved_by_name = ?, approved_by_contact = ?, approval_notes = ?, approved_at = NOW()
    WHERE token = ?
  `, [status, payload.approved_by_name || null, payload.approved_by_contact || null, payload.notes || null, token]);
  await pool.query(`
    INSERT INTO quote_approvals (cotizacion_id, status, approved_by_name, approved_by_contact, notes, approved_at)
    VALUES (?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE status = VALUES(status), approved_by_name = VALUES(approved_by_name), approved_by_contact = VALUES(approved_by_contact), notes = VALUES(notes), approved_at = NOW(), updated_at = CURRENT_TIMESTAMP
  `, [tokenRow.cotizacion_id, status, payload.approved_by_name || null, payload.approved_by_contact || null, payload.notes || null]);
  return getPublicQuoteToken(token);
}

export async function listUsersWithRoles() {
  const [rows] = await pool.query(`SELECT id, username, rol, activo, created_at, updated_at FROM usuarios ORDER BY username ASC`);
  return rows;
}

export async function updateUserRole(userId, payload = {}) {
  const allowed = new Set(['admin', 'supervisor', 'vendedor', 'operador', 'solo_lectura']);
  const role = allowed.has(payload.rol) ? payload.rol : 'operador';
  const active = payload.activo === undefined ? 1 : Number(payload.activo) ? 1 : 0;
  await pool.query(`UPDATE usuarios SET rol = ?, activo = ? WHERE id = ?`, [role, active, Number(userId)]);
  const [rows] = await pool.query(`SELECT id, username, rol, activo, created_at, updated_at FROM usuarios WHERE id = ?`, [Number(userId)]);
  return rows[0];
}

export async function listReminderRules() {
  await ensureAdvancedTables();
  const [rows] = await pool.query(`SELECT * FROM reminder_rules ORDER BY active DESC, id ASC`);
  return rows;
}

export async function createReminderRule(payload = {}) {
  await ensureAdvancedTables();
  const [result] = await pool.query(`
    INSERT INTO reminder_rules (title, trigger_type, days_offset, task_title, task_description, active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [payload.title || 'Nuevo recordatorio', payload.trigger_type || 'manual', Number(payload.days_offset || 0), payload.task_title || payload.title || 'Nueva tarea', payload.task_description || null, payload.active === 0 ? 0 : 1, payload.user_id || null]);
  const [rows] = await pool.query(`SELECT * FROM reminder_rules WHERE id = ?`, [result.insertId]);
  return rows[0];
}

export async function generateReminderTasks(userId = null) {
  await ensureAdvancedTables();
  const [rules] = await pool.query(`SELECT * FROM reminder_rules WHERE active = 1`);
  let created = 0;

  for (const rule of rules) {
    let dateExpr = null;
    if (rule.trigger_type === 'before_fecha_inicio') dateExpr = 'DATE_ADD(v.fecha_inicio, INTERVAL ? DAY)';
    if (rule.trigger_type === 'after_fecha_fin') dateExpr = 'DATE_ADD(v.fecha_fin, INTERVAL ? DAY)';
    if (!dateExpr) continue;

    const [targets] = await pool.query(`
      SELECT v.id AS viaje_id, v.cliente_id, q.id AS cotizacion_id, ${dateExpr} AS due_date
      FROM viajes v
      LEFT JOIN cotizaciones q ON q.viaje_id = v.id
      WHERE v.id IS NOT NULL
      HAVING due_date IS NOT NULL AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 45 DAY)
      LIMIT 200
    `, [Number(rule.days_offset || 0)]);

    for (const target of targets) {
      try {
        const [exists] = await pool.query(`SELECT id FROM reminder_generated_log WHERE rule_id = ? AND viaje_id = ? AND (cotizacion_id <=> ?) LIMIT 1`, [rule.id, target.viaje_id, target.cotizacion_id || null]);
        if (exists.length) continue;
        const [task] = await pool.query(`
          INSERT INTO travel_tasks (title, description, status, priority, due_date, client_id, viaje_id, cotizacion_id, created_by)
          VALUES (?, ?, 'pendiente', 'media', ?, ?, ?, ?, ?)
        `, [rule.task_title, rule.task_description || null, target.due_date, target.cliente_id || null, target.viaje_id, target.cotizacion_id || null, userId]);
        await pool.query(`INSERT INTO reminder_generated_log (rule_id, viaje_id, cotizacion_id, generated_task_id) VALUES (?, ?, ?, ?)`, [rule.id, target.viaje_id, target.cotizacion_id || null, task.insertId]);
        created += 1;
      } catch (err) {
        console.error('Error generando recordatorio:', err.message);
      }
    }
  }

  return { created };
}
