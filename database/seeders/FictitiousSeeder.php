<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Base de todos los seeders: los datos de ejemplo son ficticios y solo se
 * siembran en local o testing. run() es final para que ningún seeder se salte
 * la comprobación, se llame por DatabaseSeeder, por db:seed --class o directo.
 * Cada seeder escribe sus datos en populate().
 */
abstract class FictitiousSeeder extends Seeder
{
    final public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            throw new RuntimeException('Los datos ficticios solo se siembran en local o testing.');
        }

        $this->populate();
    }

    abstract protected function populate(): void;
}
