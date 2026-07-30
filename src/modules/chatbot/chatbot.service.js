import { pool } from '../../config/db.js';
import { detectIntent, OUT_OF_SCOPE_MESSAGE } from './chatbot.guard.js';
import { ParquesRepository } from '../parques/infrastructure/parques.repository.js';

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function askOpenAI(question, context) {
  if (!process.env.OPENAI_API_KEY || typeof fetch !== 'function') return '';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHATBOT_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'Responde solo sobre el sistema de parques y reportes. Si la pregunta sale de ese contexto, responde exactamente: ' +
            OUT_OF_SCOPE_MESSAGE
        },
        {
          role: 'user',
          content: `Pregunta: ${question}\nContexto controlado:\n${JSON.stringify(context).slice(0, 5000)}`
        }
      ],
      max_output_tokens: 220
    })
  });

  if (!response.ok) return '';
  const data = await response.json();
  return data.output_text || '';
}

function localAnswer(intent, context) {
  if (intent === 'nearby') {
    if (!context.parks?.length) return 'No encontre parques cercanos con coordenadas registradas.';
    return `Parques cercanos:\n${context.parks.map((p) => `- ${p.nombre}: ${p.distancia_km.toFixed(2)} km, ${p.esta_abierto ? 'abierto' : 'cerrado'}, horario ${p.hora_apertura || '06:00'}-${p.hora_cierre || '20:00'}`).join('\n')}`;
  }
  if (intent === 'open_parks') {
    if (!context.parks?.length) return 'No hay parques con horario registrado.';
    return `Horarios de parques registrados:\n${context.parks.map((p) => `- ${p.nombre} (${p.zona || 'sin zona'}): ${p.esta_abierto ? 'abierto' : 'cerrado'}, ${p.hora_apertura || '06:00'}-${p.hora_cierre || '20:00'}`).join('\n')}`;
  }
  if (intent === 'courts') {
    if (!context.courts?.length) return 'No encontre canchas registradas para esa consulta.';
    return `Canchas registradas:\n${context.courts.map((c) => `- ${c.nombre}, ${c.parque}: ${c.estado || 'sin estado'}, horario parque ${c.hora_apertura || '06:00'}-${c.hora_cierre || '20:00'}`).join('\n')}`;
  }
  if (intent === 'reports_help') {
    return 'Para reportar una incidencia: selecciona un parque, describe el problema con detalle, adjunta una foto reciente y envia el reporte. La prioridad y criticidad las define el equipo administrador o gestor.';
  }
  return 'Puedo ayudarte a encontrar parques, revisar canchas, ubicar parques cercanos y explicar como crear reportes ciudadanos.';
}

export class ChatbotService {
  static async answer({ question, location }) {
    const intent = detectIntent(question);
    const context = { intent };
    await ParquesRepository.ensureScheduleColumns();

    if (intent === 'nearby') {
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return {
          message: 'Para buscar parques cercanos necesito permiso de ubicacion del navegador.',
          requiresLocation: true
        };
      }

      const [rows] = await pool.query(`
        SELECT p.id_parque, p.nombre, p.descripcion, p.latitud, p.longitud,
          TIME_FORMAT(COALESCE(p.hora_apertura, '06:00:00'), '%H:%i') AS hora_apertura,
          TIME_FORMAT(COALESCE(p.hora_cierre, '20:00:00'), '%H:%i') AS hora_cierre,
          CASE
            WHEN p.esta_abierto = 1
             AND (
              (COALESCE(p.hora_apertura, '06:00:00') <= COALESCE(p.hora_cierre, '20:00:00') AND CURTIME() BETWEEN COALESCE(p.hora_apertura, '06:00:00') AND COALESCE(p.hora_cierre, '20:00:00'))
              OR
              (COALESCE(p.hora_apertura, '06:00:00') > COALESCE(p.hora_cierre, '20:00:00') AND (CURTIME() >= COALESCE(p.hora_apertura, '06:00:00') OR CURTIME() <= COALESCE(p.hora_cierre, '20:00:00')))
             )
            THEN 1 ELSE 0
          END AS esta_abierto,
          COALESCE(z.nombre_zona, 'Sin zona') AS zona
        FROM parques p
        LEFT JOIN zonas z ON z.id_zona = p.id_zona
        WHERE p.latitud IS NOT NULL AND p.longitud IS NOT NULL
      `);

      context.parks = rows
        .map((park) => ({
          ...park,
          latitud: Number(park.latitud),
          longitud: Number(park.longitud),
          distancia_km: distanceKm(lat, lng, Number(park.latitud), Number(park.longitud))
        }))
        .sort((a, b) => a.distancia_km - b.distancia_km)
        .slice(0, 5);
    }

    if (intent === 'open_parks') {
      const [parks] = await pool.query(`
        SELECT p.id_parque, p.nombre, p.latitud, p.longitud,
          TIME_FORMAT(COALESCE(p.hora_apertura, '06:00:00'), '%H:%i') AS hora_apertura,
          TIME_FORMAT(COALESCE(p.hora_cierre, '20:00:00'), '%H:%i') AS hora_cierre,
          CASE
            WHEN p.esta_abierto = 1
             AND (
              (COALESCE(p.hora_apertura, '06:00:00') <= COALESCE(p.hora_cierre, '20:00:00') AND CURTIME() BETWEEN COALESCE(p.hora_apertura, '06:00:00') AND COALESCE(p.hora_cierre, '20:00:00'))
              OR
              (COALESCE(p.hora_apertura, '06:00:00') > COALESCE(p.hora_cierre, '20:00:00') AND (CURTIME() >= COALESCE(p.hora_apertura, '06:00:00') OR CURTIME() <= COALESCE(p.hora_cierre, '20:00:00')))
             )
            THEN 1 ELSE 0
          END AS esta_abierto,
          COALESCE(z.nombre_zona, 'Sin zona') AS zona
        FROM parques p
        LEFT JOIN zonas z ON z.id_zona = p.id_zona
        ORDER BY p.nombre ASC
        LIMIT 12
      `);
      context.parks = parks;
    }

    if (intent === 'courts') {
      const [courts] = await pool.query(`
        SELECT c.id_cancha, c.nombre, p.nombre AS parque, ec.nombre AS estado,
          TIME_FORMAT(COALESCE(p.hora_apertura, '06:00:00'), '%H:%i') AS hora_apertura,
          TIME_FORMAT(COALESCE(p.hora_cierre, '20:00:00'), '%H:%i') AS hora_cierre
        FROM canchas c
        JOIN parques p ON p.id_parque = c.id_parque
        LEFT JOIN estados_cancha ec ON ec.id_estado_cancha = c.id_estado_cancha
        ORDER BY p.nombre ASC, c.nombre ASC
        LIMIT 12
      `);
      context.courts = courts;
    }

    let message = '';
    try {
      message = await askOpenAI(question, context);
    } catch {
      message = '';
    }

    return {
      message: message || localAnswer(intent, context),
      intent,
      context
    };
  }
}
