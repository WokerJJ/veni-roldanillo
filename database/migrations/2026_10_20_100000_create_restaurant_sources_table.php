<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * De dónde vino una ficha importada (#58, ADR 0021). Tabla aparte: las
 * fichas propias no tienen fila aquí y la tabla restaurants no cambia.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_sources', function (Blueprint $table) {
            $table->id();
            // Una ficha viene de una sola fuente; si se borra la ficha, se va su procedencia.
            $table->foreignId('restaurant_id')->unique()->constrained()->cascadeOnDelete();
            // Hoy solo OpenStreetMap; otra fuente exige un ADR y una migración.
            $table->enum('source', ['openstreetmap']);
            // Tipo e id del objeto en la fuente (en OSM: node, way o relation).
            $table->enum('element_type', ['node', 'way', 'relation']);
            $table->bigInteger('element_id');
            // El tipo de local con que vino (amenity=restaurant, shop=bakery…).
            $table->string('element_kind', 40);
            // La última consulta en que el objeto estaba en la fuente.
            $table->timestampTz('fetched_at');
            // Huella de lo que escribió la importación (nombre, punto y
            // categorías): si la ficha ya no coincide, alguien la editó a
            // mano y la importación no la vuelve a tocar.
            $table->char('imported_hash', 64);
            // Desde cuándo el objeto ya no aparece en la fuente (null: sigue).
            $table->timestampTz('missing_since')->nullable();
            // Desde cuándo se descartó (veni:osm-dismiss): la importación ya
            // no la actualiza ni la lista, y la ficha sigue oculta.
            $table->timestampTz('dismissed_at')->nullable();
            $table->timestampsTz();

            // Un mismo objeto de OSM no da dos fichas.
            $table->unique(['source', 'element_type', 'element_id']);
        });

        DB::statement('ALTER TABLE restaurant_sources ADD CONSTRAINT restaurant_sources_element_id_positive CHECK (element_id > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_sources');
    }
};
