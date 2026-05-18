import PDFDocument from "pdfkit";
import {
  listInternalDocuments,
  getInternalDocumentById,
  createInternalDocument,
  updateInternalDocument,
  duplicateInternalDocument,
  softDeleteInternalDocument
} from "../models/internalDocument.model.js";

function currentUserId(req) {
  return req.user?.id || req.user?.userId || req.user?.sub || null;
}

function htmlToPlainText(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getInternalDocuments(req, res) {
  try {
    const docs = await listInternalDocuments(req.query || {});
    return res.json(docs);
  } catch (err) {
    console.error("Error listando documentos internos:", err);
    return res.status(500).json({ error: "No se pudieron listar los documentos" });
  }
}

export async function getInternalDocument(req, res) {
  try {
    const doc = await getInternalDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });
    return res.json(doc);
  } catch (err) {
    console.error("Error obteniendo documento interno:", err);
    return res.status(500).json({ error: "No se pudo obtener el documento" });
  }
}

export async function postInternalDocument(req, res) {
  try {
    const payload = {
      ...req.body,
      content_text: req.body.content_text || htmlToPlainText(req.body.content_html || ""),
      user_id: currentUserId(req)
    };

    const doc = await createInternalDocument(payload);
    return res.status(201).json(doc);
  } catch (err) {
    console.error("Error creando documento interno:", err);
    return res.status(500).json({ error: "No se pudo crear el documento" });
  }
}

export async function putInternalDocument(req, res) {
  try {
    const payload = {
      ...req.body,
      content_text: req.body.content_text || htmlToPlainText(req.body.content_html || ""),
      user_id: currentUserId(req)
    };

    const doc = await updateInternalDocument(req.params.id, payload);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });
    return res.json(doc);
  } catch (err) {
    console.error("Error actualizando documento interno:", err);
    return res.status(500).json({ error: "No se pudo guardar el documento" });
  }
}

export async function copyInternalDocument(req, res) {
  try {
    const doc = await duplicateInternalDocument(req.params.id, currentUserId(req));
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });
    return res.status(201).json(doc);
  } catch (err) {
    console.error("Error duplicando documento interno:", err);
    return res.status(500).json({ error: "No se pudo duplicar el documento" });
  }
}

export async function deleteInternalDocumentController(req, res) {
  try {
    const ok = await softDeleteInternalDocument(req.params.id, currentUserId(req));
    if (!ok) return res.status(404).json({ error: "Documento no encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando documento interno:", err);
    return res.status(500).json({ error: "No se pudo eliminar el documento" });
  }
}

export async function exportInternalDocumentPdf(req, res) {
  try {
    const docData = await getInternalDocumentById(req.params.id);
    if (!docData) return res.status(404).json({ error: "Documento no encontrado" });

    const pdf = new PDFDocument({ size: "A4", margin: 54, bufferPages: true });
    const safeTitle = String(docData.title || "documento")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .slice(0, 80);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeTitle}.pdf"`);

    pdf.pipe(res);

    pdf.font("Helvetica-Bold").fontSize(18).text(docData.title || "Documento", { align: "left" });
    pdf.moveDown(0.4);
    pdf.font("Helvetica").fontSize(9).fillColor("#666666");

    const meta = [];
    if (docData.client_name) meta.push(`Cliente: ${docData.client_name}`);
    if (docData.travel_name || docData.travel_destination) {
      meta.push(`Viaje: ${docData.travel_name || docData.travel_destination}`);
    }
    if (docData.quote_title) meta.push(`Cotización: ${docData.quote_title}`);
    meta.push(`Actualizado: ${new Date(docData.updated_at || Date.now()).toLocaleDateString("es-AR")}`);

    pdf.text(meta.join("  |  "));
    pdf.moveDown(0.8);
    pdf.strokeColor("#dddddd").lineWidth(1).moveTo(54, pdf.y).lineTo(540, pdf.y).stroke();
    pdf.moveDown(1);

    pdf.fillColor("#111111").font("Helvetica").fontSize(11);
    const text = docData.content_text || htmlToPlainText(docData.content_html || "");
    pdf.text(text || "Documento sin contenido.", {
      width: 486,
      align: "left",
      lineGap: 4
    });

    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      pdf.fontSize(8).fillColor("#888888").text(`Página ${i + 1} de ${range.count}`, 54, 800, {
        align: "right",
        width: 486
      });
    }

    pdf.end();
  } catch (err) {
    console.error("Error exportando documento interno:", err);
    return res.status(500).json({ error: "No se pudo exportar el documento" });
  }
}
