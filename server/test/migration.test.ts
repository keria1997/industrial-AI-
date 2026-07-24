import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Production PostgreSQL migration", () => {
  it("applies atomically and creates the P0 schema without P1 placeholder tables", async () => {
    const database = new PGlite();
    try {
      const sql = await readFile(resolve("server/db/migrations/001_production_p0.sql"), "utf8");
      await database.exec(sql);
      const result = await database.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE tablename LIKE 'prod_%' ORDER BY tablename");
      const tables = result.rows.map((row) => row.tablename);
      expect(tables).toHaveLength(48);
      expect(tables).toEqual(expect.arrayContaining([
        "prod_demand", "prod_mrp_run", "prod_schedule_run", "prod_work_order", "prod_work_report",
        "prod_inspection", "prod_completion", "prod_completion_serial", "prod_work_order_close",
        "prod_status_history", "prod_event_inbox", "prod_event_outbox", "prod_idempotency_record",
      ]));
      expect(tables.some((table) => /equipment|cost|outsourc|wip|logistics/.test(table))).toBe(false);
    } finally {
      await database.close();
    }
  });
});
