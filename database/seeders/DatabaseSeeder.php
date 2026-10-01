<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;

/**
 * Datos de ejemplo para desarrollo: todo es ficticio y está marcado como tal
 * (is_fictitious y «(ficticio)» en el nombre). Nada viene de Google,
 * TripAdvisor ni otros sitios. Solo corre en local o testing (FictitiousSeeder).
 */
class DatabaseSeeder extends FictitiousSeeder
{
    use WithoutModelEvents;

    protected function populate(): void
    {
        $this->call([
            CategorySeeder::class,
            NeighborhoodSeeder::class,
            UserSeeder::class,
            RestaurantSeeder::class,
        ]);
    }
}
