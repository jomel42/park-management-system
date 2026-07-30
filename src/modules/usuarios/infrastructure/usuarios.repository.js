import { pool }
from '../../../config/db.js';

export class UsuariosRepository {

    /*
    OBTENER TODOS
    */

    static async getAll(){

        const [rows] = await pool.query(

            `
            SELECT
                *
            FROM usuarios
            ORDER BY id_usuario DESC
            `
        );

        return rows;
    }

    /*
    CREAR
    */

    static async create(data){

        const {
            nombre,
            apellido,
            apellido_paterno,
            apellido_materno,
            email,
            password,
            rol
        } = data;

        const paterno =
        apellido_paterno || apellido || "";

        const materno =
        apellido_materno || "";

        await pool.query(

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
                ?, ?, ?, ?, ?, ?, 1
            )
            `,

            [
                nombre,
                paterno,
                materno,
                email,
                password,
                rol
            ]
        );
    }

    /*
    UPDATE
    */

    static async update(data){

        const {
            id,
            nombre,
            apellido,
            apellido_paterno,
            apellido_materno,
            email,
            password,
            rol
        } = data;

        const paterno =
        apellido_paterno || apellido || "";

        const materno =
        apellido_materno || "";

        if(password){

            await pool.query(

                `
                UPDATE usuarios
                SET
                    nombre=?,
                    apellido_paterno=?,
                    apellido_materno=?,
                    email=?,
                    password=?,
                    id_rol=?
                WHERE id_usuario=?
                `,

                [
                    nombre,
                    paterno,
                    materno,
                    email,
                    password,
                    rol,
                    id
                ]
            );

            return;
        }

        await pool.query(

            `
            UPDATE usuarios
            SET
                nombre=?,
                apellido_paterno=?,
                apellido_materno=?,
                email=?,
                id_rol=?
            WHERE id_usuario=?
            `,

            [
                nombre,
                paterno,
                materno,
                email,
                rol,
                id
            ]
        );
    }

    /*
    TOGGLE
    */

    static async toggle(id){

        await pool.query(

            `
            UPDATE usuarios
            SET activo =
            CASE
                WHEN activo = 1
                THEN 0
                ELSE 1
            END
            WHERE id_usuario=?
            `,

            [id]
        );
    }
}
