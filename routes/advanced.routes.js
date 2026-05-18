import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  prepareWhatsapp,
  sendEmail,
  communications,
  createApprovalLink,
  approvalLinksByQuote,
  publicApprovalView,
  publicApprovalSubmit,
  usersRoles,
  saveUserRole,
  reminders,
  postReminder,
  runReminders
} from "../controllers/advanced.controller.js";

const router = express.Router();

// Rutas públicas para el cliente externo
router.get("/public/approval/:token", publicApprovalView);
router.post("/public/approval/:token", publicApprovalSubmit);

// Rutas internas
router.use(authMiddleware);
router.post("/whatsapp", prepareWhatsapp);
router.post("/email", sendEmail);
router.get("/communications", communications);
router.post("/approval-link/:cotizacionId", createApprovalLink);
router.get("/approval-link/:cotizacionId", approvalLinksByQuote);
router.get("/roles/users", usersRoles);
router.put("/roles/users/:id", saveUserRole);
router.get("/reminders", reminders);
router.post("/reminders", postReminder);
router.post("/reminders/run", runReminders);

export default router;
