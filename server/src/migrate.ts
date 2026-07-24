import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(currentDirectory, "../db/migrations/001_production_p0.sql");
const sql = await readFile(migrationPath, "utf8");
const pool = new Pool({ connectionString });

try {
  await pool.query(sql);
  console.log("Applied production migration 001_production_p0.sql");
} finally {
  await pool.end();
}
