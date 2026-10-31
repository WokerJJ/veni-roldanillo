<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * El registro del pedido por WhatsApp (#22, ADR 0031) se cuenta y se borra
 * por created_at: las estadísticas lo agrupan por día y model:prune lo borra
 * a los 13 meses. Una fila con created_at nulo no saldría en ninguna de las
 * dos y no se borraría nunca. Con DEFAULT now() y NOT NULL, ningún camino
 * (Eloquent, SQL a mano, un seeder) la puede dejar así.
 *
 * SET NOT NULL revisa la tabla con un bloqueo exclusivo: order_intents es
 * chica todavía, dura poco. Si hubiera una fila nula, PostgreSQL detiene la
 * migración y no cambia nada.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE order_intents
                ALTER COLUMN created_at SET DEFAULT now(),
                ALTER COLUMN created_at SET NOT NULL,
                ALTER COLUMN updated_at SET DEFAULT now(),
                ALTER COLUMN updated_at SET NOT NULL
            SQL);
    }

    public function down(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE order_intents
                ALTER COLUMN created_at DROP NOT NULL,
                ALTER COLUMN created_at DROP DEFAULT,
                ALTER COLUMN updated_at DROP NOT NULL,
                ALTER COLUMN updated_at DROP DEFAULT
            SQL);
    }
};
