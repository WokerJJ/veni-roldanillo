<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel de administración (#19, ADR 0027): la cuenta que crea la aprobación
 * de un reclamo nace con una contraseña temporal y debe cambiarla en el
 * primer ingreso. Las cuentas que ya existen no cambian (false).
 *
 * Seguro hacia adelante: columna con valor por defecto constante, que
 * PostgreSQL agrega sin reescribir la tabla.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('must_change_password')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('must_change_password');
        });
    }
};
