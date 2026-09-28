const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new Pool({ connectionString, max: 10 });
}

// Applies pending SQL files in order. An advisory lock keeps API and worker from racing on startup.
async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(7201)');
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const applied = new Set((await client.query('select name from schema_migrations')).rows.map((row) => row.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(7201)').catch(() => {});
    client.release();
  }
}

module.exports = { createPool, migrate };
