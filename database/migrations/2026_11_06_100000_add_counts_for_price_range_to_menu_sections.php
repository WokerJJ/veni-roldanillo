<?php

use App\Models\MenuSection;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Si una sección cuenta para el rango de precios de la carta (#127, ADR
 * 0039): las bebidas, los postres y las adiciones no. Lo decide el dueño con
 * una casilla; hasta ahora se adivinaba por el nombre en cada consulta.
 *
 * Las secciones que ya hay se marcan aquí mismo, con la misma detección por
 * nombre que usa una sección nueva (MenuSection::countsForPriceRangeByName):
 * una sola regla, escrita en PHP, que no depende de cómo la base de datos
 * pase a minúsculas una «Ó» o una «Ñ» (eso lo decide el locale de
 * PostgreSQL). La columna sin marcar diría que todo cuenta, así que columna y
 * datos van juntos, en la misma transacción. En una base nueva no hay
 * secciones: si la lista de nombres cambia después, esta migración no
 * reescribe nada que ya se haya decidido.
 *
 * Compatible con la versión anterior (ADR 0013): no sabe de la columna y lo
 * que cree mientras se despliega queda con el valor por defecto (cuenta).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_sections', function (Blueprint $table): void {
            $table->boolean('counts_for_price_range')->default(true);
        });

        DB::table('menu_sections')->select(['id', 'name_es', 'name_en'])->orderBy('id')
            ->chunkById(500, function ($sections): void {
                $excluded = $sections
                    ->reject(fn (object $section): bool => MenuSection::countsForPriceRangeByName(
                        is_string($section->name_es) ? $section->name_es : null,
                        is_string($section->name_en) ? $section->name_en : null,
                    ))
                    ->pluck('id');

                if ($excluded->isNotEmpty()) {
                    DB::table('menu_sections')->whereIn('id', $excluded)->update(['counts_for_price_range' => false]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('menu_sections', function (Blueprint $table): void {
            $table->dropColumn('counts_for_price_range');
        });
    }
};
