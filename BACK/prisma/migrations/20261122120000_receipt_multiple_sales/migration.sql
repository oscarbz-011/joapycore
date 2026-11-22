-- Un recibo puede cubrir cuotas de varias ventas del mismo cliente.
ALTER TABLE "payment_receipts" ALTER COLUMN "loan_id" DROP NOT NULL;
