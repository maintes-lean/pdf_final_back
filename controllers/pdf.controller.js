import PDFDocument from "pdfkit";
import pool from "../config/db.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultLogoPath = path.join(__dirname, "../assets/logo.png");
const pdfDir = path.join(__dirname, "../assets/pdfs");

fs.mkdirSync(pdfDir, { recursive: true });

function getPublicBaseUrl(req) {
  const envUrl = String(process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_PUBLIC_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.get?.("host") || req.headers.host || "";
  return host ? `${protocol}://${host}` : "";
}

function absolutePublicUrl(baseUrl, relativeUrl) {
  if (!relativeUrl) return "";
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(relativeUrl).replace(/^\/+/, "")}`;
}


/* ===============================
   FALLBACK BRANDING
================================ */

const DEFAULT_BRANDING = {
  company_name: "Costa Azul Viajes",
  company_email: "",
  company_phone: "",
  company_address: "",
  company_website: "",
  logo_path: defaultLogoPath,
  pdf_footer: "Gracias por confiar en Costa Azul Viajes.",
  layout_type: "classic",
  cover_image_path: null
};

const PDF_STYLE = {
  page: {
    margin: 58,
    width: 595.28,
    height: 841.89
  },
  colors: {
    black: "#111111",
    gray: "#4b5563",
    lightGray: "#e5e7eb",
    softGray: "#f3f4f6",
    red: "#e00000",
    yellow: "#fff176",
    blue: "#0645ad"
  },
  fonts: {
    title: "Helvetica-Bold",
    body: "Helvetica",
    mono: "Courier",
    monoBold: "Courier-Bold"
  }
};

const PDF_LAYOUT = {
  left: 58,
  right: 538,
  contentWidth: 480,
  priceLabelWidth: 480,
  priceValueX: 58,
  priceValueWidth: 480,
  footerY: 790,
  bottomReserve: 112
};

/* ===============================
   ENDPOINTS
================================ */

export async function generatePartialPdf(req, res) {
  return generatePdf(req, res, "partial");
}

export async function generateFullPdf(req, res) {
  return generatePdf(req, res, "full");
}

/* ===============================
   GENERAR PDF
================================ */

async function generatePdf(req, res, mode) {
  try {
    const userId = req.user?.id;
    const cotizacion_id = req.body?.cotizacion_id || req.query?.cotizacion_id;
    const profile_id = req.body?.profile_id || req.query?.profile_id;

    if (!userId) {
      return res.status(401).json({ error: "No autorizado" });
    }

    if (!cotizacion_id) {
      return res.status(400).json({ error: "cotizacion_id requerido" });
    }

    if (!profile_id) {
      return res.status(400).json({ error: "profile_id requerido" });
    }

    const [[cot]] = await pool.query(
      `
      SELECT co.id
      FROM cotizaciones co
      WHERE co.id = ?
      `,
      [cotizacion_id]
    );

    if (!cot) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const [[quote]] = await pool.query(
      `SELECT * FROM cotizaciones WHERE id = ?`,
      [cotizacion_id]
    );

    const [[client]] = await pool.query(
      `
      SELECT c.*
      FROM clientes c
      JOIN viajes v ON v.cliente_id = c.id
      JOIN cotizaciones co ON co.viaje_id = v.id
      WHERE co.id = ?
      `,
      [cotizacion_id]
    );

    const [[trip]] = await pool.query(
      `
      SELECT v.*
      FROM viajes v
      JOIN cotizaciones co ON co.viaje_id = v.id
      WHERE co.id = ?
      `,
      [cotizacion_id]
    );

    const [services] = await pool.query(
      `SELECT * FROM servicios WHERE cotizacion_id = ? ORDER BY id ASC`,
      [cotizacion_id]
    );

    await attachServiceMetadata(services);

    let vouchers = [];
    let operators = [];

    if (trip?.id) {
      const [voucherRows] = await pool.query(
        `
        SELECT *
        FROM vouchers
        WHERE viaje_id = ?
          AND visible_cliente = 1
        ORDER BY fecha_asociada ASC, id ASC
        `,
        [trip.id]
      );
      vouchers = voucherRows || [];

      if (vouchers.length) {
        const voucherIds = vouchers.map(v => v.id);
        const [fileRows] = await pool.query(
          `
          SELECT
            id,
            voucher_id,
            original_name,
            stored_name,
            mime_type,
            file_size,
            public_token,
            created_at
          FROM voucher_files
          WHERE voucher_id IN (?)
          ORDER BY created_at DESC, id DESC
          `,
          [voucherIds]
        );

        const filesByVoucher = new Map();
        (fileRows || []).forEach(file => {
          const list = filesByVoucher.get(file.voucher_id) || [];
          list.push({
            ...file,
            public_url: file.public_token ? `/api/vouchers/files/public/${file.public_token}` : null
          });
          filesByVoucher.set(file.voucher_id, list);
        });

        vouchers = vouchers.map(voucher => ({
          ...voucher,
          files: filesByVoucher.get(voucher.id) || []
        }));
      }

      const [operatorRows] = await pool.query(
        `
        SELECT *
        FROM operadores
        WHERE viaje_id = ?
        ORDER BY id ASC
        `,
        [trip.id]
      );
      operators = operatorRows || [];
    }

    const branding = await getBrandingForProfile(userId, profile_id);
    const publicBaseUrl = getPublicBaseUrl(req);

    const fileName = `cotizacion_${cotizacion_id}_${mode}_${Date.now()}.pdf`;
    const publicUrl = `/assets/pdfs/${fileName}`;
    const fullFilePath = path.join(pdfDir, fileName);

    const doc = new PDFDocument({
      size: "A4",
      margin: PDF_STYLE.page.margin,
      bufferPages: true
    });

    const fileStream = fs.createWriteStream(fullFilePath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    doc.pipe(fileStream);
    doc.pipe(res);

    drawCostaAzulQuotation(doc, {
      client,
      trip,
      quote,
      services,
      vouchers,
      operators,
      mode,
      branding,
      publicBaseUrl
    });

    addPageFooters(doc, branding, mode);

    doc.end();

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    await pool.query(
      `
      INSERT INTO pdfs (cotizacion_id, nombre, url, tipo, user_id)
      VALUES (?, ?, ?, ?, ?)
      `,
      [cotizacion_id, fileName, publicUrl, mode, userId]
    );
  } catch (err) {
    console.error("GENERATE PDF ERROR:", err);

    if (!res.headersSent) {
      return res.status(500).json({ error: "Error generando PDF" });
    }
  }
}

async function attachServiceMetadata(services = []) {
  if (!Array.isArray(services) || !services.length) return;

  const ids = services.map(s => Number(s.id)).filter(Boolean);
  if (!ids.length) return;

  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await pool.query(
    `
    SELECT servicio_id, meta_key, meta_value
    FROM servicios_metadata
    WHERE servicio_id IN (${placeholders})
    `,
    ids
  );

  const metadataByServiceId = {};

  rows.forEach(row => {
    const serviceId = Number(row.servicio_id);
    if (!metadataByServiceId[serviceId]) metadataByServiceId[serviceId] = {};
    metadataByServiceId[serviceId][row.meta_key] = row.meta_value;
  });

  services.forEach(service => {
    service.metadata = metadataByServiceId[Number(service.id)] || {};
  });
}

/* ===============================
   LISTAR PDFs (lectura global)
================================ */

export async function getPdfsByCotizacion(req, res) {
  try {
    const userId = req.user.id;
    const { cotizacionId } = req.params;

    const [[cot]] = await pool.query(
      `SELECT id FROM cotizaciones WHERE id = ?`,
      [cotizacionId]
    );

    if (!cot) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        p.*,
        CASE WHEN p.user_id = ? THEN 1 ELSE 0 END AS can_edit
      FROM pdfs p
      WHERE p.cotizacion_id = ?
      ORDER BY p.created_at DESC, p.id DESC
      `,
      [userId, cotizacionId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET PDFS ERROR:", err);
    res.status(500).json({ error: "Error obteniendo PDFs" });
  }
}

