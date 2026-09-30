<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Rol global (usuario o administrador) e idioma preferido. Ser dueño o empleado
| no es un rol global: depende del restaurante (tabla restaurant_user).
| Celular y alias (Ley 1581: datos mínimos) llegan con el acceso por código de
| WhatsApp, en la fase de reseñas.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['user', 'admin'])->default('user');
            $table->enum('locale', ['es', 'en'])->default('es');

            $table->timestampTz('email_verified_at')->nullable()->change();
            $table->timestampTz('created_at')->nullable()->change();
            $table->timestampTz('updated_at')->nullable()->change();

            $table->index('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropColumn(['role', 'locale']);

            $table->timestamp('email_verified_at')->nullable()->change();
            $table->timestamp('created_at')->nullable()->change();
            $table->timestamp('updated_at')->nullable()->change();
        });
    }
};
