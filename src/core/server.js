import express from 'express';
import cors from 'cors';
import path from 'path';

import gestorRoutes         from '../modules/gestor/gestor.routes.js';
import authRoutes           from '../modules/auth/interfaces/auth.routes.js';
import otpRoutes            from '../modules/otp/interfaces/otp.routes.js';
import usuariosRoutes       from '../modules/usuarios/interfaces/usuarios.routes.js';
import parquesRoutes        from '../modules/parques/interfaces/parques.routes.js';
import zonasRoutes          from '../modules/zonas/interfaces/zonas.routes.js';
import canchasRoutes        from '../modules/canchas/interfaces/canchas.routes.js';
import reportesRoutes       from '../modules/reportes/interfaces/reportes.routes.js';
import reportesPdfRoutes    from '../modules/reportes/interfaces/reportes.pdf.routes.js';
import adminDashboardRoutes from '../modules/admin/dashboard/interfaces/dashboard.routes.js';
import chatbotRoutes        from '../modules/chatbot/chatbot.routes.js';
import actividadRoutes      from '../modules/notificaciones/infrastructure/actividad.routes.js';
import { requirePageAuth }  from '../middlewares/auth.middleware.js';

const app = express();
app.disable('x-powered-by');

/* MIDDLEWARES */
app.use(cors());
app.use(express.json({ limit:'35mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/* PUBLIC */
app.use('/pages/dashboard.html', requirePageAuth());
app.use('/pages/admin', requirePageAuth(1));
app.use('/pages/gestor', requirePageAuth(2));
app.use('/pages/usuario', requirePageAuth(3));
app.use(express.static('public'));

/* GESTOR ASSETS */
app.use(
  '/admin-assets/gestor',
  requirePageAuth(2),
  express.static(path.join(process.cwd(), 'src/modules/gestor'))
);

/* ADMIN ASSETS */
app.use(
  '/admin-assets',
  requirePageAuth(1),
  express.static(path.join(process.cwd(), 'src/modules/admin'))
);

/* API */
app.use('/api/auth',            authRoutes);
app.use('/api/auth',            otpRoutes);
app.use('/api/usuarios',        usuariosRoutes);
app.use('/api/parques',         parquesRoutes);
app.use('/api/zonas',           zonasRoutes);
app.use('/api/canchas',         canchasRoutes);
app.use('/api/reportes',        reportesPdfRoutes);   // ⚠️ PDF ANTES que el router general
app.use('/api/reportes',        reportesRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/chatbot',         chatbotRoutes);
app.use('/api/gestor',          gestorRoutes);
// ✅ NUEVO
app.use('/api/actividad',       actividadRoutes);

/* PÁGINAS */
app.get('/', (req,res) =>
  res.sendFile(path.join(process.cwd(), 'public/index.html')));

app.get('/login', (req,res) =>
  res.sendFile(path.join(process.cwd(), 'public/pages/login.html')));

app.get('/otp', (req,res) =>
  res.sendFile(path.join(process.cwd(), 'public/pages/otp.html')));

app.get('/register', (req,res) =>
  res.sendFile(path.join(process.cwd(), 'public/pages/register.html')));

app.get('/admin', requirePageAuth(1), (req,res) =>
  res.sendFile(path.join(process.cwd(), 'src/modules/admin/index.html')));

/* ERROR HANDLER */
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error)
    return res.status(400).json({ ok:false, error:'JSON invalido' });
  next(error);
});

export default app;
