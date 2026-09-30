<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurants', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 140)->unique();
            $table->text('description_es')->nullable();
            $table->text('description_en')->nullable();
            // Dirección pública del negocio (no del usuario: esas nunca llegan al servidor).
            $table->string('address', 160)->nullable();
            $table->string('reference', 160)->nullable();
            // PostGIS geography(Point,4326): distancias en metros sin proyectar.
            $table->geography('location', 'point', 4326);
            $table->string('phone', 20)->nullable();
            // Celular colombiano para wa.me: 57 + diez dígitos, sin «+» (el
            // modelo normaliza lo que escriba el dueño).
            $table->string('whatsapp', 15)->nullable();
            $table->smallInteger('price_level')->nullable();
            $table->boolean('delivery')->default(false);
            $table->text('delivery_notes_es')->nullable();
            $table->text('delivery_notes_en')->nullable();
            $table->jsonb('payment_methods')->default('[]');
            $table->enum('status', ['unclaimed', 'claimed', 'hidden'])->default('unclaimed');
            $table->enum('plan', ['free', 'featured'])->default('free');
            $table->timestampTz('verified_at')->nullable();
            $table->timestampTz('updated_by_owner_at')->nullable();
            // Datos de ejemplo (seeders y factories): nunca se muestran como reales.
            $table->boolean('is_fictitious')->default(false);
            $table->timestampsTz();

            // Sin índice en status: el sitio filtra «todas menos las ocultas»
            // (status <> 'hidden'), que casi no descarta filas y un B-tree no
            // acelera. Si hace falta, uno parcial WHERE status = 'hidden'.
            $table->spatialIndex('location');
        });

        DB::statement("ALTER TABLE restaurants ADD CONSTRAINT restaurants_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')");
        DB::statement("ALTER TABLE restaurants ADD CONSTRAINT restaurants_whatsapp_format CHECK (whatsapp ~ '^57[0-9]{10}$')");
        DB::statement('ALTER TABLE restaurants ADD CONSTRAINT restaurants_price_level_range CHECK (price_level BETWEEN 1 AND 4)');
        DB::statement("ALTER TABLE restaurants ADD CONSTRAINT restaurants_payment_methods_array CHECK (jsonb_typeof(payment_methods) = 'array')");
        // Mismos valores que el enum PaymentMethod; añadir uno exige migración.
        DB::statement(<<<'SQL'
            ALTER TABLE restaurants ADD CONSTRAINT restaurants_payment_methods_known
            CHECK (payment_methods <@ '["cash", "nequi", "daviplata", "card"]'::jsonb)
            SQL);

        // Tipos de comida de cada restaurante (puede tener varios).
        Schema::create('category_restaurant', function (Blueprint $table) {
            // Restrict: borrar una categoría en uso dejaría fichas sin filtro.
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();

            // La PK (category_id, restaurant_id) sirve al filtro por categoría;
            // el índice de restaurant_id, a las categorías de una ficha y al
            // borrado en cascada.
            $table->primary(['category_id', 'restaurant_id']);
            $table->index('restaurant_id');
        });

        // Dueños y empleados de cada restaurante.
        Schema::create('restaurant_user', function (Blueprint $table) {
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('role', ['owner', 'staff']);
            $table->timestampsTz();

            $table->primary(['restaurant_id', 'user_id']);
            $table->index('user_id');
        });

        // Horario semanal; weekday 0 = domingo … 6 = sábado (como Carbon).
        // Puede haber varias franjas por día y una franja puede pasar la
        // medianoche (closes_at < opens_at).
        Schema::create('opening_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->smallInteger('weekday');
            $table->time('opens_at');
            $table->time('closes_at');
            $table->timestampsTz();
        });

        DB::statement('ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_weekday_range CHECK (weekday BETWEEN 0 AND 6)');
        DB::statement('ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_not_empty CHECK (opens_at <> closes_at)');
        // Sin franjas solapadas en el mismo día. Cada franja es un rango sobre
        // una fecha fija; si pasa la medianoche termina al día siguiente. Los
        // rangos son [apertura, cierre): 11-15 y 15-18 no se solapan. El
        // índice GiST de la restricción también sirve para buscar por
        // restaurante y día (btree_gist aporta la igualdad).
        DB::statement(<<<'SQL'
            ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_no_overlap EXCLUDE USING gist (
                restaurant_id WITH =,
                weekday WITH =,
                tsrange(
                    DATE '2000-01-01' + opens_at,
                    DATE '2000-01-01' + closes_at + CASE WHEN closes_at < opens_at THEN interval '1 day' ELSE interval '0' END
                ) WITH &&
            )
            SQL);

        // Excepciones por fecha: festivos, cierres temporales, horario distinto.
        Schema::create('special_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restaurant_id')->constrained()->cascadeOnDelete();
            $table->date('on_date');
            $table->boolean('closed')->default(false);
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
            $table->string('note_es', 160)->nullable();
            $table->string('note_en', 160)->nullable();
            $table->timestampsTz();
        });

        // Cerrado sin horas, o abierto con ambas horas.
        DB::statement('ALTER TABLE special_hours ADD CONSTRAINT special_hours_closed_or_hours CHECK (
            (closed AND opens_at IS NULL AND closes_at IS NULL)
            OR (NOT closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
        )');
        // Por fecha: o un solo «cerrado», o franjas que no se solapan. Un día
        // cerrado ocupa el rango completo (dos días, por las franjas que pasan
        // la medianoche), así que choca con cualquier otra fila de esa fecha.
        DB::statement(<<<'SQL'
            ALTER TABLE special_hours ADD CONSTRAINT special_hours_no_overlap EXCLUDE USING gist (
                restaurant_id WITH =,
                on_date WITH =,
                (CASE WHEN closed
                    THEN tsrange(TIMESTAMP '2000-01-01', TIMESTAMP '2000-01-03')
                    ELSE tsrange(
                        DATE '2000-01-01' + opens_at,
                        DATE '2000-01-01' + closes_at + CASE WHEN closes_at < opens_at THEN interval '1 day' ELSE interval '0' END
                    )
                END) WITH &&
            )
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('special_hours');
        Schema::dropIfExists('opening_hours');
        Schema::dropIfExists('restaurant_user');
        Schema::dropIfExists('category_restaurant');
        Schema::dropIfExists('restaurants');
    }
};
