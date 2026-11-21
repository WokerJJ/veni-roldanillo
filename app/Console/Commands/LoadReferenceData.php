<?php

namespace App\Console\Commands;

use Database\Seeders\CatalogSeeder;
use Database\Seeders\ReferenceCategorySeeder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Carga los datos de referencia que la app necesita para funcionar: los tipos
 * de comida y el catálogo de bebidas del modo Campo (ADR 0049). Es lo único
 * que se siembra en producción: los seeders de ejemplo se niegan a correr
 * fuera de local y testing porque crean cuentas y negocios ficticios.
 *
 * Se puede repetir: solo agrega lo que falta y no pisa lo que administración
 * ya editó. La lista real de barrios no va aquí: sale de una fuente pública
 * verificada, no de un seeder.
 */
#[Signature('veni:cargar-referencia')]
#[Description('Carga las categorías y el catálogo de bebidas (seguro en producción; se puede repetir)')]
class LoadReferenceData extends Command
{
    public function handle(): int
    {
        $this->call('db:seed', ['--class' => ReferenceCategorySeeder::class, '--force' => true]);
        $this->call('db:seed', ['--class' => CatalogSeeder::class, '--force' => true]);

        $this->components->info('Categorías y catálogo de bebidas cargados.');

        return self::SUCCESS;
    }
}
