<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Datos de ejemplo para desarrollo: todo es ficticio y está marcado como tal
 * (is_fictitious y «(ficticio)» en el nombre). Nada viene de Google,
 * TripAdvisor ni otros sitios. Nunca se ejecuta en producción.
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        if (app()->isProduction()) {
            throw new RuntimeException('Los datos ficticios no se siembran en producción.');
        }

        $this->call([
            CategorySeeder::class,
            NeighborhoodSeeder::class,
            UserSeeder::class,
            RestaurantSeeder::class,
        ]);
    }
}
