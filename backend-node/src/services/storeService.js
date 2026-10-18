import { createStore, findStoreById, listStoresByUser } from '../models/storeModel.js';
import { getUser } from './userService.js';

function slugify(value) {
    return String(value || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getStores(userId) {
    return listStoresByUser(userId);
}

export function getStore(id) {
    return findStoreById(id);
}

export function addStore({ userId, name, platform = 'tiktok' }) {
    const user = getUser(userId);
    const cleanName = String(name || '').trim();
    const slug = slugify(cleanName);
    if (!user) {
        const error = new Error('User tidak ditemukan.');
        error.statusCode = 404;
        throw error;
    }
    if (!cleanName || !slug) {
        const error = new Error('Nama store wajib diisi.');
        error.statusCode = 422;
        throw error;
    }
    return createStore({ userId, name: cleanName, slug, platform: String(platform || 'tiktok').trim() });
}
