import { Router } from 'express';
import { obtenerParques, actualizarEstadoParque } from './parques.controller.js';

const router = Router();

router.get('/', obtenerParques);
router.put('/:id/estado', actualizarEstadoParque);

export default router;