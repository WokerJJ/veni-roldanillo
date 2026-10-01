<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Costo de domicilio de cada restaurante por barrio.
        Schema::create('delivery_zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            // Restrict: un barrio con zonas de domicilio no se borra sin revisarlas.
            $table->foreignId('neighborhood_id')->constrained()->restrictOnDelete();
            $table->integer('fee');
            $table->timestampsTz();

            $table->unique(['restaurant_id', 'neighborhood_id']);
            // Búsqueda «quién lleva a mi barrio».
            $table->index('neighborhood_id');
        });

        DB::statement('ALTER TABLE delivery_zones ADD CONSTRAINT delivery_zones_fee_non_negative CHECK (fee >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_zones');
    }
};
