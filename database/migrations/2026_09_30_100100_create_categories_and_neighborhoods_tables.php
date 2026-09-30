<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tipo de comida (filtro «tipo de comida» del inicio).
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 60)->unique();
            $table->string('name_es', 80);
            $table->string('name_en', 80)->nullable();
            $table->smallInteger('position')->default(0);
            $table->timestampsTz();
        });

        // Barrios de Roldanillo: definen el costo de domicilio por zona.
        Schema::create('neighborhoods', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80)->unique();
            $table->string('slug', 80)->unique();
            // Contorno opcional del barrio (para ubicar zonas en el mapa).
            $table->geography('area', 'multipolygon', 4326)->nullable();
            $table->boolean('is_fictitious')->default(false);
            $table->timestampsTz();

            $table->spatialIndex('area');
        });

        DB::statement("ALTER TABLE categories ADD CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')");
        DB::statement("ALTER TABLE neighborhoods ADD CONSTRAINT neighborhoods_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')");
    }

    public function down(): void
    {
        Schema::dropIfExists('neighborhoods');
        Schema::dropIfExists('categories');
    }
};
