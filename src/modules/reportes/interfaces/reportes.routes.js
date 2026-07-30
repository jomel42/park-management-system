import express from "express";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { pool } from '../../../config/db.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../middlewares/roles.middleware.js';
import { emitDashboardEvent } from '../../../core/realtime.js';
import { ParquesRepository } from '../../parques/infrastructure/parques.repository.js';
import { registrarActividad } from '../../notificaciones/infrastructure/actividad.service.js';

const router = express.Router();
const FOTO_MAX_BYTES = 4 * 1024 * 1024;
const FOTO_MAX_FILES = 5;
const FOTO_WINDOW_MS = 10 * 60 * 1000;
const FOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png",  "png"],
  ["image/webp", "webp"]
]);
const ESTADO_REPORTE = {
  PENDIENTE: 1,
  PROCESO: 2,
  COMPLETADO: 3,
  RECHAZADO: 4
};
const MIN_SYSTEM_DATE = "2026-03-01";

const uploadDir = path.join(process.cwd(), "public", "uploads", "reportes");

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, uploadDir);
    },
    filename(req, file, cb) {
      const ext = FOTO_TYPES.get(String(file.mimetype || "").toLowerCase());
      cb(null, `${Date.now()}-${randomUUID()}.${ext}`);
    }
  }),
  limits: {
    fileSize: FOTO_MAX_BYTES,
    files: FOTO_MAX_FILES
  },
  fileFilter(req, file, cb) {
    if (!FOTO_TYPES.has(String(file.mimetype || "").toLowerCase())) {
      return cb(clientError("Las fotos deben ser JPG, PNG o WEBP"));
    }
    cb(null, true);
  }
});

async function ensureUploadDir(req, res, next) {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    next();
  } catch (error) {
    next(error);
  }
}

function uploadReportImages(req, res, next) {
  upload.array("imagenes", FOTO_MAX_FILES)(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? "Cada foto debe pesar maximo 4 MB"
      : error instanceof multer.MulterError
        ? `Puedes subir maximo ${FOTO_MAX_FILES} fotos por reporte`
        : error.message || "No se pudieron procesar las imagenes";
    return res.status(400).json({ ok: false, error: message });
  });
}

function uploadEvidenceImages(req, res, next) {
  upload.array("evidencias", FOTO_MAX_FILES)(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? "Cada evidencia debe pesar maximo 4 MB"
      : error instanceof multer.MulterError
        ? `Puedes subir maximo ${FOTO_MAX_FILES} evidencias por reporte`
        : error.message || "No se pudieron procesar las evidencias";
    return res.status(400).json({ ok: false, error: message });
  });
}

function getUserFromRequest(req) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validateFilters(query) {
  const errors  = [];
  const filters = {
    fechaInicio: query.fechaInicio,
    fechaFin:    query.fechaFin,
    parque:      String(query.parque || "").trim(),
    prioridad:   query.prioridad,
    estado:      query.estado
  };
  if ((filters.fechaInicio || filters.fechaFin) &&
      (!isDateOnly(filters.fechaInicio) || !isDateOnly(filters.fechaFin))) {
    errors.push("Selecciona un rango de fechas válido");
  }
  if (isDateOnly(filters.fechaInicio) && isDateOnly(filters.fechaFin) &&
      filters.fechaInicio > filters.fechaFin) {
    errors.push("La fecha inicial no puede ser mayor que la fecha final");
  }
  if ((isDateOnly(filters.fechaInicio) && filters.fechaInicio < MIN_SYSTEM_DATE) ||
      (isDateOnly(filters.fechaFin) && filters.fechaFin < MIN_SYSTEM_DATE)) {
    errors.push("No se permiten fechas anteriores al 2026-03-01");
  }
  if (filters.parque.length > 80) {
    errors.push("La búsqueda por parque no debe superar 80 caracteres");
  }
  if (filters.prioridad && !["1","2","3"].includes(String(filters.prioridad))) {
    errors.push("La prioridad seleccionada no es válida");
  }
  if (filters.estado && !["1","2","3","4"].includes(String(filters.estado))) {
    errors.push("El estado seleccionado no es válido");
  }
  return { errors, filters };
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clientError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateReportPayload(body) {
  const errors = [];
  const id_parque    = parsePositiveInt(body.id_parque);
  const id_cancha    = parsePositiveInt(body.id_cancha);
  const id_prioridad = parsePositiveInt(body.id_prioridad || 2);
  const descripcion  = String(body.descripcion || "").trim();
  if (!id_parque) errors.push("Selecciona un parque válido");
  if (!id_cancha) errors.push("Selecciona una cancha valida");
  if (descripcion.length < 10 || descripcion.length > 1000)
    errors.push("La descripción debe tener entre 10 y 1000 caracteres");
  if (![1,2,3].includes(id_prioridad)) errors.push("Selecciona una prioridad válida");
  return { errors, data: { id_parque, id_cancha, id_prioridad, descripcion } };
}

function validateEditPayload(body) {
  const errors = [];
  const id_parque          = parsePositiveInt(body.id_parque);
  const id_cancha          = body.id_cancha ? parsePositiveInt(body.id_cancha) : null;
  const id_prioridad       = parsePositiveInt(body.id_prioridad || 2);
  const id_estado_reporte  = parsePositiveInt(body.id_estado_reporte || 1);
  const descripcion        = String(body.descripcion || "").trim();
  if (!id_parque) errors.push("Selecciona un parque válido");
  if (descripcion.length < 10 || descripcion.length > 1000)
    errors.push("La descripción debe tener entre 10 y 1000 caracteres");
  if (![1,2,3].includes(id_prioridad))      errors.push("Selecciona una prioridad válida");
  if (![1,2,3,4].includes(id_estado_reporte)) errors.push("Selecciona un estado válido");
  if (body.id_cancha && !id_cancha) errors.push("Selecciona una cancha valida");
  return { errors, data: { id_parque, id_cancha, id_prioridad, id_estado_reporte, descripcion } };
}

function validateManagementPayload(body) {
  const errors = [];
  const id_prioridad = parsePositiveInt(body.id_prioridad || 2);
  const id_estado_reporte = parsePositiveInt(body.id_estado_reporte || 1);
  const id_gestor = body.id_gestor ? parsePositiveInt(body.id_gestor) : null;
  const es_critico = body.es_critico ? 1 : 0;
  const observaciones = String(body.observaciones || "").trim();
  const comentario = String(body.comentario || body.comentario_asignacion || "").trim();
  const fecha_limite = String(body.fecha_limite || "").trim();
  if (![1, 2, 3].includes(id_prioridad)) errors.push("Selecciona una prioridad valida");
  if (![1, 2, 3, 4].includes(id_estado_reporte)) errors.push("Selecciona un estado valido");
  if (body.id_gestor && !id_gestor) errors.push("Selecciona un gestor valido");
  if (observaciones.length > 1000) errors.push("Las observaciones no pueden superar 1000 caracteres");
  if (comentario.length > 1000) errors.push("El comentario no puede superar 1000 caracteres");
  if (fecha_limite && !isDateOnly(fecha_limite)) errors.push("La fecha limite no es valida");
  if (isDateOnly(fecha_limite) && fecha_limite < MIN_SYSTEM_DATE) {
    errors.push("La fecha limite no puede ser anterior al 2026-03-01");
  }
  return { errors, data: { id_prioridad, id_estado_reporte, id_gestor, es_critico, observaciones, comentario, fecha_limite } };
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function addColumnIfMissing(conn, table, column, definition) {
  if (!(await columnExists(conn, table, column))) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function ensureManagementTable(conn = pool) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reportes_gestion (
      id_reporte INT PRIMARY KEY,
      id_gestor INT NULL,
      es_critico TINYINT(1) NOT NULL DEFAULT 0,
      observaciones TEXT NULL,
      fecha_limite DATETIME NULL,
      fecha_asignacion DATETIME NULL,
      asignado_por INT NULL,
      actualizado_por INT NULL,
      actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_reportes_gestion_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
      CONSTRAINT fk_reportes_gestion_gestor FOREIGN KEY (id_gestor) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
      CONSTRAINT fk_reportes_gestion_actualizado FOREIGN KEY (actualizado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
    )
  `);
  await addColumnIfMissing(conn, "reportes_gestion", "fecha_limite", "fecha_limite DATETIME NULL AFTER observaciones");
  await addColumnIfMissing(conn, "reportes_gestion", "fecha_asignacion", "fecha_asignacion DATETIME NULL AFTER fecha_limite");
  await addColumnIfMissing(conn, "reportes_gestion", "asignado_por", "asignado_por INT NULL AFTER fecha_asignacion");
}

async function ensureAssignmentTable(conn = pool) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS asignacion_reportes (
      id_asignacion INT PRIMARY KEY AUTO_INCREMENT,
      id_reporte INT NOT NULL,
      id_gestor INT NOT NULL,
      id_admin INT NULL,
      comentario TEXT NULL,
      fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME NULL,
      estado ENUM('asignado','en_proceso','cerrado') NOT NULL DEFAULT 'asignado',
      activa TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_asignacion_reporte_activa (id_reporte, activa, fecha_asignacion),
      INDEX idx_asignacion_gestor_activa (id_gestor, activa),
      CONSTRAINT fk_asignacion_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
      CONSTRAINT fk_asignacion_gestor FOREIGN KEY (id_gestor) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
      CONSTRAINT fk_asignacion_admin FOREIGN KEY (id_admin) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
    )
  `);
  await addColumnIfMissing(conn, "asignacion_reportes", "id_admin", "id_admin INT NULL AFTER id_gestor");
  await addColumnIfMissing(conn, "asignacion_reportes", "comentario", "comentario TEXT NULL AFTER id_admin");
  await addColumnIfMissing(conn, "asignacion_reportes", "fecha_actualizacion", "fecha_actualizacion DATETIME NULL AFTER fecha_asignacion");
  await addColumnIfMissing(conn, "asignacion_reportes", "activa", "activa TINYINT(1) NOT NULL DEFAULT 1 AFTER estado");
}

async function ensureHistoryTable(conn = pool) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reportes_historial (
      id_historial INT PRIMARY KEY AUTO_INCREMENT,
      id_reporte INT NOT NULL,
      id_usuario INT NULL,
      accion ENUM('creacion','asignacion','reasignacion','estado','comentario','evidencia','actualizacion','cierre','rechazo') NOT NULL,
      estado_anterior INT NULL,
      estado_nuevo INT NULL,
      gestor_anterior INT NULL,
      gestor_nuevo INT NULL,
      comentario TEXT NULL,
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_historial_reporte_fecha (id_reporte, creado_en),
      INDEX idx_historial_usuario_fecha (id_usuario, creado_en),
      CONSTRAINT fk_historial_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
      CONSTRAINT fk_historial_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
    )
  `);
}

async function ensureIncidenceTables(conn = pool) {
  await ensureManagementTable(conn);
  await ensureAssignmentTable(conn);
  await ensureHistoryTable(conn);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reportes_comentarios (
      id_comentario INT PRIMARY KEY AUTO_INCREMENT,
      id_reporte INT NOT NULL,
      id_usuario INT NOT NULL,
      comentario TEXT NOT NULL,
      tipo ENUM('gestion','avance','cierre') NOT NULL DEFAULT 'gestion',
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_comentarios_reporte (id_reporte, creado_en),
      CONSTRAINT fk_comentarios_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
      CONSTRAINT fk_comentarios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reportes_evidencias (
      id_evidencia INT PRIMARY KEY AUTO_INCREMENT,
      id_reporte INT NOT NULL,
      id_usuario INT NOT NULL,
      ruta VARCHAR(255) NOT NULL,
      nombre_archivo VARCHAR(255) NULL,
      tipo VARCHAR(80) NULL,
      tamano INT NULL,
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_evidencias_reporte (id_reporte, creado_en),
      CONSTRAINT fk_evidencias_reporte FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE,
      CONSTRAINT fk_evidencias_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
    )
  `);
}

