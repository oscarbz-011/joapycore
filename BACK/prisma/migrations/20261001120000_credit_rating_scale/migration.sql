ALTER TABLE "credit_configs"
ADD COLUMN "rating_delay_thresholds" INTEGER[] NOT NULL DEFAULT ARRAY[0, 5, 15, 30]::INTEGER[],
ADD COLUMN "uncollectible_after_days" INTEGER;

ALTER TABLE "customers"
ADD COLUMN "uncollectible_at" TIMESTAMP(3),
ADD COLUMN "uncollectible_reason" TEXT;
