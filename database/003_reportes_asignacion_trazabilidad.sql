/*
  Migracion 003
  Reportes por cancha, asignacion formal y trazabilidad.

  Ejecutar despues de 001_create_otp_codes.sql y 002_reportes_incidencias.sql.
  El script es idempotente: valida columnas, indices y claves antes de crearlos.
*/

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_add_column_if_missing $$
CREATE PROCEDURE sp_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_add_index_if_missing $$
CREATE PROCEDURE sp_add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_add_fk_if_missing $$
CREATE PROCEDURE sp_add_fk_if_missing(
  IN p_table VARCHAR(64),
  IN p_constraint VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_constraint
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_add_fk_on_column_if_missing $$
CREATE PROCEDURE sp_add_fk_on_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_constraint VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
      AND REFERENCED_TABLE_NAME IS NOT NULL
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL sp_add_column_if_missing('reportes', 'id_cancha', '`id_cancha` INT NULL AFTER `id_zona`');
CALL sp_add_index_if_missing('reportes', 'idx_reportes_cancha', '(`id_cancha`)');
CALL sp_add_fk_on_column_if_missing(
  'reportes',
  'id_cancha',
  'fk_reportes_cancha',
  'FOREIGN KEY (`id_cancha`) REFERENCES `canchas`(`id_cancha`) ON DELETE RESTRICT ON UPDATE RESTRICT'
);

CALL sp_add_column_if_missing('imagenes_reportes', 'nombre_archivo', '`nombre_archivo` VARCHAR(255) NULL AFTER `url_imagen`');
CALL sp_add_column_if_missing('imagenes_reportes', 'tipo', '`tipo` VARCHAR(80) NULL AFTER `nombre_archivo`');
CALL sp_add_column_if_missing('imagenes_reportes', 'tamano', '`tamano` INT NULL AFTER `tipo`');
CALL sp_add_index_if_missing('imagenes_reportes', 'idx_imagenes_reportes_reporte', '(`id_reporte`)');

CREATE TABLE IF NOT EXISTS reportes_gestion (
  id_reporte INT PRIMARY KEY,
  id_gestor INT NULL,
  es_critico TINYINT(1) NOT NULL DEFAULT 0,
  observaciones TEXT NULL,
  fecha_limite DATETIME NULL,
  fecha_asignacion DATETIME NULL,
  asignado_por INT NULL,
  actualizado_por INT NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reportes_gestion_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
  CONSTRAINT fk_reportes_gestion_gestor FOREIGN KEY (id_gestor) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_reportes_gestion_asignado FOREIGN KEY (asignado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_reportes_gestion_actualizado FOREIGN KEY (actualizado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

CALL sp_add_column_if_missing('reportes_gestion', 'fecha_limite', '`fecha_limite` DATETIME NULL AFTER `observaciones`');
CALL sp_add_column_if_missing('reportes_gestion', 'fecha_asignacion', '`fecha_asignacion` DATETIME NULL AFTER `fecha_limite`');
CALL sp_add_column_if_missing('reportes_gestion', 'asignado_por', '`asignado_por` INT NULL AFTER `fecha_asignacion`');
CALL sp_add_index_if_missing('reportes_gestion', 'idx_reportes_gestion_gestor', '(`id_gestor`)');
CALL sp_add_index_if_missing('reportes_gestion', 'idx_reportes_gestion_actualizado', '(`actualizado_en`)');
CALL sp_add_fk_if_missing(
  'reportes_gestion',
  'fk_reportes_gestion_asignado',
  'FOREIGN KEY (`asignado_por`) REFERENCES `usuarios`(`id_usuario`) ON DELETE SET NULL ON UPDATE RESTRICT'
);

CREATE TABLE IF NOT EXISTS asignacion_reportes (
  id_asignacion INT PRIMARY KEY AUTO_INCREMENT,
  id_reporte INT NOT NULL,
  id_gestor INT NOT NULL,
  id_admin INT NULL,
  comentario TEXT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL,
  estado ENUM('asignado','en_proceso','cerrado') NOT NULL DEFAULT 'asignado',
  activa TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_asignacion_reporte_activa (id_reporte, activa, fecha_asignacion),
  INDEX idx_asignacion_gestor_activa (id_gestor, activa),
  CONSTRAINT fk_asignacion_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
  CONSTRAINT fk_asignacion_gestor FOREIGN KEY (id_gestor) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
  CONSTRAINT fk_asignacion_admin FOREIGN KEY (id_admin) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

CALL sp_add_column_if_missing('asignacion_reportes', 'id_admin', '`id_admin` INT NULL AFTER `id_gestor`');
CALL sp_add_column_if_missing('asignacion_reportes', 'comentario', '`comentario` TEXT NULL AFTER `id_admin`');
CALL sp_add_column_if_missing('asignacion_reportes', 'fecha_actualizacion', '`fecha_actualizacion` DATETIME NULL AFTER `fecha_asignacion`');
CALL sp_add_column_if_missing('asignacion_reportes', 'activa', '`activa` TINYINT(1) NOT NULL DEFAULT 1 AFTER `estado`');
CALL sp_add_index_if_missing('asignacion_reportes', 'idx_asignacion_reporte_activa', '(`id_reporte`, `activa`, `fecha_asignacion`)');
CALL sp_add_index_if_missing('asignacion_reportes', 'idx_asignacion_gestor_activa', '(`id_gestor`, `activa`)');
CALL sp_add_fk_if_missing(
  'asignacion_reportes',
  'fk_asignacion_admin',
  'FOREIGN KEY (`id_admin`) REFERENCES `usuarios`(`id_usuario`) ON DELETE SET NULL ON UPDATE RESTRICT'
);

CREATE TABLE IF NOT EXISTS reportes_historial (
  id_historial INT PRIMARY KEY AUTO_INCREMENT,
  id_reporte INT NOT NULL,
  id_usuario INT NULL,
  accion ENUM('creacion','asignacion','reasignacion','estado','comentario','evidencia','actualizacion','cierre','rechazo') NOT NULL,
  estado_anterior INT NULL,
  estado_nuevo INT NULL,
  gestor_anterior INT NULL,
  gestor_nuevo INT NULL,
  comentario TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_historial_reporte_fecha (id_reporte, creado_en),
  INDEX idx_historial_usuario_fecha (id_usuario, creado_en),
  CONSTRAINT fk_historial_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
  CONSTRAINT fk_historial_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_historial_estado_anterior FOREIGN KEY (estado_anterior) REFERENCES estados_reporte(id_estado_reporte) ON DELETE SET NULL,
  CONSTRAINT fk_historial_estado_nuevo FOREIGN KEY (estado_nuevo) REFERENCES estados_reporte(id_estado_reporte) ON DELETE SET NULL,
  CONSTRAINT fk_historial_gestor_anterior FOREIGN KEY (gestor_anterior) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_historial_gestor_nuevo FOREIGN KEY (gestor_nuevo) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

CREATE OR REPLACE VIEW vw_reportes_detalle AS
SELECT
  r.id_reporte,
  r.descripcion,
  r.fecha_creacion,
  r.fecha_actualizacion,
  r.id_parque,
  p.nombre AS parque,
  r.id_cancha,
  c.nombre AS cancha,
  r.id_usuario,
  CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario,
  u.email AS usuario_email,
  r.id_prioridad,
  pr.nombre AS prioridad,
  r.id_estado_reporte,
  er.nombre AS estado,
  rg.id_gestor,
  CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) AS gestor,
  rg.fecha_asignacion,
  rg.observaciones,
  rg.actualizado_en AS ultima_actualizacion
FROM reportes r
JOIN parques p ON p.id_parque = r.id_parque
LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
JOIN usuarios u ON u.id_usuario = r.id_usuario
JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
LEFT JOIN usuarios g ON g.id_usuario = rg.id_gestor;

CREATE OR REPLACE VIEW vw_gestores_estadisticas AS
SELECT
  u.id_usuario AS id_gestor,
  CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS gestor,
  COUNT(rg.id_reporte) AS total_asignados,
  SUM(CASE WHEN r.id_estado_reporte = 3 THEN 1 ELSE 0 END) AS total_completados,
  SUM(CASE WHEN r.id_estado_reporte = 1 THEN 1 ELSE 0 END) AS total_pendientes,
  SUM(CASE WHEN r.id_estado_reporte = 2 THEN 1 ELSE 0 END) AS total_en_proceso,
  AVG(CASE
    WHEN r.id_estado_reporte = 3 THEN TIMESTAMPDIFF(HOUR, COALESCE(rg.fecha_asignacion, r.fecha_creacion), COALESCE(r.fecha_actualizacion, rg.actualizado_en, NOW()))
    ELSE NULL
  END) AS horas_promedio_resolucion
FROM usuarios u
LEFT JOIN reportes_gestion rg ON rg.id_gestor = u.id_usuario
LEFT JOIN reportes r ON r.id_reporte = rg.id_reporte
WHERE u.id_rol = 2
GROUP BY u.id_usuario, u.nombre, u.apellido_paterno, u.apellido_materno;

UPDATE reportes_gestion
SET fecha_asignacion = COALESCE(fecha_asignacion, actualizado_en),
    asignado_por = COALESCE(asignado_por, actualizado_por)
WHERE id_gestor IS NOT NULL;

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
DROP PROCEDURE IF EXISTS sp_add_index_if_missing;
DROP PROCEDURE IF EXISTS sp_add_fk_if_missing;
DROP PROCEDURE IF EXISTS sp_add_fk_on_column_if_missing;
