ALTER TABLE "products"
ADD COLUMN "sales_channels" "OrderChannel"[] NOT NULL DEFAULT ARRAY[]::"OrderChannel"[];

UPDATE "products"
SET "sales_channels" = ARRAY['NORMAL'::"OrderChannel"]
WHERE "is_sellable" = true;
