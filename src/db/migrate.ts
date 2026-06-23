import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
  // schema.sql lives next to this file in src; in dist it is copied alongside.
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) throw new Error('schema.sql not found in: ' + candidates.join(', '));
  const sql = fs.readFileSync(schemaPath, 'utf8');
  // eslint-disable-next-line no-console
  console.log('[migrate] applying schema...');
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log('[migrate] done.');
  await pool.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', err);
  process.exit(1);
});
