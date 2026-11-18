<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Capturas del modo Campo (ADR 0048): una ficha levantada en el local, con la
 * confirmación del dueño y la revisión de administración antes de existir
 * como ficha oculta. pg_trgm y unaccent sirven para buscar duplicados por
 * nombre; se crean con IF NOT EXISTS y el `down` no las quita (son de toda
 * la base, como postgis).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE EXTENSION IF NOT EXISTS unaccent');

        Schema::create('field_submissions', function (Blueprint $table) {
            $table->id();
            // El identificador lo genera el teléfono: repetir el envío no duplica.
            $table->uuid('uuid')->unique();
            $table->enum('kind', ['new_restaurant'])->default('new_restaurant');
            $table->enum('status', ['submitted', 'owner_confirmed', 'approved', 'returned', 'rejected'])->default('submitted');
            $table->unsignedSmallInteger('revision')->default(1);
            $table->foreignId('captured_by')->constrained('users')->restrictOnDelete();
            // La hora del teléfono es solo informativa; manda la del servidor.
            $table->timestampTz('captured_at');
            $table->timestampTz('received_at');

            $table->jsonb('payload');
            $table->unsignedSmallInteger('payload_version')->default(1);
            $table->char('payload_hash', 64);
            $table->enum('location_source', ['device', 'map']);

            $table->string('owner_name', 100);
            $table->enum('owner_role', ['owner', 'manager']);
            $table->string('owner_phone', 12);

            $table->char('confirmation_token_hash', 64)->nullable()->unique();
            $table->timestampTz('confirmation_expires_at')->nullable();
            $table->string('confirmation_phone', 12)->nullable();
            $table->timestampTz('owner_confirmed_at')->nullable();
            $table->char('owner_confirmed_hash', 64)->nullable();
            $table->string('owner_privacy_notice_version', 16)->nullable();
            $table->string('owner_authorization_version', 16)->nullable();

            $table->jsonb('duplicates')->nullable();
            // La ficha elegida para completar y, al aprobar, la resultante.
            $table->foreignId('restaurant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->timestampsTz();

            $table->index(['status', 'received_at']);
            $table->index('captured_by');
            $table->index('restaurant_id');
            $table->index('reviewed_by');
        });

        DB::statement('ALTER TABLE field_submissions ADD COLUMN location geography(Point,4326) NOT NULL');
        DB::statement('CREATE INDEX field_submissions_location_gist ON field_submissions USING gist (location)');
        DB::statement("ALTER TABLE field_submissions ADD CONSTRAINT field_submissions_owner_phone_format CHECK (owner_phone ~ '^573[0-9]{9}\$')");
        DB::statement("ALTER TABLE field_submissions ADD CONSTRAINT field_submissions_owner_name_not_blank CHECK (btrim(owner_name) <> '')");
        // Sin la confirmación del dueño y su huella, nada llega a confirmada ni a aprobada.
        DB::statement("ALTER TABLE field_submissions ADD CONSTRAINT field_submissions_owner_confirmation CHECK (status NOT IN ('owner_confirmed', 'approved') OR (owner_confirmed_at IS NOT NULL AND owner_confirmed_hash IS NOT NULL AND confirmation_phone IS NOT NULL))");
        DB::statement("ALTER TABLE field_submissions ADD CONSTRAINT field_submissions_approved_reviewed CHECK (status <> 'approved' OR reviewed_at IS NOT NULL)");
        DB::statement("ALTER TABLE field_submissions ADD CONSTRAINT field_submissions_note_when_closed CHECK (status NOT IN ('returned', 'rejected') OR (review_note IS NOT NULL AND btrim(review_note) <> ''))");
        DB::statement("CREATE UNIQUE INDEX field_submissions_one_approved_per_restaurant ON field_submissions (restaurant_id) WHERE status = 'approved'");
    }

    public function down(): void
    {
        if (Schema::hasTable('field_submissions') && DB::table('field_submissions')->exists()) {
            throw new RuntimeException('Hay capturas en field_submissions: resolvelas o borralas antes de revertir esta migración.');
        }

        Schema::dropIfExists('field_submissions');
    }
};
