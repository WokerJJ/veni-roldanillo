<?php

namespace Database\Seeders;

use App\Models\Neighborhood;

/**
 * Barrios inventados: la lista real de barrios de Roldanillo se cargará desde
 * una fuente pública verificada, no desde este seeder.
 */
class NeighborhoodSeeder extends FictitiousSeeder
{
    protected function populate(): void
    {
        $names = ['Los Guayacanes', 'El Mirador de Prueba', 'La Esquina Lila', 'San Ensayo', 'El Llano Mango', 'Villa Ejemplo'];

        foreach ($names as $name) {
            $neighborhood = Neighborhood::query()->firstOrNew(['slug' => 'barrio-'.str($name)->slug()]);
            $neighborhood->name = "Barrio {$name} (ficticio)";
            $neighborhood->is_fictitious = true;
            $neighborhood->save();
        }
    }
}