async function canManageReport(conn, reportId, user) {
  if (Number(user.rol) === 1) return true;
  const [rows] = await conn.query(
    "SELECT id_gestor FROM reportes_gestion WHERE id_reporte = ? LIMIT 1",
    [reportId]
  );
  return Number(rows[0]?.id_gestor) === Number(user.id);
}

async function logReportHistory(conn, {
  id_reporte,
  id_usuario = null,
  accion,
  estado_anterior = null,
  estado_nuevo = null,
  gestor_anterior = null,
  gestor_nuevo = null,
  comentario = null
}) {
  await conn.query(
    `INSERT INTO reportes_historial
      (id_reporte, id_usuario, accion, estado_anterior, estado_nuevo, gestor_anterior, gestor_nuevo, comentario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id_reporte, id_usuario, accion, estado_anterior, estado_nuevo, gestor_anterior, gestor_nuevo, comentario || null]
  );
}

function validatePhotoTime(fechaFoto, fechaReporte) {
  const fotoDate = new Date(fechaFoto);
  if (isNaN(fotoDate.getTime())) return "No se pudo validar la fecha y hora de la foto";
  const diff = Math.abs(fechaReporte.getTime() - fotoDate.getTime());
  if (diff > FOTO_WINDOW_MS) return "La foto debe haberse tomado dentro de los 10 minutos del reporte";
  return "";
}

function getReportImages(body) {
  const images = Array.isArray(body.imagenes)
    ? body.imagenes
    : (body.imagenes ? [body.imagenes] : (body.imagen ? [body.imagen] : []));
  if (!images.length) throw clientError("Carga al menos una foto del problema");
  if (images.length > FOTO_MAX_FILES) throw clientError(`Puedes subir maximo ${FOTO_MAX_FILES} fotos por reporte`);
  return images;
}

function getUploadedImagePaths(files = []) {
  return files.map((file) => `/uploads/reportes/${file.filename}`);
}

function getUploadedImageRecords(files = []) {
  return files.map((file) => ({
    path: `/uploads/reportes/${file.filename}`,
    name: file.originalname,
    type: file.mimetype,
    size: file.size
  }));
}

async function deleteUploadedFiles(paths = []) {
  for (const imagePath of paths.filter(Boolean)) {
    await fs.unlink(path.join(process.cwd(), "public", imagePath)).catch(() => {});
  }
}

async function insertReportImage(conn, reportId, image) {
  const imagePath = typeof image === "string" ? image : image.path;
  const name = typeof image === "string" ? null : image.name;
  const type = typeof image === "string" ? null : image.type;
  const size = typeof image === "string" ? null : image.size;
  try {
    await conn.query(
      `INSERT INTO imagenes_reportes
        (id_reporte, url_imagen, nombre_archivo, tipo, tamano)
       VALUES (?, ?, ?, ?, ?)`,
      [reportId, imagePath, name, type, size]
    );
  } catch (error) {
    if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
    await conn.query(
      "INSERT INTO imagenes_reportes (id_reporte, url_imagen) VALUES (?, ?)",
      [reportId, imagePath]
    );
  }
}

async function saveReportImage(image, reportId) {
  if (!image || typeof image !== "object") throw clientError("Carga una foto del problema");
  const type = String(image.type || "").toLowerCase();
  const ext  = FOTO_TYPES.get(type);
  if (!ext) throw clientError("La foto debe ser JPG, PNG o WEBP");
  const rawData = String(image.data || "");
  const match   = rawData.match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/);
  if (!match) throw clientError("El archivo de imagen no es válido");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > FOTO_MAX_BYTES) throw clientError("La foto debe pesar máximo 4 MB");
  const uploadDir = path.join(process.cwd(), "public", "uploads", "reportes");
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `${reportId}-${Date.now()}-${randomUUID()}.${ext}`;
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, buffer);
  return `/uploads/reportes/${fileName}`;
}

function clampPageSize(value) {
  const parsed = parsePositiveInt(value);
  if (!parsed) return 10;
  return Math.min(Math.max(parsed, 5), 50);
}

function getSectionCondition(section) {
  switch (String(section || "pendientes")) {
    case "pendientes":  return "r.id_estado_reporte = 1 AND rg.id_gestor IS NULL";
    case "asignados":   return "r.id_estado_reporte = 1 AND rg.id_gestor IS NOT NULL";
    case "proceso":     return "r.id_estado_reporte = 2";
    case "completados": return "r.id_estado_reporte = 3";
    case "rechazados":  return "r.id_estado_reporte = 4";
    case "todos":       return "1=1";
    default:            return "r.id_estado_reporte = 1 AND rg.id_gestor IS NULL";
  }
}

function buildAdvancedReportWhere(query, { includeSection = true } = {}) {
  const where = ["COALESCE(r.activo, 1) = 1"];
  const params = [];
  const q = String(query.q || "").trim();
  const idReporte = parsePositiveInt(query.idReporte || query.id_reporte);
  const parque = String(query.parque || "").trim();
  const cancha = String(query.cancha || "").trim();
  const usuario = String(query.usuario || "").trim();
  const gestor = String(query.gestor || "").trim();
  const estado = parsePositiveInt(query.estado);
  const prioridad = parsePositiveInt(query.prioridad);
  const fechaInicio = String(query.fechaInicio || "").trim();
  const fechaFin = String(query.fechaFin || "").trim();
  if ((isDateOnly(fechaInicio) && fechaInicio < MIN_SYSTEM_DATE) ||
      (isDateOnly(fechaFin) && fechaFin < MIN_SYSTEM_DATE)) {
    throw clientError("No se permiten fechas anteriores al 2026-03-01");
  }
  if (includeSection) where.push(`(${getSectionCondition(query.section)})`);
  if (idReporte) { where.push("r.id_reporte = ?"); params.push(idReporte); }
  if (q) {
    where.push(`(
      r.id_reporte = ?
      OR r.descripcion LIKE ?
      OR p.nombre LIKE ?
      OR COALESCE(c.nombre, '') LIKE ?
      OR CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) LIKE ?
      OR CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) LIKE ?
      OR er.nombre LIKE ?
      OR pr.nombre LIKE ?
    )`);
    params.push(Number(q) || 0, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (parque) { where.push("p.nombre LIKE ?"); params.push(`%${parque}%`); }
  if (cancha) { where.push("COALESCE(c.nombre, '') LIKE ?"); params.push(`%${cancha}%`); }
  if (usuario) {
    where.push("CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) LIKE ?");
    params.push(`%${usuario}%`);
  }
  if (gestor) {
    where.push("(rg.id_gestor = ? OR CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) LIKE ?)");
    params.push(Number(gestor) || 0, `%${gestor}%`);
  }
  if (estado && [1, 2, 3, 4].includes(estado)) { where.push("r.id_estado_reporte = ?"); params.push(estado); }
  if (prioridad && [1, 2, 3].includes(prioridad)) { where.push("r.id_prioridad = ?"); params.push(prioridad); }
  if (isDateOnly(fechaInicio) && isDateOnly(fechaFin)) {
    where.push("DATE(r.fecha_creacion) BETWEEN ? AND ?");
    params.push(fechaInicio, fechaFin);
  }
  return { where: where.join(" AND "), params };
}

function mapReportRows(rows) {
  return rows.map((row) => ({
    ...row,
    imagenes: row.fotos ? String(row.fotos).split("||").filter(Boolean) : []
  }));
}

router.get("/", requireAuth, requireRoles(1, 2), async (req, res) => {
  try {
    const { errors, filters } = validateFilters(req.query);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    const { fechaInicio, fechaFin, parque, prioridad, estado } = filters;
    let query = `
      SELECT
        r.id_reporte,
        r.descripcion,
        r.fecha_creacion,
        p.nombre        AS parque,
        c.nombre        AS cancha,
        u.nombre        AS usuario,
        pr.nombre       AS prioridad,
        er.nombre       AS estado,
        SUBSTRING_INDEX(GROUP_CONCAT(ir.url_imagen SEPARATOR '||'), '||', 1) AS foto,
        GROUP_CONCAT(ir.url_imagen SEPARATOR '||') AS fotos
      FROM reportes r
      JOIN parques p          ON r.id_parque          = p.id_parque
      LEFT JOIN canchas c     ON r.id_cancha          = c.id_cancha
      JOIN usuarios u         ON r.id_usuario         = u.id_usuario
      JOIN prioridades pr     ON r.id_prioridad       = pr.id_prioridad
      JOIN estados_reporte er ON r.id_estado_reporte  = er.id_estado_reporte
      LEFT JOIN imagenes_reportes ir ON r.id_reporte  = ir.id_reporte
      WHERE 1=1
    `;
    const params = [];
    if (fechaInicio && fechaFin) { query += " AND DATE(r.fecha_creacion) BETWEEN ? AND ?"; params.push(fechaInicio, fechaFin); }
    if (parque)    { query += " AND p.nombre LIKE ?";         params.push(`%${parque}%`); }
    if (prioridad) { query += " AND r.id_prioridad = ?";      params.push(prioridad); }
    if (estado)    { query += " AND r.id_estado_reporte = ?"; params.push(estado); }
    query += `
      GROUP BY
        r.id_reporte, r.descripcion, r.fecha_creacion,
        p.nombre, c.nombre, u.nombre, pr.nombre, er.nombre
      ORDER BY r.fecha_creacion DESC, r.id_reporte DESC
    `;
    const [rows] = await pool.query(query, params);
    res.json(rows.map((row) => ({
      ...row,
      imagenes: row.fotos ? String(row.fotos).split("||").filter(Boolean) : []
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en servidor" });
  }
});

router.get("/parques/:idParque/canchas", requireAuth, requireRoles(1, 2, 3), async (req, res) => {
  const idParque = parsePositiveInt(req.params.idParque);
  if (!idParque) return res.status(400).json({ ok: false, error: "Parque invalido" });
  try {
    await ParquesRepository.ensureScheduleColumns();
    const [rows] = await pool.query(
      `SELECT
         c.id_cancha,
         c.nombre,
         c.id_parque,
         c.id_estado_cancha,
         ec.nombre AS estado,
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
         END AS parque_abierto_ahora
       FROM canchas c
       JOIN parques p ON p.id_parque = c.id_parque
       LEFT JOIN estados_cancha ec ON ec.id_estado_cancha = c.id_estado_cancha
       WHERE c.id_parque = ?
         AND COALESCE(c.activo, 1) = 1
       ORDER BY c.nombre ASC, c.id_cancha ASC`,
      [idParque]
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando canchas" });
  }
});

router.get("/gestores/lista", requireAuth, requireRoles(1, 2), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id_usuario, nombre, apellido_paterno, apellido_materno, email, activo, id_rol
      FROM usuarios
      WHERE id_rol = 2
      ORDER BY nombre ASC, apellido_paterno ASC
    `);
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando gestores" });
  }
});

