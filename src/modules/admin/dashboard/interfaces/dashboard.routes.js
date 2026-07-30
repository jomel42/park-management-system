import { Router } from 'express';
import { requireAuth } from '../../../../middlewares/auth.middleware.js';
import { requireRoles } from '../../../../middlewares/roles.middleware.js';
import { DashboardRepository } from '../infrastructure/dashboard.repository.js';

const router = Router();
const MIN_SYSTEM_DATE = '2026-03-01';

router.use(requireAuth, requireRoles(1));

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validateSearch(query) {
  const filters = {
    q: String(query.q || '').trim().slice(0, 80),
    estado: String(query.estado || '').trim(),
    prioridad: String(query.prioridad || '').trim(),
    parque: String(query.parque || '').trim(),
    gestor: String(query.gestor || '').trim(),
    fechaInicio: String(query.fechaInicio || '').trim(),
    fechaFin: String(query.fechaFin || '').trim()
  };

  if (filters.estado && !['1', '2', '3', '4'].includes(filters.estado)) {
    return { error: 'Estado invalido' };
  }
  if (filters.prioridad && !['1', '2', '3'].includes(filters.prioridad)) {
    return { error: 'Prioridad invalida' };
  }
  if ((filters.fechaInicio || filters.fechaFin) && (!isDate(filters.fechaInicio) || !isDate(filters.fechaFin))) {
    return { error: 'Rango de fechas invalido' };
  }
  if (filters.fechaInicio && filters.fechaFin && filters.fechaInicio > filters.fechaFin) {
    return { error: 'La fecha inicial no puede ser mayor que la final' };
  }
  if ((filters.fechaInicio && filters.fechaInicio < MIN_SYSTEM_DATE) ||
      (filters.fechaFin && filters.fechaFin < MIN_SYSTEM_DATE)) {
    return { error: 'No se permiten fechas anteriores al 2026-03-01' };
  }

  return { filters };
}

router.get('/overview', async (req, res) => {
  try {
    const data = await DashboardRepository.getOverview();
    res.json({ ok: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error cargando resumen del dashboard' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const data = await DashboardRepository.getAnalytics();
    res.json({ ok: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error cargando metricas del dashboard' });
  }
});

router.get('/map', async (req, res) => {
  try {
    const data = await DashboardRepository.getMapData();
    res.json({ ok: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error cargando mapa administrativo' });
  }
});

router.get('/search', async (req, res) => {
  const validated = validateSearch(req.query);
  if (validated.error) return res.status(400).json({ ok: false, error: validated.error });

  try {
    const data = await DashboardRepository.search(validated.filters);
    res.json({ ok: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error ejecutando busqueda global' });
  }
});

export default router;
