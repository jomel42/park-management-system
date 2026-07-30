// 📁 src/modules/reportes/interfaces/reportes.pdf.routes.js
// Código original del compañero — solo se cambió el import del pool
import express from "express";
import { pool }
from '../../../config/db.js'; // ← único cambio
import PDFDocument from "pdfkit";
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../middlewares/roles.middleware.js';

const router = express.Router();
const MIN_SYSTEM_DATE = "2026-03-01";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

router.get("/pdf", requireAuth, requireRoles(1, 2), async (req, res) => {
  try {
    const { fechaInicio, fechaFin, parque, prioridad, estado } = req.query;

    if ((fechaInicio || fechaFin) && (!DATE_ONLY.test(String(fechaInicio || "")) || !DATE_ONLY.test(String(fechaFin || "")))) {
      return res.status(400).json({ error: "Rango de fechas invalido" });
    }
    if (fechaInicio && fechaFin && String(fechaInicio) > String(fechaFin)) {
      return res.status(400).json({ error: "La fecha inicial no puede ser mayor que la final" });
    }
    if ((fechaInicio && String(fechaInicio) < MIN_SYSTEM_DATE) || (fechaFin && String(fechaFin) < MIN_SYSTEM_DATE)) {
      return res.status(400).json({ error: "No se permiten fechas anteriores al 2026-03-01" });
    }

    let query = `
      SELECT 
        r.descripcion,
        r.fecha_creacion,
        p.nombre AS parque,
        c.nombre AS cancha,
        u.nombre AS usuario,
        pr.nombre AS prioridad,
        er.nombre AS estado
      FROM REPORTES r
      JOIN PARQUES         p  ON r.id_parque        = p.id_parque
      LEFT JOIN CANCHAS    c  ON r.id_cancha        = c.id_cancha
      JOIN USUARIOS        u  ON r.id_usuario        = u.id_usuario
      JOIN PRIORIDADES     pr ON r.id_prioridad      = pr.id_prioridad
      JOIN ESTADOS_REPORTE er ON r.id_estado_reporte = er.id_estado_reporte
      WHERE 1=1
    `;

    let params = [];

    if (fechaInicio && fechaFin) {
      query += " AND DATE(r.fecha_creacion) BETWEEN ? AND ?";
      params.push(fechaInicio, fechaFin);
    }
    if (parque)    { query += " AND p.nombre LIKE ?";         params.push(`%${parque}%`); }
    if (prioridad) { query += " AND r.id_prioridad = ?";      params.push(prioridad); }
    if (estado)    { query += " AND r.id_estado_reporte = ?"; params.push(estado); }

    const [rows] = await pool.query(query, params);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=reporte_parques.pdf");
    doc.pipe(res);

    // Encabezado verde
    doc.rect(0, 0, 600, 80).fill("#2e7d32");
    doc.fillColor("white").fontSize(20).text("REPORTE DE PARQUES", 40, 30);
    doc.fontSize(10)
      .text(`Generado: ${new Date().toLocaleString()}`, 350, 30)
      .text(`Usuario: Admin`, 350, 45);

    doc.moveDown(3);

    // Filtros aplicados
    doc.fillColor("black").fontSize(10).text("Filtros aplicados:", 40, 100);
    doc.fontSize(9)
      .text(`Fecha: ${fechaInicio || "-"} a ${fechaFin || "-"}`, 40, 115)
      .text(`Parque: ${parque || "Todos"}`, 40, 130)
      .text(`Prioridad: ${prioridad || "Todas"}`, 250, 115)
      .text(`Estado: ${estado || "Todos"}`, 250, 130);

    // Tabla
    let y = 160;
    const startX = 40;

    doc.rect(startX, y, 520, 20).fill("#1b5e20");
    doc.fillColor("white").fontSize(10);
    doc.text("Parque",      startX + 5,   y + 5);
    doc.text("Cancha",      startX + 105, y + 5);
    doc.text("Usuario",     startX + 180, y + 5);
    doc.text("Descripción", startX + 200, y + 5);
    doc.text("Prioridad",   startX + 370, y + 5);
    doc.text("Estado",      startX + 430, y + 5);
    doc.text("Fecha",       startX + 480, y + 5);

    y += 25;
    let page = 1;

    const addFooter = () => {
      doc.fontSize(8).fillColor("gray").text(`Página ${page}`, 500, 780);
    };

    rows.forEach((r, i) => {
      const rowHeight = 20;
      if (i % 2 === 0) doc.rect(startX, y, 520, rowHeight).fill("#f5f5f5");

      doc.fillColor("black").fontSize(8);
      doc.text(r.parque      || "", startX + 5,   y + 5, { width: 95, ellipsis: true });
      doc.text(r.cancha      || "-", startX + 105, y + 5, { width: 70, ellipsis: true });
      doc.text(r.usuario     || "", startX + 180, y + 5, { width: 80,  ellipsis: true });
      doc.text(r.descripcion || "", startX + 260, y + 5, { width: 105, ellipsis: true });

      if      (r.prioridad === "Alta")  doc.fillColor("#d32f2f");
      else if (r.prioridad === "Media") doc.fillColor("#f57c00");
      else                              doc.fillColor("#388e3c");

      doc.text(r.prioridad || "", startX + 370, y + 5, { width: 55, ellipsis: true });
      doc.fillColor("black");
      doc.text(r.estado     || "", startX + 430, y + 5, { width: 45,  ellipsis: true });
      doc.text(new Date(r.fecha_creacion).toLocaleDateString(), startX + 480, y + 5, { width: 60 });

      y += rowHeight;

      if (y > 730) {
        addFooter();
        doc.addPage();
        page++;
        y = 40;
      }
    });

    if (rows.length === 0) {
      doc.fontSize(14).fillColor("red")
         .text("No hay datos con los filtros seleccionados", { align: "center" });
    }

    addFooter();
    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando PDF" });
  }
});

export default router;