router.get("/gestor/mis-tareas", requireAuth, requireRoles(2), async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  try {
    await ensureManagementTable();
    const [rows] = await pool.query(
      `SELECT
         r.id_reporte, r.descripcion, r.fecha_creacion,
         r.id_parque, r.id_cancha, r.id_prioridad, r.id_estado_reporte,
         p.nombre AS parque, c.nombre AS cancha,
         pr.nombre AS prioridad, er.nombre AS estado,
         rg.es_critico, rg.observaciones,
         rg.fecha_asignacion, rg.fecha_limite,
         rg.actualizado_en AS ultima_actualizacion,
         SUBSTRING_INDEX(GROUP_CONCAT(ir.url_imagen SEPARATOR '||'), '||', 1) AS foto,
         GROUP_CONCAT(ir.url_imagen SEPARATOR '||') AS fotos
       FROM reportes_gestion rg
       JOIN reportes r ON r.id_reporte = rg.id_reporte
       JOIN parques p ON p.id_parque = r.id_parque
       LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
       JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
       JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
       LEFT JOIN imagenes_reportes ir ON ir.id_reporte = r.id_reporte
       WHERE rg.id_gestor = ?
       GROUP BY
         r.id_reporte, r.descripcion, r.fecha_creacion,
         r.id_parque, r.id_cancha, r.id_prioridad, r.id_estado_reporte,
         p.nombre, c.nombre, pr.nombre, er.nombre,
         rg.es_critico, rg.observaciones,
         rg.fecha_asignacion, rg.fecha_limite, rg.actualizado_en
       ORDER BY r.fecha_creacion DESC, r.id_reporte DESC`,
      [user.id]
    );
    res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        imagenes: row.fotos ? String(row.fotos).split("||").filter(Boolean) : []
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando tareas asignadas" });
  }
});

