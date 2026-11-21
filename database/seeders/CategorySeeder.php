<?php

namespace Database\Seeders;

/**
 * Tipos de comida genéricos (clasificación, no datos de negocios). En
 * desarrollo entran con el resto de los datos de ejemplo; son los mismos que
 * en producción (ReferenceCategorySeeder).
 */
class CategorySeeder extends FictitiousSeeder
{
    protected function populate(): void
    {
        $this->call(ReferenceCategorySeeder::class);
    }
}
