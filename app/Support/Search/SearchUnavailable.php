<?php

namespace App\Support\Search;

use RuntimeException;
use Throwable;

/** Meilisearch no respondió (caído, lento o con error): la búsqueda por plato responde 503. */
final class SearchUnavailable extends RuntimeException
{
    public function __construct(Throwable $previous)
    {
        parent::__construct('La búsqueda por plato no está disponible.', 0, $previous);
    }
}
