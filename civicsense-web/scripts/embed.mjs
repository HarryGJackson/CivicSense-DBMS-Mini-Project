/**
 * npm run embed
 *
 * Gives every complaint its vector. Reads title + description, turns the
 * text into 384 numbers with all-MiniLM-L6-v2 (running on this machine, no
 * API key), and stores them in complaints.embedding.
 *
 * Also replaces the placeholder similarity_score on already-merged duplicates
 * with the real cosine similarity, now that there are vectors to measure.
 *
 * The first run downloads the model, about 90 MB. After that it is cached
 * and this takes a few seconds. Safe to run again at any time.
 */
import fs from 'node:fs';
import pg from 'pg';
import { pipeline } from '@xenova/transformers';

// read .env.local if it exists (same settings the web app uses)
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

const db = new pg.Client({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'civicsense',
  user: process.env.PGUSER || process.env.USER,
  password: process.env.PGPASSWORD || undefined,
});

await db.connect();
console.log(`connected to database "${db.database}"`);

console.log('loading all-MiniLM-L6-v2 (first run downloads ~90 MB)...');
const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

const { rows } = await db.query(
  'SELECT complaint_id, title, description FROM complaints ORDER BY complaint_id'
);

for (const r of rows) {
  const out = await model(`${r.title}. ${r.description}`, { pooling: 'mean', normalize: true });
  const vec = Array.from(out.data);
  if (vec.length !== 384) throw new Error(`expected 384 numbers, got ${vec.length}`);
  await db.query('UPDATE complaints SET embedding = $1::vector WHERE complaint_id = $2', [
    `[${vec.map((v) => v.toFixed(6)).join(',')}]`,
    r.complaint_id,
  ]);
  process.stdout.write(`\r  embedded ${r.complaint_id} of ${rows.length}`);
}
console.log('');

// real similarity for duplicates that were merged before vectors existed
const fixed = await db.query(`
  UPDATE complaints ch
     SET similarity_score = ROUND((1 - (ch.embedding <=> p.embedding))::NUMERIC, 4)
    FROM complaints p
   WHERE p.complaint_id = ch.parent_complaint_id
     AND ch.embedding IS NOT NULL AND p.embedding IS NOT NULL`);
console.log(`recomputed similarity for ${fixed.rowCount} merged duplicates`);

await db.query('ANALYZE complaints');
const check = await db.query('SELECT COUNT(embedding) AS done, COUNT(*) AS total FROM complaints');
console.log(`done: ${check.rows[0].done} of ${check.rows[0].total} complaints have a vector`);
await db.end();
