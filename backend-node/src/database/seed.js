import { randomBytes, scryptSync } from 'node:crypto';
import { db } from './connection.js';

const existingUser = db.prepare('SELECT id, password FROM users WHERE email = ?').get('demo@mp-tiktok.test');
const demoPassword = 'change-me';
const passwordHash = () => {
    const salt = randomBytes(16).toString('hex');
    return salt + ':' + scryptSync(demoPassword, salt, 64).toString('hex');
};

const userId = existingUser?.id || Number(db.prepare(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?) RETURNING id'
).get('Demo User', 'demo@mp-tiktok.test', passwordHash()).id);

if (existingUser?.password === demoPassword) {
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(passwordHash(), userId);
}

db.prepare(`
    INSERT INTO stores (user_id, name, slug, platform)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, slug) DO NOTHING
`).run(userId, 'Toko Utama', 'toko-utama', 'tiktok');

console.log('Seed completed for user:', userId);
