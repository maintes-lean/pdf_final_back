import nodemailer from "nodemailer";
import {
  logCommunication,
  listCommunicationLogs,
  createPublicQuoteToken,
  getTokensByQuote,
  getPublicQuoteData,
  savePublicApproval,
  listUsersWithRoles,
  updateUserRole,
  listReminderRules,
  createReminderRule,
  generateReminderTasks
} from "../models/advanced.model.js";

function currentUserId(req) {
  return req.user?.id || req.user?.userId || req.user?.sub || null;
}

function getBaseUrl(req) {
  return process.env.PUBLIC_FRONTEND_URL || req.body?.base_url || req.query?.base_url || "http://127.0.0.1:5500/PDF_FRONT-main";
}

function buildWhatsappLink(phone = "", message = "") {
  const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message || "")}`;
}

export async function prepareWhatsapp(req, res) {
  try {
    const { phone, message, client_id, viaje_id, cotizacion_id } = req.body || {};
    const url = buildWhatsappLink(phone, message);
    const log = await logCommunication({
      channel: "whatsapp",
      recipient: phone,
      message,
      status: "link_generado",
      client_id,
      viaje_id,
      cotizacion_id,
      user_id: currentUserId(req)
    });
    return res.json({ url, log });
  } catch (err) {
    console.error("Error preparando WhatsApp:", err);
    return res.status(500).json({ error: "No se pudo preparar WhatsApp" });
  }
}

export async function sendEmail(req, res) {
  try {
    const { to, subject, message, client_id, viaje_id, cotizacion_id } = req.body || {};
    if (!to || !subject || !message) return res.status(400).json({ error: "to, subject y message son requeridos" });

    const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    if (!smtpReady) {
      const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      const log = await logCommunication({ channel: "email", recipient: to, subject, message, status: "mailto_generado", client_id, viaje_id, cotizacion_id, user_id: currentUserId(req) });
      return res.json({ sent: false, mode: "mailto", mailto, log, warning: "SMTP no configurado. Se generó link mailto." });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: message,
      html: String(message).replaceAll("\n", "<br>")
    });

    const log = await logCommunication({ channel: "email", recipient: to, subject, message, status: "enviado", provider_response: JSON.stringify(info), client_id, viaje_id, cotizacion_id, user_id: currentUserId(req) });
    return res.json({ sent: true, info, log });
  } catch (err) {
    console.error("Error enviando email:", err);
    return res.status(500).json({ error: "No se pudo enviar el email", detail: err.message });
  }
}

export async function communications(req, res) {
  try {
    return res.json(await listCommunicationLogs(req.query || {}));
  } catch (err) {
    return res.status(500).json({ error: "No se pudo listar comunicaciones" });
  }
}

export async function createApprovalLink(req, res) {
  try {
    const token = await createPublicQuoteToken(req.params.cotizacionId, { ...req.body, user_id: currentUserId(req) });
    const publicUrl = `${getBaseUrl(req).replace(/\/$/, "")}/index.html?approval_token=${token.token}`;
    return res.status(201).json({ token, publicUrl });
  } catch (err) {
    console.error("Error creando link público:", err);
    return res.status(500).json({ error: "No se pudo crear el link público" });
  }
}

export async function approvalLinksByQuote(req, res) {
  try {
    return res.json(await getTokensByQuote(req.params.cotizacionId));
  } catch (err) {
    return res.status(500).json({ error: "No se pudieron listar links" });
  }
}

export async function publicApprovalView(req, res) {
  try {
    const data = await getPublicQuoteData(req.params.token);
    if (!data) return res.status(404).json({ error: "Link no encontrado" });
    if (data.expired) return res.status(410).json({ error: "Link vencido" });
    return res.json(data);
  } catch (err) {
    console.error("Error vista pública:", err);
    return res.status(500).json({ error: "No se pudo cargar la aprobación" });
  }
}

export async function publicApprovalSubmit(req, res) {
  try {
    const saved = await savePublicApproval(req.params.token, req.body || {});
    if (!saved) return res.status(404).json({ error: "Link no encontrado" });
    return res.json(saved);
  } catch (err) {
    console.error("Error aprobación pública:", err);
    return res.status(500).json({ error: "No se pudo guardar la aprobación" });
  }
}

export async function usersRoles(req, res) {
  try {
    return res.json(await listUsersWithRoles());
  } catch (err) {
    return res.status(500).json({ error: "No se pudieron listar usuarios" });
  }
}

export async function saveUserRole(req, res) {
  try {
    return res.json(await updateUserRole(req.params.id, req.body || {}));
  } catch (err) {
    return res.status(500).json({ error: "No se pudo actualizar el rol" });
  }
}

export async function reminders(req, res) {
  try {
    return res.json(await listReminderRules());
  } catch (err) {
    return res.status(500).json({ error: "No se pudieron listar recordatorios" });
  }
}

export async function postReminder(req, res) {
  try {
    return res.status(201).json(await createReminderRule({ ...req.body, user_id: currentUserId(req) }));
  } catch (err) {
    return res.status(500).json({ error: "No se pudo crear el recordatorio" });
  }
}

export async function runReminders(req, res) {
  try {
    return res.json(await generateReminderTasks(currentUserId(req)));
  } catch (err) {
    console.error("Error ejecutando recordatorios:", err);
    return res.status(500).json({ error: "No se pudieron generar recordatorios" });
  }
}
