<?php

namespace App\Support;

use App\Enums\Locale;
use Illuminate\Support\Facades\File;

/**
 * Textos de la interfaz de un idioma: las mismas líneas de lang/{idioma}.json
 * que usa __() en el servidor, para compartirlas con Vue (ADR 0010).
 *
 * Se lee solo ese archivo y no el cargador de traducciones: los JSON que
 * registran los paquetes (loadJsonTranslationsFrom) no viajan al navegador.
 */
final class Translations
{
    /**
     * @return array<string, string>
     */
    public static function for(Locale $locale): array
    {
        $path = lang_path("{$locale->value}.json");
        $lines = File::exists($path) ? File::json($path, JSON_THROW_ON_ERROR) : [];
        $translations = [];

        foreach ($lines as $key => $line) {
            if (is_string($key) && is_string($line)) {
                $translations[$key] = $line;
            }
        }

        return $translations;
    }
}
