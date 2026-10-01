<?php

namespace App\Support;

use App\Enums\Locale;
use Illuminate\Support\Facades\Lang;

/**
 * Textos de la interfaz de un idioma: las mismas líneas de lang/{idioma}.json
 * que usa __() en el servidor, para compartirlas con Vue (ADR 0010).
 */
final class Translations
{
    /**
     * @return array<string, string>
     */
    public static function for(Locale $locale): array
    {
        $lines = Lang::getLoader()->load($locale->value, '*', '*');
        $translations = [];

        foreach ($lines as $key => $line) {
            if (is_string($key) && is_string($line)) {
                $translations[$key] = $line;
            }
        }

        return $translations;
    }
}
