-- Sueldos y montos de nómina pasan de entero a DECIMAL(23,8); el entero se convierte sin pérdida.

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "base_salary" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payroll_config" ALTER COLUMN "minimum_wage" SET DATA TYPE DECIMAL(23,8);

-- AlterTable
ALTER TABLE "payroll_record_items" ALTER COLUMN "base_salary" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "bonuses" SET DEFAULT 0,
ALTER COLUMN "bonuses" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "deductions" SET DEFAULT 0,
ALTER COLUMN "deductions" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "ips_employee" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "ips_employer" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "irp" SET DEFAULT 0,
ALTER COLUMN "irp" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "aguinaldo" SET DEFAULT 0,
ALTER COLUMN "aguinaldo" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "gross_salary" SET DATA TYPE DECIMAL(23,8),
ALTER COLUMN "net_salary" SET DATA TYPE DECIMAL(23,8);
