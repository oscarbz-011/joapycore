-- El umbral de "meses de mora" pasa a expresarse en días (el usuario lo
-- pidió más granular que un múltiplo fijo de 30 días). Se renombran las
-- columnas y se multiplican por 30 los valores ya cargados, para que un
-- tenant que tenía "3 meses" configurados siga significando "90 días", no
-- "3 días" tras el rename.
ALTER TABLE "credit_configs" RENAME COLUMN "delinquency_threshold_months" TO "delinquency_threshold_days";
UPDATE "credit_configs" SET "delinquency_threshold_days" = "delinquency_threshold_days" * 30 WHERE "delinquency_threshold_days" IS NOT NULL;

ALTER TABLE "delinquency_reports" RENAME COLUMN "months_overdue" TO "days_overdue";
UPDATE "delinquency_reports" SET "days_overdue" = "days_overdue" * 30;

-- Amplía la precisión de interest_components.percentage de Decimal(5,2) a
-- Decimal(7,4): permite tasas menores a 1% (ej. mora diaria de 0,001%) sin
-- redondearlas a 0.
ALTER TABLE "interest_components" ALTER COLUMN "percentage" TYPE DECIMAL(7,4);
