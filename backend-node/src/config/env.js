import 'dotenv/config';

export const env = {
    port: Number(process.env.PORT || 3001),
    databasePath: process.env.DATABASE_PATH || './database/dev.sqlite'
};
