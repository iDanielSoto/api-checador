import { Router } from 'express';
import { streamEvents } from '../controllers/stream.controller.js';

const router = Router();

router.get('/', streamEvents);

export default router;
