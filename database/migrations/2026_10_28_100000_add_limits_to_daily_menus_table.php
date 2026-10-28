<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * «Almuerzos de hoy» (#12, ADR 0028): el almuerzo del día viaja en el GeoJSON
 * del mapa a todos los dispositivos, así que la tabla pone los topes que
 * todavía no pone ningún formulario (el dueño aún no lo publica desde el
 * panel). Una descripción en español con algo escrito y de hasta 300
 * caracteres, la de inglés opcional y con el mismo tope, y un precio de 1 a
 * 1.000.000 pesos (daily_menus_price_non_negative ya pedía >= 0; esta lo
 * precisa y aquella se queda).
 *
 * Los datos de desarrollo se revisaron antes con una consulta de solo
 * lectura: cumplen (descripciones de hasta 69 caracteres, precios de 13.000 a
 * 18.000). Si una base no cumple, ALTER TABLE falla y nombra la restricción:
 * se corrige ese almuerzo a mano, aquí no se recorta ni se borra nada.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE daily_menus ADD CONSTRAINT daily_menus_description_es_length CHECK (char_length(btrim(description_es)) BETWEEN 1 AND 300)');
        DB::statement('ALTER TABLE daily_menus ADD CONSTRAINT daily_menus_description_en_length CHECK (description_en IS NULL OR char_length(description_en) <= 300)');
        DB::statement('ALTER TABLE daily_menus ADD CONSTRAINT daily_menus_price_range CHECK (price BETWEEN 1 AND 1000000)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE daily_menus DROP CONSTRAINT IF EXISTS daily_menus_price_range');
        DB::statement('ALTER TABLE daily_menus DROP CONSTRAINT IF EXISTS daily_menus_description_en_length');
        DB::statement('ALTER TABLE daily_menus DROP CONSTRAINT IF EXISTS daily_menus_description_es_length');
    }
};
