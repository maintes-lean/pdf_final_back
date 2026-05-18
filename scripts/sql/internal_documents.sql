USE pdf_costazul;

CREATE TABLE IF NOT EXISTS internal_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content_html LONGTEXT NULL,
  content_text LONGTEXT NULL,
  template_type VARCHAR(80) NULL DEFAULT 'blank',
  client_id INT NULL,
  viaje_id INT NULL,
  cotizacion_id INT NULL,
  is_template TINYINT(1) NOT NULL DEFAULT 0,
  favorite TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_internal_documents_client_id (client_id),
  INDEX idx_internal_documents_viaje_id (viaje_id),
  INDEX idx_internal_documents_cotizacion_id (cotizacion_id),
  INDEX idx_internal_documents_deleted_at (deleted_at),
  CONSTRAINT fk_internal_documents_client
    FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_internal_documents_viaje
    FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE SET NULL,
  CONSTRAINT fk_internal_documents_cotizacion
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_internal_documents_created_by
    FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_internal_documents_updated_by
    FOREIGN KEY (updated_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
