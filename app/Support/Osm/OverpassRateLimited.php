<?php

namespace App\Support\Osm;

use RuntimeException;

/** Overpass respondió 429: no se reintenta en la misma corrida. */
final class OverpassRateLimited extends RuntimeException {}
