<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * «Pedir que retiren esta ficha» (#20, ADR 0026): solicitudes que revisa
 * administración a mano. Guardarla no oculta la ficha. Mismos datos mínimos
 * de contacto que un reclamo, la relación con el negocio y el motivo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_removal_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->string('contact_name', 100);
            $table->string('contact_phone', 12);
            $table->string('contact_email', 254)->nullable();
            $table->enum('relationship', ['owner', 'manager', 'employee', 'other']);
            $table->text('reason');
            $table->timestampTz('privacy_accepted_at');
            // Quién la resolvió; si esa cuenta se borra, la resolución queda.
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('reviewed_at')->nullable();
            $table->timestampsTz();

            $table->index(['status', 'created_at']);
            $table->index('restaurant_id');
            $table->index('reviewed_by');
        });

        DB::statement("ALTER TABLE restaurant_removal_requests ADD CONSTRAINT restaurant_removal_requests_review_consistency CHECK ((status = 'pending') = (reviewed_at IS NULL))");
        DB::statement("ALTER TABLE restaurant_removal_requests ADD CONSTRAINT restaurant_removal_requests_contact_phone_format CHECK (contact_phone ~ '^573[0-9]{9}\$')");
        DB::statement("ALTER TABLE restaurant_removal_requests ADD CONSTRAINT restaurant_removal_requests_contact_name_not_blank CHECK (btrim(contact_name) <> '')");
        DB::statement('ALTER TABLE restaurant_removal_requests ADD CONSTRAINT restaurant_removal_requests_reason_length CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000)');
        DB::statement("CREATE UNIQUE INDEX restaurant_removal_requests_one_pending ON restaurant_removal_requests (restaurant_id, contact_phone) WHERE status = 'pending'");
    }

    public function down(): void
    {
        // Son pedidos de personas que esperan respuesta: antes de borrarlos a
        // ciegas, que lo decida una persona (como el reclamo sin cuenta).
        if (Schema::hasTable('restaurant_removal_requests') && DB::table('restaurant_removal_requests')->exists()) {
            throw new RuntimeException('Hay pedidos de retiro en restaurant_removal_requests: resolvelos o borralos antes de revertir esta migración.');
        }

        Schema::dropIfExists('restaurant_removal_requests');
    }
};
