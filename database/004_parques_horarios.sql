/*
  Horarios operativos de parques.
  Ejecutar despues de crear la tabla parques.
*/

DELIMITER $$

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
END$$

DELIMITER ;

CALL sp_add_column_if_missing('parques', 'hora_apertura', '`hora_apertura` TIME NOT NULL DEFAULT ''06:00:00'' AFTER `esta_abierto`');
CALL sp_add_column_if_missing('parques', 'hora_cierre', '`hora_cierre` TIME NOT NULL DEFAULT ''20:00:00'' AFTER `hora_apertura`');

UPDATE parques
SET
  hora_apertura = COALESCE(hora_apertura, '06:00:00'),
  hora_cierre = COALESCE(hora_cierre, '20:00:00');

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
