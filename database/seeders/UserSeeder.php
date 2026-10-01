<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Support\Str;

/**
 * Cuentas de ejemplo con correos del dominio reservado example.test. Cada una
 * lleva una contraseña aleatoria que no se guarda en ningún lado: si una base
 * sembrada llegara a exponerse, nadie podría entrar con una clave conocida.
 * El acceso será por código de WhatsApp; para probar una sesión en local se
 * usa actingAs() en las pruebas o tinker.
 */
class UserSeeder extends FictitiousSeeder
{
    protected function populate(): void
    {
        $accounts = [
            ['Administración de Prueba (ficticio)', 'admin@example.test', true],
            ['Dueña de Prueba (ficticio)', 'duena@example.test', false],
            ['Usuario de Prueba (ficticio)', 'usuario@example.test', false],
        ];

        foreach ($accounts as [$name, $email, $admin]) {
            $factory = $admin ? User::factory()->admin() : User::factory();

            $factory->create([
                'name' => $name,
                'email' => $email,
                'password' => Str::password(32),
            ]);
        }
    }
}
