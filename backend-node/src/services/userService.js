import { randomBytes, scryptSync } from 'node:crypto';
import { createUser, findUserByEmail, findUserById } from '../models/userModel.js';

function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return salt + ':' + hash;
}

export function getUser(id) {
    return findUserById(id);
}

export function registerUser(input) {
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    if (!name || !email || password.length < 8) {
        const error = new Error('Nama, email, dan password minimal 8 karakter wajib diisi.');
        error.statusCode = 422;
        throw error;
    }
    if (findUserByEmail(email)) {
        const error = new Error('Email sudah terdaftar.');
        error.statusCode = 409;
        throw error;
    }
    return createUser({ name, email, password: hashPassword(password) });
}
