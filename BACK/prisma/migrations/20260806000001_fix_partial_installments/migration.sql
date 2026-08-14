-- Fix installments that were marked PARTIAL due to fractional Decimal amounts
-- (e.g. 1221875 / 6 = 203645.8333, paid in full but isPaid check used Math.ceil incorrectly)
--
-- Condition: status is PARTIAL and paid_amount >= amount (fully paid in practice)

UPDATE installments
SET
  status   = 'PAID',
  paid_at  = COALESCE(paid_at, updated_at)
WHERE
  status       = 'PARTIAL'
  AND paid_amount >= amount;
