import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Minimal Supabase auth scaffolding in an isolated, in-memory PostgreSQL instance.
const database = new PGlite();
try {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  await database.exec(await readFile('supabase/migrations/202611120001_user_sync.sql', 'utf8'));
  await database.exec(await readFile('supabase/tests/user_isolation.sql', 'utf8'));
  console.log('PostgreSQL migration and two-account RLS/idempotency/payload tests passed (local PGlite).');
} finally { await database.close(); }
