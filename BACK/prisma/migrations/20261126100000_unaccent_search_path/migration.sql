-- pg_restore crea las columnas generadas con search_path vacío: sin el esquema
-- explícito no encuentra unaccent y no recrea clientes ni productos. El
-- resultado no cambia, así que search_text no se recalcula.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
