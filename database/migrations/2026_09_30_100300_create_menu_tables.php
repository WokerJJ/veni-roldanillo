<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Menú: secciones → platos → grupos de opciones → opciones.
| Precios en pesos colombianos enteros (sin decimales).
| Un grupo con required = true es una opción obligatoria (p. ej. la proteína,
| min 1 / max 1); uno opcional con price_delta > 0 son las adiciones.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('name_es', 80);
            $table->string('name_en', 80)->nullable();
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();

            $table->index(['restaurant_id', 'position']);
            // Destino de la FK compuesta de dishes.
            $table->unique(['id', 'restaurant_id']);
        });

        Schema::create('dishes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('menu_section_id');
            $table->string('name_es', 120);
            $table->string('name_en', 120)->nullable();
            $table->text('description_es')->nullable();
            $table->text('description_en')->nullable();
            $table->integer('price');
            $table->string('photo_path')->nullable();
            $table->jsonb('tags')->default('[]');
            $table->boolean('available')->default(true);
            // «Agotado hoy»: vuelve a estar disponible después de esta fecha.
            $table->date('sold_out_until')->nullable();
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();

            // FK compuesta: la sección tiene que ser del mismo restaurante.
            // NO ACTION (y no RESTRICT) para que el borrado en cascada de un
            // restaurante pueda llevarse secciones y platos en la misma orden.
            $table->foreign(['menu_section_id', 'restaurant_id'])
                ->references(['id', 'restaurant_id'])->on('menu_sections')
                ->noActionOnDelete();

            $table->index(['menu_section_id', 'position']);
            $table->index(['restaurant_id', 'available']);
        });

        DB::statement('ALTER TABLE dishes ADD CONSTRAINT dishes_price_non_negative CHECK (price >= 0)');
        DB::statement("ALTER TABLE dishes ADD CONSTRAINT dishes_tags_array CHECK (jsonb_typeof(tags) = 'array')");

        Schema::create('option_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dish_id')->constrained()->cascadeOnDelete();
            $table->string('name_es', 80);
            $table->string('name_en', 80)->nullable();
            $table->boolean('required')->default(false);
            $table->smallInteger('min_choices')->default(0);
            $table->smallInteger('max_choices')->default(1);
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();

            $table->index(['dish_id', 'position']);
        });

        // Obligatorio si y solo si exige al menos una elección.
        DB::statement('ALTER TABLE option_groups ADD CONSTRAINT option_groups_choices_range CHECK (
            min_choices >= 0 AND max_choices >= 1 AND max_choices >= min_choices
            AND required = (min_choices >= 1)
        )');

        Schema::create('options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('option_group_id')->constrained()->cascadeOnDelete();
            $table->string('name_es', 80);
            $table->string('name_en', 80)->nullable();
            $table->integer('price_delta')->default(0);
            $table->boolean('available')->default(true);
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();

            $table->index(['option_group_id', 'position']);
        });

        DB::statement('ALTER TABLE options ADD CONSTRAINT options_price_delta_non_negative CHECK (price_delta >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('options');
        Schema::dropIfExists('option_groups');
        Schema::dropIfExists('dishes');
        Schema::dropIfExists('menu_sections');
    }
};
