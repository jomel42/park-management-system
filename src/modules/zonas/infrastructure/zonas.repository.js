import { pool }
from '../../../config/db.js';

export class ZonasRepository {

    static async getAll(){

        const [rows] = await pool.query(

            `
            SELECT *
            FROM zonas
            ORDER BY nombre_zona ASC
            `
        );

        return rows;
    }
}