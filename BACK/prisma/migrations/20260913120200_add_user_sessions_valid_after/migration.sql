-- Corte de sesiones: los tokens emitidos antes de esta fecha se rechazan.
ALTER TABLE "users" ADD COLUMN "sessions_valid_after" TIMESTAMP(3);
