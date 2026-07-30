# Analisis tecnico del sistema de gestion de parques

## 1. Alcance revisado

Proyecto revisado: `parque/`

Tecnologias detectadas:

- Node.js con ES modules
- Express.js
- MySQL via `mysql2/promise`
- bcrypt
- jsonwebtoken
- Nodemailer con Gmail SMTP
- HTML, CSS y JavaScript vanilla
- Leaflet y OpenStreetMap en interfaces de mapas
- PDFKit para exportar reportes

No se encontro archivo `.sql` dentro del proyecto. El analisis de base de datos se infiere desde los repositorios, rutas y consultas SQL del backend.

## 2. Arquitectura actual

La estructura base es modular:

```txt
src/
  config/
    db.js
    email.service.js
  core/
    server.js
  modules/
    auth/
    canchas/
    parques/
    reportes/
    usuarios/
    zonas/
    admin/
    gestor/
  shared/
    middleware/
      auth.middleware.js
public/
  pages/
  js/
  css/
```

Fortalezas:

- Separacion inicial por dominios: auth, usuarios, parques, canchas, reportes y zonas.
- Uso de `mysql2/promise`, adecuado para async/await.
- Uso de consultas parametrizadas en la mayoria de operaciones.
- Registro ciudadano ya tiene verificacion por correo.
- Reportes guardan imagenes con validacion de tipo, tamano y ventana temporal.
- Ya existe Leaflet para mapas.

Problemas actuales:

- `src/shared/middleware/auth.middleware.js` esta vacio.
- Muchas rutas administrativas no exigen JWT ni rol en backend.
- El frontend valida sesion con `localStorage`, pero eso no protege la API.
- `auth.controller.js` y `auth.service.js` estan vacios; la logica real vive en `auth.routes.js`.
- `reportes.routes.js` mezcla rutas, validaciones, repositorio, archivos y transacciones.
- `ParquesRepository.delete()` desactiva `FOREIGN_KEY_CHECKS`, lo cual es riesgoso.
- El `.env` contiene secretos reales. Debe rotarse el App Password y cambiarse `JWT_SECRET`.
- `cors()` esta abierto para cualquier origen.
- El token se guarda en `localStorage`, lo que aumenta riesgo ante XSS.
- Hay dependencia `resend` instalada pero no se usa.

## 3. Modelo de datos inferido

Tablas usadas por el codigo:

- `usuarios`
- `roles`
- `parques`
- `zonas`
- `canchas`
- `estados_cancha`
- `reportes`
- `prioridades`
- `estados_reporte`
- `imagenes_reportes`

Relaciones inferidas:

- `usuarios.id_rol -> roles.id_rol`
- `parques.id_zona -> zonas.id_zona`
- `canchas.id_parque -> parques.id_parque`
- `canchas.id_estado_cancha -> estados_cancha.id_estado_cancha`
- `reportes.id_parque -> parques.id_parque`
- `reportes.id_zona -> zonas.id_zona`
- `reportes.id_usuario -> usuarios.id_usuario`
- `reportes.id_prioridad -> prioridades.id_prioridad`
- `reportes.id_estado_reporte -> estados_reporte.id_estado_reporte`
- `imagenes_reportes.id_reporte -> reportes.id_reporte`

## 4. Seguridad actual

Riesgos prioritarios:

1. APIs administrativas sin middleware de autenticacion y autorizacion.
2. Secretos expuestos en `.env`.
3. `JWT_SECRET` debil.
4. CORS abierto.
5. Credenciales Gmail en variable generica `EMAIL_PASS`.
6. OTP de verificacion de registro guardado en `usuarios` sin limite de intentos.
7. Admin puede crear usuarios con password por defecto `123456`.
8. PDF de reportes no exige token.
9. Eliminacion de parques desactivando foreign keys.
10. No hay rate limiting en login, registro, verificacion ni reportes.

Prioridad inmediata:

- Implementar middleware JWT y roles.
- Rotar secretos.
- Agregar 2FA solo para roles 1 y 2.
- Separar OTP en tabla propia.
- Proteger rutas `/api/usuarios`, escritura de `/api/parques`, `/api/canchas`, edicion de `/api/reportes` y `/api/reportes/pdf`.

## 5. Arquitectura recomendada

Estructura propuesta:

```txt
src/
  config/
    db.js
    email.service.js
    env.js
  core/
    server.js
    socket.js
  shared/
    middleware/
      auth.middleware.js
      roles.middleware.js
      validate.middleware.js
      rate-limit.middleware.js
    utils/
      crypto.js
      distance.js
      async-handler.js
  modules/
    auth/
      interfaces/
        auth.routes.js
        auth.controller.js
      application/
        auth.service.js
        otp.service.js
      infrastructure/
        auth.repository.js
        otp.repository.js
    dashboard/
      interfaces/
        dashboard.routes.js
      application/
        dashboard.service.js
      infrastructure/
        dashboard.repository.js
    chatbot/
      interfaces/
        chatbot.routes.js
      application/
        chatbot.service.js
        tools.service.js
      infrastructure/
        chatbot.repository.js
    mapas/
      interfaces/
        mapas.routes.js
      infrastructure/
        mapas.repository.js
```

