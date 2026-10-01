<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // «¿Es tu negocio? Reclámalo»: solicitudes de propiedad de una ficha.
        Schema::create('restaurant_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->text('message')->nullable();
            // Quién la resolvió; si esa cuenta se borra, la resolución queda.
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('reviewed_at')->nullable();
            $table->timestampsTz();

            $table->index(['status', 'created_at']);
            // Uno por FK: el único parcial de pendientes no cubre las resueltas,
            // y sin índice el borrado de un restaurante o de quien revisó
            // recorre la tabla entera.
            $table->index('restaurant_id');
            $table->index('user_id');
            $table->index('reviewed_by');
        });

        // Una solicitud resuelta tiene fecha de resolución; una pendiente no.
        DB::statement("ALTER TABLE restaurant_claims ADD CONSTRAINT restaurant_claims_review_consistency CHECK ((status = 'pending') = (reviewed_at IS NULL))");
        // Una sola solicitud pendiente por usuario y restaurante.
        DB::statement("CREATE UNIQUE INDEX restaurant_claims_one_pending ON restaurant_claims (restaurant_id, user_id) WHERE status = 'pending'");

        // Intención de pedir por WhatsApp (ADR 0004): sin dirección, sin
        // contenido del pedido y sin ubicación; solo que hubo un clic.
        Schema::create('order_intents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            // Al borrar la cuenta (Ley 1581) la estadística queda anónima.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // SHA-256 de un identificador aleatorio del dispositivo (no reversible).
            $table->char('device_hash', 64)->nullable();
            // null = sin respuesta a «¿Al final sí pediste?».
            $table->boolean('confirmed')->nullable();
            $table->timestampsTz();

            $table->index(['restaurant_id', 'created_at']);
            $table->index('user_id');
        });

        DB::statement("ALTER TABLE order_intents ADD CONSTRAINT order_intents_device_hash_format CHECK (device_hash ~ '^[0-9a-f]{64}$')");

        // Anonimización real (Ley 1581): cuando la FK deja user_id en NULL al
        // borrar la cuenta, el device_hash también se borra; si quedara, las
        // intenciones seguirían enlazadas entre sí y con el dispositivo. Va en
        // la base para que ningún camino (Eloquent, SQL, cascada) lo salte.
        // OR REPLACE: migrate:fresh borra tablas pero no funciones.
        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION order_intents_anonymize() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                NEW.device_hash := NULL;
                RETURN NEW;
            END;
            $$
            SQL);
        DB::statement(<<<'SQL'
            CREATE TRIGGER order_intents_anonymize BEFORE UPDATE OF user_id ON order_intents
            FOR EACH ROW WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
            EXECUTE FUNCTION order_intents_anonymize()
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('order_intents');
        DB::statement('DROP FUNCTION IF EXISTS order_intents_anonymize()');
        Schema::dropIfExists('restaurant_claims');
    }
};
