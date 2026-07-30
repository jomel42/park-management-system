// 📁 src/modules/admin/reportes/interfaces/actividad.routes.js
// GET /api/actividad  — listado con filtros
// GET /api/actividad/stats — estadísticas para gráficos

import express from 'express';
import jwt     from 'jsonwebtoken';
import { pool } from '../../../config/db.js';

const router = express.Router();

// ══════════════════════════════════════════════════
//  AUTH — solo admins (id_rol = 1)
// ══════════════════════════════════════════════════
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (Number(user.rol) !== 1) return res.status(403).json({ error: 'Acceso denegado' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
function isDateOnly(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

const TABLAS_VALIDAS = [
  'parques', 'canchas', 'usuarios', 'reportes',
  'asignacion_reportes', 'roles', 'zonas', 'canchas', 'sesiones'
];

const ACCIONES_VALIDAS = [
  'CREAR', 'EDITAR', 'ELIMINAR', 'ASIGNAR',
  'CAMBIO_ROL', 'LOGIN', 'REGISTRO', 'DESACTIVAR', 'ACTIVAR'
];

// ══════════════════════════════════════════════════
//  GET /api/actividad
//  Query params: fechaInicio, fechaFin, tabla, accion, usuario (nombre)
// ══════════════════════════════════════════════════
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { fechaInicio, fechaFin, tabla, accion, usuario } = req.query;

    const errors = [];
    if ((fechaInicio || fechaFin) && (!isDateOnly(fechaInicio) || !isDateOnly(fechaFin)))
      errors.push('Selecciona un rango de fechas válido');
    if (isDateOnly(fechaInicio) && isDateOnly(fechaFin) && fechaInicio > fechaFin)
      errors.push('La fecha inicial no puede ser mayor que la final');
    if (tabla && !TABLAS_VALIDAS.includes(tabla))
      errors.push('Módulo no válido');
    if (accion && !ACCIONES_VALIDAS.includes(accion))
      errors.push('Acción no válida');
    if (errors.length) return res.status(400).json({ error: errors[0] });

    let query = `
      SELECT
        ra.id_auditoria,
        ra.accion,
        ra.tabla_afectada,
        ra.detalle,
        ra.fecha_hora,
        CONCAT(u.nombre, ' ', u.apellido_paterno) AS usuario,
        u.email,
        r.nombre AS rol
      FROM registro_auditoria ra
      JOIN usuarios u ON ra.id_usuario = u.id_usuario
      JOIN roles r    ON u.id_rol      = r.id_rol
      WHERE 1=1
    `;
    const params = [];

    if (fechaInicio && fechaFin) {
      query += ' AND DATE(ra.fecha_hora) BETWEEN ? AND ?';
      params.push(fechaInicio, fechaFin);
    }
    if (tabla)   { query += ' AND ra.tabla_afectada = ?'; params.push(tabla); }
    if (accion)  { query += ' AND ra.accion = ?';         params.push(accion); }
    if (usuario) { query += ' AND CONCAT(u.nombre, " ", u.apellido_paterno) LIKE ?'; params.push(`%${usuario}%`); }

    query += ' ORDER BY ra.fecha_hora DESC LIMIT 500';

    const [rows] = await pool.query(query, params);
    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo actividad' });
  }
});

// ══════════════════════════════════════════════════
//  GET /api/actividad/stats
//  Estadísticas para los gráficos del panel
// ══════════════════════════════════════════════════
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    let dateFilter = '';
    const params   = [];

    if (fechaInicio && fechaFin && isDateOnly(fechaInicio) && isDateOnly(fechaFin)) {
      dateFilter = 'WHERE DATE(ra.fecha_hora) BETWEEN ? AND ?';
      params.push(fechaInicio, fechaFin);
    }

    // Eventos por módulo
    const [porModulo] = await pool.query(
      `SELECT tabla_afectada AS modulo, COUNT(*) AS total
       FROM registro_auditoria ra ${dateFilter}
       GROUP BY tabla_afectada ORDER BY total DESC`,
      params
    );

    // Eventos por acción
    const [porAccion] = await pool.query(
      `SELECT accion, COUNT(*) AS total
       FROM registro_auditoria ra ${dateFilter}
       GROUP BY accion ORDER BY total DESC`,
      params
    );

    // Últimos 7 días — actividad diaria
    const [porDia] = await pool.query(
      `SELECT DATE(fecha_hora) AS dia, COUNT(*) AS total
       FROM registro_auditoria
       WHERE fecha_hora >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(fecha_hora)
       ORDER BY dia ASC`
    );

    // Top usuarios más activos
    const [topUsuarios] = await pool.query(
      `SELECT CONCAT(u.nombre, ' ', u.apellido_paterno) AS usuario, COUNT(*) AS total
       FROM registro_auditoria ra ${dateFilter}
       JOIN usuarios u ON ra.id_usuario = u.id_usuario
       GROUP BY ra.id_usuario ORDER BY total DESC LIMIT 5`,
      params
    );

    // Total de eventos
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM registro_auditoria ra ${dateFilter}`,
      params
    );

    res.json({ total, porModulo, porAccion, porDia, topUsuarios });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

export default router;