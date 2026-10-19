import { Router } from 'express';
import { createShipmentImport } from '../controllers/shipmentController.js';

const router = Router();
router.post('/', createShipmentImport);

export default router;
