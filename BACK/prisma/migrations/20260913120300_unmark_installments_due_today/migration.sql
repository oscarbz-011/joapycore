-- El cron marcaba OVERDUE las cuotas desde las 00:00 del mismo día en que
-- vencen. Las que al aplicar esta migración todavía no pasaron su día de
-- vencimiento (hora de Paraguay) vuelven a su estado real. due_date guarda el
-- día de calendario a medianoche UTC, por eso se compara contra la fecha local.
UPDATE "installments"
SET "status" = CASE WHEN "paid_amount" > 0 THEN 'PARTIAL'::"InstallmentStatus" ELSE 'PENDING'::"InstallmentStatus" END
WHERE "status" = 'OVERDUE'
  AND "due_date" >= (now() AT TIME ZONE 'America/Asuncion')::date;
