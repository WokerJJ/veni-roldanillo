<?php

namespace App\Enums;

use Illuminate\Support\Facades\App;

/** Idiomas de la interfaz (ADR 0010). */
enum Locale: string
{
    case Es = 'es';
    case En = 'en';

    /** Idioma por defecto y de respaldo de los campos de contenido. */
    public const DEFAULT = self::Es;

    /** Idioma con el que se responde la petición actual. */
    public static function current(): self
    {
        return self::tryFrom(App::getLocale()) ?? self::DEFAULT;
    }
}
