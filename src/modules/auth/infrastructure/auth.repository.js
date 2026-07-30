import { pool }
from '../../../config/db.js';

export class AuthRepository {

    /*
    BUSCAR USUARIO
    */

    static async login(email){

        const [rows] = await pool.query(

            `
            SELECT
                u.*,
                r.nombre AS rol
            FROM usuarios u
            INNER JOIN roles r
            ON u.id_rol = r.id_rol
            WHERE u.email = ?
            `,

            [email]
        );

        return rows[0];
    }

    /*
    REGISTRAR USUARIO CIUDADANO
    */

    static async register(data){

        const {
            nombre,
            apellido_paterno,
            apellido_materno,
            email,
            password
        } = data;

        const [result] = await pool.query(

            `
            INSERT INTO usuarios
            (
                nombre,
                apellido_paterno,
                apellido_materno,
                email,
                password,
                id_rol,
                activo
            )
            VALUES
            (
                ?, ?, ?, ?, ?, 3, 1
            )
            `,

            [
                nombre,
                apellido_paterno,
                apellido_materno,
                email,
                password
            ]
        );

        return result.insertId;
    }
    // Registrar usuario pendiente de verificación
static async registerPending(data) {
  const {
    nombre, apellido_paterno, apellido_materno,
    email, password, codigo, expira
  } = data;

  const [result] = await pool.query(
    `INSERT INTO usuarios
      (nombre, apellido_paterno, apellido_materno, email, password,
       id_rol, activo, verificado, codigo_verificacion, codigo_expira)
     VALUES (?, ?, ?, ?, ?, 3, 1, 0, ?, ?)`,
    [nombre, apellido_paterno, apellido_materno, email, password, codigo, expira]
  );

  return result.insertId;
}

// Buscar usuario no verificado por email
static async findPendingByEmail(email) {
  const [rows] = await pool.query(
    `SELECT * FROM usuarios WHERE email = ? AND verificado = 0`,
    [email]
  );
  return rows[0];
}

// Marcar usuario como verificado y limpiar código
static async markVerified(id_usuario) {
  await pool.query(
    `UPDATE usuarios
     SET verificado = 1, codigo_verificacion = NULL, codigo_expira = NULL
     WHERE id_usuario = ?`,
    [id_usuario]
  );
}
static async updateCode(email, codigo, expira) {
  await pool.query(
    `UPDATE usuarios 
     SET codigo_verificacion = ?, codigo_expira = ? 
     WHERE email = ?`,
    [codigo, expira, email]
  );
}
}
