<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * El catálogo del modo Campo (ADR 0052): marca, nombre y presentación no se
 * repiten sin importar mayúsculas ni espacios de más. Los índices de la
 * migración que creó el catálogo comparaban `lower(name_es)` y la presentación
 * tal cual, y dejaban «Cola» y «cola » como dos productos (y dos platos casi
 * iguales en la carta). Ahora el índice es `lower(btrim(...))`, que es lo que
 * compara también el formulario de administración.
 *
 * Antes de cambiarlos se buscan los repetidos: si hay, la migración se detiene
 * y nombra los ids, para resolverlos a mano (aquí no se borra ni se fusiona nada).
 */
return new class extends Migration
{
    public function up(): void
    {
        $items = DB::select("SELECT string_agg(id::text, ', ' ORDER BY id) AS ids FROM catalog_items GROUP BY group_id, coalesce(lower(btrim(brand)), ''), lower(btrim(name_es)) HAVING count(*) > 1");
        $variants = DB::select("SELECT string_agg(id::text, ', ' ORDER BY id) AS ids FROM catalog_variants GROUP BY item_id, lower(btrim(label)) HAVING count(*) > 1");

        if ($items !== [] || $variants !== []) {
            throw new RuntimeException(sprintf(
                'Hay productos o presentaciones del catálogo repetidos sin contar mayúsculas ni espacios (productos, ids: %s; presentaciones, ids: %s). Resolvelos a mano antes de migrar.',
                self::ids($items) ?: 'ninguno',
                self::ids($variants) ?: 'ninguna',
            ));
        }

        DB::statement('DROP INDEX catalog_items_unique_name');
        DB::statement("CREATE UNIQUE INDEX catalog_items_unique_name ON catalog_items (group_id, coalesce(lower(btrim(brand)), ''), lower(btrim(name_es)))");

        DB::statement('ALTER TABLE catalog_variants DROP CONSTRAINT catalog_variants_item_id_label_unique');
        DB::statement('CREATE UNIQUE INDEX catalog_variants_unique_label ON catalog_variants (item_id, lower(btrim(label)))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX catalog_variants_unique_label');
        DB::statement('ALTER TABLE catalog_variants ADD CONSTRAINT catalog_variants_item_id_label_unique UNIQUE (item_id, label)');

        DB::statement('DROP INDEX catalog_items_unique_name');
        DB::statement("CREATE UNIQUE INDEX catalog_items_unique_name ON catalog_items (group_id, coalesce(brand, ''), lower(name_es))");
    }

    /** @param  array<mixed>  $rows */
    private static function ids(array $rows): string
    {
        return collect($rows)
            ->map(fn (mixed $row): string => is_object($row) && isset($row->ids) && is_string($row->ids) ? $row->ids : '')
            ->implode('; ');
    }
};
