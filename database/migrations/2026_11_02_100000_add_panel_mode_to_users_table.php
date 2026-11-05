<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel simple del dueño (#114, ADR 0035): cada cuenta recuerda si ve el
 * panel simple o el completo («Ver todo»). Todas empiezan en el simple,
 * también las que ya existen.
 *
 * Seguro hacia adelante: columna con valor por defecto constante, que
 * PostgreSQL agrega sin reescribir la tabla; enum() de Laravel la crea como
 * varchar con un CHECK de los dos valores (users_panel_mode_check).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('panel_mode', ['simple', 'full'])->default('simple');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('panel_mode');
        });
    }
};
