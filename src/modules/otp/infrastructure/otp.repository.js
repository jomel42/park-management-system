import { pool } from '../../../config/db.js';

export class OtpRepository {
  static async create({ id_usuario, email, codigo_hash, expira_en }) {
    const [result] = await pool.query(
      `INSERT INTO otp_codes
        (id_usuario, email, codigo_hash, expira_en, intentos, usado)
       VALUES (?, ?, ?, ?, 0, 0)`,
      [id_usuario, email, codigo_hash, expira_en]
    );

    return result.insertId;
  }

  static async findActiveById(id_otp) {
    const [rows] = await pool.query(
      `SELECT
         o.*,
         u.nombre,
         u.apellido_paterno,
         u.apellido_materno,
         u.id_rol,
         u.activo,
         u.verificado,
         r.nombre AS rol
       FROM otp_codes o
       INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
       INNER JOIN roles r ON u.id_rol = r.id_rol
       WHERE o.id_otp = ?
       LIMIT 1`,
      [id_otp]
    );

    return rows[0];
  }

  static async incrementAttempts(id_otp) {
    await pool.query(
      `UPDATE otp_codes SET intentos = intentos + 1 WHERE id_otp = ?`,
      [id_otp]
    );
  }

  static async markUsed(id_otp) {
    await pool.query(
      `UPDATE otp_codes SET usado = 1, usado_en = NOW() WHERE id_otp = ?`,
      [id_otp]
    );
  }

  static async invalidateUserOtps(id_usuario) {
    await pool.query(
      `UPDATE otp_codes
       SET usado = 1, usado_en = NOW()
       WHERE id_usuario = ? AND usado = 0`,
      [id_usuario]
    );
  }
}

