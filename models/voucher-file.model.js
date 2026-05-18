import crypto from "crypto";
import db from "../config/db.js";

/* =========================================
PUBLIC URL HELPER
========================================= */
function withPublicUrl(row) {
  if (!row) return row;
  const safe = { ...row };
  delete safe.file_data;
  safe.public_url = safe.public_token ? `/api/vouchers/files/public/${safe.public_token}` : null;
  return safe;
}

/* =========================================
GET FILES BY VOUCHER (ownership)
========================================= */
export async function getFilesByVoucher(voucherId, userId) {
  const [rows] = await db.query(
    `
    SELECT
      vf.id,
      vf.voucher_id,
      vf.original_name,
      vf.stored_name,
      vf.file_path,
      vf.mime_type,
      vf.file_size,
      vf.public_token,
      vf.created_at
    FROM voucher_files vf
    JOIN vouchers vc ON vf.voucher_id = vc.id
    JOIN viajes v ON vc.viaje_id = v.id
    WHERE vf.voucher_id = ?
      AND v.created_by = ?
    ORDER BY vf.created_at DESC, vf.id DESC
    `,
    [voucherId, userId]
  );

  return rows.map(withPublicUrl);
}

/* =========================================
ADD FILE
========================================= */
export async function createVoucherFile(conn, data) {
  const {
  voucher_id,
  original_name,
  stored_name,
  file_path,
  mime_type,
  file_size,
  file_data,
  public_token
} = data;

  const token = public_token || crypto.randomBytes(32).toString("hex");

  const [result] = await conn.query(
    `
    INSERT INTO voucher_files
    (
      voucher_id,
      original_name,
      stored_name,
      file_path,
      mime_type,
      file_size,
      file_data,
      public_token
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
  voucher_id,
  original_name,
  stored_name,
  file_path,
  mime_type || null,
  file_size || null,
  file_data || null,
token
]
  );

  return result.insertId;
}

/* =========================================
GET FILE BY ID (ownership)
========================================= */
export async function getFileById(id, userId) {
  const [rows] = await db.query(
    `
    SELECT vf.*
    FROM voucher_files vf
    JOIN vouchers vc ON vf.voucher_id = vc.id
    JOIN viajes v ON vc.viaje_id = v.id
    WHERE vf.id = ?
      AND v.created_by = ?
    `,
    [id, userId]
  );

  return rows[0] || null;
}

/* =========================================
GET PUBLIC FILE BY TOKEN
========================================= */
export async function getFileByPublicToken(token) {
  const [rows] = await db.query(
    `
    SELECT *
    FROM voucher_files
    WHERE public_token = ?
    LIMIT 1
    `,
    [token]
  );

  return rows[0] || null;
}

/* =========================================
GET FILES BY TRAVEL FOR PDF
========================================= */
export async function getFilesByTravel(viajeId) {
  const [rows] = await db.query(
    `
    SELECT
      vf.id,
      vf.voucher_id,
      vf.original_name,
      vf.stored_name,
      vf.mime_type,
      vf.file_size,
      vf.public_token,
      vf.created_at
    FROM voucher_files vf
    JOIN vouchers vc ON vf.voucher_id = vc.id
    WHERE vc.viaje_id = ?
      AND vc.visible_cliente = 1
    ORDER BY vf.created_at DESC, vf.id DESC
    `,
    [viajeId]
  );

  return rows.map(withPublicUrl);
}

/* =========================================
DELETE FILE (ownership)
========================================= */
export async function deleteVoucherFile(conn, id, userId) {
  const [result] = await conn.query(
    `
    DELETE vf FROM voucher_files vf
    JOIN vouchers vc ON vf.voucher_id = vc.id
    JOIN viajes v ON vc.viaje_id = v.id
    WHERE vf.id = ?
      AND v.created_by = ?
    `,
    [id, userId]
  );

  return result.affectedRows > 0;
}
