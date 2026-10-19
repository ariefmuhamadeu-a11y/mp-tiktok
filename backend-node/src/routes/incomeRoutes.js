import { Router } from 'express';
import { createIncomeImport } from '../controllers/incomeController.js';

const router = Router();
router.post('/', createIncomeImport);

export default router;
