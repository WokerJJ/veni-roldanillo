<?php

namespace App\Support\Osm;

/** Lo que devolvió Overpass y cómo se resolvió la consulta (ADR 0021). */
final readonly class OverpassResult
{
    /**
     * @param  list<array<mixed>>  $elements  los elementos de la respuesta
     * @param  bool  $withinBoundary  true si vino del límite del municipio;
     *                                false si del recuadro, que también cubre
     *                                parte de los municipios vecinos
     */
    public function __construct(
        public array $elements,
        public bool $withinBoundary,
    ) {}
}
