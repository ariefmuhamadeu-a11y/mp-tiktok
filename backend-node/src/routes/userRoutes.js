import { Router } from 'express';
import { createUser, showUser } from '../controllers/userController.js';

const router = Router();
router.post('/', createUser);
router.get('/:id', showUser);

export default router;