router.get("/usuario/mis-reportes", requireAuth, requireRoles(3), async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  try {
    const [rows] = await pool.query(
      `SELECT
         r.id_reporte, r.descripcion, r.fecha_creacion,
         p.nombre AS parque, c.nombre AS cancha,
         pr.nombre AS prioridad, er.nombre AS estado,
         SUBSTRING_INDEX(GROUP_CONCAT(ir.url_imagen SEPARATOR '||'), '||', 1) AS foto,
         GROUP_CONCAT(ir.url_imagen SEPARATOR '||') AS fotos
       FROM reportes r
       JOIN parques p ON p.id_parque = r.id_parque
       LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
       JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
       JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
       LEFT JOIN imagenes_reportes ir ON ir.id_reporte = r.id_reporte
       WHERE r.id_usuario = ?
       GROUP BY
         r.id_reporte, r.descripcion, r.fecha_creacion,
         p.nombre, c.nombre, pr.nombre, er.nombre
       ORDER BY r.fecha_creacion DESC, r.id_reporte DESC`,
      [user.id]
    );
    res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        imagenes: row.fotos ? String(row.fotos).split("||").filter(Boolean) : []
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando reportes del usuario" });
  }
});

router.get("/admin/list", requireAuth, requireRoles(1), async (req, res) => {
  try {
    await ensureIncidenceTables();
    const page = parsePositiveInt(req.query.page) || 1;
    const limit = clampPageSize(req.query.limit);
    const offset = (page - 1) * limit;
    const { where, params } = buildAdvancedReportWhere(req.query);
    const baseFrom = `
      FROM reportes r
      JOIN parques p ON p.id_parque = r.id_parque
      LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
      JOIN usuarios u ON u.id_usuario = r.id_usuario
      JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
      JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
      LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
      LEFT JOIN usuarios g ON g.id_usuario = rg.id_gestor
      LEFT JOIN usuarios au ON au.id_usuario = rg.asignado_por
    `;
    const [rows] = await pool.query(
      `SELECT
         r.id_reporte, r.descripcion, r.fecha_creacion, r.fecha_actualizacion,
         r.id_parque, p.nombre AS parque,
         r.id_cancha, c.nombre AS cancha,
         r.id_usuario,
         CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario,
         r.id_prioridad, pr.nombre AS prioridad,
         r.id_estado_reporte, er.nombre AS estado,
         rg.id_gestor,
         CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) AS gestor,
         rg.es_critico, rg.observaciones, rg.fecha_asignacion,
         rg.actualizado_en AS ultima_actualizacion,
         CONCAT_WS(' ', au.nombre, au.apellido_paterno, au.apellido_materno) AS admin_asignacion,
         (SELECT ir.url_imagen FROM imagenes_reportes ir WHERE ir.id_reporte = r.id_reporte ORDER BY ir.id_imagen ASC LIMIT 1) AS foto,
         (SELECT GROUP_CONCAT(ir.url_imagen SEPARATOR '||') FROM imagenes_reportes ir WHERE ir.id_reporte = r.id_reporte) AS fotos,
         (SELECT COUNT(*) FROM imagenes_reportes ir WHERE ir.id_reporte = r.id_reporte) AS total_imagenes
       ${baseFrom}
       WHERE ${where}
       ORDER BY COALESCE(rg.actualizado_en, r.fecha_creacion) DESC, r.id_reporte DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[totalRow]] = await pool.query(
      `SELECT COUNT(*) AS total ${baseFrom} WHERE ${where}`,
      params
    );
    const counterFilter = buildAdvancedReportWhere(req.query, { includeSection: false });
    const [[counters]] = await pool.query(
      `SELECT
         SUM(CASE WHEN r.id_estado_reporte = 1 AND rg.id_gestor IS NULL THEN 1 ELSE 0 END) AS pendientes,
         SUM(CASE WHEN r.id_estado_reporte = 1 AND rg.id_gestor IS NOT NULL THEN 1 ELSE 0 END) AS asignados,
         SUM(CASE WHEN r.id_estado_reporte = 2 THEN 1 ELSE 0 END) AS proceso,
         SUM(CASE WHEN r.id_estado_reporte = 3 THEN 1 ELSE 0 END) AS completados,
         SUM(CASE WHEN r.id_estado_reporte = 4 THEN 1 ELSE 0 END) AS rechazados,
         COUNT(*) AS todos
       ${baseFrom}
       WHERE ${counterFilter.where}`,
      counterFilter.params
    );
    res.json({
      ok: true,
      data: mapReportRows(rows),
      counters,
      pagination: {
        page,
        limit,
        total: Number(totalRow.total || 0),
        pages: Math.max(1, Math.ceil(Number(totalRow.total || 0) / limit))
      }
    });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ ok: false, error: error.message });
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando reportes" });
  }
});

router.get("/admin/asignados", requireAuth, requireRoles(1), async (req, res) => {
  req.query.section = "asignados";
  req.query.limit = req.query.limit || 20;
  try {
    await ensureIncidenceTables();
    const { where, params } = buildAdvancedReportWhere(req.query);
    const [rows] = await pool.query(
      `SELECT
         r.id_reporte, p.nombre AS parque, c.nombre AS cancha,
         CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) AS gestor,
         rg.fecha_asignacion, er.nombre AS estado,
         rg.observaciones, rg.actualizado_en AS ultima_actualizacion
       FROM reportes r
       JOIN parques p ON p.id_parque = r.id_parque
       LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
       JOIN usuarios u ON u.id_usuario = r.id_usuario
       JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
       JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
       LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
       LEFT JOIN usuarios g ON g.id_usuario = rg.id_gestor
       WHERE ${where}
       ORDER BY rg.fecha_asignacion DESC, r.id_reporte DESC
       LIMIT ?`,
      [...params, clampPageSize(req.query.limit)]
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ ok: false, error: error.message });
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando reportes asignados" });
  }
});

router.get("/admin/metrics", requireAuth, requireRoles(1), async (req, res) => {
  try {
    await ensureIncidenceTables();
    const [gestores] = await pool.query(`
      SELECT
        u.id_usuario,
        CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS nombre,
        u.email, u.activo,
        COUNT(rg.id_reporte) AS total_asignados,
        SUM(CASE WHEN r.id_estado_reporte = 3 THEN 1 ELSE 0 END) AS completados,
        SUM(CASE WHEN r.id_estado_reporte = 1 THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN r.id_estado_reporte = 2 THEN 1 ELSE 0 END) AS en_proceso,
        SUM(CASE WHEN r.id_estado_reporte = 4 THEN 1 ELSE 0 END) AS rechazados,
        ROUND(AVG(CASE
          WHEN r.id_estado_reporte = 3
          THEN TIMESTAMPDIFF(HOUR, COALESCE(rg.fecha_asignacion, r.fecha_creacion), COALESCE(r.fecha_actualizacion, rg.actualizado_en, NOW()))
          ELSE NULL
        END), 1) AS horas_promedio_resolucion
      FROM usuarios u
      LEFT JOIN reportes_gestion rg ON rg.id_gestor = u.id_usuario
      LEFT JOIN reportes r ON r.id_reporte = rg.id_reporte
      WHERE u.id_rol = 2
      GROUP BY u.id_usuario, u.nombre, u.apellido_paterno, u.apellido_materno, u.email, u.activo
      ORDER BY completados DESC, total_asignados DESC, nombre ASC
    `);
    const [rankingMensual] = await pool.query(`
      SELECT
        u.id_usuario,
        CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS nombre,
        COUNT(CASE WHEN r.id_estado_reporte = 3 AND DATE_FORMAT(COALESCE(r.fecha_actualizacion, rg.actualizado_en, r.fecha_creacion), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN 1 END) AS reportes,
        ROUND(
          100 * COUNT(CASE WHEN r.id_estado_reporte = 3 AND DATE_FORMAT(COALESCE(r.fecha_actualizacion, rg.actualizado_en, r.fecha_creacion), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN 1 END)
          / NULLIF(COUNT(CASE WHEN DATE_FORMAT(COALESCE(rg.fecha_asignacion, r.fecha_creacion), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN 1 END), 0),
          1
        ) AS porcentaje_cumplimiento
      FROM usuarios u
      LEFT JOIN reportes_gestion rg ON rg.id_gestor = u.id_usuario
      LEFT JOIN reportes r ON r.id_reporte = rg.id_reporte
      WHERE u.id_rol = 2
      GROUP BY u.id_usuario, u.nombre, u.apellido_paterno, u.apellido_materno
      ORDER BY reportes DESC, porcentaje_cumplimiento DESC, nombre ASC
      LIMIT 10
    `);
    const [reportesPorMes] = await pool.query(`
      SELECT DATE_FORMAT(fecha_creacion, '%Y-%m') AS mes, COUNT(*) AS total
      FROM reportes
      WHERE fecha_creacion >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(fecha_creacion, '%Y-%m')
      ORDER BY mes ASC
    `);
    const [reportesPorParque] = await pool.query(`
      SELECT p.nombre, COUNT(r.id_reporte) AS total
      FROM parques p
      JOIN reportes r ON r.id_parque = p.id_parque
      GROUP BY p.id_parque, p.nombre
      ORDER BY total DESC, p.nombre ASC
      LIMIT 10
    `);
    const [reportesPorCancha] = await pool.query(`
      SELECT COALESCE(c.nombre, 'Sin cancha') AS nombre, COUNT(r.id_reporte) AS total
      FROM reportes r
      LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
      GROUP BY c.id_cancha, c.nombre
      ORDER BY total DESC, nombre ASC
      LIMIT 10
    `);
    const [reportesPorEstado] = await pool.query(`
      SELECT er.nombre, COUNT(r.id_reporte) AS total
      FROM estados_reporte er
      LEFT JOIN reportes r ON r.id_estado_reporte = er.id_estado_reporte
      GROUP BY er.id_estado_reporte, er.nombre
      ORDER BY er.id_estado_reporte ASC
    `);
    const [cumplimientoMensual] = await pool.query(`
      SELECT
        DATE_FORMAT(COALESCE(r.fecha_actualizacion, rg.actualizado_en, r.fecha_creacion), '%Y-%m') AS mes,
        COUNT(CASE WHEN r.id_estado_reporte = 3 THEN 1 END) AS completados,
        COUNT(r.id_reporte) AS total,
        ROUND(100 * COUNT(CASE WHEN r.id_estado_reporte = 3 THEN 1 END) / NULLIF(COUNT(r.id_reporte), 0), 1) AS porcentaje
      FROM reportes r
      LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
      WHERE r.fecha_creacion >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(COALESCE(r.fecha_actualizacion, rg.actualizado_en, r.fecha_creacion), '%Y-%m')
      ORDER BY mes ASC
    `);
    res.json({
      ok: true,
      data: {
        gestores,
        rankingMensual,
        gestorMasCompletados: gestores[0] || null,
        charts: {
          reportesPorMes, reportesPorParque, reportesPorCancha,
          reportesPorEstado, rendimientoGestores: gestores, cumplimientoMensual
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando metricas de gestores" });
  }
});

router.get("/admin/sugerencias", requireAuth, requireRoles(1), async (req, res) => {
  try {
    await ensureIncidenceTables();
    const q = String(req.query.q || "").trim().slice(0, 80);
    const term = `%${q}%`;
    const params = [q, term, q, term, q, term, term, q, term, q, term, q, term];
    const [rows] = await pool.query(
      `SELECT tipo, valor FROM (
         SELECT 'Parque' AS tipo, p.nombre AS valor, p.nombre AS orden
         FROM parques p
         WHERE (? = '' OR p.nombre LIKE ?)
         UNION
         SELECT 'Cancha' AS tipo, c.nombre AS valor, c.nombre AS orden
         FROM canchas c
         WHERE (? = '' OR c.nombre LIKE ?)
         UNION
         SELECT 'Gestor' AS tipo, CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS valor, u.nombre AS orden
         FROM usuarios u
         WHERE u.id_rol = 2 AND (? = '' OR CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) LIKE ? OR u.email LIKE ?)
         UNION
         SELECT 'Estado' AS tipo, er.nombre AS valor, er.nombre AS orden
         FROM estados_reporte er
         WHERE (? = '' OR er.nombre LIKE ?)
         UNION
         SELECT 'Prioridad' AS tipo, pr.nombre AS valor, pr.nombre AS orden
         FROM prioridades pr
         WHERE (? = '' OR pr.nombre LIKE ?)
         UNION
         SELECT 'Reporte' AS tipo, LEFT(r.descripcion, 80) AS valor, r.fecha_creacion AS orden
         FROM reportes r
         WHERE (? <> '' AND r.descripcion LIKE ?)
       ) s
       WHERE valor IS NOT NULL AND valor <> ''
       ORDER BY
         CASE WHEN LOWER(valor) LIKE LOWER(?) THEN 0 ELSE 1 END,
         tipo ASC,
         orden DESC
       LIMIT 18`,
      [...params, `${q}%`]
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando sugerencias" });
  }
});

router.get("/:id/detalle", requireAuth, requireRoles(1, 2), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID de reporte invalido" });
  try {
    await ensureIncidenceTables();
    const [rows] = await pool.query(
      `SELECT
         r.id_reporte, r.descripcion, r.fecha_creacion, r.fecha_actualizacion,
         r.id_parque, p.nombre AS parque,
         r.id_cancha, c.nombre AS cancha,
         r.id_usuario,
         CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario,
         u.email AS usuario_email,
         r.id_prioridad, pr.nombre AS prioridad,
         r.id_estado_reporte, er.nombre AS estado,
         rg.id_gestor,
         CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) AS gestor,
         rg.es_critico, rg.observaciones,
         rg.fecha_asignacion, rg.fecha_limite,
         rg.actualizado_en AS ultima_actualizacion
       FROM reportes r
       JOIN parques p ON p.id_parque = r.id_parque
       LEFT JOIN canchas c ON c.id_cancha = r.id_cancha
       JOIN usuarios u ON u.id_usuario = r.id_usuario
       JOIN prioridades pr ON pr.id_prioridad = r.id_prioridad
       JOIN estados_reporte er ON er.id_estado_reporte = r.id_estado_reporte
       LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
       LEFT JOIN usuarios g ON g.id_usuario = rg.id_gestor
       WHERE r.id_reporte = ?
       LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "Reporte no encontrado" });
    const [imagenes] = await pool.query(
      `SELECT id_imagen, url_imagen, nombre_archivo, tipo, tamano, fecha_creacion
       FROM imagenes_reportes WHERE id_reporte = ? ORDER BY id_imagen ASC`,
      [id]
    );
    const [comentarios] = await pool.query(
      `SELECT rc.id_comentario, rc.comentario, rc.tipo, rc.creado_en,
              CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario
       FROM reportes_comentarios rc
       JOIN usuarios u ON u.id_usuario = rc.id_usuario
       WHERE rc.id_reporte = ?
       ORDER BY rc.creado_en ASC, rc.id_comentario ASC`,
      [id]
    );
    const [evidencias] = await pool.query(
      `SELECT re.id_evidencia, re.ruta, re.nombre_archivo, re.tipo, re.tamano, re.creado_en,
              CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario
       FROM reportes_evidencias re
       JOIN usuarios u ON u.id_usuario = re.id_usuario
       WHERE re.id_reporte = ?
       ORDER BY re.creado_en DESC, re.id_evidencia DESC`,
      [id]
    );
    const [historial] = await pool.query(
      `SELECT
         h.id_historial, h.accion, h.comentario, h.creado_en,
         ea.nombre AS estado_anterior, en.nombre AS estado_nuevo,
         CONCAT_WS(' ', ua.nombre, ua.apellido_paterno, ua.apellido_materno) AS responsable,
         CONCAT_WS(' ', ga.nombre, ga.apellido_paterno, ga.apellido_materno) AS gestor_anterior,
         CONCAT_WS(' ', gn.nombre, gn.apellido_paterno, gn.apellido_materno) AS gestor_nuevo
       FROM reportes_historial h
       LEFT JOIN estados_reporte ea ON ea.id_estado_reporte = h.estado_anterior
       LEFT JOIN estados_reporte en ON en.id_estado_reporte = h.estado_nuevo
       LEFT JOIN usuarios ua ON ua.id_usuario = h.id_usuario
       LEFT JOIN usuarios ga ON ga.id_usuario = h.gestor_anterior
       LEFT JOIN usuarios gn ON gn.id_usuario = h.gestor_nuevo
       WHERE h.id_reporte = ?
       ORDER BY h.creado_en ASC, h.id_historial ASC`,
      [id]
    );
    const [asignaciones] = await pool.query(
      `SELECT
         ar.id_asignacion, ar.fecha_asignacion, ar.fecha_actualizacion,
         ar.estado, ar.activa, ar.comentario,
         CONCAT_WS(' ', g.nombre, g.apellido_paterno, g.apellido_materno) AS gestor,
         CONCAT_WS(' ', a.nombre, a.apellido_paterno, a.apellido_materno) AS administrador
       FROM asignacion_reportes ar
       JOIN usuarios g ON g.id_usuario = ar.id_gestor
       LEFT JOIN usuarios a ON a.id_usuario = ar.id_admin
       WHERE ar.id_reporte = ?
       ORDER BY ar.fecha_asignacion DESC, ar.id_asignacion DESC`,
      [id]
    );
    res.json({ ok: true, data: { reporte: rows[0], imagenes, comentarios, evidencias, historial, asignaciones } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando detalle del reporte" });
  }
});

router.get("/:id", requireAuth, requireRoles(1, 2), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "ID de reporte inválido" });
  try {
    await ensureManagementTable();
    const [rows] = await pool.query(
      `SELECT
         r.id_reporte, r.descripcion, r.fecha_creacion,
         r.id_parque, r.id_cancha, r.id_prioridad, r.id_estado_reporte,
         p.nombre AS parque, c.nombre AS cancha,
         u.nombre AS usuario, pr.nombre AS prioridad, er.nombre AS estado,
         SUBSTRING_INDEX(GROUP_CONCAT(ir.url_imagen SEPARATOR '||'), '||', 1) AS foto,
         GROUP_CONCAT(ir.url_imagen SEPARATOR '||') AS fotos,
         rg.id_gestor, rg.es_critico, rg.observaciones,
         CONCAT_WS(' ', ug.nombre, ug.apellido_paterno, ug.apellido_materno) AS gestor_nombre
       FROM reportes r
       JOIN parques p ON r.id_parque = p.id_parque
       LEFT JOIN canchas c ON r.id_cancha = c.id_cancha
       JOIN usuarios u ON r.id_usuario = u.id_usuario
       JOIN prioridades pr ON r.id_prioridad = pr.id_prioridad
       JOIN estados_reporte er ON r.id_estado_reporte = er.id_estado_reporte
       LEFT JOIN imagenes_reportes ir ON r.id_reporte = ir.id_reporte
       LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
       LEFT JOIN usuarios ug ON ug.id_usuario = rg.id_gestor
       WHERE r.id_reporte = ?
       GROUP BY
         r.id_reporte, r.descripcion, r.fecha_creacion,
         r.id_parque, r.id_cancha, r.id_prioridad, r.id_estado_reporte,
         p.nombre, c.nombre, u.nombre, pr.nombre, er.nombre,
         rg.id_gestor, rg.es_critico, rg.observaciones,
         ug.nombre, ug.apellido_paterno, ug.apellido_materno
       LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Reporte no encontrado" });
    res.json({
      ...rows[0],
      imagenes: rows[0].fotos ? String(rows[0].fotos).split("||").filter(Boolean) : []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en servidor" });
  }
});

router.post("/", ensureUploadDir, uploadReportImages, async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  try {
    const reportDate = new Date();
    const { errors, data } = validateReportPayload(req.body);
    if (errors.length) return res.status(400).json({ ok: false, error: errors[0] });
    const uploadedImageRecords = getUploadedImageRecords(req.files || []);
    const uploadedImagePaths = uploadedImageRecords.map((image) => image.path);
    const jsonImages = uploadedImageRecords.length ? [] : getReportImages(req.body);
    if (!uploadedImagePaths.length && !jsonImages.length) {
      return res.status(400).json({ ok: false, error: "Carga al menos una foto del problema" });
    }
    const photoDates = uploadedImageRecords.length
      ? (Array.isArray(req.body.fechas_foto) ? req.body.fechas_foto : [req.body.fechas_foto])
      : jsonImages.map((image) => image?.lastModified || req.body.fecha_foto);
    for (const photoDate of photoDates) {
      const photoError = validatePhotoTime(photoDate, reportDate);
      if (photoError) return res.status(400).json({ ok: false, error: photoError });
    }
    const conn = await pool.getConnection();
    const savedImagePaths = [...uploadedImagePaths];
    const imageRecords = [...uploadedImageRecords];
    try {
      await conn.beginTransaction();
      await ensureIncidenceTables(conn);
      const [parks] = await conn.query(
        "SELECT id_parque, id_zona FROM parques WHERE id_parque = ? LIMIT 1",
        [data.id_parque]
      );
      if (!parks.length) throw clientError("El parque seleccionado no existe");
      const [courts] = await conn.query(
        "SELECT id_cancha FROM canchas WHERE id_cancha = ? AND id_parque = ? LIMIT 1",
        [data.id_cancha, data.id_parque]
      );
      if (!courts.length) throw clientError("La cancha seleccionada no pertenece al parque");
      const [result] = await conn.query(
        `INSERT INTO reportes
           (id_parque, id_cancha, id_usuario, id_zona, descripcion, id_prioridad, id_estado_reporte, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
        [data.id_parque, data.id_cancha, user.id, parks[0].id_zona, data.descripcion, data.id_prioridad]
      );
      if (!uploadedImagePaths.length) {
        for (const image of jsonImages) {
          const savedImagePath = await saveReportImage(image, result.insertId);
          savedImagePaths.push(savedImagePath);
          imageRecords.push({
            path: savedImagePath,
            name: image.name || null,
            type: image.type || null,
            size: image.size || null
          });
        }
      }
      for (const imageRecord of imageRecords) {
        await insertReportImage(conn, result.insertId, imageRecord);
      }
      await logReportHistory(conn, {
        id_reporte: result.insertId,
        id_usuario: user.id,
        accion: "creacion",
        estado_nuevo: ESTADO_REPORTE.PENDIENTE,
        comentario: "Reporte creado por usuario"
      });
      await conn.commit();
      await registrarActividad({
        id_usuario:     user.id,
        accion:         'CREAR',
        tabla_afectada: 'reportes',
        detalle:        `Creó el reporte #${result.insertId} en parque #${data.id_parque}`
      });
      emitDashboardEvent("reportes:changed", { action: "created", id_reporte: result.insertId });
      res.status(201).json({ ok: true, id_reporte: result.insertId, imagenes: savedImagePaths });
    } catch (error) {
      await conn.rollback();
      await deleteUploadedFiles(savedImagePaths);
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    await deleteUploadedFiles(getUploadedImagePaths(req.files || []));
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Cada foto debe pesar maximo 4 MB"
        : `Puedes subir maximo ${FOTO_MAX_FILES} fotos por reporte`;
      return res.status(400).json({ ok: false, error: message });
    }
    if (error.statusCode === 400) return res.status(400).json({ ok: false, error: error.message });
    console.error(error);
    res.status(500).json({ ok: false, error: "Error creando reporte" });
  }
});

