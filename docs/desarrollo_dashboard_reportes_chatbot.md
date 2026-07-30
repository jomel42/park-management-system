# Desarrollo dashboard, reportes y chatbot

Fecha: 2026-05-21

## Fase 1 - Dashboard administrativo

- Se agrego el modulo `src/modules/admin/dashboard/`.
- Nuevas rutas protegidas solo para administrador:
  - `GET /api/admin/dashboard/overview`
  - `GET /api/admin/dashboard/analytics`
  - `GET /api/admin/dashboard/map`
  - `GET /api/admin/dashboard/search`
- El dashboard se carga en el inicio del panel admin mediante `/admin-assets/dashboard/interfaces/dashboard.html`.
- Incluye KPIs, graficos Chart.js, buscador global, tabla de reportes recientes, gestores y mapa Leaflet.
- El servidor ahora usa `http.createServer(app)` para permitir tiempo real.
- `src/core/realtime.js` intenta activar Socket.io si la dependencia esta instalada. Si no existe, el dashboard sigue funcionando con sondeo automatico.

## Fase 2 - Flujo de reportes

- El usuario ciudadano ya no selecciona prioridad en el frontend.
- El backend asigna prioridad media (`id_prioridad = 2`) y estado pendiente (`id_estado_reporte = 1`) al crear reportes.
- Se agrego `PATCH /api/reportes/:id/gestion` para admin/gestor:
  - cambiar prioridad
  - cambiar estado
  - asignar gestor
  - marcar criticidad
  - agregar observaciones internas
- La metadata operativa se guarda en `reportes_gestion`, creada con `CREATE TABLE IF NOT EXISTS` para no alterar destructivamente `reportes`.

## Fase 3 - Chatbot de usuario

- Se agrego `src/modules/chatbot/`.
- Ruta protegida solo para usuarios normales:
  - `POST /api/chatbot/message`
- El guard limita preguntas al contexto del sistema de parques y reportes.
- Para preguntas externas responde:
  - "Solo puedo ayudarte con información relacionada al sistema de parques y reportes."
- Usa consultas controladas para parques cercanos, parques abiertos y canchas.
- Usa OpenAI solo si existe `OPENAI_API_KEY`; si no, responde con logica local.
- El widget aparece solo en `public/pages/usuario/dashboard.html`.

## Variables y dependencias opcionales

- `OPENAI_API_KEY`: habilita respuestas redactadas con OpenAI.
- `OPENAI_CHATBOT_MODEL`: opcional, por defecto `gpt-4.1-mini`.
- `socket.io`: opcional. Si se instala, el dashboard recibe eventos `reportes:changed`; si no, usa actualizacion periodica.
