<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Panel de administración (#19, ADR 0027): el motivo con que se rechaza un
 * reclamo o un pedido de retiro. Una rechazada siempre lo lleva (CHECK); en
 * una aprobada es opcional. Se borra con la rechazada y se vacía al
 * anonimizar la aprobada (ADR 0026), porque puede nombrar a la persona.
 *
 * Seguro hacia adelante: columnas nulas sin valor por defecto y CHECK sobre
 * tablas chicas que todavía no tienen rechazadas.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['restaurant_claims', 'restaurant_removal_requests'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->string('review_note', 500)->nullable();
            });

            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$table}_rejection_has_note CHECK (status <> 'rejected' OR (review_note IS NOT NULL AND btrim(review_note) <> ''))");
        }
    }

    public function down(): void
    {
        foreach (['restaurant_claims', 'restaurant_removal_requests'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('review_note');
            });
        }
    }
};
