-- Las contraseñas temporales guardadas hasta acá se cifraron con una clave fija
-- escrita en el código ('dev-fallback-secret'), así que cualquiera con acceso a
-- la base podía descifrarlas. Se borran: el usuario sigue pudiendo entrar con
-- esa contraseña (el hash de login es otra columna) y el administrador puede
-- regenerar una nueva, que ya se cifra con TEMP_PASSWORD_KEY.
UPDATE "users"
SET "temp_password_encrypted" = NULL
WHERE "temp_password_encrypted" IS NOT NULL;
