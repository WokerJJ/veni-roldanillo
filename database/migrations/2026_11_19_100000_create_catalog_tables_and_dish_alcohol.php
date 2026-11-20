<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El catálogo del modo Campo, etapa 2 (ADR 0049): grupos, productos y
 * presentaciones que administración mantiene y que viajan a /campo para
 * armar la carta de un local sin teclear cada bebida. Solo texto: ninguna
 * columna guarda logos ni imágenes de marcas. Además, la marca de «bebida
 * alcohólica» por plato, que muestran la ficha, el carrito y el pedido.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_groups', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 60)->unique();
            $table->string('name_es', 80);
            $table->string('name_en', 80)->nullable();
            // La sección del menú que crea este grupo («Bebidas», «Jugos naturales»…).
            $table->string('section_name_es', 80);
            $table->string('section_name_en', 80)->nullable();
            // Valor de partida de sus productos: cerveza y licores.
            $table->boolean('is_alcohol')->default(false);
            $table->boolean('active')->default(true);
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();
        });

        Schema::create('catalog_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('catalog_groups')->cascadeOnDelete();
            // Solo el nombre de la marca, como texto («Postobón»).
            $table->string('brand', 60)->nullable();
            $table->string('name_es', 100);
            $table->string('name_en', 100)->nullable();
            $table->boolean('is_alcohol')->default(false);
            $table->boolean('active')->default(true);
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();

            $table->index(['group_id', 'position']);
        });

        Schema::create('catalog_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('catalog_items')->cascadeOnDelete();
            // La presentación: «400 ml», «1,5 L», «Vaso», «Jarra».
            $table->string('label', 40);
            $table->boolean('active')->default(true);
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();

            $table->unique(['item_id', 'label']);
        });

        DB::statement("ALTER TABLE catalog_groups ADD CONSTRAINT catalog_groups_names_not_blank CHECK (btrim(name_es) <> '' AND btrim(section_name_es) <> '')");
        DB::statement("ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_name_not_blank CHECK (btrim(name_es) <> '')");
        DB::statement("ALTER TABLE catalog_variants ADD CONSTRAINT catalog_variants_label_not_blank CHECK (btrim(label) <> '')");
        // Un producto sin marca ni presentaciones también vale («Jugo de mora»), pero no dos iguales.
        DB::statement("CREATE UNIQUE INDEX catalog_items_unique_name ON catalog_items (group_id, coalesce(brand, ''), lower(name_es))");

        Schema::table('dishes', function (Blueprint $table) {
            $table->boolean('is_alcohol')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('dishes', function (Blueprint $table) {
            $table->dropColumn('is_alcohol');
        });

        Schema::dropIfExists('catalog_variants');
        Schema::dropIfExists('catalog_items');
        Schema::dropIfExists('catalog_groups');
    }
};
