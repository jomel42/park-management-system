import { pool } from '../../../config/db.js';

export class AuthRepository {

    static async findByEmail(email){

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
}