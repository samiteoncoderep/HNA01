import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly — every part of the app depends on this.
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL is not set. Set it in your environment (.env) before starting.');
}

// Railway / managed Postgres typically requires SSL. Allow opting out locally.
const useSsl =
  process.env.PGSSL === 'true' ||
  (connectionString?.includes('railway') ?? false) ||
  process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

export async function withTransaction<T>(fn: (q: typeof query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const txQuery = async (text: string, params?: any[]) => {
    const res = await client.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  };
  try {
    await client.query('BEGIN');
    const result = await fn(txQuery as typeof query);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
