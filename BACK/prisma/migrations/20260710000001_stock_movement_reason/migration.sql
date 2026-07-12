DO $$ BEGIN
  CREATE TYPE "MovementReason" AS ENUM (
    'PURCHASE', 'CUSTOMER_RETURN', 'ADJUSTMENT', 'TRANSFER',
    'INITIAL', 'SALE_OUT', 'SALE_REVERSAL'
  );
  EXCEPTION WHEN duplicate_object THEN null;
END; $$;

ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "reason" "MovementReason";
