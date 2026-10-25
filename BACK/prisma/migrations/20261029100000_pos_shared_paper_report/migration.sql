-- Varias cajas pueden usar el mismo papel y el mismo informe del proveedor.
DROP INDEX IF EXISTS "pos_terminals_thermal_paper_report_file_id_key";
CREATE INDEX "pos_terminals_thermal_paper_report_file_id_idx" ON "pos_terminals"("thermal_paper_report_file_id");