router.put("/:id", requireAuth, requireRoles(1, 2), async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID de reporte inválido" });
  try {
    const { errors, data } = validateEditPayload(req.body);
    if (errors.length) return res.status(400).json({ ok: false, error: errors[0] });
    const conn = await pool.getConnection();
    let savedImagePath = "";
    let oldImagePaths  = [];
    try {
      await conn.beginTransaction();
      await ensureIncidenceTables(conn);
      const [existing] = await conn.query(
        `SELECT r.id_reporte, r.id_estado_reporte, r.id_cancha
         FROM reportes r WHERE r.id_reporte = ? LIMIT 1`,
        [id]
      );
      if (!existing.length) throw clientError("El reporte no existe");
      const [parks] = await conn.query(
        "SELECT id_parque, id_zona FROM parques WHERE id_parque = ? LIMIT 1",
        [data.id_parque]
      );
      if (!parks.length) throw clientError("El parque seleccionado no existe");
      if (data.id_cancha) {
        const [courts] = await conn.query(
          "SELECT id_cancha FROM canchas WHERE id_cancha = ? AND id_parque = ? LIMIT 1",
          [data.id_cancha, data.id_parque]
        );
        if (!courts.length) throw clientError("La cancha seleccionada no pertenece al parque");
      }
      await conn.query(
        `UPDATE reportes
         SET id_parque = ?, id_zona = ?, id_cancha = ?, descripcion = ?,
             id_prioridad = ?, id_estado_reporte = ?, fecha_actualizacion = NOW()
         WHERE id_reporte = ?`,
        [data.id_parque, parks[0].id_zona, data.id_cancha, data.descripcion, data.id_prioridad, data.id_estado_reporte, id]
      );
      if (Number(existing[0].id_estado_reporte) !== Number(data.id_estado_reporte)) {
        await logReportHistory(conn, {
          id_reporte: id,
          id_usuario: user.id,
          accion: data.id_estado_reporte === ESTADO_REPORTE.COMPLETADO
            ? "cierre"
            : data.id_estado_reporte === ESTADO_REPORTE.RECHAZADO ? "rechazo" : "estado",
          estado_anterior: existing[0].id_estado_reporte,
          estado_nuevo: data.id_estado_reporte,
          comentario: "Estado actualizado"
        });
      } else {
        await logReportHistory(conn, {
          id_reporte: id,
          id_usuario: user.id,
          accion: "actualizacion",
          comentario: "Reporte actualizado"
        });
      }
      const image = req.body.imagen;
      if (image && typeof image === "object") {
        const reportDate = new Date();
        const photoError = validatePhotoTime(req.body.fecha_foto || image?.lastModified, reportDate);
        if (photoError) throw clientError(photoError);
        savedImagePath = await saveReportImage(image, id);
        const [oldImages] = await conn.query(
          "SELECT url_imagen FROM imagenes_reportes WHERE id_reporte = ?",
          [id]
        );
        oldImagePaths = oldImages.map((row) => row.url_imagen).filter(Boolean);
        if (oldImagePaths.length) {
          await conn.query("DELETE FROM imagenes_reportes WHERE id_reporte = ?", [id]);
          await insertReportImage(conn, id, {
            path: savedImagePath,
            name: image.name || null,
            type: image.type || null,
            size: image.size || null
          });
        } else {
          await insertReportImage(conn, id, {
            path: savedImagePath,
            name: image.name || null,
            type: image.type || null,
            size: image.size || null
          });
        }
      }
      await conn.commit();
      await registrarActividad({
        id_usuario:     user.id,
        accion:         'EDITAR',
        tabla_afectada: 'reportes',
        detalle:        `Editó el reporte #${id}`
      });
      emitDashboardEvent("reportes:changed", { action: "updated", id_reporte: id });
      if (savedImagePath && oldImagePaths.length) {
        for (const oldImagePath of oldImagePaths) {
          await fs.unlink(path.join(process.cwd(), "public", oldImagePath)).catch(() => {});
        }
      }
      res.json({ ok: true, id_reporte: id });
    } catch (error) {
      await conn.rollback();
      if (savedImagePath)
        await fs.unlink(path.join(process.cwd(), "public", savedImagePath)).catch(() => {});
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ ok: false, error: error.message });
    console.error(error);
    res.status(500).json({ ok: false, error: "Error editando reporte" });
  }
});

