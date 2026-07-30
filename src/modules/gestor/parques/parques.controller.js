import { pool } from '../../../config/db.js';
import { ParquesRepository } from '../../parques/infrastructure/parques.repository.js';
import { registrarActividad } from '../../notificaciones/infrastructure/actividad.service.js';

export const obtenerParques = async (req, res) => {
    try {
        await ParquesRepository.ensureScheduleColumns();
        const query = `
            SELECT
                p.id_parque,
                p.nombre,
                z.nombre_zona AS zona,
                p.esta_abierto,
                TIME_FORMAT(COALESCE(p.hora_apertura, '06:00:00'), '%H:%i') AS hora_apertura,
                TIME_FORMAT(COALESCE(p.hora_cierre, '20:00:00'), '%H:%i') AS hora_cierre,
                CASE
                    WHEN p.esta_abierto = 1
                     AND (
                        (COALESCE(p.hora_apertura, '06:00:00') <= COALESCE(p.hora_cierre, '20:00:00') AND CURTIME() BETWEEN COALESCE(p.hora_apertura, '06:00:00') AND COALESCE(p.hora_cierre, '20:00:00'))
                        OR
                        (COALESCE(p.hora_apertura, '06:00:00') > COALESCE(p.hora_cierre, '20:00:00') AND (CURTIME() >= COALESCE(p.hora_apertura, '06:00:00') OR CURTIME() <= COALESCE(p.hora_cierre, '20:00:00')))
                     )
                    THEN 1
                    ELSE 0
                END AS abierto_ahora
            FROM parques p
            JOIN zonas z ON p.id_zona = z.id_zona
            WHERE p.activo = 1
        `;
        const [parques] = await pool.query(query);
        res.json({ ok: true, data: parques });
    } catch (error) {
        console.error("Error al obtener parques:", error);
        res.status(500).json({ ok: false, msg: 'Error al cargar los parques' });
    }
};

export const actualizarEstadoParque = async (req, res) => {
    try {
        const { id } = req.params;
        const { esta_abierto, id_usuario } = req.body;

        const [result] = await pool.query(
            'UPDATE parques SET esta_abierto = ? WHERE id_parque = ?',
            [esta_abierto, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, msg: 'Parque no encontrado' });
        }

        await registrarActividad({
            id_usuario:     id_usuario || 1,
            accion:         esta_abierto ? 'ACTIVAR' : 'DESACTIVAR',
            tabla_afectada: 'parques',
            detalle:        `Cambió estado del parque #${id} a ${esta_abierto ? 'abierto' : 'cerrado'}`
        });

        res.json({ ok: true, msg: 'Estado del parque actualizado' });
    } catch (error) {
        console.error("Error al actualizar parque:", error);
        res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
    }
};