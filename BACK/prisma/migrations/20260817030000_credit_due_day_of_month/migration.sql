-- Día del mes en que vencen todas las cuotas de crédito del tenant (1-28),
-- en vez de calcularse a partir de la fecha de compra de cada cliente.
ALTER TABLE "credit_configs" ADD COLUMN "due_day_of_month" INTEGER NOT NULL DEFAULT 5;
