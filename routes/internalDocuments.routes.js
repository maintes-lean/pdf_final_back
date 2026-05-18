import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  getInternalDocuments,
  getInternalDocument,
  postInternalDocument,
  putInternalDocument,
  copyInternalDocument,
  deleteInternalDocumentController,
  exportInternalDocumentPdf
} from "../controllers/internalDocuments.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getInternalDocuments);
router.post("/", postInternalDocument);
router.get("/:id", getInternalDocument);
router.put("/:id", putInternalDocument);
router.post("/:id/duplicate", copyInternalDocument);
router.delete("/:id", deleteInternalDocumentController);
router.get("/:id/pdf", exportInternalDocumentPdf);

export default router;
