<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reclamos y pedidos de retiro (#20, ADR 0026), segunda parte:
 *
 * - `privacy_notice_version`: qué versión del aviso de privacidad aceptó
 *   quien envió la solicitud (Ley 1581: poder probar qué autorizó).
 * - Anonimizar en vez de borrar las aprobadas: pasados los seis meses, una
 *   solicitud aprobada pierde el contacto, el mensaje y el motivo, y conserva
 *   la resolución (quién, cuándo, de qué restaurante). Por eso el contacto
 *   completo se exige solo mientras está pendiente.
 * - El mensaje de un reclamo, como mucho 1000 caracteres (como el formulario).
 *
 * Seguro hacia adelante: las columnas nuevas son nulas y sin valor por
 * defecto, DROP NOT NULL solo cambia el catálogo y los CHECK recorren tablas
 * chicas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_claims', function (Blueprint $table) {
            $table->string('privacy_notice_version', 20)->nullable();
        });
        Schema::table('restaurant_removal_requests', function (Blueprint $table) {
            $table->string('privacy_notice_version', 20)->nullable();
        });

        // O una cuenta, o una resuelta, o el contacto completo con la autorización.
        DB::statement(<<<'SQL'
            ALTER TABLE restaurant_claims
                DROP CONSTRAINT restaurant_claims_claimant_present,
                ADD CONSTRAINT restaurant_claims_claimant_present CHECK (
                    user_id IS NOT NULL
                    OR status <> 'pending'
                    OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL
                        AND claimant_role IS NOT NULL AND privacy_accepted_at IS NOT NULL)
                ),
                ADD CONSTRAINT restaurant_claims_message_length CHECK (char_length(message) <= 1000)
            SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE restaurant_removal_requests
                ALTER COLUMN contact_name DROP NOT NULL,
                ALTER COLUMN contact_phone DROP NOT NULL,
                ALTER COLUMN reason DROP NOT NULL,
                ADD CONSTRAINT restaurant_removal_requests_contact_present CHECK (
                    status <> 'pending'
                    OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL AND reason IS NOT NULL)
                )
            SQL);
    }

    public function down(): void
    {
        // Las anonimizadas no caben en el esquema anterior: que lo decida una persona.
        $anonymized = DB::table('restaurant_removal_requests')
            ->where(fn (Builder $query) => $query->whereNull('contact_name')->orWhereNull('contact_phone')->orWhereNull('reason'))
            ->exists()
            || DB::table('restaurant_claims')->whereNull('user_id')
                ->where(fn (Builder $query) => $query->whereNull('contact_name')->orWhereNull('contact_phone')
                    ->orWhereNull('claimant_role')->orWhereNull('privacy_accepted_at'))
                ->exists();

        if ($anonymized) {
            throw new RuntimeException('Hay solicitudes anonimizadas en restaurant_claims o restaurant_removal_requests: resolvelas o borralas antes de revertir esta migración.');
        }

        DB::statement(<<<'SQL'
            ALTER TABLE restaurant_removal_requests
                DROP CONSTRAINT restaurant_removal_requests_contact_present,
                ALTER COLUMN contact_name SET NOT NULL,
                ALTER COLUMN contact_phone SET NOT NULL,
                ALTER COLUMN reason SET NOT NULL,
                DROP COLUMN privacy_notice_version
            SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE restaurant_claims
                DROP CONSTRAINT restaurant_claims_message_length,
                DROP CONSTRAINT restaurant_claims_claimant_present,
                ADD CONSTRAINT restaurant_claims_claimant_present CHECK (
                    user_id IS NOT NULL
                    OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL
                        AND claimant_role IS NOT NULL AND privacy_accepted_at IS NOT NULL)
                ),
                DROP COLUMN privacy_notice_version
            SQL);
    }
};
