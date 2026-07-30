import { pool } from '../../../config/db.js';

const MIN_SYSTEM_DATE = '2026-03-01';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const obtenerMisTareas = async (req, res) => {
    try {
        const idGestor = req.user?.id || req.user?.id_usuario || req.usuario?.id_usuario; 
        if (!idGestor) {
            return res.status(401).json({ ok: false, msg: 'No autorizado' });
        }

        const query = `
            SELECT r.id_reporte, p.nombre AS parque, c.nombre AS cancha, r.descripcion, 
                   pr.nombre AS prioridad, e.nombre AS estado, r.fecha_creacion, 
                   r.id_estado_reporte, r.id_prioridad, rg.fecha_limite,
                   rg.fecha_asignacion, rg.actualizado_en AS ultima_actualizacion
            FROM reportes r
            JOIN parques p ON r.id_parque = p.id_parque
            LEFT JOIN canchas c ON r.id_cancha = c.id_cancha
            JOIN prioridades pr ON r.id_prioridad = pr.id_prioridad
            JOIN estados_reporte e ON r.id_estado_reporte = e.id_estado_reporte
            JOIN asignacion_reportes ar ON r.id_reporte = ar.id_reporte
            LEFT JOIN reportes_gestion rg ON r.id_reporte = rg.id_reporte
            WHERE ar.id_gestor = ? AND COALESCE(ar.activa, 1) = 1 AND COALESCE(r.activo, 1) = 1
            ORDER BY r.fecha_creacion DESC
        `;
        
        const [tareas] = await pool.query(query, [idGestor]);
        res.json({ ok: true, data: tareas });
    } catch (error) {
        console.error("Error al obtener mis tareas:", error);
        res.status(500).json({ ok: false, msg: 'Error al cargar mis tareas' });
    }
};

export const guardarGestionReporte = async (req, res) => {
    try {
        const idGestor = req.user?.id || req.user?.id_usuario || req.usuario?.id_usuario; 
        if (!idGestor) {
            return res.status(401).json({ ok: false, msg: 'No autorizado' });
        }
        const { id_reporte } = req.params;
        const { estado, fecha_limite, comentario } = req.body;

        if (fecha_limite) {
            const fecha = String(fecha_limite).slice(0, 10);
            if (!DATE_ONLY.test(fecha) || fecha < MIN_SYSTEM_DATE) {
                return res.status(400).json({
                    ok: false,
                    msg: 'La fecha limite no puede ser anterior al 2026-03-01'
                });
            }
        }

        const [asignadas] = await pool.query(
            `SELECT id_asignacion
             FROM asignacion_reportes
             WHERE id_reporte = ? AND id_gestor = ? AND COALESCE(activa, 1) = 1
             LIMIT 1`,
            [id_reporte, idGestor]
        );

        if (!asignadas.length) {
            return res.status(403).json({ ok: false, msg: 'Solo puedes gestionar tareas asignadas a ti' });
        }

        await pool.query(
            'UPDATE reportes SET id_estado_reporte = ?, fecha_actualizacion = NOW() WHERE id_reporte = ?',
            [estado, id_reporte]
        );

        await pool.query(
            `INSERT INTO reportes_comentarios (id_reporte, id_usuario, comentario, tipo) 
             VALUES (?, ?, ?, 'avance')`,
            [id_reporte, idGestor, comentario]
        );

        await pool.query(
            `INSERT INTO reportes_gestion (id_reporte, id_gestor, observaciones, fecha_limite, actualizado_por) 
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             fecha_limite = VALUES(fecha_limite), observaciones = VALUES(observaciones), actualizado_por = VALUES(actualizado_por)`,
            [id_reporte, idGestor, comentario, fecha_limite || null, idGestor]
        );

        await pool.query(
            `UPDATE asignacion_reportes
             SET estado = CASE
               WHEN ? = 2 THEN 'en_proceso'
               WHEN ? IN (3, 4) THEN 'cerrado'
               ELSE 'asignado'
             END,
             fecha_actualizacion = NOW()
             WHERE id_reporte = ? AND id_gestor = ? AND COALESCE(activa, 1) = 1`,
            [estado, estado, id_reporte, idGestor]
        );

        await pool.query(
            `INSERT INTO reportes_historial
               (id_reporte, id_usuario, accion, estado_nuevo, comentario)
             VALUES (?, ?, ?, ?, ?)`,
            [
                id_reporte,
                idGestor,
                Number(estado) === 3 ? 'cierre' : Number(estado) === 4 ? 'rechazo' : 'estado',
                estado,
                comentario || 'Gestion actualizada por gestor'
            ]
        );

        res.json({ ok: true, msg: 'Gestión guardada correctamente' });

    } catch (error) {
        console.error("Error al guardar gestión:", error);
        res.status(500).json({ ok: false, msg: 'Error al procesar la gestión' });
    }
};