router.patch("/:id/gestion", requireAuth, requireRoles(1, 2), async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID de reporte invalido" });
  const { errors, data } = validateManagementPayload(req.body);
  if (errors.length) return res.status(400).json({ ok: false, error: errors[0] });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensureIncidenceTables(conn);
    const [existing] = await conn.query(
      `SELECT r.id_reporte, r.id_estado_reporte, rg.id_gestor
       FROM reportes r
       LEFT JOIN reportes_gestion rg ON rg.id_reporte = r.id_reporte
       WHERE r.id_reporte = ? LIMIT 1`,
      [id]
    );
    if (!existing.length) throw clientError("El reporte no existe");
    const userRole = Number(user.rol);
    if (userRole === 2) {
      if (Number(existing[0].id_gestor) !== Number(user.id)) {
        throw Object.assign(new Error("Solo puedes gestionar tareas asignadas a ti"), { statusCode: 403 });
      }
      data.id_gestor = user.id;
    }
    if (data.id_gestor) {
      const [manager] = await conn.query(
        "SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND id_rol = 2 LIMIT 1",
        [data.id_gestor]
      );
      if (!manager.length) throw clientError("El gestor seleccionado no existe");
    }
    await conn.query(
      `UPDATE reportes
       SET id_prioridad = ?, id_estado_reporte = ?, fecha_actualizacion = NOW()
       WHERE id_reporte = ?`,
      [data.id_prioridad, data.id_estado_reporte, id]
    );
    const gestorAnterior = existing[0].id_gestor || null;
    const assignmentChanged = Number(gestorAnterior || 0) !== Number(data.id_gestor || 0);
    const fechaLimite = data.fecha_limite ? `${data.fecha_limite} 23:59:59` : null;
    await conn.query(
      `INSERT INTO reportes_gestion
        (id_reporte, id_gestor, es_critico, observaciones, fecha_limite, fecha_asignacion, asignado_por, actualizado_por, actualizado_en)
       VALUES (?, ?, ?, ?, ?, IF(? IS NULL, NULL, NOW()), IF(? IS NULL, NULL, ?), ?, NOW())
       ON DUPLICATE KEY UPDATE
        fecha_asignacion = CASE
          WHEN COALESCE(id_gestor, 0) <> COALESCE(VALUES(id_gestor), 0) AND VALUES(id_gestor) IS NOT NULL
          THEN NOW()
          ELSE fecha_asignacion
        END,
        asignado_por = CASE
          WHEN COALESCE(id_gestor, 0) <> COALESCE(VALUES(id_gestor), 0) AND VALUES(id_gestor) IS NOT NULL
          THEN VALUES(asignado_por)
          ELSE asignado_por
        END,
        id_gestor = VALUES(id_gestor),
        es_critico = VALUES(es_critico),
        observaciones = VALUES(observaciones),
        fecha_limite = VALUES(fecha_limite),
        actualizado_por = VALUES(actualizado_por),
        actualizado_en = NOW()`,
      [id, data.id_gestor, data.es_critico, data.observaciones, fechaLimite, data.id_gestor, data.id_gestor, user.id, user.id]
    );
    if (assignmentChanged) {
      await conn.query(
        `UPDATE asignacion_reportes
         SET activa = 0, fecha_actualizacion = NOW(), estado = IF(estado = 'cerrado', estado, 'cerrado')
         WHERE id_reporte = ? AND activa = 1`,
        [id]
      );
      if (data.id_gestor) {
        const estadoAsignacion = data.id_estado_reporte === ESTADO_REPORTE.PROCESO
          ? "en_proceso"
          : [ESTADO_REPORTE.COMPLETADO, ESTADO_REPORTE.RECHAZADO].includes(data.id_estado_reporte) ? "cerrado" : "asignado";
        await conn.query(
          `INSERT INTO asignacion_reportes
             (id_reporte, id_gestor, id_admin, comentario, fecha_asignacion, estado, activa)
           VALUES (?, ?, ?, ?, NOW(), ?, 1)`,
          [id, data.id_gestor, user.id, data.comentario || data.observaciones || null, estadoAsignacion]
        );
      }
      await logReportHistory(conn, {
        id_reporte: id,
        id_usuario: user.id,
        accion: gestorAnterior && data.id_gestor ? "reasignacion" : data.id_gestor ? "asignacion" : "actualizacion",
        gestor_anterior: gestorAnterior,
        gestor_nuevo: data.id_gestor,
        comentario: data.comentario || data.observaciones || null
      });
    }
    if (Number(existing[0].id_estado_reporte) !== Number(data.id_estado_reporte)) {
      await logReportHistory(conn, {
        id_reporte: id,
        id_usuario: user.id,
        accion: data.id_estado_reporte === ESTADO_REPORTE.COMPLETADO
          ? "cierre"
          : data.id_estado_reporte === ESTADO_REPORTE.RECHAZADO ? "rechazo" : "estado",
        estado_anterior: existing[0].id_estado_reporte,
        estado_nuevo: data.id_estado_reporte,
        comentario: data.comentario || data.observaciones || null
      });
    }
    if (data.comentario) {
      await conn.query(
        `INSERT INTO reportes_comentarios (id_reporte, id_usuario, comentario, tipo)
         VALUES (?, ?, ?, ?)`,
        [id, user.id, data.comentario, data.id_estado_reporte === ESTADO_REPORTE.COMPLETADO ? "cierre" : "gestion"]
      );
      await logReportHistory(conn, {
        id_reporte: id,
        id_usuario: user.id,
        accion: "comentario",
        comentario: data.comentario
      });
    }
    await conn.commit();
    await registrarActividad({
      id_usuario:     user.id,
      accion:         'ASIGNAR',
      tabla_afectada: 'asignacion_reportes',
      detalle:        `Gestionó el reporte #${id}${data.id_gestor ? ` — gestor #${data.id_gestor}` : ''}`
    });
    emitDashboardEvent("reportes:changed", { action: "managed", id_reporte: id });
    res.json({ ok: true, id_reporte: id });
  } catch (error) {
    await conn.rollback();
    if (error.statusCode === 400) return res.status(400).json({ ok: false, error: error.message });
    if (error.statusCode === 403) return res.status(403).json({ ok: false, error: error.message });
    console.error(error);
    res.status(500).json({ ok: false, error: "Error gestionando reporte" });
  } finally {
    conn.release();
  }
});

