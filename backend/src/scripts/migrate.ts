import '../env.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const schemaPath = path.join(__dirname, '..', '..', 'sql', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  await pool.query(schema);
  console.log('Schema applied: listings, agent_limits, transactions, used_nonces');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
