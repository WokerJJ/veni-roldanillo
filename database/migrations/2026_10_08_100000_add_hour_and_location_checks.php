<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
| Dos valores que PostgreSQL admite y la app no sabe leer.
|
| Las 24:00: una columna time las acepta (el final del día) y la lista de
| restaurantes las mandaría como «24:00», que el dispositivo no toma por una
| hora: descarta la franja, y un «18:00–24:00» se vería cerrado toda la noche.
| Cerrar a medianoche se escribe 00:00. En special_hours las horas son nulas
| en un día cerrado, y un CHECK deja pasar los nulos.
|
| El punto vacío (POINT EMPTY): cabe en geography(Point,4326), pero no tiene
| coordenadas y GeoPoint falla al leerlo; una sola fila así tumbaría la lista
| entera de restaurantes.
|
| Si alguna fila ya tuviera uno de esos valores, la migración se detiene y
| nombra la restricción: se corrige el dato y se vuelve a correr.
*/
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_times_below_24 CHECK (opens_at < '24:00' AND closes_at < '24:00')");
        DB::statement("ALTER TABLE special_hours ADD CONSTRAINT special_hours_times_below_24 CHECK (opens_at < '24:00' AND closes_at < '24:00')");
        DB::statement('ALTER TABLE restaurants ADD CONSTRAINT restaurants_location_not_empty CHECK (NOT ST_IsEmpty(location::geometry))');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE restaurants DROP CONSTRAINT restaurants_location_not_empty');
        DB::statement('ALTER TABLE special_hours DROP CONSTRAINT special_hours_times_below_24');
        DB::statement('ALTER TABLE opening_hours DROP CONSTRAINT opening_hours_times_below_24');
    }
};
