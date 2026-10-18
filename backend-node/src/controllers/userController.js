import { getUser, registerUser } from '../services/userService.js';

export function createUser(req, res, next) {
    try {
        res.status(201).json({ data: registerUser(req.body) });
    } catch (error) {
        next(error);
    }
}

export function showUser(req, res, next) {
    try {
        const user = getUser(Number(req.params.id));
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' });
        return res.json({ data: user });
    } catch (error) {
        return next(error);
    }
}
