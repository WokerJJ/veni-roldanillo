<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Índices B-tree para cargar los horarios de varios restaurantes a la vez.
|
| El mapa y la ficha piden los horarios con «restaurant_id in (…)» y en orden:
| el semanal por día y hora de apertura, y los especiales por fecha, dentro de
| una ventana. El único índice con restaurant_id en estas tablas era el GiST
| de la restricción contra franjas solapadas, que no resuelve una lista de
| restaurantes en un solo recorrido ni devuelve las filas ordenadas.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opening_hours', function (Blueprint $table) {
            $table->index(['restaurant_id', 'weekday', 'opens_at']);
        });

        Schema::table('special_hours', function (Blueprint $table) {
            $table->index(['restaurant_id', 'on_date']);
        });
    }

    public function down(): void
    {
        Schema::table('special_hours', function (Blueprint $table) {
            $table->dropIndex(['restaurant_id', 'on_date']);
        });

        Schema::table('opening_hours', function (Blueprint $table) {
            $table->dropIndex(['restaurant_id', 'weekday', 'opens_at']);
        });
    }
};
