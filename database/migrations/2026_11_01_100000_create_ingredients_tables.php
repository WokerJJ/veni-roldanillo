<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ingredientes agotados hoy con reemplazo (#112, ADR 0033).
 *
 * - `ingredients`: la lista común de cada restaurante, con «agotado hoy»
 *   (`sold_out_until`, el día de Colombia, como los platos) y un reemplazo
 *   por defecto del mismo restaurante con su recargo.
 * - `dish_ingredient`: qué ingredientes lleva cada plato y si es esencial.
 *   Lleva `restaurant_id` para que las dos FK compuestas obliguen a que plato
 *   e ingrediente sean del mismo restaurante (como los platos y sus
 *   secciones, ADR 0009).
 * - `options.ingredient_id`: una opción de quitar o una adición puede ser un
 *   ingrediente. `options` no tiene `restaurant_id` (cuelga de su grupo y su
 *   plato), así que «del mismo restaurante» lo comprueba un disparador.
 *
 * Solo hacia adelante en producción; down() existe para el entorno local.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('name_es', 80);
            $table->string('name_en', 80)->nullable();
            // «Agotado hoy»: no hay hasta esta fecha, incluida (hora de Colombia).
            $table->date('sold_out_until')->nullable();
            $table->unsignedBigInteger('substitute_ingredient_id')->nullable();
            $table->integer('substitute_price_delta')->default(0);
            $table->timestampsTz();

            // Destino de las FK compuestas (reemplazo y dish_ingredient).
            $table->unique(['id', 'restaurant_id']);
            $table->index('substitute_ingredient_id');
        });

        // El reemplazo es del mismo restaurante. Si se borra, el ingrediente
        // queda sin reemplazo: SET NULL solo de esa columna (PostgreSQL 15+),
        // porque restaurant_id no puede quedar en null.
        DB::statement('ALTER TABLE ingredients ADD CONSTRAINT ingredients_substitute_same_restaurant
            FOREIGN KEY (substitute_ingredient_id, restaurant_id) REFERENCES ingredients (id, restaurant_id)
            ON DELETE SET NULL (substitute_ingredient_id)');
        DB::statement('ALTER TABLE ingredients ADD CONSTRAINT ingredients_substitute_valid CHECK (
            (substitute_ingredient_id IS NULL OR substitute_ingredient_id <> id)
            AND substitute_price_delta >= 0 AND substitute_price_delta <= 100000
        )');
        // Dos «Tomate» en la misma lista confundirían al dueño y al cliente.
        DB::statement('CREATE UNIQUE INDEX ingredients_restaurant_name_unique ON ingredients (restaurant_id, lower(name_es))');

        DB::statement('ALTER TABLE dishes ADD CONSTRAINT dishes_id_restaurant_id_unique UNIQUE (id, restaurant_id)');

        Schema::create('dish_ingredient', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('restaurant_id');
            $table->unsignedBigInteger('dish_id');
            $table->unsignedBigInteger('ingredient_id');
            // Sin él no se hace el plato: si se agota, el plato no se puede pedir hoy.
            $table->boolean('essential')->default(false);
            $table->timestampsTz();

            $table->foreign(['dish_id', 'restaurant_id'])
                ->references(['id', 'restaurant_id'])->on('dishes')
                ->cascadeOnDelete();
            $table->foreign(['ingredient_id', 'restaurant_id'])
                ->references(['id', 'restaurant_id'])->on('ingredients')
                ->cascadeOnDelete();

            $table->unique(['dish_id', 'ingredient_id']);
            $table->index('ingredient_id');
        });

        Schema::table('options', function (Blueprint $table) {
            $table->foreignId('ingredient_id')->nullable()->after('option_group_id')
                ->constrained('ingredients')->nullOnDelete();
        });

        // OR REPLACE: migrate:fresh borra las tablas, no las funciones.
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION options_ingredient_same_restaurant() RETURNS trigger AS $$
            BEGIN
                IF NEW.ingredient_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1
                    FROM option_groups g
                    JOIN dishes d ON d.id = g.dish_id
                    JOIN ingredients i ON i.restaurant_id = d.restaurant_id
                    WHERE g.id = NEW.option_group_id AND i.id = NEW.ingredient_id
                ) THEN
                    RAISE EXCEPTION 'options.ingredient_id es de otro restaurante'
                        USING ERRCODE = '23514', CONSTRAINT = 'options_ingredient_same_restaurant';
                END IF;

                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER options_ingredient_same_restaurant
                BEFORE INSERT OR UPDATE OF ingredient_id, option_group_id ON options
                FOR EACH ROW EXECUTE FUNCTION options_ingredient_same_restaurant();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS options_ingredient_same_restaurant ON options; DROP FUNCTION IF EXISTS options_ingredient_same_restaurant();');

        Schema::table('options', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ingredient_id');
        });

        Schema::dropIfExists('dish_ingredient');
        DB::statement('ALTER TABLE dishes DROP CONSTRAINT dishes_id_restaurant_id_unique');
        Schema::dropIfExists('ingredients');
    }
};
