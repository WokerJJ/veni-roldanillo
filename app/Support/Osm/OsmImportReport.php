<?php

namespace App\Support\Osm;

use App\Models\RestaurantSource;

/** Lo que hizo una corrida de veni:osm-import. */
final class OsmImportReport
{
    public int $created = 0;

    public int $updated = 0;

    /** Ya importadas y sin cambios en OpenStreetMap. */
    public int $unchanged = 0;

    /** Elementos que no son locales de los que se importan o no traen punto. */
    public int $ignored = 0;

    /**
     * Nombres de las fichas que no se tocaron porque alguien las editó,
     * verificó o publicó.
     *
     * @var list<string>
     */
    public array $skipped = [];

    /**
     * Locales sin nombre: no se importan (ADR 0021).
     *
     * @var list<OsmPlace>
     */
    public array $unnamed = [];

    /**
     * Procedencias cuyo objeto ya no está en OpenStreetMap.
     *
     * @var list<RestaurantSource>
     */
    public array $missing = [];
}
