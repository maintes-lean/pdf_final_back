# Módulo Documentos Internos

Se agregó un módulo para crear documentos editables dentro del sistema, similar a un editor básico tipo Google Docs.

## Backend

Nuevos archivos:

- `models/internalDocument.model.js`
- `controllers/internalDocuments.controller.js`
- `routes/internalDocuments.routes.js`
- `scripts/sql/internal_documents.sql`

Nueva ruta montada en `server.js`:

- `/api/internal-documents`

## Endpoints

- `GET /api/internal-documents`
- `POST /api/internal-documents`
- `GET /api/internal-documents/:id`
- `PUT /api/internal-documents/:id`
- `POST /api/internal-documents/:id/duplicate`
- `DELETE /api/internal-documents/:id`
- `GET /api/internal-documents/:id/pdf`

## Base de datos

La tabla se crea automáticamente al usar el módulo, pero también se incluye el SQL manual:

- `scripts/sql/internal_documents.sql`

## Funcionalidad

- Crear documentos internos.
- Editar contenido HTML y texto plano.
- Vincular documentos a cliente, viaje y cotización.
- Duplicar documentos.
- Eliminación lógica.
- Exportación PDF con PDFKit.
