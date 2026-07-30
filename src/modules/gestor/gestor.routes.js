import { Router } from 'express';

// Importamos los mini-routers (Módulos de Dominio)
import parquesRoutes from './parques/parques.routes.js';
import canchasRoutes from './canchas/canchas.routes.js';
import tareasRoutes from './mis_tareas/tareas.routes.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRoles } from '../../middlewares/roles.middleware.js';

const router = Router();

router.use(requireAuth, requireRoles(2));

// ==========================================
// API REST: GESTOR DE PARQUES
// ==========================================

// Todo lo que vaya a /api/gestor/parques lo maneja parques.routes.js
router.use('/parques', parquesRoutes);

// Todo lo que vaya a /api/gestor/canchas lo maneja canchas.routes.js
router.use('/canchas', canchasRoutes);

// Todo lo que vaya a /api/gestor/reportes lo maneja tareas.routes.js
router.use('/reportes', tareasRoutes); 

export default router;
