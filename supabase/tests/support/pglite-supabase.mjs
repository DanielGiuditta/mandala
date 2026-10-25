// Applies every migration in supabase/migrations to an in-memory PGlite
// database with a minimal Supabase-like setup (anon/authenticated/service_role
// roles, default grants and auth.jwt()), so tests exercise the real policies
// and functions as an authenticated user rather than as a superuser.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

export async function createSupabaseLikeDatabase() {
  const db = new PGlite();

  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema extensions;
    create schema auth;
    create schema storage;
    create function extensions.gen_random_uuid() returns uuid language sql volatile
      as $$ select pg_catalog.gen_random_uuid() $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create table storage.buckets(id text primary key, name text, public boolean);
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    grant execute on all functions in schema auth, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);

  const files = (await readdir(MIGRATIONS)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = (await readFile(new URL(file, MIGRATIONS), "utf8")).replace(
      /create extension if not exists pgcrypto with schema extensions;/,
      "",
    );

    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }

  return db;
}

// Runs `fn(tx)` the way PostgREST runs a request for a signed-in user.
export function asUser(db, email, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ email, role: "authenticated" }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}