router.post("/:id/comentarios", requireAuth, requireRoles(1, 2), async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID de reporte invalido" });
  const comentario = String(req.body.comentario || "").trim();
  const tipo = String(req.body.tipo || "gestion").trim();
  if (comentario.length < 3 || comentario.length > 1000) {
    return res.status(400).json({ ok: false, error: "El comentario debe tener entre 3 y 1000 caracteres" });
  }
  if (!["gestion", "avance", "cierre"].includes(tipo)) {
    return res.status(400).json({ ok: false, error: "Tipo de comentario invalido" });
  }
  try {
    await ensureIncidenceTables();
    const [existing] = await pool.query(
      "SELECT id_reporte FROM reportes WHERE id_reporte = ? LIMIT 1",
      [id]
    );
    if (!existing.length) return res.status(404).json({ ok: false, error: "Reporte no encontrado" });
    if (!(await canManageReport(pool, id, user))) {
      return res.status(403).json({ ok: false, error: "Solo puedes comentar tareas asignadas a ti" });
    }
    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();
      result = (await conn.query(
        `INSERT INTO reportes_comentarios (id_reporte, id_usuario, comentario, tipo)
         VALUES (?, ?, ?, ?)`,
        [id, user.id, comentario, tipo]
      ))[0];
      await logReportHistory(conn, {
        id_reporte: id,
        id_usuario: user.id,
        accion: "comentario",
        comentario
      });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    emitDashboardEvent("reportes:changed", { action: "commented", id_reporte: id });
    res.status(201).json({ ok: true, id_comentario: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error registrando comentario" });
  }
});

router.get("/:id/comentarios", requireAuth, requireRoles(1, 2), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID de reporte invalido" });
  try {
    await ensureIncidenceTables();
    const [rows] = await pool.query(
      `SELECT
         rc.id_comentario, rc.comentario, rc.tipo, rc.creado_en,
         CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario
       FROM reportes_comentarios rc
       JOIN usuarios u ON u.id_usuario = rc.id_usuario
       WHERE rc.id_reporte = ?
       ORDER BY rc.creado_en ASC, rc.id_comentario ASC`,
      [id]
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando comentarios" });
  }
});

router.post("/:id/evidencias", requireAuth, requireRoles(1, 2), ensureUploadDir, uploadEvidenceImages, async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: "No autorizado" });
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    await deleteUploadedFiles(getUploadedImagePaths(req.files || []));
    return res.status(400).json({ ok: false, error: "ID de reporte invalido" });
  }
  const records = getUploadedImageRecords(req.files || []);
  if (!records.length) return res.status(400).json({ ok: false, error: "Sube al menos una evidencia" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensureIncidenceTables(conn);
    const [existing] = await conn.query(
      "SELECT id_reporte FROM reportes WHERE id_reporte = ? LIMIT 1",
      [id]
    );
    if (!existing.length) throw clientError("Reporte no encontrado");
    if (!(await canManageReport(conn, id, user))) {
      throw Object.assign(new Error("Solo puedes subir evidencias de tareas asignadas a ti"), { statusCode: 403 });
    }
    for (const evidence of records) {
      await conn.query(
        `INSERT INTO reportes_evidencias
          (id_reporte, id_usuario, ruta, nombre_archivo, tipo, tamano)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, user.id, evidence.path, evidence.name, evidence.type, evidence.size]
      );
    }
    await logReportHistory(conn, {
      id_reporte: id,
      id_usuario: user.id,
      accion: "evidencia",
      comentario: `${records.length} evidencia(s) agregada(s)`
    });
    await conn.commit();
    emitDashboardEvent("reportes:changed", { action: "evidence_added", id_reporte: id });
    res.status(201).json({ ok: true, evidencias: records.map((record) => record.path) });
  } catch (error) {
    await conn.rollback();
    await deleteUploadedFiles(records.map((record) => record.path));
    if (error.statusCode === 400 || error.statusCode === 403) return res.status(error.statusCode).json({ ok: false, error: error.message });
    console.error(error);
    res.status(500).json({ ok: false, error: "Error registrando evidencias" });
  } finally {
    conn.release();
  }
});

router.get("/:id/evidencias", requireAuth, requireRoles(1, 2), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID de reporte invalido" });
  try {
    await ensureIncidenceTables();
    const [rows] = await pool.query(
      `SELECT
         re.id_evidencia, re.ruta, re.nombre_archivo, re.tipo, re.tamano, re.creado_en,
         CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno) AS usuario
       FROM reportes_evidencias re
       JOIN usuarios u ON u.id_usuario = re.id_usuario
       WHERE re.id_reporte = ?
       ORDER BY re.creado_en DESC, re.id_evidencia DESC`,
      [id]
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error cargando evidencias" });
  }
});

export default router;
