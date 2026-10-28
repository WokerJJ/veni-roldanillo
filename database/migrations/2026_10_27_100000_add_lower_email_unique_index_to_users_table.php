<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Panel de administración (#19, ADR 0027): una cuenta por correo, sin
 * distinguir mayúsculas. users_email_unique compara el texto tal cual y
 * dejaba «Dueno@…» y «dueno@…» como dos cuentas; aprobar un reclamo busca
 * por lower(email) y una carrera entre dos aprobaciones podía crear las dos.
 *
 * Antes de crear el índice se buscan los duplicados: si hay, la migración se
 * detiene y nombra los ids, para resolverlos a mano (no se borra ni se fusiona
 * ninguna cuenta aquí).
 *
 * Índice normal, dentro de la transacción de la migración: users es una
 * tabla chica (cuentas de dueños y administración), el bloqueo dura poco. Si
 * algún día crece, el siguiente índice de users va con CREATE INDEX
 * CONCURRENTLY y $withinTransaction = false.
 */
return new class extends Migration
{
    public function up(): void
    {
        $duplicates = DB::select('SELECT string_agg(id::text, \', \' ORDER BY id) AS ids FROM users GROUP BY lower(email) HAVING count(*) > 1');

        if ($duplicates !== []) {
            $ids = collect($duplicates)
                ->map(fn (mixed $row): string => is_object($row) && isset($row->ids) && is_string($row->ids) ? $row->ids : '')
                ->implode('; ');

            throw new RuntimeException("Hay cuentas con el mismo correo en otras mayúsculas (ids: {$ids}). Resolvelas a mano antes de migrar.");
        }

        DB::statement('CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_email_lower_unique');
    }
};
