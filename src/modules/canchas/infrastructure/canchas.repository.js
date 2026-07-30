import { pool }
from '../../../config/db.js';
import { ParquesRepository }
from '../../parques/infrastructure/parques.repository.js';

export class CanchasRepository {

    /*
    GET ALL
    */

   
static async getAll(){

    await ParquesRepository.ensureScheduleColumns();

    const [rows] = await pool.query(

        `
        SELECT

            c.*,

            p.nombre AS parque_nombre,

            TIME_FORMAT(COALESCE(p.hora_apertura, '06:00:00'), '%H:%i') AS hora_apertura,

            TIME_FORMAT(COALESCE(p.hora_cierre, '20:00:00'), '%H:%i') AS hora_cierre,

            CASE
                WHEN p.esta_abierto = 1
                 AND (
                    (
                        COALESCE(p.hora_apertura, '06:00:00') <= COALESCE(p.hora_cierre, '20:00:00')
                        AND CURTIME() BETWEEN COALESCE(p.hora_apertura, '06:00:00') AND COALESCE(p.hora_cierre, '20:00:00')
                    )
                    OR
                    (
                        COALESCE(p.hora_apertura, '06:00:00') > COALESCE(p.hora_cierre, '20:00:00')
                        AND (CURTIME() >= COALESCE(p.hora_apertura, '06:00:00') OR CURTIME() <= COALESCE(p.hora_cierre, '20:00:00'))
                    )
                 )
                THEN 1
                ELSE 0
            END AS parque_abierto_ahora,

            ec.nombre AS nombre_estado

        FROM canchas c

        LEFT JOIN parques p
        ON c.id_parque = p.id_parque

        LEFT JOIN estados_cancha ec
        ON c.id_estado_cancha =
           ec.id_estado_cancha

        ORDER BY c.id_cancha DESC
        `
    );

    return rows;
}



    /*
    CREATE
    */

   
static async create(data){

    const {

        nombre,
        id_parque,
        id_estado_cancha

    } = data;

    await pool.query(

        `
        INSERT INTO canchas
        (
            nombre,
            id_parque,
            id_estado_cancha
        )

        VALUES
        (
            ?, ?, ?
        )
        `,

        [
            nombre,
            id_parque,
            id_estado_cancha
        ]
    );
}



    /*
    UPDATE
    */


static async update(id,data){

    const {

        nombre,
        id_parque,
        id_estado_cancha

    } = data;

    await pool.query(

        `
        UPDATE canchas
        SET

            nombre=?,
            id_parque=?,
            id_estado_cancha=?

        WHERE id_cancha=?
        `,

        [
            nombre,
            id_parque,
            id_estado_cancha,
            id
        ]
    );
}



    /*
    DELETE
    */

    static async delete(id){

        await pool.query(

            `
            DELETE FROM canchas
            WHERE id_cancha=?
            `,

            [id]
        );
    }

    /*
    ESTADO
    */

   
static async cambiarEstado(

    id,
    id_estado_cancha

){

    await pool.query(

        `
        UPDATE canchas
        SET

            id_estado_cancha=?

        WHERE id_cancha=?
        `,

        [
            id_estado_cancha,
            id
        ]
    );
}


}