## 6. 2FA para administradores y gestores

Objetivo:

- Rol 1 Administrador: requiere OTP.
- Rol 2 Gestor: requiere OTP.
- Rol 3 Usuario normal: login directo como hoy.

Flujo recomendado:

1. `POST /api/auth/login`
2. Backend valida email, password, estado activo y correo verificado.
3. Si `id_rol` es 1 o 2:
   - genera OTP de 6 digitos
   - guarda hash del OTP en MySQL
   - expira en 5 minutos
   - maximo 3 intentos
   - envia correo por Gmail App Password
   - responde `{ requires2FA: true, challengeId }`
4. Frontend muestra pantalla o modal de codigo.
5. `POST /api/auth/2fa/verify`
6. Backend valida OTP.
7. Si es correcto:
   - borra o invalida OTP
   - genera JWT final
   - devuelve `{ token, user }`
8. Si es rol 3:
   - devuelve token directamente como ahora.

Tabla SQL recomendada:

```sql
CREATE TABLE auth_otp_codes (
  id_otp BIGINT PRIMARY KEY AUTO_INCREMENT,
  id_usuario INT NOT NULL,
  email VARCHAR(150) NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  tipo ENUM('2fa_login', 'email_verification', 'password_reset') NOT NULL DEFAULT '2fa_login',
  intentos INT NOT NULL DEFAULT 0,
  max_intentos INT NOT NULL DEFAULT 3,
  expira_en DATETIME NOT NULL,
  usado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_usuario_tipo (id_usuario, tipo),
  INDEX idx_otp_email_tipo (email, tipo),
  INDEX idx_otp_expira (expira_en),
  CONSTRAINT fk_auth_otp_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    ON DELETE CASCADE
);
```

Variables `.env` recomendadas:

```env
PORT=300
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=parques_db

JWT_SECRET=valor_largo_aleatorio_minimo_32_bytes
JWT_EXPIRES_IN=8h

EMAIL_USER=correo@gmail.com
EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
EMAIL_FROM_NAME=Parques La Paz

APP_URL=http://localhost:300
CORS_ORIGIN=http://localhost:300
```

Servicio de correo recomendado:

```js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

export async function sendOtpEmail(email, nombre, otp) {
  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Codigo de acceso - Sistema de Parques',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2>Hola, ${nombre}</h2>
        <p>Usa este codigo para completar tu inicio de sesion:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</div>
        <p>Este codigo expira en 5 minutos.</p>
      </div>
    `
  });
}
```

Generacion OTP:

```js
import crypto from 'crypto';
import bcrypt from 'bcrypt';

export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}
```

Respuesta de login para roles 1 y 2:

```json
{
  "requires2FA": true,
  "challengeId": 123,
  "emailMasked": "ad***@gmail.com"
}
```

Respuesta de login para rol 3:

```json
{
  "token": "...",
  "user": {
    "id_usuario": 10,
    "id_rol": 3,
    "nombre": "Usuario"
  }
}
```

Endpoints:

```txt
POST /api/auth/login
POST /api/auth/2fa/verify
POST /api/auth/2fa/resend
POST /api/auth/register
POST /api/auth/verify-email
POST /api/auth/logout
GET  /api/auth/me
```

Middleware requerido:

```js
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(Number(req.user?.rol))) {
      return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    next();
  };
}
```

Proteccion recomendada:

```js
router.use('/api/usuarios', requireAuth, requireRoles(1));
router.use('/api/canchas', requireAuth, requireRoles(1, 2));
router.use('/api/reportes/pdf', requireAuth, requireRoles(1, 2));
```

## 7. Cambios frontend para 2FA

El login actual guarda `token` inmediatamente. Para roles 1 y 2 debe cambiar:

```js
const data = await postJson('/api/auth/login', { email, password });

if (data.requires2FA) {
  sessionStorage.setItem('twoFactorChallengeId', data.challengeId);
  mostrarFormularioOtp();
  return;
}

saveSession(data);
redirectByRole(data.user);
```

Verificacion:

```js
const data = await postJson('/api/auth/2fa/verify', {
  challengeId: sessionStorage.getItem('twoFactorChallengeId'),
  codigo
});

