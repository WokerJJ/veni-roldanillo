<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Cuentas de ejemplo con correos del dominio reservado example.test.
 */
class UserSeeder extends Seeder
{
    public function run(): void
    {
        User::factory()->admin()->create([
            'name' => 'Administración de Prueba (ficticio)',
            'email' => 'admin@example.test',
        ]);

        User::factory()->create([
            'name' => 'Dueña de Prueba (ficticio)',
            'email' => 'duena@example.test',
        ]);

        User::factory()->create([
            'name' => 'Usuario de Prueba (ficticio)',
            'email' => 'usuario@example.test',
        ]);
    }
}
