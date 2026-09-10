-- AlterEnum: motivos de movimiento de stock generados por producción
ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'PRODUCTION_IN';
ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'PRODUCTION_OUT';
