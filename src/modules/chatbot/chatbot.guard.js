const SYSTEM_KEYWORDS = [
  'parque', 'parques', 'cancha', 'canchas', 'reporte', 'reportes',
  'incidencia', 'incidencias', 'ubicacion', 'ubicaciones', 'cerca',
  'cercano', 'abierto', 'abiertos', 'horario', 'horarios', 'sistema',
  'ayuda', 'danada', 'danado', 'dano', 'basura', 'luminaria', 'juego'
];

const EXTERNAL_KEYWORDS = [
  'matematica', 'matematicas', 'programacion', 'codigo', 'historia',
  'fisica', 'quimica', 'politica', 'receta', 'capital de', 'bitcoin'
];

export const OUT_OF_SCOPE_MESSAGE =
  'Solo puedo ayudarte con información relacionada al sistema de parques y reportes.';

export function sanitizeQuestion(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function normalizeQuestion(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function validateQuestion(question) {
  if (!question || question.length < 2) {
    return { ok: false, error: 'Escribe una consulta sobre parques o reportes.' };
  }

  const normalized = normalizeQuestion(question);
  const external = EXTERNAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const allowed = SYSTEM_KEYWORDS.some((keyword) => normalized.includes(keyword));

  if (external || !allowed) {
    return { ok: false, outOfScope: true, error: OUT_OF_SCOPE_MESSAGE };
  }

  return { ok: true };
}

export function detectIntent(question) {
  const q = normalizeQuestion(question);
  if (q.includes('cerca') || q.includes('cercano') || q.includes('ubicacion') || q.includes('donde queda')) return 'nearby';
  if (q.includes('abierto') || q.includes('horario')) return 'open_parks';
  if (q.includes('cancha')) return 'courts';
  if (q.includes('report')) return 'reports_help';
  return 'system_help';
}
