USE pdf_costazul;

CREATE TABLE IF NOT EXISTS internal_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'Documento sin título',
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db := DATABASE();
SET @table := 'internal_documents';

SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@table AND COLUMN_NAME='content_html')=0,
  'ALTER TABLE internal_documents ADD COLUMN content_html LONGTEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@table AND COLUMN_NAME='content_text')=0,
  'ALTER TABLE internal_documents ADD COLUMN content_text LONGTEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@table AND COLUMN_NAME='is_template')=0,
  'ALTER TABLE internal_documents ADD COLUMN is_template TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@table AND COLUMN_NAME='favorite')=0,
  'ALTER TABLE internal_documents ADD COLUMN favorite TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@table AND COLUMN_NAME='updated_by')=0,
  'ALTER TABLE internal_documents ADD COLUMN updated_by INT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@table AND COLUMN_NAME='deleted_at')=0,
  'ALTER TABLE internal_documents ADD COLUMN deleted_at DATETIME NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE internal_documents
SET
  content_html = COALESCE(NULLIF(content_html, ''), content_html),
  content_text = COALESCE(NULLIF(content_text, ''), content_text);
