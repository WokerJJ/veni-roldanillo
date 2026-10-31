<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * El borrado de los 13 meses (#22, ADR 0031) filtra order_intents solo por
 * created_at, y el índice (restaurant_id, created_at) no sirve para eso: sin
 * otro índice, model:prune recorre toda la tabla cada día. Las filas entran en
 * orden de hora, así que un BRIN (unas pocas páginas para millones de filas)
 * alcanza para saltar los bloques recientes.
 *
 * CONCURRENTLY no puede ir dentro de una transacción: la tabla recibe
 * escrituras a toda hora (cada «Enviar pedido») y un CREATE INDEX normal las
 * frenaría mientras dura. Si se corta a mitad, queda un índice inválido:
 * IF NOT EXISTS no lo rehace; se borra con el down y se vuelve a migrar.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS order_intents_created_at_brin ON order_intents USING brin (created_at)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX CONCURRENTLY IF EXISTS order_intents_created_at_brin');
    }
};
