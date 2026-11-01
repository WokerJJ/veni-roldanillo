<?php

namespace App\Support\Media;

use App\Enums\MediaKind;

/**
 * Revisa lo que sube un dueño antes de guardarlo o de abrirlo (#113, ADR
 * 0034), sin GD: por el contenido y no por la extensión ni por el tipo que
 * dice el navegador.
 *
 * - El tipo sale de los primeros bytes (finfo) y tiene que coincidir con lo
 *   que lee getimagesize: un archivo con cabecera de JPEG y otra cosa adentro
 *   no pasa.
 * - Solo JPEG, PNG y WebP. HEIC no: GD no lo abre, y el iPhone ya lo convierte
 *   a JPEG al elegir una foto desde el navegador.
 * - Las dimensiones se leen de la cabecera, sin abrir la imagen: una que pasa
 *   de max_side o de max_pixels se rechaza antes de ocupar memoria.
 */
final class ImageInspector
{
    /** @var array<string, int> */
    public const array TYPES = [
        'image/jpeg' => IMAGETYPE_JPEG,
        'image/png' => IMAGETYPE_PNG,
        'image/webp' => IMAGETYPE_WEBP,
    ];

    /**
     * El tipo (`image/jpeg`, `image/png` o `image/webp`) si la imagen sirve
     * para $kind, o el motivo por el que no: una clave de lang/{es,en}/panel.php.
     *
     * @return array{ok: true, mime: string, width: int, height: int}|array{ok: false, error: string}
     */
    public static function inspect(string $path, MediaKind $kind): array
    {
        if (! is_file($path) || filesize($path) === 0) {
            return ['ok' => false, 'error' => 'panel.media.errors.type'];
        }

        if (filesize($path) > config()->integer('media.max_kilobytes') * 1024) {
            return ['ok' => false, 'error' => 'panel.media.errors.size'];
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        $info = @getimagesize($path);

        if ($mime === false || ! isset(self::TYPES[$mime]) || $info === false || $info[2] !== self::TYPES[$mime]) {
            return ['ok' => false, 'error' => 'panel.media.errors.type'];
        }

        [$width, $height] = $info;
        $maxSide = config()->integer('media.max_side');

        if ($width > $maxSide || $height > $maxSide || $width * $height > config()->integer('media.max_pixels')) {
            return ['ok' => false, 'error' => 'panel.media.errors.too_large'];
        }

        if (min($width, $height) < $kind->minShortSide()) {
            return ['ok' => false, 'error' => 'panel.media.errors.too_small'];
        }

        return ['ok' => true, 'mime' => $mime, 'width' => $width, 'height' => $height];
    }
}
