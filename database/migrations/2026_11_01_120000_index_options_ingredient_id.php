<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * options.ingredient_id con índice (AUD-003): borrar un ingrediente deja sus
 * opciones sin él (ON DELETE SET NULL) y contar en cuántas opciones está
 * (el aviso antes de borrar) no recorre la tabla entera.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('options', function (Blueprint $table) {
            $table->index('ingredient_id');
        });
    }

    public function down(): void
    {
        Schema::table('options', function (Blueprint $table) {
            $table->dropIndex(['ingredient_id']);
        });
    }
};
