<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El registro de la intención de pedido (#22, ADR 0031) cuenta, además del
 * restaurante y la hora, si el pedido era a domicilio o para recoger. Es lo
 * único que el carrito manda: ni platos, ni total, ni dirección, ni nombre.
 *
 * device_hash ya era nulo y este flujo no lo llena (sin identificador del
 * dispositivo); se queda la columna por el trigger de anonimización.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_intents', function (Blueprint $table) {
            $table->string('fulfillment', 16)->nullable()->after('restaurant_id');
        });

        DB::statement("ALTER TABLE order_intents ADD CONSTRAINT order_intents_fulfillment_check CHECK (fulfillment IN ('delivery', 'pickup'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE order_intents DROP CONSTRAINT IF EXISTS order_intents_fulfillment_check');

        Schema::table('order_intents', function (Blueprint $table) {
            $table->dropColumn('fulfillment');
        });
    }
};
