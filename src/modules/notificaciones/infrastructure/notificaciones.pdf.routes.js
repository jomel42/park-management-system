import express from "express";
import { pool } from '../../../config/db.js';
import PDFDocument from "pdfkit";
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../middlewares/roles.middleware.js';

const router = express.Router();
const MIN_SYSTEM_DATE = "2026-03-01";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const C = {
  verde900: "#081408",
  verde800: "#0d1f0d",
  verde700: "#163116",
  verde600: "#215221",
  verde500: "#2f7d32",
  verde400: "#4caf50",
  verde300: "#81c784",
  verde200: "#c8e6c9",
  blanco:   "#ffffff",
  crema:    "#f5f5f5",
  gris100:  "#f8f9f8",
  gris200:  "#e8ede8",
  gris400:  "#9e9e9e",
  gris700:  "#424242",
  rojo:     "#e53935",
  rojoL:    "#ffebee",
  amarillo: "#e65100",
  amarilloL:"#fff3e0",
  azul:     "#1565c0",
  azulL:    "#e3f2fd",
  morado:   "#6a1b9a",
  moradoL:  "#f3e5f5",
  cyan:     "#00838f",
  cyanL:    "#e0f7fa",
  verdeL:   "#e8f5e9",
};

function drawRoundRect(doc, x, y, w, h, r, fill, stroke) {
  doc.save()
     .roundedRect(x, y, w, h, r);
  if (fill)   doc.fill(fill);
  if (stroke) doc.stroke(stroke);
  doc.restore();
}

function statCard(doc, x, y, w, label, value, accentColor, lightColor) {
  const h = 52;
  drawRoundRect(doc, x, y, w, h, 6, lightColor);
  doc.save()
     .rect(x, y, 4, h)
     .fill(accentColor)
     .restore();
  doc.fontSize(7).fillColor(C.gris400)
     .text(label.toUpperCase(), x + 12, y + 9, { width: w - 16, characterSpacing: 0.5 });
  doc.fontSize(20).fillColor(accentColor)
     .text(String(value), x + 12, y + 20, { width: w - 16 });
}

function tipoColor(t) {
  if (!t) return { bg: C.gris200, fg: C.gris700, dot: C.gris400 };
  const lt = t.toLowerCase();
  if (lt.includes("alerta"))    return { bg: C.rojoL,     fg: C.rojo,    dot: C.rojo };
  if (lt.includes("aviso"))     return { bg: C.amarilloL, fg: C.amarillo, dot: C.amarillo };
  if (lt.includes("info"))      return { bg: C.azulL,     fg: C.azul,    dot: C.azul };
  if (lt.includes("sistema"))   return { bg: C.moradoL,   fg: C.morado,  dot: C.morado };
  return { bg: C.gris200, fg: C.gris700, dot: C.gris400 };
}

function leidaColor(leida) {
  if (leida === 1 || leida === true) return { bg: C.verdeL,    fg: C.verde500 };
  return                                    { bg: C.amarilloL, fg: C.amarillo };
}

function badge(doc, x, y, text, bgColor, fgColor, dotColor) {
  const pad = 6;
  const dotR = dotColor ? 3 : 0;
  const dotGap = dotColor ? 8 : 0;
  const textW = Math.min((text || "").length * 4.5 + pad * 2 + dotGap, 90);
  const h = 14;
  drawRoundRect(doc, x, y, textW, h, 4, bgColor);
  if (dotColor) {
    doc.save().circle(x + pad + dotR, y + h / 2, dotR).fill(dotColor).restore();
  }
  doc.fontSize(6.5).fillColor(fgColor)
     .text((text || "").toUpperCase(), x + pad + dotGap, y + 3.5, { width: textW - pad * 2 - dotGap, ellipsis: true });
}

