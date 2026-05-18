import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

/* ENV */
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

/* ROUTES */
import viajesRoutes from "./routes/viajes.routes.js";
import clientsRoutes from "./routes/clients.routes.js";
import clientDocumentsRoutes from "./routes/clientDocuments.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";
import pdfSectionsRoutes from "./routes/pdfSections.routes.js";
import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import cotizacionesRoutes from "./routes/cotizaciones.routes.js";
import serviciosRoutes from "./routes/servicios.routes.js";
import itineraryRoutes from "./routes/itinerary.routes.js";
import voucherRoutes from "./routes/voucher.routes.js";
import operatorRoutes from "./routes/operator.routes.js";
import companyProfileRoutes from "./routes/companyProfile.routes.js";
import internalDocumentsRoutes from "./routes/internalDocuments.routes.js";
import operationalRoutes from "./routes/operational.routes.js";
import advancedRoutes from "./routes/advanced.routes.js";

/* INIT */
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

/* CORS */
const allowedOrigins = new Set([
  "https://pdfcosta.netlify.app",
  "https://pdfcostaazul.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if (hostname.endsWith(".netlify.app")) return true;

    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.options("*", cors());
/* MIDDLEWARES */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* STATIC */
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* API */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/company-profile", companyProfileRoutes);
app.use("/api/clientes", clientsRoutes);
app.use("/api/viajes", viajesRoutes);
app.use("/api/cotizaciones", cotizacionesRoutes);
app.use("/api/servicios", serviciosRoutes);
app.use("/api/client-documents", clientDocumentsRoutes);
app.use("/api/pdfs", pdfRoutes);
app.use("/api/pdf-sections", pdfSectionsRoutes);
app.use("/api/itinerarios", itineraryRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/operadores", operatorRoutes);
app.use("/api/internal-documents", internalDocumentsRoutes);
app.use("/api/operational", operationalRoutes);
app.use("/api/advanced", advancedRoutes);

/* HEALTH */
app.get("/", (_, res) => {
  res.status(200).send("Backend funcionando 🚀");
});

/* 404 */
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

/* ERRORS */
app.use((err, req, res, next) => {
  console.error("Error global:", err);

  if (err.message?.startsWith("Origen no permitido por CORS")) {
    return res.status(403).json({ error: err.message });
  }

  return res.status(500).json({ error: "Error interno del servidor" });
});

/* START */
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});