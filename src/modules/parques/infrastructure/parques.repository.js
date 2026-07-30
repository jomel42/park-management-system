import { pool }
from '../../../config/db.js';

const DEFAULT_OPEN_TIME = '06:00:00';
const DEFAULT_CLOSE_TIME = '20:00:00';
let scheduleColumnsReady = null;

function isTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(value || ''));
}

function normalizeTime(value, fallback) {
    if (!isTime(value)) return fallback;
    const parts = String(value).split(':');
    return `${parts[0]}:${parts[1]}:${parts[2] || '00'}`;
}

async function columnExists(table, column) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [table, column]
    );

    return Number(rows[0]?.total || 0) > 0;
}

async function addColumnIfMissing(table, column, definition) {
    if (!(await columnExists(table, column))) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    }
}

async function ensureScheduleColumns() {
    if (!scheduleColumnsReady) {
        scheduleColumnsReady = (async () => {
            await addColumnIfMissing(
                'parques',
                'hora_apertura',
                "`hora_apertura` TIME NOT NULL DEFAULT '06:00:00' AFTER `esta_abierto`"
            );
            await addColumnIfMissing(
                'parques',
                'hora_cierre',
                "`hora_cierre` TIME NOT NULL DEFAULT '20:00:00' AFTER `hora_apertura`"
            );
        })();
    }

    return scheduleColumnsReady;
}

function scheduleColumns(alias = 'p') {
    return `
        TIME_FORMAT(COALESCE(${alias}.hora_apertura, '${DEFAULT_OPEN_TIME}'), '%H:%i') AS hora_apertura,
        TIME_FORMAT(COALESCE(${alias}.hora_cierre, '${DEFAULT_CLOSE_TIME}'), '%H:%i') AS hora_cierre,
        CASE
            WHEN ${alias}.esta_abierto = 1
             AND (
                (
                    COALESCE(${alias}.hora_apertura, '${DEFAULT_OPEN_TIME}') <= COALESCE(${alias}.hora_cierre, '${DEFAULT_CLOSE_TIME}')
                    AND CURTIME() BETWEEN COALESCE(${alias}.hora_apertura, '${DEFAULT_OPEN_TIME}') AND COALESCE(${alias}.hora_cierre, '${DEFAULT_CLOSE_TIME}')
                )
                OR
                (
                    COALESCE(${alias}.hora_apertura, '${DEFAULT_OPEN_TIME}') > COALESCE(${alias}.hora_cierre, '${DEFAULT_CLOSE_TIME}')
                    AND (CURTIME() >= COALESCE(${alias}.hora_apertura, '${DEFAULT_OPEN_TIME}') OR CURTIME() <= COALESCE(${alias}.hora_cierre, '${DEFAULT_CLOSE_TIME}'))
                )
             )
            THEN 1
            ELSE 0
        END AS abierto_ahora
    `;
}

export class ParquesRepository {

    static async ensureScheduleColumns(){
        await ensureScheduleColumns();
    }

    /*
    GET ALL
    */

    static async getAll(){

        await ensureScheduleColumns();

        const [rows] = await pool.query(

            `
            SELECT

                p.*,

                z.nombre_zona,

                ${scheduleColumns('p')}

            FROM parques p

            LEFT JOIN zonas z
            ON p.id_zona = z.id_zona

            ORDER BY p.id_parque DESC
            `
        );

        return rows;
    }

    /*
    CREATE
    */

    static async create(data){

        await ensureScheduleColumns();

        const {

            nombre,
            descripcion,
            id_zona,
            latitud,
            longitud,
            altitud,
            hora_apertura,
            hora_cierre

        } = data;

        const apertura = normalizeTime(hora_apertura, DEFAULT_OPEN_TIME);
        const cierre = normalizeTime(hora_cierre, DEFAULT_CLOSE_TIME);

        const [result] = await pool.query(

            `
            INSERT INTO parques
            (
                nombre,
                descripcion,
                id_zona,
                latitud,
                longitud,
                altitud,
                esta_abierto,
                hora_apertura,
                hora_cierre
            )

            VALUES
            (
                ?, ?, ?, ?, ?, ?, 1, ?, ?
            )
            `,

            [
                nombre,
                descripcion,
                id_zona,
                latitud,
                longitud,
                altitud,
                apertura,
                cierre
            ]
        );

        return result.insertId;
    }

    /*
    UPDATE
    */

    static async update(id,data){

        await ensureScheduleColumns();

        const {

            nombre,
            descripcion,
            id_zona,
            latitud,
            longitud,
            altitud,
            hora_apertura,
            hora_cierre

        } = data;

        const apertura = normalizeTime(hora_apertura, DEFAULT_OPEN_TIME);
        const cierre = normalizeTime(hora_cierre, DEFAULT_CLOSE_TIME);

        await pool.query(

            `
            UPDATE parques
            SET

                nombre=?,
                descripcion=?,
                id_zona=?,
                latitud=?,
                longitud=?,
                altitud=?,
                hora_apertura=?,
                hora_cierre=?

            WHERE id_parque=?
            `,

            [
                nombre,
                descripcion,
                id_zona,
                latitud,
                longitud,
                altitud,
                apertura,
                cierre,
                id
            ]
        );
    }

    /*
    GET BY ID
    */

    static async getById(id){

        await ensureScheduleColumns();

        const [rows] = await pool.query(

            `
            SELECT

                p.*,

                z.nombre_zona,

                ${scheduleColumns('p')}

            FROM parques p

            LEFT JOIN zonas z
            ON p.id_zona = z.id_zona

            WHERE p.id_parque=?
            `,

            [id]
        );

        return rows[0];
    }

    /*
    DELETE
    */

    
   static async delete(id){ const conn = await pool.getConnection(); try{ await conn.beginTransaction(); /* DESACTIVAR FK */ await conn.query( ` SET FOREIGN_KEY_CHECKS = 0 ` ); /* ELIMINAR CANCHAS */ await conn.query( ` DELETE FROM canchas WHERE id_parque=? `, [id] ); /* ELIMINAR PARQUE */ await conn.query( ` DELETE FROM parques WHERE id_parque=? `, [id] ); /* ACTIVAR FK */ await conn.query( ` SET FOREIGN_KEY_CHECKS = 1 ` ); await conn.commit(); }catch(error){ await conn.rollback(); throw error; }finally{ conn.release(); } }



    /*
    ESTADO
    */

    static async cambiarEstado(id){

        await ensureScheduleColumns();

        await pool.query(

            `
            UPDATE parques
            SET esta_abierto =

            CASE
                WHEN esta_abierto = 1
                THEN 0
                ELSE 1
            END

            WHERE id_parque=?
            `,

            [id]
        );
    }
    static async getMapa(){

    await ensureScheduleColumns();

    const [rows] = await pool.query(

        `
        SELECT

            p.id_parque,

            p.nombre,

            p.descripcion,

            p.latitud,

            p.longitud,

            p.esta_abierto,

            ${scheduleColumns('p')},

            z.nombre_zona,

            COUNT(c.id_cancha)
            AS total_canchas

        FROM parques p

        LEFT JOIN zonas z
        ON p.id_zona = z.id_zona

        LEFT JOIN canchas c
        ON p.id_parque = c.id_parque

        GROUP BY
            p.id_parque,
            p.nombre,
            p.descripcion,
            p.latitud,
            p.longitud,
            p.esta_abierto,
            p.hora_apertura,
            p.hora_cierre,
            z.nombre_zona

        ORDER BY p.nombre ASC
        `
    );

    return rows;
}
}