router.get("/pdf", requireAuth, requireRoles(1, 2), async (req, res) => {
  try {
    const { fechaInicio, fechaFin, tipo, leida, usuario } = req.query;

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
        n.id_notificacion,
        n.titulo,
        n.mensaje,
        n.fecha_envio,
        n.leida,
        u.nombre   AS usuario,
        tn.nombre  AS tipo
      FROM NOTIFICACIONES n
      JOIN USUARIOS          u  ON n.id_usuario = u.id_usuario
      JOIN TIPOS_NOTIFICACION tn ON n.id_tipo   = tn.id_tipo
      WHERE 1=1
    `;
    const params = [];
    if (fechaInicio && fechaFin) { query += " AND DATE(n.fecha_envio) BETWEEN ? AND ?"; params.push(fechaInicio, fechaFin); }
    if (tipo)    { query += " AND n.id_tipo = ?";    params.push(tipo); }
    if (leida !== undefined && leida !== "") { query += " AND n.leida = ?"; params.push(leida); }
    if (usuario) { query += " AND u.nombre LIKE ?";  params.push(`%${usuario}%`); }
    query += " ORDER BY n.fecha_envio DESC";

    const [rows] = await pool.query(query, params);

    const total    = rows.length;
    const leidas   = rows.filter(r => r.leida === 1 || r.leida === true).length;
    const noLeidas = rows.filter(r => !r.leida).length;
    const alertas  = rows.filter(r => r.tipo?.toLowerCase().includes("alerta")).length;
    const avisos   = rows.filter(r => r.tipo?.toLowerCase().includes("aviso")).length;

    const doc = new PDFDocument({ margin: 0, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=reporte_notificaciones.pdf");
    doc.pipe(res);

    const PW = 595;

    // ── CABECERA ──────────────────────────────────────────────
    doc.rect(0, 0, PW, 72).fill(C.verde800);
    doc.rect(0, 68, PW, 4).fill(C.verde400);

    doc.fontSize(7).fillColor(C.verde300)
       .text("SISTEMA DE PARQUES", 40, 18, { characterSpacing: 2 });
    doc.fontSize(16).fillColor(C.blanco)
       .text("Reporte de Notificaciones", 40, 30);

    const ahora = new Date().toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" });
    doc.fontSize(7).fillColor(C.verde200)
       .text(`Generado: ${ahora}`, PW - 200, 22, { width: 160, align: "right" });

    // ── FILTROS ───────────────────────────────────────────────
    let curY = 84;
    doc.rect(0, curY, PW, 30).fill(C.gris100);
    doc.fontSize(7).fillColor(C.gris400)
       .text("FILTROS APLICADOS", 40, curY + 6, { characterSpacing: 1 });

    const leidaLabel = leida === "1" ? "Leídas" : leida === "0" ? "No leídas" : "Todas";
    const filtroTexto = [
      `Fechas: ${fechaInicio || "—"} → ${fechaFin || "—"}`,
      `Usuario: ${usuario || "Todos"}`,
      `Tipo: ${tipo || "Todos"}`,
      `Leída: ${leidaLabel}`,
    ].join("   ·   ");
    doc.fontSize(8).fillColor(C.gris700)
       .text(filtroTexto, 40, curY + 17, { width: PW - 80 });

    curY += 38;

    // ── STAT CARDS ────────────────────────────────────────────
    const cardW = 95;
    const cardGap = 10;
    const cardsTotal = 5;
    const cardsBlock = cardsTotal * cardW + (cardsTotal - 1) * cardGap;
    const cardsX = (PW - cardsBlock) / 2;

    statCard(doc, cardsX + 0 * (cardW + cardGap), curY, cardW, "Total",      total,    C.verde500, C.verdeL);
    statCard(doc, cardsX + 1 * (cardW + cardGap), curY, cardW, "Leídas",     leidas,   C.azul,     C.azulL);
    statCard(doc, cardsX + 2 * (cardW + cardGap), curY, cardW, "No Leídas",  noLeidas, C.amarillo, C.amarilloL);
    statCard(doc, cardsX + 3 * (cardW + cardGap), curY, cardW, "Alertas",    alertas,  C.rojo,     C.rojoL);
    statCard(doc, cardsX + 4 * (cardW + cardGap), curY, cardW, "Avisos",     avisos,   C.morado,   C.moradoL);

    curY += 66;

    // ── TABLA ─────────────────────────────────────────────────
    const LX = 30;
    const tableW = PW - LX * 2;

    const COLS = [
      { label: "Usuario",  x: LX,       w: 90  },
      { label: "Tipo",     x: LX + 90,  w: 70  },
      { label: "Título",   x: LX + 160, w: 100 },
      { label: "Mensaje",  x: LX + 260, w: 145 },
      { label: "Leída",    x: LX + 405, w: 55  },
      { label: "Fecha",    x: LX + 460, w: 75  },
    ];

    const drawTableHeader = (y) => {
      doc.rect(LX, y, tableW, 20).fill(C.verde700);
      doc.fontSize(7).fillColor(C.verde200);
      COLS.forEach(col => {
        doc.text(col.label.toUpperCase(), col.x + 4, y + 6,
                 { width: col.w - 6, characterSpacing: 0.4 });
      });
      return y + 20;
    };

    const addFooter = (pageNum) => {
      doc.rect(0, 818, PW, 24).fill(C.verde800);
      doc.fontSize(7).fillColor(C.verde300)
         .text(`Sistema de Parques — Reporte de Notificaciones`, LX, 825, { width: 300 });
      doc.fontSize(7).fillColor(C.verde200)
         .text(`Página ${pageNum}`, PW - LX - 60, 825, { width: 60, align: "right" });
    };

    let y = drawTableHeader(curY);
    let pageNum = 1;
    addFooter(pageNum);

    if (rows.length === 0) {
      doc.rect(LX, y, tableW, 36).fill(C.gris100);
      drawRoundRect(doc, LX + tableW / 2 - 80, y + 10, 160, 18, 4, C.rojoL);
      doc.fontSize(8).fillColor(C.rojo)
         .text("Sin datos para los filtros seleccionados", LX, y + 14, { width: tableW, align: "center" });
      y += 36;
    }

    rows.forEach((r, i) => {
      const rowH = 22;

      if (y + rowH > 810) {
        doc.addPage();
        pageNum++;
        y = 30;
        y = drawTableHeader(y);
        addFooter(pageNum);
      }

      if (i % 2 === 0) {
        doc.rect(LX, y, tableW, rowH).fill(C.gris100);
      } else {
        doc.rect(LX, y, tableW, rowH).fill(C.blanco);
      }

      doc.save().rect(LX, y + rowH - 1, tableW, 1).fill(C.gris200).restore();

      doc.fontSize(7.5).fillColor(C.verde800)
         .text(r.usuario || "—", COLS[0].x + 4, y + 7, { width: COLS[0].w - 8, ellipsis: true });

      const tc = tipoColor(r.tipo);
      badge(doc, COLS[1].x + 4, y + 5, r.tipo, tc.bg, tc.fg, tc.dot);

      doc.fontSize(7.5).fillColor(C.gris700)
         .text(r.titulo || "—", COLS[2].x + 4, y + 7, { width: COLS[2].w - 8, ellipsis: true });

      doc.fillColor(C.gris700)
         .text(r.mensaje || "—", COLS[3].x + 4, y + 7, { width: COLS[3].w - 8, ellipsis: true });

      const lc = leidaColor(r.leida);
      badge(doc, COLS[4].x + 4, y + 5, r.leida ? "Leída" : "No leída", lc.bg, lc.fg, null);

      doc.fontSize(7).fillColor(C.gris400)
         .text(new Date(r.fecha_envio).toLocaleDateString("es-BO"), COLS[5].x + 2, y + 7, { width: COLS[5].w - 4 });

      y += rowH;
    });

    // Borde inferior de tabla
    doc.rect(LX, y, tableW, 1).fill(C.verde400);

    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando PDF" });
  }
});

export default router;