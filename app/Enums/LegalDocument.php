<?php

namespace App\Enums;

use Carbon\CarbonImmutable;

/**
 * Los documentos legales públicos (#23, ADR 0030): la política de tratamiento
 * de datos personales, los términos de uso y la política de reseñas.
 *
 * El texto de cada uno vive en lang/{idioma}/documents.php y su versión, aquí:
 * la versión cambia solo cuando cambia el texto, que está en el repositorio,
 * así que no es una variable de entorno. Cambiar lo que dice un documento
 * exige subir su versión y su fecha en el mismo commit.
 */
enum LegalDocument: string
{
    case Privacy = 'privacy';
    case Terms = 'terms';
    case Reviews = 'reviews';

    /**
     * Versión de la política de tratamiento de datos. Es también la del aviso
     * que aceptan los formularios de reclamo y retiro (ADR 0026), que guardan
     * este valor en `privacy_notice_version`.
     */
    public const PRIVACY_VERSION = '0.2';

    public const TERMS_VERSION = '0.2';

    public const REVIEWS_VERSION = '0.1';

    public function version(): string
    {
        return match ($this) {
            self::Privacy => self::PRIVACY_VERSION,
            self::Terms => self::TERMS_VERSION,
            self::Reviews => self::REVIEWS_VERSION,
        };
    }

    /** Desde cuándo rige esta versión. */
    public function effectiveDate(): CarbonImmutable
    {
        return CarbonImmutable::parse(match ($this) {
            self::Privacy => '2026-10-29',
            self::Terms => '2026-10-29',
            self::Reviews => '2026-10-29',
        });
    }

    /** Nombre de la ruta pública (routes/web.php). */
    public function routeName(): string
    {
        return "legal.{$this->value}";
    }

    /** Clave del documento en lang/{idioma}/documents.php. */
    public function langKey(): string
    {
        return "documents.{$this->value}";
    }
}
