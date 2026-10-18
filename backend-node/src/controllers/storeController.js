import { addStore, getStore, getStores } from '../services/storeService.js';

export function indexStores(req, res, next) {
    try {
        res.json({ data: getStores(Number(req.query.userId)) });
    } catch (error) {
        next(error);
    }
}

export function showStore(req, res, next) {
    try {
        const store = getStore(Number(req.params.id));
        if (!store) return res.status(404).json({ message: 'Store tidak ditemukan.' });
        return res.json({ data: store });
    } catch (error) {
        return next(error);
    }
}

export function createStore(req, res, next) {
    try {
        res.status(201).json({
            data: addStore({
                userId: Number(req.body.userId),
                name: req.body.name,
                platform: req.body.platform
            })
        });
    } catch (error) {
        next(error);
    }
}
