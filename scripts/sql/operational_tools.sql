-- Herramientas operativas Costa Azul
-- Este archivo es opcional: el backend también crea estas tablas automáticamente.

CREATE TABLE IF NOT EXISTS travel_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pendiente',
  priority VARCHAR(30) NOT NULL DEFAULT 'media',
  due_date DATE NULL,
  client_id INT NULL,
  viaje_id INT NULL,
  cotizacion_id INT NULL,
  assigned_to INT NULL,
  created_by INT NULL,
  completed_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS travel_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  viaje_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(80) NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id INT NOT NULL UNIQUE,
  status VARCHAR(40) NOT NULL DEFAULT 'pendiente',
  approved_by_name VARCHAR(255) NULL,
  approved_by_contact VARCHAR(255) NULL,
  notes TEXT NULL,
  approved_at DATETIME NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
