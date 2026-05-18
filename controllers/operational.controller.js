import {
  getOperationalDashboard,
  globalSearch,
  getClientTimeline,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  getChecklist,
  addChecklistItem,
  toggleChecklistItem,
  upsertQuoteApproval,
  getQuoteApproval
} from "../models/operational.model.js";

function currentUserId(req) {
  return req.user?.id || req.user?.userId || req.user?.sub || null;
}

export async function dashboard(req, res) {
  try {
    return res.json(await getOperationalDashboard());
  } catch (err) {
    console.error("Error dashboard operativo:", err);
    return res.status(500).json({ error: "No se pudo cargar el dashboard operativo" });
  }
}

export async function search(req, res) {
  try {
    return res.json(await globalSearch(req.query.q || ""));
  } catch (err) {
    console.error("Error búsqueda global:", err);
    return res.status(500).json({ error: "No se pudo realizar la búsqueda" });
  }
}

export async function clientTimeline(req, res) {
  try {
    return res.json(await getClientTimeline(req.params.clientId));
  } catch (err) {
    console.error("Error timeline cliente:", err);
    return res.status(500).json({ error: "No se pudo cargar el timeline" });
  }
}

export async function getTasks(req, res) {
  try {
    return res.json(await listTasks(req.query || {}));
  } catch (err) {
    console.error("Error listando tareas:", err);
    return res.status(500).json({ error: "No se pudieron listar las tareas" });
  }
}

export async function postTask(req, res) {
  try {
    const task = await createTask({ ...req.body, user_id: currentUserId(req) });
    return res.status(201).json(task);
  } catch (err) {
    console.error("Error creando tarea:", err);
    return res.status(500).json({ error: "No se pudo crear la tarea" });
  }
}

export async function putTask(req, res) {
  try {
    const task = await updateTask(req.params.id, req.body || {});
    if (!task) return res.status(404).json({ error: "Tarea no encontrada" });
    return res.json(task);
  } catch (err) {
    console.error("Error actualizando tarea:", err);
    return res.status(500).json({ error: "No se pudo actualizar la tarea" });
  }
}

export async function removeTask(req, res) {
  try {
    const ok = await deleteTask(req.params.id);
    if (!ok) return res.status(404).json({ error: "Tarea no encontrada" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando tarea:", err);
    return res.status(500).json({ error: "No se pudo eliminar la tarea" });
  }
}

export async function checklistByTravel(req, res) {
  try {
    return res.json(await getChecklist(req.params.travelId, currentUserId(req)));
  } catch (err) {
    console.error("Error checklist:", err);
    return res.status(500).json({ error: "No se pudo cargar el checklist" });
  }
}

export async function postChecklistItem(req, res) {
  try {
    const item = await addChecklistItem({ ...req.body, user_id: currentUserId(req) });
    return res.status(201).json(item);
  } catch (err) {
    console.error("Error agregando checklist:", err);
    return res.status(500).json({ error: "No se pudo agregar el ítem" });
  }
}

export async function toggleChecklist(req, res) {
  try {
    return res.json(await toggleChecklistItem(req.params.id));
  } catch (err) {
    console.error("Error toggle checklist:", err);
    return res.status(500).json({ error: "No se pudo actualizar el checklist" });
  }
}

export async function getApproval(req, res) {
  try {
    return res.json(await getQuoteApproval(req.params.cotizacionId));
  } catch (err) {
    console.error("Error aprobación:", err);
    return res.status(500).json({ error: "No se pudo obtener la aprobación" });
  }
}

export async function postApproval(req, res) {
  try {
    const approval = await upsertQuoteApproval(req.params.cotizacionId, { ...req.body, user_id: currentUserId(req) });
    return res.json(approval);
  } catch (err) {
    console.error("Error guardando aprobación:", err);
    return res.status(500).json({ error: "No se pudo guardar la aprobación" });
  }
}
