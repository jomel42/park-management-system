import { Router } from 'express';
import { ParquesRepository } from '../infrastructure/parques.repository.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../middlewares/roles.middleware.js';
import { registrarActividad } from '../../notificaciones/infrastructure/actividad.service.js';

const router = Router();
const requireManager = [requireAuth, requireRoles(1, 2)];

router.get('/', async(req, res) => {
    try {
        const parques = await ParquesRepository.getAll();
        res.json(parques);
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error obteniendo parques' });
    }
});

router.post('/', ...requireManager, async(req, res) => {
    try {
        const id     = await ParquesRepository.create(req.body);
        const parque = await ParquesRepository.getById(id);

        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'CREAR',
            tabla_afectada: 'parques',
            detalle:        `Creó el parque "${parque.nombre}"`
        });

        res.json({ ok: true, success: true, data: parque });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error creando parque' });
    }
});

router.put('/:id', ...requireManager, async(req, res) => {
    try {
        await ParquesRepository.update(req.params.id, req.body);
        const parque = await ParquesRepository.getById(req.params.id);

        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'EDITAR',
            tabla_afectada: 'parques',
            detalle:        `Editó el parque "${parque.nombre}"`
        });

        res.json({ ok: true, success: true, data: parque });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error actualizando parque' });
    }
});

router.delete('/:id', ...requireManager, async(req, res) => {
    try {
        const parque = await ParquesRepository.getById(req.params.id);

        await ParquesRepository.delete(req.params.id);

        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'ELIMINAR',
            tabla_afectada: 'parques',
            detalle:        `Eliminó el parque "${parque?.nombre || '#' + req.params.id}"`
        });

        res.json({ ok: true });
    } catch(error) {
        if(error.code !== 'ER_ROW_IS_REFERENCED_2') console.log(error);
        if(error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ ok: false, error: 'No se puede eliminar el parque porque tiene canchas registradas' });
        }
        res.status(500).json({ ok: false, error: 'Error eliminando parque' });
    }
});

router.patch('/:id/estado', ...requireManager, async(req, res) => {
    try {
        await ParquesRepository.cambiarEstado(req.params.id);
        const parque = await ParquesRepository.getById(req.params.id);

        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         parque.esta_abierto ? 'ACTIVAR' : 'DESACTIVAR',
            tabla_afectada: 'parques',
            detalle:        `Cambió estado del parque "${parque.nombre}" a ${parque.esta_abierto ? 'abierto' : 'cerrado'}`
        });

        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error cambiando estado' });
    }
});

router.get('/mapa', async(req, res) => {
    try {
        const parques = await ParquesRepository.getMapa();
        res.json({ success: true, data: parques });
    } catch(error) {
        console.log(error);
        res.status(500).json({ success: false });
    }
});

export default router;