<?php

namespace App\Support\Osm;

use RuntimeException;

/** La importación no corre: hay otra a la vez o la respuesta no es fiable. */
final class OsmImportRefused extends RuntimeException {}
