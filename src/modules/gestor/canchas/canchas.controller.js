import { pool } from '../../../config/db.js';

export const obtenerCanchas = async (req, res) => {
    try {
        const query = `
            SELECT c.id_cancha, c.nombre, p.nombre AS parque, c.id_estado_cancha AS id_estado
            FROM canchas c
            JOIN parques p ON c.id_parque = p.id_parque
            WHERE c.activo = 1
        `;
        const [canchas] = await pool.query(query);
        res.json({ ok: true, data: canchas });
    } catch (error) {
        console.error("Error al obtener canchas:", error);
        res.status(500).json({ ok: false, msg: 'Error al cargar las canchas' });
    }
};

export const actualizarEstadoCancha = async (req, res) => {
    try {
        const { id } = req.params;
        const { id_estado_cancha } = req.body;

        const [result] = await pool.query(
            'UPDATE canchas SET id_estado_cancha = ? WHERE id_cancha = ?', 
            [id_estado_cancha, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, msg: 'Cancha no encontrada' });
        }
        res.json({ ok: true, msg: 'Estado de la cancha actualizado' });
    } catch (error) {
        console.error("Error al actualizar cancha:", error);
        res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
    }
};