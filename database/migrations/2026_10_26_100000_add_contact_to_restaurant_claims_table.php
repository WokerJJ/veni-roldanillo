<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * «¿Es tu negocio? Reclámalo» sin cuenta (#20, ADR 0026).
 *
 * Quien reclama todavía no tiene cuenta: las crea administración al aprobar
 * (ADR 0025). La solicitud guarda entonces un contacto mínimo (nombre,
 * celular, correo opcional y su rol en el local) y cuándo aceptó el
 * tratamiento de datos; user_id pasa a ser opcional y se llena al aprobar.
 * Toda solicitud tiene o una cuenta o el contacto completo (CHECK).
 *
 * Seguro hacia adelante: DROP NOT NULL solo cambia el catálogo, las columnas
 * nuevas son nulas y sin valor por defecto (no reescriben la tabla) y los
 * CHECK y el índice recorren una tabla que hoy está vacía o casi.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE restaurant_claims ALTER COLUMN user_id DROP NOT NULL');

        // Nulas y sin valor por defecto: agregarlas no reescribe la tabla.
        Schema::table('restaurant_claims', function (Blueprint $table) {
            $table->string('contact_name', 100)->nullable();
            $table->string('contact_phone', 12)->nullable();
            $table->string('contact_email', 254)->nullable();
            $table->string('claimant_role', 20)->nullable();
            $table->timestampTz('privacy_accepted_at')->nullable();
        });

        // Celular colombiano normalizado: 57 + diez dígitos que empiezan por 3.
        DB::statement("ALTER TABLE restaurant_claims ADD CONSTRAINT restaurant_claims_contact_phone_format CHECK (contact_phone ~ '^573[0-9]{9}\$')");
        DB::statement("ALTER TABLE restaurant_claims ADD CONSTRAINT restaurant_claims_claimant_role_valid CHECK (claimant_role IN ('owner', 'manager'))");
        DB::statement("ALTER TABLE restaurant_claims ADD CONSTRAINT restaurant_claims_contact_name_not_blank CHECK (btrim(contact_name) <> '')");
        // O una cuenta, o el contacto completo con la autorización de datos.
        DB::statement(<<<'SQL'
            ALTER TABLE restaurant_claims ADD CONSTRAINT restaurant_claims_claimant_present CHECK (
                user_id IS NOT NULL
                OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL
                    AND claimant_role IS NOT NULL AND privacy_accepted_at IS NOT NULL)
            )
            SQL);

        // Una sola solicitud pendiente por celular y restaurante: el doble
        // envío no duplica (el controlador la reconoce y responde lo mismo).
        DB::statement("CREATE UNIQUE INDEX restaurant_claims_one_pending_contact ON restaurant_claims (restaurant_id, contact_phone) WHERE status = 'pending' AND contact_phone IS NOT NULL");
    }

    public function down(): void
    {
        // Las solicitudes sin cuenta no caben en el esquema anterior: antes de
        // borrarlas a ciegas, que lo decida una persona.
        if (DB::table('restaurant_claims')->whereNull('user_id')->exists()) {
            throw new RuntimeException('Hay reclamos sin cuenta en restaurant_claims: resolvelos o borralos antes de revertir esta migración.');
        }

        DB::statement('DROP INDEX restaurant_claims_one_pending_contact');
        DB::statement(<<<'SQL'
            ALTER TABLE restaurant_claims
                DROP CONSTRAINT restaurant_claims_claimant_present,
                DROP CONSTRAINT restaurant_claims_contact_name_not_blank,
                DROP CONSTRAINT restaurant_claims_claimant_role_valid,
                DROP CONSTRAINT restaurant_claims_contact_phone_format,
                DROP COLUMN contact_name,
                DROP COLUMN contact_phone,
                DROP COLUMN contact_email,
                DROP COLUMN claimant_role,
                DROP COLUMN privacy_accepted_at
            SQL);
        DB::statement('ALTER TABLE restaurant_claims ALTER COLUMN user_id SET NOT NULL');
    }
};
