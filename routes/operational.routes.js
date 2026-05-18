import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  dashboard,
  search,
  clientTimeline,
  getTasks,
  postTask,
  putTask,
  removeTask,
  checklistByTravel,
  postChecklistItem,
  toggleChecklist,
  getApproval,
  postApproval
} from "../controllers/operational.controller.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/dashboard", dashboard);
router.get("/search", search);
router.get("/timeline/client/:clientId", clientTimeline);

router.get("/tasks", getTasks);
router.post("/tasks", postTask);
router.put("/tasks/:id", putTask);
router.delete("/tasks/:id", removeTask);

router.get("/checklist/travel/:travelId", checklistByTravel);
router.post("/checklist", postChecklistItem);
router.post("/checklist/:id/toggle", toggleChecklist);

router.get("/approvals/:cotizacionId", getApproval);
router.post("/approvals/:cotizacionId", postApproval);

export default router;
