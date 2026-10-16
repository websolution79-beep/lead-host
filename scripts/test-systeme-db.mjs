import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = process.env.PGLITE_MODULE || resolve(root, 'tmp/systeme-db-validation/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const load = (path) => readFile(resolve(root, path), 'utf8');
const foundation = 'supabase/migrations/202610150001_marketing_systeme_integration_foundation.sql';
const legacy = 'supabase/migrations/202610150002_marketing_systeme_atomic_import.sql';
const flows = 'supabase/migrations/202610150003_marketing_systeme_flows_foundation.sql';
const backend = 'supabase/migrations/202610150004_marketing_systeme_flows_backend.sql';

async function base(db) {
  await db.exec("set leadhost.isolated_schema_test = 'true'");
  await db.exec(await load('supabase/tests/fixtures/marketing_systeme_minimal.sql'));
  await db.exec(await load('supabase/migrations/202608010002_marketing_crm_foundation.sql'));
  await db.exec(await load(foundation));
  await db.exec(await load(foundation));
  await db.exec(await load('supabase/tests/marketing_systeme_foundation.sql'));
  await db.exec(await load('supabase/migrations/202608010003_marketing_crm_property_details.sql'));
  await db.exec(await load('supabase/tests/fixtures/marketing_systeme_import_access.sql'));
  await db.exec(await load(legacy));
  await db.exec(await load(legacy));
}

async function run() {
  const db = new PGlite();
  try {
    await base(db);
    await db.exec(await load('supabase/tests/marketing_systeme_atomic_import.sql'));
    console.log('Original ownership/RLS/atomic importer tests: PASS');
    await db.exec(await load('supabase/tests/fixtures/marketing_systeme_flows_legacy.sql'));
    await db.exec(await load(flows));
    await db.exec(await load(flows));
    await db.exec(await load('supabase/tests/marketing_systeme_flows_foundation.sql'));
    await db.exec(await load('docs/sql/systeme-flows-backend-preflight.sql'));
    console.log('Flow foundation and unchanged legacy state: PASS');
    await db.exec(await load(backend));
    await db.exec(await load(backend));
    await db.exec(await load('docs/sql/systeme-flows-backend-verification.sql'));
    await db.exec(await load('supabase/tests/marketing_systeme_flows_backend.sql'));
    console.log('Atomic config/import, stale snapshots, rollback, discovery, tenant isolation and service-only functions: PASS');
  } finally { await db.close(); }

  const regression = new PGlite();
  try {
    await base(regression);
    await regression.exec(await load(flows));
    await regression.exec(await load(backend));
    await regression.exec(await load('supabase/tests/marketing_systeme_atomic_import.sql'));
    console.log('Complete original importer suite AFTER the new backend migration: PASS');
  } finally { await regression.close(); }
}

try { await run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
