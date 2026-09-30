<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
| Extensiones que el esquema necesita, antes que cualquier tabla:
| - postgis: columnas geography y funciones ST_* (restaurantes y barrios).
| - btree_gist: operadores de igualdad en índices GiST, para las restricciones
|   EXCLUDE que impiden franjas de horario solapadas.
|
| El usuario de la base necesita permiso para crear extensiones (superusuario,
| dueño de la base con extensiones «trusted» o que un administrador las cree
| antes); ver «Desarrollo local» en el README.
*/
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS postgis');
        DB::statement('CREATE EXTENSION IF NOT EXISTS btree_gist');
    }

    /**
     * No se quitan: las extensiones son de toda la base de datos y pueden
     * haberlas creado otros (la imagen postgis/postgis, un administrador u
     * otro esquema que las use). Borrarlas al revertir rompería lo que no es
     * de esta aplicación; el resto de migraciones ya deja la base sin tablas
     * que dependan de ellas.
     */
    public function down(): void
    {
        //
    }
};
