import { Router } from 'express';
import { createStore, indexStores, showStore } from '../controllers/storeController.js';

const router = Router();
router.get('/', indexStores);
router.post('/', createStore);
router.get('/:id', showStore);

export default router;
