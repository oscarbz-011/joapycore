-- AddForeignKey
ALTER TABLE "delinquency_reports" ADD CONSTRAINT "delinquency_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

