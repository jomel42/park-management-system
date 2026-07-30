import { pool } from '../../../../config/db.js';

const ACTIVE_REPORT_STATES = [1, 2];
const CRITICAL_PRIORITY = 1;

function rangeFilter(alias = 'r') {
  return `DATE(${alias}.fecha_creacion) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`;
}

export class DashboardRepository {
  static async getOverview() {
    const [[totals]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
        (SELECT COUNT(*) FROM parques) AS total_parques,
        (SELECT COUNT(*) FROM canchas) AS total_canchas,
        (SELECT COUNT(*) FROM reportes) AS total_reportes,
        (SELECT COUNT(*) FROM reportes WHERE id_estado_reporte = 1) AS reportes_pendientes,
        (SELECT COUNT(*) FROM reportes WHERE id_estado_reporte = 3) AS reportes_resueltos,
        (SELECT COUNT(*) FROM reportes WHERE id_prioridad = ?) AS reportes_criticos,
        (SELECT COUNT(*) FROM parques WHERE esta_abierto = 1) AS parques_abiertos
    `, [CRITICAL_PRIORITY]);

    const [reportsByStatus] = await pool.query(`
      SELECT er.nombre AS estado, COUNT(r.id_reporte) AS total
      FROM estados_reporte er
      LEFT JOIN reportes r ON r.id_estado_reporte = er.id_estado_reporte
      GROUP BY er.id_estado_reporte, er.nombre
      ORDER BY er.id_estado_reporte
    `);

    const [courtsByStatus] = await pool.query(`
      SELECT ec.nombre AS estado, COUNT(c.id_cancha) AS total
      FROM estados_cancha ec
      LEFT JOIN canchas c ON c.id_estado_cancha = ec.id_estado_cancha
      GROUP BY ec.id_estado_cancha, ec.nombre
      ORDER BY ec.id_estado_cancha
    `);

    return {
      totals,
      reportsByStatus,
      courtsByStatus
    };
  }

  static async getAnalytics() {
    const [topReportedParks] = await pool.query(`
      SELECT p.id_parque, p.nombre, COUNT(r.id_reporte) AS total
      FROM parques p
      JOIN reportes r ON r.id_parque = p.id_parque
      GROUP BY p.id_parque, p.nombre
      ORDER BY total DESC, p.nombre ASC
      LIMIT 8
    `);

    const [topResolvedParks] = await pool.query(`
      SELECT p.id_parque, p.nombre, COUNT(r.id_reporte) AS total
      FROM parques p
      JOIN reportes r ON r.id_parque = p.id_parque AND r.id_estado_reporte = 3
      GROUP BY p.id_parque, p.nombre
      ORDER BY total DESC, p.nombre ASC
      LIMIT 8
    `);

    const [activeParks] = await pool.query(`
      SELECT
        p.id_parque,
        p.nombre,
        COUNT(DISTINCT r.id_reporte) + COUNT(DISTINCT c.id_cancha) AS total
      FROM parques p
      LEFT JOIN reportes r ON r.id_parque = p.id_parque
      LEFT JOIN canchas c ON c.id_parque = p.id_parque
      GROUP BY p.id_parque, p.nombre
      ORDER BY total DESC, p.nombre ASC
      LIMIT 8
    `);

    const [damagedZones] = await pool.query(`
      SELECT COALESCE(z.nombre_zona, 'Sin zona') AS zona, COUNT(r.id_reporte) AS total
      FROM reportes r
      LEFT JOIN zonas z ON r.id_zona = z.id_zona
      WHERE r.id_estado_reporte IN (?, ?)
      GROUP BY z.id_zona, z.nombre_zona
      ORDER BY total DESC, zona ASC
      LIMIT 8
    `, ACTIVE_REPORT_STATES);

    const [monthlyReports] = await pool.query(`
      SELECT DATE_FORMAT(r.fecha_creacion, '%Y-%m') AS mes, COUNT(*) AS total
      FROM reportes r
      WHERE ${rangeFilter('r')}
      GROUP BY DATE_FORMAT(r.fecha_creacion, '%Y-%m')
      ORDER BY mes ASC
    `);

    const [recentReports] = await pool.query(`
      SELECT
        r.id_reporte,
        r.id_parque,
        r.descripcion,
        r.fecha_creacion,
        p.nombre AS parque,
        pr.nombre AS prioridad,
        er.nombre AS estado
      FROM reportes r
      JOIN parques p ON p.id_parque = r.id_parque
      JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
      JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
      ORDER BY r.fecha_creacion DESC, r.id_reporte DESC
      LIMIT 10
    `);

    const [activeManagers] = await pool.query(`
      SELECT
        u.id_usuario,
        CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS nombre,
        u.email,
        u.activo,
        COUNT(r.id_reporte) AS reportes_creados
      FROM usuarios u
      LEFT JOIN reportes r ON r.id_usuario = u.id_usuario
      WHERE u.id_rol = 2
      GROUP BY u.id_usuario, u.nombre, u.apellido_paterno, u.apellido_materno, u.email, u.activo
      ORDER BY reportes_creados DESC, nombre ASC
      LIMIT 8
    `);

    return {
      topReportedParks,
      topResolvedParks,
      activeParks,
      damagedZones,
      monthlyReports,
      recentReports,
      activeManagers
    };
  }

  static async getMapData() {
    const [parks] = await pool.query(`
      SELECT
        p.id_parque,
        p.nombre,
        p.descripcion,
        p.latitud,
        p.longitud,
        p.esta_abierto,
        COALESCE(z.nombre_zona, 'Sin zona') AS zona,
        COUNT(r.id_reporte) AS total_reportes,
        SUM(CASE WHEN r.id_estado_reporte IN (?, ?) THEN 1 ELSE 0 END) AS incidencias_activas,
        SUM(CASE WHEN r.id_prioridad = ? THEN 1 ELSE 0 END) AS reportes_criticos
      FROM parques p
      LEFT JOIN zonas z ON z.id_zona = p.id_zona
      LEFT JOIN reportes r ON r.id_parque = p.id_parque
      WHERE p.latitud IS NOT NULL AND p.longitud IS NOT NULL
      GROUP BY p.id_parque, p.nombre, p.descripcion, p.latitud, p.longitud, p.esta_abierto, z.nombre_zona
      ORDER BY incidencias_activas DESC, total_reportes DESC, p.nombre ASC
    `, [...ACTIVE_REPORT_STATES, CRITICAL_PRIORITY]);

    const [recentReports] = await pool.query(`
      SELECT
        r.id_reporte,
        r.descripcion,
        r.fecha_creacion,
        r.id_prioridad,
        p.id_parque,
        p.nombre AS parque,
        p.latitud,
        p.longitud,
        pr.nombre AS prioridad,
        er.nombre AS estado
      FROM reportes r
      JOIN parques p ON p.id_parque = r.id_parque
      JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
      JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
      WHERE p.latitud IS NOT NULL AND p.longitud IS NOT NULL
      ORDER BY r.fecha_creacion DESC, r.id_reporte DESC
      LIMIT 25
    `);

    return { parks, recentReports };
  }

  static async search({ q = '', estado = '', prioridad = '', parque = '', gestor = '', fechaInicio = '', fechaFin = '' }) {
    const term = `%${q}%`;
    const limit = 12;

    const [parks] = await pool.query(`
      SELECT 'parque' AS tipo, p.id_parque AS id, p.nombre AS titulo,
        COALESCE(z.nombre_zona, 'Sin zona') AS subtitulo,
        IF(p.esta_abierto = 1, 'Abierto', 'Cerrado') AS estado
      FROM parques p
      LEFT JOIN zonas z ON z.id_zona = p.id_zona
      WHERE (? = '' OR p.nombre LIKE ? OR z.nombre_zona LIKE ?)
      ORDER BY p.nombre ASC
      LIMIT ${limit}
    `, [q, term, term]);

    const [users] = await pool.query(`
      SELECT 'usuario' AS tipo, u.id_usuario AS id,
        CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS titulo,
        u.email AS subtitulo,
        IF(u.activo = 1, 'Activo', 'Inactivo') AS estado
      FROM usuarios u
      WHERE (? = '' OR u.nombre LIKE ? OR u.apellido_paterno LIKE ? OR u.email LIKE ?)
        AND (? = '' OR u.id_rol = ?)
      ORDER BY u.id_usuario DESC
      LIMIT ${limit}
    `, [q, term, term, term, gestor, gestor]);

    const reportParams = [];
    let reportWhere = `
      WHERE (? = '' OR r.descripcion LIKE ? OR p.nombre LIKE ? OR u.nombre LIKE ?)
    `;
    reportParams.push(q, term, term, term);

    if (estado) {
      reportWhere += ' AND r.id_estado_reporte = ?';
      reportParams.push(estado);
    }
    if (prioridad) {
      reportWhere += ' AND r.id_prioridad = ?';
      reportParams.push(prioridad);
    }
    if (parque) {
      reportWhere += ' AND r.id_parque = ?';
      reportParams.push(parque);
    }
    if (fechaInicio && fechaFin) {
      reportWhere += ' AND DATE(r.fecha_creacion) BETWEEN ? AND ?';
      reportParams.push(fechaInicio, fechaFin);
    }

    const [reports] = await pool.query(`
      SELECT 'reporte' AS tipo, r.id_reporte AS id,
        CONCAT('Reporte #', r.id_reporte) AS titulo,
        CONCAT(p.nombre, ' - ', LEFT(r.descripcion, 80)) AS subtitulo,
        er.nombre AS estado
      FROM reportes r
      JOIN parques p ON p.id_parque = r.id_parque
      JOIN usuarios u ON u.id_usuario = r.id_usuario
      JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
      ${reportWhere}
      ORDER BY r.fecha_creacion DESC
      LIMIT ${limit}
    `, reportParams);

    const [courts] = await pool.query(`
      SELECT 'cancha' AS tipo, c.id_cancha AS id, c.nombre AS titulo,
        p.nombre AS subtitulo, ec.nombre AS estado
      FROM canchas c
      JOIN parques p ON p.id_parque = c.id_parque
      LEFT JOIN estados_cancha ec ON ec.id_estado_cancha = c.id_estado_cancha
      WHERE (? = '' OR c.nombre LIKE ? OR p.nombre LIKE ?)
        AND (? = '' OR c.id_parque = ?)
      ORDER BY c.id_cancha DESC
      LIMIT ${limit}
    `, [q, term, term, parque, parque]);

    return { parks, users, reports, courts };
  }
}
