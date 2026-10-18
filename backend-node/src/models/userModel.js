import { db } from '../database/connection.js';

export function findUserById(id) {
    return db.prepare(
        'SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?'
    ).get(id);
}

export function findUserByEmail(email) {
    return db.prepare(
        'SELECT id, name, email, password, created_at, updated_at FROM users WHERE email = ?'
    ).get(email);
}

export function createUser({ name, email, password }) {
    return db.prepare(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?) RETURNING id, name, email, created_at, updated_at'
    ).get(name, email, password);
}
