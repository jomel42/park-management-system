import { Router } from 'express';
import { obtenerCanchas, actualizarEstadoCancha } from './canchas.controller.js';

const router = Router();

router.get('/', obtenerCanchas);
router.put('/:id/estado', actualizarEstadoCancha);

export default router;