import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationDirectory = resolve(currentDirectory, "../db/migrations");
const migrationFiles = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
const pool = new Pool({ connectionString });

try {
  for (const file of migrationFiles) {
    const sql = await readFile(resolve(migrationDirectory, file), "utf8");
    await pool.query(sql);
    console.log(`Applied production migration ${file}`);
  }
} finally {
  await pool.end();
}
