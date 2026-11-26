-- La unidad pasa de texto libre al código de la tabla de unidades de medida de
-- SIFEN. Los textos conocidos se traducen; cualquier otro queda como unidad (77).
CREATE FUNCTION pg_temp.sifen_unit_code(text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(trim($1))
    WHEN 'kg' THEN 83 WHEN 'kilo' THEN 83 WHEN 'kilos' THEN 83
    WHEN 'kilogramo' THEN 83 WHEN 'kilogramos' THEN 83
    WHEN 'g' THEN 86 WHEN 'gr' THEN 86 WHEN 'gramo' THEN 86 WHEN 'gramos' THEN 86
    WHEN 'm' THEN 87 WHEN 'mt' THEN 87 WHEN 'mts' THEN 87
    WHEN 'metro' THEN 87 WHEN 'metros' THEN 87
    WHEN 'metro lineal' THEN 660 WHEN 'metros lineales' THEN 660
    WHEN 'm2' THEN 109 WHEN 'm²' THEN 109
    WHEN 'metro cuadrado' THEN 109 WHEN 'metros cuadrados' THEN 109
    WHEN 'm3' THEN 110 WHEN 'm³' THEN 110
    WHEN 'cm' THEN 91
    WHEN 'l' THEN 89 WHEN 'lt' THEN 89 WHEN 'lts' THEN 89
    WHEN 'litro' THEN 89 WHEN 'litros' THEN 89
    WHEN 'caja' THEN 131 WHEN 'cajas' THEN 131
    WHEN 'par' THEN 121 WHEN 'pares' THEN 121
    WHEN 'docena' THEN 113 WHEN 'docenas' THEN 113
    WHEN 'paquete' THEN 133 WHEN 'paquetes' THEN 133
    WHEN 'rollo' THEN 127 WHEN 'rollos' THEN 127
    WHEN 'pieza' THEN 124 WHEN 'piezas' THEN 124
    WHEN 'juego' THEN 132 WHEN 'juegos' THEN 132
    WHEN 'bolsa' THEN 134 WHEN 'bolsas' THEN 134
    WHEN 'kit' THEN 117 WHEN 'kits' THEN 117
    WHEN 'hora' THEN 100 WHEN 'horas' THEN 100
    ELSE 77
  END
$$;

ALTER TABLE "products" ADD COLUMN "unit_code" INTEGER NOT NULL DEFAULT 77;
UPDATE "products" SET "unit_code" = pg_temp.sifen_unit_code("unit");
ALTER TABLE "products" DROP COLUMN "unit";

ALTER TABLE "remission_note_items" ADD COLUMN "unit_code" INTEGER;
UPDATE "remission_note_items" SET "unit_code" = pg_temp.sifen_unit_code("unit");
ALTER TABLE "remission_note_items" ALTER COLUMN "unit_code" SET NOT NULL;
ALTER TABLE "remission_note_items" DROP COLUMN "unit";
