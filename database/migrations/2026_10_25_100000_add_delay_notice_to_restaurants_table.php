<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * «Aviso de demora» del panel del dueño (#18, ADR 0025): «Demora de 40 min»
 * con un toque, que se va solo.
 *
 * Dos columnas que van juntas: los minutos que se anuncian y hasta cuándo
 * vale el aviso. Sin aviso, las dos son nulas. Columnas nulas sin valor por
 * defecto: en PostgreSQL agregarlas no reescribe la tabla. El CHECK entra
 * directo: recorre la tabla con el bloqueo ACCESS EXCLUSIVE que ya tomó el
 * ALTER TABLE de las columnas, pero las columnas recién creadas están vacías
 * en todas las filas y la tabla es chica (un restaurante por fila). NOT VALID
 * más VALIDATE aparte no evitaría ese bloqueo aquí: la migración corre en una
 * sola transacción y el bloqueo de las columnas dura hasta el final.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurants', function (Blueprint $table) {
            $table->unsignedSmallInteger('delay_minutes')->nullable();
            $table->timestampTz('delay_until')->nullable();
        });

        DB::statement('ALTER TABLE restaurants ADD CONSTRAINT restaurants_delay_notice_valid CHECK (
            (delay_minutes IS NULL AND delay_until IS NULL)
            OR (delay_minutes BETWEEN 5 AND 180 AND delay_until IS NOT NULL)
        )');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE restaurants DROP CONSTRAINT restaurants_delay_notice_valid');

        Schema::table('restaurants', function (Blueprint $table) {
            $table->dropColumn(['delay_minutes', 'delay_until']);
        });
    }
};
