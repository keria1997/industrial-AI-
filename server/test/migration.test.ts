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

  it("adds the sales intake and inventory fact projection with tenant isolation", async () => {
    const database = new PGlite();
    try {
      const baseline = await readFile(resolve("server/db/migrations/001_production_p0.sql"), "utf8");
      const link = await readFile(resolve("server/db/migrations/002_sales_production_link.sql"), "utf8");
      await database.exec(baseline);
      await database.exec(link);
      const tables = await database.query<{ tablename: string; rowsecurity: boolean }>(
        "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('prod_inventory_availability','prod_sales_order_intake') ORDER BY tablename",
      );
      expect(tables.rows).toEqual([
        { tablename: "prod_inventory_availability", rowsecurity: true },
        { tablename: "prod_sales_order_intake", rowsecurity: true },
      ]);
      const foreignKey = await database.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='prod_sales_order_intake'::regclass AND contype='f'",
      );
      expect(foreignKey.rows[0].count).toBe(1);
    } finally {
      await database.close();
    }
  });

  it("creates the fulfillment schema with forced tenant isolation and composite tenant foreign keys", async () => {
    const database = new PGlite();
    try {
      for (const file of [
        "001_production_p0.sql",
        "002_sales_production_link.sql",
        "003_shared_fulfillment_infrastructure.sql",
        "004_sales_fulfillment.sql",
        "005_inventory_fulfillment.sql",
        "006_production_fulfillment_link.sql",
        "007_procurement_material_fulfillment.sql",
      ]) {
        await database.exec(await readFile(resolve("server/db/migrations", file), "utf8"));
      }
      const expected = [
        "fulfill_event_inbox", "fulfill_event_outbox", "sales_order", "sales_order_line",
        "sales_shipment_request", "inv_availability_projection", "inv_shipment_task",
        "inv_reservation", "inv_sales_outbound", "inv_transaction",
        "proc_purchase_request", "proc_purchase_order", "proc_purchase_receipt",
      ];
      const tables = await database.query<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }>(
        `SELECT t.tablename, t.rowsecurity, c.relforcerowsecurity AS forcerowsecurity
         FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
         WHERE t.tablename = ANY($1::text[]) ORDER BY t.tablename`,
        [expected],
      );
      expect(tables.rows).toHaveLength(expected.length);
      expect(tables.rows.every((table) => table.rowsecurity && table.forcerowsecurity)).toBe(true);
      const tenantForeignKeys = await database.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM pg_constraint
         WHERE contype='f' AND conrelid IN (
           'sales_order_line'::regclass, 'sales_shipment_request'::regclass,
           'inv_shipment_task_line'::regclass, 'inv_reservation_line'::regclass,
           'inv_sales_outbound_line'::regclass
         ) AND array_length(conkey, 1) = 2`,
      );
      expect(tenantForeignKeys.rows[0].count).toBeGreaterThanOrEqual(7);
    } finally {
      await database.close();
    }
  });
});
