-- Add reference prices to inventory master data.
ALTER TABLE inv_product
  ADD COLUMN IF NOT EXISTS unit_price numeric(18,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT inv_product_unit_price_check CHECK (unit_price >= 0);

ALTER TABLE inv_material
  ADD COLUMN IF NOT EXISTS unit_price numeric(18,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT inv_material_unit_price_check CHECK (unit_price >= 0);