saveSession(data);
redirectByRole(data.user);
```

## 8. Chatbot inteligente

Recomendacion para esta arquitectura:

- Mejor opcion: OpenAI API desde backend Node.js.
- Segunda opcion: Gemini API.
- Evitaria Botpress/Dialogflow al inicio porque agregan mas plataforma, intents y configuracion externa.

Razon:

- Tu sistema ya usa Express y MySQL.
- Necesitas consultar datos dinamicos: parques, canchas, reportes y ubicacion.
- Un backend propio puede controlar permisos, SQL permitido y respuestas.
- OpenAI permite tool/function calling para llamar funciones internas como `buscarParquesCercanos`.

Arquitectura:

```txt
Frontend chatbot
  -> POST /api/chatbot/message
  -> ChatbotService
  -> herramientas internas
       - buscar parques
       - parques cercanos
       - canchas disponibles
       - consultar reporte
  -> MySQL
  -> respuesta al usuario
```

Endpoints:

```txt
POST /api/chatbot/message
GET  /api/chatbot/faqs
GET  /api/chatbot/parques-cercanos?lat=-16.5&lng=-68.15&radioKm=3
```

Payload:

```json
{
  "message": "Muestrame parques cerca",
  "location": {
    "lat": -16.5,
    "lng": -68.15
  }
}
```

Geolocalizacion en navegador:

```js
navigator.geolocation.getCurrentPosition(
  (pos) => {
    const location = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    };
    enviarMensajeChatbot('Muestrame parques cerca', location);
  },
  () => mostrarMensaje('No se pudo obtener tu ubicacion.')
);
```

Consulta MySQL para parques cercanos:

```sql
SELECT
  id_parque,
  nombre,
  descripcion,
  latitud,
  longitud,
  (
    6371 * ACOS(
      COS(RADIANS(?)) *
      COS(RADIANS(latitud)) *
      COS(RADIANS(longitud) - RADIANS(?)) +
      SIN(RADIANS(?)) *
      SIN(RADIANS(latitud))
    )
  ) AS distancia_km
FROM parques
WHERE latitud IS NOT NULL
  AND longitud IS NOT NULL
ORDER BY distancia_km ASC
LIMIT 5;
```

Reglas de seguridad del chatbot:

- Nunca permitir SQL libre generado por IA.
- La IA solo decide que herramienta usar.
- Las herramientas ejecutan queries parametrizadas definidas por el sistema.
- Limitar datos sensibles segun rol.
- Para usuario anonimo o ciudadano, no exponer datos personales de reportantes.

## 9. Dashboard inteligente

Crear modulo `dashboard` separado.

Endpoints:

```txt
GET /api/dashboard/kpis
GET /api/dashboard/reportes-por-estado
GET /api/dashboard/reportes-por-mes
GET /api/dashboard/parques-mas-reportes
GET /api/dashboard/parques-mas-arreglos
GET /api/dashboard/canchas-mas-incidencias
GET /api/dashboard/zonas-mas-danadas
GET /api/dashboard/estados-canchas
GET /api/dashboard/gestores-mas-activos
```

KPIs:

```sql
SELECT
  COUNT(*) AS total_reportes,
  SUM(id_estado_reporte = 1) AS pendientes,
  SUM(id_estado_reporte = 2) AS en_revision,
  SUM(id_estado_reporte = 3) AS resueltos,
  SUM(id_estado_reporte = 4) AS rechazados
FROM reportes;
```

Parque con mas reportes:

```sql
SELECT p.id_parque, p.nombre, COUNT(r.id_reporte) AS total
FROM parques p
JOIN reportes r ON r.id_parque = p.id_parque
GROUP BY p.id_parque, p.nombre
ORDER BY total DESC
LIMIT 10;
```

Reportes por mes:

```sql
SELECT
  DATE_FORMAT(fecha_creacion, '%Y-%m') AS mes,
  COUNT(*) AS total
FROM reportes
GROUP BY mes
ORDER BY mes ASC;
```

Zonas mas danadas:

```sql
SELECT z.id_zona, z.nombre_zona, COUNT(r.id_reporte) AS total
FROM zonas z
JOIN reportes r ON r.id_zona = z.id_zona
GROUP BY z.id_zona, z.nombre_zona
ORDER BY total DESC;
```

Estados de canchas:

```sql
SELECT ec.nombre, COUNT(c.id_cancha) AS total
FROM estados_cancha ec
LEFT JOIN canchas c ON c.id_estado_cancha = ec.id_estado_cancha
GROUP BY ec.id_estado_cancha, ec.nombre;
```

Gestores mas activos:

Requiere guardar auditoria de acciones. Tabla sugerida:

```sql
CREATE TABLE auditoria_acciones (
  id_accion BIGINT PRIMARY KEY AUTO_INCREMENT,
  id_usuario INT NOT NULL,
  accion VARCHAR(80) NOT NULL,
  entidad VARCHAR(80) NOT NULL,
  entidad_id INT NULL,
  metadata JSON NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auditoria_usuario_fecha (id_usuario, creado_en),
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);
```

## 10. Tiempo real

Recomendacion:

- Usar Socket.io si quieres dashboard en tiempo real estable y facil de integrar.
- WebSocket puro solo si quieres menos dependencia.
- Polling cada 15-30 segundos es mas simple, pero menos eficiente y menos "en tiempo real".

Arquitectura Socket.io:

```txt
Nuevo reporte
  -> POST /api/reportes
  -> INSERT reportes
  -> io.to('admins').emit('reportes:nuevo', payload)
  -> dashboard actualiza KPIs y tabla
