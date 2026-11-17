/**
 * One PostgreSQL connection pool for the whole app.
 *
 * Next.js reloads modules on every edit in development, which would otherwise
 * open a new pool each time and exhaust the server's connection slots. Parking
 * the pool on globalThis keeps a single one alive across reloads.
 */
import { Pool } from 'pg';

const config = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'civicsense',
  user: process.env.PGUSER || process.env.USER,
  password: process.env.PGPASSWORD || undefined,
  max: 10,
  idleTimeoutMillis: 30000,
};

const pool = globalThis.__civicPool ?? new Pool(config);
if (!globalThis.__civicPool) globalThis.__civicPool = pool;

/**
 * Run a parameterised query. Values are always passed separately from the SQL
 * text, so user input can never be read as SQL — this is what stops injection.
 */
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

/** Exactly one row, or null. */
export async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

/**
 * Run several statements as one transaction: they all commit, or none do.
 * Used by the duplicate merge, which touches three tables at once.
 */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
