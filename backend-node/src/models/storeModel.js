import { db } from '../database/connection.js';

export function listStoresByUser(userId) {
    return db.prepare(`
        SELECT id, user_id, name, slug, platform, is_active, created_at, updated_at
        FROM stores WHERE user_id = ? ORDER BY id DESC
    `).all(userId);
}

export function findStoreById(id) {
    return db.prepare(`
        SELECT id, user_id, name, slug, platform, is_active, created_at, updated_at
        FROM stores WHERE id = ?
    `).get(id);
}

export function createStore({ userId, name, slug, platform }) {
    return db.prepare(`
        INSERT INTO stores (user_id, name, slug, platform)
        VALUES (?, ?, ?, ?)
        RETURNING id, user_id, name, slug, platform, is_active, created_at, updated_at
    `).get(userId, name, slug, platform);
}
