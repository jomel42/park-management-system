CREATE TABLE IF NOT EXISTS reportes_gestion (
  id_reporte INT PRIMARY KEY,
  id_gestor INT NULL,
  es_critico TINYINT(1) NOT NULL DEFAULT 0,
  observaciones TEXT NULL,
  actualizado_por INT NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reportes_gestion_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
  CONSTRAINT fk_reportes_gestion_gestor FOREIGN KEY (id_gestor) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_reportes_gestion_actualizado FOREIGN KEY (actualizado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

ALTER TABLE imagenes_reportes
  ADD COLUMN nombre_archivo VARCHAR(255) NULL AFTER url_imagen,
  ADD COLUMN tipo VARCHAR(80) NULL AFTER nombre_archivo,
  ADD COLUMN tamano INT NULL AFTER tipo;

CREATE INDEX idx_imagenes_reportes_reporte ON imagenes_reportes (id_reporte);
CREATE INDEX idx_reportes_estado_prioridad ON reportes (id_estado_reporte, id_prioridad);
CREATE INDEX idx_reportes_parque_estado ON reportes (id_parque, id_estado_reporte);
CREATE INDEX idx_reportes_gestion_gestor ON reportes_gestion (id_gestor);

CREATE TABLE IF NOT EXISTS reportes_comentarios (
  id_comentario INT PRIMARY KEY AUTO_INCREMENT,
  id_reporte INT NOT NULL,
  id_usuario INT NOT NULL,
  comentario TEXT NOT NULL,
  tipo ENUM('gestion','avance','cierre') NOT NULL DEFAULT 'gestion',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comentarios_reporte (id_reporte, creado_en),
  CONSTRAINT fk_comentarios_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
  CONSTRAINT fk_comentarios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reportes_evidencias (
  id_evidencia INT PRIMARY KEY AUTO_INCREMENT,
  id_reporte INT NOT NULL,
  id_usuario INT NOT NULL,
  ruta VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) NULL,
  tipo VARCHAR(80) NULL,
  tamano INT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evidencias_reporte (id_reporte, creado_en),
  CONSTRAINT fk_evidencias_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
  CONSTRAINT fk_evidencias_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);
