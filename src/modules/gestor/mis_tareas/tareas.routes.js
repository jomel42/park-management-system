import { Router } from 'express';
import { obtenerMisTareas, guardarGestionReporte } from './tareas.controller.js';

const router = Router();

router.get('/mis-tareas', obtenerMisTareas);
router.post('/:id_reporte/gestionar', guardarGestionReporte);

export default router;