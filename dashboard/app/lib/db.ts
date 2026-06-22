import pg from 'pg';

const { Pool } = pg;

const globalForDb = globalThis as unknown as {
  pool: pg.Pool | undefined;
};

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase.co')
      ? { rejectUnauthorized: false }
      : undefined,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}
