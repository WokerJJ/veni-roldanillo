<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
| Las columnas de las imágenes solo guardan una clave de su tipo (#113, ADR
| 0034, AUD-020): `media/<tipo>/<20 hex>`, la que arma MediaStore::store y
| revisa MediaStore::isKey. Una ruta cualquiera escrita por otro camino (una
| consola, un seeder) no llega a la ficha.
|
| NOT VALID y VALIDATE en sentencias y transacciones separadas: agregar la
| restricción toma un bloqueo exclusivo solo un instante, sin recorrer la
| tabla; validarla después la recorre con un bloqueo que deja leer y
| escribir. Por eso la migración no corre dentro de una transacción.
*/
return new class extends Migration
{
    public $withinTransaction = false;

    /** @var array<string, array{string, string}> */
    private const array CHECKS = [
        'dishes_photo_path_key' => ['dishes', "photo_path ~ '^media/dishes/[0-9a-f]{20}$'"],
        'promotions_image_path_key' => ['promotions', "image_path ~ '^media/promotions/[0-9a-f]{20}$'"],
    ];

    public function up(): void
    {
        foreach (self::CHECKS as $name => [$table, $condition]) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$condition}) NOT VALID");
            DB::statement("ALTER TABLE {$table} VALIDATE CONSTRAINT {$name}");
        }
    }

    public function down(): void
    {
        foreach (self::CHECKS as $name => [$table]) {
            DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$name}");
        }
    }
};
