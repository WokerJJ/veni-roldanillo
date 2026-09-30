<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // «Almuerzos de hoy»: un menú del día por restaurante y fecha.
        Schema::create('daily_menus', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->date('served_on');
            $table->text('description_es');
            $table->text('description_en')->nullable();
            $table->integer('price');
            $table->timestampsTz();

            $table->unique(['restaurant_id', 'served_on']);
            // Consulta del inicio: todos los almuerzos de una fecha.
            $table->index('served_on');
        });

        DB::statement('ALTER TABLE daily_menus ADD CONSTRAINT daily_menus_price_non_negative CHECK (price >= 0)');

        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->string('title_es', 120);
            $table->string('title_en', 120)->nullable();
            $table->timestampTz('starts_at');
            $table->timestampTz('ends_at');
            $table->timestampsTz();

            $table->index(['restaurant_id', 'ends_at']);
        });

        DB::statement('ALTER TABLE promotions ADD CONSTRAINT promotions_valid_period CHECK (ends_at > starts_at)');
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
        Schema::dropIfExists('daily_menus');
    }
};
