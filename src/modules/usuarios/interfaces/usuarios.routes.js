import { Router } from 'express';
import bcrypt from 'bcrypt';
import { UsuariosRepository } from '../infrastructure/usuarios.repository.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../middlewares/roles.middleware.js';
import { registrarActividad } from '../../notificaciones/infrastructure/actividad.service.js';

const router = Router();
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;
router.use(requireAuth, requireRoles(1));

router.get('/', async(req, res) => {
    const usuarios = await UsuariosRepository.getAll();
    res.json(usuarios);
});

router.post('/create', async(req, res) => {
    try {
        const { nombre, apellido, apellido_paterno, apellido_materno, email, password, rol } = req.body;
        if (!PASSWORD_RE.test(String(password || ''))) {
            return res.status(400).json({ ok: false, error: 'La contrasena debe tener 8 caracteres, mayuscula, minuscula, numero y simbolo' });
        }
        const hash = await bcrypt.hash(password, 10);
        await UsuariosRepository.create({ nombre, apellido, apellido_paterno, apellido_materno, email, password: hash, rol });
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'CREAR',
            tabla_afectada: 'usuarios',
            detalle:        `Creó el usuario "${nombre} ${apellido_paterno || apellido || ''}" (${email})`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error creando usuario' });
    }
});

router.post('/update', async(req, res) => {
    try {
        const data = { ...req.body };
        if(data.password) {
            return res.status(400).json({ ok: false, error: 'No esta permitido cambiar contrasenas desde Gestion de Usuarios' });
        }
        await UsuariosRepository.update(data);
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'EDITAR',
            tabla_afectada: 'usuarios',
            detalle:        `Editó el usuario #${data.id} (${data.email || ''})`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error actualizando' });
    }
});

router.post('/toggle', async(req, res) => {
    try {
        await UsuariosRepository.toggle(req.body.id);
        await registrarActividad({
            id_usuario:     req.user.id,
            accion:         'EDITAR',
            tabla_afectada: 'usuarios',
            detalle:        `Cambió estado activo/inactivo del usuario #${req.body.id}`
        });
        res.json({ ok: true });
    } catch(error) {
        console.log(error);
        res.status(500).json({ ok: false, error: 'Error toggle' });
    }
});

export default router;
