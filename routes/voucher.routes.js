import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import voucherUpload from "../middlewares/voucher-upload.middleware.js";

import {
  getVouchersByViaje,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher
} from "../controllers/voucher.controller.js";

import {
  uploadVoucherFiles,
  downloadPublicVoucherFile,
  downloadVoucherFile,
  deleteVoucherFile
} from "../controllers/voucher-file.controller.js";

const router = express.Router();

/* ===========================
RUTA PÚBLICA PARA LINKS EN PDF
Debe ir ANTES del authMiddleware.
=========================== */
router.get("/files/public/:token", downloadPublicVoucherFile);

/* ===========================
PROTEGER EL RESTO DE RUTAS
=========================== */
router.use(authMiddleware);

/* ===========================
ROUTES
=========================== */
router.get("/viaje/:viajeId", getVouchersByViaje);
router.get("/:id", getVoucherById);
router.post("/", createVoucher);
router.put("/:id", updateVoucher);
router.delete("/:id", deleteVoucher);

router.post(
  "/:voucherId/files",
  voucherUpload.array("files", 10),
  uploadVoucherFiles
);

router.get("/files/:fileId/download", downloadVoucherFile);
router.delete("/files/:fileId", deleteVoucherFile);

export default router;
