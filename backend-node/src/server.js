import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import storeRoutes from './routes/storeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { readWorkspace } from './services/workspaceService.js';

const app = express();
app.get('/api/workspace', (req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)) {
        return res.status(403).json({ message: 'Dashboard contoh hanya tersedia dari komputer lokal.' });
    }

    const rawStoreId = req.query.storeId;
    if (rawStoreId !== undefined && (!/^\d+$/.test(String(rawStoreId)) || Number(rawStoreId) < 1)) {
        return res.status(422).json({ message: 'ID toko tidak valid.' });
    }

    try {
        return res.json(readWorkspace(rawStoreId === undefined ? null : Number(rawStoreId)));
    } catch (error) {
        return next(error);
    }
});
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mp-tiktok-api' });
});
app.use('/api/users', userRoutes);
app.use('/api/stores', storeRoutes);

app.use((error, _req, res, _next) => {
    const isUniqueConstraint = error.errcode === 2067 || /UNIQUE constraint/i.test(error.message || '');
    if (isUniqueConstraint) {
        return res.status(409).json({ message: 'Data duplikat.' });
    }
    console.error(error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error.' });
});

app.listen(env.port, () => {
    console.log('MP-TikTok API running at http://localhost:' + env.port);
});
