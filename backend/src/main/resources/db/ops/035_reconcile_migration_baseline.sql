-- One-time operation: replace placeholder migration rows with the reviewed
-- 001-034 baseline. Run inside a transaction only after a database backup and
-- a clean replay/schema comparison. Runtime migrations are not executed here.

DO $$
DECLARE
  placeholder_count integer;
  business_name_count integer;
BEGIN
  SELECT count(*) INTO placeholder_count
  FROM public.schema_migrations
  WHERE filename ~ '^[0-9]{3}_migration$' AND checksum = 'registered';

  SELECT count(*) INTO business_name_count
  FROM public.schema_migrations
  WHERE filename ~ '^0[0-9]{2}_.*\.sql$' AND filename <> '000_migration';

  IF placeholder_count <> 37 OR business_name_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected migration ledger: % placeholders, % business rows',
      placeholder_count, business_name_count;
  END IF;

  IF to_regclass('public.prod_bom') IS NULL
      OR to_regclass('public.sales_order') IS NULL
      OR to_regclass('public.module_document') IS NULL
      OR to_regclass('public.registered_users') IS NULL
      OR to_regclass('public.fin_receivable') IS NULL THEN
    RAISE EXCEPTION 'Legacy schema sentinels are missing; baseline cannot be recorded';
  END IF;
END
$$;

DELETE FROM public.schema_migrations
WHERE filename ~ '^[0-9]{3}_migration$' AND checksum = 'registered';

INSERT INTO public.schema_migrations (filename, checksum) VALUES
  ('001_production_p0.sql', '9e268cc0e2e0137e868e1bdd6d32e326aeb0f4dc0601efe5638520c24d1c1198'),
  ('002_sales_production_link.sql', '807ff44d0b7b9cba24fcb846e664ebebc5c17849441c98c57a343cb59f64d2b6'),
  ('003_shared_fulfillment_infrastructure.sql', '0afbba2c0669a01e53d372517645190f12a5d0f4066163ea36389c1010bf7abb'),
  ('004_sales_fulfillment.sql', 'c5d53bca20ea8f2065b4c710af9150c0a033d0e5408a2b90beebfc49ab82516e'),
  ('005_inventory_fulfillment.sql', 'dda9b142ce98f8a03091177c18df273d6c30858dbe489c7ab95b8aff570248ff'),
  ('006_production_fulfillment_link.sql', '0997d2524e13c3178a3f55bae967dd06ff1b30c1e4a32f8f469265d6d4da9ee1'),
  ('007_procurement_material_fulfillment.sql', 'ecb3e52155a322d53805e2f6225e7d02cc224a57f202d45fcc21355997aa52ca'),
  ('008_platform_iam.sql', 'd6e9dfc48786d830be90e7cb49a7c04306522de87dcf51eecb988eea4298987d'),
  ('009_finance_settlement.sql', '6b61e2022607a47a9d9dfdd101753aef0519d52cdcb8f3f02777b9608a0f2259'),
  ('010_procurement_completion.sql', 'ec0686c30078501ef80e4cd0830a7be0ca096c4e8f4fbcbe06bda0d24aaa79d7'),
  ('011_inventory_completion.sql', 'e325bc82cf7c715c08297a5704e14a6cff5387a884dcb8b57c8fea7fc6b64d5f'),
  ('012_message_center.sql', '69f3a3ff00278de12e70c4e5c049a73e66a160f561e308c0cad3578df22e7023'),
  ('013_ai_intelligence.sql', 'c4595b7900b151a0d23a3b118d9d35ee8036f6dcc89d056781ab2b5f3d939af0'),
  ('014_personnel_supply_chain.sql', '49fc54a8a7c34efaef894dc3529ec69ec01267367aaa0c917572d571b146e5c0'),
  ('015_auth_users.sql', 'fc460b1b7525305e267547c38d00d57bb562aff7292b98e0b655d77dd212fd62'),
  ('016_tenant_employee_accounts.sql', '33954f4736ce71a8cd42c4b2b8be388cee11aa9437dee7ca702a453289c9f030'),
  ('017_module_business_persistence.sql', 'ef5d256434b4ae88491875af09cb9a237feb4ecef663fb12d586f0f752412940'),
  ('018_worker_tenant_discovery.sql', '42db5ca6a8f647d114752318c6564329cb5fd08baefd62ae7747a50eff72c059'),
  ('019_production_demand_routing.sql', 'af1ec4723a0e0ac43db93fa3ce062db990a5ac8a2f160d84f151d1be399bd1f1'),
  ('020_production_permission_catalog_upgrade.sql', '4816498a8c5ea4546144286e3747379e03292c43dccdf4d82520c433461f100e'),
  ('021_java_bootstrap_read_policy.sql', 'e70d8d71b9d77a465b15c36f9374faff05fb9663869d06e9f8afa2e209e3887a'),
  ('022_business_seed.sql', '73f50b3c59454f64c2943f9cf86d2d0cd64346d4f9ae1059cbedd05d782cb029'),
  ('023_business_seed_json_shapes.sql', 'dc3e5abc69bd644c4aa0be38e88a13913a19d060b5707c74b0eb68a56d6fabb3'),
  ('024_fulfillment_seed_order_shape.sql', 'be85edc09d98e2b30a7732ea5817a0b60709812e862af1027d75e937de875c3b'),
  ('025_repair_shipment_seed.sql', 'ea3d633f2cc5801a1123163e154abf83304e18aadd215ce9d310b858c8b18c74'),
  ('026_inventory_master_prices.sql', '9cd8acb66e2cdb9ce831c803677b64a005c0aab702fbdc26500ee87859bc51b3'),
  ('027_backfill_inventory_master_prices.sql', 'cecebebd391c964e6629862460e9153cea8b5a90e08458f84d481e7590dfd00d'),
  ('028_inventory_fact_components.sql', '93ec4f3f696a85604ae71b69ab95aa1024db57930b13a2c3dcaaba691ac371c1'),
  ('029_production_execution.sql', 'af5afb958a5c9e682e1de4dd00f79a4dea3d5c9b5184d49a4f0580e72e8453a1'),
  ('030_mps_menu_permission.sql', '0899d7e102746db628839b1f956019873a2467159b75532fa6d46533fc260a44'),
  ('031_archive_orphan_production_seeds.sql', 'a7b4a95381db583e5a25da2716dff32ea1e07622b119298bcf34690014e1414b'),
  ('032_auth_session_security.sql', '21b2faeb584e572e76a8890053ff77f92f0dd6ae64c7101bfd54e22c62b57a17'),
  ('033_production_read_permissions.sql', 'd471465ecbea29f52d0603c8db82a3bc7d428c5242dad50eac165eeafce32d26'),
  ('034_inventory_import_permission.sql', '27dbba1a3dc4a3fbd1aacb1f02126b06053b35831560e65549ad41053dae86dc');
