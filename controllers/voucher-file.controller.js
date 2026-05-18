import fs from "fs";
import path from "path";
import pool from "../config/db.js";
import * as VoucherModel from "../models/voucher.model.js";
import * as VoucherFileModel from "../models/voucher-file.model.js";
import crypto from "crypto";

function safeFileName(name = "archivo") {
  return String(name || "archivo")
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/]/g, "-");
}

function sendVoucherFile(res, file) {
  if (!file) {
    return res.status(404).json({ error: "Archivo no encontrado" });
  }

  const fileName = safeFileName(file.original_name || file.stored_name || "archivo");
  const mimeType = file.mime_type || "application/octet-stream";

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

  if (file.file_data) {
    return res.send(Buffer.from(file.file_data));
  }

  if (file.file_path && fs.existsSync(file.file_path)) {
    return res.sendFile(path.resolve(file.file_path));
  }

  return res.status(404).json({ error: "El archivo físico no existe" });
}

/* =========================================
UPLOAD FILES TO VOUCHER
- Persistencia real en MySQL mediante LONGBLOB.
- El archivo temporal se borra después de guardarse.
========================================= */
export const uploadVoucherFiles = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const { voucherId } = req.params;

    const voucher = await VoucherModel.getById(voucherId, userId);

    if (!voucher) {
      return res.status(404).json({ error: "Voucher no encontrado" });
    }

    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ error: "No se enviaron archivos" });
    }

    await conn.beginTransaction();

    for (const file of files) {
      const fileBuffer = fs.readFileSync(file.path);


await VoucherFileModel.createVoucherFile(conn, {
  voucher_id: Number(voucherId),
  original_name: file.originalname,
  stored_name: file.filename,
  file_path: file.path.replace(/\\/g, "/"),
  mime_type: file.mimetype,
  file_size: file.size,
  file_data: fileBuffer,
  public_token: crypto.randomUUID().replace(/-/g, "")
});

      try {
        fs.unlinkSync(file.path);
      } catch {}
    }

    await conn.commit();

    const savedFiles = await VoucherFileModel.getFilesByVoucher(voucherId, userId);

    res.status(201).json(savedFiles);
  } catch (err) {
    await conn.rollback();
    console.error("UPLOAD VOUCHER FILES ERROR:", err);
    res.status(400).json({ error: err.message || "Error subiendo archivos" });
  } finally {
    conn.release();
  }
};

/* =========================================
DOWNLOAD PUBLIC FILE BY TOKEN
========================================= */
export const downloadPublicVoucherFile = async (req, res) => {
  try {
    const { token } = req.params;
    const file = await VoucherFileModel.getFileByPublicToken(token);
    return sendVoucherFile(res, file);
  } catch (err) {
    console.error("DOWNLOAD PUBLIC VOUCHER FILE ERROR:", err);
    return res.status(500).json({ error: "Error descargando archivo" });
  }
};

/* =========================================
DOWNLOAD FILE BY ID (AUTH)
========================================= */
export const downloadVoucherFile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    const file = await VoucherFileModel.getFileById(fileId, userId);
    return sendVoucherFile(res, file);
  } catch (err) {
    console.error("DOWNLOAD VOUCHER FILE ERROR:", err);
    return res.status(500).json({ error: "Error descargando archivo" });
  }
};

/* =========================================
DELETE FILE FROM VOUCHER
========================================= */
export const deleteVoucherFile = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const { fileId } = req.params;

    const file = await VoucherFileModel.getFileById(fileId, userId);

    if (!file) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }

    await conn.beginTransaction();

    await VoucherFileModel.deleteVoucherFile(conn, fileId, userId);

    await conn.commit();

    if (file.file_path && fs.existsSync(file.file_path)) {
      try {
        fs.unlinkSync(file.file_path);
      } catch {}
    }

    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error("DELETE VOUCHER FILE ERROR:", err);
    res.status(500).json({ error: "Error eliminando archivo" });
  } finally {
    conn.release();
  }
};
