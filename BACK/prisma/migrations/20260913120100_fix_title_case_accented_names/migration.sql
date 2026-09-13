-- toTitleCase usaba /\b\w/, que en JavaScript no reconoce letras acentuadas
-- como parte de la palabra: "López" se guardaba "LóPez". initcap() de
-- PostgreSQL (con ctype UTF-8) produce lo mismo que la versión corregida, así
-- que se recalcula solo en los nombres con caracteres no ASCII que difieren.
UPDATE "customers"
SET "first_name" = initcap(lower("first_name")),
    "last_name"  = initcap(lower("last_name"))
WHERE ("first_name" || "last_name") ~ '[^\x01-\x7F]'
  AND ("first_name" <> initcap(lower("first_name"))
    OR "last_name" <> initcap(lower("last_name")));

UPDATE "employees"
SET "first_name" = initcap(lower("first_name")),
    "last_name"  = initcap(lower("last_name"))
WHERE ("first_name" || "last_name") ~ '[^\x01-\x7F]'
  AND ("first_name" <> initcap(lower("first_name"))
    OR "last_name" <> initcap(lower("last_name")));
