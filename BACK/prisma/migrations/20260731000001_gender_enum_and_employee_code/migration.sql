-- AlterEnum: MALE/FEMALE/OTHER → MASCULINO/FEMENINO
-- Postgres does not support renaming enum values directly.
-- We create a new type, migrate the column, then swap the names.

BEGIN;

CREATE TYPE "Gender_new" AS ENUM ('MASCULINO', 'FEMENINO');

ALTER TABLE "employees"
  ALTER COLUMN "gender" TYPE "Gender_new"
  USING (
    CASE "gender"::text
      WHEN 'MALE'   THEN 'MASCULINO'::"Gender_new"
      WHEN 'FEMALE' THEN 'FEMENINO'::"Gender_new"
      ELSE NULL
    END
  );

ALTER TYPE "Gender" RENAME TO "Gender_old";
ALTER TYPE "Gender_new" RENAME TO "Gender";
DROP TYPE "Gender_old";

COMMIT;

-- AddColumn: employee_code
ALTER TABLE "employees" ADD COLUMN "employee_code" TEXT;