/* ===============================
   ÚLTIMO PDF (lectura global)
================================ */

export async function getLatestPdf(req, res) {
  try {
    const { cotizacionId } = req.params;

    const [[cot]] = await pool.query(
      `SELECT id FROM cotizaciones WHERE id = ?`,
      [cotizacionId]
    );

    if (!cot) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const [rows] = await pool.query(
      `
      SELECT p.*
      FROM pdfs p
      WHERE p.cotizacion_id = ?
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
      `,
      [cotizacionId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "PDF no encontrado" });
    }

    const pdf = rows[0];
    const normalizedUrl = String(pdf.url || "").replace(/^\/+/, "");
    const fullPath = path.join(__dirname, "..", normalizedUrl);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "Archivo PDF no encontrado en disco" });
    }

    return res.download(fullPath, pdf.nombre);
  } catch (err) {
    console.error("LATEST PDF ERROR:", err);
    res.status(500).json({ error: "Error obteniendo PDF" });
  }
}

/* ===============================
   BRANDING
================================ */

async function getBrandingForProfile(userId, profileId) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        profile_name,
        company_name,
        company_email,
        company_phone,
        company_address,
        company_website,
        logo_path,
        cover_image_path,
        pdf_footer,
        layout_type
      FROM pdf_brand_profiles
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
      `,
      [profileId, userId]
    );

    const profile = rows?.[0];

    if (!profile) {
      return {
        ...DEFAULT_BRANDING,
        layout_type: "classic",
        cover_image_path: null
      };
    }

    return {
      company_name: profile.company_name || DEFAULT_BRANDING.company_name,
      company_email: profile.company_email || DEFAULT_BRANDING.company_email,
      company_phone: profile.company_phone || DEFAULT_BRANDING.company_phone,
      company_address: profile.company_address || DEFAULT_BRANDING.company_address,
      company_website: profile.company_website || DEFAULT_BRANDING.company_website,
      logo_path: profile.logo_path || null,
      cover_image_path: profile.cover_image_path || null,
      pdf_footer: profile.pdf_footer || DEFAULT_BRANDING.pdf_footer,
      layout_type: profile.layout_type || "classic"
    };
  } catch (error) {
    console.error("GET BRAND PROFILE ERROR:", error);
    return {
      ...DEFAULT_BRANDING,
      layout_type: "classic",
      cover_image_path: null
    };
  }
}

function resolveAssetPath(filePathFromDb, fallback = null) {
  if (!filePathFromDb) return fallback;

  const normalized = String(filePathFromDb).trim().replace(/\\/g, "/");
  if (!normalized) return fallback;

  const cleaned = normalized.replace(/^\/+/, "");
  const fileName = path.basename(cleaned);

  const candidates = [
    path.join(__dirname, "..", cleaned),
    path.join(process.cwd(), cleaned),
    path.join(__dirname, "..", "uploads", fileName),
    path.join(process.cwd(), "uploads", fileName)
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  console.warn("No se encontró imagen:", {
    original: filePathFromDb,
    candidates
  });

  return fallback;
}

/* ===============================
   NUEVA ESTRUCTURA COSTA AZUL
================================ */

function drawCostaAzulQuotation(doc, context) {
  const { branding, quote, trip, client, services, vouchers, operators, mode, publicBaseUrl } = context;

  drawVisualCover(doc, branding);
  drawMainTitle(doc, quote, trip, mode);
  drawClientIntro(doc, client, quote, trip, mode);
  drawServicesQuotation(doc, services, mode);
  drawVouchersSummary(doc, vouchers, publicBaseUrl);
  drawOperatorsSummary(doc, operators);
  drawGrandTotal(doc, services, mode);
  drawFooterBlock(doc, branding);
}

function drawVisualCover(doc, branding = DEFAULT_BRANDING) {
  const coverPath = resolveAssetPath(branding.cover_image_path, null);
  const logoPath = resolveAssetPath(branding.logo_path, defaultLogoPath);

  if (coverPath && fs.existsSync(coverPath)) {
    try {
      doc.image(coverPath, 58, 42, {
        width: 480,
        height: 140
      });
      doc.y = 205;
      return;
    } catch (err) {
      console.error("COVER IMAGE ERROR:", err);
    }
  }

  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 58, 42, { width: 125 });
    } catch (err) {
      console.error("HEADER LOGO ERROR:", err);
    }
  }

  doc
    .font(PDF_STYLE.fonts.title)
    .fontSize(14)
    .fillColor(PDF_STYLE.colors.black)
    .text(branding.company_name || DEFAULT_BRANDING.company_name, 205, 48, { width: 330 });

  const lines = [
    branding.company_email,
    branding.company_phone,
    branding.company_address,
    branding.company_website
  ].filter(Boolean);

  let y = 70;
  lines.forEach(line => {
    doc.font(PDF_STYLE.fonts.body).fontSize(8.5).fillColor(PDF_STYLE.colors.gray).text(line, 205, y, { width: 330 });
    y += 13;
  });

  doc.moveTo(58, 130).lineTo(538, 130).lineWidth(0.7).strokeColor(PDF_STYLE.colors.lightGray).stroke();
  doc.y = 158;
}

function drawMainTitle(doc, quote, trip, mode) {
  const title = (quote?.titulo || "COTIZACIÓN DE SERVICIOS").toUpperCase();
  const destination = (trip?.destino || trip?.nombre || "").toUpperCase();
  const month = getMonthYearText(quote?.fecha_creacion || trip?.fecha_inicio || new Date());
  const documentType = mode === "full" ? "DETALLADA CON PRECIOS" : "INFORMATIVA SIN PRECIOS";

  doc
    .font(PDF_STYLE.fonts.title)
    .fontSize(12)
    .fillColor(PDF_STYLE.colors.black)
    .text(title || "COTIZACIÓN DE SERVICIOS", 58, doc.y, { width: 480 });

  if (destination) {
    doc.font(PDF_STYLE.fonts.title).fontSize(11).text(destination, { width: 480 });
  }

  doc.font(PDF_STYLE.fonts.body).fontSize(9.5).fillColor(PDF_STYLE.colors.gray).text(month, { width: 480 });
  doc.moveDown(0.35);
  doc.font(PDF_STYLE.fonts.body).fontSize(8).fillColor(PDF_STYLE.colors.gray).text(documentType, { width: 480 });
  doc.moveDown(1.1);
}

function drawClientIntro(doc, client, quote, trip, mode) {
  const firstName = extractFirstName(client?.nombre) || "";
  const salutation = firstName ? `Hola ${firstName}, buenas tardes.` : "Hola, buenas tardes.";

  doc
    .font(PDF_STYLE.fonts.body)
    .fontSize(9.5)
    .fillColor(PDF_STYLE.colors.black)
    .text(salutation, { width: 480, lineGap: 2 });

  doc.moveDown(0.8);

  const customIntro = pickFirstText(
    quote?.mensaje,
    quote?.introduccion,
    quote?.observaciones,
    quote?.descripcion
  );

  const defaultIntro = mode === "full"
    ? "Te compartimos el detalle actualizado de los servicios cotizados. Los importes se expresan según la moneda indicada en cada servicio y quedan sujetos a disponibilidad y eventuales modificaciones hasta el momento de confirmación."
    : "Te compartimos el detalle de los servicios incluidos para revisar el armado general del viaje. Esta versión no muestra importes."

  drawParagraph(doc, customIntro || defaultIntro, {
    width: 480,
    fontSize: 9.5,
    lineGap: 2
  });

  doc.moveDown(0.5);

  const tripInfo = [];
  if (trip?.fecha_inicio || trip?.fecha_fin) {
    tripInfo.push(`Fechas: ${formatDateForPdf(trip?.fecha_inicio)} al ${formatDateForPdf(trip?.fecha_fin)}`);
  }
  if (trip?.pasajero) tripInfo.push(`Pasajeros: ${trip.pasajero}`);

  if (tripInfo.length) {
    doc.font(PDF_STYLE.fonts.body).fontSize(9).fillColor(PDF_STYLE.colors.gray).text(tripInfo.join("  |  "), { width: 480 });
  }

  doc.moveDown(1.4);
}

function drawServicesQuotation(doc, services = [], mode) {
  if (!services?.length) {
    doc.font(PDF_STYLE.fonts.title).fontSize(10.5).fillColor(PDF_STYLE.colors.black).text("SERVICIOS:");
    doc.moveDown(0.4);
    doc.font(PDF_STYLE.fonts.body).fontSize(9).text("No hay servicios cargados para esta cotización.");
    doc.moveDown();
    return;
  }

  services.forEach((service, index) => {
    const category = normalizeServiceCategory(service.categoria || service.tipo || "SERVICIO");
    const metadata = normalizeMetadata(service.metadata);
    const serviceDate = getServiceDate(service, metadata);
    const titleLine = buildServiceTitle(service, category, metadata);

    ensureSpace(doc, 145);

    if (index > 0) drawDashedSeparator(doc);

    if (serviceDate) {
      doc
        .font(PDF_STYLE.fonts.monoBold)
        .fontSize(9.5)
        .fillColor(PDF_STYLE.colors.black)
        .text(serviceDate.toUpperCase(), { width: 480 });
    }

    doc
      .font(PDF_STYLE.fonts.monoBold)
      .fontSize(9.5)
      .fillColor(PDF_STYLE.colors.black)
      .text(category.toUpperCase(), { width: 480 });

    if (titleLine) {
      doc
        .font(PDF_STYLE.fonts.mono)
        .fontSize(9)
        .fillColor(PDF_STYLE.colors.black)
        .text(titleLine.toUpperCase(), { width: 480, lineGap: 1 });
    }

    drawMetadataLines(doc, service, metadata);

    if (service.descripcion) {
      drawServiceText(doc, service.descripcion);
    }

    if (service.observaciones) {
      drawServiceText(doc, service.observaciones);
    }

    drawPassengerLine(doc, service);

    if (mode === "full") {
      drawServicePriceLine(doc, service, metadata, category);
    }

    drawConfirmationLine(doc, service, metadata);

    doc.moveDown(0.5);
  });
}

function drawVouchersSummary(doc, vouchers = [], publicBaseUrl = "") {
  if (!Array.isArray(vouchers) || !vouchers.length) return;

  ensureSpace(doc, 135);
  drawDashedSeparator(doc);

  ensureSpace(doc, 45);
  doc
    .font(PDF_STYLE.fonts.monoBold)
    .fontSize(9.5)
    .fillColor(PDF_STYLE.colors.black)
    .text("VOUCHERS Y PASAJES CARGADOS:", PDF_LAYOUT.left, doc.y, { width: PDF_LAYOUT.contentWidth });
  doc.moveDown(0.3);

  vouchers.forEach(voucher => {
    const files = Array.isArray(voucher.files) ? voucher.files : [];
    const estimatedHeight = 26 + Math.max(files.length, 1) * 16;
    ensureSpace(doc, estimatedHeight);

    const parts = [
      voucher.tipo,
      voucher.proveedor,
      formatDateForPdf(voucher.fecha_asociada)
    ].filter(Boolean).filter(v => v !== "-");

    const voucherText = parts.length ? parts.join(" | ") : "Voucher / pasaje";

    doc
      .font(PDF_STYLE.fonts.monoBold)
      .fontSize(8.5)
      .fillColor(PDF_STYLE.colors.black)
      .text(`- ${voucherText}`, PDF_LAYOUT.left, doc.y, { width: PDF_LAYOUT.contentWidth, lineGap: 1 });

    if (voucher.observaciones) {
      ensureSpace(doc, 22);
      doc
        .font(PDF_STYLE.fonts.mono)
        .fontSize(8)
        .fillColor(PDF_STYLE.colors.gray)
        .text(`  ${normalizeLongSpaces(voucher.observaciones)}`, PDF_LAYOUT.left, doc.y, { width: PDF_LAYOUT.contentWidth - 10, lineGap: 1 });
    }

    files.forEach(file => {
      ensureSpace(doc, 30);

      const label = truncateMiddle(file.original_name || file.stored_name || "archivo adjunto", 58);
      const url = absolutePublicUrl(publicBaseUrl, file.public_url);
      const text = `  Archivo adjunto: ${label}`;

      if (url) {
        doc
          .font(PDF_STYLE.fonts.mono)
          .fontSize(8)
          .fillColor(PDF_STYLE.colors.blue)
          .text(text, PDF_LAYOUT.left, doc.y, {
            width: PDF_LAYOUT.contentWidth,
            link: url,
            underline: true,
            lineGap: 1
          });
      } else {
        doc
          .font(PDF_STYLE.fonts.mono)
          .fontSize(8)
          .fillColor(PDF_STYLE.colors.gray)
          .text(text, PDF_LAYOUT.left, doc.y, { width: PDF_LAYOUT.contentWidth, lineGap: 1 });
      }
    });

    doc.fillColor(PDF_STYLE.colors.black);
    doc.moveDown(files.length ? 0.45 : 0.3);
  });

  doc.fillColor(PDF_STYLE.colors.black);
  doc.moveDown(0.6);
}

function drawOperatorsSummary(doc, operators = []) {
  if (!Array.isArray(operators) || !operators.length) return;

  ensureSpace(doc, 120);
  drawDashedSeparator(doc);

  doc.font(PDF_STYLE.fonts.monoBold).fontSize(9.5).fillColor(PDF_STYLE.colors.black).text("OPERADORES / CONTACTOS:", { width: 480 });
  doc.moveDown(0.3);

  operators.forEach(operator => {
    const contact = [
      operator.nombre,
      operator.tipo_servicio,
      operator.contacto,
      operator.telefono,
      operator.email
    ].filter(Boolean).join(" | ");

    doc.font(PDF_STYLE.fonts.mono).fontSize(8.5).fillColor(PDF_STYLE.colors.black).text(`- ${contact}`, { width: 480 });
  });

  doc.moveDown(0.6);
}

function drawGrandTotal(doc, services = [], mode) {
  if (mode !== "full") return;

  const totals = getTotalsByCurrency(services);
  const entries = Object.entries(totals).filter(([, value]) => Number(value) > 0);

  if (!entries.length) return;

  ensureSpace(doc, 95);
  drawDashedSeparator(doc);

  entries.forEach(([currency, total]) => {
    const label = "TARIFA TOTAL DE LOS SERVICIOS, CON IMPUESTOS, EN DÓLARES:";
    const value = `${currency || "USD"} ${formatMoney(total)}`;

    drawHighlightedLine(doc, label, value, {
      background: PDF_STYLE.colors.yellow,
      fontSize: 9,
      font: PDF_STYLE.fonts.monoBold
    });
  });

  doc.moveDown(0.5);
}

/* ===============================
   COMPONENTES VISUALES COMPATIBLES
================================ */

function drawDynamicSections(doc, sections, context) {
  drawCostaAzulQuotation(doc, context);
}

function drawHeader(doc, branding = DEFAULT_BRANDING) {
  drawVisualCover(doc, branding);
}

function drawProposalIntro(doc, branding, quote, trip, client) {
  drawMainTitle(doc, quote, trip, "full");
  drawClientIntro(doc, client, quote, trip, "full");
}

function drawQuoteBlock(doc, quote, mode) {
  drawMainTitle(doc, quote, null, mode);
}

function drawClientBlock(doc, client) {
  ensureSpace(doc, 80);
  doc.font(PDF_STYLE.fonts.monoBold).fontSize(9.5).fillColor(PDF_STYLE.colors.black).text("DATOS DEL PASAJERO:");
  doc.font(PDF_STYLE.fonts.mono).fontSize(8.8).text(`Nombre: ${client?.nombre || "-"}`);
  if (client?.email) doc.text(`Email: ${client.email}`);
  if (client?.telefono) doc.text(`Teléfono: ${client.telefono}`);
  doc.moveDown();
}

function drawTripBlock(doc, trip) {
  ensureSpace(doc, 80);
  doc.font(PDF_STYLE.fonts.monoBold).fontSize(9.5).fillColor(PDF_STYLE.colors.black).text("DATOS DEL VIAJE:");
  if (trip?.destino) doc.font(PDF_STYLE.fonts.mono).fontSize(8.8).text(`Destino: ${trip.destino}`);
  if (trip?.fecha_inicio || trip?.fecha_fin) doc.text(`Fechas: ${formatDateForPdf(trip?.fecha_inicio)} al ${formatDateForPdf(trip?.fecha_fin)}`);
  if (trip?.pasajero) doc.text(`Pasajeros: ${trip.pasajero}`);
  doc.moveDown();
}

function drawServicesTable(doc, services, mode) {
  drawServicesQuotation(doc, services, mode);
}

function drawServiceMetadata(doc, tipo, metadata = {}) {
  const lines = getServiceMetadataLines(tipo, metadata);
  lines.forEach(line => doc.font(PDF_STYLE.fonts.mono).fontSize(8.5).fillColor(PDF_STYLE.colors.black).text(line, { width: 480 }));
}

function drawVouchersBlock(doc, vouchers, publicBaseUrl = "") {
  drawVouchersSummary(doc, vouchers, publicBaseUrl);
}

function drawOperatorsBlock(doc, operators) {
  drawOperatorsSummary(doc, operators);
}

function drawLegalBlock(doc, quote) {
  // Campo retirado de la nueva estructura visual.
}

function drawFooterBlock(doc, branding = DEFAULT_BRANDING) {
  const text = branding.pdf_footer || DEFAULT_BRANDING.pdf_footer;
  if (!text) return;

  ensureSpace(doc, 70);
  doc.moveDown(0.8);
  doc
    .font(PDF_STYLE.fonts.body)
    .fontSize(8)
    .fillColor(PDF_STYLE.colors.gray)
    .text(text, { width: 480, align: "center" });
}

function addPageFooters(doc, branding = DEFAULT_BRANDING, mode = "full") {
  const range = doc.bufferedPageRange();
  if (!range || !range.count) return;

  const footerText = mode === "full" ? "Cotización con precios" : "Cotización sin precios";
  const lastPageIndex = range.start + range.count - 1;
  const previousY = doc.y;

  for (let i = range.start; i <= lastPageIndex; i += 1) {
    doc.switchToPage(i);

    const originalMargins = { ...doc.page.margins };
    const pageNumber = i - range.start + 1;
    const text = `${branding.company_name || DEFAULT_BRANDING.company_name} · ${footerText} · Página ${pageNumber} de ${range.count}`;

    // IMPORTANTE:
    // PDFKit agrega una página nueva si se llama a text() por debajo del
    // límite calculado con el margen inferior. Para evitar páginas fantasma,
    // el footer se dibuja con coordenadas fijas y margen inferior temporal en 0.
    doc.page.margins.bottom = 0;

    doc
      .save()
      .font(PDF_STYLE.fonts.body)
      .fontSize(7.5)
      .fillColor(PDF_STYLE.colors.gray)
      .text(text, PDF_LAYOUT.left, PDF_LAYOUT.footerY, {
        width: PDF_LAYOUT.contentWidth,
        align: "center",
        lineBreak: false,
        height: 10
      })
      .restore();

    doc.page.margins = originalMargins;
  }

  doc.switchToPage(lastPageIndex);
  doc.y = previousY;
}

/* ===============================
   HELPERS DE RENDER
================================ */

function drawDashedSeparator(doc) {
  ensureSpace(doc, 34);

  const y = doc.y + 6;

  doc
    .save()
    .moveTo(58, y)
    .lineTo(538, y)
    .dash(6, { space: 3 })
    .lineWidth(1)
    .strokeColor("#111111")
    .stroke()
    .undash()
    .restore();

  doc.y = y + 14;
}

function drawParagraph(doc, text, options = {}) {
  if (!text) return;

  doc
    .font(options.font || PDF_STYLE.fonts.body)
    .fontSize(options.fontSize || 9.5)
    .fillColor(options.color || PDF_STYLE.colors.black)
    .text(String(text), {
      width: options.width || 480,
      lineGap: options.lineGap ?? 1.5,
      align: options.align || "left"
    });
}

function drawServiceText(doc, text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  lines.forEach(line => {
    ensureSpace(doc, 28);
    const normalized = normalizeLongSpaces(line);
    const highlight = shouldHighlightLine(normalized);
    const red = shouldUseRedLine(normalized);

    if (highlight) {
      drawHighlightedText(doc, normalized, {
        background: PDF_STYLE.colors.yellow,
        font: PDF_STYLE.fonts.mono,
        fontSize: 8.6,
        color: PDF_STYLE.colors.black
      });
      return;
    }

    doc
      .font(red ? PDF_STYLE.fonts.monoBold : PDF_STYLE.fonts.mono)
      .fontSize(8.6)
      .fillColor(red ? PDF_STYLE.colors.red : PDF_STYLE.colors.black)
      .text(normalized, { width: 480, lineGap: 1 });
  });
}

function drawMetadataLines(doc, service, metadata = {}) {
  const lines = getServiceMetadataLines(service.categoria || service.tipo, metadata);

  lines.forEach(line => {
    ensureSpace(doc, 24);
    doc.font(PDF_STYLE.fonts.mono).fontSize(8.6).fillColor(PDF_STYLE.colors.black).text(line, { width: 480 });
  });
}

function getServiceMetadataLines(tipo, metadata = {}) {
  const normalizedType = String(tipo || "").toLowerCase();
  const lines = [];

  if (normalizedType === "hotel") {
    if (metadata.field_0) lines.push(`Ingreso: ${formatMaybeDate(metadata.field_0)}`);
    if (metadata.field_1) lines.push(`Salida: ${formatMaybeDate(metadata.field_1)}`);
  }

  if (normalizedType === "aereo" || normalizedType === "aéreo") {
    if (metadata.field_0) lines.push(`Aerolínea: ${metadata.field_0}`);
    if (metadata.field_1) lines.push(`Vuelo: ${metadata.field_1}`);
    if (metadata.field_2) lines.push(`Fecha/hora: ${formatMaybeDate(metadata.field_2)}`);
    if (metadata.field_3) lines.push(`Origen / Destino: ${metadata.field_3}`);
  }

  if (normalizedType === "tren") {
    if (metadata.field_0) lines.push(`Fecha/hora: ${formatMaybeDate(metadata.field_0)}`);
    if (metadata.field_1) lines.push(`Salida / llegada: ${metadata.field_1}`);
  }

  if (normalizedType === "auto") {
    if (metadata.field_0) lines.push(`Proveedor: ${metadata.field_0}`);
    if (metadata.field_1) lines.push(`Vehículo: ${metadata.field_1}`);
    if (metadata.field_2) lines.push(`Coberturas: ${metadata.field_2}`);
  }

  return lines;
}

function drawPassengerLine(doc, service) {
  const adults = Number(service.adultos || 0);
  const minors = Number(service.menores || 0);

  if (!adults && !minors) return;

  const parts = [];
  if (adults) parts.push(`${adults} adulto${adults === 1 ? "" : "s"}`);
  if (minors) parts.push(`${minors} menor${minors === 1 ? "" : "es"}`);

  ensureSpace(doc, 24);
  doc
    .font(PDF_STYLE.fonts.mono)
    .fontSize(8.6)
    .fillColor(PDF_STYLE.colors.black)
    .text(`Pasajeros: ${parts.join(" + ")}`, { width: 480 });
}

function drawServicePriceLine(doc, service, metadata, category) {
  const currency = service.moneda || "USD";
  const subtotal = Number(service.subtotal || 0);
  const adults = Number(service.adultos || 0);
  const minors = Number(service.menores || 0);
  const passengersText = buildPassengersText(adults, minors);
  const label = `TARIFA TOTAL DE LOS ${getPriceNoun(category)}, ${passengersText}, EN DOLARES:`;
  const price = `${currency} ${formatMoney(subtotal)}`;

  doc.moveDown(0.15);
  drawPriceLine(doc, label, price, {
    font: PDF_STYLE.fonts.monoBold,
    fontSize: 8.6,
    color: PDF_STYLE.colors.black
  });
}

function drawConfirmationLine(doc, service, metadata) {
  const raw = [service.estado, metadata.estado, metadata.confirmacion, metadata.reserva, metadata.operador]
    .filter(Boolean)
    .join(" ");

  if (!raw) return;

  const cleaned = normalizeLongSpaces(raw);
  if (!cleaned) return;

  ensureSpace(doc, 28);
  doc
    .font(PDF_STYLE.fonts.monoBold)
    .fontSize(8.6)
    .fillColor(PDF_STYLE.colors.red)
    .text(cleaned.toUpperCase(), { width: 480 });
}

function drawRightAlignedValueLine(doc, label, value, options = {}) {
  return drawPriceLine(doc, label, value, options);
}

function drawHighlightedLine(doc, label, value, options = {}) {
  const font = options.font || PDF_STYLE.fonts.monoBold;
  const fontSize = options.fontSize || 8.6;
  const lineGap = options.lineGap ?? 1;
  const labelHeight = doc.heightOfString(String(label || ""), {
    width: PDF_LAYOUT.priceLabelWidth,
    lineGap
  });
  const valueHeight = doc.heightOfString(String(value || ""), {
    width: PDF_LAYOUT.priceValueWidth,
    align: "right",
    lineGap
  });
  const height = Math.max(labelHeight, valueHeight, fontSize + 3) + 6;

  ensureSpace(doc, height + 8);

  const y = doc.y;
  doc.rect(PDF_LAYOUT.left, y - 2, PDF_LAYOUT.contentWidth, height).fill(options.background || PDF_STYLE.colors.yellow);
  doc.fillColor(PDF_STYLE.colors.black);

  drawPriceLine(doc, label, value, {
    ...options,
    font,
    fontSize,
    skipEnsure: true
  });
}

function drawHighlightedText(doc, text, options = {}) {
  const font = options.font || PDF_STYLE.fonts.mono;
  const fontSize = options.fontSize || 8.6;
  const width = 480;
  const height = doc.heightOfString(text, { width, lineGap: 1 }) + 3;
  const y = doc.y;

  doc.rect(58, y - 1, width, height).fill(options.background || PDF_STYLE.colors.yellow);
  doc
    .font(font)
    .fontSize(fontSize)
    .fillColor(options.color || PDF_STYLE.colors.black)
    .text(text, 58, y, { width, lineGap: 1 });
}

/* ===============================
   HELPERS DE DATOS
================================ */

function normalizeMetadata(metadata) {
  if (!metadata) return {};

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  return {};
}

function formatDateForPdf(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("es-AR");
}

function formatMaybeDate(value) {
  if (!value) return "";

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime()) && String(value).match(/^\d{4}-\d{2}-\d{2}/)) {
    return asDate.toLocaleDateString("es-AR");
  }

  return String(value);
}

function getMonthYearText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric"
  });
}

function extractFirstName(name) {
  const clean = String(name || "").trim();
  if (!clean) return "";

  if (clean.includes(",")) {
    return clean.split(",")[1]?.trim()?.split(/\s+/)[0] || clean.split(",")[0].trim();
  }

  return clean.split(/\s+/)[0];
}

function pickFirstText(...values) {
  return values.find(value => typeof value === "string" && value.trim())?.trim() || "";
}

function normalizeServiceCategory(value) {
  const raw = String(value || "servicio").trim();
  const map = {
    hotel: "Hotel",
    aereo: "Pasajes aéreos",
    aéreo: "Pasajes aéreos",
    vuelo: "Pasajes aéreos",
    excursion: "Excursión",
    excursión: "Excursión",
    asistencia: "Asistencia al viajero",
    crucero: "Crucero",
    traslado: "Traslado",
    tren: "Tren",
    auto: "Alquiler de auto",
    gastos: "Gastos de reserva"
  };

  return map[raw.toLowerCase()] || capitalize(raw);
}

function buildServiceTitle(service, category, metadata = {}) {
  const parts = [];

  if (service.descripcion) {
    const firstLine = String(service.descripcion).split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (firstLine && firstLine.length <= 95) parts.push(firstLine);
  }

  if (!parts.length && metadata.field_0) parts.push(metadata.field_0);
  if (!parts.length && category) parts.push(category);

  return parts[0] || "";
}

function getServiceDate(service, metadata = {}) {
  const candidates = [
    metadata.fecha,
    metadata.date,
    metadata.field_2,
    metadata.field_0,
    service.fecha,
    service.fecha_inicio
  ].filter(Boolean);

  for (const value of candidates) {
    const formatted = formatMaybeDate(value);
    if (formatted) return formatted;
  }

  return "";
}

function buildPassengersText(adults, minors) {
  const total = Number(adults || 0) + Number(minors || 0);
  if (total > 0) return `LAS ${total} PERSONA${total === 1 ? "" : "S"}`;
  return "LOS PASAJEROS";
}

function getPriceNoun(category = "") {
  const lower = String(category).toLowerCase();
  if (lower.includes("pasaje") || lower.includes("aéreo") || lower.includes("aereo") || lower.includes("tren")) return "PASAJES";
  return "SERVICIOS";
}

function getTotalsByCurrency(services = []) {
  return services.reduce((acc, service) => {
    const currency = service.moneda || "USD";
    acc[currency] = Number(acc[currency] || 0) + Number(service.subtotal || 0);
    return acc;
  }, {});
}

function shouldHighlightLine(line = "") {
  const text = String(line).toLowerCase();
  return (
    text.includes("permite cancelación") ||
    text.includes("permite cancelacion") ||
    text.includes("cancelación sin costo") ||
    text.includes("cancelacion sin costo") ||
    text.includes("tarifa total de los servicios, con impuestos")
  );
}

function shouldUseRedLine(line = "") {
  const text = String(line).toLowerCase();
  return (
    text.includes("confirmado") ||
    text.includes("emitido") ||
    text.includes("reconfirmado") ||
    text.includes("pasajes reemitidos") ||
    text.includes("asientos sudameria")
  );
}

function normalizeLongSpaces(value) {
  return String(value || "").replace(/\t/g, " ").replace(/ {2,}/g, " ").trim();
}

function truncateMiddle(value, maxLength = 58) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;

  const keep = Math.max(maxLength - 3, 12);
  const left = Math.ceil(keep * 0.62);
  const right = keep - left;

  return `${text.slice(0, left)}...${text.slice(text.length - right)}`;
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function capitalize(value) {
  const str = String(value || "");
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function ensureSpace(doc, requiredHeight = 80) {
  const safeHeight = Math.max(Number(requiredHeight) || 0, 0);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - PDF_LAYOUT.bottomReserve;

  if (doc.y + safeHeight > bottomLimit) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function drawPriceLine(doc, label, value = "", options = {}) {
  const font = options.font || PDF_STYLE.fonts.monoBold;
  const fontSize = options.fontSize || 8.6;
  const color = options.color || PDF_STYLE.colors.black;
  const lineGap = options.lineGap ?? 1;
  const labelText = normalizeLongSpaces(label || "");
  const valueText = normalizeLongSpaces(value || "");

  doc.font(font).fontSize(fontSize);

  const labelHeight = doc.heightOfString(labelText, {
    width: PDF_LAYOUT.contentWidth,
    lineGap
  });
  const valueHeight = valueText
    ? doc.heightOfString(valueText, {
        width: PDF_LAYOUT.contentWidth,
        align: "right",
        lineGap
      })
    : 0;
  const height = labelHeight + (valueText ? valueHeight + 2 : 0) + 8;

  if (!options.skipEnsure) {
    ensureSpace(doc, height + 12);
  }

  const y = doc.y;

  doc
    .font(font)
    .fontSize(fontSize)
    .fillColor(color)
    .text(labelText, PDF_LAYOUT.left, y, {
      width: PDF_LAYOUT.contentWidth,
      lineGap
    });

  if (valueText) {
    doc
      .font(font)
      .fontSize(fontSize)
      .fillColor(color)
      .text(valueText, PDF_LAYOUT.left, y + labelHeight + 2, {
        width: PDF_LAYOUT.contentWidth,
        align: "right",
        lineGap
      });
  }

  doc.y = y + height;
}