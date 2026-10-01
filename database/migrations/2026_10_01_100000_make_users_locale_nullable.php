<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
| users.locale pasa a ser opcional y sin valor por defecto (ADR 0010): nulo
| significa «la persona no ha elegido idioma» y entonces decide el dispositivo
| (cookie o Accept-Language). Con el 'es' por defecto, la cuenta le ganaba al
| idioma del teléfono aunque nadie lo hubiera elegido.
|
| SQL directo: change() sobre una columna enum de PostgreSQL intenta repetir
| el CHECK dentro de ALTER COLUMN ... TYPE. La restricción users_locale_check
| (locale IN ('es', 'en')) no se toca: un CHECK deja pasar los nulos.
|
| Las filas que ya existen conservan su valor: no se puede distinguir un
| español elegido del que puso el valor por defecto.
*/
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users ALTER COLUMN locale DROP DEFAULT, ALTER COLUMN locale DROP NOT NULL');
    }

    public function down(): void
    {
        // Volver a exigir el idioma obliga a darle uno a quien no eligió: el valor por defecto anterior.
        DB::statement("UPDATE users SET locale = 'es' WHERE locale IS NULL");
        DB::statement("ALTER TABLE users ALTER COLUMN locale SET DEFAULT 'es', ALTER COLUMN locale SET NOT NULL");
    }
};
