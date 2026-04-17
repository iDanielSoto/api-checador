import { Router } from 'express';
import { streamEvents } from '../controllers/stream.controller.js';

import { verificarAutenticacion } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', verificarAutenticacion, streamEvents);

export default router;

