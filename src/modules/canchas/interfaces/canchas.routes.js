import { Router } from 'express';
import { CanchasRepository } from '../infrastructure/canchas.repository.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../middlewares/roles.middleware.js';
import { registrarActividad } from '../../notificaciones/infrastructure/actividad.service.js';

const router = Router();
router.use(requireAuth, requireRoles(1, 2));

router.get('/', async(req, res) => {
    const data = await CanchasRepository.getAll();
    res.json(data);
});

router.post('/', async(req, res) => {
    try {
        const id = await CanchasRepository.create(req.body);
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'CREAR',
            tabla_afectada: 'canchas',
            detalle:        `Creó la cancha "${req.body.nombre || '#' + id}"`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error creando cancha' });
    }
});

router.put('/:id', async(req, res) => {
    try {
        await CanchasRepository.update(req.params.id, req.body);
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'EDITAR',
            tabla_afectada: 'canchas',
            detalle:        `Editó la cancha "${req.body.nombre || '#' + req.params.id}"`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error actualizando cancha' });
    }
});

router.delete('/:id', async(req, res) => {
    try {
        await CanchasRepository.delete(req.params.id);
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'ELIMINAR',
            tabla_afectada: 'canchas',
            detalle:        `Eliminó la cancha #${req.params.id}`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error eliminando cancha' });
    }
});

router.patch('/:id/estado', async(req, res) => {
    try {
        await CanchasRepository.cambiarEstado(req.params.id, req.body.id_estado_cancha);
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'EDITAR',
            tabla_afectada: 'canchas',
            detalle:        `Cambió estado de la cancha #${req.params.id}`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error cambiando estado' });
    }
});

export default router;