// 📁 src/shared/actividad.service.js
// Servicio reutilizable — llámalo desde cualquier ruta/endpoint del sistema

import { pool } from '../../../config/db.js';

/**
 * Registra un evento en registro_auditoria.
 *
 * @param {object} opts
 * @param {number}  opts.id_usuario      - ID del usuario que ejecutó la acción
 * @param {string}  opts.accion          - 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'ASIGNAR' | 'CAMBIO_ROL' | 'LOGIN' | 'REGISTRO'
 * @param {string}  opts.tabla_afectada  - 'parques' | 'canchas' | 'usuarios' | 'reportes' | 'asignacion_reportes' | ...
 * @param {string}  opts.detalle         - Descripción legible del evento
 */
export async function registrarActividad({ id_usuario, accion, tabla_afectada, detalle }) {
  try {
    await pool.query(
      `INSERT INTO registro_auditoria (id_usuario, accion, tabla_afectada, detalle)
       VALUES (?, ?, ?, ?)`,
      [id_usuario, accion, tabla_afectada, detalle]
    );
  } catch (err) {
    // No lanzamos error para no interrumpir el flujo principal
    console.error('[actividad.service] Error registrando actividad:', err.message);
  }
}

/**
 * Ejemplos de uso desde cualquier endpoint:
 *
 * import { registrarActividad } from '../../../shared/actividad.service.js';
 *
 * // Al crear un parque:
 * await registrarActividad({ id_usuario: user.id, accion: 'CREAR', tabla_afectada: 'parques', detalle: `Creó el parque "${nombre}"` });
 *
 * // Al editar un usuario:
 * await registrarActividad({ id_usuario: user.id, accion: 'EDITAR', tabla_afectada: 'usuarios', detalle: `Editó datos del usuario #${id}` });
 *
 * // Al asignar un reporte:
 * await registrarActividad({ id_usuario: user.id, accion: 'ASIGNAR', tabla_afectada: 'asignacion_reportes', detalle: `Asignó el reporte #${id_reporte} al gestor "${gestor}"` });
 */