```

Eventos recomendados:

```txt
reportes:nuevo
reportes:actualizado
reportes:estado-cambiado
canchas:estado-cambiado
dashboard:kpis
alertas:nueva
```

Frontend:

```js
const socket = io();

socket.emit('join', { role: user.id_rol });

socket.on('reportes:nuevo', (reporte) => {
  mostrarAlertaVisual(reporte);
  recargarMetricas();
});
```

## 11. Mapas y geolocalizacion

Ya existe Leaflet. Recomendacion:

- Mantener Leaflet + OpenStreetMap para evitar costos.
- Usar Google Maps solo si necesitas Places, rutas comerciales o geocoding avanzado.

Endpoints nuevos:

```txt
GET /api/mapas/parques
GET /api/mapas/incidencias
GET /api/mapas/parques-cercanos?lat=&lng=&radioKm=
```

Mejoras:

- Agregar `radioKm`.
- Agregar conteo de reportes activos por parque.
- Colorear marcadores por estado: abierto, cerrado, con incidencias criticas.
- Mostrar heatmap de reportes por zona.

## 12. Optimizacion MySQL

Indices recomendados:

```sql
ALTER TABLE usuarios
  ADD UNIQUE INDEX ux_usuarios_email (email),
  ADD INDEX idx_usuarios_rol_activo (id_rol, activo);

ALTER TABLE parques
  ADD INDEX idx_parques_zona (id_zona),
  ADD INDEX idx_parques_geo (latitud, longitud),
  ADD INDEX idx_parques_estado (esta_abierto);

ALTER TABLE canchas
  ADD INDEX idx_canchas_parque (id_parque),
  ADD INDEX idx_canchas_estado (id_estado_cancha);

ALTER TABLE reportes
  ADD INDEX idx_reportes_parque_estado (id_parque, id_estado_reporte),
  ADD INDEX idx_reportes_zona_estado (id_zona, id_estado_reporte),
  ADD INDEX idx_reportes_usuario_fecha (id_usuario, fecha_creacion),
  ADD INDEX idx_reportes_fecha (fecha_creacion),
  ADD INDEX idx_reportes_estado_fecha (id_estado_reporte, fecha_creacion);

ALTER TABLE imagenes_reportes
  ADD INDEX idx_imagenes_reporte (id_reporte);
```

## 13. Plan de implementacion por fases

Fase 1 - Seguridad base:

1. Rotar `EMAIL_APP_PASSWORD` y `JWT_SECRET`.
2. Crear `requireAuth` y `requireRoles`.
3. Proteger rutas administrativas.
4. Configurar CORS con origen fijo.
5. Agregar rate limiting.

Fase 2 - 2FA:

1. Crear tabla `auth_otp_codes`.
2. Crear `otp.repository.js`.
3. Crear `otp.service.js`.
4. Cambiar `POST /api/auth/login`.
5. Agregar `POST /api/auth/2fa/verify`.
6. Ajustar `public/js/login.js`.

Fase 3 - Dashboard:

1. Crear modulo `dashboard`.
2. Implementar KPIs y graficos.
3. Usar Chart.js o ApexCharts.
4. Agregar filtros por fecha, parque, zona y estado.

Fase 4 - Tiempo real:

1. Instalar Socket.io.
2. Emitir eventos desde reportes y canchas.
3. Actualizar dashboard sin recargar.
4. Agregar alertas visuales.

Fase 5 - Chatbot:

1. Crear modulo `chatbot`.
2. Implementar FAQ local.
3. Implementar herramientas de consulta MySQL.
4. Integrar OpenAI API.
5. Agregar ubicacion del navegador.

Fase 6 - Mapas avanzados:

1. Endpoint de parques cercanos.
2. Endpoint de incidencias activas.
3. Marcadores con severidad.
4. Heatmap por zona.

## 14. Conclusion

El sistema tiene una base funcional y una separacion modular inicial correcta, pero necesita reforzar la capa backend. La prioridad no debe ser agregar IA o dashboards primero, sino cerrar seguridad: middleware JWT, roles, secretos, CORS, rate limiting y 2FA.

Despues de eso, el sistema puede evolucionar de forma ordenada hacia una plataforma urbana inteligente con dashboard en tiempo real, mapas operativos y chatbot conectado a MySQL.
