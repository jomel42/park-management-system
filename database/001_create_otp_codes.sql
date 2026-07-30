CREATE TABLE IF NOT EXISTS otp_codes (
  id_otp BIGINT PRIMARY KEY AUTO_INCREMENT,
  id_usuario INT NOT NULL,
  email VARCHAR(150) NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  expira_en DATETIME NOT NULL,
  intentos INT NOT NULL DEFAULT 0,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  usado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_usuario_activo (id_usuario, usado, expira_en),
  INDEX idx_otp_email (email),
  CONSTRAINT fk_otp_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
);

