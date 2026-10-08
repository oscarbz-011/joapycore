-- Búsquedas que no distinguen acentos: "benitez" encuentra "Benítez".
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() no es IMMUTABLE (depende del diccionario configurado), y una
-- columna generada solo acepta funciones inmutables. Este envoltorio fija el
-- diccionario, que es lo que la vuelve determinista.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT unaccent('unaccent', $1) $$;

-- Texto de búsqueda de cada cliente y de cada producto, mantenido por la base.
-- Se arma con || y coalesce porque concat_ws tampoco es inmutable.
ALTER TABLE "customers" ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  immutable_unaccent(lower(
    coalesce("first_name", '') || ' ' ||
    coalesce("second_first_name", '') || ' ' ||
    coalesce("last_name", '') || ' ' ||
    coalesce("second_last_name", '') || ' ' ||
    coalesce("document_number", '') || ' ' ||
    coalesce("customer_code", '') || ' ' ||
    coalesce("email", '') || ' ' ||
    coalesce("phone", '')
  ))
) STORED;

ALTER TABLE "products" ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  immutable_unaccent(lower(
    coalesce("name", '') || ' ' || coalesce("model", '')
  ))
) STORED;
